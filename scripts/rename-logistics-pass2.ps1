# scripts/rename-logistics-pass2.ps1
#
# Second pass: catch camelCase identifiers (logisticsBadgesRouter →
# operationBadgesRouter) + unquoted snake_case in comments/JSDoc
# (logistics_calc_shortages → operation_calc_shortages).
#
# First pass missed these because it only handled quoted string literals and
# the specific PascalCase identifier list. Word-boundary regex preserves
# historical migration filename references like `0045_logistics_rpcs_chunk1.sql`
# (no \b between `_` and `l`).

$ErrorActionPreference = 'Stop'
$root = "C:\Users\User\carres-portal-v2"

$includeExts = @('.ts', '.tsx', '.js', '.jsx', '.json', '.md')

function ShouldProcess($relPath) {
  if ($relPath -match '(^|[\\/])(node_modules|dist|build|\.turbo|\.next|reference|\.git)([\\/]|$)') { return $false }
  if ($relPath -match '^supabase[\\/]migrations[\\/]') { return $false }
  if ($relPath -notmatch '^(apps|packages|e2e|scripts)[\\/]') { return $false }
  return $true
}

$files = Get-ChildItem -Path $root -Recurse -File -ErrorAction SilentlyContinue |
  Where-Object {
    $rel = $_.FullName.Substring($root.Length + 1)
    $extOk = $includeExts -contains $_.Extension
    $extOk -and (ShouldProcess $rel)
  }

$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
$modifiedCount = 0

foreach ($file in $files) {
  $orig = [System.IO.File]::ReadAllText($file.FullName)
  $new = $orig

  # Unquoted snake_case in comments / JSDoc: logistics_calc_shortages → operation_calc_shortages
  # \b ensures `0045_logistics_rpcs` is not matched (no boundary between `_` and `l`).
  $new = $new -replace '\b_logistics_([a-z][a-zA-Z0-9_]*)', '_operation_$1'
  $new = $new -replace '\blogistics_([a-z][a-zA-Z0-9_]*)', 'operation_$1'

  # camelCase identifiers: logisticsBadgesRouter → operationBadgesRouter
  $new = $new -replace '\blogistics([A-Z][a-zA-Z0-9]*)', 'operation$1'

  if ($new -ne $orig) {
    [System.IO.File]::WriteAllText($file.FullName, $new, $utf8NoBom)
    $rel = $file.FullName.Substring($root.Length + 1)
    Write-Output "modified: $rel"
    $modifiedCount++
  }
}

Write-Output ""
Write-Output "Pass 2 done. $modifiedCount files modified."
