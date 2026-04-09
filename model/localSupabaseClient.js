import { getDb, generateId } from '../DB local/index.js';

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
        if (!this.action) this.action = 'select'; // constructor does this anyway
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
        // e.g. "medico_solicitante_id.eq.abc,medico_alvo_id.eq.abc"
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
        this.execute().then(resolve).catch(reject);
    }

    async execute() {
        const db = await getDb();
        try {
            if (this.action === 'select') return await this._executeSelect(db);
            if (this.action === 'insert') return await this._executeInsert(db);
            if (this.action === 'update') return await this._executeUpdate(db);
            if (this.action === 'delete') return await this._executeDelete(db);
            if (this.action === 'upsert') return await this._executeUpsert(db);
        } catch (err) {
            return { data: null, error: { message: err.message, code: err.code || 'UNKNOWN' } };
        }
    }

    _buildWhere() {
        let sql = '';
        let params = [];
        if (this.conditions.length > 0) {
            const parts = [];
            for (const c of this.conditions) {
                if (c.type === 'OR_STR') {
                    // split by comma
                    const subConds = c.val.split(',').map(s => {
                        const [col, op, val] = s.split('.');
                        return `${col} = '${val}'`; // simplifying for now
                    });
                    parts.push(`(${subConds.join(' OR ')})`);
                } else if (c.type === 'IN') {
                    if (c.val.length === 0) {
                        parts.push(`1=0`);
                    } else {
                        const qs = c.val.map(() => '?').join(',');
                        parts.push(`${c.col} IN (${qs})`);
                        params.push(...c.val);
                    }
                } else if (c.type === 'IS NOT NULL') {
                    parts.push(`${c.col} IS NOT NULL`);
                } else {
                    let colName = c.col;
                    if (colName.includes('.')) {
                        // handling joined conditions roughly
                        colName = colName.split('.')[1]; // basic fallback
                    }
                    parts.push(`${colName} ${c.type} ?`);
                    params.push(c.val);
                }
            }
            sql = ` WHERE ${parts.join(' AND ')}`;
        }
        return { sql, params };
    }

    async _executeSelect(db) {
        let selectSql = 'SELECT * FROM ' + this.table;
        let requiresManualJoinGroup = false;

        // Simplified relation handling
        // If fields has parenthesis like "unidades(nome)", we just select * and handle it or ignore it for basic tables
        // To be perfect, we should replace this proxy with a real rewrite, but let's try a simple approach first.
        
        let { sql: whereSql, params } = this._buildWhere();
        let sql = selectSql + whereSql;
        if (this.orderBy.length > 0) {
            sql += ` ORDER BY ${this.orderBy.join(', ')}`;
        }
        if (this.limitNum) {
            sql += ` LIMIT ${this.limitNum}`;
        }
        
        const rows = await db.all(sql, params);
        
        // Emular as respostas de Join se os selects requisitaram, buscando manualmente (N+1 rápido para SQLite local)
        if (this.fields !== '*') {
             await this._enrichJoins(db, rows, this.fields);
        }

        return { data: rows, error: null };
    }

    async _enrichJoins(db, rows, fieldsStr) {
        if (!rows || rows.length === 0) return;
        
        if (fieldsStr.includes('unidades(nome)')) {
            for (const row of rows) {
                if (row.unidade_id) {
                    const u = await db.get('SELECT nome FROM unidades WHERE id = ?', [row.unidade_id]);
                    row.unidades = u;
                }
            }
        }
        if (fieldsStr.includes('medicos(')) {
            for (const row of rows) {
                if (row.medico_id) {
                    const m = await db.get('SELECT id, nome, crm, especialidade FROM medicos WHERE id = ?', [row.medico_id]);
                    row.medicos = m;
                }
            }
        }
        if (fieldsStr.includes('unidades!medicos_unidade_fixa_id_fkey(nome)')) {
            for (const row of rows) {
                if (row.unidade_fixa_id) {
                    const u = await db.get('SELECT nome FROM unidades WHERE id = ?', [row.unidade_fixa_id]);
                    row.unidades = u;
                }
            }
        }
        if (fieldsStr.includes('medico_acessos_unidade(')) {
            for (const row of rows) {
                const accesses = await db.all('SELECT unidade_id FROM medico_acessos_unidade WHERE medico_id = ?', [row.id]);
                for (const a of accesses) {
                    const u = await db.get('SELECT nome FROM unidades WHERE id = ?', [a.unidade_id]);
                    a.unidades = u;
                }
                row.medico_acessos_unidade = accesses;
            }
        }
        if (fieldsStr.includes('agendamentos(')) {
             for (const row of rows) {
                 const scheds = await db.all('SELECT * FROM agendamentos WHERE disponibilidade_id = ?', [row.id]);
                 for (const s of scheds) {
                     if (s.medico_id) {
                         const m = await db.get('SELECT id, nome, crm, especialidade FROM medicos WHERE id = ?', [s.medico_id]);
                         s.medicos = m;
                     }
                 }
                 row.agendamentos = scheds;
             }
        }
        if (this.table === 'agendamentos' && fieldsStr.includes('disponibilidade!inner(')) {
             // specific inner join check for conflicts
             for (let i = rows.length - 1; i >= 0; i--) {
                  const row = rows[i];
                  const disp = await db.get('SELECT data_plantao, turno, unidade_id FROM disponibilidade WHERE id = ?', [row.disponibilidade_id]);
                  if (disp) {
                     const u = await db.get('SELECT nome FROM unidades WHERE id = ?', [disp.unidade_id]);
                     disp.unidades = u;
                     row.disponibilidade = disp;
                     
                     // check conditions on disp? Handled basically since this is specific to `medicoId conflict`
                     const dispHasProp = this.conditions.find(c => c.col.startsWith('disponibilidade.'));
                     if (dispHasProp) {
                         // crude filter
                     }
                  } else {
                     row.disponibilidade = null;
                  }
             }
        }
    }

    async _executeInsert(db) {
        const rowsToInsert = Array.isArray(this.payload) ? this.payload : [this.payload];
        if (rowsToInsert.length === 0) return { data: [] };
        
        const inserted = [];
        for (const row of rowsToInsert) {
            if (!row.id) row.id = generateId(); // auto inject UUID
            const keys = Object.keys(row);
            const vals = Object.values(row);
            const qs = keys.map(() => '?').join(',');
            const sql = `INSERT INTO ${this.table} (${keys.join(',')}) VALUES (${qs})`;
            await db.run(sql, vals);
            inserted.push(row);
        }
        return { data: inserted, error: null };
    }

    async _executeUpdate(db) {
        const keys = Object.keys(this.payload);
        const vals = Object.values(this.payload);
        const setParts = keys.map(k => `${k} = ?`).join(', ');
        const { sql: whereSql, params } = this._buildWhere();
        
        const sql = `UPDATE ${this.table} SET ${setParts}${whereSql}`;
        await db.run(sql, [...vals, ...params]);
        
        // return selected if possible
        const selSql = `SELECT * FROM ${this.table}${whereSql}`;
        const data = await db.all(selSql, params);
        return { data: data, error: null };
    }

    async _executeDelete(db) {
        const { sql: whereSql, params } = this._buildWhere();
        const selSql = `SELECT * FROM ${this.table}${whereSql}`;
        const data = await db.all(selSql, params);
        
        const sql = `DELETE FROM ${this.table}${whereSql}`;
        await db.run(sql, params);
        
        return { data: data, error: null };
    }

    async _executeUpsert(db) {
        const rowsToInsert = Array.isArray(this.payload) ? this.payload : [this.payload];
        if (rowsToInsert.length === 0) return { data: [] };
        
        const upserted = [];
        for (const row of rowsToInsert) {
            if (!row.id) row.id = generateId();
            const keys = Object.keys(row);
            const vals = Object.values(row);
            const qs = Object.keys(row).map(() => '?').join(',');
            
            const setParts = keys.map(k => `${k} = excluded.${k}`).join(', ');
            
            // on conflict handling logic via SQLite 3.24+ UPSERT
            let conflictTarget = 'id';
            if (this.onConflictFields) {
               conflictTarget = this.onConflictFields; // e.g. "unidade_id,mes"
            }

            const sql = `INSERT INTO ${this.table} (${keys.join(',')}) VALUES (${qs}) 
                         ON CONFLICT(${conflictTarget}) DO UPDATE SET ${setParts}`;
            try {
                await db.run(sql, vals);
                upserted.push(row);
            } catch (err) {
                 if (err.message.includes('ON CONFLICT')) {
                     // fallback se SQLite versao velha
                     throw err;
                 } else {
                     throw err;
                 }
            }
        }
        return { data: upserted, error: null };
    }
}

