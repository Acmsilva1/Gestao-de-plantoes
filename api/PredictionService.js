import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SHIFT_PERIODS = ['Manh\u00e3', 'Tarde', 'Noite', 'Madrugada'];
export const DEFAULT_PATIENTS_PER_DOCTOR = 10;
export const WEEKDAY_INDEXES = [0, 1, 2, 3, 4, 5, 6];
export const WEEKDAY_LABELS = ['Domingo', 'Segunda', 'Terca', 'Quarta', 'Quinta', 'Sexta', 'Sabado'];
export const FORECAST_HISTORY_WINDOW_DAYS = 60;
const HOLIDAY_ANALYSIS_FILE_NAME = 'analise_feriados.json';

const PERIOD_WEIGHTS = {
    'Manh\u00e3': 0.32,
    Tarde: 0.28,
    Noite: 0.25,
    Madrugada: 0.15
};

const SAFETY_FACTOR = 1.15;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const HOLIDAY_ANALYSIS_FILE_PATH = path.resolve(__dirname, '..', 'model', HOLIDAY_ANALYSIS_FILE_NAME);
let holidayAnalysisCache = null;
let holidayAnalysisCacheMtimeMs = null;

const getWeekdayIndex = (dateString) => new Date(`${dateString}T00:00:00Z`).getUTCDay();
const normalizeComparableText = (value = '') =>
    String(value)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();

const safeParseJsonFile = (filePath) => {
    try {
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(fileContent);
    } catch (error) {
        if (error.code === 'ENOENT') {
            return null;
        }

        throw new Error(`Falha ao carregar ${HOLIDAY_ANALYSIS_FILE_NAME}: ${error.message}`);
    }
};

const getHolidayAnalysisConfig = () => {
    try {
        const fileStat = fs.statSync(HOLIDAY_ANALYSIS_FILE_PATH);

        if (!holidayAnalysisCache || holidayAnalysisCacheMtimeMs !== fileStat.mtimeMs) {
            holidayAnalysisCache = safeParseJsonFile(HOLIDAY_ANALYSIS_FILE_PATH)?.analise_feriados || {
                fallbackRegiao: 'geral',
                regras: []
            };
            holidayAnalysisCacheMtimeMs = fileStat.mtimeMs;
        }

        return holidayAnalysisCache;
    } catch (error) {
        if (error.code === 'ENOENT') {
            return {
                fallbackRegiao: 'geral',
                regras: []
            };
        }

        throw new Error(`Falha ao inspecionar ${HOLIDAY_ANALYSIS_FILE_NAME}: ${error.message}`);
    }
};

const cloneDemandSnapshot = (demand = {}) => ({
    meanPatients: Number(demand.meanPatients ?? 0),
    stdDevPatients: Number(demand.stdDevPatients ?? 0),
    predictedPatients: Number(demand.predictedPatients ?? 1),
    neededDoctors: Number(demand.neededDoctors ?? 1)
});

const applyMetricMultiplier = (value, multiplier = 1, minimum = 0) => {
    const numericValue = Number(value ?? 0);
    const numericMultiplier = Number(multiplier ?? 1);
    const multiplied = Math.round(numericValue * numericMultiplier);
    return Math.max(multiplied, minimum);
};

const buildComparableTokens = (values = []) =>
    values
        .flatMap((value) => String(value || '').split(/[\s,;/\-|]+/))
        .map(normalizeComparableText)
        .filter(Boolean);

const resolveUnitRegionContext = (unit = {}) => {
    const regionTokens = buildComparableTokens([unit.regiao, unit.region, unit.cidade, unit.city, unit.uf, unit.state, unit.nome, unit.endereco]);
    const preferredRegion = normalizeComparableText(unit.regiao || unit.region || unit.cidade || unit.city || unit.uf || unit.state || unit.nome || 'geral');

    return {
        preferredRegion,
        regionTokens
    };
};

const doesRuleMatchDate = (rule, date) => {
    const exactDates = Array.isArray(rule.datas) ? rule.datas : [];
    if (exactDates.includes(date)) {
        return true;
    }

    const monthDay = date.slice(5);
    const recurringDates = Array.isArray(rule.datasRecorrentes) ? rule.datasRecorrentes : [];
    return recurringDates.includes(monthDay);
};

const doesRuleMatchRegion = (rule, unitRegionContext) => {
    const holidayAnalysisConfig = getHolidayAnalysisConfig();
    const configuredRegions = (Array.isArray(rule.regioes) ? rule.regioes : [])
        .map(normalizeComparableText)
        .filter(Boolean);

    if (configuredRegions.length === 0) {
        return true;
    }

    return configuredRegions.some((region) => {
        if (region === normalizeComparableText(holidayAnalysisConfig.fallbackRegiao || 'geral')) {
            return true;
        }

        return unitRegionContext.regionTokens.includes(region) || unitRegionContext.preferredRegion === region;
    });
};

