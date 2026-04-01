import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dbModel } from '../model/dbModel.js';
import {
    buildPredictionRows as buildOfficialPredictionRows,
    formatPredictionDateLabel,
    getPredictionHorizonDates,
    getPredictionLookbackStartDate
} from '../predicao (novo)/pipeline.js';

const FORECAST_DAYS = 30;
const LOOKBACK_DAYS = 365;
const TURNOS = ['manha', 'tarde', 'noite', 'madrugada'];
const DEFAULT_HOLIDAY_MULTIPLIERS = {
    default_weekend: 1.1,
    monday_rush: 1.25
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOLIDAY_CONFIG_PATH = path.resolve(__dirname, '..', 'model', 'analise_feriados.json');

const normalizeText = (value = '') =>
    String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase();

const normalizeTurno = (value = '') => {
    const normalized = normalizeText(value);
    if (normalized.includes('manha')) return 'manha';
    if (normalized.includes('tarde')) return 'tarde';
    if (normalized.includes('madrugada')) return 'madrugada';
    if (normalized.includes('noite')) return 'noite';
    return normalized;
};

const toIsoDate = (value) => {
    if (!value) return null;
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    const normalized = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return normalized;
    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString().slice(0, 10);
};

const formatDateLabel = (isoDate) => formatPredictionDateLabel(isoDate);

const startFromToday = (offsetDays = 0) => {
    const date = new Date();
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() + offsetDays);
    return date;
};

const getDateSequence = (days = FORECAST_DAYS) =>
    Array.from({ length: days }, (_, index) => {
        const date = startFromToday(index + 1);
        return date.toISOString().slice(0, 10);
    });

const getLookbackStartDate = () => {
    const date = startFromToday(-(LOOKBACK_DAYS - 1));
    return date.toISOString().slice(0, 10);
};

const computeLinearRegression = (values = []) => {
    if (!values.length) {
        return { slope: 0, intercept: 0 };
    }

    if (values.length === 1) {
        return { slope: 0, intercept: Number(values[0]) || 0 };
    }

    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumXX = 0;

    values.forEach((value, index) => {
        const x = index + 1;
        const y = Number(value) || 0;
        sumX += x;
        sumY += y;
        sumXY += x * y;
        sumXX += x * x;
    });

    const n = values.length;
    const denominator = n * sumXX - sumX * sumX;
    if (!denominator) {
        return { slope: 0, intercept: sumY / n };
    }

    const slope = (n * sumXY - sumX * sumY) / denominator;
    const intercept = (sumY - slope * sumX) / n;
    return { slope, intercept };
};

const predictWithLinearRegression = (values = [], futureIndex) => {
    const { slope, intercept } = computeLinearRegression(values);
    return intercept + slope * futureIndex;
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
        const periodMultipliers = {};

        for (const turno of TURNOS) {
            const metrics =
                relevantMetrics[turno] ||
                relevantMetrics[turno[0].toUpperCase() + turno.slice(1)] ||
                relevantMetrics[turno === 'manha' ? 'Manhã' : turno === 'noite' ? 'Noite' : turno === 'tarde' ? 'Tarde' : 'Madrugada'];

            if (!metrics) continue;
            periodMultipliers[turno] = Number(metrics.predictedPatientsMultiplier || metrics.meanPatientsMultiplier || 1) || 1;
        }

        for (const date of exactDates) {
            multipliers[date] = {
                ...multipliers[date],
                ...periodMultipliers
            };
        }

        for (const recurringDate of recurringDates) {
            multipliers[`*-${recurringDate}`] = {
                ...multipliers[`*-${recurringDate}`],
                ...periodMultipliers
            };
        }
    }

    return multipliers;
};

const getHolidayMultiplier = (holidayMultiplierMap, isoDate, turno) => {
    const recurringKey = `*-${isoDate.slice(5)}`;
    return (
        holidayMultiplierMap?.[isoDate]?.[turno] ||
        holidayMultiplierMap?.[recurringKey]?.[turno] ||
        1
    );
};

const parseHistoricalRow = (row = {}) => {
    const data = toIsoDate(row.data || row.data_atendimento || row.data_prevista || row.dt_atendimento);
    const turno = normalizeTurno(row.turno || row.periodo || row.shift || row.faixa);
    const demanda = Number(
        row.total_atendimentos ??
            row.atendimento_count ??
            row.demanda_estimada ??
            row.quantidade ??
            row.volume ??
            row.total ??
            0
    );
    const unidade = String(row.unidade || row.unidade_nome || row.nome_unidade || row.hospital || row.unidade_id || 'Rede').trim();
    const regional = String(row.regional || row.regiao || row.região || row.cidade || row.uf || 'Geral').trim();

    if (!data || !turno || !TURNOS.includes(turno)) {
        return null;
    }

    return {
        data,
        turno,
        demanda: Number.isFinite(demanda) ? demanda : 0,
        unidade,
        regional
    };
};

