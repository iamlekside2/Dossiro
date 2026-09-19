/**
 * A repository with enough in it to be worth looking at.
 *
 * The base seed creates two documents, which is right for the verification
 * suites and useless for everything else: ranking cannot be judged on two
 * results, a folder tree with four nodes hides nothing, pagination never
 * triggers, and every count on screen is a single digit. This adds a corpus on
 * top — the same tenant, several hundred records — so the wired areas can be
 * exercised and demonstrated against something that behaves like a real estate.
 *
 * Three rules it follows:
 *
 * **Deterministic.** A fixed-seed PRNG, never Math.random, so two runs produce
 * byte-identical data and a bug found on one machine reproduces on another.
 *
 * **Idempotent**, like the rest of the seed. Documents are keyed on their name,
 * which is unique per organisation, so a second run adds nothing.
 *
 * **Honestly typed.** A file called .pdf contains a real PDF, not text with a
 * misleading extension — downloads are a shipped feature and a document that
 * will not open is a bug you find in front of a customer. The same text goes
 * into the search index, so what a reader sees is what search matched on.
 */
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { Client } from 'pg';
import { newId } from '../src/common/db/id';
import { Classification, ContentKind, DocumentStatus, StorageDriver } from '../src/common/db/enums';

/* -- determinism ---------------------------------------------------------- */

/** mulberry32: small, fast, and good enough for shaping test data. */
function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* -- the shape of a real filing cabinet ----------------------------------- */

