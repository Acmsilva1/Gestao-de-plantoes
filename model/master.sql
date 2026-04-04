-- =============================================================================
-- GESTÃO DE PLANTÕES: SQL MASTER SKELETON (A Bússola)
-- Este arquivo descreve a estrutura essencial do banco de dados para migração.
-- Foco: DDL (Data Definition Language) - Apenas o esqueleto das tabelas.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -----------------------------------------------------------------------------
-- 1. CORE: UNIDADES E ACESSOS
-- -----------------------------------------------------------------------------

-- Cadastro de Unidades de Saúde (UPA, Hospital, etc)
CREATE TABLE IF NOT EXISTS unidades (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nome TEXT NOT NULL,
    endereco TEXT,
    capacidade_media_atendimento INT DEFAULT 10, -- Base fixa para o preditor
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Cadastro de Médicos
CREATE TABLE IF NOT EXISTS medicos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nome TEXT NOT NULL,
    usuario TEXT UNIQUE NOT NULL,
    telefone TEXT,
    especialidade TEXT NOT NULL,
    crm TEXT UNIQUE NOT NULL,
    senha TEXT, -- Armazenado em texto plano ou hash conforme implementação de auth
    unidade_fixa_id UUID REFERENCES unidades (id) ON DELETE SET NULL,
    atendimento_padrao_por_periodo INT DEFAULT 10,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Perfis de Acesso (GESTOR, GESTOR_MASTER, etc)
CREATE TABLE IF NOT EXISTS perfis (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nome TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Gestores de Unidade
CREATE TABLE IF NOT EXISTS gestores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nome TEXT NOT NULL,
    usuario TEXT UNIQUE NOT NULL,
    senha TEXT,
    perfil_id UUID REFERENCES perfis (id) ON DELETE SET NULL,
    unidade_id UUID UNIQUE REFERENCES unidades (id) ON DELETE SET NULL, -- Se NULL, é GESTOR_MASTER
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Relação de acesso de médicos a múltiplas unidades (além da fixa)
CREATE TABLE IF NOT EXISTS medico_acessos_unidade (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    medico_id UUID NOT NULL REFERENCES medicos (id) ON DELETE CASCADE,
    unidade_id UUID NOT NULL REFERENCES unidades (id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (medico_id, unidade_id)
);

-- -----------------------------------------------------------------------------
-- 2. OPERAÇÃO: PLANTÕES E ESCALAS
-- -----------------------------------------------------------------------------

-- Slots de disponibilidade gerados pelo Preditor ou manualmente
CREATE TABLE IF NOT EXISTS disponibilidade (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    unidade_id UUID NOT NULL REFERENCES unidades (id) ON DELETE CASCADE,
    data_plantao DATE NOT NULL,
    turno TEXT NOT NULL, -- 'Manhã', 'Tarde', 'Noite', 'Madrugada'
    vagas_totais INT NOT NULL,
    vagas_ocupadas INT DEFAULT 0,
    status TEXT DEFAULT 'ABERTO', -- 'ABERTO', 'OCUPADO'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (unidade_id, data_plantao, turno)
);

-- Escala consolidada: Quem está em qual vaga
CREATE TABLE IF NOT EXISTS escala (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    unidade_id UUID NOT NULL REFERENCES unidades (id) ON DELETE CASCADE,
    medico_id UUID NOT NULL REFERENCES medicos (id) ON DELETE CASCADE,
    data_plantao DATE NOT NULL,
    turno TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (unidade_id, data_plantao, turno, medico_id)
);

-- Reservas/Agendamentos (Tabela de apoio para rastreio de ocupação em disponibilidade)
CREATE TABLE IF NOT EXISTS agendamentos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    disponibilidade_id UUID NOT NULL REFERENCES disponibilidade (id) ON DELETE CASCADE,
    medico_id UUID NOT NULL REFERENCES medicos (id) ON DELETE CASCADE,
    data_reserva TIMESTAMPTZ DEFAULT NOW(),
    confirmado BOOLEAN DEFAULT TRUE,
    UNIQUE (disponibilidade_id, medico_id)
);

-- Fila temporária para reserva (Hold de 15 minutos)
CREATE TABLE IF NOT EXISTS reserva_holds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    disponibilidade_id UUID NOT NULL REFERENCES disponibilidade (id) ON DELETE CASCADE,
    medico_id UUID NOT NULL REFERENCES medicos (id) ON DELETE CASCADE,
    reservado_ate TIMESTAMPTZ NOT NULL,
    fila_ativa BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (disponibilidade_id)
);

-- -----------------------------------------------------------------------------
-- 3. WORKFLOWS: TROCAS E TEMPLATES
-- -----------------------------------------------------------------------------

-- Pedidos de troca (Permutas bilaterais)
CREATE TABLE IF NOT EXISTS pedidos_troca_escala (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    unidade_id UUID NOT NULL REFERENCES unidades (id) ON DELETE CASCADE,
    data_plantao DATE NOT NULL,
    turno TEXT NOT NULL,
    medico_solicitante_id UUID NOT NULL REFERENCES medicos (id) ON DELETE CASCADE,
    medico_alvo_id UUID NOT NULL REFERENCES medicos (id) ON DELETE CASCADE,
    escala_alvo_id UUID NOT NULL REFERENCES escala (id) ON DELETE CASCADE,
    escala_oferecida_id UUID REFERENCES escala(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'AGUARDANDO_COLEGA', -- 'AGUARDANDO_GESTOR', 'APROVADO', etc
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (escala_alvo_id) WHERE status IN ('AGUARDANDO_COLEGA', 'AGUARDANDO_GESTOR')
);

-- Templates inteligentes (Escala Base/Time de Futebol)
CREATE TABLE IF NOT EXISTS escala_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    unidade_id UUID NOT NULL REFERENCES unidades(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    tipo TEXT NOT NULL CHECK (tipo IN ('SEMANAL', 'QUINZENAL', 'MENSAL')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(unidade_id, nome)
);

CREATE TABLE IF NOT EXISTS escala_template_slots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    template_id UUID NOT NULL REFERENCES escala_templates(id) ON DELETE CASCADE,
    dia INT NOT NULL, -- 0-6 (Fim de semana/Dia) ou 1-31 (Mês)
    turno TEXT NOT NULL,
    medico_id UUID NOT NULL REFERENCES medicos(id) ON DELETE CASCADE,
    UNIQUE(template_id, dia, turno, medico_id)
);

-- -----------------------------------------------------------------------------
-- 4. INTELIGÊNCIA: DADOS BRUTOS (ESPELHO TASY)
-- -----------------------------------------------------------------------------

-- Histórico bruto de atendimentos para alimentar o preditor
CREATE TABLE IF NOT EXISTS tasy_raw_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    unidade_id UUID REFERENCES unidades (id) ON DELETE CASCADE,
    data_atendimento DATE NOT NULL,
    periodo TEXT,
    atendimento_count INT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (unidade_id, data_atendimento, periodo)
);

-- -----------------------------------------------------------------------------
-- 5. LÓGICA DE NEGÓCIO (POSTGRES FUNCTIONS)
-- -----------------------------------------------------------------------------

-- Exemplo: Aprovação atômica de troca pelo gestor
CREATE OR REPLACE FUNCTION public.aprovar_pedido_troca_gestor(p_pedido_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    -- Lógica de troca de IDs na tabela escala e fechamento do pedido
    -- Implementar conforme regras corporativas de auditoria.
END;
$$;

-- -----------------------------------------------------------------------------
-- 6. WORKFLOWS ADICIONAIS: ASSUMIR VAGO E CANCELAMENTOS
-- -----------------------------------------------------------------------------

-- Pedido de assumir turno vago
CREATE TABLE IF NOT EXISTS pedidos_assumir_escala (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    unidade_id UUID NOT NULL REFERENCES unidades (id) ON DELETE CASCADE,
    data_plantao DATE NOT NULL,
    turno TEXT NOT NULL,
    medico_solicitante_id UUID NOT NULL REFERENCES medicos (id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'AGUARDANDO_GESTOR', -- APROVADO, RECUSADO_GESTOR
    gestor_respondeu_em TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Pedido de cancelamento de plantao
CREATE TABLE IF NOT EXISTS pedidos_cancelamento_escala (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    unidade_id UUID NOT NULL REFERENCES unidades (id) ON DELETE CASCADE,
    escala_id UUID REFERENCES escala (id) ON DELETE SET NULL,
    medico_id UUID NOT NULL REFERENCES medicos (id) ON DELETE CASCADE,
    data_plantao DATE NOT NULL,
    turno TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDENTE', -- APROVADO, RECUSADO
    gestor_respondeu_em TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Garante a FK correta para preservar historico de cancelamento quando a linha da escala for removida.
ALTER TABLE pedidos_cancelamento_escala
    DROP CONSTRAINT IF EXISTS pedidos_cancelamento_escala_escala_id_fkey;

ALTER TABLE pedidos_cancelamento_escala
    ADD CONSTRAINT pedidos_cancelamento_escala_escala_id_fkey
    FOREIGN KEY (escala_id)
    REFERENCES escala (id)
    ON DELETE SET NULL;
