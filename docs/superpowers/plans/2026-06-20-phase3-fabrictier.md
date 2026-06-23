# Phase 3 — Fabric-Tier (P1/P2/P3) Sofa Pricing (2990s-aligned) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Add 2990s-style fabric-tier pricing to sofas — each fabric carries a tier P1/P2/P3; P2/P3 add a configurable selling delta (global + per-model override) — AND build the sofa-fabric maintenance UI (which does not exist today). Principal owns the pricing.

**Architecture:** Carres has `sofa_fabrics` (per-model, columns id/model_id/fabric_name/surcharge/colors/discontinued_at) but **0 rows, no maintenance UI, only 4 sofa SKUs**. Pricing today is 100% client-side: `SofaConfigurator` does `unitPrice = sku.price + fabric.surcharge`, writes `attrs.fabric_id/fabric_name/fabric_surcharge` into the order line's open jsonb, and `create_order` persists it verbatim. We mirror 2990s migrations 0124 (global delta singleton) + 0172 (per-model override): add `sofa_fabrics.tier` + `fabric_tier_addon_config` + `model_fabric_tier_overrides`, resolve the delta client-side, fold it into `unitPrice` and add `attrs.fabric_tier` — exactly the way `fabric_surcharge` already rides, so **DraftLine / orders zod / catalog+order API / create_order RPC are UNTOUCHED**. SELLING-only, SOFA-only, numeric money, principal-owned. Combo (Phase 4) + PWP (later) build on this identical shape.

**Tech Stack:** same as prior phases. DB via Supabase MCP. Loo decisions (2026-06-20): Option B; SOFA-only; tier as a label on the fabric row; per-model override included now; selling-only; principal owns delta config + overrides; maintenance built fresh.

## Global Constraints
- **Contract-safe / additive only (§7):** schema change = NEW migration `0176` (+ §7 note + Loo OK before apply). Do NOT touch `DraftLine` (localId/sku/qty/attrs/unitPrice/label), the orders zod schema, the catalog/order API request shapes, or the `create_order` RPC. The tier rides in `attrs.fabric_tier`; the resolved delta folds into `unitPrice` (same as `fabric_surcharge` today).
- **Zero behaviour change on apply:** `tier` defaults `PRICE_1`; the config singleton seeds `sofa_tier2_delta=0, sofa_tier3_delta=0`; overrides table starts empty (NULL=inherit). So applying 0176 changes no price until someone sets a delta. The configurator must safely fall back to delta 0 (treat as P1) if the config is absent/null — never NaN/crash.
- **SELLING-only, SOFA-only.** Do NOT touch cost (`product_skus.cost` stays principal-locked by 0175; PO writes `purchase_order_lines.cost`). Do NOT add a bedframe fabric axis (bedframe prices on `gaps[]`, has no fabric). Name config columns `sofa_tier2_delta`/`sofa_tier3_delta` so a bedframe axis could be added additively later.
- **Principal owns the money:** `fabric_tier_addon_config` + `model_fabric_tier_overrides` RLS = `is_principal()` for-all (mirror `floor_config`); SELECT readable by authenticated/internal. The fabric editor's tier dropdown + delta inputs are principal-gated in the UI. (DB-level lock of `sofa_fabrics.tier` itself = optional follow-up CF; v1 gates tier in the UI + keeps `sofa_fabrics` on `fabrics_write_internal`.)
- **Keep numeric money** (not 2990s sen-integers). No server recompute / drift gate (POS keeps client price-snapshot).
- One zod schema, two consumers (packages/shared). Centralize React Query keys in `apps/web/src/lib/queries.ts` (qk). Constants for table/RPC names. flame/Lucide/v17/no-emoji.
- Every phase ends green: web+api+shared build/typecheck/test ≥ documented baselines (8 known pre-existing fails; add none).
- Deployment manual + Loo-gated.

---

### Task 1: migration 0176 — tier column + config + override tables + RLS (§7 GATE: write, confirm, apply)

**Files:** Create `supabase/migrations/0176_fabric_tier_addon.sql`

