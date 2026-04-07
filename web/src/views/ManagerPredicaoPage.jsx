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

    useEffect(() => {
        if (!session?.id) return;

        let cancelled = false;
        (async () => {
            setLoading(true);
            setError('');
            try {
                const params = new URLSearchParams();
                params.set('gestorId', session.id);
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
    }, [session?.id, unitIds]);

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
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Cards de Resumo Analítico */}
            <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-[2rem] border border-slate-700/50 bg-slate-900/40 p-6 backdrop-blur-md">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Demanda Total (30d)</p>
                    <div className="mt-2 flex items-baseline gap-2">
                        <span className="text-3xl font-black text-white">{stats.total}</span>
                        <span className="text-xs text-slate-400">atendimentos</span>
                    </div>
                </div>
                <div className="rounded-[2rem] border border-slate-700/50 bg-slate-900/40 p-6 backdrop-blur-md">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Volume Extra (Acima Meta)</p>
                    <div className="mt-2 flex items-baseline gap-2">
                        <span className="text-3xl font-black text-rose-400">{stats.excesso}</span>
                        <span className="text-xs text-slate-400">atendimentos</span>
                    </div>
                </div>
                <div className="rounded-[2rem] border border-slate-700/50 bg-slate-900/40 p-6 backdrop-blur-md">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Frequência de Sobrecarga</p>
                    <div className="mt-2 flex items-baseline gap-2">
                        <span className="text-3xl font-black text-amber-400">{stats.diasComExcesso}</span>
                        <span className="text-xs text-slate-400">dias afetados</span>
                    </div>
                </div>
            </div>

            {/* SEÇÃO 1: DEMANDA TOTAL */}
            <div className="space-y-6">
                <div className="flex items-center gap-3">
                    <div className="h-8 w-1 rounded-full bg-sky-500" />
                    <div>
                        <h3 className="text-xl font-black text-white">Demanda Real por Turno</h3>
                        <p className="text-xs text-slate-400">Volume total de atendimentos realizados nos últimos 30 dias.</p>
                    </div>
                </div>

                <div className="flex flex-col gap-8">
                    <section className={cardClass}>
                        <div className="mb-4 flex items-center justify-between">
                            <span className="text-sm font-black uppercase tracking-widest text-sky-400">1ª Quinzena (Dia 1-15)</span>
                        </div>
                        <div className="h-[500px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={q1Data} margin={{ top: 20, right: 10, left: 10, bottom: 0 }} barCategoryGap="45%" barGap={2}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={true} />
                                    <XAxis dataKey="dia" stroke="#64748b" tick={{ fontSize: 13, fontWeight: 700 }} />
                                    <YAxis stroke="#64748b" tick={{ fontSize: 13, fontWeight: 700 }} domain={[0, data.limits?.maxDemanda || 'auto']} />
                                    <Tooltip content={ChartTooltip} />
                                    <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />
                                    <Bar dataKey="manha" name="Manhã" stackId="a" fill={SHIFT_COLORS.manha} minPointSize={10}>
                                        <LabelList dataKey="manha" position="center" fill="#fff" fontSize={15} fontWeight={900} display={val => val > 0 ? 'block' : 'none'} />
                                    </Bar>
                                    <Bar dataKey="tarde" name="Tarde" stackId="a" fill={SHIFT_COLORS.tarde} minPointSize={10}>
                                        <LabelList dataKey="tarde" position="center" fill="#fff" fontSize={15} fontWeight={900} display={val => val > 0 ? 'block' : 'none'} />
                                    </Bar>
                                    <Bar dataKey="noite" name="Noite" stackId="a" fill={SHIFT_COLORS.noite} minPointSize={10}>
                                        <LabelList dataKey="noite" position="center" fill="#fff" fontSize={15} fontWeight={900} display={val => val > 0 ? 'block' : 'none'} />
                                    </Bar>
                                    <Bar dataKey="madrugada" name="Madrugada" stackId="a" fill={SHIFT_COLORS.madrugada} radius={[4, 4, 0, 0]} minPointSize={10}>
                                        <LabelList dataKey="madrugada" position="center" fill="#fff" fontSize={15} fontWeight={900} display={val => val > 0 ? 'block' : 'none'} />
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </section>

                    <section className={cardClass}>
                        <div className="mb-4 flex items-center justify-between">
                            <span className="text-sm font-black uppercase tracking-widest text-sky-400">2ª Quinzena (Dia 16+)</span>
                        </div>
                        <div className="h-[500px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={q2Data} margin={{ top: 20, right: 10, left: 10, bottom: 0 }} barCategoryGap="45%" barGap={4}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={true} />
                                    <XAxis dataKey="dia" stroke="#64748b" tick={{ fontSize: 13, fontWeight: 700 }} />
                                    <YAxis stroke="#64748b" tick={{ fontSize: 13, fontWeight: 700 }} domain={[0, data.limits?.maxDemanda || 'auto']} />
                                    <Tooltip content={ChartTooltip} />
                                    <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />
                                    <Bar dataKey="manha" name="Manhã" stackId="a" fill={SHIFT_COLORS.manha} minPointSize={10}>
                                        <LabelList dataKey="manha" position="center" fill="#fff" fontSize={15} fontWeight={900} display={val => val > 0 ? 'block' : 'none'} />
                                    </Bar>
                                    <Bar dataKey="tarde" name="Tarde" stackId="a" fill={SHIFT_COLORS.tarde} minPointSize={10}>
                                        <LabelList dataKey="tarde" position="center" fill="#fff" fontSize={15} fontWeight={900} display={val => val > 0 ? 'block' : 'none'} />
                                    </Bar>
                                    <Bar dataKey="noite" name="Noite" stackId="a" fill={SHIFT_COLORS.noite} minPointSize={10}>
                                        <LabelList dataKey="noite" position="center" fill="#fff" fontSize={15} fontWeight={900} display={val => val > 0 ? 'block' : 'none'} />
                                    </Bar>
                                    <Bar dataKey="madrugada" name="Madrugada" stackId="a" fill={SHIFT_COLORS.madrugada} radius={[4, 4, 0, 0]} minPointSize={10}>
                                        <LabelList dataKey="madrugada" position="center" fill="#fff" fontSize={15} fontWeight={900} display={val => val > 0 ? 'block' : 'none'} />
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </section>
                </div>
            </div>

            {/* SEÇÃO 2: EXTRAPOLAÇÃO (Gráfico Espelho) */}
            <div className="space-y-6">
                <div className="flex items-center gap-3">
                    <div className="h-8 w-1 rounded-full bg-rose-500" />
                    <div>
                        <h3 className="text-xl font-black text-rose-100">Atendimentos Fora da Meta</h3>
                        <p className="text-xs text-slate-400">Volume que excedeu o padrão histórico preditivo (Média Móvel Dinâmica).</p>
                    </div>
                </div>

                <div className="flex flex-col gap-8">
                    <section className={cardClass}>
                        <div className="mb-4 flex items-center justify-between">
                            <span className="text-sm font-black uppercase tracking-widest text-rose-400">Extrapolação 1ª Quinzena</span>
                        </div>
                        <div className="h-[500px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={q1Data} margin={{ top: 20, right: 10, left: 10, bottom: 0 }} barCategoryGap="45%" barGap={2}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={true} />
                                    <XAxis dataKey="dia" stroke="#64748b" tick={{ fontSize: 13, fontWeight: 700 }} />
                                    <YAxis stroke="#64748b" tick={{ fontSize: 13, fontWeight: 700 }} domain={[0, data.limits?.maxExcesso || 'auto']} />
                                    <Tooltip content={ChartTooltip} />
                                    <Bar dataKey="excesso_manha" name="Excesso Manhã" fill={SHIFT_COLORS.manha} minPointSize={8}>
                                        <LabelList dataKey="excesso_manha" position="top" fill="#bae6fd" fontSize={11} fontWeight={900} display={val => val > 0 ? 'block' : 'none'} />
                                    </Bar>
                                    <Bar dataKey="excesso_tarde" name="Excesso Tarde" fill={SHIFT_COLORS.tarde} minPointSize={8}>
                                        <LabelList dataKey="excesso_tarde" position="top" fill="#fde68a" fontSize={11} fontWeight={900} display={val => val > 0 ? 'block' : 'none'} />
                                    </Bar>
                                    <Bar dataKey="excesso_noite" name="Excesso Noite" fill={SHIFT_COLORS.noite} minPointSize={8}>
                                        <LabelList dataKey="excesso_noite" position="top" fill="#ddd6fe" fontSize={11} fontWeight={900} display={val => val > 0 ? 'block' : 'none'} />
                                    </Bar>
                                    <Bar dataKey="excesso_madrugada" name="Excesso Madrugada" fill={SHIFT_COLORS.madrugada} radius={[4, 4, 0, 0]} minPointSize={8}>
                                        <LabelList dataKey="excesso_madrugada" position="top" fill="#e2e8f0" fontSize={11} fontWeight={900} display={val => val > 0 ? 'block' : 'none'} />
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </section>

                    <section className={cardClass}>
                        <div className="mb-4 flex items-center justify-between">
                            <span className="text-sm font-black uppercase tracking-widest text-rose-400">Extrapolação 2ª Quinzena</span>
                        </div>
                        <div className="h-[500px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={q2Data} margin={{ top: 20, right: 10, left: 10, bottom: 0 }} barCategoryGap="45%" barGap={4}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={true} />
                                    <XAxis dataKey="dia" stroke="#64748b" tick={{ fontSize: 13, fontWeight: 700 }} />
                                    <YAxis stroke="#64748b" tick={{ fontSize: 13, fontWeight: 700 }} domain={[0, data.limits?.maxExcesso || 'auto']} />
                                    <Tooltip content={ChartTooltip} />
                                    <Bar dataKey="excesso_manha" name="Excesso Manhã" fill={SHIFT_COLORS.manha} minPointSize={8}>
                                        <LabelList dataKey="excesso_manha" position="top" fill="#bae6fd" fontSize={11} fontWeight={900} display={val => val > 0 ? 'block' : 'none'} />
                                    </Bar>
                                    <Bar dataKey="excesso_tarde" name="Excesso Tarde" fill={SHIFT_COLORS.tarde} minPointSize={8}>
                                        <LabelList dataKey="excesso_tarde" position="top" fill="#fde68a" fontSize={11} fontWeight={900} display={val => val > 0 ? 'block' : 'none'} />
                                    </Bar>
                                    <Bar dataKey="excesso_noite" name="Excesso Noite" fill={SHIFT_COLORS.noite} minPointSize={8}>
                                        <LabelList dataKey="excesso_noite" position="top" fill="#ddd6fe" fontSize={11} fontWeight={900} display={val => val > 0 ? 'block' : 'none'} />
                                    </Bar>
                                    <Bar dataKey="excesso_madrugada" name="Excesso Madrugada" fill={SHIFT_COLORS.madrugada} radius={[4, 4, 0, 0]} minPointSize={8}>
                                        <LabelList dataKey="excesso_madrugada" position="top" fill="#e2e8f0" fontSize={11} fontWeight={900} display={val => val > 0 ? 'block' : 'none'} />
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </section>
                </div>
            </div>

            <div className="flex items-center gap-2 rounded-2xl border border-sky-500/20 bg-sky-500/5 p-4 text-xs text-sky-200/70">
                <CheckCircle2 size={14} className="text-sky-400" />
                <span>Os dados acima são atualizados diariamente através da integração automática com o Tasy, recalculando a média móvel das últimas 12 semanas.</span>
            </div>
        </div>
    );
}
