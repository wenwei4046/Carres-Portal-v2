# Catalog → "Product & Maintenance" rebuild — implementation plan

> Authored 2026-06-14 (ultracode design workflow `wf_d3323beb` + adversarial critique).
> Reference: 2990s sister-POS (`wenwei4046/2990s`, cloned at `C:/Users/wenwe/Projects/2990s-ref`).
> Status: **plan ready, 3 blocking decisions need Loo before build** (see §8).

## 1. Scope (Loo-approved 2026-06-14)

Rebuild the existing single-page "Catalog" into a **Product & Maintenance** page with **3 tabs**:
1. **SKU Master** — flat 7-column product table (Product code · Description · Product name · Category · Size · Price · Status), 5-category filter + search, **add SKU**, **Edit Prices** (inline + verified read-back).
2. **Modular** — model cards grouped by category, **ON/OFF for sales portal**, inline name edit, **photo upload**, allowed-options editor + variant table.
3. **Maintenance (narrow)** — option pools (sizes/compartments/colors/gaps) + delivery-fee (floor_config) + add-ons (addons) config. **NOT** 2990s' 4-level geo drill.

**Deferred** (heaviest, 2990s built last, Carres has no price-tier substrate): PWP & Promo, Combo Pricing, per-tier seat-height matrices, price-history audit, CSV import/export.

## 2. Locked decisions (from the 2990s reference)

| Topic | Decision |
|---|---|
| 5 categories | Add `accessory` + `service` to `product_category` enum (additive) |
| ON/OFF toggle | **NEW `product_skus.pos_active boolean`** (sell-side). `discontinued_at` stays the cost/PO side. Never overload. |
| Price | Show numeric price; `0.00` → muted "price not set"; **never** show cost as price. Edit-Prices inline + verified read-back. |
| Description | NEW editable `product_skus.description`. `variant` stays the Size discriminator; `product_models.name` stays inline-editable. |
| Photo | `product_models.photo_url` + Supabase Storage bucket `product-model-photos`. **signed-URL upload** (repo convention — see §8 fix). |
| Delivery/service as SKU | Hybrid: keep `addons`/`floor_config` config + link `addons.service_sku` → real Service-category `product_skus`. |
| Model→variant | `allowed_options` jsonb + a `generate-skus` endpoint (cartesian). |
| Arch | Browser → Hono → Supabase (supabase-js). NO Drizzle, NO 2nd app, NO R2. Reuse existing `/api/catalog` CRUD. Internal roles only. |

## 3. Migrations (apply MANUALLY via Supabase MCP `apply_migration`, one at a time, in order)

Next free number = **0169** (main tip 0168).

- **0169** `product_category_add_accessory_service.sql` — **standalone, NO txn** (`ALTER TYPE ... ADD VALUE IF NOT EXISTS 'accessory'/'service'`). MUST be applied + committed **before 0172**. ⚠️ verify Supabase `apply_migration` doesn't auto-wrap in a txn (test on a branch first; ADD VALUE cannot run inside a txn).
- **0170** `product_skus_pos_active_description.sql` — `ADD COLUMN pos_active boolean NOT NULL DEFAULT true` + `description text`.
- **0171** `product_models_photo_allowed_options_supplier_nullable.sql` — `ADD photo_url text` + `allowed_options jsonb NOT NULL DEFAULT '{}'` + `ALTER product_skus ALTER supplier_id DROP NOT NULL` (so service/accessory SKUs with no supplier can insert).
- **0172** `addons_service_sku_and_service_skus.sql` — `addons ADD service_sku text CHECK(~ '^SVC-[A-Z0-9-]+$')` + mint a `service`/`service-addons` parent model + 4 Service SKUs (`SVC-DELIVERY`, `SVC-DISPOSE-{MATTRESS,SOFA,BEDFRAME}`) under the seeded `carres-internal` supplier + backfill the 3 disposal addons. **Depends on 0169.**
- **0173** `storage_product_model_photos_bucket.sql` — public-read / `is_internal()`-write bucket `product-model-photos` (2MB, jpeg/png/webp). Mirrors `0042_storage_dos_bucket` but PUBLIC; write gate `(select public.is_internal())` (NOT a raw `logistics` literal — 0121 already rewrote `is_internal()`).

