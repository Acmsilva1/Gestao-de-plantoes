import { dbModel } from '../../models/dbModel.js';
import { cacheModel } from '../../models/CacheModel.js';
import { generateForecastWindows } from '../../services/OrganizerService.js';

const PUBLIC_SHIFTS_CACHE_KEY = 'public-shifts';
const PUBLIC_SHIFTS_TTL_MS = 30_000;
const isReservationHoldTableMissing = (message = '') => /Could not find the table 'public\.reserva_holds'|relation "reserva_holds" does not exist/i.test(message);
const shiftTurnOrder = { Madrugada: 0, Manhã: 1, Tarde: 2, Noite: 3 };
export const TURNOS_ESCALA = new Set(['Manhã', 'Tarde', 'Noite', 'Madrugada']);

const resolveDoctorAuthorizedUnit = async (medicoId, unidadeId) => {
    const doctor = await dbModel.getDoctorById(medicoId);
    if (!doctor) return null;
    const mapped = mapDoctorForClient(doctor);
    const authorizedIds = new Set((mapped.unidadesAutorizadas || []).map((u) => u.id));
    if (!unidadeId || !authorizedIds.has(unidadeId)) {
        return null;
    }
    return { doctor, mapped };
};

const getTodayKey = (referenceDate = new Date()) => {
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    const parts = formatter.formatToParts(referenceDate).reduce((accumulator, part) => {
        if (part.type !== 'literal') {
            accumulator[part.type] = part.value;
        }

        return accumulator;
    }, {});

    return `${parts.year}-${parts.month}-${parts.day}`;
};

const filterCurrentAndFutureShifts = (shifts, referenceDate = new Date()) => {
    const todayKey = getTodayKey(referenceDate);
    return (shifts || []).filter((shift) => shift.data_plantao >= todayKey);
};

const mapShiftForClient = (shift) => ({
    id: shift.id,
    unidadeId: shift.unidade_id,
    local: shift.unidades?.nome ?? 'Unidade não informada',
    data: shift.data_plantao,
    turno: shift.turno,
    vagas: Math.max(shift.vagas_totais - shift.vagas_ocupadas, 0),
    status: shift.status
});

const mapPlantonistasFromAgendamentos = (agendamentos = []) =>
    (agendamentos || [])
        .filter((row) => row.confirmado !== false)
        .map((row) => ({
            id: row.medico_id || row.medicos?.id,
            nome: row.medicos?.nome ?? 'Médico',
            especialidade: row.medicos?.especialidade ?? ''
        }))
        .filter((p) => p.id);

const mapShiftForDoctorCalendar = (shift, doctorEspecialidade) => ({
    ...mapShiftForClient(shift),
    especialidade: doctorEspecialidade,
    plantonistas: mapPlantonistasFromAgendamentos(shift.agendamentos)
});

const buildShiftsFromEscalaRows = (rows, doctorEspecialidade) => {
    const byKey = new Map();
    for (const row of rows || []) {
        const key = `${row.data_plantao}|${row.turno}`;
        if (!byKey.has(key)) {
            byKey.set(key, {
                id: `escala|${row.unidade_id}|${row.data_plantao}|${row.turno}`,
                unidade_id: row.unidade_id,
                unidades: row.unidades,
                data_plantao: row.data_plantao,
                turno: row.turno,
                vagas_totais: 99,
                vagas_ocupadas: 0,
                status: 'ESCALA',
                agendamentos: []
            });
        }
        const group = byKey.get(key);
        group.agendamentos.push({
            medico_id: row.medico_id,
            confirmado: true,
            medicos: row.medicos
        });
        group.vagas_ocupadas = group.agendamentos.length;
    }

    const list = [...byKey.values()].sort((a, b) => {
        const byDate = (a.data_plantao || '').localeCompare(b.data_plantao || '');
        if (byDate !== 0) return byDate;
        return (shiftTurnOrder[a.turno] ?? 99) - (shiftTurnOrder[b.turno] ?? 99);
    });

    return list.map((shift) => mapShiftForDoctorCalendar(shift, doctorEspecialidade));
};

