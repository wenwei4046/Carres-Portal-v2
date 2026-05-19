# scripts/rename-logistics-pass3.ps1
#
# Third pass: catch
#   - PascalCase identifiers starting with Logistics (useLogisticsDashboard etc)
#   - Specific policy names that have `_logistics_` in the middle (ost_logistics_read etc)
#
# These survived pass 1 + 2 because \b doesn't fire between `_` and `l`.

$ErrorActionPreference = 'Stop'
$root = "C:\Users\User\carres-portal-v2"

$includeExts = @('.ts', '.tsx', '.js', '.jsx', '.json', '.md')

function ShouldProcess($relPath) {
  if ($relPath -match '(^|[\\/])(node_modules|dist|build|\.turbo|\.next|reference|\.git)([\\/]|$)') { return $false }
  if ($relPath -match '^supabase[\\/]migrations[\\/]') { return $false }
  if ($relPath -notmatch '^(apps|packages|e2e|scripts)[\\/]') { return $false }
  return $true
}

# Explicit policy name renames (mid-identifier `_logistics_` doesn't have a \b)
$policyRenames = @{
  'ost_logistics_read'            = 'ost_operation_read'
  'ost_logistics_write'           = 'ost_operation_write'
  'po_lines_logistics_insert'     = 'po_lines_operation_insert'
  'po_lines_logistics_update'     = 'po_lines_operation_update'
  'po_logistics_insert'           = 'po_operation_insert'
  'po_receipts_logistics_insert'  = 'po_receipts_operation_insert'
  'stock_balances_write_logistics' = 'stock_balances_write_operation'
  'stock_movements_insert_logistics' = 'stock_movements_insert_operation'
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

  # PascalCase / camelCase identifier — Logistics followed by uppercase letter,
  # preceded by word-boundary OR another lowercase letter (useLogisticsDashboard).
  # The two patterns combined cover:
  #   - LogisticsApp     (boundary L)
  #   - useLogisticsDashboard (e→L, not a boundary)
  #   - SomeLogisticsThing (e→L, not a boundary)
  $new = $new -replace 'Logistics([A-Z][a-zA-Z0-9]*)', 'Operation$1'

  # Policy name renames
  foreach ($k in $policyRenames.Keys) {
    $new = $new -replace [regex]::Escape($k), $policyRenames[$k]
  }

  if ($new -ne $orig) {
    [System.IO.File]::WriteAllText($file.FullName, $new, $utf8NoBom)
    $rel = $file.FullName.Substring($root.Length + 1)
    Write-Output "modified: $rel"
    $modifiedCount++
  }
}

Write-Output ""
Write-Output "Pass 3 done. $modifiedCount files modified."
