import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { env, getMissingEnvVars, hasDatabaseEnv } from './config/env.js';
import { loginWithCrm } from './api/AuthService.js';
import { startPredictionScheduler } from './api/SchedulerService.js';
import {
    getDoctorCalendar,
    getDoctorAgenda,
    updateDoctorProfile,
    getDoctors,
    getPublicShifts,
    holdShift,
    releaseShiftHold,
    selectShift
} from './api/DirecionadorService.js';
import {
    managerLogin,
    getDashboardMetrics,
    getDoctorAccesses,
    manageDoctorUnitAccess,
    getUnitsList,
    getManagerCalendar,
    updateDoctorProfileByManager,
    updateManagerProfile,
    createDoctor,
    deleteDoctor
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

app.post('/api/auth/login', loginWithCrm);
app.get('/api/medicos', getDoctors);
app.get('/api/medicos/:medicoId/calendario', getDoctorCalendar);
app.get('/api/medicos/:medicoId/agenda', getDoctorAgenda);
app.post('/api/medicos/:medicoId/perfil', updateDoctorProfile);
app.get('/api/vagas', getPublicShifts);
app.post('/api/vagas/:id/bloquear', holdShift);
app.delete('/api/vagas/:id/bloquear', releaseShiftHold);
app.post('/api/vagas/:id/selecionar', selectShift);

// --- Rotas do Gestor ---
app.post('/api/manager/login', managerLogin);
app.get('/api/manager/dashboard', getDashboardMetrics);
app.get('/api/manager/medicos', getDoctorAccesses);
app.get('/api/manager/unidades', getUnitsList);
app.get('/api/manager/calendario/:unidadeId', getManagerCalendar);
app.post('/api/manager/medicos/:id/acessos', manageDoctorUnitAccess);
app.post('/api/manager/medicos/:id/perfil', updateDoctorProfileByManager);
app.post('/api/manager/perfil/:id', updateManagerProfile);
app.post('/api/manager/medicos', createDoctor);
app.delete('/api/manager/medicos/:id', deleteDoctor);

if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
    });
}

if (!process.env.VERCEL) {
    app.listen(env.port, () => {
        console.log(`Maestro rodando na porta ${env.port}`);
        if (hasDatabaseEnv()) {
            startPredictionScheduler();
        }
    });
}

export default app;