const mapDoctorForClient = (doctor) => {
    const baseUnit = {
        id: doctor.unidade_fixa_id,
        nome: doctor.unidades?.nome ?? 'Unidade não informada',
        tipo: 'BASE'
    };

    const auxiliaryUnits = (doctor.medico_acessos_unidade || []).map(au => ({
        id: au.unidade_id,
        nome: au.unidades?.nome ?? 'Unidade auxiliar',
        tipo: 'AUXILIAR'
    }));

    // Remove duplicatas e coloca a base em primeiro
    const allAuthorized = [baseUnit, ...auxiliaryUnits.filter(au => au.id !== baseUnit.id)];

    return {
        id: doctor.id,
        nome: doctor.nome,
        usuario: doctor.usuario || '',
        crm: doctor.crm,
        senha: doctor.senha,
        telefone: doctor.telefone,
        especialidade: doctor.especialidade,
        unidadeFixaId: doctor.unidade_fixa_id,
        unidadeFixaNome: doctor.unidades?.nome ?? 'Unidade não informada',
        unidadesAutorizadas: allAuthorized
    };
};

const loadPublicShifts = async () => {
    const cached = cacheModel.get(PUBLIC_SHIFTS_CACHE_KEY);

    if (cached) {
        return cached;
    }

    const shifts = filterCurrentAndFutureShifts(await dbModel.getAllOpenShifts());
    const mappedShifts = shifts.map(mapShiftForClient);
    cacheModel.set(PUBLIC_SHIFTS_CACHE_KEY, mappedShifts, PUBLIC_SHIFTS_TTL_MS);

    return mappedShifts;
};

export const getPublicShifts = async (req, res) => {
    try {
        const cleanData = await loadPublicShifts();
        res.json(cleanData);
    } catch (err) {
        res.status(500).json({ error: 'Erro na escala nacional.', details: err.message });
    }
};

export const getDoctors = async (req, res) => {
    try {
        await dbModel.ensureManagersPerUnit();
        const doctors = await dbModel.getDoctors();
        res.json(doctors.map(mapDoctorForClient));
    } catch (err) {
        res.status(500).json({ error: 'Erro ao carregar médicos.', details: err.message });
    }
};

export const getDoctorCalendar = async (req, res) => {
    const { medicoId } = req.params;
    const requestedMonth = req.query.month;
    const requestedUnitId = req.query.unitId;

    try {
        const doctor = await dbModel.getDoctorById(medicoId);

        if (!doctor) {
            return res.status(404).json({ error: 'Médico não encontrado.' });
        }

        const mappedDoctor = mapDoctorForClient(doctor);
        const month = requestedMonth || new Date().toISOString().slice(0, 7);
        
        // Verifica se a unidade solicitada é permitida
        let selectedUnit = mappedDoctor.unidadesAutorizadas.find(ua => ua.id === requestedUnitId);
        
        // Se não solicitou ou não tem acesso à solicitada, usa a base
        if (!selectedUnit) {
            selectedUnit = mappedDoctor.unidadesAutorizadas.find(ua => ua.tipo === 'BASE');
        }

        if (!selectedUnit?.id) {
            return res.json({
                doctor: mappedDoctor,
                month,
                unit: null,
                specialty: doctor.especialidade,
                shifts: [],
                bookedShiftIds: [],
                escalaVisivel: true,
                motivoOcultacao: null
            });
        }

        const currentMonthKey = getTodayKey().slice(0, 7);
        let escalaVisivel = true;
        let motivoOcultacao = null;

        const pubRow = await dbModel.getEscalaMesPublicacao(selectedUnit.id, month);
        if (pubRow?.status === 'BLOQUEADO') {
            escalaVisivel = false;
            motivoOcultacao = 'bloqueado_gestor';
        } else if (pubRow?.status === 'LIBERADO') {
            escalaVisivel = true;
        } else if (month > currentMonthKey) {
            escalaVisivel = false;
            motivoOcultacao = 'mes_futuro';
        }

        if (!escalaVisivel) {
            return res.json({
                doctor: mappedDoctor,
                month,
                unit: {
                    id: selectedUnit.id,
                    nome: selectedUnit.nome
                },
                specialty: doctor.especialidade,
                shifts: [],
                bookedShiftIds: [],
                escalaVisivel: false,
                motivoOcultacao
            });
        }

        const escalaRows = await dbModel.getEscalaByUnitAndMonth(selectedUnit.id, month);
        const shifts = buildShiftsFromEscalaRows(escalaRows, doctor.especialidade);
        const bookedShiftIds = shifts
            .filter((s) => (s.plantonistas || []).some((p) => p.id === medicoId))
            .map((s) => s.id);

        res.json({
            doctor: mappedDoctor,
            month,
            unit: {
                id: selectedUnit.id,
                nome: selectedUnit.nome
            },
            specialty: doctor.especialidade,
            bookedShiftIds,
            shifts,
            escalaVisivel: true,
            motivoOcultacao: null
        });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao carregar calendário do medico.', details: err.message });
    }
};

