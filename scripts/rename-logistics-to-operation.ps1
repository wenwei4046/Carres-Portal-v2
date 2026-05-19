# scripts/rename-logistics-to-operation.ps1
#
# One-shot bulk text replacement for the role rename "logistics" → "operation".
# Authorised in conversation 2026-05-17 by Loo. Mirrors the same replacement
# pipeline used inside migration 0121 so DB + code stay consistent.
#
# Scope:
#   - apps/, packages/, e2e/, scripts/ (.ts .tsx .js .jsx .json .md)
#   - supabase/seed.sql (single file)
# Excluded:
#   - node_modules/, dist/, build/, .turbo/, .next/, reference/, .git/
#   - supabase/migrations/ (historical migrations stay as-is per §14 #6)
#
# Replacement order matters — most-specific first, then word-boundary fallbacks.

$ErrorActionPreference = 'Stop'
$root = "C:\Users\User\carres-portal-v2"

$includeExts = @('.ts', '.tsx', '.js', '.jsx', '.json', '.md')

function ShouldProcess($relPath) {
  if ($relPath -match '(^|[\\/])(node_modules|dist|build|\.turbo|\.next|reference|\.git)([\\/]|$)') { return $false }
  if ($relPath -match '^supabase[\\/]migrations[\\/]') { return $false }
  if ($relPath -notmatch '^(apps|packages|e2e|scripts)[\\/]') { return $false }
  return $true
}

# Collect files
$files = Get-ChildItem -Path $root -Recurse -File -ErrorAction SilentlyContinue |
  Where-Object {
    $rel = $_.FullName.Substring($root.Length + 1)
    $extOk = $includeExts -contains $_.Extension
    $extOk -and (ShouldProcess $rel)
  }

# Plus the seed.sql
$seedSql = Join-Path $root 'supabase\seed.sql'
if (Test-Path $seedSql) {
  $files += Get-Item $seedSql
}

Write-Output "Scanning $($files.Count) files..."

$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
$modifiedCount = 0

foreach ($file in $files) {
  $orig = [System.IO.File]::ReadAllText($file.FullName)
  $new = $orig

  # === SPECIFIC COMPOUNDS (most-specific first) ===

  # Enum value literals (quoted and unquoted forms)
  $new = $new -replace 'awaiting_logistics_action', 'awaiting_operation_action'
  $new = $new -replace 'logistics_partner', 'operation_partner'

  # Column / DB type identifier
  $new = $new -replace '\blogistics_stage\b', 'operation_stage'

  # camelCase property/variable
  $new = $new -replace '\blogisticsStage\b', 'operationStage'

  # PascalCase types
  $new = $new -replace '\bLogisticsStageV3\b', 'OperationStageV3'
  $new = $new -replace '\bLogisticsStage\b', 'OperationStage'

  # Helper function name + middleware names
  $new = $new -replace '\bis_logistics\b', 'is_operation'
  $new = $new -replace '\brequireLogisticsOrPrincipal\b', 'requireOperationOrPrincipal'
  $new = $new -replace '\brequireLogistics\b', 'requireOperation'

  # Component / type names — must come before generic Pascal `Logistics` rule
  $new = $new -replace '\bLogisticsBadgesResponse\b', 'OperationBadgesResponse'
  $new = $new -replace '\blogisticsBadgesResponse\b', 'operationBadgesResponse'
  $new = $new -replace '\bLogisticsReceiveThreadsInput\b', 'OperationReceiveThreadsInput'
  $new = $new -replace '\blogisticsReceiveThreadsInput\b', 'operationReceiveThreadsInput'
  $new = $new -replace '\bListLogisticsOrdersQuery\b', 'ListOperationOrdersQuery'
  $new = $new -replace '\blistLogisticsOrdersQuery\b', 'listOperationOrdersQuery'
  $new = $new -replace '\bLogisticsApp\b', 'OperationApp'
  $new = $new -replace '\bLogisticsSidebar\b', 'OperationSidebar'
  $new = $new -replace '\bLogisticsDashboard\b', 'OperationDashboard'
  $new = $new -replace '\bLogisticsOrders\b', 'OperationOrders'
  $new = $new -replace '\bLogisticsWarehouse\b', 'OperationWarehouse'
  $new = $new -replace '\bLogisticsMovements\b', 'OperationMovements'
  $new = $new -replace '\bLogisticsKpiTile\b', 'OperationKpiTile'
  $new = $new -replace '\bLogisticsCatalog\b', 'OperationCatalog'

  # RPC call name strings: 'logistics_<x>' / "logistics_<x>" → 'operation_<x>'
  $new = $new -replace "'logistics_([a-z][a-z0-9_]*)'", "'operation_`$1'"
  $new = $new -replace '"logistics_([a-z][a-z0-9_]*)"', '"operation_$1"'
  $new = $new -replace "'_logistics_([a-z][a-z0-9_]*)'", "'_operation_`$1'"
  $new = $new -replace '"_logistics_([a-z][a-z0-9_]*)"', '"_operation_$1"'

  # URL paths
  $new = $new -replace '/api/logistics/', '/api/operation/'
  $new = $new -replace '"/api/logistics"', '"/api/operation"'
  $new = $new -replace "'/api/logistics'", "'/api/operation'"
  $new = $new -replace '"/logistics"', '"/operation"'
  $new = $new -replace "'/logistics'", "'/operation'"
  $new = $new -replace '/logistics/\*', '/operation/*'
  $new = $new -replace '"/logistics/', '"/operation/'
  $new = $new -replace "'/logistics/", "'/operation/"

  # Import paths
  $new = $new -replace 'pages/logistics/', 'pages/operation/'
  $new = $new -replace 'pages/logistics"', 'pages/operation"'
  $new = $new -replace 'pages/logistics''', 'pages/operation'''
  $new = $new -replace 'routes/logistics/', 'routes/operation/'

  # React Query key namespace
  $new = $new -replace '\bqk\.logistics\.', 'qk.operation.'

  # ["logistics", ... ] query keys
  $new = $new -replace '\["logistics"', '["operation"'
  $new = $new -replace "\['logistics'", "['operation'"

  # Email addresses
  $new = $new -replace 'logistics-test@x\.com', 'operation-test@x.com'
  $new = $new -replace 'logistics-test', 'operation-test'
  $new = $new -replace 'logistics@carres\.com', 'operation@carres.com'
  $new = $new -replace 'logistics@x\.com', 'operation@x.com'

  # Role literal (after all compound forms have been handled)
  $new = $new -replace "'logistics'", "'operation'"
  $new = $new -replace '"logistics"', '"operation"'

  # Lowercase 'logistics' in comments / JSDoc / unquoted contexts.
  # Word boundary means `own_logistics` is NOT matched (_ is a word char).
  # Skipped: any remaining 'logistics' inside SQL migration files, but we already
  # excluded supabase/migrations/.
  $new = $new -replace '\blogistics\b', 'operation'

  # PascalCase / Display text "Logistics" (standalone word) → "Operations" (plural)
  # All identifier-PascalCase instances were caught by the explicit rules above,
  # so what remains is display text in JSX / titles / sidebar labels.
  $new = $new -replace '\bLogistics\b', 'Operations'

  if ($new -ne $orig) {
    [System.IO.File]::WriteAllText($file.FullName, $new, $utf8NoBom)
    $rel = $file.FullName.Substring($root.Length + 1)
    Write-Output "modified: $rel"
    $modifiedCount++
  }
}

Write-Output ""
Write-Output "Done. $modifiedCount files modified out of $($files.Count) scanned."
