# User-defined document types with typed index fields — requirements TYP-1..7.
#
# Everything checked here is enforced by the database rather than by service
# code, so these are SQL statements that must be refused. That matters: the
# fields are the backbone the search filters, retention clocks and workflow
# triggers all key off, and a type whose shape can be corrupted by a bad
# insert is a backbone that does not hold.
#
# The empty-selection-list case is the reason this file exists. The original
# constraint used `array_length(options, 1) >= 1`, which returns NULL for an
# empty array — and a CHECK passes on NULL. It applied cleanly and refused
# nothing. Only asking it to refuse something found it.

. "$PSScriptRoot\lib.ps1"

# The tenant holding the most documents, rather than the first tenant found.
# Earlier suites leave throwaway organisations behind — the audit trail refuses
# deletion, so they cannot be cleaned up — and an unordered LIMIT 1 picked one
# of those when this ran inside the full harness, though not when it ran alone.
$org = Get-SqlValue @'
SELECT "organizationId" FROM documents
GROUP BY "organizationId" ORDER BY count(*) DESC LIMIT 1;
'@
$doc = Get-SqlValue "SELECT id FROM documents WHERE ""organizationId"" = '$org' ORDER BY ""createdAt"" LIMIT 1;"

if (-not $org) { throw 'No organisation holds any documents. Run npm run db:seed first.' }
if (-not $doc) { throw 'No document found. Run npm run db:seed first.' }

$T = 'tchk_type'

# A throwaway type, rebuilt each run. Cascades clear the fields and values.
Invoke-Sql @"
DELETE FROM document_types WHERE id = '$T';
INSERT INTO document_types (id, "organizationId", name, status, "updatedAt")
VALUES ('$T', '$org', '__type constraint check__', 'DRAFT', now());
"@

Banner "DOCUMENT TYPES: THE SHAPE IS ENFORCED BY THE DATABASE"

# -- Field kinds ------------------------------------------------------------

$r = Test-SqlRefused @"
INSERT INTO document_type_fields (id, "organizationId", "documentTypeId", name, kind, "updatedAt")
VALUES ('tchk_bad_sel', '$org', '$T', 'Bad select', 'SELECT', now());
"@
Show "a selection list with no options is refused" $r.blocked $r.message

$r = Test-SqlRefused @"
INSERT INTO document_type_fields (id, "organizationId", "documentTypeId", name, kind, options, "updatedAt")
VALUES ('tchk_bad_text', '$org', '$T', 'Bad text', 'TEXT', ARRAY['a'], now());
"@
Show "a non-selection field carrying options is refused" $r.blocked $r.message

Invoke-Sql @"
INSERT INTO document_type_fields
  (id, "organizationId", "documentTypeId", name, kind, options, "isRetentionAnchor", "updatedAt")
VALUES
  ('tchk_sel', '$org', '$T', 'Region', 'SELECT', ARRAY['Lagos','Abuja'], false, now()),
  ('tchk_exp', '$org', '$T', 'Expiry', 'DATE', ARRAY[]::text[], true, now()),
  ('tchk_val', '$org', '$T', 'Value',  'NUMBER', ARRAY[]::text[], false, now());
"@
$n = Get-SqlValue "SELECT count(*) FROM document_type_fields WHERE ""documentTypeId"" = '$T';"
Show "well-formed fields of every kind are accepted" ($n -eq '3') "$n fields"

# -- One retention anchor per type -------------------------------------------

$r = Test-SqlRefused @"
INSERT INTO document_type_fields (id, "organizationId", "documentTypeId", name, kind, "isRetentionAnchor", "updatedAt")
VALUES ('tchk_exp2', '$org', '$T', 'Second anchor', 'DATE', true, now());
"@
Show "a second retention anchor on one type is refused" $r.blocked $r.message

$r = Test-SqlRefused @"
INSERT INTO document_type_fields (id, "organizationId", "documentTypeId", name, kind, "updatedAt")
VALUES ('tchk_dup', '$org', '$T', 'Expiry', 'DATE', now());
"@
Show "a duplicate field name within a type is refused" $r.blocked $r.message

# -- Values ------------------------------------------------------------------

$r = Test-SqlRefused @"
INSERT INTO document_field_values ("organizationId", "documentId", "fieldId", "valueText", "valueDate", "updatedAt")
VALUES ('$org', '$doc', 'tchk_exp', 'x', now(), now());
"@
Show "a value carrying two typed columns is refused" $r.blocked $r.message

$r = Test-SqlRefused @"
INSERT INTO document_field_values ("organizationId", "documentId", "fieldId", "updatedAt")
VALUES ('$org', '$doc', 'tchk_exp', now());
"@
Show "a value carrying no typed column is refused" $r.blocked $r.message

Invoke-Sql @"
INSERT INTO document_field_values ("organizationId", "documentId", "fieldId", "valueDate", "updatedAt")
VALUES ('$org', '$doc', 'tchk_exp', '2027-03-01', now());
INSERT INTO document_field_values ("organizationId", "documentId", "fieldId", "valueNumber", "updatedAt")
VALUES ('$org', '$doc', 'tchk_val', 412000000.00, now());
"@
$n = Get-SqlValue "SELECT count(*) FROM document_field_values WHERE ""documentId"" = '$doc' AND ""fieldId"" LIKE 'tchk_%';"
Show "one typed value per field is accepted" ($n -eq '2') "$n values"

# -- The point of the typed columns: searching fields AS fields --------------

$n = Get-SqlValue @"
SELECT count(*) FROM document_field_values
WHERE "fieldId" = 'tchk_exp' AND "valueDate" BETWEEN '2027-01-01' AND '2027-12-31';
"@
Show "a date field answers a range query" ($n -eq '1') "$n in range"

$n = Get-SqlValue @"
SELECT count(*) FROM document_field_values
WHERE "fieldId" = 'tchk_exp' AND "valueDate" BETWEEN '2025-01-01' AND '2025-12-31';
"@
Show "the same query excludes what falls outside it" ($n -eq '0') "$n in range"

$n = Get-SqlValue @"
SELECT count(*) FROM document_field_values
WHERE "fieldId" = 'tchk_val' AND "valueNumber" > 400000000;
"@
Show "a number field answers a greater-than query" ($n -eq '1') "$n above"

# -- Tenancy -----------------------------------------------------------------

$other = Get-SqlValue "SELECT id FROM organizations WHERE id <> '$org' AND ""isPlatform"" = false LIMIT 1;"
if ($other) {
  $n = Get-SqlValue @"
SELECT count(*) FROM document_field_values WHERE "organizationId" = '$other' AND "fieldId" LIKE 'tchk_%';
"@
  Show "another tenant sees none of these values" ($n -eq '0') "$n visible"
}

# -- Deleting a type takes its fields and values with it ---------------------

Invoke-Sql "DELETE FROM document_types WHERE id = '$T';"
$n = Get-SqlValue "SELECT count(*) FROM document_type_fields WHERE ""documentTypeId"" = '$T';"
Show "deleting a type removes its fields" ($n -eq '0') "$n left"

$n = Get-SqlValue "SELECT count(*) FROM document_field_values WHERE ""fieldId"" LIKE 'tchk_%';"
Show "deleting a type removes the values recorded against it" ($n -eq '0') "$n left"

Summary
