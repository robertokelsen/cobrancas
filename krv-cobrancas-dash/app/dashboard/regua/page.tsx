'use client';
// app/dashboard/regua/page.tsx — régua de cobrança (tabelas reais: configuracoes + regua_atraso).
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type Aviso = {
  classificacao: string; dias_uteis: number; notificacao: string;
  email: boolean; whatsapp: boolean; ativo: boolean;
};
type Atraso = { classificacao: string; inicio_dias_uteis: number; cadencia_dias: number; ativo: boolean };

const CLASSES = [
  { k: 'Novo Pagador', cor: 'bg-blue-100 text-blue-700' },
  { k: 'Bom Pagador', cor: 'bg-green-100 text-green-700' },
  { k: 'Mau pagador', cor: 'bg-red-100 text-red-700' },
];
const rotuloOffset = (d: number) =>
  d < 0 ? `${Math.abs(d)} dia(s) úteis antes do vencimento`
    : d === 0 ? 'No dia do vencimento'
    : `${d} dia(s) úteis após o vencimento`;

export default function ReguaPage() {
  const router = useRouter();
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [atrasos, setAtrasos] = useState<Atraso[]>([]);
  const [aba, setAba] = useState(CLASSES[0].k);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [toast, setToast] = useState('');
  const mostrar = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3000); };

  const carregar = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/regua');
      if (r.status === 401) { router.push('/login'); return; }
      const d = await r.json();
      setAvisos((d.configuracoes || []).map((a: any) => ({
        classificacao: a.classificacao, dias_uteis: a.dias_uteis, notificacao: a.notificacao || '',
        email: a.email !== false, whatsapp: a.whatsapp !== false, ativo: a.ativo !== false,
      })));
      // garante uma linha de atraso por classe
      const base: Atraso[] = (d.reguaAtraso || []).map((a: any) => ({
        classificacao: a.classificacao, inicio_dias_uteis: a.inicio_dias_uteis ?? 1,
        cadencia_dias: a.cadencia_dias ?? 3, ativo: a.ativo !== false,
      }));
      for (const c of CLASSES) if (!base.find(b => b.classificacao === c.k))
        base.push({ classificacao: c.k, inicio_dias_uteis: 1, cadencia_dias: 3, ativo: true });
      setAtrasos(base);
    } catch { mostrar('Falha ao carregar.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { carregar(); }, []); // eslint-disable-line

  // helpers de aviso (índice no array completo)
  const updAviso = (gi: number, patch: Partial<Aviso>) =>
    setAvisos(a => a.map((x, i) => i === gi ? { ...x, ...patch } : x));
  const removeAviso = (gi: number) => setAvisos(a => a.filter((_, i) => i !== gi));
  const addAviso = () => setAvisos(a => [...a, {
    classificacao: aba, dias_uteis: 0, notificacao: 'D0 (vence hoje)', email: true, whatsapp: true, ativo: true,
  }]);
  const updAtraso = (patch: Partial<Atraso>) =>
    setAtrasos(a => a.map(x => x.classificacao === aba ? { ...x, ...patch } : x));

  const salvar = async () => {
    setSalvando(true);
    try {
      const r = await fetch('/api/regua', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ configuracoes: avisos, reguaAtraso: atrasos }),
      });
      mostrar(r.ok ? 'Régua salva.' : 'Falha ao salvar.');
      if (r.ok) carregar();
    } catch { mostrar('Erro ao salvar.'); }
    finally { setSalvando(false); }
  };

  const atrasoAba = atrasos.find(a => a.classificacao === aba);

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {toast && <div className="fixed top-4 right-4 z-50 bg-gray-900 text-white px-4 py-2 rounded-lg shadow-lg text-sm">{toast}</div>}
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <a href="/dashboard" className="text-sm text-indigo-600 hover:underline">← Voltar ao dashboard</a>
            <h1 className="text-2xl font-bold text-gray-900 mt-1">Régua de cobrança</h1>
            <p className="text-sm text-gray-500">Quando e por qual canal avisar, por tipo de cliente.</p>
          </div>
          <button onClick={salvar} disabled={salvando}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
            {salvando ? 'Salvando…' : 'Salvar régua'}
          </button>
        </div>

        {loading ? <div className="text-gray-500">Carregando…</div> : (
        <>
          {/* Abas por tipo de cliente */}
          <div className="flex flex-wrap gap-2 mb-5">
            {CLASSES.map(c => (
              <button key={c.k} onClick={() => setAba(c.k)}
                className={`px-3 py-1.5 rounded-lg text-sm border ${aba === c.k ? 'border-indigo-400 bg-indigo-50 text-indigo-700' : 'border-gray-200 bg-white text-gray-600'}`}>
                {c.k} ({avisos.filter(a => a.classificacao === c.k).length})
              </button>
            ))}
          </div>

          {/* Avisos antes/no vencimento */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-1">Avisos no/antes do vencimento</h2>
            <p className="text-xs text-gray-400 mb-3">Dias úteis em relação ao vencimento (negativo = antes, 0 = no dia).</p>
            <div className="space-y-3">
              {avisos.map((a, gi) => a.classificacao !== aba ? null : (
                <div key={gi} className={`border rounded-lg p-3 ${a.ativo ? 'border-gray-200' : 'border-gray-200 opacity-60'}`}>
                  <div className="flex flex-wrap items-center gap-3">
                    <input type="number" value={a.dias_uteis}
                      onChange={(e) => updAviso(gi, { dias_uteis: parseInt(e.target.value || '0', 10) })}
                      className="w-16 border border-gray-300 rounded px-2 py-1 text-sm" />
                    <span className="text-xs text-gray-500 w-48">{rotuloOffset(a.dias_uteis)}</span>
                    <input value={a.notificacao} placeholder="rótulo (ex.: D-3 vai vencer)"
                      onChange={(e) => updAviso(gi, { notificacao: e.target.value })}
                      className="flex-1 min-w-[140px] border border-gray-300 rounded px-2 py-1 text-sm" />
                    <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={a.whatsapp} onChange={(e) => updAviso(gi, { whatsapp: e.target.checked })} /> WhatsApp</label>
                    <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={a.email} onChange={(e) => updAviso(gi, { email: e.target.checked })} /> E-mail</label>
                    <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={a.ativo} onChange={(e) => updAviso(gi, { ativo: e.target.checked })} /> ativo</label>
                    <button onClick={() => removeAviso(gi)} className="px-2 py-1 text-red-500 hover:bg-red-50 rounded text-sm">Excluir</button>
                  </div>
                </div>
              ))}
              {avisos.filter(a => a.classificacao === aba).length === 0 && (
                <p className="text-sm text-gray-400">Nenhum aviso para {aba}.</p>
              )}
            </div>
            <button onClick={addAviso} className="mt-3 px-4 py-2 bg-white border border-dashed border-gray-400 rounded-lg text-sm text-gray-600 hover:bg-gray-100 w-full">
              + Adicionar aviso para {aba}
            </button>
          </div>

          {/* Cobrança em atraso */}
          {atrasoAba && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h2 className="text-sm font-semibold text-gray-700 mb-1">Cobrança em atraso</h2>
              <p className="text-xs text-gray-400 mb-3">Depois do vencimento: começa após X dias úteis e repete a cada Y dias.</p>
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-sm">
                  Começa após
                  <input type="number" value={atrasoAba.inicio_dias_uteis}
                    onChange={(e) => updAtraso({ inicio_dias_uteis: parseInt(e.target.value || '0', 10) })}
                    className="w-16 border border-gray-300 rounded px-2 py-1" /> dias úteis
                </label>
                <label className="flex items-center gap-2 text-sm">
                  Repete a cada
                  <input type="number" value={atrasoAba.cadencia_dias}
                    onChange={(e) => updAtraso({ cadencia_dias: parseInt(e.target.value || '1', 10) })}
                    className="w-16 border border-gray-300 rounded px-2 py-1" /> dias
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={atrasoAba.ativo} onChange={(e) => updAtraso({ ativo: e.target.checked })} /> ativo
                </label>
              </div>
            </div>
          )}
        </>
        )}
      </div>
    </div>
  );
}