export const getDoctorAgenda = async (req, res) => {
    const { medicoId } = req.params;

    try {
        const doctor = await dbModel.getDoctorById(medicoId);
        if (!doctor) return res.status(404).json({ error: 'Médico não encontrado.' });

        const escalaLinhas = await dbModel.getEscalaAgendaForMedico(medicoId);

        const mappedAgenda = (escalaLinhas || [])
            .map((row) => ({
                id: row.id,
                disponibilidadeId: row.id,
                data: row.data_plantao,
                turno: row.turno,
                unidade: row.unidades?.nome,
                especialidade: doctor.especialidade,
                tipoPlantao: 'COMPLETO',
                horaInicio: null,
                horaFim: null,
                dataInicioFixo: null,
                dataFimFixo: null,
                grupoSequenciaId: null
            }))
            .sort((left, right) => {
                const dateCompare = (left.data || '').localeCompare(right.data || '');
                if (dateCompare !== 0) {
                    return dateCompare;
                }

                return (shiftTurnOrder[left.turno] ?? 99) - (shiftTurnOrder[right.turno] ?? 99);
            });

        res.json(mappedAgenda);
    } catch (err) {
        res.status(500).json({ error: 'Erro ao carregar sua agenda.', details: err.message });
    }
};

export const postAssumirEscala = async (req, res) => {
    const { medicoId } = req.params;
    const { unidadeId, data_plantao, turno } = req.body ?? {};

    try {
        if (!unidadeId || !data_plantao || !turno) {
            return res.status(400).json({ error: 'Informe unidadeId, data_plantao e turno.' });
        }
        if (!TURNOS_ESCALA.has(turno)) {
            return res.status(400).json({ error: 'Turno invalido.' });
        }

        const resolved = await resolveDoctorAuthorizedUnit(medicoId, unidadeId);
        if (!resolved) {
            return res.status(403).json({ error: 'Médico não encontrado ou sem permissão nesta unidade.' });
        }

        const present = await dbModel.getEscalaMedicoIdsForSlot(unidadeId, data_plantao, turno);
        if (present.includes(medicoId)) {
            return res.status(409).json({ error: 'Voce ja esta locado neste turno.' });
        }

        try {
            await dbModel.insertEscalaRow({
                unidadeId,
                medicoId,
                data_plantao,
                turno
            });
        } catch (insertErr) {
            if (/duplicate|unique|23505/i.test(String(insertErr.message))) {
                return res.status(409).json({ error: 'Registro duplicado neste turno.' });
            }
            throw insertErr;
        }

        res.json({ message: 'Turno assumido na escala.' });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao assumir turno.', details: err.message });
    }
};