const parseMlRow = (row = {}) => {
    const turno = normalizeTurno(row.turno || row.periodo);
    const unidade = String(row.unidade || row.unidade_nome || row.nome_unidade || 'Rede').trim();
    const regional = String(row.regional || row.regiao || row.região || row.cidade || 'Geral').trim();

    return {
        turno,
        unidade,
        regional,
        weekday: Number(row.weekday ?? row.dia_semana ?? row.day_of_week),
        multiplier: Number(row.multiplicador ?? row.multiplier ?? row.fator ?? row.impacto ?? 1),
        atipico: Boolean(row.atipico ?? row.is_atypical ?? row.dia_atipico),
        monthDay: typeof row.month_day === 'string' ? row.month_day : typeof row.dia_mes === 'string' ? row.dia_mes : null,
        exactDate: toIsoDate(row.data || row.data_atendimento || row.data_referencia)
    };
};

const buildMlAdjustmentIndex = (rows = []) => {
    const index = new Map();

    for (const row of rows.map(parseMlRow)) {
        if (!row.turno || !TURNOS.includes(row.turno)) continue;
        if (!Number.isFinite(row.multiplier) || row.multiplier <= 0) continue;

        const scopes = [
            `${row.unidade}|${row.turno}`,
            `${row.regional}|${row.turno}`,
            `__all__|${row.turno}`
        ];

        for (const scope of scopes) {
            if (!index.has(scope)) {
                index.set(scope, {
                    weekday: new Map(),
                    exactDate: new Map(),
                    monthDay: new Map(),
                    atypical: []
                });
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

const average = (values = []) => {
    if (!values.length) return 1;
    return values.reduce((acc, value) => acc + value, 0) / values.length;
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
            const weekdayAverage = average(weekdayValues);
            if (bucket.atypical.length) {
                return average([weekdayAverage, average(bucket.atypical)]);
            }
            return weekdayAverage;
        }
    }

    return 1;
};

const applyCalendarMultipliers = (value, isoDate, turno, holidayMultiplierMap, mlIndex, unidade, regional) => {
    const date = new Date(`${isoDate}T12:00:00Z`);
    let adjusted = Number(value) || 0;

    if (date.getUTCDay() === 0 || date.getUTCDay() === 6) {
        adjusted *= DEFAULT_HOLIDAY_MULTIPLIERS.default_weekend;
    }
    if (date.getUTCDay() === 1) {
        adjusted *= DEFAULT_HOLIDAY_MULTIPLIERS.monday_rush;
    }

    adjusted *= getHolidayMultiplier(holidayMultiplierMap, isoDate, turno);
    adjusted *= getMlMultiplier(mlIndex, unidade, regional, turno, isoDate);

    return Math.max(0, adjusted);
};

const buildPredictionRows = (historyRows, mlRows) => {
    const normalizedHistory = historyRows.map(parseHistoricalRow).filter(Boolean);
    const holidayMultiplierMap = buildHolidayMultiplierMap();
    const mlIndex = buildMlAdjustmentIndex(mlRows);
    const horizonDates = getPredictionHorizonDates(FORECAST_DAYS);
    const generatedAt = new Date().toISOString();

    const groupedHistory = normalizedHistory.reduce((accumulator, row) => {
        const key = `${row.unidade}|${row.regional}|${row.turno}`;
        const bucket = accumulator.get(key) || {
            unidade: row.unidade,
            regional: row.regional,
            turno: row.turno,
            values: []
        };
        bucket.values.push(row.demanda);
        accumulator.set(key, bucket);
        return accumulator;
    }, new Map());

    const predictions = [];

    for (const group of groupedHistory.values()) {
        if (group.values.length < 2) continue;

        for (let offset = 0; offset < horizonDates.length; offset += 1) {
            const isoDate = horizonDates[offset];
            const futureIndex = group.values.length + offset + 1;
            const trendValue = predictWithLinearRegression(group.values, futureIndex);
            const adjustedValue = applyCalendarMultipliers(
                trendValue,
                isoDate,
                group.turno,
                holidayMultiplierMap,
                mlIndex,
                group.unidade,
                group.regional
            );

            predictions.push({
                data_prevista: isoDate,
                turno: group.turno,
                demanda_estimada: Math.round(Math.max(0, adjustedValue)),
                unidade: group.unidade,
                regional: group.regional,
                executado_em: generatedAt
            });
        }
    }

    return predictions;
};

const buildFilters = (rows = []) => ({
    unidades: Array.from(new Set(rows.map((row) => row.unidade).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    regionais: Array.from(new Set(rows.map((row) => row.regional).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    turnos: Array.from(new Set(rows.map((row) => row.turno).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR'))
});

const buildSummary = (rows = []) => {
    const totalDemand = rows.reduce((sum, row) => sum + (Number(row.demanda_estimada) || 0), 0);
    const byDate = new Map();
    const byUnit = new Map();

    for (const row of rows) {
        byDate.set(row.data_prevista, (byDate.get(row.data_prevista) || 0) + (Number(row.demanda_estimada) || 0));
        byUnit.set(row.unidade, (byUnit.get(row.unidade) || 0) + (Number(row.demanda_estimada) || 0));
    }

    const peakDay = Array.from(byDate.entries()).sort((a, b) => b[1] - a[1])[0] || null;
    const topUnit = Array.from(byUnit.entries()).sort((a, b) => b[1] - a[1])[0] || null;

    return {
        totalDemand,
        totalRows: rows.length,
        totalDays: new Set(rows.map((row) => row.data_prevista)).size,
        averageDemandPerRow: rows.length ? Number((totalDemand / rows.length).toFixed(2)) : 0,
        peakDay: peakDay
            ? {
                  date: peakDay[0],
                  label: formatDateLabel(peakDay[0]),
                  demand: peakDay[1]
              }
            : null,
        topUnit: topUnit
            ? {
                  unidade: topUnit[0],
                  demand: topUnit[1]
              }
            : null
    };
};

const formatPredictionRow = (row) => ({
    dataPrevista: row.data_prevista,
    dataLabel: formatDateLabel(row.data_prevista),
    turno: row.turno,
    demandaEstimada: Number(row.demanda_estimada) || 0,
    unidade: row.unidade || 'Rede',
    regional: row.regional || 'Geral',
    executadoEm: row.executado_em || null
});

export const recalculateAnalyticalPrediction = async () => {
    const startDate = getPredictionLookbackStartDate();
    const [historyRows, mlRows] = await Promise.all([dbModel.getHistoricalTasy(startDate), dbModel.getHistoricalTasyMl()]);

    if (!historyRows?.length) {
        return {
            summary: buildSummary([]),
            filters: buildFilters([]),
            rows: [],
            generatedAt: null
        };
    }

    const predictionRows = buildOfficialPredictionRows(historyRows, mlRows || []);
    const futureDates = getPredictionHorizonDates(FORECAST_DAYS);
    const forecastStart = futureDates[0] || null;
    const forecastEnd = futureDates[futureDates.length - 1] || null;

    if (forecastStart && forecastEnd) {
        await dbModel.deletePredictionDataByRange(forecastStart, forecastEnd);
    }
    if (predictionRows.length) {
        await dbModel.upsertPredictionData(predictionRows);
    }

    return getAnalyticalPredictionSnapshot();
};

export const getAnalyticalPredictionSnapshot = async (filters = {}) => {
    const allRows = await dbModel.getPredictionData({
        startDate: getPredictionHorizonDates(FORECAST_DAYS)[0] || null,
        endDate: getPredictionHorizonDates(FORECAST_DAYS).slice(-1)[0] || null
    });

    const filteredRows = (allRows || []).filter((row) => {
        if (filters.unidade && row.unidade !== filters.unidade) return false;
        if (filters.regional && row.regional !== filters.regional) return false;
        if (filters.turno && row.turno !== filters.turno) return false;
        return true;
    });

    const generatedAt = (allRows || [])
        .map((row) => row.executado_em)
        .filter(Boolean)
        .sort()
        .slice(-1)[0] || null;

    return {
        summary: buildSummary(filteredRows),
        filters: buildFilters(allRows || []),
        rows: filteredRows
            .map(formatPredictionRow)
            .sort((a, b) => {
                if (a.dataPrevista !== b.dataPrevista) return a.dataPrevista.localeCompare(b.dataPrevista);
                if (a.unidade !== b.unidade) return a.unidade.localeCompare(b.unidade, 'pt-BR');
                return a.turno.localeCompare(b.turno, 'pt-BR');
            }),
        generatedAt
    };
};
