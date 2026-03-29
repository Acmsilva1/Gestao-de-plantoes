import React, { useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'maestro-session';

const initialState = {
    loading: false,
    loadingCalendar: false,
    loggingIn: false,
    modal: null,
    error: '',
    success: '',
    reservandoId: '',
    selectedMonth: new Date().toISOString().slice(0, 7),
    selectedDay: '',
    session: null,
    calendar: null,
    nome: '',
    crm: ''
};

const weekdayLabels = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
const monthFormatter = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' });
const fullDateFormatter = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'America/Sao_Paulo'
});
const weekdayFormatter = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'America/Sao_Paulo' });
const weekdayIndexByShortName = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6
};

const getMonthAnchorDate = (month) => new Date(`${month}-01T12:00:00-03:00`);
const getMonthTitle = (month) => monthFormatter.format(getMonthAnchorDate(month));
const formatDisplayDate = (dateString) => fullDateFormatter.format(new Date(`${dateString}T12:00:00-03:00`)).replace(/\//g, '-');

const parseJsonSafely = async (response) => {
    const raw = await response.text();

    if (!raw) {
        return null;
    }

    try {
        return JSON.parse(raw);
    } catch {
        throw new Error('A resposta do servidor veio incompleta ou invalida.');
    }
};

const shiftMonth = (month, delta) => {
    const [year, monthIndex] = month.split('-').map(Number);
    const date = new Date(Date.UTC(year, monthIndex - 1 + delta, 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
};

const getMonthFromDate = (dateString) => dateString.slice(0, 7);

const buildCalendarDays = (month, shifts) => {
    const [year, monthIndex] = month.split('-').map(Number);
    const firstDay = getMonthAnchorDate(month);
    const totalDays = new Date(Date.UTC(year, monthIndex, 0)).getUTCDate();
    const leadingBlankDays = weekdayIndexByShortName[weekdayFormatter.format(firstDay)] ?? 0;
    const shiftMap = new Map();

    for (const shift of shifts) {
        const day = Number(shift.data.slice(-2));
        const current = shiftMap.get(day) || [];
        current.push(shift);
        shiftMap.set(day, current);
    }

    const days = [];

    for (let index = 0; index < leadingBlankDays; index += 1) {
        days.push({ key: `blank-${index}`, empty: true });
    }

    for (let day = 1; day <= totalDays; day += 1) {
        days.push({
            key: `day-${day}`,
            day,
            date: `${month}-${String(day).padStart(2, '0')}`,
            shifts: shiftMap.get(day) || []
        });
    }

    return days;
};

export default function App() {
    const [state, setState] = useState(initialState);

    const loadCalendar = async (doctorId, month) => {
        if (!doctorId) {
            return;
        }

        setState((current) => ({
            ...current,
            loadingCalendar: true,
            error: ''
        }));

        try {
            const response = await fetch(`/api/medicos/${doctorId}/calendario?month=${month}`);
            const data = await parseJsonSafely(response);

            if (!response.ok) {
                throw new Error(data?.error || 'Nao foi possivel carregar o calendario.');
            }

            setState((current) => ({
                ...current,
                loadingCalendar: false,
                calendar: data,
                selectedDay: ''
            }));
        } catch (error) {
            setState((current) => ({
                ...current,
                loadingCalendar: false,
                error: error.message
            }));
        }
    };

    useEffect(() => {
        const rawSession = window.localStorage.getItem(STORAGE_KEY);

        if (!rawSession) {
            return;
        }

        try {
            const session = JSON.parse(rawSession);
            setState((current) => ({
                ...current,
                session,
                nome: session.nome || '',
                crm: session.crm || ''
            }));
        } catch {
            window.localStorage.removeItem(STORAGE_KEY);
        }
    }, []);

    useEffect(() => {
        if (state.session?.id) {
            loadCalendar(state.session.id, state.selectedMonth);
        }
    }, [state.session?.id, state.selectedMonth]);

    const releaseReservationHold = async (shiftId) => {
        if (!state.session?.id || !shiftId) {
            return;
        }

        try {
            await fetch(`/api/vagas/${shiftId}/bloquear`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    medicoId: state.session.id
                })
            });
        } catch {
            // A expiração automática no banco continua protegendo a fila.
        }
    };

    const handleLogin = async (event) => {
        event.preventDefault();

        setState((current) => ({
            ...current,
            loggingIn: true,
            error: '',
            success: ''
        }));

        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    nome: state.nome,
                    crm: state.crm
                })
            });
            const data = await parseJsonSafely(response);

            if (!response.ok) {
                throw new Error(data?.error || 'Falha no login.');
            }

            const session = {
                ...data.doctor,
                nome: data.doctor.nome,
                crm: state.crm
            };

            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));

            setState((current) => ({
                ...current,
                loggingIn: false,
                session,
                success: data.message
            }));
        } catch (error) {
            setState((current) => ({
                ...current,
                loggingIn: false,
                error: error.message
            }));
        }
    };

    const handleLogout = () => {
        window.localStorage.removeItem(STORAGE_KEY);
        setState({
            ...initialState
        });
    };

    const handleSelectShift = async (shiftId) => {
        if (!state.session?.id) {
            return;
        }

        setState((current) => ({
            ...current,
            error: '',
            success: '',
            reservandoId: shiftId,
            modal: {
                type: 'loading',
                title: 'Aguardando vaga',
                message: 'Estamos entrando na fila e bloqueando a vaga temporariamente para voce.'
            }
        }));

        try {
            const response = await fetch(`/api/vagas/${shiftId}/bloquear`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    medicoId: state.session.id
                })
            });
            const data = await parseJsonSafely(response);

            if (!response.ok) {
                throw new Error(data?.error || 'Nao foi possivel iniciar a reserva.');
            }

            setState((current) => ({
                ...current,
                modal: {
                    type: 'confirm-reservation',
                    shiftId,
                    reservedUntil: data?.hold?.reservedUntil,
                    title: 'Confirmar plantao',
                    message: 'Clique em OK para confirmar a reserva. Se voce fechar esta janela, a vaga volta para a fila.'
                }
            }));
        } catch (error) {
            if (/confirmacao por outro medico/i.test(error.message)) {
                setState((current) => ({
                    ...current,
                    modal: {
                        type: 'loading',
                        title: 'PROCESSANDO',
                        message: 'A vaga esta sendo confirmada por outro usuario. Aguarde.'
                    }
                }));

                window.setTimeout(() => {
                    loadCalendar(state.session.id, state.selectedMonth);
                    setState((current) => ({
                        ...current,
                        reservandoId: '',
                        modal: null
                    }));
                }, 3000);

                return;
            }

            releaseReservationHold(shiftId);
            setState((current) => ({
                ...current,
                reservandoId: '',
                error: error.message,
                modal: {
                    type: 'feedback',
                    variant: 'error',
                    title: 'Nao foi possivel bloquear a vaga',
                    message: error.message
                }
            }));
        }
    };

    const closeModal = () => {
        const activeModal = state.modal;

        if (activeModal?.type === 'confirm-reservation') {
            releaseReservationHold(activeModal.shiftId);
        }

        setState((current) => ({
            ...current,
            modal: null,
            reservandoId: activeModal?.type === 'confirm-reservation' ? '' : current.reservandoId
        }));
    };

    const handleConfirmReservation = async () => {
        if (!state.session?.id || state.modal?.type !== 'confirm-reservation') {
            return;
        }

        const shiftId = state.modal.shiftId;
        try {
            setState((current) => ({
                ...current,
                modal: {
                    type: 'loading',
                    title: 'Processando reserva',
                    message: 'Estamos confirmando sua vez na fila e registrando o agendamento.'
                }
            }));

            const response = await fetch(`/api/vagas/${shiftId}/selecionar`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    medicoId: state.session.id
                })
            });
            const data = await parseJsonSafely(response);

            if (!response.ok) {
                throw new Error(data?.error || 'Falha ao reservar plantao.');
            }

            setState((current) => ({
                ...current,
                reservandoId: '',
                success: data.message,
                modal: {
                    type: 'feedback',
                    variant: 'success',
                    title: 'Reserva confirmada',
                    message: data.message
                }
            }));

            loadCalendar(state.session.id, state.selectedMonth);
        } catch (error) {
            setState((current) => ({
                ...current,
                reservandoId: '',
                error: error.message,
                modal: {
                    type: 'feedback',
                    variant: 'error',
                    title: /TEMPO EXCEDIDO! VAGA INDISPONIVEL!/i.test(error.message) ? 'TEMPO EXCEDIDO!' : 'Reserva nao concluida',
                    message: /TEMPO EXCEDIDO! VAGA INDISPONIVEL!/i.test(error.message) ? 'VAGA INDISPONÍVEL!' : error.message
                }
            }));
        }
    };

    const { loggingIn, loadingCalendar, modal, error, success, reservandoId, selectedMonth, selectedDay, session, calendar, crm } = state;
    const { nome } = state;
    const calendarDays = buildCalendarDays(selectedMonth, calendar?.shifts || []);
    const getShiftAlertClasses = (shift) =>
        shift.vagas <= 0
            ? 'border border-rose-400/70 bg-rose-500/10 text-rose-100 shadow-[0_0_0_1px_rgba(251,113,133,0.28),0_0_22px_rgba(244,63,94,0.2)] animate-pulse'
            : 'border border-emerald-400/15 bg-emerald-500/10';
    const visibleMonth = selectedDay ? getMonthFromDate(selectedDay) : selectedMonth;
    const selectedDayShifts = useMemo(() => {
        if (!selectedDay) {
            return [];
        }

        return (calendar?.shifts || []).filter((shift) => shift.data === selectedDay);
    }, [calendar, selectedDay]);

    if (!session) {
        return (
            <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(34,197,94,0.24),_transparent_32%),linear-gradient(180deg,_#020617_0%,_#0f172a_52%,_#111827_100%)] px-6 py-10 text-slate-100">
                <div className="mx-auto max-w-5xl">
                    <header className="mb-12">
                        <p className="mb-3 text-sm uppercase tracking-[0.35em] text-emerald-300/70">Maestro</p>
                        <h1 className="text-5xl font-black tracking-tight text-white">Entrar para acessar seus plantões</h1>
                        <p className="mt-4 max-w-2xl text-base text-slate-300">Entre apenas com nome e CRM. A autorização de acesso fica sob gestão do perfil administrativo.</p>
                    </header>

                    <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
                        <section className="rounded-[2rem] border border-slate-800 bg-slate-900/75 p-8 shadow-2xl shadow-slate-950/40">
                            <form className="grid gap-5" onSubmit={handleLogin}>
                                <div>
                                    <label className="mb-2 block text-sm font-semibold text-slate-200" htmlFor="nome">
                                        Nome
                                    </label>
                                    <input
                                        id="nome"
                                        type="text"
                                        value={nome}
                                        onChange={(event) => setState((current) => ({ ...current, nome: event.target.value }))}
                                        placeholder="Dr. André Martins"
                                        className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-100 outline-none transition focus:border-emerald-400"
                                    />
                                </div>

                                <div>
                                    <label className="mb-2 block text-sm font-semibold text-slate-200" htmlFor="crm">
                                        CRM
                                    </label>
                                    <input
                                        id="crm"
                                        type="text"
                                        value={crm}
                                        onChange={(event) => setState((current) => ({ ...current, crm: event.target.value }))}
                                        placeholder="12345-ES"
                                        className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-100 outline-none transition focus:border-emerald-400"
                                    />
                                </div>

                                {error ? (
                                    <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</div>
                                ) : null}

                                <button
                                    type="submit"
                                    disabled={loggingIn}
                                    className="rounded-2xl bg-emerald-400 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                                >
                                    {loggingIn ? 'Entrando...' : 'Entrar'}
                                </button>
                            </form>
                        </section>

                        <section className="rounded-[2rem] border border-emerald-400/15 bg-[linear-gradient(135deg,rgba(16,185,129,0.16),rgba(15,23,42,0.35))] p-8">
                            <p className="text-xs uppercase tracking-[0.3em] text-emerald-300/70">Teste rápido</p>
                            <h2 className="mt-4 text-3xl font-black text-white">Login sem senha</h2>
                            <p className="mt-4 text-sm text-slate-200">Use nome e CRM de um médico cadastrado e autorizado pelo gestor.</p>
                            <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950/55 p-4 text-sm text-slate-200">
                                Nome: Dr. André Martins
                                <br />
                                CRM: 12345-ES
                            </div>
                        </section>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(34,197,94,0.24),_transparent_32%),linear-gradient(180deg,_#020617_0%,_#0f172a_52%,_#111827_100%)] text-slate-100">
            <div className="mx-auto max-w-7xl px-6 py-10">
                <header className="mb-10 flex flex-col gap-4 border-b border-emerald-500/20 pb-6 md:flex-row md:items-end md:justify-between">
                    <div>
                        <p className="mb-2 text-sm uppercase tracking-[0.3em] text-emerald-300/70">Maestro</p>
                        <h1 className="text-4xl font-black tracking-tight text-white">Agenda mensal de plantões</h1>
                        <p className="mt-3 max-w-2xl text-sm text-slate-300">
                            Unidade: {session.unidadeFixaNome} | Especialidade: {session.especialidade}
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-5 py-4 text-sm text-emerald-100 shadow-lg shadow-emerald-950/30">
                            <div>{session.nome}</div>
                            <div className="mt-1 text-emerald-200/70">{session.crm}</div>
                        </div>
                        <button
                            type="button"
                            onClick={handleLogout}
                            className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm font-bold text-slate-200 transition hover:bg-slate-800"
                        >
                            Sair
                        </button>
                    </div>
                </header>

                <section className="mb-8 flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-slate-800 bg-slate-900/60 p-4">
                    <div className="text-sm text-slate-300">Selecione o mês e clique no dia desejado para ver os plantões disponíveis.</div>

                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={() =>
                                setState((current) => ({
                                    ...current,
                                    selectedDay: '',
                                    selectedMonth: shiftMonth(current.selectedMonth, -1)
                                }))
                            }
                            className="rounded-2xl bg-slate-800 px-4 py-2 text-sm font-bold text-slate-200 transition hover:bg-slate-700"
                        >
                            Mês anterior
                        </button>
                        <div className="min-w-44 text-center text-sm font-semibold capitalize text-slate-200">{getMonthTitle(visibleMonth)}</div>
                        <button
                            type="button"
                            onClick={() =>
                                setState((current) => ({
                                    ...current,
                                    selectedDay: '',
                                    selectedMonth: shiftMonth(current.selectedMonth, 1)
                                }))
                            }
                            className="rounded-2xl bg-slate-800 px-4 py-2 text-sm font-bold text-slate-200 transition hover:bg-slate-700"
                        >
                            Próximo mês
                        </button>
                    </div>
                </section>

                {success ? (
                    <div className="mb-6 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{success}</div>
                ) : null}

                {error ? (
                    <div className="mb-6 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</div>
                ) : null}

                {!selectedDay ? (
                    <section className="rounded-[2rem] border border-slate-800 bg-slate-900/75 p-6 shadow-2xl shadow-slate-950/40">
                        <div className="mb-6 flex flex-col gap-3 border-b border-slate-800 pb-5 md:flex-row md:items-end md:justify-between">
                            <div>
                                <p className="text-sm uppercase tracking-[0.25em] text-emerald-300/70">Calendário</p>
                                <h2 className="mt-2 text-3xl font-black text-white">{session.nome}</h2>
                                <p className="mt-2 text-sm text-slate-400">
                                    Unidade: <span className="text-slate-200">{calendar?.unit?.nome || session.unidadeFixaNome}</span> | Especialidade:{' '}
                                    <span className="text-slate-200">{calendar?.specialty || session.especialidade}</span>
                                </p>
                            </div>
                            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                                {(calendar?.shifts || []).length} plantões no mês
                            </div>
                        </div>

                        {loadingCalendar ? (
                            <div className="rounded-3xl bg-slate-950/50 p-10 text-center text-slate-300">Carregando calendário...</div>
                        ) : (
                            <>
                                <div className="mb-4 grid grid-cols-7 gap-3">
                                    {weekdayLabels.map((label) => (
                                        <div key={label} className="px-2 py-3 text-center text-xs font-bold uppercase tracking-[0.25em] text-slate-500">
                                            {label}
                                        </div>
                                    ))}
                                </div>

                                <div className="grid grid-cols-1 gap-3 md:grid-cols-7">
                                    {calendarDays.map((entry) =>
                                        entry.empty ? (
                                            <div key={entry.key} className="hidden rounded-3xl border border-transparent md:block" />
                                        ) : (
                                            <button
                                                key={entry.key}
                                                type="button"
                                                onClick={() =>
                                                    setState((current) => ({
                                                        ...current,
                                                        selectedMonth: getMonthFromDate(entry.date),
                                                        selectedDay: entry.date
                                                    }))
                                                }
                                                className="min-h-40 rounded-3xl border border-slate-800 bg-slate-950/50 p-4 text-left transition hover:border-emerald-400/40"
                                            >
                                                <div className="mb-4 flex items-center justify-between">
                                                    <span className="text-sm font-bold text-white">
                                                        {String(entry.day).padStart(2, '0')}
                                                    </span>
                                                    <span className="text-xs uppercase tracking-[0.2em] text-slate-500">
                                                        {entry.shifts.length} turno{entry.shifts.length === 1 ? '' : 's'}
                                                    </span>
                                                </div>

                                                <div className="grid gap-2">
                                                    {entry.shifts.length === 0 ? (
                                                        <div className="rounded-2xl border border-dashed border-slate-800 px-3 py-4 text-xs text-slate-500">
                                                            Sem agenda para este dia.
                                                        </div>
                                                    ) : (
                                                        entry.shifts.slice(0, 3).map((shift) => (
                                                            <div key={shift.id} className={`rounded-2xl px-3 py-3 ${getShiftAlertClasses(shift)}`}>
                                                                <div className={`text-sm font-bold ${shift.vagas <= 0 ? 'text-rose-100' : 'text-emerald-100'}`}>{shift.turno}</div>
                                                                <div className={`mt-2 text-xs uppercase tracking-[0.2em] ${shift.vagas <= 0 ? 'text-rose-200/80' : 'text-slate-500'}`}>
                                                                    {shift.vagas} vagas
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
                    </section>
                ) : (
                    <section className="rounded-[2rem] border border-slate-800 bg-slate-900/75 p-6 shadow-2xl shadow-slate-950/40">
                        <div className="mb-6 flex flex-col gap-4 border-b border-slate-800 pb-5 md:flex-row md:items-end md:justify-between">
                            <div>
                                <p className="text-sm uppercase tracking-[0.25em] text-emerald-300/70">Dia Selecionado</p>
                                <h2 className="mt-2 text-3xl font-black text-white">{formatDisplayDate(selectedDay)}</h2>
                                <p className="mt-2 text-sm text-slate-400">
                                    Unidade: <span className="text-slate-200">{calendar?.unit?.nome || session.unidadeFixaNome}</span> | Especialidade:{' '}
                                    <span className="text-slate-200">{calendar?.specialty || session.especialidade}</span>
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() =>
                                    setState((current) => ({
                                        ...current,
                                        selectedDay: ''
                                    }))
                                }
                                className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm font-bold text-slate-200 transition hover:bg-slate-800"
                            >
                                Voltar ao calendário
                            </button>
                        </div>

                        {selectedDayShifts.length === 0 ? (
                            <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-10 text-center text-slate-300">
                                Não há plantões disponíveis em {formatDisplayDate(selectedDay)}.
                            </div>
                        ) : (
                            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                                {selectedDayShifts.map((shift) => (
                                    <article
                                        key={shift.id}
                                        className={`rounded-3xl border bg-slate-900/80 p-6 shadow-2xl shadow-slate-950/40 transition duration-300 hover:-translate-y-1 ${
                                            shift.vagas <= 0
                                                ? 'border-rose-400/70 shadow-[0_0_0_1px_rgba(251,113,133,0.28),0_0_28px_rgba(244,63,94,0.2)] animate-pulse'
                                                : 'border-slate-800 hover:border-emerald-400/40'
                                        }`}
                                    >
                                        <div className="mb-5 flex items-start justify-between gap-3">
                                            <div>
                                                <span
                                                    className={`inline-flex rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.2em] ${
                                                        shift.vagas <= 0
                                                            ? 'border border-rose-400/40 bg-rose-500/10 text-rose-200'
                                                            : 'border border-emerald-400/20 bg-emerald-500/10 text-emerald-300'
                                                    }`}
                                                >
                                                    {shift.turno}
                                                </span>
                                                <h2 className="mt-4 text-2xl font-bold text-white">{shift.local}</h2>
                                            </div>
                                            <span className="text-sm text-slate-400">{formatDisplayDate(shift.data)}</span>
                                        </div>

                                        <div className={`mb-6 rounded-2xl p-4 ${shift.vagas <= 0 ? 'bg-rose-950/30 ring-1 ring-rose-400/30' : 'bg-slate-800/70'}`}>
                                            <p className="text-sm text-slate-400">Especialidade</p>
                                            <p className="mt-2 text-lg font-bold text-white">{shift.especialidade}</p>
                                            <p className="mt-4 text-sm text-slate-400">Vagas disponíveis</p>
                                            <p className={`mt-2 text-3xl font-black ${shift.vagas <= 0 ? 'text-rose-200' : 'text-white'}`}>{shift.vagas}</p>
                                            <p className={`mt-2 text-xs uppercase tracking-[0.2em] ${shift.vagas <= 0 ? 'text-rose-200/80' : 'text-slate-500'}`}>{shift.status}</p>
                                        </div>

                                        <button
                                            type="button"
                                            onClick={() => handleSelectShift(shift.id)}
                                            disabled={reservandoId === shift.id || shift.vagas <= 0}
                                            className="w-full rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                                        >
                                            {reservandoId === shift.id ? 'Reservando...' : 'Aceitar plantão'}
                                        </button>
                                    </article>
                                ))}
                            </div>
                        )}
                    </section>
                )}
                {modal ? (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-6 backdrop-blur-sm" onClick={closeModal}>
                        <div className="w-full max-w-md rounded-[2rem] border border-slate-700 bg-slate-900/95 p-6 shadow-2xl shadow-slate-950/60" onClick={(event) => event.stopPropagation()}>
                            <div
                                className={`mb-4 inline-flex rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.25em] ${
                                    modal.type === 'loading'
                                        ? 'border border-sky-400/30 bg-sky-500/10 text-sky-200'
                                        : modal.variant === 'success'
                                          ? 'border border-emerald-400/30 bg-emerald-500/10 text-emerald-200'
                                          : modal.variant === 'warning'
                                            ? 'border border-amber-400/30 bg-amber-500/10 text-amber-200'
                                            : modal.type === 'confirm-reservation'
                                              ? 'border border-emerald-400/30 bg-emerald-500/10 text-emerald-200'
                                              : 'border border-rose-400/30 bg-rose-500/10 text-rose-200'
                                }`}
                            >
                                {modal.type === 'loading' ? 'PROCESSANDO' : modal.type === 'confirm-reservation' ? 'Confirmação' : 'Processado'}
                            </div>

                            <h3 className="text-2xl font-black text-white">{modal.title}</h3>
                            <p className="mt-3 text-sm leading-6 text-slate-300">{modal.message}</p>

                            {modal.type === 'loading' || modal.type === 'confirm-reservation' ? (
                                <div className="mt-6 flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-950/55 px-4 py-4">
                                    <div className={`h-6 w-6 animate-spin rounded-full border-2 border-slate-700 border-t-transparent ${modal.type === 'confirm-reservation' ? 'border-t-emerald-300' : 'border-t-sky-300'}`} />
                                    <div className="text-sm text-slate-300">
                                        {modal.type === 'confirm-reservation' ? 'Aguardando seu OK...' : 'Processando sua solicitação...'}
                                    </div>
                                </div>
                            ) : null}

                            <div className="mt-6 flex gap-3">
                                {modal.type === 'confirm-reservation' ? (
                                    <>
                                        <button
                                            type="button"
                                            onClick={closeModal}
                                            className="flex-1 rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm font-bold text-slate-200 transition hover:bg-slate-800"
                                        >
                                            Cancelar
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleConfirmReservation}
                                            className="flex-1 rounded-2xl bg-emerald-400 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-emerald-300"
                                        >
                                            OK
                                        </button>
                                    </>
                                ) : modal.type !== 'loading' ? (
                                    <button
                                        type="button"
                                        onClick={closeModal}
                                        className="w-full rounded-2xl bg-slate-800 px-4 py-3 text-sm font-bold text-slate-100 transition hover:bg-slate-700"
                                    >
                                        Fechar
                                    </button>
                                ) : null}
                            </div>
                        </div>
                    </div>
                ) : null}
            </div>
        </div>
    );
}
