'use client';
// app/dashboard/page.tsx — dashboard de cobranças com gráficos, multi-filtros e envio.
import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
  PieChart, Pie, Cell, CartesianGrid, ComposedChart, Line,
} from 'recharts';

const CONTAS = [
  { id: '360597122', nome: 'Mansões do Lago' },
  { id: '441915256', nome: 'Gran Royal' },
  { id: '319709051', nome: 'Royal Park' },
  { id: '216584469', nome: 'Vivendas Pajuçara' },
  { id: '529462788', nome: 'Paço das Águas' },
];
const N8N_BASE = 'https://n8n.larke.com.br/webhook';

type Boleto = {
  codigo_solicitacao: string; conta: string; nome: string; documento: string;
  situacao: string; vencimento: string | null; valor: number | null;
  dias_uteis: number | null; data_situacao: string | null; classificacao: string | null;
  telefone: string | null; email: string | null;
  data_ultima_notif: string | null; ultima_notificacao: string | null;
  pix_copia_cola?: string | null; linha_digitavel?: string | null;
};
type Metricas = {
  a_receber: number; atrasado: number; recebido: number;
  valor_a_receber: number; valor_atrasado: number; valor_recebido: number;
};
type Pizza = { a_receber: number; atrasado: number; recebido: number };
type SerieMes = { mes: string; recebido: number; atrasado: number; a_receber: number; inadimplencia: number };
type SortKey = 'nome' | 'situacao' | 'vencimento' | 'valor' | 'data_ultima_notif' | 'conta';

const SITUACOES = ['A_RECEBER', 'ATRASADO', 'RECEBIDO', 'CANCELADO'];
const ITENS_ENVIO = [
  { k: 'pdf', label: 'PDF do boleto' },
  { k: 'pix', label: 'PIX copia e cola' },
  { k: 'linha', label: 'Linha digitável' },
];
// situações em que ações de cobrança (PIX/Linha/Enviar/Cancelar) fazem sentido
const ATIVO_COBRANCA = (s: string) => s === 'A_RECEBER' || s === 'ATRASADO';

const brl = (v: number | null | undefined) =>
  (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });
const fmtData = (v: string | null) => v ? new Date(v).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—';
const MESES_ABR = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const fmtMes = (m: string) => { const [a, mm] = m.split('-'); return `${MESES_ABR[parseInt(mm,10)-1]}/${a.slice(2)}`; };

// estima valor atualizado de boleto atrasado: 2% multa + 1% a.m. de juros pro rata
function valorAtualizado(valor: number | null, vencimento: string | null): number | null {
  if (!valor || !vencimento) return null;
  const venc = new Date(vencimento + 'T00:00:00Z').getTime();
  const hoje = Date.now();
  const diasAtraso = Math.max(0, Math.floor((hoje - venc) / 86400000));
  if (diasAtraso === 0) return null;
  const juros = 0.01 * (diasAtraso / 30); // 1% ao mês pro rata
  return valor * (1 + 0.02 + juros);
}

const CORES: Record<string, string> = {
  A_RECEBER: 'bg-blue-100 text-blue-700', ATRASADO: 'bg-red-100 text-red-700',
  RECEBIDO: 'bg-green-100 text-green-700', CANCELADO: 'bg-gray-200 text-gray-600',
};
const CORES_PIE: Record<string, string> = {
  A_RECEBER: '#3b82f6', ATRASADO: '#ef4444', RECEBIDO: '#22c55e',
};

