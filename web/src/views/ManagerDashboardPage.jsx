import React, { useEffect, useMemo, useState } from 'react';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, LabelList } from 'recharts';
import { BarChart3, CalendarDays, PieChart as PieIcon, Users } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { readApiResponse } from '../utils/api';

const PIE_COLORS = ['#22c55e', '#f59e0b'];

const MONTHS = [
    { value: '01', label: 'Janeiro' },
    { value: '02', label: 'Fevereiro' },
    { value: '03', label: 'Março' },
    { value: '04', label: 'Abril' },
    { value: '05', label: 'Maio' },
    { value: '06', label: 'Junho' },
    { value: '07', label: 'Julho' },
    { value: '08', label: 'Agosto' },
    { value: '09', label: 'Setembro' },
    { value: '10', label: 'Outubro' },
    { value: '11', label: 'Novembro' },
    { value: '12', label: 'Dezembro' }
];

const cardClass =
    'overflow-hidden rounded-[2rem] border border-slate-700/70 bg-[linear-gradient(150deg,rgba(15,23,42,0.95),rgba(2,6,23,0.92))] p-6 shadow-[0_24px_70px_-28px_rgba(15,23,42,0.9)]';

const metricClass =
    'rounded-2xl border border-slate-700/70 bg-slate-900/60 px-4 py-3 backdrop-blur-sm';

const ChartTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    const title = label ?? payload?.[0]?.name ?? 'Detalhes';
    return (
        <div className="rounded-xl border border-slate-700 bg-slate-900/95 px-3 py-2 text-xs shadow-xl">
            <p className="mb-1 font-black text-white">{title}</p>
            {payload.map((item) => (
                <div key={item.dataKey} className="flex items-center gap-2 text-slate-300">
                    <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
                    <span>{item.name}:</span>
                    <span className="font-black text-white">{item.value}</span>
                </div>
            ))}
        </div>
    );
};

