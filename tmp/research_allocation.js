import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function research() {
    try {
        const { count: doctorsCount } = await supabase.from('medicos').select('*', { count: 'exact', head: true });
        const { data: units } = await supabase.from('unidades').select('id, nome');
        const { count: availabilityCount } = await supabase.from('disponibilidade')
            .select('*', { count: 'exact', head: true })
            .gte('data_plantao', '2026-04-01')
            .lte('data_plantao', '2026-05-31');

        console.log('--- Research Results ---');
        console.log('Total Doctors:', doctorsCount);
        console.log('Total Units:', units.length);
        console.log('Availability records (Apr-May):', availabilityCount);

        if (availabilityCount > 0) {
            const { data: samples } = await supabase.from('disponibilidade')
                .select('vagas_totais')
                .gte('data_plantao', '2026-04-01')
                .limit(5);
            console.log('Sample vagas_totais:', samples.map(s => s.vagas_totais));
        }

    } catch (e) {
        console.error(e);
    }
}
research();
