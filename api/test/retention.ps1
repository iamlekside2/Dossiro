# Retention schedules, the review queue, and what a legal hold outranks.
# GOV-6, GOV-7, GOV-8.
#
# The assertion this suite exists for is the hold one. "A held record cannot be
# deleted or purged by anyone, including the highest role" is a promise made to
# a regulator, and the only way to know it holds is to sign in as an
# administrator, try, and be refused.

. "$PSScriptRoot\lib.ps1"
Assert-ApiUp

$tok = (Get-Token 'admin@acme.test' 'Dossiro!2026').accessToken
$org = Get-SqlValue "SELECT id FROM organizations WHERE slug = 'acme';"

Banner "RETENTION: SCHEDULE, REVIEW, AND LEGAL HOLD"

# A type with a two-month schedule counted from a date field, and one document
# filed against it whose anchor date is long past. Built here rather than
# seeded so the dates are unambiguous.
Invoke-Sql @"
DELETE FROM document_types WHERE id = 'rchk_type';
DELETE FROM retention_policies WHERE id = 'rchk_pol';

INSERT INTO retention_policies (id, "organizationId", name, "retainMonths", anchor, action, "useTypeAnchor")
VALUES ('rchk_pol', '$org', '__retention check__', 2, 'created', 'REVIEW', true);

INSERT INTO document_types (id, "organizationId", name, status, "retentionPolicyId", "updatedAt")
VALUES ('rchk_type', '$org', '__retention check type__', 'PUBLISHED', 'rchk_pol', now());

INSERT INTO document_type_fields
  (id, "organizationId", "documentTypeId", name, kind, "isRetentionAnchor", "updatedAt")
VALUES ('rchk_anchor', '$org', 'rchk_type', 'Closed on', 'DATE', true, now());
"@

# Two documents: one whose anchor date is two years ago (overdue), one whose
# anchor is next year (not yet due).
$docs = (Invoke-Api GET '/documents?take=2' $tok).body.items
$overdue = $docs[0].id
$future  = $docs[1].id

foreach ($d in @($overdue, $future)) {
  Invoke-Api PATCH "/documents/$d/type" $tok @{ documentTypeId = 'rchk_type' } | Out-Null
}

# A decision recorded by a previous run would keep these documents out of the
# queue — "already decided since it last came due" is exactly what the queue
# filters on. Cleared here rather than only in the tidy-up, because a run that
# fails partway never reaches the tidy-up and would poison every run after it.
Invoke-Sql "DELETE FROM retention_decisions WHERE ""documentId"" IN ('$overdue', '$future');"
Invoke-Api PATCH "/documents/$overdue/fields/rchk_anchor" $tok @{ value = '2023-01-15' } | Out-Null
Invoke-Api PATCH "/documents/$future/fields/rchk_anchor"  $tok @{ value = '2030-01-15' } | Out-Null

# -- The queue -----------------------------------------------------------------

$due = (Invoke-Api GET '/retention/due?take=200' $tok).body
$mine = $due.items | Where-Object { $_.id -eq $overdue }
Show "a document past its anchor date is due for review" ($null -ne $mine) "$($due.total) due"

$notYet = $due.items | Where-Object { $_.id -eq $future }
Show "one whose anchor is in the future is not" ($null -eq $notYet) "correctly absent"

Show "the queue says which schedule brought it up" `
  ($mine.policyName -eq '__retention check__') $mine.policyName

Show "and which field the clock counted from" ($mine.anchorField -eq 'Closed on') $mine.anchorField

$up = (Invoke-Api GET '/retention/upcoming?days=36500' $tok).body
$soon = $up.items | Where-Object { $_.id -eq $future }
Show "the forecast finds the one that falls due later" ($null -ne $soon) "$($up.total) upcoming"

# -- A legal hold outranks all of it ---------------------------------------------

Invoke-Sql @"
DELETE FROM legal_holds WHERE id = 'rchk_hold';
INSERT INTO legal_holds (id, "documentId", reason, "placedAt")
VALUES ('rchk_hold', '$overdue', 'Mensah v. Acme, discovery', now());
"@

$due = (Invoke-Api GET '/retention/due?take=200' $tok).body
$mine = $due.items | Where-Object { $_.id -eq $overdue }
Show "a held document stays in the queue rather than vanishing" ($null -ne $mine) "still listed"
Show "and is marked as held, with the reason" `
  ($mine.onHold -eq $true -and $mine.holdReason -match 'discovery') $mine.holdReason
