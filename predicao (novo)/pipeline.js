import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const FORECAST_DAYS = 30;
export const LOOKBACK_DAYS = 365;
export const TURNOS_ANALITICOS = ['manha', 'tarde', 'noite', 'madrugada'];
export const DEFAULT_CALENDAR_MULTIPLIERS = {
    default_weekend: 1.08,
    monday_rush: 1.12
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOLIDAY_CONFIG_PATH = path.resolve(__dirname, '..', 'model', 'analise_feriados.json');

export const normalizePredictionText = (value = '') =>
    String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase();

export const normalizePredictionTurno = (value = '') => {
    const normalized = normalizePredictionText(value);
    if (normalized.includes('manha')) return 'manha';
    if (normalized.includes('tarde')) return 'tarde';
    if (normalized.includes('madrugada')) return 'madrugada';
    if (normalized.includes('noite')) return 'noite';
    return normalized;
};

export const toPredictionIsoDate = (value) => {
    if (!value) return null;
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    const normalized = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return normalized;
    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString().slice(0, 10);
};

export const formatPredictionDateLabel = (isoDate) =>
    new Date(`${isoDate}T12:00:00Z`).toLocaleDateString('pt-BR', {
        timeZone: 'UTC',
        weekday: 'short',
        day: '2-digit',
        month: '2-digit'
    });

const startFromToday = (offsetDays = 0) => {
    const date = new Date();
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() + offsetDays);
    return date;
};

export const getPredictionHorizonDates = (days = FORECAST_DAYS) =>
    Array.from({ length: days }, (_, index) => {
        const date = startFromToday(index + 1);
        return date.toISOString().slice(0, 10);
    });

export const getPredictionLookbackStartDate = () => {
    const date = startFromToday(-(LOOKBACK_DAYS - 1));
    return date.toISOString().slice(0, 10);
};

const average = (values = []) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0);

const median = (values = []) => {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
};

