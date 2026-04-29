import React, { useEffect, useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, LabelList } from 'recharts';
import { TrendingUp, AlertTriangle, CheckCircle2, BarChart3 } from 'lucide-react';
import { useAuth } from '../../../shared/context/AuthContext';
import { readApiResponse } from '../../../shared/models/api';

const SHIFT_COLORS = {
    manha: '#2DE0B9',     // Teal
    tarde: '#E0B92D',     // Amber
    noite: '#38bdf8',     // Sky (Manteve azulado para noite)
    madrugada: '#64748b'  // Slate 500
};

const cardClass = 'overflow-hidden rounded-[2rem] border border-slate-700/40 bg-[#262a41]/60 p-8 shadow-2xl backdrop-blur-xl';

const ChartTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="rounded-xl border border-slate-700 bg-[#262a41]/95 px-4 py-3 text-xs shadow-2xl backdrop-blur-md">
            <p className="mb-2 font-black text-white uppercase tracking-widest border-b border-slate-700 pb-1">Dia {label}</p>
            {payload.map((item) => (
                <div key={item.dataKey} className="flex items-center gap-3 py-1">
                    <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="font-extrabold text-slate-400 uppercase text-[10px] tracking-tight">{item.name}:</span>
                    <span className="font-black text-[#2DE0B9] ml-auto">{item.value}</span>
                </div>
            ))}
            <div className="mt-2 border-t border-slate-800 pt-2 text-[9px] font-bold text-slate-500 uppercase tracking-widest">
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
    }, [session?.id, unitIds.join(','), month, year]);

    const stats = useMemo(() => {
        const total = data.history.reduce((acc, curr) => acc + curr.total, 0);
        const excesso = data.history.reduce((acc, curr) => acc + curr.total_excesso, 0);
        const diasComExcesso = data.history.filter(d => d.total_excesso > 0).length;
        return { total, excesso, diasComExcesso };
    }, [data.history]);

    if (loading) {
        return (
            <div className="flex h-64 flex-col items-center justify-center rounded-[2.5rem] bg-[#1e2030]/20 border border-slate-800/40 backdrop-blur-sm">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#2DE0B9] border-t-transparent mb-4" />
                <p className="text-slate-500 font-bold tracking-widest uppercase text-[10px]">Computando Tendências...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex items-center gap-6 rounded-[2.5rem] border border-rose-500/30 bg-rose-500/10 p-10 text-rose-200">
                <AlertTriangle size={32} />
                <div>
                    <h3 className="text-xl font-black">Houve um problema de conexão</h3>
                    <p className="text-rose-100/70">{error}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-10">
            {/* Cards de Resumo Analítico */}
            <div className="grid gap-6 sm:grid-cols-3">
                <div className="rounded-[2rem] border border-slate-700/40 bg-[#262a41]/60 p-8 transition-all hover:bg-[#262a41]/80 shadow-xl group border-l-4 border-l-[#2DE0B9]">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Demanda Bruta (30d)</p>
                    <div className="mt-3 flex items-baseline gap-2">
                        <span className="text-4xl font-black text-white leading-none tracking-tighter group-hover:text-[#2DE0B9] transition-colors">{stats.total}</span>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Atendimentos</span>
                    </div>
                </div>
                <div className="rounded-[2rem] border border-slate-700/40 bg-[#262a41]/60 p-8 transition-all hover:bg-[#262a41]/80 shadow-xl group border-l-4 border-l-[#E0B92D]">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Volume em Excesso</p>
                    <div className="mt-3 flex items-baseline gap-2">
                        <span className="text-4xl font-black text-[#E0B92D] leading-none tracking-tighter shadow-[#E0B92D]/20">{stats.excesso}</span>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Plantões Extra</span>
                    </div>
                </div>
                <div className="rounded-[2rem] border border-slate-700/40 bg-[#262a41]/60 p-8 transition-all hover:bg-[#262a41]/80 shadow-xl group border-l-4 border-l-rose-500">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Alertas de Sobrecarga</p>
                    <div className="mt-3 flex items-baseline gap-2">
                        <span className="text-4xl font-black text-rose-500 leading-none tracking-tighter">{stats.diasComExcesso}</span>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Dias Críticos</span>
                    </div>
                </div>
            </div>

            {/* TABELA 1: DEMANDA REAL */}
            <section className="space-y-6">
                <div className="flex items-center justify-between px-2">
                    <div className="flex items-center gap-4">
                        <div className="h-10 w-1.5 rounded-full bg-[#2DE0B9] shadow-[0_0_15px_rgba(45,224,185,0.4)]" />
                        <div>
                            <h3 className="text-2xl font-black text-white tracking-tight uppercase">Base Histórica Consolidada</h3>
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mt-1">Média de atendimentos diários sintonizada</p>
                        </div>
                    </div>
                </div>
                
                <div className={cardClass + " !p-0 overflow-hidden"}>
                    <div className="max-h-[520px] overflow-y-auto custom-scrollbar">
                        <table className="w-full text-left border-separate border-spacing-0">
                            <thead>
                                <tr className="sticky top-0 z-20 border-b border-slate-700/60 bg-slate-900 shadow-xl">
                                    <th className="sticky left-0 top-0 bg-slate-900 z-30 px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400">Calendário</th>
                                    <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500 text-center">Manhã</th>
                                    <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500 text-center">Tarde</th>
                                    <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500 text-center">Noite</th>
                                    <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500 text-center">Madrugada</th>
                                    <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-[#2DE0B9] text-right">Volume Dia</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/40">
                                {data.history.map((row, idx) => {
                                    const renderValMeta = (val, meta) => (
                                        <div className="flex flex-col items-center gap-0.5">
                                            <span className="text-[15px] font-black text-slate-100">{val || 0}</span>
                                            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-tighter">M: {meta || 0}</span>
                                        </div>
                                    );

                                    return (
                                        <tr key={idx} className="group hover:bg-white/[0.03] transition-colors">
                                            <td className="sticky left-0 bg-[#1e2030]/95 z-10 px-8 py-4 border-r border-slate-700/40">
                                                <span className="text-xs font-black text-slate-300 group-hover:text-[#2DE0B9] transition-colors uppercase tracking-widest">
                                                    {row.data.split('-').reverse().slice(0, 2).join(' / ')}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-center">{renderValMeta(row.manha, row.meta_manha)}</td>
                                            <td className="px-6 py-4 text-center">{renderValMeta(row.tarde, row.meta_tarde)}</td>
                                            <td className="px-6 py-4 text-center">{renderValMeta(row.noite, row.meta_noite)}</td>
                                            <td className="px-6 py-4 text-center">{renderValMeta(row.madrugada, row.meta_madrugada)}</td>
                                            <td className="px-8 py-4 text-right">
                                                <span className="px-4 py-1.5 rounded-xl bg-[#2DE0B9]/10 text-[#2DE0B9] text-xs font-black border border-[#2DE0B9]/20 shadow-sm">
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
            <section className="space-y-6">
                <div className="flex items-center gap-4 px-2">
                    <div className="h-10 w-1.5 rounded-full bg-[#E0B92D] shadow-[0_0_15px_rgba(224,185,45,0.4)]" />
                    <div>
                        <h3 className="text-2xl font-black text-white tracking-tight uppercase">Predicativo vs Médias Dinâmicas</h3>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mt-1">Diferença em relação à média móvel dinâmica de 90 dias</p>
                    </div>
                </div>

                <div className={cardClass + " !p-0 overflow-hidden"}>
                    <div className="max-h-[520px] overflow-y-auto custom-scrollbar">
                        <table className="w-full text-left border-separate border-spacing-0">
                            <thead>
                                <tr className="sticky top-0 z-20 border-b border-slate-700/60 bg-slate-900 shadow-xl">
                                    <th className="sticky left-0 top-0 bg-slate-900 z-30 px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400">Calendário</th>
                                    <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500 text-center">Δ Manhã</th>
                                    <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500 text-center">Δ Tarde</th>
                                    <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500 text-center">Δ Noite</th>
                                    <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500 text-center">Δ Madruga</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/40">
                                {data.history.map((row, idx) => {
                                    const renderDiff = (val) => {
                                        if (val === 0 || val === undefined) return <span className="text-slate-600 font-black">-</span>;
                                        const isPos = val > 0;
                                        return (
                                            <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-black ${isPos ? 'bg-[#2DE0B9]/15 text-[#2DE0B9] border border-[#2DE0B9]/30' : 'bg-[#E0B92D]/15 text-[#E0B92D] border border-[#E0B92D]/30'}`}>
                                                {isPos ? '↑' : '↓'} {Math.abs(val)}
                                            </div>
                                        );
                                    };

                                    return (
                                        <tr key={idx} className="group hover:bg-white/[0.03] transition-colors">
                                            <td className="sticky left-0 bg-[#1e2030]/95 z-10 px-8 py-4 border-r border-slate-700/40">
                                                <span className="text-xs font-black text-slate-300 group-hover:text-[#E0B92D] transition-colors uppercase tracking-widest">
                                                   {row.data.split('-').reverse().slice(0, 2).join(' / ')}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-center">{renderDiff(row.diff_manha)}</td>
                                            <td className="px-6 py-4 text-center">{renderDiff(row.diff_tarde)}</td>
                                            <td className="px-6 py-4 text-center">{renderDiff(row.diff_noite)}</td>
                                            <td className="px-6 py-4 text-center">{renderDiff(row.diff_madrugada)}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            </section>

            <div className="flex items-center gap-4 rounded-[2rem] border border-[#2DE0B9]/20 bg-[#2DE0B9]/5 p-8 text-xs text-slate-400">
                <div className="rounded-2xl bg-[#2DE0B9]/10 p-3 text-[#2DE0B9]">
                    <CheckCircle2 size={24} />
                </div>
                <p className="leading-relaxed font-medium">
                    <span className="font-black text-[#2DE0B9] uppercase mr-2">Inteligência Preditiva:</span>
                    Os dados acima são atualizados dinamicamente via integração Tasy, processando a média móvel das últimas 12 semanas. 
                    Valores em <span className="text-[#E0B92D] font-black uppercase">âmbar (↓)</span> sinalizam folga operacional, enquanto 
                    em <span className="text-[#2DE0B9] font-black uppercase">teal (↑)</span> representam sobrecarga acima da média histórica.
                </p>
            </div>
        </div>
    );
}