const getHolidayRuleForDate = (date, unit = {}) => {
    const holidayAnalysisConfig = getHolidayAnalysisConfig();
    const unitRegionContext = resolveUnitRegionContext(unit);
    const matchedRule = (holidayAnalysisConfig.regras || []).find((rule) => doesRuleMatchDate(rule, date) && doesRuleMatchRegion(rule, unitRegionContext));

    if (!matchedRule) {
        return null;
    }

    return {
        ...matchedRule,
        matchedRegion: unitRegionContext.preferredRegion || normalizeComparableText(holidayAnalysisConfig.fallbackRegiao || 'geral')
    };
};

const applyHolidayMetricsToDemand = (baseDemand, holidayRule, period, patientsPerDoctor = DEFAULT_PATIENTS_PER_DOCTOR) => {
    const periodMetrics = holidayRule?.metricas?.[period];

    if (!periodMetrics) {
        return cloneDemandSnapshot(baseDemand);
    }

    const nextMeanPatients = applyMetricMultiplier(baseDemand.meanPatients, periodMetrics.meanPatientsMultiplier, 0);
    const nextStdDevPatients = applyMetricMultiplier(baseDemand.stdDevPatients, periodMetrics.stdDevPatientsMultiplier, 0);
    const predictedPatientsBase = Math.max(1, Math.ceil(nextMeanPatients + nextStdDevPatients * SAFETY_FACTOR));
    const nextPredictedPatients = Math.max(
        1,
        applyMetricMultiplier(
            periodMetrics.predictedPatientsBase ?? predictedPatientsBase,
            periodMetrics.predictedPatientsMultiplier,
            1
        )
    );
    const nextNeededDoctors = Math.max(
        1,
        applyMetricMultiplier(
            periodMetrics.neededDoctorsBase ?? baseDemand.neededDoctors,
            periodMetrics.neededDoctorsMultiplier,
            1
        )
    );

    return {
        meanPatients: nextMeanPatients,
        stdDevPatients: nextStdDevPatients,
        predictedPatients: nextPredictedPatients,
        neededDoctors: Math.max(nextNeededDoctors, Math.ceil(nextPredictedPatients / patientsPerDoctor)),
        holidayName: holidayRule.nome,
        holidayScope: holidayRule.escopo || 'regional'
    };
};

export const getHistoryWindowStartDate = (referenceDate = new Date(), windowDays = FORECAST_HISTORY_WINDOW_DAYS) => {
    const reference = new Date(referenceDate);
    reference.setUTCHours(23, 59, 59, 999);

    const cutoff = new Date(reference);
    cutoff.setUTCDate(cutoff.getUTCDate() - (windowDays - 1));
    cutoff.setUTCHours(0, 0, 0, 0);

    return cutoff.toISOString().slice(0, 10);
};

const getRecentHistoryWindow = (history, referenceDate = new Date(), windowDays = FORECAST_HISTORY_WINDOW_DAYS) => {
    const historyWindowStartDate = getHistoryWindowStartDate(referenceDate, windowDays);
    const referenceDateKey = new Date(referenceDate).toISOString().slice(0, 10);

    return (history || []).filter((entry) => {
        return entry.data_atendimento >= historyWindowStartDate && entry.data_atendimento <= referenceDateKey;
    });
};

const calculateStats = (values) => {
    if (values.length === 0) {
        return {
            mean: 0,
            variance: 0,
            stdDev: 0
        };
    }

    const mean = values.reduce((accumulator, current) => accumulator + current, 0) / values.length;
    const variance = values.map((value) => Math.pow(value - mean, 2)).reduce((accumulator, current) => accumulator + current, 0) / values.length;

    return {
        mean,
        variance,
        stdDev: Math.sqrt(variance)
    };
};

const splitDailyTotalAcrossPeriods = (date, totalPatients) =>
    SHIFT_PERIODS.map((period, index) => {
        const isLastPeriod = index === SHIFT_PERIODS.length - 1;
        const distributedBefore = SHIFT_PERIODS.slice(0, index).reduce(
            (sum, currentPeriod) => sum + Math.round(totalPatients * PERIOD_WEIGHTS[currentPeriod]),
            0
        );
        const atendimentoCount = isLastPeriod
            ? Math.max(totalPatients - distributedBefore, 0)
            : Math.round(totalPatients * PERIOD_WEIGHTS[period]);

        return {
            data_atendimento: date,
            periodo: period,
            atendimento_count: atendimentoCount,
            weekdayIndex: getWeekdayIndex(date)
        };
    });

