import React, { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { readApiResponse } from '../utils/api';
import { useManagerEscalaSidebar } from '../context/ManagerEscalaSidebarContext.jsx';

const UNIT_SHIFT_ORDER = ['Manhã', 'Tarde', 'Noite', 'Madrugada'];

const weekdayLabels = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const monthFormatter = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' });
const weekdayFormatter = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'America/Sao_Paulo' });
const weekdayIndexByShortName = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

const getMonthAnchorDate = (monthKey) => new Date(`${monthKey}-01T12:00:00-03:00`);
const getMonthTitle = (monthKey) =>
    monthFormatter.format(getMonthAnchorDate(monthKey)).replace(/^\w/, (c) => c.toUpperCase());

const buildCalendarDayEntries = (monthKey, monthLinhas) => {
    const byKey = new Map();
    for (const row of monthLinhas || []) {
        const k = `${row.data_plantao}|${row.turno}`;
        if (!byKey.has(k)) {
            byKey.set(k, { data: row.data_plantao, turno: row.turno, linhas: [] });
        }
        byKey.get(k).linhas.push(row);
    }
    const shifts = [...byKey.values()];

    const [year, monthIndex] = monthKey.split('-').map(Number);
    const firstDay = getMonthAnchorDate(monthKey);
    const totalDays = new Date(Date.UTC(year, monthIndex, 0)).getUTCDate();
    const leadingBlankDays = weekdayIndexByShortName[weekdayFormatter.format(firstDay)] ?? 0;

    const days = [];
    for (let index = 0; index < leadingBlankDays; index += 1) {
        days.push({ key: `blank-${index}`, empty: true });
    }

    for (let day = 1; day <= totalDays; day += 1) {
        const date = `${monthKey}-${String(day).padStart(2, '0')}`;
        const byTurn = Object.fromEntries(UNIT_SHIFT_ORDER.map((t) => [t, null]));
        for (const s of shifts) {
            if (s.data === date && Object.prototype.hasOwnProperty.call(byTurn, s.turno)) {
                byTurn[s.turno] = s;
            }
        }
        const turnSlots = UNIT_SHIFT_ORDER.map((turno) => ({ turno, slot: byTurn[turno] }));
        days.push({ key: `day-${day}`, empty: false, day, date, turnSlots });
    }
    return days;
};

