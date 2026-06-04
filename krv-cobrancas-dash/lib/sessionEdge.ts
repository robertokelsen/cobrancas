// lib/sessionEdge.ts — validação compatível com Edge Runtime (middleware). Web Crypto.
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

// Retorna { valid, role }. Tokens antigos (sem role) contam como 'full'.
export async function lerTokenEdge(token: string | undefined, secret: string): Promise<{ valid: boolean; role: string }> {
  if (!token) return { valid: false, role: '' };
  const [b64, sig] = token.split('.');
  if (!b64 || !sig) return { valid: false, role: '' };
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(b64));
  if (bytesToB64url(sigBuf) !== sig) return { valid: false, role: '' };
  try {
    const { exp, role } = JSON.parse(new TextDecoder().decode(b64urlToBytes(b64)));
    if (typeof exp !== 'number' || exp <= Date.now()) return { valid: false, role: '' };
    return { valid: true, role: role === 'maint' ? 'maint' : 'full' };
  } catch { return { valid: false, role: '' }; }
}

export async function validarTokenEdge(token: string | undefined, secret: string): Promise<boolean> {
  return (await lerTokenEdge(token, secret)).valid;
}
