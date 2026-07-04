# Carres POS prototype — canonical design spec

Source: Loo's Claude Design project **"Carres POS 系统设计"**
(https://claude.ai/design/p/3f16ac20-6f7c-4da7-ab65-618f31f4fa1f).

Same convention as 2990s: these files are the DESIGN CONTRACT for the POS —
reference them when building POS UI; don't refactor them. The production
implementation lives in `apps/web/src/styles/pos-prototype.css` (extracted
classes, scoped under `.pos-proto`) + the re-skinned `pages/dealer/pos/*`
components. Fonts (Outfit + Bodoni Moda) load from Google Fonts in
`apps/web/index.html`.

Files mirrored here (fetched 2026-07-04/05 via DesignSync):
- `index.html` — prototype entry (reference skeleton)
- `pos-styles.css` — the FULL prototype stylesheet (catalog + handover +
  configurator + sofa-flow + order-status sections extracted into the app css)
- `pos-handover.jsx` — 02 Customer / 03 Confirm / confirmation contract
- `pos-configurator.jsx` — full-page configurator screen (mattress / bed
  frame plan views + cfg-* header/controls; the sofa tab mounts SofaCustomFlow)
- `pos-sofa-config.jsx` — the custom-sofa flow (depth picker → Quick Pick /
  Customize palette + room canvas)
- `pos-order-status.jsx` — Order Status (PIN gate + 3-lane board + detail)

Everything else (`pos-screens.jsx`, `pos-data.jsx`,
`assets/colors_and_type.css`, backend-*) lives in the Claude Design project —
fetch on demand via the DesignSync tool when implementing those screens.
