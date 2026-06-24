# 2990s Products parity — Phase 1: SKU Import + Export

> Part of the 9-tab parity initiative (roadmap: `2026-06-25-2990s-products-9tab-parity-roadmap.md`).
> Phase 1 = the headline gap (Import/Export SKUs) that unblocks the white-papered catalog.
> **NO migration** — every column already exists (0169-0173). Contract-safe: orders/PO/stock untouched.

## Locked decisions (Loo, 2026-06-25)
1. **Model resolution = explicit `model` column** (deterministic). CSV carries a base-model
   name + a `variant`; rows sharing (category, model_key) → one `product_models` row, each
   row → one `product_skus`. Optional `model_key` override; else derive kebab from `model`.
2. **File format = CSV + XLSX**, xlsx via **dynamic `import('xlsx')`** (lazy chunk, zero main-bundle hit;
   dodges the open bundle-size CF). Adds `xlsx` to `apps/web` deps (the §2 dependency-add Loo OK'd).
3. **Prices principal-gated** (0175): import with any price/cost value → principal-only (403 otherwise).
   Operation users may import structure (no price/cost) → unpriced SKUs.

## Forced-by-schema (not choices)
- Carres sku code = `deriveSkuCode(model_key, variant)` = `{MODEL_KEY}-{variant}` is **load-bearing**
  (operation_calc_shortages / CreatePOModal split on it). Import derives its own code; the free-form
  2990s `code` column is NOT used as identity.
- supplier_id required for non-supplierless categories → auto-resolve by `suppliers.cat_covered`
  (mattress→Nice Future, sofa/bedframe→Ohana) or explicit `supplier` column; accessory/service → null.

## Faithful 2990s logic to port (1:1)
RFC4180 parse · case-insensitive headers · **staged preview + explicit Confirm (no naked writes)** ·
max 500 rows · **blank cell = preserve** (never zero existing data → safe export→edit→re-import round-trip) ·
money `RM 1,535.00` prefix/comma strip + numeric validation · INSERT new / UPDATE existing by key ·
return `{ upserted, failed, failures[] }` (cap 50) · category-tailored export.

## CSV/XLSX column spec (case-insensitive headers)
| col | req | maps to | notes |
|---|---|---|---|
| `model` | ✔ | product_models.name (on create) | grouping key with category |
| `model_key` | – | product_models.model_key | kebab; else derived from `model`; /^[a-z0-9-]{2,60}$/ |
| `category` | ✔ | product_models.category | mattress\|bedframe\|sofa\|accessory\|service (ci) |
| `variant` | ✔ | product_skus.variant | sku = deriveSkuCode(model_key, variant) |
| `variant_kind` | – | product_skus.variant_kind | size\|preset\|part (default size) |
| `price` | – | product_skus.price | money; **principal**; blank→create 0 / update preserve |
| `cost` | – | product_skus.cost | money; **principal**; blank→create null / update preserve |
| `description` | – | product_skus.description | blank→create null / update preserve |
| `pos_active` | – | product_skus.pos_active | yes/no/true/false/1/0/active/inactive; default true |
| `supplier` | – | product_skus.supplier_id | slug or name (ci); else auto-resolve; unknown→row fail |
| `sku` | – | (ignored on import) | emitted by export for reference only |

## Endpoint: `POST /api/catalog/import-skus`  (catalogRouter, mounted /api/catalog)
- `internalOnly`. If ANY row has a numeric price/cost → require principal (403 `import_pricing_principal_only`).
- zod `skuImportInput = { rows: SkuImportRow[] }`, 1..500.
- **Batched** (cut round-trips): (1) validate+normalize all rows, collect per-row failures;
  (2) preload models by (category,model_key) `.in`; (3) batch-insert missing models (name from first row,
  allowed_options.sizes = size variants); (4) preload all suppliers once → resolve supplierId per row;
  (5) preload existing skus by derived code `.in`; (6) partition insert vs update; (7) batch-insert new,
  per-row update existing (blank=preserve). userClient/RLS only — **never service_role**. 0175 trigger
  is the DB belt to the app gate.
- returns `{ upserted, createdModels, failed, failures: failures.slice(0,50) }`.
- Do NOT rename existing models on import (preserve). model_id/sku never mutated on update.

## Files
**shared** `packages/shared/src/sku-import.ts` (+ barrel export, + tests):
`parseMoney` · `deriveModelKey` · `normalizeCategory` · `normalizeVariantKind` · `parseBoolish` ·
`csvRecordToImportRow` (the one mapper, client preview == server zod) · `skuImportRowSchema` ·
`skuImportInput` · types `SkuImportRow` / `SkuImportResult`.
**api** `apps/api/src/routes/catalog.ts` (+ `catalog.test.ts`): the route.
**web**: `apps/web/src/lib/sku-csv.ts` (`buildSkuExportCsv` · `downloadCsv` · `readXlsxToRecords` dynamic ·
`readFileToRecords`) + `apps/web/src/pages/catalog/tabs/ImportSkusDialog.tsx` +
`useImportSkus` in `queries.ts` + toolbar buttons (Export/Import) in `SkuMasterTab.tsx` +
`xlsx` dep in `apps/web/package.json`. Tests: `sku-csv.test.ts` + dialog render/preview.

## Verify
shared+api+web tests green (no new fails beyond the 8 known §17.7) · typecheck · web build ·
`SERVICE_ROLE` scan on dist = 0 · adversarial review APPROVE.

## Review outcome (5-dimension adversarial workflow, 2026-06-25)
contract-safety **CLEAN** · pricing-gate **SOUND** · parse/round-trip **CLEAN**. Fixed:
- **MEDIUM** `variant_kind` blank=preserve — a blank cell defaulted to `size` and was always
  written on UPDATE, silently re-typing preset/part SKUs. Now `normalizeVariantKind("")`→
  `undefined`; UPDATE writes it only when present; INSERT defaults `?? "size"`.
- **LOW** cross-category code collision — a row whose derived `{MODEL_KEY}-{variant}` matched a
  SKU under a *different* model would clobber it. Now the existing-SKU match carries `model_id`
  and a mismatch fails the row ("already belongs to another model").
- **LOW** price/cost upper bound (`MAX_IMPORT_MONEY = 99,999,999.99`) → friendly per-row reason
  instead of a raw PG numeric overflow.
- **NIT** BOM strip in `parseCsv` (Excel "CSV UTF-8") + deterministic `.order("slug")` supplier load.
- Tests added: `hasPricingIntent` unit, money-cap, unpriced round-trip (no pricing intent),
  variant_kind-preserve, cross-category-collision, supplier-by-name, failure-panel, in-flight pending.

### Residual minor items (documented, not fixed — cosmetic)
- failure `row` N indexes the submitted array, not the file line (the sku `key` disambiguates).
- within-batch duplicate `(model_key,variant)` counts as 2 in `upserted` (data correct; count cosmetic).
- trailing-space round-trip collapses (consistent: import trims both ends; matches 2990s).

## Final verification (2026-06-25, post-fix)
shared **404/404** · api **825 pass / 3 known-fail (§17.7)** · web **753 pass / 5 known-fail (§17.7)** ·
all 3 typechecks clean · web build clean (**xlsx = its own 429 KB lazy chunk**, main bundle unchanged) ·
`SERVICE_ROLE` dist scan = **0** · no migration. Zero new regressions.

## Deliberately out of P1 (later phases)
Sofa per-(size×tier) price columns (Carres uses the fabric-tier/combo engine, not flat tier prices) ·
unit_m³/barcode cols · staged bulk price-edit · supplier-bindings table.
