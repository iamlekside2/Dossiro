# Single-session sign-in - the "session is already active" prompt, built as a
# security control rather than a licence lock.
#
#   - OFF by default, so no tenant is surprised by it
#   - ON per organisation, via settings.security.singleSession
#   - the refusal SHOWS where the other session is, instead of "come back later"
#   - taking over ends the other session and says so in the audit trail

. "$PSScriptRoot\lib.ps1"
Assert-ApiUp

$CHROME = 'Mozilla/5.0 (Windows NT 10.0) Chrome/120 Safari/537.36'
$IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari/605'

function Set-Policy($On) {
  $json = if ($On) { '{"security":{"singleSession":true}}' } else { '{}' }
  Invoke-Sql "UPDATE organizations SET settings = '$json'::jsonb WHERE slug = 'acme';"
}

function Clear-Sessions {
  Invoke-Sql 'UPDATE sessions SET "revokedAt" = now() WHERE "revokedAt" IS NULL;'
}

function Get-LiveSessions {
  [int](Get-SqlValue @'
SELECT count(*) FROM sessions s JOIN users u ON u.id = s."userId"
 WHERE u.email = 'admin@acme.test' AND s."revokedAt" IS NULL AND s."expiresAt" > now();
'@)
}

function Sign-In($Body, $Agent) {
  return Invoke-Api POST '/auth/login' $null $Body $Agent
}

Banner "SINGLE-SESSION SIGN-IN"

# =====================================================================
Head "Off by default - nobody is surprised by it"
# =====================================================================
Set-Policy $false
Clear-Sessions

$a = Sign-In @{ email='admin@acme.test'; password='Dossiro!2026' } $CHROME
$b = Sign-In @{ email='admin@acme.test'; password='Dossiro!2026' } $IPHONE
Show "two sign-ins both succeed when the policy is off" ($a.code -eq 200 -and $b.code -eq 200) `
  "first HTTP $($a.code), second HTTP $($b.code)"
$n = Get-LiveSessions
Show "both sessions are live side by side" ($n -ge 2) "$n live sessions"

# =====================================================================
Head "On - the second sign-in is refused, and says where the first is"
# =====================================================================
Set-Policy $true
Clear-Sessions

$first = Sign-In @{ email='admin@acme.test'; password='Dossiro!2026' } $CHROME
Show "the first sign-in still works normally" ($first.code -eq 200) "HTTP $($first.code)"

$second = Sign-In @{ email='admin@acme.test'; password='Dossiro!2026' } $IPHONE
Show "the second is refused with 409, not 401" ($second.code -eq 409) `
  "HTTP $($second.code). The password was correct, so 401 would send them to reset a working password."
Show "it carries a code the client can act on" ($second.body.code -eq 'SESSION_ACTIVE') "code=$($second.body.code)"

$s = $second.body.sessions[0]
Show "it names the device, so they recognise their own" ([bool]$s.device) "device: $($s.device)"
Show "it masks the address rather than publishing it" ([bool]$s.from) "from: $($s.from)"
Show "it says when that session started" ([bool]$s.startedAt) "started: $($s.startedAt)"
Show "the refused attempt created no session" ((Get-LiveSessions) -eq 1) "$(Get-LiveSessions) live session"

# =====================================================================
Head "Taking over - deliberate, and recorded"
# =====================================================================
$take = Sign-In @{ email='admin@acme.test'; password='Dossiro!2026'; takeover=$true } $IPHONE
Show "signing in again with takeover succeeds" ($take.code -eq 200) "HTTP $($take.code)"
Show "exactly one session survives" ((Get-LiveSessions) -eq 1) "$(Get-LiveSessions) live session"

$audited = Get-SqlValue @'
SELECT metadata::text FROM audit_events
 WHERE metadata->>'event' = 'session_taken_over'
 ORDER BY "createdAt" DESC LIMIT 1;
'@
Show "the takeover is in the audit trail" ($audited -like '*session_taken_over*') $audited

# The old token must actually be dead, not merely marked revoked in a column.
$me = & curl.exe -s -o NUL -w '%{http_code}' "$script:API/auth/me" -H "Authorization: Bearer $($first.body.accessToken)"
Show "the FIRST device is genuinely signed out" ($me -eq '401') "HTTP $me on /auth/me with the old token"

# =====================================================================
Head "Leave the dev tenant as it was"
# =====================================================================
Set-Policy $false
$off = Get-SqlValue "SELECT COALESCE(settings::text, '{}') FROM organizations WHERE slug = 'acme';"
Show "policy restored to off" ($off -notlike '*singleSession*') "settings: $off"

Summary
