# POS Sofa Configurator — 2990S parity + prototype-fidelity re-skin

**Branch:** `feat/pos-sofa-config-parity` (worktree `.claude/worktrees/pos-sofa-config`, off `main` @937b862)
**Requested by Loo 2026-07-05.** Scope = option 2: build the 4 circled functions AND re-skin the sofa configurator layout to match the prototype/screenshots.

## Design sources of truth
- `prototype/pos-sofa-config.jsx` (2074 lines) — Loo's CARRES design (Image #1). Has the QuickPick L/R flip.
- `C:/Users/User/2990s/apps/pos/src/pages/Configurator.tsx` (3429 lines) — original 2990S reference (Image #2). Has all 4 functions working.
- Current CARRES impl: `apps/web/src/pages/dealer/pos/SofaConfigurePage.tsx` (400) + `sofa-build/SofaBuildCanvas.tsx` (720).

## Gap analysis (4 circled functions)
| # | Function | Prototype | Current CARRES | Action |
|---|---|---|---|---|
| 1 | INSERT PWP CODE + Apply (toolbar) | no | CartDrawer only | wire existing PWP into configurator header |
| 2 | Live config name in header (`1A(LHF)+2A(RHF)·32"`) | yes | model name + generic sub only | build live label |
| 3 | Flip L/R button on quick-pick cards | **yes** (`sof-qp__flip`, `onFlip`) | **dropped** on build | restore |
| 4 | FABRIC "Optional — confirm later" + tiers CG/EZ | no | tiers exist in canvas; no confirm-later | add confirm-later + surface in quick pick |

## Phases (each independently shippable + typecheck-clean + tested)
- **P1 — Quick-Pick flip L/R button** (feature 3). Port `mirrorModules`/`canMirror` from 2990S to `packages/shared/src/sofa-pricing.ts` (CARRES has `mirrorCode` only). Add per-card flip state + L/R toggle to `SofaConfigurePage`; mirrored seed on load. Self-contained, visible. ← START HERE
- **P2 — Live config name in header** (feature 2). `buildComboLabel`-style subtitle reflecting selected combo + depth.
- **P3 — Fabric panel + "Confirm later"** (feature 4). Surface CG/EZ tiers in quick-pick; add "Confirm later — customer to confirm" that parks fabric as TBD.
- **P4 — PWP CODE in configurator toolbar** (feature 1). Reuse CartDrawer PWP queries/logic in the sofa header.
- **P5 — Layout fidelity pass**. Left config panel + centered to-scale PLAN VIEW + rich header to match prototype pixel-for-pixel.

## Guardrails
- Each phase: `pnpm --filter @carres/web typecheck` clean + unit tests + commit. No cross-phase scope creep.
- Do NOT touch schema/RLS/migrations (this is web-only). No new deps.
- Reference 2990S freely (read-only) but write CARRES-idiomatic code (Hono contract, @carres/shared).
