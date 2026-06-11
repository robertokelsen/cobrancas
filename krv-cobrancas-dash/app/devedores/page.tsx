'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';

type Dev = {
  conta: string; empreendimento: string; bloco: string; unidade: string;
  nome: string; documento: string; qtd_vencidos: number; total_vencido: number;
  dias_atraso: number; venc_mais_antigo: string | null;
};

const NOME_CONTA: Record<string, string> = {
  '360597122': 'Mansões do Lago', '441915256': 'Gran Royal', '319709051': 'Royal Park',
  '216584469': 'Vivendas Pajuçara', '529462788': 'Paço das Águas',
};
const CONTAS = ['360597122', '441915256', '216584469', '529462788', '319709051'];
const brl = (v: number | null | undefined) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmt = (v: string | null) => v ? new Date(v).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—';

export default function DevedoresPage() {
  const router = useRouter();
  const [devs, setDevs] = useState<Dev[]>([]);
  const [conta, setConta] = useState('');
  const [loading, setLoading] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams(); if (conta) qs.set('conta', conta);
      const r = await fetch(`/api/devedores?${qs}`);
      if (r.status === 401) { router.push('/devedores/login'); return; }
      const d = await r.json();
      setDevs(d.devedores || []);
    } finally { setLoading(false); }
  }, [conta, router]);
  useEffect(() => { carregar(); }, [carregar]);

  const sair = async () => { await fetch('/api/logout', { method: 'POST' }).catch(() => {}); router.push('/devedores/login'); };

  // agrupa por empreendimento (conta)
  const grupos = CONTAS
    .map((c) => ({ conta: c, nome: NOME_CONTA[c] || c, itens: devs.filter((d) => d.conta === c) }))
    .filter((g) => g.itens.length > 0);
  const totalDevedores = devs.length;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-2xl font-bold text-gray-900">Devedores — Manutenção</h1>
          <div className="flex gap-2">
            <button onClick={carregar} className="px-4 py-2 bg-krv text-white rounded-lg text-sm font-medium hover:bg-krvdark">Atualizar</button>
            <button onClick={sair} className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm hover:bg-gray-200">Sair</button>
          </div>
        </div>
        <p className="text-sm text-gray-500 mb-5">Unidades com boletos vencidos. Use para suspender manutenções enquanto houver pendência financeira.</p>

        <div className="flex flex-wrap gap-2 mb-5">
          <button onClick={() => setConta('')} className={`px-3 py-1.5 rounded-lg text-sm border ${conta === '' ? 'border-krv bg-red-50 text-krv' : 'border-gray-200 bg-white text-gray-600'}`}>Todos</button>
          {CONTAS.map((c) => (
            <button key={c} onClick={() => setConta(c)} className={`px-3 py-1.5 rounded-lg text-sm border ${conta === c ? 'border-krv bg-red-50 text-krv' : 'border-gray-200 bg-white text-gray-600'}`}>
              {NOME_CONTA[c]}
            </button>
          ))}
        </div>

        {loading ? <p className="text-gray-500">Carregando…</p> : totalDevedores === 0 ? (
          <p className="text-gray-500">Nenhum devedor.</p>
        ) : grupos.map((g) => (
          <div key={g.conta} className="mb-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-2">{g.nome} <span className="text-gray-400 font-normal">· {g.itens.length} unidade(s)</span></h2>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="text-gray-500 text-left text-xs bg-gray-50">
                  <tr>
                    <th className="py-2 px-3 font-medium">Unidade</th>
                    <th className="py-2 px-3 font-medium">Cliente</th>
                    <th className="py-2 px-3 font-medium text-center">Boletos</th>
                    <th className="py-2 px-3 font-medium text-right">Total vencido</th>
                    <th className="py-2 px-3 font-medium text-center">Atraso</th>
                  </tr>
                </thead>
                <tbody>
                  {g.itens.map((d, idx) => (
                    <tr key={d.documento + idx} className="border-t border-gray-100">
                      <td className="py-2 px-3 font-medium text-gray-800">
                        {d.unidade ? `${d.bloco ? d.bloco + ' · ' : ''}${d.unidade}` : <span className="text-amber-600">sem cadastro</span>}
                      </td>
                      <td className="py-2 px-3">
                        <div className="text-gray-800">{d.nome || '—'}</div>
                        <div className="text-xs text-gray-400">{d.documento}</div>
                      </td>
                      <td className="py-2 px-3 text-center text-gray-600">{d.qtd_vencidos}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-red-600">{brl(d.total_vencido)}</td>
                      <td className="py-2 px-3 text-center text-gray-600">{d.dias_atraso} d</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
