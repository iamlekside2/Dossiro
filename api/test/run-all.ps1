# Runs every verification suite and reports one total.
#
#   npm run verify
#
# The API must be running and the database seeded. The suites are written to be
# repeatable: each cleans up whatever it created, or reuses a fixed throwaway
# tenant where the audit trail refuses deletion.

$ErrorActionPreference = 'Continue'

$suites = @(
  'three-populations.ps1',
  'suspend-reason.ps1',
  'single-session.ps1',
  'share-status.ps1',
  'endpoints.ps1'
)

$totalPass = 0
$totalFail = 0
$failed = @()

foreach ($s in $suites) {
  $path = Join-Path $PSScriptRoot $s
  $output = & $path 2>&1
  $output | ForEach-Object { Write-Output $_ }

  $line = $output | Where-Object { $_ -match '^\s*(\d+) passed, (\d+) failed' } | Select-Object -Last 1
  if ($line -match '(\d+) passed, (\d+) failed') {
    $totalPass += [int]$Matches[1]
    $totalFail += [int]$Matches[2]
    if ([int]$Matches[2] -gt 0) { $failed += $s }
  } else {
    # A suite that did not reach its summary crashed; that is a failure even
    # though it reported no failing assertion.
    $totalFail += 1
    $failed += "$s (did not finish)"
  }
}

Write-Output ""
Write-Output "################################################################"
Write-Output " ALL SUITES: $totalPass passed, $totalFail failed"
if ($failed.Count) { Write-Output " failing: $($failed -join ', ')" }
Write-Output "################################################################"

if ($totalFail -gt 0) { exit 1 }
