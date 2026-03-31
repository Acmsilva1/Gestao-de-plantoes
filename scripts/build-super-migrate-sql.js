/**
 * Gera model/migrate_super_unidades_reais_completo.sql
 * Um único script transacional: limpa dados dependentes, alinha unidades/médicos/gestores/perfis
 * e reinsere a escala demo (conteúdo copiado de escala_demo_mar_abr_2026.sql).
 *
 * Uso: node scripts/build-super-migrate-sql.js
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const escalaPath = path.join(root, 'model', 'escala_demo_mar_abr_2026.sql');
const escalaRaw = fs.readFileSync(escalaPath, 'utf8');
const escalaLines = escalaRaw.split(/\r?\n/);
const insertStart = escalaLines.findIndex((line) => line.trimStart().startsWith('INSERT INTO escala'));
if (insertStart < 0) throw new Error('escala_demo_mar_abr_2026.sql: INSERT INTO escala não encontrado');
const escalaBlock = escalaLines.slice(insertStart).join('\n');

const header = `-- =============================================================================
-- MIGRAÇÃO COMPLETA — unidades reais (9 PS) + perfis + médicos + gestores + escala demo
-- =============================================================================
-- Executa no SQL Editor do Supabase em UMA transação.
--
-- O que faz:
--   • Apaga dados operacionais: pedidos, agendamentos, reservas, disponibilidade, templates
--     de escala, publicação por mês, escala, histórico Tasy, acessos médico-unidade, e TODOS
--     os gestores (recria os 9 + master com UUIDs fixos).
--   • Faz UPSERT de perfis, unidades e dos 10 médicos demo (IDs c1000001…000001–010).
--   • Recria gestores canónicos (e1000001… + master).
--   • Recria medico_acessos_unidade (cada médico → sua unidade_fixa_id).
--   • Insere escala mar/abr 2026 (mesmo conteúdo que model/escala_demo_mar_abr_2026.sql).
--
-- NÃO use em produção com dados reais sem backup. Médicos fora dos 10 IDs demo não são
-- removidos; apenas os 10 seeds são sobrescritos por UPSERT.
--
-- Regenerar este ficheiro após alterar escala demo:
--   node scripts/build-super-migrate-sql.js
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -----------------------------------------------------------------------------
-- Limpeza (ordem respeita FKs). Ignora tabelas inexistentes.
-- -----------------------------------------------------------------------------
DO $purge$
BEGIN
    IF to_regclass('public.pedidos_troca_escala') IS NOT NULL THEN
        DELETE FROM pedidos_troca_escala;
    END IF;
    IF to_regclass('public.pedidos_assumir_escala') IS NOT NULL THEN
        DELETE FROM pedidos_assumir_escala;
    END IF;
    IF to_regclass('public.agendamentos') IS NOT NULL THEN
        DELETE FROM agendamentos;
    END IF;
    IF to_regclass('public.reserva_holds') IS NOT NULL THEN
        DELETE FROM reserva_holds;
    END IF;
    IF to_regclass('public.disponibilidade') IS NOT NULL THEN
        DELETE FROM disponibilidade;
    END IF;
    IF to_regclass('public.escala_template_slots') IS NOT NULL THEN
        DELETE FROM escala_template_slots;
    END IF;
    IF to_regclass('public.escala_templates') IS NOT NULL THEN
        DELETE FROM escala_templates;
    END IF;
    IF to_regclass('public.escala_mes_publicacao') IS NOT NULL THEN
        DELETE FROM escala_mes_publicacao;
    END IF;
    IF to_regclass('public.escala') IS NOT NULL THEN
        DELETE FROM escala;
    END IF;
    IF to_regclass('public.medico_acessos_unidade') IS NOT NULL THEN
        DELETE FROM medico_acessos_unidade;
    END IF;
    IF to_regclass('public.tasy_raw_history') IS NOT NULL THEN
        DELETE FROM tasy_raw_history;
    END IF;
    IF to_regclass('public.gestores') IS NOT NULL THEN
        DELETE FROM gestores;
    END IF;
    -- Após remover gestores: elimina perfis demo legados para não haver UUIDs duplicados do mesmo nome
    IF to_regclass('public.perfis') IS NOT NULL THEN
        DELETE FROM perfis WHERE nome IN ('GESTOR', 'GESTOR_MASTER');
    END IF;
END $purge$;

-- -----------------------------------------------------------------------------
-- Perfis canónicos
-- -----------------------------------------------------------------------------
INSERT INTO perfis (id, nome)
VALUES ('d1000001-0000-4000-8000-000000000001', 'GESTOR')
ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome;

INSERT INTO perfis (id, nome)
VALUES ('d1000001-0000-4000-8000-000000000099', 'GESTOR_MASTER')
ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome;

-- -----------------------------------------------------------------------------
-- 9 unidades reais (001 Vitória … 045 Campo Grande)
-- -----------------------------------------------------------------------------
INSERT INTO unidades (id, nome, endereco, capacidade_media_atendimento)
VALUES
    ('b1000001-0000-4000-8000-000000000001', '001 - PS HOSPITAL VITÓRIA', 'Vitória, ES', 10),
    ('b1000001-0000-4000-8000-000000000002', '003 - PS VILA VELHA', 'Vila Velha, ES', 10),
    ('b1000001-0000-4000-8000-000000000003', '013 - PS SIG', 'Brasília, DF', 10),
    ('b1000001-0000-4000-8000-000000000004', '025 - PS BARRA DA TIJUCA', 'Rio de Janeiro, RJ', 10),
    ('b1000001-0000-4000-8000-000000000005', '026 - PS BOTAFOGO', 'Rio de Janeiro, RJ', 10),
    ('b1000001-0000-4000-8000-000000000006', '031 - PS GUTIERREZ', 'Belo Horizonte, MG', 10),
    ('b1000001-0000-4000-8000-000000000007', '033 - PS PAMPULHA', 'Belo Horizonte, MG', 10),
    ('b1000001-0000-4000-8000-000000000008', '039 - PS TAGUATINGA', 'Taguatinga, DF', 10),
    ('b1000001-0000-4000-8000-000000000009', '045 - PS CAMPO GRANDE', 'Rio de Janeiro, RJ', 10)
ON CONFLICT (id) DO UPDATE SET
    nome = EXCLUDED.nome,
    endereco = EXCLUDED.endereco,
    capacidade_media_atendimento = EXCLUDED.capacidade_media_atendimento;

-- -----------------------------------------------------------------------------
-- 10 médicos demo (alinhados ao app / supabase_schema_completo.sql)
-- -----------------------------------------------------------------------------
INSERT INTO medicos (id, nome, usuario, crm, telefone, especialidade, unidade_fixa_id, senha, atendimento_padrao_por_periodo)
VALUES
    ('c1000001-0000-4000-8000-000000000001', 'Maria Helena Duarte', 'maria.duarte', '52891-ES', '(27) 98888-1001', 'Clínica Médica', 'b1000001-0000-4000-8000-000000000001', '12345', 10),
    ('c1000001-0000-4000-8000-000000000002', 'Paulo Sérgio Nunes', 'paulo.nunes', '53902-ES', '(27) 97777-1002', 'Pediatria', 'b1000001-0000-4000-8000-000000000002', '12345', 10),
    ('c1000001-0000-4000-8000-000000000003', 'Amanda Cristina Ferreira', 'amanda.ferreira', '108234-RJ', '(21) 96666-2003', 'Emergência', 'b1000001-0000-4000-8000-000000000004', '12345', 10),
    ('c1000001-0000-4000-8000-000000000004', 'Rodrigo Antunes Vieira', 'rodrigo.vieira', '109345-RJ', '(21) 95555-2004', 'Cardiologia', 'b1000001-0000-4000-8000-000000000004', '12345', 10),
    ('c1000001-0000-4000-8000-000000000005', 'Letícia Martins Correia', 'leticia.correia', '45678-DF', '(61) 94444-3005', 'Clínica Médica', 'b1000001-0000-4000-8000-000000000003', '12345', 10),
    ('c1000001-0000-4000-8000-000000000006', 'Tiago Albuquerque Reis', 'tiago.reis', '46789-DF', '(61) 93333-3006', 'Ortopedia', 'b1000001-0000-4000-8000-000000000008', '12345', 10),
    ('c1000001-0000-4000-8000-000000000007', 'Beatriz Campos Lacerda', 'beatriz.lacerda', '87654-MG', '(31) 92222-4007', 'Pediatria', 'b1000001-0000-4000-8000-000000000006', '12345', 10),
    ('c1000001-0000-4000-8000-000000000008', 'Felipe Augusto Cunha', 'felipe.cunha', '88765-MG', '(31) 91111-4008', 'Emergência', 'b1000001-0000-4000-8000-000000000007', '12345', 10),
    ('c1000001-0000-4000-8000-000000000009', 'Larissa Prado Monteiro', 'larissa.monteiro', '112233-RJ', '(21) 90000-5009', 'Clínica Médica', 'b1000001-0000-4000-8000-000000000005', '12345', 10),
    ('c1000001-0000-4000-8000-000000000010', 'Gustavo Henrique Dias', 'gustavo.dias', '223344-RJ', '(21) 98888-6010', 'Cirurgia Geral', 'b1000001-0000-4000-8000-000000000009', '12345', 10)
ON CONFLICT (id) DO UPDATE SET
    nome = EXCLUDED.nome,
    usuario = EXCLUDED.usuario,
    crm = EXCLUDED.crm,
    telefone = EXCLUDED.telefone,
    especialidade = EXCLUDED.especialidade,
    unidade_fixa_id = EXCLUDED.unidade_fixa_id,
    senha = EXCLUDED.senha,
    atendimento_padrao_por_periodo = EXCLUDED.atendimento_padrao_por_periodo;

-- -----------------------------------------------------------------------------
-- Gestores: um por unidade + master (IDs fixos)
-- -----------------------------------------------------------------------------
INSERT INTO gestores (id, nome, usuario, senha, perfil_id, unidade_id)
VALUES
    ('e1000001-0000-4000-8000-000000000001', 'Gestor administrativo (confirmar nome) — 001 - PS HOSPITAL VITÓRIA', 'gestor.001', '12345', 'd1000001-0000-4000-8000-000000000001', 'b1000001-0000-4000-8000-000000000001'),
    ('e1000001-0000-4000-8000-000000000002', 'Gestor administrativo (confirmar nome) — 003 - PS VILA VELHA', 'gestor.003', '12345', 'd1000001-0000-4000-8000-000000000001', 'b1000001-0000-4000-8000-000000000002'),
    ('e1000001-0000-4000-8000-000000000003', 'Gestor administrativo (confirmar nome) — 013 - PS SIG', 'gestor.013', '12345', 'd1000001-0000-4000-8000-000000000001', 'b1000001-0000-4000-8000-000000000003'),
    ('e1000001-0000-4000-8000-000000000004', 'Gestor administrativo (confirmar nome) — 025 - PS BARRA DA TIJUCA', 'gestor.025', '12345', 'd1000001-0000-4000-8000-000000000001', 'b1000001-0000-4000-8000-000000000004'),
    ('e1000001-0000-4000-8000-000000000005', 'Gestor administrativo (confirmar nome) — 026 - PS BOTAFOGO', 'gestor.026', '12345', 'd1000001-0000-4000-8000-000000000001', 'b1000001-0000-4000-8000-000000000005'),
    ('e1000001-0000-4000-8000-000000000006', 'Gestor administrativo (confirmar nome) — 031 - PS GUTIERREZ', 'gestor.031', '12345', 'd1000001-0000-4000-8000-000000000001', 'b1000001-0000-4000-8000-000000000006'),
    ('e1000001-0000-4000-8000-000000000007', 'Gestor administrativo (confirmar nome) — 033 - PS PAMPULHA', 'gestor.033', '12345', 'd1000001-0000-4000-8000-000000000001', 'b1000001-0000-4000-8000-000000000007'),
    ('e1000001-0000-4000-8000-000000000008', 'Gestor administrativo (confirmar nome) — 039 - PS TAGUATINGA', 'gestor.039', '12345', 'd1000001-0000-4000-8000-000000000001', 'b1000001-0000-4000-8000-000000000008'),
    ('e1000001-0000-4000-8000-000000000009', 'Gestor administrativo (confirmar nome) — 045 - PS CAMPO GRANDE', 'gestor.045', '12345', 'd1000001-0000-4000-8000-000000000001', 'b1000001-0000-4000-8000-000000000009'),
    ('e1000001-0000-4000-8000-000000000099', 'Gestor Master', 'gestor.master', '12345', 'd1000001-0000-4000-8000-000000000099', NULL);

-- -----------------------------------------------------------------------------
-- Acesso base: cada médico demo → sua unidade fixa
-- -----------------------------------------------------------------------------
INSERT INTO medico_acessos_unidade (medico_id, unidade_id)
SELECT id, unidade_fixa_id
FROM medicos
WHERE id IN (
    'c1000001-0000-4000-8000-000000000001', 'c1000001-0000-4000-8000-000000000002',
    'c1000001-0000-4000-8000-000000000003', 'c1000001-0000-4000-8000-000000000004',
    'c1000001-0000-4000-8000-000000000005', 'c1000001-0000-4000-8000-000000000006',
    'c1000001-0000-4000-8000-000000000007', 'c1000001-0000-4000-8000-000000000008',
    'c1000001-0000-4000-8000-000000000009', 'c1000001-0000-4000-8000-000000000010'
)
  AND unidade_fixa_id IS NOT NULL
ON CONFLICT (medico_id, unidade_id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Escala demo (gerado a partir de escala_demo_mar_abr_2026.sql)
-- -----------------------------------------------------------------------------
`;

const footer = `
COMMIT;

-- Fim. Verifique no Table Editor: unidades (9), medicos (≥10), gestores (10), escala (316 linhas).
`;

const out = header + escalaBlock + footer;
const outPath = path.join(root, 'model', 'migrate_super_unidades_reais_completo.sql');
fs.writeFileSync(outPath, out, 'utf8');
console.log('Escrito', outPath);
