import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env.js';

async function createPipelineTable() {
    console.log('--- Criando Tabela de Status da Pipeline ---');
    const supabase = createClient(env.supabaseUrl, env.supabaseKey);

    // SQL a ser executado manualmente ou via RPC caso disponível. 
    // Como estamos em ambiente de dev, vou tentar um insert inicial para testar a existência.
    try {
        const { error } = await supabase.from('pipeline_status').select('id').limit(1);
        
        if (error && error.code === '42P01') {
            console.log('Tabela não encontrada. Por favor, execute este SQL no console do Supabase:');
            console.log(`
            CREATE TABLE IF NOT EXISTS pipeline_status (
                id TEXT PRIMARY KEY, -- 'main_etl'
                last_run TIMESTAMPTZ DEFAULT NOW(),
                status TEXT NOT NULL, -- 'SUCCESS', 'ERROR', 'RUNNING'
                last_checkpoint DATE,
                rows_processed INT DEFAULT 0,
                error_message TEXT,
                updated_at TIMESTAMPTZ DEFAULT NOW()
            );
            `);
        } else {
            console.log('Tabela pipeline_status já existe ou está acessível.');
        }
    } catch (err) {
        console.error('Erro ao verificar tabela:', err.message);
    }
}

createPipelineTable();
