/**
 * A API lê `api/data/local/*.parquet` (ou `.csv` legado) em memória.
 * Alterações com `GDP_DEMO_READ_ONLY=false` gravam de volta em `.parquet`.
 */
import process from 'process';

console.log(
    '[dblocal:import] Não há import para SQLite. Use Parquet em api/data/local; mutações persistem ao reiniciar a API (modo escrita) ou `npm run dblocal:export`.'
);
process.exit(0);
