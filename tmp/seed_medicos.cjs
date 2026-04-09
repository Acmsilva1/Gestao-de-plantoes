const sqlite3 = require('sqlite3').verbose();
const { randomUUID } = require('crypto');
const db = new sqlite3.Database('./DB local/database.sqlite');

// Mapa unidade_id => nomes dos médicos (2 por unidade)
const MEDICOS_POR_UNIDADE = [
  { unidade_id: 'e1969ee6-5072-452c-be7a-b4b67c584d56', unidade_nome: 'UTI Vitória - ES',         esp: 'Clínico',        nomes: ['Eduardo Torres', 'Daniele Campos'] },
  { unidade_id: '492596f0-a69f-4b83-b583-30ab0ea3cb8c', unidade_nome: 'PS Vitória - ES',          esp: 'Plantonista PS', nomes: ['Matheus Pinto', 'Fernanda Costa'] },
  { unidade_id: 'decbd054-c077-4e5a-90ca-fc0ec8ccf809', unidade_nome: 'ENFERMARIA Vitória - ES',  esp: 'Clínico',        nomes: ['Rafael Nogueira', 'Beatriz Monteiro'] },
  { unidade_id: 'b6916e29-2cdc-433c-9f8b-c9e0fb4b27a1', unidade_nome: 'PS Vila Velha - ES',      esp: 'Plantonista PS', nomes: ['Leonardo Rocha', 'Patricia Lima'] },
  { unidade_id: 'e76bf95b-5aad-4709-bb29-2c611a1cc0c5', unidade_nome: 'PS Campo grande - RJ',    esp: 'Plantonista PS', nomes: ['Felipe Martins', 'Juliana Azevedo'] },
  { unidade_id: 'c3e990cc-25fd-475b-a5c9-2e69a79fb506', unidade_nome: 'PS Botafogo - RS',        esp: 'Plantonista PS', nomes: ['Gustavo Almeida', 'Larissa Neves'] },
  { unidade_id: 'd59c5067-c1d2-4658-acb2-7fb7ebf70fb0', unidade_nome: 'PS Barra da Tijuca - RJ', esp: 'Plantonista PS', nomes: ['Thiago Carvalho', 'Camila Barros'] },
  { unidade_id: 'd270354e-a819-4d5d-b79c-1f969c2bcdaa', unidade_nome: 'PS Vitural - Web',        esp: 'Plantonista PS', nomes: ['Caio Moreira', 'Priscila Freitas'] },
  { unidade_id: 'ba3bb4c6-9705-45f4-adda-eb6c9469c043', unidade_nome: 'Anestesista MG',          esp: 'Clínico',        nomes: ['Lucas Andrade', 'Marina Teixeira'] },
  { unidade_id: '87aec33f-b6d1-4263-b8e3-e53bbbf6b3a2', unidade_nome: 'PS Taguatinga - DF',     esp: 'Plantonista PS', nomes: ['Vinicius Correia', 'Natalia Souza'] },
  { unidade_id: '15d87fb5-b135-4c65-bad1-4751514f1e0f', unidade_nome: 'PS Sig - DF',            esp: 'Plantonista PS', nomes: ['Renato Farias', 'Aline Duarte'] },
  { unidade_id: 'ace03104-da8d-49f9-a5f7-1ab2ac75dea7', unidade_nome: 'PS Pampulha - MG',       esp: 'Plantonista PS', nomes: ['Bruno Ribeiro', 'Paula Menezes'] },
];

function run(sql, params = []) {
  return new Promise((res, rej) => db.run(sql, params, function(err) { err ? rej(err) : res(this); }));
}

async function seed() {
  // 1. Limpar tabelas dependentes de medicos
  console.log('Limpando dados antigos...');
  await run('DELETE FROM escala');
  await run('DELETE FROM agendamentos');
  await run('DELETE FROM pedidos_troca_escala');
  await run('DELETE FROM pedidos_assumir_escala');
  await run('DELETE FROM medico_acessos_unidade');
  await run('DELETE FROM medicos');
  console.log('Tabelas limpas.');

  // 2. Inserir médicos com novos UUIDs
  let crmCounter = 1;
  const newMedicos = [];

  for (const grupo of MEDICOS_POR_UNIDADE) {
    for (let i = 0; i < grupo.nomes.length; i++) {
      const nome = grupo.nomes[i];
      const id = randomUUID();
      const crm = 'CRM' + String(900000 + crmCounter).padStart(6, '0');
      const usuario = `medico.${grupo.unidade_id.split('-')[0]}.${i + 1}`;
      const nomeCompleto = `${nome} [${grupo.unidade_nome}]`;
      crmCounter++;

      await run(
        `INSERT INTO medicos (id, nome, especialidade, crm, senha, unidade_fixa_id, atendimento_padrao_por_periodo, usuario, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        [id, nomeCompleto, grupo.esp, crm, '12345', grupo.unidade_id, 10, usuario]
      );

      // Acesso padrão à unidade fixa
      await run(
        `INSERT INTO medico_acessos_unidade (id, medico_id, unidade_id, created_at) VALUES (?, ?, ?, datetime('now'))`,
        [randomUUID(), id, grupo.unidade_id]
      );

      newMedicos.push({ id, nome: nomeCompleto, crm, usuario });
      console.log('Criado:', nomeCompleto, '|', crm, '| ID:', id.split('-')[0]);
    }
  }

  console.log('\nTotal de médicos criados:', newMedicos.length);
  console.log('\nFaça login com qualquer médico da lista acima.');
  db.close();
}

seed().catch(err => { console.error('ERRO:', err); db.close(); });
