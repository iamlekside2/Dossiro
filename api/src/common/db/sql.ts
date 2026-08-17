/**
 * Small helpers for the mechanical parts of writing SQL by hand.
 *
 * Deliberately not a query builder. SELECTs are written out in full at their
 * call sites, because reading them is the point of not having an ORM. What is
 * generated here is only the tedium that causes typos: the parallel column and
 * placeholder lists of an INSERT, and the `SET` clause of an UPDATE.
 */

/** Postgres reserves the right to fold unquoted identifiers to lower case, and
 *  this schema is camelCase, so every identifier is quoted. A name is only ever
 *  a column we wrote, never user input — the guard is here so that stays true. */
export function ident(name: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(`Refusing to use "${name}" as a SQL identifier`);
  }
  return `"${name}"`;
}

/** A statement fragment and the values its placeholders refer to. */
export interface Fragment {
  text: string;
  values: unknown[];
}

/**
 * Column list, placeholder list and values for an INSERT.
 *
 *   const c = columns({ name, organizationId });
 *   db.one(`INSERT INTO documents (${c.names}) VALUES (${c.placeholders}) RETURNING *`, c.values)
 *
 * `undefined` entries are dropped so the column keeps its database default;
 * `null` is kept, because writing NULL is a different intention from saying
 * nothing.
 */
export function columns(data: Record<string, unknown>): {
  names: string;
  placeholders: string;
  values: unknown[];
} {
  const entries = Object.entries(data).filter(([, v]) => v !== undefined);

  return {
    names: entries.map(([k]) => ident(k)).join(', '),
    placeholders: entries.map((_, i) => `$${i + 1}`).join(', '),
    values: entries.map(([, v]) => v),
  };
}

/**
 * `SET` clause for an UPDATE, numbered from `startAt`.
 *
 *   const set = assignments({ name, status }, 2);
 *   db.one(`UPDATE documents SET ${set.text} WHERE id = $1`, [id, ...set.values])
 *
 * Throws on an empty patch rather than emitting `SET  WHERE`, which fails at
 * the database with a message that says nothing about the real mistake.
 */
export function assignments(data: Record<string, unknown>, startAt = 1): Fragment {
  const entries = Object.entries(data).filter(([, v]) => v !== undefined);

  if (entries.length === 0) {
    throw new Error('No columns to update');
  }

  return {
    text: entries.map(([k], i) => `${ident(k)} = $${i + startAt}`).join(', '),
    values: entries.map(([, v]) => v),
  };
}

/**
 * `IN` list for a set of values, numbered from `startAt`.
 *
 * Returns `null` for an empty set. `IN ()` is a syntax error, and the caller
 * has to decide what no candidates means — usually "match nothing", sometimes
 * "skip this condition entirely".
 */
export function inList(values: unknown[], startAt = 1): Fragment | null {
  if (values.length === 0) return null;
  return {
    text: values.map((_, i) => `$${i + startAt}`).join(', '),
    values,
  };
}

/**
 * Joins conditions with AND, dropping the ones that were not applicable.
 *
 * Returns `TRUE` when nothing applies, so the caller can always interpolate it
 * after a bare `WHERE` without a special case.
 */
export function every(conditions: (string | null | undefined | false)[]): string {
  const live = conditions.filter((c): c is string => Boolean(c));
  return live.length ? live.join(' AND ') : 'TRUE';
}

/**
 * Accumulates `$n` placeholders while conditions are being assembled.
 *
 * Hand-numbering placeholders is where a long WHERE clause goes wrong: insert a
 * condition in the middle and every number after it shifts by one, silently
 * pairing the wrong value with the wrong column.
 *
 *   const p = new Params();
 *   const where = every([
 *     `d."organizationId" = ${p.add(organizationId)}`,
 *     folderId ? `d."folderId" = ${p.add(folderId)}` : null,
 *   ]);
 *   db.query(`SELECT * FROM documents d WHERE ${where}`, p.values);
 */
export class Params {
  readonly values: unknown[] = [];

  /** Records a value and returns the placeholder that refers to it. */
  add(value: unknown): string {
    this.values.push(value);
    return `$${this.values.length}`;
  }

  /** Records several values and returns their placeholders, comma-joined. */
  addAll(values: unknown[]): string {
    return values.map((v) => this.add(v)).join(', ');
  }

  get length(): number {
    return this.values.length;
  }
}

/**
 * `LIMIT`/`OFFSET` from page parameters, clamped.
 *
 * An unbounded `take` is how one request reads an entire tenant's repository
 * into memory.
 */
export function paginate(take?: number, skip?: number, maxTake = 200): Fragment {
  const limit = Math.min(Math.max(Number(take) || 50, 1), maxTake);
  const offset = Math.max(Number(skip) || 0, 0);
  return { text: `LIMIT ${limit} OFFSET ${offset}`, values: [] };
}

/**
 * Whitelisted `ORDER BY`.
 *
 * The column has to come from a map the caller controls, because an order
 * column cannot be a bound parameter — it is part of the statement.
 */
export function orderBy(
  requested: string | undefined,
  allowed: Record<string, string>,
  fallback: string,
  direction: 'asc' | 'desc' = 'desc',
): string {
  const column = (requested && allowed[requested]) || allowed[fallback];
  if (!column) throw new Error(`No sortable column for "${fallback}"`);
  return `${column} ${direction === 'asc' ? 'ASC' : 'DESC'}`;
}
