# Phase 4 — Combo / Set Pricing (simple fixed-set, UI-configurable) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Let the principal ("Master Admin") define a **combo** — a named set of specific SKUs (each with a qty) at one combo price — in Product Maintenance, and have the POS apply it: clicking a combo explodes it into its real component order lines with the combo price split across them. (The full 2990s sofa custom-cell configurator + base calc engine is explicitly DEFERRED to its own future project — Loo 2026-06-20.)

**Architecture:** Carres has ZERO combo concept and a FLAT order model (order_lines have no parent/group). A multi-piece order is already several independent lines. So a combo is a CATALOG-level definition (new `combos` + `combo_components` tables) that EXPLODES at add-to-cart into the existing `DraftLine[]`, splitting `combo_price` proportionally across the component lines' `unitPrice` (residue on the last line so Σ === combo_price exactly), stamping `attrs.combo_key` + `attrs.combo_label` on each so they group visually + never wrongly merge with standalone lines. This needs ZERO change to `orderLineInputSchema` / `create_order` / `order_lines` / `DraftLine` — `attrs` is free-form jsonb the RPC persists verbatim. Client-priced (like fabric-tier; NO server recompute — consistent with v1). Principal-owned, mirroring Phases 2-3.

**Tech Stack:** same as prior phases. DB via Supabase MCP. Loo decisions (2026-06-20): simple fixed-set (Option A); any-category; exact set; explode-into-component-lines (never a single combo line); client-priced; maintained as a 4th Product & Maintenance tab, principal-only.

## Global Constraints
- **Contract-safe / additive only (§7):** schema change = NEW migration `0177` (+ §7 note + Loo OK before apply). Do NOT change `DraftLine` (localId/sku/qty/attrs/unitPrice/label), `orderLineInputSchema`, `order_lines`, or `create_order`. Combo membership rides in `attrs.combo_key` + `attrs.combo_label`; the split price folds into the component lines' `unitPrice`.
- **Explode, never one-line.** A combo MUST become its real component `order_lines` (so operation PO-by-sku, stock/per-unit-id, supplier forecast, and finance all keep working unchanged). NEVER persist a combo as a single synthetic line.
- **Price split exactness:** split `combo_price` across components proportional to each component's catalog price × qty; put the rounding residue on the LAST line so `Σ(unitPrice×qty) === combo_price` to the cent. Unit-test this.
- **Client-priced, no server recompute** (v1). A combo is explicitly picked by the dealer (not auto-detected from a loose cart). Same accepted no-drift-gate posture as fabric-tier.
- **Respect the 0089 category mutex:** a combo whose components mix sofa with mattress/bedframe would be rejected by the existing `create_order` server mutex — so the combo editor must WARN at author time; no special server handling needed (the components are real category lines).
- **Principal owns combos:** `combos` + `combo_components` RLS = `is_principal()` for-all (mirror `floor_config`/0176); SELECT readable by authenticated. The Combos maintenance tab is principal-gated (read-only for others), like Phases 2-3.
- **Naming:** use `combo` everywhere. Do NOT use `bundle` (collides with operation `CrossOrderBundleSheet` = PO aggregation, and "catalog bundle" = the catalog API payload).
- Keep numeric money. One zod schema/two consumers; `qk` keys centralized; table-name constants. flame/Lucide/v17/no-emoji.
- Every phase ends green: shared+api+web build/typecheck/test ≥ baselines (8 known pre-existing fails; add none). Deployment manual + Loo-gated.

---

### Task 1: migration 0177 — combos + combo_components tables + RLS (§7 GATE: write, confirm, apply)

**Files:** Create `supabase/migrations/0177_combo_pricing.sql`

- [ ] **Step 1: Verify** `is_principal()` live signature (mirror 0176/floor_config RLS). Do NOT recreate it.
- [ ] **Step 2: Write the migration** (additive):
  - `CREATE TABLE public.combos ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), combo_key text NOT NULL UNIQUE, name text NOT NULL, combo_price numeric(12,2) NOT NULL CHECK (combo_price >= 0), active boolean NOT NULL DEFAULT true, effective_from date NOT NULL DEFAULT current_date, discontinued_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid );`
  - `CREATE TABLE public.combo_components ( combo_id uuid NOT NULL REFERENCES public.combos(id) ON DELETE CASCADE, sku text NOT NULL REFERENCES public.product_skus(sku) ON DELETE RESTRICT, qty int NOT NULL CHECK (qty > 0), sort_order int NOT NULL DEFAULT 0, PRIMARY KEY (combo_id, sku) );` (FK on `product_skus(sku)` — sku is UNIQUE/the join key; if no unique constraint on `product_skus.sku` exists, reference it as plain text + a comment, matching how order_lines.sku already references it as plain text. VERIFY whether `product_skus.sku` has a UNIQUE constraint before adding the FK; if not, store sku as plain text without the FK, like order_lines does.)
  - Enable RLS on both. SELECT: `(select auth.uid()) is not null`. ALL write: `(select public.is_principal())` USING + WITH CHECK. (Mirror 0176 exactly.)
  - Header comment: WHY (Phase 4 combo pricing), additive, principal-owned, client-priced (no server recompute), explode-at-cart model.
