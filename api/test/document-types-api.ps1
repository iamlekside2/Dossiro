# The document-type endpoints, exercised as an administrator would.
#
# The schema suite (document-types.ps1) proves the database refuses a bad
# shape. This proves the API turns those refusals into answers an interface
# can show, and that the rules that are NOT in the schema -- publish needs a
# field, a type in use cannot be deleted, a field's kind cannot change under
# existing values -- are actually enforced.

. "$PSScriptRoot\lib.ps1"
Assert-ApiUp

$tok = (Get-Token 'admin@acme.test' 'Dossiro!2026').accessToken

Banner "DOCUMENT TYPES OVER THE API"

# Start clean: this suite is repeatable, and a type left behind would collide
# on the unique name.
$existing = (Invoke-Api GET '/document-types' $tok).body.items |
  Where-Object { $_.name -eq 'API check contract' }
foreach ($e in $existing) { Invoke-Api DELETE "/document-types/$($e.id)" $tok | Out-Null }

# -- Creating ---------------------------------------------------------------

$r = Invoke-Api POST '/document-types' $tok @{
  name = 'API check contract'; description = 'Throwaway, created by the test suite.'
  keepVersions = $true; watermarkAll = $true
}
$type = $r.body
Show "a type is created" ($r.code -eq 201 -or $r.code -eq 200) "HTTP $($r.code)"
Show "it starts as a draft" ($type.status -eq 'DRAFT') $type.status
Show "it carries no fields yet" ($type.fields.Count -eq 0) "$($type.fields.Count) fields"

$r = Invoke-Api POST '/document-types' $tok @{ name = 'API check contract' }
Show "a duplicate name is refused with a readable reason" `
  ($r.code -eq 409 -and $r.body.message -match 'already have a document type') $r.body.message

# -- Publishing needs a field ------------------------------------------------

$r = Invoke-Api PATCH "/document-types/$($type.id)/status" $tok @{ status = 'PUBLISHED' }
Show "publishing a type with no fields is refused" `
  ($r.code -eq 400 -and $r.body.message -match 'at least one field') $r.body.message

# -- Fields ------------------------------------------------------------------

$r = Invoke-Api POST "/document-types/$($type.id)/fields" $tok @{
  name = 'Contractor'; kind = 'TEXT'; required = $true
}
Show "a text field is added" ($r.code -eq 201 -or $r.code -eq 200) "HTTP $($r.code)"

$r = Invoke-Api POST "/document-types/$($type.id)/fields" $tok @{
  name = 'Expiry date'; kind = 'DATE'; isRetentionAnchor = $true
}
Show "a date field can drive the retention clock" ($r.code -eq 201 -or $r.code -eq 200) "HTTP $($r.code)"

$r = Invoke-Api POST "/document-types/$($type.id)/fields" $tok @{
  name = 'Second anchor'; kind = 'DATE'; isRetentionAnchor = $true
}
Show "a second retention anchor is refused with a readable reason" `
  ($r.code -eq 409 -and $r.body.message -match 'retention clock') $r.body.message

$r = Invoke-Api POST "/document-types/$($type.id)/fields" $tok @{
  name = 'Region'; kind = 'SELECT'
}
Show "a selection list with no options is refused" `
  ($r.code -eq 400 -and $r.body.message -match 'at least one option') $r.body.message

$r = Invoke-Api POST "/document-types/$($type.id)/fields" $tok @{
  name = 'Region'; kind = 'SELECT'; options = @('Lagos', 'Abuja')
}
Show "the same field with options is accepted" ($r.code -eq 201 -or $r.code -eq 200) "HTTP $($r.code)"

$r = Invoke-Api POST "/document-types/$($type.id)/fields" $tok @{
  name = 'Value'; kind = 'NUMBER'
}
$type = $r.body
Show "fields come back in display order" `
  ($type.fields[0].name -eq 'Contractor' -and $type.fields[-1].name -eq 'Value') `
  ($type.fields.name -join ' -> ')

