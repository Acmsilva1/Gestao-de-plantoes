import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env.js';

const supabase = createClient(env.supabaseUrl, env.supabaseKey);
const HOLD_DURATION_SECONDS = 3;

const unwrap = (response, defaultMessage) => {
    if (response.error) {
        throw new Error(`${defaultMessage}: ${response.error.message}`);
    }

    return response.data;
};

export const dbModel = {
    async getUnits() {
        const response = await supabase.from('unidades').select('id, nome').order('nome', { ascending: true });
        return unwrap(response, 'Falha ao carregar unidades');
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
            .select('id, nome, crm, especialidade, unidade_fixa_id, unidades!medicos_unidade_fixa_id_fkey(nome)')
            .eq('id', medicoId)
            .maybeSingle();

        return unwrap(response, 'Falha ao carregar medico');
    },
    async getDoctorByCrm(crm) {
        const response = await supabase
            .from('medicos')
            .select('id, nome, crm, especialidade, unidade_fixa_id, unidades!medicos_unidade_fixa_id_fkey(nome)')
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
            .select('id, disponibilidade_id, medico_id, confirmado')
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
    async reserveShift(shiftId, medicoId) {
        const currentShift = await this.getShiftById(shiftId);

        if (!currentShift) {
            throw new Error('Plantao nao encontrado');
        }

        await this.ensureShiftHoldOwnership(shiftId, medicoId);

        if (medicoId) {
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
        const nextStatus = nextOccupiedSlots >= currentShift.vagas_totais ? 'LOTADO' : currentShift.status;

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
            const bookingResponse = await supabase
                .from('agendamentos')
                .upsert(
                    {
                        disponibilidade_id: shiftId,
                        medico_id: medicoId,
                        confirmado: true
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
    }
};
