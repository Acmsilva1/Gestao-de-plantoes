import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function check() {
    try {
        const { data: units } = await supabase.from('unidades').select('nome');
        const { data: predictions } = await supabase.from('dados_predicao').select('unidade, regional').limit(20);

        console.log('--- Current Units ---');
        console.log(units.map(u => u.nome));
        
        console.log('\n--- Prediction Samples ---');
        console.log(predictions);

        const uNames = new Set(units.map(u => u.nome));
        const pNames = new Set(predictions.map(p => p.unidade));

        console.log('\n--- Analysis ---');
        let matches = 0;
        pNames.forEach(pn => {
            if (uNames.has(pn)) matches++;
        });
        console.log(`Matching units in first 20 prediction rows: ${matches} out of ${pNames.size}`);

    } catch (e) {
        console.error(e);
    }
}
check();