export default function ManagerDashboardPage() {
    const { session } = useAuth();
    const now = useMemo(() => new Date(), []);
    const [selectedMonth, setSelectedMonth] = useState(() => String(now.getMonth() + 1).padStart(2, '0'));
    const [selectedYear, setSelectedYear] = useState(() => String(now.getFullYear()));
    const [selectedUnit, setSelectedUnit] = useState('all');
    const [units, setUnits] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [data, setData] = useState({
        acceptedByQuinzena: { q1: [], q2: [] },
        occupancyBreakdown: [],
        topDoctorsByUnit: []
    });

    const month = `${selectedYear}-${selectedMonth}`;
    const yearOptions = useMemo(() => {
        const current = now.getFullYear();
        const options = [];
        for (let y = current - 3; y <= current + 3; y += 1) options.push(String(y));
        return options;
    }, [now]);

    const totalAlocados = useMemo(
        () => (data.acceptedByQuinzena?.q1 || []).reduce((sum, row) => sum + (row.totalOcupadas || 0), 0) +
            (data.acceptedByQuinzena?.q2 || []).reduce((sum, row) => sum + (row.totalOcupadas || 0), 0),
        [data.acceptedByQuinzena?.q1, data.acceptedByQuinzena?.q2]
    );
    const totalVazias = useMemo(
        () => (data.acceptedByQuinzena?.q1 || []).reduce((sum, row) => sum + (row.totalVazias || 0), 0) +
            (data.acceptedByQuinzena?.q2 || []).reduce((sum, row) => sum + (row.totalVazias || 0), 0),
        [data.acceptedByQuinzena?.q1, data.acceptedByQuinzena?.q2]
    );
    const totalAceitasQ1 = useMemo(
        () => (data.acceptedByQuinzena?.q1 || []).reduce((sum, row) => sum + (row.totalOcupadas || 0), 0),
        [data.acceptedByQuinzena?.q1]
    );
    const totalAceitasQ2 = useMemo(
        () => (data.acceptedByQuinzena?.q2 || []).reduce((sum, row) => sum + (row.totalOcupadas || 0), 0),
        [data.acceptedByQuinzena?.q2]
    );

    useEffect(() => {
        const gestorId = session?.id;
        if (!gestorId) return;

        let cancelled = false;
        (async () => {
            setLoading(true);
            setError('');
            try {
                const unitQuery = selectedUnit !== 'all' ? `&unidadeId=${encodeURIComponent(selectedUnit)}` : '';
                const response = await fetch(`/api/manager/dashboard-summary?month=${encodeURIComponent(month)}&gestorId=${encodeURIComponent(gestorId)}${unitQuery}`);
                const payload = await readApiResponse(response);
                if (!response.ok) throw new Error(payload.error || payload.details || 'Falha ao carregar dashboard.');
                if (!cancelled) setData(payload);
            } catch (err) {
                if (!cancelled) setError(err.message);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [month, selectedUnit, session?.id]);

    useEffect(() => {
        const gestorId = session?.id;
        if (!gestorId) return;
        let cancelled = false;
        (async () => {
            try {
                const response = await fetch(`/api/manager/unidades?gestorId=${encodeURIComponent(gestorId)}`);
                const payload = await readApiResponse(response);
                if (!response.ok) throw new Error(payload.error || payload.details || 'Falha ao carregar unidades.');
                if (!cancelled) setUnits(Array.isArray(payload) ? payload : []);
            } catch {
                if (!cancelled) setUnits([]);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [session?.id]);

    return (
        <div className="animate-in fade-in duration-500 space-y-6">
            <div className="relative overflow-hidden rounded-[2rem] border border-slate-700/70 bg-[radial-gradient(circle_at_0%_0%,rgba(14,165,233,0.24),transparent_45%),radial-gradient(circle_at_100%_100%,rgba(16,185,129,0.18),transparent_35%),linear-gradient(160deg,#020617_0%,#0f172a_55%,#111827_100%)] p-6">
                <div className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full bg-sky-500/10 blur-3xl" />
                <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <p className="text-[11px] font-black uppercase tracking-[0.25em] text-sky-300/80">Monitoramento</p>
                        <h2 className="mt-2 text-3xl font-black text-white md:text-4xl">Dashboards de Escala</h2>
                        <p className="mt-2 text-sm text-slate-300">Visão mensal de alocação e cobertura das escalas por unidade.</p>
                    </div>
                    <div className="grid w-full max-w-3xl gap-3 sm:grid-cols-3">
                        <div>
                            <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">Mês</label>
                            <div className="relative">
                                <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sky-400" />
                                <select
                                    value={selectedMonth}
                                    onChange={(e) => setSelectedMonth(e.target.value)}
                                    className="w-full rounded-2xl border border-slate-700 bg-slate-950/90 py-3 pl-10 pr-4 text-sm font-bold text-white outline-none transition focus:border-sky-400 focus:shadow-[0_0_0_3px_rgba(14,165,233,0.2)]"
                                >
                                    {MONTHS.map((m) => (
                                        <option key={m.value} value={m.value}>
                                            {m.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div>
                            <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">Ano</label>
                            <select
                                value={selectedYear}
                                onChange={(e) => setSelectedYear(e.target.value)}
                                className="w-full rounded-2xl border border-slate-700 bg-slate-950/90 py-3 px-4 text-sm font-bold text-white outline-none transition focus:border-sky-400 focus:shadow-[0_0_0_3px_rgba(14,165,233,0.2)]"
                            >
                                {yearOptions.map((year) => (
                                    <option key={year} value={year}>
                                        {year}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">Unidade</label>
                            <select
                                value={selectedUnit}
                                onChange={(e) => setSelectedUnit(e.target.value)}
                                className="w-full rounded-2xl border border-slate-700 bg-slate-950/90 py-3 px-4 text-sm font-bold text-white outline-none transition focus:border-sky-400 focus:shadow-[0_0_0_3px_rgba(14,165,233,0.2)]"
                            >
                                <option value="all">Todas as unidades</option>
                                {units.map((unit) => (
                                    <option key={unit.id} value={unit.id}>
                                        {unit.nome}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <div className={metricClass}>
                        <p className="text-[10px] uppercase tracking-widest text-slate-400">Ocupadas 1ª quinzena</p>
                        <p className="mt-1 text-2xl font-black text-sky-300">{totalAceitasQ1}</p>
                    </div>
                    <div className={metricClass}>
                        <p className="text-[10px] uppercase tracking-widest text-slate-400">Ocupadas 2ª quinzena</p>
                        <p className="mt-1 text-2xl font-black text-emerald-300">{totalAceitasQ2}</p>
                    </div>
                    <div className={metricClass}>
                        <p className="text-[10px] uppercase tracking-widest text-slate-400">Escalas ocupadas</p>
                        <p className="mt-1 text-2xl font-black text-fuchsia-300">{totalAlocados}</p>
                    </div>
                    <div className={metricClass}>
                        <p className="text-[10px] uppercase tracking-widest text-slate-400">Escalas vazias</p>
                        <p className="mt-1 text-2xl font-black text-amber-300">{totalVazias}</p>
                    </div>
                </div>
            </div>

            {error ? <div className="mb-6 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</div> : null}

            {loading ? (
                <div className="flex h-64 items-center justify-center rounded-3xl border border-slate-800 bg-slate-900/40">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-sky-500 border-t-transparent" />
                </div>
            ) : (
                <div className="grid gap-6">
                    <div className="grid gap-6 xl:grid-cols-2">
                        <section className={cardClass}>
                            <div className="mb-4 flex items-center gap-2 text-white">
                                <BarChart3 size={18} className="text-sky-400" />
                                <h3 className="text-lg font-black">Escalas Ocupadas x Vazias - 1ª quinzena</h3>
                            </div>
                            <div className="h-[22rem]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={data.acceptedByQuinzena?.q1 || []} margin={{ top: 18, right: 10, left: 4, bottom: 56 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                                        <XAxis
                                            dataKey="unidade"
                                            stroke="#94a3b8"
                                            tick={{ fontSize: 9, fill: '#94a3b8' }}
                                            angle={-28}
                                            textAnchor="end"
                                            height={78}
                                            interval={0}
                                            tickMargin={8}
                                        />
                                        <YAxis stroke="#94a3b8" />
                                        <Tooltip content={<ChartTooltip />} />
                                        <Legend />
                                        <Bar dataKey="totalOcupadas" fill="#38bdf8" name="Ocupadas" radius={[6, 6, 0, 0]}>
                                            <LabelList dataKey="totalOcupadas" position="top" fill="#bae6fd" fontSize={11} fontWeight={800} />
                                        </Bar>
                                        <Bar dataKey="totalVazias" fill="#f59e0b" name="Vazias" radius={[6, 6, 0, 0]}>
                                            <LabelList dataKey="totalVazias" position="top" fill="#fde68a" fontSize={11} fontWeight={800} />
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </section>

                        <section className={cardClass}>
                            <div className="mb-4 flex items-center gap-2 text-white">
                                <BarChart3 size={18} className="text-emerald-400" />
                                <h3 className="text-lg font-black">Escalas Ocupadas x Vazias - 2ª quinzena</h3>
                            </div>
                            <div className="h-[22rem]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={data.acceptedByQuinzena?.q2 || []} margin={{ top: 18, right: 10, left: 4, bottom: 56 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                                        <XAxis
                                            dataKey="unidade"
                                            stroke="#94a3b8"
                                            tick={{ fontSize: 9, fill: '#94a3b8' }}
                                            angle={-28}
                                            textAnchor="end"
                                            height={78}
                                            interval={0}
                                            tickMargin={8}
                                        />
                                        <YAxis stroke="#94a3b8" />
                                        <Tooltip content={<ChartTooltip />} />
                                        <Legend />
                                        <Bar dataKey="totalOcupadas" fill="#34d399" name="Ocupadas" radius={[6, 6, 0, 0]}>
                                            <LabelList dataKey="totalOcupadas" position="top" fill="#bbf7d0" fontSize={11} fontWeight={800} />
                                        </Bar>
                                        <Bar dataKey="totalVazias" fill="#f59e0b" name="Vazias" radius={[6, 6, 0, 0]}>
                                            <LabelList dataKey="totalVazias" position="top" fill="#fde68a" fontSize={11} fontWeight={800} />
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </section>
                    </div>

                    <section className={cardClass}>
                        <div className="mb-4 flex items-center gap-2 text-white">
                            <PieIcon size={18} className="text-fuchsia-400" />
                            <h3 className="text-lg font-black">Percentual Geral - Ocupadas x Vazias</h3>
                        </div>
                        <div className="h-80">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={data.occupancyBreakdown || []}
                                        dataKey="total"
                                        nameKey="categoria"
                                        cx="50%"
                                        cy="50%"
                                        outerRadius={120}
                                        label={({ categoria, percentual }) => `${categoria}: ${percentual}%`}
                                    >
                                        {(data.occupancyBreakdown || []).map((entry, index) => (
                                            <Cell key={`${entry.categoria}-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip content={<ChartTooltip />} />
                                    <Legend />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </section>

                    <section className={cardClass}>
                        <div className="mb-4 flex items-center gap-2 text-white">
                            <Users size={18} className="text-violet-400" />
                            <h3 className="text-lg font-black">Médicos com Mais Plantões por Unidade</h3>
                        </div>
                        <div className="space-y-6">
                            {(data.topDoctorsByUnit || []).map((unit) => (
                                <div key={unit.unidadeId} className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/50">
                                    <div className="border-b border-slate-800 bg-slate-900/70 px-4 py-3 text-sm font-black text-sky-300">{unit.unidade}</div>
                                    <div className="overflow-x-auto">
                                        <table className="min-w-[560px] w-full table-fixed text-left text-sm">
                                            <thead>
                                                <tr className="text-xs uppercase tracking-widest text-slate-500">
                                                    <th className="px-4 py-3">Médico</th>
                                                    <th className="w-44 px-4 py-3">CRM</th>
                                                    <th className="w-28 px-4 py-3 text-center">Plantões</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-800/60">
                                                {(unit.medicos || []).map((medico) => (
                                                    <tr key={`${unit.unidadeId}-${medico.medicoId}`} className="hover:bg-slate-900/50">
                                                        <td className="px-4 py-3 text-slate-200">{medico.nome}</td>
                                                        <td className="px-4 py-3 text-slate-400">{medico.crm || '-'}</td>
                                                        <td className="px-4 py-3 text-center font-black text-white">{medico.totalPlantoes}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            ))}
                            {(data.topDoctorsByUnit || []).length === 0 ? (
                                <p className="rounded-2xl border border-slate-800 bg-slate-950/40 px-4 py-8 text-center text-slate-500">
                                    Sem dados de alocação para o mês selecionado.
                                </p>
                            ) : null}
                        </div>
                    </section>
                </div>
            )}
        </div>
    );
}
