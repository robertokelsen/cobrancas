'use client';
// app/login/page.tsx — login + auto-login (token em localStorage religa a sessão ao reabrir).
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

const KEEP_KEY = 'krv_keep';

export default function Login() {
  const [senha, setSenha] = useState('');
  const [lembrar, setLembrar] = useState(true);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [restaurando, setRestaurando] = useState(true);
  const router = useRouter();

  // Auto-login: se há token guardado, religa a sessão e entra direto.
  useEffect(() => {
    const tok = typeof window !== 'undefined' ? localStorage.getItem(KEEP_KEY) : null;
    if (!tok) { setRestaurando(false); return; }
    (async () => {
      try {
        const res = await fetch('/api/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: tok }),
        });
        if (res.ok) { router.replace('/dashboard'); router.refresh(); return; }
        localStorage.removeItem(KEEP_KEY);
      } catch { /* cai para login manual */ }
      setRestaurando(false);
    })();
  }, [router]);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setCarregando(true); setErro('');
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senha, lembrar }),
      });
      if (!res.ok) { setErro('Senha incorreta.'); return; }
      const data = await res.json().catch(() => ({} as any));
      if (lembrar && data?.token) localStorage.setItem(KEEP_KEY, data.token);
      else localStorage.removeItem(KEEP_KEY);
      router.push('/dashboard');
      router.refresh();
    } catch {
      setErro('Erro ao entrar. Tente novamente.');
    } finally { setCarregando(false); }
  }

  if (restaurando) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-600 to-purple-700 p-4">
        <div className="text-white/90 text-sm">Entrando…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-600 to-purple-700 p-4">
      <form onSubmit={entrar} className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-sm">
        <h1 className="text-xl font-bold text-gray-900 mb-1">KRV — Cobranças</h1>
        <p className="text-sm text-gray-500 mb-6">Acesso da equipe</p>
        <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)}
          placeholder="Senha" autoFocus
          className="w-full border rounded-lg px-3 py-2 mb-3 text-sm" />
        <label className="flex items-center gap-2 mb-3 text-sm text-gray-600 select-none cursor-pointer">
          <input type="checkbox" checked={lembrar} onChange={(e) => setLembrar(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
          Manter conectado neste computador (30 dias)
        </label>
        {erro && <div className="text-red-600 text-sm mb-3">{erro}</div>}
        <button type="submit" disabled={carregando}
          className="w-full bg-indigo-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
          {carregando ? 'Entrando...' : 'Entrar'}
        </button>
        <p className="text-[11px] text-gray-400 mt-4 leading-snug">
          Marque a caixa só nas suas máquinas. Em computador compartilhado, deixe desmarcado.
        </p>
      </form>
    </div>
  );
}
