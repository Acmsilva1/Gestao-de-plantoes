import { getCsvStore, generateId } from '../data/local/db.js';
import { env } from '../config/env.js';

const READ_ONLY_MSG = 'Modo demonstração: apenas consultas (escritas desativadas).';

function readOnlyError() {
    return { data: null, error: { message: READ_ONLY_MSG, code: 'READ_ONLY' } };
}

export function createLocalSupabaseClient() {
    return {
        from: (tableName) => new QueryBuilder(tableName),
        rpc: async (funcName, args) => await executeRpc(funcName, args)
    };
}

class QueryBuilder {
    constructor(table) {
        this.table = table;
        this.action = 'select';
        this.fields = '*';
        this.conditions = [];
        this.orderBy = [];
        this.limitNum = null;
        this.payload = null;
        this.onConflictFields = null;
    }

    select(fields = '*') {
        this.fields = fields;
        return this;
    }

    insert(data) {
        this.action = 'insert';
        this.payload = data;
        return this;
    }

    update(data) {
        this.action = 'update';
        this.payload = data;
        return this;
    }

    delete() {
        this.action = 'delete';
        return this;
    }

    upsert(data, options = {}) {
        this.action = 'upsert';
        this.payload = data;
        this.onConflictFields = options.onConflict;
        return this;
    }

    eq(col, val) {
        this.conditions.push({ type: '=', col, val });
        return this;
    }

    gte(col, val) {
        this.conditions.push({ type: '>=', col, val });
        return this;
    }

    lte(col, val) {
        this.conditions.push({ type: '<=', col, val });
        return this;
    }

    in(col, vals) {
        this.conditions.push({ type: 'IN', col, val: vals });
        return this;
    }

    not(col, op, val) {
        if (op === 'is' && val === null) {
            this.conditions.push({ type: 'IS NOT NULL', col });
        }
        return this;
    }

    or(condStr) {
        this.conditions.push({ type: 'OR_STR', val: condStr });
        return this;
    }

    order(col, { ascending = true } = {}) {
        this.orderBy.push(`${col} ${ascending ? 'ASC' : 'DESC'}`);
        return this;
    }

    limit(n) {
        this.limitNum = n;
        return this;
    }

    async single() {
        this.limitNum = 1;
        const res = await this.execute();
        if (!res.data || res.data.length === 0) {
            return { data: null, error: { message: 'Row not found' } };
        }
        return { data: res.data[0], error: null };
    }

    async maybeSingle() {
        this.limitNum = 1;
        const res = await this.execute();
        if (res.error) return res;
        return { data: res.data ? res.data[0] || null : null, error: null };
    }

    then(resolve, reject) {
        this.execute().then(resolve, reject);
    }

    async execute() {
        if (
            env.demoReadOnly &&
            (this.action === 'insert' || this.action === 'update' || this.action === 'delete' || this.action === 'upsert')
        ) {
            return readOnlyError();
        }

        const store = await getCsvStore();
        try {
            if (this.action === 'select') return await this._executeSelect(store);
            if (this.action === 'insert') return await this._executeInsert(store);
            if (this.action === 'update') return await this._executeUpdate(store);
            if (this.action === 'delete') return await this._executeDelete(store);
            if (this.action === 'upsert') return await this._executeUpsert(store);
        } catch (err) {
            return { data: null, error: { message: err.message, code: err.code || 'UNKNOWN' } };
        }
    }

    async _executeSelect(store) {
        const rows = store.select(this.table, this.conditions, this.orderBy, this.limitNum);
        if (this.fields !== '*') {
            await this._enrichJoins(store, rows, this.fields);
        }
        return { data: rows, error: null };
    }

