/**
 * Generates TypeScript enums and row interfaces from the live database.
 *
 * Prisma used to hand these over for free, and 33 files imported them from
 * `@prisma/client`. With Prisma gone the database itself becomes the source of
 * truth: this reads `information_schema` and `pg_type` and writes two files.
 *
 * Run it after any migration:  npm run db:types
 *
 * It is a build-time tool, not part of the running API. Nothing in `src/`
 * imports it, and it holds no credentials of its own — it uses DATABASE_URL.
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from 'dotenv';
import { Client } from 'pg';

config();

const OUT_DIR = join(__dirname, '..', 'src', 'common', 'db');

/**
 * Enum types are already named in PascalCase singular (`DocumentStatus`), so
 * they are passed through untouched. Running them through the table rule would
 * turn `DocumentStatus` into `DocumentStatu`.
 */
function enumName(pgType: string): string {
  return pgType;
}

/** plural snake_case table name → PascalCase singular type name. */
function typeName(table: string): string {
  // `-es` after a sibilant drops two characters (branches → branch), everything
  // else drops one (documents → document). Getting this wrong is silent: it
  // produces a type name that compiles at the definition and fails only where
  // someone imports the name they expected.
  const singular = table.endsWith('ies')
    ? `${table.slice(0, -3)}y`
    : /(ch|sh|ss|s|x|z)es$/.test(table)
      ? table.slice(0, -2)
      : table.endsWith('s')
        ? table.slice(0, -1)
        : table;

  return singular
    .split('_')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join('');
}

/**
 * Postgres type → TypeScript type.
 *
 * `numeric` maps to string deliberately: node-postgres returns it as a string
 * so that values too large for a float survive the trip, and silently calling
 * it `number` here would be a lie the compiler happily accepts.
 */
function tsType(udt: string, enums: Map<string, string[]>): string {
  if (enums.has(udt)) return enumName(udt);

  switch (udt) {
    case 'int2':
    case 'int4':
    case 'float4':
    case 'float8':
      return 'number';
    case 'int8':
    case 'numeric':
      return 'string';
    case 'bool':
      return 'boolean';
    case 'timestamp':
    case 'timestamptz':
    case 'date':
      return 'Date';
    case 'json':
    case 'jsonb':
      return 'unknown';
    case 'bytea':
      return 'Buffer';
    case 'uuid':
    case 'text':
    case 'varchar':
    case 'bpchar':
    case 'tsvector':
      return 'string';
    default:
      // An array type: `_text` is text[].
      if (udt.startsWith('_')) return `${tsType(udt.slice(1), enums)}[]`;
      return 'unknown';
  }
}

async function main(): Promise<void> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  // -- Enums ---------------------------------------------------------------
  const { rows: enumRows } = await client.query<{ name: string; label: string }>(`
    SELECT t.typname AS name, e.enumlabel AS label
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
    ORDER BY t.typname, e.enumsortorder
  `);

  const enums = new Map<string, string[]>();
  for (const r of enumRows) {
    const list = enums.get(r.name) ?? [];
    list.push(r.label);
    enums.set(r.name, list);
  }

  // -- Columns -------------------------------------------------------------
  const { rows: cols } = await client.query<{
    table_name: string;
    column_name: string;
    udt_name: string;
    is_nullable: 'YES' | 'NO';
    has_default: boolean;
    is_generated: boolean;
  }>(`
    SELECT c.table_name,
           c.column_name,
           c.udt_name,
           c.is_nullable,
           (c.column_default IS NOT NULL) AS has_default,
           (c.is_generated = 'ALWAYS')    AS is_generated
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_name = c.table_name AND t.table_schema = c.table_schema
    WHERE c.table_schema = 'public'
      AND t.table_type = 'BASE TABLE'
      AND c.table_name NOT IN ('schema_migrations', '_prisma_migrations')
    ORDER BY c.table_name, c.ordinal_position
  `);

  await client.end();

  const byTable = new Map<string, typeof cols>();
  for (const c of cols) {
    const list = byTable.get(c.table_name) ?? [];
    list.push(c);
    byTable.set(c.table_name, list);
  }

  // -- enums.ts ------------------------------------------------------------
  // Emitted as const objects rather than TS `enum`, so the values are plain
  // strings at runtime and compare equal to whatever comes back from pg.
  const enumParts: string[] = [
    banner('Database enums.', [
      'Generated from the live database by db/generate-types.ts — do not edit.',
      '',
      'Const objects rather than TypeScript `enum`: the values must be the exact',
      'strings Postgres stores, and a numeric TS enum would silently not be.',
    ]),
  ];

  for (const [name, labels] of [...enums].sort(([a], [b]) => a.localeCompare(b))) {
    const t = enumName(name);
    enumParts.push(
      `export const ${t} = {\n${labels.map((l) => `  ${l}: '${l}',`).join('\n')}\n} as const;`,
      `export type ${t} = (typeof ${t})[keyof typeof ${t}];`,
      '',
    );
  }

  writeFileSync(join(OUT_DIR, 'enums.ts'), `${enumParts.join('\n')}\n`, 'utf8');

  // -- types.ts ------------------------------------------------------------
  const used = [...enums.keys()].map(enumName).sort();
  const typeParts: string[] = [
    banner('Table row types.', [
      'Generated from the live database by db/generate-types.ts — do not edit.',
      '',
      'One interface per table, describing a row exactly as node-postgres returns',
      'it. Columns that are nullable in the database are `| null` here, so a',
      'missing value has to be handled rather than assumed away.',
    ]),
    `import type {\n${used.map((u) => `  ${u},`).join('\n')}\n} from './enums';`,
    '',
    `export type { ${used.join(', ')} };`,
    '',
  ];

  for (const [table, columns] of [...byTable].sort(([a], [b]) => a.localeCompare(b))) {
    const fields = columns.map((c) => {
      const t = tsType(c.udt_name, enums);
      const optional = c.is_nullable === 'YES' ? ' | null' : '';
      const quoted = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(c.column_name)
        ? c.column_name
        : `'${c.column_name}'`;
      return `  ${quoted}: ${t}${optional};`;
    });

    typeParts.push(
      `/** \`${table}\` */`,
      `export interface ${typeName(table)} {`,
      ...fields,
      '}',
      '',
    );
  }

  writeFileSync(join(OUT_DIR, 'types.ts'), `${typeParts.join('\n')}\n`, 'utf8');

  console.log(`Wrote ${enums.size} enums and ${byTable.size} row types to src/common/db/`);
}

function banner(title: string, lines: string[]): string {
  return ['/**', ` * ${title}`, ' *', ...lines.map((l) => (l ? ` * ${l}` : ' *')), ' */'].join('\n');
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
