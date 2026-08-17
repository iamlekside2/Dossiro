/**
 * Development seed.
 *
 * Creates one organisation, the system roles, a department tree, four users at
 * different tiers, and a folder structure with grants that exercise the
 * interesting cases: inheritance, an isolated subtree, and an explicit deny.
 *
 * Idempotent — every write is an upsert keyed on a natural unique constraint,
 * so running it twice changes nothing and running it against a partially
 * seeded database finishes the job.
 *
 * Run with:  npm run db:seed
 */
import * as argon2 from 'argon2';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { config } from 'dotenv';
import { Client, types } from 'pg';
import { newId } from '../src/common/db/id';
import {
  AccessLevel,
  Classification,
  ContentKind,
  DocumentStatus,
  ResourceType,
  StorageDriver,
  SubjectType,
  UserStatus,
} from '../src/common/db/enums';
import { SYSTEM_ROLES } from '../src/common/rbac/permissions';

config();

// The seed writes timestamps too, so it needs the same UTC handling the
// application uses. Without it, seeded rows land an hour out on any machine
// that is not on UTC — see the comment in database.service.ts.
types.setTypeParser(types.builtins.TIMESTAMP, (v: string) => new Date(`${v.replace(' ', 'T')}Z`));

const DEV_PASSWORD = 'Arkin!2026';
const PLATFORM_PASSWORD = 'CalmGlobal!2026';
const HARBOR_PASSWORD = 'HarborFreight!2026';

/** Where the local storage driver keeps bytes, mirroring StorageService. */
const STORAGE_ROOT = resolve(process.cwd(), process.env.STORAGE_LOCAL_DIR ?? './storage');

const db = new Client({ connectionString: process.env.DATABASE_URL });

async function one<T>(text: string, values: unknown[] = []): Promise<T> {
  const { rows } = await db.query<T>(text, values);
  if (rows.length !== 1) throw new Error(`Expected one row: ${text.trim().split('\n')[0]}`);
  return rows[0];
}

async function maybeOne<T>(text: string, values: unknown[] = []): Promise<T | null> {
  const { rows } = await db.query<T>(text, values);
  return rows[0] ?? null;
}

