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
