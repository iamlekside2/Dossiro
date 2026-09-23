# Restricting who may file a record as a given document type.
#
# The rule is narrow on purpose: it governs FILING, not reading. Who may open a
# record is decided by the folder it sits in and its classification, and a
# second quieter way to grant access would be worse than no feature at all.
#
# The default matters as much as the rule. No rows means "anybody who can add a
# document", not "nobody" — the opposite reading would have locked every type
# in every tenant the moment this shipped.

. "$PSScriptRoot\lib.ps1"
Assert-ApiUp

Banner "WHO MAY FILE A RECORD AS THIS TYPE"

$admin = (Get-Token 'admin@acme.test' 'Dossiro!2026').accessToken
$clerk = (Get-Token 'clerk@acme.test' 'Dossiro!2026').accessToken

$type = (Invoke-Api GET '/document-types' $admin).body.items[0]
Show "a type to restrict" ([bool]$type.id) "$($type.name)"

$doc = (Invoke-Api GET '/documents?take=1' $clerk).body.items[0]
Show "a document the clerk can write to" ([bool]$doc.id) "$($doc.name)"

try {
  Head "Unrestricted by default"

  $before = (Invoke-Api GET "/document-types/$($type.id)/roles" $admin).body
  Show "no restriction to begin with" ($before.restricted -eq $false) "restricted=$($before.restricted)"
  Show "every role is offered as a choice" ($before.roles.Count -ge 2) "$($before.roles.Count) roles"

  $filed = Invoke-Api PATCH "/documents/$($doc.id)/type" $clerk @{ documentTypeId = $type.id }
  Show "anyone who may write can file it" ($filed.code -eq 200) "HTTP $($filed.code)"

  Head "Restricted to one role"

  $orgAdmin = $before.roles | Where-Object { $_.name -eq 'Organisation Administrator' } | Select-Object -First 1
  $set = Invoke-Api PATCH "/document-types/$($type.id)/roles" $admin @{ roleIds = @($orgAdmin.id) }
  Show "the restriction is recorded" ($set.body.restricted -eq $true) "restricted=$($set.body.restricted)"

  $refused = Invoke-Api PATCH "/documents/$($doc.id)/type" $clerk @{ documentTypeId = $type.id }
  Show "somebody without the role is refused" ($refused.code -eq 403) "HTTP $($refused.code)"
  Show "and told why, by name" ($refused.body.message -match [regex]::Escape($type.name)) "$($refused.body.message)"

  $allowed = Invoke-Api PATCH "/documents/$($doc.id)/type" $admin @{ documentTypeId = $type.id }
  Show "somebody holding it is not" ($allowed.code -eq 200) "HTTP $($allowed.code)"

  Head "Filing is not reading"

  # The clerk could not file as this type a moment ago. That must not have
  # changed what they are able to open.
  $stillReads = Invoke-Api GET "/documents/$($doc.id)" $clerk
  Show "the refusal did not take away read access" ($stillReads.code -eq 200) "HTTP $($stillReads.code)"

  Head "Clearing it means anyone, not no one"

  $cleared = Invoke-Api PATCH "/document-types/$($type.id)/roles" $admin @{ roleIds = @() }
  Show "an empty list removes the restriction" ($cleared.body.restricted -eq $false) "restricted=$($cleared.body.restricted)"

  $again = Invoke-Api PATCH "/documents/$($doc.id)/type" $clerk @{ documentTypeId = $type.id }
  Show "the clerk can file again" ($again.code -eq 200) "HTTP $($again.code)"

  Head "A role from another tenant is refused"

  $foreign = Invoke-Api PATCH "/document-types/$($type.id)/roles" $admin @{ roleIds = @('cmxxxxxxxxxxxxxxxxxxxxxx') }
  Show "an unknown role is rejected" ($foreign.code -eq 400) "HTTP $($foreign.code)"
}
finally {
  # Leave the tenant as it was found: no restriction, document untyped.
  Invoke-Api PATCH "/document-types/$($type.id)/roles" $admin @{ roleIds = @() } | Out-Null
  Invoke-Api PATCH "/documents/$($doc.id)/type" $admin @{ documentTypeId = $null } | Out-Null
}

Summary
