// app/api/session/route.ts — religa a sessão a partir de um token guardado no navegador (auto-login).
import { NextRequest, NextResponse } from 'next/server';
import { validarToken, SESSION_COOKIE, SESSION_MAX_AGE_LEMBRAR } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { token } = await req.json().catch(() => ({ token: '' }));
  if (!validarToken(token)) return NextResponse.json({ error: 'invalid' }, { status: 401 });

  const maxAge = SESSION_MAX_AGE_LEMBRAR;
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge,
    expires: new Date(Date.now() + maxAge * 1000),
  });
  return res;
}
