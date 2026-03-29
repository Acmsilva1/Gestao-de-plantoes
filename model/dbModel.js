import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

export const dbModel = {
    async getHistory(unidadeId) {
        const { data } = await supabase.from('tasy_raw_history').select('*').eq('unidade_id', unidadeId);
        return data;
    },
    async getAllOpenShifts() {
        const { data } = await supabase.from('disponibilidade').select('*, unidades(nome)').eq('status', 'ABERTO');
        return data;
    },
    async updateAvailability(unidadeId, count) {
        await supabase.from('disponibilidade').update({ vagas_totais: count }).eq('unidade_id', unidadeId);
    }
};