Show "the queue reports how many cannot be actioned" ($due.onHold -ge 1) "$($due.onHold) on hold"

# The assertion the requirement turns on.
$r = Invoke-Api POST "/retention/document/$overdue/decide" $tok @{ decision = 'DESTROY'; reason = 'Period elapsed' }
Show "an administrator cannot dispose of a held document" `
  ($r.code -eq 409 -and $r.body.message -match 'hold outranks retention') $r.body.message

$stillThere = Get-SqlValue "SELECT ""deletedAt"" IS NULL FROM documents WHERE id = '$overdue';"
Show "and the document is untouched by the attempt" ($stillThere -eq 't') "not deleted"

# -- Released, then decided --------------------------------------------------------

Invoke-Sql "UPDATE legal_holds SET ""releasedAt"" = now() WHERE id = 'rchk_hold';"

$r = Invoke-Api POST "/retention/document/$overdue/decide" $tok @{ decision = 'DESTROY'; reason = '' }
Show "a disposition with no reason is refused" ($r.code -eq 400) $r.body.message

$r = Invoke-Api POST "/retention/document/$overdue/decide" $tok @{
  decision = 'DESTROY'; reason = 'Two-year period elapsed; nothing outstanding.'
}
Show "once released, the decision is accepted" ($r.code -eq 201 -or $r.code -eq 200) "HTTP $($r.code)"

# DESTROY must soft-delete, not remove: the purge job is the only thing that
# deletes bytes, and it re-checks the hold and the recovery window first.
$state = Get-SqlValue @"
SELECT CASE WHEN "deletedAt" IS NOT NULL AND "purgeAfter" > now() THEN 'recycle-bin' ELSE 'other' END
  FROM documents WHERE id = '$overdue';
"@
Show "DESTROY sends it to the recycle bin, it does not remove it" ($state -eq 'recycle-bin') $state

$due = (Invoke-Api GET '/retention/due?take=200' $tok).body
$gone = $due.items | Where-Object { $_.id -eq $overdue }
Show "a decided document leaves the queue" ($null -eq $gone) "no longer listed"

# -- The record of the decision -------------------------------------------------------

$hist = (Invoke-Api GET '/retention/history' $tok).body
$entry = $hist.items | Where-Object { $_.reason -match 'Two-year period elapsed' } | Select-Object -First 1
Show "the decision is recorded with its reason" ($null -ne $entry) $entry.reason
Show "and with who made it" ($null -ne $entry.decidedBy) $entry.decidedBy.displayName
Show "and the schedule that brought it up, captured at the time" `
  ($entry.policyName -eq '__retention check__') $entry.policyName

# -- Documents with no schedule ----------------------------------------------------------

$untyped = (Invoke-Api GET '/documents?take=50' $tok).body.items |
  Where-Object { $_.id -ne $overdue -and $_.id -ne $future } | Select-Object -First 1
$r = Invoke-Api GET "/retention/document/$($untyped.id)" $tok
Show "a document with no schedule says so rather than 404ing" `
  ($r.code -eq 200 -and $r.body.scheduled -eq $false) $r.body.reason

# -- Tidy up ------------------------------------------------------------------------------

Invoke-Sql @"
UPDATE documents SET "deletedAt" = NULL, "deletedById" = NULL, "purgeAfter" = NULL,
                     "documentTypeId" = NULL
 WHERE id IN ('$overdue', '$future');
DELETE FROM retention_decisions WHERE "documentId" IN ('$overdue', '$future');
DELETE FROM legal_holds WHERE id = 'rchk_hold';
DELETE FROM document_types WHERE id = 'rchk_type';
DELETE FROM retention_policies WHERE id = 'rchk_pol';
"@

Summary
