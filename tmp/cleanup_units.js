import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function cleanupUnits() {
    try {
        console.log('--- Iniciando limpeza de unidades duplicadas ---');
        
        const { data: units } = await supabase.from('unidades').select('*');
        const dupUnits = units.filter(u => u.nome.includes('[DUP-'));
        
        console.log(`Encontradas ${dupUnits.length} unidades duplicadas para remoção.`);
        
        for (const unit of dupUnits) {
            console.log(`\nRemovendo unidade: ${unit.nome} (${unit.id})`);
            
            // 1. Remover gestores associados a esta unidade duplicada
            const { data: managers, error: mError } = await supabase.from('gestores').select('id').eq('unidade_id', unit.id);
            if (managers?.length > 0) {
                console.log(`  - Removendo ${managers.length} gestores associados...`);
                for (const m of managers) {
                    await supabase.from('gestores').delete().eq('id', m.id);
                }
            }
            
            // 2. Remover a própria unidade
            const { error: uError } = await supabase.from('unidades').delete().eq('id', unit.id);
            if (uError) {
                console.error(`  - Erro ao remover unidade ${unit.id}: ${uError.message}`);
            } else {
                console.log(`  - Unidade removida com sucesso.`);
            }
        }

        console.log('\n--- Limpeza de unidades concluída! ---');

    } catch (error) {
        console.error('Erro durante a limpeza:', error);
    }
}

cleanupUnits();
