'use client';
// app/dashboard/clientes/page.tsx — classificação por cliente, com TRAVA de override manual.
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';

type Cliente = {
  documento: string; nome: string; classificacao: string | null; bloqueado: boolean;
  qtd_total: number; pagos: number; em_atraso: number;
  valor_em_atraso: number; valor_aberto: number;
};

const CLASSES = [
  { k: 'Novo Pagador', cor: 'bg-blue-100 text-blue-700' },
  { k: 'Bom Pagador', cor: 'bg-green-100 text-green-700' },
  { k: 'Mau pagador', cor: 'bg-red-100 text-red-700' },
];
const cor = (c: string | null) => CLASSES.find(x => x.k === c)?.cor || 'bg-gray-100 text-gray-600';
const brl = (v: number | null | undefined) =>
  (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function ClientesPage() {
  const router = useRouter();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [resumo, setResumo] = useState<{ classe: string; qtd: number }[]>([]);
  const [busca, setBusca] = useState('');
  const [buscaDeb, setBuscaDeb] = useState('');
  const [classe, setClasse] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState('');
  const pageSize = 50;
  const mostrar = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3000); };

  useEffect(() => { const t = setTimeout(() => { setBuscaDeb(busca); setPage(1); }, 400); return () => clearTimeout(t); }, [busca]);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ busca: buscaDeb, classe, page: String(page), pageSize: String(pageSize) });
      const r = await fetch(`/api/classificacao?${qs}`);
      if (r.status === 401) { router.push('/login'); return; }
      const d = await r.json();
      setClientes(d.clientes || []); setResumo(d.resumo || []); setTotal(d.total || 0);
    } catch { mostrar('Falha ao carregar.'); }
    finally { setLoading(false); }
  }, [buscaDeb, classe, page, router]);
  useEffect(() => { carregar(); }, [carregar]);

  // valor especial "__auto__" = destravar; senão, trava no valor escolhido
  const aoEscolher = async (doc: string, valor: string) => {
    if (!valor) return;
    const body = valor === '__auto__' ? { documento: doc, unlock: true } : { documento: doc, classificacao: valor };
    try {
      const r = await fetch('/api/classificacao', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      mostrar(r.ok ? (valor === '__auto__' ? 'Destravado (volta ao automático).' : 'Travado na classificação manual.') : 'Falha ao salvar.');
      if (r.ok) carregar();
    } catch { mostrar('Erro ao salvar.'); }
  };

  const totalPaginas = Math.max(1, Math.ceil(total / pageSize));
  const qtdDe = (c: string) => resumo.find(r => r.classe === c)?.qtd || 0;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {toast && <div className="fixed top-4 right-4 z-50 bg-gray-900 text-white px-4 py-2 rounded-lg shadow-lg text-sm">{toast}</div>}
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <a href="/dashboard" className="text-sm text-krv hover:underline">← Voltar ao dashboard</a>
            <h1 className="text-2xl font-bold text-gray-900 mt-1">Classificação de clientes</h1>
            <p className="text-sm text-gray-500">Define a régua que cada cliente recebe. 🔒 = travado na mão (o automático não sobrescreve).</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-6">
          {CLASSES.map(c => (
            <button key={c.k} onClick={() => { setClasse(classe === c.k ? '' : c.k); setPage(1); }}
              className={`bg-white rounded-xl border p-4 text-left ${classe === c.k ? 'border-krv ring-1 ring-red-200' : 'border-gray-200'}`}>
              <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${c.cor}`}>{c.k}</span>
              <p className="text-2xl font-bold text-gray-900 mt-2">{qtdDe(c.k)}</p>
            </button>
          ))}
        </div>

        <div className="flex gap-2 mb-4">
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome ou CPF…"
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          {classe && <button onClick={() => { setClasse(''); setPage(1); }} className="px-3 py-2 text-sm text-gray-500 hover:bg-gray-100 rounded-lg">Limpar filtro</button>}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-gray-500 text-left text-xs bg-gray-50">
              <tr>
                <th className="py-2 px-3 font-medium">Cliente</th>
                <th className="py-2 px-3 font-medium text-center">Histórico</th>
                <th className="py-2 px-3 font-medium text-right">Em atraso</th>
                <th className="py-2 px-3 font-medium">Classificação</th>
                <th className="py-2 px-3 font-medium">Definir</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="py-6 text-center text-gray-400">Carregando…</td></tr>
              ) : clientes.length === 0 ? (
                <tr><td colSpan={5} className="py-6 text-center text-gray-400">Nenhum cliente.</td></tr>
              ) : clientes.map(c => (
                <tr key={c.documento} className="border-t border-gray-100">
                  <td className="py-2 px-3">
                    <div className="font-medium text-gray-800">{c.nome || '—'}</div>
                    <div className="text-xs text-gray-400">{c.documento}</div>
                  </td>
                  <td className="py-2 px-3 text-center text-xs text-gray-600">{c.pagos}/{c.qtd_total} pagos</td>
                  <td className="py-2 px-3 text-right tabular-nums text-red-600">{c.em_atraso > 0 ? brl(c.valor_em_atraso) : '—'}</td>
                  <td className="py-2 px-3 whitespace-nowrap">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${cor(c.classificacao)}`}>{c.classificacao || '—'}</span>
                    <span className="ml-1 text-[10px] text-gray-400">{c.bloqueado ? '🔒 manual' : 'auto'}</span>
                  </td>
                  <td className="py-2 px-3">
                    <select value="" onChange={(e) => aoEscolher(c.documento, e.target.value)}
                      className="border border-gray-300 rounded px-2 py-1 text-xs">
                      <option value="">definir…</option>
                      {CLASSES.map(x => <option key={x.k} value={x.k}>Travar: {x.k}</option>)}
                      {c.bloqueado && <option value="__auto__">↩ Voltar ao automático</option>}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between mt-4 text-sm text-gray-600">
          <span>{total} cliente(s)</span>
          <div className="flex items-center gap-2">
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1 rounded border border-gray-300 disabled:opacity-40">Anterior</button>
            <span>{page} / {totalPaginas}</span>
            <button disabled={page >= totalPaginas} onClick={() => setPage(p => p + 1)} className="px-3 py-1 rounded border border-gray-300 disabled:opacity-40">Próxima</button>
          </div>
        </div>
      </div>
    </div>
  );
}
