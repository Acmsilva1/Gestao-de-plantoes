import { dbModel } from '../model/dbModel.js';
import {
    LOOKBACK_DAYS,
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
            await dbModel.updatePipelineStatus({ status: 'RUNNING', last_run: new Date().toISOString() });

            // 0. Carregar unidades atuais para mapeamento de nome
            const actualUnits = await dbModel.getUnits();
            const unitNameToActual = new Map();
            actualUnits.forEach(u => {
                unitNameToActual.set(normalizePredictionText(u.nome), u.nome);
            });
            // 1. Identificar o "Checkpoint" (Última data no banco de destino)
            const localStats = await dbModel.getHistoricalPredictionStats();
            const lastDate = localStats?.maxDate || '2024-01-01';

            console.log(`[ETL] Checkpoint local: ${lastDate}`);

            // 2. EXTRAÇÃO INCREMENTAL
            const sourceRows = await dbModel.getHistoricalSourceRows(lastDate);

            if (!sourceRows || sourceRows.length === 0) {
                console.log("[ETL] Nenhuma novidade encontrada.");
                await dbModel.updatePipelineStatus({ status: 'SUCCESS', last_checkpoint: lastDate, rows_processed: 0 });
                return;
            }

            // 3. TRANSFORMAÇÃO
            const rowsToInsert = sourceRows.map(row => {
                const isoDate = toPredictionIsoDate(row.dt_atendimento || row.data || row.data_atendimento);
                const rawName = normalizePredictionText(row.nm_unidade || row.unidade);
                const mappedName = unitNameToActual.get(rawName) || rawName;

                return {
                    data: isoDate,
                    turno: normalizePredictionTurno(row.cd_turno || row.turno || row.periodo),
                    demanda: Number(row.nr_atendimentos || row.demanda || row.total_atendimentos || row.atendimento_count || 0),
                    unidade: mappedName,
                    regional: normalizePredictionText(row.nm_regional || row.regional || 'Geral'),
                    weekday: new Date(`${isoDate}T12:00:00Z`).getUTCDay()
                };
            }).filter(row => row.data && row.turno && row.data > lastDate);

            if (rowsToInsert.length === 0) {
                await dbModel.updatePipelineStatus({ status: 'SUCCESS', last_checkpoint: lastDate, rows_processed: 0 });
                return;
            }

            // 4. CARGA
            await dbModel.upsertHistoricalPrediction(rowsToInsert);

            // 5. FAXINA
            const deletedCount = await dbModel.pruneOldHistoricalPrediction(LOOKBACK_DAYS);
            
            await dbModel.updatePipelineStatus({ 
                status: 'SUCCESS', 
                last_checkpoint: rowsToInsert[rowsToInsert.length - 1].data, 
                rows_processed: rowsToInsert.length,
                error_message: null
            });

            console.log(`[ETL] Sucesso: ${rowsToInsert.length} linhas importadas.`);

        } catch (err) {
            console.error("[ETL] Erro crítico:", err);
            await dbModel.updatePipelineStatus({ 
                status: 'ERROR', 
                error_message: err.message,
                last_run: new Date().toISOString() 
            });
        }
    }
}

export const dataTransport = new DataTransportService();
