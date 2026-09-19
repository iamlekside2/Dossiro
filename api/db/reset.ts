/**
 * Drops the schema and rebuilds it from the migrations, then reseeds.
 *
 * The audit trail is append-only by design: no role can edit or delete a row,
 * and the database enforces it with a trigger. That is the right behaviour and
 * it means a development database accumulates every sign-in and every document
 * view from every test run, permanently. The only way back to a clean trail is
 * to drop the whole thing, which is what this does.
 *
 *   npm run db:reset
 *
 * It refuses to run against anything that is not plainly a local development
 * database. A script whose entire job is "destroy everything" is one typo in a
 * DATABASE_URL away from doing it to staging, so the guard is not optional and
 * there is deliberately no flag to skip it.
 */
import { execSync } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import { Client } from 'pg';

config();

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

const parsed = new URL(url);
const host = parsed.hostname;
const database = parsed.pathname.replace(/^\//, '');

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1', '[::1]'];
if (!LOCAL_HOSTS.includes(host)) {
  console.error(`Refusing to reset: ${host} is not a local host.`);
  console.error('This script drops every table. Point DATABASE_URL at a local database.');
  process.exit(1);
}

// A local host is not enough on its own — someone can port-forward production
// to localhost. The name has to look like a development database too.
if (!/^dossiro(_dev|_test)?$/.test(database)) {
  console.error(`Refusing to reset: "${database}" is not a recognised development database name.`);
  console.error('Expected dossiro, dossiro_dev or dossiro_test.');
  process.exit(1);
}

const STORAGE_ROOT = resolve(process.cwd(), process.env.STORAGE_LOCAL_DIR ?? './storage');

async function main(): Promise<void> {
  const db = new Client({ connectionString: url });
  await db.connect();

  const before = await db.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM information_schema.tables WHERE table_schema = 'public'`,
  );
  console.log(`Resetting ${database} on ${host} — dropping ${before.rows[0].n} tables.`);

  // CASCADE takes the enum types and the append-only trigger with it; the
  // migrations recreate all of it.
  await db.query('DROP SCHEMA public CASCADE');
  await db.query('CREATE SCHEMA public');
  await db.end();

  // Every stored blob is now unreferenced. Leaving them would orphan the whole
  // store on disk while the database believes it is empty.
  await rm(STORAGE_ROOT, { recursive: true, force: true });
  console.log('Storage cleared.');

  execSync('npm run db:migrate', { stdio: 'inherit' });
  execSync('npm run db:seed', { stdio: 'inherit' });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