export default function Dashboard() {
  const router = useRouter();
  const [contasSel, setContasSel] = useState<string[]>(CONTAS.map(c => c.id));
  const [situacoesSel, setSituacoesSel] = useState<string[]>([]);
  const [busca, setBusca] = useState('');
  const [buscaDeb, setBuscaDeb] = useState('');
  const [mes, setMes] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const [sort, setSort] = useState<SortKey | ''>('');
  const [dir, setDir] = useState<'asc' | 'desc'>('asc');

  const [boletos, setBoletos] = useState<Boleto[]>([]);
  const [metricas, setMetricas] = useState<Metricas | null>(null);
  const [pizza, setPizza] = useState<Pizza | null>(null);
  const [serie, setSerie] = useState<SerieMes[]>([]);
  const [meses, setMeses] = useState<string[]>([]);
  const [mesVigente, setMesVigente] = useState('');
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');
  const [toast, setToast] = useState('');

  const [envioAberto, setEnvioAberto] = useState<string | null>(null);
  const [itensEnvio, setItensEnvio] = useState<string[]>(['pdf', 'pix', 'linha']);
  const [enviando, setEnviando] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => { setBuscaDeb(busca); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [busca]);

  const carregar = useCallback(async () => {
    setLoading(true); setErro('');
    try {
      const qs = new URLSearchParams({
        conta: contasSel.join(','), situacao: situacoesSel.join(','), busca: buscaDeb, mes,
        page: String(page), pageSize: String(pageSize),
      });
      if (sort) { qs.set('sort', sort); qs.set('dir', dir); }
      const res = await fetch(`/api/boletos?${qs}`);
      if (res.status === 401) { router.push('/login'); return; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      setBoletos(d.boletos || []); setMetricas(d.metricas || null); setPizza(d.pizza || null);
      setSerie(d.serieMensal || []); setMeses(d.mesesDisponiveis || []);
      setMesVigente(d.mesVigente || ''); setTotal(d.total || 0);
    } catch (e: any) { setErro('Falha ao carregar. ' + (e?.message || '')); }
    finally { setLoading(false); }
  }, [contasSel, situacoesSel, buscaDeb, mes, page, sort, dir, router]);

  useEffect(() => { carregar(); }, [carregar]);

  const mostrarToast = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3000); };
  const toggleSituacao = (s: string) => {
    setPage(1);
    setSituacoesSel((c) => c.includes(s) ? c.filter(x => x !== s) : [...c, s]);
  };
  const toggleConta = (id: string) => {
    setPage(1);
    setContasSel((c) => c.includes(id) ? c.filter(x => x !== id) : [...c, id]);
  };
  const ordenar = (key: SortKey) => {
    setPage(1);
    if (sort === key) { setDir(d => d === 'asc' ? 'desc' : 'asc'); }
    else { setSort(key); setDir('asc'); }
  };
  const setaSort = (key: SortKey) => sort === key ? (dir === 'asc' ? ' ▲' : ' ▼') : '';
  const podeCancelar = (s: string) => s === 'A_RECEBER' || s === 'ATRASADO';
  const cancelar = (b: Boleto) =>
    window.open(`${N8N_BASE}/krv-boletos/${b.conta}/cancelar?id=${encodeURIComponent(b.codigo_solicitacao)}`, '_blank', 'noopener');
  const sair = async () => { await fetch('/api/logout', { method: 'POST' }); router.push('/login'); };
  const totalPaginas = Math.max(1, Math.ceil(total / pageSize));

  const enviarBoleto = async (b: Boleto) => {
    if (itensEnvio.length === 0) { mostrarToast('Selecione ao menos um item.'); return; }
    setEnviando(b.codigo_solicitacao);
    try {
      const r = await fetch('/api/enviar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: b.codigo_solicitacao, conta: b.conta, enviar: itensEnvio }),
      });
      mostrarToast(r.ok ? `Enviado para ${b.nome?.split(' ')[0] || 'cliente'}.` : 'Falha ao enviar.');
    } catch { mostrarToast('Erro ao enviar.'); }
    finally { setEnviando(null); setEnvioAberto(null); }
  };

  const copiar = async (txt: string | null | undefined, label: string) => {
    if (!txt) { mostrarToast('Indisponível.'); return; }
    try { await navigator.clipboard.writeText(txt); mostrarToast(`${label} copiado!`); }
    catch { mostrarToast('Não foi possível copiar.'); }
  };

  const inadimplencia = useMemo(() => {
    if (!metricas) return 0;
    const base = metricas.valor_a_receber + metricas.valor_atrasado + metricas.valor_recebido;
    return base > 0 ? (metricas.valor_atrasado / base) * 100 : 0;
  }, [metricas]);

  const dadosPie = useMemo(() => {
    if (!pizza) return [];
    return [
      { name: 'A_RECEBER', value: pizza.a_receber },
      { name: 'ATRASADO', value: pizza.atrasado },
      { name: 'RECEBIDO', value: pizza.recebido },
    ].filter(d => d.value > 0);
  }, [pizza]);

  const serieFmt = useMemo(() => serie.map(s => ({ ...s, mesLabel: fmtMes(s.mes) })), [serie]);

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-gray-900 text-white px-4 py-2 rounded-lg shadow-lg text-sm">{toast}</div>
      )}
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Boletos — Cobrança</h1>
          <div className="flex gap-2">
            <button onClick={carregar} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">Atualizar</button>
            <button onClick={sair} className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm hover:bg-gray-200">Sair</button>
          </div>
        </div>

        {/* Métricas */}
        {metricas && (
          <>
          <div className="text-xs text-gray-400 mb-2">
            {mes ? `Mostrando dados de ${fmtMes(mes)}` : 'Mostrando todos os meses'}
            {contasSel.length < CONTAS.length ? ` · ${contasSel.length} de ${CONTAS.length} empreendimentos` : ' · todos os empreendimentos'}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Card t={`A Receber (${mesVigente ? fmtMes(mesVigente) : 'mês'})`} cor="text-blue-700" q={metricas.a_receber} v={metricas.valor_a_receber} />
            <Card t="Atrasados" cor="text-red-700" q={metricas.atrasado} v={metricas.valor_atrasado} />
            <Card t="Recebidos" cor="text-green-700" q={metricas.recebido} v={metricas.valor_recebido} />
            <div className="bg-white rounded-xl shadow-sm p-4">
              <div className="text-xs text-gray-500 mb-1">Inadimplência</div>
              <div className={`text-2xl font-bold ${inadimplencia > 20 ? 'text-red-600' : 'text-amber-600'}`}>
                {inadimplencia.toFixed(1)}%
              </div>
              <div className="text-xs text-gray-400 mt-1">do valor total</div>
            </div>
          </div>
          </>
        )}

        {/* Gráficos */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow-sm p-4 lg:col-span-2">
            <h3 className="text-sm font-medium text-gray-700 mb-3">Evolução mensal — Recebido vs Atrasado vs Inadimplência</h3>
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart data={serieFmt}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="mesLabel" fontSize={12} />
                <YAxis yAxisId="left" fontSize={11} tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : String(v)} />
                <YAxis yAxisId="right" orientation="right" fontSize={11} tickFormatter={(v) => `${v}%`} domain={[0, 100]} />
                <Tooltip formatter={(v: any, n: any) => n === 'Inadimplência' ? `${v}%` : brl(v)} />
                <Legend />
                <Bar yAxisId="left" dataKey="recebido" name="Recebido" fill="#22c55e" radius={[4,4,0,0]} />
                <Bar yAxisId="left" dataKey="atrasado" name="Atrasado" fill="#ef4444" radius={[4,4,0,0]} />
                <Line yAxisId="right" type="monotone" dataKey="inadimplencia" name="Inadimplência" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-4">
            <h3 className="text-sm font-medium text-gray-700 mb-1">Distribuição por situação (R$)</h3>
            <p className="text-xs text-gray-400 mb-2">{mesVigente ? fmtMes(mesVigente) : 'mês vigente'}</p>
            <ResponsiveContainer width="100%" height={216}>
              <PieChart>
                <Pie data={dadosPie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={(e:any)=>e.name}>
                  {dadosPie.map((d) => <Cell key={d.name} fill={CORES_PIE[d.name] || '#999'} />)}
                </Pie>
                <Tooltip formatter={(v: any) => brl(v)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Filtros */}
        <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
          <div className="flex flex-wrap gap-3 items-end mb-3">
            <div className="w-full">
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs text-gray-500">Empreendimentos (clique para filtrar; múltiplos)</label>
                <div className="flex gap-2">
                  <button onClick={() => { setContasSel(CONTAS.map(c => c.id)); setPage(1); }} className="text-xs text-indigo-600 hover:text-indigo-800">todos</button>
                  <button onClick={() => { setContasSel([]); setPage(1); }} className="text-xs text-gray-400 hover:text-gray-600">nenhum</button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {CONTAS.map((c) => {
                  const ativo = contasSel.includes(c.id);
                  return (
                    <button key={c.id} onClick={() => toggleConta(c.id)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${ativo ? 'bg-indigo-100 text-indigo-700 border-transparent' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}>
                      {c.nome}{ativo ? ' ✓' : ''}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Mês de vencimento</label>
              <select value={mes} onChange={(e) => { setMes(e.target.value); setPage(1); }} className="border rounded-lg px-3 py-2 text-sm">
                <option value="">Todos</option>
                {meses.map((m) => <option key={m} value={m}>{fmtMes(m)}</option>)}
              </select>
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs text-gray-500 mb-1">Buscar (nome, CPF/CNPJ ou código)</label>
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Digite para buscar..." className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Situação (clique para filtrar; múltiplas)</label>
            <div className="flex flex-wrap gap-2">
              {SITUACOES.map((s) => {
                const ativo = situacoesSel.includes(s);
                return (
                  <button key={s} onClick={() => toggleSituacao(s)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${ativo ? CORES[s] + ' border-transparent' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}>
                    {s}{ativo ? ' ✓' : ''}
                  </button>
                );
              })}
              {situacoesSel.length > 0 && (
                <button onClick={() => { setSituacoesSel([]); setPage(1); }} className="px-3 py-1.5 rounded-full text-xs text-gray-400 hover:text-gray-600">limpar</button>
              )}
            </div>
          </div>
        </div>

        {erro && <div className="bg-red-50 text-red-700 p-3 rounded-lg mb-4 text-sm">{erro}</div>}

        {/* Tabela */}
        <div className="bg-white rounded-xl shadow-sm overflow-visible">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 text-left select-none">
                <tr>
                  <Th onClick={() => ordenar('nome')} label={`Cliente${setaSort('nome')}`} />
                  <Th onClick={() => ordenar('situacao')} label={`Situação${setaSort('situacao')}`} />
                  <Th onClick={() => ordenar('vencimento')} label={`Vencimento${setaSort('vencimento')}`} />
                  <Th onClick={() => ordenar('valor')} label={`Valor${setaSort('valor')}`} align="right" />
                  <Th onClick={() => ordenar('data_ultima_notif')} label={`Última notif.${setaSort('data_ultima_notif')}`} />
                  <th className="px-4 py-3 font-medium text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading && <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Carregando...</td></tr>}
                {!loading && boletos.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Nenhum boleto encontrado.</td></tr>}
                {!loading && boletos.map((b) => {
                  const atualizado = b.situacao === 'ATRASADO' ? valorAtualizado(b.valor, b.vencimento) : null;
                  return (
                  <tr key={b.codigo_solicitacao} className="hover:bg-gray-50">
                    <td className="px-4 py-3"><div className="font-medium text-gray-900">{b.nome || '—'}</div><div className="text-xs text-gray-400">{b.documento}</div></td>
                    <td className="px-4 py-3"><span className={`px-2 py-1 rounded-full text-xs font-medium ${CORES[b.situacao] || 'bg-gray-100 text-gray-600'}`}>{b.situacao}</span></td>
                    <td className="px-4 py-3 text-gray-700">{fmtData(b.vencimento)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900 tabular-nums">
                      {atualizado ? (
                        <span title={`Original: ${brl(b.valor)} • Atualizado (2% multa + 1% a.m.): ${brl(atualizado)}`} className="cursor-help border-b border-dotted border-gray-400">
                          {brl(b.valor)}
                        </span>
                      ) : brl(b.valor)}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {b.data_ultima_notif ? <div><div>{fmtData(b.data_ultima_notif)}</div><div className="text-xs text-gray-400">{b.ultima_notificacao || ''}</div></div> : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right relative">
                      {ATIVO_COBRANCA(b.situacao) ? (
                        <div className="inline-flex gap-1">
                          <button onClick={() => copiar(b.pix_copia_cola, 'PIX')} title="Copiar PIX"
                            className="px-2 py-1.5 bg-gray-50 text-gray-600 rounded-lg text-xs hover:bg-gray-100">PIX</button>
                          <button onClick={() => copiar(b.linha_digitavel, 'Linha digitável')} title="Copiar linha digitável"
                            className="px-2 py-1.5 bg-gray-50 text-gray-600 rounded-lg text-xs hover:bg-gray-100">Linha</button>
                          <button onClick={() => { setEnvioAberto(envioAberto === b.codigo_solicitacao ? null : b.codigo_solicitacao); setItensEnvio(['pdf','pix','linha']); }}
                            className="px-2 py-1.5 bg-emerald-50 text-emerald-600 rounded-lg text-xs font-medium hover:bg-emerald-100">Enviar</button>
                          {podeCancelar(b.situacao) && (
                            <button onClick={() => cancelar(b)} className="px-2 py-1.5 bg-red-50 text-red-600 rounded-lg text-xs font-medium hover:bg-red-100">Cancelar</button>
                          )}
                        </div>
                      ) : <span className="text-gray-300 text-xs">—</span>}
                      {envioAberto === b.codigo_solicitacao && (
                        <div className="absolute right-4 top-12 z-20 bg-white border border-gray-200 rounded-xl shadow-lg p-3 w-52 text-left">
                          <div className="text-xs font-medium text-gray-700 mb-2">Enviar ao cliente:</div>
                          {ITENS_ENVIO.map((it) => (
                            <label key={it.k} className="flex items-center gap-2 py-1 text-sm text-gray-600 cursor-pointer">
                              <input type="checkbox" checked={itensEnvio.includes(it.k)}
                                onChange={() => setItensEnvio((c) => c.includes(it.k) ? c.filter(x => x !== it.k) : [...c, it.k])} />
                              {it.label}
                            </label>
                          ))}
                          <button disabled={enviando === b.codigo_solicitacao} onClick={() => enviarBoleto(b)}
                            className="mt-2 w-full bg-emerald-600 text-white rounded-lg py-1.5 text-xs font-medium hover:bg-emerald-700 disabled:opacity-50">
                            {enviando === b.codigo_solicitacao ? 'Enviando...' : 'Enviar agora'}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                  );
                })}
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

function Th({ label, onClick, align = 'left' }: { label: string; onClick: () => void; align?: 'left' | 'right' }) {
  return (
    <th onClick={onClick}
      className={`px-4 py-3 font-medium cursor-pointer hover:text-gray-900 ${align === 'right' ? 'text-right' : ''}`}>
      {label}
    </th>
  );
}

function Card({ t, q, v, cor }: { t: string; q: number; v: number | null; cor: string }) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-4">
      <div className="text-xs text-gray-500 mb-1">{t}</div>
      <div className={`text-2xl font-bold ${cor}`}>{q}</div>
      {v !== null && <div className="text-xs text-gray-400 mt-1 tabular-nums">{(Number(v)||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</div>}
    </div>
  );
}
