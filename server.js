import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { getPublicShifts } from './api/DirecionadorService.js';

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.use(cors());
app.use(express.json());

// Rota da API
app.get('/api/vagas', getPublicShifts);

// Serve o Frontend (Produção)
app.use(express.static(path.join(__dirname, 'web/dist')));
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'web/dist/index.html'));
});

app.listen(3000, () => console.log('🚀 Maestro rodando na porta 3000'));
