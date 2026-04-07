import { dbModel } from '../model/dbModel.js';
import { TURNOS_ESCALA } from './DirecionadorService.js';
import { cacheService, escalaEditorCacheKey, escalaEditorCachePattern } from './CacheService.js';
import { queueService } from './QueueService.js';
import { env } from '../config/env.js';

const getMonthDates = (monthStr) => {
    // monthStr format "YYYY-MM"
    const startMonthDate = `${monthStr}-01`;
    const [year, rawMonth] = monthStr.split('-').map(Number);
    // get end of month
    const endMonthDate = new Date(Date.UTC(year, rawMonth, 0)).toISOString().slice(0, 10);
    return { startMonthDate, endMonthDate, year, month: rawMonth };
};

const parseGestorId = (req) => {
    const qId = typeof req.query?.gestorId === 'string' ? req.query.gestorId.trim() : '';
    const bId = typeof req.body?.gestorId === 'string' ? req.body.gestorId.trim() : '';
    const hId = typeof req.headers?.['x-gestor-id'] === 'string' ? req.headers['x-gestor-id'].trim() : '';
    return qId || bId || hId || '';
};

const parseCsvIds = (value) =>
    String(value || '')
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean);

const isMasterManager = (manager) => manager.perfis.nome === 'GESTOR_MASTER';

const getScopedManager = async (req, res, options = {}) => {
    const { allowMasterWithoutUnit = true } = options;
    const managerId = parseGestorId(req);
    if (!managerId) {
        res.status(400).json({ error: 'gestorId ? obrigat?rio para esta opera??o.' });
        return null;
    }

    const manager = await dbModel.getManagerById(managerId);
    if (!manager) {
        res.status(403).json({ error: 'Gestor não encontrado.' });
        return null;
    }

    if (!manager.unidade_id && !(allowMasterWithoutUnit && isMasterManager(manager))) {
        res.status(403).json({ error: 'Gestor sem unidade vinculada.' });
        return null;
    }

    return manager;
};

const assertUnitScope = (res, manager, unidadeId) => {
    if (isMasterManager(manager)) {
        return true;
    }
    if (String(unidadeId) !== String(manager.unidade_id)) {
        res.status(403).json({ error: 'Sem permiss?o para operar em outra unidade.' });
        return false;
    }
    return true;
};

export const managerLogin = async (req, res) => {
    const { usuario, senha } = req.body;

    try {
        if (!usuario || !senha) {
            return res.status(400).json({ error: 'Usu?rio e senha s?o obrigat?rios.' });
        }

        const manager = await dbModel.managerLogin(usuario, senha);

        if (!manager) {
            return res.status(401).json({ error: 'Credenciais inv?lidas.' });
        }

        res.json({
            message: 'Acesso concedido.',
            manager: {
                id: manager.id,
                nome: manager.nome,
                usuario: manager.usuario,
                senha: manager.senha, // Enviando para que o modal de perfil possa pr?-preencher
                perfil: manager.perfis.nome || 'GESTOR',
                unidadeId: manager.unidade_id || null,
                unidadeNome: manager.unidades.nome || null,
                isMaster: isMasterManager(manager)
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
                perfil: updated.perfis.nome || 'GESTOR',
                unidadeId: updated.unidade_id || null,
                unidadeNome: updated.unidades.nome || null,
                isMaster: isMasterManager(updated)
            }
        });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao atualizar perfil do gestor.', details: err.message });
    }
};

export const getManagerProfiles = async (_req, res) => {
    try {
        const managers = await dbModel.ensureManagersPerUnit();
        const mapped = (managers || []).map((manager) => ({
            id: manager.id,
            nome: manager.nome,
            usuario: manager.usuario,
            senha: manager.senha || '',
            perfil: manager.perfis.nome || 'GESTOR',
            unidadeId: manager.unidade_id || null,
            unidadeNome: manager.unidades.nome || '',
            isMaster: isMasterManager(manager)
        }));
        res.json(mapped);
    } catch (err) {
        res.status(500).json({ error: 'Erro ao carregar perfis de gestor.', details: err.message });
    }
};

