# Carres POS prototype — canonical design spec

Source: Loo's Claude Design project **"Carres POS 系统设计"**
(https://claude.ai/design/p/3f16ac20-6f7c-4da7-ab65-618f31f4fa1f).

Same convention as 2990s: these files are the DESIGN CONTRACT for the POS —
reference them when building POS UI; don't refactor them. The production
implementation lives in `apps/web/src/styles/pos-prototype.css` (extracted
classes, scoped under `.pos-proto`) + the re-skinned `pages/dealer/pos/*`
components. Fonts (Outfit + Bodoni Moda) load from Google Fonts in
`apps/web/index.html`.

Files mirrored here (fetched 2026-07-04 via DesignSync):
- `index.html` — prototype entry (reference skeleton)
- `pos-styles.css` — the FULL prototype stylesheet (catalog sections were
  extracted into the app css)

Everything else (`pos-screens.jsx`, `pos-data.jsx`,
`assets/colors_and_type.css`, handover / configurator / order-status /
backend-*) lives in the Claude Design project — fetch on demand via the
DesignSync tool when implementing those screens.
