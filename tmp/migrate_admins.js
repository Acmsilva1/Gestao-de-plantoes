import { dbModel } from '../model/dbModel.js';

async function runMigration() {
    console.log('--- Iniciando Migração da Tabela de Admins ---');
    try {
        // Como o cliente Supabase JS não executa SQL bruto diretamente sem RPC,
        // vou tentar criar os registros usando o método 'from' caso a tabela já exista, 
        // ou fornecer uma mensagem de erro clara se a tabela estiver ausente.
        
        const { createClient } = await import('@supabase/supabase-js');
        const { env } = await import('../config/env.js');
        const supabase = createClient(env.supabaseUrl, env.supabaseKey);

        // 1. Inserir Perfil
        const { data: perfilData } = await supabase
            .from('perfis')
            .upsert({ nome: 'ADMINISTRATIVO' }, { onConflict: 'nome' })
            .select('id')
            .single();

        const perfilId = perfilData?.id;
        console.log('Perfil Administrativo ID:', perfilId);

        // 2. Inserir Usuários (Assumindo que a tabela admins foi criada pelo usuário ou via comando anterior)
        // Se a tabela não existir, este passo falhará e avisaremos o usuário.
        const admins = [
            {
                id: 'a0000000-0000-4000-8000-000000000000',
                nome: 'Administrador de demonstração',
                usuario: 'admin.demo',
                senha: '12345',
                perfil_id: perfilId
            },
            {
                id: 'a0000001-0000-4000-8000-000000000001',
                nome: 'Faturamento Hospitalar 01',
                usuario: 'admin.faturamento',
                senha: '12345',
                perfil_id: perfilId
            },
            {
                id: 'a0000002-0000-4000-8000-000000000002',
                nome: 'Auditoria e Controle',
                usuario: 'admin.auditoria',
                senha: '12345',
                perfil_id: perfilId
            }
        ];

        const { error: insertError } = await supabase.from('admins').upsert(admins, { onConflict: 'usuario' });

        if (insertError) {
            if (insertError.code === '42P01') {
                console.error('ERRO: A tabela "admins" ainda não existe no banco de dados.');
                console.error('Por favor, execute o comando SQL fornecido anteriormente no console do Supabase.');
            } else {
                console.error('Erro ao inserir admins:', insertError);
            }
        } else {
            console.log('Migração concluída com sucesso! Usuários admins inseridos.');
        }

    } catch (err) {
        console.error('Falha na migração:', err.message);
    }
}

runMigration();
