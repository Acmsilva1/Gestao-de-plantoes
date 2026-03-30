-- Estrutura de apoio para ambiente local sem dados.
-- Este arquivo nao insere registros; serve apenas como referencia
-- das tabelas e colunas que o app espera encontrar.

-- TABELA: unidades
-- colunas:
--   id UUID
--   nome TEXT
--   endereco TEXT
--   capacidade_media_atendimento INT
--   created_at TIMESTAMPTZ

-- TABELA: perfis
-- colunas:
--   id UUID
--   nome TEXT
--   created_at TIMESTAMPTZ

-- TABELA: medicos
-- colunas:
--   id UUID
--   nome TEXT
--   telefone TEXT
--   especialidade TEXT
--   crm TEXT
--   senha TEXT
--   unidade_fixa_id UUID
--   atendimento_padrao_por_periodo INT
--   created_at TIMESTAMPTZ

-- TABELA: gestores
-- colunas:
--   id UUID
--   nome TEXT
--   usuario TEXT
--   senha TEXT
--   perfil_id UUID
--   created_at TIMESTAMPTZ

-- TABELA: medico_acessos_unidade
-- colunas:
--   id UUID
--   medico_id UUID
--   unidade_id UUID
--   created_at TIMESTAMPTZ

-- TABELA: tasy_raw_history
-- colunas:
--   id UUID
--   unidade_id UUID
--   data_atendimento DATE
--   periodo TEXT
--   atendimento_count INT
--   created_at TIMESTAMPTZ

-- TABELA: disponibilidade
-- colunas:
--   id UUID
--   unidade_id UUID
--   data_plantao DATE
--   turno TEXT
--   vagas_totais INT
--   vagas_ocupadas INT
--   status TEXT
--   created_at TIMESTAMPTZ

-- TABELA: agendamentos
-- colunas:
--   id UUID
--   disponibilidade_id UUID
--   medico_id UUID
--   data_reserva TIMESTAMPTZ
--   confirmado BOOLEAN

-- TABELA: reserva_holds
-- colunas:
--   id UUID
--   disponibilidade_id UUID
--   medico_id UUID
--   reservado_ate TIMESTAMPTZ
--   fila_ativa BOOLEAN
--   created_at TIMESTAMPTZ
--   updated_at TIMESTAMPTZ
