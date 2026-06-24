# 2990s "Products" page → Carres full 9-tab parity — ROADMAP

> Loo (2026-06-25): reproduce 2990s's entire **Products** admin page in Carres — ALL
> functions of all 9 tabs: SKU Master · Modular · Special Add-ons · Fabrics ·
> Maintenance · Combo Pricing · Delivery Fee · PWP · Promo. This is a MULTI-PHASE
> initiative (several tabs are whole subsystems we deferred). Gap mapped 2026-06-25
> via 3 parallel read-only agents (full reports were in the mapping session).
>
> **Immediate trigger**: the catalog was white-papered (only Booqit authored) so the
> POS is empty — Loo's fastest unblock is **SKU Import** (Phase 1 below). Effort =
> ultracode (xhigh + workflow orchestration) when building.

## Structural finding (reframes everything)
- 2990s has **TWO** Products pages: a slim backend admin + the full **POS page**
  (`apps/pos/src/pages/Products.tsx`, ~284KB, 8 top-tabs). The 9 tabs Loo wants are
  the **POS page**. ("PWP & Promo" is ONE combined tab — a single engine with a
  `type: 'pwp'|'promo'` discriminator, + Default Free Gifts/GWP + Free Item Campaigns.)
- Carres collapses this into **4 tabs** (`apps/web/src/pages/catalog/ProductMaintenancePage.tsx`:
  SKU Master · Modular · Maintenance · Combos) + per-model editing in `ProductModelDrawer.tsx`.
- **The spine**: 2990s built ONE shared `RuleTarget` abstraction (`packages/shared/src/rule-target.ts`,
  scopes `model|variant|combo|compartment`). **Delivery Fee, PWP/Promo, Free Gifts,
  Free-Item Campaigns ALL consume it.** Port it ONCE → reused by all three missing
  subsystems. Carres has the sofa Kuhn matcher (`matchSofaCombo`) but not RuleTarget.
- **Every** 2990s pricing subsystem is server-recomputed against a 0.5% drift gate
  (the same pattern Carres shipped in Sofa Phase 4 — `sofa-recompute.ts`). The shared
  pure matcher running identically POS+server is non-negotiable; that's why RuleTarget
  is one abstraction, not three.

## 9-tab gap matrix (Carres current → 2990s)

