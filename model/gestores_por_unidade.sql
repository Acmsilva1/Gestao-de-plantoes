-- Vincula cada gestor a uma única unidade e cria gestores faltantes por unidade.
-- Execute no SQL Editor do Supabase.

ALTER TABLE gestores
ADD COLUMN IF NOT EXISTS unidade_id UUID REFERENCES unidades (id) ON DELETE SET NULL;

-- Um gestor por unidade.
CREATE UNIQUE INDEX IF NOT EXISTS uq_gestores_unidade_id
    ON gestores (unidade_id)
    WHERE unidade_id IS NOT NULL;

-- Garante perfil GESTOR.
INSERT INTO perfis (nome)
SELECT 'GESTOR'
WHERE NOT EXISTS (SELECT 1 FROM perfis WHERE nome = 'GESTOR');

-- Garante perfil GESTOR_MASTER.
INSERT INTO perfis (nome)
SELECT 'GESTOR_MASTER'
WHERE NOT EXISTS (SELECT 1 FROM perfis WHERE nome = 'GESTOR_MASTER');

WITH perfil_gestor AS (
    SELECT id
    FROM perfis
    WHERE nome = 'GESTOR'
    LIMIT 1
)
INSERT INTO gestores (nome, usuario, senha, perfil_id, unidade_id)
SELECT
    'Gestor ' || u.nome,
    lower(
        'gestor.' ||
        regexp_replace(
            translate(u.nome, 'ÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇáàãâäéèêëíìîïóòõôöúùûüç', 'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc'),
            '[^a-zA-Z0-9]+',
            '-',
            'g'
        ) ||
        '-' ||
        substring(u.id::text, 1, 6)
    ) AS usuario,
    '12345' AS senha,
    p.id AS perfil_id,
    u.id AS unidade_id
FROM unidades u
CROSS JOIN perfil_gestor p
LEFT JOIN gestores g ON g.unidade_id = u.id
WHERE g.id IS NULL;

-- Garante conta global de gestor master.
INSERT INTO gestores (nome, usuario, senha, perfil_id, unidade_id)
SELECT
    'Gestor Master',
    'gestor.master',
    '12345',
    p.id,
    NULL
FROM perfis p
WHERE p.nome = 'GESTOR_MASTER'
  AND NOT EXISTS (
      SELECT 1
      FROM gestores g
      WHERE g.usuario = 'gestor.master'
  );