interface Topic {
  /** Folder trail beneath the root, created if absent. */
  trail: string[];
  classification: Classification;
  /** How many documents to file here. */
  count: number;
  /** Name template; {n} is the sequence, {y} a year, {m} a month name. */
  patterns: string[];
  /** Sentences drawn on to build a body, so searches return sensible sets. */
  vocabulary: string[];
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const TOPICS: Topic[] = [
  {
    trail: ['Finance', 'Invoices 2026'],
    classification: Classification.CONFIDENTIAL,
    count: 48,
    patterns: ['Invoice-{n}_{m}-2026.pdf', 'Invoice-{n}_Harbor-Freight.pdf', 'Credit-note-{n}_{m}.pdf'],
    vocabulary: [
      'Invoice raised against purchase order PO-{n} for regional freight services.',
      'Net thirty days from the date of issue. Late settlement attracts interest at 2% per month.',
      'Value added tax is charged at 7.5% in line with the Finance Act.',
      'Remittance should quote the invoice number to avoid reconciliation delays.',
      'Consultancy fees for the period, billed monthly in arrears.',
      'Withholding tax of 5% has been deducted at source and will be remitted directly.',
      'Payment is due to the Lagos account; the Abuja account is closed to receivables.',
    ],
  },
  {
    trail: ['Finance', 'Bank statements'],
    classification: Classification.CONFIDENTIAL,
    count: 24,
    patterns: ['Statement_{m}-{y}_operations.pdf', 'Statement_{m}-{y}_payroll.pdf'],
    vocabulary: [
      'Monthly bank statement for the operations account, reconciled against the ledger.',
      'Opening and closing balances agree with the cash book after adjusting for items in transit.',
      'Two cheques remain uncleared at the statement date and appear in the reconciliation.',
      'Bank charges and commission on turnover are posted to administrative expenses.',
      'No unusual movements were identified during the reconciliation of this period.',
    ],
  },
  {
    trail: ['Finance', 'Tax filings'],
    classification: Classification.RESTRICTED,
    count: 14,
    patterns: ['VAT-return_{m}-{y}.pdf', 'PAYE-schedule_{m}-{y}.csv', 'WHT-credit-notes_{y}.pdf'],
    vocabulary: [
      'Value added tax return for the period, filed with the Federal Inland Revenue Service.',
      'Pay as you earn schedule listing deductions remitted to the state revenue service.',
      'Withholding tax credit notes received from customers during the period.',
      'Filing reference and acknowledgement are retained with this record for audit.',
      'The reconciliation between the return and the ledger is attached as a working.',
    ],
  },
  {
    trail: ['Legal', 'Contracts', 'Vendors'],
    classification: Classification.CONFIDENTIAL,
    count: 32,
    patterns: [
      'MSA_{vendor}_v{n}.pdf',
      'NDA_{vendor}_{y}.pdf',
      'SLA_{vendor}_{y}.pdf',
      'Amendment-{n}_{vendor}.pdf',
    ],
    vocabulary: [
      'Master services agreement governing the supply of services for a term of thirty-six months.',
      'Aggregate liability shall not exceed twelve months of fees paid under this agreement.',
      'The indemnification cap was renegotiated at the last review and now stands at twelve months.',
      'Either party may terminate for convenience on ninety days written notice.',
      'Confidential information survives termination for a period of five years.',
      'Governing law is the law of the Federal Republic of Nigeria.',
      'Disputes are referred to arbitration in Lagos under the Arbitration and Mediation Act.',
      'Service credits apply where availability falls below the agreed threshold in any month.',
    ],
  },
  {
    trail: ['Legal', 'Contracts', 'Clients'],
    classification: Classification.CONFIDENTIAL,
    count: 26,
    patterns: ['Engagement-letter_{vendor}_{y}.pdf', 'Statement-of-work-{n}_{vendor}.pdf'],
    vocabulary: [
      'Engagement letter setting out the scope, fees and assumptions for the work.',
      'The statement of work is subject to the master services agreement already in force.',
      'Deliverables are accepted on the acceptance criteria set out in the schedule.',
      'Change requests are priced separately and require written approval before work begins.',
      'Intellectual property in the deliverables passes on payment in full.',
    ],
  },
  {
    trail: ['Legal', 'Policies'],
    classification: Classification.INTERNAL,
    count: 12,
    patterns: ['Policy_{policy}_v{n}.pdf'],
    vocabulary: [
      'This policy applies to every member of staff, including contractors and temporary workers.',
      'Breaches are handled under the disciplinary procedure and may amount to gross misconduct.',
      'The policy is reviewed annually, or sooner where the law or our obligations change.',
      'Records created under this policy are retained for seven years and then destroyed.',
      'Questions about the policy should go to the company secretary in the first instance.',
    ],
  },
  {
    trail: ['Human Resources', 'Employee records'],
    classification: Classification.RESTRICTED,
    count: 34,
    patterns: ['Personnel-file_{person}.pdf', 'Contract-of-employment_{person}.pdf'],
    vocabulary: [
      'Personnel file containing the contract of employment and subsequent variations.',
      'Probationary period of six months, confirmed in writing on satisfactory completion.',
      'Annual leave entitlement accrues monthly and may be carried over with approval.',
      'Pension contributions are remitted to the employee nominated administrator.',
      'Next of kin and emergency contact details are held for the duration of employment.',
      'This record contains personal data and is restricted to Human Resources.',
    ],
  },
  {
    trail: ['Human Resources', 'Payroll'],
    classification: Classification.RESTRICTED,
    count: 18,
    patterns: ['Payroll-register_{m}-{y}.csv', 'Payslip-run_{m}-{y}.pdf'],
    vocabulary: [
      'Payroll register for the month showing gross pay, deductions and net pay by employee.',
      'Statutory deductions cover pay as you earn, pension and the national housing fund.',
      'Overtime and shift allowances are shown separately from basic salary.',
      'The register is approved by the head of finance before the payment file is released.',
      'Variances against the prior month are explained in the accompanying note.',
    ],
  },
  {
    trail: ['Human Resources', 'Recruitment'],
    classification: Classification.CONFIDENTIAL,
    count: 16,
    patterns: ['Job-description_{role}.pdf', 'Interview-notes_{person}.pdf', 'Offer-letter_{person}.pdf'],
    vocabulary: [
      'Job description setting out the purpose of the role, its duties and the reporting line.',
      'Candidates are assessed against the same criteria and scored independently by each panellist.',
      'The offer is conditional on satisfactory references and the right to work.',
      'Interview notes form part of the recruitment record and are retained for twelve months.',
      'The role is based in Lagos with travel to the Abuja office as required.',
    ],
  },
  {
    trail: ['Operations', 'Logistics'],
    classification: Classification.INTERNAL,
    count: 28,
    patterns: ['Delivery-note-{n}_{m}.pdf', 'Waybill-{n}.pdf', 'Manifest_{m}-{y}.csv'],
    vocabulary: [
      'Delivery note acknowledging receipt of goods at the destination depot.',
      'Discrepancies between the manifest and the goods received are noted on the face of the document.',
      'Regional freight movement between the Lagos and Kano depots, zone two.',
      'Proof of delivery is retained and matched against the carrier invoice before payment.',
      'Damaged items are recorded and claimed against the carrier within seven days.',
    ],
  },
  {
    trail: ['Operations', 'Facilities'],
    classification: Classification.INTERNAL,
    count: 14,
    patterns: ['Lease_{site}_{y}.pdf', 'Maintenance-report_{site}_{m}.pdf', 'Utility-bill_{site}_{m}.pdf'],
    vocabulary: [
      'Lease agreement for the premises, running five years with a rent review at year three.',
      'Service charge is payable quarterly in advance and reconciled annually.',
      'Routine maintenance inspection covering generators, lifts and fire systems.',
      'The generator service interval was missed in one month and has been rescheduled.',
      'Utility consumption is billed monthly and recharged across occupying departments.',
    ],
  },
  {
    trail: ['Shared'],
    classification: Classification.INTERNAL,
    count: 10,
    patterns: ['Company-handbook_{y}.pdf', 'Org-chart_{m}-{y}.pdf', 'Public-rate-card_{y}.pdf'],
    vocabulary: [
      'Shared reference material available to everyone in the organisation.',
      'This document carries no restriction and may be circulated internally without approval.',
      'Superseded editions are archived rather than deleted so that history is preserved.',
    ],
  },
];

const VENDORS = [
  'Northwind-Logistics', 'Harbor-Freight', 'Zenith-Supplies', 'Adeoye-Partners',
  'Cotonou-Transit', 'Sahel-Power', 'Lagoon-Marine', 'Kano-Haulage',
  'Bluewater-Consulting', 'Ikeja-Technologies', 'Delta-Fabrication', 'Savannah-Foods',
];

const PEOPLE = [
  'A-Okoro', 'B-Adeyemi', 'C-Nwosu', 'D-Bello', 'E-Eze', 'F-Danjuma',
  'G-Balogun', 'H-Umeh', 'I-Oyelaran', 'J-Suleiman', 'K-Adebayo', 'L-Chukwu',
  'M-Ibrahim', 'N-Afolabi', 'O-Ekwueme', 'P-Yusuf', 'Q-Adetola', 'R-Tan',
];

const POLICIES = [
  'Information-security', 'Data-protection', 'Anti-bribery', 'Whistleblowing',
  'Records-retention', 'Acceptable-use', 'Travel-and-expenses', 'Health-and-safety',
  'Business-continuity', 'Procurement', 'Remote-working', 'Code-of-conduct',
];

const ROLES_WANTED = [
  'Finance-officer', 'Logistics-coordinator', 'Legal-counsel', 'Systems-administrator',
  'Account-manager', 'Warehouse-supervisor',
];

const SITES = ['Ikeja-HQ', 'Apapa-depot', 'Kano-office', 'Kaduna-office', 'Abuja-annexe'];

/* -- files that are what they claim to be --------------------------------- */

/**
 * PDF is a container format, so "a PDF" cannot be faked with text bytes: a
 * reader will refuse it. This emits the smallest structurally valid document
 * that still renders — catalogue, page tree, one page, a content stream and a
 * base font — with a correct cross-reference table, since the byte offsets in
 * it are what a reader seeks on.
 */
function pdfBytes(title: string, lines: string[]): Buffer {
  // The content stream is Latin-1, and parentheses and backslashes delimit
  // strings, so they are escaped rather than dropped.
  const ascii = (s: string) =>
    s
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/[–—]/g, '-')
      .replace(/[^\x20-\x7e]/g, '');
  const esc = (s: string) => ascii(s).replace(/([\\()])/g, '\\$1');

