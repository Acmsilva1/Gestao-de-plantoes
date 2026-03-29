-- Habilita a geração automática de IDs únicos
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. CADASTRO DE MÉDICOS
CREATE TABLE medicos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nome TEXT NOT NULL,
    telefone TEXT,
    especialidade TEXT NOT NULL,
    crm TEXT UNIQUE NOT NULL, -- Impede CRM duplicado
    unidade_fixa_id UUID REFERENCES unidades(id),
    atendimento_padrao_por_periodo INT DEFAULT 10, -- Base fictícia para previsão
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. UNIDADES DE ATENDIMENTO (UPA, Hospital, etc)
CREATE TABLE unidades (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nome TEXT NOT NULL,
    endereco TEXT,
    capacidade_media_atendimento INT DEFAULT 10, -- Base para a predição
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. DISPONIBILIDADE E PREDIÇÃO (O Coração do Sistema)
-- Aqui o PredictionService.js salva o resultado da "vidente"
CREATE TABLE disponibilidade (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    unidade_id UUID REFERENCES unidades(id) ON DELETE CASCADE,
    data_plantao DATE NOT NULL,
    turno TEXT NOT NULL, -- 'Manhã', 'Tarde', 'Noite', 'Madrugada'
    vagas_totais INT NOT NULL, -- Calculado com base nos atendimentos por período
    vagas_ocupadas INT DEFAULT 0,
    status TEXT DEFAULT 'ABERTO', -- 'ABERTO', 'LOTADO', 'CANCELADO'
    
    -- Impede que o script de predição crie dois registros para o mesmo turno/dia/unidade
    UNIQUE(unidade_id, data_plantao, turno)
);

-- 4. AGENDAMENTOS (O Puxadinho / Seleção do Médico)
CREATE TABLE agendamentos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    disponibilidade_id UUID REFERENCES disponibilidade(id) ON DELETE CASCADE,
    medico_id UUID REFERENCES medicos(id) ON DELETE CASCADE,
    data_reserva TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    confirmado BOOLEAN DEFAULT TRUE,
    
    -- Garante que um médico não pegue a mesma vaga duas vezes
    UNIQUE(disponibilidade_id, medico_id)
);

-- 5. BLOQUEIO TEMPORÁRIO DE RESERVA
CREATE TABLE reserva_holds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    disponibilidade_id UUID REFERENCES disponibilidade(id) ON DELETE CASCADE,
    medico_id UUID REFERENCES medicos(id) ON DELETE CASCADE,
    reservado_ate TIMESTAMP WITH TIME ZONE NOT NULL,
    fila_ativa BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Um plantão só pode ficar bloqueado por um médico por vez
    UNIQUE(disponibilidade_id)
);

-- 6. DADOS BRUTOS (Espelho do Oracle/Tasy para Treino da Predição)
CREATE TABLE tasy_raw_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    unidade_id UUID REFERENCES unidades(id),
    data_atendimento DATE NOT NULL,
    periodo TEXT, -- 'Manhã', 'Tarde', 'Noite', 'Madrugada'. Se ausente, o sistema distribui por pesos fictícios
    atendimento_count INT NOT NULL, -- Quantos pacientes passaram no período
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Impede histórico duplicado para a mesma unidade/data/período
    UNIQUE(unidade_id, data_atendimento, periodo)
);
