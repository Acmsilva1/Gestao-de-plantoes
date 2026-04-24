import crypto from 'crypto';

async function migrateStoreSchema(store) {
    store.addColumnIfMissing('pedidos_assumir_escala', 'gestor_respondeu_em', null);
}

function rowCount(store, table) {
    try {
        return store.countAll(table);
    } catch {
        return -1;
    }
}

const TURNOS_ESCALA = ['Manhã', 'Tarde', 'Noite', 'Madrugada'];

function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i += 1) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

export async function seedEscalaAbrilMaioVariadaStore(store) {
    const year = new Date().getFullYear();
    const start = `${year}-04-01`;
    const end = `${year}-05-31`;
    const minRows = 450;

    const escalaRows = store.getMutableRows('escala');
    const cnt = escalaRows.filter((r) => r.data_plantao >= start && r.data_plantao <= end).length;
    if (cnt >= minRows) return;
    if (cnt > 0) {
        store.removeWhereFn('escala', (r) => r.data_plantao >= start && r.data_plantao <= end);
    }

    const units = store.select('unidades', [], ['nome ASC'], null);
    const allMedicos = store.getMutableRows('medicos');
    const fallback = allMedicos.map((m) => m.id).filter(Boolean);
    if (!units.length || !fallback.length) return;

    const medByUnit = new Map();
    for (const m of allMedicos) {
        if (!m.unidade_fixa_id) continue;
        const k = String(m.unidade_fixa_id);
        if (!medByUnit.has(k)) medByUnit.set(k, []);
        medByUnit.get(k).push(m.id);
    }

    const basesAlta = 0.9;
    const basesMedia = 0.52;
    const basesBaixa = 0.2;

    const inserts = [];
    let unitIndex = 0;

    for (const u of units) {
        const uid = String(u.id);
        let pool = medByUnit.get(uid) || [];
        if (!pool.length) pool = fallback;

        const perfil = unitIndex % 3;
        const baseCore = perfil === 0 ? basesAlta : perfil === 1 ? basesMedia : basesBaixa;
        unitIndex += 1;

        for (let month = 4; month <= 5; month += 1) {
            const dim = new Date(Date.UTC(year, month, 0)).getUTCDate();
            const mo = String(month).padStart(2, '0');

            for (let day = 1; day <= dim; day += 1) {
                const ds = `${year}-${mo}-${String(day).padStart(2, '0')}`;
                const dow = new Date(`${ds}T12:00:00Z`).getUTCDay();
                let base = baseCore;
                if (dow === 0 || dow === 6) base *= 0.68;
                if (day <= 15) base += 0.05;
                else base -= 0.06;
                base = Math.min(0.96, Math.max(0.06, base));

                TURNOS_ESCALA.forEach((turno, ti) => {
                    const key = `${uid}|${ds}|${turno}`;
                    const h = hashStr(key);
                    const jitter = (((h >> 4) % 27) - 13) / 130;
                    let p = base + jitter;
                    p = Math.min(0.97, Math.max(0.04, p));
                    const roll = h % 10000;
                    const cutoff = Math.round(p * 10000);
                    if (roll >= cutoff) return;
                    const medId = pool[(h + ti + day) % pool.length];
                    inserts.push({ id: crypto.randomUUID(), unidade_id: uid, medico_id: medId, data_plantao: ds, turno });
                });
            }
        }
    }

    for (const row of inserts) {
        store.insert('escala', row);
    }

    for (const u of units) {
        const uid = String(u.id);
        for (const mes of [`${year}-04`, `${year}-05`]) {
            store.delete('escala_mes_publicacao', [
                { type: '=', col: 'unidade_id', val: uid },
                { type: '=', col: 'mes', val: mes }
            ]);
            store.insert('escala_mes_publicacao', {
                id: crypto.randomUUID(),
                unidade_id: uid,
                mes,
                status: 'LIBERADO'
            });
        }
    }
}

/**
 * Preenche tabelas vazias (dev) sobre o orquestrador CSV em memória.
 */