  const body = [
    'BT',
    '/F1 13 Tf',
    '56 786 Td',
    `(${esc(title)}) Tj`,
    '/F1 10 Tf',
    '0 -26 Td',
    ...lines.flatMap((l) => [`(${esc(l)}) Tj`, '0 -15 Td']),
    'ET',
  ].join('\n');

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R ' +
      '/Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(body, 'latin1')} >>\nstream\n${body}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });

  const xrefAt = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) pdf += `${String(o).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;

  return Buffer.from(pdf, 'latin1');
}

/** A CSV that opens as a spreadsheet, derived from the same sentences. */
function csvBytes(title: string, lines: string[]): Buffer {
  const rows = [
    'reference,description,period,amount_ngn',
    ...lines.map(
      (l, i) =>
        `REF-${String(i + 1).padStart(4, '0')},"${l.replace(/"/g, '""')}",2026-0${(i % 9) + 1},${(i + 1) * 125_000}`,
    ),
  ];
  return Buffer.from(`# ${title}\n${rows.join('\n')}\n`, 'utf8');
}

function bytesFor(name: string, title: string, lines: string[]) {
  if (name.endsWith('.pdf')) return { buffer: pdfBytes(title, lines), mimeType: 'application/pdf' };
  if (name.endsWith('.csv')) return { buffer: csvBytes(title, lines), mimeType: 'text/csv' };
  return { buffer: Buffer.from(`${lines.join('\n')}\n`, 'utf8'), mimeType: 'text/plain' };
}

