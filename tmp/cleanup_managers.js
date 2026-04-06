import { dbModel } from '../model/dbModel.js';

async function cleanupManagers() {
    try {
        console.log('--- Iniciando limpeza de gestores duplicados ---');
        const managers = await dbModel.listManagerProfiles();
        const units = await dbModel.getUnits();
        
        const unitMap = {};
        units.forEach(u => unitMap[u.id] = u.nome);

        const summary = {};
        managers.forEach(m => {
            const uId = m.unidade_id || 'MASTER';
            if (!summary[uId]) {
                summary[uId] = [];
            }
            summary[uId].push(m);
        });

        let deletedCount = 0;
        for (const [uId, unitManagers] of Object.entries(summary)) {
            if (uId === 'MASTER') continue; // Não deletar master por enquanto, focar em unidades

            if (unitManagers.length > 1) {
                console.log(`\nUnidade: ${unitManagers[0].unidades?.nome || unitMap[uId]} (${uId})`);
                console.log(`Encontrados ${unitManagers.length} gestores. Mantendo o primeiro e removendo os outros.`);
                
                // Mantém o primeiro, deleta os demais
                for (let i = 1; i < unitManagers.length; i++) {
                    const managerToDelete = unitManagers[i];
                    console.log(`  - Removendo gestor: ${managerToDelete.nome} (${managerToDelete.usuario}) ID: ${managerToDelete.id}`);
                    await dbModel.deleteManager(managerToDelete.id);
                    deletedCount++;
                }
            }
        }

        // Caso especial: Checar duplicatas de Master por usuário se houver
        const masterManagers = summary['MASTER'] || [];
        if (masterManagers.length > 1) {
             console.log(`\nLimpando gestor.master duplicado...`);
             for (let i = 1; i < masterManagers.length; i++) {
                 console.log(`  - Removendo master extra: ${masterManagers[i].nome} (${masterManagers[i].usuario}) ID: ${masterManagers[i].id}`);
                 await dbModel.deleteManager(masterManagers[i].id);
                 deletedCount++;
             }
        }

        console.log(`\n--- Limpeza concluída! Total de gestores removidos: ${deletedCount} ---`);

    } catch (error) {
        console.error('Erro durante a limpeza:', error);
    }
}

cleanupManagers();
