// middleware.ts — protege tudo. 'full' = dashboard inteiro; 'maint' = só /devedores. Edge-safe.
import { NextRequest, NextResponse } from 'next/server';
import { lerTokenEdge, SESSION_COOKIE } from '@/lib/sessionEdge';

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

const PUBLICAS = ['/login', '/api/login', '/api/session', '/devedores/login', '/api/devedores/login'];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLICAS.includes(pathname)) return NextResponse.next();

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const secret = process.env.SESSION_SECRET || '';
  const { valid, role } = secret ? await lerTokenEdge(token, secret) : { valid: false, role: '' };

  const ehArea = (p: string) => pathname === p || pathname.startsWith(p + '/');
  const areaDevedores = ehArea('/devedores') || ehArea('/api/devedores');

  if (!valid) {
    if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    const url = req.nextUrl.clone();
    url.pathname = areaDevedores ? '/devedores/login' : '/login';
    return NextResponse.redirect(url);
  }

  // logado: manutenção só acessa a área de devedores
  if (areaDevedores) return NextResponse.next();
  if (role === 'maint') {
    if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
    const url = req.nextUrl.clone();
    url.pathname = '/devedores';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}
