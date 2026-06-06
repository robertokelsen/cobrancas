// app/api/login/route.ts — login do dashboard (papel 'full'). Suporta "manter conectado" (30 dias).
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { criarToken, SESSION_COOKIE, SESSION_MAX_AGE, SESSION_MAX_AGE_LEMBRAR } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { senha, lembrar } = await req.json().catch(() => ({ senha: '', lembrar: false }));
  const esperada = process.env.DASHBOARD_PASSWORD || '';
  const a = Buffer.from(String(senha));
  const b = Buffer.from(esperada);
  const ok = esperada.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!ok) return NextResponse.json({ error: 'Senha incorreta' }, { status: 401 });

  const manter = lembrar === true;
  const maxAge = manter ? SESSION_MAX_AGE_LEMBRAR : SESSION_MAX_AGE;
  const res = NextResponse.json({ ok: true });
  // Max-Age + Expires explícitos => cookie persistente (sobrevive a fechar/reabrir o navegador).
  res.cookies.set(SESSION_COOKIE, criarToken('full', manter), {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge,
    expires: new Date(Date.now() + maxAge * 1000),
  });
  return res;
}
