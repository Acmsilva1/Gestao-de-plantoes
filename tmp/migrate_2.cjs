const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./DB local/database.sqlite');
const API_URL = 'https://dhpeeodweyzljyjqoxkb.supabase.co/rest/v1';
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRocGVlb2R3ZXl6bGp5anFveGtiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3Mzk3MDAsImV4cCI6MjA5MDMxNTcwMH0.n-e-CvSogvsUCubPRlvP75_v4UqPea1nWJhI9c8KuKg';

async function run() {
    for (const table of ['perfis', 'gestores']) {
        const res = await fetch(API_URL + '/' + table + '?select=*', { headers: { 'apikey': API_KEY, 'Authorization': 'Bearer ' + API_KEY }});
        const data = await res.json();
        if(!data || data.length === 0) continue;
        const keys = Object.keys(data[0]);
        const cols = keys.join(','); const qs = keys.map(()=>'?').join(',');
        for (const row of data) {
            await new Promise(r => db.run('INSERT OR REPLACE INTO ' + table + ' (' + cols + ') VALUES (' + qs + ')', keys.map(k=>row[k]), r));
        }
        console.log('Inserted', table);
    }
}
run();
