STATUS: QUEUED
DATE: 2026-08-19
PR: pending
IMPLEMENTATION: APPROVED — the owner asked for a category filter on On hand
2026-08-19 ("it should show category too"); the planner scoped it under the
ERP architecture's ONE-category law. Build straight to production.

# ON HAND — THE CATEGORY FILTER (one small card)

**SCOPE — the On hand page's left filter rail gains a `Category` group, and
the inventory API learns each unit's catalog category. NOTHING ELSE.**

Read `CLAUDE.md`, `docs/stock/MASTER.md`, `docs/ERP-ARCHITECTURE.md` §3.1
(Catalog owns the category — D9), `docs/ui/MASTER.md`,
`docs/COPY-STANDARD.md`, on the LATEST `origin/main`. Execute as CONTINUOUS
BUILD: implement → tests → PR → CI → merge → deploy → prove SHA → overwrite
the owning MASTERs in the same PR. **If code structure conflicts with this
card, STOP and report — do not choose.**

## 1 · The ONE-category law (ERP-ARCHITECTURE §3.1, verbatim consequence)

*"What kind of product is this?" is the CATALOG's answer and nobody else's.*
The category comes ONLY through the catalog chain:

```
ops_stock_items.sku → product_skus.sku → product_skus.model_id
                    → product_models.category
```

**No screen and no shared function may re-derive a category from a SKU
string** — `storageCategoryForSku`-style prefix/regex guessing is the D9
defect this law exists to kill. Do not import, copy or extend any of the
three legacy category functions.

## 2 · What ships

- `/api/ops/stock/inventory` (apps/api/src/routes/ops/stock.ts): each item
  gains `category: string | null` from the catalog join. `null` = the SKU has
  no catalog row. No migration — a read join only.
- `opsStockItemSchema` (packages/shared/src/schemas/ops-stock.ts) gains the
  nullable field; fixtures compile-enforce it.
- On hand left filter rail (OperationStockOnHand.tsx) gains a `Category`
  FilterGroup between the attention chips and `Status`, same FilterPill
  mechanics as Status/Condition (additive AND, client-side):
  `All` · one pill per category present in the loaded rows (catalog order:
  Mattress · Bedframe · Sofa · Accessory, capitalised for display) · one
  honest bucket for rows with `category: null`.
- The null-bucket's on-screen word must be registered in `COPY-STANDARD.md`
  in the same PR (recommendation: `No catalog match` — it states the fact;
  never fold these rows into Accessory).

## 3 · Measured baseline (2026-08-19, production)

49 live rows join to the catalog (sofa 23 · bedframe 16 · mattress 10);
87 rows (975 units, mostly free-text import SKUs) do not. Every live row is
TEST data (Constitution §6) — the null bucket is honest display, never a
cleanup worklist. **Do not propose a backfill.**

## STILL LOCKED — do not touch

The Status/Condition/Supplier filter groups · every `?tab=` address · the
per-unit table and its actions · the reorder card · the WAREHOUSE rail.

## TESTS AND DEPLOY — MANDATORY

- API: a unit whose SKU joins returns its catalog category; a unit with no
  catalog row returns `null`; no category is ever derived from the SKU text.
- UI: picking a category pill narrows the table; the null bucket shows only
  no-match rows; pills compose with Status (AND).
- Full web + API suites green; typecheck + design lint clean.
- Production: the Category group renders on On hand with real counts,
  screenshot attached to the PR; SHA convergence proven.

## Acceptance boundary

Screenshots at 1440 attached to the PR; `docs/stock/MASTER.md` §3 records the
filter and the ONE-category source in the same PR. Owner walk owed.
