import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, MapPin, Stethoscope, UserRoundCheck, Phone, Users } from 'lucide-react';
import { readApiResponse } from '../utils/api';

const shiftOrder = ['Manhã', 'Tarde', 'Noite', 'Madrugada'];
const weekdayLabels = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
const monthFormatter = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' });
const weekdayFormatter = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'America/Sao_Paulo' });
const weekdayIndexByShortName = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

const getTodayKey = () => new Date().toISOString().slice(0, 10);
const getMonthKeyFromDate = (dateString) => dateString.slice(0, 7);
const getMonthAnchorDate = (month) => new Date(`${month}-01T12:00:00-03:00`);
const getMonthTitle = (month) => monthFormatter.format(getMonthAnchorDate(month));

const formatDateLabel = (dateString) =>
    new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        timeZone: 'America/Sao_Paulo'
    }).format(new Date(`${dateString}T12:00:00-03:00`));

const shiftMonth = (month, delta) => {
    const [year, monthIndex] = month.split('-').map(Number);
    const date = new Date(Date.UTC(year, monthIndex - 1 + delta, 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
};

const buildCalendarDays = (month, daySummary) => {
    const [year, monthIndex] = month.split('-').map(Number);
    const firstDay = getMonthAnchorDate(month);
    const totalDays = new Date(Date.UTC(year, monthIndex, 0)).getUTCDate();
    const leadingBlankDays = weekdayIndexByShortName[weekdayFormatter.format(firstDay)] ?? 0;
    const summaryByDate = new Map((daySummary || []).map((entry) => [entry.date, entry]));
    const days = [];

    for (let index = 0; index < leadingBlankDays; index += 1) {
        days.push({ key: `blank-${index}`, empty: true });
    }

    for (let day = 1; day <= totalDays; day += 1) {
        const date = `${month}-${String(day).padStart(2, '0')}`;
        days.push({
            key: date,
            date,
            day,
            summary: summaryByDate.get(date) || null
        });
    }

    return days;
};

const CalendarPopover = ({ month, selectedDate, daySummary, onMonthChange, onDateSelect, onClose }) => {
    const calendarDays = useMemo(() => buildCalendarDays(month, daySummary), [month, daySummary]);

    const getDayClasses = (entry) => {
        if (entry.empty) {
            return 'invisible';
        }

        const isSelected = entry.date === selectedDate;
        const hasDoctors = entry.summary?.hasDoctors;
        const hasShifts = entry.summary?.shifts > 0;

        if (isSelected) {
            return 'border border-amber-300 bg-amber-400/20 text-amber-100 shadow-[0_0_18px_rgba(251,191,36,0.25)]';
        }

        if (hasDoctors) {
            return 'border border-sky-400/30 bg-sky-500/10 text-sky-100 animate-pulse shadow-[0_0_18px_rgba(56,189,248,0.18)]';
        }

        if (hasShifts) {
            return 'border border-rose-400/30 bg-rose-500/10 text-rose-100 animate-pulse shadow-[0_0_18px_rgba(244,63,94,0.14)]';
        }

        return 'border border-slate-800 bg-slate-950/60 text-slate-300 hover:border-slate-600';
    };

    return (
        <div className="absolute left-0 top-[calc(100%+0.75rem)] z-20 w-full rounded-[2rem] border border-slate-700 bg-slate-950/95 p-4 shadow-2xl shadow-slate-950/80 backdrop-blur-xl sm:w-[380px]">
            <div className="mb-4 flex items-center gap-2 rounded-2xl border border-slate-800 bg-slate-900/80 p-2">
                <button
                    type="button"
                    onClick={() => onMonthChange(-1)}
                    className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-800 hover:text-white"
                >
                    <ChevronLeft size={16} />
                </button>
                <div className="min-w-0 flex-1 text-center text-sm font-black capitalize text-white">
                    {getMonthTitle(month)}
                </div>
                <button
                    type="button"
                    onClick={() => onMonthChange(1)}
                    className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-800 hover:text-white"
                >
                    <ChevronRight size={16} />
                </button>
            </div>

            <div className="mb-3 grid grid-cols-7 gap-2">
                {weekdayLabels.map((label) => (
                    <div key={label} className="py-1 text-center text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                        {label}
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-7 gap-2">
                {calendarDays.map((entry) =>
                    entry.empty ? (
                        <div key={entry.key} className="h-12" />
                    ) : (
                        <button
                            key={entry.key}
                            type="button"
                            onClick={() => {
                                onDateSelect(entry.date);
                                onClose();
                            }}
                            className={`flex h-12 flex-col items-center justify-center rounded-xl text-xs font-bold transition ${getDayClasses(entry)}`}
                        >
                            <span>{String(entry.day).padStart(2, '0')}</span>
                            {entry.summary?.shifts ? (
                                <span className="mt-1 text-[9px] font-semibold uppercase tracking-[0.12em] opacity-75">
                                    {entry.summary.doctorsAllocated}
                                </span>
                            ) : null}
                        </button>
                    )
                )}
            </div>

            <div className="mt-4 grid gap-2 text-[11px] text-slate-400">
                <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full border border-sky-400 bg-sky-500/20 animate-pulse" />
                    Dias com médicos agendados
                </div>
                <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full border border-rose-400 bg-rose-500/20 animate-pulse" />
                    Dias com turnos sem médicos alocados
                </div>
            </div>
        </div>
    );
};

export default function AgendaPage() {
    const [units, setUnits] = useState([]);
    const [selectedUnitId, setSelectedUnitId] = useState('');
    const [selectedDate, setSelectedDate] = useState(getTodayKey);
    const [calendarMonth, setCalendarMonth] = useState(getMonthKeyFromDate(getTodayKey()));
    const [showCalendar, setShowCalendar] = useState(false);
    const [agenda, setAgenda] = useState(null);
    const [monthSummary, setMonthSummary] = useState([]);
    const [loadingUnits, setLoadingUnits] = useState(true);
    const [loadingAgenda, setLoadingAgenda] = useState(false);
    const [loadingSummary, setLoadingSummary] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        const loadUnits = async () => {
            setLoadingUnits(true);
            try {
                const response = await fetch('/api/manager/unidades');
                const data = await readApiResponse(response);

                if (!response.ok) throw new Error(data.error || 'Falha ao carregar unidades.');

                setUnits(data || []);
                if (data?.[0]?.id) {
                    setSelectedUnitId((current) => current || data[0].id);
                }
            } catch (err) {
                setError(err.message);
            } finally {
                setLoadingUnits(false);
            }
        };

        loadUnits();
    }, []);

    useEffect(() => {
        if (!selectedUnitId || !selectedDate) return;

        const loadAgenda = async () => {
            setLoadingAgenda(true);
            setError('');

            try {
                const response = await fetch(`/api/manager/agenda?unidadeId=${selectedUnitId}&date=${selectedDate}`);
                const data = await readApiResponse(response);

                if (!response.ok) throw new Error(data.error || 'Falha ao carregar agenda.');

                setAgenda(data);
            } catch (err) {
                setError(err.message);
                setAgenda(null);
            } finally {
                setLoadingAgenda(false);
            }
        };

        loadAgenda();
    }, [selectedUnitId, selectedDate]);

    useEffect(() => {
        if (!selectedUnitId || !calendarMonth) return;

        const loadSummary = async () => {
            setLoadingSummary(true);
            try {
                const response = await fetch(`/api/manager/agenda/resumo?unidadeId=${selectedUnitId}&month=${calendarMonth}`);
                const data = await readApiResponse(response);

                if (!response.ok) throw new Error(data.error || 'Falha ao carregar resumo mensal da agenda.');

                setMonthSummary(data.days || []);
            } catch (err) {
                setMonthSummary([]);
                setError(err.message);
            } finally {
                setLoadingSummary(false);
            }
        };

        loadSummary();
    }, [selectedUnitId, calendarMonth]);

    const orderedShifts = useMemo(() => {
        const shifts = agenda?.shifts || [];
        return [...shifts].sort((left, right) => shiftOrder.indexOf(left.turno) - shiftOrder.indexOf(right.turno));
    }, [agenda]);

    return (
        <div className="animate-in fade-in zoom-in-95 duration-500">
            <div className="mb-8">
                <h2 className="text-3xl font-black text-white">Agenda de Plantões</h2>
                <p className="mt-2 text-sm text-slate-400">
                    Filtre por unidade e data para ver os turnos do dia e quais médicos já estão alocados em cada um.
                </p>
            </div>

            <section className="rounded-[2rem] border border-slate-800 bg-slate-900/75 p-4 shadow-2xl sm:p-6">
                <div className="grid gap-4 border-b border-slate-800 pb-6 md:grid-cols-2">
                    <div>
                        <label className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-slate-500">
                            <MapPin size={14} className="text-sky-400" />
                            Unidade
                        </label>
                        <select
                            value={selectedUnitId}
                            onChange={(event) => setSelectedUnitId(event.target.value)}
                            disabled={loadingUnits}
                            className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition focus:border-sky-400"
                        >
                            <option value="">{loadingUnits ? 'Carregando unidades...' : 'Selecione uma unidade'}</option>
                            {units.map((unit) => (
                                <option key={unit.id} value={unit.id}>
                                    {unit.nome}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="relative">
                        <label className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-slate-500">
                            <CalendarDays size={14} className="text-emerald-400" />
                            Data
                        </label>
                        <button
                            type="button"
                            onClick={() => setShowCalendar((current) => !current)}
                            className="flex w-full items-center justify-between rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-left text-sm text-white outline-none transition hover:border-emerald-400"
                        >
                            <span>{formatDateLabel(selectedDate)}</span>
                            <span className="text-xs font-black uppercase tracking-[0.18em] text-emerald-300">
                                {loadingSummary ? 'Carregando...' : getMonthTitle(calendarMonth)}
                            </span>
                        </button>

                        {showCalendar ? (
                            <CalendarPopover
                                month={calendarMonth}
                                selectedDate={selectedDate}
                                daySummary={monthSummary}
                                onMonthChange={(delta) => setCalendarMonth((current) => shiftMonth(current, delta))}
                                onDateSelect={(date) => {
                                    setSelectedDate(date);
                                    setCalendarMonth(getMonthKeyFromDate(date));
                                }}
                                onClose={() => setShowCalendar(false)}
                            />
                        ) : null}
                    </div>
                </div>

                <div className="mt-6">
                    {error && (
                        <div className="mb-6 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                            {error}
                        </div>
                    )}

                    {loadingAgenda ? (
                        <div className="flex h-48 items-center justify-center rounded-3xl border border-slate-800 bg-slate-950/30">
                            <div className="h-8 w-8 animate-spin rounded-full border-4 border-sky-500 border-t-transparent" />
                        </div>
                    ) : (
                        <>
                            <div className="mb-6 flex flex-col gap-2 rounded-3xl border border-slate-800 bg-slate-950/40 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                    <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">Filtro atual</p>
                                    <h3 className="mt-1 text-xl font-black text-white">{agenda?.unit?.nome || 'Unidade não selecionada'}</h3>
                                </div>
                                <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-2 text-sm font-bold text-emerald-300">
                                    {formatDateLabel(selectedDate)}
                                </div>
                            </div>

                            {orderedShifts.length === 0 ? (
                                <div className="flex min-h-56 flex-col items-center justify-center rounded-3xl border border-dashed border-slate-800 bg-slate-950/30 px-6 text-center">
                                    <Users size={34} className="mb-4 text-slate-600" />
                                    <p className="text-lg font-bold text-slate-300">Nenhum turno encontrado para esse filtro.</p>
                                    <p className="mt-2 text-sm text-slate-500">
                                        Ajuste a unidade ou a data, ou gere a previsão para preencher a disponibilidade.
                                    </p>
                                </div>
                            ) : (
                                <div className="grid gap-5 xl:grid-cols-2">
                                    {orderedShifts.map((shift) => (
                                        <article key={shift.id} className="rounded-3xl border border-slate-800 bg-slate-950/40 p-5 shadow-xl shadow-slate-950/20">
                                            <div className="mb-4 flex items-start justify-between gap-3">
                                                <div>
                                                    <span className="inline-flex rounded-full border border-sky-400/20 bg-sky-500/10 px-3 py-1 text-xs font-black uppercase tracking-[0.2em] text-sky-300">
                                                        {shift.turno}
                                                    </span>
                                                    <h4 className="mt-3 text-xl font-black text-white">{shift.local}</h4>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Status</div>
                                                    <div className="mt-1 text-sm font-bold text-slate-200">{shift.status}</div>
                                                </div>
                                            </div>

                                            <div className="mb-5 grid gap-3 sm:grid-cols-3">
                                                <div className="rounded-2xl border border-slate-800 bg-slate-900/80 px-4 py-3">
                                                    <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Vagas totais</div>
                                                    <div className="mt-2 text-2xl font-black text-white">{shift.vagasTotais}</div>
                                                </div>
                                                <div className="rounded-2xl border border-slate-800 bg-slate-900/80 px-4 py-3">
                                                    <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Ocupadas</div>
                                                    <div className="mt-2 text-2xl font-black text-sky-300">{shift.vagasOcupadas}</div>
                                                </div>
                                                <div className="rounded-2xl border border-slate-800 bg-slate-900/80 px-4 py-3">
                                                    <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Disponíveis</div>
                                                    <div className="mt-2 text-2xl font-black text-emerald-300">{shift.vagasDisponiveis}</div>
                                                </div>
                                            </div>

                                            {shift.medicos.length === 0 ? (
                                                <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 px-4 py-5 text-sm text-slate-400">
                                                    Nenhum médico alocado neste turno.
                                                </div>
                                            ) : (
                                                <div className="grid gap-3">
                                                    {shift.medicos.map((doctor) => (
                                                        <div key={doctor.agendamentoId} className="rounded-2xl border border-emerald-400/15 bg-emerald-500/5 px-4 py-4">
                                                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                                                <div>
                                                                    <div className="flex items-center gap-2 text-white">
                                                                        <UserRoundCheck size={16} className="text-emerald-400" />
                                                                        <span className="font-black">{doctor.nome}</span>
                                                                    </div>
                                                                    <div className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-500">CRM</div>
                                                                    <div className="mt-1 text-sm font-semibold text-slate-200">{doctor.crm || 'Não informado'}</div>
                                                                </div>

                                                                <div className="sm:text-right">
                                                                    <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-slate-500 sm:justify-end">
                                                                        <Stethoscope size={14} />
                                                                        Especialidade
                                                                    </div>
                                                                    <div className="mt-1 text-sm font-semibold text-slate-200">{doctor.especialidade || 'Não informada'}</div>
                                                                    <div className="mt-3 flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-slate-500 sm:justify-end">
                                                                        <Phone size={14} />
                                                                        Contato
                                                                    </div>
                                                                    <div className="mt-1 text-sm font-semibold text-slate-200">{doctor.telefone || 'Não informado'}</div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </article>
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </section>
        </div>
    );
}
