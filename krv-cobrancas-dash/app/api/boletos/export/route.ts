// app/api/boletos/export/route.ts — exporta o resultado filtrado em CSV (sem paginação).
import { NextRequest, NextResponse } from 'next/server';
import { cobrancasPool } from '@/lib/cobrancasDb';

export const dynamic = 'force-dynamic';

const SITUACOES_VALIDAS = ['A_RECEBER', 'ATRASADO', 'RECEBIDO', 'CANCELADO', 'MARCADO_RECEBIDO', 'EXPIRADO'];

function csvCell(v: any): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const contas = (sp.get('conta') || '').split(',').map(s => s.trim()).filter(Boolean);
  const situacoes = (sp.get('situacao') || '').split(',').map(s => s.trim()).filter(s => SITUACOES_VALIDAS.includes(s));
  const busca = (sp.get('busca') || '').trim();
  const mes = (sp.get('mes') || '').trim();
  const mesValido = /^\d{4}-\d{2}$/.test(mes);

  const cond: string[] = []; const params: any[] = []; let i = 1;
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
      select conta, nome, documento, situacao, vencimento, valor,
             case when situacao='ATRASADO' and vencimento is not null
                  then (current_date - vencimento) else null end as dias_atraso,
             data_ultima_notif, ultima_notificacao, codigo_solicitacao
      from krv_cobrancas.cobrancas
      ${where}
      order by case situacao when 'ATRASADO' then 0 when 'A_RECEBER' then 1 else 2 end,
               vencimento asc nulls last;`, params);

    const cab = ['Conta','Cliente','CPF/CNPJ','Situacao','Vencimento','Valor','Dias em atraso','Ultima notificacao','Tipo notif.','Codigo'];
    const linhas = r.rows.map(b => [
      b.conta, b.nome, b.documento, b.situacao,
      b.vencimento ? new Date(b.vencimento).toISOString().slice(0, 10) : '',
      b.valor != null ? String(b.valor).replace('.', ',') : '',
      b.dias_atraso ?? '',
      b.data_ultima_notif ? new Date(b.data_ultima_notif).toISOString().slice(0, 10) : '',
      b.ultima_notificacao || '',
      b.codigo_solicitacao,
    ].map(csvCell).join(';'));

    // BOM para o Excel reconhecer UTF-8; separador ; (padrão pt-BR)
    const csv = '\uFEFF' + [cab.join(';'), ...linhas].join('\r\n');
    const data = new Date().toISOString().slice(0, 10);
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="cobrancas_${data}.csv"`,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: 'Falha ao exportar', detail: String(e?.message || e) }, { status: 500 });
  } finally {
    client.release();
  }
}
