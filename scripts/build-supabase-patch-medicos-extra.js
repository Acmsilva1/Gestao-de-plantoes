/* Gera model/supabase_patch_medicos_extra_c011_c019.sql a partir de escala_demo_mar_abr_2026.sql */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const root = path.join(__dirname, '..');
const demo = path.join(root, 'model', 'escala_demo_mar_abr_2026.sql');
const out = path.join(root, 'model', 'supabase_patch_medicos_extra_c011_c019.sql');

const lines = fs.readFileSync(demo, 'utf8').split(/\r?\n/);
const escalaLines = lines.slice(325, 604);
const last = escalaLines.length - 1;
escalaLines[last] = escalaLines[last].replace(/\);\s*$/, ')');
const escala = escalaLines.join('\n');

const head = `-- =============================================================================
-- Supabase — PATCH: médicos extra demo (c011–c019) + escala mar/abr 2026
-- =============================================================================
-- Onde executar: Dashboard Supabase → SQL Editor → colar e executar (Run).
--
-- Pré-requisitos:
--   • Tabelas medicos, medico_acessos_unidade, escala, unidades existentes.
--   • Unidades b1000001-0000-4000-8000-000000000001 … 009 criadas (FK de unidade_fixa_id).
--
-- O que faz:
--   1) UPSERT dos 9 médicos fictícios (IDs …000011 a …000019).
--   2) Liga cada um à sua unidade_fixa em medico_acessos_unidade (idempotente).
--   3) Apaga escala desses médicos entre 2026-03-01 e 2026-04-30 (permite reexecutar sem duplicar).
--   4) Insere as linhas de escala (UUIDs f…317 a f…595), alinhadas a escala_demo_mar_abr_2026.sql.
--
-- Não precisa deste script se já aplicou migrate_super_unidades_reais_completo.sql
-- por completo na mesma base (dados já incluídos).
--
-- Se DELETE FROM escala falhar por FK (ex.: pedidos), trate dependências antes
-- ou use só em base de demonstração.
--
-- Regenerar após alterar escala demo:
--   node scripts/build-supabase-patch-medicos-extra.js
-- =============================================================================

BEGIN;

INSERT INTO medicos (id, nome, usuario, crm, telefone, especialidade, unidade_fixa_id, senha, atendimento_padrao_por_periodo)
VALUES
    ('c1000001-0000-4000-8000-000000000011', 'Carla Mendes Souza', 'carla.mendes', '52901-ES', '(27) 98888-1011', 'Clínico geral', 'b1000001-0000-4000-8000-000000000001', '12345', 10),
    ('c1000001-0000-4000-8000-000000000012', 'Ricardo Fonseca Lima', 'ricardo.fonseca', '53911-ES', '(27) 97777-1012', 'Clínico geral', 'b1000001-0000-4000-8000-000000000002', '12345', 10),
    ('c1000001-0000-4000-8000-000000000013', 'Fernanda Rocha Dias', 'fernanda.rocha', '45688-DF', '(61) 94444-1013', 'Clínico geral', 'b1000001-0000-4000-8000-000000000003', '12345', 10),
    ('c1000001-0000-4000-8000-000000000014', 'Diego Cardoso Meyer', 'diego.cardoso', '108400-RJ', '(21) 96666-1014', 'Clínico geral', 'b1000001-0000-4000-8000-000000000004', '12345', 10),
    ('c1000001-0000-4000-8000-000000000015', 'Juliana Torres Rezende', 'juliana.torres', '109400-RJ', '(21) 95555-1015', 'Clínico geral', 'b1000001-0000-4000-8000-000000000005', '12345', 10),
    ('c1000001-0000-4000-8000-000000000016', 'Renata Silveira Costa', 'renata.silveira', '87660-MG', '(31) 92222-1016', 'Clínico geral', 'b1000001-0000-4000-8000-000000000006', '12345', 10),
    ('c1000001-0000-4000-8000-000000000017', 'Marcelo Pires Barbosa', 'marcelo.pires', '88770-MG', '(31) 91111-1017', 'Clínico geral', 'b1000001-0000-4000-8000-000000000007', '12345', 10),
    ('c1000001-0000-4000-8000-000000000018', 'Camila Freitas Nogueira', 'camila.freitas', '46799-DF', '(61) 93333-1018', 'Clínico geral', 'b1000001-0000-4000-8000-000000000008', '12345', 10),
    ('c1000001-0000-4000-8000-000000000019', 'Patrícia Azevedo Linhares', 'patricia.azevedo', '112244-RJ', '(21) 90000-1019', 'Clínico geral', 'b1000001-0000-4000-8000-000000000009', '12345', 10)
ON CONFLICT (id) DO UPDATE SET
    nome = EXCLUDED.nome,
    usuario = EXCLUDED.usuario,
    crm = EXCLUDED.crm,
    telefone = EXCLUDED.telefone,
    especialidade = EXCLUDED.especialidade,
    unidade_fixa_id = EXCLUDED.unidade_fixa_id,
    senha = EXCLUDED.senha,
    atendimento_padrao_por_periodo = EXCLUDED.atendimento_padrao_por_periodo;

INSERT INTO medico_acessos_unidade (medico_id, unidade_id)
SELECT id, unidade_fixa_id
FROM medicos
WHERE id IN (
    'c1000001-0000-4000-8000-000000000011',
    'c1000001-0000-4000-8000-000000000012',
    'c1000001-0000-4000-8000-000000000013',
    'c1000001-0000-4000-8000-000000000014',
    'c1000001-0000-4000-8000-000000000015',
    'c1000001-0000-4000-8000-000000000016',
    'c1000001-0000-4000-8000-000000000017',
    'c1000001-0000-4000-8000-000000000018',
    'c1000001-0000-4000-8000-000000000019'
)
  AND unidade_fixa_id IS NOT NULL
ON CONFLICT (medico_id, unidade_id) DO NOTHING;

DELETE FROM escala
WHERE medico_id IN (
    'c1000001-0000-4000-8000-000000000011',
    'c1000001-0000-4000-8000-000000000012',
    'c1000001-0000-4000-8000-000000000013',
    'c1000001-0000-4000-8000-000000000014',
    'c1000001-0000-4000-8000-000000000015',
    'c1000001-0000-4000-8000-000000000016',
    'c1000001-0000-4000-8000-000000000017',
    'c1000001-0000-4000-8000-000000000018',
    'c1000001-0000-4000-8000-000000000019'
)
  AND data_plantao BETWEEN '2026-03-01' AND '2026-04-30';

INSERT INTO escala (id, unidade_id, medico_id, data_plantao, turno)
VALUES
`;

const tail = `

ON CONFLICT (id) DO UPDATE SET
    unidade_id = EXCLUDED.unidade_id,
    medico_id = EXCLUDED.medico_id,
    data_plantao = EXCLUDED.data_plantao,
    turno = EXCLUDED.turno;

COMMIT;
`;

fs.writeFileSync(out, head + escala + tail, 'utf8');
console.log('Wrote', out);
