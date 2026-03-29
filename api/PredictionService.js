export const SHIFT_PERIODS = ['Manh\u00e3', 'Tarde', 'Noite', 'Madrugada'];
export const DEFAULT_PATIENTS_PER_DOCTOR = 10;
export const WEEKDAY_INDEXES = [0, 1, 2, 3, 4, 5, 6];
export const WEEKDAY_LABELS = ['Domingo', 'Segunda', 'Terca', 'Quarta', 'Quinta', 'Sexta', 'Sabado'];
export const FORECAST_HISTORY_WINDOW_DAYS = 60;

const PERIOD_WEIGHTS = {
    'Manh\u00e3': 0.32,
    Tarde: 0.28,
    Noite: 0.25,
    Madrugada: 0.15
};

const SAFETY_FACTOR = 1.15;

const getWeekdayIndex = (dateString) => new Date(`${dateString}T00:00:00Z`).getUTCDay();

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
        demandByWeekday
    };
};

export const getDemandForDateAndPeriod = (demandProfile, date, period) => {
    const weekdayIndex = getWeekdayIndex(date);
    return demandProfile.demandByWeekday?.[weekdayIndex]?.[period] || demandProfile.demandByPeriod?.[period] || { neededDoctors: 1 };
};
