// app/api/boletos/export/route.ts — exporta os boletos do FILTRO atual em CSV
// (Excel pt-BR: BOM + separador ';'). Respeita conta(s), situação, busca e mês.
import { NextRequest, NextResponse } from 'next/server';
import { cobrancasPool } from '@/lib/cobrancasDb';

export const dynamic = 'force-dynamic';

const SITUACOES_VALIDAS = ['A_RECEBER', 'ATRASADO', 'RECEBIDO', 'CANCELADO', 'MARCADO_RECEBIDO', 'EXPIRADO'];
const NOME_CONTA: Record<string, string> = {
  '360597122': 'Mansões do Lago', '441915256': 'Gran Royal', '319709051': 'Royal Park',
  '216584469': 'Vivendas Pajuçara', '529462788': 'Paço das Águas',
};
const MAX_LINHAS = 5000;

// célula CSV segura: escapa aspas e neutraliza fórmulas (=,+,-,@) p/ evitar CSV injection no Excel
function cel(v: any): string {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  if (/[";\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}
const fmtData = (v: any) => v ? new Date(v).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '';
const fmtValor = (v: any) => (Number(v) || 0).toFixed(2).replace('.', ','); // vírgula decimal pt-BR

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const contas = (sp.get('conta') || '').split(',').map(s => s.trim()).filter(Boolean);
  const situacoes = (sp.get('situacao') || '').split(',').map(s => s.trim()).filter(s => SITUACOES_VALIDAS.includes(s));
  const busca = (sp.get('busca') || '').trim();
  const mes = (sp.get('mes') || '').trim();
  const mesValido = /^\d{4}-\d{2}$/.test(mes);

  const cond: string[] = [];
  const params: any[] = [];
  let i = 1;
  if (contas.length) { cond.push(`conta = ANY($${i++})`); params.push(contas); }
  if (situacoes.length) { cond.push(`situacao = ANY($${i++})`); params.push(situacoes); }
  if (busca) {
    cond.push(`(nome ILIKE $${i} OR documento ILIKE $${i} OR codigo_solicitacao ILIKE $${i})`);
    params.push(`%${busca}%`); i++;
  }
  if (mesValido) { cond.push(`to_char(vencimento, 'YYYY-MM') = $${i++}`); params.push(mes); }
  const where = cond.length ? `where ${cond.join(' and ')}` : '';

  const client = await cobrancasPool.connect();
  try {
    const r = await client.query(`
      select codigo_solicitacao, conta, nome, documento, situacao,
             vencimento, valor, data_situacao, classificacao,
             telefone, email, data_ultima_notif, ultima_notificacao,
             pix_copia_cola, linha_digitavel,
             case when situacao='ATRASADO' and vencimento is not null
                  then (current_date - vencimento) else null end as dias_atraso
      from krv_cobrancas.cobrancas
      ${where}
      order by case situacao when 'ATRASADO' then 0 when 'A_RECEBER' then 1 else 2 end,
               vencimento asc nulls last
      limit ${MAX_LINHAS};`, params);

    const cab = ['Empreendimento','Cliente','Documento','Situação','Vencimento','Valor (R$)',
      'Dias atraso','Classificação','Última notificação','Tipo última notif.','Telefone','E-mail','Código solicitação'];
    const linhas = r.rows.map((b: any) => [
      NOME_CONTA[b.conta] || b.conta, b.nome, b.documento, b.situacao,
      fmtData(b.vencimento), fmtValor(b.valor), b.dias_atraso ?? '',
      b.classificacao || '', fmtData(b.data_ultima_notif), b.ultima_notificacao || '',
      b.telefone || '', b.email || '', b.codigo_solicitacao,
    ].map(cel).join(';'));

    const csv = '﻿' + [cab.map(cel).join(';'), ...linhas].join('\r\n');
    const hoje = new Date().toISOString().slice(0, 10);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="cobrancas_${hoje}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e: any) {
    console.error('GET /api/boletos/export:', e);
    return NextResponse.json({ error: 'Falha ao exportar', detail: String(e?.message || e) }, { status: 500 });
  } finally {
    client.release();
  }
}
