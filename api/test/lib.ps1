# Shared helpers for the verification suites.
#
# These live in the repository, not in a scratch directory. An earlier set was
# lost exactly that way: the harness that proves the product works is part of
# the product.
#
# Two Windows traps are handled here rather than in every suite:
#
#   psql quoting — `psql -tAc "SELECT ""camelCase"""` loses its double quotes
#   passing through the native-argument layer, so Postgres folds the identifier
#   to lower case and fails. Writing the statement to a file and using -f keeps
#   it intact.
#
#   Set-Content -Encoding utf8 writes a byte-order mark, which several parsers
#   reject on the first line. Files written here go through .NET with the BOM
#   switched off.

$script:PSQL = "C:\Program Files\PostgreSQL\18\bin\psql.exe"
$script:DB   = if ($env:DOSSIRO_DB) { $env:DOSSIRO_DB } else { 'dossiro' }
$script:API  = if ($env:DOSSIRO_API) { $env:DOSSIRO_API } else { 'http://localhost:4010/api' }
if (-not $env:PGPASSWORD) { $env:PGPASSWORD = 'postgres_dev' }

$script:pass = 0
$script:fail = 0

function Write-NoBom($Path, $Text) {
  [System.IO.File]::WriteAllText($Path, $Text, (New-Object System.Text.UTF8Encoding $false))
}

function Show($Label, $Ok, $Detail) {
  if ($Ok) { $script:pass++; $mark = '  [PASS]' } else { $script:fail++; $mark = '  [FAIL]' }
  Write-Output "$mark $Label"
  if ($Detail) { Write-Output "          $Detail" }
}

function Head($Text) {
  Write-Output ""
  Write-Output $Text
  Write-Output ('-' * $Text.Length)
}

function Banner($Text) {
  Write-Output "================================================================"
  Write-Output " $Text"
  Write-Output "================================================================"
}

function Summary {
  Write-Output ""
  Write-Output "================================================================"
  Write-Output " $($script:pass) passed, $($script:fail) failed"
  Write-Output "================================================================"
  if ($script:fail -gt 0) { exit 1 }
}

# -- SQL -------------------------------------------------------------------

<#  One scalar value. Empty string when the query returns nothing. #>
function Get-SqlValue {
  param([string]$Query)
  $f = Join-Path $env:TEMP ("dsq-" + [Guid]::NewGuid().ToString('N') + ".sql")
  Write-NoBom $f $Query
  $out = & $script:PSQL -U postgres -h localhost -d $script:DB -t -A -f $f 2>&1
  Remove-Item $f -Force -ErrorAction SilentlyContinue
  $val = $out | Where-Object { $_ -notmatch '^\s*$' -and $_ -notmatch 'ERROR|HINT|LINE' } | Select-Object -First 1
  if ($null -eq $val) { return '' }
  return $val.ToString().Trim()
}

function Invoke-Sql {
  param([string]$Query)
  $f = Join-Path $env:TEMP ("dsx-" + [Guid]::NewGuid().ToString('N') + ".sql")
  Write-NoBom $f $Query
  & $script:PSQL -U postgres -h localhost -d $script:DB -q -f $f 2>&1 | Out-Null
  Remove-Item $f -Force -ErrorAction SilentlyContinue
}

<#  Runs a statement that is EXPECTED to be refused, and reports whether it
    was. Used to prove database-level guarantees, where success is failure. #>
function Test-SqlRefused {
  param([string]$Query)
  $f = Join-Path $env:TEMP ("dsr-" + [Guid]::NewGuid().ToString('N') + ".sql")
  Write-NoBom $f $Query
  $out = & $script:PSQL -U postgres -h localhost -d $script:DB -v ON_ERROR_STOP=1 -f $f 2>&1
  $code = $LASTEXITCODE
  Remove-Item $f -Force -ErrorAction SilentlyContinue
  $line = $out | Where-Object { $_ -match 'ERROR' } | Select-Object -First 1
  return @{
    blocked = ($code -ne 0)
    message = if ($line) { ($line.ToString().Trim() -replace '^.*ERROR:\s*', '') } else { ($out | Out-String).Trim() }
  }
}

# -- HTTP ------------------------------------------------------------------