    async _enrichJoins(store, rows, fieldsStr) {
        if (!rows || rows.length === 0) return;

        const fs = String(fieldsStr || '');
        const wants = (re) => re.test(fs);

        /** PostgREST usa `tabela (` ou `tabela(`; o CSV client tem de reconhecer ambos. */
        if (wants(/\bunidades\s*\(/i) && !fs.includes('unidades!medicos_unidade_fixa_id_fkey')) {
            for (const row of rows) {
                if (!row.unidade_id) continue;
                const u = store.select('unidades', [{ type: '=', col: 'id', val: row.unidade_id }], [], 1)[0];
                row.unidades = u ? { id: u.id, nome: u.nome, endereco: u.endereco } : null;
            }
        }
        if (wants(/\bperfis\s*\(/i)) {
            for (const row of rows) {
                if (row.perfil_id) {
                    const p = store.select('perfis', [{ type: '=', col: 'id', val: row.perfil_id }], [], 1)[0];
                    row.perfis = p ? { nome: p.nome } : null;
                } else {
                    row.perfis = null;
                }
            }
        }
        if (wants(/\bmedicos\s*\(/i)) {
            for (const row of rows) {
                if (row.medico_id) {
                    const m = store.select('medicos', [{ type: '=', col: 'id', val: row.medico_id }], [], 1)[0];
                    row.medicos = m
                        ? { id: m.id, nome: m.nome, crm: m.crm, especialidade: m.especialidade }
                        : null;
                }
            }
        }
        if (fieldsStr.includes('unidades!medicos_unidade_fixa_id_fkey(nome)')) {
            for (const row of rows) {
                if (row.unidade_fixa_id) {
                    const u = store.select('unidades', [{ type: '=', col: 'id', val: row.unidade_fixa_id }], [], 1)[0];
                    row.unidades = u ? { nome: u.nome } : null;
                }
            }
        }
        if (
            this.table === 'pedidos_troca_escala' &&
            (fs.includes('medico_solicitante') || fs.includes('medico_alvo'))
        ) {
            for (const row of rows) {
                if (row.medico_solicitante_id) {
                    const m = store.select(
                        'medicos',
                        [{ type: '=', col: 'id', val: row.medico_solicitante_id }],
                        [],
                        1
                    )[0];
                    row.medico_solicitante = m ? { nome: m.nome } : null;
                }
                if (row.medico_alvo_id) {
                    const m = store.select('medicos', [{ type: '=', col: 'id', val: row.medico_alvo_id }], [], 1)[0];
                    row.medico_alvo = m ? { nome: m.nome } : null;
                }
            }
        }
        if (wants(/medico_acessos_unidade\s*\(/i)) {
            for (const row of rows) {
                const accesses = store.select(
                    'medico_acessos_unidade',
                    [{ type: '=', col: 'medico_id', val: row.id }],
                    [],
                    null
                );
                for (const a of accesses) {
                    const u = store.select('unidades', [{ type: '=', col: 'id', val: a.unidade_id }], [], 1)[0];
                    a.unidades = u ? { nome: u.nome } : null;
                }
                row.medico_acessos_unidade = accesses;
            }
        }
        if (fieldsStr.includes('agendamentos(')) {
            for (const row of rows) {
                const scheds = store.select(
                    'agendamentos',
                    [{ type: '=', col: 'disponibilidade_id', val: row.id }],
                    [],
                    null
                );
                for (const s of scheds) {
                    if (s.medico_id) {
                        const m = store.select('medicos', [{ type: '=', col: 'id', val: s.medico_id }], [], 1)[0];
                        s.medicos = m
                            ? { id: m.id, nome: m.nome, crm: m.crm, especialidade: m.especialidade }
                            : null;
                    }
                }
                row.agendamentos = scheds;
            }
        }
        if (this.table === 'agendamentos' && wants(/disponibilidade\s*!inner\s*\(/i)) {
            for (let i = rows.length - 1; i >= 0; i -= 1) {
                const row = rows[i];
                const disp = store.select(
                    'disponibilidade',
                    [{ type: '=', col: 'id', val: row.disponibilidade_id }],
                    [],
                    1
                )[0];
                if (disp) {
                    const u = store.select('unidades', [{ type: '=', col: 'id', val: disp.unidade_id }], [], 1)[0];
                    disp.unidades = u ? { nome: u.nome } : null;
                    row.disponibilidade = disp;
                } else {
                    row.disponibilidade = null;
                }
            }
        }
    }

    async _executeInsert(store) {
        const rowsToInsert = Array.isArray(this.payload) ? this.payload : [this.payload];
        if (rowsToInsert.length === 0) return { data: [] };

        const inserted = [];
        for (const row of rowsToInsert) {
            const copy = { ...row };
            if (!copy.id) copy.id = generateId();
            inserted.push(store.insert(this.table, copy));
        }
        await store.persistTable(this.table);
        return { data: inserted, error: null };
    }

    async _executeUpdate(store) {
        const keys = Object.keys(this.payload);
        const patch = { ...this.payload };
        store.update(this.table, this.conditions, patch);
        const data = store.select(this.table, this.conditions, this.orderBy, this.limitNum);
        await store.persistTable(this.table);
        return { data, error: null };
    }

    async _executeDelete(store) {
        const data = store.select(this.table, this.conditions, [], null);
        store.delete(this.table, this.conditions);
        await store.persistTable(this.table);
        return { data, error: null };
    }

    async _executeUpsert(store) {
        const rowsToInsert = Array.isArray(this.payload) ? this.payload : [this.payload];
        if (rowsToInsert.length === 0) return { data: [] };

        let conflictTarget = 'id';
        if (this.onConflictFields) {
            conflictTarget = this.onConflictFields;
        }

        const upserted = [];
        for (const row of rowsToInsert) {
            const copy = { ...row };
            if (!copy.id) copy.id = generateId();
            upserted.push(store.upsert(this.table, copy, conflictTarget));
        }
        await store.persistTable(this.table);
        return { data: upserted, error: null };
    }
}

async function executeRpc(funcName, args) {
    if (
        env.demoReadOnly &&
        (funcName === 'aprovar_pedido_troca_gestor' || funcName === 'aprovar_pedido_assumir_gestor')
    ) {
        return { error: { message: READ_ONLY_MSG, code: 'READ_ONLY' } };
    }

    const store = await getCsvStore();

    if (funcName === 'aprovar_pedido_troca_gestor') {
        const p_pedido_id = args.p_pedido_id;
        const row = store.select('pedidos_troca_escala', [{ type: '=', col: 'id', val: p_pedido_id }], [], 1)[0];
        if (row) {
            store.update('escala', [{ type: '=', col: 'id', val: row.escala_alvo_id }], { medico_id: row.medico_alvo_id });
            store.update('pedidos_troca_escala', [{ type: '=', col: 'id', val: p_pedido_id }], {
                status: 'APROVADO',
                updated_at: new Date().toISOString()
            });
        }
        await store.persistTables(['escala', 'pedidos_troca_escala']);
        return { error: null };
    }

    if (funcName === 'aprovar_pedido_assumir_gestor') {
        const p_pedido_id = args.p_pedido_id;
        const row = store.select('pedidos_assumir_escala', [{ type: '=', col: 'id', val: p_pedido_id }], [], 1)[0];
        if (row) {
            store.insert('escala', {
                id: generateId(),
                unidade_id: row.unidade_id,
                medico_id: row.medico_solicitante_id,
                data_plantao: row.data_plantao,
                turno: row.turno
            });
            store.update('pedidos_assumir_escala', [{ type: '=', col: 'id', val: p_pedido_id }], {
                status: 'APROVADO',
                updated_at: new Date().toISOString()
            });
        }
        await store.persistTables(['escala', 'pedidos_assumir_escala']);
        return { error: null };
    }

    return { error: null };
}
