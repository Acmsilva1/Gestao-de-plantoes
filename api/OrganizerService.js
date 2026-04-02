import { dbModel } from '../model/dbModel.js';
import { cacheModel } from '../model/CacheModel.js';
import { buildMonthShiftPlan, calculateDemandProfile, getDemandForDateAndPeriod, getForecastMonthReferences, getHistoryWindowStartDate } from './PredictionEngine.js';

const PUBLIC_SHIFTS_CACHE_KEY = 'public-shifts';
const buildAvailabilityKey = (row) => `${row.unidade_id}|${row.data_plantao}|${row.turno}`;

const buildAvailabilityRows = (unidadeId, demandProfile, monthPlan, unitContext) => {
    return monthPlan.shifts.map((shift) => {
        const demandForShift = getDemandForDateAndPeriod(demandProfile, shift.dataPlantao, shift.turno, unitContext);

        return {
            unidade_id: unidadeId,
            data_plantao: shift.dataPlantao,
            turno: shift.turno,
            vagas_totais: demandForShift.neededDoctors,
            status: 'ABERTO'
        };
    });
};

const resolveStatusForForecast = (existingRow, desiredRow) => {
    if (!existingRow) {
        return desiredRow.status;
    }

    if ((existingRow.vagas_ocupadas || 0) >= desiredRow.vagas_totais) {
        return 'OCUPADO';
    }

    return 'ABERTO';
};

const getRowsToSync = (existingRows, desiredRows) => {
    const existingByKey = new Map(existingRows.map((row) => [buildAvailabilityKey(row), row]));

    return desiredRows
        .map((desiredRow) => {
            const existingRow = existingByKey.get(buildAvailabilityKey(desiredRow));
            const nextStatus = resolveStatusForForecast(existingRow, desiredRow);

            if (!existingRow) {
                return {
                    ...desiredRow,
                    status: nextStatus
                };
            }

            const hasChanged = existingRow.vagas_totais !== desiredRow.vagas_totais || existingRow.status !== nextStatus;

            if (!hasChanged) {
                return null;
            }

            return {
                ...desiredRow,
                status: nextStatus
            };
        })
        .filter(Boolean);
};

export const generateForecastWindows = async (unidadeId) => {
    const unit = await dbModel.getUnitById(unidadeId);
    const history = await dbModel.getHistory(unidadeId, getHistoryWindowStartDate());
    const demandProfile = calculateDemandProfile(history);
    const { current, next } = getForecastMonthReferences();
    const currentMonthPlan = buildMonthShiftPlan(current);
    const nextMonthPlan = buildMonthShiftPlan(next);
    const allDesiredRows = [
        ...buildAvailabilityRows(unidadeId, demandProfile, currentMonthPlan, unit),
        ...buildAvailabilityRows(unidadeId, demandProfile, nextMonthPlan, unit)
    ];
    const forecastRangeStart = `${current.monthKey}-01`;
    const forecastRangeEnd = `${next.monthKey}-${String(nextMonthPlan.shifts.length / 4).padStart(2, '0')}`;
    const existingRows = await dbModel.getAvailabilityByUnitAndRange(unidadeId, forecastRangeStart, forecastRangeEnd);
    const rowsToSync = getRowsToSync(existingRows, allDesiredRows);
    const syncedRows = rowsToSync.length > 0 ? await dbModel.upsertAvailabilityRows(rowsToSync) : [];
    const currentMonthUpdated = syncedRows.filter((row) => row.data_plantao.startsWith(current.monthKey)).length;
    const nextMonthUpdated = syncedRows.filter((row) => row.data_plantao.startsWith(next.monthKey)).length;

    cacheModel.delete(PUBLIC_SHIFTS_CACHE_KEY);

    return {
        unidadeId,
        unit,
        currentMonth: current.monthKey,
        nextMonth: next.monthKey,
        patientsPerDoctor: demandProfile.patientsPerDoctor,
        generatedCurrentMonthShifts: currentMonthUpdated,
        generatedNextMonthShifts: nextMonthUpdated,
        skippedUnchangedShifts: allDesiredRows.length - syncedRows.length,
        demandProfile
    };
};
