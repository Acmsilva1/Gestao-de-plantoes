import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function checkCatalogUnits() {
    const { data: units } = await supabase.from('unidades').select('*');
    const catalogUnits = units.filter(u => u.nome.match(/^0\d+ - /));
    
    console.log(`Encontradas ${catalogUnits.length} unidades com prefixo 0xx.`);
    
    for (const unit of catalogUnits) {
        console.log(`\nUnidade: ${unit.nome} (${unit.id})`);
        const tables = ['medicos', 'escala', 'disponibilidade', 'agendamentos', 'tasy_raw_history'];
        for (const table of tables) {
            const col = table === 'medicos' ? 'unidade_fixa_id' : 'unidade_id';
            const { count } = await supabase.from(table).select('*', { count: 'exact', head: true }).eq(col, unit.id);
            if (count > 0) console.log(`  - ${table}: ${count} registros`);
        }
    }
}
checkCatalogUnits();
