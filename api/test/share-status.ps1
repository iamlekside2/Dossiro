# A share link's state is derived, not stored: statusOf() computes it in
# TypeScript, and STATUS_SQL filters on it in SQL. Two expressions of one rule
# drift apart silently — the filter starts returning rows the label contradicts,
# and a "0 revoked" reading means nothing.
#
# This proves they still agree, including for the two states the seed data
# never reaches on its own.

. "$PSScriptRoot\lib.ps1"
Assert-ApiUp

$tok = (Get-Token 'admin@acme.test' 'Dossiro!2026').accessToken
$states = @('ACTIVE', 'EXPIRED', 'EXHAUSTED', 'REVOKED')

Banner "LINK STATE IS FILTERED AND LABELLED THE SAME WAY"

$all = (Invoke-Api GET '/shares?take=500' $tok).body

# Fixtures for the two states nothing in the seed produces. Created through the
# API, then aged by hand: waiting a week for an expiry is not a test.
#
# The document has to be one an anonymous link is allowed to carry. Taking
# whichever document happened to be first made this suite fail the moment a
# confidential one sorted to the top — a confidential share must name its
# recipients, so the fixture was refused and every later assertion collapsed
# with it.
$shareable = (Invoke-Api GET '/documents?take=100' $tok).body.items |
  Where-Object { $_.classification -in @('PUBLIC', 'INTERNAL') }
$doc = $shareable | Select-Object -First 1
if (-not $doc) { throw 'No PUBLIC or INTERNAL document to build share fixtures on.' }
$expired = (Invoke-Api POST '/shares' $tok @{ documentId = $doc.id }).body.share
$capped = (Invoke-Api POST '/shares' $tok @{ documentId = $doc.id; maxDownloads = 2 }).body.share

Invoke-Sql "UPDATE share_links SET ""expiresAt"" = now() - interval '1 day' WHERE id = '$($expired.id)';"
Invoke-Sql "UPDATE share_links SET ""downloadCount"" = 2 WHERE id = '$($capped.id)';"

try {
  Head "Every row a filter returns carries the label it filtered on"

  $sum = 0
  foreach ($s in $states) {
    $r = (Invoke-Api GET "/shares?take=500&status=$s" $tok).body
    $sum += $r.total
    $wrong = @($r.items | Where-Object { $_.status -ne $s })
    Show "$s rows all read as $s" ($wrong.Count -eq 0) "$($r.total) row(s), $($wrong.Count) mislabelled"
  }

  Head "The states partition the estate"

  $whole = (Invoke-Api GET '/shares?take=500' $tok).body.total
  Show "the parts sum to the whole" ($sum -eq $whole) "parts=$sum whole=$whole"
  Show "the fixtures are actually in there" ($whole -eq $all.total + 2) "was $($all.total), now $whole"

  Head "The two states the seed never reaches"

  foreach ($case in @(
      @{ id = $expired.id; want = 'EXPIRED' },
      @{ id = $capped.id; want = 'EXHAUSTED' })) {
    $r = (Invoke-Api GET "/shares?take=500&status=$($case.want)" $tok).body
    $row = $r.items | Where-Object { $_.id -eq $case.id }
    Show "an $($case.want.ToLower()) link is found by that filter" ([bool]$row) $(if ($row) { "labelled $($row.status)" } else { 'not returned' })
  }

  Head "An unknown state is refused, not ignored"

  $r = Invoke-Api GET '/shares?status=NONSENSE' $tok
  Show "a bad status is rejected" ($r.code -eq 400) "HTTP $($r.code)"

  Head "The access code hash never leaves the server"

  $body = (Invoke-Api GET '/shares?take=500' $tok).body | ConvertTo-Json -Depth 8
  Show "no passwordHash in the list response" ($body -notmatch 'passwordHash') 'argon2 hash of a short human-chosen code'
  $mk = (Invoke-Api POST '/shares' $tok @{ documentId = $doc.id }).body
  Show "nor in what create returns" (($mk | ConvertTo-Json -Depth 8) -notmatch 'passwordHash') "hasPassword=$($mk.share.hasPassword)"
  Invoke-Sql "DELETE FROM share_links WHERE id = '$($mk.share.id)';"
}
finally {
  # Fixtures are real links until removed; leaving them would skew every later
  # count and hand someone two working addresses.
  foreach ($id in @($expired.id, $capped.id)) {
    Invoke-Sql "DELETE FROM share_accesses WHERE ""shareLinkId"" = '$id';"
    Invoke-Sql "DELETE FROM share_links WHERE id = '$id';"
  }
}

Summary
