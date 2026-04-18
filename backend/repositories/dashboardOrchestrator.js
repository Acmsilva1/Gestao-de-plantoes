/**
 * Orquestração de leitura para o dashboard consolidado (múltiplas fontes em paralelo).
 */
import { dbModel } from '../models/dbModel.js';

export async function loadDashboardSourceRows({ startMonthDate, endMonthDate, scopedUnitId, scopedUnitIds }) {
    // scopedUnitIds (array, modo comparação BI) tem precedência sobre scopedUnitId (singular)
    const unitFilter = (Array.isArray(scopedUnitIds) && scopedUnitIds.length)
        ? scopedUnitIds
        : (scopedUnitId || null);

    const [escalaRows, disponibilidadeRows, unitsCatalogRaw, predictionRows] = await Promise.all([
        dbModel.getEscalaByRange(startMonthDate, endMonthDate, unitFilter),
        dbModel.getAvailabilityByRange(startMonthDate, endMonthDate, unitFilter),
        dbModel.getUnits(),
        dbModel.getPredictionData({ startDate: startMonthDate, endDate: endMonthDate })
    ]);
    return { escalaRows, disponibilidadeRows, unitsCatalogRaw, predictionRows };
}
