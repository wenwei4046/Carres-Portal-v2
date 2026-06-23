# Phase 2 — Cost/Sell Split (2990s-aligned foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Make the cost↔selling split visible & governed in Product Maintenance the 2990s way — principal ("Master Admin") owns the retail selling price, sees per-SKU cost + margin — as the foundation later phases (fabric-tier, combo, PWP) build on.

**Architecture:** Carres already has the 2990s cost/sell base in the DB: `product_skus.price` (numeric(12,2), the SELLING price; the frozen contract column read by POS/create_order/finance/PO) and `product_skus.cost` (numeric(14,2) nullable, added migration 0074; already wired through adapter/zod/catalog PATCH+POST but never shown in the Maintenance UI). This phase (a) surfaces cost + derived margin in Product Maintenance, (b) locks price+cost WRITES to principal (Master Admin) via a DB trigger + API gate, (c) clears the synthetic 55% cost backfill. Keep numeric money (NOT 2990s sen-integers — `price` is read everywhere; representation change would break the contract). fabric-tier (Phase 3) / combo (Phase 4) / PWP (later) are additive layers ON TOP and out of scope here.

**Tech Stack:** same as Phase 1. DB: Supabase (apply migrations via MCP per project convention).

## Global Constraints
- **`product_skus.price` stays the SELLING contract column** — additive only, never renamed/repurposed. POS/create_order/finance/PO read paths UNCHANGED. No POS change in this phase.
- **`product_skus.cost` is REUSED** (exists since 0074) — no new cost column. Already in zod (`productSkuPatchInput.cost`/`productSkuCreateInput.cost`) + catalog API PATCH `/skus` (L336) + POST `/skus` (L311). Surfacing cost in the UI needs ZERO schema/API change.
- **NO server-side price recompute / drift gate / anti-tamper** (Loo deferred; POS keeps client snapshot). NO PWP/combo/fabric-tier in this phase.
- **Principal = "Master Admin"** — no new role. Lock price+cost WRITE to `role='principal'`. Enforcement: DB trigger (security boundary per §4.3) + API-layer early-reject + UI hide for non-principal. Operation/finance/bd keep VIEW + non-price catalog edits (pos_active, description, modular, add-ons) but LOSE price/cost edit.
- **§7 (frozen schema):** the lock = a NEW migration `0175` (trigger + RLS as needed) — write it, explain it, get Loo's explicit OK in-conversation BEFORE applying to prod (staging=prod). The cost-clear = a §14 destructive UPDATE — explicit single-instance Loo confirm at apply time.
- **Margin is a PLAN margin** (price − catalog cost), not realized profit (realized = `purchase_order_lines.cost`, currently 0 PO rows). Label it so. **Sofa margin is base-only** (cost covers the base SKU, not the `sofa_fabrics.surcharge` axis) — label "base margin", don't show a wrong sofa margin.
- **Sentinels stay distinct:** `cost = null` ("cost not set"; Create-PO hard-blocks it) ≠ `price = 0` ("price not set"). Never coerce null cost → 0 (would fake-satisfy the Create-PO gate + mislead margin).
- Every phase ends green: web build + typecheck + web/api/shared test suites ≥ documented baselines (no new failures vs the 8 known pre-existing).
- Deployment manual + Loo-gated. Lucide-only/no-emoji; flame `#C44D2B`; v17 utilities.

---

### Task 1: Surface cost + margin in Product Maintenance (FE-only; 0 migration / 0 API)

**Files:**
- Modify: `apps/web/src/pages/catalog/tabs/SkuMasterTab.tsx` (add Cost column + Margin readout; extend the inline "Edit Prices" mode to also edit cost)
- Modify: `apps/web/src/pages/catalog/tabs/EditSkuModal.tsx` (add a Cost (RM) field beside Price; show derived margin)
- Modify: `apps/web/src/pages/catalog/tabs/NewSkuModal.tsx` (optional initial Cost field)
- Test: `apps/web/src/pages/catalog/tabs/SkuMasterTab.test.tsx` (or new) — cost render + margin compute + null-cost sentinel; EditSkuModal cost round-trip (closes LOW CF `catalog-web-component-tests`)

**Interfaces:**
- Consumes: existing `productSkuSchema.cost` (nullable), `usePatchCatalogSku` (PATCH `/skus` already persists `cost`), `productSkuFromRow` (already maps `cost`). NO new API.
- Produces: a `margin(price, cost)` helper (returns `{ amountRM, pct }` or null when cost is null) reused by grid + modal.