/** Solicitação ao gestor (sem inserir na escala até aprovação). */
export const postPedidoAssumirEscala = async (req, res) => {
    const { medicoId } = req.params;
    const { unidadeId, data_plantao, turno } = req.body ?? {};

    try {
        if (!unidadeId || !data_plantao || !turno) {
            return res.status(400).json({ error: 'Informe unidadeId, data_plantao e turno.' });
        }
        if (!TURNOS_ESCALA.has(turno)) {
            return res.status(400).json({ error: 'Turno invalido.' });
        }

        const resolved = await resolveDoctorAuthorizedUnit(medicoId, unidadeId);
        if (!resolved) {
            return res.status(403).json({ error: 'Médico não encontrado ou sem permissão nesta unidade.' });
        }

        const present = await dbModel.getEscalaMedicoIdsForSlot(unidadeId, data_plantao, turno);
        if (present.includes(medicoId)) {
            return res.status(409).json({ error: 'Voce ja esta locado neste turno.' });
        }
        if (present.length > 0) {
            return res.status(400).json({
                error: 'Turno ja tem plantonistas na escala. Use troca de plantao ou contacte o gestor.'
            });
        }

        try {
            const pedido = await dbModel.createPedidoAssumirEscala({
                unidadeId,
                dataPlantao: data_plantao,
                turno,
                solicitanteId: medicoId
            });

            // Auto-aprovação imediata
            await dbModel.aprovarPedidoAssumirGestorRpc(pedido.id);

            res.status(201).json({
                id: pedido.id,
                status: 'APROVADO',
                message: 'Turno assumido com sucesso. Atualizando escala imediamente.'
            });
        } catch (insertErr) {
            if (/duplicate|unique|23505/i.test(String(insertErr.message))) {
                return res.status(409).json({ error: 'Ja existe pedido pendente para este turno vago.' });
            }
            throw insertErr;
        }
    } catch (err) {
        res.status(500).json({ error: 'Erro ao registar solicitacao de assumir.', details: err.message });
    }
};

export const postPedidoTrocaEscala = async (req, res) => {
    const { medicoId } = req.params;
    const { unidadeId, data_plantao, turno, colegaMedicoId, escalaOferecidaId } = req.body ?? {};

    try {
        if (!unidadeId || !data_plantao || !turno) {
            return res.status(400).json({ error: 'Informe unidadeId, data_plantao e turno.' });
        }
        if (!colegaMedicoId) {
            return res.status(400).json({ error: 'Selecione o colega para a troca de plantao.' });
        }
        if (colegaMedicoId === medicoId) {
            return res.status(400).json({ error: 'Selecione um colega diferente de voce.' });
        }
        if (!TURNOS_ESCALA.has(turno)) {
            return res.status(400).json({ error: 'Turno invalido.' });
        }

        const resolved = await resolveDoctorAuthorizedUnit(medicoId, unidadeId);
        if (!resolved) {
            return res.status(403).json({ error: 'Médico não encontrado ou sem permissão nesta unidade.' });
        }

        const present = await dbModel.getEscalaMedicoIdsForSlot(unidadeId, data_plantao, turno);
        if (present.length === 0) {
            return res.status(400).json({ error: 'Turno vazio na escala. Use Assumir.' });
        }
        if (present.includes(medicoId)) {
            return res.status(400).json({ error: 'Voce ja esta neste turno.' });
        }
        if (!present.includes(colegaMedicoId)) {
            return res.status(400).json({ error: 'O colega indicado não está locado neste turno.' });
        }

        const escalaLinha = await dbModel.getEscalaRowIdForMedicoSlot(unidadeId, data_plantao, turno, colegaMedicoId);
        if (!escalaLinha?.id) {
            return res.status(400).json({ error: 'Linha da escala do colega não encontrada.' });
        }

        let escalaLinhaOferecida = null;
        if (escalaOferecidaId) {
            escalaLinhaOferecida = await dbModel.getEscalaById(escalaOferecidaId);
            if (!escalaLinhaOferecida || escalaLinhaOferecida.medico_id !== medicoId || escalaLinhaOferecida.unidade_id !== unidadeId) {
                return res.status(400).json({ error: 'Plantão oferecido inválido ou não pertence a você nesta unidade.' });
            }
        }

        try {
            const pedido = await dbModel.createPedidoTrocaEscala({
                unidadeId,
                dataPlantao: data_plantao,
                turno,
                solicitanteId: medicoId,
                alvoId: colegaMedicoId,
                escalaAlvoId: escalaLinha.id,
                escalaOferecidaId: escalaLinhaOferecida ? escalaLinhaOferecida.id : null,
                dataPlantaoOferecida: escalaLinhaOferecida ? escalaLinhaOferecida.data_plantao : null,
                turnoOferecido: escalaLinhaOferecida ? escalaLinhaOferecida.turno : null
            });

            res.status(201).json({
                id: pedido.id,
                status: pedido.status,
                message: 'Pedido registado. Aguardando confirmacao do colega.'
            });
        } catch (insertErr) {
            if (/duplicate|unique|23505/i.test(String(insertErr.message))) {
                return res.status(409).json({ error: 'Ja existe pedido ativo para este plantao.' });
            }
            throw insertErr;
        }
    } catch (err) {
        res.status(500).json({ error: 'Erro ao registar pedido de troca.', details: err.message });
    }
};

