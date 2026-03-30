import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { readApiResponse } from '../utils/api';

const initialState = {
    loadingCalendar: false,
    modal: null,
    error: '',
    success: '',
    reservandoId: '',
    selectedMonth: new Date().toISOString().slice(0, 7),
    selectedDay: '',
    selectedUnitId: '',
    bookedShiftIds: [],
    showAgendaModal: false,
    showProfileModal: false,
    showPasswordSuggestion: false,
    myAgenda: [],
    calendar: null,
    bookingConfigs: {}
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
const weekdayIndexByShortName = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

const getMonthAnchorDate = (month) => new Date(`${month}-01T12:00:00-03:00`);
const getMonthTitle = (month) => monthFormatter.format(getMonthAnchorDate(month));
const formatDisplayDate = (dateString) => fullDateFormatter.format(new Date(`${dateString}T12:00:00-03:00`)).replace(/\//g, '-');

const parseJsonSafely = async (response) => {
    const raw = await response.text();
    if (!raw) return null;
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

const bookingTypeOptions = [
    { id: 'COMPLETO', label: 'Completo', description: 'Finaliza o agendamento para o turno inteiro.' },
    { id: 'PARCIAL', label: 'Parcial', description: 'Seleciona um horario de inicio e fim dentro do dia.' },
    { id: 'FIXO', label: 'Fixo', description: 'Replica o agendamento em dias sequenciais, com horario inteiro ou parcial.' }
];

const getDefaultBookingForm = (shift) => ({
    bookingType: 'COMPLETO',
    partialStartTime: '07:00',
    partialEndTime: '13:00',
    fixedEndDate: shift?.data || '',
    fixedMode: 'COMPLETO',
    fixedStartTime: '07:00',
    fixedEndTime: '13:00'
});

const getBookingConfigStorageKey = (doctorId) => `doctor_booking_configs_${doctorId}`;

const loadBookingConfigs = (doctorId) => {
    if (!doctorId || typeof window === 'undefined') return {};

    try {
        const raw = window.localStorage.getItem(getBookingConfigStorageKey(doctorId));
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
};

const saveBookingConfigs = (doctorId, nextConfigs) => {
    if (!doctorId || typeof window === 'undefined') return;
    window.localStorage.setItem(getBookingConfigStorageKey(doctorId), JSON.stringify(nextConfigs));
};

const buildBookingConfigLabel = (config) => {
    if (!config) return '';
    if (config.bookingType === 'PARCIAL') {
        return `Parcial â€¢ ${config.startTime} Ã s ${config.endTime}`;
    }
    if (config.bookingType === 'FIXO') {
        if (config.fixedMode === 'PARCIAL') {
            return `Fixo parcial â€¢ atÃ© ${formatDisplayDate(config.fixedEndDate)} â€¢ ${config.startTime} Ã s ${config.endTime}`;
        }
        return `Fixo completo â€¢ atÃ© ${formatDisplayDate(config.fixedEndDate)}`;
    }
    return 'Completo';
};

const buildAgendaBookingLabel = (agendaItem, fallbackConfig) => {
    if (agendaItem?.tipoPlantao === 'PARCIAL') {
        return agendaItem.horaInicio && agendaItem.horaFim
            ? `Parcial â€¢ ${agendaItem.horaInicio.slice(0, 5)} Ã s ${agendaItem.horaFim.slice(0, 5)}`
            : 'Parcial';
    }

    if (agendaItem?.tipoPlantao === 'FIXO') {
        const rangeLabel = agendaItem.dataInicioFixo && agendaItem.dataFimFixo
            ? `${formatDisplayDate(agendaItem.dataInicioFixo)} atÃ© ${formatDisplayDate(agendaItem.dataFimFixo)}`
            : agendaItem.dataFimFixo
              ? `atÃ© ${formatDisplayDate(agendaItem.dataFimFixo)}`
              : 'SequÃªncia fixa';

        if (agendaItem.horaInicio && agendaItem.horaFim) {
            return `Fixo parcial â€¢ ${rangeLabel} â€¢ ${agendaItem.horaInicio.slice(0, 5)} Ã s ${agendaItem.horaFim.slice(0, 5)}`;
        }

        return `Fixo completo â€¢ ${rangeLabel}`;
    }

    return buildBookingConfigLabel(fallbackConfig) || 'Completo';
};

const ProfileModal = ({ doctor, onClose, onUpdate }) => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [formData, setFormData] = useState({
        nome: doctor.nome || '',
        telefone: doctor.telefone || '',
        senha: doctor.senha || ''
    });

    const handleSave = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const response = await fetch(`/api/medicos/${doctor.id}/perfil`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
            const data = await readApiResponse(response);

            if (!response.ok) throw new Error(data.error || 'Falha ao atualizar perfil.');

            onUpdate(data.doctor);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/80 px-4 backdrop-blur-lg" onClick={onClose}>
            <div className="w-full max-w-md rounded-[2.5rem] border border-slate-700 bg-slate-900 p-8 shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="mb-8 text-center">
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 ring-1 ring-emerald-500/20">
                        <svg className="h-8 w-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                    </div>
                    <h3 className="text-2xl font-black text-white">Meu Perfil</h3>
                    <p className="text-sm text-slate-400 mt-2">Mantenha seus dados de contato e acesso atualizados.</p>
                </div>

                {error && (
                    <div className="mb-6 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200 text-center">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSave} className="grid gap-5">
                    <div>
                        <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-slate-500">Nome Completo</label>
                        <input
                            type="text"
                            value={formData.nome}
                            onChange={e => setFormData({ ...formData, nome: e.target.value })}
                            className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-emerald-400"
                            required
                        />
                    </div>
                    <div>
                        <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-slate-500">Telefone / WhatsApp</label>
                        <input
                            type="text"
                            value={formData.telefone}
                            onChange={e => setFormData({ ...formData, telefone: e.target.value })}
                            placeholder="(27) 99999-9999"
                            className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-emerald-400"
                            required
                        />
                    </div>
                    <div>
                        <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-slate-500">Senha Privada</label>
                        <input
                            type="text" // Texto para ser fÃ¡cil de ver e trocar conforme instruÃ§Ã£o "facil de mudar"
                            value={formData.senha}
                            onChange={e => setFormData({ ...formData, senha: e.target.value })}
                            className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-emerald-400"
                            required
                        />
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3">
                        <button
                            type="submit"
                            disabled={loading}
                            className="rounded-2xl bg-emerald-500 py-4 text-sm font-black text-slate-950 transition hover:bg-emerald-400 disabled:opacity-50"
                        >
                            {loading ? 'Salvando...' : 'Salvar Dados'}
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-2xl bg-slate-800 py-4 text-sm font-bold text-slate-300 transition hover:bg-slate-700"
                        >
                            Voltar
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default function DoctorView() {
    const { session, logout } = useAuth();
    const [state, setState] = useState(initialState);

    const loadCalendar = async (doctorId, month, unitId = '') => {
        if (!doctorId) return;
        
        setState((current) => ({ ...current, loadingCalendar: true, error: '' }));

        try {
            const queryUnit = unitId ? `&unitId=${unitId}` : '';
            const response = await fetch(`/api/medicos/${doctorId}/calendario?month=${month}${queryUnit}`);
            const data = await parseJsonSafely(response);

            if (!response.ok) {
                const msg = data?.details ? `${data.error} (${data.details})` : data?.error || 'Nao foi possivel carregar o calendario.';
                throw new Error(msg);
            }

            setState((current) => ({
                ...current,
                loadingCalendar: false,
                calendar: data,
                bookedShiftIds: data?.bookedShiftIds || [],
                selectedDay: ''
            }));
        } catch (error) {
            setState((current) => ({ ...current, loadingCalendar: false, error: error.message }));
        }
    };

    const fetchMyAgenda = async () => {
        if (!session?.id) return;
        try {
            const response = await fetch(`/api/medicos/${session.id}/agenda`);
            const data = await parseJsonSafely(response);
            if (response.ok) {
                setState(prev => ({ ...prev, myAgenda: data || [], showAgendaModal: true }));
            }
        } catch (err) {
            console.error('Erro ao buscar agenda:', err);
        }
    };

    useEffect(() => {
        if (session?.id) {
            loadCalendar(session.id, state.selectedMonth, state.selectedUnitId);
            
            // SugestÃ£o de troca de senha se for a padrÃ£o
            if (session.senha === '12345' && !localStorage.getItem(`hide_pass_suggest_${session.id}`)) {
                setState(prev => ({ ...prev, showPasswordSuggestion: true }));
            }
        }
    }, [session?.id, state.selectedMonth, state.selectedUnitId]);

    useEffect(() => {
        if (!session?.id) return;
        setState((current) => ({
            ...current,
            bookingConfigs: loadBookingConfigs(session.id)
        }));
    }, [session?.id]);

    const persistBookingConfigEntries = (entries) => {
        if (!session?.id || !entries || Object.keys(entries).length === 0) return;

        setState((current) => {
            const nextConfigs = {
                ...current.bookingConfigs,
                ...entries
            };
            saveBookingConfigs(session.id, nextConfigs);
            return {
                ...current,
                bookingConfigs: nextConfigs
            };
        });
    };

    const findShiftById = (shiftId) => (state.calendar?.shifts || []).find((shift) => shift.id === shiftId);

    const releaseReservationHold = async (shiftId) => {
        if (!session?.id || !shiftId) return;

        try {
            await fetch(`/api/vagas/${shiftId}/bloquear`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ medicoId: session.id })
            });
        } catch {}
    };

    const handleSelectShift = async (shiftId) => {
        if (!session?.id) return;

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
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ medicoId: session.id })
            });
            const data = await parseJsonSafely(response);

            if (!response.ok) throw new Error(data?.error || 'Nao foi possivel iniciar a reserva.');

            const shift = findShiftById(shiftId);

            setState((current) => ({
                ...current,
                modal: {
                    type: 'select-shift-type',
                    shiftId,
                    shift,
                    reservedUntil: data?.hold?.reservedUntil,
                    title: 'Tipo de plantao',
                    message: 'Escolha se o plantao sera completo, parcial ou fixo antes de finalizar a reserva.',
                    form: getDefaultBookingForm(shift)
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
                    loadCalendar(session.id, state.selectedMonth);
                    setState((current) => ({ ...current, reservandoId: '', modal: null }));
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
        if (activeModal?.type === 'loading') {
            return;
        }
        if (activeModal?.shiftId && activeModal?.type !== 'feedback' && activeModal?.type !== 'loading') {
            releaseReservationHold(activeModal.shiftId);
        }
        setState((current) => ({
            ...current,
            modal: null,
            reservandoId: activeModal?.shiftId ? '' : current.reservandoId
        }));
    };

    const updateBookingForm = (field, value) => {
        setState((current) => {
            if (!current.modal?.form) return current;

            return {
                ...current,
                modal: {
                    ...current.modal,
                    form: {
                        ...current.modal.form,
                        [field]: value
                    }
                }
            };
        });
    };

    const buildReservationPayload = (form) => {
        if (form.bookingType === 'PARCIAL') {
            return {
                bookingType: 'PARCIAL',
                startTime: form.partialStartTime,
                endTime: form.partialEndTime
            };
        }

        if (form.bookingType === 'FIXO') {
            return {
                bookingType: 'FIXO',
                fixedMode: form.fixedMode,
                fixedEndDate: form.fixedEndDate,
                startTime: form.fixedMode === 'PARCIAL' ? form.fixedStartTime : null,
                endTime: form.fixedMode === 'PARCIAL' ? form.fixedEndTime : null
            };
        }

        return {
            bookingType: 'COMPLETO'
        };
    };

    const validateReservationForm = (modalState) => {
        const form = modalState?.form;
        const shift = modalState?.shift;

        if (!form || !shift) {
            return 'Plantao selecionado invalido.';
        }

        if (form.bookingType === 'PARCIAL') {
            if (!form.partialStartTime || !form.partialEndTime) {
                return 'Selecione o horario inicial e final do plantao parcial.';
            }

            if (form.partialStartTime >= form.partialEndTime) {
                return 'O horario final precisa ser maior que o horario inicial.';
            }
        }

        if (form.bookingType === 'FIXO') {
            if (!form.fixedEndDate) {
                return 'Selecione a data final do plantao fixo.';
            }

            if (form.fixedEndDate < shift.data) {
                return 'A data final do plantao fixo nao pode ser anterior ao dia selecionado.';
            }

            if (form.fixedMode === 'PARCIAL') {
                if (!form.fixedStartTime || !form.fixedEndTime) {
                    return 'Selecione o horario inicial e final do plantao fixo parcial.';
                }

                if (form.fixedStartTime >= form.fixedEndTime) {
                    return 'O horario final do plantao fixo precisa ser maior que o horario inicial.';
                }
            }
        }

        return '';
    };

    const reserveSingleShift = async (shiftId, payload, acquireHold = false) => {
        if (acquireHold) {
            const holdResponse = await fetch(`/api/vagas/${shiftId}/bloquear`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ medicoId: session.id })
            });
            const holdData = await parseJsonSafely(holdResponse);

            if (!holdResponse.ok) {
                throw new Error(holdData?.error || 'Nao foi possivel bloquear uma das vagas da sequencia.');
            }
        }

        const response = await fetch(`/api/vagas/${shiftId}/selecionar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ medicoId: session.id, ...payload })
        });
        const data = await parseJsonSafely(response);

        if (!response.ok) {
            if (acquireHold) {
                await releaseReservationHold(shiftId);
            }
            throw new Error(data?.error || 'Falha ao reservar plantao.');
        }

        return data;
    };

    const handleConfirmReservation = async () => {
        if (!session?.id || state.modal?.type !== 'select-shift-type') return;

        const shiftId = state.modal.shiftId;
        const shift = state.modal.shift;
        const validationError = validateReservationForm(state.modal);

        if (validationError) {
            setState((current) => ({
                ...current,
                error: validationError
            }));
            return;
        }

        const payload = buildReservationPayload(state.modal.form);
        const sequenceGroupId =
            payload.bookingType === 'FIXO'
                ? (globalThis.crypto?.randomUUID?.() ?? `fixed-${Date.now()}-${session.id}`)
                : null;

        const payloadWithSequence = sequenceGroupId
            ? { ...payload, sequenceGroupId }
            : payload;
        try {
            setState((current) => ({
                ...current,
                modal: {
                    type: 'loading',
                    title: 'Processando reserva',
                    message: payloadWithSequence.bookingType === 'FIXO'
                        ? 'Estamos aplicando a sequencia fixa de plantao nos dias selecionados.'
                        : 'Estamos confirmando sua vez na fila e registrando o agendamento.'
                }
            }));

            let successMessage = 'Plantao reservado com sucesso.';
            const savedConfigs = {};

            if (payloadWithSequence.bookingType === 'FIXO') {
                const sequenceShifts = (state.calendar?.shifts || [])
                    .filter((calendarShift) =>
                        calendarShift.turno === shift.turno &&
                        calendarShift.data >= shift.data &&
                        calendarShift.data <= payloadWithSequence.fixedEndDate
                    )
                    .sort((left, right) => left.data.localeCompare(right.data));

                if (sequenceShifts.length === 0) {
                    throw new Error('Nenhum plantao sequencial foi encontrado para o periodo informado.');
                }

                const bookedIds = [];
                const failedDates = [];

                for (const [index, targetShift] of sequenceShifts.entries()) {
                    try {
                        await reserveSingleShift(targetShift.id, payloadWithSequence, index !== 0);
                        bookedIds.push(targetShift.id);
                        savedConfigs[targetShift.id] = {
                            bookingType: 'FIXO',
                            fixedMode: payloadWithSequence.fixedMode,
                            fixedEndDate: payloadWithSequence.fixedEndDate,
                            startTime: payloadWithSequence.startTime,
                            endTime: payloadWithSequence.endTime
                        };
                    } catch (reservationError) {
                        failedDates.push(`${formatDisplayDate(targetShift.data)} (${reservationError.message})`);
                    }
                }

                if (bookedIds.length === 0) {
                    throw new Error(failedDates[0] || 'Nao foi possivel reservar a sequencia fixa.');
                }

                successMessage = failedDates.length > 0
                    ? `Sequencia fixa aplicada em ${bookedIds.length} dia(s). Algumas datas nao puderam ser reservadas: ${failedDates.join('; ')}`
                    : `Sequencia fixa aplicada com sucesso em ${bookedIds.length} dia(s).`;
            } else {
                const data = await reserveSingleShift(shiftId, payloadWithSequence, false);
                successMessage = data?.message || 'Plantao reservado com sucesso.';
                savedConfigs[shiftId] = {
                    bookingType: payloadWithSequence.bookingType,
                    startTime: payloadWithSequence.startTime,
                    endTime: payloadWithSequence.endTime
                };
            }

            persistBookingConfigEntries(savedConfigs);

            setState((current) => ({
                ...current,
                reservandoId: '',
                success: successMessage,
                modal: {
                    type: 'feedback',
                    variant: 'success',
                    title: 'Reserva confirmada',
                    message: successMessage
                }
            }));

            loadCalendar(session.id, state.selectedMonth);
        } catch (error) {
            setState((current) => ({
                ...current,
                reservandoId: '',
                error: error.message,
                modal: {
                    type: 'feedback',
                    variant: 'error',
                    title: /TEMPO EXCEDIDO! VAGA INDISPONIVEL!/i.test(error.message) ? 'TEMPO EXCEDIDO!' : 'Reserva nao concluida',
                    message: /TEMPO EXCEDIDO! VAGA INDISPONIVEL!/i.test(error.message) ? 'VAGA INDISPONÃVEL!' : error.message
                }
            }));
        }
    };

    const { loadingCalendar, modal, error, success, reservandoId, selectedMonth, selectedDay, selectedUnitId, bookedShiftIds, showAgendaModal, showProfileModal, showPasswordSuggestion, myAgenda, calendar, bookingConfigs } = state;
    const calendarDays = buildCalendarDays(selectedMonth, calendar?.shifts || []);
    const outsideForecast = isOutsideForecastWindow(selectedMonth);
    const { current: forecastCurrent, next: forecastNext } = getForecastWindow();
    
    const getShiftAlertClasses = (shift) => {
        const isMine = bookedShiftIds.includes(shift.id);
        if (isMine) {
            return 'border border-sky-400 bg-sky-500/20 text-sky-100 shadow-[0_0_15px_rgba(56,189,248,0.4)] ';
        }
        return shift.vagas <= 0
            ? 'border border-rose-400/70 bg-rose-500/10 text-rose-100 shadow-[0_0_0_1px_rgba(251,113,133,0.28),0_0_22px_rgba(244,63,94,0.2)] '
            : 'border border-emerald-400/15 bg-emerald-500/10';
    };
            
    const visibleMonth = selectedDay ? getMonthFromDate(selectedDay) : selectedMonth;
    
    const selectedDayShifts = useMemo(() => {
        if (!selectedDay) return [];
        return (calendar?.shifts || []).filter((shift) => shift.data === selectedDay);
    }, [calendar, selectedDay]);

    if (!session) return null;

    return (
        <div className="min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_top,_rgba(34,197,94,0.24),_transparent_32%),linear-gradient(180deg,_#020617_0%,_#0f172a_52%,_#111827_100%)] text-slate-100">
            {/* SugestÃ£o de Troca de Senha */}
            {showPasswordSuggestion && (
                <div className="flex flex-col gap-3 bg-emerald-500/90 px-4 py-3 text-slate-950 animate-in slide-in-from-top duration-300 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                    <p className="flex items-start gap-2 text-sm font-bold sm:items-center">
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                        Sua senha ainda Ã© a padrÃ£o (12345). Para sua seguranÃ§a, recomendamos trocÃ¡-la agora.
                    </p>
                    <div className="flex flex-wrap items-center gap-4">
                        <button onClick={() => setState(prev => ({ ...prev, showProfileModal: true, showPasswordSuggestion: false }))} className="text-xs font-black uppercase underline hover:no-underline">Trocar Agora</button>
                        <button onClick={() => { setState(prev => ({ ...prev, showPasswordSuggestion: false })); localStorage.setItem(`hide_pass_suggest_${session.id}`, 'true'); }} className="text-xs font-bold opacity-70">NÃ£o agora</button>
                    </div>
                </div>
            )}

            <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-10">
                <header className="mb-10 flex flex-col gap-4 border-b border-emerald-500/20 pb-6 md:flex-row md:items-end md:justify-between">
                    <div className="flex flex-col gap-1">
                        <p className="mb-2 text-sm uppercase tracking-[0.3em] text-emerald-300/70">GESTÃƒO DE PLANTÃ•ES</p>
                        <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">Agenda mensal de plantÃµes</h1>
                        
                        <div className="mt-4 flex flex-wrap items-center gap-4">
                            <div className="text-xs text-slate-400 uppercase tracking-widest font-bold">Unidade Atual:</div>
                            
                            {(session?.unidadesAutorizadas || []).length > 1 ? (
                                <select 
                                    value={selectedUnitId || session.unidadeFixaId}
                                    onChange={(e) => setState(prev => ({ ...prev, selectedUnitId: e.target.value, selectedDay: '' }))}
                                    className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-2 text-sm font-bold text-emerald-100 outline-none transition focus:border-emerald-400 focus:bg-emerald-500/10"
                                >
                                    {(session.unidadesAutorizadas || []).map(ua => (
                                        <option key={ua.id} value={ua.id} className="bg-slate-900 text-white">
                                            {ua.nome} {ua.tipo === 'BASE' ? '(Fixa)' : '(Auxiliar)'}
                                        </option>
                                    ))}
                                </select>
                            ) : (
                                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-sm font-bold text-emerald-100 italic">
                                    {session.unidadeFixaNome}
                                </div>
                            )}

                            <div className="h-4 w-px bg-slate-800 mx-2 hidden md:block"></div>

                            <div className="text-sm text-slate-300">
                                Especialidade: <span className="font-bold text-emerald-300">{session.especialidade}</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={fetchMyAgenda}
                            title="Ver minha agenda"
                            className="group relative flex items-center justify-center rounded-2xl border border-slate-700 bg-slate-900 p-4 transition hover:bg-slate-800 hover:border-emerald-400/40"
                        >
                            <svg className="h-6 w-6 text-emerald-400 group-hover:scale-110 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                            </svg>
                            <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-bold text-slate-950">
                                {bookedShiftIds.length}
                            </span>
                        </button>

                        <button
                            onClick={() => setState(prev => ({ ...prev, showProfileModal: true }))}
                            className="text-left group flex items-center gap-3 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-5 py-4 transition hover:bg-emerald-500/20 shadow-lg shadow-emerald-950/30"
                        >
                            <div className="rounded-full bg-emerald-500/20 p-2 group-hover:bg-emerald-500/30 transition">
                                <svg className="h-5 w-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                </svg>
                            </div>
                            <div>
                                <div className="font-bold text-emerald-100">{session.nome}</div>
                                <div className="text-xs text-emerald-200/70">{session.crm}</div>
                            </div>
                        </button>
                        <button
                            type="button"
                            onClick={logout}
                            className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm font-bold text-slate-200 transition hover:bg-slate-800"
                        >
                            Sair
                        </button>
                    </div>
                </header>

                <section className="mb-8 flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-slate-800 bg-slate-900/60 p-4">
                    <div className="text-sm text-slate-300">Selecione o mÃªs e clique no dia desejado para ver os plantÃµes disponÃ­veis.</div>

                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={() => setState((current) => ({ ...current, selectedDay: '', selectedMonth: shiftMonth(current.selectedMonth, -1) }))}
                            className="rounded-2xl bg-slate-800 px-3 py-2 text-sm font-bold text-slate-200 transition hover:bg-slate-700 sm:px-4"
                        >
                            MÃªs anterior
                        </button>
                        <div className="min-w-0 flex-1 text-center text-sm font-semibold capitalize text-slate-200 sm:min-w-44">{getMonthTitle(visibleMonth)}</div>
                        <button
                            type="button"
                            onClick={() => setState((current) => ({ ...current, selectedDay: '', selectedMonth: shiftMonth(current.selectedMonth, 1) }))}
                            className="rounded-2xl bg-slate-800 px-3 py-2 text-sm font-bold text-slate-200 transition hover:bg-slate-700 sm:px-4"
                        >
                            PrÃ³ximo mÃªs
                        </button>
                        </div>
                </section>

                {outsideForecast && (
                    <div className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-400/30 bg-amber-500/10 px-5 py-4 text-sm text-amber-200 animate-in slide-in-from-top-2 duration-300">
                        <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-400" />
                        <div>
                            <p className="font-bold text-amber-300">MÃªs fora da janela de previsÃ£o</p>
                            <p className="mt-1 text-amber-200/80">
                                O preditor cobre apenas <span className="font-semibold capitalize">{getMonthTitle(forecastCurrent)}</span> e{' '}
                                <span className="font-semibold capitalize">{getMonthTitle(forecastNext)}</span>.
                                O calendÃ¡rio abaixo pode ficar vazio ou incompleto.
                            </p>
                        </div>
                    </div>
                )}

                {success && <div className="mb-6 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{success}</div>}
                {error && <div className="mb-6 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</div>}

                {!selectedDay ? (
                    <section className="rounded-[2rem] border border-slate-800 bg-slate-900/75 p-6 shadow-2xl shadow-slate-950/40">
                        <div className="mb-6 flex flex-col gap-3 border-b border-slate-800 pb-5 md:flex-row md:items-end md:justify-between">
                            <div>
                                <p className="text-sm uppercase tracking-[0.25em] text-emerald-300/70">CalendÃ¡rio</p>
                                <h2 className="mt-2 text-3xl font-black text-white">{session.nome}</h2>
                                <p className="mt-2 text-sm text-slate-400">
                                    Unidade: <span className="text-slate-200">{calendar?.unit?.nome || session.unidadeFixaNome}</span> | Especialidade:{' '}
                                    <span className="text-slate-200">{calendar?.specialty || session.especialidade}</span>
                                </p>
                            </div>
                            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                                {(calendar?.shifts || []).length} plantÃµes no mÃªs
                            </div>
                        </div>

                        {loadingCalendar ? (
                            <div className="rounded-3xl bg-slate-950/50 p-10 text-center text-slate-300">Carregando calendÃ¡rio...</div>
                        ) : (
                            <>
                                <div className="mb-4 hidden grid-cols-7 gap-3 md:grid">
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
                                                onClick={() => setState((current) => ({ ...current, selectedMonth: getMonthFromDate(entry.date), selectedDay: entry.date }))}
                                                className="min-h-40 rounded-3xl border border-slate-800 bg-slate-950/50 p-4 text-left transition hover:border-emerald-400/40"
                                            >
                                                <div className="mb-4 flex items-center justify-between">
                                                    <span className="text-sm font-bold text-white">{String(entry.day).padStart(2, '0')}</span>
                                                    <span className="text-xs uppercase tracking-[0.2em] text-slate-500">{entry.shifts.length} turno{entry.shifts.length === 1 ? '' : 's'}</span>
                                                </div>

                                                <div className="grid gap-1.5">
                                                    {entry.shifts.length === 0 ? (
                                                        <div className="rounded-2xl border border-dashed border-slate-800 px-3 py-4 text-xs text-slate-500">
                                                            Sem agenda para este dia.
                                                        </div>
                                                    ) : (
                                                        entry.shifts.map((shift) => (
                                                            <div key={shift.id} className={`rounded-xl px-2 py-1.5 ${getShiftAlertClasses(shift)}`}>
                                                                <div className={`text-[11px] font-bold ${shift.vagas <= 0 ? 'text-rose-100' : 'text-emerald-100'}`}>{shift.turno}</div>
                                                                <div className={`mt-0.5 text-[9px] uppercase tracking-[0.1em] ${shift.vagas <= 0 ? 'text-rose-200/80' : 'text-slate-500'}`}>
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
                                onClick={() => setState((current) => ({ ...current, selectedDay: '' }))}
                                className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm font-bold text-slate-200 transition hover:bg-slate-800"
                            >
                                Voltar ao calendÃ¡rio
                            </button>
                        </div>

                        {selectedDayShifts.length === 0 ? (
                            <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-10 text-center text-slate-300">
                                NÃ£o hÃ¡ plantÃµes disponÃ­veis em {formatDisplayDate(selectedDay)}.
                            </div>
                        ) : (
                            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                                {selectedDayShifts.map((shift) => (
                                    <article
                                        key={shift.id}
                                        className={`rounded-3xl border bg-slate-900/80 p-6 shadow-2xl shadow-slate-950/40 transition duration-300 hover:-translate-y-1 ${
                                            shift.vagas <= 0
                                                ? 'border-rose-400/70 shadow-[0_0_0_1px_rgba(251,113,133,0.28),0_0_28px_rgba(244,63,94,0.2)] '
                                                : bookedShiftIds.includes(shift.id)
                                                    ? 'border-sky-400 shadow-[0_0_30px_rgba(56,189,248,0.3)] '
                                                    : 'border-slate-800 hover:border-emerald-400/40'
                                        }`}
                                    >
                                        <div className="mb-5 flex items-start justify-between gap-3">
                                            <div>
                                                <span
                                                    className={`inline-flex rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.2em] ${
                                                        bookedShiftIds.includes(shift.id)
                                                            ? 'border border-sky-400/40 bg-sky-500/10 text-sky-200'
                                                            : shift.vagas <= 0
                                                                ? 'border border-rose-400/40 bg-rose-500/10 text-rose-200'
                                                                : 'border border-emerald-400/20 bg-emerald-500/10 text-emerald-300'
                                                    }`}
                                                >
                                                    {shift.turno} {bookedShiftIds.includes(shift.id) && 'â€¢ MEU PLANTÃƒO'}
                                                </span>
                                                <h2 className="mt-4 text-2xl font-bold text-white">{shift.local}</h2>
                                            </div>
                                            <span className="text-sm text-slate-400">{formatDisplayDate(shift.data)}</span>
                                        </div>

                                        <div className={`mb-6 rounded-2xl p-4 ${shift.vagas <= 0 ? 'bg-rose-950/30 ring-1 ring-rose-400/30' : 'bg-slate-800/70'}`}>
                                            <p className="text-sm text-slate-400">Especialidade</p>
                                            <p className="mt-2 text-lg font-bold text-white">{shift.especialidade}</p>
                                            <p className="mt-4 text-sm text-slate-400">Vagas disponÃ­veis</p>
                                            <p className={`mt-2 text-3xl font-black ${shift.vagas <= 0 ? 'text-rose-200' : 'text-white'}`}>{shift.vagas}</p>
                                            <p className={`mt-2 text-xs uppercase tracking-[0.2em] ${shift.vagas <= 0 ? 'text-rose-200/80' : 'text-emerald-200/70'}`}>{shift.status}</p>
                                            {bookedShiftIds.includes(shift.id) && bookingConfigs[shift.id] ? (
                                                <p className="mt-3 text-xs text-sky-200/90">{buildBookingConfigLabel(bookingConfigs[shift.id])}</p>
                                            ) : null}
                                        </div>

                                        <button
                                            type="button"
                                            onClick={() => handleSelectShift(shift.id)}
                                            disabled={reservandoId === shift.id || shift.vagas <= 0}
                                            className="w-full rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                                        >
                                            {reservandoId === shift.id ? 'Reservando...' : 'Aceitar plantÃ£o'}
                                        </button>
                                    </article>
                                ))}
                            </div>
                        )}
                    </section>
                )}
            {/* Modal de Perfil do MÃ©dico */}
            {showProfileModal && (
                <ProfileModal 
                    doctor={session} 
                    onClose={() => setState(p => ({ ...p, showProfileModal: false }))}
                    onUpdate={(updatedDoc) => {
                        setState(p => ({ ...p, showProfileModal: false }));
                        // Atualiza a sessÃ£o localmente (depende da sua implementaÃ§Ã£o de AuthContext ter persistÃªncia/update)
                        window.location.reload(); // Forma bruta de atualizar a sessÃ£o pro mÃ©dico ver o novo nome/senha
                    }}
                />
            )}

            {/* Modal de Agenda do MÃ©dico */}
            {showAgendaModal && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/80 px-4 backdrop-blur-md" onClick={() => setState(p => ({ ...p, showAgendaModal: false }))}>
                    <div className="flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-[2.5rem] border border-slate-700 bg-slate-900 shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="flex flex-col gap-4 border-b border-slate-800 bg-slate-900/50 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-8">
                            <div>
                                <p className="text-xs font-bold uppercase tracking-[0.3em] text-emerald-400 mb-1">Meus Agendamentos</p>
                                <h3 className="text-3xl font-black text-white">Sua agenda de plantÃµes</h3>
                            </div>
                            <button 
                                onClick={() => setState(p => ({ ...p, showAgendaModal: false }))}
                                className="p-3 rounded-2xl bg-slate-800 text-slate-400 hover:text-white transition"
                            >
                                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto p-4 sm:p-8">
                            {myAgenda.length === 0 ? (
                                <div className="py-20 text-center">
                                    <div className="inline-flex p-6 rounded-full bg-slate-800/50 mb-6">
                                        <svg className="h-12 w-12 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
                                    </div>
                                    <h4 className="text-xl font-bold text-slate-300">Nenhum plantÃ£o reservado</h4>
                                    <p className="text-slate-500 mt-2">Os plantÃµes que vocÃª aceitar aparecerÃ£o aqui.</p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto rounded-3xl border border-slate-800 bg-slate-950/30">
                                    <table className="min-w-[640px] w-full text-left">
                                        <thead>
                                            <tr className="bg-slate-900 border-b border-slate-800 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                                <th className="px-6 py-4">Data</th>
                                                <th className="px-6 py-4">Unidade</th>
                                                <th className="px-6 py-4">Turno</th>
                                                <th className="px-6 py-4">Tipo</th>
                                                <th className="px-6 py-4">Especialidade</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-800/50">
                                            {myAgenda.map(item => (
                                                <tr key={item.id} className="hover:bg-slate-800/30 transition-colors group">
                                                    <td className="px-6 py-4 font-mono text-sm text-emerald-400">{formatDisplayDate(item.data)}</td>
                                                    <td className="px-6 py-4 font-bold text-white">{item.unidade}</td>
                                                    <td className="px-6 py-4">
                                                        <span className="inline-flex rounded-lg bg-sky-500/10 border border-sky-500/20 px-2.5 py-1 text-[10px] font-black uppercase text-sky-400">
                                                            {item.turno}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 text-xs text-slate-300">
                                                        {buildAgendaBookingLabel(item, bookingConfigs[item.disponibilidadeId])}
                                                    </td>
                                                    <td className="px-6 py-4 text-slate-400 group-hover:text-slate-200">{item.especialidade}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

                {modal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-6 backdrop-blur-sm" onClick={closeModal}>
                        <div className="w-full max-w-xl rounded-[2rem] border border-slate-700 bg-slate-900/95 p-6 shadow-2xl shadow-slate-950/60" onClick={(event) => event.stopPropagation()}>
                            <div
                                className={`mb-4 inline-flex rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.25em] ${
                                    modal.type === 'loading'
                                        ? 'border border-sky-400/30 bg-sky-500/10 text-sky-200'
                                        : modal.variant === 'success'
                                          ? 'border border-emerald-400/30 bg-emerald-500/10 text-emerald-200'
                                          : modal.variant === 'warning'
                                            ? 'border border-amber-400/30 bg-amber-500/10 text-amber-200'
                                            : modal.type === 'select-shift-type'
                                              ? 'border border-emerald-400/30 bg-emerald-500/10 text-emerald-200'
                                              : 'border border-rose-400/30 bg-rose-500/10 text-rose-200'
                                }`}
                            >
                                {modal.type === 'loading' ? 'PROCESSANDO' : modal.type === 'select-shift-type' ? 'ConfiguraÃ§Ã£o' : 'Processado'}
                            </div>

                            <h3 className="text-2xl font-black text-white">{modal.title}</h3>
                            <p className="mt-3 text-sm leading-6 text-slate-300">{modal.message}</p>

                            {modal.type === 'select-shift-type' ? (
                                <div className="mt-6 space-y-4">
                                    <div className="grid gap-3">
                                        {bookingTypeOptions.map((option) => (
                                            <button
                                                key={option.id}
                                                type="button"
                                                onClick={() => updateBookingForm('bookingType', option.id)}
                                                className={`rounded-2xl border px-4 py-4 text-left transition ${
                                                    modal.form.bookingType === option.id
                                                        ? 'border-emerald-400 bg-emerald-500/10 shadow-[0_0_20px_rgba(16,185,129,0.12)]'
                                                        : 'border-slate-700 bg-slate-950/40 hover:border-slate-500'
                                                }`}
                                            >
                                                <div className="text-sm font-black text-white">{option.label}</div>
                                                <div className="mt-1 text-xs text-slate-400">{option.description}</div>
                                            </button>
                                        ))}
                                    </div>

                                    {modal.form.bookingType === 'PARCIAL' ? (
                                        <div className="grid grid-cols-2 gap-3 rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
                                            <div>
                                                <label className="mb-2 block text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">Hora inÃ­cio</label>
                                                <input
                                                    type="time"
                                                    value={modal.form.partialStartTime}
                                                    onChange={(event) => updateBookingForm('partialStartTime', event.target.value)}
                                                    className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
                                                />
                                            </div>
                                            <div>
                                                <label className="mb-2 block text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">Hora fim</label>
                                                <input
                                                    type="time"
                                                    value={modal.form.partialEndTime}
                                                    onChange={(event) => updateBookingForm('partialEndTime', event.target.value)}
                                                    className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
                                                />
                                            </div>
                                        </div>
                                    ) : null}

                                    {modal.form.bookingType === 'FIXO' ? (
                                        <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
                                            <div>
                                                <label className="mb-2 block text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">PerÃ­odo em dias</label>
                                                <div className="grid gap-3 md:grid-cols-2">
                                                    <div>
                                                        <label className="mb-2 block text-[10px] font-bold uppercase tracking-[0.22em] text-slate-600">De</label>
                                                        <input
                                                            type="date"
                                                            value={modal.shift?.data || ''}
                                                            disabled
                                                            className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-400 outline-none"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="mb-2 block text-[10px] font-bold uppercase tracking-[0.22em] text-slate-600">AtÃ©</label>
                                                        <input
                                                            type="date"
                                                            min={modal.shift?.data}
                                                            value={modal.form.fixedEndDate}
                                                            onChange={(event) => updateBookingForm('fixedEndDate', event.target.value)}
                                                            className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
                                                        />
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 gap-3">
                                                <button
                                                    type="button"
                                                    onClick={() => updateBookingForm('fixedMode', 'COMPLETO')}
                                                    className={`rounded-2xl border px-4 py-3 text-sm font-bold transition ${
                                                        modal.form.fixedMode === 'COMPLETO'
                                                            ? 'border-emerald-400 bg-emerald-500/10 text-emerald-100'
                                                            : 'border-slate-700 bg-slate-900 text-slate-300'
                                                    }`}
                                                >
                                                    Fixo completo
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => updateBookingForm('fixedMode', 'PARCIAL')}
                                                    className={`rounded-2xl border px-4 py-3 text-sm font-bold transition ${
                                                        modal.form.fixedMode === 'PARCIAL'
                                                            ? 'border-emerald-400 bg-emerald-500/10 text-emerald-100'
                                                            : 'border-slate-700 bg-slate-900 text-slate-300'
                                                    }`}
                                                >
                                                    Fixo parcial
                                                </button>
                                            </div>

                                            {modal.form.fixedMode === 'PARCIAL' ? (
                                                <div className="grid grid-cols-2 gap-3">
                                                    <div>
                                                        <label className="mb-2 block text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">Hora inÃ­cio</label>
                                                        <input
                                                            type="time"
                                                            value={modal.form.fixedStartTime}
                                                            onChange={(event) => updateBookingForm('fixedStartTime', event.target.value)}
                                                            className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="mb-2 block text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">Hora fim</label>
                                                        <input
                                                            type="time"
                                                            value={modal.form.fixedEndTime}
                                                            onChange={(event) => updateBookingForm('fixedEndTime', event.target.value)}
                                                            className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
                                                        />
                                                    </div>
                                                </div>
                                            ) : null}
                                        </div>
                                    ) : null}
                                </div>
                            ) : null}

                            {modal.type === 'loading' ? (
                                <div className="mt-6 flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-950/55 px-4 py-4">
                                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-700 border-t-sky-300" />
                                    <div className="text-sm text-slate-300">
                                        Processando sua solicitaÃ§Ã£o...
                                    </div>
                                </div>
                            ) : null}

                            <div className="mt-6 flex gap-3">
                                {modal.type === 'select-shift-type' ? (
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
                                            Finalizar agendamento
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
                )}
            </div>
        </div>
    );
}


