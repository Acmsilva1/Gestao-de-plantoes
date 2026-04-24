import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import duckdb from 'duckdb';

export function quotePathForReadParquet(absPath) {
    const normalized = path.resolve(absPath).replace(/\\/g, '/');
    return `'${normalized.replace(/'/g, "''")}'`;
}

function normalizeValue(v) {
    if (typeof v === 'bigint') {
        const n = Number(v);
        return Number.isSafeInteger(n) ? n : v.toString();
    }
    if (v instanceof Date) return v.toISOString();
    return v;
}

/** Linhas vindas do DuckDB no mesmo espírito do fluxo CSV (sem BigInt no JSON). */
export function normalizeDuckRow(row) {
    const out = {};
    for (const [k, v] of Object.entries(row)) {
        out[k] = v === null || v === undefined ? v : normalizeValue(v);
    }
    return out;
}

/** @param {unknown} conn conexão duckdb */
export function readParquetWithConnection(conn, absPath) {
    const sql = `SELECT * FROM read_parquet(${quotePathForReadParquet(absPath)})`;
    return new Promise((resolve, reject) => {
        conn.all(sql, (err, rows) => {
            if (err) reject(err);
            else resolve((rows || []).map(normalizeDuckRow));
        });
    });
}

/** Uma conexão DuckDB para vários `read_parquet`. */
export function openDuckParquetSession() {
    return new Promise((resolve, reject) => {
        try {
            const db = new duckdb.Database(':memory:');
            const conn = db.connect();
            resolve({
                conn,
                close: () =>
                    new Promise((res, rej) => {
                        db.close((e) => (e ? rej(e) : res()));
                    })
            });
        } catch (e) {
            reject(e);
        }
    });
}

function rowToJsonSafe(row, columnOrder) {
    const keys = columnOrder?.length ? columnOrder : Object.keys(row || {});
    const o = {};
    for (const k of keys) {
        if (!k) continue;
        const v = row[k];
        if (v === undefined) o[k] = null;
        else if (v instanceof Date) o[k] = v.toISOString();
        else if (typeof v === 'bigint') {
            const n = Number(v);
            o[k] = Number.isSafeInteger(n) ? n : v.toString();
        } else o[k] = v;
    }
    return o;
}

/**
 * Grava uma tabela em disco como Parquet (via DuckDB + JSON temporário).
 * @param {string} absPath destino `.parquet`
 * @param {string[]} columns ordem preferida de colunas (pode ser vazio → chaves da primeira linha)
 * @param {Record<string, unknown>[]} rows
 */
export async function writeParquetFromPack(absPath, columns, rows) {
    const list = rows || [];
    const colOrder = columns?.length ? columns : list[0] ? Object.keys(list[0]) : [];
    const safeRows = list.map((r) => rowToJsonSafe(r, colOrder));

    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    const tmpJson = path.join(os.tmpdir(), `gdp-parquet-${crypto.randomBytes(12).toString('hex')}.json`);
    const tmpParquet = `${absPath}.writing.${crypto.randomBytes(8).toString('hex')}.parquet`;

    try {
        if (safeRows.length > 0) {
            fs.writeFileSync(tmpJson, JSON.stringify(safeRows), 'utf8');
            const db = new duckdb.Database(':memory:');
            const conn = db.connect();
            const inPath = quotePathForReadParquet(tmpJson);
            const outPath = quotePathForReadParquet(tmpParquet);
            await new Promise((resolve, reject) => {
                conn.run(
                    `COPY (SELECT * FROM read_json_auto(${inPath})) TO ${outPath} (FORMAT PARQUET)`,
                    (err) => (err ? reject(err) : resolve())
                );
            });
            await new Promise((res, rej) => db.close((e) => (e ? rej(e) : res())));
        } else if (fs.existsSync(absPath)) {
            const db = new duckdb.Database(':memory:');
            const conn = db.connect();
            const src = quotePathForReadParquet(absPath);
            const outPath = quotePathForReadParquet(tmpParquet);
            await new Promise((resolve, reject) => {
                conn.run(
                    `COPY (SELECT * FROM read_parquet(${src}) WHERE FALSE) TO ${outPath} (FORMAT PARQUET)`,
                    (err) => (err ? reject(err) : resolve())
                );
            });
            await new Promise((res, rej) => db.close((e) => (e ? rej(e) : res())));
        } else {
            return;
        }

        if (fs.existsSync(absPath)) fs.unlinkSync(absPath);
        fs.renameSync(tmpParquet, absPath);
    } finally {
        try {
            if (fs.existsSync(tmpJson)) fs.unlinkSync(tmpJson);
        } catch {
            /* ignore */
        }
        try {
            if (fs.existsSync(tmpParquet)) fs.unlinkSync(tmpParquet);
        } catch {
            /* ignore */
        }
    }
}
