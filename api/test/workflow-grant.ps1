# A workflow task carries access to what it is about, and only while it is open
# (WFL-4).
#
# An approver who cannot open the record has two bad options: approve it unread,
# or be given a standing grant nobody remembers to remove. The step's own `grant`
# is meant to close that, and it was being written onto the task row and then
# consulted by nothing. The approval queue showed the contract and the record
# behind it answered 403.
#
# The grant is resolved from the open task rather than written as a grant row and
# deleted afterwards. That is the part worth protecting here: a row would need
# cleaning up on approval, rejection, escalation, reassignment and cancellation,
# and the one path that forgot would leave somebody holding a contract for good.
# Computed this way it cannot outlive the task, because it is the task.

. "$PSScriptRoot\lib.ps1"
Assert-ApiUp

Banner "AN APPROVAL CARRIES ITS OWN ACCESS"

$adminTok = (Get-Token 'admin@acme.test' 'Dossiro!2026').accessToken
$mgrTok   = (Get-Token 'manager@acme.test' 'Dossiro!2026').accessToken

$folder = Get-SqlValue @"
SELECT f.id FROM folders f JOIN organizations o ON o.id = f."organizationId"
 WHERE o.slug = 'acme' AND f.name = 'Contracts' LIMIT 1;
"@
$type = Get-SqlValue @"
SELECT t.id FROM document_types t JOIN organizations o ON o.id = t."organizationId"
 WHERE o.slug = 'acme' AND t.name ILIKE '%contract%' LIMIT 1;
"@