# -- Publishing now works -----------------------------------------------------

$r = Invoke-Api PATCH "/document-types/$($type.id)/status" $tok @{ status = 'PUBLISHED' }
Show "a type with fields publishes" ($r.body.status -eq 'PUBLISHED') $r.body.status

# -- Filing a document as this type ------------------------------------------

# Its own document, not whichever one the corpus happens to return first.
# This suite files a throwaway type onto it and clears the type again, which
# would destroy the type and index values a corpus document already carried.
$docId = (New-ProbeDocument -Token $tok -Name 'dt-api-probe.txt').id
$r = Invoke-Api PATCH "/documents/$docId/type" $tok @{ documentTypeId = $type.id }
Show "a document can be filed as a type" ($r.code -eq 200) "HTTP $($r.code)"
Show "its fields come back empty but present" `
  ($r.body.items.Count -eq 4 -and $null -eq $r.body.items[0].value) "$($r.body.items.Count) fields"

$contractor = ($type.fields | Where-Object { $_.name -eq 'Contractor' }).id
$expiry     = ($type.fields | Where-Object { $_.name -eq 'Expiry date' }).id
$region     = ($type.fields | Where-Object { $_.name -eq 'Region' }).id
$value      = ($type.fields | Where-Object { $_.name -eq 'Value' }).id

Invoke-Api PATCH "/documents/$docId/fields/$contractor" $tok @{ value = 'Northwind Logistics' } | Out-Null
Invoke-Api PATCH "/documents/$docId/fields/$expiry" $tok @{ value = '2027-03-01' } | Out-Null
$r = Invoke-Api PATCH "/documents/$docId/fields/$value" $tok @{ value = 412000000 }
$filled = $r.body.items | Where-Object { $null -ne $_.value }
Show "values are recorded against the fields" ($filled.Count -eq 3) "$($filled.Count) filled"

$r = Invoke-Api PATCH "/documents/$docId/fields/$region" $tok @{ value = 'Kano' }
Show "a value outside a selection list is refused" `
  ($r.code -eq 400 -and $r.body.message -match 'not one of the options') $r.body.message

$r = Invoke-Api PATCH "/documents/$docId/fields/$region" $tok @{ value = 'Lagos' }
Show "one of its options is accepted" ($r.code -eq 200) "HTTP $($r.code)"

# -- Clearing ------------------------------------------------------------------

$r = Invoke-Api PATCH "/documents/$docId/fields/$region" $tok @{ value = $null }
$stillSet = $r.body.items | Where-Object { $_.fieldId -eq $region -and $null -ne $_.value }
Show "null clears a value rather than storing an empty one" ($stillSet.Count -eq 0) "cleared"

# -- What the schema cannot check ---------------------------------------------

$r = Invoke-Api PATCH "/document-types/$($type.id)/fields/$contractor" $tok @{ kind = 'NUMBER' }
Show "changing a field's kind under existing values is refused" `
  ($r.code -eq 409 -and $r.body.message -match 'already carry a value') $r.body.message

$r = Invoke-Api DELETE "/document-types/$($type.id)" $tok
Show "deleting a type that documents are filed as is refused" `
  ($r.code -eq 409 -and $r.body.message -match 'Archive it instead') $r.body.message

# -- Unfiling, then deleting ----------------------------------------------------

Invoke-Api PATCH "/documents/$docId/type" $tok @{ documentTypeId = $null } | Out-Null
$r = Invoke-Api GET "/documents/$docId/fields" $tok
Show "clearing the type removes the values that belonged to it" ($r.body.items.Count -eq 0) `
  "$($r.body.items.Count) fields"

$r = Invoke-Api DELETE "/document-types/$($type.id)" $tok
Show "an unused type deletes" ($r.code -eq 200) "HTTP $($r.code)"

Head "Cleanup"

$left = Remove-ProbeDocument -DocumentId $docId
Show "the probe document is removed" ($left -eq '0') 'the suite leaves the corpus as it found it'

Summary
