import fs from 'fs';
import path from 'path';
import { parseCsvDocument } from './parseCsv.js';
import { coerceCell } from './coerce.js';
import { rowMatches, compareValues } from './match.js';

/** Ordem sugerida para export / dependências lógicas. */
export const TABLE_ORDER = [
    'perfis',
    'unidades',
    'medicos',
    'gestores',
    'medico_acessos_unidade',
    'historico_tasy',
    'historico_tasy_ml',
    'dados_predicao',
    'tasy_raw_history',
    'escala_templates',
    'escala_template_slots',
    'disponibilidade',
    'escala',
    'escala_mes_publicacao',
    'agendamentos',
    'reserva_holds',
    'pedidos_troca_escala',
    'pedidos_cancelamento_escala',
    'pedidos_assumir_escala'
];

/**
 * Orquestrador CSV: única fonte de dados em memória (sem SQLite).
 * Lê `dblocal/*.csv` (ignora `vw_*`). Mutável para insert/update/delete da API.
 */
export class DblocalCsvOrchestrator {
    constructor() {
        /** @type {Map<string, { columns: string[], rows: Record<string, unknown>[] }>} */
        this.tables = new Map();
        this.loadedDir = null;
    }

    clone(obj) {
        return structuredClone(obj);
    }

    _ensurePack(table) {
        if (!this.tables.has(table)) {
            this.tables.set(table, { columns: [], rows: [] });
        }
        return this.tables.get(table);
    }

    _ensureColumns(pack, obj) {
        for (const k of Object.keys(obj)) {
            if (k && !pack.columns.includes(k)) pack.columns.push(k);
        }
    }

    hasTable(table) {
        return this.tables.has(table);
    }

    /**
     * @param {string} dir caminho absoluto da pasta dblocal
     */
    async loadFromDirectory(dir) {
        this.tables = new Map();
        this.loadedDir = dir;

        if (!fs.existsSync(dir)) {
            console.warn(`[dblocalCsv] Pasta inexistente: ${dir}`);
            return this;
        }

        const files = fs.readdirSync(dir).filter((f) => f.endsWith('.csv') && !f.startsWith('vw_'));

        for (const file of files) {
            const tableName = path.basename(file, '.csv');
            const full = path.join(dir, file);
            const raw = fs.readFileSync(full, 'utf8');
            const matrix = parseCsvDocument(raw);
            if (!matrix.length) continue;

            const headers = matrix[0].map((h) => String(h || '').trim()).filter(Boolean);
            const dataRows = matrix.slice(1);
            const objects = dataRows.map((cells) => {
                const obj = {};
                headers.forEach((h, idx) => {
                    const cell = cells[idx] !== undefined ? cells[idx] : '';
                    obj[h] = coerceCell(cell, h);
                });
                return obj;
            });
            this.tables.set(tableName, { columns: [...headers], rows: objects });
        }

        return this;
    }

    listLoadedTables() {
        const keys = [...this.tables.keys()];
        const rest = keys.filter((k) => !TABLE_ORDER.includes(k)).sort();
        return [...TABLE_ORDER.filter((k) => keys.includes(k)), ...rest];
    }

    /** Referência mutável às linhas (uso interno / seed). */
    getMutableRows(table) {
        return this._ensurePack(table).rows;
    }

    countAll(table) {
        return this._ensurePack(table).rows.length;
    }

    select(table, conditions, orderBys, limitNum) {
        const pack = this.tables.get(table);
        if (!pack) return [];
        let rows = pack.rows.map((r) => this.clone(r)).filter((r) => rowMatches(r, conditions));
        for (const ob of orderBys) {
            const s = String(ob).trim();
            const m = s.match(/^(\S+)\s+(ASC|DESC)$/i);
            const col = m ? m[1] : s.split(/\s+/)[0];
            const desc = m && m[2].toUpperCase() === 'DESC';
            rows = [...rows].sort((a, b) => compareValues(a[col], b[col], desc));
        }
        if (limitNum != null && limitNum > 0) {
            rows = rows.slice(0, limitNum);
        }
        return rows;
    }

    findFirstMutable(table, predFn) {
        const pack = this.tables.get(table);
        if (!pack) return null;
        return pack.rows.find(predFn) ?? null;
    }

    insert(table, row) {
        const pack = this._ensurePack(table);
        const r = { ...row };
        this._ensureColumns(pack, r);
        pack.rows.push(r);
        return this.clone(r);
    }

    update(table, conditions, patch) {
        const pack = this._ensurePack(table);
        let n = 0;
        for (const r of pack.rows) {
            if (rowMatches(r, conditions)) {
                Object.assign(r, patch);
                this._ensureColumns(pack, r);
                n += 1;
            }
        }
        return n;
    }

    /** Remove linhas que satisfazem o predicado; devolve clones removidos. */
    removeWhereFn(table, predFn) {
        const pack = this.tables.get(table);
        if (!pack) return [];
        const removed = [];
        pack.rows = pack.rows.filter((r) => {
            if (predFn(r)) {
                removed.push(this.clone(r));
                return false;
            }
            return true;
        });
        return removed;
    }

    delete(table, conditions) {
        const removed = [];
        const pack = this.tables.get(table);
        if (!pack) return removed;
        pack.rows = pack.rows.filter((r) => {
            if (rowMatches(r, conditions)) {
                removed.push(this.clone(r));
                return false;
            }
            return true;
        });
        return removed;
    }

    /**
     * Upsert por chave composta ou simples (ex.: id, ou "unidade_id,mes").
     */
    upsert(table, row, conflictFieldsStr) {
        const pack = this._ensurePack(table);
        const cols = String(conflictFieldsStr || 'id')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
        const pred = (r) => cols.every((c) => String(r[c]) === String(row[c]));
        const idx = pack.rows.findIndex(pred);
        const merged = { ...row };
        if (idx >= 0) {
            Object.assign(pack.rows[idx], merged);
            this._ensureColumns(pack, pack.rows[idx]);
            return this.clone(pack.rows[idx]);
        }
        this._ensureColumns(pack, merged);
        pack.rows.push(merged);
        return this.clone(merged);
    }

    addColumnIfMissing(table, col, defaultVal = null) {
        const pack = this._ensurePack(table);
        if (pack.columns.includes(col)) return;
        pack.columns.push(col);
        for (const r of pack.rows) {
            if (!(col in r)) r[col] = defaultVal;
        }
    }

    /** Snapshot para export CSV (linhas clonadas). */
    getExportSnapshot(table) {
        const pack = this.tables.get(table);
        if (!pack) {
            return { columns: [], rows: [] };
        }
        const cols =
            pack.columns.length > 0
                ? [...pack.columns]
                : pack.rows[0]
                  ? Object.keys(pack.rows[0])
                  : [];
        return { columns: cols, rows: pack.rows.map((r) => this.clone(r)) };
    }
}
