/**
 * Migration runner.
 *
 * Applies every `db/migrations/NNNN_*.sql` that has not run yet, in filename
 * order, each one inside its own transaction. A migration that throws is rolled
 * back whole and the run stops — a half-applied schema is worse than an old one.
 *
 *   npm run db:migrate           apply everything pending
 *   npm run db:migrate -- --dry  list what would run, change nothing
 *   npm run db:migrate -- --mark record them as applied without running them
 *
 * `--mark` exists for one situation: a database that already has the schema,
 * from before this runner existed. Using it on an empty database would record a
 * schema that is not there.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { config } from 'dotenv';
import { Client } from 'pg';

config();

/**
 * Where the .sql files are.
 *
 * Beside this file when running from source. One level up and into db/ when the
 * runner has been bundled into dist/ for deployment, where the migrations ship
 * as data rather than being compiled in — they are applied by the database, and
 * inlining them would mean a build step between writing a migration and being
 * able to read what actually ran.
 */
const DIR = [join(__dirname, 'migrations'), join(__dirname, '..', 'db', 'migrations')].find(
  (d) => existsSync(d),
);
if (!DIR) throw new Error(`No migrations directory found next to ${__dirname}`);

interface Migration {
  name: string;
  sql: string;
  checksum: string;
}

function load(): Migration[] {
  return readdirSync(DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((name) => {
      const sql = readFileSync(join(DIR, name), 'utf8');
      return { name, sql, checksum: createHash('sha256').update(sql).digest('hex').slice(0, 16) };
    });
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry');
  const markOnly = process.argv.includes('--mark');

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       text        PRIMARY KEY,
      checksum   text        NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const { rows: done } = await client.query<{ name: string; checksum: string }>(
    'SELECT name, checksum FROM schema_migrations',
  );
  const applied = new Map(done.map((r) => [r.name, r.checksum]));

  const all = load();
  const pending = all.filter((m) => !applied.has(m.name));

  // An applied migration whose file has since been edited means the database
  // and the repository disagree about what the schema is. Say so rather than
  // carry on: the next person to run this on a fresh database gets a different
  // result from the one running here.
  const changed = all.filter((m) => applied.has(m.name) && applied.get(m.name) !== m.checksum);
  if (changed.length) {
    console.error('These migrations were edited after being applied:');
    for (const m of changed) console.error(`  ${m.name}`);
    console.error('\nWrite a new migration instead of changing an applied one.');
    await client.end();
    process.exit(1);
  }

  if (pending.length === 0) {
    console.log(`Up to date — ${all.length} migration${all.length === 1 ? '' : 's'} applied.`);
    await client.end();
    return;
  }

  if (dryRun) {
    console.log(`${pending.length} pending:`);
    for (const m of pending) console.log(`  ${m.name}`);
    await client.end();
    return;
  }

  for (const m of pending) {
    process.stdout.write(`  ${m.name} … `);
    try {
      await client.query('BEGIN');
      if (!markOnly) await client.query(m.sql);
      await client.query('INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)', [
        m.name,
        m.checksum,
      ]);
      await client.query('COMMIT');
      console.log(markOnly ? 'marked' : 'applied');
    } catch (err) {
      await client.query('ROLLBACK');
      console.log('failed');
      console.error(`\n${(err as Error).message}\n`);
      await client.end();
      process.exit(1);
    }
  }

  console.log(`\n${pending.length} migration${pending.length === 1 ? '' : 's'} ${markOnly ? 'marked' : 'applied'}.`);
  await client.end();
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
