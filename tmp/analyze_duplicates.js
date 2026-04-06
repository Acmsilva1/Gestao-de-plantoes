import { dbModel } from '../model/dbModel.js';

async function analyzeDuplicateManagers() {
    try {
        const managers = await dbModel.listManagerProfiles();
        const units = await dbModel.getUnits();
        
        const unitMap = {};
        units.forEach(u => unitMap[u.id] = u.nome);

        const summary = {};
        managers.forEach(m => {
            const uId = m.unidade_id || 'MASTER';
            const uName = m.unidades?.nome || unitMap[uId] || 'MASTER';
            
            if (!summary[uId]) {
                summary[uId] = { nome: uName, gestores: [] };
            }
            summary[uId].gestores.push({
                id: m.id,
                nome: m.nome,
                usuario: m.usuario
            });
        });

        console.log('=== Relatório de Gestores por Unidade ===');
        for (const [uId, data] of Object.entries(summary)) {
            console.log(`\nUnidade: ${data.nome} (${uId})`);
            console.log(`Quantidade de gestores: ${data.gestores.length}`);
            data.gestores.forEach(g => {
                console.log(`  - ${g.nome} (${g.usuario}) ID: ${g.id}`);
            });
        }

        const toDelete = [];
        for (const [uId, data] of Object.entries(summary)) {
            if (uId !== 'MASTER' && data.gestores.length > 1) {
                // Keep the first one, delete others
                for (let i = 1; i < data.gestores.length; i++) {
                    toDelete.push(data.gestores[i].id);
                }
            }
        }

        console.log('\n=== Sugestão de Limpeza ===');
        console.log(`Total de gestores excedentes para remover: ${toDelete.length}`);
        if (toDelete.length > 0) {
            console.log('IDs para remover:', toDelete.join(', '));
        }

    } catch (error) {
        console.error('Erro:', error);
    }
}

analyzeDuplicateManagers();