- [ ] **Step 1: Verify** the live `is_principal()` helper signature (it gates `floor_config`) via Supabase MCP + read `0002_rls.sql` / the floor_config migration. Do NOT recreate it.
- [ ] **Step 2: Write the migration** (additive):
  - `ALTER TABLE public.sofa_fabrics ADD COLUMN tier text NOT NULL DEFAULT 'PRICE_1' CHECK (tier IN ('PRICE_1','PRICE_2','PRICE_3'));`
  - `CREATE TABLE public.fabric_tier_addon_config ( id int PRIMARY KEY DEFAULT 1 CHECK (id = 1), sofa_tier2_delta numeric(12,2) NOT NULL DEFAULT 0 CHECK (sofa_tier2_delta >= 0), sofa_tier3_delta numeric(12,2) NOT NULL DEFAULT 0 CHECK (sofa_tier3_delta >= 0), updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid );` + `INSERT INTO ... (id) VALUES (1) ON CONFLICT DO NOTHING;` (seed the singleton).
  - `CREATE TABLE public.model_fabric_tier_overrides ( model_id uuid PRIMARY KEY REFERENCES public.product_models(id) ON DELETE CASCADE, tier2_delta numeric(12,2) CHECK (tier2_delta IS NULL OR tier2_delta >= 0), tier3_delta numeric(12,2) CHECK (tier3_delta IS NULL OR tier3_delta >= 0), updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid );`
  - Enable RLS on both new tables. SELECT policy: authenticated/internal read (mirror how floor_config exposes read). WRITE policy: `is_principal()` for-all (mirror floor_config write). Use §8 conventions (`(select is_principal())` InitPlan wrap, STABLE helper).
  - Header comment: WHY (Phase 3 2990s fabric-tier), additive/zero-behaviour-on-apply, scope sofa-only/selling-only.
- [ ] **Step 3: STOP — present the migration SQL + "additive, 0 price change until a delta is set" to Loo; get OK; then apply via Supabase MCP `apply_migration`.** Verify post-apply: the column + 2 tables + singleton row exist; RLS enabled.
- [ ] **Step 4: Commit** the .sql file `feat(catalog): migration 0176 — fabric tier column + tier-delta config + per-model overrides`

---

### Task 2: shared layer — types, schemas, adapters, resolveFabricDelta helper

**Files:** Modify `packages/shared/src/{db-types.ts, domain.ts, adapters.ts, schemas/catalog.ts, tables.ts}`; Create `packages/shared/src/fabric-tier.ts` (+ test)

**Interfaces:**
- Produces: `FabricTier = 'PRICE_1'|'PRICE_2'|'PRICE_3'`; `SofaFabric` gains `tier`; `FabricTierConfig` ({ sofaTier2Delta, sofaTier3Delta }); `ModelFabricTierOverride` ({ modelId, tier2Delta|null, tier3Delta|null }); `catalogResponseSchema` gains `fabricTierConfig` + `modelFabricTierOverrides`. Pure `resolveFabricDelta(tier, override, config): number`.

- [ ] **Step 1 (TDD): write `fabric-tier.test.ts`** for `resolveFabricDelta(tier, override, config)`:
  - P1 → 0 (regardless of config/override).
  - P2, no override → `config.sofaTier2Delta`. P3, no override → `config.sofaTier3Delta`.
  - P2 with `override.tier2Delta = 50` → 50 (override wins, incl. 0). `override.tier2Delta = null` → inherit global.
  - config null/undefined → 0 (safe fallback, no NaN).
  - negative → clamped to 0.
- [ ] **Step 2:** run (fail) → implement `fabric-tier.ts` → run (pass).
- [ ] **Step 3:** add `tier` to `SofaFabricRow` (db-types), `SofaFabric` (domain) + `sofaFabricFromRow` adapter; add `sofaFabricCreateInput`/`PatchInput` `tier` field (zod). Add `FabricTierConfig` + `ModelFabricTierOverride` domain types + zod schemas + adapters (`fabricTierConfigFromRow`, `modelFabricTierOverrideFromRow`). Extend `catalogResponseSchema` with `fabricTierConfig` + `modelFabricTierOverrides`. Add table-name constants (`FABRIC_TIER_ADDON_CONFIG`, `MODEL_FABRIC_TIER_OVERRIDES`) to `tables.ts`.
- [ ] **Step 4:** `pnpm --filter @carres/shared test` + build/typecheck green.
- [ ] **Step 5: Commit** `feat(shared): fabric-tier types/schemas/adapters + resolveFabricDelta helper`

---

### Task 3: API — catalog GET returns config+overrides; config/override/fabric CRUD; principal gate

**Files:** Modify `apps/api/src/routes/catalog.ts` (+ test)

