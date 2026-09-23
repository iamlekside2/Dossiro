# Reaching a record through a side door.
#
# Access is declared per route with @RequireAccess, and the guard is global, so
# a route that forgets the declaration is not refused by default — it is open.
# Eight of them had forgotten it. Every one took a document id, or listed
# documents, and answered anyone signed in.
#
# The probe is the external partner: a real population with read access to one
# shared folder and nothing else. What they must not be able to do is anything
# at all with a record they cannot open.
#
# Two of these are writes. Filing a document as a type also starts any workflow
# triggered by that type, so an outsider could set approvals running on records
# they cannot see — or, by clearing the type, delete every index value the
# record carried.

. "$PSScriptRoot\lib.ps1"
Assert-ApiUp

Banner "A RECORD YOU CANNOT OPEN STAYS SHUT"

$adminTok  = (Get-Token 'admin@acme.test' 'Dossiro!2026').accessToken
$outsider  = (Get-Token 'client@partner.test' 'Dossiro!2026').accessToken

# The suite's own document, filed as a type so it carries index values worth
# leaking, in a folder the partner has no grant on.
$doc = New-ProbeDocument -Token $adminTok -Name 'object-access-probe.txt'
$type = Get-SqlValue @"
SELECT t.id FROM document_types t JOIN organizations o ON o.id = t."organizationId"
 WHERE o.slug = 'acme' AND t.name = 'Contract' LIMIT 1;
"@
Invoke-Api PATCH "/documents/$($doc.id)/type" $adminTok @{ documentTypeId = $type } | Out-Null
$field = Get-SqlValue @"
SELECT id FROM document_type_fields WHERE "documentTypeId" = '$type' AND name = 'Contractor' LIMIT 1;
"@
Invoke-Api PATCH "/documents/$($doc.id)/fields/$field" $adminTok @{ value = 'Sensitive Counterparty Ltd' } | Out-Null

Head "The document itself is out of reach"

$base = Invoke-Api GET "/documents/$($doc.id)" $outsider
Show "the outsider cannot open the record" ($base.code -eq 403) "HTTP $($base.code)"

Head "Nor is anything hanging off it"

# Index values are most of what the record says about itself. The name of the
# counterparty on a contract is the thing worth stealing.
$fields = Invoke-Api GET "/documents/$($doc.id)/fields" $outsider
Show "its index values are refused" ($fields.code -eq 403) "HTTP $($fields.code)"
$leaked = ($fields.body | ConvertTo-Json -Depth 6) -match 'Sensitive Counterparty'
Show "and the counterparty does not appear in the refusal" (-not $leaked) 'nothing leaked'

$ret = Invoke-Api GET "/retention/document/$($doc.id)" $outsider
Show "its retention schedule is refused" ($ret.code -eq 403) "HTTP $($ret.code)"

$an = Invoke-Api GET "/analytics/documents/$($doc.id)" $outsider
Show "its reading analytics are refused" ($an.code -eq 403) "HTTP $($an.code)"

Head "And it cannot be written to sideways"

# Filing a type is a write, and it also starts whatever workflow that type
# triggers. Clearing it deletes the values that belonged to it.
$retype = Invoke-Api PATCH "/documents/$($doc.id)/type" $outsider @{ documentTypeId = $null }
Show "filing it as a type is refused" ($retype.code -eq 403) "HTTP $($retype.code)"

$stillTyped = Get-SqlValue "SELECT count(*) FROM documents WHERE id = '$($doc.id)' AND ""documentTypeId"" IS NOT NULL;"
Show "so the type it was filed as survives" ($stillTyped -eq '1') 'still typed'

$stillValued = Get-SqlValue "SELECT count(*) FROM document_field_values WHERE ""documentId"" = '$($doc.id)';"
Show "and its index values survive" ($stillValued -ne '0') "$stillValued value(s)"

$setValue = Invoke-Api PATCH "/documents/$($doc.id)/fields/$field" $outsider @{ value = 'Rewritten' }
Show "recording a value against it is refused" ($setValue.code -eq 403) "HTTP $($setValue.code)"

$reindex = Invoke-Api POST "/processing/documents/$($doc.id)/reindex" $outsider
Show "queuing work on it is refused" ($reindex.code -eq 403) "HTTP $($reindex.code)"

Head "Listings show only what the caller can read"

# A second probe, filed as a Personnel file naming a real person, so the HR
# comparison below has something to hide. Without it both answers are empty and
# the assertion proves nothing.
$person = (Invoke-Api GET '/hr/people' $adminTok).body.items |
  Where-Object { $_.email -eq 'manager@acme.test' } | Select-Object -First 1
