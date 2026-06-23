# Sofa Custom-Cell / Compartment Engine — Phased Roadmap (Carres = identical 2990s sofa behaviour, minus promo)

> Initiative chosen 2026-06-21 (after Phase 4 combo). Goal: reproduce the **2990s sofa engine IDENTICALLY** in Carres's stack (Tailwind+shadcn+supabase-js, NOT 2990s's CSS-modules+Drizzle — §3 copy logic not architecture). Research: `docs/superpowers/2026-06-21-sofa-engine-understand.md` (two read-only workflows, file:line-confirmed). **This is a ROADMAP — each phase gets its own detailed plan + SDD + the migrations go through the §7 gate. Bedframe deferred. Promo (PWP/GWP/Free-item) deferred to a future initiative.**
>
> **STATUS (2026-06-21): Phase 1 + Phase 2 + Phase 3 SHIPPED + LIVE.** P1 = PR #29 (migration 0178, compartment pool + per-model offered + Maintenance UI). P2 = PR #31 (migration 0179, the pricing engine + `sofa_combo_pricing` + explode helper). P3 = PR #33 (web-only, no migration, the visual drag builder: `sofa-geometry` + `CompartmentSilhouette` + `SofaBuildCanvas` + integration; deploy web `a267c6a1`, api unchanged). **Next = Phase 4 (Hono server-recompute + 0.5% drift-reject + explode the SofaBuildCanvas single line into per-compartment `order_lines`).** Deferred polish: group-drag/rotate, recliner per-seat.

## Locked decisions (Loo, 2026-06-21)
- **Scope = C-visual**: the full 2990s visual **drag plan-view room builder** (drag compartment modules, edge-snap, connected-sofa detection, arm-cap validation, auto-canonical shape, live price). NOT a structured picker.
- **Server recompute + 0.5% drift reject = YES** (anti-price-fudge — "identical" to 2990s). Reverses the earlier v1 no-recompute call, **scoped to SOFA builds only** (other order lines stay client-priced).
- **Promo layer (PWP=换购 / GWP=赠品 / Free-item / promo-as-combo) = DEFERRED** to a separate future initiative.
- **Pricing rule (confirmed against 2990s code):** matched **combo** > bundle > **custom à-la-carte** (sum of module master sell prices). A matched combo applies **even if pricier** (the "only if cheaper" guard was deleted 2026-05-30). Combo price covers ONLY the matched subset; extra modules beyond matched slots + recliner/电动 upgrades are added at full price. Fabric-tier P2/P3 delta adds on top (PRICE_1=+0).
- **Combo matching:** a sofa combo = base_model + ordered SLOTS (each slot = OR-set of compartment codes) + tier + prices(by seat height) + effective_from. Match = **subset coverage via Kuhn bipartite** (every slot filled by a distinct built module in its OR-set; order-independent; extras allowed). Company-scope only for B2C (customer_id null).
- **PWB/3D/GWB were verbal slips:** PWB→PWP, GWB→GWP (both promo, deferred), "3D"→the fabric-tier P2/P3 delta (already in 0176).

## Key architecture (de-risks the whole thing)
- **Order side reuses the Phase-4 combo EXPLODE pattern** (confirmed identical to 2990s `splitSofaBuildIntoModuleLines`): one assembled sofa → **explode into per-compartment `order_lines`** (item_code = `{BASE_MODEL}-{moduleCode}`), the build price **distributed proportionally to each module's catalog price, residue-on-last so Σ === build total exactly**. Each line's `attrs` carries `{ sofa_build_key, cell_index, x, y, rot, recliner, fabric_id, fabric_tier, depth }` so downstream (DO-pick / preview / returns) can **regroup** the modules into one visual sofa. Build-level extras on the first line only; fabric/depth on every line.
- **Server recompute lives in HONO, not the RPC** (Carres §4.3 — Hono enforces business rules): the client previews price via a **pure shared `computeSofaPrice`**; on submit Hono **re-runs the same function with FRESH DB prices**, drift >0.5% → 400 reject, then explodes into real per-module lines and calls the EXISTING `create_order`. ⟹ **`create_order` RPC + `order_lines` structure UNCHANGED; the frozen order contract is NOT surgically altered** (config rides in `attrs` free jsonb, like `combo_key`). §7 impact shrinks to **additive catalog tables only** (compartments + sofa_combo_pricing), same risk class as 0176/0177.
- **Pricing is ONE pure function, two consumers** (§9.5) — `computeSofaPrice(build, catalogSnapshot)` in `packages/shared`, run identically client (preview) + server (authoritative recompute).
- **Fabric tier: extend 0176** (`sofa_fabrics.tier` + `fabric_tier_addon_config` + `model_fabric_tier_overrides` already exist) — do NOT rebuild.

