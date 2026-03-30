-- =============================================================================
-- Schema + dados iniciais para Supabase (Gestão de Plantões)
-- Execute no SQL Editor (tudo de uma vez ou por blocos na ordem).
-- Ordem: unidades → perfis → medicos → gestores → medico_acessos → restantes
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -----------------------------------------------------------------------------
-- 1. UNIDADES (antes de medicos)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS unidades (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nome TEXT NOT NULL,
    endereco TEXT,
    capacidade_media_atendimento INT DEFAULT 10,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 2. PERFIS (gestores)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS perfis (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nome TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 3. MÉDICOS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS medicos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nome TEXT NOT NULL,
    telefone TEXT,
    especialidade TEXT NOT NULL,
    crm TEXT UNIQUE NOT NULL,
    senha TEXT,
    unidade_fixa_id UUID REFERENCES unidades (id) ON DELETE SET NULL,
    atendimento_padrao_por_periodo INT DEFAULT 10,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 4. GESTORES
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gestores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nome TEXT NOT NULL,
    usuario TEXT UNIQUE NOT NULL,
    senha TEXT,
    perfil_id UUID REFERENCES perfis (id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 5. ACESSO MÉDICO A OUTRAS UNIDADES
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS medico_acessos_unidade (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    medico_id UUID NOT NULL REFERENCES medicos (id) ON DELETE CASCADE,
    unidade_id UUID NOT NULL REFERENCES unidades (id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (medico_id, unidade_id)
);

-- -----------------------------------------------------------------------------
-- 6. DISPONIBILIDADE / PLANTÕES
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS disponibilidade (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    unidade_id UUID NOT NULL REFERENCES unidades (id) ON DELETE CASCADE,
    data_plantao DATE NOT NULL,
    turno TEXT NOT NULL,
    vagas_totais INT NOT NULL,
    vagas_ocupadas INT DEFAULT 0,
    status TEXT DEFAULT 'ABERTO',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (unidade_id, data_plantao, turno)
);

-- -----------------------------------------------------------------------------
-- 7. AGENDAMENTOS (colunas extra usadas pelo Node)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agendamentos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    disponibilidade_id UUID NOT NULL REFERENCES disponibilidade (id) ON DELETE CASCADE,
    medico_id UUID NOT NULL REFERENCES medicos (id) ON DELETE CASCADE,
    data_reserva TIMESTAMPTZ DEFAULT NOW(),
    confirmado BOOLEAN DEFAULT TRUE,
    tipo_plantao TEXT DEFAULT 'COMPLETO',
    hora_inicio TEXT,
    hora_fim TEXT,
    data_inicio_fixo DATE,
    data_fim_fixo DATE,
    grupo_sequencia_id UUID,
    UNIQUE (disponibilidade_id, medico_id)
);

-- -----------------------------------------------------------------------------
-- 8. RESERVA TEMPORÁRIA (fila)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reserva_holds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    disponibilidade_id UUID NOT NULL REFERENCES disponibilidade (id) ON DELETE CASCADE,
    medico_id UUID NOT NULL REFERENCES medicos (id) ON DELETE CASCADE,
    reservado_ate TIMESTAMPTZ NOT NULL,
    fila_ativa BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (disponibilidade_id)
);

-- -----------------------------------------------------------------------------
-- 9. HISTÓRICO (predição / Tasy)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tasy_raw_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    unidade_id UUID REFERENCES unidades (id) ON DELETE CASCADE,
    data_atendimento DATE NOT NULL,
    periodo TEXT,
    atendimento_count INT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (unidade_id, data_atendimento, periodo)
);

-- =============================================================================
-- DADOS INICIAIS: 5 unidades (UF) + 5 médicos
-- =============================================================================

INSERT INTO unidades (id, nome, endereco, capacidade_media_atendimento)
VALUES
    ('b1000001-0000-4000-8000-000000000001', 'ES', 'Regional Espírito Santo', 10),
    ('b1000001-0000-4000-8000-000000000002', 'RJ', 'Regional Rio de Janeiro', 10),
    ('b1000001-0000-4000-8000-000000000003', 'SP', 'Regional São Paulo', 10),
    ('b1000001-0000-4000-8000-000000000004', 'MG', 'Regional Minas Gerais', 10),
    ('b1000001-0000-4000-8000-000000000005', 'BA', 'Regional Bahia', 10)
ON CONFLICT (id) DO NOTHING;

INSERT INTO medicos (id, nome, crm, telefone, especialidade, unidade_fixa_id, senha, atendimento_padrao_por_periodo)
VALUES
    ('c1000001-0000-4000-8000-000000000001', 'Ana Paula Ferreira', '12345-ES', '(27) 98888-1001', 'Clínica Médica', 'b1000001-0000-4000-8000-000000000001', '12345', 10),
    ('c1000001-0000-4000-8000-000000000002', 'Bruno Almeida Costa', '67890-RJ', '(21) 97777-2002', 'Pediatria', 'b1000001-0000-4000-8000-000000000002', '12345', 10),
    ('c1000001-0000-4000-8000-000000000003', 'Carla Mendes Rocha', '11223-SP', '(11) 96666-3003', 'Emergência', 'b1000001-0000-4000-8000-000000000003', '12345', 10),
    ('c1000001-0000-4000-8000-000000000004', 'Daniel Ribeiro Santos', '44556-MG', '(31) 95555-4004', 'Cardiologia', 'b1000001-0000-4000-8000-000000000004', '12345', 10),
    ('c1000001-0000-4000-8000-000000000005', 'Eduarda Lima Oliveira', '77889-BA', '(71) 94444-5005', 'Clínica Médica', 'b1000001-0000-4000-8000-000000000005', '12345', 10)
ON CONFLICT (id) DO NOTHING;

-- Opcional: um perfil e um gestor de exemplo (painel gerencial / API)
INSERT INTO perfis (id, nome)
VALUES ('d1000001-0000-4000-8000-000000000001', 'GESTOR')
ON CONFLICT (id) DO NOTHING;

INSERT INTO gestores (id, nome, usuario, senha, perfil_id)
VALUES
    ('e1000001-0000-4000-8000-000000000001', 'Gestor Demo', 'gestor.demo', '12345', 'd1000001-0000-4000-8000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- Supabase: ative RLS nas tabelas se usar políticas; para testes internos,
-- em Authentication > Policies pode permitir service role / anon conforme o caso.
-- =============================================================================
