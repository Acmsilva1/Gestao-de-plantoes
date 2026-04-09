const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./DB local/database.sqlite');

const tables = ['unidades', 'medicos', 'medico_acessos_unidade', 'historico_tasy', 'historico_tasy_ml', 'dados_predicao', 'disponibilidade', 'agendamentos', 'escala', 'escala_mes_publicacao', 'pedidos_troca_escala', 'pedidos_assumir_escala', 'tasy_raw_history', 'gestores', 'perfis'];

const API_URL = 'https://dhpeeodweyzljyjqoxkb.supabase.co/rest/v1';
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRocGVlb2R3ZXl6bGp5anFveGtiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3Mzk3MDAsImV4cCI6MjA5MDMxNTcwMH0.n-e-CvSogvsUCubPRlvP75_v4UqPea1nWJhI9c8KuKg';

// ensure gestores e perfis tables
db.serialize(() => {
    db.run("CREATE TABLE IF NOT EXISTS perfis (id TEXT PRIMARY KEY, nome TEXT)");
    db.run("CREATE TABLE IF NOT EXISTS gestores (id TEXT PRIMARY KEY, nome TEXT, usuario TEXT, senha TEXT, unidade_id TEXT, perfil_id TEXT)");
});

async function migrate() {
    for (const table of tables) {
        console.log('Fetching', table);
        const res = await fetch(`${API_URL}/${table}?select=*`, {
           headers: { 'apikey': API_KEY, 'Authorization': `Bearer ${API_KEY}` }
        });
        const data = await res.json();
        
        if (data.error || data.message) {
             console.log('Error fetching', table, data);
             continue;
        }

        if (!data || data.length === 0) {
             console.log('No data for', table);
             continue;
        }

        console.log(`Inserting ${data.length} rows into ${table}`);
        
        const keys = Object.keys(data[0]);
        const placeholders = keys.map(() => '?').join(',');
        const sql = `INSERT OR REPLACE INTO ${table} (${keys.join(',')}) VALUES (${placeholders})`;
        
        db.serialize(() => {
            db.exec('BEGIN TRANSACTION');
            const stmt = db.prepare(sql);
            for (const row of data) {
                const vals = keys.map(k => row[k]);
                stmt.run(vals);
            }
            stmt.finalize();
            db.exec('COMMIT');
        });
    }
    console.log('Migration finished');
}

migrate().catch(console.error);
