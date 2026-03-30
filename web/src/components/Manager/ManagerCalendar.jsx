import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, MapPin, Eye, ArrowLeft, AlertTriangle, Phone, Stethoscope, UserRoundCheck } from 'lucide-react';

const weekdayLabels = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const shiftTypeOptions = ['Todos', 'Madrugada', 'Manhã', 'Tarde', 'Noite'];
const shiftStatusOptions = ['Todos', 'ABERTO', 'OCUPADO'];
const shiftOrderIndex = { Madrugada: 0, Manhã: 1, Tarde: 2, Noite: 3 };
const monthFormatter = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' });
const weekdayFormatter = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'America/Sao_Paulo' });
const fullDateFormatter = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' });
const weekdayIndexByShortName = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

const getMonthAnchorDate = (month) => new Date(`${month}-01T12:00:00-03:00`);
const getMonthTitle = (month) => monthFormatter.format(getMonthAnchorDate(month));
const formatDisplayDate = (ds) => fullDateFormatter.format(new Date(`${ds}T12:00:00-03:00`)).replace(/\//g, '-');
const formatBookingType = (doctor) => {
    if (!doctor) return 'Completo';

    if (doctor.tipoPlantao === 'PARCIAL') {
        return doctor.horaInicio && doctor.horaFim
            ? `Parcial • ${doctor.horaInicio.slice(0, 5)} às ${doctor.horaFim.slice(0, 5)}`
            : 'Parcial';
    }

    if (doctor.tipoPlantao === 'FIXO') {
        const rangeLabel =
            doctor.dataInicioFixo && doctor.dataFimFixo
                ? `${formatDisplayDate(doctor.dataInicioFixo)} até ${formatDisplayDate(doctor.dataFimFixo)}`
                : doctor.dataFimFixo
                  ? `até ${formatDisplayDate(doctor.dataFimFixo)}`
                  : 'Sequência fixa';

        if (doctor.horaInicio && doctor.horaFim) {
            return `Fixo parcial • ${rangeLabel} • ${doctor.horaInicio.slice(0, 5)} às ${doctor.horaFim.slice(0, 5)}`;
        }

        return `Fixo completo • ${rangeLabel}`;
    }

    return 'Completo';
};

const shiftMonth = (month, delta) => {
    const [year, monthIndex] = month.split('-').map(Number);
    const date = new Date(Date.UTC(year, monthIndex - 1 + delta, 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
};

const getForecastWindow = () => {
    const now = new Date();
    const current = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const next = shiftMonth(current, 1);
    return { current, next };
};

const isOutsideForecastWindow = (month) => {
    const { current, next } = getForecastWindow();
    return month < current || month > next;
};

const buildCalendarDays = (month, shifts) => {
    const [year, monthIndex] = month.split('-').map(Number);
    const firstDay = getMonthAnchorDate(month);
    const totalDays = new Date(Date.UTC(year, monthIndex, 0)).getUTCDate();
    const leadingBlanks = weekdayIndexByShortName[weekdayFormatter.format(firstDay)] ?? 0;
    const shiftMap = new Map();
    for (const shift of shifts) {
        const day = Number(shift.data.slice(-2));
        const current = shiftMap.get(day) || [];
        current.push(shift);
        shiftMap.set(day, current);
    }
    const days = [];
    for (let i = 0; i < leadingBlanks; i++) days.push({ key: `blank-${i}`, empty: true });
    for (let d = 1; d <= totalDays; d++) {
        days.push({
            key: `day-${d}`, day: d,
            date: `${month}-${String(d).padStart(2, '0')}`,
            shifts: shiftMap.get(d) || []
        });
    }
    return days;
};

const getShiftTone = (shift) => {
    if (shift.vagas <= 0) {
        return 'filled';
    }

    if (shift.vagasOcupadas > 0) {
        return 'partial';
    }

    return 'empty';
};

const getShiftClasses = (shift) => {
    const tone = getShiftTone(shift);

    if (tone === 'filled') {
        return 'border border-sky-400/70 bg-sky-500/10 text-sky-100  shadow-[0_0_0_1px_rgba(56,189,248,0.2),0_0_18px_rgba(14,165,233,0.16)]';
    }

    if (tone === 'partial') {
        return 'border border-amber-400/60 bg-amber-500/10 text-amber-100  shadow-[0_0_0_1px_rgba(251,191,36,0.14),0_0_18px_rgba(245,158,11,0.16)]';
    }

    return 'border border-rose-400/60 bg-rose-500/10 text-rose-100 shadow-[0_0_0_1px_rgba(251,113,133,0.18),0_0_20px_rgba(244,63,94,0.14)]';
};

const getDayCardClasses = (shifts) => {
    const tones = shifts.map(getShiftTone);

    if (tones.includes('filled')) {
        return 'border-sky-400/60 shadow-[0_0_0_1px_rgba(56,189,248,0.18),0_0_24px_rgba(14,165,233,0.14)]';
    }

    if (tones.includes('partial')) {
        return 'border-amber-400/50 shadow-[0_0_0_1px_rgba(251,191,36,0.18),0_0_24px_rgba(245,158,11,0.12)]';
    }

    if (tones.includes('empty')) {
        return 'border-rose-400/60 shadow-[0_0_0_1px_rgba(251,113,133,0.18),0_0_24px_rgba(244,63,94,0.14)]';
    }

    return 'border-slate-800';
};

const getShiftBadgeClasses = (shift) => {
    const tone = getShiftTone(shift);

    if (tone === 'filled') {
        return 'border border-sky-400/40 bg-sky-500/10 text-sky-200';
    }

    if (tone === 'partial') {
        return 'border border-amber-400/40 bg-amber-500/10 text-amber-200';
    }

    return 'border border-rose-400/45 bg-rose-500/10 text-rose-200';
};

const getShiftPanelClasses = (shift) => {
    const tone = getShiftTone(shift);

    if (tone === 'filled') {
        return 'bg-sky-950/30 ring-1 ring-sky-400/30 ';
    }

    if (tone === 'partial') {
        return 'bg-amber-950/20 ring-1 ring-amber-400/25 ';
    }

    return 'bg-rose-950/25 ring-1 ring-rose-400/30';
};

export default function ManagerCalendar({ units = [] }) {
    const [calMonth, setCalMonth] = useState(new Date().toISOString().slice(0, 7));
    const [calUnit, setCalUnit] = useState(null);
    const [calData, setCalData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [loadingDayAgenda, setLoadingDayAgenda] = useState(false);
    const [selectedDay, setSelectedDay] = useState(null);
    const [selectedDayAgenda, setSelectedDayAgenda] = useState(null);
    const [shiftTypeFilter, setShiftTypeFilter] = useState('Todos');
    const [shiftStatusFilter, setShiftStatusFilter] = useState('Todos');
    const [refreshKey, setRefreshKey] = useState(0);

    useEffect(() => {
        if (units.length > 0 && !calUnit) setCalUnit(units[0].id);
    }, [units]);

    useEffect(() => {
        setSelectedDay(null);
    }, [calUnit, calMonth]);

    useEffect(() => {
        const intervalId = window.setInterval(() => {
            setRefreshKey((current) => current + 1);
        }, 60000);

        const handleWindowFocus = () => {
            setRefreshKey((current) => current + 1);
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                setRefreshKey((current) => current + 1);
            }
        };

        window.addEventListener('focus', handleWindowFocus);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            window.clearInterval(intervalId);
            window.removeEventListener('focus', handleWindowFocus);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, []);

    useEffect(() => {
        if (!calUnit) return;
        const fetchCal = async () => {
            setLoading(true);
            try {
                const res = await fetch(`/api/manager/calendario/${calUnit}?month=${calMonth}`);
                if (res.ok) setCalData(await res.json());
            } catch {}
            setLoading(false);
        };
        fetchCal();
    }, [calUnit, calMonth, refreshKey]);

    useEffect(() => {
        setShiftTypeFilter('Todos');
        setShiftStatusFilter('Todos');
    }, [calMonth]);

    const visibleShifts = useMemo(() => {
        const shifts = calData?.shifts || [];
        return shifts.filter((shift) => {
            const matchesType = shiftTypeFilter === 'Todos' || shift.turno === shiftTypeFilter;
            const matchesStatus = shiftStatusFilter === 'Todos' || shift.status === shiftStatusFilter;
            return matchesType && matchesStatus;
        });
    }, [calData, shiftTypeFilter, shiftStatusFilter]);

    const hasActiveFilters = shiftTypeFilter !== 'Todos' || shiftStatusFilter !== 'Todos';

    const calendarDays = useMemo(
        () => buildCalendarDays(calMonth, visibleShifts),
        [calMonth, visibleShifts]
    );

    const filteredCalendarDays = useMemo(() => {
        if (!hasActiveFilters) {
            return calendarDays;
        }

        return calendarDays.filter((entry) => !entry.empty && entry.shifts.length > 0);
    }, [calendarDays, hasActiveFilters]);

    const selectedDayShifts = useMemo(() => {
        if (!selectedDay) return [];

        const calendarDayShifts = visibleShifts.filter((shift) => shift.data === selectedDay);
        const agendaById = new Map((selectedDayAgenda?.shifts || []).map((shift) => [shift.id, shift]));

        return calendarDayShifts
            .map((shift) => {
                const agendaShift = agendaById.get(shift.id);
                return {
                    ...shift,
                    ...(agendaShift || {}),
                    medicos: agendaShift?.medicos || []
                };
            })
            .filter((shift) => {
                const matchesType = shiftTypeFilter === 'Todos' || shift.turno === shiftTypeFilter;
                const matchesStatus = shiftStatusFilter === 'Todos' || shift.status === shiftStatusFilter;
                return matchesType && matchesStatus;
            })
            .sort((a, b) => (shiftOrderIndex[a.turno] ?? 99) - (shiftOrderIndex[b.turno] ?? 99));
    }, [selectedDay, selectedDayAgenda, visibleShifts, shiftTypeFilter, shiftStatusFilter]);

    useEffect(() => {
        if (!selectedDay) return;

        const stillVisible = visibleShifts.some((shift) => shift.data === selectedDay);
        if (!stillVisible) {
            setSelectedDay(null);
        }
    }, [selectedDay, visibleShifts]);

    useEffect(() => {
        if (!calUnit || !selectedDay) {
            setSelectedDayAgenda(null);
            return;
        }

        const fetchDayAgenda = async () => {
            setLoadingDayAgenda(true);
            try {
                const response = await fetch(`/api/manager/agenda?unidadeId=${calUnit}&date=${selectedDay}`);
                if (!response.ok) {
                    throw new Error('Falha ao carregar agenda do dia.');
                }

                const data = await response.json();
                setSelectedDayAgenda(data);
            } catch {
                setSelectedDayAgenda(null);
            } finally {
                setLoadingDayAgenda(false);
            }
        };

        fetchDayAgenda();
    }, [calUnit, selectedDay, refreshKey]);

    const selectedUnitName = units.find(u => u.id === calUnit)?.nome || '';
    const outsideForecast = isOutsideForecastWindow(calMonth);
    const { current: forecastCurrent, next: forecastNext } = getForecastWindow();

    /* ——— Controls shown only in calendar view ——— */
    const CalendarControls = (
        <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-start gap-3 sm:items-center">
                <div className="flex items-center gap-2 rounded-2xl border border-slate-700 bg-slate-900/80 px-4 py-2">
                    <MapPin size={14} className="text-sky-400 shrink-0" />
                    <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-500">Unidade</span>
                    <select
                        value={calUnit || ''}
                        onChange={e => setCalUnit(e.target.value)}
                        className="bg-transparent text-sm font-semibold text-white outline-none cursor-pointer"
                    >
                        {units.map(u => (
                            <option key={u.id} value={u.id} className="bg-slate-900">{u.nome}</option>
                        ))}
                    </select>
                </div>
                <div className="flex items-center gap-2 rounded-2xl border border-slate-700 bg-slate-900/80 px-4 py-2">
                    <Eye size={14} className="text-amber-300 shrink-0" />
                    <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-500">Turno</span>
                    <select
                        value={shiftTypeFilter}
                        onChange={e => setShiftTypeFilter(e.target.value)}
                        className="bg-transparent text-sm font-semibold text-white outline-none cursor-pointer"
                    >
                        {shiftTypeOptions.map(option => (
                            <option key={option} value={option} className="bg-slate-900">{option}</option>
                        ))}
                    </select>
                </div>
                <div className="flex items-center gap-2 rounded-2xl border border-slate-700 bg-slate-900/80 px-4 py-2">
                    <AlertTriangle size={14} className="text-rose-300 shrink-0" />
                    <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-500">Status</span>
                    <select
                        value={shiftStatusFilter}
                        onChange={e => setShiftStatusFilter(e.target.value)}
                        className="bg-transparent text-sm font-semibold text-white outline-none cursor-pointer"
                    >
                        {shiftStatusOptions.map(option => (
                            <option key={option} value={option} className="bg-slate-900">{option}</option>
                        ))}
                    </select>
                </div>
                <div className="flex items-center gap-1 rounded-2xl border border-slate-700 bg-slate-900/80 p-1">
                    <button onClick={() => setCalMonth(m => shiftMonth(m, -1))} className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-800 hover:text-white">
                        <ChevronLeft size={16} />
                    </button>
                    <span className="min-w-0 flex-1 px-2 text-center text-sm font-bold capitalize text-white sm:min-w-36">
                        {getMonthTitle(calMonth)}
                    </span>
                    <button onClick={() => setCalMonth(m => shiftMonth(m, 1))} className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-800 hover:text-white">
                        <ChevronRight size={16} />
                    </button>
                </div>
            </div>
        </div>
    );

    return (
        <section className="rounded-[2rem] border border-slate-700/60 bg-slate-900/60 p-4 shadow-2xl shadow-slate-950/40 animate-in fade-in duration-500 sm:p-8">

            {/* ═══ CALENDAR VIEW ═══ */}
            {!selectedDay ? (
                <>
                    <div className="mb-8 flex flex-col gap-4 border-b border-slate-800 pb-6 md:flex-row md:items-start md:justify-between">
                        <div>
                            <div className="flex items-center gap-2 text-sky-400/70 text-xs uppercase tracking-widest mb-2">
                                <Eye size={14} />
                                Visualização Analítica
                            </div>
                            <h2 className="text-2xl font-black text-white">Calendário de Plantões</h2>
                            <p className="mt-1 text-sm text-slate-400">
                                Unidade: <span className="text-white">{selectedUnitName}</span>
                            </p>
                        </div>
                        {CalendarControls}
                    </div>
                    {calData && (
                        <div className="mb-6 flex flex-wrap gap-3">
                            <span className="rounded-full border border-slate-600/50 bg-slate-800/40 px-4 py-1 text-xs font-bold text-slate-200">
                                {visibleShifts.length} plantões no mês
                            </span>
                            <span className="rounded-full border border-sky-400/20 bg-sky-500/10 px-4 py-1 text-xs font-bold text-sky-300">
                                {visibleShifts.filter(s => s.vagas <= 0).length} preenchidos
                            </span>
                            <span className="rounded-full border border-amber-400/20 bg-amber-500/10 px-4 py-1 text-xs font-bold text-amber-300">
                                {visibleShifts.filter(s => s.vagas > 0 && s.vagasOcupadas > 0).length} parcialmente preenchidos
                            </span>
                            <span className="rounded-full border border-rose-400/20 bg-rose-500/10 px-4 py-1 text-xs font-bold text-rose-300">
                                {visibleShifts.filter(s => s.vagasOcupadas === 0).length} sem preenchimento
                            </span>
                        </div>
                    )}

                    {outsideForecast && (
                        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-400/30 bg-amber-500/10 px-5 py-4 text-sm text-amber-200 animate-in slide-in-from-top-2 duration-300">
                            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-400" />
                            <div>
                                <p className="font-bold text-amber-300">Mês fora da janela de previsão</p>
                                <p className="mt-1 text-amber-200/80">
                                    O preditor cobre apenas <span className="font-semibold capitalize">{getMonthTitle(forecastCurrent)}</span> e{' '}
                                    <span className="font-semibold capitalize">{getMonthTitle(forecastNext)}</span>.
                                    O calendário abaixo pode ficar vazio ou incompleto.
                                </p>
                            </div>
                        </div>
                    )}

                    {loading ? (
                        <div className="flex h-64 items-center justify-center">
                            <div className="h-7 w-7 animate-spin rounded-full border-4 border-sky-500 border-t-transparent" />
                        </div>
                    ) : (
                        <>
                            <div className="mb-3 hidden grid-cols-7 gap-2 md:grid">
                                {weekdayLabels.map(label => (
                                    <div key={label} className="py-2 text-center text-xs font-bold uppercase tracking-widest text-slate-600">
                                        {label}
                                    </div>
                                ))}
                            </div>

                            {hasActiveFilters && filteredCalendarDays.length === 0 ? (
                                <div className="rounded-3xl border border-slate-800 bg-slate-950/40 p-10 text-center text-slate-400">
                                    Nenhum dia encontrado para os filtros selecionados neste mês.
                                </div>
                            ) : (
                            <div className={`grid grid-cols-1 gap-2 ${hasActiveFilters ? 'md:grid-cols-4 xl:grid-cols-5' : 'md:grid-cols-7'}`}>
                                {(hasActiveFilters ? filteredCalendarDays : calendarDays).map(entry =>
                                    entry.empty ? (
                                        <div key={entry.key} className="hidden md:block rounded-2xl border border-transparent" />
                                    ) : (
                                        <button
                                            key={entry.key}
                                            onClick={() => setSelectedDay(entry.date)}
                                            className={`min-h-28 rounded-2xl border bg-slate-950/40 p-3 text-left transition-all duration-200 hover:-translate-y-0.5 hover:bg-sky-500/5 ${getDayCardClasses(entry.shifts)}`}
                                        >
                                            <div className="mb-3 flex items-center justify-between">
                                                <span className="text-sm font-bold text-white">{String(entry.day).padStart(2, '0')}</span>
                                                <span className="text-[10px] uppercase tracking-wider text-slate-600">
                                                    {entry.shifts.length} turno{entry.shifts.length !== 1 ? 's' : ''}
                                                </span>
                                            </div>
                                            <div className="grid gap-1">
                                                {entry.shifts.length === 0 ? (
                                                    <div className="rounded-xl border border-dashed border-slate-800 px-2 py-3 text-[10px] text-slate-600">
                                                        Sem plantões
                                                    </div>
                                                ) : (
                                                    entry.shifts.slice(0, 3).map(shift => (
                                                        <div key={shift.id} className={`rounded-xl px-2 py-2 text-[11px] ${getShiftClasses(shift)}`}>
                                                            <div className="font-bold truncate">{shift.turno}</div>
                                                            <div className="mt-1 opacity-80">
                                                                {shift.vagas} vagas • {shift.vagasOcupadas}/{shift.vagasTotais}
                                                            </div>
                                                        </div>
                                                    ))
                                                )}
                                            </div>
                                        </button>
                                    )
                                )}
                            </div>
                            )}
                        </>
                    )}
                </>
            ) : (

                /* ═══ DAY DETAIL VIEW ═══ */
                <>
                    <div className="mb-6 flex flex-col gap-4 border-b border-slate-800 pb-6 md:flex-row md:items-end md:justify-between">
                        <div>
                            <p className="text-xs uppercase tracking-[0.25em] text-sky-400/70 mb-2">Dia Selecionado</p>
                            <h2 className="text-3xl font-black text-white">{formatDisplayDate(selectedDay)}</h2>
                            <p className="mt-2 text-sm text-slate-400">
                                Unidade: <span className="text-slate-200">{selectedUnitName}</span>
                            </p>
                        </div>
                        <button
                            onClick={() => setSelectedDay(null)}
                            className="flex items-center gap-2 rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm font-bold text-slate-200 transition hover:bg-slate-800"
                        >
                            <ArrowLeft size={16} />
                            Voltar ao calendário
                        </button>
                    </div>

                    {loadingDayAgenda ? (
                        <div className="flex h-64 items-center justify-center">
                            <div className="h-7 w-7 animate-spin rounded-full border-4 border-sky-500 border-t-transparent" />
                        </div>
                    ) : selectedDayShifts.length === 0 ? (
                        <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-10 text-center text-slate-400">
                            Não há plantões disponíveis em {formatDisplayDate(selectedDay)}.
                        </div>
                    ) : (
                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 xl:gap-3">
                            {selectedDayShifts.map(shift => (
                                <article
                                    key={shift.id}
                                    className={`min-w-0 overflow-hidden rounded-3xl border bg-slate-900/80 p-4 shadow-2xl shadow-slate-950/40 transition duration-300 hover:-translate-y-1 xl:p-5 ${
                                        getShiftTone(shift) === 'filled'
                                            ? 'border-sky-400/70 shadow-[0_0_0_1px_rgba(56,189,248,0.28),0_0_28px_rgba(14,165,233,0.2)]'
                                            : getShiftTone(shift) === 'partial'
                                                ? 'border-amber-400/50 shadow-[0_0_0_1px_rgba(251,191,36,0.18),0_0_24px_rgba(245,158,11,0.14)]'
                                                : getShiftTone(shift) === 'empty'
                                                    ? 'border-rose-400/40 shadow-[0_0_0_1px_rgba(251,113,133,0.16),0_0_24px_rgba(244,63,94,0.12)]'
                                                    : 'border-slate-700'
                                    }`}
                                >
                                    <div className="mb-4 flex items-start justify-between gap-2">
                                        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.2em] ${getShiftBadgeClasses(shift)}`}>
                                            {shift.turno}
                                        </span>
                                        <span className="shrink-0 text-xs text-slate-400 xl:text-sm">{formatDisplayDate(shift.data)}</span>
                                    </div>

                                    <div className={`mb-4 rounded-2xl p-3 xl:p-4 ${getShiftPanelClasses(shift)}`}>
                                        <p className="text-sm text-slate-400">Vagas disponíveis</p>
                                        <p className={`mt-2 text-3xl font-black xl:text-4xl ${
                                            getShiftTone(shift) === 'filled'
                                                ? 'text-sky-200'
                                                : getShiftTone(shift) === 'partial'
                                                    ? 'text-amber-100'
                                                    : 'text-rose-100'
                                        }`}>{shift.vagas}</p>
                                        <div className="mt-3 flex gap-4 text-xs text-slate-400">
                                            <span><span className="text-emerald-400 font-bold">{shift.vagasTotais}</span> totais</span>
                                            <span><span className="text-rose-400 font-bold">{shift.vagasOcupadas}</span> ocupadas</span>
                                        </div>
                                        <p className={`mt-3 text-xs uppercase tracking-[0.2em] ${
                                            getShiftTone(shift) === 'filled'
                                                ? 'text-sky-200/80'
                                                : getShiftTone(shift) === 'partial'
                                                    ? 'text-amber-200/80'
                                                    : 'text-rose-200/80'
                                        }`}>{shift.status}</p>
                                    </div>

                                    {shift.medicos?.length ? (
                                        <div className="grid gap-2.5">
                                            {shift.medicos.map((doctor) => (
                                                <div key={doctor.agendamentoId} className="min-w-0 overflow-hidden rounded-2xl border border-emerald-400/15 bg-emerald-500/5 px-3 py-3">
                                                    <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-start 2xl:justify-between">
                                                        <div className="min-w-0">
                                                            <div className="flex items-center gap-2 text-white">
                                                                <UserRoundCheck size={16} className="shrink-0 text-emerald-400" />
                                                                <span className="min-w-0 break-words text-lg font-black leading-tight">{doctor.nome}</span>
                                                            </div>
                                                            <div className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-500">CRM</div>
                                                            <div className="mt-1 break-words text-sm font-semibold text-slate-200">{doctor.crm || 'Não informado'}</div>
                                                            <div className="mt-3 text-xs uppercase tracking-[0.18em] text-slate-500">Tipo de plantão</div>
                                                            <div className="mt-1 inline-flex max-w-full break-words rounded-full border border-amber-400/20 bg-amber-500/10 px-3 py-1 text-xs font-bold text-amber-200">
                                                                {formatBookingType(doctor)}
                                                            </div>
                                                        </div>

                                                        <div className="min-w-0 2xl:text-right">
                                                            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-slate-500 2xl:justify-end">
                                                                <Stethoscope size={14} />
                                                                Especialidade
                                                            </div>
                                                            <div className="mt-1 break-words text-sm font-semibold text-slate-200">{doctor.especialidade || 'Não informada'}</div>
                                                            <div className="mt-3 flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-slate-500 2xl:justify-end">
                                                                <Phone size={14} />
                                                                Contato
                                                            </div>
                                                            <div className="mt-1 break-words text-sm font-semibold text-slate-200">{doctor.telefone || 'Não informado'}</div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 px-4 py-5 text-sm text-slate-400">
                                            Nenhum médico alocado neste turno.
                                        </div>
                                    )}
                                </article>
                            ))}
                        </div>
                    )}
                </>
            )}
        </section>
    );
}