async function main(): Promise<void> {
  await db.connect();
  console.log('Seeding Arkin...');

  const org = await upsertOrg('Acme Corporation', 'acme', { status: 'TRIAL' });
  const roles = await seedRoles(org.id);

  // ---- Departments ----------------------------------------------------------
  const finance = await upsertGroup(org.id, 'Finance', null);
  const payables = await upsertGroup(org.id, 'Accounts Payable', finance.id);
  const hr = await upsertGroup(org.id, 'Human Resources', null);

  // ---- Users ----------------------------------------------------------------
  const passwordHash = await argon2.hash(DEV_PASSWORD);

  const admin = await upsertUser(org.id, 'admin@acme.test', 'Ada Admin', 'ORG_ADMIN', passwordHash, roles.org_admin);
  const manager = await upsertUser(org.id, 'manager@acme.test', 'Mo Manager', 'MANAGER', passwordHash, roles.manager);
  const clerk = await upsertUser(org.id, 'clerk@acme.test', 'Chris Clerk', 'CONTRIBUTOR', passwordHash, roles.contributor);
  const guest = await upsertUser(org.id, 'client@partner.test', 'Pat Partner', 'EXTERNAL', passwordHash, roles.external);

  await addToGroup(payables.id, clerk.id);
  await addToGroup(finance.id, manager.id, true);
  await addToGroup(hr.id, admin.id, true);

  // ---- Folders --------------------------------------------------------------
  const financeFolder = await upsertFolder(org.id, 'Finance', null, Classification.CONFIDENTIAL, admin.id);
  const invoices = await upsertFolder(org.id, 'Invoices 2026', financeFolder.id, Classification.CONFIDENTIAL, admin.id);
  const hrFolder = await upsertFolder(org.id, 'Human Resources', null, Classification.RESTRICTED, admin.id, false);
  const shared = await upsertFolder(org.id, 'Shared', null, Classification.INTERNAL, admin.id);

  // ---- Grants: the cases worth testing --------------------------------------

  // Finance department reads the whole Finance tree; Accounts Payable inherits
  // it through the group hierarchy without needing its own grant.
  await grant(SubjectType.GROUP, finance.id, ResourceType.FOLDER, financeFolder.id, AccessLevel.WRITE, admin.id);

  // HR is isolated (inheritAccess = false), so only this explicit grant applies.
  await grant(SubjectType.GROUP, hr.id, ResourceType.FOLDER, hrFolder.id, AccessLevel.WRITE, admin.id);

  // Everyone in the org can read Shared.
  await grant(SubjectType.ROLE, roles.contributor, ResourceType.FOLDER, shared.id, AccessLevel.DOWNLOAD, admin.id);
  await grant(SubjectType.ROLE, roles.manager, ResourceType.FOLDER, shared.id, AccessLevel.WRITE, admin.id);

  // The external partner sees Shared and nothing else, view-only.
  await grant(SubjectType.USER, guest.id, ResourceType.FOLDER, shared.id, AccessLevel.READ, admin.id);

  // Explicit deny: the clerk inherits WRITE on Finance, but is carved out of
  // the Invoices subfolder. Deny at the more specific scope wins.
  await grant(SubjectType.USER, clerk.id, ResourceType.FOLDER, invoices.id, AccessLevel.NONE, admin.id, true);

  // ---- Branches -------------------------------------------------------------
  // Nested two deep, so a grant at zone level can be shown reaching an office
  // beneath it.
  const head = await upsertBranch(org.id, 'Head Office', null, { isHeadOffice: true, code: 'HQ' });
  const northWest = await upsertBranch(org.id, 'North West Zone', null, { code: 'NW' });
  await upsertBranch(org.id, 'Kano Office', northWest.id, { code: 'KAN' });
  await upsertBranch(org.id, 'Kaduna Office', northWest.id, { code: 'KAD' });
  await db.query(`UPDATE users SET "branchId" = $1 WHERE id = $2 AND "branchId" IS NULL`, [
    head.id,
    admin.id,
  ]);

  // ---- Documents ------------------------------------------------------------
  // Real bytes on disk, so downloads, share links and full-text search all have
  // something to work with. Named to match what the verification suites search
  // for.
  await upsertDocument(org.id, admin.id, financeFolder.id, 'arkin-test.txt', [
    'Arkin acceptance fixture.',
    'Quarterly reconciliation notes for the Finance cabinet.',
  ]);
  const invoice = await upsertDocument(org.id, manager.id, invoices.id, 'invoice-0001.txt', [
    'Invoice 0001 — consultancy, March.',
  ]);
  // A second version, so version history has something to show.
  await addVersion(invoice, manager.id, ['Invoice 0001 — consultancy, March (revised).']);

  // ---- The platform realm ---------------------------------------------------
  // Operating the platform and using the product are different jobs, so the
  // operator lives in an organisation that holds no records at all.
  const platform = await upsertOrg('Calm Global Platform', 'platform', { isPlatform: true });
  const platformRoles = await seedRoles(platform.id);
  const platformHash = await argon2.hash(PLATFORM_PASSWORD);
  await upsertUser(platform.id, 'ootitolaye@calmglobal.com', 'Olamide Otitolaye', 'ORG_ADMIN', platformHash, platformRoles.org_admin);

  // Calm Global's OWN records tenant — deliberately separate from the platform.
  // The same address exists in both, which is what makes the sign-in org picker
  // reachable in development.
  const calm = await upsertOrg('Calm Global', 'calmglobal', { plan: 'internal' });
  const calmRoles = await seedRoles(calm.id);
  await upsertUser(calm.id, 'ootitolaye@calmglobal.com', 'Olamide Otitolaye', 'ORG_ADMIN', platformHash, calmRoles.org_admin);
  await upsertUser(calm.id, 'henry@calmglobal.com', 'Henry Umeh', 'MANAGER', platformHash, calmRoles.manager);
  await upsertDomain(calm.id, 'calmglobal.com');

  // ---- A second customer ----------------------------------------------------
  // Tenant isolation cannot be demonstrated with one tenant. Harbor Freight has
  // a different number of people and no documents, so a leak between the two
  // shows up as a changed count rather than needing a subtle assertion.
  const harbor = await upsertOrg('Harbor Freight Ltd', 'harbor-freight-ltd', { seatLimit: 3 });
  const harborRoles = await seedRoles(harbor.id);
  const harborHash = await argon2.hash(HARBOR_PASSWORD);
  await upsertUser(harbor.id, 'ada@harborfreight.test', 'Ada Obi', 'ORG_ADMIN', harborHash, harborRoles.org_admin);
  await upsertUser(harbor.id, 'obi@harborfreight.test', 'Obi Nwosu', 'MANAGER', harborHash, harborRoles.manager, UserStatus.SUSPENDED);
  await upsertUser(harbor.id, 'third@harborfreight.test', 'Third Person', 'CONTRIBUTOR', harborHash, harborRoles.contributor, UserStatus.INVITED);
  await upsertDomain(harbor.id, 'harborfreight.test');

  console.log(`
Seed complete.

  ${DEV_PASSWORD}      admin@acme.test        ORG_ADMIN     sees everything
                          manager@acme.test      MANAGER       Finance (write), Shared (write)
                          clerk@acme.test        CONTRIBUTOR   Finance (write) but DENIED on Invoices 2026
                          client@partner.test    EXTERNAL      Shared only, read-only

  ${PLATFORM_PASSWORD}       ootitolaye@calmglobal.com            in BOTH "Calm Global Platform"
                          (operator console)                    and "Calm Global" — so signing in
                                                                shows the organisation picker

  ${HARBOR_PASSWORD}   ada@harborfreight.test  ORG_ADMIN     a second tenant, for isolation

  The clerk is the interesting one: it verifies that a deny at a deeper scope
  beats an allow inherited from above.
`);
}