export const postPedidoCancelamento = async (req, res) => {
    const { medicoId } = req.params;
    const { unidadeId, data_plantao, turno } = req.body ?? {};

    try {
        if (!unidadeId || !data_plantao || !turno) {
            return res.status(400).json({ error: 'Informe unidadeId, data_plantao e turno.' });
        }
        if (!TURNOS_ESCALA.has(turno)) {
            return res.status(400).json({ error: 'Turno invalido.' });
        }

        const resolved = await resolveDoctorAuthorizedUnit(medicoId, unidadeId);
        if (!resolved) {
            return res.status(403).json({ error: 'Médico não encontrado ou sem permissão nesta unidade.' });
        }

        const escalaLinha = await dbModel.getEscalaRowIdForMedicoSlot(unidadeId, data_plantao, turno, medicoId);
        if (!escalaLinha?.id) {
            return res.status(400).json({ error: 'Você não está locado num turno correspondente na escala desta unidade.' });
        }

        try {
            const pedido = await dbModel.createPedidoCancelamento({
                unidadeId,
                escalaId: escalaLinha.id,
                medicoId,
                dataPlantao: data_plantao,
                turno
            });

            res.status(201).json({
                id: pedido.id,
                status: pedido.status,
                message: 'Pedido de cancelamento enviado. Aguarde aprovacao do gestor.'
            });
        } catch (insertErr) {
            if (/duplicate|unique|23505/i.test(String(insertErr.message))) {
                return res.status(409).json({ error: 'Ja existe um pedido de cancelamento ativo para este plantao.' });
            }
            throw insertErr;
        }
    } catch (err) {
        res.status(500).json({ error: 'Erro ao registar cancelamento.', details: err.message });
    }
};

export const getDoctorTrocas = async (req, res) => {
    const { medicoId } = req.params;

    try {
        const doctor = await dbModel.getDoctorById(medicoId);
        if (!doctor) {
            return res.status(404).json({ error: 'Médico não encontrado.' });
        }

        const pedidos = await dbModel.listPedidosTrocaPorMedico(medicoId);
        const pendentesColega = await dbModel.countPedidosTrocaAguardandoColega(medicoId);

        res.json({
            pedidos,
            pendentesColega
        });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao listar trocas.', details: err.message });
    }
};

export const postResponderTrocaColega = async (req, res) => {
    const { medicoId, pedidoId } = req.params;
    const { aceitar } = req.body ?? {};

    try {
        if (typeof aceitar !== 'boolean') {
            return res.status(400).json({ error: 'Informe aceitar: true ou false.' });
        }

        const pedidoAtual = await dbModel.getPedidoTrocaById(pedidoId);
        if (!pedidoAtual) {
            return res.status(404).json({ error: 'Pedido não encontrado.' });
        }
        if (pedidoAtual.medico_alvo_id !== medicoId) {
            return res.status(403).json({ error: 'Apenas o colega indicado pode responder a este pedido.' });
        }

        const pedido = aceitar
            ? await dbModel.aprovarPedidoTrocaPorAceiteColega(pedidoId)
            : await dbModel.responderColegaPedidoTroca(pedidoId, medicoId, false);

        res.json({
            pedido,
            message: aceitar ? 'Colega aceitou. Troca efetivada automaticamente.' : 'Pedido recusado pelo colega.'
        });
    } catch (err) {
        const status = /não encontrado|não está|Apenas o colega/i.test(err.message) ? 403 : 400;
        res.status(status).json({ error: err.message });
    }
};

export const updateDoctorProfile = async (req, res) => {
    const { medicoId } = req.params;
    const { nome, telefone, senha } = req.body;

    try {
        const updated = await dbModel.updateDoctorProfile(medicoId, { nome, telefone, senha });
        
        res.json({
            message: 'Perfil atualizado com sucesso.',
            doctor: mapDoctorForClient(updated)
        });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao atualizar perfil.', details: err.message });
    }
};