const standardDeviation = (values = []) => {
    if (values.length <= 1) return 0;
    const mean = average(values);
    const variance = average(values.map((value) => Math.pow(value - mean, 2)));
    return Math.sqrt(variance);
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const computeLinearRegression = (values = []) => {
    if (!values.length) return { slope: 0, intercept: 0 };
    if (values.length === 1) return { slope: 0, intercept: values[0] };

    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumXX = 0;

    values.forEach((value, index) => {
        const x = index + 1;
        sumX += x;
        sumY += value;
        sumXY += x * value;
        sumXX += x * x;
    });

    const n = values.length;
    const denominator = n * sumXX - sumX * sumX;
    if (!denominator) {
        return { slope: 0, intercept: average(values) };
    }

    const slope = (n * sumXY - sumX * sumY) / denominator;
    const intercept = (sumY - slope * sumX) / n;
    return { slope, intercept };
};

const predictWithLinearRegression = (values = [], futureIndex) => {
    const { slope, intercept } = computeLinearRegression(values);
    return intercept + slope * futureIndex;
};

const removeOutliers = (values = []) => {
    if (values.length < 5) return values;
    const med = median(values);
    const deviations = values.map((value) => Math.abs(value - med));
    const mad = median(deviations);
    if (!mad) return values;
    const threshold = mad * 3.5;
    const filtered = values.filter((value) => Math.abs(value - med) <= threshold);
    return filtered.length >= Math.max(3, Math.floor(values.length * 0.6)) ? filtered : values;
};

const readHolidayConfig = () => {
    try {
        const raw = fs.readFileSync(HOLIDAY_CONFIG_PATH, 'utf-8');
        return JSON.parse(raw)?.analise_feriados || { regras: [] };
    } catch {
        return { regras: [] };
    }
};

const buildHolidayMultiplierMap = () => {
    const config = readHolidayConfig();
    const multipliers = {};

    for (const rule of config.regras || []) {
        const exactDates = Array.isArray(rule.datas) ? rule.datas : [];
        const recurringDates = Array.isArray(rule.datasRecorrentes) ? rule.datasRecorrentes : [];
        const relevantMetrics = rule.metricas || {};
        const perTurn = {};

        for (const turno of TURNOS_ANALITICOS) {
            const metrics =
                relevantMetrics[turno] ||
                relevantMetrics[turno[0].toUpperCase() + turno.slice(1)] ||
                relevantMetrics[turno === 'manha' ? 'Manhã' : turno === 'tarde' ? 'Tarde' : turno === 'noite' ? 'Noite' : 'Madrugada'];

            if (!metrics) continue;
            perTurn[turno] = Number(metrics.predictedPatientsMultiplier || metrics.meanPatientsMultiplier || 1) || 1;
        }

        for (const date of exactDates) {
            multipliers[date] = { ...multipliers[date], ...perTurn };
        }
        for (const recurringDate of recurringDates) {
            multipliers[`*-${recurringDate}`] = { ...multipliers[`*-${recurringDate}`], ...perTurn };
        }
    }

    return multipliers;
};

const getHolidayMultiplier = (holidayMultiplierMap, isoDate, turno) =>
    holidayMultiplierMap?.[isoDate]?.[turno] || holidayMultiplierMap?.[`*-${isoDate.slice(5)}`]?.[turno] || 1;

export const normalizeHistoricalPredictionRow = (row = {}) => {
    const data = toPredictionIsoDate(row.data || row.data_atendimento || row.data_prevista || row.dt_atendimento);
    const turno = normalizePredictionTurno(row.turno || row.periodo || row.shift || row.faixa);
    const demanda = Number(row.total_atendimentos ?? row.atendimento_count ?? row.demanda_estimada ?? row.quantidade ?? row.volume ?? row.total ?? 0);
    const unidade = String(row.unidade || row.unidade_nome || row.nome_unidade || row.hospital || row.unidade_id || 'Rede').trim();
    const regional = String(row.regional || row.regiao || row.região || row.cidade || row.uf || 'Geral').trim();

    if (!data || !turno || !TURNOS_ANALITICOS.includes(turno) || !Number.isFinite(demanda)) {
        return null;
    }

    const weekday = new Date(`${data}T12:00:00Z`).getUTCDay();
    return { data, turno, demanda, unidade, regional, weekday };
};

const normalizeMlRow = (row = {}) => ({
    turno: normalizePredictionTurno(row.turno || row.periodo),
    unidade: String(row.unidade || row.unidade_nome || row.nome_unidade || 'Rede').trim(),
    regional: String(row.regional || row.regiao || row.região || row.cidade || 'Geral').trim(),
    weekday: Number(row.weekday ?? row.dia_semana ?? row.day_of_week),
    multiplier: Number(row.multiplicador ?? row.multiplier ?? row.fator ?? row.impacto ?? 1),
    atipico: Boolean(row.atipico ?? row.is_atypical ?? row.dia_atipico),
    monthDay: typeof row.month_day === 'string' ? row.month_day : typeof row.dia_mes === 'string' ? row.dia_mes : null,
    exactDate: toPredictionIsoDate(row.data || row.data_atendimento || row.data_referencia)
});

const buildMlAdjustmentIndex = (rows = []) => {
    const index = new Map();

    for (const row of rows.map(normalizeMlRow)) {
        if (!row.turno || !TURNOS_ANALITICOS.includes(row.turno)) continue;
        if (!Number.isFinite(row.multiplier) || row.multiplier <= 0) continue;

        const scopes = [`${row.unidade}|${row.turno}`, `${row.regional}|${row.turno}`, `__all__|${row.turno}`];
        for (const scope of scopes) {
            if (!index.has(scope)) {
                index.set(scope, { weekday: new Map(), exactDate: new Map(), monthDay: new Map(), atypical: [] });
            }
            const target = index.get(scope);
            if (Number.isInteger(row.weekday) && row.weekday >= 0 && row.weekday <= 6) {
                const bucket = target.weekday.get(row.weekday) || [];
                bucket.push(row.multiplier);
                target.weekday.set(row.weekday, bucket);
            }
            if (row.exactDate) {
                const bucket = target.exactDate.get(row.exactDate) || [];
                bucket.push(row.multiplier);
                target.exactDate.set(row.exactDate, bucket);
            }
            if (row.monthDay && /^\d{2}-\d{2}$/.test(row.monthDay)) {
                const bucket = target.monthDay.get(row.monthDay) || [];
                bucket.push(row.multiplier);
                target.monthDay.set(row.monthDay, bucket);
            }
            if (row.atipico) {
                target.atypical.push(row.multiplier);
            }
        }
    }

    return index;
};

const getMlMultiplier = (mlIndex, unidade, regional, turno, isoDate) => {
    const weekday = new Date(`${isoDate}T12:00:00Z`).getUTCDay();
    const monthDay = isoDate.slice(5);
    const scopes = [`${unidade}|${turno}`, `${regional}|${turno}`, `__all__|${turno}`];

    for (const scope of scopes) {
        const bucket = mlIndex.get(scope);
        if (!bucket) continue;

        const exactDateValues = bucket.exactDate.get(isoDate);
        if (exactDateValues?.length) return average(exactDateValues);

        const monthDayValues = bucket.monthDay.get(monthDay);
        if (monthDayValues?.length) return average(monthDayValues);

        const weekdayValues = bucket.weekday.get(weekday);
        if (weekdayValues?.length) {
            return bucket.atypical.length ? average([average(weekdayValues), average(bucket.atypical)]) : average(weekdayValues);
        }
    }

    return 1;
};

export const buildContextHistoryIndex = (rows = []) => {
    const index = new Map();

    for (const row of rows) {
        const key = `${row.unidade}|${row.regional}|${row.turno}`;
        const entry = index.get(key) || { unidade: row.unidade, regional: row.regional, turno: row.turno, rows: [], byWeekday: new Map() };
        entry.rows.push(row);
        const weekdayBucket = entry.byWeekday.get(row.weekday) || [];
        weekdayBucket.push(row);
        entry.byWeekday.set(row.weekday, weekdayBucket);
        index.set(key, entry);
    }

    for (const entry of index.values()) {
        entry.rows.sort((a, b) => a.data.localeCompare(b.data));
        for (const [weekday, bucket] of entry.byWeekday.entries()) {
            entry.byWeekday.set(weekday, bucket.sort((a, b) => a.data.localeCompare(b.data)));
        }
    }

    return index;
};

export const buildBaseForecast = (entry, targetDate) => {
    const weekday = new Date(`${targetDate}T12:00:00Z`).getUTCDay();
    const specificRows = entry.byWeekday.get(weekday) || [];
    const recentSpecific = specificRows.slice(-12).map((row) => row.demanda);
    const recentGeneral = entry.rows.slice(-10).map((row) => row.demanda);
    const allSpecific = specificRows.map((row) => row.demanda);

    const specificClean = removeOutliers(recentSpecific.length >= 4 ? recentSpecific : allSpecific.slice(-12));
    const generalClean = removeOutliers(recentGeneral);
    const trendSeries = removeOutliers(entry.rows.slice(-8).map((row) => row.demanda));

    const seasonalMedian = median(specificClean);
    const recentAverage = average(generalClean);
    const trendValue = trendSeries.length ? predictWithLinearRegression(trendSeries, trendSeries.length + 1) : 0;
    const fallback = average(removeOutliers(entry.rows.slice(-20).map((row) => row.demanda)));

    const parts = [
        seasonalMedian ? seasonalMedian * 0.5 : 0,
        recentAverage ? recentAverage * 0.3 : 0,
        trendValue ? trendValue * 0.2 : 0
    ];

    const rawBase = parts.reduce((sum, part) => sum + part, 0) || fallback || recentAverage || seasonalMedian || 0;
    const volatility = average([standardDeviation(specificClean), standardDeviation(generalClean)].filter(Boolean));
    const sampleSize = Math.max(specificClean.length, generalClean.length, entry.rows.length);

    return {
        baseValue: Math.max(0, rawBase),
        volatility: Number.isFinite(volatility) ? volatility : 0,
        sampleSize,
        weekday
    };
};

const getConfidenceBand = (sampleSize, volatility, baseValue) => {
    const relativeVolatility = baseValue > 0 ? volatility / baseValue : 1;
    if (sampleSize >= 10 && relativeVolatility <= 0.18) return 'alta';
    if (sampleSize >= 6 && relativeVolatility <= 0.35) return 'media';
    return 'baixa';
};

export const buildForecastDiagnostics = (entry, targetDate) => {
    const { baseValue, volatility, sampleSize, weekday } = buildBaseForecast(entry, targetDate);
    const relativeVolatility = baseValue > 0 ? volatility / baseValue : 1;
    const confidenceBand = getConfidenceBand(sampleSize, volatility, Math.max(baseValue, 1));

    let score = 100;
    score -= sampleSize < 4 ? 40 : sampleSize < 8 ? 22 : sampleSize < 12 ? 10 : 0;
    score -= relativeVolatility > 0.5 ? 38 : relativeVolatility > 0.35 ? 24 : relativeVolatility > 0.2 ? 12 : 0;
    score = clamp(Math.round(score), 5, 98);

    let reason = 'Histórico consistente para o contexto.';
    if (sampleSize < 4) {
        reason = 'Pouca amostra histórica para este contexto.';
    } else if (sampleSize < 8) {
        reason = 'Amostra histórica ainda limitada para este contexto.';
    } else if (relativeVolatility > 0.5) {
        reason = 'Histórico muito volátil neste contexto.';
    } else if (relativeVolatility > 0.35) {
        reason = 'Variação elevada no histórico deste contexto.';
    } else if (relativeVolatility > 0.2) {
        reason = 'Variação moderada no histórico deste contexto.';
    }

    return {
        weekday,
        baseValue: Number(baseValue.toFixed(2)),
        volatility: Number(volatility.toFixed(2)),
        relativeVolatility: Number(relativeVolatility.toFixed(3)),
        sampleSize,
        score,
        confidenceBand,
        reason
    };
};

export const buildPredictionRows = (historyRows = [], mlRows = []) => {
    const normalizedHistory = historyRows.map(normalizeHistoricalPredictionRow).filter(Boolean);
    const contextIndex = buildContextHistoryIndex(normalizedHistory);
    const holidayMultiplierMap = buildHolidayMultiplierMap();
    const mlIndex = buildMlAdjustmentIndex(mlRows);
    const horizonDates = getPredictionHorizonDates();
    const generatedAt = new Date().toISOString();
    const predictions = [];

    for (const entry of contextIndex.values()) {
        if (entry.rows.length < 3) continue;

        for (const isoDate of horizonDates) {
            const { baseValue, volatility, sampleSize } = buildBaseForecast(entry, isoDate);

            let adjusted = baseValue;
            const date = new Date(`${isoDate}T12:00:00Z`);
            if (date.getUTCDay() === 0 || date.getUTCDay() === 6) adjusted *= DEFAULT_CALENDAR_MULTIPLIERS.default_weekend;
            if (date.getUTCDay() === 1) adjusted *= DEFAULT_CALENDAR_MULTIPLIERS.monday_rush;
            adjusted *= getHolidayMultiplier(holidayMultiplierMap, isoDate, entry.turno);
            adjusted *= getMlMultiplier(mlIndex, entry.unidade, entry.regional, entry.turno, isoDate);

            const demand = Math.round(Math.max(0, adjusted));
            const confidence = getConfidenceBand(sampleSize, volatility, Math.max(baseValue, 1));

            predictions.push({
                data_prevista: isoDate,
                turno: entry.turno,
                demanda_estimada: demand,
                unidade: entry.unidade,
                regional: entry.regional,
                executado_em: generatedAt,
                confianca: confidence
            });
        }
    }

    return predictions;
};
