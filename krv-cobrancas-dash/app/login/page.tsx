'use client';
// app/login/page.tsx
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Login() {
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);
  const router = useRouter();

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setCarregando(true); setErro('');
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senha }),
      });
      if (!res.ok) { setErro('Senha incorreta.'); return; }
      router.push('/dashboard');
      router.refresh();
    } catch {
      setErro('Erro ao entrar. Tente novamente.');
    } finally { setCarregando(false); }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-600 to-purple-700 p-4">
      <form onSubmit={entrar} className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-sm">
        <h1 className="text-xl font-bold text-gray-900 mb-1">KRV — Cobranças</h1>
        <p className="text-sm text-gray-500 mb-6">Acesso da equipe</p>
        <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)}
          placeholder="Senha" autoFocus
          className="w-full border rounded-lg px-3 py-2 mb-3 text-sm" />
        {erro && <div className="text-red-600 text-sm mb-3">{erro}</div>}
        <button type="submit" disabled={carregando}
          className="w-full bg-indigo-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
          {carregando ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}
