import { dbModel } from '../model/dbModel.js';

const mapDoctorForClient = (doctor) => ({
    id: doctor.id,
    nome: doctor.nome,
    crm: doctor.crm,
    especialidade: doctor.especialidade,
    unidadeFixaId: doctor.unidade_fixa_id,
    unidadeFixaNome: doctor.unidades?.nome ?? 'Unidade nao informada'
});

export const loginWithCrm = async (req, res) => {
    const { nome, crm } = req.body ?? {};

    try {
        if (!nome?.trim()) {
            return res.status(400).json({ error: 'Informe o nome para entrar.' });
        }

        if (!crm?.trim()) {
            return res.status(400).json({ error: 'Informe o CRM para entrar.' });
        }

        const doctor = await dbModel.getDoctorByCrm(crm.trim());

        if (!doctor) {
            return res.status(404).json({ error: 'Medico nao encontrado para o CRM informado.' });
        }

        if (nome?.trim() && doctor.nome.toLowerCase() !== nome.trim().toLowerCase()) {
            return res.status(400).json({ error: 'Nome nao confere com o CRM informado.' });
        }

        res.json({
            message: 'Acesso autorizado com sucesso.',
            doctor: mapDoctorForClient(doctor)
        });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao autenticar medico.', details: err.message });
    }
};
