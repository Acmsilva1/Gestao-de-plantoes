import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BarChart3, CalendarDays, FileText, Filter, MapPinned, TrendingUp } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { readApiResponse } from '../models/api';
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
        unidadesPorRegional: {},
        allowedUnidadeIdsForRegional: null
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
            setFilterMeta((current) => ({
                ...current,
                regionaisDisponiveis: [],
                unidadesPorRegional: {},
                allowedUnidadeIdsForRegional: null
            }));
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
                if (String(filters.regional || '').trim()) params.set('regional', String(filters.regional).trim());

                const response = await fetch(`/api/manager/reports?${params.toString()}`);
                const payload = await readApiResponse(response);
                if (!response.ok) throw new Error(payload?.error || 'Falha ao carregar metadados de filtro.');
                if (cancelled) return;
                setFilterMeta({
                    regionaisDisponiveis: payload?.filters?.regionaisDisponiveis || [],
                    unidadesPorRegional: payload?.filters?.unidadesPorRegional || {},
                    allowedUnidadeIdsForRegional: payload?.filters?.allowedUnidadeIdsForRegional ?? null
                });
            } catch {
                if (!cancelled) {
                    setFilterMeta((current) => ({
                        ...current,
                        regionaisDisponiveis: [],
                        unidadesPorRegional: {},
                        allowedUnidadeIdsForRegional: null
                    }));
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [filters.month, filters.year, filters.unitIds, filters.regional, isMaster, session?.id]);

    const visibleUnits = useMemo(() => {
        let baseUnits = units;

        // Filtro específico para o módulo de Análise de Meta (Apenas PS)
        if (selectedTab === 'predicao') {
            const norm = (v) =>
                String(v || '')
                    .normalize('NFD')
                    .replace(/[\u0300-\u036f]/g, '')
                    .trim()
                    .toLowerCase();
            baseUnits = units.filter((unit) => {
                const name = norm(unit.nome);
                const isPS = name.includes('ps') || name.includes('pronto socorro');
                const isExcluded = name.includes('anestesia') || name.includes('uti') || name.includes('internacao');
                return isPS && !isExcluded;
            });
        }

        if (!isMaster) {
            const fixedId = String(session?.unidadeId || '');
            return baseUnits.filter((unit) => String(unit.id) === fixedId);
        }

        if (!filters.regional) return baseUnits;

        const allow = filterMeta.allowedUnidadeIdsForRegional;
        if (Array.isArray(allow) && allow.length > 0) {
            const set = new Set(allow.map(String));
            return baseUnits.filter((unit) => set.has(String(unit.id)));
        }

        const norm = (v) =>
            String(v || '')
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .trim()
                .toLowerCase();
        const regionalKey = Object.keys(filterMeta.unidadesPorRegional || {}).find(
            (key) => norm(key) === norm(filters.regional)
        );
        const allowedNames = new Set(((filterMeta.unidadesPorRegional || {})[regionalKey] || []).map((name) => norm(name)));
        if (!allowedNames.size) return [];
        return baseUnits.filter((unit) => allowedNames.has(norm(unit.nome)));
    }, [
        filterMeta.unidadesPorRegional,
        filterMeta.allowedUnidadeIdsForRegional,
        filters.regional,
        isMaster,
        session?.unidadeId,
        units,
        selectedTab
    ]);

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

    /** Referência estável: evita re-fetch em loop quando `unitIds` é novo array com os mesmos IDs (filhas comparavam por referência). */
    const sharedFilters = useMemo(
        () => ({
            month: filters.month,
            year: filters.year,
            regional: filters.regional,
            unitIds: effectiveUnitIds,
            turno: filters.turno
        }),
        [filters.month, filters.year, filters.regional, filters.turno, effectiveUnitIds.join(',')]
    );

    return (
        <div className="space-y-8 animate-in fade-in duration-700">
            <section className="relative overflow-hidden rounded-[2.5rem] border border-slate-700/40 bg-[#262a41]/60 p-8 shadow-2xl backdrop-blur-xl">
                <div className="mb-8 flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
                    <div>
                        <p className="text-[11px] font-black uppercase tracking-[0.4em] text-[#2DE0B9]">Monitoramento BI Inteligente</p>
                        <h2 className="mt-3 text-4xl font-black text-white tracking-tight sm:text-5xl">Visão Analítica</h2>
                        <p className="mt-2 text-sm text-slate-400 font-medium max-w-lg">Filtro operacional unificado para análise macro de rede hospitalar.</p>
                    </div>

                    <div className="grid w-full max-w-6xl gap-4 sm:grid-cols-2 xl:grid-cols-5">
                        <div>
                            <label className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                                <CalendarDays size={12} className="text-[#2DE0B9]" />
                                Mês
                            </label>
                            <select
                                value={filters.month}
                                onChange={(event) => setFilters((current) => ({ ...current, month: event.target.value }))}
                                className="w-full rounded-2xl border border-slate-700 bg-[#1e2235] px-4 py-3.5 text-sm font-bold text-white outline-none transition focus:border-[#2DE0B9] focus:shadow-[0_0_0_3px_rgba(45,224,185,0.1)]"
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
                                className="w-full rounded-2xl border border-slate-700 bg-[#1e2235] px-4 py-3.5 text-sm font-bold text-white outline-none transition focus:border-[#2DE0B9] focus:shadow-[0_0_0_3px_rgba(45,224,185,0.1)]"
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
                                <MapPinned size={12} className="text-[#2DE0B9]" />
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
                                className="w-full rounded-2xl border border-slate-700 bg-[#1e2235] px-4 py-3.5 text-sm font-bold text-white outline-none transition focus:border-[#2DE0B9] focus:shadow-[0_0_0_3px_rgba(45,224,185,0.1)]"
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
                                <Filter size={12} className="text-[#E0B92D]" />
                                Turno
                            </label>
                            <select
                                value={filters.turno}
                                onChange={(event) => setFilters((current) => ({ ...current, turno: event.target.value }))}
                                className="w-full rounded-2xl border border-slate-700 bg-[#1e2235] px-4 py-3.5 text-sm font-bold text-white outline-none transition focus:border-[#2DE0B9] focus:shadow-[0_0_0_3px_rgba(45,224,185,0.1)]"
                            >
                                {SHIFT_OPTIONS.map((shift) => (
                                    <option key={shift} value={shift}>
                                        {shift}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="rounded-2xl border border-slate-700/60 bg-[#252a44]/60 px-4 py-3.5 backdrop-blur-md">
                            <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Unidades</div>
                            <div className="mt-1 text-sm font-black text-white">{effectiveUnitIds.length} selecionada(s)</div>
                            {!isMaster ? (
                                <div className="mt-1 text-xs text-slate-400">Escopo fixo do gestor</div>
                            ) : null}
                        </div>
                    </div>
                </div>

                {isMaster ? (
                    <div className="rounded-[2rem] border border-slate-700/40 bg-[#1e2235]/40 p-6">
                        <div className="mb-4 text-[11px] font-black uppercase tracking-[0.25em] text-slate-500">Seletor Multi-unidade</div>
                        <div className="flex flex-wrap gap-2">
                            {visibleUnits.map((unit) => {
                                const active = effectiveUnitIds.includes(String(unit.id));
                                return (
                                    <button
                                        key={unit.id}
                                        type="button"
                                        onClick={() => toggleUnit(unit.id)}
                                        className={`rounded-xl border px-4 py-2 text-[11px] font-black uppercase tracking-tight transition-all duration-300 ${
                                            active
                                                ? 'border-[#2DE0B9]/50 bg-[#2DE0B9]/20 text-[#2DE0B9] shadow-[0_0_15px_-5px_rgba(45,224,185,0.4)]'
                                                : 'border-slate-700/60 bg-slate-900/40 text-slate-400 hover:border-slate-600 hover:text-slate-200'
                                        }`}
                                    >
                                        {unit.nome}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                ) : null}

                <div className="mt-8 flex flex-wrap gap-2 rounded-2xl border border-slate-800/60 bg-[#1e2235]/40 p-1.5 w-fit">
                    {availableTabs.map((tab) => {
                        const Icon = tab.icon;
                        const active = selectedTab === tab.key;
                        return (
                            <button
                                key={tab.key}
                                type="button"
                                onClick={() => setTab(tab.key)}
                                className={`flex items-center gap-2.5 rounded-xl px-5 py-3 text-sm font-black transition-all ${
                                    active 
                                        ? 'bg-[#2DE0B9]/15 text-[#2DE0B9] border border-[#2DE0B9]/30 shadow-lg' 
                                        : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/30'
                                }`}
                            >
                                <Icon size={16} />
                                {tab.label}
                            </button>
                        );
                    })}
                </div>
            </section>

            <div className="min-h-[500px]">
                {loadingUnits ? (
                    <div className="flex h-64 flex-col items-center justify-center rounded-[2.5rem] bg-[#1e2030]/20 border border-slate-800/40 backdrop-blur-sm">
                        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#2DE0B9] border-t-transparent mb-4" />
                        <p className="text-slate-500 font-bold tracking-widest uppercase text-[10px]">Sincronizando Base Operacional...</p>
                    </div>
                ) : null}

                {!loadingUnits && selectedTab === 'dashboard' ? <ManagerDashboardPage embedded sharedFilters={sharedFilters} /> : null}
                {!loadingUnits && selectedTab === 'relatorios' ? <ManagerRelatoriosPage embedded sharedFilters={sharedFilters} /> : null}
                {!loadingUnits && selectedTab === 'predicao' ? <ManagerPredicaoPage embedded sharedFilters={sharedFilters} /> : null}
            </div>
        </div>
    );
}
