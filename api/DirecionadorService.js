import { dbModel } from '../model/dbModel.js';
import { cacheModel } from '../model/CacheModel.js';
import { generateForecastWindows } from './OrganizerService.js';

const PUBLIC_SHIFTS_CACHE_KEY = 'public-shifts';
const PUBLIC_SHIFTS_TTL_MS = 30_000;

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
    local: shift.unidades?.nome ?? 'Unidade nao informada',
    data: shift.data_plantao,
    turno: shift.turno,
    vagas: Math.max(shift.vagas_totais - shift.vagas_ocupadas, 0),
    status: shift.status
});

const mapDoctorForClient = (doctor) => ({
    id: doctor.id,
    nome: doctor.nome,
    crm: doctor.crm,
    especialidade: doctor.especialidade,
    unidadeFixaId: doctor.unidade_fixa_id,
    unidadeFixaNome: doctor.unidades?.nome ?? 'Unidade nao informada'
});

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
        const doctors = await dbModel.getDoctors();
        res.json(doctors.map(mapDoctorForClient));
    } catch (err) {
        res.status(500).json({ error: 'Erro ao carregar medicos.', details: err.message });
    }
};

export const getDoctorCalendar = async (req, res) => {
    const { medicoId } = req.params;
    const requestedMonth = req.query.month;

    try {
        const doctor = await dbModel.getDoctorById(medicoId);

        if (!doctor) {
            return res.status(404).json({ error: 'Medico nao encontrado.' });
        }

        const month = requestedMonth || new Date().toISOString().slice(0, 7);
        const unidadeId = doctor.unidade_fixa_id;
        const unidadeNome = doctor.unidades?.nome ?? 'Unidade nao informada';

        if (!unidadeId) {
            return res.json({
                doctor: mapDoctorForClient(doctor),
                month,
                unit: null,
                specialty: doctor.especialidade,
                shifts: []
            });
        }

        const shifts = filterCurrentAndFutureShifts(await dbModel.getShiftsByUnitAndMonth(unidadeId, month));

        res.json({
            doctor: mapDoctorForClient(doctor),
            month,
            unit: {
                id: unidadeId,
                nome: unidadeNome
            },
            specialty: doctor.especialidade,
            shifts: shifts.map((shift) => ({
                ...mapShiftForClient(shift),
                especialidade: doctor.especialidade
            }))
        });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao carregar calendario do medico.', details: err.message });
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

export const selectShift = async (req, res) => {
    const { id } = req.params;
    const { medicoId } = req.body ?? {};

    try {
        if (!medicoId) {
            return res.status(400).json({ error: 'Selecione um medico para reservar o plantao.' });
        }

        const updatedShift = await dbModel.reserveShift(id, medicoId);
        cacheModel.delete(PUBLIC_SHIFTS_CACHE_KEY);
        const refreshedShifts = await loadPublicShifts();

        res.json({
            message: 'Plantao reservado com sucesso.',
            selectedShift: mapShiftForClient(updatedShift),
            shifts: refreshedShifts
        });
    } catch (err) {
        const statusCode = /nao encontrado|indisponivel|sem vagas/i.test(err.message) ? 409 : 500;
        res.status(statusCode).json({ error: err.message });
    }
};
