import { recalculateAnalyticalPredictionV2 } from './api/AnalyticalPredictionServiceV2.js';

async function run() {
    console.log("=== RECALCULANDO PREDIÇÃO ANALÍTICA ===");
    try {
        const result = await recalculateAnalyticalPredictionV2();
        console.log("Sucesso! Linhas geradas:", result.rows.length);
        console.log("Executado em:", result.generatedAt);
    } catch (err) {
        console.error("Erro no recálculo:", err.message);
    }
    process.exit(0);
}

run();
