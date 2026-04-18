import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(backendRoot, '..');
const rootEnvPath = path.resolve(repoRoot, '.env');

dotenv.config({ path: rootEnvPath, override: true });
dotenv.config({ override: true }); // Carregamento padrão também com override
// Triggering restart after port change

export const requiredEnvVars = [];

export const getMissingEnvVars = () =>
    requiredEnvVars.filter((envVar) => !process.env[envVar]);

export const hasDatabaseEnv = () => true;

export const env = {
    /** GDP_API_PORT prioriza modo paralelo (ex.: .bat com porta distinta do Hospital BI). */
    port: Number(process.env.GDP_API_PORT || process.env.PORT || 3000),
    /** Repositório raiz (pasta que contém `dblocal/`). */
    repoRoot,
    /** Pasta dos CSVs de tabela (ignora `vw_*.csv` no carregamento). */
    dblocalCsvDir: process.env.GDP_DBLLOCAL_CSV_DIR
        ? path.resolve(process.env.GDP_DBLLOCAL_CSV_DIR)
        : path.join(repoRoot, 'dblocal'),
    enableRedis: process.env.ENABLE_REDIS === 'true' || process.env.ENABLE_REDIS === '1',
    redisUrl: process.env.REDIS_URL || '',
    redisPrefix: process.env.REDIS_PREFIX || 'gdp',
    escalaEditorCacheTtlSec: Number(process.env.ESCALA_EDITOR_CACHE_TTL_SEC || 45),
    enableQueue: process.env.ENABLE_QUEUE === 'true' || process.env.ENABLE_QUEUE === '1',
    rabbitMqUrl: process.env.RABBITMQ_URL || '',
    rabbitMqExchange: process.env.RABBITMQ_EXCHANGE || 'gestao.events',
    disablePredictorScheduler:
        process.env.DISABLE_PREDICTOR_SCHEDULER === 'true' || process.env.DISABLE_PREDICTOR_SCHEDULER === '1',
    /**
     * Demonstração: cliente local CSV só permite SELECT (sem insert/update/delete/upsert/rpc de escrita).
     * Defina GDP_DEMO_READ_ONLY=false para permitir mutações em memória.
     */
    demoReadOnly: process.env.GDP_DEMO_READ_ONLY !== 'false'
};
