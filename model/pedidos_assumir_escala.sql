-- Pedidos para assumir turno vazio (apenas autorização do gestor → INSERT em escala)
-- Executar no SQL Editor do Supabase após unidades, medicos, escala.

CREATE TABLE IF NOT EXISTS pedidos_assumir_escala (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unidade_id UUID NOT NULL REFERENCES unidades (id) ON DELETE CASCADE,
    data_plantao DATE NOT NULL,
    turno TEXT NOT NULL,
    medico_solicitante_id UUID NOT NULL REFERENCES medicos (id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'AGUARDANDO_GESTOR',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    gestor_respondeu_em TIMESTAMPTZ,
    CONSTRAINT pedidos_assumir_escala_status_chk CHECK (
        status IN ('AGUARDANDO_GESTOR', 'APROVADO', 'RECUSADO_GESTOR')
    )
);

CREATE INDEX IF NOT EXISTS idx_pedidos_assumir_solicitante ON pedidos_assumir_escala (medico_solicitante_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_assumir_unidade_status ON pedidos_assumir_escala (unidade_id, status);

-- Um pedido pendente por slot (unidade + data + turno)
CREATE UNIQUE INDEX IF NOT EXISTS uq_pedidos_assumir_slot_ativo
    ON pedidos_assumir_escala (unidade_id, data_plantao, turno)
    WHERE status = 'AGUARDANDO_GESTOR';

CREATE OR REPLACE FUNCTION public.aprovar_pedido_assumir_gestor(p_pedido_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v pedidos_assumir_escala%ROWTYPE;
BEGIN
    SELECT * INTO v FROM pedidos_assumir_escala WHERE id = p_pedido_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pedido nao encontrado';
    END IF;
    IF v.status IS DISTINCT FROM 'AGUARDANDO_GESTOR' THEN
        RAISE EXCEPTION 'Pedido nao esta aguardando gestor';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM escala
        WHERE unidade_id = v.unidade_id
          AND data_plantao = v.data_plantao
          AND turno = v.turno
    ) THEN
        RAISE EXCEPTION 'Turno ja tem registo na escala';
    END IF;

    INSERT INTO escala (unidade_id, medico_id, data_plantao, turno)
    VALUES (v.unidade_id, v.medico_solicitante_id, v.data_plantao, v.turno);

    UPDATE pedidos_assumir_escala
    SET status = 'APROVADO',
        gestor_respondeu_em = now(),
        updated_at = now()
    WHERE id = p_pedido_id;
END;
$$;
