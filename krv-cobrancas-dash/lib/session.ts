// lib/session.ts — sessão por cookie assinado (HMAC SHA-256), com papel (role) e "manter conectado".
import crypto from 'crypto';

const COOKIE_NAME = 'krv_dash_session';
const MAX_AGE = 60 * 60 * 12;             // 12h (padrão — expira logo, p/ máquinas compartilhadas)
const MAX_AGE_LEMBRAR = 60 * 60 * 24 * 30; // 30 dias ("manter conectado" — só nas máquinas de confiança)

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error('SESSION_SECRET não definida');
  return s;
}

export type Role = 'full' | 'maint';

// token = base64(payload).assinatura
export function criarToken(role: Role = 'full', lembrar = false): string {
  const maxAge = lembrar ? MAX_AGE_LEMBRAR : MAX_AGE;
  const payload = JSON.stringify({ ok: true, role, exp: Date.now() + maxAge * 1000 });
  const b64 = Buffer.from(payload).toString('base64url');
  const sig = crypto.createHmac('sha256', secret()).update(b64).digest('base64url');
  return `${b64}.${sig}`;
}

export function validarToken(token: string | undefined): boolean {
  if (!token) return false;
  const [b64, sig] = token.split('.');
  if (!b64 || !sig) return false;
  const esperado = crypto.createHmac('sha256', secret()).update(b64).digest('base64url');
  const a = Buffer.from(sig); const b = Buffer.from(esperado);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  try {
    const { exp } = JSON.parse(Buffer.from(b64, 'base64url').toString());
    return typeof exp === 'number' && exp > Date.now();
  } catch { return false; }
}

export const SESSION_COOKIE = COOKIE_NAME;
export const SESSION_MAX_AGE = MAX_AGE;
export const SESSION_MAX_AGE_LEMBRAR = MAX_AGE_LEMBRAR;
