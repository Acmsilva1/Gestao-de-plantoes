import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { env, getMissingEnvVars, hasDatabaseEnv } from './config/env.js';
import { startPredictionScheduler, triggerPredictionCycle } from './api/SchedulerService.js';
import { cronService } from './api/CronService.js';
import { cacheService } from './api/CacheService.js';
import { queueService } from './api/QueueService.js';
import {
    getDoctorCalendar,
    getDoctorAgenda,
    postAssumirEscala,
    postPedidoAssumirEscala,
    postPedidoTrocaEscala,
    getDoctorTrocas,
    postResponderTrocaColega,
    updateDoctorProfile,
    getDoctors,
    getPublicShifts,
    generateUnitForecast,
    holdShift,
    releaseShiftHold,
    selectShift,
    postPedidoCancelamento,
    getDoctorFutureShiftsForSwap
} from './api/DirecionadorService.js';
import {
    getHistoricalAnalyticalData,
    getDashboardSummary,
    getManagerProfiles,
    getDoctorAccesses,
    manageDoctorUnitAccess,
    getUnitsList,
    getManagerCalendar,
    getManagerAgenda,
    getManagerAgendaSummary,
    updateDoctorProfileByManager,
    updateManagerProfile,
    createDoctor,
    deleteDoctor,
    getTrocasPendentesGestor,
    getAssumirPendentesGestor,
    postDecidirAssumirGestor,
    getEscalaEditor,
    postEscalaLinha,
    patchMoverEscalaLinha,
    deleteEscalaLinha,
    putEscalaMesVisibilidade,
    postImportarMesAnteriorEscala,
    getReportsData,
    getManagerTemplates,
    getManagerTemplateById,
    createManagerTemplate,
    updateManagerTemplate,
    deleteManagerTemplate,
    postApplyTemplateToMonth,
    postClearMonthScale,
    getCancelamentosPendentesGestor,
    postDecidirCancelamentoGestor
} from './api/ManagerService.js';
import {
    getAdminProductivityReport,
    getAdminProductivitySummary,
    getAdminExchangesReport,
    getAdminCancellationsReport,
    getAdminUnits,
    getAdminDoctors,
    updateAdminProfile
} from './api/AdminController.js';

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.join(__dirname, 'web/dist');

app.use(cors());
app.use(express.json());

app.use('/api', (req, res, next) => {
    if (hasDatabaseEnv()) {
        return next();
    }

    return res.status(503).json({
        error: 'Configuracao de banco ausente para este ambiente.',
        missingEnvVars: getMissingEnvVars()
    });
});

app.get('/api/health', async (req, res) => {
    const cache = await cacheService.getHealth();
    const queue = await queueService.getHealth();
    const databaseOk = hasDatabaseEnv();
    const infraOk =
        (!cache.enabled || cache.status === 'ok') &&
        (!queue.enabled || queue.status === 'ok');

    res.json({
        status: databaseOk && infraOk ? 'ok' : 'degraded',
        missingEnvVars: getMissingEnvVars(),
        infra: {
            cache,
            queue
        }
    });
});

app.get('/api/medicos', getDoctors);
app.get('/api/medicos/:medicoId/calendario', getDoctorCalendar);
app.get('/api/medicos/:medicoId/agenda', getDoctorAgenda);
app.get('/api/medicos/:medicoId/escala/opcoes-troca', getDoctorFutureShiftsForSwap);
app.post('/api/medicos/:medicoId/escala/assumir', postAssumirEscala);
app.post('/api/medicos/:medicoId/escala/pedido-assumir', postPedidoAssumirEscala);
app.post('/api/medicos/:medicoId/escala/pedido-troca', postPedidoTrocaEscala);
app.post('/api/medicos/:medicoId/escala/pedido-cancelamento', postPedidoCancelamento);
app.get('/api/medicos/:medicoId/trocas', getDoctorTrocas);
app.post('/api/medicos/:medicoId/trocas/:pedidoId/responder', postResponderTrocaColega);
app.post('/api/medicos/:medicoId/perfil', updateDoctorProfile);
app.get('/api/vagas', getPublicShifts);
app.post('/api/vagas/:id/bloquear', holdShift);
app.delete('/api/vagas/:id/bloquear', releaseShiftHold);
app.post('/api/vagas/:id/selecionar', selectShift);

