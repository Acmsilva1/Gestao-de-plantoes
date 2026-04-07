import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootEnvPath = path.resolve(__dirname, '..', '.env');

dotenv.config({ path: rootEnvPath, override: true });
dotenv.config({ override: true }); // Carregamento padrão também com override
// Triggering restart after port change

export const requiredEnvVars = ['SUPABASE_URL', 'SUPABASE_KEY'];

export const getMissingEnvVars = () =>
    requiredEnvVars.filter((envVar) => !process.env[envVar]);

export const hasDatabaseEnv = () => getMissingEnvVars().length === 0;

export const env = {
    port: Number(process.env.PORT || 3000),
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseKey: process.env.SUPABASE_KEY,
    enableRedis: process.env.ENABLE_REDIS === 'true' || process.env.ENABLE_REDIS === '1',
    redisUrl: process.env.REDIS_URL || '',
    redisPrefix: process.env.REDIS_PREFIX || 'gdp',
    escalaEditorCacheTtlSec: Number(process.env.ESCALA_EDITOR_CACHE_TTL_SEC || 45),
    enableQueue: process.env.ENABLE_QUEUE === 'true' || process.env.ENABLE_QUEUE === '1',
    rabbitMqUrl: process.env.RABBITMQ_URL || '',
    rabbitMqExchange: process.env.RABBITMQ_EXCHANGE || 'gestao.events',
    disablePredictorScheduler:
        process.env.DISABLE_PREDICTOR_SCHEDULER === 'true' || process.env.DISABLE_PREDICTOR_SCHEDULER === '1'
};
