import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BarChart3, CalendarDays, FileText, Filter, MapPinned, TrendingUp } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { readApiResponse } from '../utils/api';
import ManagerDashboardPage from './ManagerDashboardPage';
import ManagerRelatoriosPage from './ManagerRelatoriosPage';
import ManagerPredicaoPage from './ManagerPredicaoPage';

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

const SHIFT_OPTIONS = ['TOTAL', 'MANHA', 'TARDE', 'NOITE', 'MADRUGADA'];

const normalizeText = (value) =>
    String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase();

const areSameIds = (left = [], right = []) =>
    left.length === right.length && left.every((value, index) => String(value) === String(right[index]));

export default function ManagerVisaoAnaliticaPage() {
    const { session } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const isMaster = Boolean(session?.isMaster || session?.perfil === 'GESTOR_MASTER');

    const [units, setUnits] = useState([]);
    const [loadingUnits, setLoadingUnits] = useState(false);
    const [filterMeta, setFilterMeta] = useState({
        regionaisDisponiveis: [],
        unidadesPorRegional: {}
    });

    const now = useMemo(() => new Date(), []);
    const [filters, setFilters] = useState(() => ({
        month: String(now.getMonth() + 1).padStart(2, '0'),
        year: String(now.getFullYear()),
        regional: '',
        unitIds: [],
        turno: 'TOTAL'
    }));

    const availableTabs = useMemo(
        () => {
            const tabs = [
                { key: 'dashboard', label: 'Dashboard', icon: BarChart3 },
                { key: 'relatorios', label: 'Relatórios', icon: FileText }
            ];
            if (isMaster) {
                tabs.push({ key: 'predicao', label: 'Análise de Meta', icon: TrendingUp });
            }
            return tabs;
        },
        [isMaster]
    );

    const selectedTab = useMemo(() => {
        const query = new URLSearchParams(location.search);
        const raw = String(query.get('aba') || 'dashboard').toLowerCase();
        const valid = new Set(availableTabs.map((tab) => tab.key));
        if (!valid.has(raw)) return 'dashboard';
        return raw;
    }, [location.search, availableTabs]);

    useEffect(() => {
        if (!session?.id) return;
        let cancelled = false;

        (async () => {
            setLoadingUnits(true);
            try {
                const response = await fetch(`/api/manager/unidades?gestorId=${encodeURIComponent(session.id)}`);
                const payload = await readApiResponse(response);
                if (!response.ok) throw new Error(payload?.error || payload?.details || 'Falha ao carregar unidades.');
                if (cancelled) return;
                const list = Array.isArray(payload) ? payload : [];
                setUnits(list);
            } catch {
                if (!cancelled) setUnits([]);
            } finally {
                if (!cancelled) setLoadingUnits(false);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [session?.id]);

    useEffect(() => {
        if (!session?.id) return;
        if (!units.length && !session?.unidadeId) return;

        setFilters((current) => {
            if (!isMaster) {
                const fixed = session?.unidadeId ? [String(session.unidadeId)] : [];
                const next = { ...current, unitIds: fixed };
                return areSameIds(current.unitIds, next.unitIds) ? current : next;
            }

            if (current.unitIds.length > 0) return current;
            const allIds = units.map((unit) => String(unit.id));
            if (!allIds.length) return current;
            return { ...current, unitIds: allIds };
        });
    }, [isMaster, session?.id, session?.unidadeId, units]);

    useEffect(() => {
        if (!session?.id) return;
        if (!isMaster) {
            setFilterMeta((current) => ({ ...current, regionaisDisponiveis: [], unidadesPorRegional: {} }));
            return;
        }

        const month = `${filters.year}-${filters.month}`;
        if (!month) return;

        let cancelled = false;

        (async () => {
            try {
                const params = new URLSearchParams();
                params.set('month', month);
                params.set('gestorId', session.id);
                if (filters.unitIds.length > 0) params.set('unidadeIds', filters.unitIds.join(','));
                else params.set('unidadeId', 'all');

                const response = await fetch(`/api/manager/reports?${params.toString()}`);
                const payload = await readApiResponse(response);
                if (!response.ok) throw new Error(payload?.error || 'Falha ao carregar metadados de filtro.');
                if (cancelled) return;
                setFilterMeta({
                    regionaisDisponiveis: payload?.filters?.regionaisDisponiveis || [],
                    unidadesPorRegional: payload?.filters?.unidadesPorRegional || {}
                });
            } catch {
                if (!cancelled) {
                    setFilterMeta((current) => ({
                        ...current,
                        regionaisDisponiveis: [],
                        unidadesPorRegional: {}
                    }));
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [filters.month, filters.year, filters.unitIds, isMaster, session?.id]);

    const visibleUnits = useMemo(() => {
        let baseUnits = units;

        // Filtro específico para o módulo de Análise de Meta (Apenas PS)
        if (selectedTab === 'predicao') {
            baseUnits = units.filter(unit => {
                const name = normalizeText(unit.nome);
                // Deve conter PS ou PRONTO SOCORRO
                const isPS = name.includes('ps') || name.includes('pronto socorro');
                // Nao pode ser anestesia, uti ou internacao
                const isExcluded = name.includes('anestesia') || name.includes('uti') || name.includes('internacao');
                return isPS && !isExcluded;
            });
        }

        if (!isMaster) {
            const fixedId = String(session?.unidadeId || '');
            return baseUnits.filter((unit) => String(unit.id) === fixedId);
        }

        if (!filters.regional) return baseUnits;

        const regionalKey = Object.keys(filterMeta.unidadesPorRegional || {}).find(
            (key) => normalizeText(key) === normalizeText(filters.regional)
        );
        const allowedNames = new Set(((filterMeta.unidadesPorRegional || {})[regionalKey] || []).map((name) => normalizeText(name)));
        if (!allowedNames.size) return [];
        return baseUnits.filter((unit) => allowedNames.has(normalizeText(unit.nome)));
    }, [filterMeta.unidadesPorRegional, filters.regional, isMaster, session?.unidadeId, units, selectedTab]);

    useEffect(() => {
        if (!isMaster) return;
        const allowedIds = new Set(visibleUnits.map((unit) => String(unit.id)));
        setFilters((current) => {
            const kept = current.unitIds.filter((id) => allowedIds.has(String(id)));
            const nextIds = kept.length > 0 ? kept : visibleUnits.map((unit) => String(unit.id));
            if (areSameIds(current.unitIds, nextIds)) return current;
            return { ...current, unitIds: nextIds };
        });
    }, [isMaster, visibleUnits]);

    const effectiveUnitIds = useMemo(() => {
        if (isMaster) return filters.unitIds.map(String);
        return session?.unidadeId ? [String(session.unidadeId)] : [];
    }, [filters.unitIds, isMaster, session?.unidadeId]);

    const yearOptions = useMemo(() => {
        const current = now.getFullYear();
        const options = [];
        for (let year = current - 2; year <= current + 2; year += 1) options.push(String(year));
        return options;
    }, [now]);

    const setTab = (tabKey) => {
        const searchParams = new URLSearchParams(location.search);
        searchParams.set('aba', tabKey);
        navigate({ pathname: '/gestor/visao-analitica', search: `?${searchParams.toString()}` }, { replace: true });
    };

    const toggleUnit = (unitId) => {
        if (!isMaster) return;
        const normalized = String(unitId);
        setFilters((current) => {
            const next = current.unitIds.includes(normalized)
                ? current.unitIds.filter((id) => String(id) !== normalized)
                : [...current.unitIds, normalized];
            return { ...current, unitIds: next };
        });
    };

    const sharedFilters = {
        month: filters.month,
        year: filters.year,
        regional: filters.regional,
        unitIds: effectiveUnitIds,
        turno: filters.turno
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <section className="relative overflow-hidden rounded-[2rem] border border-slate-700/70 bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.2),transparent_45%),linear-gradient(160deg,#020617_0%,#0f172a_58%,#111827_100%)] p-6 shadow-2xl">
                <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                    <div>
                        <p className="text-[11px] font-black uppercase tracking-[0.35em] text-sky-300/80">Monitoramento BI</p>
                        <h2 className="mt-2 text-3xl font-black text-white sm:text-4xl">Visão Analítica</h2>
                        <p className="mt-2 text-sm text-slate-300">Filtro global único para análise macro nas abas de Dashboard e Relatórios.</p>
                    </div>

                    <div className="grid w-full max-w-6xl gap-3 sm:grid-cols-2 xl:grid-cols-5">
                        <div>
                            <label className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                                <CalendarDays size={12} className="text-sky-400" />
                                Mês
                            </label>
                            <select
                                value={filters.month}
                                onChange={(event) => setFilters((current) => ({ ...current, month: event.target.value }))}
                                className="w-full rounded-2xl border border-slate-700 bg-slate-950/90 px-4 py-3 text-sm font-bold text-white outline-none transition focus:border-sky-400"
                            >
                                {MONTHS.map((month) => (
                                    <option key={month.value} value={month.value}>
                                        {month.label}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-500">Ano</label>
                            <select
                                value={filters.year}
                                onChange={(event) => setFilters((current) => ({ ...current, year: event.target.value }))}
                                className="w-full rounded-2xl border border-slate-700 bg-slate-950/90 px-4 py-3 text-sm font-bold text-white outline-none transition focus:border-sky-400"
                            >
                                {yearOptions.map((year) => (
                                    <option key={year} value={year}>
                                        {year}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                                <MapPinned size={12} className="text-emerald-400" />
                                Regional
                            </label>
                            <select
                                value={filters.regional}
                                onChange={(event) => {
                                    const nextRegional = event.target.value;
                                    setFilters((current) => {
                                        if (!nextRegional) {
                                            const allIds = units.map((unit) => String(unit.id));
                                            return { ...current, regional: '', unitIds: allIds };
                                        }
                                        return { ...current, regional: nextRegional };
                                    });
                                }}
                                className="w-full rounded-2xl border border-slate-700 bg-slate-950/90 px-4 py-3 text-sm font-bold text-white outline-none transition focus:border-sky-400"
                                disabled={!isMaster}
                            >
                                <option value="">Todas as regionais</option>
                                {(filterMeta.regionaisDisponiveis || []).map((regional) => (
                                    <option key={regional} value={regional}>
                                        {regional}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                                <Filter size={12} className="text-amber-400" />
                                Turno
                            </label>
                            <select
                                value={filters.turno}
                                onChange={(event) => setFilters((current) => ({ ...current, turno: event.target.value }))}
                                className="w-full rounded-2xl border border-slate-700 bg-slate-950/90 px-4 py-3 text-sm font-bold text-white outline-none transition focus:border-sky-400"
                            >
                                {SHIFT_OPTIONS.map((shift) => (
                                    <option key={shift} value={shift}>
                                        {shift}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="rounded-2xl border border-slate-700 bg-slate-950/70 px-4 py-3">
                            <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Unidades</div>
                            <div className="mt-1 text-sm font-black text-white">{effectiveUnitIds.length} selecionada(s)</div>
                            {!isMaster ? (
                                <div className="mt-1 text-xs text-slate-400">Escopo fixo da unidade do gestor</div>
                            ) : null}
                        </div>
                    </div>
                </div>

                {isMaster ? (
                    <div className="rounded-2xl border border-slate-700/80 bg-slate-950/40 p-4">
                        <div className="mb-3 text-[11px] font-black uppercase tracking-[0.25em] text-slate-400">Comparação multiunidade</div>
                        <div className="flex flex-wrap gap-2">
                            {visibleUnits.map((unit) => {
                                const active = effectiveUnitIds.includes(String(unit.id));
                                return (
                                    <button
                                        key={unit.id}
                                        type="button"
                                        onClick={() => toggleUnit(unit.id)}
                                        className={`rounded-xl border px-3 py-2 text-xs font-black uppercase tracking-tight transition ${
                                            active
                                                ? 'border-emerald-400/50 bg-emerald-500/20 text-emerald-200'
                                                : 'border-slate-700 bg-slate-900/70 text-slate-400 hover:border-slate-500 hover:text-slate-200'
                                        }`}
                                    >
                                        {unit.nome}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                ) : null}

                <div className="mt-6 flex flex-wrap gap-2 rounded-2xl border border-slate-800 bg-slate-950/40 p-1.5">
                    {availableTabs.map((tab) => {
                        const Icon = tab.icon;
                        const active = selectedTab === tab.key;
                        return (
                            <button
                                key={tab.key}
                                type="button"
                                onClick={() => setTab(tab.key)}
                                className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-black transition ${
                                    active ? 'bg-sky-500/20 text-sky-200 border border-sky-400/30' : 'text-slate-400 hover:text-slate-200'
                                }`}
                            >
                                <Icon size={16} />
                                {tab.label}
                            </button>
                        );
                    })}
                </div>
            </section>

            {loadingUnits ? (
                <div className="flex h-40 items-center justify-center rounded-3xl border border-slate-800 bg-slate-900/40">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-sky-500 border-t-transparent" />
                </div>
            ) : null}

            {!loadingUnits && selectedTab === 'dashboard' ? <ManagerDashboardPage embedded sharedFilters={sharedFilters} /> : null}
            {!loadingUnits && selectedTab === 'relatorios' ? <ManagerRelatoriosPage embedded sharedFilters={sharedFilters} /> : null}
            {!loadingUnits && selectedTab === 'predicao' ? <ManagerPredicaoPage embedded sharedFilters={sharedFilters} /> : null}
        </div>
    );
}


