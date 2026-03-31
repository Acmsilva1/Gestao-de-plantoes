/**
 * Adiciona à escala demo (mar/abr 2026) linhas para médicos extras clonando o padrão
 * de turnos de um médico “modelo” da mesma lógica de unidade.
 *
 * Uso: node scripts/extend-demo-medicos-escala.js
 * Reescreve model/escala_demo_mar_abr_2026.sql (acrescenta VALUES ao INSERT existente).
 * ATENÇÃO: execute só uma vez sobre a base demo; repetir duplica médicos c011–c019 na escala.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const escalaPath = path.join(root, 'model', 'escala_demo_mar_abr_2026.sql');

const medicoUuid = (n) => `c1000001-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
const fUuid = (n) => `f1000001-0000-4000-8000-${String(n).padStart(12, '0')}`;

/** novo índice 11–19 → médico template 1–10 (mesma “família” de unidade / padrão demo) */
const CLONES = [
    { novo: 11, template: 1 },
    { novo: 12, template: 2 },
    { novo: 13, template: 5 },
    { novo: 14, template: 10 },
    { novo: 15, template: 4 },
    { novo: 16, template: 7 },
    { novo: 17, template: 8 },
    { novo: 18, template: 6 },
    { novo: 19, template: 9 }
];

const ROW_RE =
    /\(\s*'(f1000001-[0-9a-f-]+)'\s*,\s*'(b1000001-[0-9a-f-]+)'\s*,\s*'(c1000001-[0-9a-f-]+)'\s*,\s*'(\d{4}-\d{2}-\d{2})'\s*,\s*'([^']+)'\s*\)/gi;

function parseRows(sql) {
    const rows = [];
    let m;
    while ((m = ROW_RE.exec(sql)) !== null) {
        rows.push({ fId: m[1], bId: m[2], cId: m[3], data: m[4], turno: m[5] });
    }
    return rows;
}

function maxFnum(rows) {
    let max = 0;
    for (const r of rows) {
        const tail = r.fId.split('-').pop();
        const n = parseInt(tail, 10);
        if (n > max) max = n;
    }
    return max;
}

function main() {
    const raw = fs.readFileSync(escalaPath, 'utf8');
    const rows = parseRows(raw);
    if (rows.length === 0) throw new Error('Nenhuma linha de escala encontrada.');

    let nextF = maxFnum(rows) + 1;
    const newLines = [];

    for (const { novo, template } of CLONES) {
        const tmplId = medicoUuid(template);
        const novoId = medicoUuid(novo);
        const tplRows = rows.filter((r) => r.cId === tmplId);
        if (tplRows.length === 0) {
            throw new Error(`Sem linhas para template médico ${template} (${tmplId})`);
        }
        for (const r of tplRows) {
            const line = `    ('${fUuid(nextF)}', '${r.bId}', '${novoId}', '${r.data}', '${r.turno}')`;
            newLines.push(line);
            nextF += 1;
        }
        console.error(`+ médico ${novo}: ${tplRows.length} linhas (clone de ${template})`);
    }

    const trimmed = raw.trimEnd();
    if (!trimmed.endsWith(');')) throw new Error('Final do SQL inesperado (esperado ...);)');
    const body = trimmed.slice(0, -2);
    const out = `${body},\n${newLines.join(',\n')}\n);\n`;

    fs.writeFileSync(escalaPath, out, 'utf8');
    console.error(`Escrito ${escalaPath} — +${newLines.length} linhas (total escala ${rows.length + newLines.length}).`);
}

main();