function New-Probe {
  param([string]$Name)
  $tmp = Join-Path $env:TEMP $Name
  Write-NoBom $tmp 'Master services agreement. Term 24 months.'
  $out = Join-Path $env:TEMP ("wg-" + [Guid]::NewGuid().ToString('N') + ".json")
  & curl.exe -s -o $out -X POST "$script:API/documents" `
    -H "Authorization: Bearer $adminTok" -F "file=@$tmp" -F "folderId=$folder" | Out-Null
  $doc = (Get-Content $out -Raw | ConvertFrom-Json)
  Remove-Item $tmp, $out -Force -ErrorAction SilentlyContinue
  return $doc
}

Head "Before the task exists, the record is out of reach"

$doc = New-Probe 'wf-grant-probe.txt'
Show "a contract is filed" ([bool]$doc.id) $doc.name

$before = Invoke-Api GET "/documents/$($doc.id)" $mgrTok
Show "the manager cannot open it" ($before.code -eq 403) "HTTP $($before.code)"

Head "Typing it starts the workflow, which raises the task"

$typed = Invoke-Api PATCH "/documents/$($doc.id)/type" $adminTok @{ documentTypeId = $type }
Show "the document is filed as a contract" ($typed.code -eq 200) "HTTP $($typed.code)"

$queue = (Invoke-Api GET '/workflow/tasks?queue=waiting' $mgrTok).body
$task = $queue.items | Where-Object { $_.documentId -eq $doc.id } | Select-Object -First 1
Show "it reaches the manager's queue" ([bool]$task) "$($task.stepName)"
Show "and the task names the access it carries" ($task.grantedLevel -eq 'READ') "$($task.grantedLevel)"

Head "Now the record opens, and no more than the record"

$open = Invoke-Api GET "/documents/$($doc.id)" $mgrTok
Show "the manager can open what they must decide on" ($open.code -eq 200) "HTTP $($open.code)"

$view = Invoke-Api GET "/documents/$($doc.id)/view" $mgrTok
Show "and read it" ($view.code -eq 200) "$($view.body.wordCount) words"

# READ, not DOWNLOAD. A grant that handed over the bytes would be a larger
# permission than the step asked for.
$bytes = Invoke-Api GET "/documents/$($doc.id)/content" $mgrTok
Show "but not take a copy of it" ($bytes.code -eq 403) "HTTP $($bytes.code)"

# The grant is attached to the document, never to its folder. An approver who
# could list the folder would see every other contract sitting in it.
$siblings = (Invoke-Api GET "/documents?folderId=$folder" $mgrTok).body
Show "the folder around it stays closed" ($siblings.total -eq 0) "$($siblings.total) visible"

Head "Deciding it takes the access back"

$decide = Invoke-Api POST "/workflow/tasks/$($task.id)/decide" $mgrTok @{ approve = $true }
Show "the manager approves" ($decide.code -eq 200 -or $decide.code -eq 201) "HTTP $($decide.code)"

$after = Invoke-Api GET "/documents/$($doc.id)" $mgrTok
Show "the record closes behind them" ($after.code -eq 403) "HTTP $($after.code)"

$afterView = Invoke-Api GET "/documents/$($doc.id)/view" $mgrTok
Show "including the reading endpoint" ($afterView.code -eq 403) "HTTP $($afterView.code)"

Head "The workflow moved on"

$next = (Invoke-Api GET '/workflow/tasks?queue=waiting' $adminTok).body
$second = $next.items | Where-Object { $_.documentId -eq $doc.id } | Select-Object -First 1
Show "the countersignature is now waiting" ([bool]$second) "$($second.stepName)"

Head "A deny still means no"

# The grant fills silence. It does not overrule somebody who was named and
# refused — the answer to "they are denied but must approve it" is to assign the
# step to somebody else, not to let the assignment undo the refusal.
$doc2 = New-Probe 'wf-grant-probe-2.txt'
Invoke-Api PATCH "/documents/$($doc2.id)/type" $adminTok @{ documentTypeId = $type } | Out-Null

$mgrId = Get-SqlValue "SELECT id FROM users WHERE email = 'manager@acme.test';"
Invoke-Sql @"
INSERT INTO access_grants (id, "resourceType", "documentId", "subjectType", "userId", level, "isDeny")
VALUES ('wf-grant-deny', 'DOCUMENT', '$($doc2.id)', 'USER', '$mgrId', 'READ', true);
"@
$denyRow = Get-SqlValue "SELECT count(*) FROM access_grants WHERE id = 'wf-grant-deny';"
Show "the deny is on the record" ($denyRow -eq '1') "$denyRow grant"

$q2 = (Invoke-Api GET '/workflow/tasks?queue=waiting' $mgrTok).body
$task2 = $q2.items | Where-Object { $_.documentId -eq $doc2.id } | Select-Object -First 1
Show "the task is still raised against them" ([bool]$task2) "$($task2.stepName)"

$denied = Invoke-Api GET "/documents/$($doc2.id)" $mgrTok
Show "but an open task does not get past an explicit deny" ($denied.code -eq 403) "HTTP $($denied.code)"

Head "Cleanup"

Invoke-Sql @"
DELETE FROM access_grants WHERE id = 'wf-grant-deny';
DELETE FROM workflow_tasks WHERE "instanceId" IN (
  SELECT id FROM workflow_instances WHERE "documentId" IN ('$($doc.id)', '$($doc2.id)'));
DELETE FROM workflow_instances WHERE "documentId" IN ('$($doc.id)', '$($doc2.id)');
DELETE FROM document_field_values WHERE "documentId" IN ('$($doc.id)', '$($doc2.id)');
DELETE FROM document_index WHERE "documentId" IN ('$($doc.id)', '$($doc2.id)');
DELETE FROM processing_jobs WHERE "documentId" IN ('$($doc.id)', '$($doc2.id)');
DELETE FROM change_log WHERE "entityType" = 'document' AND "entityId" IN ('$($doc.id)', '$($doc2.id)');
DELETE FROM document_versions WHERE "documentId" IN ('$($doc.id)', '$($doc2.id)');
DELETE FROM documents WHERE id IN ('$($doc.id)', '$($doc2.id)');
"@
$left = Get-SqlValue "SELECT count(*) FROM documents WHERE id IN ('$($doc.id)', '$($doc2.id)');"
Show "the probe documents are removed" ($left -eq '0') 'the suite leaves the corpus as it found it'

Summary
