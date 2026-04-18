/**
 * O backend já lê apenas `dblocal/*.csv` em memória (sem SQLite).
 * Para aplicar alterações: edite os CSVs em ./dblocal e reinicie a API (`npm run dev`).
 */
import process from 'process';

console.log(
    '[dblocal:import] Modo CSV em memória: não há import para ficheiro .sqlite. Edite dblocal/*.csv e reinicie o servidor.'
);
process.exit(0);
