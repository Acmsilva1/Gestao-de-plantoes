import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const mapping = {
  '001 - PS HOSPITAL VITÓRIA': { name: 'PS Vitória - ES', regional: 'es' },
  '003 - PS VILA VELHA': { name: 'PS Vila Velha - ES', regional: 'es' },
  '013 - PS SIG': { name: 'PS Sig - DF', regional: 'df' },
  '025 - PS BARRA DA TIJUCA': { name: 'PS Barra da Tijuca - RJ', regional: 'rj' },
  '026 - PS BOTAFOGO': { name: 'PS Botafogo - RS', regional: 'rj' },
  '031 - PS GUTIERREZ': { name: 'Anestesista MG', regional: 'mg' },
  '033 - PS PAMPULHA': { name: 'PS Pampulha - MG', regional: 'mg' },
  '039 - PS TAGUATINGA': { name: 'PS Taguatinga - DF', regional: 'df' },
  '045 - PS CAMPO GRANDE': { name: 'PS Campo grande - RJ', regional: 'rj' }
};

async function fix() {
    try {
        console.log('--- Iniciando correção de nomes na tabela historico_predicao ---');
        
        for (const [oldName, info] of Object.entries(mapping)) {
            console.log(`Atualizando histórico: ${oldName} -> ${info.name} (${info.regional})`);
            const { error } = await supabase.from('historico_predicao')
                .update({ unidade: info.name, regional: info.regional })
                .eq('unidade', oldName);
            if (error) console.error(`  - Erro em ${oldName}:`, error.message);
        }

        // Também criar historico para as unidades novas para nao ficarem vazias
        const newUnits = [
          { name: 'UTI Vitória - ES', regional: 'es', copyFrom: 'PS Vitória - ES' },
          { name: 'ENFERMARIA Vitória - ES', regional: 'es', copyFrom: 'PS Vitória - ES' },
          { name: 'PS Vitural - Web', regional: 'web', copyFrom: 'PS Vitória - ES' }
        ];

        for (const u of newUnits) {
            console.log(`Criando histórico para unidade nova: ${u.name} (copiando de ${u.copyFrom})`);
            const { data: sourceData } = await supabase.from('historico_predicao').select('*').eq('unidade', u.copyFrom).limit(500);
            if (sourceData && sourceData.length > 0) {
                const newData = sourceData.map(row => {
                    const { id, ...rest } = row;
                    return { ...rest, unidade: u.name, regional: u.regional };
                });
                const { error } = await supabase.from('historico_predicao').insert(newData);
                if (error) console.error(`  - Erro ao criar histórico para ${u.name}:`, error.message);
            }
        }

        console.log('\n--- Correção de histórico concluída! ---');

    } catch (e) {
        console.error(e);
    }
}
fix();
