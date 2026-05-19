#!/usr/bin/env pwsh
# 2026-05-18 — DL → SO code-side rename (Phase 1 of the three-phase refactor).
# Companion to supabase/migrations/0123_rename_dl_to_so.sql which renamed the
# DB column / sequence / index / function arg / 'SO-' audit text.
#
# Replacement strategy (longest tokens first, idempotent):
#   1. soRefs       → soRefs              (camelCase property / arg name)
#   2. so_refs      → so_refs             (snake_case column name in raw SQL)
#   3. "SO-" / 'SO-' / `SO-`              (string-prefix literal)
#   4. \bdl\b       → so                  (bare identifier: prop, destructure,
#                                          local var, sql-fragment column)
#
# Skipped paths (frozen / historical / generated):
#   supabase/migrations/0001-0122/*.sql, reference/, node_modules/, .git/,
#   dist/, CLAUDE.md historical §17 entries, .next/, .turbo/
# Skipped extensions: binary (.png/.pdf/.jpg/.zip/.ttf)

$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path "$PSScriptRoot/.."
Push-Location $repoRoot
try {
    $includeExts = @('*.ts','*.tsx','*.js','*.jsx','*.json','*.md','*.html','*.yml','*.yaml','*.sh','*.ps1')
    $skipDirs    = @('node_modules', '.git', 'dist', '.turbo', '.next',
                     'reference', '.claude', '.gstack',
                     'supabase/migrations')   # historical migrations frozen per §14 #6

    # File-finder: enumerate matching files, exclude skipped dirs.
    $files = Get-ChildItem -Recurse -File -Include $includeExts |
             Where-Object {
                 $p = $_.FullName.Replace('\','/')
                 $hit = $false
                 foreach ($d in $skipDirs) {
                     if ($p -match "/$d/") { $hit = $true; break }
                 }
                 -not $hit
             }

    "Scanning $($files.Count) files..."

    $editedCount = 0
    $totalReplaceCount = 0
    foreach ($f in $files) {
        $orig = [System.IO.File]::ReadAllText($f.FullName)
        $body = $orig

        # 1. camelCase compound (handles type fields, args, query keys).
        $body = $body -creplace '\bdlRefs\b','soRefs'
        # 2. snake_case compound (raw SQL strings, server payloads).
        $body = $body -creplace '\bdl_refs\b','so_refs'
        # 3. String-prefix literal — quoted "SO-...", 'SO-...', `SO-...`.
        $body = $body -creplace '"SO-','"SO-'
        $body = $body -creplace "'SO-","'SO-"
        $body = $body -creplace '`SO-','`SO-'
        # 4. Bare \bdl\b → so. Word-boundary excludes `soRefs`, `so_refs`,
        #    `dlSomething`, `Mddle`, `idle`, etc. PowerShell -creplace is
        #    case-sensitive — perfect for not touching `DL` or `Dl`.
        $body = $body -creplace '\bdl\b','so'

        if ($body -ne $orig) {
            # Preserve original line endings: ReadAllText preserves bytes, and
            # we only swapped identifier characters in-place, so CRLF stays.
            [System.IO.File]::WriteAllText($f.FullName, $body)
            $editedCount++
            $diff = ($orig.Length - $body.Length)
            $totalReplaceCount++
            "  edited: $($f.FullName.Substring($repoRoot.Path.Length + 1))"
        }
    }

    ""
    "SUMMARY"
    "  files edited: $editedCount / $($files.Count)"
}
finally {
    Pop-Location
}