export default function ManagerEscalaEditorPage() {
    const { selectedMedicoId } = useManagerEscalaSidebar();
    const [units, setUnits] = useState([]);
    const [unitId, setUnitId] = useState('');
    const [year, setYear] = useState(() => new Date().getFullYear());
    const [editor, setEditor] = useState(null);
    const [expanded, setExpanded] = useState({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [busyKey, setBusyKey] = useState(null);
    const [addOpen, setAddOpen] = useState(null);

    useEffect(() => {
        fetch('/api/manager/unidades')
            .then((r) => (r.ok ? r.json() : []))
            .then(setUnits)
            .catch(() => setUnits([]));
    }, []);

    const loadEditor = useCallback(async () => {
        if (!unitId) {
            setEditor(null);
            return;
        }
        setLoading(true);
        setError('');
        try {
            const r = await fetch(`/api/manager/escala-editor?unidadeId=${encodeURIComponent(unitId)}&year=${year}`);
            const data = await readApiResponse(r);
            if (!r.ok) throw new Error(data.error || data.details || 'Não foi possível carregar o editor.');
            setEditor(data);
        } catch (e) {
            setError(e.message);
            setEditor(null);
        } finally {
            setLoading(false);
        }
    }, [unitId, year]);

    useEffect(() => {
        loadEditor();
    }, [loadEditor]);

    const setMesVisibilidade = async (mesKey, status) => {
        if (!unitId) return;
        setBusyKey(`pub-${mesKey}`);
        setError('');
        try {
            const r = await fetch('/api/manager/escala/mes-visibilidade', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ unidadeId, mes: mesKey, status })
            });
            const data = await readApiResponse(r);
            if (!r.ok) throw new Error(data.error || data.details || 'Falha ao gravar visibilidade.');
            await loadEditor();
        } catch (e) {
            setError(e.message);
        } finally {
            setBusyKey(null);
        }
    };

    const addLinha = async (date, turno) => {
        if (!unitId || !selectedMedicoId) {
            setError('Selecione um médico na barra lateral (lista abaixo do menu).');
            return;
        }
        setBusyKey(`${date}|${turno}`);
        setError('');
        try {
            const r = await fetch('/api/manager/escala/linha', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    unidadeId,
                    medicoId: selectedMedicoId,
                    data_plantao: date,
                    turno
                })
            });
            const data = await readApiResponse(r);
            if (!r.ok) throw new Error(data.error || data.details || 'Falha ao adicionar plantonista.');
            setAddOpen(null);
            await loadEditor();
        } catch (e) {
            setError(e.message);
        } finally {
            setBusyKey(null);
        }
    };

    const removeLinha = async (rowId) => {
        if (!unitId) return;
        setBusyKey(`del-${rowId}`);
        setError('');
        try {
            const r = await fetch(`/api/manager/escala/linha/${rowId}?unidadeId=${encodeURIComponent(unitId)}`, {
                method: 'DELETE'
            });
            const data = await readApiResponse(r);
            if (!r.ok) throw new Error(data.error || data.details || 'Falha ao remover.');
            await loadEditor();
        } catch (e) {
            setError(e.message);
        } finally {
            setBusyKey(null);
        }
    };

    const toggleMonth = (mesKey) => {
        setExpanded((prev) => ({ ...prev, [mesKey]: !prev[mesKey] }));
    };

    const y0 = new Date().getFullYear();
    const yearOptions = [];
    for (let y = y0 - 1; y <= y0 + 2; y += 1) yearOptions.push(y);

    const pubLabel = (pub) => {
        if (!pub) return 'Regra padrão (futuro oculto aos médicos até liberar)';
        if (pub.status === 'LIBERADO') return 'Liberado aos médicos';
        return 'Bloqueado aos médicos';
    };

    return (
        <div className="w-full max-w-none animate-in fade-in duration-500">
            <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h2 className="text-3xl font-black text-white">Editor de escala</h2>
                    <p className="mt-2 max-w-3xl text-sm text-slate-400">
                        Monte a escala por unidade e ano. Selecione o plantonista na barra lateral. Use <span className="text-slate-300">Liberado</span> para médicos verem o mês
                        mesmo quando for futuro; use <span className="text-slate-300">Bloqueado</span> para ocultar a grelha na área do médico.
                    </p>
                </div>
            </div>

            {error ? (
                <div className="mb-6 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>
            ) : null}

            <div className="min-w-0 space-y-6">
                    <div className="flex flex-col gap-4 rounded-3xl border border-slate-800 bg-slate-900/40 p-4 sm:flex-row sm:flex-wrap sm:items-end">
                        <div>
                            <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-500">Unidade</label>
                            <select
                                value={unitId}
                                onChange={(e) => {
                                    setUnitId(e.target.value);
                                    setAddOpen(null);
                                }}
                                className="min-w-[220px] rounded-2xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm font-bold text-white outline-none focus:border-sky-400"
                            >
                                <option value="">Escolha a unidade</option>
                                {units.map((u) => (
                                    <option key={u.id} value={u.id}>
                                        {u.nome}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-500">Ano</label>
                            <select
                                value={year}
                                onChange={(e) => setYear(Number(e.target.value))}
                                className="min-w-[120px] rounded-2xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm font-bold text-white outline-none focus:border-sky-400"
                            >
                                {yearOptions.map((y) => (
                                    <option key={y} value={y}>
                                        {y}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {!unitId ? (
                        <div className="rounded-3xl border border-slate-800 bg-slate-950/40 px-6 py-12 text-center text-slate-500">
                            Selecione uma unidade para carregar os meses.
                        </div>
                    ) : loading ? (
                        <div className="rounded-3xl border border-slate-800 bg-slate-950/40 px-6 py-12 text-center text-slate-400">A carregar…</div>
                    ) : editor?.months ? (
                        <div className="space-y-3">
                            {editor.months.map((m) => {
                                const isOpen = Boolean(expanded[m.mes]);
                                const count = m.linhas?.length ?? 0;
                                return (
                                    <div key={m.mes} className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/40">
                                        <button
                                            type="button"
                                            onClick={() => toggleMonth(m.mes)}
                                            className="flex w-full items-center gap-3 px-4 py-4 text-left transition hover:bg-slate-800/40 sm:px-6"
                                        >
                                            {isOpen ? <ChevronDown className="h-5 w-5 shrink-0 text-slate-500" /> : <ChevronRight className="h-5 w-5 shrink-0 text-slate-500" />}
                                            <div className="min-w-0 flex-1">
                                                <span className="font-black text-white capitalize">{getMonthTitle(m.mes)}</span>
                                                <span className="mt-1 block text-xs text-slate-500">
                                                    {count} linha(s) · {pubLabel(m.publicacao)}
                                                </span>
                                            </div>
                                        </button>

                                        {isOpen ? (
                                            <div className="border-t border-slate-800 px-4 pb-5 pt-2 sm:px-6">
                                                <div className="mb-4 flex flex-wrap items-center gap-2">
                                                    <span className="text-xs font-bold text-slate-500">Visibilidade para médicos:</span>
                                                    <button
                                                        type="button"
                                                        disabled={Boolean(busyKey)}
                                                        onClick={() => setMesVisibilidade(m.mes, 'LIBERADO')}
                                                        className="rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-black text-emerald-200 hover:bg-emerald-500/25 disabled:opacity-50"
                                                    >
                                                        Liberado
                                                    </button>
                                                    <button
                                                        type="button"
                                                        disabled={Boolean(busyKey)}
                                                        onClick={() => setMesVisibilidade(m.mes, 'BLOQUEADO')}
                                                        className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs font-black text-rose-200 hover:bg-rose-500/20 disabled:opacity-50"
                                                    >
                                                        Bloqueado
                                                    </button>
                                                </div>

                                                <div className="mb-4 hidden grid-cols-7 gap-3 md:grid">
                                                    {weekdayLabels.map((label) => (
                                                        <div key={label} className="px-1 py-2 text-center text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                                            {label}
                                                        </div>
                                                    ))}
                                                </div>

                                                <div className="grid grid-cols-1 gap-2 md:grid md:grid-cols-7 md:gap-3">
                                                    {buildCalendarDayEntries(m.mes, m.linhas).map((entry) =>
                                                        entry.empty ? (
                                                            <div key={entry.key} className="hidden min-h-[8rem] rounded-2xl border border-transparent md:block" />
                                                        ) : (
                                                            <div
                                                                key={entry.key}
                                                                className="flex min-h-[10rem] flex-col rounded-2xl border border-slate-800 bg-slate-950/50 p-2 md:min-h-[14rem]"
                                                            >
                                                                <div className="mb-2 flex items-center justify-between gap-1">
                                                                    <span className="text-xs font-bold text-white">{String(entry.day).padStart(2, '0')}</span>
                                                                </div>
                                                                <div className="flex flex-1 flex-col gap-1">
                                                                    {entry.turnSlots.map(({ turno, slot }) => {
                                                                        const addKey = `${entry.date}|${turno}`;
                                                                        const busyHere = busyKey === addKey;
                                                                        return (
                                                                            <div
                                                                                key={`${entry.date}-${turno}`}
                                                                                className="rounded-xl border border-slate-700/80 bg-slate-900/60 p-1.5"
                                                                            >
                                                                                <div className="mb-1 flex items-center justify-between gap-1">
                                                                                    <span className="text-[10px] font-black uppercase text-slate-400">{turno}</span>
                                                                                    <button
                                                                                        type="button"
                                                                                        disabled={Boolean(busyKey)}
                                                                                        onClick={() => setAddOpen((cur) => (cur === addKey ? null : addKey))}
                                                                                        className="text-[10px] font-bold text-sky-400 hover:text-sky-300 disabled:opacity-40"
                                                                                    >
                                                                                        {addOpen === addKey ? 'Fechar' : 'Adicionar'}
                                                                                    </button>
                                                                                </div>
                                                                                <div className="space-y-1">
                                                                                    {slot?.linhas?.length ? (
                                                                                        slot.linhas.map((row) => (
                                                                                            <div
                                                                                                key={row.id}
                                                                                                className="flex items-center justify-between gap-1 rounded-lg bg-slate-800/50 px-2 py-1"
                                                                                            >
                                                                                                <span className="break-words text-[10px] font-semibold leading-tight text-slate-200">
                                                                                                    {row.medicos?.nome ?? 'Médico'}
                                                                                                </span>
                                                                                                <button
                                                                                                    type="button"
                                                                                                    disabled={busyKey === `del-${row.id}`}
                                                                                                    onClick={() => removeLinha(row.id)}
                                                                                                    className="shrink-0 text-[10px] font-black text-rose-400 hover:text-rose-300 disabled:opacity-40"
                                                                                                    title="Remover"
                                                                                                >
                                                                                                    ✕
                                                                                                </button>
                                                                                            </div>
                                                                                        ))
                                                                                    ) : (
                                                                                        <p className="text-[10px] italic text-slate-600">Vazio</p>
                                                                                    )}
                                                                                </div>
                                                                                {addOpen === addKey ? (
                                                                                    <button
                                                                                        type="button"
                                                                                        disabled={busyHere}
                                                                                        onClick={() => addLinha(entry.date, turno)}
                                                                                        className="mt-1 w-full rounded-lg bg-sky-500/20 py-1 text-[10px] font-black text-sky-200 hover:bg-sky-500/30 disabled:opacity-50"
                                                                                    >
                                                                                        {busyHere ? '…' : 'Confirmar médico selecionado'}
                                                                                    </button>
                                                                                ) : null}
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                        )
                                                    )}
                                                </div>
                                            </div>
                                        ) : null}
                                    </div>
                                );
                            })}
                        </div>
                    ) : null}
            </div>
        </div>
    );
}
