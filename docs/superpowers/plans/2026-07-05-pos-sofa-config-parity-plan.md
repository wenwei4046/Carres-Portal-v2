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
- **P1 — Quick-Pick flip L/R button** (feature 3). ✅ DONE `a70ddb6` — `mirrorModules`/`canMirror` in shared + L/R toggle on active card + mirrored seed. shared +6, web +5.
- **P2 — Live config name in header** (feature 2). ✅ DONE `cbd2ca7` — header title shows the flip-aware combo codes; product name → eyebrow. web +2.
- **P3 — Fabric panel + "Confirm later"** (feature 4). ✅ DONE `a791bf6` — "Confirm later — customer to confirm" fabric option; attrs.fabric_deferred + label. web +2.
- **P4 — PWP CODE in configurator toolbar** (feature 1). ✅ DONE `cce0185` — validate-only header box (Loo option 1); usePwpAvailableForPhone check + applied/error + attrs.pwp_pending_code hint. web +4.
- **P5 — Layout fidelity pass**. ⏳ TODO — the big visual rebuild: quick-pick mode gets a centered to-scale PLAN VIEW + a left config panel (leg / fabric / remark) + a rich top bar (size toggle · LIVE TOTAL · Cancel · Add to Cart), matching the prototype/2990S. Best done as a focused session.

## Status (2026-07-05)
All 4 circled FUNCTIONS complete + committed on this branch. Verification: typecheck shared+api+web clean · shared 610/610 · web 985 pass (+13 new), the 5 fails are pre-existing §17.7 (OhanaSofaTab ×4 + NiceFuture ×1), zero new regressions. Not yet deployed. P5 (layout) remaining.

## Guardrails
- Each phase: `pnpm --filter @carres/web typecheck` clean + unit tests + commit. No cross-phase scope creep.
- Do NOT touch schema/RLS/migrations (this is web-only). No new deps.
- Reference 2990S freely (read-only) but write CARRES-idiomatic code (Hono contract, @carres/shared).
