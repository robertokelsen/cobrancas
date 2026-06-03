// app/api/classificacao/route.ts — classificação por cliente, na tabela real cobrancas.
// GET  -> lista clientes (agrupados por documento) com a classificação e histórico
// POST -> override manual: { documento, classificacao } (um dos 3 rótulos oficiais)
import { NextRequest, NextResponse } from 'next/server';
import { cobrancasPool } from '@/lib/cobrancasDb';

export const dynamic = 'force-dynamic';

const CLASSES = ['Novo Pagador', 'Bom Pagador', 'Mau pagador'];

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const busca = (sp.get('busca') || '').trim();
  const classe = (sp.get('classe') || '').trim();
  const page = Math.max(1, parseInt(sp.get('page') || '1', 10));
  const pageSize = Math.min(200, Math.max(10, parseInt(sp.get('pageSize') || '50', 10)));
  const offset = (page - 1) * pageSize;

  const cond: string[] = [`documento is not null and documento <> ''`];
  const params: any[] = [];
  let i = 1;
  if (busca) { cond.push(`(nome ILIKE $${i} OR documento ILIKE $${i})`); params.push(`%${busca}%`); i++; }
  if (CLASSES.includes(classe)) { cond.push(`classificacao = $${i++}`); params.push(classe); }
  const where = `where ${cond.join(' and ')}`;

  const client = await cobrancasPool.connect();
  try {
    const lista = await client.query(`
      select documento,
             max(nome) as nome,
             max(classificacao) as classificacao,
             count(*)::int as qtd_total,
             count(*) filter (where situacao in ('RECEBIDO','MARCADO_RECEBIDO'))::int as pagos,
             count(*) filter (where situacao in ('ATRASADO','EXPIRADO'))::int as em_atraso,
             coalesce(sum(valor) filter (where situacao in ('ATRASADO','EXPIRADO')),0)::float as valor_em_atraso,
             coalesce(sum(valor) filter (where situacao in ('A_RECEBER','ATRASADO','EXPIRADO')),0)::float as valor_aberto
        from krv_cobrancas.cobrancas
        ${where}
        group by documento
        order by (max(classificacao)='Mau pagador') desc,
                 coalesce(sum(valor) filter (where situacao in ('ATRASADO','EXPIRADO')),0) desc,
                 max(nome) asc
        limit $${i++} offset $${i++};`, [...params, pageSize, offset]);

    const tot = await client.query(
      `select count(distinct documento)::int as total from krv_cobrancas.cobrancas ${where};`, params);

    const resumo = await client.query(`
      select coalesce(classificacao,'(sem)') as classe, count(distinct documento)::int as qtd
        from krv_cobrancas.cobrancas
        where documento is not null and documento <> ''
        group by 1;`);

    return NextResponse.json({
      clientes: lista.rows, total: tot.rows[0].total, resumo: resumo.rows, classes: CLASSES, page, pageSize,
    });
  } catch (e: any) {
    console.error('GET /api/classificacao:', e);
    return NextResponse.json({ error: 'Falha ao listar', detail: String(e?.message || e) }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function POST(req: NextRequest) {
  const { documento, classificacao } = await req.json().catch(() => ({}));
  const doc = String(documento || '').trim();
  const classe = String(classificacao || '').trim();
  if (!doc) return NextResponse.json({ error: 'documento é obrigatório' }, { status: 400 });
  if (!CLASSES.includes(classe)) return NextResponse.json({ error: 'classificação inválida' }, { status: 400 });

  const client = await cobrancasPool.connect();
  try {
    const r = await client.query(
      `update krv_cobrancas.cobrancas set classificacao=$2 where documento=$1;`, [doc, classe]);
    // espelha na tabela clientes (caso seu fluxo a utilize)
    await client.query(
      `insert into krv_cobrancas.clientes (documento, nome, classificacao, atualizado_em)
       values ($1, (select max(nome) from krv_cobrancas.cobrancas where documento=$1), $2, now())
       on conflict (documento) do update set classificacao=excluded.classificacao, atualizado_em=now();`,
      [doc, classe]).catch(() => {});
    return NextResponse.json({ ok: true, classificacao: classe, boletos: r.rowCount });
  } catch (e: any) {
    console.error('POST /api/classificacao:', e);
    return NextResponse.json({ error: 'Falha ao salvar', detail: String(e?.message || e) }, { status: 500 });
  } finally {
    client.release();
  }
}
