// Applies database migrations (drizzle/*.sql). Runs before every build when DATABASE_URL is set.
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

if (!process.env.DATABASE_URL) {
  console.log('[db] DATABASE_URL not set: skipping migrations (site runs on Shopify)');
  process.exit(0);
}
const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false, onnotice: () => {} });
await migrate(drizzle(sql), { migrationsFolder: 'drizzle' });
console.log('[db] migrations applied');
// First deploy with a fresh database: bring the catalogue over from Shopify automatically.
const [{ n }] = await sql`select count(*)::int as n from products`;
await sql.end();
if (n === 0) {
  console.log('[db] no products yet: importing the catalogue from Shopify');
  const { spawnSync } = await import('node:child_process');
  const r = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', 'scripts/db-import-shopify.mjs'], { stdio: 'inherit', env: process.env });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
