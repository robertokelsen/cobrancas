// app/api/login/route.ts
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { criarToken, SESSION_COOKIE, SESSION_MAX_AGE } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { senha } = await req.json().catch(() => ({ senha: '' }));
  const esperada = process.env.DASHBOARD_PASSWORD || '';

  // comparação em tempo constante para não vazar tamanho/igualdade por timing
  const a = Buffer.from(String(senha));
  const b = Buffer.from(esperada);
  const ok = a.length === b.length && crypto.timingSafeEqual(a, b);

  if (!ok) {
    return NextResponse.json({ error: 'Senha incorreta' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, criarToken(), {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}
