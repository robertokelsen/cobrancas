// app/api/boletos/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { cobrancasPool } from '@/lib/cobrancasDb';

export const dynamic = 'force-dynamic';

const SITUACOES_VALIDAS = ['A_RECEBER', 'ATRASADO', 'RECEBIDO', 'CANCELADO', 'MARCADO_RECEBIDO', 'EXPIRADO'];

// colunas ordenáveis (allow-list) → expressão SQL segura
const ORDENAVEIS: Record<string, string> = {
  nome: 'nome',
  situacao: `case situacao when 'ATRASADO' then 0 when 'A_RECEBER' then 1 else 2 end`,
  vencimento: 'vencimento',
  valor: 'valor',
  data_ultima_notif: 'data_ultima_notif',
  conta: 'conta',
};

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  // multi-conta: ?conta=441915256,319709051  (vazio = todas)
  const contas = (sp.get('conta') || '').split(',').map(s => s.trim()).filter(Boolean);
  const situacoes = (sp.get('situacao') || '').split(',').map(s => s.trim()).filter(s => SITUACOES_VALIDAS.includes(s));
  const busca = (sp.get('busca') || '').trim();
  const mes = (sp.get('mes') || '').trim(); // YYYY-MM (filtra por vencimento)
  const page = Math.max(1, parseInt(sp.get('page') || '1', 10));
  const pageSize = Math.min(200, Math.max(10, parseInt(sp.get('pageSize') || '50', 10)));
  const offset = (page - 1) * pageSize;

  // ordenação
  const sortKey = ORDENAVEIS[(sp.get('sort') || '').trim()] ? (sp.get('sort') as string).trim() : '';
  const sortDir = (sp.get('dir') || 'asc').trim().toLowerCase() === 'desc' ? 'desc' : 'asc';

  const mesValido = /^\d{4}-\d{2}$/.test(mes);
  const mesVigente = new Date().toISOString().slice(0, 7); // YYYY-MM (mês corrente)

  // ---- WHERE da LISTA (todos os filtros) ----
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

  // ORDER BY: se houver coluna escolhida, usa ela; senão, padrão (atrasados primeiro)
  const orderBy = sortKey
    ? `order by ${ORDENAVEIS[sortKey]} ${sortDir} nulls last`
    : `order by case situacao when 'ATRASADO' then 0 when 'A_RECEBER' then 1 else 2 end,
               vencimento asc nulls last`;

  const client = await cobrancasPool.connect();
  try {
    const listaSql = `
      select codigo_solicitacao, conta, nome, documento, situacao,
             vencimento, valor, dias_uteis, data_situacao, classificacao,
             telefone, email, data_ultima_notif, ultima_notificacao,
             pix_copia_cola, linha_digitavel
      from krv_cobrancas.cobrancas
      ${where}
      ${orderBy}
      limit $${i++} offset $${i++};`;
    const lista = await client.query(listaSql, [...params, pageSize, offset]);

    const totalRes = await client.query(
      `select count(*)::int as total from krv_cobrancas.cobrancas ${where};`, params);

    // ---- METRICAS (cards): conta(s) + mês do filtro; A_RECEBER do MÊS VIGENTE ----
    const condM: string[] = []; const paramsM: any[] = []; let j = 1;
    if (contas.length) { condM.push(`conta = ANY($${j++})`); paramsM.push(contas); }
    if (mesValido) { condM.push(`to_char(vencimento, 'YYYY-MM') = $${j++}`); paramsM.push(mes); }
    const whereM = condM.length ? `where ${condM.join(' and ')}` : '';
    // o "A Receber" do card sempre considera o mês vigente (não o gigante acumulado).
    // demais métricas seguem o filtro de mês selecionado (ou todos).
    const idxMesVig = j++; paramsM.push(mesVigente);
    const metricas = await client.query(`
      select
        count(*) filter (where situacao='A_RECEBER' and to_char(vencimento,'YYYY-MM')=$${idxMesVig})::int as a_receber,
        count(*) filter (where situacao='ATRASADO')::int  as atrasado,
        count(*) filter (where situacao='RECEBIDO')::int  as recebido,
        coalesce(sum(valor) filter (where situacao='A_RECEBER' and to_char(vencimento,'YYYY-MM')=$${idxMesVig}),0)::float as valor_a_receber,
        coalesce(sum(valor) filter (where situacao='ATRASADO'),0)::float  as valor_atrasado,
        coalesce(sum(valor) filter (where situacao='RECEBIDO'),0)::float   as valor_recebido
      from krv_cobrancas.cobrancas ${whereM};`, paramsM);

    // ---- PIZZA: distribuição por VALOR do MÊS VIGENTE (respeita conta) ----
    const condP: string[] = [`to_char(vencimento,'YYYY-MM') = $1`];
    const paramsP: any[] = [mesVigente]; let p = 2;
    if (contas.length) { condP.push(`conta = ANY($${p++})`); paramsP.push(contas); }
    const pizza = await client.query(`
      select
        coalesce(sum(valor) filter (where situacao='A_RECEBER'),0)::float as a_receber,
        coalesce(sum(valor) filter (where situacao='ATRASADO'),0)::float  as atrasado,
        coalesce(sum(valor) filter (where situacao='RECEBIDO'),0)::float  as recebido
      from krv_cobrancas.cobrancas
      where ${condP.join(' and ')};`, paramsP);

    // ---- SERIE mensal: respeita conta(s); 12 meses; inclui % inadimplência ----
    const condS: string[] = ['vencimento is not null', `vencimento >= (current_date - interval '12 months')`];
    const paramsS: any[] = []; let k = 1;
    if (contas.length) { condS.unshift(`conta = ANY($${k++})`); paramsS.push(contas); }
    const serie = await client.query(`
      select to_char(vencimento,'YYYY-MM') as mes,
        coalesce(sum(valor) filter (where situacao='RECEBIDO'),0)::float as recebido,
        coalesce(sum(valor) filter (where situacao='ATRASADO'),0)::float as atrasado,
        coalesce(sum(valor) filter (where situacao='A_RECEBER'),0)::float as a_receber,
        case
          when coalesce(sum(valor) filter (where situacao in ('RECEBIDO','ATRASADO','A_RECEBER')),0) > 0
          then round(
            100.0 * coalesce(sum(valor) filter (where situacao='ATRASADO'),0)
            / coalesce(sum(valor) filter (where situacao in ('RECEBIDO','ATRASADO','A_RECEBER')),0)
          , 1)
          else 0
        end::float as inadimplencia
      from krv_cobrancas.cobrancas
      where ${condS.join(' and ')}
      group by 1 order by 1;`, paramsS);

    // ---- Meses disponiveis: respeita conta(s) ----
    const condMs: string[] = ['vencimento is not null']; const paramsMs: any[] = []; let l = 1;
    if (contas.length) { condMs.unshift(`conta = ANY($${l++})`); paramsMs.push(contas); }
    const meses = await client.query(`
      select distinct to_char(vencimento,'YYYY-MM') as mes
      from krv_cobrancas.cobrancas
      where ${condMs.join(' and ')}
      order by 1 desc;`, paramsMs);

    return NextResponse.json({
      metricas: metricas.rows[0],
      pizza: pizza.rows[0],
      serieMensal: serie.rows,
      mesesDisponiveis: meses.rows.map(r => r.mes),
      mesVigente,
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
