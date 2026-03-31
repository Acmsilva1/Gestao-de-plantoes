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
    async getDoctors() {
        const response = await supabase
            .from('medicos')
            .select('id, nome, crm, especialidade, unidade_fixa_id, unidades!medicos_unidade_fixa_id_fkey(nome)')
            .order('nome', { ascending: true });

        return unwrap(response, 'Falha ao carregar medicos');
    },
    async getDoctorsByUnit(unidadeId) {
        const response = await supabase
            .from('medicos')
            .select('id, nome, crm, especialidade, unidade_fixa_id')
            .eq('unidade_fixa_id', unidadeId)
            .order('nome', { ascending: true });

        return unwrap(response, 'Falha ao carregar medicos da unidade');
    },
    async getDoctorById(medicoId) {
        const response = await supabase
            .from('medicos')
            .select('id, nome, crm, senha, telefone, especialidade, unidade_fixa_id, unidades!medicos_unidade_fixa_id_fkey(nome), medico_acessos_unidade(unidade_id, unidades(nome))')
            .eq('id', medicoId)
            .maybeSingle();

        return unwrap(response, 'Falha ao carregar medico');
    },
    async getDoctorByCrm(crm) {
        const response = await supabase
            .from('medicos')
            .select('id, nome, crm, senha, telefone, especialidade, unidade_fixa_id, unidades!medicos_unidade_fixa_id_fkey(nome), medico_acessos_unidade(unidade_id, unidades(nome))')
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
            .select('id')
            .single();

        return unwrap(response, 'Falha ao inserir na escala');
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

        const novoStatus = aceitar ? 'AGUARDANDO_GESTOR' : 'RECUSADO_COLEGA';
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
            .select('id, nome, crm, especialidade, unidade_fixa_id, telefone, senha, unidades!medicos_unidade_fixa_id_fkey(nome), medico_acessos_unidade(unidade_id)')
            .order('nome', { ascending: true });

        return unwrap(response, 'Falha ao carregar lista de médicos e acessos.');
    },
    async getDoctorsAccessListByUnit(unidadeId) {
        const response = await supabase
            .from('medicos')
            .select('id, nome, crm, especialidade, unidade_fixa_id, telefone, senha, unidades!medicos_unidade_fixa_id_fkey(nome), medico_acessos_unidade(unidade_id)')
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
        const response = await supabase
            .from('medicos')
            .insert({
                nome: data.nome,
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
    }
};
