// lib/cobrancasDb.ts — pool LAZY do Postgres de cobranças.
// O pool só é criado na PRIMEIRA query (runtime), nunca durante o build.
// Isso evita o erro "COBRANCAS_DATABASE_URL não definida" na fase de
// "Collecting page data" do next build.
import { Pool, QueryResult, QueryResultRow } from 'pg';

declare global {
  // eslint-disable-next-line no-var
  var _cobrancasPool: Pool | undefined;
}

function getPool(): Pool {
  if (!global._cobrancasPool) {
    const connectionString = process.env.COBRANCAS_DATABASE_URL;
    if (!connectionString) {
      // Lançado só em runtime, quando uma query é realmente executada.
      throw new Error('COBRANCAS_DATABASE_URL não definida');
    }
    global._cobrancasPool = new Pool({
      connectionString,
      max: 5,
      idleTimeoutMillis: 30000,
      // ssl: { rejectUnauthorized: false }, // descomente se exigir SSL externo
    });
  }
  return global._cobrancasPool;
}

// Helpers que adiam a criação do pool até o uso real.
export async function cobrancasQuery<T extends QueryResultRow = any>(
  text: string, params?: any[],
): Promise<QueryResult<T>> {
  return getPool().query<T>(text, params);
}

export async function cobrancasConnect() {
  return getPool().connect();
}

// Compat: alguns arquivos importam `cobrancasPool` direto.
// Proxy que resolve o pool só quando um método é acessado (runtime).
export const cobrancasPool: Pool = new Proxy({} as Pool, {
  get(_t, prop) {
    const real = getPool() as any;
    const v = real[prop];
    return typeof v === 'function' ? v.bind(real) : v;
  },
});
