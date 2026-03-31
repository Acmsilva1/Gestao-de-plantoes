import React, { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Copy, X } from 'lucide-react';
import { readApiResponse } from '../utils/api';

const UNIT_SHIFT_ORDER = ['Manhã', 'Tarde', 'Noite', 'Madrugada'];

const TURNO_SLUG = { Manhã: 'manha', Tarde: 'tarde', Noite: 'noite', Madrugada: 'madrugada' };

const slotScrollId = (date, turno) => `escala-slot-${date}-${TURNO_SLUG[turno] ?? 'turno'}`;

const weekdayLabels = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const monthFormatter = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' });
const weekdayFormatter = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'America/Sao_Paulo' });
const weekdayIndexByShortName = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

const getMonthAnchorDate = (monthKey) => new Date(`${monthKey}-01T12:00:00-03:00`);
const getMonthTitle = (monthKey) =>
    monthFormatter.format(getMonthAnchorDate(monthKey)).replace(/^\w/, (c) => c.toUpperCase());

const previousMonthKey = (mesDestino) => {
    const [y, m] = mesDestino.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1, 1));
    d.setUTCMonth(d.getUTCMonth() - 1);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

const formatDatePt = (isoDate) => {
    if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return isoDate || '';
    const [y, m, d] = isoDate.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(dt);
};

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
    const [units, setUnits] = useState([]);
    const [unitId, setUnitId] = useState('');
    const [year, setYear] = useState(() => new Date().getFullYear());
    const [editor, setEditor] = useState(null);
    const [expanded, setExpanded] = useState({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [busyKey, setBusyKey] = useState(null);
    const [doctors, setDoctors] = useState([]);
    const [doctorsLoading, setDoctorsLoading] = useState(false);
    const [addSlotModal, setAddSlotModal] = useState(null);
    const [modalMedicoId, setModalMedicoId] = useState('');
    const [modalError, setModalError] = useState('');

    useEffect(() => {
        fetch('/api/manager/unidades')
            .then((r) => (r.ok ? r.json() : []))
            .then(setUnits)
            .catch(() => setUnits([]));
    }, []);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setDoctorsLoading(true);
            try {
                const r = await fetch('/api/manager/medicos');
                const data = await readApiResponse(r);
                if (!cancelled) {
                    if (r.ok && Array.isArray(data)) setDoctors(data);
                    else setDoctors([]);
                }
            } catch {
                if (!cancelled) setDoctors([]);
            } finally {
                if (!cancelled) setDoctorsLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    const loadEditor = useCallback(
        async (options = {}) => {
            const preserveUi = options.preserveUi === true;
            if (!unitId) {
                setEditor(null);
                return;
            }
            if (!preserveUi) {
                setLoading(true);
            }
            setError('');
            try {
                const r = await fetch(`/api/manager/escala-editor?unidadeId=${encodeURIComponent(unitId)}&year=${year}`);
                const data = await readApiResponse(r);
                if (!r.ok) throw new Error(data.error || data.details || 'Não foi possível carregar o editor.');
                setEditor(data);
            } catch (e) {
                setError(e.message);
                if (!preserveUi) {
                    setEditor(null);
                }
            } finally {
                if (!preserveUi) {
                    setLoading(false);
                }
            }
        },
        [unitId, year]
    );

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
                body: JSON.stringify({ unidadeId: unitId, mes: mesKey, status })
            });
            const data = await readApiResponse(r);
            if (!r.ok) throw new Error(data.error || data.details || 'Falha ao gravar visibilidade.');
            await loadEditor({ preserveUi: true });
        } catch (e) {
            setError(e.message);
        } finally {
            setBusyKey(null);
        }
    };

    const addLinha = async (date, turno, medicoId) => {
        if (!unitId || !medicoId) {
            const msg = !unitId ? 'Selecione uma unidade acima.' : 'Escolha um médico na lista.';
            setModalError(msg);
            setError(msg);
            return;
        }
        setBusyKey(`${date}|${turno}`);
        setError('');
        setModalError('');
        try {
            const r = await fetch('/api/manager/escala/linha', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    unidadeId: String(unitId),
                    medicoId: String(medicoId),
                    data_plantao: date,
                    turno
                })
            });
            const data = await readApiResponse(r);
            if (!r.ok) {
                const msg = data.error || data.details || 'Falha ao adicionar plantonista.';
                throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
            }
            const mesKey = date.slice(0, 7);
            setExpanded((prev) => ({ ...prev, [mesKey]: true }));
            setAddSlotModal(null);
            setModalMedicoId('');
            setModalError('');
            await loadEditor({ preserveUi: true });
            window.requestAnimationFrame(() => {
                window.requestAnimationFrame(() => {
                    document.getElementById(slotScrollId(date, turno))?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                });
            });
        } catch (e) {
            const msg = e.message || 'Erro ao gravar.';
            setModalError(msg);
            setError(msg);
        } finally {
            setBusyKey(null);
        }
    };

    const confirmAddFromModal = async () => {
        if (!addSlotModal) return;
        if (!modalMedicoId) {
            setModalError('Escolha um médico na lista antes de confirmar.');
            return;
        }
        if (!unitId) {
            setModalError('Selecione uma unidade acima.');
            return;
        }
        await addLinha(addSlotModal.date, addSlotModal.turno, modalMedicoId);
    };

    const openAddMedicoModal = (date, turno) => {
        setError('');
        setModalError('');
        setModalMedicoId('');
        setAddSlotModal({ date, turno });
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
            await loadEditor({ preserveUi: true });
        } catch (e) {
            setError(e.message);
        } finally {
            setBusyKey(null);
        }
    };

    const importarMesAnterior = async (mesDestino) => {
        if (!unitId) return;
        const mesOrigem = previousMonthKey(mesDestino);
        const tituloOrigem = getMonthTitle(mesOrigem);
        const tituloDest = getMonthTitle(mesDestino);
        if (
            !window.confirm(
                `Importar todos os plantões de ${tituloOrigem} para ${tituloDest}?\n\n` +
                    'O dia 1 do mês de origem corresponde ao dia 1 deste mês, com os mesmos turnos (Manhã, Tarde, Noite, Madrugada) e médicos. Linhas que já existirem no destino serão ignoradas.'
            )
        ) {
            return;
        }
        setBusyKey(`imp-${mesDestino}`);
        setError('');
        try {
            const r = await fetch('/api/manager/escala/importar-mes-anterior', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ unidadeId: unitId, mesDestino })
            });
            const data = await readApiResponse(r);
            if (!r.ok) throw new Error(data.error || data.details || 'Falha ao importar mês anterior.');
            setExpanded((prev) => ({ ...prev, [mesDestino]: true }));
            await loadEditor({ preserveUi: true });
            let msg = `Importadas ${data.importadas} linha(s). Ignoradas (já existentes ou inválidas): ${data.ignoradas}.`;
            if (data.totalOrigem === 0) {
                msg = 'Não havia plantões registados no mês anterior para copiar.';
            }
            if (data.diasNaoCopiadosMesCurto > 0) {
                msg += ` Dias do mês anterior sem correspondência no mês destino (mês mais curto): ${data.diasNaoCopiadosMesCurto}.`;
            }
            window.alert(msg);
            window.requestAnimationFrame(() => {
                window.requestAnimationFrame(() => {
                    document.getElementById(`editor-mes-${mesDestino}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                });
            });
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

    return (
        <div className="w-full max-w-none animate-in fade-in duration-500">
            <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h2 className="text-3xl font-black text-white">Editor de escala</h2>
                    <p className="mt-2 max-w-3xl text-sm text-slate-400">
                        Monte a escala por unidade e ano. Em cada turno, use <span className="text-slate-300">Adicionar</span> e escolha o médico no menu. Use{' '}
                        <span className="text-slate-300">Liberado</span> para médicos verem o mês mesmo quando for futuro; use <span className="text-slate-300">Bloqueado</span>{' '}
                        para ocultar a grelha na área do médico.
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
                                onChange={(e) => setUnitId(e.target.value)}
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
                                    <div key={m.mes} id={`editor-mes-${m.mes}`} className="scroll-mt-24 overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/40">
                                        <button
                                            type="button"
                                            onClick={() => toggleMonth(m.mes)}
                                            className="flex w-full items-center gap-3 px-4 py-4 text-left transition hover:bg-slate-800/40 sm:px-6"
                                        >
                                            {isOpen ? <ChevronDown className="h-5 w-5 shrink-0 text-slate-500" /> : <ChevronRight className="h-5 w-5 shrink-0 text-slate-500" />}
                                            <div className="min-w-0 flex-1">
                                                <span className="font-black text-white capitalize">{getMonthTitle(m.mes)}</span>
                                                <span className="mt-2 flex flex-wrap items-center gap-2">
                                                    <span className="text-xs text-slate-500">{count} linha(s)</span>
                                                    {!m.publicacao ? (
                                                        <span className="rounded-lg border border-slate-600/80 bg-slate-800/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                                                            Visibilidade: padrão
                                                        </span>
                                                    ) : m.publicacao.status === 'LIBERADO' ? (
                                                        <span className="rounded-lg border border-emerald-500/50 bg-emerald-500/20 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-emerald-200">
                                                            Liberado aos médicos
                                                        </span>
                                                    ) : (
                                                        <span className="rounded-lg border border-rose-500/50 bg-rose-500/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-rose-200">
                                                            Bloqueado aos médicos
                                                        </span>
                                                    )}
                                                </span>
                                            </div>
                                        </button>

                                        {isOpen ? (
                                            <div className="border-t border-slate-800 px-4 pb-5 pt-2 sm:px-6">
                                                <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                                                    <span className="text-xs font-bold text-slate-500">Visibilidade para médicos</span>
                                                    <div className="flex max-w-full flex-col gap-2">
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            {(() => {
                                                                const vis = m.publicacao?.status;
                                                                const ativoLib = vis === 'LIBERADO';
                                                                const ativoBloq = vis === 'BLOQUEADO';
                                                                const padrao = !vis;
                                                                return (
                                                                    <>
                                                                        <button
                                                                            type="button"
                                                                            disabled={Boolean(busyKey)}
                                                                            aria-pressed={ativoLib}
                                                                            title="Os médicos desta unidade passam a ver a grelha completa deste mês."
                                                                            onClick={() => setMesVisibilidade(m.mes, 'LIBERADO')}
                                                                            className={`rounded-xl border px-3 py-2 text-xs font-black transition disabled:opacity-50 ${
                                                                                ativoLib
                                                                                    ? 'border-emerald-400 bg-emerald-500/40 text-white shadow-[0_0_24px_-4px_rgba(16,185,129,0.55)] ring-2 ring-emerald-400/90 ring-offset-2 ring-offset-slate-950'
                                                                                    : padrao
                                                                                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200/90 hover:bg-emerald-500/20'
                                                                                      : 'border-emerald-500/20 bg-slate-900/50 text-emerald-200/40 hover:bg-emerald-500/10'
                                                                            }`}
                                                                        >
                                                                            Liberado
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            disabled={Boolean(busyKey)}
                                                                            aria-pressed={ativoBloq}
                                                                            title="Os médicos desta unidade veem aviso: escala ainda não disponível (como se não estivesse pronta)."
                                                                            onClick={() => setMesVisibilidade(m.mes, 'BLOQUEADO')}
                                                                            className={`rounded-xl border px-3 py-2 text-xs font-black transition disabled:opacity-50 ${
                                                                                ativoBloq
                                                                                    ? 'border-rose-400 bg-rose-500/35 text-white shadow-[0_0_24px_-4px_rgba(244,63,94,0.5)] ring-2 ring-rose-400/90 ring-offset-2 ring-offset-slate-950'
                                                                                    : padrao
                                                                                      ? 'border-rose-500/35 bg-rose-500/10 text-rose-200/90 hover:bg-rose-500/20'
                                                                                      : 'border-rose-500/20 bg-slate-900/50 text-rose-200/40 hover:bg-rose-500/10'
                                                                            }`}
                                                                        >
                                                                            Bloqueado
                                                                        </button>
                                                                        {padrao ? (
                                                                            <span className="text-[10px] leading-snug text-slate-500">
                                                                                Sem escolha gravada: meses futuros ficam ocultos até liberar; passado e mês atual seguem a regra padrão.
                                                                            </span>
                                                                        ) : null}
                                                                    </>
                                                                );
                                                            })()}
                                                        </div>
                                                        <p className="text-[10px] leading-relaxed text-slate-500">
                                                            <span className="font-bold text-emerald-400/90">Liberado:</span> médicos veem a escala.
                                                            <span className="mx-1.5 text-slate-600">·</span>
                                                            <span className="font-bold text-rose-400/90">Bloqueado:</span> médicos veem mensagem de que a escala não está disponível.
                                                        </p>
                                                    </div>
                                                </div>

                                                <div className="mb-4 flex flex-col gap-2 rounded-2xl border border-sky-500/25 bg-sky-500/5 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                                                    <div className="min-w-0">
                                                        <p className="text-[10px] font-black uppercase tracking-widest text-sky-400/90">Importar padrão</p>
                                                        <p className="mt-1 text-[11px] leading-snug text-slate-400">
                                                            Copia todos os plantões de <span className="font-semibold text-slate-300">{getMonthTitle(previousMonthKey(m.mes))}</span> para{' '}
                                                            <span className="font-semibold text-slate-200">{getMonthTitle(m.mes)}</span>, mantendo dia do mês e turnos (mesmo mapa do calendário).
                                                        </p>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        disabled={Boolean(busyKey)}
                                                        onClick={() => importarMesAnterior(m.mes)}
                                                        className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-sky-400/40 bg-sky-500/20 px-4 py-2.5 text-xs font-black text-sky-100 transition hover:bg-sky-500/30 disabled:opacity-50"
                                                    >
                                                        <Copy className="h-4 w-4" />
                                                        Importar mês anterior
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
                                                                    {entry.turnSlots.map(({ turno, slot }) => (
                                                                    <div
                                                                        key={`${entry.date}-${turno}`}
                                                                        id={slotScrollId(entry.date, turno)}
                                                                        className="scroll-mt-28 rounded-xl border border-slate-700/80 bg-slate-900/60 p-1.5 md:scroll-mt-24"
                                                                    >
                                                                        <div className="mb-1 flex items-center justify-between gap-1">
                                                                            <span className="text-[10px] font-black uppercase text-slate-400">{turno}</span>
                                                                            <button
                                                                                type="button"
                                                                                disabled={Boolean(busyKey)}
                                                                                onClick={() => openAddMedicoModal(entry.date, turno)}
                                                                                className="text-[10px] font-bold text-sky-400 hover:text-sky-300 disabled:opacity-40"
                                                                            >
                                                                                Adicionar
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
                                                                    </div>
                                                                ))}
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

            {addSlotModal ? (
                <div
                    className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/85 px-4 py-8 backdrop-blur-md"
                    onClick={() => !busyKey && setAddSlotModal(null)}
                    role="presentation"
                >
                    <div
                        className="w-full max-w-md rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                        role="dialog"
                        aria-labelledby="add-medico-title"
                        aria-modal="true"
                    >
                        <div className="mb-4 flex items-start justify-between gap-3">
                            <div>
                                <h3 id="add-medico-title" className="text-lg font-black text-white">
                                    Adicionar plantonista
                                </h3>
                                <p className="mt-1 text-sm text-slate-400">
                                    {formatDatePt(addSlotModal.date)} · <span className="font-bold text-slate-300">{addSlotModal.turno}</span>
                                </p>
                            </div>
                            <button
                                type="button"
                                disabled={Boolean(busyKey)}
                                onClick={() => setAddSlotModal(null)}
                                className="rounded-xl p-2 text-slate-500 transition hover:bg-slate-800 hover:text-white disabled:opacity-40"
                                aria-label="Fechar"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        {modalError ? (
                            <div className="mb-4 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">{modalError}</div>
                        ) : null}

                        <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-500">Médico</label>
                        <select
                            value={modalMedicoId}
                            onChange={(e) => {
                                setModalMedicoId(e.target.value);
                                setModalError('');
                            }}
                            disabled={Boolean(busyKey) || doctorsLoading}
                            className="mb-4 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm font-semibold text-white outline-none focus:border-sky-400 disabled:opacity-50"
                        >
                            <option value="">{doctorsLoading ? 'A carregar médicos…' : 'Selecione o médico…'}</option>
                            {doctors.map((d) => (
                                <option key={d.id} value={d.id}>
                                    {d.nome || 'Sem nome'}
                                    {d.crm ? ` — CRM ${d.crm}` : ''}
                                </option>
                            ))}
                        </select>

                        {!doctorsLoading && doctors.length === 0 ? (
                            <p className="mb-4 text-xs text-amber-200/90">Nenhum médico cadastrado. Cadastre em Controle de Acessos.</p>
                        ) : null}

                        <div className="flex flex-wrap gap-3">
                            <button
                                type="button"
                                disabled={Boolean(busyKey)}
                                onClick={() => setAddSlotModal(null)}
                                className="flex-1 rounded-2xl border border-slate-600 bg-slate-800/80 py-3 text-sm font-bold text-slate-200 hover:bg-slate-800 disabled:opacity-50"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                disabled={Boolean(busyKey) || !modalMedicoId || doctors.length === 0}
                                onClick={confirmAddFromModal}
                                className="flex-1 rounded-2xl bg-sky-500 py-3 text-sm font-black text-slate-950 hover:bg-sky-400 disabled:opacity-50"
                            >
                                {busyKey ? 'A gravar…' : 'Confirmar'}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
