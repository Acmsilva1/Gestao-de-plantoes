import { dataTransport } from './api/DataTransportService.js';

async function run() {
    console.log("=== INICIANDO CARGA INICIAL (ETL) ===");
    await dataTransport.syncSlidingWindow();
    console.log("=== CARGA INICIAL CONCLUÍDA ===");
    process.exit(0);
}

run();
