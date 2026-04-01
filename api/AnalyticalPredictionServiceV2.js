import { dbModel } from '../model/dbModel.js';
import {
    buildContextHistoryIndex,
    buildForecastDiagnostics,
    buildPredictionRows,
    formatPredictionDateLabel,
    getPredictionHorizonDates,
    getPredictionLookbackStartDate,
    normalizeHistoricalPredictionRow
} from '../predicao (novo)/pipeline.js';

const buildFilters = (rows = []) => ({
    unidades: Array.from(new Set(rows.map((row) => row.unidade).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    regionais: Array.from(new Set(rows.map((row) => row.regional).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    turnos: Array.from(new Set(rows.map((row) => row.turno).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR'))
});

const normalizeConfidence = (value) => {
    if (value === 'alta') return 'Alta';
    if (value === 'media') return 'Média';
    return 'Baixa';
};

const inferConfidenceFromDemand = (demand) => {
    if (demand >= 120) return 'Média';
    if (demand >= 40) return 'Alta';
    return 'Baixa';
};

const buildSummary = (rows = []) => {
    const totalDemand = rows.reduce((sum, row) => sum + (Number(row.demandaEstimada ?? row.demanda_estimada) || 0), 0);
    const byDate = new Map();
    const byUnit = new Map();
    const confidenceCounts = { Alta: 0, Média: 0, Baixa: 0 };

    for (const row of rows) {
        const demand = Number(row.demandaEstimada ?? row.demanda_estimada) || 0;
        const dateKey = row.dataPrevista || row.data_prevista;
        const confidence = row.confianca ? normalizeConfidence(String(row.confianca).toLowerCase()) : 'Baixa';
        byDate.set(dateKey, (byDate.get(dateKey) || 0) + demand);
        byUnit.set(row.unidade, (byUnit.get(row.unidade) || 0) + demand);
        confidenceCounts[confidence] += 1;
    }

    const peakDay = Array.from(byDate.entries()).sort((a, b) => b[1] - a[1])[0] || null;
    const topUnit = Array.from(byUnit.entries()).sort((a, b) => b[1] - a[1])[0] || null;

    return {
        totalDemand,
        totalRows: rows.length,
        totalDays: new Set(rows.map((row) => row.dataPrevista || row.data_prevista)).size,
        averageDemandPerRow: rows.length ? Number((totalDemand / rows.length).toFixed(2)) : 0,
        peakDay: peakDay ? { date: peakDay[0], label: formatPredictionDateLabel(peakDay[0]), demand: peakDay[1] } : null,
        topUnit: topUnit ? { unidade: topUnit[0], demand: topUnit[1] } : null,
        confidenceCounts,
        diagnostics: {
            lowSampleRows: rows.filter((row) => Number(row.amostraHistorica || 0) < 8).length,
            highVolatilityRows: rows.filter((row) => Number(row.volatilidadeRelativa || 0) > 0.35).length,
            avgConfidenceScore: rows.length
                ? Number(
                      (
                          rows.reduce((sum, row) => sum + (Number(row.scoreConfianca) || 0), 0) /
                          rows.length
                      ).toFixed(1)
                  )
                : 0
        }
    };
};

const formatPredictionRow = (row, diagnostics = null) => {
    const demand = Number(row.demanda_estimada) || 0;
    const confidence =
        diagnostics?.confidenceBand
            ? normalizeConfidence(String(diagnostics.confidenceBand).toLowerCase())
            : normalizeConfidence(row.confianca ? String(row.confianca).toLowerCase() : '') || inferConfidenceFromDemand(demand);
    const spread = confidence === 'Alta' ? 0.08 : confidence === 'Média' ? 0.15 : 0.22;

    return {
        dataPrevista: row.data_prevista,
        dataLabel: formatPredictionDateLabel(row.data_prevista),
        turno: row.turno,
        demandaEstimada: demand,
        unidade: row.unidade || 'Rede',
        regional: row.regional || 'Geral',
        executadoEm: row.executado_em || null,
        confianca: confidence,
        faixaMin: Math.max(0, Math.round(demand * (1 - spread))),
        faixaMax: Math.max(0, Math.round(demand * (1 + spread))),
        amostraHistorica: diagnostics?.sampleSize ?? 0,
        volatilidade: diagnostics?.volatility ?? 0,
        volatilidadeRelativa: diagnostics?.relativeVolatility ?? 0,
        scoreConfianca: diagnostics?.score ?? (confidence === 'Alta' ? 85 : confidence === 'Média' ? 65 : 40),
        motivoConfianca: diagnostics?.reason ?? 'Sem diagnóstico detalhado.'
    };
};

export const recalculateAnalyticalPredictionV2 = async () => {
    const startDate = getPredictionLookbackStartDate();
    const [historyRows, mlRows] = await Promise.all([dbModel.getHistoricalTasy(startDate), dbModel.getHistoricalTasyMl()]);

    if (!historyRows?.length) {
        return { summary: buildSummary([]), filters: buildFilters([]), rows: [], generatedAt: null };
    }

    const predictionRows = buildPredictionRows(historyRows, mlRows || []);
    await dbModel.clearPredictionData();

    if (predictionRows.length) {
        await dbModel.upsertPredictionData(predictionRows);
    }

    return getAnalyticalPredictionSnapshotV2();
};

export const getAnalyticalPredictionSnapshotV2 = async (filters = {}) => {
    const horizonDates = getPredictionHorizonDates();
    const [allRows, historyRows] = await Promise.all([dbModel.getPredictionData({
        startDate: horizonDates[0] || null,
        endDate: horizonDates[horizonDates.length - 1] || null
    }), dbModel.getHistoricalTasy(getPredictionLookbackStartDate())]);

    const contextIndex = buildContextHistoryIndex((historyRows || []).map(normalizeHistoricalPredictionRow).filter(Boolean));

    const filteredRows = (allRows || []).filter((row) => {
        if (filters.unidade && row.unidade !== filters.unidade) return false;
        if (filters.regional && row.regional !== filters.regional) return false;
        if (filters.turno && row.turno !== filters.turno) return false;
        return true;
    });

    const generatedAt = (allRows || []).map((row) => row.executado_em).filter(Boolean).sort().slice(-1)[0] || null;
    const enrichedRows = filteredRows.map((row) => {
        const contextKey = `${row.unidade}|${row.regional}|${row.turno}`;
        const contextEntry = contextIndex.get(contextKey);
        const diagnostics = contextEntry ? buildForecastDiagnostics(contextEntry, row.data_prevista) : null;
        return formatPredictionRow(row, diagnostics);
    });

    return {
        summary: buildSummary(enrichedRows),
        filters: buildFilters(allRows || []),
        rows: enrichedRows
            .sort((a, b) => {
                if (a.dataPrevista !== b.dataPrevista) return a.dataPrevista.localeCompare(b.dataPrevista);
                if (a.unidade !== b.unidade) return a.unidade.localeCompare(b.unidade, 'pt-BR');
                return a.turno.localeCompare(b.turno, 'pt-BR');
            }),
        generatedAt
    };
};
