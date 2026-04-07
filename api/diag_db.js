import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

async function check() {
    try {
        const db = await open({
            filename: 'c:/gestão de plantões/Gestao-de-plantoes/api/database.sqlite',
            driver: sqlite3.Database
        });

        console.log('--- Unidades com dados em historico_tasy ---');
        const historyUnits = await db.all(`
            const SELECT DISTINCT h.unidade_id, u.nome 
            FROM historico_tasy h
            LEFT JOIN unidades u ON h.unidade_id = u.id
        `);
        console.table(historyUnits);

        console.log('\n--- Todas as Unidades Disponíveis ---');
        const allUnits = await db.all('SELECT id, nome FROM unidades LIMIT 20');
        console.table(allUnits);

        await db.close();
    } catch (err) {
        console.error('Erro ao ler DB:', err);
    }
}

check();
