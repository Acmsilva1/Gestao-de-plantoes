import { dbModel } from '../model/dbModel.js';

async function analyzeManagers() {
    try {
        const managers = await dbModel.listManagerProfiles();
        console.log('Total de gestores encontrados:', managers.length);
        
        const unitsWithManagers = {};
        const duplicates = [];

        managers.forEach(m => {
            const uId = m.unidade_id || 'MASTER';
            if (!unitsWithManagers[uId]) {
                unitsWithManagers[uId] = [];
            }
            unitsWithManagers[uId].push(m);
        });

        for (const [uId, devs] of Object.entries(unitsWithManagers)) {
            if (devs.length > 1 && uId !== 'MASTER') {
                duplicates.push({
                    unidadeId: uId,
                    unidadeNome: devs[0].unidades?.nome || 'Unidade Desconhecida',
                    gestores: devs.map(g => ({ id: g.id, nome: g.nome, usuario: g.usuario }))
                });
            }
        }

        if (duplicates.length > 0) {
            console.log('\nDUPLICATAS ENCONTRADAS (Mais de 1 gestor por unidade):');
            console.log(JSON.stringify(duplicates, null, 2));
        } else {
            console.log('\nNenhuma duplicata encontrada (1 gestor por unidade respeitado).');
        }

        console.log('\nLista de todos os gestores:');
        managers.forEach(m => {
            console.log(`- ${m.nome} (${m.usuario}) [Unidade: ${m.unidades?.nome || 'MASTER'}] ID: ${m.id}`);
        });

    } catch (error) {
        console.error('Erro ao analisar gestores:', error);
    }
}

analyzeManagers();
