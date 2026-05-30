// app/api/enviar/route.ts — aciona o webhook de envio de boleto no n8n.
// Proxy: o front chama esta rota (autenticada), que repassa ao n8n. Evita
// expor a URL do n8n no navegador e contorna CORS.
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const N8N_BASE = process.env.N8N_WEBHOOK_BASE || 'https://n8n.larke.com.br/webhook';

export async function POST(req: NextRequest) {
  const { id, conta, enviar } = await req.json().catch(() => ({}));
  if (!id || !conta) {
    return NextResponse.json({ error: 'id e conta sao obrigatorios' }, { status: 400 });
  }
  const itens = Array.isArray(enviar) && enviar.length ? enviar : ['pdf', 'pix', 'linha'];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const r = await fetch(`${N8N_BASE}/krv-boletos/${conta}/enviar-boleto`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, conta, enviar: itens }),
      signal: controller.signal,
    });
    const txt = await r.text();
    if (!r.ok) {
      return NextResponse.json({ error: 'Falha no n8n', status: r.status, detail: txt.slice(0, 300) }, { status: 502 });
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const msg = e?.name === 'AbortError' ? 'Tempo esgotado ao acionar o n8n' : String(e?.message || e);
    return NextResponse.json({ error: 'Erro ao acionar envio', detail: msg }, { status: 500 });
  } finally {
    clearTimeout(timeout);
  }
}
