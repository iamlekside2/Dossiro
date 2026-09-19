# Verification suites

Five suites, 93 assertions, run against a **live PostgreSQL database and a
running API** rather than mocks. They exist to prove the guarantees the product
is sold on, not to chase coverage.

```bash
npm run verify
```

The API must be running (`npm run dev`) and the database seeded
(`npm run db:seed`). A single suite can be run on its own:

```bash
powershell -File test/three-populations.ps1
```

## What each one proves

| Suite | Assertions | Proves |
|---|---|---|
| `three-populations.ps1` | 30 | The walls between the platform operator, a tenant user, and an external link recipient. Half the checks are refusals — what each population **cannot** do matters more than what it can. |
| `suspend-reason.ps1` | 11 | Suspending a tenant requires a reason, the reason reaches both audit trails, and nobody can edit it afterwards. |
| `single-session.ps1` | 14 | Single-session sign-in is off by default, refuses with 409 and names the other device, and a takeover genuinely kills the first session. |
| `share-status.ps1` | 11 | A link's state is written twice — as SQL that filters and as a function that labels — so this holds the two against each other, including the expired and cap-reached states the seed never reaches. Also that the access-code hash never leaves the server. |
| `endpoints.ps1` | 27 | Token rotation, the reads the workbench depends on, and the guarantees the **database** enforces — the append-only trigger, foreign keys, and the platform organisation's inability to hold a document. |

## Why they are here and not in a scratch directory

An earlier version of this harness lived in a temporary folder and was lost
when it rotated. The suites that prove the product works are part of the
product, and they belong under version control with it.

## Conventions

`lib.ps1` carries the shared helpers and absorbs two Windows traps:

- **psql quoting.** `psql -tAc "SELECT ""camelCase"""` loses its double quotes
  passing through the native-argument layer, so Postgres folds the identifier
  to lower case and the query fails. Statements are written to a file and run
  with `-f`.
- **The UTF-8 BOM.** `Set-Content -Encoding utf8` prepends a byte-order mark
  that several parsers reject on line one. Files are written through .NET with
  the BOM switched off.

Suites are **repeatable**. Each cleans up what it created, or reuses a fixed
throwaway tenant where the append-only audit trail refuses deletion — an
organisation with audit rows cannot be removed at all, so a fresh one per run
would accumulate forever.

Assertions are counted, never hardcoded to a seed figure. "Sees 1 of 12 people"
is derived from the database at run time, so the check still means something
after the seed changes.
