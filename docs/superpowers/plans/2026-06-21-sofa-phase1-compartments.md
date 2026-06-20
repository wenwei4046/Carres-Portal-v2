# Sofa Engine — Phase 1: Compartment pool + per-model offered + Maintenance UI

> First phase of the sofa engine roadmap (`2026-06-21-sofa-engine-roadmap.md`). Additive + principal-owned, same risk class as 0176/0177. Delivers the **"Sofa Compartments" maintenance** Loo showed + each sofa model declaring which compartments it offers (with price). NO builder / NO pricing engine / NO order change yet — those are Phases 2-4.
> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`. Migration goes through the §7 STOP gate before apply.

## Goal
The principal maintains a **compartment pool** (the "Base" — all sofa segment types: `1A(LHF)`, `1NA`, `2A(RHF)`, … each with a description + price) and each **sofa model ticks which compartments it offers** (a subset, with an optional per-model price). This is the data foundation every later phase builds on.

## Locked design (from the roadmap; the §7 migration gate confirms the exact schema)
- **Compartments will become REAL `product_skus` (later phase), so the sofa explode + all downstream (PO / stock / supplier-forecast / finance / per-line-thread / SO-Maintenance) work UNCHANGED — exactly like the combo explode references real SKUs.** Phase 1 lays the pool + offered + price; the per-(model,compartment) SKU generation lands in Phase 2/4 (when the explode needs them). Phase 1 adds the additive `product_skus.compartment_id` column now so it's ready.
- Pricing is **principal-owned** (consistent with 0175). Pool carries a default price (matches the screenshot RM column); a model may override per compartment (fabric-tier-override pattern). Price kept numeric MYR.
- Bedframe NOT touched (size-based, deferred).

## Global constraints
- Additive only (§7): new migration `0178` (+ §7 note + Loo OK before apply). Do NOT touch `create_order`, `order_lines`, `orderLineInputSchema`, `DraftLine`. Only ADD tables + one nullable column.
- Principal-only writes: RLS `(select public.is_principal())` USING+WITH_CHECK (mirror 0176/0177 exactly); read = any authenticated. §8 InitPlan-wrap.
- One zod schema/two consumers (§9.5); `qk` centralized; table-name constants (§9.4); snake↔camel via adapters only (§9.1). v17/2990s look, Lucide, no emoji. Green at baselines (shared 226 · api 775/778 · web 667/672; 8 known fails, add none).

---

### Task 1: migration 0178 — `sofa_compartments` + `model_sofa_compartments` + `product_skus.compartment_id` (§7 GATE: write → confirm → apply)
**Files:** Create `supabase/migrations/0178_sofa_compartments.sql`
- [ ] **Step 1: Verify live** `is_principal()` signature + `product_models(id)` / `product_skus` shape (do NOT recreate). Confirm `product_models.category` enum has `sofa`.
- [ ] **Step 2: Write the migration (additive):**
  - `sofa_compartments` (pool/type catalog): `id uuid PK default gen_random_uuid(), code text NOT NULL UNIQUE, description text, seat_count int, arm_config text, icon_url text, default_price numeric(12,2) NOT NULL DEFAULT 0 CHECK (default_price >= 0), sort_order int NOT NULL DEFAULT 0, active boolean NOT NULL DEFAULT true, created_at/updated_at timestamptz, updated_by uuid`.
  - `model_sofa_compartments` (per-model offered + optional price override): `model_id uuid NOT NULL REFERENCES product_models(id) ON DELETE CASCADE, compartment_id uuid NOT NULL REFERENCES sofa_compartments(id) ON DELETE RESTRICT, price_override numeric(12,2) CHECK (price_override IS NULL OR price_override >= 0), sort_order int NOT NULL DEFAULT 0, created_at/updated_at, updated_by, PRIMARY KEY (model_id, compartment_id)`. (Row present = model offers this compartment; `price_override` NULL = use pool `default_price`.)
  - `ALTER TABLE product_skus ADD COLUMN compartment_id uuid REFERENCES sofa_compartments(id)` (nullable, additive — only future compartment SKUs set it; links a generated compartment SKU to its type).
  - Enable RLS on both new tables; SELECT `(SELECT auth.uid()) IS NOT NULL`; ALL write `(SELECT public.is_principal())` USING+WITH_CHECK. Header comment (WHY = sofa engine Phase 1, additive, principal-owned, compartments→real-SKUs-later, never edit frozen 0001-0177).
- [ ] **Step 3: STOP — §7 gate.** Present the SQL to Loo (additive, principal-owned, zero order-contract change) + the design notes (pool default_price + per-model override; compartments→SKUs later; the new product_skus column). Get OK → apply via Supabase MCP → verify (2 tables + RLS + 4 policies + FKs + the column).
- [ ] **Step 4: Commit** `feat(catalog): migration 0178 — sofa compartment pool + per-model offered (principal-owned)`

### Task 2: shared — types/schemas/adapters + catalogResponse extend
**Files:** `packages/shared/src/{db-types,domain,adapters,schemas/catalog,tables}.ts`
- [ ] `SofaCompartmentRow`/`Dto` (+ `compartment_id` added to `ProductSkuRow`/`Dto`); `ModelSofaCompartment*`; zod `sofaCompartmentSchema`/`create`/`patch` + `modelSofaCompartment*`; adapters `sofaCompartmentFromRow` etc.; `catalogResponseSchema.sofaCompartments?` + `.modelSofaCompartments?` (optional/additive); `SOFA_COMPARTMENTS`/`MODEL_SOFA_COMPARTMENTS` table constants. Barrel-export (don't repeat the Task-2/3 combo barrel-omission). Green (shared tests + typecheck).
- [ ] **Commit** `feat(shared): sofa compartment types/schemas/adapters`

### Task 3: API — catalog GET returns the pool + per-model offered; principal-gated CRUD
**Files:** `apps/api/src/routes/catalog.ts` (+ test)
- [ ] GET `/api/catalog` adds `sofaCompartments` (the pool) + `modelSofaCompartments` (offered rows). Principal-gated CRUD: pool (POST/PATCH/DELETE `/catalog/sofa-compartments`) + per-model offered (PUT/DELETE `/catalog/models/:id/compartments/:compartmentId`, upsert offered + price_override). Reuse `principalOnly()`/`parseJsonBody`/`mapPgError`/`userClient`. TDD (mocked-Supabase) — GET shape, principal 200 / non-principal 403 (`/Master Admin/i`). Green (api 775/778 baseline, add none).
- [ ] **Commit** `feat(api): catalog returns sofa compartments; principal-gated compartment CRUD`

### Task 4: web — Maintenance "Sofa Compartments" page + per-model offered in ProductModelDrawer
**Files:** `apps/web/src/pages/catalog/**` + `apps/web/src/lib/queries.ts`
- [ ] A "Sofa Compartments" Maintenance sub-page (mirror Loo's screenshot: list the pool with code · description · price; principal can add/edit/reorder/soft-delete; row icon). Hooks `useCreate/Update/DeleteSofaCompartment` + per-model offered hooks (invalidate `["catalog"]`).
- [ ] In `ProductModelDrawer` (sofa models only): a "Compartments" panel — tick which pool compartments this model offers + set an optional price override per offered compartment. Principal-gated (read-only others).
- [ ] Component tests (principal edits; non-principal read-only). Green (web baseline). v17/2990s look.
- [ ] **Commit** `feat(catalog): Sofa Compartments maintenance + per-model offered (principal-only)`

### Task 5: green gate + PR
- [ ] Final gate: shared+api+web at baselines; `grep -ri SERVICE_ROLE apps/web/dist` = 0 (§4.4); branch not behind main.
- [ ] PR `feat: sofa engine Phase 1 — compartment pool + per-model offered`. **Deploy decision with Loo** (additive, principal-only maintenance — safe to ship standalone OR batch with later phases; the page is harmless until the builder uses it). Update the roadmap doc's Phase 1 status.

## Self-review / open sub-decisions (resolve at the §7 gate or in Task 1)
- Pool `default_price` + per-model `price_override` (recommended, matches screenshot + fabric-tier pattern) vs price strictly per-(model,compartment). 
- Compartment→`product_skus` generation: deferred to Phase 2/4 (when the explode needs real SKUs). The `product_skus.compartment_id` column is added now so it's ready; no SKU rows generated in Phase 1.
- `arm_config`/geometry: Phase 1 stores a descriptive `arm_config` only; the builder geometry (w/d/cushions/edges) is Phase 3 (likely code constants keyed by `code`, per 2990s).
- Fold the `sofa_fabrics.tier` DB-lock (CF) into a later sofa phase once pricing depends on tier.

## Contract safety
Additive tables + one nullable column. `create_order`/`order_lines`/order zod/`DraftLine` UNTOUCHED. No POS/order behaviour change in Phase 1.
