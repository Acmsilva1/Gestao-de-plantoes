// CUIDADO: modelo simplificado (até 2 médicos/unidade). A escala oficial está em
// model/escala_demo_mar_abr_2026.sql (19 médicos). Não sobrescrever esse ficheiro sem revisar.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const T = ['Manhã', 'Tarde', 'Noite', 'Madrugada'];
const units = [
    { id: 'b1000001-0000-4000-8000-000000000001', m: ['c1000001-0000-4000-8000-000000000001'] },
    { id: 'b1000001-0000-4000-8000-000000000002', m: ['c1000001-0000-4000-8000-000000000002'] },
    { id: 'b1000001-0000-4000-8000-000000000003', m: ['c1000001-0000-4000-8000-000000000005'] },
    { id: 'b1000001-0000-4000-8000-000000000004', m: ['c1000001-0000-4000-8000-000000000003', 'c1000001-0000-4000-8000-000000000004'] },
    { id: 'b1000001-0000-4000-8000-000000000005', m: ['c1000001-0000-4000-8000-000000000009'] },
    { id: 'b1000001-0000-4000-8000-000000000006', m: ['c1000001-0000-4000-8000-000000000007'] },
    { id: 'b1000001-0000-4000-8000-000000000007', m: ['c1000001-0000-4000-8000-000000000008'] },
    { id: 'b1000001-0000-4000-8000-000000000008', m: ['c1000001-0000-4000-8000-000000000006'] },
    { id: 'b1000001-0000-4000-8000-000000000009', m: ['c1000001-0000-4000-8000-000000000010'] }
];

/** Março e abril 2026 (simulado; mesma regra de “furos” por dia do mês). */
const MESES = [
    { ano: 2026, mes: 3, ultimoDia: 31 },
    { ano: 2026, mes: 4, ultimoDia: 30 }
];

function pad2(n) {
    return String(n).padStart(2, '0');
}

const rows = [];
for (const { ano, mes, ultimoDia } of MESES) {
    const prefix = `${ano}-${pad2(mes)}-`;
    for (const U of units) {
        for (let day = 1; day <= ultimoDia; day++) {
            if (day % 7 === 0 || day % 13 === 0) continue;
            const ti = day % 4;
            const t2 = (ti + 1) % 4;
            const d = `${prefix}${pad2(day)}`;
            if (day % 5 !== 0) {
                rows.push({ uid: U.id, m: U.m[0], d, t: T[ti] });
            }
            if (day % 4 !== 0 && U.m[1]) {
                rows.push({ uid: U.id, m: U.m[1], d, t: T[t2] });
            }
            if (day % 9 === 0) rows.pop();
        }
    }
}

const uniq = new Set();
const vals = [];
let n = 1;
for (const r of rows) {
    const k = `${r.uid}|${r.d}|${r.t}|${r.m}`;
    if (uniq.has(k)) continue;
    uniq.add(k);
    const id = `f1000001-0000-4000-8000-${String(n++).padStart(12, '0')}`;
    vals.push(`    ('${id}', '${r.uid}', '${r.m}', '${r.d}', '${r.t}')`);
}
const out = vals.join(',\n');

fs.writeFileSync(path.join(__dirname, 'escala-values.sql'), out, 'utf8');
process.stderr.write('count ' + vals.length + ' -> scripts/escala-values.sql\n');

const escalaOnlyHeader = `-- Escala simulada: todas as unidades demo, março e abril de 2026.
-- "Furos": dias do mês múltiplos de 7 ou 13 sem linha; alguns turnos omitidos pela regra demo.
-- Uso: no Supabase, opcionalmente remova linhas do intervalo antes de inserir:
--   DELETE FROM escala WHERE data_plantao BETWEEN '2026-03-01' AND '2026-04-30';

INSERT INTO escala (id, unidade_id, medico_id, data_plantao, turno)
VALUES
`;

const escalaOnlyPath = path.join(root, 'model', 'escala_demo_mar_abr_2026.sql');
fs.writeFileSync(escalaOnlyPath, escalaOnlyHeader + out + ';\n', 'utf8');
process.stderr.write('wrote model/escala_demo_mar_abr_2026.sql\n');
