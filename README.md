# Dossiro

Enterprise document management: storage, retrieval, access control, sharing, and
multi-channel intake.

- `api/` — NestJS + TypeScript + Prisma + PostgreSQL
- `web/` — React + Vite + JavaScript (routing shell only; **design pending**)

---

## Status

The backend spine is built, migrated, seeded, and verified end to end against a
live database — 48 checks covering the share flow, access control, search, audit
integrity, recycle bin, analytics, sync, and channel-webhook rejection.

The frontend is built against the design handoff (`design_handoff_arkin`).

| Route | Screen |
|---|---|
| `/` | Desktop workbench — 11 areas, 3 list states, 17 inspector bodies |
| `/signin` | SSO → device trust → locked drawer, with the explanation rail |
| `/s/:token` | External share link — passcode gate → reader → signing |
| `/s/demo` | The same, with sample content, for design review |

**Flow.** `/` requires a session and redirects to `/signin` when there isn't one:
SSO → device trust → the repository, returning you to whatever you originally
asked for. Sign out lives in the user menu at the top right. A drawer with its
own passcode (Repository › Human resources, code `802914`) prompts at the moment
you open it — the scope does not change until it is unlocked, so the contents are
never briefly visible. `/s/:token` sits outside the gate: external recipients
have no account, which is the point of a share link.

Session state is `sessionStorage` only and is **not** authentication — the API is
what enforces access. It exists so the screens run in the right order.

**Responsive.** There is no separate mobile build — the workbench reflows:

| Width | Layout |
|---|---|
| ≥ 1180px | Three panes: scope 238px, list, inspector 430px |
| 760–1179px | Scope becomes an overlay drawer; list and inspector share the width |
| < 760px | One pane at a time; tapping a row opens the inspector, with a back control |

Below 1180px the secondary list columns fold into a meta line under the record
name rather than being dropped, and the page never scrolls horizontally.

Local dev database is already provisioned (`dossiro` on PostgreSQL 18,
migration `20260813121046_init`). One caveat: **`pgvector` is not installed on
this machine**, so semantic search is disabled. `001_search.sql` degrades
gracefully with a notice; full-text search is unaffected.

### Working

| Feature | What exists |
|---|---|
| 4, 7 | Folder tree with unlimited nesting, materialised paths, subtree move |
| 12 | Immutable version chain, restore-as-new-version, checkout locks |
| 2, 8, 13 | Role + classification access control with inheritance, deny, and group closure |
| 1, 18 | Share links: expiry, download caps, access codes, view-only, named recipients |
| 6, 7 | Metadata search + Postgres full-text with ranked snippets and date ranges |
| 10 | Hash-chained audit trail with an integrity verifier |
| 23 | Per-page reading analytics |
| 24 | Recycle bin, restore, legal hold, conservative purge job |
| — | WhatsApp + email upload/download with verified sender identity |
| 12 | Delta sync feed for offline clients (read side) |

### Not built yet

`GET /api/roadmap` returns the live list with what each item is blocked on.
Summary: OCR/conversion (1, 3), AI indexing and summarisation (5, 15, 16, 19),
workflows (11), e-signatures (14), e-forms (17), Microsoft/Adobe and live
co-editing (20, 22), offline *editing* (12), SOC 2 / HIPAA certification (21).

Every one of them is already modelled in the database schema, so building them
does not require a migration of existing data.

---

## Getting started

### 1. Prerequisites

- Node.js 20+
- PostgreSQL 15+ (18 is installed locally on this machine, on port 5432)

Redis, MinIO, Gotenberg and OnlyOffice are all optional — see
`docker-compose.yml`. The API runs without them; the job queue falls back to
in-process execution when `REDIS_URL` is empty.

### 2. Install

```bash
npm install
```

### 3. Configure

```bash
cp api/.env.example api/.env
```

Then set `DATABASE_URL` in `api/.env` to a database you can actually reach, and
generate real secrets:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

`JWT_SECRET` and `TICKET_SECRET` both need one. The API refuses to start in
production with the dev defaults still in place.

### 4. Create the schema

```bash
npm --workspace api run db:migrate
```

Then apply the parts Prisma cannot express — full-text search, the pgvector
column, the access-grant CHECK constraints, and the trigger that makes the
audit table append-only:

```bash
psql "$DATABASE_URL" -f api/prisma/sql/001_search.sql
```

This script is idempotent. **Re-run it after every migration.**

