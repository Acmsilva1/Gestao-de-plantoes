import { pathToFileURL } from 'url';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..', '..');
const dbUrl = pathToFileURL(path.join(root, 'api', 'data', 'local', 'db.js')).href;

async function check() {
    try {
        const { getCsvStore } = await import(dbUrl);
        const store = await getCsvStore();

        console.log('--- Unidades (amostra) ---');
        console.table(store.select('unidades', [], ['nome ASC'], 20));

        console.log('\n--- historico_tasy (amostra) ---');
        console.table(store.select('historico_tasy', [], [], 10));
    } catch (err) {
        console.error('Erro:', err);
    }
}

check();
