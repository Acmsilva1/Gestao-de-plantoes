-- Visibilidade da escala por unidade e mês (médicos veem ou não a grelha pronta)
-- Executar no SQL Editor do Supabase após unidades existirem.

CREATE TABLE IF NOT EXISTS escala_mes_publicacao (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unidade_id UUID NOT NULL REFERENCES unidades (id) ON DELETE CASCADE,
    mes TEXT NOT NULL,
    status TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT escala_mes_publicacao_status_chk CHECK (status IN ('LIBERADO', 'BLOQUEADO')),
    CONSTRAINT escala_mes_publicacao_mes_fmt_chk CHECK (mes ~ '^\d{4}-\d{2}$'),
    UNIQUE (unidade_id, mes)
);

CREATE INDEX IF NOT EXISTS idx_escala_mes_pub_unidade ON escala_mes_publicacao (unidade_id);
