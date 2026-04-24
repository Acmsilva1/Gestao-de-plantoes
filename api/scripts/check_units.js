import { pathToFileURL } from 'url';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..', '..');
const dbUrl = pathToFileURL(path.join(root, 'api', 'data', 'local', 'db.js')).href;

async function check() {
    const { getCsvStore } = await import(dbUrl);
    const store = await getCsvStore();
    const units = store.select('unidades', [], ['nome ASC'], 20);
    console.table(units.map((u) => ({ id: u.id, nome: u.nome })));
}

check().catch(console.error);
