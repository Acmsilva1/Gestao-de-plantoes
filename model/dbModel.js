import { createClient } from '@supabase/supabase-js';
import { env, getMissingEnvVars } from '../config/env.js';

let supabaseClient = null;
const getSupabase = () => {
    if (supabaseClient) {
        return supabaseClient;
    }

    const missingEnvVars = getMissingEnvVars();

    if (missingEnvVars.length > 0) {
        throw new Error(`Variaveis de ambiente obrigatorias ausentes: ${missingEnvVars.join(', ')}`);
    }

    supabaseClient = createClient(env.supabaseUrl, env.supabaseKey);
    return supabaseClient;
};

const supabase = new Proxy(
    {},
    {
        get(_target, prop) {
            const value = getSupabase()[prop];
            return typeof value === 'function' ? value.bind(getSupabase()) : value;
        }
    }
);
const HOLD_DURATION_SECONDS = 6;

const unwrap = (response, defaultMessage) => {
    if (response.error) {
        throw new Error(`${defaultMessage}: ${response.error.message}`);
    }

    return response.data;
};

const normalizeLabelToSlug = (rawLabel) =>
    String(rawLabel || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 24) || 'unidade';

const normalizeUsernameChunk = (rawChunk) =>
    String(rawChunk || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9.]+/g, '')
        .trim();

const buildDoctorUsernameBase = (fullName) => {
    const parts = String(fullName || '')
        .trim()
        .split(/\s+/)
        .filter(Boolean);
    if (!parts.length) return 'medico';
    const first = normalizeUsernameChunk(parts[0]) || 'medico';
    const last = normalizeUsernameChunk(parts[parts.length - 1]) || first;
    return `${first}.${last}`;
};

const PRODUCTION_UNITS_CATALOG = [
    'UTI Vitória - ES',
    'PS Vitória - ES',
    'ENFERMARIA Vitória - ES',
    'PS Vila Velha - ES',
    'PS Campo grande - RJ',
    'PS Botafogo - RS',
    'PS Barra da Tijuca - RJ',
    'PS Vitural - Web',
    'Anestesista MG',
    'PS Taguatinga - DF',
    'PS Sig - DF',
    'PS Pampulha - MG'
];

const normalizeCatalogName = (value) =>
    String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase();

const isPsUnitName = (value) => normalizeCatalogName(value).startsWith('ps ');

