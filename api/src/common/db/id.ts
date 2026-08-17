import { randomBytes } from 'node:crypto';
import { hostname } from 'node:os';

/**
 * Primary keys.
 *
 * Prisma issued these through `@default(cuid())`. The columns are plain `text`
 * with no database default, so with Prisma gone the application has to supply
 * them — and it has to keep producing the same 25-character cuid v1 format,
 * because every id already stored is one and they all have to sort and compare
 * alongside each other.
 *
 *   c  lfp3k2n8  0001  a4f2  9xk3m1zq
 *   |  |         |     |     |
 *   |  |         |     |     random, 8 chars
 *   |  |         |     process fingerprint, 4 chars
 *   |  |         counter, 4 chars — makes ids unique within a millisecond
 *   |  timestamp in base 36, 8 chars
 *   'c'
 *
 * The counter is what `Date.now() + Math.random()` cannot give you: two ids
 * generated in the same millisecond by the same process are guaranteed to
 * differ, rather than differing with high probability.
 */

const BLOCK = 4;
const BASE = 36;
const DISCRETE_VALUES = BASE ** BLOCK; // 1,679,616

/** Wraps rather than growing, so the id stays a fixed width. */
let counter = Math.floor(Math.random() * DISCRETE_VALUES);

function pad(value: string, size: number): string {
  return value.length >= size ? value.slice(-size) : value.padStart(size, '0');
}

function nextCount(): number {
  counter = (counter + 1) % DISCRETE_VALUES;
  return counter;
}

/**
 * Identifies this process, so two servers writing to the same database in the
 * same millisecond still produce different ids. Computed once: the hostname
 * does not change, and reading it per id would be a syscall on the hot path.
 */
const fingerprint = (() => {
  const pid = process.pid.toString(BASE);
  const host = hostname();
  // A short numeric summary of the hostname — the exact scheme does not matter,
  // only that different machines tend to land on different values.
  const hostSum = host.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), host.length + BASE);
  return pad(pid, 2) + pad(hostSum.toString(BASE), 2);
})();

function randomBlock(): string {
  // crypto rather than Math.random: ids appear in URLs and share links, and a
  // predictable id is a way to guess at records you were not given.
  return pad(randomBytes(4).readUInt32BE(0).toString(BASE), 8);
}

/** A new primary key. */
export function newId(): string {
  const timestamp = pad(Date.now().toString(BASE), 8);
  const count = pad(nextCount().toString(BASE), BLOCK);
  return `c${timestamp}${count}${fingerprint}${randomBlock()}`;
}

/**
 * Shape check for an id arriving from outside.
 *
 * Not a security control — it is a cheap way to answer "is this even an id?"
 * before spending a database round trip on it.
 */
export function looksLikeId(value: unknown): value is string {
  return typeof value === 'string' && /^c[0-9a-z]{24}$/.test(value);
}