const normalizeHistoryByPeriod = (history) => {
    const historyByDate = history.reduce((accumulator, entry) => {
        const current = accumulator.get(entry.data_atendimento) || [];
        current.push(entry);
        accumulator.set(entry.data_atendimento, current);
        return accumulator;
    }, new Map());

    return Array.from(historyByDate.entries()).flatMap(([date, entries]) => {
        if (entries.length > 1) {
            return entries
                .filter((entry) => entry.periodo && SHIFT_PERIODS.includes(entry.periodo))
                .map((entry) => ({
                    data_atendimento: entry.data_atendimento,
                    periodo: entry.periodo,
                    atendimento_count: entry.atendimento_count,
                    weekdayIndex: getWeekdayIndex(entry.data_atendimento)
                }));
        }

        const totalPatients = entries.reduce((sum, entry) => sum + entry.atendimento_count, 0);
        return splitDailyTotalAcrossPeriods(date, totalPatients);
    });
};

const buildMonthReference = (year, monthIndexZeroBased) => {
    const date = new Date(Date.UTC(year, monthIndexZeroBased, 1));

    return {
        year: date.getUTCFullYear(),
        month: date.getUTCMonth() + 1,
        monthKey: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
    };
};

export const getForecastMonthReferences = (baseDate = new Date()) => {
    const current = buildMonthReference(baseDate.getUTCFullYear(), baseDate.getUTCMonth());
    const next = buildMonthReference(baseDate.getUTCFullYear(), baseDate.getUTCMonth() + 1);

    return { current, next };
};

export const buildMonthShiftPlan = (monthReference) => {
    const totalDays = new Date(Date.UTC(monthReference.year, monthReference.month, 0)).getUTCDate();
    const shifts = [];

    for (let day = 1; day <= totalDays; day += 1) {
        const dataPlantao = `${monthReference.monthKey}-${String(day).padStart(2, '0')}`;

        for (const turno of SHIFT_PERIODS) {
            shifts.push({ dataPlantao, turno });
        }
    }

    return {
        ...monthReference,
        shifts
    };
};

export const calculateDemandProfile = (history, patientsPerDoctor = DEFAULT_PATIENTS_PER_DOCTOR, referenceDate = new Date()) => {
    const recentHistory = getRecentHistoryWindow(history, referenceDate);
    const historyByPeriod = normalizeHistoryByPeriod(recentHistory);
    const demandByPeriod = {};
    const demandByWeekday = {};

    for (const period of SHIFT_PERIODS) {
        const periodValues = historyByPeriod.filter((entry) => entry.periodo === period).map((entry) => entry.atendimento_count);
        const stats = calculateStats(periodValues);
        const predictedPatients = Math.max(1, Math.ceil(stats.mean + stats.stdDev * SAFETY_FACTOR));
        const neededDoctors = Math.max(1, Math.ceil(predictedPatients / patientsPerDoctor));

        demandByPeriod[period] = {
            meanPatients: Number(stats.mean.toFixed(2)),
            stdDevPatients: Number(stats.stdDev.toFixed(2)),
            predictedPatients,
            neededDoctors
        };
    }

    for (const weekdayIndex of WEEKDAY_INDEXES) {
        const weekdayDemand = {};

        for (const period of SHIFT_PERIODS) {
            const values = historyByPeriod
                .filter((entry) => entry.weekdayIndex === weekdayIndex && entry.periodo === period)
                .map((entry) => entry.atendimento_count);

            const fallback = demandByPeriod[period];
            const stats = values.length > 0 ? calculateStats(values) : { mean: fallback.meanPatients, stdDev: fallback.stdDevPatients };
            const predictedPatients = Math.max(1, Math.ceil(stats.mean + stats.stdDev * SAFETY_FACTOR));
            const neededDoctors = Math.max(1, Math.ceil(predictedPatients / patientsPerDoctor));

            weekdayDemand[period] = {
                meanPatients: Number(stats.mean.toFixed(2)),
                stdDevPatients: Number(stats.stdDev.toFixed(2)),
                predictedPatients,
                neededDoctors
            };
        }

        demandByWeekday[weekdayIndex] = weekdayDemand;
    }

    return {
        windowDays: FORECAST_HISTORY_WINDOW_DAYS,
        historyRowsConsidered: historyByPeriod.length,
        patientsPerDoctor,
        demandByPeriod,
        demandByWeekday,
        holidayAnalysisFile: HOLIDAY_ANALYSIS_FILE_NAME
    };
};

export const getDemandForDateAndPeriod = (demandProfile, date, period, unit = null) => {
    const weekdayIndex = getWeekdayIndex(date);
    const baseDemand = cloneDemandSnapshot(
        demandProfile.demandByWeekday?.[weekdayIndex]?.[period] || demandProfile.demandByPeriod?.[period] || { neededDoctors: 1 }
    );
    const holidayRule = getHolidayRuleForDate(date, unit || {});

    if (!holidayRule) {
        return baseDemand;
    }

    return {
        ...applyHolidayMetricsToDemand(baseDemand, holidayRule, period, demandProfile.patientsPerDoctor),
        holidayApplied: true,
        holidayDate: date,
        holidayMatchedRegion: holidayRule.matchedRegion
    };
};
