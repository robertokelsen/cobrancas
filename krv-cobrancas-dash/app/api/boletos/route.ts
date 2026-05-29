// app/api/boletos/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { cobrancasPool } from '@/lib/cobrancasDb';

export const dynamic = 'force-dynamic';

const SITUACOES_VALIDAS = ['A_RECEBER', 'ATRASADO', 'RECEBIDO', 'CANCELADO', 'MARCADO_RECEBIDO', 'EXPIRADO'];

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const conta = sp.get('conta') || '';
  const situacao = sp.get('situacao') || '';
  const busca = (sp.get('busca') || '').trim();
  const page = Math.max(1, parseInt(sp.get('page') || '1', 10));
  const pageSize = Math.min(200, Math.max(10, parseInt(sp.get('pageSize') || '50', 10)));
  const offset = (page - 1) * pageSize;

  const cond: string[] = [];
  const params: any[] = [];
  let i = 1;
  if (conta) { cond.push(`conta = $${i++}`); params.push(conta); }
  if (situacao && SITUACOES_VALIDAS.includes(situacao)) { cond.push(`situacao = $${i++}`); params.push(situacao); }
  if (busca) {
    cond.push(`(nome ILIKE $${i} OR documento ILIKE $${i} OR codigo_solicitacao ILIKE $${i})`);
    params.push(`%${busca}%`); i++;
  }
  const where = cond.length ? `where ${cond.join(' and ')}` : '';

  const client = await cobrancasPool.connect();
  try {
    const listaSql = `
      select codigo_solicitacao, conta, nome, documento, situacao,
             vencimento, valor, dias_uteis, data_situacao,
             classificacao, telefone, email, data_ultima_notif
      from krv_cobrancas.cobrancas
      ${where}
      order by case situacao when 'ATRASADO' then 0 when 'A_RECEBER' then 1 else 2 end,
               vencimento asc nulls last
      limit $${i++} offset $${i++};`;
    const lista = await client.query(listaSql, [...params, pageSize, offset]);

    const totalRes = await client.query(
      `select count(*)::int as total from krv_cobrancas.cobrancas ${where};`, params);

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

    return NextResponse.json({
      metricas: metricas.rows[0], total: totalRes.rows[0].total,
      page, pageSize, boletos: lista.rows,
    });
  } catch (e: any) {
    console.error('Erro /api/boletos:', e);
    return NextResponse.json({ error: 'Falha ao consultar boletos', detail: String(e?.message || e) }, { status: 500 });
  } finally {
    client.release();
  }
}
