-- Executar no SQL Editor do Supabase

ALTER TABLE public.pedidos_troca_escala
ADD COLUMN IF NOT EXISTS escala_oferecida_id UUID REFERENCES public.escala(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS data_plantao_oferecida DATE,
ADD COLUMN IF NOT EXISTS turno_oferecido TEXT;

CREATE OR REPLACE FUNCTION public.aprovar_pedido_troca_gestor(p_pedido_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v public.pedidos_troca_escala%ROWTYPE;
    v_n int;
BEGIN
    SELECT * INTO v FROM public.pedidos_troca_escala WHERE id = p_pedido_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pedido nao encontrado';
    END IF;
    IF v.status IS DISTINCT FROM 'AGUARDANDO_GESTOR' THEN
        RAISE EXCEPTION 'Pedido nao esta aguardando gestor';
    END IF;

    -- Update Alvo's original shift to give it to the Solicitante
    UPDATE public.escala
    SET medico_id = v.medico_solicitante_id
    WHERE id = v.escala_alvo_id
      AND medico_id = v.medico_alvo_id;

    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n = 0 THEN
        RAISE EXCEPTION 'Linha da escala alvo alterada ou inexistente';
    END IF;

    -- Se um plantão foi oferecido em troca, o médico alvo assume a vaga do solicitante
    IF v.escala_oferecida_id IS NOT NULL THEN
        UPDATE public.escala
        SET medico_id = v.medico_alvo_id
        WHERE id = v.escala_oferecida_id
          AND medico_id = v.medico_solicitante_id;
          
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
            RAISE EXCEPTION 'Linha da escala oferecida alterada ou inexistente';
        END IF;
    END IF;

    UPDATE public.pedidos_troca_escala
    SET status = 'APROVADO',
        gestor_respondeu_em = now(),
        updated_at = now()
    WHERE id = p_pedido_id;
END;
$$;
