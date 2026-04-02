import { dbModel } from '../model/dbModel.js';
import {
    normalizePredictionText,
    normalizePredictionTurno,
    toPredictionIsoDate
} from './PredictionEngine.js';

export class DataTransportService {
    constructor() {
        // No futuro, aqui serão injetados os pools do Oracle e Postgres Prod
        // Por enquanto, usamos o dbModel (Supabase/Postgres) como fonte e destino para testes
    }

    /**
     * Ciclo principal de sincronização incremental.
     * Busca apenas dados novos, limpa os antigos (>365 dias) e "dorme" se não houver novidades.
     */
    async syncSlidingWindow() {
        console.log("[ETL] Verificando novos dados no DB principal...");

        try {
            // 1. Identificar o "Checkpoint" (Última data no banco de destino)
            const localStats = await dbModel.getHistoricalPredictionStats();
            const lastDate = localStats?.maxDate || '2024-01-01';

            console.log(`[ETL] Checkpoint local: ${lastDate}`);

            // 2. EXTRAÇÃO INCREMENTAL
            // Aqui simularíamos a busca do Oracle. Por hora, buscamos do 'historico_tasy' ou similar
            // que atua como nosso "Source de Teste".
            const sourceRows = await dbModel.getHistoricalSourceRows(lastDate);

            if (!sourceRows || sourceRows.length === 0) {
                console.log("[ETL] Nenhuma novidade encontrada. Voltando a dormir.");
                return;
            }

            console.log(`[ETL] Encontradas ${sourceRows.length} novas entradas.`);

            // 3. TRANSFORMAÇÃO (Sanitização e Normalização)
            const rowsToInsert = sourceRows.map(row => {
                const isoDate = toPredictionIsoDate(row.dt_atendimento || row.data || row.data_atendimento);
                return {
                    data: isoDate,
                    turno: normalizePredictionTurno(row.cd_turno || row.turno || row.periodo),
                    demanda: Number(row.nr_atendimentos || row.demanda || row.total_atendimentos || row.atendimento_count || 0),
                    unidade: normalizePredictionText(row.nm_unidade || row.unidade),
                    regional: normalizePredictionText(row.nm_regional || row.regional || 'Geral'),
                    weekday: new Date(`${isoDate}T12:00:00Z`).getUTCDay()
                };
            }).filter(row => row.data && row.turno && row.data > lastDate);

            if (rowsToInsert.length === 0) {
                console.log("[ETL] Dados já processados ou inválidos.");
                return;
            }

            // 4. CARGA (Upsert no Postgres Local)
            await dbModel.upsertHistoricalPrediction(rowsToInsert);

            // 5. FAXINA (Manter apenas os últimos 365 dias para o Analista)
            const deletedCount = await dbModel.pruneOldHistoricalPrediction(365);
            
            console.log(`[ETL] Sucesso: ${rowsToInsert.length} linhas importadas. ${deletedCount} linhas antigas removidas.`);

        } catch (err) {
            console.error("[ETL] Erro crítico no transporte de dados:", err);
        }
    }
}

export const dataTransport = new DataTransportService();
