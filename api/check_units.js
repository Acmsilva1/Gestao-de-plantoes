import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';

async function check() {
    const db = await open({
        filename: 'c:/gestão de plantões/Gestao-de-plantoes/api/database.sqlite',
        driver: sqlite3.Database
    });

    const units = await db.all('SELECT DISTINCT unidade_id FROM historico_tasy');
    console.log('Unidades com histórico:', units.map(u => u.unidade_id));

    const allUnits = await db.all('SELECT id, nome FROM unidades');
    console.log('Total Unidades no Banco:', allUnits.length);
    
    await db.close();
}

check();
