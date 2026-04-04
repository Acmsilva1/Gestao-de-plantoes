import React, { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { readApiResponse } from '../utils/api';

const UNIT_SHIFT_ORDER = ['Manhã', 'Tarde', 'Noite', 'Madrugada'];

const initialState = {
    loadingCalendar: false,
    error: '',
    selectedMonth: new Date().toISOString().slice(0, 7),
    selectedUnitId: '',
    bookedShiftIds: [],
    showEscalaModal: false,
    showProfileModal: false,
    showPasswordSuggestion: false,
    myEscala: [],
    calendar: null,
    bookingConfigs: {},
    shiftDetailModal: null,
    pendentesColegaTroca: 0,
    pedidosTroca: []
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

const buildCalendarDayEntries = (month, shifts) => {
    const [year, monthIndex] = month.split('-').map(Number);
    const firstDay = getMonthAnchorDate(month);
    const totalDays = new Date(Date.UTC(year, monthIndex, 0)).getUTCDate();
    const leadingBlankDays = weekdayIndexByShortName[weekdayFormatter.format(firstDay)] ?? 0;

    const days = [];
    for (let index = 0; index < leadingBlankDays; index += 1) {
        days.push({ key: `blank-${index}`, empty: true });
    }

    for (let day = 1; day <= totalDays; day += 1) {
        const date = `${month}-${String(day).padStart(2, '0')}`;
        const byTurn = Object.fromEntries(UNIT_SHIFT_ORDER.map((t) => [t, null]));
        for (const shift of shifts) {
            if (shift.data === date && Object.prototype.hasOwnProperty.call(byTurn, shift.turno)) {
                byTurn[shift.turno] = shift;
            }
        }
        const turnSlots = UNIT_SHIFT_ORDER.map((turno) => ({ turno, shift: byTurn[turno] }));
        days.push({
            key: `day-${day}`,
            empty: false,
            day,
            date,
            turnSlots
        });
    }
    return days;
};

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

const buildBookingConfigLabel = (config) => {
    if (!config) return '';
    if (config.bookingType === 'PARCIAL') {
        return `Parcial â€¢ ${config.startTime} às ${config.endTime}`;
    }
    if (config.bookingType === 'FIXO') {
        if (config.fixedMode === 'PARCIAL') {
            return `Fixo parcial â€¢ até ${formatDisplayDate(config.fixedEndDate)} â€¢ ${config.startTime} às ${config.endTime}`;
        }
        return `Fixo completo â€¢ até ${formatDisplayDate(config.fixedEndDate)}`;
    }
    return 'Completo';
};

const buildEscalaBookingLabel = (escalaItem, fallbackConfig) => {
    if (escalaItem?.tipoPlantao === 'PARCIAL') {
        return escalaItem.horaInicio && escalaItem.horaFim
            ? `Parcial â€¢ ${escalaItem.horaInicio.slice(0, 5)} às ${escalaItem.horaFim.slice(0, 5)}`
            : 'Parcial';
    }

    if (escalaItem?.tipoPlantao === 'FIXO') {
        const rangeLabel =
            escalaItem.dataInicioFixo && escalaItem.dataFimFixo
                ? `${formatDisplayDate(escalaItem.dataInicioFixo)} até ${formatDisplayDate(escalaItem.dataFimFixo)}`
                : escalaItem.dataFimFixo
                  ? `até ${formatDisplayDate(escalaItem.dataFimFixo)}`
                  : 'Sequência fixa';

        if (escalaItem.horaInicio && escalaItem.horaFim) {
            return `Fixo parcial â€¢ ${rangeLabel} â€¢ ${escalaItem.horaInicio.slice(0, 5)} às ${escalaItem.horaFim.slice(0, 5)}`;
        }

        return `Fixo completo â€¢ ${rangeLabel}`;
    }

    return buildBookingConfigLabel(fallbackConfig) || 'Completo';
};

const isMyTurn = (shift, medicoId, bookedShiftIds) => {
    if (!shift || !medicoId) return false;
    if (bookedShiftIds.includes(shift.id)) return true;
    return (shift.plantonistas || []).some((p) => p.id === medicoId);
};

const turnButtonClass = (shift, medicoId, bookedShiftIds) => {
    const mine = isMyTurn(shift, medicoId, bookedShiftIds);
    if (mine) {
        return 'border-sky-400/80 bg-sky-500/25 text-sky-100 shadow-[0_0_12px_rgba(56,189,248,0.25)] ring-1 ring-sky-400/40';
    }
    if (shift) {
        return 'border-emerald-500/35 bg-emerald-500/10 text-emerald-100 hover:border-emerald-400/50';
    }
    return 'border-dashed border-slate-600/80 bg-slate-950/40 text-slate-500 hover:border-slate-500';
};

const trocaStatusLabel = (status, souSolicitante) => {
    switch (status) {
        case 'AGUARDANDO_COLEGA':
            return souSolicitante ? 'Aguardando confirmação do colega' : 'Aguardando a sua resposta';
        case 'AGUARDANDO_GESTOR':
            return 'Em processamento automatico';
        case 'APROVADO':
            return 'Aprovado - escala atualizada';
        case 'RECUSADO_COLEGA':
            return 'Recusado pelo colega';
        case 'RECUSADO_GESTOR':
            return 'Recusado';
        default:
            return status || '-';
    }
};

const ProfileModal = ({ doctor, pedidosTroca, onRefreshTrocas, onClose, onUpdate }) => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [respostaBusyId, setRespostaBusyId] = useState(null);
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

    const responderPedido = async (pedidoId, aceitar) => {
        setError('');
        setRespostaBusyId(pedidoId);
        try {
            const response = await fetch(`/api/medicos/${doctor.id}/trocas/${pedidoId}/responder`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ aceitar })
            });
            const data = await parseJsonSafely(response);
            if (!response.ok) throw new Error(data?.error || data?.details || 'Nao foi possivel responder.');
            await onRefreshTrocas?.();
        } catch (err) {
            setError(err.message);
        } finally {
            setRespostaBusyId(null);
        }
    };

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/80 px-4 backdrop-blur-lg" onClick={onClose}>
            <div
                className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-[2.5rem] border border-slate-700 bg-slate-900 p-8 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="mb-8 text-center">
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 ring-1 ring-emerald-500/20">
                        <svg className="h-8 w-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                    </div>
                    <h3 className="text-2xl font-black text-white">Meu Perfil</h3>
                    <p className="mt-2 text-sm text-slate-400">Mantenha seus dados de contato e acesso atualizados.</p>
                </div>

                {error && (
                    <div className="mb-6 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-center text-sm text-rose-200">{error}</div>
                )}

                {pedidosTroca?.length > 0 ? (
                    <div className="mb-8 rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4">
                        <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-amber-200/90">Pedidos de troca</p>
                        <ul className="space-y-3">
                            {pedidosTroca.map((p) => {
                                const souSolicitante = p.medico_solicitante_id === doctor.id;
                                const souAlvo = p.medico_alvo_id === doctor.id;
                                const unidadeNome = p.unidades?.nome || p.unidade_nome || '-';
                                const outroNome = souSolicitante ? p.alvo?.nome || 'Colega' : p.solicitante?.nome || 'Colega';
                                const podeResponder = souAlvo && p.status === 'AGUARDANDO_COLEGA';
                                const busy = respostaBusyId === p.id;
                                return (
                                    <li key={p.id} className="rounded-xl border border-slate-700/80 bg-slate-950/50 p-3 text-left">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span
                                                className={`rounded-lg px-2 py-0.5 text-[10px] font-black uppercase ${
                                                    souSolicitante ? 'bg-sky-500/20 text-sky-300' : 'bg-amber-500/20 text-amber-200'
                                                }`}
                                            >
                                                {souSolicitante ? 'Enviado' : 'Recebido'}
                                            </span>
                                            <span className="text-xs font-mono text-slate-500">{formatDisplayDate(p.data_plantao)}</span>
                                            <span className="text-xs font-bold text-slate-300">{p.turno}</span>
                                        </div>
                                        <p className="mt-2 text-sm text-slate-200">
                                            {souSolicitante ? (
                                                <>
                                                    Troca com <span className="font-semibold text-white">{outroNome}</span>
                                                    {p.data_plantao_oferecida && <span>, oferecendo <span className="font-semibold text-amber-200">{formatDisplayDate(p.data_plantao_oferecida)} ({p.turno_oferecido})</span></span>}
                                                </>
                                            ) : (
                                                <>
                                                    <span className="font-semibold text-white">{p.solicitante?.nome || 'Colega'}</span> pediu trocar com você
                                                    {p.data_plantao_oferecida && <span>, oferecendo o dia <span className="font-semibold text-amber-200">{formatDisplayDate(p.data_plantao_oferecida)} ({p.turno_oferecido})</span> em troca</span>}
                                                </>
                                            )}
                                        </p>
                                        <p className="mt-1 text-xs text-slate-500">
                                            {unidadeNome} · {trocaStatusLabel(p.status, souSolicitante)}
                                        </p>
                                        {podeResponder ? (
                                            <div className="mt-3 flex flex-wrap gap-2">
                                                <button
                                                    type="button"
                                                    disabled={busy}
                                                    onClick={() => responderPedido(p.id, true)}
                                                    className="flex-1 rounded-xl bg-emerald-500/90 py-2 text-xs font-black text-slate-950 transition hover:bg-emerald-400 disabled:opacity-50"
                                                >
                                                    {busy ? '...' : 'Aceitar'}
                                                </button>
                                                <button
                                                    type="button"
                                                    disabled={busy}
                                                    onClick={() => responderPedido(p.id, false)}
                                                    className="flex-1 rounded-xl border border-slate-600 bg-slate-800 py-2 text-xs font-bold text-slate-200 transition hover:bg-slate-700 disabled:opacity-50"
                                                >
                                                    Recusar
                                                </button>
                                            </div>
                                        ) : null}
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                ) : null}

                <form onSubmit={handleSave} className="grid gap-5">
                    <div>
                        <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-slate-500">Nome Completo</label>
                        <input
                            type="text"
                            value={formData.nome}
                            onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                            className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-emerald-400"
                            required
                        />
                    </div>
                    <div>
                        <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-slate-500">Telefone / WhatsApp</label>
                        <input
                            type="text"
                            value={formData.telefone}
                            onChange={(e) => setFormData({ ...formData, telefone: e.target.value })}
                            placeholder="(27) 99999-9999"
                            className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-emerald-400"
                            required
                        />
                    </div>
                    <div>
                        <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-slate-500">Senha Privada</label>
                        <input
                            type="text"
                            value={formData.senha}
                            onChange={(e) => setFormData({ ...formData, senha: e.target.value })}
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

const ShiftDetailModal = ({ modal, unitNome, medicoId, bookedShiftIds, onClose, onSuccess }) => {
    const [busy, setBusy] = useState(false);
    const [actionError, setActionError] = useState('');
    const [colegaParaTrocaId, setColegaParaTrocaId] = useState(null);
    const [confirmTrocaOpen, setConfirmTrocaOpen] = useState(false);
    const [confirmAssumirOpen, setConfirmAssumirOpen] = useState(false);
    const [confirmCancelarOpen, setConfirmCancelarOpen] = useState(false);
    const [pedidoGestorSucesso, setPedidoGestorSucesso] = useState(false);
    const [pedidoSucessoTipo, setPedidoSucessoTipo] = useState(null);
    const [futureShifts, setFutureShifts] = useState([]);
    const [offeredShiftId, setOfferedShiftId] = useState('');

    const { date, turno, shift, unidadeId } = modal || {};
    const list = shift?.plantonistas || [];
    const colleagues = list.filter((p) => p.id !== medicoId);

    const isMine = isMyTurn(shift, medicoId, bookedShiftIds);
    const showAssumir = Boolean(modal && unidadeId) && (!shift || (shift && list.length === 0 && !isMine));
    const showTroca = Boolean(modal && shift && list.length > 0 && !isMine);
    const showCancelar = Boolean(modal && shift && isMine);

    useEffect(() => {
        if (!modal) return;
        setActionError('');
        setConfirmTrocaOpen(false);
        setConfirmAssumirOpen(false);
        setConfirmCancelarOpen(false);
        setPedidoGestorSucesso(false);
        setPedidoSucessoTipo(null);
        setOfferedShiftId('');
        const cols = (modal.shift?.plantonistas || []).filter((p) => p.id !== medicoId);
        setColegaParaTrocaId(cols.length === 1 ? cols[0].id : null);
    }, [modal, medicoId]);

    useEffect(() => {
        if (!modal?.unidadeId || !medicoId) return;
        fetch(`/api/medicos/${medicoId}/escala/opcoes-troca?unidadeId=${modal.unidadeId}`)
            .then((r) => r.json())
            .then((data) => {
                if (data.shifts) setFutureShifts(data.shifts);
            })
            .catch(console.error);
    }, [modal?.unidadeId, medicoId]);

    if (!modal) return null;

    const enviarPedidoAssumir = async () => {
        setActionError('');
        setBusy(true);
        try {
            const response = await fetch(`/api/medicos/${medicoId}/escala/pedido-assumir`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    unidadeId,
                    data_plantao: date,
                    turno
                })
            });
            const data = await parseJsonSafely(response);
            if (!response.ok) {
                throw new Error(data?.error || data?.details || 'Nao foi possivel concluir o pedido.');
            }
            setConfirmAssumirOpen(false);
            setPedidoSucessoTipo('assumir');
            setPedidoGestorSucesso(true);
        } catch (err) {
            setActionError(err.message);
        } finally {
            setBusy(false);
        }
    };

    const enviarPedidoTroca = async () => {
        if (!colegaParaTrocaId) {
            setActionError('Selecione o colega com quem pretende solicitar a troca.');
            return;
        }
        setActionError('');
        setBusy(true);
        try {
            const response = await fetch(`/api/medicos/${medicoId}/escala/pedido-troca`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    unidadeId,
                    data_plantao: date,
                    turno,
                    colegaMedicoId: colegaParaTrocaId,
                    escalaOferecidaId: offeredShiftId || null
                })
            });
            const data = await parseJsonSafely(response);
            if (!response.ok) {
                throw new Error(data?.error || data?.details || 'Nao foi possivel concluir o pedido.');
            }
            setConfirmTrocaOpen(false);
            setPedidoSucessoTipo('troca');
            setPedidoGestorSucesso(true);
        } catch (err) {
            setActionError(err.message);
        } finally {
            setBusy(false);
        }
    };

    const enviarPedidoCancelamento = async () => {
        setActionError('');
        setBusy(true);
        try {
            const response = await fetch(`/api/medicos/${medicoId}/escala/pedido-cancelamento`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    unidadeId,
                    data_plantao: date,
                    turno
                })
            });
            const data = await parseJsonSafely(response);
            if (!response.ok) {
                throw new Error(data?.error || data?.details || 'Nao foi possivel concluir o pedido.');
            }
            setConfirmCancelarOpen(false);
            setPedidoSucessoTipo('cancelamento');
            setPedidoGestorSucesso(true);
        } catch (err) {
            setActionError(err.message);
        } finally {
            setBusy(false);
        }
    };

    const fecharAposPedidoGestor = () => {
        setPedidoGestorSucesso(false);
        setPedidoSucessoTipo(null);
        onSuccess?.();
        onClose();
    };

    return (
        <div
            className="fixed inset-0 z-[65] flex items-center justify-center bg-slate-950/80 px-4 py-6 backdrop-blur-md"
            onClick={onClose}
            role="presentation"
        >
            <div
                className="relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-[2rem] border border-slate-700 bg-slate-900 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="shift-detail-title"
            >
                {confirmAssumirOpen ? (
                    <div
                        className="absolute inset-0 z-[1] flex items-center justify-center rounded-[2rem] bg-slate-950/85 px-4 backdrop-blur-sm"
                        role="presentation"
                        onClick={() => !busy && setConfirmAssumirOpen(false)}
                    >
                        <div
                            className="w-full max-w-sm rounded-2xl border border-emerald-500/35 bg-slate-900 p-6 shadow-2xl"
                            onClick={(e) => e.stopPropagation()}
                            role="alertdialog"
                            aria-labelledby="confirm-assumir-title"
                            aria-describedby="confirm-assumir-desc"
                        >
                            <h4 id="confirm-assumir-title" className="text-lg font-black text-white">
                                Confirmar assumir turno
                            </h4>
                            <p id="confirm-assumir-desc" className="mt-3 text-sm leading-relaxed text-slate-300">
                                Você será alocado neste turno <span className="font-semibold text-emerald-200">automaticamente</span>. Deseja confirmar?
                            </p>
                            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
                                <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => setConfirmAssumirOpen(false)}
                                    className="rounded-xl border border-slate-600 bg-slate-800 px-4 py-3 text-sm font-bold text-slate-200 transition hover:bg-slate-700 disabled:opacity-50"
                                >
                                    Não
                                </button>
                                <button
                                    type="button"
                                    disabled={busy}
                                    onClick={enviarPedidoAssumir}
                                    className="rounded-xl border border-emerald-500/50 bg-emerald-500/25 px-4 py-3 text-sm font-black text-emerald-50 transition hover:bg-emerald-500/35 disabled:opacity-50"
                                >
                                    {busy ? 'A enviar...' : 'Sim'}
                                </button>
                            </div>
                        </div>
                    </div>
                ) : confirmTrocaOpen ? (
                    <div
                        className="absolute inset-0 z-[1] flex items-center justify-center rounded-[2rem] bg-slate-950/85 px-4 backdrop-blur-sm"
                        role="presentation"
                        onClick={() => !busy && setConfirmTrocaOpen(false)}
                    >
                        <div
                            className="w-full max-w-sm rounded-2xl border border-amber-500/35 bg-slate-900 p-6 shadow-2xl"
                            onClick={(e) => e.stopPropagation()}
                            role="alertdialog"
                            aria-labelledby="confirm-troca-title"
                            aria-describedby="confirm-troca-desc"
                        >
                            <h4 id="confirm-troca-title" className="text-lg font-black text-white">
                                Confirmar troca de plantão
                            </h4>
                            <p id="confirm-troca-desc" className="mt-3 text-sm leading-relaxed text-slate-300">
                                O pedido será enviado ao colega selecionado. Se ele aceitar, a troca será <span className="font-semibold text-amber-200">processada automaticamente</span>.
                            </p>
                            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
                                <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => setConfirmTrocaOpen(false)}
                                    className="rounded-xl border border-slate-600 bg-slate-800 px-4 py-3 text-sm font-bold text-slate-200 transition hover:bg-slate-700 disabled:opacity-50"
                                >
                                    Não
                                </button>
                                <button
                                    type="button"
                                    disabled={busy}
                                    onClick={enviarPedidoTroca}
                                    className="rounded-xl border border-amber-500/50 bg-amber-500/25 px-4 py-3 text-sm font-black text-amber-50 transition hover:bg-amber-500/35 disabled:opacity-50"
                                >
                                    {busy ? 'A enviar...' : 'Sim'}
                                </button>
                            </div>
                        </div>
                    </div>
                ) : confirmCancelarOpen ? (
                    <div
                        className="absolute inset-0 z-[1] flex items-center justify-center rounded-[2rem] bg-slate-950/85 px-4 backdrop-blur-sm"
                        role="presentation"
                        onClick={() => !busy && setConfirmCancelarOpen(false)}
                    >
                        <div
                            className="w-full max-w-sm rounded-2xl border border-rose-500/35 bg-slate-900 p-6 shadow-2xl"
                            onClick={(e) => e.stopPropagation()}
                            role="alertdialog"
                            aria-labelledby="confirm-cancelar-title"
                            aria-describedby="confirm-cancelar-desc"
                        >
                            <h4 id="confirm-cancelar-title" className="text-lg font-black text-rose-500">
                                Confirmar cancelamento
                            </h4>
                            <p id="confirm-cancelar-desc" className="mt-3 text-sm leading-relaxed text-slate-300">
                                Será enviada uma solicitação ao gestor da unidade para <span className="font-semibold text-rose-300">cancelar sua participação</span> neste turno. Deseja enviar?
                            </p>
                            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
                                <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => setConfirmCancelarOpen(false)}
                                    className="rounded-xl border border-slate-600 bg-slate-800 px-4 py-3 text-sm font-bold text-slate-200 transition hover:bg-slate-700 disabled:opacity-50"
                                >
                                    Não
                                </button>
                                <button
                                    type="button"
                                    disabled={busy}
                                    onClick={enviarPedidoCancelamento}
                                    className="rounded-xl border border-rose-500/50 bg-rose-500/25 px-4 py-3 text-sm font-black text-rose-100 transition hover:bg-rose-500/35 disabled:opacity-50"
                                >
                                    {busy ? 'A enviar...' : 'Sim, cancelar'}
                                </button>
                            </div>
                        </div>
                    </div>
                ) : null}

                <div className="flex items-start justify-between gap-4 border-b border-slate-800 p-6">
                    <div>
                        <p className="text-xs font-bold uppercase tracking-[0.3em] text-emerald-400">Detalhe do turno</p>
                        <h3 id="shift-detail-title" className="mt-2 text-2xl font-black capitalize text-white">
                            {formatDisplayDate(date)}
                        </h3>
                        <p className="mt-1 text-lg font-bold text-slate-200">{turno}</p>
                        <p className="mt-2 text-sm text-slate-400">
                            Unidade: <span className="font-semibold text-slate-200">{shift?.local || unitNome || '-'}</span>
                        </p>
                        {shift ? (
                            <p className="mt-1 text-xs text-slate-500">
                                Estado: <span className="text-slate-400">{shift.status || '-'}</span>
                                {typeof shift.vagas === 'number' ? (
                                    <>
                                        {' '}
                                        · Vagas livres: <span className="text-slate-400">{shift.vagas}</span>
                                    </>
                                ) : null}
                            </p>
                        ) : null}
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="shrink-0 rounded-2xl bg-slate-800 p-3 text-slate-400 transition hover:text-white"
                        aria-label="Fechar"
                    >
                        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                    {pedidoGestorSucesso ? (
                        <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-6 text-center">
                            {pedidoSucessoTipo === 'troca' ? (
                                <>
                                    <p className="text-base font-bold text-emerald-100">Pedido enviado ao colega!</p>
                                    <p className="mt-2 text-sm text-slate-400">
                                        Se o colega aceitar, a troca será efetivada automaticamente na escala.
                                    </p>
                                </>
                            ) : pedidoSucessoTipo === 'cancelamento' ? (
                                <p className="text-base font-bold text-emerald-100">Pedido enviado ao gestor, aguarde aprovação.</p>
                            ) : (
                                <p className="text-base font-bold text-emerald-100">Atualizado com sucesso!</p>
                            )}
                            <button
                                type="button"
                                onClick={fecharAposPedidoGestor}
                                className="mt-5 w-full rounded-2xl bg-emerald-500 py-3 text-sm font-black text-slate-950 transition hover:bg-emerald-400"
                            >
                                OK
                            </button>
                        </div>
                    ) : !shift ? (
                        <p className="text-sm leading-relaxed text-slate-400">
                            Sem registo de escala para este turno neste sistema (vaga em aberto ou ainda não publicada).
                        </p>
                    ) : list.length === 0 ? (
                        <p className="text-sm text-slate-400">Nenhum plantonista locado neste turno.</p>
                    ) : (
                        <>
                            {showTroca ? (
                                <p className="mb-3 text-xs font-bold uppercase tracking-wider text-amber-200/90">
                                    Selecione o colega para solicitar troca de plantão (módulo médico)
                                </p>
                            ) : null}
                            <ul className="space-y-3">
                                {list.map((p) => {
                                    const mine = p.id === medicoId;
                                    const selectable = showTroca && !mine;
                                    const selected = colegaParaTrocaId === p.id;
                                    return (
                                        <li key={p.id}>
                                            <button
                                                type="button"
                                                disabled={!selectable}
                                                onClick={() => selectable && setColegaParaTrocaId(p.id)}
                                                className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                                                    mine
                                                        ? 'border-sky-400/40 bg-sky-500/15 text-sky-50'
                                                        : selected && selectable
                                                          ? 'border-amber-400/70 bg-amber-500/20 text-amber-50 ring-2 ring-amber-400/40'
                                                          : selectable
                                                            ? 'border-slate-700/80 bg-slate-950/50 text-slate-200 hover:border-amber-500/40'
                                                            : 'border-slate-700/80 bg-slate-950/50 text-slate-200'
                                                } ${selectable ? 'cursor-pointer' : 'cursor-default'}`}
                                            >
                                                <div className="font-bold">{p.nome}</div>
                                                {p.especialidade ? <div className="mt-1 text-sm text-slate-400">{p.especialidade}</div> : null}
                                                {mine ? (
                                                    <div className="mt-2 text-xs font-bold uppercase tracking-wider text-sky-300">Seu plantão</div>
                                                ) : selectable && selected ? (
                                                    <div className="mt-2 text-xs font-bold uppercase tracking-wider text-amber-200">Selecionado para troca</div>
                                                ) : null}
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>

                            {showTroca && list.some(p => p.id !== medicoId) && (
                                <div className="mt-5 rounded-2xl border border-amber-500/20 bg-slate-950/50 p-4">
                                    <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-amber-200/80">
                                        Oferecer plantão em troca (Opcional)
                                    </label>
                                    <select
                                        value={offeredShiftId}
                                        onChange={(e) => setOfferedShiftId(e.target.value)}
                                        className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-sm text-slate-100 outline-none focus:border-amber-400"
                                    >
                                        <option value="">Nenhum plantão (Apenas pedir a vaga)</option>
                                        {futureShifts.map((fs) => (
                                            <option key={fs.id} value={fs.id}>
                                                {formatDisplayDate(fs.data_plantao)} - {fs.turno}
                                            </option>
                                        ))}
                                    </select>
                                    <p className="mt-2 text-xs text-slate-500 font-medium">
                                        Se a troca for aprovada, você assume este plantão vago e o colega assume automaticamente a vaga oferecida.
                                    </p>
                                </div>
                            )}
                        </>
                    )}
                </div>

                {!pedidoGestorSucesso && (showAssumir || showTroca || showCancelar) ? (
                    <div className="border-t border-slate-800 p-4">
                        {actionError ? (
                            <p className="mb-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{actionError}</p>
                        ) : null}
                        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                            {showAssumir ? (
                                <button
                                    type="button"
                                    disabled={busy || !unidadeId}
                                    onClick={() => {
                                        setActionError('');
                                        setConfirmAssumirOpen(true);
                                    }}
                                    className="flex-1 rounded-2xl border border-emerald-500/50 bg-emerald-500/20 py-3 text-sm font-black text-emerald-100 transition hover:bg-emerald-500/30 disabled:opacity-50"
                                >
                                    Assumir
                                </button>
                            ) : null}
                            {showTroca ? (
                                <button
                                    type="button"
                                    disabled={busy || !unidadeId || !colegaParaTrocaId || colleagues.length === 0}
                                    onClick={() => {
                                        setActionError('');
                                        setConfirmTrocaOpen(true);
                                    }}
                                    className="flex-1 rounded-2xl border border-amber-500/50 bg-amber-500/15 py-3 text-sm font-black text-amber-100 transition hover:bg-amber-500/25 disabled:opacity-50"
                                >
                                    Troca de plantão
                                </button>
                            ) : null}
                            {showCancelar ? (
                                <button
                                    type="button"
                                    disabled={busy || !unidadeId}
                                    onClick={() => {
                                        setActionError('');
                                        setConfirmCancelarOpen(true);
                                    }}
                                    className="flex-1 rounded-2xl border border-rose-500/50 bg-rose-500/20 py-3 text-sm font-black text-rose-100 transition hover:bg-rose-500/30 disabled:opacity-50"
                                >
                                    Cancelar Plantão
                                </button>
                            ) : null}
                        </div>
                    </div>
                ) : null}
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
                if (response.status === 404) {
                    try {
                        window.sessionStorage.setItem(
                            'login-notice',
                            'Sessão antiga: o médico guardado já não existe na base. Entre de novo e escolha um perfil da lista.'
                        );
                    } catch {
                        /* ignore */
                    }
                    logout();
                    return;
                }
                const msg = data?.details ? `${data.error} (${data.details})` : data?.error || 'Nao foi possivel carregar o calendario.';
                throw new Error(msg);
            }

            setState((current) => {
                if (current.selectedMonth !== month) {
                    return { ...current, loadingCalendar: false };
                }
                return {
                    ...current,
                    loadingCalendar: false,
                    calendar: data,
                    bookedShiftIds: data?.bookedShiftIds || [],
                    shiftDetailModal: null
                };
            });
        } catch (error) {
            setState((current) => ({
                ...current,
                loadingCalendar: false,
                error: error.message
            }));
        }
    };

    const loadTrocasResumo = async (doctorId) => {
        if (!doctorId) return;
        try {
            const response = await fetch(`/api/medicos/${doctorId}/trocas`);
            const data = await parseJsonSafely(response);
            if (!response.ok) return;
            setState((prev) => ({
                ...prev,
                pendentesColegaTroca: typeof data.pendentesColega === 'number' ? data.pendentesColega : 0,
                pedidosTroca: Array.isArray(data.pedidos) ? data.pedidos : []
            }));
        } catch {
            /* ignore */
        }
    };

    const fetchMyEscala = async () => {
        if (!session?.id) return;
        try {
            const response = await fetch(`/api/medicos/${session.id}/agenda`);
            const data = await parseJsonSafely(response);
            if (response.ok) {
                setState((prev) => ({ ...prev, myEscala: data || [], showEscalaModal: true }));
            }
        } catch (err) {
            console.error('Erro ao buscar escala:', err);
        }
    };

    const handleDownloadEscalaHTML = () => {
        if (!myEscala || myEscala.length === 0) return;

        const sortedEscala = [...myEscala].sort((a, b) => new Date(a.data) - new Date(b.data));

        const rows = sortedEscala.map((item) => {
            const label = buildEscalaBookingLabel(item, bookingConfigs[item.disponibilidadeId]);
            return `
            <tr class="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                <td class="py-4 px-6 font-mono text-sm text-blue-600 font-bold">${formatDisplayDate(item.data)}</td>
                <td class="py-4 px-6 font-black uppercase tracking-tight text-blue-900">${item.unidade}</td>
                <td class="py-4 px-6">
                    <span class="inline-flex rounded-lg border border-blue-500/20 bg-blue-500/10 px-2.5 py-1 text-[10px] font-black uppercase text-blue-600">
                        ${item.turno}
                    </span>
                </td>
                <td class="py-4 px-6 text-xs text-slate-500 font-bold uppercase tracking-widest">${label}</td>
                <td class="py-4 px-6 text-xs text-slate-400 font-bold">${item.especialidade || '-'}</td>
            </tr>
            `;
        }).join('');

        const htmlReport = `
<!DOCTYPE html>
<html lang="pt-br">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Escala Médica Individual - André Standard</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;900&display=swap');
        body { font-family: 'Inter', sans-serif; }
    </style>
</head>
<body class="bg-slate-50 text-slate-900 antialiased p-8 lg:p-20">
    <div class="max-w-5xl mx-auto">
        <!-- HEADER PADRÃO -->
        <header class="flex flex-col gap-8 md:flex-row md:items-end md:justify-between border-b-8 border-blue-900 pb-12 transition-all">
            <div>
                <div class="flex items-center gap-3 text-blue-600 mb-4 animate-pulse">
                    <i class="fas fa-user-md text-2xl"></i>
                    <span class="text-xs font-black uppercase tracking-[0.4em]">Gestão Operacional de TI</span>
                </div>
                <h1 class="text-6xl font-black uppercase tracking-tight text-blue-900 leading-none">Escala Individual</h1>
            </div>
            <div class="text-right">
                <div class="text-xs font-black uppercase tracking-widest text-slate-400 mb-1">Processamento de Dados</div>
                <div class="text-3xl font-black text-blue-900 tracking-tighter">${new Date().toLocaleDateString('pt-BR')}</div>
            </div>
        </header>

        <!-- INFO GRID -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mt-12 mb-20">
            <div class="bg-white p-8 rounded-2xl shadow-md border-l-8 border-blue-600">
                <div class="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Profissional</div>
                <div class="text-2xl font-black text-blue-900 uppercase tracking-tight">${session.nome.toUpperCase()}</div>
                <div class="text-sm font-bold text-slate-500 mt-1">CRM: ${session.crm}</div>
            </div>
            <div class="bg-white p-8 rounded-2xl shadow-md border-l-8 border-green-500">
                <div class="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Total de Plantões Confirmados</div>
                <div class="text-4xl font-black text-blue-900 uppercase tracking-tight">${myEscala.length}</div>
            </div>
        </div>

        <!-- ESCALA TABLE -->
        <section class="mb-20">
            <div class="flex items-center gap-4 mb-10 border-l-8 border-blue-900 pl-6">
                <div class="h-14 w-14 rounded-2xl bg-blue-900 flex items-center justify-center text-white text-2xl">
                    <i class="fas fa-calendar-check"></i>
                </div>
                <div>
                    <h2 class="text-3xl font-black uppercase tracking-tight text-blue-900">Plantões Confirmados</h2>
                    <p class="text-sm font-bold text-slate-400 uppercase tracking-widest">Sua agenda na rede</p>
                </div>
            </div>
            <div class="bg-white rounded-2xl shadow-lg border border-slate-100 overflow-hidden">
                <table class="w-full text-left">
                    <thead class="bg-blue-900 text-white text-[10px] font-black uppercase tracking-widest">
                        <tr>
                            <th class="py-6 px-6">Data</th>
                            <th class="py-6 px-6">Unidade</th>
                            <th class="py-6 px-6">Turno</th>
                            <th class="py-6 px-6">Tipo de Alocação</th>
                            <th class="py-6 px-6">Especialidade</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        </section>

        <!-- FOOTER SIMPLES -->
        <footer class="mt-20 border-t-2 border-slate-200 pt-8 text-center pb-20">
            <div class="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400">Fim do Relatório Operacional</div>
        </footer>
    </div>
</body>
</html>
        `;

        const blob = new Blob([htmlReport], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ESCALA_${session.nome.replace(/\s+/g, '_')}_${new Date().getTime()}.html`;
        a.click();
    };

    useEffect(() => {
        if (!session?.id) return;

        loadCalendar(session.id, state.selectedMonth, state.selectedUnitId);

        loadTrocasResumo(session.id);

        if (session.senha === '12345' && !localStorage.getItem(`hide_pass_suggest_${session.id}`)) {
            setState((prev) => ({ ...prev, showPasswordSuggestion: true }));
        }
    }, [session?.id, state.selectedMonth, state.selectedUnitId]);

    useEffect(() => {
        if (!session?.id) return;
        setState((current) => ({
            ...current,
            bookingConfigs: loadBookingConfigs(session.id)
        }));
    }, [session?.id]);

    useEffect(() => {
        if (state.showProfileModal && session?.id) {
            loadTrocasResumo(session.id);
        }
    }, [state.showProfileModal, session?.id]);

    const {
        loadingCalendar,
        error,
        selectedMonth,
        selectedUnitId,
        bookedShiftIds,
        showEscalaModal,
        showProfileModal,
        showPasswordSuggestion,
        myEscala,
        calendar,
        bookingConfigs,
        shiftDetailModal,
        pendentesColegaTroca,
        pedidosTroca
    } = state;

    const calendarDays = buildCalendarDayEntries(selectedMonth, calendar?.shifts || []);
    const monthEmProcessamento = Boolean(calendar && calendar.escalaVisivel === false);
    const motivoOcultacaoEscala = calendar?.motivoOcultacao ?? null;
    const outsideForecast = !monthEmProcessamento && isOutsideForecastWindow(selectedMonth);
    const { current: forecastCurrent, next: forecastNext } = getForecastWindow();

    if (!session) return null;

    const unitNomeCalendario = calendar?.unit?.nome || session.unidadeFixaNome;

    return (
        <div className="min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_top,_rgba(34,197,94,0.24),_transparent_32%),linear-gradient(180deg,_#020617_0%,_#0f172a_52%,_#111827_100%)] text-slate-100">
            {showPasswordSuggestion && (
                <div className="flex flex-col gap-3 bg-emerald-500/90 px-4 py-3 text-slate-950 animate-in slide-in-from-top duration-300 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                    <p className="flex items-start gap-2 text-sm font-bold sm:items-center">
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                        Sua senha ainda é a padrão (12345). Para sua segurança, recomendamos trocá-la agora.
                    </p>
                    <div className="flex flex-wrap items-center gap-4">
                        <button
                            onClick={() => setState((prev) => ({ ...prev, showProfileModal: true, showPasswordSuggestion: false }))}
                            className="text-xs font-black uppercase underline hover:no-underline"
                        >
                            Trocar Agora
                        </button>
                        <button
                            onClick={() => {
                                setState((prev) => ({ ...prev, showPasswordSuggestion: false }));
                                localStorage.setItem(`hide_pass_suggest_${session.id}`, 'true');
                            }}
                            className="text-xs font-bold opacity-70"
                        >
                            Não agora
                        </button>
                    </div>
                </div>
            )}

            <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-10">
                <header className="mb-10 flex flex-col gap-4 border-b border-emerald-500/20 pb-6 md:flex-row md:items-end md:justify-between">
                    <div className="flex flex-col gap-1">
                        <p className="mb-2 text-sm uppercase tracking-[0.3em] text-emerald-300/70">GESTÃO DE PLANTÕES</p>
                        <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">Escala da unidade</h1>

                        <div className="mt-4 flex flex-wrap items-center gap-4">
                            <div className="text-xs font-bold uppercase tracking-widest text-slate-400">Unidade</div>

                            {(session?.unidadesAutorizadas || []).length > 1 ? (
                                <select
                                    value={selectedUnitId || session.unidadeFixaId}
                                    onChange={(e) => setState((prev) => ({ ...prev, selectedUnitId: e.target.value, shiftDetailModal: null }))}
                                    className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-2 text-sm font-bold text-emerald-100 outline-none transition focus:border-emerald-400 focus:bg-emerald-500/10"
                                >
                                    {(session.unidadesAutorizadas || []).map((ua) => (
                                        <option key={ua.id} value={ua.id} className="bg-slate-900 text-white">
                                            {ua.nome} {ua.tipo === 'BASE' ? '(Fixa)' : '(Auxiliar)'}
                                        </option>
                                    ))}
                                </select>
                            ) : (
                                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-sm font-bold italic text-emerald-100">
                                    {session.unidadeFixaNome}
                                </div>
                            )}

                            <div className="mx-2 hidden h-4 w-px bg-slate-800 md:block" />

                            <div className="text-sm text-slate-300">
                                Sua especialidade: <span className="font-bold text-emerald-300">{session.especialidade}</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={fetchMyEscala}
                            title="Ver meus plantões na escala"
                            className="group relative flex items-center justify-center rounded-2xl border border-slate-700 bg-slate-900 p-4 transition hover:border-emerald-400/40 hover:bg-slate-800"
                        >
                            <svg className="h-6 w-6 text-emerald-400 transition-transform group-hover:scale-110" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
                                />
                            </svg>
                            <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-bold text-slate-950">
                                {bookedShiftIds.length}
                            </span>
                        </button>

                        <button
                            onClick={() => setState((prev) => ({ ...prev, showProfileModal: true }))}
                            className="group relative flex items-center gap-3 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-5 py-4 text-left shadow-lg shadow-emerald-950/30 transition hover:bg-emerald-500/20"
                        >
                            {pendentesColegaTroca > 0 ? (
                                <span className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-black text-slate-950">
                                    {pendentesColegaTroca > 9 ? '9+' : pendentesColegaTroca}
                                </span>
                            ) : null}
                            <div className="rounded-full bg-emerald-500/20 p-2 transition group-hover:bg-emerald-500/30">
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

                <section className="mb-8 flex flex-wrap items-center justify-end gap-4 rounded-3xl border border-slate-800 bg-slate-900/60 p-4">
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={() => setState((current) => ({ ...current, selectedMonth: shiftMonth(current.selectedMonth, -1), shiftDetailModal: null }))}
                            className="rounded-2xl bg-slate-800 px-3 py-2 text-sm font-bold text-slate-200 transition hover:bg-slate-700 sm:px-4"
                        >
                            Mês anterior
                        </button>
                        <div className="min-w-0 flex-1 text-center text-sm font-semibold capitalize text-slate-200 sm:min-w-44">{getMonthTitle(selectedMonth)}</div>
                        <button
                            type="button"
                            onClick={() => setState((current) => ({ ...current, selectedMonth: shiftMonth(current.selectedMonth, 1), shiftDetailModal: null }))}
                            className="rounded-2xl bg-slate-800 px-3 py-2 text-sm font-bold text-slate-200 transition hover:bg-slate-700 sm:px-4"
                        >
                            Próximo mês
                        </button>
                    </div>
                </section>

                {outsideForecast && (
                    <div className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-400/30 bg-amber-500/10 px-5 py-4 text-sm text-amber-200 animate-in slide-in-from-top-2 duration-300">
                        <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-400" />
                        <div>
                            <p className="font-bold text-amber-300">Mês fora da janela automática de previsão</p>
                            <p className="mt-1 text-amber-200/80">
                                O gerador automático cobre <span className="font-semibold capitalize">{getMonthTitle(forecastCurrent)}</span> e{' '}
                                <span className="font-semibold capitalize">{getMonthTitle(forecastNext)}</span>. Meses distantes podem ter menos registos de
                                disponibilidade até a escala ser lançada.
                            </p>
                        </div>
                    </div>
                )}

                {error && <div className="mb-6 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</div>}

                <section className="rounded-[2rem] border border-slate-800 bg-slate-900/75 p-6 shadow-2xl shadow-slate-950/40">
                    <div className="mb-6 flex flex-col gap-3 border-b border-slate-800 pb-5 md:flex-row md:items-end md:justify-between">
                        <div>
                            <p className="text-sm uppercase tracking-[0.25em] text-emerald-300/70">Calendário mensal</p>
                            <h2 className="mt-2 text-2xl font-black text-white md:text-3xl">{session.nome}</h2>
                            <p className="mt-2 text-sm text-slate-400">
                                Unidade: <span className="text-slate-200">{unitNomeCalendario}</span>
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-3 text-xs">
                            <span className="inline-flex items-center gap-2 rounded-xl border border-sky-400/40 bg-sky-500/15 px-3 py-2 text-sky-100">
                                <span className="h-2 w-2 rounded-full bg-sky-400" />
                                Seu plantão
                            </span>
                            <span className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-emerald-100">
                                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                                Ocupado
                            </span>
                            <span className="inline-flex items-center gap-2 rounded-xl border border-dashed border-slate-600 px-3 py-2 text-slate-400">
                                Vazio
                            </span>
                        </div>
                    </div>

                    {loadingCalendar ? (
                        <div className="rounded-3xl bg-slate-950/50 p-10 text-center text-slate-300">Carregando escala...</div>
                    ) : monthEmProcessamento ? (
                        <div className="rounded-3xl border border-slate-700/80 bg-slate-950/60 px-6 py-16 text-center">
                            <p className="text-xl font-black text-white">
                                {motivoOcultacaoEscala === 'bloqueado_gestor'
                                    ? 'Escala ainda não disponível'
                                    : 'Em processamento'}
                            </p>
                            <p className="mx-auto mt-3 max-w-md text-sm text-slate-400">
                                {motivoOcultacaoEscala === 'bloqueado_gestor'
                                    ? 'O gestor indicou que esta escala não está pronta para visualização pelos médicos neste mês. Se precisar de plantão ou esclarecimentos, contacte o gestor da unidade ou a coordenação.'
                                    : 'A escala deste mês ainda não está disponível para visualização. Aguarde a liberação pelo gestor da unidade (ou tente novamente mais tarde).'}
                            </p>
                        </div>
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
                                        <div
                                            key={entry.key}
                                            className="flex min-h-[12rem] flex-col rounded-3xl border border-slate-800 bg-slate-950/50 p-3 md:min-h-[15rem]"
                                        >
                                            <div className="mb-2 flex items-center justify-between gap-2">
                                                <span className="text-sm font-bold text-white">{String(entry.day).padStart(2, '0')}</span>
                                                <span className="text-[10px] uppercase tracking-wider text-slate-500">{formatDisplayDate(entry.date)}</span>
                                            </div>

                                            <div className="flex flex-1 flex-col gap-1.5">
                                                {entry.turnSlots.map(({ turno, shift }) => (
                                                    <button
                                                        key={`${entry.date}-${turno}`}
                                                        type="button"
                                                        onClick={() =>
                                                            setState((prev) => ({
                                                                ...prev,
                                                                shiftDetailModal: {
                                                                    date: entry.date,
                                                                    turno,
                                                                    shift: shift ?? null,
                                                                    unidadeId: selectedUnitId || session.unidadeFixaId
                                                                }
                                                            }))
                                                        }
                                                        className={`flex min-h-[2.25rem] w-full items-center justify-center rounded-xl border px-2 py-2 text-center text-[11px] font-bold leading-tight transition sm:text-xs ${turnButtonClass(shift, session.id, bookedShiftIds)}`}
                                                    >
                                                        {turno}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )
                                )}
                            </div>
                        </>
                    )}
                </section>

                {showProfileModal && (
                    <ProfileModal
                        doctor={session}
                        pedidosTroca={pedidosTroca}
                        onRefreshTrocas={() => loadTrocasResumo(session.id)}
                        onClose={() => setState((p) => ({ ...p, showProfileModal: false }))}
                        onUpdate={() => {
                            setState((p) => ({ ...p, showProfileModal: false }));
                            window.location.reload();
                        }}
                    />
                )}

                <ShiftDetailModal
                    modal={shiftDetailModal}
                    unitNome={unitNomeCalendario}
                    medicoId={session.id}
                    bookedShiftIds={bookedShiftIds}
                    onClose={() => setState((p) => ({ ...p, shiftDetailModal: null }))}
                    onSuccess={() => {
                        loadCalendar(session.id, selectedMonth, selectedUnitId);
                        loadTrocasResumo(session.id);
                        setState((p) => ({ ...p, shiftDetailModal: null }));
                    }}
                />

                {showEscalaModal && (
                    <div
                        className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/80 px-4 backdrop-blur-md"
                        onClick={() => setState((p) => ({ ...p, showEscalaModal: false }))}
                    >
                        <div
                            className="flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-[2.5rem] border border-slate-700 bg-slate-900 shadow-2xl"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex flex-col gap-4 border-b border-slate-800 bg-slate-900/50 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-8">
                                <div>
                                    <p className="mb-1 text-xs font-bold uppercase tracking-[0.3em] text-emerald-400">Meus plantões</p>
                                    <h3 className="text-3xl font-black text-white">Escala locada para você</h3>
                                </div>
                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={handleDownloadEscalaHTML}
                                        disabled={myEscala.length === 0}
                                        className="rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-emerald-400 disabled:opacity-50"
                                    >
                                        BAIXAR ESCALA (HTML)
                                    </button>
                                    <button
                                        onClick={() => setState((p) => ({ ...p, showEscalaModal: false }))}
                                        className="rounded-2xl bg-slate-800 p-3 text-slate-400 transition hover:text-white"
                                    >
                                        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>                            </div>

                            <div className="flex-1 overflow-y-auto p-4 sm:p-8">
                                {myEscala.length === 0 ? (
                                    <div className="py-20 text-center">
                                        <div className="mb-6 inline-flex rounded-full bg-slate-800/50 p-6">
                                            <svg className="h-12 w-12 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    strokeWidth={2}
                                                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
                                                />
                                            </svg>
                                        </div>
                                        <h4 className="text-xl font-bold text-slate-300">Nenhum plantão na sua escala</h4>
                                        <p className="mt-2 text-slate-500">Quando o gestor da unidade liberar a escala, os turnos aparecerão aqui.</p>
                                    </div>
                                ) : (
                                    <div className="overflow-x-auto rounded-3xl border border-slate-800 bg-slate-950/30">
                                        <table className="min-w-[640px] w-full text-left">
                                            <thead>
                                                <tr className="border-b border-slate-800 bg-slate-900 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                                    <th className="px-6 py-4">Data</th>
                                                    <th className="px-6 py-4">Unidade</th>
                                                    <th className="px-6 py-4">Turno</th>
                                                    <th className="px-6 py-4">Tipo</th>
                                                    <th className="px-6 py-4">Especialidade</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-800/50">
                                                {myEscala.map((item) => (
                                                    <tr key={item.id} className="group transition-colors hover:bg-slate-800/30">
                                                        <td className="px-6 py-4 font-mono text-sm text-emerald-400">{formatDisplayDate(item.data)}</td>
                                                        <td className="px-6 py-4 font-bold text-white">{item.unidade}</td>
                                                        <td className="px-6 py-4">
                                                            <span className="inline-flex rounded-lg border border-sky-500/20 bg-sky-500/10 px-2.5 py-1 text-[10px] font-black uppercase text-sky-400">
                                                                {item.turno}
                                                            </span>
                                                        </td>
                                                        <td className="px-6 py-4 text-xs text-slate-300">
                                                            {buildEscalaBookingLabel(item, bookingConfigs[item.disponibilidadeId])}
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
            </div>
        </div>
    );
}

