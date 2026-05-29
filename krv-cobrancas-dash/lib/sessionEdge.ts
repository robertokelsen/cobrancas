// lib/sessionEdge.ts — validação do token compatível com Edge Runtime (middleware).
// Usa Web Crypto (crypto.subtle), disponível no Edge. NÃO importa 'crypto' do Node.

export const SESSION_COOKIE = 'krv_dash_session';

function b64urlToBytes(s: string): Uint8Array {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = s.length % 4 ? 4 - (s.length % 4) : 0;
  s += '='.repeat(pad);
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64url(bytes: ArrayBuffer): string {
  const arr = new Uint8Array(bytes);
  let bin = '';
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function validarTokenEdge(token: string | undefined, secret: string): Promise<boolean> {
  if (!token) return false;
  const [b64, sig] = token.split('.');
  if (!b64 || !sig) return false;

  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(b64));
  const esperado = bytesToB64url(sigBuf);
  if (esperado !== sig) return false;

  try {
    const payload = new TextDecoder().decode(b64urlToBytes(b64));
    const { exp } = JSON.parse(payload);
    return typeof exp === 'number' && exp > Date.now();
  } catch { return false; }
}