Full SQL for each is captured in the design-workflow output (`wf_d3323beb`); transcribe verbatim when writing the files.

**⚠️ critic SQL fix (0172 link):** `addons.service_sku` stores the **bare** code (`SVC-DISPOSE-MATTRESS`) but the minted `product_skus.sku` is colon-namespaced (`service:service-addons:SVC-DISPOSE-MATTRESS`). The addon→sku link must join on **`product_skus.variant = addons.service_sku`** (the variant column holds the bare SVC code), NOT `product_skus.sku`.

## 4. Shared layer (one pass, then `pnpm --filter @carres/shared build` + typecheck IMMEDIATELY)

`packages/shared/src/`: `schemas/catalog.ts` (widen `productCategorySchema` 3→5; add `posActive`/`description`/`photoUrl`/`allowedOptions`/`serviceSku`; new inputs: `toggleSizesActiveInput`, `generateSkusInput`, `serviceSkuCreateInput`, `skuMasterListQuery`, `floorConfigPatchInput`, `addonCreateInput`, `addonPatchInput`) → `db-types.ts` (rows += new cols, `supplier_id` → `string|null`, widen `ProductCategory`) → `domain.ts` (camelCase) → `adapters.ts` (map new cols) → `constants.ts` (**NOT tables.ts — it doesn't exist**): `PRODUCT_CATEGORIES`, `SERVICE_SKU` codes + `SERVICE_SKU_REGEX`, `CARRES_INTERNAL_SUPPLIER_SLUG`, `PRODUCT_MODEL_PHOTOS_BUCKET` → `index.ts` re-exports.

`allowed_options` shape LOCKED: `{ sizes?: string[], compartments?: string[], colors?: string[], gaps?: string[] }` (`.passthrough()`).

## 5. API (extend the already-mounted `catalogRouter` in `apps/api/src/routes/catalog.ts`)

Reuse existing CRUD. ADD: PATCH `/skus/:id` += `pos_active`/`description`; PATCH `/models/:id/sizes-active` (cascade `pos_active`, never `discontinued_at`); POST `/models/:id/generate-skus` (idempotent, catch 23505 as skip); **photo upload** (signed-URL: POST `/models/:id/photo/sign-upload` → token; browser uploads direct; PATCH stores `photo_url`) + remove; POST `/skus/service` + relax `no_supplier_for_category` 422 for service/accessory; GET `/` in-memory `?category/?search/?posActive` filters; Maintenance: PATCH `/floor-config`, addons CRUD, model `allowedOptions` patch. All via `userClient` (RLS boundary), `mapPgError`. **Never** `adminClient`.

## 6. Frontend

One shell `apps/web/src/pages/catalog/ProductMaintenancePage.tsx` (pill tabs, single `useCatalog({admin:true})` passed down), mounted at the unchanged `'catalog'` routing key (`OperationApp.tsx`, `PrincipalApp.tsx`); sidebars relabelled "Product & Maintenance" (keys unchanged). Existing `OperationCatalog` body cut into `tabs/SkuMasterTab.tsx`. New: `SkuGrid`/`SkuRowView`/`CategoryChip`/`CodeChip`/`SkuStatusPill`/`NewSkuModal`; `modular/{ModularTab,ModelGrid,ModelPhotoCell,ProductModelDrawer,AllowedOptionsPanel,SkuVariantTable,GenerateSkusModal}`; `tabs/MaintenanceTab.tsx`. New libs: `lib/image-shrink.ts` (≤2MB/1600px JPEG q0.85), `lib/api.ts` += signed-upload helper. All hooks in `queries.ts` (one edit), every `onSuccess` invalidates `['catalog']`. v17 tokens (`.pill`/`.btn-*`/`.t-*`), shared `Modal`. NO CSS modules, NO sen math (Carres price = plain RM `Number`).

## 7. Build order

1. Migrations 0169→0173 (manual, one at a time; 0169 committed before 0172).
2. Shared layer pass → **build + typecheck NOW** (the 3→5 enum widening can break exhaustive switches in `ProductPicker`, `Step3Delivery`, `DealerProducts`, `CreatePOModal`, `OperationCatalog` — add default branches where tsc flags).
3. API + `catalog.test.ts`.
4. Frontend: shell + extract SkuMasterTab (cut + mount-switch ATOMIC) → SKU Master → Modular → Maintenance.
5. Full test suite + web E2E smoke + `grep dist for SERVICE_ROLE`.
6. Build + deploy (api then web) + smoke. PR per CLAUDE.md §13.

## 8. ⚠️ Blocking issues (critic) — RESOLUTIONS

**B1 — generated SKU code scheme (NEEDS LOO).** Existing 1013 SKUs are AutoCount codes (`MS01-B1201F-S`); colon format would create two incompatible schemes (0148 already fought this). → **Decision for Loo** (§9). Default: `generate-skus` + new-model flow is the *new* way; existing AutoCount SKUs stay as-is (display + price edit only); brand-new SKUs use whatever code scheme Loo specifies.

**B2 — photo upload pattern (resolved).** Switch to the repo's **signed-upload-URL** convention (browser → Supabase direct, bytes never through Worker; matches `dos.ts`/`pod.ts`). Drops the multipart route + `apiFetchMultipart`; keep `image-shrink` (respects the 2MB bucket cap regardless).

**B3 — pos_active must actually hide from dealers (NEEDS LOO to confirm intent).** Today the public `/api/catalog` bundle filters only on `discontinued_at`, not `pos_active`, so the toggle is cosmetic. → To make OFF mean "hidden from sales portal", filter the **non-admin** bundle to `pos_active=true`. Must verify: (i) CreatePOModal/procurement still sees OFF SKUs if operation needs to order stock for them; (ii) re-opening an order/PO that references an OFF SKU resolves by sku code directly (rehydration must not drop the line). Default: filter dealer-facing bundle on `pos_active`, keep admin/procurement seeing all, rehydrate by code.

## 9. Open decisions

**Resolved by Loo 2026-06-14:**
- **D-B1: new-SKU code = auto-derived `{model_key}-{variant}`** (uppercase, dash; e.g. `LUMI-K`). NOT colon, NOT free-typed. Existing AutoCount SKUs stay as-is. ⇒ `generate-skus` mints `${model_key.toUpperCase()}-${variant}`. **Service SKUs use the bare `SVC-...` code AS the sku** (e.g. `SVC-DELIVERY`), so `addons.service_sku = product_skus.sku` joins cleanly (supersedes the §3 variant-join fix — no colon namespacing for service).
- **D-B3: OFF = hidden from dealers.** The non-admin `/api/catalog` bundle filters `skus` to `pos_active=true`. Admin/procurement bundle sees all; order/PO rehydration resolves by sku code directly (OFF lines never dropped).
- **D2: photos PUBLIC-read.** Bucket `public=true`, render unsigned on quotes/printouts.

**Decided (defaults, change if you disagree):**
- D1 floor_config write RLS is principal-only → **UI-gate the delivery-fee editor to principal** (no RLS churn).
- D3 model "Active" pill = **rollup** (any SKU `pos_active` → ACTIVE), cosmetic; no model column.
- D4 `is_internal()` write admits finance/bd too (pre-existing) → **keep** unless you want strict operation+principal.
- D5 `allowed_options` shape locked (§4).
- Supplier-null guard: a null-supplier service/accessory SKU **cannot enter a Create-PO line** (guard at line-add + test) — protects CreatePOModal/forecast/COGS from the `supplier_id` DROP NOT NULL.

## 10. Test plan

Shared adapters round-trip + zod (5 categories, SVC regex) + typecheck-first. API: pos_active/description read-back, sizes-active cascade idempotency, generate-skus 23505-skip, service-SKU no-supplier 422 relaxation, photo sign-upload + role gate, GET filters + dealer-bundle regression, floor/addons RLS 403, null-supplier mapPgError. Web: sku↔model join, price `0`→"not set" (never cost), Edit-Prices verified read-back, pos_active toggle (not discontinue), Modular category groups + Active rollup + photo shrink + generate default-tick. E2E: load page, filter Service, toggle SKU off → persists after reload. Deploy gate: `grep dist for SERVICE_ROLE` clean.