export async function runLocalSyntheticSeedIntoStore(store) {
    await migrateStoreSchema(store);

    const unit = store.select('unidades', [], ['nome ASC'], 1)[0];
    const medicos = store.select('medicos', [], ['nome ASC'], 8);
    if (!unit?.id || medicos.length === 0) return;

    const m0 = medicos[0].id;
    const m1 = medicos.length > 1 ? medicos[1].id : m0;

    if (rowCount(store, 'historico_tasy') === 0) {
        store.insert('historico_tasy', {
            id: crypto.randomUUID(),
            data: '2024-06-01',
            turno: 'Manhã',
            total_atendimentos: 120,
            unidade: 'Sintético local',
            regional: 'SUDESTE'
        });
    }

    if (rowCount(store, 'historico_tasy_ml') === 0) {
        store.insert('historico_tasy_ml', {
            data: '2024-06-01',
            ano: 2024,
            mes: 6,
            dia: 1,
            dia_semana: 6,
            turno_id: 'Manha',
            regional_id: 'SE',
            unidade_id: unit.id,
            total_atendimentos: 45
        });
    }

    if (rowCount(store, 'dados_predicao') === 0) {
        store.insert('dados_predicao', {
            id: crypto.randomUUID(),
            data_prevista: '2024-07-15',
            turno: 'Tarde',
            demanda_estimada: 72,
            unidade: 'Sintético local',
            regional: 'SUD',
            executado_em: new Date().toISOString(),
            confianca: 0.81
        });
    }

    if (rowCount(store, 'tasy_raw_history') === 0) {
        const existing = store.findFirstMutable(
            'tasy_raw_history',
            (r) => r.unidade_id === unit.id && r.data_atendimento === '2024-06-01' && r.periodo === 'Manhã'
        );
        if (!existing) {
            store.insert('tasy_raw_history', {
                id: crypto.randomUUID(),
                unidade_id: unit.id,
                data_atendimento: '2024-06-01',
                periodo: 'Manhã',
                atendimento_count: 33
            });
        }
    }

    if (rowCount(store, 'medico_acessos_unidade') === 0) {
        store.insert('medico_acessos_unidade', {
            id: crypto.randomUUID(),
            medico_id: m0,
            unidade_id: unit.id
        });
    }

    let dispId = null;
    if (rowCount(store, 'disponibilidade') === 0) {
        dispId = crypto.randomUUID();
        store.insert('disponibilidade', {
            id: dispId,
            unidade_id: unit.id,
            data_plantao: '2024-08-15',
            turno: 'Noite',
            vagas_totais: 4,
            vagas_ocupadas: 1,
            status: 'ABERTO'
        });
    } else {
        const d = store.select('disponibilidade', [], [], 1)[0];
        dispId = d?.id ?? null;
    }

    if (rowCount(store, 'escala') === 0) {
        store.insert('escala', {
            id: crypto.randomUUID(),
            unidade_id: unit.id,
            medico_id: m0,
            data_plantao: '2024-08-15',
            turno: 'Noite'
        });
    }

    if (rowCount(store, 'escala_mes_publicacao') === 0) {
        store.insert('escala_mes_publicacao', {
            id: crypto.randomUUID(),
            unidade_id: unit.id,
            mes: '2024-08',
            status: 'LIBERADO'
        });
    }

    if (dispId && rowCount(store, 'agendamentos') === 0) {
        store.insert('agendamentos', {
            id: crypto.randomUUID(),
            disponibilidade_id: dispId,
            medico_id: m0,
            confirmado: 1
        });
    }

    if (dispId && rowCount(store, 'reserva_holds') === 0) {
        const ate = new Date(Date.now() + 15 * 60 * 1000).toISOString();
        store.insert('reserva_holds', {
            id: crypto.randomUUID(),
            disponibilidade_id: dispId,
            medico_id: m0,
            reservado_ate: ate,
            fila_ativa: 0
        });
    }

    if (rowCount(store, 'pedidos_assumir_escala') === 0) {
        store.insert('pedidos_assumir_escala', {
            id: crypto.randomUUID(),
            unidade_id: unit.id,
            data_plantao: '2024-10-01',
            turno: 'Madrugada',
            medico_solicitante_id: m0,
            status: 'AGUARDANDO_GESTOR'
        });
    }

    const escalaRow = store.select('escala', [{ type: '=', col: 'unidade_id', val: unit.id }], ['data_plantao ASC'], 1)[0];
    if (escalaRow?.id && rowCount(store, 'pedidos_cancelamento_escala') === 0) {
        store.insert('pedidos_cancelamento_escala', {
            id: crypto.randomUUID(),
            unidade_id: unit.id,
            escala_id: escalaRow.id,
            medico_id: escalaRow.medico_id || m0,
            data_plantao: '2024-08-15',
            turno: 'Noite',
            status: 'PENDENTE'
        });
    }

    if (medicos.length >= 2 && rowCount(store, 'pedidos_troca_escala') === 0) {
        const eAlvo = crypto.randomUUID();
        const eOf = crypto.randomUUID();
        store.insert('escala', {
            id: eAlvo,
            unidade_id: unit.id,
            medico_id: m0,
            data_plantao: '2024-09-10',
            turno: 'Manhã'
        });
        store.insert('escala', {
            id: eOf,
            unidade_id: unit.id,
            medico_id: m1,
            data_plantao: '2024-09-11',
            turno: 'Tarde'
        });
        store.insert('pedidos_troca_escala', {
            id: crypto.randomUUID(),
            unidade_id: unit.id,
            data_plantao: '2024-09-10',
            turno: 'Manhã',
            medico_solicitante_id: m0,
            medico_alvo_id: m1,
            escala_alvo_id: eAlvo,
            escala_oferecida_id: eOf,
            status: 'AGUARDANDO_COLEGA'
        });
    }

    if (rowCount(store, 'escala_templates') === 0) {
        const tid = crypto.randomUUID();
        store.insert('escala_templates', {
            id: tid,
            unidade_id: unit.id,
            nome: 'Modelo sintético (local)',
            tipo: 'SEMANAL',
            dias_modelo: 7
        });
        store.insert('escala_template_slots', {
            id: crypto.randomUUID(),
            template_id: tid,
            dia: 1,
            turno: 'Manhã',
            medico_id: m0
        });
    }

    try {
        await seedEscalaAbrilMaioVariadaStore(store);
    } catch (err) {
        console.warn('[gdp-db] Escala abril/maio demo:', err?.message || err);
    }
}
