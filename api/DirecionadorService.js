import { dbModel } from '../model/dbModel.js';

export const getPublicShifts = async (req, res) => {
    try {
        const data = await dbModel.getAllOpenShifts();
        // LGPD: Filtramos apenas o necessário para o Front
        const cleanData = data.map(s => ({
            id: s.id,
            local: s.unidades.nome,
            data: s.data_plantao,
            turno: s.turno,
            vagas: s.vagas_totais - s.vagas_ocupadas
        }));
        res.json(cleanData);
    } catch (err) {
        res.status(500).json({ error: "Erro na escala nacional." });
    }
};
