/**
 * Perfis de gestor para seleção na entrada (sem autenticação).
 * Médicos: preferencialmente carregados de GET /api/medicos; estes são só fallback.
 */
/** IDs alinhados a model/modulo_medico.sql (quando GET /api/medicos falha). */
export const FALLBACK_MEDICO_PROFILES = [
    {
        id: 'c1000001-0000-4000-8000-000000000001',
        nome: 'Ana Paula Ferreira',
        crm: '10001-ES',
        telefone: '(27) 98888-1001',
        especialidade: 'Clínica Médica',
        unidadeFixaId: 'b1000001-0000-4000-8000-000000000001',
        unidadeFixaNome: 'ES',
        unidadesAutorizadas: [
            { id: 'b1000001-0000-4000-8000-000000000001', nome: 'ES', tipo: 'BASE' }
        ]
    },
    {
        id: 'c1000001-0000-4000-8000-000000000002',
        nome: 'Bruno Almeida Costa',
        crm: '10002-ES',
        telefone: '(27) 97777-1002',
        especialidade: 'Pediatria',
        unidadeFixaId: 'b1000001-0000-4000-8000-000000000001',
        unidadeFixaNome: 'ES',
        unidadesAutorizadas: [
            { id: 'b1000001-0000-4000-8000-000000000001', nome: 'ES', tipo: 'BASE' }
        ]
    }
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
