-- Escala sintética: abril e maio do ANO CORRENTE (strftime('%Y','now')).
-- Executar: node backend/scripts/run-sql-file.mjs "backend/data/local/seed_escala_abril_maio.sql"

BEGIN TRANSACTION;

DELETE FROM escala
WHERE data_plantao >= (SELECT strftime('%Y', 'now') || '-04-01')
  AND data_plantao <= (SELECT strftime('%Y', 'now') || '-05-31');

DELETE FROM escala_mes_publicacao
WHERE mes IN (
    SELECT strftime('%Y', 'now') || '-04'
    UNION ALL
    SELECT strftime('%Y', 'now') || '-05'
);

INSERT INTO escala_mes_publicacao (id, unidade_id, mes, status)
SELECT lower(hex(randomblob(16))), u.id, strftime('%Y', 'now') || '-04', 'LIBERADO'
FROM unidades u
UNION ALL
SELECT lower(hex(randomblob(16))), u.id, strftime('%Y', 'now') || '-05', 'LIBERADO'
FROM unidades u;

WITH RECURSIVE
dates(d) AS (
    SELECT strftime('%Y', 'now') || '-04-01'
    UNION ALL
    SELECT date(d, '+1 day')
    FROM dates
    WHERE date(d, '+1 day') <= strftime('%Y', 'now') || '-05-31'
),
turnos(t, ord) AS (
    SELECT 'Manhã', 1
    UNION ALL SELECT 'Tarde', 2
    UNION ALL SELECT 'Noite', 3
    UNION ALL SELECT 'Madrugada', 4
),
candidates AS (
    SELECT
        u.id AS uid,
        u.rowid AS urid,
        d.d AS plantao,
        tn.t AS turno,
        tn.ord AS tord,
        CASE WHEN strftime('%w', d.d) IN ('0', '6') THEN 1 ELSE 0 END AS is_weekend,
        CASE WHEN CAST(strftime('%d', d.d) AS INTEGER) <= 15 THEN 1 ELSE 0 END AS q1,
        (u.rowid % 3) AS prof
    FROM dates d
    CROSS JOIN unidades u
    CROSS JOIN turnos tn
)
INSERT INTO escala (id, unidade_id, medico_id, data_plantao, turno)
SELECT
    lower(hex(randomblob(16))),
    c.uid,
    COALESCE(
        (SELECT m.id FROM medicos m WHERE m.unidade_fixa_id = c.uid ORDER BY m.rowid LIMIT 1),
        (SELECT m.id FROM medicos m ORDER BY m.rowid LIMIT 1)
    ),
    c.plantao,
    c.turno
FROM candidates c
WHERE (abs(random()) % 10000) < MIN(
        9700,
        MAX(
            350,
            CAST(
                CASE c.prof
                    WHEN 0 THEN 9000
                    WHEN 1 THEN 5200
                    ELSE 2000
                END * CASE WHEN c.is_weekend THEN 0.68 ELSE 1.0 END * CASE WHEN c.q1 THEN 1.05 ELSE 0.94 END AS INTEGER
            )
        )
    );

COMMIT;
