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
             pix_copia_cola, linha_digitavel,
             case when situacao='ATRASADO' and vencimento is not null
                  then (current_date - vencimento) else null end as dias_atraso
      from krv_cobrancas.cobrancas
      ${where}
      ${orderBy}
      limit $${i++} offset $${i++};`;
    const lista = await client.query(listaSql, [...params, pageSize, offset]);

    const totalRes = await client.query(
      `select count(*)::int as total from krv_cobrancas.cobrancas ${where};`, params);

    // ---- RESUMO do filtro atual (item 9): soma o que está filtrado na tabela ----
    const resumoFiltro = await client.query(`
      select
        count(*)::int as qtd,
        coalesce(sum(valor),0)::float as valor_total,
        count(*) filter (where situacao='ATRASADO')::int as qtd_atrasado,
        coalesce(sum(valor) filter (where situacao='ATRASADO'),0)::float as valor_atrasado
      from krv_cobrancas.cobrancas ${where};`, params);

    // ---- METRICAS (cards): conta(s) + mês do filtro; A_RECEBER do MÊS VIGENTE ----
    const condM: string[] = []; const paramsM: any[] = []; let j = 1;
    if (contas.length) { condM.push(`conta = ANY($${j++})`); paramsM.push(contas); }
    if (mesValido) { condM.push(`to_char(vencimento, 'YYYY-MM') = $${j++}`); paramsM.push(mes); }
    const whereM = condM.length ? `where ${condM.join(' and ')}` : '';
    // "A Receber" e "Recebidos" do card consideram o mês vigente (não o acumulado).
    // "Atrasados" segue o filtro de mês selecionado (ou todos).
    const idxMesVig = j++; paramsM.push(mesVigente);
    // A Receber e Recebidos consideram o mês vigente; Atrasados é o acumulado.
    const metricas = await client.query(`
      select
        count(*) filter (where situacao='A_RECEBER' and to_char(vencimento,'YYYY-MM')=$${idxMesVig})::int as a_receber,
        count(*) filter (where situacao='ATRASADO')::int  as atrasado,
        count(*) filter (where situacao='RECEBIDO' and to_char(vencimento,'YYYY-MM')=$${idxMesVig})::int  as recebido,
        count(*) filter (where situacao='EXPIRADO')::int  as expirado,
        coalesce(sum(valor) filter (where situacao='A_RECEBER' and to_char(vencimento,'YYYY-MM')=$${idxMesVig}),0)::float as valor_a_receber,
        coalesce(sum(valor) filter (where situacao='ATRASADO'),0)::float  as valor_atrasado,
        coalesce(sum(valor) filter (where situacao='RECEBIDO' and to_char(vencimento,'YYYY-MM')=$${idxMesVig}),0)::float   as valor_recebido,
        coalesce(sum(valor) filter (where situacao='EXPIRADO'),0)::float   as valor_expirado
      from krv_cobrancas.cobrancas ${whereM};`, paramsM);

    // ---- PIZZA: distribuição por VALOR do MÊS VIGENTE (respeita conta) ----
    const condP: string[] = [`to_char(vencimento,'YYYY-MM') = $1`];
    const paramsP: any[] = [mesVigente]; let p = 2;
    if (contas.length) { condP.push(`conta = ANY($${p++})`); paramsP.push(contas); }
    const pizza = await client.query(`
      select
        coalesce(sum(valor) filter (where situacao='A_RECEBER'),0)::float as a_receber,
        coalesce(sum(valor) filter (where situacao in ('ATRASADO','EXPIRADO')),0)::float  as atrasado,
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
        coalesce(sum(valor) filter (where situacao in ('ATRASADO','EXPIRADO')),0)::float as atrasado,
        coalesce(sum(valor) filter (where situacao='A_RECEBER'),0)::float as a_receber,
        case
          when coalesce(sum(valor) filter (where situacao in ('RECEBIDO','ATRASADO','EXPIRADO','A_RECEBER')),0) > 0
          then round(
            100.0 * coalesce(sum(valor) filter (where situacao in ('ATRASADO','EXPIRADO')),0)
            / coalesce(sum(valor) filter (where situacao in ('RECEBIDO','ATRASADO','EXPIRADO','A_RECEBER')),0)
          , 1)
          else 0
        end::float as inadimplencia
      from krv_cobrancas.cobrancas
      where ${condS.join(' and ')}
      group by 1 order by 1;`, paramsS);

    // ======================================================================
    // PAINÉIS ANALÍTICOS — todos respeitam apenas conta(s) (não o filtro de mês,
    // pois são visões de risco/carteira). Param base reaproveitado.
    // ======================================================================
    const contaCond = contas.length ? `conta = ANY($1)` : 'true';
    const contaParam = contas.length ? [contas] : [];

    // ---- AGING de atrasados: 1-30 / 31-40 / 41-50 / 51-60 / 60+ ----
    const aging = await client.query(`
      with a as (
        select valor, (current_date - vencimento) as d
        from krv_cobrancas.cobrancas
        where situacao in ('ATRASADO','EXPIRADO') and vencimento is not null and ${contaCond}
      )
      select
        count(*) filter (where d between 1 and 30)::int  as f1_qtd,
        count(*) filter (where d between 31 and 40)::int as f2_qtd,
        count(*) filter (where d between 41 and 50)::int as f3_qtd,
        count(*) filter (where d between 51 and 60)::int as f4_qtd,
        count(*) filter (where d > 60)::int              as f5_qtd,
        coalesce(sum(valor) filter (where d between 1 and 30),0)::float  as f1_val,
        coalesce(sum(valor) filter (where d between 31 and 40),0)::float as f2_val,
        coalesce(sum(valor) filter (where d between 41 and 50),0)::float as f3_val,
        coalesce(sum(valor) filter (where d between 51 and 60),0)::float as f4_val,
        coalesce(sum(valor) filter (where d > 60),0)::float              as f5_val
      from a;`, contaParam);

    // ---- TOP DEVEDORES: maior valor em aberto (ATRASADO + EXPIRADO + A_RECEBER) por cliente ----
    const topDevedores = await client.query(`
      select nome, documento,
        coalesce(sum(valor),0)::float as total_aberto,
        coalesce(sum(valor) filter (where situacao in ('ATRASADO','EXPIRADO')),0)::float as atrasado,
        count(*)::int as qtd
      from krv_cobrancas.cobrancas
      where situacao in ('ATRASADO','EXPIRADO','A_RECEBER') and ${contaCond}
      group by nome, documento
      order by total_aberto desc
      limit 10;`, contaParam);

    // ---- INADIMPLÊNCIA por EMPREENDIMENTO (atrasado + expirado) ----
    const inadConta = await client.query(`
      select conta,
        coalesce(sum(valor) filter (where situacao in ('ATRASADO','EXPIRADO')),0)::float as atrasado,
        coalesce(sum(valor) filter (where situacao in ('RECEBIDO','ATRASADO','EXPIRADO','A_RECEBER')),0)::float as base,
        case
          when coalesce(sum(valor) filter (where situacao in ('RECEBIDO','ATRASADO','EXPIRADO','A_RECEBER')),0) > 0
          then round(100.0 * coalesce(sum(valor) filter (where situacao in ('ATRASADO','EXPIRADO')),0)
               / coalesce(sum(valor) filter (where situacao in ('RECEBIDO','ATRASADO','EXPIRADO','A_RECEBER')),0), 1)
          else 0
        end::float as inadimplencia
      from krv_cobrancas.cobrancas
      where ${contaCond}
      group by conta
      order by inadimplencia desc;`, contaParam);

    // ---- PROJEÇÃO 30 dias: A_RECEBER vencendo nos próximos 30 dias ----
    const proj = await client.query(`
      select
        coalesce(sum(valor),0)::float as valor_30d,
        count(*)::int as qtd_30d
      from krv_cobrancas.cobrancas
      where situacao='A_RECEBER' and vencimento between current_date and (current_date + interval '30 days')
        and ${contaCond};`, contaParam);

    // ---- SILÊNCIO: atrasados há >7 dias SEM notificação nos últimos 7 dias ----
    const silencio = await client.query(`
      select count(*)::int as qtd, coalesce(sum(valor),0)::float as valor
      from krv_cobrancas.cobrancas
      where situacao='ATRASADO' and vencimento is not null
        and (current_date - vencimento) > 7
        and (data_ultima_notif is null or data_ultima_notif < (current_date - interval '7 days'))
        and ${contaCond};`, contaParam);

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
      resumoFiltro: resumoFiltro.rows[0],
      aging: aging.rows[0],
      topDevedores: topDevedores.rows,
      inadConta: inadConta.rows,
      projecao: proj.rows[0],
      silencio: silencio.rows[0],
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
