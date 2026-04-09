import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carrega config do env (como o dbModel faz ou carrega dotenv se precisar)
import { env } from '../config/env.js';

let dbInstance = null;

export async function getDb() {
    if (dbInstance) {
        return dbInstance;
    }

    const dbPath = env.sqliteDbPath || path.join(__dirname, 'database.sqlite');
    
    dbInstance = await open({
        filename: dbPath,
        driver: sqlite3.Database
    });

    // Ativa suporte para foregin keys em sqlite
    await dbInstance.exec('PRAGMA foreign_keys = ON');

    // Inicializa as tabelas se nao existirem
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    
    await dbInstance.exec(schemaSql);
    
    return dbInstance;
}

// Utilitario para gerar UUID
export function generateId() {
    return crypto.randomUUID();
}