### 5. Seed

```bash
npm --workspace api run db:seed
```

Creates four users at different tiers, sharing the password
`Dossiro!2026`. The interesting one is `clerk@acme.test`: they inherit
WRITE on the Finance folder but carry an explicit deny on `Invoices 2026`, which
is what proves deny-at-a-deeper-scope beats inherited allow.

### 6. Run

```bash
npm run dev
```

- API — http://localhost:4010/api
- Swagger — http://localhost:4010/api/docs
- Web — http://localhost:3015

---

## Architecture decisions worth knowing

**NestJS + TypeScript, not Express + JavaScript.** With ~20 modules and
folder-inherited permissions over HR and health records, a mistyped permission
check is a data breach. Guards and DI make the access requirement visible on the
route signature.

**One PostgreSQL, not a search cluster.** `tsvector` handles full-text, `pgvector`
handles semantic search, recursive paths handle the folder tree. Adding
OpenSearch is a scale decision to make later with real numbers, not upfront.

**Guards are global and opt-out.** Every route is authenticated and
permission-checked unless it declares `@Public()`. A new endpoint is protected
by default; forgetting a decorator fails closed rather than open.

**Storage keys are generated, never derived from filenames.** Uploaded names are
attacker-controlled. The name is a database label; the bytes live at
`yyyy/mm/uuid.ext`, and `resolveKey` refuses anything escaping the storage root.

**Bytes are never overwritten.** A new version writes a new object. That single
rule is what makes version restore, recycle-bin recovery, and the audit trail
mean anything.

**Share downloads are two-step.** `POST /authorize` exchanges the access code for
a short-lived HMAC ticket; `GET /content?ticket=` streams the bytes. The access
code never enters a URL, where it would be captured by browser history, proxy
logs, and the `Referer` header of whatever the viewer clicks next.

**Inbound channel messages are authenticated, not trusted.** A WhatsApp number or
email address only maps to a user through a *verified* `ChannelIdentity`. Without
that rule, anyone who learned the business number could pull documents out of
the repository by asking politely. From addresses are trivially forged.

**Classification blocks unsafe shares (feature 8).** `evaluateShareSafety()`
refuses, for example, a RESTRICTED document shared externally or without an
expiry, and returns reasons rather than a bare boolean so the UI can explain
itself.

**Live co-editing will be bought, not built.** Features 20 and 22 are served by
embedding OnlyOffice or Office for the web over WOPI. `WopiSession` is already
modelled. Writing a collaborative editor is a multi-year project.

---

## Things to be clear-eyed about

**Offline editing (feature 12) is the most expensive item on the list.** What
exists is delta sync for offline *reading* and queued uploads. Bidirectional
offline editing with conflict resolution needs a version-vector or CRDT model
and a real desktop client. Scope it as its own phase.

**SOC 1/2/3 and HIPAA (feature 21) are mostly not code.** The technical control
surface is here: hash-chained immutable audit, classification, retention, legal
hold, session revocation, lockout. Certification itself is an auditor, vendor
BAAs, a pen test, and 3–12 months of evidence collection. Also worth knowing:
SOC 1 is a *financial controls* report — buyers asking for "SOC" almost always
want SOC 2 Type II.

**Page-level dwell tracking (feature 23) forces a custom viewer.** The browser's
native PDF plugin reports nothing. Shared documents must render through pdf.js
or the analytics will be silently empty.

**The S3 storage driver is not implemented.** `STORAGE_DRIVER=local` works;
`s3` throws a clear error pointing at the method to fill in.

---

## Layout

```
api/src/
  common/
    config/         env parsing + production safety assertions
    rbac/           permission keys, system roles, share-safety rules
    guards/         JwtAuth -> Permissions -> ResourceAccess
    filters/        Prisma error mapping, no stack traces to clients
  modules/
    access/         effective-access resolution (the security core)
    audit/          hash-chained append-only trail
    auth/           login, refresh rotation, identity assembly
    folders/        tree, move, subtree delete
    documents/      ingest, versions, checkout, recycle bin
    shares/         link creation + public consumption
    search/         metadata + full-text
    channels/       WhatsApp + email
    analytics/      per-page dwell
    sync/           offline delta feed
    maintenance/    scheduled expiry and purge
    roadmap/        what is not built yet, and why
```

## Where to start reading

`api/src/modules/access/access.service.ts`. It decides who can see what, and
everything else depends on it being right.