function Invoke-Api {
  param(
    [string]$Method = 'GET',
    [string]$Path,
    [string]$Token,
    $Body,
    [string]$UserAgent
  )
  $bodyFile = Join-Path $env:TEMP ("dsb-" + [Guid]::NewGuid().ToString('N') + ".json")
  $outFile  = Join-Path $env:TEMP ("dso-" + [Guid]::NewGuid().ToString('N') + ".txt")

  $args = @('-s', '-o', $outFile, '-w', '%{http_code}', '-X', $Method, "$script:API$Path")
  if ($Token)     { $args += @('-H', "Authorization: Bearer $Token") }
  if ($UserAgent) { $args += @('-H', "User-Agent: $UserAgent") }
  if ($null -ne $Body) {
    Write-NoBom $bodyFile ($Body | ConvertTo-Json -Compress -Depth 8)
    $args += @('-H', 'Content-Type: application/json', '-d', "@$bodyFile")
  }

  $code = & curl.exe @args
  $raw = if (Test-Path $outFile) { Get-Content $outFile -Raw } else { '' }
  Remove-Item $bodyFile, $outFile -Force -ErrorAction SilentlyContinue

  $parsed = $null
  if ($raw) { try { $parsed = $raw | ConvertFrom-Json } catch { $parsed = $raw } }
  return @{ code = [int]$code; body = $parsed }
}

function Get-Token {
  param([string]$Email, [string]$Password, [string]$OrganizationId)
  $b = @{ email = $Email; password = $Password }
  if ($OrganizationId) { $b.organizationId = $OrganizationId }
  return (Invoke-Api POST '/auth/login' $null $b).body
}

function Assert-ApiUp {
  $code = & curl.exe -s -o NUL -w '%{http_code}' --max-time 8 "$script:API/health"
  if ($code -ne '200') {
    Write-Output "The API is not answering on $script:API (HTTP $code)."
    Write-Output "Start it with:  npm run dev   (or node dist/main.js) in api/"
    exit 1
  }
}

<#
  A document belonging to the suite that asked for it.

  Several suites used to open with `GET /documents?take=1` and then file the
  corpus document they got back as a throwaway type. Filing a type replaces
  whatever type the document already carried and deletes the index values that
  belonged to it, so each run quietly destroyed a little of the seed. Nothing
  reported it, because the suite doing the damage asserts nothing about that
  document's history — the failure surfaced two suites later, as a count that
  had drifted.

  Upload your own, and remove it with Remove-ProbeDocument.
#>
function New-ProbeDocument {
  param(
    [Parameter(Mandatory)][string]$Token,
    [string]$Name = 'probe.txt',
    [string]$Text = 'A document belonging to this test suite.',
    [string]$FolderName = 'Contracts'
  )
  $folder = Get-SqlValue @"
SELECT f.id FROM folders f JOIN organizations o ON o.id = f."organizationId"
 WHERE o.slug = 'acme' AND f.name = '$FolderName' LIMIT 1;
"@
  $tmp = Join-Path $env:TEMP $Name
  Write-NoBom $tmp $Text
  $out = Join-Path $env:TEMP ("probe-" + [Guid]::NewGuid().ToString('N') + ".json")
  & curl.exe -s -o $out -X POST "$script:API/documents" `
    -H "Authorization: Bearer $Token" -F "file=@$tmp" -F "folderId=$folder" | Out-Null
  $doc = Get-Content $out -Raw | ConvertFrom-Json
  Remove-Item $tmp, $out -Force -ErrorAction SilentlyContinue
  return $doc
}

function Remove-ProbeDocument {
  param([Parameter(Mandatory)][string]$DocumentId)
  Invoke-Sql @"
DELETE FROM access_grants WHERE "documentId" = '$DocumentId';
DELETE FROM workflow_tasks WHERE "instanceId" IN (
  SELECT id FROM workflow_instances WHERE "documentId" = '$DocumentId');
DELETE FROM workflow_instances WHERE "documentId" = '$DocumentId';
DELETE FROM document_field_values WHERE "documentId" = '$DocumentId';
DELETE FROM document_index WHERE "documentId" = '$DocumentId';
DELETE FROM processing_jobs WHERE "documentId" = '$DocumentId';
DELETE FROM change_log WHERE "entityType" = 'document' AND "entityId" = '$DocumentId';
DELETE FROM document_versions WHERE "documentId" = '$DocumentId';
DELETE FROM documents WHERE id = '$DocumentId';
"@
  return (Get-SqlValue "SELECT count(*) FROM documents WHERE id = '$DocumentId';")
}
