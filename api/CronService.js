import cron from 'node-cron';
import { dataTransport } from './DataTransportService.js';

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
        // Agendamento: 06:00 e 18:00 (0 6,18 * * *)
        const syncJob = cron.schedule('0 6,18 * * *', async () => {
            const agora = new Date().toLocaleTimeString('pt-BR');
            console.log(`[Cron] Executando transporte de dados às ${agora}...`);
            
            await dataTransport.syncSlidingWindow();
            
            console.log("[Cron] Ciclo de atualização finalizado.");
        }, {
            scheduled: true,
            timezone: "America/Sao_Paulo"
        });

        this.jobs.push(syncJob);
        
        // Execução imediata para conferir se há novos dados no startup (opcional, mas bom para debug)
        // dataTransport.syncSlidingWindow();
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