- [ ] **Step 1: Write the failing test** for a `skuMargin` pure helper: `skuMargin(price, cost)` → null when cost==null; `{amount: price-cost, pct: (price-cost)/price}` else; pct = 0 when price==0. Put helper in a small `apps/web/src/pages/catalog/margin.ts`.
- [ ] **Step 2: Run it, see it fail** (`pnpm --filter @carres/web test -- margin`).
- [ ] **Step 3: Implement `skuMargin`** minimally to pass.
- [ ] **Step 4: Run, see it pass.**
- [ ] **Step 5: Wire the UI** — SkuMasterTab: add a "Cost" column (render `cost==null` as a muted "—/not set", never 0) + a "Margin" column (`skuMargin`, show `RM x · y%`, muted when null); extend the inline Edit-Prices mode so the cost cell becomes a number input committing on blur via `usePatchCatalogSku` ({cost}). EditSkuModal: add a Cost (RM) number field (blank → null, not 0) beside Price + a live margin line. NewSkuModal: optional Cost. Label the margin "plan margin"; for sofa models label "base margin". Lucide icons; flame; v17 utilities.
- [ ] **Step 6: Component test** — render SkuMasterTab with a sku having cost=null (shows "not set", margin muted) and cost set (shows margin); EditSkuModal save sends `{cost}` via the existing patch. Run the web suite; baseline green.
- [ ] **Step 7: Build + typecheck** clean.
- [ ] **Step 8: Commit** `feat(catalog): surface SKU cost + plan margin in Product Maintenance (Master Admin cost/sell view)`

---

### Task 2: Lock price + cost WRITES to principal (Master Admin) — migration 0175 + API gate + UI

> **§7 GATE:** write the migration, then STOP and get Loo's explicit OK before applying to prod.

**Files:**
- Create: `supabase/migrations/0175_lock_sku_price_cost_to_principal.sql` (a `BEFORE UPDATE`/`INSERT` trigger on `product_skus` that RAISEs if `price` or `cost` is being changed and `(select auth.app_role()) <> 'principal'`; use the §8 InitPlan-wrapped, STABLE helper convention reading `auth.jwt()`)
- Modify: the catalog route `apps/api/src/routes/catalog.ts` — in PATCH `/skus` + POST `/skus`, reject `price`/`cost` fields with HTTP 403 unless the JWT role is `principal` (early, friendly error; the trigger is the real boundary per §4.3)
- Modify: `apps/web/src/pages/catalog/tabs/{SkuMasterTab,EditSkuModal,NewSkuModal}.tsx` — hide/disable the price + cost editors when the current role ≠ principal (read role from `useAuth`); keep them VIEW-only for operation/finance/bd
- Test: api `catalog.test.ts` — non-principal price/cost PATCH → 403; principal → ok. web — non-principal sees read-only price/cost.

**Interfaces:**
- Consumes: the JWT role (`auth.app_role()` / `useAuth().role`), §8 auth helpers.
- Produces: principal-only price/cost write enforcement at DB + API + UI.

- [ ] **Step 1: Write migration 0175** (trigger + any policy). Verify the live function signatures first (memory: `feedback_verify_pg_signature_before_create_or_replace`).
- [ ] **Step 2: STOP — present the migration + the access-change consequence to Loo; get explicit OK; then apply via Supabase MCP `apply_migration`.**
- [ ] **Step 3: API gate** — write failing api test (non-principal PATCH price → 403), implement the role check in catalog.ts, pass.
- [ ] **Step 4: UI gate** — non-principal: price/cost render read-only (no inline edit, no modal fields). Test.
- [ ] **Step 5: Build + typecheck + api/web suites** green at baseline.
- [ ] **Step 6: Commit** `feat(catalog): lock SKU price+cost writes to principal (Master Admin) — migration 0175 + API/UI gate`

---

### Task 3: Clear the synthetic 55% cost backfill to null

> **§14 GATE:** destructive prod UPDATE. Do this AFTER Task 1 ships (so principal can refill). Get Loo's explicit single-instance confirm at apply time.

- [ ] **Step 1: Confirm with Loo** (single-instance) + note 0 PO rows exist today (no live PO workflow to disrupt; Create-PO will require real costs once used).
- [ ] **Step 2: Apply via Supabase MCP** `execute_sql`: `UPDATE product_skus SET cost = NULL WHERE cost IS NOT NULL;` (record affected rows). No code change.
- [ ] **Step 3: Verify** the Maintenance UI now shows all costs as "not set"; no app errors.

---

### Task 4: Deploy + green gate + Loo smoke
- [ ] Build web; `grep -ri SERVICE_ROLE apps/web/dist` clean (§4.4); deploy per manual runbook on Loo's go.
- [ ] Loo smoke: principal sees cost + margin + can edit price/cost; operation sees them read-only; new SKU cost optional; null cost shows "not set".
- [ ] Update CLAUDE.md §17 + memory after merge.

## Self-Review
- Spec coverage: cost+margin surfaced (T1), principal-only lock (T2), backfill clear (T3), deploy (T4). 2990s-faithful cost/sell foundation; combo/fabric-tier/PWP deferred to later phases (additive on top).
- Risks: behaviour reversal (cost now visible — Loo-confirmed 2026-06-20); two cost writers (catalog + CreatePOModal) target one column, last-write-wins (acceptable; principal-lock narrows catalog side); margin is plan-not-realized + sofa base-only (labelled); null-cost vs 0-price sentinels kept distinct.
