import { dbModel } from '../model/dbModel.js';
import {
    LOOKBACK_DAYS,
    normalizePredictionText,
    normalizePredictionTurno
} from './PredictionEngine.js';

/**
 * CalibrationService (IA de Auto-Ajuste)
 * Compara o desempenho recente com o histórico de longo prazo para detectar tendências.
 */
class CalibrationService {
    /**
     * Executa o ciclo de auto-calibração.
     * Analisa os últimos 15 dias e gera multiplicadores de tendência.
     */
    async autoCalibrate() {
        console.log("[Calibration] Iniciando ciclo de auto-ajuste de tendência...");

        try {
            // 1. Carregar todo o histórico disponível para o baseline (800 dias nos testes, 365 prod)
            const allHistory = await dbModel.getHistoricalPredictionData();
            if (!allHistory || allHistory.length === 0) {
                console.log("[Calibration] Histórico insuficiente para calibração.");
                return;
            }

            // 2. Definir a janela de "Tendência Recente" (Últimos 15 dias)
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - 15);
            const isoCutoff = cutoffDate.toISOString().split('T')[0];

            // 3. Agrupar dados
            const contexts = new Map();

            allHistory.forEach(row => {
                const key = `${row.unidade}|${row.turno}|${row.weekday}`;
                if (!contexts.has(key)) {
                    contexts.set(key, { unidade: row.unidade, turno: row.turno, weekday: row.weekday, all: [], recent: [] });
                }
                
                const entry = contexts.get(key);
                entry.all.push(row.demanda);
                if (row.data >= isoCutoff) {
                    entry.recent.push(row.demanda);
                }
            });

            const newMultipliers = [];

            // 4. Calcular o Desvio (Bias) para cada contexto
            for (const [key, entry] of contexts.entries()) {
                if (entry.recent.length < 2) continue; // Precisa de pelo menos 2 ocorrências no período recente

                const historyMedian = this.calculateMedian(entry.all);
                const recentAverage = this.calculateAverage(entry.recent);

                if (historyMedian > 0) {
                    let multiplier = recentAverage / historyMedian;

                    // Aplicar banda de tolerância (só ajusta se o desvio for > 5%)
                    if (multiplier > 1.05 || multiplier < 0.95) {
                        // Limitar o ajuste para evitar volatilidade extrema (máx 50% de ajuste)
                        multiplier = Math.min(1.5, Math.max(0.5, multiplier));

                        newMultipliers.push({
                            unidade: entry.unidade,
                            regional: 'Geral',
                            turno: entry.turno,
                            dia_semana: entry.weekday,
                            multiplicador: parseFloat(multiplier.toFixed(2)),
                            atipico: multiplier > 1.3 || multiplier < 0.7
                        });
                    }
                }
            }

            if (newMultipliers.length > 0) {
                await dbModel.upsertHistoricalTasyMl(newMultipliers);
                console.log(`[Calibration] Sucesso: ${newMultipliers.length} multiplicadores de inteligência atualizados.`);
            } else {
                console.log("[Calibration] Nenhuma tendência significativa detectada.");
            }

        } catch (err) {
            console.error("[Calibration] Erro no ciclo de calibração:", err);
        }
    }

    calculateMedian(values) {
        if (values.length === 0) return 0;
        const sorted = [...values].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    }

    calculateAverage(values) {
        if (values.length === 0) return 0;
        const sum = values.reduce((a, b) => a + b, 0);
        return sum / values.length;
    }
}

export const calibrationService = new CalibrationService();