- [ ] **Step 1 (TDD):** api test — GET `/api/catalog` includes `fabricTierConfig` (seeded 0/0) + `modelFabricTierOverrides` ([]); PATCH config delta as principal ok, as non-principal 403; upsert override as principal ok / non-principal 403; PATCH sofa-fabric `tier` (the missing update path).
- [ ] **Step 2:** implement: GET bundles `fabric_tier_addon_config` (the singleton) + `model_fabric_tier_overrides` (all rows) alongside sofaFabrics. Add `PATCH /api/catalog/fabric-tier-config` (principal-gated, like 0175's catalog gate) + `PUT /api/catalog/model-fabric-tier-override/:modelId` (upsert, principal-gated). Add `PATCH /api/catalog/sofa-fabrics/:id` support for `tier` (route exists; ensure tier is accepted). Principal gate via the same JWT-role check used in 0175's catalog gate. Catalog write client uses the user JWT (so RLS is the boundary).
- [ ] **Step 3:** run api tests + build/typecheck green (3 known pre-existing fails only).
- [ ] **Step 4: Commit** `feat(api): catalog returns fabric-tier config+overrides; principal-gated tier/delta writes`

---

### Task 4: POS apply — resolve tier delta in the sofa configurator + from-price

**Files:** Modify `apps/web/src/pages/dealer/new-order/configurators.tsx`, `apps/web/src/pages/dealer/pos/catalog-index.ts`, `apps/web/src/lib/queries.ts` (useCatalog already returns the bundle)

- [ ] **Step 1:** `SofaConfigurator` resolves `effectiveDelta = resolveFabricDelta(fabric.tier, overrideForModel, fabricTierConfig)`; `unitPrice = sku.price + effectiveDelta`; write `attrs.fabric_tier = fabric.tier` ALONGSIDE the existing `fabric_id/fabric_name/fabric_surcharge` (set `fabric_surcharge = effectiveDelta` so the resolved number still rides → DraftLine/contract UNCHANGED). Safe fallback: missing config → delta 0 (P1). Pull `fabricTierConfig` + `modelFabricTierOverrides` from the catalog bundle (already fetched).
- [ ] **Step 2:** `catalog-index.ts` `fromPrice` for sofa = `min(sku.price) + min(resolveFabricDelta(fabric.tier, override, config) over the model's fabrics)`.
- [ ] **Step 3:** extend/adjust the existing configurator + catalog-index tests for the tier-delta path (P1=0 unchanged; P2/P3 add the delta; override wins).
- [ ] **Step 4:** web build/typecheck/test green (baseline). The DraftLine output for a P1 fabric (or no config) must be byte-identical to today.
- [ ] **Step 5: Commit** `feat(pos): sofa configurator + from-price resolve fabric-tier delta (P1 unchanged)`

---

### Task 5: Fabric maintenance UI (build from scratch) — per-model Fabrics panel + global delta card + per-model override

**Files:** Modify `apps/web/src/pages/catalog/modular/ProductModelDrawer.tsx` (add a Fabrics panel for sofa models) + the catalog Maintenance tab (global delta card); add hooks in `apps/web/src/lib/queries.ts` (`useUpdateSofaFabric` [missing], `useFabricTierConfig`/`useUpdateFabricTierConfig`, `useModelFabricTierOverride`/`useUpsertModelFabricTierOverride`); reuse existing `useCreateSofaFabric`/`useDeleteSofaFabric`.

- [ ] **Step 1:** add the missing `useUpdateSofaFabric` hook (PATCH route exists) + config + override hooks, with `qk` keys centralized.
- [ ] **Step 2:** ProductModelDrawer (sofa models only): a Fabrics sub-panel — list fabrics, add/edit (name + **tier dropdown P1/P2/P3** + legacy surcharge as an advanced/optional override) + soft-delete; the tier dropdown + a per-model "tier delta override (blank = use global)" two inputs are **principal-gated** (read-only for non-principal, like Phase 2).
- [ ] **Step 3:** a global "Fabric tier deltas" card (in the Maintenance tab): `sofa_tier2_delta` / `sofa_tier3_delta` numeric inputs, principal-gated, saving via the config hook. Show a small "P2 adds RMx, P3 adds RMy" summary.
- [ ] **Step 4:** component tests — render the Fabrics panel (principal can edit tier/deltas; non-principal read-only); global delta card saves.
- [ ] **Step 5:** web build/typecheck/test green.
- [ ] **Step 6: Commit** `feat(catalog): sofa fabric maintenance UI + tier/delta editors (principal-owned)`

---

### Task 6: deploy + green gate + Loo smoke
- [ ] Final green gate: shared+api+web build/typecheck/test at baseline. `grep -ri SERVICE_ROLE apps/web/dist` clean (§4.4).
- [ ] Deploy (Loo's go): api `wrangler deploy --env production` + web Pages. (0176 already applied in Task 1.)
- [ ] Loo smoke: principal adds a sofa fabric with tier P2 + sets global P2 delta → POS sofa configurator shows the +delta in the line price; P1 fabric unchanged; operation sees tier/deltas read-only. Update CLAUDE.md §17 + memory.

## Self-Review
- Spec coverage: 0176 schema (T1), shared+helper (T2), API config/override/tier (T3), POS apply (T4), maintenance UI (T5), deploy (T6). Option B exactly; sofa-only/selling-only/per-model-override/principal-owned.
- Contract safety: tier rides in attrs.fabric_tier; resolved delta folds into unitPrice (= fabric_surcharge pattern). DraftLine/orders zod/create_order UNTOUCHED. P1/no-config path byte-identical to today.
- Risks: building a whole fabric UI from scratch (0 fabrics today); config-absent fallback must be delta 0 not NaN; principal-lock consistency (deltas RLS-locked, tier UI-gated, DB tier-lock a follow-up); client-trust pricing is pre-existing (no drift gate v1).
