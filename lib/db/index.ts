import 'server-only';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema';

/**
 * The store's database (Postgres; Neon on Vercel). When DATABASE_URL isn't set the site runs as before,
 * reading the catalogue from Shopify and checking out there: see `ownStore`.
 */
export const ownStore = !!process.env.DATABASE_URL;

const globalForDb = globalThis as unknown as { enrjiSql?: ReturnType<typeof postgres> };

function connect() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
  // prepare: false keeps it compatible with pooled connections (Neon's pooler, PgBouncer).
  globalForDb.enrjiSql ??= postgres(process.env.DATABASE_URL, { max: 5, prepare: false, idle_timeout: 20 });
  return globalForDb.enrjiSql;
}

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;
export function db() {
  _db ??= drizzle(connect(), { schema });
  return _db;
}
export type DB = ReturnType<typeof db>;
export type Tx = Parameters<Parameters<DB['transaction']>[0]>[0];
export { schema };