export const dbModel = {
    async getUnits() {
        const response = await supabase.from('unidades').select('id, nome, endereco').order('nome', { ascending: true });
        return unwrap(response, 'Falha ao carregar unidades');
    },
    async getUnitById(unidadeId) {
        const response = await supabase
            .from('unidades')
            .select('id, nome, endereco')
            .eq('id', unidadeId)
            .maybeSingle();

        return unwrap(response, 'Falha ao carregar unidade');
    },
    async ensureProductionCatalogProfiles() {
        const existingUnits = await this.getUnits();
        const byNormalizedName = new Map((existingUnits || []).map((unit) => [normalizeCatalogName(unit.nome), unit]));

        const unitsToInsert = PRODUCTION_UNITS_CATALOG
            .filter((name) => !byNormalizedName.has(normalizeCatalogName(name)))
            .map((name) => ({
                nome: name,
                endereco: null
            }));

        if (unitsToInsert.length > 0) {
            const insertUnitsResp = await supabase.from('unidades').insert(unitsToInsert);
            unwrap(insertUnitsResp, 'Falha ao criar unidades do catalogo de producao');
        }

        const allUnits = await this.getUnits();
        const targetUnits = (allUnits || []).filter((unit) =>
            PRODUCTION_UNITS_CATALOG.some((name) => normalizeCatalogName(name) === normalizeCatalogName(unit.nome))
        );
        if (!targetUnits.length) return;

        const targetUnitIds = targetUnits.map((unit) => unit.id);
        const doctorsByUnitResp = await supabase
            .from('medicos')
            .select('id, unidade_fixa_id')
            .in('unidade_fixa_id', targetUnitIds);
        const doctorsByUnit = unwrap(doctorsByUnitResp, 'Falha ao mapear medicos do catalogo de producao');
        const unitIdsWithDoctor = new Set((doctorsByUnit || []).map((doctor) => String(doctor.unidade_fixa_id)).filter(Boolean));

        for (let index = 0; index < targetUnits.length; index += 1) {
            const unit = targetUnits[index];
            if (unitIdsWithDoctor.has(String(unit.id))) continue;

            const unitSlug = normalizeLabelToSlug(unit.nome);
            const defaultUser = `medico.${unitSlug}.${String(index + 1).padStart(2, '0')}`;
            const defaultName = `Médico ${unit.nome}`;
            const specialty = isPsUnitName(unit.nome) ? 'Plantonista PS' : 'Clínico';
            const crmBase = `AUTO${String(index + 1).padStart(3, '0')}${String(unit.id || '').slice(0, 4).toUpperCase()}`;

            let crmCandidate = crmBase;
            let attempt = 0;
            while (attempt < 20) {
                const existingDoctor = await this.getDoctorByCrm(crmCandidate);
                if (!existingDoctor) break;
                attempt += 1;
                crmCandidate = `${crmBase}${attempt}`;
            }

            const doctor = await this.createDoctor({
                nome: defaultName,
                usuario: defaultUser,
                crm: crmCandidate,
                especialidade: specialty,
                unidadeFixaId: unit.id,
                telefone: '',
                senha: '12345'
            });

            const accessResp = await supabase.from('medico_acessos_unidade').upsert(
                [{ medico_id: doctor.id, unidade_id: unit.id }],
                { onConflict: 'medico_id,unidade_id' }
            );
            unwrap(accessResp, 'Falha ao garantir acesso base do medico na unidade');
        }
    },
    async getDoctors() {
        const response = await supabase
            .from('medicos')
            .select('id, nome, usuario, crm, especialidade, unidade_fixa_id, unidades!medicos_unidade_fixa_id_fkey(nome)')
            .order('nome', { ascending: true });

        return unwrap(response, 'Falha ao carregar medicos');
    },
    async getDoctorsByUnit(unidadeId) {
        const response = await supabase
            .from('medicos')
            .select('id, nome, usuario, crm, especialidade, unidade_fixa_id')
            .eq('unidade_fixa_id', unidadeId)
            .order('nome', { ascending: true });

        return unwrap(response, 'Falha ao carregar medicos da unidade');
    },
    async getDoctorById(medicoId) {
        const response = await supabase
            .from('medicos')
            .select('id, nome, usuario, crm, senha, telefone, especialidade, unidade_fixa_id, unidades!medicos_unidade_fixa_id_fkey(nome), medico_acessos_unidade(unidade_id, unidades(nome))')
            .eq('id', medicoId)
            .maybeSingle();

        return unwrap(response, 'Falha ao carregar medico');
    },
    async getDoctorByCrm(crm) {
        const response = await supabase
            .from('medicos')
            .select('id, nome, usuario, crm, senha, telefone, especialidade, unidade_fixa_id, unidades!medicos_unidade_fixa_id_fkey(nome), medico_acessos_unidade(unidade_id, unidades(nome))')
            .eq('crm', crm)
            .maybeSingle();

        return unwrap(response, 'Falha ao carregar medico por CRM');
    },
    async getHistory(unidadeId, startDate) {
        let query = supabase.from('tasy_raw_history').select('*').eq('unidade_id', unidadeId);

        if (startDate) {
            query = query.gte('data_atendimento', startDate);
        }

        const response = await query.order('data_atendimento', { ascending: false });

        return unwrap(response, 'Falha ao carregar historico');
    },
    async getHistoricalTasy(startDate = null) {
        let query = supabase.from('historico_tasy').select('*');

        if (startDate) {
            query = query.gte('data', startDate);
        }

        const response = await query.order('data', { ascending: true });
        return unwrap(response, 'Falha ao carregar historico_tasy');
    },
    async getHistoricalTasyMl() {
        const response = await supabase.from('historico_tasy_ml').select('*');
        return unwrap(response, 'Falha ao carregar historico_tasy_ml');
    },
    async getPredictionData({ startDate = null, endDate = null, unidade = null, regional = null, turno = null } = {}) {
        let query = supabase.from('dados_predicao').select('*');

        if (startDate) {
            query = query.gte('data_prevista', startDate);
        }
        if (endDate) {
            query = query.lte('data_prevista', endDate);
        }
        if (unidade) {
            query = query.eq('unidade', unidade);
        }
        if (regional) {
            query = query.eq('regional', regional);
        }
        if (turno) {
            query = query.eq('turno', turno);
        }

        const response = await query.order('data_prevista', { ascending: true });
        return unwrap(response, 'Falha ao carregar dados_predicao');
    },
    async deletePredictionDataByRange(startDate, endDate) {
        let query = supabase.from('dados_predicao').delete();

        if (startDate) {
            query = query.gte('data_prevista', startDate);
        }
        if (endDate) {
            query = query.lte('data_prevista', endDate);
        }

        const response = await query.select('data_prevista');
        return unwrap(response, 'Falha ao limpar dados_predicao');
    },
    async clearPredictionData() {
        const response = await supabase.from('dados_predicao').delete().not('data_prevista', 'is', null).select('data_prevista');
        return unwrap(response, 'Falha ao limpar todos os dados_predicao');
    },
    async upsertPredictionData(rows) {
        const sanitizedRows = (rows || []).map((row) => ({
            data_prevista: row.data_prevista,
            turno: row.turno,
            demanda_estimada: row.demanda_estimada,
            unidade: row.unidade,
            regional: row.regional,
            confianca: row.confianca,
            executado_em: row.executado_em
        }));

        const response = await supabase
            .from('dados_predicao')
            .insert(sanitizedRows)
            .select('*');

        return unwrap(response, 'Falha ao salvar dados_predicao');
    },
    async upsertHistoryRows(rows) {
        const sanitizedRows = (rows || []).map((row) => ({
            unidade_id: row.unidade_id,
            data_atendimento: row.data_atendimento,
            periodo: row.periodo ?? null,
            atendimento_count: row.atendimento_count
        }));

        const response = await supabase
            .from('tasy_raw_history')
            .upsert(sanitizedRows, {
                onConflict: 'unidade_id,data_atendimento,periodo'
            })
            .select('id, unidade_id, data_atendimento, periodo, atendimento_count');

        return unwrap(response, 'Falha ao atualizar historico');
    },
    async getAllOpenShifts() {
        const response = await supabase
            .from('disponibilidade')
            .select('id, unidade_id, data_plantao, turno, vagas_totais, vagas_ocupadas, status, unidades(nome)')
            .eq('status', 'ABERTO')
            .order('data_plantao', { ascending: true });

        return unwrap(response, 'Falha ao carregar plantoes');
    },
    async getShiftsByUnitAndMonth(unidadeId, month) {
        const monthStart = `${month}-01`;
        const [year, rawMonth] = month.split('-').map(Number);
        const monthEnd = new Date(Date.UTC(year, rawMonth, 0)).toISOString().slice(0, 10);

        const response = await supabase
            .from('disponibilidade')
            .select('id, unidade_id, data_plantao, turno, vagas_totais, vagas_ocupadas, status, unidades(nome)')
            .eq('unidade_id', unidadeId)
            .gte('data_plantao', monthStart)
            .lte('data_plantao', monthEnd)
            .order('data_plantao', { ascending: true });

        return unwrap(response, 'Falha ao carregar calendario da unidade');
    },
    async getShiftsByUnitAndMonthWithAssignments(unidadeId, month) {
        const monthStart = `${month}-01`;
        const [year, rawMonth] = month.split('-').map(Number);
        const monthEnd = new Date(Date.UTC(year, rawMonth, 0)).toISOString().slice(0, 10);

        const response = await supabase
            .from('disponibilidade')
            .select(`
                id,
                unidade_id,
                data_plantao,
                turno,
                vagas_totais,
                vagas_ocupadas,
                status,
                unidades(nome),
                agendamentos(
                    id,
                    medico_id,
                    confirmado,
                    medicos(id, nome, especialidade)
                )
            `)
            .eq('unidade_id', unidadeId)
            .gte('data_plantao', monthStart)
            .lte('data_plantao', monthEnd)
            .order('data_plantao', { ascending: true });

        return unwrap(response, 'Falha ao carregar escala da unidade com plantonistas');
    },
    async getEscalaByUnitAndMonth(unidadeId, month) {
        const monthStart = `${month}-01`;
        const [year, rawMonth] = month.split('-').map(Number);
        const monthEnd = new Date(Date.UTC(year, rawMonth, 0)).toISOString().slice(0, 10);

        const response = await supabase
            .from('escala')
            .select(
                `
                id,
                unidade_id,
                medico_id,
                data_plantao,
                turno,
                unidades(nome),
                medicos(id, nome, especialidade)
            `
            )
            .eq('unidade_id', unidadeId)
            .gte('data_plantao', monthStart)
            .lte('data_plantao', monthEnd)
            .order('data_plantao', { ascending: true });

        return unwrap(response, 'Falha ao carregar tabela escala');
    },
    async getEscalaByRange(startDate, endDate, unidadeId = null) {
        let query = supabase
            .from('escala')
            .select(
                `
                id,
                unidade_id,
                medico_id,
                data_plantao,
                turno,
                unidades(nome),
                medicos(id, nome, crm, especialidade)
            `
            )
            .gte('data_plantao', startDate)
            .lte('data_plantao', endDate)
            .order('data_plantao', { ascending: true });

        if (Array.isArray(unidadeId) && unidadeId.length) {
            query = query.in('unidade_id', unidadeId);
        } else if (unidadeId) {
            query = query.eq('unidade_id', unidadeId);
        }

        const response = await query;
        return unwrap(response, 'Falha ao carregar escala por período');
    },
    async getAvailabilityByRange(startDate, endDate, unidadeId = null) {
        let query = supabase
            .from('disponibilidade')
            .select('id, unidade_id, data_plantao, turno, unidades(nome)')
            .gte('data_plantao', startDate)
            .lte('data_plantao', endDate)
            .order('data_plantao', { ascending: true });

        if (Array.isArray(unidadeId) && unidadeId.length) {
            query = query.in('unidade_id', unidadeId);
        } else if (unidadeId) {
            query = query.eq('unidade_id', unidadeId);
        }

        const response = await query;
        return unwrap(response, 'Falha ao carregar disponibilidade por período');
    },
    async getEscalaAgendaForMedico(medicoId) {
        const response = await supabase
            .from('escala')
            .select('id, data_plantao, turno, unidade_id, unidades(nome)')
            .eq('medico_id', medicoId)
            .order('data_plantao', { ascending: true });

        return unwrap(response, 'Falha ao carregar agenda do medico na escala');
    },
    async getEscalaMedicoIdsForSlot(unidadeId, data_plantao, turno) {
        const response = await supabase
            .from('escala')
            .select('medico_id')
            .eq('unidade_id', unidadeId)
            .eq('data_plantao', data_plantao)
            .eq('turno', turno);

        const rows = unwrap(response, 'Falha ao consultar escala do turno');
        return (rows || []).map((r) => r.medico_id);
    },
    async insertEscalaRow({ unidadeId, medicoId, data_plantao, turno }) {
        const response = await supabase
            .from('escala')
            .insert({
                unidade_id: unidadeId,
                medico_id: medicoId,
                data_plantao,
                turno
            })
            .select('id');

        const data = unwrap(response, 'Falha ao inserir na escala');
        const rows = Array.isArray(data) ? data : data ? [data] : [];
        return rows[0] ?? { id: null };
    },
    async getEscalaByUnitAndYear(unidadeId, year) {
        const start = `${year}-01-01`;
        const end = `${year}-12-31`;
        const response = await supabase
            .from('escala')
            .select(
                `
                id,
                unidade_id,
                medico_id,
                data_plantao,
                turno,
                unidades(nome),
                medicos(id, nome, crm, especialidade)
            `
            )
            .eq('unidade_id', unidadeId)
            .gte('data_plantao', start)
            .lte('data_plantao', end)
            .order('data_plantao', { ascending: true });

        return unwrap(response, 'Falha ao carregar escala do ano');
    },
    async getEscalaMesPublicacao(unidadeId, mes) {
        const response = await supabase
            .from('escala_mes_publicacao')
            .select('*')
            .eq('unidade_id', unidadeId)
            .eq('mes', mes)
            .maybeSingle();

        if (response.error && /relation|does not exist/i.test(response.error.message)) {
            return null;
        }

        return unwrap(response, 'Falha ao carregar publicacao do mes');
    },
    async listEscalaMesPublicacaoForUnitYear(unidadeId, year) {
        const mesMin = `${year}-01`;
        const mesMax = `${year}-12`;
        const response = await supabase
            .from('escala_mes_publicacao')
            .select('*')
            .eq('unidade_id', unidadeId)
            .gte('mes', mesMin)
            .lte('mes', mesMax);

        if (response.error && /relation|does not exist/i.test(response.error.message)) {
            return [];
        }

        const rows = unwrap(response, 'Falha ao listar publicacoes do ano');
        return rows || [];
    },
    async upsertEscalaMesPublicacao({ unidadeId, mes, status }) {
        const response = await supabase
            .from('escala_mes_publicacao')
            .upsert(
                {
                    unidade_id: unidadeId,
                    mes,
                    status,
                    updated_at: new Date().toISOString()
                },
                { onConflict: 'unidade_id,mes' }
            )
            .select('*')
            .single();

        return unwrap(response, 'Falha ao gravar publicacao do mes');
    },
    async deleteEscalaRowById(escalaId, unidadeId) {
        const response = await supabase.from('escala').delete().eq('id', escalaId).eq('unidade_id', unidadeId).select('id').maybeSingle();

        const row = unwrap(response, 'Falha ao remover linha da escala');
        if (!row) {
            throw new Error('Linha nao encontrada ou unidade diferente.');
        }
        return row;
    },
    async moveEscalaRowById({ escalaId, unidadeId, data_plantao, turno }) {
        const response = await supabase
            .from('escala')
            .update({
                data_plantao,
                turno
            })
            .eq('id', escalaId)
            .eq('unidade_id', unidadeId)
            .select('id, unidade_id, medico_id, data_plantao, turno')
            .maybeSingle();

        const row = unwrap(response, 'Falha ao mover linha da escala');
        if (!row) {
            throw new Error('Linha nao encontrada ou unidade diferente.');
        }
        return row;
    },
    async getEscalaRowIdForMedicoSlot(unidadeId, data_plantao, turno, medicoId) {
        const response = await supabase
            .from('escala')
            .select('id')
            .eq('unidade_id', unidadeId)
            .eq('data_plantao', data_plantao)
            .eq('turno', turno)
            .eq('medico_id', medicoId)
            .maybeSingle();

        return unwrap(response, 'Falha ao localizar linha da escala');
    },
    async getPedidoTrocaById(pedidoId) {
        const response = await supabase.from('pedidos_troca_escala').select('*').eq('id', pedidoId).maybeSingle();

        return unwrap(response, 'Falha ao carregar pedido de troca');
    },
    async createPedidoTrocaEscala(row) {
        const response = await supabase
            .from('pedidos_troca_escala')
            .insert({
                unidade_id: row.unidadeId,
                data_plantao: row.dataPlantao,
                turno: row.turno,
                medico_solicitante_id: row.solicitanteId,
                medico_alvo_id: row.alvoId,
                escala_alvo_id: row.escalaAlvoId,
                escala_oferecida_id: row.escalaOferecidaId || null,
                data_plantao_oferecida: row.dataPlantaoOferecida || null,
                turno_oferecido: row.turnoOferecido || null,
                status: 'AGUARDANDO_COLEGA'
            })
            .select('*')
            .single();

        return unwrap(response, 'Falha ao criar pedido de troca');
    },
    async _enrichPedidosTrocaComMedicos(rows) {
        if (!rows?.length) return [];
        const ids = [...new Set(rows.flatMap((r) => [r.medico_solicitante_id, r.medico_alvo_id]))];
        const { data: meds, error } = await supabase.from('medicos').select('id, nome, crm, especialidade').in('id', ids);
        if (error) {
            throw new Error(`Falha ao carregar medicos dos pedidos: ${error.message}`);
        }
        const byId = Object.fromEntries((meds || []).map((m) => [m.id, m]));
        return rows.map((r) => ({
            ...r,
            solicitante: byId[r.medico_solicitante_id],
            alvo: byId[r.medico_alvo_id]
        }));
    },
    async listPedidosTrocaPorMedico(medicoId) {
        const response = await supabase
            .from('pedidos_troca_escala')
            .select('*, unidades(nome)')
            .or(`medico_solicitante_id.eq.${medicoId},medico_alvo_id.eq.${medicoId}`)
            .order('created_at', { ascending: false });

        const rows = unwrap(response, 'Falha ao listar pedidos de troca');
        return this._enrichPedidosTrocaComMedicos(rows || []);
    },
    async countPedidosTrocaAguardandoColega(medicoId) {
        const response = await supabase
            .from('pedidos_troca_escala')
            .select('id', { count: 'exact', head: true })
            .eq('medico_alvo_id', medicoId)
            .eq('status', 'AGUARDANDO_COLEGA');

        if (response.error) {
            throw new Error(`Falha ao contar pedidos: ${response.error.message}`);
        }

        return response.count ?? 0;
    },
    async responderColegaPedidoTroca(pedidoId, medicoAlvoId, aceitar) {
        const pedido = await this.getPedidoTrocaById(pedidoId);
        if (!pedido) {
            throw new Error('Pedido nao encontrado.');
        }
        if (pedido.medico_alvo_id !== medicoAlvoId) {
            throw new Error('Apenas o colega indicado pode responder a este pedido.');
        }
        if (pedido.status !== 'AGUARDANDO_COLEGA') {
            throw new Error('Este pedido nao esta aguardando resposta do colega.');
        }

        let novoStatus = aceitar ? 'AGUARDANDO_GESTOR' : 'RECUSADO_COLEGA';
        let isAutoApproved = false;

        if (aceitar) {
            try {
                const solicitante = await this.getDoctorById(pedido.medico_solicitante_id);
                const alvo = await this.getDoctorById(pedido.medico_alvo_id);
                
                if (solicitante && alvo && solicitante.especialidade === alvo.especialidade) {
                    const shiftTurnConfigs = { 'Madrugada': '01:00:00', 'Manhã': '07:00:00', 'Tarde': '13:00:00', 'Noite': '19:00:00' };
                    const shiftTime = shiftTurnConfigs[pedido.turno];
                    let hoursDiffValid = false;

                    if (shiftTime) {
                        const shiftDateTime = new Date(`${pedido.data_plantao}T${shiftTime}-03:00`);
                        const hoursDiff = (shiftDateTime.getTime() - new Date().getTime()) / (1000 * 60 * 60);
                        hoursDiffValid = hoursDiff >= 12;
                    }

                    let offeredShiftValid = true;
                    if (pedido.escala_oferecida_id && pedido.turno_oferecido) {
                        const offeredShiftTime = shiftTurnConfigs[pedido.turno_oferecido];
                        if (offeredShiftTime) {
                            const offeredShiftDateTime = new Date(`${pedido.data_plantao_oferecida}T${offeredShiftTime}-03:00`);
                            const offeredHoursDiff = (offeredShiftDateTime.getTime() - new Date().getTime()) / (1000 * 60 * 60);
                            offeredShiftValid = offeredHoursDiff >= 12;
                        } else {
                            offeredShiftValid = false;
                        }
                    }

                    if (hoursDiffValid && offeredShiftValid) {
                        isAutoApproved = true;
                    }
                }
            } catch (err) {
                console.error('Error checking auto-approve rules', err);
            }
        }

        if (isAutoApproved) {
            // Must transition to AGUARDANDO_GESTOR first so the RPC constraint is satisfied
            await supabase
                .from('pedidos_troca_escala')
                .update({
                    status: 'AGUARDANDO_GESTOR',
                    colega_respondeu_em: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                })
                .eq('id', pedidoId);
            
            await this.aprovarPedidoTrocaGestorRpc(pedidoId);
            return await this.getPedidoTrocaById(pedidoId);
        }

        const response = await supabase
            .from('pedidos_troca_escala')
            .update({
                status: novoStatus,
                colega_respondeu_em: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            .eq('id', pedidoId)
            .select('*')
            .single();

        return unwrap(response, 'Falha ao registar resposta do colega');
    },
    async listPedidosTrocaParaGestor(unidadeId) {
        let query = supabase
            .from('pedidos_troca_escala')
            .select('*, unidades(nome)')
            .eq('status', 'AGUARDANDO_GESTOR')
            .order('created_at', { ascending: true });

        if (unidadeId) {
            query = query.eq('unidade_id', unidadeId);
        }

        const response = await query;
        const rows = unwrap(response, 'Falha ao listar pedidos para o gestor');
        return this._enrichPedidosTrocaComMedicos(rows || []);
    },
    async aprovarPedidoTrocaGestorRpc(pedidoId) {
        const response = await supabase.rpc('aprovar_pedido_troca_gestor', { p_pedido_id: pedidoId });
        if (response.error) {
            throw new Error(response.error.message || 'Falha ao aprovar pedido de troca');
        }
    },
    async aprovarPedidoTrocaPorAceiteColega(pedidoId) {
        const pedido = await this.getPedidoTrocaById(pedidoId);
        if (!pedido) {
            throw new Error('Pedido nao encontrado.');
        }
        if (pedido.status !== 'AGUARDANDO_COLEGA') {
            throw new Error('Este pedido nao esta aguardando resposta do colega.');
        }

        await supabase
            .from('pedidos_troca_escala')
            .update({
                status: 'AGUARDANDO_GESTOR',
                colega_respondeu_em: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            .eq('id', pedidoId);

        await this.aprovarPedidoTrocaGestorRpc(pedidoId);
        return this.getPedidoTrocaById(pedidoId);
    },
    async recusarPedidoTrocaGestor(pedidoId) {
        const response = await supabase
            .from('pedidos_troca_escala')
            .update({
                status: 'RECUSADO_GESTOR',
                gestor_respondeu_em: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            .eq('id', pedidoId)
            .eq('status', 'AGUARDANDO_GESTOR')
            .select('*')
            .maybeSingle();

        const row = unwrap(response, 'Falha ao recusar pedido');
        if (!row) {
            throw new Error('Pedido nao encontrado ou ja decidido.');
        }
        return row;
    },
    async _enrichPedidosAssumirComMedicos(rows) {
        if (!rows?.length) return [];
        const ids = [...new Set(rows.map((r) => r.medico_solicitante_id))];
        const { data: meds, error } = await supabase.from('medicos').select('id, nome, crm, especialidade').in('id', ids);
        if (error) {
            throw new Error(`Falha ao carregar medicos dos pedidos: ${error.message}`);
        }
        const byId = Object.fromEntries((meds || []).map((m) => [m.id, m]));
        return rows.map((r) => ({
            ...r,
            solicitante: byId[r.medico_solicitante_id]
        }));
    },
    async createPedidoAssumirEscala(row) {
        const response = await supabase
            .from('pedidos_assumir_escala')
            .insert({
                unidade_id: row.unidadeId,
                data_plantao: row.dataPlantao,
                turno: row.turno,
                medico_solicitante_id: row.solicitanteId,
                status: 'AGUARDANDO_GESTOR'
            })
            .select('*')
            .single();

        return unwrap(response, 'Falha ao criar pedido de assumir');
    },
    async getPedidoAssumirById(pedidoId) {
        const response = await supabase.from('pedidos_assumir_escala').select('*').eq('id', pedidoId).maybeSingle();
        return unwrap(response, 'Falha ao carregar pedido de assumir');
    },
    async listPedidosAssumirParaGestor(unidadeId) {
        let query = supabase
            .from('pedidos_assumir_escala')
            .select('*, unidades(nome)')
            .eq('status', 'AGUARDANDO_GESTOR')
            .order('created_at', { ascending: true });

        if (unidadeId) {
            query = query.eq('unidade_id', unidadeId);
        }

        const response = await query;
        const rows = unwrap(response, 'Falha ao listar pedidos de assumir');
        return this._enrichPedidosAssumirComMedicos(rows || []);
    },
    async listEventosCienciaGestor(unidadeId) {
        let trocaQuery = supabase
            .from('pedidos_troca_escala')
            .select('*, unidades(nome)')
            .in('status', ['APROVADO', 'RECUSADO_COLEGA'])
            .order('updated_at', { ascending: false })
            .limit(200);

        if (unidadeId) {
            trocaQuery = trocaQuery.eq('unidade_id', unidadeId);
        }

        const trocaResponse = await trocaQuery;
        const trocaRows = unwrap(trocaResponse, 'Falha ao listar trocas para ciencia');
        const trocasEnriquecidas = await this._enrichPedidosTrocaComMedicos(trocaRows || []);
        const eventosTroca = trocasEnriquecidas.map((r) => ({
            ...r,
            tipo_evento: 'TROCA',
            data_evento: r.updated_at || r.created_at
        }));

        let assumirQuery = supabase
            .from('pedidos_assumir_escala')
            .select('*, unidades(nome)')
            .eq('status', 'APROVADO')
            .order('created_at', { ascending: false })
            .limit(200);

        if (unidadeId) {
            assumirQuery = assumirQuery.eq('unidade_id', unidadeId);
        }

        const assumirResponse = await assumirQuery;
        const assumirRows = unwrap(assumirResponse, 'Falha ao listar pedidos de assumir para ciencia');
        const assumirEnriquecidos = await this._enrichPedidosAssumirComMedicos(assumirRows || []);
        const eventosAssumir = assumirEnriquecidos.map((r) => ({
            ...r,
            tipo_evento: 'ASSUMIR_VAGO',
            data_evento: r.gestor_respondeu_em || r.updated_at || r.created_at
        }));

        const eventos = [...eventosTroca, ...eventosAssumir];
        eventos.sort((a, b) => {
            const left = new Date(a.data_evento || a.created_at || 0).getTime();
            const right = new Date(b.data_evento || b.created_at || 0).getTime();
            return right - left;
        });

        return eventos;
    },
    async aprovarPedidoAssumirGestorRpc(pedidoId) {
        const response = await supabase.rpc('aprovar_pedido_assumir_gestor', { p_pedido_id: pedidoId });
        if (response.error) {
            throw new Error(response.error.message || 'Falha ao aprovar pedido de assumir');
        }
    },
    async recusarPedidoAssumirGestor(pedidoId) {
        const response = await supabase
            .from('pedidos_assumir_escala')
            .update({
                status: 'RECUSADO_GESTOR',
                gestor_respondeu_em: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            .eq('id', pedidoId)
            .eq('status', 'AGUARDANDO_GESTOR')
            .select('*')
            .maybeSingle();

        const row = unwrap(response, 'Falha ao recusar pedido');
        if (!row) {
            throw new Error('Pedido nao encontrado ou ja decidido.');
        }
        return row;
    },
    async createPedidoCancelamento(row) {
        const response = await supabase
            .from('pedidos_cancelamento_escala')
            .insert({
                unidade_id: row.unidadeId,
                escala_id: row.escalaId,
                medico_id: row.medicoId,
                data_plantao: row.dataPlantao,
                turno: row.turno,
                status: 'PENDENTE'
            })
            .select('*')
            .single();
        return unwrap(response, 'Falha ao criar pedido de cancelamento');
    },
    async listPedidosCancelamentoParaGestor(unidadeId) {
        let query = supabase
            .from('pedidos_cancelamento_escala')
            .select('*, unidades(nome), medicos(id, nome, crm, especialidade)')
            .eq('status', 'PENDENTE')
            .order('created_at', { ascending: true });

        if (unidadeId) {
            query = query.eq('unidade_id', unidadeId);
        }

        const response = await query;
        return unwrap(response, 'Falha ao listar pedidos de cancelamento');
    },
    async aprovarPedidoCancelamentoGestorRpc(pedidoId) {
        const snapshotResp = await supabase
            .from('pedidos_cancelamento_escala')
            .select('*')
            .eq('id', pedidoId)
            .maybeSingle();
        const snapshot = unwrap(snapshotResp, 'Falha ao carregar pedido de cancelamento');
        if (!snapshot) {
            throw new Error('Pedido de cancelamento nao encontrado ou ja decidido.');
        }

        const response = await supabase.rpc('aprovar_pedido_cancelamento_gestor', { p_pedido_id: pedidoId });
        if (response.error) {
            throw new Error(response.error.message || 'Falha ao aprovar cancelamento de plantao');
        }

        const nowIso = new Date().toISOString();
        const updateResp = await supabase
            .from('pedidos_cancelamento_escala')
            .update({
                status: 'APROVADO',
                gestor_respondeu_em: nowIso,
                updated_at: nowIso
            })
            .eq('id', pedidoId)
            .select('*')
            .maybeSingle();

        const updated = unwrap(updateResp, 'Falha ao registar aprovacao do cancelamento');
        if (updated) {
            return updated;
        }

        const restorePayload = {
            ...snapshot,
            status: 'APROVADO',
            escala_id: null,
            gestor_respondeu_em: nowIso,
            updated_at: nowIso
        };

        const restoreResp = await supabase
            .from('pedidos_cancelamento_escala')
            .upsert(restorePayload, { onConflict: 'id' })
            .select('*')
            .maybeSingle();

        const restored = unwrap(restoreResp, 'Falha ao preservar historico do cancelamento aprovado');
        if (!restored) {
            return {
                ...snapshot,
                status: 'APROVADO',
                escala_id: null,
                gestor_respondeu_em: nowIso,
                updated_at: nowIso
            };
        }
        return restored;
    },
    async recusarPedidoCancelamentoGestor(pedidoId) {
        const response = await supabase
            .from('pedidos_cancelamento_escala')
            .update({
                status: 'RECUSADO',
                gestor_respondeu_em: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            .eq('id', pedidoId)
            .eq('status', 'PENDENTE')
            .select('*')
            .maybeSingle();

        const row = unwrap(response, 'Falha ao recusar pedido de cancelamento');
        if (!row) {
            throw new Error('Pedido de cancelamento nao encontrado ou ja decidido.');
        }
        return row;
    },
    async getCancelamentosByRange(startDate, endDate, unidadeId) {
        let query = supabase
            .from('pedidos_cancelamento_escala')
            .select('*, unidades(nome), medicos(id, nome, crm)')
            .gte('data_plantao', startDate)
            .lte('data_plantao', endDate)
            .order('data_plantao', { ascending: true });

        if (Array.isArray(unidadeId) && unidadeId.length) {
            query = query.in('unidade_id', unidadeId);
        } else if (unidadeId) {
            query = query.eq('unidade_id', unidadeId);
        }

        const response = await query;
        return unwrap(response, 'Falha ao listar cancelamentos por período') || [];
    },
    async getShiftAgendaByUnitAndDate(unidadeId, dataPlantao) {
        const response = await supabase
            .from('disponibilidade')
            .select(`
                id,
                unidade_id,
                data_plantao,
                turno,
                vagas_totais,
                vagas_ocupadas,
                status,
                unidades(nome),
                agendamentos(
                    id,
                    confirmado,
                    medico_id,
                    tipo_plantao,
                    hora_inicio,
                    hora_fim,
                    data_inicio_fixo,
                    data_fim_fixo,
                    grupo_sequencia_id,
                    medicos(
                        id,
                        nome,
                        crm,
                        especialidade,
                        telefone
                    )
                )
            `)
            .eq('unidade_id', unidadeId)
            .eq('data_plantao', dataPlantao)
            .order('data_plantao', { ascending: true });

        return unwrap(response, 'Falha ao carregar agenda da unidade');
    },
    async getShiftAgendaSummaryByUnitAndMonth(unidadeId, startDate, endDate) {
        const response = await supabase
            .from('disponibilidade')
            .select(`
                id,
                data_plantao,
                turno,
                agendamentos(
                    id,
                    confirmado
                )
            `)
            .eq('unidade_id', unidadeId)
            .gte('data_plantao', startDate)
            .lte('data_plantao', endDate)
            .order('data_plantao', { ascending: true });

        return unwrap(response, 'Falha ao carregar resumo da agenda da unidade');
    },
    async getAvailabilityByUnitAndRange(unidadeId, startDate, endDate) {
        const response = await supabase
            .from('disponibilidade')
            .select('id, unidade_id, data_plantao, turno, vagas_totais, vagas_ocupadas, status')
            .eq('unidade_id', unidadeId)
            .gte('data_plantao', startDate)
            .lte('data_plantao', endDate)
            .order('data_plantao', { ascending: true });

        return unwrap(response, 'Falha ao carregar disponibilidade da unidade');
    },
    async getShiftById(shiftId) {
        const response = await supabase
            .from('disponibilidade')
            .select('id, unidade_id, data_plantao, turno, vagas_totais, vagas_ocupadas, status, unidades(nome)')
            .eq('id', shiftId)
            .maybeSingle();

        return unwrap(response, 'Falha ao carregar plantao');
    },
    async getBookingByShiftAndDoctor(shiftId, medicoId) {
        const response = await supabase
            .from('agendamentos')
            .select('id, disponibilidade_id, medico_id, confirmado, tipo_plantao, hora_inicio, hora_fim, data_inicio_fixo, data_fim_fixo, grupo_sequencia_id')
            .eq('disponibilidade_id', shiftId)
            .eq('medico_id', medicoId)
            .maybeSingle();

        return unwrap(response, 'Falha ao carregar agendamento');
    },
    async clearExpiredShiftHolds(shiftId, referenceIso = new Date().toISOString()) {
        const response = await supabase
            .from('reserva_holds')
            .delete()
            .eq('disponibilidade_id', shiftId)
            .eq('fila_ativa', true)
            .lte('reservado_ate', referenceIso)
            .select('id');

        return unwrap(response, 'Falha ao limpar bloqueios expirados');
    },
    async getShiftHold(shiftId) {
        const response = await supabase
            .from('reserva_holds')
            .select('id, disponibilidade_id, medico_id, reservado_ate, fila_ativa')
            .eq('disponibilidade_id', shiftId)
            .maybeSingle();

        return unwrap(response, 'Falha ao carregar bloqueio temporario');
    },
    async acquireShiftHold(shiftId, medicoId, holdDurationSeconds = HOLD_DURATION_SECONDS) {
        const now = new Date();
        const nowIso = now.toISOString();
        const reservedUntilIso = new Date(now.getTime() + holdDurationSeconds * 1000).toISOString();

        await this.clearExpiredShiftHolds(shiftId, nowIso);

        const currentHold = await this.getShiftHold(shiftId);

        if (currentHold && currentHold.medico_id !== medicoId) {
            if (!currentHold.fila_ativa) {
                const activateQueueResponse = await supabase
                    .from('reserva_holds')
                    .update({
                        fila_ativa: true,
                        reservado_ate: reservedUntilIso,
                        updated_at: nowIso
                    })
                    .eq('id', currentHold.id)
                    .select('id, disponibilidade_id, medico_id, reservado_ate, fila_ativa')
                    .maybeSingle();

                unwrap(activateQueueResponse, 'Falha ao ativar fila de confirmacao');
            }

            throw new Error('Plantao em confirmacao por outro medico');
        }

        if (currentHold && currentHold.medico_id === medicoId) {
            const updateResponse = await supabase
                .from('reserva_holds')
                .update({
                    updated_at: nowIso
                })
                .eq('id', currentHold.id)
                .select('id, disponibilidade_id, medico_id, reservado_ate, fila_ativa')
                .maybeSingle();

            return unwrap(updateResponse, 'Falha ao renovar bloqueio temporario');
        }

        const insertResponse = await supabase
            .from('reserva_holds')
            .insert({
                disponibilidade_id: shiftId,
                medico_id: medicoId,
                reservado_ate: reservedUntilIso,
                fila_ativa: false,
                updated_at: nowIso
            })
            .select('id, disponibilidade_id, medico_id, reservado_ate, fila_ativa')
            .maybeSingle();

        if (!insertResponse.error) {
            return insertResponse.data;
        }

        if (insertResponse.error.code === '23505') {
            const freshHold = await this.getShiftHold(shiftId);

            if (freshHold?.medico_id === medicoId) {
                return freshHold;
            }

            throw new Error('Plantao em confirmacao por outro medico');
        }

        throw new Error(`Falha ao criar bloqueio temporario: ${insertResponse.error.message}`);
    },
    async releaseShiftHold(shiftId, medicoId) {
        const response = await supabase
            .from('reserva_holds')
            .delete()
            .eq('disponibilidade_id', shiftId)
            .eq('medico_id', medicoId)
            .select('id');

        return unwrap(response, 'Falha ao liberar bloqueio temporario');
    },
    async ensureShiftHoldOwnership(shiftId, medicoId) {
        const nowIso = new Date().toISOString();
        await this.clearExpiredShiftHolds(shiftId, nowIso);
        const hold = await this.getShiftHold(shiftId);

        if (!hold || hold.medico_id !== medicoId) {
            throw new Error('TEMPO EXCEDIDO! VAGA INDISPONIVEL!');
        }

        if (hold.fila_ativa && hold.reservado_ate <= nowIso) {
            throw new Error('TEMPO EXCEDIDO! VAGA INDISPONIVEL!');
        }

        return hold;
    },
    async upsertAvailabilityRows(rows) {
        const response = await supabase
            .from('disponibilidade')
            .upsert(rows, {
                onConflict: 'unidade_id,data_plantao,turno'
            })
            .select('id, unidade_id, data_plantao, turno, vagas_totais, vagas_ocupadas, status');

        return unwrap(response, 'Falha ao gerar previsao mensal');
    },
    async reserveShift(shiftId, medicoId, reservationData = {}) {
        const currentShift = await this.getShiftById(shiftId);

        if (!currentShift) {
            throw new Error('Plantao nao encontrado');
        }

        await this.ensureShiftHoldOwnership(shiftId, medicoId);

        if (medicoId) {
            // --- NOVA TRAVA DE SEGURANÇA (GUARDRAIL) ---
            // Verifica se o médico já tem outro plantão (em qualquer unidade) NESSE MESMO DIA E TURNO
            const conflictResponse = await supabase
                .from('agendamentos')
                .select(`
                    id,
                    disponibilidade!inner(
                        data_plantao,
                        turno,
                        unidades(nome)
                    )
                `)
                .eq('medico_id', medicoId)
                .eq('confirmado', true)
                .eq('disponibilidade.data_plantao', currentShift.data_plantao)
                .eq('disponibilidade.turno', currentShift.turno)
                .maybeSingle();

            const conflict = unwrap(conflictResponse, 'Falha ao verificar conflitos de agenda');
            if (conflict) {
                const localConflito = conflict.disponibilidade?.unidades?.nome || 'outra unidade';
                throw new Error(`CONFLITO: Você já possui um plantão em ${localConflito} neste mesmo dia e turno.`);
            }

            const existingBooking = await this.getBookingByShiftAndDoctor(shiftId, medicoId);

            if (existingBooking) {
                throw new Error('Este medico ja reservou esse plantao');
            }
        }

        if (currentShift.status !== 'ABERTO') {
            throw new Error('Plantao indisponivel para reserva');
        }

        if (currentShift.vagas_ocupadas >= currentShift.vagas_totais) {
            throw new Error('Plantao sem vagas disponiveis');
        }

        const nextOccupiedSlots = currentShift.vagas_ocupadas + 1;
        const nextStatus = nextOccupiedSlots >= currentShift.vagas_totais ? 'OCUPADO' : 'ABERTO';

        const updateResponse = await supabase
            .from('disponibilidade')
            .update({
                vagas_ocupadas: nextOccupiedSlots,
                status: nextStatus
            })
            .eq('id', shiftId)
            .eq('vagas_ocupadas', currentShift.vagas_ocupadas)
            .select('id, unidade_id, data_plantao, turno, vagas_totais, vagas_ocupadas, status, unidades(nome)')
            .maybeSingle();

        const updatedShift = unwrap(updateResponse, 'Falha ao reservar plantao');

        if (!updatedShift) {
            throw new Error('Nao foi possivel reservar o plantao. Tente novamente.');
        }

        if (medicoId) {
            const normalizedBooking = {
                tipo_plantao: reservationData.bookingType || 'COMPLETO',
                hora_inicio: reservationData.startTime || null,
                hora_fim: reservationData.endTime || null,
                data_inicio_fixo: reservationData.bookingType === 'FIXO' ? currentShift.data_plantao : null,
                data_fim_fixo: reservationData.bookingType === 'FIXO' ? reservationData.fixedEndDate || currentShift.data_plantao : null,
                grupo_sequencia_id: reservationData.bookingType === 'FIXO' ? reservationData.sequenceGroupId || null : null
            };

            const bookingResponse = await supabase
                .from('agendamentos')
                .upsert(
                    {
                        disponibilidade_id: shiftId,
                        medico_id: medicoId,
                        confirmado: true,
                        ...normalizedBooking
                    },
                    {
                        onConflict: 'disponibilidade_id,medico_id'
                    }
                )
                .select()
                .maybeSingle();

            unwrap(bookingResponse, 'Falha ao registrar agendamento');
        }

        await this.releaseShiftHold(shiftId, medicoId);

        return updatedShift;
    },
    async managerLogin(usuario, senhaUrlPlaintext) {
        const response = await supabase
            .from('gestores')
            .select('id, nome, usuario, senha, unidade_id, unidades(nome), perfis(nome)')
            .eq('usuario', usuario)
            .eq('senha', senhaUrlPlaintext)
            .maybeSingle();
            
        return unwrap(response, 'Usuário ou senha inválidos.');
    },
    async getManagerById(managerId) {
        const response = await supabase
            .from('gestores')
            .select('id, nome, usuario, senha, unidade_id, unidades(nome), perfis(nome)')
            .eq('id', managerId)
            .maybeSingle();

        return unwrap(response, 'Falha ao carregar gestor');
    },
    async listManagerProfiles() {
        const response = await supabase
            .from('gestores')
            .select('id, nome, usuario, senha, unidade_id, unidades(nome), perfis(nome)')
            .order('nome', { ascending: true });

        return unwrap(response, 'Falha ao listar gestores');
    },
    async ensureManagersPerUnit() {
        await this.ensureProductionCatalogProfiles();

        const units = await this.getUnits();
        if (!units?.length) return [];

        const perfilResp = await supabase.from('perfis').select('id').eq('nome', 'GESTOR').maybeSingle();
        let perfil = unwrap(perfilResp, 'Falha ao carregar perfil GESTOR');

        if (!perfil?.id) {
            const insertPerfilResp = await supabase.from('perfis').insert({ nome: 'GESTOR' }).select('id').single();
            perfil = unwrap(insertPerfilResp, 'Falha ao criar perfil GESTOR');
        }
        const perfilMasterResp = await supabase.from('perfis').select('id').eq('nome', 'GESTOR_MASTER').maybeSingle();
        let perfilMaster = unwrap(perfilMasterResp, 'Falha ao carregar perfil GESTOR_MASTER');
        if (!perfilMaster?.id) {
            const insertMasterResp = await supabase.from('perfis').insert({ nome: 'GESTOR_MASTER' }).select('id').single();
            perfilMaster = unwrap(insertMasterResp, 'Falha ao criar perfil GESTOR_MASTER');
        }

        const existingResp = await supabase.from('gestores').select('id, unidade_id');
        const existing = unwrap(existingResp, 'Falha ao carregar gestores existentes');
        const unitsWithManager = new Set((existing || []).map((g) => g.unidade_id).filter(Boolean));

        const rowsToInsert = [];
        for (const unit of units) {
            if (unitsWithManager.has(unit.id)) continue;
            rowsToInsert.push({
                nome: `Gestor ${unit.nome}`,
                usuario: `gestor.${normalizeLabelToSlug(unit.nome)}-${unit.id.slice(0, 6)}`,
                senha: '12345',
                perfil_id: perfil.id,
                unidade_id: unit.id
            });
        }

        if (rowsToInsert.length > 0) {
            const insertResp = await supabase.from('gestores').insert(rowsToInsert);
            if (insertResp.error) {
                if (/unidade_id|column .* does not exist/i.test(insertResp.error.message || '')) {
                    throw new Error('Falta coluna gestores.unidade_id. Execute model/gestores_por_unidade.sql no Supabase.');
                }
                throw new Error(`Falha ao criar gestores por unidade: ${insertResp.error.message}`);
            }
        }

        const masterExistsResp = await supabase
            .from('gestores')
            .select('id')
            .eq('usuario', 'gestor.master')
            .maybeSingle();
        const masterExists = unwrap(masterExistsResp, 'Falha ao verificar gestor master');

        if (!masterExists) {
            const insertMasterManagerResp = await supabase.from('gestores').insert({
                nome: 'Gestor Master',
                usuario: 'gestor.master',
                senha: '12345',
                perfil_id: perfilMaster.id,
                unidade_id: null
            });
            if (insertMasterManagerResp.error) {
                throw new Error(`Falha ao criar gestor master: ${insertMasterManagerResp.error.message}`);
            }
        }

        return this.listManagerProfiles();
    },
    async updateManagerProfile(managerId, data) {
        const response = await supabase
            .from('gestores')
            .update({
                nome: data.nome,
                usuario: data.usuario,
                senha: data.senha
            })
            .eq('id', managerId)
            .select('id, nome, usuario, senha, unidade_id, unidades(nome), perfis(nome)')
            .single();

        return unwrap(response, 'Falha ao atualizar perfil do gestor.');
    },
    async deleteManager(managerId) {
        const response = await supabase
            .from('gestores')
            .delete()
            .eq('id', managerId);
            
        return unwrap(response, 'Falha ao excluir gestor do sistema.');
    },
    async getDashboardsDataStraddle(startMonthDate, endMonthDate, unidadeId = null) {
        // Busca turnos/vagas para agregar via js
        let query = supabase
            .from('disponibilidade')
            .select('data_plantao, turno, vagas_totais, vagas_ocupadas')
            .gte('data_plantao', startMonthDate)
            .lte('data_plantao', endMonthDate);

        if (unidadeId) {
            query = query.eq('unidade_id', unidadeId);
        }

        const response = await query;

        return unwrap(response, 'Falha ao carregar dados do dashboard de disponibilidade.');
    },
    async getDashboardsDemand(startMonthDate, endMonthDate, unidadeId = null) {
        // Simulando a demanda / atendimentos usando tasy_raw_history
        let query = supabase
            .from('tasy_raw_history')
            .select('data_atendimento, atendimento_count, periodo')
            .gte('data_atendimento', startMonthDate)
            .lte('data_atendimento', endMonthDate);

        if (unidadeId) {
            query = query.eq('unidade_id', unidadeId);
        }

        const response = await query;

        return unwrap(response, 'Falha ao carregar dados do dashboard de demanda.');
    },
    async getDoctorsAccessList() {
        const response = await supabase
            .from('medicos')
            .select('id, nome, usuario, crm, especialidade, unidade_fixa_id, telefone, senha, unidades!medicos_unidade_fixa_id_fkey(nome), medico_acessos_unidade(unidade_id)')
            .order('nome', { ascending: true });

        return unwrap(response, 'Falha ao carregar lista de médicos e acessos.');
    },
    async getDoctorsAccessListByUnit(unidadeId) {
        const response = await supabase
            .from('medicos')
            .select('id, nome, usuario, crm, especialidade, unidade_fixa_id, telefone, senha, unidades!medicos_unidade_fixa_id_fkey(nome), medico_acessos_unidade(unidade_id)')
            .eq('unidade_fixa_id', unidadeId)
            .order('nome', { ascending: true });

        return unwrap(response, 'Falha ao carregar lista de médicos da unidade.');
    },
    async saveDoctorAccess(medicoId, unidadesIds, gestorId) {
        // Limpa os acessos anteriores deste medico
        const deleteResp = await supabase
            .from('medico_acessos_unidade')
            .delete()
            .eq('medico_id', medicoId);

        // Ignora erro de delete se a tabela estiver vazia (nenhuma linha para deletar é ok)
        if (deleteResp.error && !deleteResp.error.message.includes('0 rows')) {
            throw new Error(`Falha ao redefinir acessos: ${deleteResp.error.message}`);
        }

        if (!unidadesIds || unidadesIds.length === 0) return true;

        const rows = unidadesIds.map(uId => ({
            medico_id: medicoId,
            unidade_id: uId
        }));

        const insertResp = await supabase
            .from('medico_acessos_unidade')
            .insert(rows);

        return unwrap(insertResp, 'Falha ao conceder novos acessos');
    },
    async getDoctorBookedShifts(medicoId) {
        const response = await supabase
            .from('agendamentos')
            .select(`
                id,
                disponibilidade_id,
                tipo_plantao,
                hora_inicio,
                hora_fim,
                data_inicio_fixo,
                data_fim_fixo,
                grupo_sequencia_id,
                disponibilidade(
                    id, 
                    data_plantao, 
                    turno, 
                    unidades(nome)
                )
            `)
            .eq('medico_id', medicoId)
            .eq('confirmado', true)
            .order('id', { ascending: false });

        return unwrap(response, 'Falha ao recuperar sua agenda de plantões.');
    },
    async updateDoctorProfile(medicoId, data) {
        const payload = {};
        if (Object.prototype.hasOwnProperty.call(data, 'nome')) payload.nome = data.nome;
        if (Object.prototype.hasOwnProperty.call(data, 'telefone')) payload.telefone = data.telefone;
        if (Object.prototype.hasOwnProperty.call(data, 'senha')) payload.senha = data.senha;
        if (Object.prototype.hasOwnProperty.call(data, 'usuario')) payload.usuario = data.usuario;
        if (Object.prototype.hasOwnProperty.call(data, 'unidadeFixaId')) payload.unidade_fixa_id = data.unidadeFixaId;

        const response = await supabase
            .from('medicos')
            .update(payload)
            .eq('id', medicoId)
            .select()
            .single();

        return unwrap(response, 'Falha ao atualizar perfil do médico.');
    },
    async createDoctor(data) {
        const usernameBase = buildDoctorUsernameBase(data.nome);
        let nextUsername = normalizeUsernameChunk(data.usuario) || usernameBase;
        if (!nextUsername.includes('.')) {
            nextUsername = usernameBase;
        }
        let usernameAttempt = nextUsername;
        let suffix = 2;
        while (true) {
            const existsResp = await supabase.from('medicos').select('id').eq('usuario', usernameAttempt).maybeSingle();
            const exists = unwrap(existsResp, 'Falha ao validar usuário de médico');
            if (!exists) break;
            usernameAttempt = `${nextUsername}.${suffix}`;
            suffix += 1;
        }

        const response = await supabase
            .from('medicos')
            .insert({
                nome: data.nome,
                usuario: usernameAttempt,
                crm: data.crm,
                especialidade: data.especialidade,
                unidade_fixa_id: data.unidadeFixaId,
                telefone: data.telefone,
                senha: data.senha || '12345'
            })
            .select()
            .single();

        return unwrap(response, 'Falha ao cadastrar novo médico.');
    },
    async deleteDoctor(medicoId) {
        // Limpar agendamentos futuros para evitar orfandade se não for cascade
        await supabase.from('agendamentos').delete().eq('medico_id', medicoId);
        // Limpar acessos
        await supabase.from('medico_acessos_unidade').delete().eq('medico_id', medicoId);
        
        const response = await supabase
            .from('medicos')
            .delete()
            .eq('id', medicoId);

        return unwrap(response, 'Falha ao excluir médico do sistema.');
    },
    async getSwapDemandsByRange(startDate, endDate, unidadeId = null) {
        let query = supabase
            .from('pedidos_troca_escala')
            .select('*, unidade:unidades(nome), solicitante:medicos!medico_solicitante_id(nome), alvo:medicos!medico_alvo_id(nome)')
            .gte('data_plantao', startDate)
            .lte('data_plantao', endDate);

        if (Array.isArray(unidadeId) && unidadeId.length) {
            query = query.in('unidade_id', unidadeId);
        } else if (unidadeId) {
            query = query.eq('unidade_id', unidadeId);
        }

        const response = await query.order('created_at', { ascending: false });
        return unwrap(response, 'Falha ao carregar demanda de trocas por período');
    },

    // --- TEMPLATES DE ESCALA ---
    async getTemplatesByUnit(unidadeId) {
        const response = await supabase
            .from('escala_templates')
            .select('*, slots:escala_template_slots(*, medicos(nome, especialidade))')
            .eq('unidade_id', unidadeId)
            .order('nome', { ascending: true });
        return unwrap(response, 'Falha ao carregar templates');
    },

    async getTemplateById(templateId) {
        const response = await supabase
            .from('escala_templates')
            .select('id, nome, tipo, unidade_id, dias_modelo')
            .eq('id', templateId)
            .single();

        const template = unwrap(response, 'Falha ao carregar template principal');
        if (!template) return null;

        const slotsResponse = await supabase
            .from('escala_template_slots')
            .select('id, dia, turno, medico_id, medicos(nome, especialidade)')
            .eq('template_id', templateId)
            .order('dia', { ascending: true });

        template.slots = unwrap(slotsResponse, 'Falha ao carregar slots do template') || [];
        return template;
    },

    async createTemplate(unidadeId, nome, tipo, diasModelo = 7) {
        console.log('[dbModel] createTemplate:', { unidadeId, nome, tipo, diasModelo });
        const response = await supabase
            .from('escala_templates')
            .insert([{ unidade_id: unidadeId, nome, tipo, dias_modelo: diasModelo }])
            .select()
            .single();

        if (response.error) {
            console.error('[dbModel] createTemplate Error:', response.error);
        }
        return unwrap(response, 'Falha ao criar template');
    },

    async deleteTemplate(templateId) {
        const response = await supabase
            .from('escala_templates')
            .delete()
            .eq('id', templateId);
        return unwrap(response, 'Falha ao deletar template');
    },

    async updateTemplate(templateId, data) {
        const response = await supabase
            .from('escala_templates')
            .update(data)
            .eq('id', templateId)
            .select()
            .single();
        return unwrap(response, 'Falha ao atualizar template');
    },

    async saveTemplateSlots(templateId, slotsPayload) {
        // Primeiro deleta todos
        await supabase
            .from('escala_template_slots')
            .delete()
            .eq('template_id', templateId);
            
        if (!slotsPayload || slotsPayload.length === 0) return true;

        const insertData = slotsPayload.map(s => ({
            template_id: templateId,
            dia: s.dia,
            turno: s.turno,
            medico_id: s.medico_id
        }));

        const response = await supabase
            .from('escala_template_slots')
            .insert(insertData);
            
        return unwrap(response, 'Falha ao salvar slots do template');
    },

    async clearMonthScale(unidadeId, month) {
        const monthStart = `${month}-01`;
        const [year, rawMonth] = month.split('-');
        const lastDay = new Date(Date.UTC(Number(year), Number(rawMonth), 0)).getUTCDate();
        const monthEnd = `${month}-${String(lastDay).padStart(2, '0')}`;

        const response = await supabase
            .from('escala')
            .delete()
            .eq('unidade_id', unidadeId)
            .gte('data_plantao', monthStart)
            .lte('data_plantao', monthEnd);

        return unwrap(response, 'Falha ao limpar mês');
    },

    async getEscalaById(id) {
        const response = await supabase.from('escala').select('*').eq('id', id).maybeSingle();
        return unwrap(response, 'Falha ao buscar linha da escala');
    },

    async getFutureShiftsForSwap(medicoId, unidadeId) {
        const now = new Date();
        const yyyyMmDd = now.toISOString().split('T')[0];
        
        const response = await supabase
            .from('escala')
            .select('id, data_plantao, turno')
            .eq('medico_id', medicoId)
            .eq('unidade_id', unidadeId)
            .gte('data_plantao', yyyyMmDd)
            .order('data_plantao', { ascending: true });
            
        const rows = unwrap(response, 'Falha ao listar plantões futuros') || [];
        
        // Filter out shifts that are specifically in the past today
        const shiftTurnConfigs = { 'Madrugada': '01:00:00', 'Manhã': '07:00:00', 'Tarde': '13:00:00', 'Noite': '19:00:00' };
        return rows.filter(r => {
            const time = shiftTurnConfigs[r.turno];
            if (!time) return false;
            const shiftDate = new Date(`${r.data_plantao}T${time}-03:00`);
            return shiftDate.getTime() > now.getTime();
        });
    },

    // --- MÉTODOS PARA O DATA TRANSPORT (ETL) ---

    async getHistoricalPredictionStats() {
        const response = await supabase
            .from('historico_predicao')
            .select('data', { count: 'exact' })
            .order('data', { ascending: false })
            .limit(1)
            .maybeSingle();
        
        const data = unwrap(response, 'Falha ao buscar estatísticas do histórico');
        return {
            maxDate: data?.data || null
        };
    },

    async getHistoricalSourceRows(afterDate) {
        // Simulando a busca do DB Principal (Oracle/Source). 
        // No momento, buscamos de uma tabela que atua como nosso buffer de teste.
        let query = supabase.from('historico_tasy').select('*');
        
        if (afterDate) {
            query = query.gt('data', afterDate); // dt_atendimento no Oracle
        }

        const response = await query.order('data', { ascending: true });
        return unwrap(response, 'Falha ao buscar dados da fonte');
    },

    async upsertHistoricalPrediction(rows) {
        if (!rows?.length) return [];
        
        const response = await supabase
            .from('historico_predicao')
            .upsert(rows, { onConflict: 'data,turno,unidade' })
            .select('data');
            
        return unwrap(response, 'Falha ao carregar novos dados de predição');
    },

    async pruneOldHistoricalPrediction(days = 365) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);
        const isoCutoff = cutoffDate.toISOString().split('T')[0];

        const response = await supabase
            .from('historico_predicao')
            .delete()
            .lt('data', isoCutoff)
            .select('data');
            
        const rows = unwrap(response, 'Falha na limpeza do histórico');
        return rows?.length || 0;
    },

    async getHistoricalPredictionData(startDate = null) {
        let query = supabase.from('historico_predicao').select('*');
        if (startDate) {
            query = query.gte('data', startDate);
        }
        const response = await query.order('data', { ascending: true });
        return unwrap(response, 'Falha ao carregar histórico de predição');
    },

    async upsertHistoricalTasyMl(rows) {
        if (!rows || rows.length === 0) return [];
        const response = await supabase
            .from('historico_tasy_ml')
            .upsert(rows, { onConflict: 'unidade,turno,dia_semana' })
            .select('*');
        return unwrap(response, 'Falha ao salvar multiplicadores de ML');
    },

    // --- MÉTODOS ADMINISTRATIVOS (RELATÓRIOS) ---

    async getAdminProductivityReport({ startDate, endDate, medicoId, unidadeId }) {
        let query = supabase
            .from('escala')
            .select(`
                id,
                data_plantao,
                turno,
                medicos (id, nome, especialidade, crm),
                unidades (id, nome)
            `)
            .gte('data_plantao', startDate)
            .lte('data_plantao', endDate);

        if (medicoId) query = query.eq('medico_id', medicoId);
        if (unidadeId) query = query.eq('unidade_id', unidadeId);

        const response = await query.order('data_plantao', { ascending: true });
        return unwrap(response, 'Falha ao gerar relatório de produtividade');
    },

    async getAdminExchangesReport({ startDate, endDate, medicoId, unidadeId }) {
        let query = supabase
            .from('pedidos_troca_escala')
            .select(`
                id,
                data_plantao,
                turno,
                status,
                created_at,
                medico_solicitante:medicos!medico_solicitante_id (nome),
                medico_alvo:medicos!medico_alvo_id (nome),
                unidades (nome)
            `)
            .gte('data_plantao', startDate)
            .lte('data_plantao', endDate);

        if (medicoId) {
            query = query.or(`medico_solicitante_id.eq.${medicoId},medico_alvo_id.eq.${medicoId}`);
        }
        if (unidadeId) query = query.eq('unidade_id', unidadeId);

        const response = await query.order('data_plantao', { ascending: true });
        return unwrap(response, 'Falha ao gerar relatório de trocas');
    },

    async getAdminCancellationsReport({ startDate, endDate, medicoId, unidadeId }) {
        // Assumindo estrutura similar à escala/trocas
        let query = supabase
            .from('pedidos_cancelamento_escala')
            .select(`
                *,
                medicos (nome),
                unidades (nome)
            `)
            .gte('created_at', `${startDate}T00:00:00Z`)
            .lte('created_at', `${endDate}T23:59:59Z`);

        if (medicoId) query = query.eq('medico_id', medicoId);
        if (unidadeId) query = query.eq('unidade_id', unidadeId);

        const response = await query.order('created_at', { ascending: false });
        return unwrap(response, 'Falha ao gerar relatório de cancelamentos');
    },

    async updateAdminProfile(adminId, data) {
        const response = await supabase
            .from('admins')
            .update(data)
            .eq('id', adminId)
            .select('*')
            .single();

        return unwrap(response, 'Falha ao atualizar perfil de administrador');
    },

    async updatePipelineStatus(data) {
        const response = await supabase
            .from('pipeline_status')
            .upsert({ id: 'main_etl', ...data, updated_at: new Date().toISOString() })
            .select('*')
            .single();

        return unwrap(response, 'Falha ao atualizar status da pipeline');
    },

    async getPipelineStatus() {
        const response = await supabase
            .from('pipeline_status')
            .select('*')
            .eq('id', 'main_etl')
            .maybeSingle();

        return unwrap(response, 'Falha ao buscar status da pipeline');
    },

    async getHistoricalAttendance({ unidadeIds, startDate, endDate }) {
        let query = supabase
        const now = new Date();
        const yyyyMmDd = now.toISOString().split('T')[0];
        
        const response = await supabase
            .from('escala')
            .select('id, data_plantao, turno')
            .eq('medico_id', medicoId)
            .eq('unidade_id', unidadeId)
            .gte('data_plantao', yyyyMmDd)
            .order('data_plantao', { ascending: true });
            
        const rows = unwrap(response, 'Falha ao listar plantões futuros') || [];
        
        // Filter out shifts that are specifically in the past today
        const shiftTurnConfigs = { 'Madrugada': '01:00:00', 'Manhã': '07:00:00', 'Tarde': '13:00:00', 'Noite': '19:00:00' };
        return rows.filter(r => {
            const time = shiftTurnConfigs[r.turno];
            if (!time) return false;
            const shiftDate = new Date(`${r.data_plantao}T${time}-03:00`);
            return shiftDate.getTime() > now.getTime();
        });
    },

    // --- MÉTODOS PARA O DATA TRANSPORT (ETL) ---

    async getHistoricalPredictionStats() {
        const response = await supabase
            .from('historico_predicao')
            .select('data', { count: 'exact' })
            .order('data', { ascending: false })
            .limit(1)
            .maybeSingle();
        
        const data = unwrap(response, 'Falha ao buscar estatísticas do histórico');
        return {
            maxDate: data?.data || null
        };
    },

    async getHistoricalSourceRows(afterDate) {
        // Simulando a busca do DB Principal (Oracle/Source). 
        // No momento, buscamos de uma tabela que atua como nosso buffer de teste.
        let query = supabase.from('historico_tasy').select('*');
        
        if (afterDate) {
            query = query.gt('data', afterDate); // dt_atendimento no Oracle
        }

        const response = await query.order('data', { ascending: true });
        return unwrap(response, 'Falha ao buscar dados da fonte');
    },

    async upsertHistoricalPrediction(rows) {
        if (!rows?.length) return [];
        
        const response = await supabase
            .from('historico_predicao')
            .upsert(rows, { onConflict: 'data,turno,unidade' })
            .select('data');
            
        return unwrap(response, 'Falha ao carregar novos dados de predição');
    },

    async pruneOldHistoricalPrediction(days = 365) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);
        const isoCutoff = cutoffDate.toISOString().split('T')[0];

        const response = await supabase
            .from('historico_predicao')
            .delete()
            .lt('data', isoCutoff)
            .select('data');
            
        const rows = unwrap(response, 'Falha na limpeza do histórico');
        return rows?.length || 0;
    },

    async getHistoricalPredictionData(startDate = null) {
        let query = supabase.from('historico_predicao').select('*');
        if (startDate) {
            query = query.gte('data', startDate);
        }
        const response = await query.order('data', { ascending: true });
        return unwrap(response, 'Falha ao carregar histórico de predição');
    },

    async upsertHistoricalTasyMl(rows) {
        if (!rows || rows.length === 0) return [];
        const response = await supabase
            .from('historico_tasy_ml')
            .upsert(rows, { onConflict: 'unidade,turno,dia_semana' })
            .select('*');
        return unwrap(response, 'Falha ao salvar multiplicadores de ML');
    },

    // --- MÉTODOS ADMINISTRATIVOS (RELATÓRIOS) ---

    async getAdminProductivityReport({ startDate, endDate, medicoId, unidadeId }) {
        let query = supabase
            .from('escala')
            .select(`
                id,
                data_plantao,
                turno,
                medicos (id, nome, especialidade, crm),
                unidades (id, nome)
            `)
            .gte('data_plantao', startDate)
            .lte('data_plantao', endDate);

        if (medicoId) query = query.eq('medico_id', medicoId);
        if (unidadeId) query = query.eq('unidade_id', unidadeId);

        const response = await query.order('data_plantao', { ascending: true });
        return unwrap(response, 'Falha ao gerar relatório de produtividade');
    },

    async getAdminExchangesReport({ startDate, endDate, medicoId, unidadeId }) {
        let query = supabase
            .from('pedidos_troca_escala')
            .select(`
                id,
                data_plantao,
                turno,
                status,
                created_at,
                medico_solicitante:medicos!medico_solicitante_id (nome),
                medico_alvo:medicos!medico_alvo_id (nome),
                unidades (nome)
            `)
            .gte('data_plantao', startDate)
            .lte('data_plantao', endDate);

        if (medicoId) {
            query = query.or(`medico_solicitante_id.eq.${medicoId},medico_alvo_id.eq.${medicoId}`);
        }
        if (unidadeId) query = query.eq('unidade_id', unidadeId);

        const response = await query.order('data_plantao', { ascending: true });
        return unwrap(response, 'Falha ao gerar relatório de trocas');
    },

    async getAdminCancellationsReport({ startDate, endDate, medicoId, unidadeId }) {
        // Assumindo estrutura similar à escala/trocas
        let query = supabase
            .from('pedidos_cancelamento_escala')
            .select(`
                *,
                medicos (nome),
                unidades (nome)
            `)
            .gte('created_at', `${startDate}T00:00:00Z`)
            .lte('created_at', `${endDate}T23:59:59Z`);

        if (medicoId) query = query.eq('medico_id', medicoId);
        if (unidadeId) query = query.eq('unidade_id', unidadeId);

        const response = await query.order('created_at', { ascending: false });
        return unwrap(response, 'Falha ao gerar relatório de cancelamentos');
    },

    async updateAdminProfile(adminId, data) {
        const response = await supabase
            .from('admins')
            .update(data)
            .eq('id', adminId)
            .select('*')
            .single();

        return unwrap(response, 'Falha ao atualizar perfil de administrador');
    },

    async updatePipelineStatus(data) {
        const response = await supabase
            .from('pipeline_status')
            .upsert({ id: 'main_etl', ...data, updated_at: new Date().toISOString() })
            .select('*')
            .single();

        return unwrap(response, 'Falha ao atualizar status da pipeline');
    },

    async getPipelineStatus() {
        const response = await supabase
            .from('pipeline_status')
            .select('*')
            .eq('id', 'main_etl')
            .maybeSingle();

        return unwrap(response, 'Falha ao buscar status da pipeline');
    },

    async getHistoricalAttendance({ unidadeIds, startDate, endDate }) {
        // Obter os nomes das unidades para filtrar a tabela de texto historico_tasy
        let unitNames = [];
        if (unidadeIds && unidadeIds.length > 0 && !unidadeIds.includes('all')) {
            const units = await this.getUnits();
            unitNames = units
                .filter(u => unidadeIds.includes(String(u.id)))
                .map(u => u.nome);
        }

        let query = supabase
            .from('historico_tasy')
            .select('*')
            .gte('data', startDate)
            .lte('data', endDate);

        // Se houver filtro de unidade, tentamos um match parcial no campo de texto 'unidade'
        if (unitNames.length > 0) {
            // Construímos um filtro OR para os nomes das unidades
            const filters = unitNames.map(name => {
                // Remove prefixos comuns e UF para melhor match (ex: PS Sig - DF -> PS Sig)
                const clean = name.replace(/\s*-\s*\w{2}$/, '').trim();
                return `unidade.ilike.%${clean}%`;
            });
            query = query.or(filters.join(','));
        }

        const response = await query.order('data', { ascending: true });
        const data = unwrap(response, 'Falha ao buscar atendimentos históricos de historico_tasy');

        // Mapear para o formato esperado pelo ManagerService
        return (data || []).map(row => ({
            data_atendimento: row.data,
            periodo: row.turno,
            atendimento_count: row.total_atendimentos,
            unidade_id: row.unidade, // Usamos o texto original como ID temporário para agrupamento
            unidade_nome: row.unidade
        }));
    }
};
