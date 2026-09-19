# The three populations this system serves, and the walls between them.
#
#   1. Platform operator  - runs tenants, holds no records
#   2. Tenant user        - works inside exactly one organisation
#   3. External recipient - has no account at all, only a link
#
# Each section proves what the population CAN do, then what it CANNOT.
# The second half matters more.

. "$PSScriptRoot\lib.ps1"
Assert-ApiUp

# Accounts these checks invite occupy a seat, and Acme's free allowance is five.
# Left behind, a second run fails on a ceiling the first run filled - so the
# slate is wiped first rather than after, which also survives an interrupted run.
Invoke-Sql @'
UPDATE users SET "deletedAt" = now()
WHERE "deletedAt" IS NULL
  AND (email LIKE 'peer-%@acme.test'
       OR email = 'escalate@acme.test'
       OR email LIKE 'operator-%@calmglobal.com');
'@

$platformOrg = Get-SqlValue 'SELECT id FROM organizations WHERE "isPlatform" = true;'

Banner "THREE POPULATIONS"

# =====================================================================
Head "1. PLATFORM OPERATOR - runs tenants, holds no records"
# =====================================================================
$op = Get-Token 'ootitolaye@calmglobal.com' 'CalmGlobal!2026' $platformOrg
$opTok = $op.accessToken
Show "signs in to the platform realm" ($op.user.isPlatform -eq $true) `
  "org=$($op.user.organizationName)"

$r = Invoke-Api GET '/platform/organizations' $opTok
Show "CAN administer every tenant" ($r.code -eq 200) "sees $($r.body.Count) organisations"

$r = Invoke-Api GET '/documents' $opTok
Show "holds no records of its own" ($r.code -eq 200 -and $r.body.total -eq 0) "documents=$($r.body.total)"

$tmp = Join-Path $env:TEMP 'op-upload.txt'
Write-NoBom $tmp 'x'
$code = & curl.exe -s -o NUL -w '%{http_code}' -X POST "$script:API/documents" `
  -H "Authorization: Bearer $opTok" -F "file=@$tmp"
Remove-Item $tmp -Force -ErrorAction SilentlyContinue
Show "CANNOT store a document" ($code -eq '403') "HTTP $code"

# Not one endpoint but the whole records surface. A wall with a door in it is
# not a wall, so every kind of record gets tried.
$writes = @(
  @{ n = 'a branch'; m = 'POST'; p = '/branches'; b = @{ name = 'Should Not Exist' } },
  @{ n = 'a folder'; m = 'POST'; p = '/folders';  b = @{ name = 'Should Not Exist' } },
  @{ n = 'a share';  m = 'POST'; p = '/shares';   b = @{ documentId = '00000000-0000-0000-0000-000000000000' } },
  @{ n = 'a grant';  m = 'POST'; p = '/access/grants'; b = @{ resourceType = 'FOLDER'; resourceId = '00000000-0000-0000-0000-000000000000'; subjectType = 'USER'; subjectId = $op.user.id; level = 'WRITE' } }
)
$gotThrough = @()
foreach ($w in $writes) {
  $res = Invoke-Api $w.m $w.p $opTok $w.b
  if ($res.code -ne 403) { $gotThrough += "$($w.n)=HTTP $($res.code)" }
}
Show "CANNOT file ANY kind of record" ($gotThrough.Count -eq 0) `
  $(if ($gotThrough) { "got through: $($gotThrough -join ', ')" } else { "branch, folder, share and grant all refused 403" })

# The wall that matters: an operator must not read a customer's records.
$acmeDocs = Get-SqlValue 'SELECT count(*) FROM documents d JOIN organizations o ON o.id = d."organizationId" WHERE o.slug = ''acme'' AND d."deletedAt" IS NULL;'
$r = Invoke-Api GET '/documents' $opTok
Show "CANNOT see a customer's documents" ($r.body.total -eq 0 -and [int]$acmeDocs -gt 0) `
  "Acme holds $acmeDocs; the operator sees $($r.body.total)"

