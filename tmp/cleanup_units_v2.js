import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function cleanupAllRedundantUnits() {
    try {
        console.log('--- Iniciando limpeza completa de unidades redundantes ---');
        const { data: units } = await supabase.from('unidades').select('*');
        
        // 1. Unidades com [DUP-] (já limpas em boa parte, mas vamos garantir)
        const dupUnits = units.filter(u => u.nome.includes('[DUP-'));
        // 2. Unidades com prefixo 0xx -
        const catalogUnits = units.filter(u => u.nome.match(/^0\d+ - /));
        
        const toRemove = [...dupUnits, ...catalogUnits];
        console.log(`Encontradas ${toRemove.length} unidades redundantes para remoção.`);
        
        for (const unit of toRemove) {
            console.log(`\nRemovendo unidade: ${unit.nome} (${unit.id})`);
            
            // Remover gestores
            const { data: managers } = await supabase.from('gestores').select('id').eq('unidade_id', unit.id);
            if (managers?.length > 0) {
                for (const m of managers) {
                    await supabase.from('gestores').delete().eq('id', m.id);
                }
            }
            
            // Remover unidade
            const { error } = await supabase.from('unidades').delete().eq('id', unit.id);
            if (error) console.error(`  - Erro: ${error.message}`);
            else console.log(`  - Removida.`);
        }
        console.log('\n--- Limpeza concluída! ---');
    } catch (error) {
        console.error(error);
    }
}
cleanupAllRedundantUnits();