/* -- helpers ------------------------------------------------------------- */

async function upsertOrg(
  name: string,
  slug: string,
  opts: { isPlatform?: boolean; status?: string; plan?: string; seatLimit?: number } = {},
) {
  return one<{ id: string; name: string }>(
    `INSERT INTO organizations (id, name, slug, "isPlatform", status, plan, "seatLimit",
                                "createdAt", "updatedAt")
          VALUES ($1, $2, $3, $4, $5, $6, $7, now(), now())
     ON CONFLICT (slug)
   DO UPDATE SET name = EXCLUDED.name, "updatedAt" = now()
       RETURNING id, name`,
    [
      newId(),
      name,
      slug,
      opts.isPlatform ?? false,
      opts.status ?? 'ACTIVE',
      opts.plan ?? 'standard',
      opts.seatLimit ?? null,
    ],
  );
}

/** Each tenant gets its own copy of the system roles. */
async function seedRoles(organizationId: string): Promise<Record<string, string>> {
  const roles: Record<string, string> = {};
  for (const [key, def] of Object.entries(SYSTEM_ROLES)) {
    const role = await one<{ id: string }>(
      `INSERT INTO roles (id, "organizationId", key, name, description, "isSystem", permissions,
                          "createdAt", "updatedAt")
            VALUES ($1, $2, $3, $4, $5, true, $6, now(), now())
       ON CONFLICT ("organizationId", key)
     DO UPDATE SET permissions = EXCLUDED.permissions,
                   name        = EXCLUDED.name,
                   description = EXCLUDED.description,
                   "updatedAt" = now()
         RETURNING id`,
      [newId(), organizationId, key, def.name, def.description, def.permissions as string[]],
    );
    roles[key] = role.id;
  }
  return roles;
}

async function upsertDomain(organizationId: string, domain: string) {
  await db.query(
    `INSERT INTO organization_domains (id, "organizationId", domain, "verifiedAt", "createdAt")
          VALUES ($1, $2, $3, now(), now())
     ON CONFLICT (domain) DO NOTHING`,
    [newId(), organizationId, domain],
  );
}

async function upsertBranch(
  organizationId: string,
  name: string,
  parentId: string | null,
  opts: { isHeadOffice?: boolean; code?: string } = {},
) {
  const existing = await maybeOne<{ id: string }>(
    `SELECT id FROM branches
      WHERE "organizationId" = $1 AND name = $2 AND "deletedAt" IS NULL`,
    [organizationId, name],
  );
  if (existing) return existing;

  return one<{ id: string }>(
    `INSERT INTO branches (id, "organizationId", name, code, "parentId", "isHeadOffice", timezone,
                           "createdAt", "updatedAt")
          VALUES ($1, $2, $3, $4, $5, $6, 'Africa/Lagos', now(), now())
       RETURNING id`,
    [newId(), organizationId, name, opts.code ?? null, parentId, opts.isHeadOffice ?? false],
  );
}

/**
 * Writes real bytes through the same key layout StorageService uses, then the
 * document and its first version. A document row with no file behind it looks
 * fine in a list and fails the moment anyone opens it.
 */
