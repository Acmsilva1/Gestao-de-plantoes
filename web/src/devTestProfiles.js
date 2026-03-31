/**
 * Perfis de gestor para seleção na entrada (sem autenticação).
 * Médicos: preferencialmente carregados de GET /api/medicos; estes são só fallback.
 */
/** IDs alinhados a model/supabase_schema_completo.sql (quando GET /api/medicos falha). */
const U_VITORIA = {
    id: 'b1000001-0000-4000-8000-000000000001',
    nome: '001 - PS HOSPITAL VITÓRIA'
};
const U_VILA_VELHA = {
    id: 'b1000001-0000-4000-8000-000000000002',
    nome: '003 - PS VILA VELHA'
};
const U_SIG = {
    id: 'b1000001-0000-4000-8000-000000000003',
    nome: '013 - PS SIG'
};
const U_BARRA = {
    id: 'b1000001-0000-4000-8000-000000000004',
    nome: '025 - PS BARRA DA TIJUCA'
};
const U_BOTAFOGO = {
    id: 'b1000001-0000-4000-8000-000000000005',
    nome: '026 - PS BOTAFOGO'
};
const U_GUTIERREZ = {
    id: 'b1000001-0000-4000-8000-000000000006',
    nome: '031 - PS GUTIERREZ'
};
const U_PAMPULHA = {
    id: 'b1000001-0000-4000-8000-000000000007',
    nome: '033 - PS PAMPULHA'
};
const U_TAGUATINGA = {
    id: 'b1000001-0000-4000-8000-000000000008',
    nome: '039 - PS TAGUATINGA'
};
const U_CAMPO_GRANDE = {
    id: 'b1000001-0000-4000-8000-000000000009',
    nome: '045 - PS CAMPO GRANDE'
};

const _esp = 'Clínico geral';

function _medico(id, nome, crm, telefone, unidade) {
    return {
        id,
        nome,
        crm,
        telefone,
        especialidade: _esp,
        unidadeFixaId: unidade.id,
        unidadeFixaNome: unidade.nome,
        unidadesAutorizadas: [{ id: unidade.id, nome: unidade.nome, tipo: 'BASE' }]
    };
}

export const FALLBACK_MEDICO_PROFILES = [
    _medico(
        'c1000001-0000-4000-8000-000000000001',
        'Maria Helena Duarte',
        '52891-ES',
        '(27) 98888-1001',
        U_VITORIA
    ),
    _medico(
        'c1000001-0000-4000-8000-000000000002',
        'Paulo Sérgio Nunes',
        '53902-ES',
        '(27) 97777-1002',
        U_VILA_VELHA
    ),
    _medico(
        'c1000001-0000-4000-8000-000000000003',
        'Amanda Cristina Ferreira',
        '108234-RJ',
        '(21) 96666-2003',
        U_BARRA
    ),
    _medico(
        'c1000001-0000-4000-8000-000000000004',
        'Rodrigo Antunes Vieira',
        '109345-RJ',
        '(21) 95555-2004',
        U_BOTAFOGO
    ),
    _medico(
        'c1000001-0000-4000-8000-000000000005',
        'Letícia Martins Correia',
        '45678-DF',
        '(61) 94444-3005',
        U_SIG
    ),
    _medico(
        'c1000001-0000-4000-8000-000000000006',
        'Tiago Albuquerque Reis',
        '46789-DF',
        '(61) 93333-3006',
        U_TAGUATINGA
    ),
    _medico(
        'c1000001-0000-4000-8000-000000000007',
        'Beatriz Campos Lacerda',
        '87654-MG',
        '(31) 92222-4007',
        U_GUTIERREZ
    ),
    _medico(
        'c1000001-0000-4000-8000-000000000008',
        'Felipe Augusto Cunha',
        '88765-MG',
        '(31) 91111-4008',
        U_PAMPULHA
    ),
    _medico(
        'c1000001-0000-4000-8000-000000000009',
        'Larissa Prado Monteiro',
        '112233-RJ',
        '(21) 90000-5009',
        U_CAMPO_GRANDE
    ),
    _medico(
        'c1000001-0000-4000-8000-000000000010',
        'Gustavo Henrique Dias',
        '223344-RJ',
        '(21) 98888-6010',
        U_BARRA
    ),
    _medico(
        'c1000001-0000-4000-8000-000000000011',
        'Carla Mendes Souza',
        '52901-ES',
        '(27) 98888-1011',
        U_VITORIA
    ),
    _medico(
        'c1000001-0000-4000-8000-000000000012',
        'Ricardo Fonseca Lima',
        '53911-ES',
        '(27) 97777-1012',
        U_VILA_VELHA
    ),
    _medico(
        'c1000001-0000-4000-8000-000000000013',
        'Fernanda Rocha Dias',
        '45688-DF',
        '(61) 94444-1013',
        U_SIG
    ),
    _medico(
        'c1000001-0000-4000-8000-000000000014',
        'Diego Cardoso Meyer',
        '108400-RJ',
        '(21) 96666-1014',
        U_BARRA
    ),
    _medico(
        'c1000001-0000-4000-8000-000000000015',
        'Juliana Torres Rezende',
        '109400-RJ',
        '(21) 95555-1015',
        U_BOTAFOGO
    ),
    _medico(
        'c1000001-0000-4000-8000-000000000016',
        'Renata Silveira Costa',
        '87660-MG',
        '(31) 92222-1016',
        U_GUTIERREZ
    ),
    _medico(
        'c1000001-0000-4000-8000-000000000017',
        'Marcelo Pires Barbosa',
        '88770-MG',
        '(31) 91111-1017',
        U_PAMPULHA
    ),
    _medico(
        'c1000001-0000-4000-8000-000000000018',
        'Camila Freitas Nogueira',
        '46799-DF',
        '(61) 93333-1018',
        U_TAGUATINGA
    ),
    _medico(
        'c1000001-0000-4000-8000-000000000019',
        'Patrícia Azevedo Linhares',
        '112244-RJ',
        '(21) 90000-1019',
        U_CAMPO_GRANDE
    )
];

export const GESTOR_PROFILES = [
    {
        id: 'c0000001-0000-4000-8000-000000000001',
        nome: 'Gestor demonstração',
        usuario: 'gestor.demo',
        perfil: 'GESTOR'
    }
];

/** @deprecated use FALLBACK_MEDICO_PROFILES */
export const DEV_MEDICO_PROFILES = FALLBACK_MEDICO_PROFILES;
/** @deprecated use GESTOR_PROFILES */
export const DEV_GESTOR_PROFILES = GESTOR_PROFILES;
