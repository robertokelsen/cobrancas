'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function DevedoresLogin() {
  const router = useRouter();
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);

  const entrar = async (e: React.FormEvent) => {
    e.preventDefault();
    setCarregando(true); setErro('');
    try {
      const r = await fetch('/api/devedores/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ senha }),
      });
      if (r.ok) router.push('/devedores');
      else setErro('Senha incorreta.');
    } catch { setErro('Erro ao entrar.'); }
    finally { setCarregando(false); }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <form onSubmit={entrar} className="bg-white rounded-xl border border-gray-200 p-6 w-full max-w-sm">
        <h1 className="text-lg font-bold text-gray-900">Devedores — Manutenção</h1>
        <p className="text-sm text-gray-500 mb-4">Acesso restrito da equipe de manutenção.</p>
        <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="Senha"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-3" autoFocus />
        {erro && <p className="text-sm text-red-600 mb-3">{erro}</p>}
        <button type="submit" disabled={carregando}
          className="w-full px-4 py-2 bg-krv text-white rounded-lg text-sm font-medium hover:bg-krvdark disabled:opacity-50">
          {carregando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}
