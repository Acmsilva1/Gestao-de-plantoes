/**
 * Exporta o estado em memória (orquestrador CSV + seed) para ./dblocal.
 * - Um CSV por tabela
 * - vw_*.csv a partir de joins em JS (sem SQLite)
 *
 * Uso (na raiz do repositório): npm run dblocal:export
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { VIEW_EXPORT_BUILDERS } from '../lib/dblocalCsv/viewExports.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');
const outDir = path.join(repoRoot, 'dblocal');

const dbModuleUrl = pathToFileURL(path.join(repoRoot, 'backend', 'data', 'local', 'db.js')).href;
const { getCsvStore } = await import(dbModuleUrl);

function csvEscape(value) {
    if (value === null || value === undefined) return '';
    const s = String(value);
    if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
}

function rowsToCsv(rows, columns = null) {
    const cols = columns?.length ? columns : rows.length ? Object.keys(rows[0]) : [];
    if (!cols.length) return '\ufeff';
    const header = cols.map(csvEscape).join(',');
    if (!rows.length) return `\ufeff${header}\r\n`;
    const lines = rows.map((row) => cols.map((c) => csvEscape(row[c])).join(','));
    return `\ufeff${header}\r\n${lines.join('\r\n')}\r\n`;
}

async function main() {
    fs.mkdirSync(outDir, { recursive: true });
    const store = await getCsvStore();

    for (const name of store.listLoadedTables()) {
        const snap = store.getExportSnapshot(name);
        const filePath = path.join(outDir, `${name}.csv`);
        fs.writeFileSync(filePath, rowsToCsv(snap.rows, snap.columns), 'utf8');
        console.log(`Wrote ${name}.csv (${snap.rows.length} rows)`);
    }

    for (const [slug, builder] of Object.entries(VIEW_EXPORT_BUILDERS)) {
        const rows = builder(store);
        const filePath = path.join(outDir, `vw_${slug}.csv`);
        fs.writeFileSync(filePath, rowsToCsv(rows), 'utf8');
        console.log(`Wrote vw_${slug}.csv (${rows.length} rows)`);
    }

    console.log(`\nExport concluído em: ${outDir}`);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