export const generateUnitForecast = async (req, res) => {
    const { unidadeId } = req.params;

    try {
        const result = await generateForecastWindows(unidadeId);
        cacheModel.delete(PUBLIC_SHIFTS_CACHE_KEY);
        const shifts = await loadPublicShifts();

        res.json({
            message: 'Previsao dos meses atual e proximo gerada com sucesso.',
            result,
            shifts
        });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao gerar previsao mensal.', details: err.message });
    }
};

export const holdShift = async (req, res) => {
    const { id } = req.params;
    const { medicoId } = req.body ?? {};

    try {
        if (!medicoId) {
            return res.status(400).json({ error: 'Selecione um médico para iniciar a reserva.' });
        }

        const shift = await dbModel.getShiftById(id);

        if (!shift) {
            return res.status(404).json({ error: 'Plantão não encontrado.' });
        }

        if (shift.status !== 'ABERTO' || shift.vagas_ocupadas >= shift.vagas_totais) {
            return res.status(409).json({ error: 'Plantão indisponível para confirmação.' });
        }

        const hold = await dbModel.acquireShiftHold(id, medicoId);

        res.json({
            message: 'Vaga bloqueada temporariamente para confirmacao.',
            hold: {
                shiftId: id,
                reservedUntil: hold.reservado_ate
            }
        });
    } catch (err) {
        if (isReservationHoldTableMissing(err.message)) {
            return res.status(503).json({
                error: 'A fila temporária de reserva ainda não foi criada no banco. Rode a migração de reserva_holds no Supabase.'
            });
        }

        const statusCode = /confirmação por outro médico|não encontrado|indisponível/i.test(err.message) ? 409 : 500;
        res.status(statusCode).json({ error: err.message });
    }
};

export const releaseShiftHold = async (req, res) => {
    const { id } = req.params;
    const { medicoId } = req.body ?? {};

    try {
        if (!medicoId) {
            return res.status(400).json({ error: 'Selecione um médico para liberar a reserva.' });
        }

        await dbModel.releaseShiftHold(id, medicoId);

        res.json({
            message: 'Bloqueio temporario liberado.'
        });
    } catch (err) {
        if (isReservationHoldTableMissing(err.message)) {
            return res.status(503).json({
                error: 'A fila temporária de reserva ainda não foi criada no banco. Rode a migração de reserva_holds no Supabase.'
            });
        }

        res.status(500).json({ error: err.message });
    }
};

export const selectShift = async (req, res) => {
    const { id } = req.params;
    const { medicoId, bookingType, startTime, endTime, fixedEndDate, fixedMode, sequenceGroupId } = req.body ?? {};

    try {
        if (!medicoId) {
            return res.status(400).json({ error: 'Selecione um médico para reservar o plantão.' });
        }

        const updatedShift = await dbModel.reserveShift(id, medicoId, {
            bookingType,
            startTime,
            endTime,
            fixedEndDate,
            fixedMode,
            sequenceGroupId
        });
        cacheModel.delete(PUBLIC_SHIFTS_CACHE_KEY);

        res.json({
            message: 'Plantão reservado com sucesso.',
            selectedShift: mapShiftForClient(updatedShift)
        });
    } catch (err) {
        if (isReservationHoldTableMissing(err.message)) {
            return res.status(503).json({
                error: 'A fila temporária de reserva ainda não foi criada no banco. Rode a migração de reserva_holds no Supabase.'
            });
        }

        const statusCode = /CONFLITO|não encontrado|indisponível|sem vagas|já reservou|confirmação expirou|repassada|TEMPO EXCEDIDO/i.test(err.message) ? 409 : 500;
        res.status(statusCode).json({ error: err.message });
    }
};

export const getDoctorFutureShiftsForSwap = async (req, res) => {
    const { medicoId } = req.params;
    const { unidadeId } = req.query;

    if (!unidadeId) {
        return res.status(400).json({ error: 'Unidade inespecífica.' });
    }

    try {
        const shifts = await dbModel.getFutureShiftsForSwap(medicoId, unidadeId);
        res.json({ shifts });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao buscar plantões futuros.', details: err.message });
    }
};