# Counted, not hardcoded: a test that only passes at exactly one operator is
# measuring the seed rather than the isolation.
$staff = [int](Get-SqlValue "SELECT count(*) FROM users WHERE ""organizationId"" = '$platformOrg' AND ""deletedAt"" IS NULL;")
$everyone = [int](Get-SqlValue 'SELECT count(*) FROM users WHERE "deletedAt" IS NULL;')
$r = Invoke-Api GET '/users' $opTok
$seen = [int]$r.body.total
Show "sees only platform staff, not customer staff" ($seen -eq $staff -and $seen -lt $everyone) `
  "sees $seen of $everyone people - exactly the $staff in the platform org"

# =====================================================================
Head "2. TENANT USER - works inside exactly one organisation"
# =====================================================================
$admin = Get-Token 'admin@acme.test' 'Dossiro!2026'
$adminTok = $admin.accessToken
Show "signs in to their own tenant" ($admin.user.isPlatform -eq $false) `
  "org=$($admin.user.organizationName) tier=$($admin.user.tier)"

$r = Invoke-Api GET '/documents' $adminTok
Show "CAN see their own organisation's records" ($r.code -eq 200 -and $r.body.total -gt 0) "documents=$($r.body.total)"

$r = Invoke-Api GET '/users' $adminTok
Show "CAN manage their own people" ($r.code -eq 200) "people=$($r.body.total)"

$r = Invoke-Api GET '/platform/organizations' $adminTok
Show "CANNOT administer tenants" ($r.code -eq 403) "HTTP $($r.code)"

$ada = Get-Token 'ada@harborfreight.test' 'HarborFreight!2026'
$adaTok = $ada.accessToken
$acmeD = (Invoke-Api GET '/documents' $adminTok).body.total
$harbD = (Invoke-Api GET '/documents' $adaTok).body.total
$acmeU = (Invoke-Api GET '/users' $adminTok).body.total
$harbU = (Invoke-Api GET '/users' $adaTok).body.total
Show "two tenants see different repositories" ($acmeD -ne $harbD) "Acme=$acmeD docs / Harbor=$harbD docs"
Show "two tenants see different people" ($acmeU -ne $harbU) "Acme=$acmeU / Harbor=$harbU"

# The tier ceiling must be attempted by somebody who HOLDS user:manage,
# otherwise the permission guard refuses first and the ceiling is never reached.
$r = Invoke-Api POST '/users/invite' $adminTok @{ email = 'escalate@acme.test'; displayName = 'Escalate'; tier = 'SYSTEM_ADMIN' }
Show "an org admin CANNOT invite above their own tier" ($r.code -eq 403) "$($r.body.message)"

$r = Invoke-Api POST '/users/invite' $adminTok @{ email = "peer-$(Get-Random)@acme.test"; displayName = 'Peer'; tier = 'MANAGER' }
Show "an org admin CAN invite below their own tier" ($r.code -eq 201) "HTTP $($r.code)"

$mgr = Get-Token 'manager@acme.test' 'Dossiro!2026'
$r = Invoke-Api GET '/users' $mgr.accessToken
Show "a manager CANNOT list personnel" ($r.code -eq 403) "HTTP $($r.code) - needs user:manage"

# The seeded deny case: inherits WRITE on Finance, carved out of Invoices.
$clerk = Get-Token 'clerk@acme.test' 'Dossiro!2026'
$finance  = Get-SqlValue "SELECT id FROM folders WHERE name = 'Finance' LIMIT 1;"
$invoices = Get-SqlValue "SELECT id FROM folders WHERE name = 'Invoices 2026' LIMIT 1;"
$onFinance  = (Invoke-Api GET "/access/effective?type=FOLDER&id=$finance" $clerk.accessToken).body.level
$onInvoices = (Invoke-Api GET "/access/effective?type=FOLDER&id=$invoices" $clerk.accessToken).body.level
Show "inherits WRITE through the group closure" ($onFinance -eq 'WRITE') "Finance = $onFinance"
Show "a deeper DENY beats the inherited allow" ($onInvoices -eq 'NONE') "Invoices 2026 = $onInvoices"

