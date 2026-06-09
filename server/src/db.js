import pg from 'pg';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Use DATABASE_URL if provided, otherwise fall back to the standard PG*
// environment variables (PGHOST, PGPORT, PGUSER, PGDATABASE, ...).
export const pool = process.env.DATABASE_URL
  ? new pg.Pool({ connectionString: process.env.DATABASE_URL })
  : new pg.Pool();

export function query(text, params) {
  return pool.query(text, params);
}

// Apply every .sql file in migrations/ in name order. Migrations are written to
// be idempotent (create table if not exists ...), so this is safe to re-run.
export async function migrate() {
  const dir = join(__dirname, '..', 'migrations');
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const sql = readFileSync(join(dir, file), 'utf8');
    await pool.query(sql);
  }
  return files;
}
