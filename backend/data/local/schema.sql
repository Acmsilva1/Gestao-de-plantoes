CREATE TABLE IF NOT EXISTS unidades (
    id TEXT PRIMARY KEY,
    nome TEXT,
    endereco TEXT,
    capacidade_media_atendimento INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS medicos (
    id TEXT PRIMARY KEY,
    nome TEXT,
    telefone TEXT,
    especialidade TEXT,
    crm TEXT,
    senha TEXT,
    unidade_fixa_id TEXT,
    atendimento_padrao_por_periodo INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    usuario TEXT
);

CREATE TABLE IF NOT EXISTS medico_acessos_unidade (
    id TEXT PRIMARY KEY,
    medico_id TEXT,
    unidade_id TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS historico_tasy (
    id TEXT PRIMARY KEY,
    data TEXT,
    turno TEXT,
    total_atendimentos INTEGER,
    unidade TEXT,
    regional TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS historico_tasy_ml (
    data TEXT,
    ano INTEGER,
    mes INTEGER,
    dia INTEGER,
    dia_semana INTEGER,
    turno_id TEXT,
    regional_id TEXT,
    unidade_id TEXT,
    total_atendimentos INTEGER
);

CREATE TABLE IF NOT EXISTS dados_predicao (
    id TEXT PRIMARY KEY,
    data_prevista TEXT,
    turno TEXT,
    demanda_estimada INTEGER,
    unidade TEXT,
    regional TEXT,
    executado_em TEXT,
    confianca REAL
);

CREATE TABLE IF NOT EXISTS disponibilidade (
    id TEXT PRIMARY KEY,
    unidade_id TEXT,
    data_plantao TEXT,
    turno TEXT,
    vagas_totais INTEGER,
    vagas_ocupadas INTEGER,
    status TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS agendamentos (
    id TEXT PRIMARY KEY,
    disponibilidade_id TEXT,
    medico_id TEXT,
    confirmado BOOLEAN DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS escala (
    id TEXT PRIMARY KEY,
    unidade_id TEXT,
    medico_id TEXT,
    data_plantao TEXT,
    turno TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS escala_mes_publicacao (
    id TEXT PRIMARY KEY,
    unidade_id TEXT,
    mes TEXT,
    status TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pedidos_troca_escala (
    id TEXT PRIMARY KEY,
    unidade_id TEXT,
    data_plantao TEXT,
    turno TEXT,
    medico_solicitante_id TEXT,
    medico_alvo_id TEXT,
    escala_alvo_id TEXT,
    escala_oferecida_id TEXT,
    data_plantao_oferecida TEXT,
    turno_oferecido TEXT,
    status TEXT,
    colega_respondeu_em TEXT,
    gestor_respondeu_em TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pedidos_assumir_escala (
    id TEXT PRIMARY KEY,
    unidade_id TEXT,
    data_plantao TEXT,
    turno TEXT,
    medico_solicitante_id TEXT,
    status TEXT,
    gestor_respondeu_em TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tasy_raw_history (
    id TEXT PRIMARY KEY,
    unidade_id TEXT,
    data_atendimento TEXT,
    periodo TEXT,
    atendimento_count INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(unidade_id, data_atendimento, periodo)
);

CREATE TABLE IF NOT EXISTS perfis (
    id TEXT PRIMARY KEY,
    nome TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS gestores (
    id TEXT PRIMARY KEY,
    nome TEXT NOT NULL,
    usuario TEXT NOT NULL UNIQUE,
    senha TEXT,
    perfil_id TEXT,
    unidade_id TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pedidos_cancelamento_escala (
    id TEXT PRIMARY KEY,
    unidade_id TEXT NOT NULL,
    escala_id TEXT,
    medico_id TEXT NOT NULL,
    data_plantao TEXT NOT NULL,
    turno TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDENTE',
    gestor_respondeu_em TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reserva_holds (
    id TEXT PRIMARY KEY,
    disponibilidade_id TEXT NOT NULL,
    medico_id TEXT NOT NULL,
    reservado_ate TEXT NOT NULL,
    fila_ativa INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS escala_templates (
    id TEXT PRIMARY KEY,
    unidade_id TEXT NOT NULL,
    nome TEXT NOT NULL,
    tipo TEXT NOT NULL,
    dias_modelo INTEGER NOT NULL DEFAULT 7,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS escala_template_slots (
    id TEXT PRIMARY KEY,
    template_id TEXT NOT NULL,
    dia INTEGER NOT NULL,
    turno TEXT NOT NULL,
    medico_id TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
