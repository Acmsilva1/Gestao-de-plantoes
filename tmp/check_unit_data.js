import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function checkUnitData() {
    try {
        const { data: units } = await supabase.from('unidades').select('*');
        const dupUnits = units.filter(u => u.nome.includes('[DUP-'));
        
        console.log(`Encontradas ${dupUnits.length} unidades duplicadas.`);
        
        const tablesToCheck = ['medicos', 'escala', 'disponibilidade', 'pedidos_troca_escala', 'pedidos_assumir_escala', 'pedidos_cancelamento_escala', 'tasy_raw_history'];
        
        for (const unit of dupUnits) {
            console.log(`\nVerificando unidade: ${unit.nome} (${unit.id})`);
            
            for (const table of tablesToCheck) {
                if (table === 'medicos') {
                   const { count } = await supabase.from('medicos').select('*', { count: 'exact', head: true }).eq('unidade_fixa_id', unit.id);
                   if (count > 0) console.log(`  - ${table}: ${count} registros`);
                } else {
                   const { count } = await supabase.from(table).select('*', { count: 'exact', head: true }).eq('unidade_id', unit.id);
                   if (count > 0) console.log(`  - ${table}: ${count} registros`);
                }
            }
        }

    } catch (error) {
        console.error('Erro:', error);
    }
}

checkUnitData();