export const getDashboardMetrics = async (req, res) => {
    const { month, unidadeId } = req.query; // YYYY-MM
    if (!month) {
        return res.status(400).json({ error: 'Mês não informado.' });
    }

    try {
        const manager = await getScopedManager(req, res);
        if (!manager) return;

        const { startMonthDate, endMonthDate } = getMonthDates(month);
        const scopedUnitId = unidadeId || manager.unidade_id;
        if (!assertUnitScope(res, manager, scopedUnitId)) return;

        const vacancies = await dbModel.getDashboardsDataStraddle(startMonthDate, endMonthDate, scopedUnitId);

        const endDay = parseInt(endMonthDate.slice(-2), 10);
        
        const vacancies_q1 = [];
        const vacancies_q2 = [];
        const demands_q1 = [];
        const demands_q2 = [];

        for (let i = 1; i <= endDay; i++) {
            const dayStr = String(i).padStart(2, '0');
            if (i <= 15) {
                vacancies_q1.push({ dia: dayStr, Totais: 0, Ocupadas: 0, "Disponíveis": 0 });
                demands_q1.push({ dia: dayStr, "Manhã": 0, "Tarde": 0, "Noite": 0, "Madrugada": 0, Geral: 0 });
            } else {
                vacancies_q2.push({ dia: dayStr, Totais: 0, Ocupadas: 0, "Disponíveis": 0 });
                demands_q2.push({ dia: dayStr, "Manhã": 0, "Tarde": 0, "Noite": 0, "Madrugada": 0, Geral: 0 });
            }
        }

        // Aggregation of vacancies AND demand (both from disponibilidade - contains predictor forecast)
        (vacancies || []).forEach(v => {
            const dayNum = Number(v.data_plantao.slice(-2));
            const available = Math.max(v.vagas_totais - v.vagas_ocupadas, 0);
            
            const vTargetArray = dayNum <= 15 ? vacancies_q1 : vacancies_q2;
            const vEntry = vTargetArray.find(e => e.dia === String(dayNum).padStart(2, '0'));
            
            if (vEntry) {
                vEntry.Totais += v.vagas_totais;
                vEntry.Ocupadas += v.vagas_ocupadas;
                vEntry["Disponíveis"] += available;
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
        res.status(500).json({ error: 'Erro ao carregar m?tricas.', details: err.message });
    }
};

export const getDashboardSummary = async (req, res) => {
    const { month, unidadeId } = req.query;
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
        return res.status(400).json({ error: 'Informe month no formato YYYY-MM.' });
    }

    try {
        const manager = await getScopedManager(req, res);
        if (!manager) return;

        const { startMonthDate, endMonthDate, year, month: monthNumber } = getMonthDates(month);
        const regionalFiltro = typeof req.query?.regional === 'string' ? req.query.regional.trim() : '';
        const normalizeText = (value) =>
            String(value || '')
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .trim()
                .toLowerCase();
        const scopedUnitId = unidadeId || (isMasterManager(manager) ? null : manager.unidade_id);
        if (scopedUnitId && !assertUnitScope(res, manager, scopedUnitId)) return;

        const [escalaRows, disponibilidadeRows, unitsCatalogRaw, predictionRows] = await Promise.all([
            dbModel.getEscalaByRange(startMonthDate, endMonthDate, scopedUnitId),
            dbModel.getAvailabilityByRange(startMonthDate, endMonthDate, scopedUnitId),
            dbModel.getUnits(),
            dbModel.getPredictionData({ startDate: startMonthDate, endDate: endMonthDate })
        ]);

        const regionaisDisponiveis = Array.from(new Set((predictionRows || []).map((r) => r.regional).filter(Boolean))).sort((a, b) =>
            a.localeCompare(b, 'pt-BR')
        );
        const unidadesPorRegional = (predictionRows || []).reduce((acc, row) => {
            const regionalKey = String(row.regional || '').trim();
            const unidadeValue = String(row.unidade || '').trim();
            if (!regionalKey || !unidadeValue) return acc;
            if (!acc[regionalKey]) acc[regionalKey] = new Set();
            acc[regionalKey].add(unidadeValue);
            return acc;
        }, {});
        const unidadesPorRegionalSerializado = Object.fromEntries(
            Object.entries(unidadesPorRegional)
                .map(([regional, set]) => [regional, Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'))])
                .sort(([a], [b]) => a.localeCompare(b, 'pt-BR'))
        );
        const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
        const q1Days = Math.min(15, daysInMonth);
        const q2Days = Math.max(daysInMonth - 15, 0);
        const mandatorySlotsQ1PerUnit = q1Days * TURNOS_ESCALA.size;
        const mandatorySlotsQ2PerUnit = q2Days * TURNOS_ESCALA.size;
        const unitsCatalog = scopedUnitId
            ? (unitsCatalogRaw || []).filter((u) => String(u.id) === String(scopedUnitId))
            : unitsCatalogRaw || [];
        const unitNameCatalog = new Map((unitsCatalog || []).map((u) => [u.id, u.nome]));
        const regionaisPorUnidade = (predictionRows || []).reduce((acc, row) => {
            const unidadeKey = normalizeText(row.unidade);
            const regionalValue = String(row.regional || '').trim();
            if (!unidadeKey || !regionalValue) return acc;
            if (!acc.has(unidadeKey)) acc.set(unidadeKey, new Set());
            acc.get(unidadeKey).add(regionalValue);
            return acc;
        }, new Map());
        const isRegionalMatch = (unidadeNome) => {
            if (!regionalFiltro) return true;
            const mapped = regionaisPorUnidade.get(normalizeText(unidadeNome));
            if (!mapped.size) return false;
            return Array.from(mapped).some((r) => normalizeText(r) === normalizeText(regionalFiltro));
        };
        const unitsCatalogFiltrado = unitsCatalog.filter((u) => isRegionalMatch(u.nome));
        const escalaRowsFiltradas = (escalaRows || []).filter((row) => {
            const unidadeNome = row.unidades.nome || unitNameCatalog.get(row.unidade_id) || '';
            return isRegionalMatch(unidadeNome);
        });
        const disponibilidadeRowsFiltradas = (disponibilidadeRows || []).filter((row) => {
            const unidadeNome = row.unidades.nome || unitNameCatalog.get(row.unidade_id) || '';
            return isRegionalMatch(unidadeNome);
        });

        const unitNameById = new Map();
        for (const u of unitsCatalogFiltrado) {
            if (u.id && u.nome) unitNameById.set(u.id, u.nome);
        }
        for (const r of disponibilidadeRowsFiltradas) {
            if (r.unidade_id && r.unidades.nome) unitNameById.set(r.unidade_id, r.unidades.nome);
        }
        for (const r of escalaRowsFiltradas) {
            if (r.unidade_id && r.unidades.nome) unitNameById.set(r.unidade_id, r.unidades.nome);
        }

        const occupiedQ1ByUnit = new Map();
        const occupiedQ2ByUnit = new Map();
        const doctorByUnit = new Map();

        for (const row of escalaRowsFiltradas) {
            const unitId = row.unidade_id;
            const unitName = unitNameById.get(unitId) || 'Unidade';
            const day = Number(String(row.data_plantao).slice(8, 10));
            const targetMap = day <= 15 ? occupiedQ1ByUnit : occupiedQ2ByUnit;
            targetMap.set(unitId, (targetMap.get(unitId) || 0) + 1); // Cada linha de escala = 1 m?dico ocupado

            const doctorKey = `${unitId}|${row.medico_id}`;
            const current = doctorByUnit.get(doctorKey) || {
                unidadeId: unitId,
                unidadeNome: unitName,
                medicoId: row.medico_id,
                nome: row.medicos.nome || 'M?dico',
                crm: row.medicos.crm || '',
                totalPlantoes: 0
            };
            current.totalPlantoes += 1;
            doctorByUnit.set(doctorKey, current);
        }

        const toOverviewArray = (mandatorySlotsPerUnit, occupiedMap) => {
            const unitIds = new Set([...unitsCatalogFiltrado.map((u) => u.id), ...occupiedMap.keys()]);
            return Array.from(unitIds)
                .map((unitId) => {
                    const totalOcupadas = occupiedMap.get(unitId) || 0;
                    let totalSlots = mandatorySlotsPerUnit;
                    if (totalSlots < totalOcupadas) totalSlots = totalOcupadas;

                    const totalVazias = Math.max(totalSlots - totalOcupadas, 0);
                    return {
                        unidadeId: unitId,
                        unidade: unitNameById.get(unitId) || unitNameCatalog.get(unitId) || 'Unidade',
                        totalSlots,
                        totalOcupadas,
                        totalVazias,
                        percentualOcupacao: totalSlots > 0 ? Number(((totalOcupadas / totalSlots) * 100).toFixed(2)) : 0
                    };
                })
                .sort((a, b) => b.totalSlots - a.totalSlots);
        };

        const acceptedByQuinzena = {
            q1: toOverviewArray(mandatorySlotsQ1PerUnit, occupiedQ1ByUnit),
            q2: toOverviewArray(mandatorySlotsQ2PerUnit, occupiedQ2ByUnit)
        };

        const q1Totals = acceptedByQuinzena.q1.reduce(
            (acc, row) => {
                acc.ocupadas += row.totalOcupadas;
                acc.vazias += row.totalVazias;
                return acc;
            },
            { ocupadas: 0, vazias: 0 }
        );
        const q2Totals = acceptedByQuinzena.q2.reduce(
            (acc, row) => {
                acc.ocupadas += row.totalOcupadas;
                acc.vazias += row.totalVazias;
                return acc;
            },
            { ocupadas: 0, vazias: 0 }
        );
        const totalOcupadasMes = q1Totals.ocupadas + q2Totals.ocupadas;
        const totalVaziasMes = q1Totals.vazias + q2Totals.vazias;
        const totalSlotsMes = totalOcupadasMes + totalVaziasMes;
        const occupancyBreakdown = [
            {
                categoria: 'Ocupadas',
                total: totalOcupadasMes,
                percentual: totalSlotsMes > 0 ? Number(((totalOcupadasMes / totalSlotsMes) * 100).toFixed(2)) : 0
            },
            {
                categoria: 'Vazias',
                total: totalVaziasMes,
                percentual: totalSlotsMes > 0 ? Number(((totalVaziasMes / totalSlotsMes) * 100).toFixed(2)) : 0
            }
        ];

        const groupedDoctors = new Map();
        for (const row of doctorByUnit.values()) {
            if (!groupedDoctors.has(row.unidadeId)) {
                groupedDoctors.set(row.unidadeId, {
                    unidadeId: row.unidadeId,
                    unidade: row.unidadeNome,
                    medicos: []
                });
            }
            groupedDoctors.get(row.unidadeId).medicos.push({
                medicoId: row.medicoId,
                nome: row.nome,
                crm: row.crm,
                totalPlantoes: row.totalPlantoes
            });
        }

        const topDoctorsByUnit = Array.from(groupedDoctors.values())
            .map((entry) => ({
                ...entry,
                medicos: entry.medicos.sort((a, b) => b.totalPlantoes - a.totalPlantoes).slice(0, 10)
            }))
            .sort((a, b) => a.unidade.localeCompare(b.unidade, 'pt-BR'));

        res.json({
            month,
            filters: {
                regionalSelecionada: regionalFiltro || '',
                regionaisDisponiveis,
                unidadesPorRegional: unidadesPorRegionalSerializado
            },
            acceptedByQuinzena,
            occupancyBreakdown,
            topDoctorsByUnit
        });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao carregar dashboard consolidado.', details: err.message });
    }
};

export const getDoctorAccesses = async (req, res) => {
    try {
        const manager = await getScopedManager(req, res);
        if (!manager) return;

        const { unidadeId } = req.query;

        // Se for Master, pode filtrar por qualquer unidade ou ver tudo.
        // Se for Gestor comum, sempre filtra pela sua pr?pria unidade.
        let targetUnitId = unidadeId;
        if (!isMasterManager(manager)) {
            targetUnitId = manager.unidade_id;
        }

        const list = targetUnitId
            ? await dbModel.getDoctorsAccessListByUnit(targetUnitId)
            : isMasterManager(manager)
                ? await dbModel.getDoctorsAccessList()
                : await dbModel.getDoctorsAccessListByUnit(manager.unidade_id);
        
        // Formatar para algo amig?vel ao frontend
        const mappedList = list.map(doc => ({
            id: doc.id,
            nome: doc.nome,
            usuario: doc.usuario || '',
            crm: doc.crm,
            telefone: doc.telefone || '',
            senha: doc.senha || '',
            especialidade: doc.especialidade,
            unidadeFixaId: doc.unidade_fixa_id,
            unidadeFixaNome: doc.unidades.nome,
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
        return res.status(400).json({ error: 'Dados insuficientes (M?dico ou Gestor faltando).' });
    }

    try {
        const manager = await dbModel.getManagerById(gestorId);
        if (!manager || (!manager.unidade_id && !isMasterManager(manager))) {
            return res.status(403).json({ error: 'Gestor sem unidade vinculada.' });
        }

        const doctor = await dbModel.getDoctorById(medicoId);
        if (!doctor) {
            return res.status(404).json({ error: 'M?dico não encontrado.' });
        }
        if (!isMasterManager(manager) && String(doctor.unidade_fixa_id) !== String(manager.unidade_id)) {
            return res.status(403).json({ error: 'Este médico não pertence à unidade do gestor.' });
        }

        const requestedUnits = Array.isArray(unidadesIds) ? unidadesIds : [];
        const scopedUnits = isMasterManager(manager)
             requestedUnits
            : requestedUnits.filter((unitId) => String(unitId) === String(manager.unidade_id));
        await dbModel.saveDoctorAccess(medicoId, scopedUnits, gestorId);
        
        res.json({ message: 'Permiss?es salvas com sucesso!' });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao salvar acessos.', details: err.message });
    }
};

export const updateDoctorProfileByManager = async (req, res) => {
    const { id } = req.params;
    const { nome, telefone, usuario, unidadeFixaId } = req.body;

    try {
        const manager = await getScopedManager(req, res);
        if (!manager) return;

        const doctor = await dbModel.getDoctorById(id);
        if (!doctor) {
            return res.status(404).json({ error: 'M?dico não encontrado.' });
        }
        if (!isMasterManager(manager) && String(doctor.unidade_fixa_id) !== String(manager.unidade_id)) {
            return res.status(403).json({ error: 'Sem permiss?o para alterar m?dico de outra unidade.' });
        }

        const payload = {};
        if (typeof nome === 'string') payload.nome = nome;
        if (typeof telefone === 'string') payload.telefone = telefone;
        if (typeof usuario === 'string') payload.usuario = usuario;
        if (isMasterManager(manager) && unidadeFixaId) {
            payload.unidadeFixaId = unidadeFixaId;
        }
        const updated = await dbModel.updateDoctorProfile(id, payload);
        res.json({ message: 'Perfil do m?dico atualizado pelo gestor.', doctor: updated });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao atualizar perfil do m?dico pelo gestor.', details: err.message });
    }
};

export const getUnitsList = async (req, res) => {
    try {
        const manager = await getScopedManager(req, res);
        if (!manager) return;

        if (isMasterManager(manager)) {
            const units = await dbModel.getUnits();
            return res.json(units);
        }

        const unit = await dbModel.getUnitById(manager.unidade_id);
        res.json(unit ? [unit] : []);
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
        const manager = await getScopedManager(req, res);
        if (!manager) return;
        if (!assertUnitScope(res, manager, unidadeId)) return;

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
        res.status(500).json({ error: 'Erro ao carregar calend?rio da unidade.', details: err.message });
    }
};

export const getManagerAgenda = async (req, res) => {
    const { unidadeId, date } = req.query;

    if (!unidadeId) {
        return res.status(400).json({ error: 'Unidade não informada.' });
    }

    if (!date) {
        return res.status(400).json({ error: 'Data não informada.' });
    }

    try {
        const manager = await getScopedManager(req, res);
        if (!manager) return;
        if (!assertUnitScope(res, manager, unidadeId)) return;

        const [unit, shifts] = await Promise.all([
            dbModel.getUnitById(unidadeId),
            dbModel.getShiftAgendaByUnitAndDate(unidadeId, date)
        ]);

        const normalizedShifts = (shifts || []).map((shift) => ({
            id: shift.id,
            unidadeId: shift.unidade_id,
            local: shift.unidades?.nome ?? unit?.nome ?? 'Unidade',
            data: shift.data_plantao,
            turno: shift.turno,
            vagasTotais: shift.vagas_totais,
            vagasOcupadas: shift.vagas_ocupadas,
            vagasDisponiveis: Math.max(shift.vagas_totais - shift.vagas_ocupadas, 0),
            status: shift.status,
            medicos: (shift.agendamentos || [])
                .filter((booking) => booking.confirmado)
                .map((booking) => ({
                    agendamentoId: booking.id,
                    medicoId: booking.medico_id,
                    tipoPlantao: booking.tipo_plantao || 'COMPLETO',
                    horaInicio: booking.hora_inicio || null,
                    horaFim: booking.hora_fim || null,
                    dataInicioFixo: booking.data_inicio_fixo || null,
                    dataFimFixo: booking.data_fim_fixo || null,
                    grupoSequenciaId: booking.grupo_sequencia_id || null,
                    nome: booking.medicos?.nome ?? 'M?dico não informado',
                    crm: booking.medicos?.crm ?? '',
                    especialidade: booking.medicos?.especialidade ?? '',
                    telefone: booking.medicos?.telefone ?? ''
                }))
        }));

        res.json({
            unit: unit || { id: unidadeId, nome: 'Unidade' },
            date,
            shifts: normalizedShifts
        });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao carregar agenda da unidade.', details: err.message });
    }
};

export const getManagerAgendaSummary = async (req, res) => {
    const { unidadeId, month } = req.query;

    if (!unidadeId) {
        return res.status(400).json({ error: 'Unidade não informada.' });
    }

    if (!month) {
        return res.status(400).json({ error: 'Mês não informado.' });
    }

    try {
        const manager = await getScopedManager(req, res);
        if (!manager) return;
        if (!assertUnitScope(res, manager, unidadeId)) return;

        const { startMonthDate, endMonthDate } = getMonthDates(month);
        const rows = await dbModel.getShiftAgendaSummaryByUnitAndMonth(unidadeId, startMonthDate, endMonthDate);

        const summaryByDate = (rows || []).reduce((accumulator, row) => {
            const current = accumulator.get(row.data_plantao) || {
                date: row.data_plantao,
                shifts: 0,
                doctorsAllocated: 0
            };

            current.shifts += 1;
            current.doctorsAllocated += (row.agendamentos || []).filter((booking) => booking.confirmado).length;
            accumulator.set(row.data_plantao, current);
            return accumulator;
        }, new Map());

        res.json({
            month,
            days: Array.from(summaryByDate.values()).map((entry) => ({
                ...entry,
                hasDoctors: entry.doctorsAllocated > 0
            }))
        });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao carregar resumo mensal da agenda.', details: err.message });
    }
};

export const createDoctor = async (req, res) => {
    const { nome, crm, especialidade, unidadeFixaId, telefone, senha, usuario } = req.body;

    try {
        const manager = await getScopedManager(req, res);
        if (!manager) return;

        if (!nome || !crm || !unidadeFixaId) {
            return res.status(400).json({ error: 'Nome, CRM e Unidade Fixa s?o obrigat?rios.' });
        }

        if (!assertUnitScope(res, manager, unidadeFixaId)) return;

        const newDoc = await dbModel.createDoctor({ nome, crm, especialidade, unidadeFixaId, telefone, senha, usuario });
        res.status(201).json({
            message: 'M?dico cadastrado com sucesso!',
            doctor: newDoc
        });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao cadastrar m?dico.', details: err.message });
    }
};

export const deleteDoctor = async (req, res) => {
    const { id } = req.params;

    try {
        const manager = await getScopedManager(req, res);
        if (!manager) return;

        const doctor = await dbModel.getDoctorById(id);
        if (!doctor) {
            return res.status(404).json({ error: 'M?dico não encontrado.' });
        }
        if (!isMasterManager(manager) && String(doctor.unidade_fixa_id) !== String(manager.unidade_id)) {
            return res.status(403).json({ error: 'Sem permiss?o para excluir m?dico de outra unidade.' });
        }

        await dbModel.deleteDoctor(id);
        res.json({ message: 'M?dico removido do sistema com sucesso!' });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao excluir m?dico.', details: err.message });
    }
};

export const getTrocasPendentesGestor = async (req, res) => {
    const { unidadeId } = req.query;

    try {
        const manager = await getScopedManager(req, res);
        if (!manager) return;
        if (isMasterManager(manager)) {
            return res.status(403).json({ error: 'Função não dispon?vel para gestor master.' });
        }

        const scopedUnitId = unidadeId || manager.unidade_id;
        if (!assertUnitScope(res, manager, scopedUnitId)) return;

        const pedidos = await dbModel.listEventosCienciaGestor(scopedUnitId);
        res.json({ pedidos });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao carregar feed de trocas.', details: err.message });
    }
};

export const postDecidirTrocaGestor = async (req, res) => {
    const { pedidoId } = req.params;
    const { aprovar } = req.body || {};

    try {
        const manager = await getScopedManager(req, res);
        if (!manager) return;
        if (isMasterManager(manager)) {
            return res.status(403).json({ error: 'Função não dispon?vel para gestor master.' });
        }

        if (typeof aprovar !== 'boolean') {
            return res.status(400).json({ error: 'Informe aprovar: true ou false.' });
        }

        const pedido = await dbModel.getPedidoTrocaById(pedidoId);
        if (!pedido) {
            return res.status(404).json({ error: 'Pedido não encontrado.' });
        }
        if (!assertUnitScope(res, manager, pedido.unidade_id)) return;

        if (aprovar) {
            // Enforce 12h rule even on manual approval
            const shiftTurnConfigs = { 'Madrugada': '01:00:00', 'Manhã': '07:00:00', 'Tarde': '13:00:00', 'Noite': '19:00:00' };
            const now = new Date();
            const checkShift = (data, turno) => {
                const time = shiftTurnConfigs[turno];
                if (!time || !data) return true; // can't validate, allow
                const shiftDateTime = new Date(`${data}T${time}-03:00`);
                return (shiftDateTime.getTime() - now.getTime()) / (1000 * 60 * 60) >= 12;
            };
            const targetOk = checkShift(pedido.data_plantao, pedido.turno);
            const offeredOk = !pedido.escala_oferecida_id || checkShift(pedido.data_plantao_oferecida, pedido.turno_oferecido);
            if (!targetOk || !offeredOk) {
                return res.status(400).json({ error: 'não ? poss?vel aprovar: um dos plant?es envolvidos est? a menos de 12h de dist?ncia.' });
            }

            await dbModel.aprovarPedidoTrocaGestorRpc(pedidoId);
            res.json({ message: 'Troca aprovada. A escala foi atualizada.' });
        } else {
            await dbModel.recusarPedidoTrocaGestor(pedidoId);
            res.json({ message: 'Pedido recusado pelo gestor.' });
        }
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

export const getAssumirPendentesGestor = async (req, res) => {
    const { unidadeId } = req.query;

    try {
        const manager = await getScopedManager(req, res);
        if (!manager) return;
        if (isMasterManager(manager)) {
            return res.status(403).json({ error: 'Função não dispon?vel para gestor master.' });
        }

        const scopedUnitId = unidadeId || manager.unidade_id;
        if (!assertUnitScope(res, manager, scopedUnitId)) return;

        const pedidos = await dbModel.listPedidosAssumirParaGestor(scopedUnitId);
        res.json({ pedidos });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao carregar pedidos de assumir.', details: err.message });
    }
};

export const postDecidirAssumirGestor = async (req, res) => {
    const { pedidoId } = req.params;
    const { aprovar } = req.body || {};

    try {
        const manager = await getScopedManager(req, res);
        if (!manager) return;
        if (isMasterManager(manager)) {
            return res.status(403).json({ error: 'Função não dispon?vel para gestor master.' });
        }

        if (typeof aprovar !== 'boolean') {
            return res.status(400).json({ error: 'Informe aprovar: true ou false.' });
        }

        const pedido = await dbModel.getPedidoAssumirById(pedidoId);
        if (!pedido) {
            return res.status(404).json({ error: 'Pedido não encontrado.' });
        }
        if (!assertUnitScope(res, manager, pedido.unidade_id)) return;

        if (aprovar) {
            await dbModel.aprovarPedidoAssumirGestorRpc(pedidoId);
            res.json({ message: 'Pedido aprovado. O m?dico foi locado na escala.' });
        } else {
            await dbModel.recusarPedidoAssumirGestor(pedidoId);
            res.json({ message: 'Pedido de assumir recusado pelo gestor.' });
        }
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

export const getCancelamentosPendentesGestor = async (req, res) => {
    const { unidadeId } = req.query;

    try {
        const manager = await getScopedManager(req, res);
        if (!manager) return;
        if (isMasterManager(manager)) {
            return res.status(403).json({ error: 'Função não dispon?vel para gestor master.' });
        }

        const scopedUnitId = unidadeId || manager.unidade_id;
        if (!assertUnitScope(res, manager, scopedUnitId)) return;

        const pedidos = await dbModel.listPedidosCancelamentoParaGestor(scopedUnitId);
        res.json({ pedidos });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao carregar pedidos de cancelamento.', details: err.message });
    }
};

export const postDecidirCancelamentoGestor = async (req, res) => {
    const { pedidoId } = req.params;
    const { aprovar } = req.body || {};

    try {
        const manager = await getScopedManager(req, res);
        if (!manager) return;
        if (isMasterManager(manager)) {
            return res.status(403).json({ error: 'Função não dispon?vel para gestor master.' });
        }

        if (typeof aprovar !== 'boolean') {
            return res.status(400).json({ error: 'Informe aprovar: true ou false.' });
        }

        if (aprovar) {
            await dbModel.aprovarPedidoCancelamentoGestorRpc(pedidoId);
            res.json({ message: 'Cancelamento aprovado. M?dico removido da escala.' });
        } else {
            await dbModel.recusarPedidoCancelamentoGestor(pedidoId);
            res.json({ message: 'Pedido de cancelamento recusado. M?dico mantido na escala.' });
        }
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

const monthBounds = (mes) => {
    const [y, mo] = mes.split('-').map(Number);
    const lastDay = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    return { start: `${mes}-01`, end: `${mes}-${String(lastDay).padStart(2, '0')}` };
};

const buildEscalaEditorResponse = (unidadeId, year, linhas, publicacoes) => {
    const pubByMes = new Map((publicacoes || []).map((p) => [p.mes, p]));
    const months = [];

    for (let m = 1; m <= 12; m += 1) {
        const mes = `${year}-${String(m).padStart(2, '0')}`;
        const { start, end } = monthBounds(mes);
        const mesLinhas = (linhas || []).filter((r) => r.data_plantao >= start && r.data_plantao <= end);
        const pub = pubByMes.get(mes);
        months.push({
            mes,
            publicacao: pub ? { status: pub.status, updated_at: pub.updated_at } : null,
            linhas: mesLinhas
        });
    }

    return { year, unidadeId, months };
};

const loadEscalaEditorFresh = async (unidadeId, year) => {
    const [linhas, publicacoes] = await Promise.all([
        dbModel.getEscalaByUnitAndYear(unidadeId, year),
        dbModel.listEscalaMesPublicacaoForUnitYear(unidadeId, year)
    ]);
    return buildEscalaEditorResponse(unidadeId, year, linhas, publicacoes);
};

const refreshEscalaEditorCache = async (unidadeId, year) => {
    try {
        if (!unidadeId || !Number.isFinite(year)) return;
        const payload = await loadEscalaEditorFresh(unidadeId, year);
        await cacheService.setJSON(escalaEditorCacheKey(unidadeId, year), payload, env.escalaEditorCacheTtlSec);
    } catch (err) {
        console.error('[cache] falha ao fazer write-through do editor:', err.message);
    }
};

const invalidateEscalaEditorCache = async (unidadeId, year) => {
    try {
        if (!unidadeId) return;
        if (year != null) {
            await cacheService.del(escalaEditorCacheKey(unidadeId, year));
            return;
        }
        await cacheService.delByPattern(escalaEditorCachePattern(unidadeId));
    } catch (err) {
        console.error('[cache] falha ao invalidar cache do editor:', err.message);
    }
};

const publishEscalaEvent = async (eventType, payload) => {
    try {
        await queueService.publish(`manager.escala.${eventType}`, {
            eventType,
            at: new Date().toISOString(),
            ...payload
        });
    } catch (err) {
        console.error('[queue] falha ao publicar evento de escala:', err.message);
    }
};

export const getEscalaEditor = async (req, res) => {
    const { unidadeId, year: yearStr } = req.query;

    if (!unidadeId || !yearStr) {
        return res.status(400).json({ error: 'Informe unidadeId e year (YYYY).' });
    }

    const year = parseInt(yearStr, 10);
    if (!Number.isFinite(year) || year < 2000 || year > 2100) {
        return res.status(400).json({ error: 'Ano invalido.' });
    }

    try {
        const manager = await getScopedManager(req, res);
        if (!manager) return;
        if (!assertUnitScope(res, manager, unidadeId)) return;

        const cacheKey = escalaEditorCacheKey(unidadeId, year);
        const cached = await cacheService.getJSON(cacheKey);
        if (cached) {
            return res.json(cached);
        }

        const responsePayload = await loadEscalaEditorFresh(unidadeId, year);
        await cacheService.setJSON(cacheKey, responsePayload, env.escalaEditorCacheTtlSec);
        res.json(responsePayload);
    } catch (err) {
        res.status(500).json({ error: 'Erro ao carregar editor de escala.', details: err.message });
    }
};

export const postEscalaLinha = async (req, res) => {
    const { unidadeId, medicoId, data_plantao, turno } = req.body || {};

    if (!unidadeId || !medicoId || !data_plantao || !turno) {
        return res.status(400).json({ error: 'Campos obrigat?rios: unidadeId, medicoId, data_plantao, turno.' });
    }

    if (!TURNOS_ESCALA.has(turno)) {
        return res.status(400).json({ error: 'Turno invalido. Use: Manhã, Tarde, Noite ou Madrugada.' });
    }

    try {
        const manager = await getScopedManager(req, res);
        if (!manager) return;
        if (!assertUnitScope(res, manager, unidadeId)) return;

        const row = await dbModel.insertEscalaRow({ unidadeId, medicoId, data_plantao, turno });
        const year = Number(String(data_plantao).slice(0, 4));
        await refreshEscalaEditorCache(unidadeId, year);
        await publishEscalaEvent('linha.criada', {
            unidadeId,
            escalaId: row.id,
            medicoId,
            data_plantao,
            turno
        });
        res.status(201).json({ id: row.id });
    } catch (err) {
        if (/duplicate|unique/i.test(err.message)) {
            return res.status(409).json({ error: 'Este m?dico j? est? locado neste turno.' });
        }
        res.status(500).json({ error: 'Erro ao inserir linha na escala.', details: err.message });
    }
};

export const patchMoverEscalaLinha = async (req, res) => {
    const { id } = req.params;
    const { unidadeId, data_plantao_destino, turno_destino } = req.body || {};

    if (!id || !unidadeId || !data_plantao_destino || !turno_destino) {
        return res.status(400).json({
            error: 'Campos obrigatorios: id, unidadeId, data_plantao_destino, turno_destino.'
        });
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(data_plantao_destino)) {
        return res.status(400).json({ error: 'data_plantao_destino deve estar no formato YYYY-MM-DD.' });
    }

    if (!TURNOS_ESCALA.has(turno_destino)) {
        return res.status(400).json({ error: 'Turno invalido. Use: Manha, Tarde, Noite ou Madrugada.' });
    }

    try {
        const manager = await getScopedManager(req, res);
        if (!manager) return;
        if (!assertUnitScope(res, manager, unidadeId)) return;

        const existingRow = await dbModel.getEscalaById(id);
        if (!existingRow || String(existingRow.unidade_id) !== String(unidadeId)) {
            return res.status(404).json({ error: 'Linha da escala não encontrada para esta unidade.' });
        }

        await dbModel.moveEscalaRowById({
            escalaId: id,
            unidadeId,
            data_plantao: data_plantao_destino,
            turno: turno_destino
        });

        const sourceYear = Number(String(existingRow.data_plantao).slice(0, 4));
        const year = Number(String(data_plantao_destino).slice(0, 4));
        await refreshEscalaEditorCache(unidadeId, year);
        if (sourceYear !== year) {
            await refreshEscalaEditorCache(unidadeId, sourceYear);
        }
        await publishEscalaEvent('linha.movida', {
            unidadeId,
            escalaId: id,
            data_plantao_destino,
            turno_destino
        });
        res.json({ ok: true });
    } catch (err) {
        if (/linha não encontrada|not found/i.test(err.message)) {
            return res.status(404).json({ error: 'Linha da escala não encontrada para esta unidade.' });
        }
        if (/duplicate|unique/i.test(err.message)) {
            return res.status(409).json({ error: 'Este m?dico j? est? locado no destino selecionado.' });
        }
        res.status(500).json({ error: 'Erro ao mover linha na escala.', details: err.message });
    }
};

export const deleteEscalaLinha = async (req, res) => {
    const { id } = req.params;
    const { unidadeId } = req.query;

    if (!unidadeId) {
        return res.status(400).json({ error: 'Informe unidadeId na query string.' });
    }

    try {
        const manager = await getScopedManager(req, res);
        if (!manager) return;
        if (!assertUnitScope(res, manager, unidadeId)) return;

        const existingRow = await dbModel.getEscalaById(id);
        await dbModel.deleteEscalaRowById(id, unidadeId);
        if (existingRow.data_plantao) {
            const year = Number(String(existingRow.data_plantao).slice(0, 4));
            await refreshEscalaEditorCache(unidadeId, year);
        } else {
            await invalidateEscalaEditorCache(unidadeId, null);
        }
        await publishEscalaEvent('linha.removida', {
            unidadeId,
            escalaId: id
        });
        res.json({ ok: true });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

export const putEscalaMesVisibilidade = async (req, res) => {
    const { unidadeId, mes, status } = req.body || {};

    if (!unidadeId || !mes || !status) {
        return res.status(400).json({ error: 'Campos obrigatorios: unidadeId, mes (YYYY-MM), status.' });
    }

    if (!/^\d{4}-\d{2}$/.test(mes)) {
        return res.status(400).json({ error: 'mes deve estar no formato YYYY-MM.' });
    }

    if (status !== 'LIBERADO' && status !== 'BLOQUEADO') {
        return res.status(400).json({ error: 'status deve ser LIBERADO ou BLOQUEADO.' });
    }

    try {
        const manager = await getScopedManager(req, res);
        if (!manager) return;
        if (!assertUnitScope(res, manager, unidadeId)) return;

        const row = await dbModel.upsertEscalaMesPublicacao({ unidadeId, mes, status });
        const year = Number(String(mes).slice(0, 4));
        await refreshEscalaEditorCache(unidadeId, year);
        await publishEscalaEvent('mes.visibilidade_atualizada', {
            unidadeId,
            mes,
            status
        });
        res.json({ publicacao: { mes: row.mes, status: row.status, updated_at: row.updated_at } });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao gravar visibilidade do mes.', details: err.message });
    }
};

const calPreviousMonthKey = (mesDestino) => {
    const [y, m] = mesDestino.split('-').map(Number);
    const anchor = new Date(Date.UTC(y, m - 1, 1));
    anchor.setUTCMonth(anchor.getUTCMonth() - 1);
    return `${anchor.getUTCFullYear()}-${String(anchor.getUTCMonth() + 1).padStart(2, '0')}`;
};

const lastDayInMonthKey = (mes) => {
    const [y, m] = mes.split('-').map(Number);
    return new Date(Date.UTC(y, m, 0)).getUTCDate();
};

const diaDoMesFromDataPlantao = (dataPlantao) => {
    if (dataPlantao == null) return NaN;
    if (typeof dataPlantao === 'string') {
        const s = dataPlantao.slice(0, 10);
        return Number(s.slice(8, 10));
    }
    if (dataPlantao instanceof Date) return dataPlantao.getUTCDate();
    return Number(String(dataPlantao).slice(8, 10));
};

const medicoIdFromEscalaRow = (r) => r.medico_id || r.medicoId || r.medicos?.id || null;

export const postImportarMesAnteriorEscala = async (req, res) => {
    const { unidadeId, mesDestino } = req.body || {};

    if (!unidadeId || !mesDestino) {
        return res.status(400).json({ error: 'Campos obrigatorios: unidadeId, mesDestino (YYYY-MM).' });
    }

    if (!/^\d{4}-\d{2}$/.test(mesDestino)) {
        return res.status(400).json({ error: 'mesDestino deve estar no formato YYYY-MM.' });
    }

    const mesOrigem = calPreviousMonthKey(mesDestino);

    try {
        const manager = await getScopedManager(req, res);
        if (!manager) return;
        if (!assertUnitScope(res, manager, unidadeId)) return;

        const origem = await dbModel.getEscalaByUnitAndMonth(unidadeId, mesOrigem);
        const destinoExistente = await dbModel.getEscalaByUnitAndMonth(unidadeId, mesDestino);
        const existe = new Set(
            (destinoExistente || []).map((r) => {
                const mid = medicoIdFromEscalaRow(r);
                const d = typeof r.data_plantao === 'string' ? r.data_plantao.slice(0, 10) : r.data_plantao;
                return `${d}|${r.turno}|${mid}`;
            })
        );

        const maxDiaDest = lastDayInMonthKey(mesDestino);
        let importadas = 0;
        let ignoradas = 0;
        let diasFora = 0;

        for (const r of origem || []) {
            if (!TURNOS_ESCALA.has(r.turno)) {
                ignoradas += 1;
                continue;
            }
            const medicoId = medicoIdFromEscalaRow(r);
            if (!medicoId) {
                ignoradas += 1;
                continue;
            }
            const dia = diaDoMesFromDataPlantao(r.data_plantao);
            if (!Number.isFinite(dia) || dia < 1) {
                ignoradas += 1;
                continue;
            }
            if (dia > maxDiaDest) {
                diasFora += 1;
                continue;
            }
            const dataNova = `${mesDestino}-${String(dia).padStart(2, '0')}`;
            const key = `${dataNova}|${r.turno}|${medicoId}`;
            if (existe.has(key)) {
                ignoradas += 1;
                continue;
            }
            try {
                await dbModel.insertEscalaRow({
                    unidadeId,
                    medicoId,
                    data_plantao: dataNova,
                    turno: r.turno
                });
                existe.add(key);
                importadas += 1;
            } catch (err) {
                if (/duplicate|unique|foreign key|violates|23505|23503/i.test(String(err.message))) {
                    ignoradas += 1;
                } else {
                    throw err;
                }
            }
        }

        const year = Number(String(mesDestino).slice(0, 4));
        await refreshEscalaEditorCache(unidadeId, year);
        await publishEscalaEvent('mes.importado_anterior', {
            unidadeId,
            mesDestino,
            mesOrigem,
            importadas,
            ignoradas
        });
        res.json({
            mesOrigem,
            mesDestino,
            importadas,
            ignoradas,
            diasNaoCopiadosMesCurto: diasFora,
            totalOrigem: (origem || []).length
        });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao importar escala do mes anterior.', details: err.message });
    }
};

export const getReportsData = async (req, res) => {
    const { month, unidadeId } = req.query;
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
        return res.status(400).json({ error: 'Informe month no formato YYYY-MM.' });
    }

    try {
        const manager = await getScopedManager(req, res);
        if (!manager) return;

        const isMaster = isMasterManager(manager);
        const unidadeIdsFromQuery = parseCsvIds(req.query.unidadeIds);
        let scopedUnitIds = null;

        if (!isMaster) {
            scopedUnitIds = [String(manager.unidade_id)];
        } else if (unidadeIdsFromQuery.length) {
            scopedUnitIds = unidadeIdsFromQuery;
        } else if (unidadeId && unidadeId !== 'all') {
            scopedUnitIds = [String(unidadeId)];
        }

        const { startMonthDate, endMonthDate } = getMonthDates(month);
        const regionalFiltro = typeof req.query?.regional === 'string' ? req.query.regional.trim() : '';
        const turnoFiltroRaw = typeof req.query?.turno === 'string' ? req.query.turno.trim() : '';
        const turnoFiltro = turnoFiltroRaw && turnoFiltroRaw.toUpperCase() !== 'ALL' ? turnoFiltroRaw.toUpperCase() : '';

        const normalizeText = (value) =>
            String(value || '')
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .trim()
                .toLowerCase();
        const normalizeTurno = (value) => normalizeText(value).toUpperCase();

        const [escalaRows, disponibilidadeRows, swapRequests, cancelamentoRows, unitsCatalogRaw, predictionRows] = await Promise.all([
            dbModel.getEscalaByRange(startMonthDate, endMonthDate, scopedUnitIds),
            dbModel.getAvailabilityByRange(startMonthDate, endMonthDate, scopedUnitIds),
            dbModel.getSwapDemandsByRange(startMonthDate, endMonthDate, scopedUnitIds),
            dbModel.getCancelamentosByRange(startMonthDate, endMonthDate, scopedUnitIds),
            dbModel.getUnits(),
            dbModel.getPredictionData({ startDate: startMonthDate, endDate: endMonthDate })
        ]);

        const regionaisDisponiveis = Array.from(new Set((predictionRows || []).map((r) => r.regional).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR'));
        const turnosDisponiveis = Array.from(new Set((predictionRows || []).map((r) => normalizeTurno(r.turno)).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR'));

        const regionaisPorUnidade = (predictionRows || []).reduce((acc, row) => {
            const unidadeKey = normalizeText(row.unidade);
            const regionalValue = String(row.regional || '').trim();
            if (!unidadeKey || !regionalValue) return acc;
            if (!acc.has(unidadeKey)) acc.set(unidadeKey, new Set());
            acc.get(unidadeKey).add(regionalValue);
            return acc;
        }, new Map());
        const unidadesPorRegional = (predictionRows || []).reduce((acc, row) => {
            const regionalKey = String(row.regional || '').trim();
            const unidadeValue = String(row.unidade || '').trim();
            if (!regionalKey || !unidadeValue) return acc;
            if (!acc[regionalKey]) acc[regionalKey] = new Set();
            acc[regionalKey].add(unidadeValue);
            return acc;
        }, {});
        const unidadesPorRegionalSerializado = Object.fromEntries(
            Object.entries(unidadesPorRegional)
                .map(([regional, set]) => [regional, Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'))])
                .sort(([a], [b]) => a.localeCompare(b, 'pt-BR'))
        );

        // 1. Occupancy Data (4 turnos obrigatorios por dia em cada unidade)
        const [reportYear, reportMonth] = month.split('-').map(Number);
        const daysInMonth = new Date(Date.UTC(reportYear, reportMonth, 0)).getUTCDate();
        const hasScopedUnitIds = Array.isArray(scopedUnitIds) && scopedUnitIds.length > 0;
        const unitsCatalog = hasScopedUnitIds
            ? (unitsCatalogRaw || []).filter((u) => scopedUnitIds.includes(String(u.id)))
            : unitsCatalogRaw || [];
        const unitNameCatalog = new Map((unitsCatalog || []).map((u) => [u.id, u.nome]));

        const unitNameById = new Map();
        unitsCatalog.forEach((u) => {
            if (u.id && u.nome) unitNameById.set(u.id, u.nome);
        });
        disponibilidadeRows.forEach((r) => {
            if (r?.unidade_id && r?.unidades?.nome) unitNameById.set(r.unidade_id, r.unidades.nome);
        });
        escalaRows.forEach((r) => {
            if (r?.unidade_id && r?.unidades?.nome) unitNameById.set(r.unidade_id, r.unidades.nome);
        });

        const isRegionalMatch = (unidadeNome) => {
            if (!regionalFiltro) return true;
            const mapped = regionaisPorUnidade.get(normalizeText(unidadeNome));
            if (!mapped || !mapped.size) return false;
            return Array.from(mapped).some((r) => normalizeText(r) === normalizeText(regionalFiltro));
        };

        const escalaRowsFiltradas = (escalaRows || []).filter((row) => {
            const unidadeNome = row?.unidades?.nome || unitNameCatalog.get(row?.unidade_id) || '';
            if (!isRegionalMatch(unidadeNome)) return false;
            if (turnoFiltro && normalizeTurno(row?.turno) !== turnoFiltro) return false;
            return true;
        });

        const swapRequestsFiltradas = (swapRequests || []).filter((row) => {
            const unidadeNome = row?.unidade?.nome || '';
            if (!isRegionalMatch(unidadeNome)) return false;
            if (turnoFiltro && normalizeTurno(row?.turno) !== turnoFiltro) return false;
            return true;
        });

        const cancelamentoRowsFiltradas = (cancelamentoRows || []).filter((row) => {
            const unidadeNome = row?.unidades?.nome || '';
            if (!isRegionalMatch(unidadeNome)) return false;
            if (turnoFiltro && normalizeTurno(row?.turno) !== turnoFiltro) return false;
            return true;
        });

        const occupiedByUnit = new Map();

        escalaRowsFiltradas.forEach(row => {
            const unitId = row?.unidade_id;
            const current = occupiedByUnit.get(unitId) || 0;
            occupiedByUnit.set(unitId, current + 1);
        });

        const unitIds = new Set([...unitsCatalog.map((u) => u.id), ...occupiedByUnit.keys()]);
        const slotsPorDia = turnoFiltro ? 1 : TURNOS_ESCALA.size;
        const occupancyByUnit = Array.from(unitIds).map(unitId => {
            const totalOcupadas = occupiedByUnit.get(unitId) || 0;
            let totalSlots = daysInMonth * slotsPorDia;
            
            // Fallback: Se não h? predi??o/disponibilidade mas h? m?dicos, assumimos que o total ? ao menos o ocupado
            if (totalSlots < totalOcupadas) totalSlots = totalOcupadas;

            const totalVazias = Math.max(totalSlots - totalOcupadas, 0);
            return {
                unidade: unitNameById.get(unitId) || unitNameCatalog.get(unitId) || 'Unidade',
                totalSlots,
                totalOcupadas,
                totalVazias,
                percentual: totalSlots > 0 ? Number(((totalOcupadas / totalSlots) * 100).toFixed(2)) : 0
            };
        }).filter((row) => isRegionalMatch(row.unidade)).sort((a, b) => b.totalSlots - a.totalSlots);

        // 2. Doctor Shifts Table
        const doctorByUnit = new Map();
        escalaRowsFiltradas.forEach(row => {
            const key = `${row.unidade_id}|${row.medico_id}`;
            if (!doctorByUnit.has(key)) {
                doctorByUnit.set(key, {
                    unidade: unitNameById.get(row.unidade_id) || 'Unidade',
                    medico: row?.medicos?.nome || 'Médico',
                    crm: row?.medicos?.crm || '',
                    total: 0
                });
            }
            doctorByUnit.get(key).total += 1;
        });
        const doctorShifts = Array.from(doctorByUnit.values()).sort((a, b) => b.total - a.total);

        // 3. Swap Demands
        const swapDemands = swapRequestsFiltradas.map(r => ({
            id: r.id,
            unidade: r?.unidade?.nome || 'Unidade',
            data: r.data_plantao,
            turno: r.turno,
            solicitante: r?.solicitante?.nome || 'Médico',
            alvo: r?.alvo?.nome || 'Médico',
            status: r.status,
            criado_em: r.created_at
        }));

        // 4. Cancelamentos
        const cancelamentos = cancelamentoRowsFiltradas.map(r => ({
            id: r.id,
            unidade: r?.unidades?.nome || 'Unidade',
            data: r.data_plantao,
            turno: r.turno,
            medico: r?.medicos?.nome || 'Médico',
            crm: r?.medicos?.crm || '',
            status: r.status,
            criado_em: r.created_at
        }));

        res.json({
            month,
            filters: {
                regionalSelecionada: regionalFiltro || '',
                turnoSelecionado: turnoFiltro || '',
                regionaisDisponiveis,
                turnosDisponiveis,
                unidadesPorRegional: unidadesPorRegionalSerializado
            },
            occupancyByUnit,
            doctorShifts,
            swapDemands,
            cancelamentos
        });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao gerar dados do relat?rio.', details: err.message });
    }
};

// --- Templates ---
export const getManagerTemplates = async (req, res) => {
    try {
        const manager = await getScopedManager(req, res);
        if (!manager) return;
        const { unidadeId } = req.query;
        if (!unidadeId) return res.status(400).json({ error: 'unidadeId ? obrigat?rio.' });
        if (!assertUnitScope(res, manager, unidadeId)) return;
        const list = await dbModel.getTemplatesByUnit(unidadeId);
        res.json(list);
    } catch (err) {
        res.status(500).json({ error: 'Falha ao listar templates', details: err.message });
    }
};

export const getManagerTemplateById = async (req, res) => {
    try {
        const manager = await getScopedManager(req, res);
        if (!manager) return;
        const { id } = req.params;
        const tpl = await dbModel.getTemplateById(id);
        if (!tpl) return res.status(404).json({ error: 'Template não existe.' });
        if (!assertUnitScope(res, manager, tpl.unidade_id)) return;
        res.json(tpl);
    } catch (err) {
        res.status(500).json({ error: 'Falha ao ler template', details: err.message });
    }
};

export const createManagerTemplate = async (req, res) => {
    try {
        const manager = await getScopedManager(req, res);
        if (!manager) return;
        const { unidadeId, nome, tipo, dias_modelo } = req.body;
        if (!unidadeId || !nome || !tipo) return res.status(400).json({ error: 'Par?metros insuficientes.' });
        if (!assertUnitScope(res, manager, unidadeId)) return;
        
        const tpl = await dbModel.createTemplate(unidadeId, nome, tipo, dias_modelo || 7);
        res.json(tpl);
    } catch (err) {
        res.status(500).json({ error: 'Cria??o falhou', details: err.message });
    }
};

export const updateManagerTemplate = async (req, res) => {
    try {
        const manager = await getScopedManager(req, res);
        if (!manager) return;
        const { id } = req.params;
        const { slots, nome } = req.body;
        const tpl = await dbModel.getTemplateById(id);
        if (!tpl) return res.status(404).json({ error: 'Template não encontrado.' });
        if (!assertUnitScope(res, manager, tpl.unidade_id)) return;
        
        if (nome) {
            await dbModel.updateTemplate(id, { nome });
        }
        
        if (slots) {
            await dbModel.saveTemplateSlots(id, slots);
        }
        
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Update falhou', details: err.message });
    }
};

export const deleteManagerTemplate = async (req, res) => {
    try {
        const manager = await getScopedManager(req, res);
        if (!manager) return;
        const { id } = req.params;
        const tpl = await dbModel.getTemplateById(id);
        if (!tpl) return res.status(404).json({ error: 'Template não encontrado.' });
        if (!assertUnitScope(res, manager, tpl.unidade_id)) return;
        await dbModel.deleteTemplate(id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Exclus?o falhou', details: err.message });
    }
};

export const postApplyTemplateToMonth = async (req, res) => {
    try {
        const manager = await getScopedManager(req, res);
        if (!manager) return;
        const { unidadeId, mesDestino, templateId, periodsFilter, startDate, endDate, dateList } = req.body;
        if (!unidadeId || !mesDestino || !templateId) return res.status(400).json({ error: 'Par?metros insuficientes.' });
        if (!assertUnitScope(res, manager, unidadeId)) return;
        
        const tpl = await dbModel.getTemplateById(templateId);
        if (!tpl || String(tpl.unidade_id) !== String(unidadeId)) return res.status(400).json({ error: 'Template inv?lido.' });
        
        let novasLinhas = [];

        if (dateList && Array.isArray(dateList)) {
            // Apply ONLY to specific dates provided in the list
            for (const dateStr of dateList) {
                // Ensure date is valid and in target month
                if (!dateStr.startsWith(mesDestino)) continue;
                
                const d = new Date(`${dateStr}T12:00:00-03:00`);
                const weekday = d.getUTCDay();
                const dayOfMonth = d.getUTCDate();
                
                const matchingSlots = tpl.slots.filter(s => {
                    const type = tpl.tipo;
                    if (type === 'FIX_DIA' || type === 'SEMANAL') return s.dia === weekday;
                    if (type === 'FIX_SEMANA') return s.dia === weekday;
                    if (type === 'FIX_QUINZENA' || type === 'QUINZENAL') {
                        const qDay = ((dayOfMonth - 1) % 15) + 1;
                        return s.dia === qDay;
                    }
                    if (type === 'MENSAL') return s.dia === dayOfMonth;
                    return false;
                });

                for (const slot of matchingSlots) {
                    novasLinhas.push({
                        unidadeId,
                        medicoId: slot.medico_id,
                        data_plantao: dateStr,
                        turno: slot.turno
                    });
                }
            }
        } else if (startDate && endDate) {
            // Apply to specific DATE RANGE (Flexible)
            const start = new Date(startDate);
            const end = new Date(endDate);
            
            for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
                const dateStr = d.toISOString().slice(0, 10);
                if (!dateStr.startsWith(mesDestino)) continue;

                const weekday = d.getUTCDay();
                const dayOfMonth = d.getUTCDate();
                
                const matchingSlots = tpl.slots.filter(s => {
                    const type = tpl.tipo;
                    if (type === 'FIX_DIA' || type === 'SEMANAL') {
                        if (tpl.dias_modelo === 5 && (weekday === 0 || weekday === 6)) return false;
                        return s.dia === weekday;
                    }
                    if (type === 'FIX_SEMANA' || (type === 'SEMANAL' && tpl.dias_modelo === 5)) {
                        if (weekday === 0 || weekday === 6) return false;
                        return s.dia === weekday;
                    }
                    if (type === 'FIX_QUINZENA' || type === 'QUINZENAL') {
                        const qDay = ((dayOfMonth - 1) % 15) + 1;
                        return s.dia === qDay;
                    }
                    if (type === 'MENSAL') return s.dia === dayOfMonth;
                    return false;
                });

                for (const slot of matchingSlots) {
                    novasLinhas.push({
                        unidadeId,
                        medicoId: slot.medico_id,
                        data_plantao: dateStr,
                        turno: slot.turno
                    });
                }
            }
        } else {
            // Logic for periods (legacy A/B weeks)
            const [year, rawMonth] = mesDestino.split('-');
            const y = Number(year);
            const m = Number(rawMonth);
            const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
            
            const hasPeriodsFilter = Array.isArray(periodsFilter) && periodsFilter.length > 0;
            
            for (let day = 1; day <= daysInMonth; day++) {
                if (hasPeriodsFilter) {
                    let currentPeriodIdx = 0;
                    if (tpl.tipo === 'SEMANAL' || tpl.tipo === 'FIX_DIA') {
                        currentPeriodIdx = Math.floor((day - 1) / 7);
                    } else if (tpl.tipo === 'QUINZENAL' || tpl.tipo === 'FIX_QUINZENA') {
                        currentPeriodIdx = day <= 15 ? 0 : 1;
                    }
                    if (!periodsFilter.includes(currentPeriodIdx)) continue;
                }

                const date = new Date(Date.UTC(y, m - 1, day));
                const weekday = date.getUTCDay();
                const dateStr = `${mesDestino}-${String(day).padStart(2, '0')}`;
                
                const matchingSlots = tpl.slots.filter(s => {
                    const type = tpl.tipo;
                    if (type === 'FIX_DIA' || type === 'SEMANAL') {
                        if (tpl.dias_modelo === 5 && (weekday === 0 || weekday === 6)) return false;
                        return s.dia === weekday;
                    }
                    if (type === 'FIX_SEMANA') {
                        if (weekday === 0 || weekday === 6) return false;
                        return s.dia === weekday;
                    }
                    if (type === 'FIX_QUINZENA' || type === 'QUINZENAL') {
                        const qDay = ((day - 1) % 15) + 1;
                        return s.dia === qDay;
                    }
                    if (type === 'MENSAL') return s.dia === day;
                    return false;
                });
                
                for (const slot of matchingSlots) {
                    novasLinhas.push({
                        unidadeId,
                        medicoId: slot.medico_id,
                        data_plantao: dateStr,
                        turno: slot.turno
                    });
                }
            }
        }
        
        let sucesso = 0;
        let pular = 0;
        for (const linha of novasLinhas) {
            try {
                await dbModel.insertEscalaRow({
                    unidadeId: linha.unidadeId,
                    medicoId: linha.medicoId,
                    data_plantao: linha.data_plantao,
                    turno: linha.turno
                });
                sucesso++;
            } catch (err) {
                pular++;
            }
        }
        const year = Number(String(mesDestino).slice(0, 4));
        await refreshEscalaEditorCache(unidadeId, year);
        await publishEscalaEvent('template.aplicado', {
            unidadeId,
            mesDestino,
            templateId,
            inseridas: sucesso,
            ignoradas: pular
        });
        res.json({ sucesso, pular, total: novasLinhas.length });
    } catch (err) {
        res.status(500).json({ error: 'Falha ao aplicar template', details: err.message });
    }
};

export const postClearMonthScale = async (req, res) => {
    try {
        const manager = await getScopedManager(req, res);
        if (!manager) return;
        const { unidadeId, mesDestino } = req.body;
        if (!unidadeId || !mesDestino) return res.status(400).json({ error: 'Par?metros insuficientes.' });
        if (!assertUnitScope(res, manager, unidadeId)) return;
        await dbModel.clearMonthScale(unidadeId, mesDestino);
        const year = Number(String(mesDestino).slice(0, 4));
        await refreshEscalaEditorCache(unidadeId, year);
        await publishEscalaEvent('mes.limpo', {
            unidadeId,
            mesDestino
        });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Falha ao limpar m?s', details: err.message });
    }
};