/* -- the generator -------------------------------------------------------- */

export interface CorpusContext {
  db: Client;
  organizationId: string;
  storageRoot: string;
  /** Owners to spread documents across, in the order they should be favoured. */
  owners: { id: string; weight: number }[];
  /** Root folders already created by the base seed, by name. */
  rootFolders: Map<string, { id: string; path: string; depth: number }>;
  adminId: string;
}

export async function seedCorpus(ctx: CorpusContext): Promise<{ created: number; skipped: number }> {
  const { db } = ctx;
  const random = rng(20260919);
  const pick = <T>(xs: T[]): T => xs[Math.floor(random() * xs.length)];

  let created = 0;
  let skipped = 0;
  let sequence = 1000;

  // Names come from templates, and several templates carry no sequence number —
  // two payroll registers for the same month produce the same name. Document
  // names are unique per organisation, so without this the colliding ones were
  // silently dropped and counted as "already present", which reads as
  // idempotency rather than the generator defect it is.
  const used = new Set<string>();

  // Documents are dated backwards from a fixed point rather than from now(), so
  // "3 months ago" means the same thing on every run and the relative dates on
  // screen do not drift between a seed and a demo a week later.
  const NEWEST = Date.UTC(2026, 8, 18, 9, 0, 0);
  const DAY = 86_400_000;

  for (const topic of TOPICS) {
    const folder = await ensureTrail(ctx, topic.trail, topic.classification);

    for (let i = 0; i < topic.count; i += 1) {
      sequence += 1;
      const year = 2025 + Math.floor(random() * 2);
      const base = pick(topic.patterns)
        .replace('{n}', String(sequence))
        .replace('{y}', String(year))
        .replace('{m}', pick(MONTHS))
        .replace('{vendor}', pick(VENDORS))
        .replace('{person}', pick(PEOPLE))
        .replace('{policy}', pick(POLICIES))
        .replace('{role}', pick(ROLES_WANTED))
        .replace('{site}', pick(SITES));

      // A collision gets the sequence appended, which is also how a person
      // would resolve it: "Payroll-register_June-2026 (2)".
      const dot = base.lastIndexOf('.');
      const name = used.has(base) ? `${base.slice(0, dot)}_${sequence}${base.slice(dot)}` : base;
      used.add(name);

      // Every draw for this document is taken BEFORE deciding whether to write
      // it. Skipping an existing document must not skip its randomness: on the
      // first attempt at this, a re-run consumed a different number of draws
      // and produced an entirely different set of names, so "idempotent" ran
      // the corpus up from 276 documents to 549.
      const count = 4 + Math.floor(random() * 5);
      const lines: string[] = [];
      for (let k = 0; k < count; k += 1) {
        lines.push(pick(topic.vocabulary).replace('{n}', String(77_000 + sequence)));
      }

      const age = Math.floor(random() * 540); // up to about eighteen months
      const createdAt = new Date(NEWEST - age * DAY);
      // Edited at some point between filing and now, sometimes not at all.
      const updatedAt = new Date(NEWEST - Math.floor(random() * age) * DAY);
      const ownerId = weightedOwner(ctx.owners, random);
      // A quarter of the estate is not simply "active": real repositories hold
      // drafts, things under review and superseded editions.
      const status = chooseStatus(random);
      // A third have been revised. Version history that is empty everywhere
      // tells you nothing about whether it works.
      const revised = random() < 0.34;

      const existing = await db.query<{ id: string }>(
        `SELECT id FROM documents WHERE "organizationId" = $1 AND name = $2`,
        [ctx.organizationId, name],
      );
      if (existing.rows.length) {
        skipped += 1;
        continue;
      }

      await insertDocument(ctx, {
        name,
        folderId: folder.id,
        classification: topic.classification,
        ownerId,
        lines,
        createdAt,
        updatedAt,
        status,
        revised,
      });
      created += 1;
    }
  }

  return { created, skipped };
}

