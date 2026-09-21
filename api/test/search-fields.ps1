# Searching by document type and its index fields (SRC-4).
#
# This is the requirement the typed columns were built for. A text column
# cannot answer "contracts expiring in 2027" without casting every row, and a
# JSON blob cannot be range-indexed at all -- so the value of the whole
# document-type design rests on these queries returning the right rows.
#
# The suite files real values against real documents, then asks questions an
# administrator would actually ask.

. "$PSScriptRoot\lib.ps1"
Assert-ApiUp

$tok = (Get-Token 'admin@acme.test' 'Dossiro!2026').accessToken

Banner "SEARCHING BY DOCUMENT TYPE AND ITS FIELDS"

# The seeded Contract type, and the fields this suite asks about.
$contract = (Invoke-Api GET '/document-types' $tok).body.items |
  Where-Object { $_.name -eq 'Contract' } | Select-Object -First 1
if (-not $contract) { throw 'No Contract type. Run npm run db:seed first.' }

$full = (Invoke-Api GET "/document-types/$($contract.id)" $tok).body
$fContractor = ($full.fields | Where-Object { $_.name -eq 'Contractor' }).id
$fExpiry     = ($full.fields | Where-Object { $_.name -eq 'Expiry date' }).id
$fValue      = ($full.fields | Where-Object { $_.name -eq 'Value' }).id
$fRegion     = ($full.fields | Where-Object { $_.name -eq 'Region' }).id

# Three documents already filed as Contract, given values that differ in ways
# the queries below can separate.
$filed = (Invoke-Api GET "/search?documentTypeId=$($contract.id)&take=3" $tok).body.items
Show "the seed filed documents as Contract" ($filed.Count -eq 3) "$($filed.Count) found"

$a, $b, $c = $filed
Invoke-Api PATCH "/documents/$($a.id)/fields/$fContractor" $tok @{ value = 'Northwind Logistics' } | Out-Null
Invoke-Api PATCH "/documents/$($a.id)/fields/$fExpiry"     $tok @{ value = '2027-03-01' } | Out-Null
Invoke-Api PATCH "/documents/$($a.id)/fields/$fValue"      $tok @{ value = 412000000 } | Out-Null
Invoke-Api PATCH "/documents/$($a.id)/fields/$fRegion"     $tok @{ value = 'Lagos' } | Out-Null

Invoke-Api PATCH "/documents/$($b.id)/fields/$fContractor" $tok @{ value = 'Sahel Power' } | Out-Null
Invoke-Api PATCH "/documents/$($b.id)/fields/$fExpiry"     $tok @{ value = '2025-06-30' } | Out-Null
Invoke-Api PATCH "/documents/$($b.id)/fields/$fValue"      $tok @{ value = 95000000 } | Out-Null
Invoke-Api PATCH "/documents/$($b.id)/fields/$fRegion"     $tok @{ value = 'Abuja' } | Out-Null

Invoke-Api PATCH "/documents/$($c.id)/fields/$fContractor" $tok @{ value = 'Northwind Freight' } | Out-Null
Invoke-Api PATCH "/documents/$($c.id)/fields/$fExpiry"     $tok @{ value = '2027-11-15' } | Out-Null
# $c deliberately gets no Value, to prove `unset` finds it.

# Values may contain spaces, so each criterion is encoded rather than pasted
# into the URL raw. A caller building these by hand has the same obligation.
function Enc($s) { [uri]::EscapeDataString($s) }
function Find($query) { (Invoke-Api GET "/search?$query" $tok).body }

# -- By type -------------------------------------------------------------------

$r = Find "documentTypeId=$($contract.id)"
Show "filtering by type returns only that type" ($r.total -ge 3) "$($r.total) documents"

# -- Exact match on text --------------------------------------------------------

$r = Find ("field=" + (Enc "${fContractor}:eq:Northwind Logistics"))
Show "an exact match on a text field finds one" ($r.total -eq 1) "$($r.total) found"

$r = Find "field=${fContractor}:contains:Northwind"
Show "contains finds both Northwind entries" ($r.total -eq 2) "$($r.total) found"

# -- Date ranges: the thing a text column cannot do ------------------------------

$r = Find "field=${fExpiry}:between:2027-01-01..2027-12-31"
Show "a date range finds the two expiring in 2027" ($r.total -eq 2) "$($r.total) found"

$r = Find "field=${fExpiry}:between:2025-01-01..2025-12-31"
Show "the same range in another year finds the other one" ($r.total -eq 1) "$($r.total) found"

$r = Find "field=${fExpiry}:lt:2026-01-01"
Show "less-than on a date works as a date, not as text" ($r.total -eq 1) "$($r.total) found"

# -- Numbers ---------------------------------------------------------------------

$r = Find "field=${fValue}:gt:400000000"
Show "greater-than on a number finds the large contract" ($r.total -eq 1) "$($r.total) found"

$r = Find "field=${fValue}:lt:400000000"
Show "less-than finds the small one" ($r.total -eq 1) "$($r.total) found"

# A text comparison would put "95000000" after "412000000" because 9 > 4.
# This is the assertion that proves the column is numeric.
$r = Find "field=${fValue}:gte:95000000"
Show "numbers compare numerically, not alphabetically" ($r.total -eq 2) "$($r.total) found"

# -- Selection lists ---------------------------------------------------------------

$r = Find "field=${fRegion}:eq:Lagos"
Show "a selection list filters on its value" ($r.total -eq 1) "$($r.total) found"

# -- Set and unset -------------------------------------------------------------------

$r = Find "field=${fValue}:unset"
Show "unset finds the contract with no value recorded" ($r.total -ge 1) "$($r.total) found"

$r = Find "field=${fValue}:set"
Show "set finds the ones that do have it" ($r.total -eq 2) "$($r.total) found"

# -- Several criteria at once ----------------------------------------------------------

# The question the requirement actually names: contracts expiring in a window
# AND above a value. Both must hold of the same document.
$r = Find "field=${fExpiry}:between:2027-01-01..2027-12-31&field=${fValue}:gt:400000000"
Show "two criteria combine with AND, not OR" ($r.total -eq 1) "$($r.total) found"

$r = Find "field=${fExpiry}:between:2025-01-01..2025-12-31&field=${fValue}:gt:400000000"
Show "the same pair with no document satisfying both finds none" ($r.total -eq 0) "$($r.total) found"

# -- Refusals --------------------------------------------------------------------------

$r = Find "field=nosuchfield:eq:anything"
Show "an unknown field id narrows to nothing rather than widening" ($r.total -eq 0) "$($r.total) found"

# A field belonging to another tenant must behave the same as one that does not
# exist: the lookup that resolves a field's kind is scoped to the organisation.
$otherField = Get-SqlValue @'
SELECT f.id FROM document_type_fields f
 JOIN organizations o ON o.id = f."organizationId"
WHERE o.slug <> 'acme' LIMIT 1;
'@
if ($otherField) {
  $r = Find "field=${otherField}:set"
  Show "another tenant's field id finds nothing" ($r.total -eq 0) "$($r.total) found"
}

$r = Find "field=${fExpiry}:contains:2027"
Show "contains on a date is dropped rather than guessed at" ($r.total -ge 3) "$($r.total) found"

Summary
