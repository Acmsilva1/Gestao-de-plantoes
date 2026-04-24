/**
 * Parser CSV (RFC 4180) — biblioteca local dblocalCsv.
 */
export function parseCsvDocument(text) {
    const src = String(text || '')
        .replace(/^\ufeff/, '')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n');
    if (!src.trim()) return [];

    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;
    let i = 0;

    while (i < src.length) {
        const c = src[i];
        if (inQuotes) {
            if (c === '"' && src[i + 1] === '"') {
                field += '"';
                i += 2;
                continue;
            }
            if (c === '"') {
                inQuotes = false;
                i += 1;
                continue;
            }
            field += c;
            i += 1;
            continue;
        }
        if (c === '"') {
            inQuotes = true;
            i += 1;
            continue;
        }
        if (c === ',') {
            row.push(field);
            field = '';
            i += 1;
            continue;
        }
        if (c === '\n') {
            row.push(field);
            rows.push(row);
            row = [];
            field = '';
            i += 1;
            continue;
        }
        field += c;
        i += 1;
    }

    row.push(field);
    if (!(row.length === 1 && row[0] === '')) {
        rows.push(row);
    }
    return rows;
}