- [ ] **Step 3: STOP — present the migration SQL to Loo (additive, principal-owned, zero order-contract change); get OK; apply via Supabase MCP `apply_migration`.** Verify post-apply: 2 tables + RLS + the FK/constraint.
- [ ] **Step 4: Commit** `feat(catalog): migration 0177 — combos + combo_components tables (principal-owned)`

---

### Task 2: shared — combo types/schemas/adapters + explodeCombo split helper

**Files:** Modify `packages/shared/src/{db-types.ts, domain.ts, adapters.ts, schemas/catalog.ts, tables.ts}`; Create `packages/shared/src/combo.ts` (+ test)

**Interfaces:**
- Produces: `Combo` ({id, comboKey, name, comboPrice, active, effectiveFrom, components: ComboComponent[]}); `ComboComponent` ({sku, qty, sortOrder}); zod `comboSchema`/`comboCreateInput`/`comboPatchInput`; `catalogResponseSchema.combos?` (optional/additive). Pure `explodeCombo(combo, skuPrice: (sku)=>number): {sku, qty, unitPrice, comboKey, comboLabel}[]`.

- [ ] **Step 1 (TDD): write `combo.test.ts`** for `explodeCombo`:
  - Splits `comboPrice` proportional to each component's `catalogPrice×qty`; `Σ(unitPrice×qty) === comboPrice` EXACTLY (cents), residue on the LAST component.
  - e.g. combo RM2000, comp A (price 1200 ×1) + comp B (price 1000 ×1) → A≈1090.91, B≈909.09 (or residue-adjusted) summing to exactly 2000.00.
  - qty>1 handled; a component with catalogPrice 0 → gets 0 of the split (avoid div-by-zero; if ALL components are 0-price, split equally).
  - rounding: 2-decimal unitPrice; residue on last line absorbs the remainder.
- [ ] **Step 2:** run (fail) → implement `combo.ts` → run (pass).
- [ ] **Step 3:** add `ComboRow`/`ComboComponentRow` (db-types), `Combo`/`ComboComponent` (domain), `comboFromRow`/`comboComponentFromRow` (adapters), `comboSchema`/`comboCreateInput`/`comboPatchInput` (zod), `catalogResponseSchema.combos: z.array(comboSchema).optional()`, table constants `COMBOS`/`COMBO_COMPONENTS` (tables.ts).
- [ ] **Step 4:** `pnpm --filter @carres/shared test` + build/typecheck green.
- [ ] **Step 5: Commit** `feat(shared): combo types/schemas/adapters + explodeCombo price-split helper`

---

### Task 3: API — catalog GET returns combos; principal-gated combo CRUD

**Files:** Modify `apps/api/src/routes/catalog.ts` (+ test)

- [ ] **Step 1 (TDD):** api tests — GET `/api/catalog` includes `combos` (each with components, []); POST `/api/catalog/combos` (principal → 201, non-principal → 403); PATCH `/api/catalog/combos/:id` (principal-gated; name/price/active/components); DELETE/soft-delete (principal-gated). Use the mocked-Supabase pattern + the existing `principalOnly()` gate.
- [ ] **Step 2:** implement: GET bundles combos + their components (join or two queries → assemble `Combo.components`). Add principal-gated CRUD routes (reuse the 0175/0176 `principalOnly()` gate + user-JWT client + `parseJsonBody`). Component edits replace the combo's component set (delete+insert in the PATCH, or a dedicated sub-route) — keep it simple + atomic.
- [ ] **Step 3:** api tests + build/typecheck green (3 known pre-existing fails only).
- [ ] **Step 4: Commit** `feat(api): catalog returns combos; principal-gated combo CRUD`

---

### Task 4: POS — Combos in the catalog grid + explode into component DraftLines

