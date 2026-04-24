/** Gera linhas de vistas (joins) a partir do orquestrador em memória — sem SQL. */

function byId(rows) {
    const m = new Map();
    for (const r of rows || []) {
        if (r?.id != null) m.set(String(r.id), r);
    }
    return m;
}

export const VIEW_EXPORT_BUILDERS = {
    escala_expandida(store) {
        const escala = store.getMutableRows('escala') || [];
        const u = byId(store.getMutableRows('unidades'));
        const m = byId(store.getMutableRows('medicos'));
        return escala.map((e) => ({
            ...store.clone(e),
            unidade_nome: u.get(String(e.unidade_id))?.nome ?? null,
            unidade_endereco: u.get(String(e.unidade_id))?.endereco ?? null,
            medico_nome: m.get(String(e.medico_id))?.nome ?? null,
            medico_crm: m.get(String(e.medico_id))?.crm ?? null,
            medico_especialidade: m.get(String(e.medico_id))?.especialidade ?? null,
            medico_telefone: m.get(String(e.medico_id))?.telefone ?? null,
            medico_usuario: m.get(String(e.medico_id))?.usuario ?? null
        }));
    },

    agendamentos_expandido(store) {
        const ag = store.getMutableRows('agendamentos') || [];
        const dMap = byId(store.getMutableRows('disponibilidade'));
        const m = byId(store.getMutableRows('medicos'));
        const u = byId(store.getMutableRows('unidades'));
        return ag.map((a) => {
            const d = dMap.get(String(a.disponibilidade_id));
            return {
                ...store.clone(a),
                unidade_id: d?.unidade_id ?? null,
                disponibilidade_data_plantao: d?.data_plantao ?? null,
                disponibilidade_turno: d?.turno ?? null,
                vagas_totais: d?.vagas_totais ?? null,
                vagas_ocupadas: d?.vagas_ocupadas ?? null,
                disponibilidade_status: d?.status ?? null,
                medico_nome: m.get(String(a.medico_id))?.nome ?? null,
                unidade_nome: d?.unidade_id ? u.get(String(d.unidade_id))?.nome ?? null : null
            };
        });
    },

    disponibilidade_expandida(store) {
        const drows = store.getMutableRows('disponibilidade') || [];
        const u = byId(store.getMutableRows('unidades'));
        return drows.map((d) => ({
            ...store.clone(d),
            unidade_nome: u.get(String(d.unidade_id))?.nome ?? null,
            unidade_endereco: u.get(String(d.unidade_id))?.endereco ?? null
        }));
    },

    medico_acessos_expandido(store) {
        const arows = store.getMutableRows('medico_acessos_unidade') || [];
        const m = byId(store.getMutableRows('medicos'));
        const u = byId(store.getMutableRows('unidades'));
        return arows.map((a) => ({
            ...store.clone(a),
            medico_nome: m.get(String(a.medico_id))?.nome ?? null,
            medico_crm: m.get(String(a.medico_id))?.crm ?? null,
            unidade_nome: u.get(String(a.unidade_id))?.nome ?? null
        }));
    },

    gestores_expandido(store) {
        const grows = store.getMutableRows('gestores') || [];
        const p = byId(store.getMutableRows('perfis'));
        const u = byId(store.getMutableRows('unidades'));
        return grows.map((g) => ({
            ...store.clone(g),
            perfil_nome: p.get(String(g.perfil_id))?.nome ?? null,
            unidade_nome: g.unidade_id ? u.get(String(g.unidade_id))?.nome ?? null : null
        }));
    },

    pedidos_troca_expandido(store) {
        const prows = store.getMutableRows('pedidos_troca_escala') || [];
        const u = byId(store.getMutableRows('unidades'));
        const m = byId(store.getMutableRows('medicos'));
        return prows.map((p) => ({
            ...store.clone(p),
            unidade_nome: u.get(String(p.unidade_id))?.nome ?? null,
            medico_solicitante_nome: m.get(String(p.medico_solicitante_id))?.nome ?? null,
            medico_alvo_nome: m.get(String(p.medico_alvo_id))?.nome ?? null
        }));
    },

    pedidos_cancelamento_expandido(store) {
        const prows = store.getMutableRows('pedidos_cancelamento_escala') || [];
        const u = byId(store.getMutableRows('unidades'));
        const m = byId(store.getMutableRows('medicos'));
        return prows.map((p) => ({
            ...store.clone(p),
            unidade_nome: u.get(String(p.unidade_id))?.nome ?? null,
            medico_nome: m.get(String(p.medico_id))?.nome ?? null
        }));
    },

    pedidos_assumir_expandido(store) {
        const prows = store.getMutableRows('pedidos_assumir_escala') || [];
        const u = byId(store.getMutableRows('unidades'));
        const m = byId(store.getMutableRows('medicos'));
        return prows.map((p) => ({
            ...store.clone(p),
            unidade_nome: u.get(String(p.unidade_id))?.nome ?? null,
            medico_solicitante_nome: m.get(String(p.medico_solicitante_id))?.nome ?? null
        }));
    },

    escala_template_slots_expandido(store) {
        const srows = store.getMutableRows('escala_template_slots') || [];
        const t = byId(store.getMutableRows('escala_templates'));
        const u = byId(store.getMutableRows('unidades'));
        const m = byId(store.getMutableRows('medicos'));
        return srows.map((s) => {
            const tpl = t.get(String(s.template_id));
            return {
                ...store.clone(s),
                template_nome: tpl?.nome ?? null,
                template_tipo: tpl?.tipo ?? null,
                unidade_id: tpl?.unidade_id ?? null,
                unidade_nome: tpl?.unidade_id ? u.get(String(tpl.unidade_id))?.nome ?? null : null,
                medico_nome: m.get(String(s.medico_id))?.nome ?? null
            };
        });
    },

    escala_mes_publicacao_expandido(store) {
        const prows = store.getMutableRows('escala_mes_publicacao') || [];
        const u = byId(store.getMutableRows('unidades'));
        return prows.map((p) => ({
            ...store.clone(p),
            unidade_nome: u.get(String(p.unidade_id))?.nome ?? null
        }));
    },

    reserva_holds_expandido(store) {
        const rrows = store.getMutableRows('reserva_holds') || [];
        const dMap = byId(store.getMutableRows('disponibilidade'));
        const u = byId(store.getMutableRows('unidades'));
        const m = byId(store.getMutableRows('medicos'));
        return rrows.map((r) => {
            const d = dMap.get(String(r.disponibilidade_id));
            return {
                ...store.clone(r),
                unidade_id: d?.unidade_id ?? null,
                data_plantao: d?.data_plantao ?? null,
                turno: d?.turno ?? null,
                unidade_nome: d?.unidade_id ? u.get(String(d.unidade_id))?.nome ?? null : null,
                medico_nome: m.get(String(r.medico_id))?.nome ?? null
            };
        });
    },

    tasy_raw_history_expandido(store) {
        const hrows = store.getMutableRows('tasy_raw_history') || [];
        const u = byId(store.getMutableRows('unidades'));
        return hrows.map((h) => ({
            ...store.clone(h),
            unidade_nome: u.get(String(h.unidade_id))?.nome ?? null
        }));
    }
};
