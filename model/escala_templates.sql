-- =============================================================================
-- Migration: Escala Personalizada (Modelos / Templates)
-- Cria tabelas para salvar padrões "Time de Futebol" (semanal ou mensal).
-- =============================================================================

-- 1. Tabela Principal de Templates
CREATE TABLE IF NOT EXISTS escala_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    unidade_id UUID NOT NULL REFERENCES unidades(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    tipo TEXT NOT NULL CHECK (tipo IN ('SEMANAL', 'QUINZENAL', 'MENSAL')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    -- Impedir nomes duplicados na mesma unidade
    UNIQUE(unidade_id, nome)
);

-- 2. Tabela de Slots do Template
CREATE TABLE IF NOT EXISTS escala_template_slots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    template_id UUID NOT NULL REFERENCES escala_templates(id) ON DELETE CASCADE,
    dia INT NOT NULL, -- 0-6 para semanal (Sun-Sat) ou 1-31 para mensal
    turno TEXT NOT NULL,
    medico_id UUID NOT NULL REFERENCES medicos(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    -- Impedir o mesmo médico no mesmo turno do mesmo dia no modelo
    UNIQUE(template_id, dia, turno, medico_id)
);

-- Habilitar RLS (opcional dependendo de suas políticas)
-- ALTER TABLE escala_templates ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE escala_template_slots ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- ATENÇÃO GESTOR: COMO VOCÊ JÁ RODOU O SCRIPT ANTES DA OPÇÃO QUINZENAL, 
-- RODE APENAS ESTE COMANDO PARA ATUALIZAR A TABELA E PERMITIR A OPÇÃO:
--
-- ALTER TABLE escala_templates DROP CONSTRAINT escala_templates_tipo_check;
-- ALTER TABLE escala_templates ADD CONSTRAINT escala_templates_tipo_check CHECK (tipo IN ('SEMANAL', 'QUINZENAL', 'MENSAL'));
-- =============================================================================
