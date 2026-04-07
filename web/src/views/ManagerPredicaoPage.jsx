import React, { useEffect, useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, LabelList } from 'recharts';
import { TrendingUp, AlertTriangle, CheckCircle2, BarChart3 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { readApiResponse } from '../utils/api';

const SHIFT_COLORS = {
    manha: '#38bdf8',     // Sky 400
    tarde: '#f59e0b',     // Amber 500
    noite: '#8b5cf6',     // Violet 500
    madrugada: '#64748b'  // Slate 500
};

const cardClass =
    'overflow-hidden rounded-[2rem] border border-slate-700/70 bg-[linear-gradient(150deg,rgba(15,23,42,0.95),rgba(2,6,23,0.92))] p-6 shadow-[0_24px_70px_-28px_rgba(15,23,42,0.9)]';

const ChartTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="rounded-xl border border-slate-700 bg-slate-900/95 px-3 py-2 text-xs shadow-xl">
            <p className="mb-1 font-black text-white">Dia {label}</p>
            {payload.map((item) => (
                <div key={item.dataKey} className="flex items-center gap-2 text-slate-300">
                    <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="capitalize">{item.name}:</span>
                    <span className="font-black text-white">{item.value}</span>
                </div>
            ))}
            <div className="mt-1 border-t border-slate-800 pt-1 text-[10px] text-slate-500 italic">
                Meta dinâmica baseada no histórico
            </div>
        </div>
    );
};

