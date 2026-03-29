import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { env } from './config/env.js';
import { loginWithCrm } from './api/AuthService.js';
import { startPredictionScheduler } from './api/SchedulerService.js';
import {
    getDoctorCalendar,
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
    getUnitsList
} from './api/ManagerService.js';

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.join(__dirname, 'web/dist');

app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
});

app.post('/api/auth/login', loginWithCrm);
app.get('/api/medicos', getDoctors);
app.get('/api/medicos/:medicoId/calendario', getDoctorCalendar);
app.get('/api/vagas', getPublicShifts);
app.post('/api/vagas/:id/bloquear', holdShift);
app.delete('/api/vagas/:id/bloquear', releaseShiftHold);
app.post('/api/vagas/:id/selecionar', selectShift);

// --- Rotas do Gestor ---
app.post('/api/manager/login', managerLogin);
app.get('/api/manager/dashboard', getDashboardMetrics);
app.get('/api/manager/medicos', getDoctorAccesses);
app.get('/api/manager/unidades', getUnitsList);
app.post('/api/manager/medicos/:id/acessos', manageDoctorUnitAccess);

if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
    });
}

app.listen(env.port, () => {
    console.log(`Maestro rodando na porta ${env.port}`);
    startPredictionScheduler();
});