// --- Rotas do Gestor ---
app.get('/api/manager/analise-atendimento', getHistoricalAnalyticalData);
app.get('/api/manager/dashboard-summary', getDashboardSummary);
app.get('/api/manager/perfis', getManagerProfiles);
app.get('/api/manager/medicos', getDoctorAccesses);
app.get('/api/manager/unidades', getUnitsList);
app.get('/api/manager/calendario/:unidadeId', getManagerCalendar);
app.get('/api/manager/agenda', getManagerAgenda);
app.get('/api/manager/agenda/resumo', getManagerAgendaSummary);
app.post('/api/manager/previsao', triggerPredictionCycle);
app.post('/api/manager/previsao/:unidadeId', generateUnitForecast);
app.post('/api/manager/medicos/:id/acessos', manageDoctorUnitAccess);
app.post('/api/manager/medicos/:id/perfil', updateDoctorProfileByManager);
app.post('/api/manager/perfil/:id', updateManagerProfile);
app.post('/api/manager/medicos', createDoctor);
app.delete('/api/manager/medicos/:id', deleteDoctor);
app.get('/api/manager/trocas-pendentes', getTrocasPendentesGestor);
app.post('/api/manager/trocas/:pedidoId/decidir', (_req, res) =>
    res.status(410).json({ error: 'Fluxo desabilitado: trocas entre medicos nao exigem mais aprovacao do gestor.' })
);
app.get('/api/manager/assumir-pendentes', getAssumirPendentesGestor);
app.post('/api/manager/assumir/:pedidoId/decidir', postDecidirAssumirGestor);
app.get('/api/manager/cancelamentos-pendentes', getCancelamentosPendentesGestor);
app.post('/api/manager/cancelamentos/:pedidoId/decidir', postDecidirCancelamentoGestor);
app.get('/api/manager/escala-editor', getEscalaEditor);
app.post('/api/manager/escala/linha', postEscalaLinha);
app.patch('/api/manager/escala/linha/:id/mover', patchMoverEscalaLinha);
app.delete('/api/manager/escala/linha/:id', deleteEscalaLinha);
app.put('/api/manager/escala/mes-visibilidade', putEscalaMesVisibilidade);
app.post('/api/manager/escala/importar-mes-anterior', postImportarMesAnteriorEscala);
app.get('/api/manager/reports', getReportsData);

// --- Rotas Templates Customizados ---
app.get('/api/manager/templates', getManagerTemplates);
app.get('/api/manager/templates/:id', getManagerTemplateById);
app.post('/api/manager/templates', createManagerTemplate);
app.put('/api/manager/templates/:id', updateManagerTemplate);
app.delete('/api/manager/templates/:id', deleteManagerTemplate);
app.post('/api/manager/escala/importar-template', postApplyTemplateToMonth);
app.post('/api/manager/escala/limpar-mes', postClearMonthScale);

// --- Rotas Administrativas (Relatórios de Faturamento) ---
app.get('/api/admin/reports/productivity', getAdminProductivityReport);
app.get('/api/admin/reports/productivity/summary', getAdminProductivitySummary);
app.get('/api/admin/reports/exchanges', getAdminExchangesReport);
app.get('/api/admin/reports/cancellations', getAdminCancellationsReport);
app.get('/api/admin/units', getAdminUnits);
app.get('/api/admin/doctors', getAdminDoctors);
app.post('/api/admin/perfil/:id', updateAdminProfile);

app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Rota da API não encontrada.' });
});

app.use((err, req, res, next) => {
    console.error('[API ERROR]', err);
    if (res.headersSent) {
        return next(err);
    }
    return res.status(err.status || 500).json({
        error: err.message || 'Erro interno do servidor.'
    });
});

if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
    });
}

const server = app.listen(env.port, () => {
    console.log(`GESTAO DE PLANTOES rodando na porta ${env.port}`);

    // Pre-aquecimento não bloqueante para aproximar comportamento de produção
    if (env.enableRedis) {
        cacheService.ensureClient().catch(() => {});
    }
    if (env.enableQueue) {
        queueService.ensureChannel().catch(() => {});
    }

    if (hasDatabaseEnv() && !env.disablePredictorScheduler) {
        startPredictionScheduler();
        cronService.start(); // Inicia o transporte de dados (6h e 18h)
    } else if (hasDatabaseEnv() && env.disablePredictorScheduler) {
        console.log('[scheduler] desligado (DISABLE_PREDICTOR_SCHEDULER=1) - módulo médico / sem predição');
    }
});

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(
            `[ERRO] Porta ${env.port} ja esta em uso (outro Node/servidor ou instancia antiga).\n` +
                `  - Encerre o processo que usa essa porta, ou\n` +
                `  - Defina outra porta no .env, por exemplo: PORT=3001`
        );
    } else {
        console.error('[ERRO] ao abrir o servidor:', err.message);
    }
    process.exit(1);
});

export default app;

