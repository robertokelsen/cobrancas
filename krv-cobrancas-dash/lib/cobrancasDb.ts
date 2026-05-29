// lib/cobrancasDb.ts — pool de conexão com o Postgres de cobranças (EasyPanel).
import { Pool } from 'pg';

declare global {
    // eslint-disable-next-line no-var
  var _cobrancasPool: Pool | undefined;
}

function makePool() {
    const connectionString = process.env.COBRANCAS_DATABASE_URL;
    if (!connectionString) throw new Error('COBRANCAS_DATABASE_URL não definida');
    return new Pool({
          connectionString,
          max: 5,
          idleTimeoutMillis: 30000,
          // Se o Postgres exigir SSL (acesso externo), descomente:
          // ssl: { rejectUnauthorized: false },
    });
}

function getPool(): Pool {
    return global._cobrancasPool ?? (global._cobrancasPool = makePool());
}

// Proxy lazy: o pool só é criado no primeiro uso real (runtime),
// nunca durante o "next build" (evita erro de env ausente no build).
export const cobrancasPool: Pool = new Proxy({} as Pool, {
    get(_target, prop, receiver) {
          const pool = getPool();
          const value = Reflect.get(pool as object, prop, receiver);
          return typeof value === 'function' ? value.bind(pool) : value;
    },
});