async function writeBytes(originalName: string, lines: string[]) {
  const body = Buffer.from(`${lines.join('\n')}\n`, 'utf8');
  const now = new Date();
  const ext = originalName.slice(originalName.lastIndexOf('.'));
  const key = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${randomUUID()}${ext}`;
  const absolute = join(STORAGE_ROOT, key);

  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, body);

  return { key, size: body.length, checksum: createHash('sha256').update(body).digest('hex') };
}

async function upsertDocument(
  organizationId: string,
  ownerId: string,
  folderId: string,
  name: string,
  lines: string[],
) {
  const existing = await maybeOne<{ id: string }>(
    `SELECT id FROM documents
      WHERE "organizationId" = $1 AND name = $2 AND "deletedAt" IS NULL`,
    [organizationId, name],
  );
  if (existing) return existing.id;

  const stored = await writeBytes(name, lines);
  const docId = newId();
  const versionId = newId();

  // The document first with no current version, then the version, then the
  // pointer — each row's foreign key has to already exist, and they point at
  // each other. This is the same order documents.service.ts uses.
  await db.query(
    `INSERT INTO documents (id, "organizationId", "folderId", name, kind, "mimeType", status,
                            classification, "ownerId", "versionCount", "createdAt", "updatedAt")
          VALUES ($1, $2, $3, $4, $5, 'text/plain', $6, $7, $8, 0, now(), now())`,
    [
      docId,
      organizationId,
      folderId,
      name,
      ContentKind.DOCUMENT,
      DocumentStatus.ACTIVE,
      Classification.INTERNAL,
      ownerId,
    ],
  );

  await db.query(
    `INSERT INTO document_versions (id, "documentId", "versionNumber", "storageDriver", "storageKey",
                                    "sizeBytes", checksum, "mimeType", "changeSummary", "authorId",
                                    "createdAt")
          VALUES ($1, $2, 1, $3, $4, $5, $6, 'text/plain', 'Initial upload', $7, now())`,
    [versionId, docId, StorageDriver.LOCAL, stored.key, String(stored.size), stored.checksum, ownerId],
  );

  await db.query(
    `UPDATE documents SET "currentVersionId" = $1, "versionCount" = 1 WHERE id = $2`,
    [versionId, docId],
  );

  // Full-text search reads document_index, not the document row, so an
  // unindexed document is invisible to content search however well it is named.
  await db.query(
    `INSERT INTO document_index ("documentId", "contentText", title, "wordCount", "versionId",
                                 "indexedAt")
          VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT ("documentId") DO NOTHING`,
    [docId, lines.join('\n'), name, lines.join(' ').split(/\s+/).length, versionId],
  );

  return docId;
}

async function addVersion(documentId: string, authorId: string, lines: string[]) {
  const current = await one<{ versionCount: number; name: string }>(
    'SELECT "versionCount", name FROM documents WHERE id = $1',
    [documentId],
  );
  if (current.versionCount > 1) return;

  const stored = await writeBytes(current.name, lines);
  const versionId = newId();
  const next = current.versionCount + 1;

  await db.query(
    `INSERT INTO document_versions (id, "documentId", "versionNumber", "storageDriver", "storageKey",
                                    "sizeBytes", checksum, "mimeType", "changeSummary", "authorId",
                                    "createdAt")
          VALUES ($1, $2, $3, $4, $5, $6, $7, 'text/plain', $8, $9, now())`,
    [
      versionId,
      documentId,
      next,
      StorageDriver.LOCAL,
      stored.key,
      String(stored.size),
      stored.checksum,
      `Version ${next}`,
      authorId,
    ],
  );

  await db.query(
    `UPDATE documents SET "currentVersionId" = $1, "versionCount" = $2, "updatedAt" = now()
      WHERE id = $3`,
    [versionId, next, documentId],
  );
}

async function upsertGroup(organizationId: string, name: string, parentId: string | null) {
  return one<{ id: string }>(
    `INSERT INTO groups (id, "organizationId", name, "parentId", "createdAt", "updatedAt")
          VALUES ($1, $2, $3, $4, now(), now())
     ON CONFLICT ("organizationId", name)
   DO UPDATE SET "parentId" = EXCLUDED."parentId", "updatedAt" = now()
       RETURNING id`,
    [newId(), organizationId, name, parentId],
  );
}

async function upsertUser(
  organizationId: string,
  email: string,
  displayName: string,
  tier: 'ORG_ADMIN' | 'MANAGER' | 'CONTRIBUTOR' | 'EXTERNAL',
  passwordHash: string,
  roleId: string,
  status: UserStatus = UserStatus.ACTIVE,
) {
  const user = await one<{ id: string }>(
    `INSERT INTO users (id, "organizationId", email, "displayName", tier, "passwordHash", status,
                        "createdAt", "updatedAt")
          VALUES ($1, $2, $3, $4, $5, $6, $7, now(), now())
     ON CONFLICT ("organizationId", email)
   DO UPDATE SET "displayName"  = EXCLUDED."displayName",
                 tier           = EXCLUDED.tier,
                 "passwordHash" = EXCLUDED."passwordHash",
                 status         = EXCLUDED.status,
                 "updatedAt"    = now()
       RETURNING id`,
    [newId(), organizationId, email, displayName, tier, passwordHash, status],
  );

  await db.query(
    `INSERT INTO user_roles (id, "userId", "roleId", "assignedAt")
          VALUES ($1, $2, $3, now())
     ON CONFLICT ("userId", "roleId") DO NOTHING`,
    [newId(), user.id, roleId],
  );

  return user;
}

async function addToGroup(groupId: string, userId: string, isLead = false) {
  await db.query(
    `INSERT INTO group_members (id, "groupId", "userId", "isLead", "joinedAt")
          VALUES ($1, $2, $3, $4, now())
     ON CONFLICT ("groupId", "userId") DO UPDATE SET "isLead" = EXCLUDED."isLead"`,
    [newId(), groupId, userId, isLead],
  );
}

async function upsertFolder(
  organizationId: string,
  name: string,
  parentId: string | null,
  classification: Classification,
  createdById: string,
  inheritAccess = true,
) {
  const existing = await maybeOne<{ id: string; path: string; depth: number }>(
    `SELECT id, path, depth FROM folders
      WHERE "organizationId" = $1 AND name = $2
        AND "parentId" IS NOT DISTINCT FROM $3
        AND "deletedAt" IS NULL`,
    [organizationId, name, parentId],
  );
  if (existing) return existing;

  const parent = parentId
    ? await one<{ path: string; depth: number }>('SELECT path, depth FROM folders WHERE id = $1', [parentId])
    : null;

  // The id is generated first so the materialised path is correct in the
  // INSERT itself, rather than needing a follow-up UPDATE.
  const id = newId();
  return one<{ id: string; path: string; depth: number }>(
    `INSERT INTO folders (id, "organizationId", name, "parentId", classification, "createdById",
                          "inheritAccess", depth, path, "createdAt", "updatedAt")
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now(), now())
       RETURNING id, path, depth`,
    [
      id,
      organizationId,
      name,
      parentId,
      classification,
      createdById,
      inheritAccess,
      parent ? parent.depth + 1 : 0,
      `${parent ? parent.path : '/'}${id}/`,
    ],
  );
}

async function grant(
  subjectType: SubjectType,
  subjectId: string,
  resourceType: ResourceType,
  resourceId: string,
  level: AccessLevel,
  grantedById: string,
  isDeny = false,
) {
  const userId = subjectType === SubjectType.USER ? subjectId : null;
  const groupId = subjectType === SubjectType.GROUP ? subjectId : null;
  const roleId = subjectType === SubjectType.ROLE ? subjectId : null;
  const folderId = resourceType === ResourceType.FOLDER ? resourceId : null;
  const documentId = resourceType === ResourceType.DOCUMENT ? resourceId : null;

  const existing = await maybeOne<{ id: string }>(
    `SELECT id FROM access_grants
      WHERE "subjectType" = $1 AND "resourceType" = $2
        AND "userId"     IS NOT DISTINCT FROM $3
        AND "groupId"    IS NOT DISTINCT FROM $4
        AND "roleId"     IS NOT DISTINCT FROM $5
        AND "folderId"   IS NOT DISTINCT FROM $6
        AND "documentId" IS NOT DISTINCT FROM $7`,
    [subjectType, resourceType, userId, groupId, roleId, folderId, documentId],
  );
  if (existing) return existing;

  return one<{ id: string }>(
    `INSERT INTO access_grants (id, "subjectType", "userId", "groupId", "roleId", "resourceType",
                                "folderId", "documentId", level, "isDeny", "grantedById", "createdAt")
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
       RETURNING id`,
    [newId(), subjectType, userId, groupId, roleId, resourceType, folderId, documentId, level, isDeny, grantedById],
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.end());
