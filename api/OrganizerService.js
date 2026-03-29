import { dbModel } from '../model/dbModel.js';
import { calculateDemand } from './PredictionService.js';

export const syncShiftData = async (unidadeId) => {
    const history = await dbModel.getHistory(unidadeId);
    const neededDoctors = calculateDemand(history);
    
    // Atualiza o baldinho (Supabase) com a nova meta
    await dbModel.updateAvailability(unidadeId, neededDoctors);
    return { unidadeId, neededDoctors };
};
