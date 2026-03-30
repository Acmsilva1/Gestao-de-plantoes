import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const escalaVals = fs.readFileSync(path.join(__dirname, 'escala-values.sql'), 'utf8');

const header = `-- Módulo médico: unidades (UF), medicos (10), escala (mar/2026, com "furos")
-- Rode no SQL Editor do Supabase (banco vazio ou após DROP das mesmas tabelas).
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
    telefone TEXT,
    especialidade TEXT NOT NULL,
    crm TEXT UNIQUE NOT NULL,
    senha TEXT,
    unidade_fixa_id UUID REFERENCES unidades (id) ON DELETE SET NULL,
    atendimento_padrao_por_periodo INT DEFAULT 10,
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
    ('b1000001-0000-4000-8000-000000000001', 'ES', 'Regional Espírito Santo', 10),
    ('b1000001-0000-4000-8000-000000000002', 'RJ', 'Regional Rio de Janeiro', 10),
    ('b1000001-0000-4000-8000-000000000003', 'SP', 'Regional São Paulo', 10),
    ('b1000001-0000-4000-8000-000000000004', 'MG', 'Regional Minas Gerais', 10),
    ('b1000001-0000-4000-8000-000000000005', 'BA', 'Regional Bahia', 10),
    ('b1000001-0000-4000-8000-000000000006', 'PR', 'Regional Paraná', 10)
ON CONFLICT (id) DO NOTHING;

INSERT INTO medicos (id, nome, crm, telefone, especialidade, unidade_fixa_id, senha, atendimento_padrao_por_periodo)
VALUES
    ('c1000001-0000-4000-8000-000000000001', 'Ana Paula Ferreira', '10001-ES', '(27) 98888-1001', 'Clínica Médica', 'b1000001-0000-4000-8000-000000000001', '12345', 10),
    ('c1000001-0000-4000-8000-000000000002', 'Bruno Almeida Costa', '10002-ES', '(27) 97777-1002', 'Pediatria', 'b1000001-0000-4000-8000-000000000001', '12345', 10),
    ('c1000001-0000-4000-8000-000000000003', 'Carla Mendes Rocha', '20001-RJ', '(21) 96666-2003', 'Emergência', 'b1000001-0000-4000-8000-000000000002', '12345', 10),
    ('c1000001-0000-4000-8000-000000000004', 'Daniel Ribeiro Santos', '20002-RJ', '(21) 95555-2004', 'Cardiologia', 'b1000001-0000-4000-8000-000000000002', '12345', 10),
    ('c1000001-0000-4000-8000-000000000005', 'Eduarda Lima Oliveira', '30001-SP', '(11) 94444-3005', 'Clínica Médica', 'b1000001-0000-4000-8000-000000000003', '12345', 10),
    ('c1000001-0000-4000-8000-000000000006', 'Felipe Nogueira Dias', '30002-SP', '(11) 93333-3006', 'Ortopedia', 'b1000001-0000-4000-8000-000000000003', '12345', 10),
    ('c1000001-0000-4000-8000-000000000007', 'Gabriela Souza Pinto', '40001-MG', '(31) 92222-4007', 'Pediatria', 'b1000001-0000-4000-8000-000000000004', '12345', 10),
    ('c1000001-0000-4000-8000-000000000008', 'Henrique Castro Melo', '40002-MG', '(31) 91111-4008', 'Emergência', 'b1000001-0000-4000-8000-000000000004', '12345', 10),
    ('c1000001-0000-4000-8000-000000000009', 'Isabela Freitas Araújo', '50001-BA', '(71) 90000-5009', 'Clínica Médica', 'b1000001-0000-4000-8000-000000000005', '12345', 10),
    ('c1000001-0000-4000-8000-000000000010', 'João Victor Prado', '60001-PR', '(41) 98888-6010', 'Cirurgia Geral', 'b1000001-0000-4000-8000-000000000006', '12345', 10)
ON CONFLICT (id) DO NOTHING;

INSERT INTO escala (id, unidade_id, medico_id, data_plantao, turno)
VALUES
`;

const footer = `;

-- Calendário demo: março/2026. Dias 7, 13, 14, 20, 21, 28 sem linhas (furos); vários turnos/dia sem médico.
`;

const out = header + escalaVals + footer;
fs.writeFileSync(path.join(root, 'model', 'modulo_medico.sql'), out, 'utf8');
console.log('Wrote model/modulo_medico.sql');
