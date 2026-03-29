import { dbModel } from '../model/dbModel.js';

const getMonthDates = (monthStr) => {
    // monthStr format "YYYY-MM"
    const startMonthDate = `${monthStr}-01`;
    const [year, rawMonth] = monthStr.split('-').map(Number);
    // get end of month
    const endMonthDate = new Date(Date.UTC(year, rawMonth, 0)).toISOString().slice(0, 10);
    return { startMonthDate, endMonthDate, year, month: rawMonth };
};

export const managerLogin = async (req, res) => {
    const { usuario, senha } = req.body;

    try {
        if (!usuario || !senha) {
            return res.status(400).json({ error: 'Usuário e senha são obrigatórios.' });
        }

        const manager = await dbModel.managerLogin(usuario, senha);

        if (!manager) {
            return res.status(401).json({ error: 'Credenciais inválidas.' });
        }

        res.json({
            message: 'Acesso concedido.',
            manager: {
                id: manager.id,
                nome: manager.nome,
                usuario: manager.usuario,
                senha: manager.senha, // Enviando para que o modal de perfil possa pré-preencher
                perfil: manager.perfis?.nome || 'GESTOR'
            }
        });
    } catch (err) {
        res.status(500).json({ error: 'Erro no login de gestor.', details: err.message });
    }
};

export const updateManagerProfile = async (req, res) => {
    const { id } = req.params;
    const { nome, usuario, senha } = req.body;

    try {
        const updated = await dbModel.updateManagerProfile(id, { nome, usuario, senha });
        res.json({
            message: 'Perfil do gestor atualizado.',
            manager: {
                id: updated.id,
                nome: updated.nome,
                usuario: updated.usuario,
                senha: updated.senha,
                perfil: updated.perfis?.nome || 'GESTOR'
            }
        });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao atualizar perfil do gestor.', details: err.message });
    }
};

export const getDashboardMetrics = async (req, res) => {
    const { month, unidadeId } = req.query; // YYYY-MM
    if (!month) {
        return res.status(400).json({ error: 'Mês não informado.' });
    }

    try {
        const { startMonthDate, endMonthDate } = getMonthDates(month);

        const vacancies = await dbModel.getDashboardsDataStraddle(startMonthDate, endMonthDate, unidadeId);

        const endDay = parseInt(endMonthDate.slice(-2), 10);
        
        const vacancies_q1 = [];
        const vacancies_q2 = [];
        const demands_q1 = [];
        const demands_q2 = [];

        for (let i = 1; i <= endDay; i++) {
            const dayStr = String(i).padStart(2, '0');
            if (i <= 15) {
                vacancies_q1.push({ dia: dayStr, Totais: 0, Ocupadas: 0, Disponíveis: 0 });
                demands_q1.push({ dia: dayStr, "Manhã": 0, "Tarde": 0, "Noite": 0, "Madrugada": 0, Geral: 0 });
            } else {
                vacancies_q2.push({ dia: dayStr, Totais: 0, Ocupadas: 0, Disponíveis: 0 });
                demands_q2.push({ dia: dayStr, "Manhã": 0, "Tarde": 0, "Noite": 0, "Madrugada": 0, Geral: 0 });
            }
        }

        // Aggregation of vacancies AND demand (both from disponibilidade — contains predictor forecast)
        (vacancies || []).forEach(v => {
            const dayNum = Number(v.data_plantao.slice(-2));
            const available = Math.max(v.vagas_totais - v.vagas_ocupadas, 0);
            
            const vTargetArray = dayNum <= 15 ? vacancies_q1 : vacancies_q2;
            const vEntry = vTargetArray.find(e => e.dia === String(dayNum).padStart(2, '0'));
            
            if (vEntry) {
                vEntry.Totais += v.vagas_totais;
                vEntry.Ocupadas += v.vagas_ocupadas;
                vEntry.Disponíveis += available;
            }

            // Also aggregate demand from turno field in disponibilidade
            const dTargetArray = dayNum <= 15 ? demands_q1 : demands_q2;
            const dEntry = dTargetArray.find(e => e.dia === String(dayNum).padStart(2, '0'));

            if (dEntry && v.turno) {
                const turno = (v.turno || '').toLowerCase();
                
                // Soma ao Geral (Total do dia) independente do turno
                dEntry['Geral'] += v.vagas_totais;

                if (turno.includes('manh')) {
                    dEntry['Manhã'] += v.vagas_totais;
                } else if (turno.includes('tard')) {
                    dEntry['Tarde'] += v.vagas_totais;
                } else if (turno.includes('noit')) {
                    dEntry['Noite'] += v.vagas_totais;
                } else if (turno.includes('madrug')) {
                    dEntry['Madrugada'] += v.vagas_totais;
                }
            }
        });

        res.json({
            vacancies: { q1: vacancies_q1, q2: vacancies_q2 },
            demands:   { q1: demands_q1, q2: demands_q2 }
        });
    } catch (err) {
        // Ignorar falha se não tiver tasy_raw_history no ambiente (mock fallback)
        res.status(500).json({ error: 'Erro ao carregar métricas.', details: err.message });
    }
};

