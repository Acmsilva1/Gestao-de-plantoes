import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, MapPin, Eye, ArrowLeft, AlertTriangle } from 'lucide-react';

const weekdayLabels = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const monthFormatter = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' });
const weekdayFormatter = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'America/Sao_Paulo' });
const fullDateFormatter = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' });
const weekdayIndexByShortName = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

const getMonthAnchorDate = (month) => new Date(`${month}-01T12:00:00-03:00`);
const getMonthTitle = (month) => monthFormatter.format(getMonthAnchorDate(month));
const formatDisplayDate = (ds) => fullDateFormatter.format(new Date(`${ds}T12:00:00-03:00`)).replace(/\//g, '-');

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
    if (shift.status === 'CANCELADO') {
        return 'cancelled';
    }

    if (shift.vagas <= 0) {
        return 'full';
    }

    if (shift.vagasOcupadas > 0) {
        return 'partial';
    }

    return 'open';
};

const getShiftClasses = (shift) => {
    const tone = getShiftTone(shift);

    if (tone === 'cancelled') {
        return 'border border-slate-600/70 bg-slate-800/70 text-slate-200';
    }

    if (tone === 'full') {
        return 'border border-rose-400/70 bg-rose-500/10 text-rose-100 animate-pulse shadow-[0_0_0_1px_rgba(251,113,133,0.2),0_0_18px_rgba(244,63,94,0.16)]';
    }

    if (tone === 'partial') {
        return 'border border-amber-400/60 bg-amber-500/10 text-amber-100 animate-pulse shadow-[0_0_0_1px_rgba(251,191,36,0.14),0_0_18px_rgba(245,158,11,0.16)]';
    }

    return 'border border-emerald-300/55 bg-emerald-500/18 text-emerald-50 shadow-[0_0_0_1px_rgba(110,231,183,0.18),0_0_22px_rgba(16,185,129,0.18)]';
};

const getDayCardClasses = (shifts) => {
    const tones = shifts.map(getShiftTone);

    if (tones.includes('full')) {
        return 'border-rose-400/60 shadow-[0_0_0_1px_rgba(251,113,133,0.18),0_0_24px_rgba(244,63,94,0.14)]';
    }

    if (tones.includes('partial')) {
        return 'border-sky-400/50 shadow-[0_0_0_1px_rgba(56,189,248,0.18),0_0_24px_rgba(14,165,233,0.12)]';
    }

    if (tones.includes('open')) {
        return 'border-emerald-300/70 shadow-[0_0_0_1px_rgba(110,231,183,0.2),0_0_24px_rgba(16,185,129,0.18)]';
    }

    if (tones.includes('cancelled')) {
        return 'border-slate-700 shadow-[0_0_0_1px_rgba(51,65,85,0.2)]';
    }

    return 'border-slate-800';
};

const getShiftBadgeClasses = (shift) => {
    const tone = getShiftTone(shift);

    if (tone === 'cancelled') {
        return 'border border-slate-600/70 bg-slate-800/80 text-slate-200';
    }

    if (tone === 'full') {
        return 'border border-rose-400/40 bg-rose-500/10 text-rose-200';
    }

    if (tone === 'partial') {
        return 'border border-amber-400/40 bg-amber-500/10 text-amber-200';
    }

    return 'border border-emerald-300/55 bg-emerald-500/15 text-emerald-100';
};

const getShiftPanelClasses = (shift) => {
    const tone = getShiftTone(shift);

    if (tone === 'cancelled') {
        return 'bg-slate-800/80 ring-1 ring-slate-700/70';
    }

    if (tone === 'full') {
        return 'bg-rose-950/30 ring-1 ring-rose-400/30 animate-pulse';
    }

    if (tone === 'partial') {
        return 'bg-amber-950/20 ring-1 ring-amber-400/25 animate-pulse';
    }

    return 'bg-emerald-950/25 ring-1 ring-emerald-300/35';
};

