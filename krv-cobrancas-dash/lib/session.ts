// lib/session.ts — sessão simples por cookie assinado (HMAC SHA-256).
// Sem libs externas: usa o crypto nativo do Node. Suficiente para senha única de equipe.
import crypto from 'crypto';

const COOKIE_NAME = 'krv_dash_session';
const MAX_AGE = 60 * 60 * 12; // 12h

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error('SESSION_SECRET não definida');
  return s;
}

// token = base64(payload).assinatura
export function criarToken(): string {
  const payload = JSON.stringify({ ok: true, exp: Date.now() + MAX_AGE * 1000 });
  const b64 = Buffer.from(payload).toString('base64url');
  const sig = crypto.createHmac('sha256', secret()).update(b64).digest('base64url');
  return `${b64}.${sig}`;
}

export function validarToken(token: string | undefined): boolean {
  if (!token) return false;
  const [b64, sig] = token.split('.');
  if (!b64 || !sig) return false;
  const esperado = crypto.createHmac('sha256', secret()).update(b64).digest('base64url');
  // comparação em tempo constante
  const a = Buffer.from(sig); const b = Buffer.from(esperado);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  try {
    const { exp } = JSON.parse(Buffer.from(b64, 'base64url').toString());
    return typeof exp === 'number' && exp > Date.now();
  } catch { return false; }
}

export const SESSION_COOKIE = COOKIE_NAME;
export const SESSION_MAX_AGE = MAX_AGE;
