# scripts/fix-type-name-case.ps1
#
# Fix-up pass: the case-insensitive default of PowerShell's -replace in earlier
# passes collapsed the PascalCase TYPE `LogisticsStage` into the camelCase
# `operationStage`. TypeScript is happy with lowercase type names but it breaks
# convention (all other types in this repo are Pascal). Restore the type name.
#
# Field names like `operationStage:` (camelCase property) stay correct.

$ErrorActionPreference = 'Stop'
$root = "C:\Users\User\carres-portal-v2"

$includeExts = @('.ts', '.tsx')

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

  # Type-context patterns. Use -creplace (case-sensitive) so the camelCase field
  # name `operationStage` (when used as a property key or value identifier)
  # stays untouched.
  $new = $new -creplace 'export type operationStage\b',   'export type OperationStage'
  $new = $new -creplace 'import type \{ operationStage', 'import type { OperationStage'
  $new = $new -creplace ', operationStage \}',            ', OperationStage }'
  $new = $new -creplace ', operationStage,',              ', OperationStage,'
  $new = $new -creplace '\{ type operationStage',         '{ type OperationStage'
  $new = $new -creplace ' type operationStage,',          ' type OperationStage,'
  $new = $new -creplace ': operationStage\b',             ': OperationStage'
  $new = $new -creplace '<operationStage\b',              '<OperationStage'
  $new = $new -creplace 'as operationStage\b',            'as OperationStage'
  $new = $new -creplace '\bRecord<operationStage,',       'Record<OperationStage,'
  $new = $new -creplace '\| operationStage\b',            '| OperationStage'
  $new = $new -creplace 'toBe<operationStage>',           'toBe<OperationStage>'
  $new = $new -creplace 'Map<operationStage,',            'Map<OperationStage,'

  # -cne (case-sensitive not-equal) — earlier passes used the default
  # case-insensitive -ne which missed Pascal-vs-camel-only changes.
  if ($new -cne $orig) {
    [System.IO.File]::WriteAllText($file.FullName, $new, $utf8NoBom)
    $rel = $file.FullName.Substring($root.Length + 1)
    Write-Output "modified: $rel"
    $modifiedCount++
  }
}

Write-Output "Done. $modifiedCount files modified."