$pfType = Get-SqlValue @"
SELECT t.id FROM document_types t JOIN organizations o ON o.id = t."organizationId"
 WHERE o.slug = 'acme' AND t.name = 'Personnel file' LIMIT 1;
"@
$pfField = Get-SqlValue @"
SELECT id FROM document_type_fields WHERE "documentTypeId" = '$pfType' AND kind = 'USER' LIMIT 1;
"@
$hrDoc = New-ProbeDocument -Token $adminTok -Name 'object-access-personnel.txt' -FolderName 'Employee records'
Invoke-Api PATCH "/documents/$($hrDoc.id)/type" $adminTok @{ documentTypeId = $pfType } | Out-Null
Invoke-Api PATCH "/documents/$($hrDoc.id)/fields/$pfField" $adminTok @{ value = $person.id } | Out-Null

# These answer for everybody — the screens exist for everybody — but a row
# names a document, so a row the caller cannot open must not be in the answer.
$mine = Invoke-Api GET "/hr/people/$($person.id)" $outsider
Show "a personnel file opens for the outsider" ($mine.code -eq 200) "HTTP $($mine.code)"
Show "but names none of the records in it" (($mine.body.documents | Measure-Object).Count -eq 0) `
  "$(($mine.body.documents | Measure-Object).Count) documents"

# The differential: the same request, the same person, a different caller.
$asAdmin = Invoke-Api GET "/hr/people/$($person.id)" $adminTok
Show "while an administrator sees the record that names them" `
  (($asAdmin.body.documents | Measure-Object).Count -ge 1) `
  "$(($asAdmin.body.documents | Measure-Object).Count) documents"

$def = (Invoke-Api GET '/workflow/definitions' $adminTok).body.items[0]
if ($def) {
  $flight = Invoke-Api GET "/workflow/definitions/$($def.id)/in-flight" $outsider
  Show "in-flight work names no unreadable document" `
    ($flight.code -eq 200 -and ($flight.body.items | Measure-Object).Count -eq 0) `
    "$(($flight.body.items | Measure-Object).Count) rows"
}

$form = (Invoke-Api GET '/forms' $adminTok).body.items[0]
if ($form) {
  $subs = Invoke-Api GET "/forms/$($form.id)/submissions" $outsider
  Show "submitted answers are refused outright" ($subs.code -eq 403) "HTTP $($subs.code)"
}

Head "A deleted record does not become public"

# Deleting a record does not declassify it, and the queue that reads a file is
# not a way to learn its name. Both listed everything in the organisation.
$binDoc = New-ProbeDocument -Token $adminTok -Name 'object-access-bin.txt'
Invoke-Api DELETE "/documents/$($binDoc.id)" $adminTok | Out-Null

$binAdmin = Invoke-Api GET '/documents/recycle-bin' $adminTok
$inAdminBin = $binAdmin.body.items | Where-Object { $_.id -eq $binDoc.id }
Show "an administrator sees it in the bin" ([bool]$inAdminBin) "total $($binAdmin.body.total)"

$binOut = Invoke-Api GET '/documents/recycle-bin' $outsider
$inOutBin = $binOut.body.items | Where-Object { $_.id -eq $binDoc.id }
Show "the outsider does not" (-not $inOutBin) "total $($binOut.body.total)"

$qAdmin = Invoke-Api GET '/processing/queue' $adminTok
$qOut   = Invoke-Api GET '/processing/queue' $outsider
$inAdminQ = $qAdmin.body.items | Where-Object { $_.documentId -eq $binDoc.id }
$inOutQ   = $qOut.body.items   | Where-Object { $_.documentId -eq $binDoc.id }
Show "the pipeline names it for an administrator" ([bool]$inAdminQ) "$(($qAdmin.body.items | Measure-Object).Count) jobs"
Show "and not for the outsider" (-not $inOutQ) "$(($qOut.body.items | Measure-Object).Count) jobs"

# The counts printed beside the list have to agree with it, or the screen reads
# "5 pending" above one row and the scoping looks like a bug.
# counts is a map of status -> number, so the total is the sum of its values.
$shown = ($qOut.body.items | Measure-Object).Count
$claimed = 0
$qOut.body.counts.PSObject.Properties | ForEach-Object { $claimed += [int]$_.Value }
Show "and the counts beside the list agree with it" ($claimed -eq $shown) "$claimed counted, $shown shown"

Head "Cleanup"

$left  = Remove-ProbeDocument -DocumentId $doc.id
$left2 = Remove-ProbeDocument -DocumentId $hrDoc.id
$left3 = Remove-ProbeDocument -DocumentId $binDoc.id
Show "the probe documents are removed" ($left -eq '0' -and $left2 -eq '0' -and $left3 -eq '0') `
  'the suite leaves the corpus as it found it'

Summary
