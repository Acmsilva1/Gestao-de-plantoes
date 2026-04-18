function eqCell(a, b) {
    if (a === null || a === undefined) return b === null || b === undefined;
    if (b === null || b === undefined) return false;
    if (typeof a === 'number' || typeof b === 'number') return Number(a) === Number(b);
    return String(a) === String(b);
}

function cmpCell(a, b) {
    if (a == null && b == null) return 0;
    if (a == null) return -1;
    if (b == null) return 1;
    const na = Number(a);
    const nb = Number(b);
    if (!Number.isNaN(na) && !Number.isNaN(nb) && String(a).trim() !== '' && String(b).trim() !== '') {
        if (na !== nb) return na < nb ? -1 : 1;
    }
    const sa = String(a);
    const sb = String(b);
    return sa < sb ? -1 : sa > sb ? 1 : 0;
}

function parseOrEqSegment(segment) {
    const s = String(segment || '').trim();
    const m = s.match(/^([^.,]+)\.eq\.(.+)$/);
    return m ? { col: m[1], val: m[2] } : null;
}

/**
 * Avalia filtros do QueryBuilder sobre uma linha (dados já “limpos”).
 */
export function rowMatches(row, conditions) {
    for (const c of conditions) {
        if (c.type === 'OR_STR') {
            const parts = String(c.val || '')
                .split(',')
                .map((x) => x.trim())
                .filter(Boolean);
            const ok = parts.some((seg) => {
                const p = parseOrEqSegment(seg);
                if (!p) return false;
                const col = p.col.includes('.') ? p.col.split('.').pop() : p.col;
                return eqCell(row[col], p.val);
            });
            if (!ok) return false;
        } else if (c.type === 'IN') {
            if (!c.val || c.val.length === 0) return false;
            if (!c.val.some((v) => eqCell(row[c.col], v))) return false;
        } else if (c.type === 'IS NOT NULL') {
            const v = row[c.col];
            if (v === null || v === undefined || v === '') return false;
        } else if (c.type === '=') {
            let colName = c.col;
            if (colName.includes('.')) colName = colName.split('.').pop();
            if (!eqCell(row[colName], c.val)) return false;
        } else if (c.type === '>=') {
            let colName = c.col;
            if (colName.includes('.')) colName = colName.split('.').pop();
            if (cmpCell(row[colName], c.val) < 0) return false;
        } else if (c.type === '<=') {
            let colName = c.col;
            if (colName.includes('.')) colName = colName.split('.').pop();
            if (cmpCell(row[colName], c.val) > 0) return false;
        }
    }
    return true;
}

export function compareValues(a, b, desc) {
    const c = cmpCell(a, b);
    return desc ? -c : c;
}
