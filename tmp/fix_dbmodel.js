import fs from 'fs';
import path from 'path';

const filePath = 'model/dbModel.js';
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

// The corruption is around line 1426.
// Let's find the markers to replace.

const startMarker = '        if (!masterExists) {';
const endMarker = '    async getDoctorsAccessList() {';

const startIndex = lines.findIndex(l => l.includes(startMarker));
const endIndex = lines.findIndex(l => l.includes(endMarker));

if (startIndex !== -1 && endIndex !== -1) {
    const newSection = [
        '        if (!masterExists) {',
        '            const insertMasterManagerResp = await supabase.from(\'gestores\').insert({',
        '                nome: \'Gestor Master\',',
        '                usuario: \'gestor.master\',',
        '                senha: \'12345\',',
        '                perfil_id: perfilMaster.id,',
        '                unidade_id: null',
        '            });',
        '            if (insertMasterManagerResp.error) {',
        '                throw new Error(`Falha ao criar gestor master: ${insertMasterManagerResp.error.message}`);',
        '            }',
        '        }',
        '',
        '        return this.listManagerProfiles();',
        '    },',
        '    async updateManagerProfile(managerId, data) {',
        '        const response = await supabase',
        '            .from(\'gestores\')',
        '            .update({',
        '                nome: data.nome,',
        '                usuario: data.usuario,',
        '                senha: data.senha',
        '            })',
        '            .eq(\'id\', managerId)',
        '            .select(\'id, nome, usuario, senha, unidade_id, unidades(nome), perfis(nome)\')',
        '            .single();',
        '',
        '        return unwrap(response, \'Falha ao atualizar perfil do gestor.\');',
        '    },',
        '    async deleteManager(managerId) {',
        '        const response = await supabase',
        '            .from(\'gestores\')',
        '            .delete()',
        '            .eq(\'id\', managerId);',
        '            ',
        '        return unwrap(response, \'Falha ao excluir gestor do sistema.\');',
        '    },',
        '    async getDashboardsDataStraddle(startMonthDate, endMonthDate, unidadeId = null) {',
        '        // Busca turnos/vagas para agregar via js',
        '        let query = supabase',
        '            .from(\'disponibilidade\')',
        '            .select(\'data_plantao, turno, vagas_totais, vagas_ocupadas\')',
        '            .gte(\'data_plantao\', startMonthDate)',
        '            .lte(\'data_plantao\', endMonthDate);',
        '',
        '        if (unidadeId) {',
        '            query = query.eq(\'unidade_id\', unidadeId);',
        '        }',
        '',
        '        const response = await query;',
        '',
        '        return unwrap(response, \'Falha ao carregar dados do dashboard de disponibilidade.\');',
        '    },',
        '    async getDashboardsDemand(startMonthDate, endMonthDate, unidadeId = null) {',
        '        // Simulando a demanda / atendimentos usando tasy_raw_history',
        '        let query = supabase',
        '            .from(\'tasy_raw_history\')',
        '            .select(\'data_atendimento, atendimento_count, periodo\')',
        '            .gte(\'data_atendimento\', startMonthDate)',
        '            .lte(\'data_atendimento\', endMonthDate);',
        '',
        '        if (unidadeId) {',
        '            query = query.eq(\'unidade_id\', unidadeId);',
        '        }',
        '',
        '        const response = await query;',
        '',
        '        return unwrap(response, \'Falha ao carregar dados do dashboard de demanda.\');',
        '    },'
    ];

    lines.splice(startIndex, endIndex - startIndex, ...newSection);
    fs.writeFileSync(filePath, lines.join('\n'));
    console.log('File repaired successfully!');
} else {
    console.error('Could not find markers:', { startIndex, endIndex });
}