**Files:** Modify `apps/web/src/pages/dealer/pos/CatalogStep.tsx`, `catalog-index.ts`, `apps/web/src/pages/dealer/new-order/draft.ts` (a combo-add helper, NOT the DraftLine shape), `apps/web/src/lib/queries.ts` (combos come in the catalog bundle)

- [ ] **Step 1:** Combos section in the catalog grid (a "Combos" rail entry / section listing combo cards: name + combo price + the component list). Clicking Add on a combo calls `explodeCombo` (Task 2) with the live sku price lookup, producing N `DraftLine`s (one per component) — each with the split `unitPrice`, `attrs.combo_key` + `attrs.combo_label` set, and merged into the cart via the existing `mergeLine` (the combo_key in attrs keeps them distinct from standalone lines). Show a toast.
- [ ] **Step 2:** CartDrawer: group the lines sharing a `combo_key` under the combo label (read-only grouping — removing one combo line could leave a partial combo; for v1, either remove the whole combo group together or allow per-line remove with a note — pick the simpler: a "Remove combo" that drops all lines with that combo_key). Keep the cart subtotal correct (it already sums lines).
- [ ] **Step 3:** combos come from `useCatalog()` bundle (already fetched) — thread them into CatalogStep; safe fallback if `combos` absent (no Combos section).
- [ ] **Step 4:** tests — explode produces correct split lines with combo_key; cart groups them; removing the combo drops the group. Existing POS tests stay green (a non-combo add is unaffected).
- [ ] **Step 5:** web build/typecheck/test green (baseline).
- [ ] **Step 6: Commit** `feat(pos): combos in catalog — explode into component lines with split price`

---

### Task 5: Maintenance UI — Combos tab (principal-only)

**Files:** Modify `apps/web/src/pages/catalog/ProductMaintenancePage.tsx` (add a 4th tab) + new `apps/web/src/pages/catalog/tabs/CombosTab.tsx`; hooks in `apps/web/src/lib/queries.ts` (`useCreateCombo`/`useUpdateCombo`/`useDeleteCombo`, `qk` centralized, invalidate catalog)

- [ ] **Step 1:** add the combo CRUD hooks (invalidate `["catalog"]` on success).
- [ ] **Step 2:** a 4th "Combos" tab in Product & Maintenance: list combos (name + price + component summary + active); a combo editor (name + combo price + add-component rows: pick a SKU from the catalog + qty; show the sum of component catalog prices vs the combo price so the principal sees the implied discount); soft-delete/active toggle. **Principal-gated** (read-only for non-principal, like Phases 2-3). **Author-time warning** if the chosen components would mix sofa with mattress/bedframe (0089 mutex would reject orders).
- [ ] **Step 3:** component tests — principal can create a combo + components; non-principal read-only; the sofa-mutex author warning shows.
- [ ] **Step 4:** web build/typecheck/test green.
- [ ] **Step 5: Commit** `feat(catalog): Combos maintenance tab (principal-only combo editor)`

---

### Task 6: deploy + green gate + Loo smoke
- [ ] Final green gate: shared+api+web build/typecheck/test at baseline; `grep -ri SERVICE_ROLE apps/web/dist` clean (§4.4).
- [ ] Deploy (Loo's go): api `wrangler deploy --env production` + web Pages. (0177 applied in Task 1.) Merge the Phase 4 branch to main via PR.
- [ ] Loo smoke: principal → Product Maintenance → Combos tab → create a combo (2 SKUs + a combo price); POS → Combos section → add the combo → cart shows the 2 component lines with split prices summing to the combo price; submit → order has the 2 real lines (with combo_key in attrs). operation sees Combos read-only. Update CLAUDE.md §17 + memory.

## Self-Review
- Spec coverage: 0177 schema (T1), shared+explode helper (T2), API CRUD (T3), POS explode (T4), Combos tab (T5), deploy (T6). Option A exactly; any-category fixed-set, explode-into-lines, client-priced, principal-owned.
- Contract safety: combo explodes into REAL component lines; combo info rides in attrs.combo_key/label; split folds into unitPrice. DraftLine/orders-zod/create_order/order_lines UNTOUCHED. PO/stock/finance unaffected (real per-sku lines).
- Risks: price-split rounding (residue-on-last, unit-tested); cross-mutex combo (author-time warning + server 0089 backstop); partial-combo cart removal (v1 = remove whole group); client-trust pricing pre-existing (no drift gate v1). Deferred: the full 2990s sofa custom-cell configurator + base calc engine (own future project).
