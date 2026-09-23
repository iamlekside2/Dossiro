# Reading a document must not require the right to take a copy (VEW-2).
#
# The content endpoint hands over the stored bytes, so it is gated on DOWNLOAD.
# That left somebody with read access unable to see inside a record at all —
# they could open it and find nothing. The view endpoint closes that: READ is
# enough, and it returns a rendering rather than the file.
#
# What matters here is that the two cannot drift apart. If view ever starts
# serving the original bytes, or content ever stops demanding DOWNLOAD, the
# restriction stops meaning anything.

. "$PSScriptRoot\lib.ps1"
Assert-ApiUp

Banner "READING DOES NOT REQUIRE DOWNLOADING"

$adminTok = (Get-Token 'admin@acme.test' 'Dossiro!2026').accessToken

# The external partner is the population that has read access and nothing more.
$readerTok = (Get-Token 'client@partner.test' 'Dossiro!2026').accessToken

$doc = (Invoke-Api GET '/documents?take=1' $readerTok).body.items[0]
Show "a read-only person can see that the record exists" ([bool]$doc.id) "$($doc.name)"

Head "The bytes are refused"

$bytes = Invoke-Api GET "/documents/$($doc.id)/content" $readerTok
Show "content is refused without DOWNLOAD" ($bytes.code -eq 403) "HTTP $($bytes.code)"

Head "The reading is not"

$view = Invoke-Api GET "/documents/$($doc.id)/view" $readerTok
Show "view is allowed with READ alone" ($view.code -eq 200) "HTTP $($view.code)"
Show "and it carries the document's text" ([bool]$view.body.text) "$($view.body.wordCount) words"
Show "named as a rendering, not a file" ($view.body.kind -eq 'text') "kind=$($view.body.kind)"

# The whole point: nothing in the response is the file itself. A storage key or
# a signed URL would hand over exactly what the permission withholds.
$json = $view.body | ConvertTo-Json -Depth 6
Show "no storage key escapes in the response" ($json -notmatch 'storageKey') 'no storageKey field'
Show "no download URL escapes either" ($json -notmatch 'https?://') 'no URL in the body'

Head "Somebody who may download still gets the real thing"

$full = Invoke-Api GET "/documents/$($doc.id)/content" $adminTok
Show "content is served to a downloader" ($full.code -eq 200) "HTTP $($full.code)"

Head "Reading leaves a trace"

# A view-only reader who left no audit entry would be invisible to the very
# report the trail exists to produce.
$seen = Get-SqlValue @"
SELECT count(*) FROM audit_events e
 JOIN users u ON u.id = e."actorId"
 WHERE u.email = 'client@partner.test'
   AND e.action = 'DOCUMENT_VIEW'
   -- The column is `timestamp without time zone` holding UTC, and psql's
   -- now() is local. Comparing them directly is an hour out and silently
   -- matches nothing.
   AND e."createdAt" > (now() AT TIME ZONE 'UTC') - interval '2 minutes';
"@
Show "the view is written to the audit trail" ([int]$seen -ge 1) "$seen entr(y/ies) in the last 2 minutes"

Summary
