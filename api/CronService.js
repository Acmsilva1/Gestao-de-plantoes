import { dataTransport } from './DataTransportService.js';
import { calibrationService } from './CalibrationService.js';
import { recalculateAnalyticalPredictionV2 } from './AnalyticalPredictionServiceV2.js';

/**
 * Serviço de Agendamento (Cron)
 * Orquestra as tarefas de segundo plano da aplicação.
 */
class CronService {
    constructor() {
        this.jobs = [];
    }

    /**
     * Inicializa todos os agendamentos configurados.
     */
    start() {
        console.log("[Cron] Orquestrador de tarefas iniciado.");

        // 1. Sincronização de Dados (Transporte Incremental)
        // Agendamento: De hora em hora (0 * * * *)
        const syncJob = cron.schedule('0 * * * *', async () => {
            const agora = new Date().toLocaleTimeString('pt-BR');
            console.log(`[Cron] Executando transporte de dados horário às ${agora}...`);
            
            await dataTransport.syncSlidingWindow();
            
            console.log("[Cron] Ciclo de atualização finalizado.");
        }, {
            scheduled: true,
            timezone: "America/Sao_Paulo"
        });

        this.jobs.push(syncJob);

        // 2. Auto-Calibração IA (Tendências Semanais)
        // Agendamento: Domingos às 01:00 (0 1 * * 0)
        const calibrationJob = cron.schedule('0 1 * * 0', async () => {
            console.log("[Cron] Iniciando ciclo semanal de Auto-Calibração IA...");
            
            await calibrationService.autoCalibrate();
            
            // Após calibrar, recalculamos a predição atual para usar os novos multiplicadores
            await recalculateAnalyticalPredictionV2();
            
            console.log("[Cron] Calibração e recálculo finalizados.");
        }, {
            scheduled: true,
            timezone: "America/Sao_Paulo"
        });

        this.jobs.push(calibrationJob);
        
        // Execução imediata para conferir se há novos dados no startup (opcional, mas bom para debug)
        // dataTransport.syncSlidingWindow();
        // calibrationService.autoCalibrate();
    }

    /**
     * Interrompe todos os jobs ativos.
     */
    stop() {
        this.jobs.forEach(job => job.stop());
        this.jobs = [];
        console.log("[Cron] Orquestrador de tarefas parado.");
    }
}

export const cronService = new CronService();
