import { generateForecastWindows } from './OrganizerService.js';
import { dbModel } from '../models/dbModel.js';

const DEFAULT_SCHEDULE_HOUR = 22;
const resolvedScheduleHour = (() => {
    const configuredHour = Number(process.env.PREDICTOR_SCHEDULE_HOUR);
    return Number.isInteger(configuredHour) && configuredHour >= 0 && configuredHour <= 23 ? configuredHour : DEFAULT_SCHEDULE_HOUR;
})();

const getNextRunDate = (fromDate = new Date()) => {
    const candidate = new Date(fromDate);
    candidate.setHours(resolvedScheduleHour, 0, 0, 0);

    if (candidate > fromDate) {
        return candidate;
    }

    candidate.setDate(candidate.getDate() + 1);
    candidate.setHours(resolvedScheduleHour, 0, 0, 0);

    return candidate;
};

export const runPredictionCycle = async () => {
    const units = await dbModel.getUnits();
    const results = [];

    for (const unit of units) {
        const forecastResult = await generateForecastWindows(unit.id);

        results.push({
            unitId: unit.id,
            unitName: unit.nome,
            currentMonth: forecastResult.currentMonth,
            nextMonth: forecastResult.nextMonth,
            patientsPerDoctor: forecastResult.patientsPerDoctor,
            generatedCurrentMonthShifts: forecastResult.generatedCurrentMonthShifts,
            generatedNextMonthShifts: forecastResult.generatedNextMonthShifts,
            demandByPeriod: forecastResult.demandProfile.demandByPeriod
        });
    }

    return results;
};

export const triggerPredictionCycle = async (req, res) => {
    try {
        const results = await runPredictionCycle();
        res.json({
            message: 'Previsao executada com sucesso para todas as unidades.',
            totalUnits: results.length,
            results
        });
    } catch (error) {
        res.status(500).json({
            error: 'Erro ao executar o ciclo de previsao.',
            details: error.message
        });
    }
};

export const startPredictionScheduler = () => {
    const scheduleNext = () => {
        const now = new Date();
        const nextRun = getNextRunDate(now);
        const delayMs = Math.max(nextRun.getTime() - now.getTime(), 1_000);

        setTimeout(async () => {
            try {
                const results = await runPredictionCycle();
                console.log(`[scheduler] ciclo concluido para ${results.length} unidades`);
            } catch (error) {
                console.error('[scheduler] erro ao executar o ciclo:', error.message);
            }

            scheduleNext();
        }, delayMs);

        console.log(`[scheduler] proxima execucao agendada para ${nextRun.toLocaleString('pt-BR')} (${String(resolvedScheduleHour).padStart(2, '0')}:00 diario)`);
    };

    scheduleNext();

    runPredictionCycle()
        .then((results) => {
            console.log(`[scheduler] execucao inicial concluida para ${results.length} unidades`);
        })
        .catch((error) => {
            console.error('[scheduler] erro na execucao inicial:', error.message);
        });
};