export default function ManagerPredicaoPage({ embedded = false, sharedFilters = null }) {
    const { session } = useAuth();
    const [data, setData] = useState({ history: [], metas: {} });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const unitIds = useMemo(() => {
        if (sharedFilters?.unitIds?.length > 0) return sharedFilters.unitIds;
        return session?.unidadeId ? [session.unidadeId] : [];
    }, [sharedFilters?.unitIds, session?.unidadeId]);

    const { month, year } = sharedFilters || {};

    useEffect(() => {
        if (!session?.id) return;

        let cancelled = false;
        (async () => {
            setLoading(true);
            setError('');
            try {
                const params = new URLSearchParams();
                params.set('gestorId', session.id);
                if (month) params.set('month', month);
                if (year) params.set('year', year);
                if (unitIds.length > 0) params.set('unidadeIds', unitIds.join(','));

                const response = await fetch(`/api/manager/analise-atendimento?${params.toString()}`);
                const payload = await readApiResponse(response);

                if (!response.ok) throw new Error(payload.error || 'Falha ao carregar análise analítica.');
                if (!cancelled) setData(payload);
            } catch (err) {
                if (!cancelled) setError(err.message);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => { cancelled = true; };
    }, [session?.id, unitIds, month, year]);

    const q1Data = useMemo(() => data.history.slice(0, 15), [data.history]);
    const q2Data = useMemo(() => data.history.slice(15), [data.history]);

    const stats = useMemo(() => {
        const total = data.history.reduce((acc, curr) => acc + curr.total, 0);
        const excesso = data.history.reduce((acc, curr) => acc + curr.total_excesso, 0);
        const diasComExcesso = data.history.filter(d => d.total_excesso > 0).length;
        return { total, excesso, diasComExcesso };
    }, [data.history]);

    if (loading) {
        return (
            <div className="flex h-64 items-center justify-center rounded-3xl border border-slate-800 bg-slate-900/40">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-sky-500 border-t-transparent" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-6 text-center">
                <AlertTriangle className="mx-auto mb-2 text-rose-400" size={32} />
                <p className="text-sm text-rose-100">{error}</p>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-10">
            {/* Cards de Resumo Analítico */}
            <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-[2rem] border border-slate-700/50 bg-slate-900/40 p-6 backdrop-blur-md transition-all hover:bg-slate-900/60 hover:shadow-2xl hover:shadow-sky-500/10">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Demanda Total (30d)</p>
                    <div className="mt-2 flex items-baseline gap-2">
                        <span className="text-3xl font-black text-white leading-none">{stats.total}</span>
                        <span className="text-xs text-slate-400">atendimentos</span>
                    </div>
                </div>
                <div className="rounded-[2rem] border border-slate-700/50 bg-slate-900/40 p-6 backdrop-blur-md transition-all hover:bg-slate-900/60 hover:shadow-2xl hover:shadow-rose-500/10">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Volume Extra (Acima Meta)</p>
                    <div className="mt-2 flex items-baseline gap-2">
                        <span className="text-3xl font-black text-rose-400 leading-none">{stats.excesso}</span>
                        <span className="text-xs text-slate-400">atendimentos</span>
                    </div>
                </div>
                <div className="rounded-[2rem] border border-slate-700/50 bg-slate-900/40 p-6 backdrop-blur-md transition-all hover:bg-slate-900/60 hover:shadow-2xl hover:shadow-amber-500/10">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Frequência de Sobrecarga</p>
                    <div className="mt-2 flex items-baseline gap-2">
                        <span className="text-3xl font-black text-amber-400 leading-none">{stats.diasComExcesso}</span>
                        <span className="text-xs text-slate-400">dias afetados</span>
                    </div>
                </div>
            </div>

            {/* TABELA 1: DEMANDA REAL */}
            <section className="space-y-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="h-8 w-1 rounded-full bg-sky-500 shadow-[0_0_15px_rgba(14,165,233,0.5)]" />
                        <div>
                            <h3 className="text-xl font-black text-white">Demanda Real por Unidade</h3>
                            <p className="text-xs text-slate-400">Volume diário consolidado nos últimos 30 dias.</p>
                        </div>
                    </div>
                </div>
                
                <div className={cardClass + " !p-0"}>
                    <div className="max-h-[520px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
                        <table className="w-full text-left border-separate border-spacing-0">
                            <thead>
                                <tr className="sticky top-0 z-20 border-b border-slate-800/60 bg-slate-900 shadow-[0_1px_0_0_rgba(255,255,255,0.05)]">
                                    <th className="sticky left-0 top-0 bg-slate-900 z-30 px-6 py-4 text-[10px] font-black uppercase tracking-tighter text-slate-500">Data</th>
                                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-tighter text-slate-500 text-center">Manhã</th>
                                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-tighter text-slate-500 text-center">Tarde</th>
                                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-tighter text-slate-500 text-center">Noite</th>
                                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-tighter text-slate-500 text-center">Madrugada</th>
                                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-tighter text-sky-400 text-right">Total Dia</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/30">
                                {data.history.map((row, idx) => {
                                    const renderValMeta = (val, meta) => (
                                        <div className="flex flex-col items-center gap-0.5">
                                            <span className="text-[14px] font-black text-white">{val || 0}</span>
                                            <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Meta: {meta || 0}</span>
                                        </div>
                                    );

                                    return (
                                        <tr key={idx} className="group hover:bg-white/[0.02] transition-colors">
                                            <td className="sticky left-0 bg-slate-900/95 z-10 px-6 py-3 border-r border-slate-800/30">
                                                <span className="text-[13px] font-bold text-slate-300 group-hover:text-white transition-colors">
                                                    {row.data.split('-').reverse().slice(0, 2).join('/')}
                                                </span>
                                            </td>
                                            <td className="px-6 py-3 text-center">{renderValMeta(row.manha, row.meta_manha)}</td>
                                            <td className="px-6 py-3 text-center">{renderValMeta(row.tarde, row.meta_tarde)}</td>
                                            <td className="px-6 py-3 text-center">{renderValMeta(row.noite, row.meta_noite)}</td>
                                            <td className="px-6 py-3 text-center">{renderValMeta(row.madrugada, row.meta_madrugada)}</td>
                                            <td className="px-6 py-3 text-right">
                                                <span className="px-3 py-1 rounded-full bg-sky-500/10 text-sky-400 text-xs font-black border border-sky-500/20">
                                                    {row.total}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            </section>

            {/* TABELA 2: DESEMPENHO VS META */}
            <section className="space-y-4">
                <div className="flex items-center gap-3">
                    <div className="h-8 w-1 rounded-full bg-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.5)]" />
                    <div>
                        <h3 className="text-xl font-black text-white">Análise de Performance vs Meta</h3>
                        <p className="text-xs text-slate-400">Diferença em relação à média móvel dinâmica de 90 dias.</p>
                    </div>
                </div>

                <div className={cardClass + " !p-0"}>
                    <div className="max-h-[520px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
                        <table className="w-full text-left border-separate border-spacing-0">
                            <thead>
                                <tr className="sticky top-0 z-20 border-b border-slate-800/60 bg-slate-900 shadow-[0_1px_0_0_rgba(255,255,255,0.05)]">
                                    <th className="sticky left-0 top-0 bg-slate-900 z-30 px-6 py-4 text-[10px] font-black uppercase tracking-tighter text-slate-500">Data</th>
                                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-tighter text-slate-500 text-center">Diff Manhã</th>
                                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-tighter text-slate-500 text-center">Diff Tarde</th>
                                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-tighter text-slate-500 text-center">Diff Noite</th>
                                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-tighter text-slate-500 text-center">Diff Madrug.</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/30">
                                {data.history.map((row, idx) => {
                                    const renderDiff = (val) => {
                                        if (val === 0 || val === undefined) return <span className="text-slate-600">-</span>;
                                        const isPos = val > 0;
                                        return (
                                            <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-black ${isPos ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'}`}>
                                                {isPos ? '+' : ''}{val}
                                            </div>
                                        );
                                    };

                                    return (
                                        <tr key={idx} className="group hover:bg-white/[0.02] transition-colors">
                                            <td className="sticky left-0 bg-slate-900/95 z-10 px-6 py-3 border-r border-slate-800/30">
                                                <span className="text-[13px] font-bold text-slate-300 group-hover:text-white transition-colors">
                                                    {row.data.split('-').reverse().slice(0, 2).join('/')}
                                                </span>
                                            </td>
                                            <td className="px-6 py-3 text-center">{renderDiff(row.diff_manha)}</td>
                                            <td className="px-6 py-3 text-center">{renderDiff(row.diff_tarde)}</td>
                                            <td className="px-6 py-3 text-center">{renderDiff(row.diff_noite)}</td>
                                            <td className="px-6 py-3 text-center">{renderDiff(row.diff_madrugada)}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            </section>

            <div className="flex items-center gap-2 rounded-2xl border border-sky-500/20 bg-sky-500/5 p-4 text-xs text-sky-200/70">
                <CheckCircle2 size={14} className="text-sky-400" />
                <span>Os dados acima são atualizados diariamente através da integração automática com o Tasy, recalculando a média móvel das últimas 12 semanas. Valores negativos indicam folga operacional em relação à média histórica.</span>
            </div>
        </div>
    );
}