| Tab | Carres state | Key gaps | Scale |
|---|---|---|---|
| **SKU Master** | ✓ table + filters + per-row/inline edit + cost/margin (Carres ADVANTAGE) | ✗ **Import/Export SKUs (CSV/xlsx)** — THE headline gap; ⚠ staged bulk price-edit, bulk activate/deactivate, model-filter rail; ✗ unit-m³/barcode cols; ✗ sofa P1/P2/P3 SKU-price tiers (partly superseded by Carres's fabric-tier/combo engine — confirm if wanted) | Import = **½–1d** (highest value) |
| **Modular** | ✓ model list + photo + size-cascade generate-skus + per-model drawer (fabrics/combos/compartments) | ⚠ bulk multi-row "New Model"; ✗ bulk "Assign to supplier" (collides w/ Carres single-supplier-per-SKU → needs a supplier-bindings table); ⚠ per-category code/name format-templates in generate-skus | M–H |
| **Special Add-ons** | ✓ order-fee half (`addons` full CRUD + SVC- mint) | ✗ **entire `special_addons` concept**: per-model SELLING surcharges, **negative** allowed, **nested follow-up question groups** (`option_groups`), attach per-model via `allowed_options.specials`, render as SO desc lines (not SKUs); ⚠ add-ons NOT principal-gated (inconsistent w/ 0175) | M–L |
| **Fabrics** | ✓ tier engine (sofa, model-scoped) + global delta + per-model override | ✗ **per-compartment fabric override (mig 0184)** = MAX-over-set resolver + server recompute + UI; ⚠ 2-axis tier (sofa+bedframe) — defer w/ bedframe; ⚠ API field-gate on PATCH /sofa-fabrics/:id (DB trigger 0179 already covers) | per-compartment = M–L |
| **Maintenance** | ✓ Sofa-compartment pool + Delivery-fee + fabric deltas + Add-ons | ✗ **Bedframe Sizes, Mattress Sizes, Brandings, Supplier Categories pools** (Carres has no global option-pool tables — sizes live per-model in `allowed_options`); ✗ versioned config-history + effective-date; ✗ compartment rename-cascade | M each pool, L for history layer |
| **Combo Pricing** | ✓ **~90% done** (0179 + the pure engine, faithful port) | ✗ cost/sell split (`selling_prices_by_height`); ✗ customer/supplier scope (B2B — likely skip-forever for Carres B2C); ✗ pwp/default-gift cols (belong to PWP tab); ⚠ history drawer | cost/sell = M (small) |
| **Delivery Fee** | ✗ absent (only a single `floor_config` value + app-level lead-times) | ✗ `delivery_fee_config` singleton (base + cross-cat fee + lead-days); ✗ `special_delivery_fee_rules` (RuleTarget); ✗ snapshot col + `computeSoDeliveryFee` + cross-category trip logic + CRUD + UI + server recompute | **SMALLEST of the 3 missing — 1–2 phases** |
| **PWP** | ✗ absent | ✗ `pwp_rules` + `pwp_codes` **voucher state machine** (RESERVED→USED\|AVAILABLE, cross-order carry-forward) + pwp prices + `resolvePwp` engine + 2 API routes + dual POS/server reconcilers + order-path claim/rollback. **~4,200 LOC.** Threads into order-create + the honest-pricing gate. | **LARGEST — 3–4 phases, highest risk** |
| **Promo / GWP** | ✗ absent | ✗ same engine as PWP (`type='promo'`, free-RM0 reward w/ one-way no-funding guard in 5 places); ✗ **Default Free Gifts** (code-free deterministic, per-model auto-add accessory @ RM0, reconciled on SO edit) — the easiest promo slice; ✗ Free Item Campaigns | 2–3 phases (shares PWP engine); Default-Free-Gifts ≈ 1 phase standalone |

## Recommended phasing
- **Phase 1 (DO FIRST — unblocks the empty catalog): SKU Import + Export.** New
  `POST /api/catalog/import-skus` (internal-gated, ≤500 rows, data-loss-safe upsert by
  sku, resolve/create model by `model_key`-from-name then upsert sku; reuse
  `productModelCreateInput`/`productSkuCreateInput`) + web `ImportSkusDialog` ported
  from 2990s `Products.tsx:4484` (`parseSkuCsv`/`readXlsxGrid`/`gridToSkuRecords`,
  staged preview + Confirm; `apps/web/src/lib/csv.ts` exists to build on) + `exportSkusCsv`
  port for round-trip. **DECIDE before building: model-resolution rule** (derive
  `model_key` from name vs require an explicit model column in the CSV). 2990s import =
  flat `mfg_products` rows; Carres must create the model first (the one schema divergence).
- **Phase 2: SKU-Master + Modular polish** (staged bulk price-edit, bulk activate,
  generate-skus format-templates). Defer supplier-bindings (needs a new table).
- **Phase 3: Special Add-ons** (`special_addons` table + follow-up option-groups +
  per-model ticks + principal gate on add-ons).
- **Phase 4: Maintenance pools** (Brandings, Supplier-Categories, Bedframe/Mattress
  Sizes global pools; defer the versioned config-history layer).
- **Phase 5: Combo cost/sell split** (small, standalone, anytime).
- **Phase 6: shared `RuleTarget` port + Delivery Fee** (smallest of the 3 missing
  subsystems; exercises RuleTarget + server-recompute end-to-end at low order-path risk).
- **Phase 7: Default Free Gifts** (code-free promo, easiest promo win).
- **Phase 8: PWP voucher + Promo** (heaviest, order-path-entangled — last).

## Deliberate skips (Carres B2C)
Customer-scope + supplier-scope combos (2990s B2B); the cost-ledger Fabric Converter.

## Key 2990s file anchors (reference: C:\Users\wenwe\Projects\2990s)
- SKU import: `apps/backend|pos/src/pages/Products.tsx` (`ImportSkusDialog` ~L4484, `parseSkuCsv` L4437, `readXlsxGrid` L4425, `exportSkusCsv` L4338) + `apps/api/src/routes/mfg-products.ts` `POST /batch-import` L209.
- RuleTarget spine: `packages/shared/src/rule-target.ts`.
- Delivery: migs 0029/0030/0183 + `pricing.ts` `computeSoDeliveryFee` L213 + `routes/delivery-fees.ts`.
- PWP/Promo: migs 0128/0130/0145/0182 + `shared/pwp.ts` `resolvePwp` L110 + `shared/free-gift.ts` + `routes/pwp-codes.ts` + `routes/pwp-rules.ts` + `PwpRulesTab.tsx`.
- per-compartment fabric (0184): `compartment_fabric_tier_overrides` + `fabric-tier-override-resolve.ts`.

## Carres catalog API (for building): `apps/api/src/routes/catalog.ts`
GET `/` bundle L150 · models POST/PATCH/DELETE · skus POST/PATCH/DELETE · generate-skus L711 · sizes-active L661 · addons · fabric-tier-config/override (principal) · combos (principal) · sofa-compartments + model-compartments (principal) · sofa-combos (principal). Writes internalOnly; pricing/combo/compartment principalOnly (+0175 trigger).
