import cron from 'node-cron';
import { dataTransport } from './DataTransportService.js';
import { calibrationService } from './CalibrationService.js';

/**
 * Servico de Agendamento (Cron)
 * Orquestra as tarefas de segundo plano da aplicacao.
 */
class CronService {
    constructor() {
        this.jobs = [];
    }

    /**
     * Inicializa todos os agendamentos configurados.
     */
    start() {
        console.log('[Cron] Orquestrador de tarefas iniciado.');

        // 1. Sincronizacao de Dados (Transporte Incremental)
        // Agendamento: De hora em hora (0 * * * *)
        const syncJob = cron.schedule('0 * * * *', async () => {
            const agora = new Date().toLocaleTimeString('pt-BR');
            console.log(`[Cron] Executando transporte de dados horario as ${agora}...`);

            await dataTransport.syncSlidingWindow();

            console.log('[Cron] Ciclo de atualizacao finalizado.');
        }, {
            scheduled: true,
            timezone: 'America/Sao_Paulo'
        });

        this.jobs.push(syncJob);

        // 2. Auto-Calibracao IA (Tendencias Semanais)
        // Agendamento: Domingos as 01:00 (0 1 * * 0)
        const calibrationJob = cron.schedule('0 1 * * 0', async () => {
            console.log('[Cron] Iniciando ciclo semanal de Auto-Calibracao IA...');

            await calibrationService.autoCalibrate();

            console.log('[Cron] Calibracao finalizada.');
        }, {
            scheduled: true,
            timezone: 'America/Sao_Paulo'
        });

        this.jobs.push(calibrationJob);

        // Execucao imediata para conferir se ha novos dados no startup (opcional, mas bom para debug)
        // dataTransport.syncSlidingWindow();
        // calibrationService.autoCalibrate();
    }

    /**
     * Interrompe todos os jobs ativos.
     */
    stop() {
        this.jobs.forEach((job) => job.stop());
        this.jobs = [];
        console.log('[Cron] Orquestrador de tarefas parado.');
    }
}

export const cronService = new CronService();

