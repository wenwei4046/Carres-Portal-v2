# 2990s Products parity — Phase 2: SKU-Master + Modular polish

> Part of the 9-tab parity initiative. **Web-only, no migration, no API/contract change**
> (reuses existing endpoints). Followed P1 (SKU Import/Export).

## Finding: Phase 2 was thinner than the roadmap assumed
Grounding both codebases showed most roadmap-P2 "gaps" are already-equivalent in Carres:
- **"Staged bulk price-edit"** — 2990s is actually commit-per-cell-on-blur, which Carres's
  inline Edit-Prices already does. Not a gap.
- **"Bulk activate/deactivate"** — doesn't exist in 2990s either; both drive `pos_active` from
  the Modular size cascade. Not a gap.
- **Force-delete** — N/A; Carres soft-deletes (`discontinued_at`), so no FK violations to force.

## Shipped (the 2 genuine gaps)
1. **"+ New Model" dialog in the Modular tab** (`NewModelModal.tsx`) — create a product model and
   (optionally) its whole size range in one go. The existing "+ New SKU → New product" path forces a
   first priced SKU; this stands up a model + N size SKUs (or a bare model). Reuses
   `useCreateCatalogModel` + `useGenerateSkus` (POST /models then POST /models/:id/generate-skus) —
   no new contract. Sizes seed `allowed_options.sizes`; default price principal-only (0175),
   non-principal generates UNPRICED. Shared `deriveModelKey` (not the divergent NewSkuModal copy).
2. **Model-filter dropdown in SKU Master** — filter SKUs by parent model, scoped to the active
   category, shown only when >1 model is in scope, resets synchronously on category change.

## Deferred (needs other phases)
- **generate-skus name/description templates** (2990s auto-composes "… (183X190X31CM)") — needs
  per-size dimension data Carres lacks → belongs with the Maintenance **size pools (P4)**.

## Review outcome (2-dimension adversarial workflow)
correctness+contract **clean & contract-safe** · ux+coverage **clean**. Fixed:
- **MEDIUM** partial-failure retry — if `createModel` succeeded but `generateSkus` 422'd (e.g. no
  supplier covers the category, or >100 sizes), a retry re-inserted the same `(category, model_key)`
  → opaque 23505/500. Now the created model id is remembered: a retry skips create + only re-runs
  generation; identity inputs lock with a "Model created" notice.
- **LOW** model-filter reset moved from a `useEffect` to a synchronous `pickCategory` handler
  (no stale-filter frame / controlled-select warning).
- **NIT** client mirrors the server caps (≤100 sizes, ≤60 chars) — caught before the model is created.
- Tests added: partial-failure retry (no second create), size-cap disable.

Pre-existing, not expanded here: `mapPgError` has no 23505→409 case (affects NewSkuModal too);
NewSkuModal still carries a divergent local `deriveModelKey` (the shared one exists now).

## Verification
web **761 pass / 5 known-fail (§17.7)** · typecheck + build clean · `SERVICE_ROLE` dist scan 0 ·
zero new regressions · no migration · no API change (api Worker unchanged — web-only deploy).
