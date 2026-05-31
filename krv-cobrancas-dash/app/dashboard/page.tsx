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
  dias_atraso?: number | null;
};
type Metricas = {
  a_receber: number; atrasado: number; recebido: number; expirado: number;
  valor_a_receber: number; valor_atrasado: number; valor_recebido: number; valor_expirado: number;
};
type Pizza = { a_receber: number; atrasado: number; recebido: number };
type SerieMes = { mes: string; recebido: number; atrasado: number; a_receber: number; inadimplencia: number };
type SortKey = 'nome' | 'situacao' | 'vencimento' | 'valor' | 'data_ultima_notif' | 'conta';
type Aging = {
  f1_qtd: number; f2_qtd: number; f3_qtd: number; f4_qtd: number; f5_qtd: number;
  f1_val: number; f2_val: number; f3_val: number; f4_val: number; f5_val: number;
};
type Devedor = { nome: string; documento: string; total_aberto: number; atrasado: number; qtd: number };
type InadConta = { conta: string; atrasado: number; base: number; inadimplencia: number };
type Resumo = { qtd: number; valor_total: number; qtd_atrasado: number; valor_atrasado: number };
type Projecao = { valor_30d: number; qtd_30d: number };
type Silencio = { qtd: number; valor: number };

const NOME_CONTA: Record<string, string> = {
  '360597122': 'Mansões do Lago', '441915256': 'Gran Royal', '319709051': 'Royal Park',
  '216584469': 'Vivendas Pajuçara', '529462788': 'Paço das Águas',
};
const nomeConta = (id: string) => NOME_CONTA[id] || id;

