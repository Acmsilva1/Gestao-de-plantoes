/**
 * Projeto sem SQLite em runtime. Use `npm run dblocal:export` após alterações em dados.
 */
import process from 'process';

console.error(
    '[sql:run] SQLite em ficheiro foi removido. Dados locais: CSV em ./dblocal + orquestrador em memória.'
);
process.exit(1);
