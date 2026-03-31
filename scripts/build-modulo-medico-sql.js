import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const escalaVals = fs.readFileSync(path.join(__dirname, 'escala-values.sql'), 'utf8');

const header = `-- Módulo médico: 9 unidades reais, 10 médicos demo, perfis/gestores demo, escala (mar+abr/2026)
-- Rode no SQL Editor do Supabase (banco vazio ou após DROP das mesmas tabelas).
-- Migração de ambiente já populado: ver model/migrate_unidades_reais_supabase.sql
-- No app: DISABLE_PREDICTOR_SCHEDULER=true no .env evita erros se não houver tasy_raw_history/disponibilidade.
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS unidades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT NOT NULL,
    endereco TEXT,
    capacidade_media_atendimento INT DEFAULT 10,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS medicos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT NOT NULL,
    usuario TEXT UNIQUE NOT NULL,
    telefone TEXT,
    especialidade TEXT NOT NULL,
    crm TEXT UNIQUE NOT NULL,
    senha TEXT,
    unidade_fixa_id UUID REFERENCES unidades (id) ON DELETE SET NULL,
    atendimento_padrao_por_periodo INT DEFAULT 10,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS perfis (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gestores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT NOT NULL,
    usuario TEXT UNIQUE NOT NULL,
    senha TEXT,
    perfil_id UUID REFERENCES perfis (id) ON DELETE SET NULL,
    unidade_id UUID UNIQUE REFERENCES unidades (id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS medico_acessos_unidade (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    medico_id UUID NOT NULL REFERENCES medicos (id) ON DELETE CASCADE,
    unidade_id UUID NOT NULL REFERENCES unidades (id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (medico_id, unidade_id)
);

CREATE TABLE IF NOT EXISTS escala (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unidade_id UUID NOT NULL REFERENCES unidades (id) ON DELETE CASCADE,
    medico_id UUID NOT NULL REFERENCES medicos (id) ON DELETE CASCADE,
    data_plantao DATE NOT NULL,
    turno TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (unidade_id, data_plantao, turno, medico_id)
);

INSERT INTO unidades (id, nome, endereco, capacidade_media_atendimento)
VALUES
    ('b1000001-0000-4000-8000-000000000001', '001 - PS HOSPITAL VITÓRIA', 'Vitória, ES', 10),
    ('b1000001-0000-4000-8000-000000000002', '003 - PS VILA VELHA', 'Vila Velha, ES', 10),
    ('b1000001-0000-4000-8000-000000000003', '013 - PS SIG', 'Brasília, DF', 10),
    ('b1000001-0000-4000-8000-000000000004', '025 - PS BARRA DA TIJUCA', 'Rio de Janeiro, RJ', 10),
    ('b1000001-0000-4000-8000-000000000005', '026 - PS BOTAFOGO', 'Rio de Janeiro, RJ', 10),
    ('b1000001-0000-4000-8000-000000000006', '031 - PS GUTIERREZ', 'Belo Horizonte, MG', 10),
    ('b1000001-0000-4000-8000-000000000007', '033 - PS PAMPULHA', 'Belo Horizonte, MG', 10),
    ('b1000001-0000-4000-8000-000000000008', '039 - PS TAGUATINGA', 'Taguatinga, DF', 10),
    ('b1000001-0000-4000-8000-000000000009', '045 - PS CAMPO GRANDE', 'Rio de Janeiro, RJ', 10)
ON CONFLICT (id) DO NOTHING;

INSERT INTO medicos (id, nome, usuario, crm, telefone, especialidade, unidade_fixa_id, senha, atendimento_padrao_por_periodo)
VALUES
    ('c1000001-0000-4000-8000-000000000001', 'Maria Helena Duarte', 'maria.duarte', '52891-ES', '(27) 98888-1001', 'Clínico geral', 'b1000001-0000-4000-8000-000000000001', '12345', 10),
    ('c1000001-0000-4000-8000-000000000002', 'Paulo Sérgio Nunes', 'paulo.nunes', '53902-ES', '(27) 97777-1002', 'Clínico geral', 'b1000001-0000-4000-8000-000000000002', '12345', 10),
    ('c1000001-0000-4000-8000-000000000003', 'Amanda Cristina Ferreira', 'amanda.ferreira', '108234-RJ', '(21) 96666-2003', 'Clínico geral', 'b1000001-0000-4000-8000-000000000004', '12345', 10),
    ('c1000001-0000-4000-8000-000000000004', 'Rodrigo Antunes Vieira', 'rodrigo.vieira', '109345-RJ', '(21) 95555-2004', 'Clínico geral', 'b1000001-0000-4000-8000-000000000005', '12345', 10),
    ('c1000001-0000-4000-8000-000000000005', 'Letícia Martins Correia', 'leticia.correia', '45678-DF', '(61) 94444-3005', 'Clínico geral', 'b1000001-0000-4000-8000-000000000003', '12345', 10),
    ('c1000001-0000-4000-8000-000000000006', 'Tiago Albuquerque Reis', 'tiago.reis', '46789-DF', '(61) 93333-3006', 'Clínico geral', 'b1000001-0000-4000-8000-000000000008', '12345', 10),
    ('c1000001-0000-4000-8000-000000000007', 'Beatriz Campos Lacerda', 'beatriz.lacerda', '87654-MG', '(31) 92222-4007', 'Clínico geral', 'b1000001-0000-4000-8000-000000000006', '12345', 10),
    ('c1000001-0000-4000-8000-000000000008', 'Felipe Augusto Cunha', 'felipe.cunha', '88765-MG', '(31) 91111-4008', 'Clínico geral', 'b1000001-0000-4000-8000-000000000007', '12345', 10),
    ('c1000001-0000-4000-8000-000000000009', 'Larissa Prado Monteiro', 'larissa.monteiro', '112233-RJ', '(21) 90000-5009', 'Clínico geral', 'b1000001-0000-4000-8000-000000000009', '12345', 10),
    ('c1000001-0000-4000-8000-000000000010', 'Gustavo Henrique Dias', 'gustavo.dias', '223344-RJ', '(21) 98888-6010', 'Clínico geral', 'b1000001-0000-4000-8000-000000000004', '12345', 10),
    ('c1000001-0000-4000-8000-000000000011', 'Carla Mendes Souza', 'carla.mendes', '52901-ES', '(27) 98888-1011', 'Clínico geral', 'b1000001-0000-4000-8000-000000000001', '12345', 10),
    ('c1000001-0000-4000-8000-000000000012', 'Ricardo Fonseca Lima', 'ricardo.fonseca', '53911-ES', '(27) 97777-1012', 'Clínico geral', 'b1000001-0000-4000-8000-000000000002', '12345', 10),
    ('c1000001-0000-4000-8000-000000000013', 'Fernanda Rocha Dias', 'fernanda.rocha', '45688-DF', '(61) 94444-1013', 'Clínico geral', 'b1000001-0000-4000-8000-000000000003', '12345', 10),
    ('c1000001-0000-4000-8000-000000000014', 'Diego Cardoso Meyer', 'diego.cardoso', '108400-RJ', '(21) 96666-1014', 'Clínico geral', 'b1000001-0000-4000-8000-000000000004', '12345', 10),
    ('c1000001-0000-4000-8000-000000000015', 'Juliana Torres Rezende', 'juliana.torres', '109400-RJ', '(21) 95555-1015', 'Clínico geral', 'b1000001-0000-4000-8000-000000000005', '12345', 10),
    ('c1000001-0000-4000-8000-000000000016', 'Renata Silveira Costa', 'renata.silveira', '87660-MG', '(31) 92222-1016', 'Clínico geral', 'b1000001-0000-4000-8000-000000000006', '12345', 10),
    ('c1000001-0000-4000-8000-000000000017', 'Marcelo Pires Barbosa', 'marcelo.pires', '88770-MG', '(31) 91111-1017', 'Clínico geral', 'b1000001-0000-4000-8000-000000000007', '12345', 10),
    ('c1000001-0000-4000-8000-000000000018', 'Camila Freitas Nogueira', 'camila.freitas', '46799-DF', '(61) 93333-1018', 'Clínico geral', 'b1000001-0000-4000-8000-000000000008', '12345', 10),
    ('c1000001-0000-4000-8000-000000000019', 'Patrícia Azevedo Linhares', 'patricia.azevedo', '112244-RJ', '(21) 90000-1019', 'Clínico geral', 'b1000001-0000-4000-8000-000000000009', '12345', 10)
ON CONFLICT (id) DO NOTHING;

INSERT INTO perfis (id, nome)
VALUES ('d1000001-0000-4000-8000-000000000001', 'GESTOR')
ON CONFLICT (id) DO NOTHING;

INSERT INTO perfis (id, nome)
VALUES ('d1000001-0000-4000-8000-000000000099', 'GESTOR_MASTER')
ON CONFLICT (id) DO NOTHING;

INSERT INTO gestores (id, nome, usuario, senha, perfil_id, unidade_id)
VALUES
    ('e1000001-0000-4000-8000-000000000001', 'Gestor administrativo (confirmar nome) — 001 - PS HOSPITAL VITÓRIA', 'gestor.001', '12345', 'd1000001-0000-4000-8000-000000000001', 'b1000001-0000-4000-8000-000000000001'),
    ('e1000001-0000-4000-8000-000000000002', 'Gestor administrativo (confirmar nome) — 003 - PS VILA VELHA', 'gestor.003', '12345', 'd1000001-0000-4000-8000-000000000001', 'b1000001-0000-4000-8000-000000000002'),
    ('e1000001-0000-4000-8000-000000000003', 'Gestor administrativo (confirmar nome) — 013 - PS SIG', 'gestor.013', '12345', 'd1000001-0000-4000-8000-000000000001', 'b1000001-0000-4000-8000-000000000003'),
    ('e1000001-0000-4000-8000-000000000004', 'Gestor administrativo (confirmar nome) — 025 - PS BARRA DA TIJUCA', 'gestor.025', '12345', 'd1000001-0000-4000-8000-000000000001', 'b1000001-0000-4000-8000-000000000004'),
    ('e1000001-0000-4000-8000-000000000005', 'Gestor administrativo (confirmar nome) — 026 - PS BOTAFOGO', 'gestor.026', '12345', 'd1000001-0000-4000-8000-000000000001', 'b1000001-0000-4000-8000-000000000005'),
    ('e1000001-0000-4000-8000-000000000006', 'Gestor administrativo (confirmar nome) — 031 - PS GUTIERREZ', 'gestor.031', '12345', 'd1000001-0000-4000-8000-000000000001', 'b1000001-0000-4000-8000-000000000006'),
    ('e1000001-0000-4000-8000-000000000007', 'Gestor administrativo (confirmar nome) — 033 - PS PAMPULHA', 'gestor.033', '12345', 'd1000001-0000-4000-8000-000000000001', 'b1000001-0000-4000-8000-000000000007'),
    ('e1000001-0000-4000-8000-000000000008', 'Gestor administrativo (confirmar nome) — 039 - PS TAGUATINGA', 'gestor.039', '12345', 'd1000001-0000-4000-8000-000000000001', 'b1000001-0000-4000-8000-000000000008'),
    ('e1000001-0000-4000-8000-000000000009', 'Gestor administrativo (confirmar nome) — 045 - PS CAMPO GRANDE', 'gestor.045', '12345', 'd1000001-0000-4000-8000-000000000001', 'b1000001-0000-4000-8000-000000000009'),
    ('e1000001-0000-4000-8000-000000000099', 'Gestor Master', 'gestor.master', '12345', 'd1000001-0000-4000-8000-000000000099', NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO escala (id, unidade_id, medico_id, data_plantao, turno)
VALUES
`;

const footer = `;

-- Calendário demo: março e abril/2026, todas as unidades. Furos por dia do mês (múltiplos de 7 ou 13).
-- Só o INSERT de escala (sem CREATE/unidades/médicos): model/escala_demo_mar_abr_2026.sql
`;

const out = header + escalaVals + footer;
fs.writeFileSync(path.join(root, 'model', 'modulo_medico.sql'), out, 'utf8');
console.log('Wrote model/modulo_medico.sql');