const SITUACOES = ['A_RECEBER', 'ATRASADO', 'RECEBIDO', 'EXPIRADO', 'CANCELADO'];
const ITENS_ENVIO = [
  { k: 'pdf', label: 'PDF do boleto' },
  { k: 'pix', label: 'PIX copia e cola' },
  { k: 'linha', label: 'Linha digitável' },
];
// situações em que o ENVIO de boleto (PIX/Linha/Enviar) faz sentido
const ATIVO_COBRANCA = (s: string) => s === 'A_RECEBER' || s === 'ATRASADO';
// situações em que CANCELAR é permitido (inclui expirados, p/ encerrar a régua)
const PODE_CANCELAR = (s: string) => s === 'A_RECEBER' || s === 'ATRASADO' || s === 'EXPIRADO';

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
  RECEBIDO: 'bg-green-100 text-green-700', EXPIRADO: 'bg-orange-100 text-orange-700',
  CANCELADO: 'bg-gray-200 text-gray-600',
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
  const [aging, setAging] = useState<Aging | null>(null);
  const [topDevedores, setTopDevedores] = useState<Devedor[]>([]);
  const [inadConta, setInadConta] = useState<InadConta[]>([]);
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [projecao, setProjecao] = useState<Projecao | null>(null);
  const [silencio, setSilencio] = useState<Silencio | null>(null);
  const [meses, setMeses] = useState<string[]>([]);
  const [mesVigente, setMesVigente] = useState('');
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');
  const [toast, setToast] = useState('');

  const [envioAberto, setEnvioAberto] = useState<string | null>(null);
  const [itensEnvio, setItensEnvio] = useState<string[]>(['pdf', 'pix', 'linha']);
  const [enviando, setEnviando] = useState<string | null>(null);

  // seleção em lote
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [enviandoLote, setEnviandoLote] = useState(false);

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
      setAging(d.aging || null); setTopDevedores(d.topDevedores || []);
      setInadConta(d.inadConta || []); setResumo(d.resumoFiltro || null);
      setProjecao(d.projecao || null); setSilencio(d.silencio || null);
      setMesVigente(d.mesVigente || ''); setTotal(d.total || 0);
      setSelecionados(new Set());
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

  // ---- seleção em lote (apenas boletos com cobrança ativa) ----
  const selecionaveis = useMemo(
    () => boletos.filter(b => ATIVO_COBRANCA(b.situacao)).map(b => b.codigo_solicitacao),
    [boletos],
  );
  const toggleSel = (id: string) => setSelecionados(s => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n;
  });
  const toggleSelTodos = () => setSelecionados(s =>
    s.size === selecionaveis.length ? new Set() : new Set(selecionaveis));

  const enviarLote = async () => {
    const ids = [...selecionados];
    if (!ids.length) return;
    if (!window.confirm(`Disparar cobrança (PDF + PIX + linha) para ${ids.length} cliente(s)?`)) return;
    setEnviandoLote(true);
    let ok = 0, falha = 0;
    for (const id of ids) {
      const b = boletos.find(x => x.codigo_solicitacao === id);
      if (!b) { falha++; continue; }
      try {
        const r = await fetch('/api/enviar', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: b.codigo_solicitacao, conta: b.conta, enviar: ['pdf', 'pix', 'linha'] }),
        });
        r.ok ? ok++ : falha++;
      } catch { falha++; }
    }
    setEnviandoLote(false); setSelecionados(new Set());
    mostrarToast(`Lote: ${ok} enviado(s)${falha ? `, ${falha} falha(s)` : ''}.`);
  };

  const exportar = () => {
    const qs = new URLSearchParams({
      conta: contasSel.join(','), situacao: situacoesSel.join(','), busca: buscaDeb, mes,
    });
    window.open(`/api/boletos/export?${qs}`, '_blank');
  };

  const inadimplencia = useMemo(() => {
    if (!metricas) return 0;
    const inadimplente = metricas.valor_atrasado + metricas.valor_expirado;
    const base = metricas.valor_a_receber + inadimplente + metricas.valor_recebido;
    return base > 0 ? (inadimplente / base) * 100 : 0;
  }, [metricas]);

  const dadosPie = useMemo(() => {
    if (!pizza) return [];
    return [
      { name: 'A_RECEBER', value: pizza.a_receber },
      { name: 'ATRASADO', value: pizza.atrasado },
      { name: 'RECEBIDO', value: pizza.recebido },
    ].filter(d => d.value > 0);
  }, [pizza]);

  const serieFmt = useMemo(() => serie.map(s => ({ ...s, label: fmtMes(s.mes) })), [serie]);

  const agingData = useMemo(() => {
    if (!aging) return [];
    return [
      { faixa: '1–30', valor: aging.f1_val, qtd: aging.f1_qtd },
      { faixa: '31–40', valor: aging.f2_val, qtd: aging.f2_qtd },
      { faixa: '41–50', valor: aging.f3_val, qtd: aging.f3_qtd },
      { faixa: '51–60', valor: aging.f4_val, qtd: aging.f4_qtd },
      { faixa: '60+', valor: aging.f5_val, qtd: aging.f5_qtd },
    ];
  }, [aging]);
  const CORES_AGING = ['#fbbf24', '#fb923c', '#f97316', '#ef4444', '#b91c1c'];

  const inadContaData = useMemo(
    () => inadConta.map(c => ({ ...c, nome: nomeConta(c.conta) })),
    [inadConta],
  );

  const corDias = (d: number | null | undefined) => {
    if (d == null) return 'text-gray-400';
    if (d <= 30) return 'text-amber-600';
    if (d <= 50) return 'text-orange-600';
    return 'text-red-600 font-semibold';
  };

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
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            <Card t={`A Receber (${mesVigente ? fmtMes(mesVigente) : 'mês'})`} cor="text-blue-700" q={metricas.a_receber} v={metricas.valor_a_receber} />
            <Card t="Atrasados" cor="text-red-700" q={metricas.atrasado} v={metricas.valor_atrasado} />
            <Card t="Expirados" cor="text-orange-700" q={metricas.expirado} v={metricas.valor_expirado} />
            <Card t={`Recebidos (${mesVigente ? fmtMes(mesVigente) : 'mês'})`} cor="text-green-700" q={metricas.recebido} v={metricas.valor_recebido} />
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

        {/* Alerta de silêncio + Projeção 30 dias */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {silencio && silencio.qtd > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 md:col-span-2 flex items-start gap-3">
              <span className="text-amber-500 text-xl leading-none">⚠️</span>
              <div>
                <div className="text-sm font-semibold text-amber-800">
                  {silencio.qtd} atrasado(s) sem notificação há mais de 7 dias
                </div>
                <div className="text-xs text-amber-700 mt-0.5">
                  Somam {brl(silencio.valor)}. Régua pode ter falhado — vale reenviar.
                </div>
              </div>
            </div>
          )}
          {projecao && (
            <div className={`bg-white rounded-xl shadow-sm p-4 ${silencio && silencio.qtd > 0 ? '' : 'md:col-start-3'}`}>
              <div className="text-xs text-gray-500 mb-1">Projeção — próximos 30 dias</div>
              <div className="text-2xl font-bold text-indigo-700 tabular-nums">{brl(projecao.valor_30d)}</div>
              <div className="text-xs text-gray-400 mt-1">{projecao.qtd_30d} boleto(s) a vencer</div>
            </div>
          )}
        </div>

        {/* Gráficos */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow-sm p-4 lg:col-span-2">
            <h3 className="text-sm font-medium text-gray-700 mb-3">Evolução mensal — Recebido vs Atrasado vs Inadimplência</h3>
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart data={serieFmt}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" fontSize={12} />
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
            <p className="text-xs text-gray-400 mb-2">{mesVigente ? fmtMes(mesVigente) : 'mês vigente'} · atrasado inclui expirados</p>
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

        {/* Aging + Inadimplência por empreendimento */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow-sm p-4">
            <h3 className="text-sm font-medium text-gray-700 mb-1">Aging de atrasados (dias)</h3>
            <p className="text-xs text-gray-400 mb-3">Valor em aberto por faixa de atraso · inclui expirados (60+)</p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={agingData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="faixa" fontSize={12} />
                <YAxis fontSize={11} tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : String(v)} />
                <Tooltip formatter={(v: any, _n: any, p: any) => [`${brl(v)} · ${p?.payload?.qtd} boleto(s)`, 'Atrasado']} />
                <Bar dataKey="valor" radius={[4,4,0,0]}>
                  {agingData.map((_, idx) => <Cell key={idx} fill={CORES_AGING[idx]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-4">
            <h3 className="text-sm font-medium text-gray-700 mb-1">Inadimplência por empreendimento</h3>
            <p className="text-xs text-gray-400 mb-3">% do valor da carteira em atraso</p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={inadContaData} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" fontSize={11} tickFormatter={(v) => `${v}%`} domain={[0, 100]} />
                <YAxis type="category" dataKey="nome" fontSize={11} width={110} />
                <Tooltip formatter={(v: any, _n: any, p: any) => [`${v}% · ${brl(p?.payload?.atrasado)} em atraso`, 'Inadimplência']} />
                <Bar dataKey="inadimplencia" radius={[0,4,4,0]}>
                  {inadContaData.map((c, idx) => (
                    <Cell key={idx} fill={c.inadimplencia > 20 ? '#ef4444' : c.inadimplencia > 10 ? '#f59e0b' : '#22c55e'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top devedores */}
        {topDevedores.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
            <h3 className="text-sm font-medium text-gray-700 mb-1">Top 10 devedores</h3>
            <p className="text-xs text-gray-400 mb-3">Maior valor em aberto (atrasado + a receber)</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-gray-500 text-left text-xs">
                  <tr>
                    <th className="py-2 font-medium">#</th>
                    <th className="py-2 font-medium">Cliente</th>
                    <th className="py-2 font-medium text-right">Em atraso</th>
                    <th className="py-2 font-medium text-right">Total aberto</th>
                    <th className="py-2 font-medium text-center">Boletos</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {topDevedores.map((d, idx) => (
                    <tr key={d.documento || idx} className="hover:bg-gray-50">
                      <td className="py-2 text-gray-400">{idx + 1}</td>
                      <td className="py-2">
                        <button onClick={() => { setBusca(d.documento || d.nome); }}
                          className="font-medium text-gray-900 hover:text-indigo-600 text-left">
                          {d.nome || '—'}
                        </button>
                        <div className="text-xs text-gray-400">{d.documento}</div>
                      </td>
                      <td className="py-2 text-right tabular-nums text-red-600">{brl(d.atrasado)}</td>
                      <td className="py-2 text-right tabular-nums font-semibold text-gray-900">{brl(d.total_aberto)}</td>
                      <td className="py-2 text-center text-gray-500">{d.qtd}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

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
          {/* Barra de resumo + ações em lote */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-gray-100">
            <div className="text-sm text-gray-600">
              {resumo && (
                <>
                  <span className="font-semibold text-gray-900">{resumo.qtd}</span> boleto(s) no filtro ·{' '}
                  <span className="font-semibold text-gray-900 tabular-nums">{brl(resumo.valor_total)}</span>
                  {resumo.qtd_atrasado > 0 && (
                    <span className="text-red-600"> · {resumo.qtd_atrasado} atrasado(s) ({brl(resumo.valor_atrasado)})</span>
                  )}
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              {selecionados.size > 0 && (
                <button onClick={enviarLote} disabled={enviandoLote}
                  className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700 disabled:opacity-50">
                  {enviandoLote ? 'Enviando...' : `Enviar cobrança (${selecionados.size})`}
                </button>
              )}
              <button onClick={exportar}
                className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-200">
                Exportar CSV
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 text-left select-none">
                <tr>
                  <th className="px-3 py-3 w-8">
                    <input type="checkbox"
                      checked={selecionaveis.length > 0 && selecionados.size === selecionaveis.length}
                      onChange={toggleSelTodos} title="Selecionar todos (cobrança ativa)" />
                  </th>
                  <Th onClick={() => ordenar('nome')} label={`Cliente${setaSort('nome')}`} />
                  <Th onClick={() => ordenar('situacao')} label={`Situação${setaSort('situacao')}`} />
                  <Th onClick={() => ordenar('vencimento')} label={`Vencimento${setaSort('vencimento')}`} />
                  <th className="px-4 py-3 font-medium text-right">Atraso</th>
                  <Th onClick={() => ordenar('valor')} label={`Valor${setaSort('valor')}`} align="right" />
                  <Th onClick={() => ordenar('data_ultima_notif')} label={`Última notif.${setaSort('data_ultima_notif')}`} />
                  <th className="px-4 py-3 font-medium text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading && <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">Carregando...</td></tr>}
                {!loading && boletos.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">Nenhum boleto encontrado.</td></tr>}
                {!loading && boletos.map((b) => {
                  const atualizado = b.situacao === 'ATRASADO' ? valorAtualizado(b.valor, b.vencimento) : null;
                  return (
                  <tr key={b.codigo_solicitacao} className="hover:bg-gray-50">
                    <td className="px-3 py-3">
                      {ATIVO_COBRANCA(b.situacao) && (
                        <input type="checkbox" checked={selecionados.has(b.codigo_solicitacao)}
                          onChange={() => toggleSel(b.codigo_solicitacao)} />
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{b.nome || '—'}</div>
                      <div className="text-xs text-gray-400">{b.documento} · {nomeConta(b.conta)}</div>
                    </td>
                    <td className="px-4 py-3"><span className={`px-2 py-1 rounded-full text-xs font-medium ${CORES[b.situacao] || 'bg-gray-100 text-gray-600'}`}>{b.situacao}</span></td>
                    <td className="px-4 py-3 text-gray-700">{fmtData(b.vencimento)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {b.situacao === 'ATRASADO' && b.dias_atraso != null
                        ? <span className={corDias(b.dias_atraso)}>{b.dias_atraso}d</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
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
                      {(ATIVO_COBRANCA(b.situacao) || PODE_CANCELAR(b.situacao)) ? (
                        <div className="inline-flex gap-1">
                          {ATIVO_COBRANCA(b.situacao) && (
                            <>
                              <button onClick={() => copiar(b.pix_copia_cola, 'PIX')} title="Copiar PIX"
                                className="px-2 py-1.5 bg-gray-50 text-gray-600 rounded-lg text-xs hover:bg-gray-100">PIX</button>
                              <button onClick={() => copiar(b.linha_digitavel, 'Linha digitável')} title="Copiar linha digitável"
                                className="px-2 py-1.5 bg-gray-50 text-gray-600 rounded-lg text-xs hover:bg-gray-100">Linha</button>
                              <button onClick={() => { setEnvioAberto(envioAberto === b.codigo_solicitacao ? null : b.codigo_solicitacao); setItensEnvio(['pdf','pix','linha']); }}
                                className="px-2 py-1.5 bg-emerald-50 text-emerald-600 rounded-lg text-xs font-medium hover:bg-emerald-100">Enviar</button>
                            </>
                          )}
                          {PODE_CANCELAR(b.situacao) && (
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
