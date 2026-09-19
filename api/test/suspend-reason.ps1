# Suspending a tenant locks a whole company out of its own records.
# This proves the reason is a precondition, not a nicety, and that it lands
# somewhere nobody can quietly edit later.

. "$PSScriptRoot\lib.ps1"
Assert-ApiUp

$platformOrg = Get-SqlValue 'SELECT id FROM organizations WHERE "isPlatform" = true;'
$tok = (Get-Token 'ootitolaye@calmglobal.com' 'CalmGlobal!2026' $platformOrg).accessToken

# One throwaway tenant, reused across runs. Audit rows cannot be deleted, so a
# fresh organisation each time would leave another undeletable row behind.
$slug = 'reason-check'
$id = Get-SqlValue "SELECT id FROM organizations WHERE slug = '$slug';"
if (-not $id) {
  $prov = (Invoke-Api POST '/platform/organizations' $tok @{
    name = 'Reason Check'; slug = $slug
    ownerEmail = "owner@$slug.test"; ownerName = 'Owner'
  }).body
  $id = $prov.organization.id
}
Invoke-Api PATCH "/platform/organizations/$id/status" $tok @{ status = 'ACTIVE' } | Out-Null

Banner "SUSPENDING A TENANT REQUIRES A REASON"

$r = Invoke-Api PATCH "/platform/organizations/$id/status" $tok @{ status = 'SUSPENDED' }
Show "suspending with NO reason is refused" ($r.code -eq 400) "HTTP $($r.code)"

$r = Invoke-Api PATCH "/platform/organizations/$id/status" $tok @{ status = 'SUSPENDED'; reason = '  ' }
Show "whitespace does not count as a reason" ($r.code -eq 400) "HTTP $($r.code)"

$r = Invoke-Api PATCH "/platform/organizations/$id/status" $tok @{ status = 'SUSPENDED'; reason = 'x' }
Show "a single character does not either" ($r.code -eq 400) "HTTP $($r.code)"

$still = Get-SqlValue "SELECT status FROM organizations WHERE id = '$id';"
Show "a refused suspension changed nothing" ($still -eq 'ACTIVE') "status is still $still"

$reason = 'Non-payment, 60 days overdue'
$r = Invoke-Api PATCH "/platform/organizations/$id/status" $tok @{ status = 'SUSPENDED'; reason = $reason }
Show "with a reason it goes through" ($r.code -eq 200) "status=$($r.body.status)"

$r = Invoke-Api PATCH "/platform/organizations/$id/status" $tok @{ status = 'ACTIVE' }
Show "reactivating needs NO reason" ($r.code -eq 200) "HTTP $($r.code)"

Head "The record it leaves"

$onTenant = Get-SqlValue @"
SELECT metadata::text FROM audit_events
WHERE "organizationId" = '$id' AND metadata->>'event' = 'status_changed'
  AND metadata->>'status' = 'SUSPENDED' LIMIT 1;
"@
Show "the tenant's own trail carries the reason" ($onTenant -like "*$reason*") $onTenant

$onPlatform = Get-SqlValue @"
SELECT metadata::text FROM audit_events
WHERE "organizationId" = '$platformOrg' AND "resourceId" = '$id'
  AND metadata->>'status' = 'SUSPENDED' LIMIT 1;
"@
Show "so does the platform's" ($onPlatform -like "*$reason*") ""

$from = Get-SqlValue @"
SELECT metadata->>'from' FROM audit_events
WHERE "organizationId" = '$id' AND metadata->>'status' = 'SUSPENDED' LIMIT 1;
"@
Show "it records what the status was BEFORE" ([bool]$from) "from=$from to=SUSPENDED"

$who = Get-SqlValue @"
SELECT "actorLabel" FROM audit_events
WHERE "organizationId" = '$id' AND metadata->>'status' = 'SUSPENDED' LIMIT 1;
"@
Show "and who did it" ($who -like '*@calmglobal.com') $who

$edit = Test-SqlRefused "UPDATE audit_events SET metadata = '{}'::jsonb WHERE ""organizationId"" = '$id';"
Show "and nobody can edit it afterwards" $edit.blocked $edit.message

# Tidy up by closing, not deleting: the trail above refuses to be erased.
Invoke-Api PATCH "/platform/organizations/$id/status" $tok @{ status = 'CLOSED'; reason = 'test tenant, no longer needed' } | Out-Null

Summary
