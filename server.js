import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { env, getMissingEnvVars, hasDatabaseEnv } from './config/env.js';
import { startPredictionScheduler, triggerPredictionCycle } from './api/SchedulerService.js';
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
    selectShift
} from './api/DirecionadorService.js';
import {
    getDashboardMetrics,
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
    postDecidirTrocaGestor,
    getAssumirPendentesGestor,
    postDecidirAssumirGestor,
    getEscalaEditor,
    postEscalaLinha,
    deleteEscalaLinha,
    putEscalaMesVisibilidade,
    postImportarMesAnteriorEscala
} from './api/ManagerService.js';

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

app.get('/api/health', (req, res) => {
    res.json({
        status: hasDatabaseEnv() ? 'ok' : 'degraded',
        missingEnvVars: getMissingEnvVars()
    });
});

app.get('/api/medicos', getDoctors);
app.get('/api/medicos/:medicoId/calendario', getDoctorCalendar);
app.get('/api/medicos/:medicoId/agenda', getDoctorAgenda);
app.post('/api/medicos/:medicoId/escala/assumir', postAssumirEscala);
app.post('/api/medicos/:medicoId/escala/pedido-assumir', postPedidoAssumirEscala);
app.post('/api/medicos/:medicoId/escala/pedido-troca', postPedidoTrocaEscala);
app.get('/api/medicos/:medicoId/trocas', getDoctorTrocas);
app.post('/api/medicos/:medicoId/trocas/:pedidoId/responder', postResponderTrocaColega);
app.post('/api/medicos/:medicoId/perfil', updateDoctorProfile);
app.get('/api/vagas', getPublicShifts);
app.post('/api/vagas/:id/bloquear', holdShift);
app.delete('/api/vagas/:id/bloquear', releaseShiftHold);
app.post('/api/vagas/:id/selecionar', selectShift);

// --- Rotas do Gestor ---
app.get('/api/manager/dashboard', getDashboardMetrics);
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
app.post('/api/manager/trocas/:pedidoId/decidir', postDecidirTrocaGestor);
app.get('/api/manager/assumir-pendentes', getAssumirPendentesGestor);
app.post('/api/manager/assumir/:pedidoId/decidir', postDecidirAssumirGestor);
app.get('/api/manager/escala-editor', getEscalaEditor);
app.post('/api/manager/escala/linha', postEscalaLinha);
app.delete('/api/manager/escala/linha/:id', deleteEscalaLinha);
app.put('/api/manager/escala/mes-visibilidade', putEscalaMesVisibilidade);
app.post('/api/manager/escala/importar-mes-anterior', postImportarMesAnteriorEscala);

if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
    });
}

const server = app.listen(env.port, () => {
    console.log(`GESTAO DE PLANTOES rodando na porta ${env.port}`);
    if (hasDatabaseEnv() && !env.disablePredictorScheduler) {
        startPredictionScheduler();
    } else if (hasDatabaseEnv() && env.disablePredictorScheduler) {
        console.log('[scheduler] desligado (DISABLE_PREDICTOR_SCHEDULER=1) — módulo médico / sem predição');
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