# =====================================================================
Head "3. EXTERNAL RECIPIENT - no account, only a link"
# =====================================================================
# Named, not "LIMIT 1". This section is about what a link does, so it needs a
# document a link may legitimately be made for: an open share of a CONFIDENTIAL
# record is refused on purpose, and once the seed grew past a single document
# the arbitrary pick started landing on one and failing nine assertions.
$docId = Get-SqlValue "SELECT d.id FROM documents d JOIN organizations o ON o.id = d.""organizationId"" WHERE o.slug = 'acme' AND d.name = 'dossiro-test.txt' AND d.""deletedAt"" IS NULL;"
$r = Invoke-Api POST '/shares' $adminTok @{ documentId = $docId; expiresInHours = 24; password = '778899'; allowDownload = $false }
$token = $r.body.share.token
Show "a tenant user issues them a link" ([bool]$token) "view-only, access code, expires in 24h"

$r = Invoke-Api GET "/public/shares/$token"
Show "CAN open the link with NO account" ($r.code -eq 200) "sees '$($r.body.name)'"
Show "is told the rules before entering a code" ($r.body.allowDownload -eq $false) `
  "allowDownload=$($r.body.allowDownload) requiresPassword=$($r.body.requiresPassword)"

$r = Invoke-Api POST "/public/shares/$token/authorize" $null @{ password = '000000' }
Show "a wrong code is refused" ($r.code -eq 401) "HTTP $($r.code)"

$r = Invoke-Api POST "/public/shares/$token/authorize" $null @{ password = '778899' }
$ticket = $r.body.ticket
Show "the right code issues a short-lived ticket" ([bool]$ticket) "ttl=$($r.body.expiresIn)s"

$enc = [uri]::EscapeDataString($ticket)
$code = & curl.exe -s -o NUL -w '%{http_code}' "$script:API/public/shares/$token/content?ticket=$enc"
Show "CAN read the document" ($code -eq '200') "HTTP $code"

$code = & curl.exe -s -o NUL -w '%{http_code}' "$script:API/public/shares/$token/content?ticket=$enc&disposition=attachment"
Show "CANNOT download it" ($code -eq '403') "HTTP $code - view-only enforced, not merely displayed"

Show "CANNOT reach the repository" ((Invoke-Api GET '/documents').code -eq 401) ""
Show "CANNOT list anybody" ((Invoke-Api GET '/users').code -eq 401) ""
Show "CANNOT administer tenants" ((Invoke-Api GET '/platform/organizations').code -eq 403) ""

$r = Invoke-Api POST '/shares' $adminTok @{ documentId = $docId; expiresInHours = 24 }
$other = $r.body.share.token
$code = & curl.exe -s -o NUL -w '%{http_code}' "$script:API/public/shares/$other/content?ticket=$enc"
Show "a ticket does not work on another link" ($code -eq '401') "HTTP $code"

Invoke-Api DELETE "/shares/$($r.body.share.id)" $adminTok | Out-Null
$r2 = Invoke-Api GET "/public/shares/$other"
Show "revoking kills the link at once" ($r2.code -eq 410) "HTTP $($r2.code) Gone"

# Revoking is not removing: both links are still rows, and leaving them behind
# added two to the Sharing area's count on every run. The audit entries they
# produced stay, as they must — it is the links themselves that go.
foreach ($t in @($token, $other)) {
  $id = Get-SqlValue "SELECT id FROM share_links WHERE token = '$t';"
  if ($id) {
    Invoke-Sql "DELETE FROM share_accesses WHERE ""shareLinkId"" = '$id';"
    Invoke-Sql "DELETE FROM share_links WHERE id = '$id';"
  }
}

Summary