## Phases

### Phase 1 — Compartment foundation + Maintenance UI (additive migration) — ✅ SHIPPED 2026-06-21 (PR #29, migration 0178)
**Goal:** the compartment pool ("Base") + per-model offered set + per-compartment pricing + the Maintenance page Loo showed (`Products → Maintenance → Sofa Compartments`).
- **migration (§7 gate, additive):** `sofa_compartments` (id, code UNIQUE e.g. `1A(LHF)`, label, description, seat_count int, arm_config text, sort_order, icon_url, active, timestamps, updated_by) + `model_sofa_compartments` (model_id→product_models, compartment_id→sofa_compartments, offered bool, price numeric(12,2) [per-model sell price of that compartment for that model], cost numeric(12,2) null, PK(model_id, compartment_id)). RLS: read=authenticated, ALL write=`(select public.is_principal())` (mirror 0176/0177). Principal-owns pricing (consistent with 0175). NOTE: per-compartment price is per (model, compartment) — 2990s prices modules per base_model.
- **shared:** `SofaCompartmentRow`/`Dto`, `ModelSofaCompartment*`; zod schemas; adapters; `catalogResponseSchema.sofaCompartments?` + `.modelSofaCompartments?` (optional/additive); table constants.
- **API:** catalog GET returns the pool + per-model offered+priced rows; principal-gated CRUD for the pool + the per-model offered/price (reuse `principalOnly()` + `parseJsonBody`).
- **web:** a "Sofa Compartments" sub-page in Product & Maintenance (the pool list + edit, like the screenshot) + per-model "tick which compartments this model offers + set their price" (in ProductModelDrawer, sofa models only). Principal-gated (read-only others).
- **Done:** green at baselines; principal can define the pool + per-model offered/priced sets.

### Phase 2 — Pricing engine + sofa combo model (the money core; heavy TDD) — ✅ SHIPPED 2026-06-21 (PR #31, migration 0179, deploy api `1b3f8bd7`/web `5bfbaa9b`; plan `2026-06-21-sofa-phase2-pricing.md`)
**Goal:** the pure `computeSofaPrice` + the sofa-combo subset-matching + the explode/split helper.
- **migration (§7 gate, additive):** `sofa_combo_pricing` (id, base_model/model_id, slots jsonb [ordered list of OR-sets of compartment codes], tier text null, price numeric(12,2) [or prices_by_height jsonb — decide; recommend single price v1, height matrix deferred], effective_from date, discontinued_at, timestamps, updated_by). RLS principal-only. (This is the 2990s sofa-combo model — richer than 0177 fixed-set.)
- **shared (TDD):** `computeSofaPrice(build, snapshot)` — à-la-carte module sum + combo subset-match (Kuhn bipartite OR-set) override (even if pricier) + extras at full + recliner extra + fabric-tier delta. `matchSofaCombo(buildCodes, combos)` (Kuhn). `explodeSofaBuild(build, total, snapshot)` → per-module lines, residue-on-last (extend/share the combo `explodeCombo` split). Unit-test exhaustively: combo-override-even-if-pricier, extras-beyond-slots, residue-on-last Σ exact, fabric-tier, no-match→à-la-carte.
- **API:** catalog GET returns `sofaCombos`; principal-gated sofa-combo CRUD.
- **web:** sofa-combo maintenance (the "Combo Pricing" tab analog for sofa shapes — slots editor).
- **Done:** green; the pure function matches 2990s outputs on a battery of cases.

