// app/api/devedores/route.ts — lista de devedores (ATRASADO/EXPIRADO) por empreendimento,
// já com a unidade (join com krv_cobrancas.unidades por CPF normalizado + conta).
import { NextRequest, NextResponse } from 'next/server';
import { cobrancasPool } from '@/lib/cobrancasDb';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const conta = (sp.get('conta') || '').trim();

  const cond: string[] = [`c.situacao in ('ATRASADO','EXPIRADO')`, `c.documento is not null and c.documento <> ''`];
  const params: any[] = [];
  let i = 1;
  if (conta) { cond.push(`c.conta = $${i++}`); params.push(conta); }

  const client = await cobrancasPool.connect();
  try {
    const r = await client.query(`
      select c.conta,
             coalesce(u.empreendimento, '') as empreendimento,
             coalesce(u.bloco, '')          as bloco,
             coalesce(u.unidade, '')        as unidade,
             c.nome, c.documento,
             count(*)::int                                   as qtd_vencidos,
             coalesce(sum(c.valor),0)::float                 as total_vencido,
             max(current_date - c.vencimento)::int           as dias_atraso,
             min(c.vencimento)                               as venc_mais_antigo
        from krv_cobrancas.cobrancas c
        left join krv_cobrancas.unidades u
          on u.conta = c.conta
         and u.documento = lpad(regexp_replace(c.documento,'\\D','','g'),11,'0')
        ${cond.length ? 'where ' + cond.join(' and ') : ''}
        group by c.conta, u.empreendimento, u.bloco, u.unidade, c.nome, c.documento
        order by c.conta,
                 (u.unidade is null), u.bloco,
                 nullif(regexp_replace(coalesce(u.unidade,''),'\\D','','g'),'')::int nulls last,
                 c.nome;`, params);

    return NextResponse.json({ devedores: r.rows });
  } catch (e: any) {
    console.error('GET /api/devedores:', e);
    return NextResponse.json({ error: 'Falha ao listar devedores', detail: String(e?.message || e) }, { status: 500 });
  } finally {
    client.release();
  }
}
