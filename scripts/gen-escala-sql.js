import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const T = ['Manhã', 'Tarde', 'Noite', 'Madrugada'];
const units = [
    { id: 'b1000001-0000-4000-8000-000000000001', m: ['c1000001-0000-4000-8000-000000000001', 'c1000001-0000-4000-8000-000000000002'] },
    { id: 'b1000001-0000-4000-8000-000000000002', m: ['c1000001-0000-4000-8000-000000000003', 'c1000001-0000-4000-8000-000000000004'] },
    { id: 'b1000001-0000-4000-8000-000000000003', m: ['c1000001-0000-4000-8000-000000000005', 'c1000001-0000-4000-8000-000000000006'] },
    { id: 'b1000001-0000-4000-8000-000000000004', m: ['c1000001-0000-4000-8000-000000000007', 'c1000001-0000-4000-8000-000000000008'] },
    { id: 'b1000001-0000-4000-8000-000000000005', m: ['c1000001-0000-4000-8000-000000000009'] },
    { id: 'b1000001-0000-4000-8000-000000000006', m: ['c1000001-0000-4000-8000-000000000010'] }
];

const rows = [];
for (const U of units) {
    for (let day = 1; day <= 31; day++) {
        if (day % 7 === 0 || day % 13 === 0) continue;
        const ti = day % 4;
        const t2 = (ti + 1) % 4;
        if (day % 5 !== 0) {
            rows.push({ uid: U.id, m: U.m[0], d: `2026-03-${String(day).padStart(2, '0')}`, t: T[ti] });
        }
        if (day % 4 !== 0 && U.m[1]) {
            rows.push({ uid: U.id, m: U.m[1], d: `2026-03-${String(day).padStart(2, '0')}`, t: T[t2] });
        }
        if (day % 9 === 0) rows.pop();
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
