/**
 * Regras de negócio partilhadas (texto, datas de mês, turnos).
 * Usar aqui em vez de duplicar normalização nos controllers.
 */
export const normalizeTextForMatch = (value) =>
    String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase();

/** monthStr: "YYYY-MM" */
export const getMonthDateRange = (monthStr) => {
    const startMonthDate = `${monthStr}-01`;
    const [year, rawMonth] = monthStr.split('-').map(Number);
    const endMonthDate = new Date(Date.UTC(year, rawMonth, 0)).toISOString().slice(0, 10);
    return { startMonthDate, endMonthDate, year, month: rawMonth };
};

export const normalizeTurnoKey = (value) => {
    const n = normalizeTextForMatch(value).toUpperCase();
    return n === 'ALL' ? '' : n;
};
