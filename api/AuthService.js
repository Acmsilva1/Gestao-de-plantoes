import { dbModel } from '../model/dbModel.js';

const mapDoctorForClient = (doctor) => {
    const baseUnit = {
        id: doctor.unidade_fixa_id,
        nome: doctor.unidades?.nome ?? 'Unidade nao informada',
        tipo: 'BASE'
    };

    const auxiliaryUnits = (doctor.medico_acessos_unidade || []).map(au => ({
        id: au.unidade_id,
        nome: au.unidades?.nome ?? 'Unidade auxiliar',
        tipo: 'AUXILIAR'
    }));

    // Remove duplicatas se houver e coloca a base em primeiro
    const allAuthorized = [baseUnit, ...auxiliaryUnits.filter(au => au.id !== baseUnit.id)];

    return {
        id: doctor.id,
        nome: doctor.nome,
        crm: doctor.crm,
        senha: doctor.senha,
        telefone: doctor.telefone,
        especialidade: doctor.especialidade,
        unidadeFixaId: doctor.unidade_fixa_id,
        unidadeFixaNome: doctor.unidades?.nome ?? 'Unidade nao informada',
        unidadesAutorizadas: allAuthorized
    };
};

export const loginWithCrm = async (req, res) => {
    const { crm, senha } = req.body ?? {};

    try {
        if (!crm?.trim()) {
            return res.status(400).json({ error: 'Informe o CRM para entrar.' });
        }

        if (!senha) {
            return res.status(400).json({ error: 'Informe a senha para entrar.' });
        }

        const doctor = await dbModel.getDoctorByCrm(crm.trim());

        if (!doctor) {
            return res.status(404).json({ error: 'Medico nao encontrado para o CRM informado.' });
        }

        // Verifica a senha (em texto puro conforme solicitado pelo usuário para teste inicial)
        if (doctor.senha !== senha) {
            return res.status(401).json({ error: 'Senha incorreta para o CRM informado.' });
        }

        res.json({
            message: 'Credenciais validadas com sucesso.',
            doctor: mapDoctorForClient(doctor)
        });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao autenticar medico.', details: err.message });
    }
};
