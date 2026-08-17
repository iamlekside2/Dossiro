import {
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Pool, types, type PoolClient, type QueryResultRow } from 'pg';
import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Read `timestamp without time zone` as UTC.
 *
 * Every timestamp column in this schema is `timestamp(3)`, and every value in
 * them was written as UTC. node-postgres, left alone, parses that type as LOCAL
 * time — so on a machine at UTC+1 every date read back is an hour early. Prisma
 * parsed the same columns as UTC, so without this the driver swap silently
 * shifts every stored instant by the server's offset.
 *
 * It is not a cosmetic problem. Share-link expiry, invitation expiry and
 * account lockout are all compared in JavaScript against `new Date()`, and the
 * audit hash chain includes `createdAt.toISOString()` — an hour's drift makes
 * every historic hash unreproducible and reports the trail as tampered with.
 *
 * Set once at module load, because the parser registry is global to `pg`.
 */
types.setTypeParser(types.builtins.TIMESTAMP, (value: string) =>
  // Space separator to 'T', and an explicit Z so it is read as UTC rather than
  // as whatever this machine's offset happens to be.
  new Date(`${value.replace(' ', 'T')}Z`),
);

/**
 * Send Dates as UTC.
 *
 * The other half of the same problem. Left alone, node-postgres serialises a
 * Date to local wall-clock, so a 13:38Z instant is written as "14:38" here and
 * read back — by the parser above — as 14:38Z. An hour appears out of nowhere
 * on every round trip.
 *
 * `toISOString()` carries an explicit Z, and Postgres discards the designator
 * when storing into `timestamp without time zone`, leaving the UTC wall-clock.
 * Read and write then agree, on any machine in any timezone.
 */
function toUtc(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  // Arrays are passed through element-wise: a text[] of ids must stay an array
  // for the driver to encode it, but a Date inside one needs the same fix.
  if (Array.isArray(value)) return value.map(toUtc);
  return value;
}

/**
 * The only thing in the codebase that talks to Postgres.
 *
 * Every query is parameterised — `$1`, `$2` — and values are passed separately
 * from the statement, so user input can never be read as SQL. The one place
 * that composes identifiers rather than values is `ident()`, which is why it
 * refuses anything that is not a plain column name.
 *
 * `transaction()` uses AsyncLocalStorage to carry the active client down the
 * call stack. That means a service method already inside a transaction can call
 * another service method and both land on the same connection, without either
 * having to pass a client argument through every signature. Nesting is safe:
 * an inner `transaction()` joins the outer one rather than opening a second.
 */

/** A row shaped however the caller says. Named for readability at call sites. */
export type Row = QueryResultRow;

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private readonly pool: Pool;

  /** The connection belonging to the transaction this call is running inside. */
  private readonly txn = new AsyncLocalStorage<PoolClient>();

  constructor() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      // The third part of the timestamp story. The two fixes above cover values
      // the application sends and receives; this one covers values the DATABASE
      // produces. `now()` follows the session timezone, so without it every
      // `"createdAt" = now()` writes the server's local wall-clock into a
      // `timestamp without time zone` column — which the parser above then
      // reads back as UTC. Pinning the session to UTC makes all three agree,
      // and makes behaviour identical on a Lagos laptop and a UTC container.
      options: '-c timezone=UTC',
      max: Number(process.env.DATABASE_POOL_MAX ?? 10),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      // Managed Postgres almost always terminates TLS with its own CA. Verify
      // when we are told to; otherwise accept, because refusing here would
      // break every hosted deployment rather than make any of them safer.
      ssl:
        process.env.DATABASE_SSL === 'true'
          ? { rejectUnauthorized: process.env.DATABASE_SSL_STRICT !== 'false' }
          : undefined,
    });

    // An idle client dying (a database restart, a dropped network) emits here.
    // Without a listener Node treats it as an unhandled error and exits.
    this.pool.on('error', (err) => {
      this.logger.error(`Idle database client failed: ${err.message}`);
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.pool.query('SELECT 1');
      this.logger.log('Database connected');
    } catch (err) {
      this.logger.error(
        `Database connection failed. Check DATABASE_URL and that PostgreSQL is running. ${(err as Error).message}`,
      );
      throw err;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }

  /* -- Running statements -------------------------------------------------- */

  /** Every row the statement returned. */
  async query<T extends Row = Row>(text: string, values: unknown[] = []): Promise<T[]> {
    const client = this.txn.getStore();
    const params = values.map(toUtc);
    const result = client
      ? await client.query<T>(text, params)
      : await this.pool.query<T>(text, params);
    return result.rows;
  }

  /** The first row, or null. Use when zero rows is a legitimate answer. */
  async maybeOne<T extends Row = Row>(text: string, values: unknown[] = []): Promise<T | null> {
    const rows = await this.query<T>(text, values);
    return rows[0] ?? null;
  }

  /**
   * Exactly one row, or a failure.
   *
   * For statements whose own WHERE clause guarantees a row — an INSERT
   * RETURNING, an UPDATE of a record just read. A caller that gets null back
   * from `maybeOne` and blindly dereferences it produces a confusing
   * TypeError far from the cause; this fails at the query instead.
   */
  async one<T extends Row = Row>(text: string, values: unknown[] = []): Promise<T> {
    const rows = await this.query<T>(text, values);
    if (rows.length !== 1) {
      throw new InternalServerErrorException(
        `Expected exactly one row, got ${rows.length}: ${text.trim().split('\n')[0]}`,
      );
    }
    return rows[0];
  }

  /** Number of rows affected. For UPDATE/DELETE where the count is the answer. */
  async execute(text: string, values: unknown[] = []): Promise<number> {
    const client = this.txn.getStore();
    const params = values.map(toUtc);
    const result = client
      ? await client.query(text, params)
      : await this.pool.query(text, params);
    return result.rowCount ?? 0;
  }

  /** A single scalar — `count(*)`, `exists(...)`, one column of one row. */
  async scalar<T>(text: string, values: unknown[] = []): Promise<T | null> {
    const row = await this.maybeOne(text, values);
    if (!row) return null;
    const first = Object.values(row)[0];
    return (first ?? null) as T | null;
  }

  /** `count(*)` comes back from pg as a string, because bigint does not fit a float. */
  async count(text: string, values: unknown[] = []): Promise<number> {
    return Number((await this.scalar<string>(text, values)) ?? 0);
  }

  /* -- Transactions -------------------------------------------------------- */

  /**
   * Runs `work` inside a transaction, committing if it returns and rolling back
   * if it throws.
   *
   * Already inside one? Then this joins it rather than opening a second
   * connection — which would deadlock against rows the outer transaction holds.
   */
  async transaction<T>(work: () => Promise<T>): Promise<T> {
    const existing = this.txn.getStore();
    if (existing) return work();

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await this.txn.run(client, work);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackErr) {
        // The original error is the one worth propagating; a failed rollback
        // usually means the connection is already gone.
        this.logger.error(`Rollback failed: ${(rollbackErr as Error).message}`);
      }
      throw err;
    } finally {
      client.release();
    }
  }
}
