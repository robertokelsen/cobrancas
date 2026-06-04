// app/api/devedores/login/route.ts — login da equipe de manutenção (papel 'maint').
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { criarToken, SESSION_COOKIE, SESSION_MAX_AGE } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { senha } = await req.json().catch(() => ({ senha: '' }));
  const esperada = process.env.MANUTENCAO_PASSWORD || '';
  const a = Buffer.from(String(senha));
  const b = Buffer.from(esperada);
  const ok = esperada.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!ok) return NextResponse.json({ error: 'Senha incorreta' }, { status: 401 });

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, criarToken('maint'), {
    httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: SESSION_MAX_AGE,
  });
  return res;
}
