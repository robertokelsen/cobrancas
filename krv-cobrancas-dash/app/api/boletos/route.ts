// app/api/boletos/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { cobrancasPool } from '@/lib/cobrancasDb';

export const dynamic = 'force-dynamic';

const SITUACOES_VALIDAS = ['A_RECEBER', 'ATRASADO', 'RECEBIDO', 'CANCELADO', 'MARCADO_RECEBIDO', 'EXPIRADO'];

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const conta = sp.get('conta') || '';
  // multi-situação: ?situacao=ATRASADO,A_RECEBER
  const situacoes = (sp.get('situacao') || '').split(',').map(s => s.trim()).filter(s => SITUACOES_VALIDAS.includes(s));
  const busca = (sp.get('busca') || '').trim();
  const mes = (sp.get('mes') || '').trim(); // formato YYYY-MM (filtra por vencimento)
  const page = Math.max(1, parseInt(sp.get('page') || '1', 10));
  const pageSize = Math.min(200, Math.max(10, parseInt(sp.get('pageSize') || '50', 10)));
  const offset = (page - 1) * pageSize;

  const cond: string[] = [];
  const params: any[] = [];
  let i = 1;
  if (conta) { cond.push(`conta = $${i++}`); params.push(conta); }
  if (situacoes.length) { cond.push(`situacao = ANY($${i++})`); params.push(situacoes); }
  if (busca) {
    cond.push(`(nome ILIKE $${i} OR documento ILIKE $${i} OR codigo_solicitacao ILIKE $${i})`);
    params.push(`%${busca}%`); i++;
  }
  if (/^\d{4}-\d{2}$/.test(mes)) {
    cond.push(`to_char(vencimento, 'YYYY-MM') = $${i++}`); params.push(mes);
  }
  const where = cond.length ? `where ${cond.join(' and ')}` : '';

  const client = await cobrancasPool.connect();
  try {
    const listaSql = `
      select codigo_solicitacao, conta, nome, documento, situacao,
             vencimento, valor, dias_uteis, data_situacao, classificacao,
             telefone, email, data_ultima_notif, ultima_notificacao,
             pix_copia_cola, linha_digitavel
      from krv_cobrancas.cobrancas
      ${where}
      order by case situacao when 'ATRASADO' then 0 when 'A_RECEBER' then 1 else 2 end,
               vencimento asc nulls last
      limit $${i++} offset $${i++};`;
    const lista = await client.query(listaSql, [...params, pageSize, offset]);

    const totalRes = await client.query(
      `select count(*)::int as total from krv_cobrancas.cobrancas ${where};`, params);

    // Métricas (filtra só por conta, agrega por situação)
    const condM: string[] = []; const paramsM: any[] = []; let j = 1;
    if (conta) { condM.push(`conta = $${j++}`); paramsM.push(conta); }
    const whereM = condM.length ? `where ${condM.join(' and ')}` : '';
    const metricas = await client.query(`
      select
        count(*) filter (where situacao='A_RECEBER')::int as a_receber,
        count(*) filter (where situacao='ATRASADO')::int  as atrasado,
        count(*) filter (where situacao='RECEBIDO')::int  as recebido,
        count(*) filter (where situacao='CANCELADO')::int as cancelado,
        coalesce(sum(valor) filter (where situacao='A_RECEBER'),0)::float as valor_a_receber,
        coalesce(sum(valor) filter (where situacao='ATRASADO'),0)::float  as valor_atrasado,
        coalesce(sum(valor) filter (where situacao='RECEBIDO'),0)::float   as valor_recebido
      from krv_cobrancas.cobrancas ${whereM};`, paramsM);

    // Série mensal: recebido vs atrasado por mês de vencimento (últimos 12 meses)
    const serie = await client.query(`
      select to_char(vencimento,'YYYY-MM') as mes,
        coalesce(sum(valor) filter (where situacao='RECEBIDO'),0)::float as recebido,
        coalesce(sum(valor) filter (where situacao='ATRASADO'),0)::float as atrasado,
        coalesce(sum(valor) filter (where situacao='A_RECEBER'),0)::float as a_receber
      from krv_cobrancas.cobrancas
      ${conta ? 'where conta = $1' : ''}
      ${conta ? 'and' : 'where'} vencimento is not null
        and vencimento >= (current_date - interval '12 months')
      group by 1 order by 1;`, conta ? [conta] : []);

    // Meses disponíveis para o filtro
    const meses = await client.query(`
      select distinct to_char(vencimento,'YYYY-MM') as mes
      from krv_cobrancas.cobrancas
      ${conta ? 'where conta = $1 and' : 'where'} vencimento is not null
      order by 1 desc;`, conta ? [conta] : []);

    return NextResponse.json({
      metricas: metricas.rows[0],
      serieMensal: serie.rows,
      mesesDisponiveis: meses.rows.map(r => r.mes),
      total: totalRes.rows[0].total,
      page, pageSize, boletos: lista.rows,
    });
  } catch (e: any) {
    console.error('Erro /api/boletos:', e);
    return NextResponse.json({ error: 'Falha ao consultar boletos', detail: String(e?.message || e) }, { status: 500 });
  } finally {
    client.release();
  }
}