export default function ManagerCalendar({ units = [] }) {
    const [calMonth, setCalMonth] = useState(new Date().toISOString().slice(0, 7));
    const [calUnit, setCalUnit] = useState(null);
    const [calData, setCalData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [selectedDay, setSelectedDay] = useState(null);

    useEffect(() => {
        if (units.length > 0 && !calUnit) setCalUnit(units[0].id);
    }, [units]);

    useEffect(() => {
        if (!calUnit) return;
        const fetchCal = async () => {
            setLoading(true);
            setSelectedDay(null);
            try {
                const res = await fetch(`/api/manager/calendario/${calUnit}?month=${calMonth}`);
                if (res.ok) setCalData(await res.json());
            } catch {}
            setLoading(false);
        };
        fetchCal();
    }, [calUnit, calMonth]);

    const calendarDays = useMemo(
        () => buildCalendarDays(calMonth, calData?.shifts || []),
        [calMonth, calData]
    );

    const selectedDayShifts = useMemo(() => {
        if (!selectedDay) return [];
        return (calData?.shifts || []).filter(s => s.data === selectedDay);
    }, [calData, selectedDay]);

    const selectedUnitName = units.find(u => u.id === calUnit)?.nome || '';
    const outsideForecast = isOutsideForecastWindow(calMonth);
    const { current: forecastCurrent, next: forecastNext } = getForecastWindow();

    /* ——— Controls shown only in calendar view ——— */
    const CalendarControls = (
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
            <div className="flex items-center gap-2 rounded-2xl border border-slate-700 bg-slate-900/80 px-4 py-2">
                <MapPin size={14} className="text-sky-400 shrink-0" />
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
                            <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-4 py-1 text-xs font-bold text-emerald-300">
                                {calData.shifts.length} plantões no mês
                            </span>
                            <span className="rounded-full border border-rose-400/20 bg-rose-500/10 px-4 py-1 text-xs font-bold text-rose-300">
                                {calData.shifts.filter(s => s.vagas <= 0).length} esgotados
                            </span>
                            <span className="rounded-full border border-amber-400/20 bg-amber-500/10 px-4 py-1 text-xs font-bold text-amber-300">
                                {calData.shifts.filter(s => s.vagas > 0).length} com vagas
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

                            <div className="grid grid-cols-1 gap-2 md:grid-cols-7">
                                {calendarDays.map(entry =>
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

                    {selectedDayShifts.length === 0 ? (
                        <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-10 text-center text-slate-400">
                            Não há plantões disponíveis em {formatDisplayDate(selectedDay)}.
                        </div>
                    ) : (
                        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                            {selectedDayShifts.map(shift => (
                                <article
                                    key={shift.id}
                                    className={`rounded-3xl border bg-slate-900/80 p-6 shadow-2xl shadow-slate-950/40 transition duration-300 hover:-translate-y-1 ${
                                        getShiftTone(shift) === 'full'
                                            ? 'border-rose-400/70 shadow-[0_0_0_1px_rgba(251,113,133,0.28),0_0_28px_rgba(244,63,94,0.2)]'
                                            : getShiftTone(shift) === 'partial'
                                                ? 'border-amber-400/50 shadow-[0_0_0_1px_rgba(251,191,36,0.18),0_0_24px_rgba(245,158,11,0.14)]'
                                                : getShiftTone(shift) === 'open'
                                                    ? 'border-emerald-400/30 shadow-[0_0_0_1px_rgba(52,211,153,0.12),0_0_24px_rgba(16,185,129,0.1)]'
                                                    : 'border-slate-700'
                                    }`}
                                >
                                    <div className="mb-5 flex items-start justify-between gap-3">
                                        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.2em] ${getShiftBadgeClasses(shift)}`}>
                                            {shift.turno}
                                        </span>
                                        <span className="text-sm text-slate-400">{formatDisplayDate(shift.data)}</span>
                                    </div>

                                    <div className={`mb-5 rounded-2xl p-4 ${getShiftPanelClasses(shift)}`}>
                                        <p className="text-sm text-slate-400">Vagas disponíveis</p>
                                        <p className={`mt-2 text-4xl font-black ${
                                            getShiftTone(shift) === 'full'
                                                ? 'text-rose-200'
                                                : getShiftTone(shift) === 'partial'
                                                    ? 'text-amber-100'
                                                    : getShiftTone(shift) === 'open'
                                                        ? 'text-emerald-100'
                                                        : 'text-slate-200'
                                        }`}>{shift.vagas}</p>
                                        <div className="mt-3 flex gap-4 text-xs text-slate-400">
                                            <span><span className="text-emerald-400 font-bold">{shift.vagasTotais}</span> totais</span>
                                            <span><span className="text-rose-400 font-bold">{shift.vagasOcupadas}</span> ocupadas</span>
                                        </div>
                                        <p className={`mt-3 text-xs uppercase tracking-[0.2em] ${
                                            getShiftTone(shift) === 'full'
                                                ? 'text-rose-200/80'
                                                : getShiftTone(shift) === 'partial'
                                                    ? 'text-amber-200/80'
                                                    : getShiftTone(shift) === 'open'
                                                        ? 'text-emerald-200/70'
                                                        : 'text-slate-400'
                                        }`}>{shift.status}</p>
                                    </div>
                                </article>
                            ))}
                        </div>
                    )}
                </>
            )}
        </section>
    );
}
