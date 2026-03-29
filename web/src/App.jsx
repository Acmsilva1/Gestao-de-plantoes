import React, { useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'maestro-session';

const initialState = {
    loading: false,
    loadingCalendar: false,
    loggingIn: false,
    error: '',
    success: '',
    reservandoId: '',
    selectedMonth: new Date().toISOString().slice(0, 7),
    selectedDay: '',
    session: null,
    calendar: null,
    nome: '',
    crm: '',
    doctorId: '',
    senha: ''
};

const weekdayLabels = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
const monthFormatter = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const dayFormatter = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', timeZone: 'UTC' });

const getMonthTitle = (month) => monthFormatter.format(new Date(`${month}-01T00:00:00Z`));

const shiftMonth = (month, delta) => {
    const [year, monthIndex] = month.split('-').map(Number);
    const date = new Date(Date.UTC(year, monthIndex - 1 + delta, 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
};

const buildCalendarDays = (month, shifts) => {
    const [year, monthIndex] = month.split('-').map(Number);
    const firstDay = new Date(Date.UTC(year, monthIndex - 1, 1));
    const totalDays = new Date(Date.UTC(year, monthIndex, 0)).getUTCDate();
    const leadingBlankDays = firstDay.getUTCDay();
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
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Nao foi possivel carregar o calendario.');
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
                    crm: state.crm,
                    doctorId: state.doctorId,
                    senha: state.senha
                })
            });
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Falha no login.');
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
                senha: '',
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
            reservandoId: shiftId,
            error: '',
            success: ''
        }));

        try {
            const response = await fetch(`/api/vagas/${shiftId}/selecionar`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    medicoId: state.session.id
                })
            });
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Falha ao reservar plantao.');
            }

            setState((current) => ({
                ...current,
                reservandoId: '',
                success: data.message
            }));

            loadCalendar(state.session.id, state.selectedMonth);
        } catch (error) {
            setState((current) => ({
                ...current,
                reservandoId: '',
                error: error.message
            }));
        }
    };

    const { loggingIn, loadingCalendar, error, success, reservandoId, selectedMonth, selectedDay, session, calendar, crm, senha } = state;
    const { nome, doctorId } = state;
    const calendarDays = buildCalendarDays(selectedMonth, calendar?.shifts || []);
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
                        <p className="mt-4 max-w-2xl text-base text-slate-300">
                            Para testes, o login aceita CRM com conferência opcional de nome e ID. A senha existe na interface, mas não é validada.
                        </p>
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

                                <div>
                                    <label className="mb-2 block text-sm font-semibold text-slate-200" htmlFor="doctor-id">
                                        ID
                                    </label>
                                    <input
                                        id="doctor-id"
                                        type="text"
                                        value={doctorId}
                                        onChange={(event) => setState((current) => ({ ...current, doctorId: event.target.value }))}
                                        placeholder="Opcional para teste"
                                        className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-100 outline-none transition focus:border-emerald-400"
                                    />
                                </div>

                                <div>
                                    <label className="mb-2 block text-sm font-semibold text-slate-200" htmlFor="senha">
                                        Senha
                                    </label>
                                    <input
                                        id="senha"
                                        type="password"
                                        value={senha}
                                        onChange={(event) => setState((current) => ({ ...current, senha: event.target.value }))}
                                        placeholder="Opcional para teste"
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
                            <p className="mt-4 text-sm text-slate-200">
                                Use o CRM de um médico cadastrado. Nome e ID podem ser preenchidos para simular o fluxo final.
                            </p>
                            <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950/55 p-4 text-sm text-slate-200">
                                Nome: Dr. André Martins
                                <br />
                                CRM: 12345-ES
                                <br />
                                ID: 1a3697d4-9f5a-42bc-b52a-c462441a808e
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
                                    selectedMonth: shiftMonth(current.selectedMonth, -1)
                                }))
                            }
                            className="rounded-2xl bg-slate-800 px-4 py-2 text-sm font-bold text-slate-200 transition hover:bg-slate-700"
                        >
                            Mês anterior
                        </button>
                        <div className="min-w-44 text-center text-sm font-semibold capitalize text-slate-200">{getMonthTitle(selectedMonth)}</div>
                        <button
                            type="button"
                            onClick={() =>
                                setState((current) => ({
                                    ...current,
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
                                                        selectedDay: entry.date
                                                    }))
                                                }
                                                className="min-h-40 rounded-3xl border border-slate-800 bg-slate-950/50 p-4 text-left transition hover:border-emerald-400/40"
                                            >
                                                <div className="mb-4 flex items-center justify-between">
                                                    <span className="text-sm font-bold text-white">
                                                        {dayFormatter.format(new Date(`${selectedMonth}-${String(entry.day).padStart(2, '0')}T00:00:00Z`))}
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
                                                            <div key={shift.id} className="rounded-2xl border border-emerald-400/15 bg-emerald-500/10 px-3 py-3">
                                                                <div className="text-sm font-bold text-emerald-100">{shift.turno}</div>
                                                                <div className="mt-2 text-xs uppercase tracking-[0.2em] text-slate-500">
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
                                <h2 className="mt-2 text-3xl font-black text-white">{selectedDay}</h2>
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
                                Não há plantões disponíveis em {selectedDay}.
                            </div>
                        ) : (
                            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                                {selectedDayShifts.map((shift) => (
                                    <article
                                        key={shift.id}
                                        className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-2xl shadow-slate-950/40 transition duration-300 hover:-translate-y-1 hover:border-emerald-400/40"
                                    >
                                        <div className="mb-5 flex items-start justify-between gap-3">
                                            <div>
                                                <span className="inline-flex rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">
                                                    {shift.turno}
                                                </span>
                                                <h2 className="mt-4 text-2xl font-bold text-white">{shift.local}</h2>
                                            </div>
                                            <span className="text-sm text-slate-400">{shift.data}</span>
                                        </div>

                                        <div className="mb-6 rounded-2xl bg-slate-800/70 p-4">
                                            <p className="text-sm text-slate-400">Especialidade</p>
                                            <p className="mt-2 text-lg font-bold text-white">{shift.especialidade}</p>
                                            <p className="mt-4 text-sm text-slate-400">Vagas disponíveis</p>
                                            <p className="mt-2 text-3xl font-black text-white">{shift.vagas}</p>
                                            <p className="mt-2 text-xs uppercase tracking-[0.2em] text-slate-500">{shift.status}</p>
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
            </div>
        </div>
    );
}
