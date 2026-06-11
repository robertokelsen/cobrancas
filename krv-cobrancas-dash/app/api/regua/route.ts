// app/api/regua/route.ts — lê e grava a régua nas tabelas REAIS do KRV:
//   krv_cobrancas.configuracoes  -> avisos antes/no vencimento (por classificação)
//   krv_cobrancas.regua_atraso   -> cadência de cobrança em atraso (por classificação)
import { NextRequest, NextResponse } from 'next/server';
import { cobrancasPool } from '@/lib/cobrancasDb';

export const dynamic = 'force-dynamic';

const CLASSES = ['Novo Pagador', 'Bom Pagador', 'Mau pagador'];
const okClasse = (c: any) => CLASSES.includes(String(c || '').trim());
const intOr = (v: any, d = 0) => Number.isFinite(+v) ? Math.trunc(+v) : d;

export async function GET() {
  const client = await cobrancasPool.connect();
  try {
    const cfg = await client.query(
      `select id, classificacao, dias_uteis, notificacao, email, whatsapp, ativo
         from krv_cobrancas.configuracoes
        order by classificacao, dias_uteis;`);
    const atr = await client.query(
      `select classificacao, inicio_dias_uteis, cadencia_dias, ativo
         from krv_cobrancas.regua_atraso
        order by classificacao;`);
    return NextResponse.json({ configuracoes: cfg.rows, reguaAtraso: atr.rows, classes: CLASSES });
  } catch (e: any) {
    console.error('GET /api/regua:', e);
    return NextResponse.json({ error: 'Falha ao ler régua', detail: String(e?.message || e) }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const configuracoes = Array.isArray(body?.configuracoes) ? body.configuracoes : [];
  const reguaAtraso = Array.isArray(body?.reguaAtraso) ? body.reguaAtraso : [];

  const cfgLimpo = configuracoes
    .filter((r: any) => okClasse(r.classificacao))
    .map((r: any) => ({
      classificacao: String(r.classificacao).trim(),
      dias_uteis: intOr(r.dias_uteis, 0),
      notificacao: String(r.notificacao || '').slice(0, 200),
      email: r.email !== false,
      whatsapp: r.whatsapp !== false,
      ativo: r.ativo !== false,
    }));

  const atrLimpo = reguaAtraso
    .filter((r: any) => okClasse(r.classificacao))
    .map((r: any) => ({
      classificacao: String(r.classificacao).trim(),
      inicio_dias_uteis: intOr(r.inicio_dias_uteis, 1),
      cadencia_dias: Math.max(1, intOr(r.cadencia_dias, 3)),
      ativo: r.ativo !== false,
    }));

  // Trava de segurança: nunca zerar a régua inteira por payload vazio
  // (sessão expirada / bug de UI). Sem avisos = recusa, n8n continua cobrando.
  if (cfgLimpo.length === 0 && atrLimpo.length === 0) {
    return NextResponse.json({ error: 'Payload vazio — régua não foi alterada (proteção contra apagar tudo).' }, { status: 400 });
  }

  const client = await cobrancasPool.connect();
  try {
    await client.query('begin');

    // configuracoes: substitui tudo (id reatribuído sequencialmente)
    await client.query('delete from krv_cobrancas.configuracoes;');
    let id = 1;
    for (const r of cfgLimpo) {
      await client.query(
        `insert into krv_cobrancas.configuracoes
           (id, classificacao, dias_uteis, notificacao, email, whatsapp, ativo)
         values ($1,$2,$3,$4,$5,$6,$7);`,
        [id++, r.classificacao, r.dias_uteis, r.notificacao, r.email, r.whatsapp, r.ativo]);
    }

    // regua_atraso: substitui tudo (uma linha por classificação)
    await client.query('delete from krv_cobrancas.regua_atraso;');
    for (const r of atrLimpo) {
      await client.query(
        `insert into krv_cobrancas.regua_atraso
           (classificacao, inicio_dias_uteis, cadencia_dias, ativo)
         values ($1,$2,$3,$4);`,
        [r.classificacao, r.inicio_dias_uteis, r.cadencia_dias, r.ativo]);
    }

    await client.query('commit');
    return NextResponse.json({ ok: true, configuracoes: cfgLimpo.length, reguaAtraso: atrLimpo.length });
  } catch (e: any) {
    await client.query('rollback').catch(() => {});
    console.error('PUT /api/regua:', e);
    return NextResponse.json({ error: 'Falha ao salvar régua', detail: String(e?.message || e) }, { status: 500 });
  } finally {
    client.release();
  }
}
