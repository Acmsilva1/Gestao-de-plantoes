import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { env } from '../../config/env.js';
import { runLocalSyntheticSeedIntoStore } from './seed.js';
import { DblocalCsvOrchestrator } from '../../lib/dblocalCsv/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {DblocalCsvOrchestrator | null} */
let csvStore = null;

export function getDblocalCsvOrchestrator() {
    return csvStore;
}

export function generateId() {
    return crypto.randomUUID();
}

/**
 * Orquestrador CSV em memória (sem SQLite). Primeira chamada carrega `dblocal/` + seed sintético.
 */
export async function getCsvStore() {
    if (csvStore) {
        return csvStore;
    }

    csvStore = new DblocalCsvOrchestrator();
    await csvStore.loadFromDirectory(env.dblocalCsvDir);
    try {
        await runLocalSyntheticSeedIntoStore(csvStore);
    } catch (err) {
        console.warn('[gdp-db] Seed sintético local ignorado:', err?.message || err);
    }

    return csvStore;
}

/** @deprecated — use getCsvStore() */
export async function getDb() {
    return getCsvStore();
}

export async function resetLocalDbSingleton() {
    csvStore = null;
}
