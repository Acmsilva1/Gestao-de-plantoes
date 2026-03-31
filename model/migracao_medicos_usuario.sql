-- Migração: adiciona usuário aos médicos existentes
-- Execute no SQL Editor do Supabase

ALTER TABLE medicos
ADD COLUMN IF NOT EXISTS usuario TEXT;

WITH base_usernames AS (
    SELECT
        m.id,
        COALESCE(
            NULLIF(
                lower(
                    regexp_replace(
                        regexp_replace(trim(m.nome), '\s.*$', '') || '.' || regexp_replace(trim(m.nome), '^.*\s+', ''),
                        '[^a-zA-Z0-9.]',
                        '',
                        'g'
                    )
                ),
                ''
            ),
            'medico'
        ) AS base_username
    FROM medicos m
),
ranked AS (
    SELECT
        b.id,
        b.base_username,
        row_number() OVER (PARTITION BY b.base_username ORDER BY b.id) AS seq
    FROM base_usernames b
)
UPDATE medicos m
SET usuario = CASE
    WHEN r.seq = 1 THEN r.base_username
    ELSE r.base_username || '.' || r.seq::text
END
FROM ranked r
WHERE m.id = r.id
  AND (m.usuario IS NULL OR btrim(m.usuario) = '');

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'medicos_usuario_key'
    ) THEN
        ALTER TABLE medicos
        ADD CONSTRAINT medicos_usuario_key UNIQUE (usuario);
    END IF;
END $$;

ALTER TABLE medicos
ALTER COLUMN usuario SET NOT NULL;
