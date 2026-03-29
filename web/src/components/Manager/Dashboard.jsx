import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LabelList } from 'recharts';
import { Calendar, ChevronLeft, ChevronRight, Activity, Users, MapPin, Globe } from 'lucide-react';

const shiftMonth = (month, delta) => {
    const [year, monthIndex] = month.split('-').map(Number);
    const date = new Date(Date.UTC(year, monthIndex - 1 + delta, 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
};

const formatMonthHeader = (month) => {
    const date = new Date(`${month}-01T12:00:00-03:00`);
    return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(date);
};

export default function ManagerDashboard() {
    const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
    const [selectedUnit, setSelectedUnit] = useState('all');
    const [units, setUnits] = useState([]);
    
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // Fetch master unit list
    useEffect(() => {
        const fetchUnits = async () => {
            try {
                const res = await fetch('/api/manager/unidades');
                if (res.ok) setUnits(await res.json());
            } catch {}
        };
        fetchUnits();
    }, []);

    // Fetch dashboard charts data
    useEffect(() => {
        const fetchMetrics = async () => {
            setLoading(true);
            setError('');
            try {
                const unitParam = selectedUnit !== 'all' ? `&unidadeId=${selectedUnit}` : '';
                const response = await fetch(`/api/manager/dashboard?month=${month}${unitParam}`);
                const result = await response.json();
                
                if (!response.ok) throw new Error(result.error || 'Falha ao buscar dados');
                
                setData(result);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchMetrics();
    }, [month, selectedUnit]);

    const chartVacanciesQ1 = data?.vacancies?.q1 || [];
    const chartVacanciesQ2 = data?.vacancies?.q2 || [];
    const chartDemandsQ1   = data?.demands?.q1 || [];
    const chartDemandsQ2   = data?.demands?.q2 || [];

    const CustomTooltip = ({ active, payload, label }) => {
        if (active && payload && payload.length) {
            return (
                <div className="rounded-xl border border-slate-700 bg-slate-900/95 p-4 shadow-xl">
                    <p className="mb-2 font-black text-white">Dia {label}</p>
                    {payload.map((entry, index) => (
                        <div key={index} className="flex items-center gap-2 text-sm">
                            <div className="h-3 w-3 rounded-sm" style={{ backgroundColor: entry.color }} />
                            <span className="text-slate-300">{entry.name}:</span>
                            <span className="font-bold text-white">{entry.value}</span>
                        </div>
                    ))}
                </div>
            );
        }
        return null;
    };

    return (
        <div className="animate-in fade-in zoom-in-95 duration-500 pb-10">
            <div className="flex flex-col xl:flex-row gap-10">
                {/* Lateral Menu - Unidades */}
                <aside className="xl:w-64 shrink-0 flex flex-col gap-2">
                    <div className="mb-2 border-b border-slate-800 pb-4">
                        <h3 className="flex items-center gap-2 font-black text-white">
                            <MapPin size={18} className="text-emerald-400" />
                            Unidades
                        </h3>
                        <p className="mt-1 text-xs text-slate-400">Filtrar abrangência dos gráficos.</p>
                    </div>

                    <button
                        onClick={() => setSelectedUnit('all')}
                        className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition-all ${
                            selectedUnit === 'all'
                                ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-400/20 shadow-[0_0_15px_rgba(16,185,129,0.1)]'
                                : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200 border border-transparent'
                        }`}
                    >
                        <Globe size={18} />
                        Visão Nacional (Geral)
                    </button>

                    <div className="flex flex-col gap-1 overflow-y-auto max-h-[600px] pr-2 custom-scrollbar">
                        {units.map((unit) => (
                            <button
                                key={unit.id}
                                onClick={() => setSelectedUnit(unit.id)}
                                className={`flex items-center justify-between gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition-all ${
                                    selectedUnit === unit.id
                                        ? 'bg-sky-500/10 text-sky-300 border border-sky-400/20 shadow-[0_0_15px_rgba(56,189,248,0.1)]'
                                        : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200 border border-transparent'
                                }`}
                            >
                                <span className="truncate text-left">{unit.nome}</span>
                                {selectedUnit === unit.id && <div className="h-2 w-2 rounded-full bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.8)]" />}
                            </button>
                        ))}
                    </div>
                </aside>

                {/* Main Dashboard Area */}
                <div className="flex-1 flex flex-col min-w-0">
                    {/* Header / Month Selector */}
                    <div className="mb-8 flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
                        <div>
                            <h2 className="text-3xl font-black text-white">
                                {selectedUnit === 'all' ? 'Análise Nacional' : 'Análise de Unidade'}
                            </h2>
                            <p className="mt-2 text-sm text-slate-400">Acompanhamento da ocupação e dos turnos dia-a-dia.</p>
                        </div>

                        <div className="flex items-center gap-2 rounded-[2rem] border border-slate-800 bg-slate-900/60 p-2 shadow-inner">
                            <button
                                onClick={() => setMonth(m => shiftMonth(m, -1))}
                                className="rounded-full p-2 text-slate-400 transition hover:bg-slate-800 hover:text-white"
                            >
                                <ChevronLeft size={20} />
                            </button>
                            <div className="flex min-w-40 items-center justify-center gap-2 font-bold capitalize text-white">
                                <Calendar size={16} className="text-sky-400" />
                                {formatMonthHeader(month)}
                            </div>
                            <button
                                onClick={() => setMonth(m => shiftMonth(m, 1))}
                                className="rounded-full p-2 text-slate-400 transition hover:bg-slate-800 hover:text-white"
                            >
                                <ChevronRight size={20} />
                            </button>
                        </div>
                    </div>

                    {loading ? (
                        <div className="flex h-[400px] items-center justify-center rounded-3xl border border-slate-800 bg-slate-900/40">
                            <div className="h-8 w-8 animate-spin rounded-full border-4 border-sky-500 border-t-transparent shadow-[0_0_15px_rgba(56,189,248,0.5)]"></div>
                        </div>
                    ) : error ? (
                        <div className="rounded-3xl border border-rose-500/20 bg-rose-500/10 p-6 text-center text-rose-200">
                            {error}
                        </div>
                    ) : (
                        <div className="flex flex-col gap-10 min-w-0">
                            {/* CHART 1: Vagas Q1 */}
                            <div className="flex flex-col rounded-[2rem] border border-slate-800 bg-slate-900/80 p-6 shadow-2xl transition-all duration-700 hover:scale-[1.01] hover:border-slate-700 animate-in slide-in-from-bottom-5">
                                <div className="mb-6 flex items-center gap-3">
                                    <div className="rounded-xl bg-emerald-500/10 p-3 text-emerald-400">
                                        <Users size={24} />
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-bold text-white">Ocupação Diária (1ª Quinzena)</h3>
                                        <p className="text-xs uppercase tracking-wider text-slate-500">Dias 01 a 15 - Disponíveis vs Ocupadas</p>
                                    </div>
                                </div>
                                <div className="h-[350px] w-full min-w-0">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={chartVacanciesQ1} margin={{ top: 20, right: 10, left: -20, bottom: 5 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                                            <XAxis dataKey="dia" stroke="#64748b" tick={{ fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                                            <YAxis stroke="#64748b" tick={{ fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                                            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(51, 65, 85, 0.2)' }} />
                                            <Legend wrapperStyle={{ paddingTop: '20px' }} />
                                            <Bar dataKey="Disponíveis" fill="#34d399" radius={[4, 4, 0, 0]}>
                                                <LabelList dataKey="Disponíveis" position="top" fill="#94a3b8" fontSize={11} fontWeight="bold" />
                                            </Bar>
                                            <Bar dataKey="Ocupadas" fill="#60a5fa" radius={[4, 4, 0, 0]}>
                                                <LabelList dataKey="Ocupadas" position="top" fill="#94a3b8" fontSize={11} fontWeight="bold" />
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            {/* CHART 2: Vagas Q2 */}
                            <div className="flex flex-col rounded-[2rem] border border-slate-800 bg-slate-900/80 p-6 shadow-2xl transition-all duration-700 hover:scale-[1.01] hover:border-slate-700 animate-in slide-in-from-bottom-10">
                                <div className="mb-6 flex items-center gap-3">
                                    <div className="rounded-xl bg-emerald-500/10 p-3 text-emerald-400">
                                        <Users size={24} />
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-bold text-white">Ocupação Diária (2ª Quinzena)</h3>
                                        <p className="text-xs uppercase tracking-wider text-slate-500">Dias 16 até o fim do mês</p>
                                    </div>
                                </div>
                                <div className="h-[350px] w-full min-w-0">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={chartVacanciesQ2} margin={{ top: 20, right: 10, left: -20, bottom: 5 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                                            <XAxis dataKey="dia" stroke="#64748b" tick={{ fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                                            <YAxis stroke="#64748b" tick={{ fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                                            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(51, 65, 85, 0.2)' }} />
                                            <Legend wrapperStyle={{ paddingTop: '20px' }} />
                                            <Bar dataKey="Disponíveis" fill="#34d399" radius={[4, 4, 0, 0]}>
                                                <LabelList dataKey="Disponíveis" position="top" fill="#94a3b8" fontSize={11} fontWeight="bold" />
                                            </Bar>
                                            <Bar dataKey="Ocupadas" fill="#60a5fa" radius={[4, 4, 0, 0]}>
                                                <LabelList dataKey="Ocupadas" position="top" fill="#94a3b8" fontSize={11} fontWeight="bold" />
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            {/* CHART 3: Demanda Q1 (Stacked) */}
                            <div className="flex flex-col rounded-[2rem] border border-slate-800 bg-slate-900/80 p-6 shadow-2xl transition-all duration-700 hover:scale-[1.01] hover:border-slate-700 animate-in slide-in-from-bottom-10">
                                <div className="mb-6 flex items-center gap-3">
                                    <div className="rounded-xl bg-amber-500/10 p-3 text-amber-400">
                                        <Activity size={24} />
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-bold text-white">Demanda Projetada (1ª Quinzena)</h3>
                                        <p className="text-xs uppercase tracking-wider text-slate-500">Previsão por Turno (Dias 01 a 15)</p>
                                    </div>
                                </div>
                                <div className="h-[350px] w-full min-w-0">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={chartDemandsQ1} margin={{ top: 20, right: 10, left: -20, bottom: 5 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                                            <XAxis dataKey="dia" stroke="#64748b" tick={{ fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                                            <YAxis stroke="#64748b" tick={{ fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                                            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(51, 65, 85, 0.2)' }} />
                                            <Legend wrapperStyle={{ paddingTop: '20px' }} />
                                            <Bar dataKey="Manhã" stackId="a" fill="#fbbf24" radius={[0, 0, 4, 4]}>
                                                <LabelList dataKey="Manhã" position="center" fill="#78350f" fontSize={11} fontWeight="black" formatter={(val) => (val > 0 ? val : '')} />
                                            </Bar>
                                            <Bar dataKey="Tarde" stackId="a" fill="#f97316">
                                                <LabelList dataKey="Tarde" position="center" fill="#7c2d12" fontSize={11} fontWeight="black" formatter={(val) => (val > 0 ? val : '')} />
                                            </Bar>
                                            <Bar dataKey="Noite" stackId="a" fill="#6366f1">
                                                <LabelList dataKey="Noite" position="center" fill="#e0e7ff" fontSize={11} fontWeight="black" formatter={(val) => (val > 0 ? val : '')} />
                                            </Bar>
                                            <Bar dataKey="Madrugada" stackId="a" fill="#a855f7" radius={[4, 4, 0, 0]}>
                                                <LabelList dataKey="Madrugada" position="center" fill="#fae8ff" fontSize={11} fontWeight="black" formatter={(val) => (val > 0 ? val : '')} />
                                            </Bar>
                                            <Bar dataKey="Geral" stackId="a" fill="#94a3b8">
                                                <LabelList dataKey="Geral" position="center" fill="#0f172a" fontSize={11} fontWeight="black" formatter={(val) => (val > 0 ? val : '')} />
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            {/* CHART 4: Demanda Q2 (Stacked) */}
                            <div className="flex flex-col rounded-[2rem] border border-slate-800 bg-slate-900/80 p-6 shadow-2xl transition-all duration-700 hover:scale-[1.01] hover:border-slate-700 animate-in slide-in-from-bottom-10">
                                <div className="mb-6 flex items-center gap-3">
                                    <div className="rounded-xl bg-amber-500/10 p-3 text-amber-400">
                                        <Activity size={24} />
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-bold text-white">Demanda Projetada (2ª Quinzena)</h3>
                                        <p className="text-xs uppercase tracking-wider text-slate-500">Previsão por Turno (Dias 16 ao fim do mês)</p>
                                    </div>
                                </div>
                                <div className="h-[350px] w-full min-w-0">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={chartDemandsQ2} margin={{ top: 20, right: 10, left: -20, bottom: 5 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                                            <XAxis dataKey="dia" stroke="#64748b" tick={{ fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                                            <YAxis stroke="#64748b" tick={{ fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                                            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(51, 65, 85, 0.2)' }} />
                                            <Legend wrapperStyle={{ paddingTop: '20px' }} />
                                            <Bar dataKey="Manhã" stackId="a" fill="#fbbf24" radius={[0, 0, 4, 4]}>
                                                <LabelList dataKey="Manhã" position="center" fill="#78350f" fontSize={11} fontWeight="black" formatter={(val) => (val > 0 ? val : '')} />
                                            </Bar>
                                            <Bar dataKey="Tarde" stackId="a" fill="#f97316">
                                                <LabelList dataKey="Tarde" position="center" fill="#7c2d12" fontSize={11} fontWeight="black" formatter={(val) => (val > 0 ? val : '')} />
                                            </Bar>
                                            <Bar dataKey="Noite" stackId="a" fill="#6366f1">
                                                <LabelList dataKey="Noite" position="center" fill="#e0e7ff" fontSize={11} fontWeight="black" formatter={(val) => (val > 0 ? val : '')} />
                                            </Bar>
                                            <Bar dataKey="Madrugada" stackId="a" fill="#a855f7" radius={[4, 4, 0, 0]}>
                                                <LabelList dataKey="Madrugada" position="center" fill="#fae8ff" fontSize={11} fontWeight="black" formatter={(val) => (val > 0 ? val : '')} />
                                            </Bar>
                                            <Bar dataKey="Geral" stackId="a" fill="#94a3b8">
                                                <LabelList dataKey="Geral" position="center" fill="#0f172a" fontSize={11} fontWeight="black" formatter={(val) => (val > 0 ? val : '')} />
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
