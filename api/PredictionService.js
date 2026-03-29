export const calculateDemand = (history, isHoliday = false) => {
    if (!history || history.length === 0) return 1; // Mínimo de 1 médico sempre
    const counts = history.map(h => h.atendimento_count);
    const mean = counts.reduce((a, b) => a + b) / counts.length;
    const stdDev = Math.sqrt(counts.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b) / counts.length);
    
    const safetyFactor = isHoliday ? 2.0 : 1.5;
    const predictedPatients = Math.ceil(mean + (stdDev * safetyFactor));
    
    return Math.ceil(predictedPatients / 10); // 1 médico p/ 10 pacientes
};