export const getDoctorAccesses = async (req, res) => {
    try {
        const list = await dbModel.getDoctorsAccessList();
        
        // Formatar para algo amigável ao frontend
        const mappedList = list.map(doc => ({
            id: doc.id,
            nome: doc.nome,
            crm: doc.crm,
            telefone: doc.telefone || '',
            senha: doc.senha || '',
            especialidade: doc.especialidade,
            unidadeFixaId: doc.unidade_fixa_id,
            unidadeFixaNome: doc.unidades?.nome,
            unidadesLiberadas: (doc.medico_acessos_unidade || []).map(u => u.unidade_id)
        }));

        res.json(mappedList);
    } catch (err) {
        res.status(500).json({ error: 'Erro ao listar acessos.', details: err.message });
    }
};

export const manageDoctorUnitAccess = async (req, res) => {
    const { id: medicoId } = req.params;
    const { unidadesIds, gestorId } = req.body;

    if (!medicoId || !gestorId) {
        return res.status(400).json({ error: 'Dados insuficientes (Médico ou Gestor faltando).' });
    }

    try {
        await dbModel.saveDoctorAccess(medicoId, unidadesIds, gestorId);
        
        res.json({ message: 'Permissões salvas com sucesso!' });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao salvar acessos.', details: err.message });
    }
};

export const updateDoctorProfileByManager = async (req, res) => {
    const { id } = req.params;
    const { nome, telefone, senha } = req.body;

    try {
        const updated = await dbModel.updateDoctorProfile(id, { nome, telefone, senha });
        res.json({ message: 'Perfil do medico atualizado pelo gestor.', doctor: updated });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao atualizar perfil do medico pelo gestor.', details: err.message });
    }
};

export const getUnitsList = async (req, res) => {
    try {
        const units = await dbModel.getUnits();
        res.json(units);
    } catch (err) {
        res.status(500).json({ error: 'Erro ao listar unidades.', details: err.message });
    }
};

export const getManagerCalendar = async (req, res) => {
    const { unidadeId } = req.params;
    const { month } = req.query;

    if (!unidadeId) {
        return res.status(400).json({ error: 'Unidade não informada.' });
    }

    const targetMonth = month || new Date().toISOString().slice(0, 7);

    try {
        const shifts = await dbModel.getShiftsByUnitAndMonth(unidadeId, targetMonth);
        const unit = await dbModel.getUnits().then(us => us.find(u => u.id === unidadeId));

        res.json({
            month: targetMonth,
            unit: unit || { id: unidadeId, nome: 'Unidade' },
            shifts: (shifts || []).map(shift => ({
                id: shift.id,
                unidadeId: shift.unidade_id,
                local: shift.unidades?.nome ?? 'Unidade',
                data: shift.data_plantao,
                turno: shift.turno,
                vagas: Math.max(shift.vagas_totais - shift.vagas_ocupadas, 0),
                vagasTotais: shift.vagas_totais,
                vagasOcupadas: shift.vagas_ocupadas,
                status: shift.status
            }))
        });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao carregar calendário da unidade.', details: err.message });
    }
};

export const createDoctor = async (req, res) => {
    const { nome, crm, especialidade, unidadeFixaId, telefone, senha } = req.body;

    try {
        if (!nome || !crm || !unidadeFixaId) {
            return res.status(400).json({ error: 'Nome, CRM e Unidade Fixa são obrigatórios.' });
        }

        const newDoc = await dbModel.createDoctor({ nome, crm, especialidade, unidadeFixaId, telefone, senha });
        res.status(201).json({
            message: 'Médico cadastrado com sucesso!',
            doctor: newDoc
        });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao cadastrar médico.', details: err.message });
    }
};

export const deleteDoctor = async (req, res) => {
    const { id } = req.params;

    try {
        await dbModel.deleteDoctor(id);
        res.json({ message: 'Médico removido do sistema com sucesso!' });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao excluir médico.', details: err.message });
    }
};
