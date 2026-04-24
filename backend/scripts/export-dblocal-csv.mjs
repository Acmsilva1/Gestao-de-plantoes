/**
 * Exporta o estado em memória (orquestrador + seed) para ./dblocal em Parquet.
 * - Um `.parquet` por tabela base
 * - `vw_*.parquet` a partir de joins em JS (VIEW_EXPORT_BUILDERS)
 *
 * Uso (na raiz do repositório): npm run dblocal:export
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { VIEW_EXPORT_BUILDERS } from '../lib/dblocalCsv/viewExports.js';
import { writeParquetFromPack } from '../lib/dblocalCsv/readParquetDuck.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');
const outDir = path.join(repoRoot, 'dblocal');

const dbModuleUrl = pathToFileURL(path.join(repoRoot, 'backend', 'data', 'local', 'db.js')).href;
const { getCsvStore } = await import(dbModuleUrl);

async function main() {
    fs.mkdirSync(outDir, { recursive: true });
    const store = await getCsvStore();

    for (const name of store.listLoadedTables()) {
        const snap = store.getExportSnapshot(name);
        const filePath = path.join(outDir, `${name}.parquet`);
        await writeParquetFromPack(filePath, snap.columns, snap.rows);
        console.log(`Wrote ${name}.parquet (${snap.rows.length} rows)`);
    }

    for (const [slug, builder] of Object.entries(VIEW_EXPORT_BUILDERS)) {
        const rows = builder(store);
        const filePath = path.join(outDir, `vw_${slug}.parquet`);
        const cols = rows.length ? Object.keys(rows[0]) : [];
        await writeParquetFromPack(filePath, cols, rows);
        console.log(`Wrote vw_${slug}.parquet (${rows.length} rows)`);
    }

    console.log(`\nExport concluído em: ${outDir}`);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
