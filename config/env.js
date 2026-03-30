import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootEnvPath = path.resolve(__dirname, '..', '.env');

dotenv.config({ path: rootEnvPath });
dotenv.config();

export const requiredEnvVars = ['SUPABASE_URL', 'SUPABASE_KEY'];

export const getMissingEnvVars = () =>
    requiredEnvVars.filter((envVar) => !process.env[envVar]);

export const hasDatabaseEnv = () => getMissingEnvVars().length === 0;

export const env = {
    port: Number(process.env.PORT || 3000),
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseKey: process.env.SUPABASE_KEY,
    disablePredictorScheduler:
        process.env.DISABLE_PREDICTOR_SCHEDULER === 'true' || process.env.DISABLE_PREDICTOR_SCHEDULER === '1'
};