function chooseStatus(random: () => number): DocumentStatus {
  const r = random();
  if (r < 0.06) return DocumentStatus.DRAFT;
  if (r < 0.12) return DocumentStatus.IN_REVIEW;
  if (r < 0.18) return DocumentStatus.APPROVED;
  if (r < 0.24) return DocumentStatus.ARCHIVED;
  return DocumentStatus.ACTIVE;
}

function weightedOwner(owners: { id: string; weight: number }[], random: () => number): string {
  const total = owners.reduce((n, o) => n + o.weight, 0);
  let r = random() * total;
  for (const o of owners) {
    r -= o.weight;
    if (r <= 0) return o.id;
  }
  return owners[owners.length - 1].id;
}

/** Creates any missing folder in the trail and returns the deepest one. */
async function ensureTrail(
  ctx: CorpusContext,
  trail: string[],
  classification: Classification,
): Promise<{ id: string; path: string; depth: number }> {
  // The map only caches what the base seed made. A root this corpus created on
  // an earlier run is in the database and nowhere else, so it is looked up
  // there too — otherwise a second run tries to create "Legal" again and hits
  // the unique index on (organizationId, name).
  let parent = ctx.rootFolders.get(trail[0]) ?? null;

  if (!parent) {
    const found = await ctx.db.query<{ id: string; path: string; depth: number }>(
      `SELECT id, path, depth FROM folders
        WHERE "organizationId" = $1 AND name = $2 AND "parentId" IS NULL AND "deletedAt" IS NULL`,
      [ctx.organizationId, trail[0]],
    );
    parent = found.rows[0] ?? (await createFolder(ctx, trail[0], null, classification));
    ctx.rootFolders.set(trail[0], parent);
  }

  for (const name of trail.slice(1)) {
    const found = await ctx.db.query<{ id: string; path: string; depth: number }>(
      `SELECT id, path, depth FROM folders
        WHERE "organizationId" = $1 AND name = $2 AND "parentId" = $3 AND "deletedAt" IS NULL`,
      [ctx.organizationId, name, parent.id],
    );
    parent = found.rows[0] ?? (await createFolder(ctx, name, parent.id, classification));
  }

  return parent;
}

async function createFolder(
  ctx: CorpusContext,
  name: string,
  parentId: string | null,
  classification: Classification,
) {
  const parent = parentId
    ? (
        await ctx.db.query<{ path: string; depth: number }>(
          'SELECT path, depth FROM folders WHERE id = $1',
          [parentId],
        )
      ).rows[0]
    : null;

  const id = newId();
  const { rows } = await ctx.db.query<{ id: string; path: string; depth: number }>(
    `INSERT INTO folders (id, "organizationId", name, "parentId", classification, "createdById",
                          "inheritAccess", depth, path, "createdAt", "updatedAt")
          VALUES ($1, $2, $3, $4, $5, $6, true, $7, $8, now(), now())
       RETURNING id, path, depth`,
    [
      id,
      ctx.organizationId,
      name,
      parentId,
      classification,
      ctx.adminId,
      parent ? parent.depth + 1 : 0,
      `${parent ? parent.path : '/'}${id}/`,
    ],
  );
  return rows[0];
}

