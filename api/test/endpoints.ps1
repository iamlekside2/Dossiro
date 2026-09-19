# Endpoints the population suites do not reach, plus the guarantees the
# database enforces rather than the application.
#
# The refresh section is a regression test. The old code revoked the session,
# created a new one, then signed the access token with the OLD session id, so
# every refreshed token was rejected on first use.

. "$PSScriptRoot\lib.ps1"
Assert-ApiUp

Banner "ENDPOINTS AND DATABASE GUARANTEES"

# =====================================================================
Head "Token refresh"
# =====================================================================
$login = (Invoke-Api POST '/auth/login' $null @{ email='admin@acme.test'; password='Dossiro!2026' }).body
Show "sign in issues a refresh token" ([bool]$login.refreshToken) ""

$r = Invoke-Api POST '/auth/refresh' $null @{ refreshToken = $login.refreshToken }
Show "refresh returns a new pair" ($r.code -eq 200 -and $r.body.accessToken -and $r.body.refreshToken) "HTTP $($r.code)"

$me = Invoke-Api GET '/auth/me' $r.body.accessToken
Show "the refreshed access token actually WORKS" ($me.code -eq 200) "HTTP $($me.code) - was 401 before the fix"

$replay = Invoke-Api POST '/auth/refresh' $null @{ refreshToken = $login.refreshToken }
Show "the old refresh token is dead (rotation)" ($replay.code -eq 401) "HTTP $($replay.code)"

$again = Invoke-Api POST '/auth/refresh' $null @{ refreshToken = $r.body.refreshToken }
Show "the new refresh token still works" ($again.code -eq 200) "HTTP $($again.code)"

$tok = (Get-Token 'admin@acme.test' 'Dossiro!2026').accessToken
$platformOrg = Get-SqlValue 'SELECT id FROM organizations WHERE "isPlatform" = true;'
$opTok = (Get-Token 'ootitolaye@calmglobal.com' 'CalmGlobal!2026' $platformOrg).accessToken

# =====================================================================
Head "Reads the workbench depends on"
# =====================================================================
$r = Invoke-Api GET '/folders/tree' $tok
Show "folder tree (recursive paths)" ($r.code -eq 200 -and $r.body.Count -gt 0) "$($r.body.Count) root folder(s)"

# The Repository screen filters by folder, so the filter itself is checked.
$rootId = $r.body[0].id
$all = Invoke-Api GET '/documents' $tok
$inFolder = Invoke-Api GET "/documents?folderId=$rootId" $tok
Show "documents filter by folder" ($inFolder.code -eq 200 -and $inFolder.body.total -le $all.body.total) `
  "$($inFolder.body.total) in '$($r.body[0].name)' of $($all.body.total) total"

$r = Invoke-Api GET '/search?q=dossiro' $tok
Show "search by name" ($r.code -eq 200 -and $r.body.mode -eq 'metadata') "mode=$($r.body.mode) total=$($r.body.total)"

$r = Invoke-Api GET '/search?q=dossiro&inContent=true' $tok
Show "full-text search inside content" ($r.code -eq 200 -and $r.body.mode -eq 'content') "mode=$($r.body.mode) total=$($r.body.total)"

$r = Invoke-Api GET '/search?q=zzz-nothing-matches' $tok
Show "an empty result is a page, not an error" ($r.code -eq 200 -and $r.body.total -eq 0) "total=0"

$r = Invoke-Api GET '/branches' $tok
Show "branches with their counts" ($r.code -eq 200) "$($r.body.total) branch(es)"

$r = Invoke-Api GET '/audit?take=5' $tok
Show "audit query with the actor joined" ($r.code -eq 200 -and $r.body.total -gt 0) "$($r.body.total) events"

$r = Invoke-Api GET '/users' $tok
$withRoles = @($r.body.items | Where-Object { $_.roles.Count -gt 0 }).Count
Show "personnel nests roles and groups" ($withRoles -gt 0) "$withRoles of $($r.body.items.Count) have roles"

$docId = Get-SqlValue "SELECT d.id FROM documents d JOIN organizations o ON o.id = d.""organizationId"" WHERE o.slug = 'acme' AND d.""deletedAt"" IS NULL LIMIT 1;"
$r = Invoke-Api GET "/documents/$docId" $tok
Show "one document with all its relations" ($r.code -eq 200 -and $r.body.currentVersion) `
  "version $($r.body.currentVersion.versionNumber), owner $($r.body.owner.displayName)"

$r = Invoke-Api GET "/documents/$docId/versions" $tok
Show "version history with the author joined" ($r.code -eq 200 -and $r.body.Count -gt 0) "$($r.body.Count) version(s)"

$r = Invoke-Api GET '/documents/recycle-bin' $tok
Show "recycle bin" ($r.code -eq 200) "$($r.body.total) deleted"

$r = Invoke-Api GET '/organization' $tok
Show "own organisation with seats and domains" ($r.code -eq 200 -and $r.body.seatsUsed -gt 0) "seatsUsed=$($r.body.seatsUsed)"

$r = Invoke-Api GET '/shares' $tok
Show "share links across the organisation" ($r.code -eq 200) "$($r.body.total) link(s)"

$r = Invoke-Api GET '/license' $tok
Show "licence read from the signature, not a column" ($r.code -eq 200) `
  "state=$($r.body.state) seats=$($r.body.seatsUsed)/$($r.body.seatsAllowed)"

$r = Invoke-Api GET '/tenant/by-host'
Show "host resolution is public, for sign-in branding" ($r.code -eq 200) `
  "organizationId=$($r.body.organizationId)"

# =====================================================================
Head "What the database enforces on its own"
# =====================================================================
$v = Invoke-Api GET '/audit/integrity' $tok
Show "the tenant audit chain verifies end to end" ($v.body.valid -eq $true) `
  "checked $($v.body.checked) events$(if ($v.body.brokenAt) { ", BROKEN at $($v.body.brokenAt)" })"

$pv = Invoke-Api GET '/audit/integrity' $opTok
Show "so does the platform's separate chain" ($pv.body.valid -eq $true) "checked $($pv.body.checked) events"

$edit = Test-SqlRefused "UPDATE audit_events SET action = 'LOGIN' WHERE id = (SELECT id FROM audit_events LIMIT 1);"
Show "audit rows cannot be updated" $edit.blocked $edit.message

$del = Test-SqlRefused "DELETE FROM audit_events WHERE id = (SELECT id FROM audit_events LIMIT 1);"
Show "audit rows cannot be deleted" $del.blocked $del.message

$dup = Test-SqlRefused "INSERT INTO organizations (id, name, slug, ""createdAt"", ""updatedAt"") VALUES ('x1','Dup','acme',now(),now());"
Show "slug uniqueness is enforced by the schema" $dup.blocked $dup.message

$fk = Test-SqlRefused "INSERT INTO users (id, ""organizationId"", email, ""displayName"", ""createdAt"", ""updatedAt"") VALUES ('x2','no-such-org','a@b.test','X',now(),now());"
Show "foreign keys hold" $fk.blocked $fk.message

$doc = Test-SqlRefused @"
INSERT INTO documents (id, "organizationId", name, kind, "mimeType", status, classification, "versionCount", "createdAt", "updatedAt")
VALUES ('x3', (SELECT id FROM organizations WHERE "isPlatform" = true), 'nope.txt', 'DOCUMENT', 'text/plain', 'ACTIVE', 'INTERNAL', 0, now(), now());
"@
Show "the platform organisation cannot hold a document" $doc.blocked $doc.message

Summary
