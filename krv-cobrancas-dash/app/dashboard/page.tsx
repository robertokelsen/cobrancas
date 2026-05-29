'use client';
// app/dashboard/page.tsx
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';

const CONTAS = [
  { id: '360597122', nome: 'Mansões do Lago' },
  // Descomente conforme replicar os workflows de cancelamento:
  // { id: '441915256', nome: 'Conta 2' },
  // { id: '319709051', nome: 'Conta 3' },
  // { id: '216584469', nome: 'Conta 4' },
];

const N8N_BASE = 'https://n8n.larke.com.br/webhook';

type Boleto = {
  codigo_solicitacao: string; conta: string; nome: string; documento: string;
  situacao: string; vencimento: string | null; valor: number | null;
  dias_uteis: number | null; data_situacao: string | null;
  classificacao: string | null; telefone: string | null; email: string | null;
  data_ultima_notif: string | null;
};
type Metricas = {
  a_receber: number; atrasado: number; recebido: number; cancelado: number;
  valor_a_receber: number; valor_atrasado: number; valor_recebido: number;
};

const SITUACOES = ['', 'A_RECEBER', 'ATRASADO', 'RECEBIDO', 'CANCELADO'];
const fmtMoeda = (v: number | null) => (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtData = (v: string | null) => v ? new Date(v).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—';
const CORES: Record<string, string> = {
  A_RECEBER: 'bg-blue-100 text-blue-700', ATRASADO: 'bg-red-100 text-red-700',
  RECEBIDO: 'bg-green-100 text-green-700', CANCELADO: 'bg-gray-200 text-gray-600',
};

export default function Dashboard() {
  const router = useRouter();
  const [conta, setConta] = useState(CONTAS[0].id);
  const [situacao, setSituacao] = useState('');
  const [busca, setBusca] = useState('');
  const [buscaDeb, setBuscaDeb] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const [boletos, setBoletos] = useState<Boleto[]>([]);
  const [metricas, setMetricas] = useState<Metricas | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    const t = setTimeout(() => { setBuscaDeb(busca); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [busca]);

  const carregar = useCallback(async () => {
    setLoading(true); setErro('');
    try {
      const qs = new URLSearchParams({ conta, situacao, busca: buscaDeb, page: String(page), pageSize: String(pageSize) });
      const res = await fetch(`/api/boletos?${qs}`);
      if (res.status === 401) { router.push('/login'); return; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      setBoletos(d.boletos || []); setMetricas(d.metricas || null); setTotal(d.total || 0);
    } catch (e: any) { setErro('Falha ao carregar. ' + (e?.message || '')); }
    finally { setLoading(false); }
  }, [conta, situacao, buscaDeb, page, router]);

  useEffect(() => { carregar(); }, [carregar]);

  const podeCancelar = (s: string) => s === 'A_RECEBER' || s === 'ATRASADO';
  const cancelar = (b: Boleto) =>
    window.open(`${N8N_BASE}/krv-boletos/${b.conta}/cancelar?id=${encodeURIComponent(b.codigo_solicitacao)}`, '_blank', 'noopener');
  const sair = async () => { await fetch('/api/logout', { method: 'POST' }); router.push('/login'); };
  const totalPaginas = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Boletos — Cobrança</h1>
          <div className="flex gap-2">
            <button onClick={carregar} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">Atualizar</button>
            <button onClick={sair} className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm hover:bg-gray-200">Sair</button>
          </div>
        </div>

        {metricas && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Card t="A Receber" cor="text-blue-700" q={metricas.a_receber} v={metricas.valor_a_receber} />
            <Card t="Atrasados" cor="text-red-700" q={metricas.atrasado} v={metricas.valor_atrasado} />
            <Card t="Recebidos" cor="text-green-700" q={metricas.recebido} v={metricas.valor_recebido} />
            <Card t="Cancelados" cor="text-gray-600" q={metricas.cancelado} v={null} />
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm p-4 mb-4 flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Conta</label>
            <select value={conta} onChange={(e) => { setConta(e.target.value); setPage(1); }} className="border rounded-lg px-3 py-2 text-sm">
              {CONTAS.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Situação</label>
            <select value={situacao} onChange={(e) => { setSituacao(e.target.value); setPage(1); }} className="border rounded-lg px-3 py-2 text-sm">
              {SITUACOES.map((s) => <option key={s} value={s}>{s || 'Todas'}</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs text-gray-500 mb-1">Buscar (nome, CPF/CNPJ ou código)</label>
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Digite para buscar..." className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>

        {erro && <div className="bg-red-50 text-red-700 p-3 rounded-lg mb-4 text-sm">{erro}</div>}

        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium">Cliente</th>
                  <th className="px-4 py-3 font-medium">Situação</th>
                  <th className="px-4 py-3 font-medium">Vencimento</th>
                  <th className="px-4 py-3 font-medium text-right">Valor</th>
                  <th className="px-4 py-3 font-medium">Classificação</th>
                  <th className="px-4 py-3 font-medium text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading && <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Carregando...</td></tr>}
                {!loading && boletos.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Nenhum boleto encontrado.</td></tr>}
                {!loading && boletos.map((b) => (
                  <tr key={b.codigo_solicitacao} className="hover:bg-gray-50">
                    <td className="px-4 py-3"><div className="font-medium text-gray-900">{b.nome || '—'}</div><div className="text-xs text-gray-400">{b.documento}</div></td>
                    <td className="px-4 py-3"><span className={`px-2 py-1 rounded-full text-xs font-medium ${CORES[b.situacao] || 'bg-gray-100 text-gray-600'}`}>{b.situacao}</span></td>
                    <td className="px-4 py-3 text-gray-700">{fmtData(b.vencimento)}</td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">{fmtMoeda(b.valor)}</td>
                    <td className="px-4 py-3 text-gray-600">{b.classificacao || '—'}</td>
                    <td className="px-4 py-3 text-right">
                      {podeCancelar(b.situacao)
                        ? <button onClick={() => cancelar(b)} className="px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-xs font-medium hover:bg-red-100">Cancelar</button>
                        : <span className="text-xs text-gray-300">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-sm">
            <span className="text-gray-500">{total} boleto(s)</span>
            <div className="flex items-center gap-2">
              <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="px-3 py-1.5 border rounded-lg disabled:opacity-40">Anterior</button>
              <span className="text-gray-600">{page} / {totalPaginas}</span>
              <button disabled={page >= totalPaginas} onClick={() => setPage(page + 1)} className="px-3 py-1.5 border rounded-lg disabled:opacity-40">Próxima</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Card({ t, q, v, cor }: { t: string; q: number; v: number | null; cor: string }) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-4">
      <div className="text-xs text-gray-500 mb-1">{t}</div>
      <div className={`text-2xl font-bold ${cor}`}>{q}</div>
      {v !== null && <div className="text-xs text-gray-400 mt-1">{v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>}
    </div>
  );
}
