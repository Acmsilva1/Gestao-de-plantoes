-- Pedidos de troca de plantão (fluxo: colega → gestor → atualização da escala)
-- Executar no SQL Editor do Supabase após unidades, medicos, escala existirem.

CREATE TABLE IF NOT EXISTS pedidos_troca_escala (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unidade_id UUID NOT NULL REFERENCES unidades (id) ON DELETE CASCADE,
    data_plantao DATE NOT NULL,
    turno TEXT NOT NULL,
    medico_solicitante_id UUID NOT NULL REFERENCES medicos (id) ON DELETE CASCADE,
    medico_alvo_id UUID NOT NULL REFERENCES medicos (id) ON DELETE CASCADE,
    escala_alvo_id UUID NOT NULL REFERENCES escala (id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'AGUARDANDO_COLEGA',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    colega_respondeu_em TIMESTAMPTZ,
    gestor_respondeu_em TIMESTAMPTZ,
    CONSTRAINT pedidos_troca_escala_status_chk CHECK (
        status IN (
            'AGUARDANDO_COLEGA',
            'AGUARDANDO_GESTOR',
            'APROVADO',
            'RECUSADO_COLEGA',
            'RECUSADO_GESTOR'
        )
    ),
    CONSTRAINT pedidos_troca_medicos_distintos CHECK (medico_solicitante_id <> medico_alvo_id)
);

CREATE INDEX IF NOT EXISTS idx_pedidos_troca_solicitante ON pedidos_troca_escala (medico_solicitante_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_troca_alvo ON pedidos_troca_escala (medico_alvo_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_troca_unidade_status ON pedidos_troca_escala (unidade_id, status);

-- Um pedido ativo por linha de escala alvo
CREATE UNIQUE INDEX IF NOT EXISTS uq_pedidos_troca_escala_alvo_ativo
    ON pedidos_troca_escala (escala_alvo_id)
    WHERE status IN ('AGUARDANDO_COLEGA', 'AGUARDANDO_GESTOR');

-- Aprovação atómica: substitui o médico na linha escala e fecha o pedido
CREATE OR REPLACE FUNCTION public.aprovar_pedido_troca_gestor(p_pedido_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v pedidos_troca_escala%ROWTYPE;
    v_n int;
BEGIN
    SELECT * INTO v FROM pedidos_troca_escala WHERE id = p_pedido_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pedido nao encontrado';
    END IF;
    IF v.status IS DISTINCT FROM 'AGUARDANDO_GESTOR' THEN
        RAISE EXCEPTION 'Pedido nao esta aguardando gestor';
    END IF;

    UPDATE escala
    SET medico_id = v.medico_solicitante_id
    WHERE id = v.escala_alvo_id
      AND medico_id = v.medico_alvo_id;

    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n = 0 THEN
        RAISE EXCEPTION 'Linha da escala alterada ou inexistente';
    END IF;

    UPDATE pedidos_troca_escala
    SET status = 'APROVADO',
        gestor_respondeu_em = now(),
        updated_at = now()
    WHERE id = p_pedido_id;
END;
$$;