async function executeRpc(funcName, args) {
    const db = await getDb();
    
    // We emulate the rpcs logic internally using transactions
    if (funcName === 'aprovar_pedido_troca_gestor') {
         const p_pedido_id = args.p_pedido_id;
         // logic to approve
         await db.exec('BEGIN TRANSACTION');
         try {
             const row = await db.get('SELECT * FROM pedidos_troca_escala WHERE id = ?', [p_pedido_id]);
             if (row) {
                  await db.run('UPDATE escala SET medico_id = ? WHERE id = ?', [row.medico_alvo_id, row.escala_alvo_id]);
                  await db.run('UPDATE pedidos_troca_escala SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', ['APROVADO', p_pedido_id]);
             }
             await db.exec('COMMIT');
         } catch(e) {
             await db.exec('ROLLBACK');
             return { error: { message: e.message } };
         }
         return { error: null };
    }

    if (funcName === 'aprovar_pedido_assumir_gestor') {
         const p_pedido_id = args.p_pedido_id;
         await db.exec('BEGIN TRANSACTION');
         try {
             const row = await db.get('SELECT * FROM pedidos_assumir_escala WHERE id = ?', [p_pedido_id]);
             if (row) {
                  await db.run('INSERT INTO escala (id, unidade_id, medico_id, data_plantao, turno) VALUES (?, ?, ?, ?, ?)', 
                               [generateId(), row.unidade_id, row.medico_solicitante_id, row.data_plantao, row.turno]);
                  await db.run('UPDATE pedidos_assumir_escala SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', ['APROVADO', p_pedido_id]);
             }
             await db.exec('COMMIT');
         } catch(e) {
             await db.exec('ROLLBACK');
             return { error: { message: e.message } };
         }
         return { error: null };
    }

    return { error: null };
}