### Phase 3 — Visual drag-builder UI (web-only, no migration) — ✅ SHIPPED 2026-06-21 (PR #33, deploy web `a267c6a1`; plan `2026-06-21-sofa-phase3-builder.md`; group-drag/rotate + recliner deferred to polish)
**Goal:** the plan-view room builder, identical UX to 2990s, in Carres's stack.
- Port the **framework-agnostic geometry** from 2990s `sofa-build.ts` (edge-snap ~20cm, connected-component detection, arm-cap validation, auto-canonicalize) as pure TS in `packages/shared` or a web util. Do NOT copy 2990s's CSS-modules/pointer-drag DOM — rebuild the UI with Tailwind/shadcn + native pointer (or a light dnd) per §3/§10.
- Module **silhouette assets** (the per-compartment shapes) — copy from 2990s or redraw; store under web assets or the product-model-photos bucket.
- Live price preview via the Phase-2 `computeSofaPrice` (client). Arm-cap = can't add to cart until both ends capped (2990s rule).
- **Done:** green; a salesperson can drag-build a sofa, see snapping/connected/cap validation + a live price.

### Phase 4 — Server recompute + order integration (the trust gate)
**Goal:** submit a built sofa → Hono recompute + drift-reject → explode → persist via existing create_order.
- **Hono sofa-build submit path:** accept the `SofaBuildSnapshot` (cells + fabric + depth + client price); **re-run `computeSofaPrice` with fresh DB prices**; if `|client − server| / server > 0.5%` → **400 reject** (anti-fudge, identical to 2990s); else `explodeSofaBuild` → per-module `order_lines` (item_code, distributed price, attrs={sofa_build_key, cell_index, geometry, fabric, depth}); call the EXISTING `create_order` with those lines.
- **§7:** `create_order` RPC + `order_lines` structure UNCHANGED (config in attrs free jsonb). The only contract touch = the new sofa-build request schema (zod, in shared) + the attrs convention. Sofa↔mattress mutex (0089) still applies to the exploded category lines. **Compat:** the 158 historical orders + existing flat sofa lines are untouched (they don't carry sofa_build_key; readers treat no-build-key as a standalone line).
- **Done:** green; submitting a built sofa creates the correct per-module lines summing to the recomputed price; a tampered client price is rejected.

### Phase 5 — Downstream regroup + cutover
**Goal:** operation/PO/finance/SO-Maintenance/DO-picking handle exploded sofa lines; deploy.
- Regroup exploded sofa lines by `sofa_build_key` for display/preview (operation order detail, SO Maintenance, DO-pick, returns). PO-by-sku/per-line-thread already work per-module (that's the point).
- Decide coexistence/migration of the existing ~4 flat sofa SKUs + `sofa_mode` preset/part (keep as legacy, or migrate to compartments).
- Final green gate (shared+api+web), SERVICE_ROLE scan, deploy api+web, Loo live-smoke, docs + memory.

## §7 gates (each STOPs for Loo before apply)
P1 `sofa_compartments` + `model_sofa_compartments` · P2 `sofa_combo_pricing`. Both additive (0176/0177 risk class). P4 touches NO schema if attrs stays free jsonb (the recompute/explode is Hono-side) — confirm at P4.

## Risks
- Server recompute is scoped to sofa builds (Hono-side) — keep it from creeping into a global trust-model change.
- Geometry port: copy LOGIC not 2990s's CSS/DOM (§3). Faithful UX, Carres styling.
- Unit mixing: 2990s integer MYR/sen/centi vs Carres numeric MYR — the shared `computeSofaPrice` must work in integer cents internally + return numeric MYR (like `explodeCombo`).
- `sofa_fabrics.tier` not yet DB-locked (CF `fabric-tier-db-lock-sofa-fabrics-tier`) — once pricing depends on tier, add a 0175-style trigger (fold into P1 or P2).
- 158 historical orders + sofa P1 byte-identical: the no-build-key fallback path must keep them rendering + un-repriced.
- Seat-height price matrix + per-customer combo scope: 2990s has them; recommend v1 = single combo price + company-scope only (defer height matrix + customer scope). Confirm in the P2 plan.

## Open sub-decisions for the per-phase plans (not blocking the roadmap shape)
- Compartment price: per-(model,compartment) [recommended, matches 2990s per-base-model] vs a single pool price.
- sofa_combo price: single number (v1) vs prices_by_height jsonb (2990s) — recommend single, defer height.
- Recliner/电动 upgrade pricing: per-seat add (2990s) — confirm Carres has the data or add it.
- Existing flat sofa SKUs: legacy-coexist vs migrate.

**Next: Loo approves this SHAPE → write the detailed Phase 1 plan → SDD Phase 1. Migrations go through §7 each time.**
