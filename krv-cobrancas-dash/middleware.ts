// middleware.ts — protege tudo, exceto /login e /api/login. Edge-safe.
import { NextRequest, NextResponse } from 'next/server';
import { validarTokenEdge, SESSION_COOKIE } from '@/lib/sessionEdge';

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === '/login' || pathname === '/api/login') {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const secret = process.env.SESSION_SECRET || '';
  const ok = secret ? await validarTokenEdge(token, secret) : false;
  if (ok) return NextResponse.next();

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  return NextResponse.redirect(url);
}
