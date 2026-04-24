/** Converte célula CSV em valor adequado ao SQLite / app. */
export function coerceCell(raw, columnName) {
    if (raw === undefined || raw === null) return null;
    const s = String(raw).trim();
    if (s === '') return null;

    const col = String(columnName || '');

    if (/confirmado|fila_ativa/i.test(col)) {
        if (s === '0' || s === '1') return Number(s);
        if (s.toLowerCase() === 'true') return 1;
        if (s.toLowerCase() === 'false') return 0;
    }

    if (/^-?\d+$/.test(s)) {
        const n = Number(s);
        if (Number.isSafeInteger(n)) return n;
    }
    if (/^-?\d+\.\d+([eE][+-]?\d+)?$/.test(s)) {
        const f = Number(s);
        if (!Number.isNaN(f)) return f;
    }

    return raw;
}