interface DocumentSpec {
  name: string;
  folderId: string;
  classification: Classification;
  ownerId: string;
  lines: string[];
  createdAt: Date;
  updatedAt: Date;
  status: DocumentStatus;
  /** Decided by the caller, so the draw happens whether or not this is written. */
  revised: boolean;
}

async function insertDocument(ctx: CorpusContext, spec: DocumentSpec): Promise<void> {
  const { db } = ctx;
  const title = spec.name.replace(/\.[a-z]+$/, '').replace(/[-_]/g, ' ');
  const { buffer, mimeType } = bytesFor(spec.name, title, spec.lines);
  const stored = await writeBytes(ctx.storageRoot, spec.name, buffer);

  const docId = newId();
  const versionId = newId();

  await db.query(
    `INSERT INTO documents (id, "organizationId", "folderId", name, kind, "mimeType", status,
                            classification, "ownerId", "versionCount", "createdAt", "updatedAt")
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0, $10, $11)`,
    [
      docId,
      ctx.organizationId,
      spec.folderId,
      spec.name,
      ContentKind.DOCUMENT,
      mimeType,
      spec.status,
      spec.classification,
      spec.ownerId,
      spec.createdAt,
      spec.updatedAt,
    ],
  );

  await db.query(
    `INSERT INTO document_versions (id, "documentId", "versionNumber", "storageDriver", "storageKey",
                                    "sizeBytes", checksum, "mimeType", "changeSummary", "authorId",
                                    "createdAt")
          VALUES ($1, $2, 1, $3, $4, $5, $6, $7, 'Initial upload', $8, $9)`,
    [
      versionId,
      docId,
      StorageDriver.LOCAL,
      stored.key,
      String(stored.size),
      stored.checksum,
      mimeType,
      spec.ownerId,
      spec.createdAt,
    ],
  );

  let currentVersionId = versionId;
  let versionCount = 1;

  if (spec.revised) {
    const revised = [...spec.lines, 'Revised following review; the preceding edition is superseded.'];
    const second = await writeBytes(
      ctx.storageRoot,
      spec.name,
      bytesFor(spec.name, title, revised).buffer,
    );
    const secondId = newId();
    await db.query(
      `INSERT INTO document_versions (id, "documentId", "versionNumber", "storageDriver", "storageKey",
                                      "sizeBytes", checksum, "mimeType", "changeSummary", "authorId",
                                      "createdAt")
            VALUES ($1, $2, 2, $3, $4, $5, $6, $7, 'Revised after review', $8, $9)`,
      [
        secondId,
        docId,
        StorageDriver.LOCAL,
        second.key,
        String(second.size),
        second.checksum,
        mimeType,
        spec.ownerId,
        spec.updatedAt,
      ],
    );
    currentVersionId = secondId;
    versionCount = 2;
  }

  await db.query(`UPDATE documents SET "currentVersionId" = $1, "versionCount" = $2 WHERE id = $3`, [
    currentVersionId,
    versionCount,
    docId,
  ]);

  // Content search reads this table, not the document row. Indexing the same
  // text that went into the file keeps the snippet honest: what search quotes
  // is what the document says.
  await db.query(
    `INSERT INTO document_index ("documentId", "contentText", title, "wordCount", "versionId",
                                 "indexedAt")
          VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT ("documentId") DO NOTHING`,
    [docId, spec.lines.join('\n'), title, spec.lines.join(' ').split(/\s+/).length, currentVersionId],
  );
}

async function writeBytes(storageRoot: string, originalName: string, body: Buffer) {
  const now = new Date();
  const ext = originalName.slice(originalName.lastIndexOf('.'));
  const key = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${randomUUID()}${ext}`;
  const absolute = join(storageRoot, key);

  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, body);

  return { key, size: body.length, checksum: createHash('sha256').update(body).digest('hex') };
}
