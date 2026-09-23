# Support access to a tenancy (PLT-2).
#
# The promise is that operating the platform confers no sight of customer
# records. That holds by construction — every query is scoped to the caller's
# own organisation — and this is the single controlled exception to it.
#
# What is asserted here is not that the feature exists but that it constrains:
# refused without a session, refused beyond the session's scope, visible to the
# tenant, revocable by them instantly, capped when taken without an approver,
# and written to THEIR audit trail rather than only ours.

. "$PSScriptRoot\lib.ps1"
Assert-ApiUp

Banner "AN OPERATOR CANNOT LOOK WITHOUT THE TENANT KNOWING"

$platformOrg = Get-SqlValue 'SELECT id FROM organizations WHERE "isPlatform" = true;'
$acme        = Get-SqlValue "SELECT id FROM organizations WHERE slug = 'acme';"

$op    = (Get-Token 'ootitolaye@calmglobal.com' 'CalmGlobal!2026' $platformOrg).accessToken
$admin = (Get-Token 'admin@acme.test' 'Dossiro!2026').accessToken

# Start from a clean slate; earlier runs may have left windows open.
Invoke-Sql "UPDATE support_sessions SET state = 'REVOKED', ""revokedAt"" = (now() AT TIME ZONE 'UTC') WHERE state = 'ACTIVE';"

try {
  Head "Nothing without a session"

  $cold = Invoke-Api GET "/support/tenants/$acme/records" $op
  Show "records are refused outright" ($cold.code -eq 403) "HTTP $($cold.code)"
  Show "and the refusal says what to do" ($cold.body.message -match 'Request access') "$($cold.body.message)"

  Head "A reason the tenant can read is mandatory"

  $thin = Invoke-Api POST '/support/sessions' $op @{ organizationId = $acme; scope = 'METADATA'; reason = 'ticket' }
  Show "a token reason is rejected" ($thin.code -eq 400) "HTTP $($thin.code)"

  Head "Metadata does not wait, and does not overreach"

  $meta = (Invoke-Api POST '/support/sessions' $op @{
    organizationId = $acme; scope = 'METADATA'
    reason = 'Investigating a reported slow search in the Finance cabinet.'
  }).body
  Show "metadata access starts active" ($meta.state -eq 'ACTIVE') "state=$($meta.state)"

  $list = Invoke-Api GET "/support/tenants/$acme/records?take=3" $op
  Show "names and sizes are readable" ($list.code -eq 200) "$($list.body.total) record(s)"

  $first = $list.body.items[0]
  Show "no content comes with them" ($null -eq $first.contentText) 'no contentText field'
  Show "nor a storage key" ($null -eq $first.storageKey) 'no storageKey field'

  $peek = Invoke-Api GET "/support/tenants/$acme/records/$($first.id)" $op
  Show "opening a record is refused at this scope" ($peek.code -eq 403) "HTTP $($peek.code)"

  Head "Documents wait for a named person"

  $docs = (Invoke-Api POST '/support/sessions' $op @{
    organizationId = $acme; scope = 'DOCUMENTS'
    reason = 'The customer asked us to confirm what the March invoice contains.'
  }).body
  Show "the request is not self-served" ($docs.state -eq 'REQUESTED') "state=$($docs.state)"

  $seen = (Invoke-Api GET '/support/sessions' $admin).body
  Show "the tenant sees it without being told" ([bool]($seen.items | Where-Object { $_.id -eq $docs.id })) "$($seen.total) session(s)"
  $mine = $seen.items | Where-Object { $_.id -eq $docs.id }
  Show "including the operator's own words" ($mine.reason -match 'March invoice') "$($mine.reason)"

  $approved = (Invoke-Api PATCH "/support/sessions/$($docs.id)/approve" $admin @{}).body
  Show "a named person approves it" ($approved.state -eq 'ACTIVE') "by $($approved.approvedByName)"

  $opened = Invoke-Api GET "/support/tenants/$acme/records/$($first.id)" $op
  Show "now the record opens" ($opened.code -eq 200) "$($opened.body.name)"

  Head "And it is written where the tenant will see it"

  $inTheirTrail = Get-SqlValue @"
SELECT count(*) FROM audit_events e
 WHERE e."organizationId" = '$acme'
   AND e.metadata->>'event' = 'support_document_opened'
   AND e."createdAt" > (now() AT TIME ZONE 'UTC') - interval '5 minutes';
"@
  Show "the open is in the tenant's own trail" ([int]$inTheirTrail -ge 1) "$inTheirTrail entr(y/ies)"

  $withViews = (Invoke-Api GET "/support/sessions/$($docs.id)" $admin).body
  Show "and the record is named, not counted" ([bool]$withViews.views[0].documentName) "$($withViews.views[0].documentName)"

  Head "The tenant can end it, on their own, at once"

  $revoked = (Invoke-Api PATCH "/support/sessions/$($docs.id)/revoke" $admin @{ reason = 'Finished with it.' }).body
  Show "revoked by the tenant" ($revoked.state -eq 'REVOKED') "by $($revoked.revokedByName)"

  Invoke-Api PATCH "/support/sessions/$($meta.id)/revoke" $admin @{} | Out-Null

  $after = Invoke-Api GET "/support/tenants/$acme/records" $op
  Show "the operator is locked out immediately" ($after.code -eq 403) "HTTP $($after.code)"

  Head "Break-glass buys speed, not scope"

  $glass = (Invoke-Api POST '/support/sessions' $op @{
    organizationId = $acme; scope = 'DOCUMENTS'
    reason = 'Confirmed platform outage, the tenant cannot sign in at all.'
    hours = 24; breakGlass = $true
  }).body
  Show "it starts without an approver" ($glass.state -eq 'ACTIVE') "state=$($glass.state)"
  Show "and it is flagged as such" ($glass.breakGlass -eq $true) "breakGlass=$($glass.breakGlass)"

  $minutes = [int]((Get-Date $glass.expiresAt) - (Get-Date $glass.requestedAt)).TotalMinutes
  Show "24 hours asked for, 30 minutes granted" ($minutes -le 30) "$minutes minutes"

  Head "A tenant cannot see inside another tenancy's support"

  $nosy = Invoke-Api GET "/support/sessions?organizationId=$platformOrg" $admin
  Show "asking about somebody else is refused" ($nosy.code -eq 403) "HTTP $($nosy.code)"
}
finally {
  Invoke-Sql "UPDATE support_sessions SET state = 'REVOKED', ""revokedAt"" = (now() AT TIME ZONE 'UTC') WHERE state = 'ACTIVE';"
}

Summary
