-- =============================================================================
-- Migração: trocar seed antigo (6 regionais por UF) → 9 unidades reais + médicos
--
-- Para RESET COMPLETO (todas as tabelas alinhadas + escala demo mar/abr 2026 numa só
-- transação), prefira: model/migrate_super_unidades_reais_completo.sql
--
-- Só faltam os 9 médicos extra (c011–c019) e a escala deles? Use o patch incremental:
--   model/supabase_patch_medicos_extra_c011_c019.sql
--
-- Use ESTE ficheiro no SQL Editor quando o banco JÁ foi criado com os UUIDs antigos
-- (b1000001…000001 a 000006). Amplia para …000007–000009 e remapeia FKs.
--
-- NÃO execute em produção com dados reais sem revisar: apaga todas as linhas de escala.
-- Após este script, opcional: rode model/gestores_por_unidade.sql para criar/atualizar
-- gestores das unidades que ainda não têm registro.
-- =============================================================================

BEGIN;

-- 1) Renomear as 6 unidades existentes (mesmos UUIDs, novos nomes/cidades)
UPDATE unidades SET nome = '001 - PS HOSPITAL VITÓRIA', endereco = 'Vitória, ES'
WHERE id = 'b1000001-0000-4000-8000-000000000001';
UPDATE unidades SET nome = '003 - PS VILA VELHA', endereco = 'Vila Velha, ES'
WHERE id = 'b1000001-0000-4000-8000-000000000002';
UPDATE unidades SET nome = '013 - PS SIG', endereco = 'Brasília, DF'
WHERE id = 'b1000001-0000-4000-8000-000000000003';
UPDATE unidades SET nome = '025 - PS BARRA DA TIJUCA', endereco = 'Rio de Janeiro, RJ'
WHERE id = 'b1000001-0000-4000-8000-000000000004';
UPDATE unidades SET nome = '026 - PS BOTAFOGO', endereco = 'Rio de Janeiro, RJ'
WHERE id = 'b1000001-0000-4000-8000-000000000005';
UPDATE unidades SET nome = '031 - PS GUTIERREZ', endereco = 'Belo Horizonte, MG'
WHERE id = 'b1000001-0000-4000-8000-000000000006';

-- 2) Inserir 3 unidades novas
INSERT INTO unidades (id, nome, endereco, capacidade_media_atendimento)
VALUES
    ('b1000001-0000-4000-8000-000000000007', '033 - PS PAMPULHA', 'Belo Horizonte, MG', 10),
    ('b1000001-0000-4000-8000-000000000008', '039 - PS TAGUATINGA', 'Taguatinga, DF', 10),
    ('b1000001-0000-4000-8000-000000000009', '045 - PS CAMPO GRANDE', 'Rio de Janeiro, RJ', 10)
ON CONFLICT (id) DO NOTHING;

-- 3) Médicos fictícios: unidade fixa + CRM + telefone coerentes
UPDATE medicos SET unidade_fixa_id = 'b1000001-0000-4000-8000-000000000001', crm = '10001-ES' WHERE id = 'c1000001-0000-4000-8000-000000000001';
UPDATE medicos SET unidade_fixa_id = 'b1000001-0000-4000-8000-000000000002', crm = '10002-ES' WHERE id = 'c1000001-0000-4000-8000-000000000002';
UPDATE medicos SET unidade_fixa_id = 'b1000001-0000-4000-8000-000000000004', crm = '20001-RJ' WHERE id = 'c1000001-0000-4000-8000-000000000003';
UPDATE medicos SET unidade_fixa_id = 'b1000001-0000-4000-8000-000000000004', crm = '20002-RJ' WHERE id = 'c1000001-0000-4000-8000-000000000004';
UPDATE medicos SET unidade_fixa_id = 'b1000001-0000-4000-8000-000000000003', crm = '30001-DF', telefone = '(61) 94444-3005' WHERE id = 'c1000001-0000-4000-8000-000000000005';
UPDATE medicos SET unidade_fixa_id = 'b1000001-0000-4000-8000-000000000008', crm = '30002-DF', telefone = '(61) 93333-3006' WHERE id = 'c1000001-0000-4000-8000-000000000006';
UPDATE medicos SET unidade_fixa_id = 'b1000001-0000-4000-8000-000000000006', crm = '40001-MG' WHERE id = 'c1000001-0000-4000-8000-000000000007';
UPDATE medicos SET unidade_fixa_id = 'b1000001-0000-4000-8000-000000000007', crm = '40002-MG' WHERE id = 'c1000001-0000-4000-8000-000000000008';
UPDATE medicos SET unidade_fixa_id = 'b1000001-0000-4000-8000-000000000005', crm = '20003-RJ', telefone = '(21) 90000-5009' WHERE id = 'c1000001-0000-4000-8000-000000000009';
UPDATE medicos SET unidade_fixa_id = 'b1000001-0000-4000-8000-000000000009', crm = '20004-RJ', telefone = '(21) 98888-6010' WHERE id = 'c1000001-0000-4000-8000-000000000010';

-- 4) Gestores existentes: nome amigável com o novo título da unidade
UPDATE gestores g
SET nome = 'Gestor genérico (confirmar nome) — ' || u.nome
FROM unidades u
WHERE g.unidade_id IS NOT NULL AND g.unidade_id = u.id;

-- 5) Demo: remove escala antiga (referências a combinações dia/unidade/médico inconsistentes)
DELETE FROM escala;

COMMIT;

-- 6) PASSO SEGUINTE — repor escala simulada (março e abril de 2026, todas as unidades):
--    Opção A: executar o ficheiro completo model/escala_demo_mar_abr_2026.sql
--             (opcional antes: DELETE FROM escala WHERE data_plantao BETWEEN '2026-03-01' AND '2026-04-30';)
--    Opção B: copiar de model/modulo_medico.sql só o bloco INSERT INTO escala ... VALUES ...
--             (inclui o mesmo conteúdo que a opção A).
--
-- 7) Gestores em falta (ex.: unidades novas): execute model/gestores_por_unidade.sql
