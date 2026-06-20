# Sofa Custom-Cell / Compartment Engine — UNDERSTAND pass (read-only)

> Research artifact for the deferred "2990s sofa engine" initiative (chosen 2026-06-21, after Phase 4 combo). Produced by a parallel-reader workflow over the 2990s codebase (`C:\Users\wenwe\Projects\2990s`) + Carres's current sofa path. Reconciled with Loo's 2026-06-21 compartment-model clarification. **No code written. Scope NOT yet locked — Loo must pick A/B/C.**

## Loo's stated model (authoritative — 2026-06-21)
A sofa is **composed from compartments**, not a pre-listed flat SKU:
- **Compartment pool ("Base")** — the master list of all sofa segment/module types. 2990s has 26 (`Products → Maintenance → Sofa Compartments`): `1A(LHF)`=1 seat one left arm · `1A(RHF)` · `1B(LHF)`=1 seat left bench no right arm · `1NA`=1 seat no arms · `1S`=1 seat both arms · `2A(LHF)` · … Each compartment has its own **price** + a shape icon.
- Each sofa **Model ticks which compartments it offers** (a subset of the Base — 2990s subtitle "Models tick which they offer").
- Making a sofa = **assemble N compartments** from the model's offered set (e.g. a 10-compartment sectional).
- The sofa **SKU + price are composed from the chosen compartments** (sum of segment prices + base + fabric). "我沙发本身的 SKU 都是从 Component 那边拼凑过来的."
- **Bedframe deferred** — do sofa first. (2990s bedframe is size-based, not compartment-based.)

## What the 2990s engine actually does (lego sofa)
Drag compartment modules onto a plan-view room (600×480cm); edge-snap (~20cm); engine detects which adjacent modules form one connected sofa; validates arm-capping (both ends capped or can't order); auto-canonicalizes the shape; prices each connected sofa. **Price** = à-la-carte sum of modules + combo override if the shape matches a preset (2990s rule: use combo even if pricier) + recliner per-seat + fabric-tier delta + leg height/add-ons. Seat depth changes drawing width only, not price. One connected sofa = one cart line.

**Two architecture pillars in 2990s:** (a) pricing is a pure function `computeSofaPrice` run on BOTH front + back; (b) at order time the backend re-fetches prices + recomputes + **rejects if client price drifts >0.5%** (HTTP 400) — the "honest pricing" red line.

## Carres today (the gap)
Sofa = single-select dropdown, NOT lego assembly. `product_models` (sofa_mode preset/custom/both) + `product_skus` (variantKind preset/part) + `sofa_fabrics` (tier 0176) + fabric_tier config. "custom" = pick ONE part SKU. Pricing = one formula `unitPrice = sku.price + resolveFabricDelta(tier)`, **client-computed, backend NEVER recomputes** (stores client number verbatim into `order_lines.unit_price`). **Flat order model**: 1 cart line = 1 `order_lines` row, `attrs` = unvalidated free jsonb, no parent/child, no per-component split. 158 historical orders depend on this flat contract; sofa P1 path is byte-identical to old logic.
Good news: fabric-tier (0176) ≈ 2990s's `fabric_tier_addon_config`/`model_fabric_tier_overrides`; cost/sell split + principal Master Admin already groundwork; combo simple version (0177 fixed-set) exists.

## Architectural deltas (the big required changes)
1. **Server-recompute reversal** — flips the trust boundary across the WHOLE app. ⟶ **RECONCILED: Loo already ruled server-recompute OUT** (memory `project_pos_2990s_alignment`: "明确不做…server-recompute drift gate"). So sofa stays **client-priced** like everything else in Carres v1. **This kills the single biggest risk + pulls scope away from full-C parity.**
2. **Frozen order-contract impact (§7)** — a composed sofa must persist either as (a) parent line + child compartment rows (`order_lines.parent_line_id` or a new table + rewrite 0089 `create_order` + rework sofa↔mattress mutex), or (b) the whole compartment config-tree inside `attrs` jsonb (smaller change, but `attrs` must upgrade from free jsonb to a zod-validated structure; PO/procurement/partial-fulfilment can't read per-component). Either touches the frozen contract → §7 STOP + new migration + RLS audit + a compat path for the 158 old orders.
3. **Sofa product-model pivot** — from `product_skus` preset/part → a compartment pool (global) + per-model offered/opt-in + per-compartment pricing. SKU Master / catalog-index from-price / `configurators.tsx` all rework.
4. **Assembly UI** — either the full 2990s visual drag plan-view (geometry/snap/connected-detect/arm-cap/auto-canonical; 2990s uses CSS-modules + native pointer drag + 22 PNG silhouettes — explicitly NOT Tailwind/shadcn/react-dnd, conflicts with Carres style + §3 "copy logic not architecture") OR a structured compartment picker (no canvas).
5. **Combo depth gap** — 0177 is fixed-set; 2990s combo is effective-dated + per-slot OR-set + subset matching (Kuhn bipartite) + scope/override semantics. Only needed if combos must match assembled shapes.
6. **Unit-system trap** — 2990s integer MYR / centi / sen vs Carres numeric MYR. Rounding-bug risk on any port.

## Scope (orders of magnitude apart — Loo MUST pick)
- **A — no assembly** (keep current preset/part + the existing 0176 fabric-tier + 0177 fixed-set combo). Basically already shipped. ~0-1 phase, 0 migration, days. *(Contradicts Loo's compartment requirement — likely off the table.)*
- **B — structured compartment composition, client-priced, NO visual canvas**: compartment pool + per-model offered + per-compartment price + a picker to assemble + price = sum. Config-tree in `attrs` (validated), single order line. ~3-4 phases, ~2-4 migrations, no 0089 trust change. **Matches Loo's stated model + respects the no-server-recompute decision.** ~4-6 weeks-equivalent; main cost = compartment maintenance UI + the picker + SKU-Master rework.
- **C — full 2990s parity**: B + visual drag plan-view (geometry/snap/arm-cap) + subset/OR-set combo + (server-recompute is OUT so drop that part) + possibly parent/child multi-row. ~6-9 phases, ~8-12 migrations, crosses frozen contracts. 10-16 weeks-equivalent; "rewrite the sofa subsystem".

## Decisions for Loo (before any plan)
1. **Scope tier** (A/B/C) — pivotal; everything depends on it. Given his compartment requirement + server-recompute-out, the real fork is **B (structured picker)** vs **C-visual (drag plan-view room)**.
2. Order persistence — config-tree in `attrs` (B) vs parent+child rows (C). Affects §7 + 0089 RPC + downstream PO/finance.
3. Combo for assembled sofas — keep 0177 fixed-set, or upgrade to subset/OR-set matching?
4. Fabric tier — extend 0176 (recommended, don't rebuild) vs replace with 2990s columns. Seat-height price matrix — recommend NOT (keep depth display-only).
5. Which 2990s order path to mirror if porting — the **manufacturing per-module-SKU** path fits Carres's per-line-thread/PO/SO-Maintenance better than the older retail path.
6. UI/assets — port the framework-agnostic geometry (`sofa-build.ts`) + redo UI in shadcn, vs build a simpler picker; copy the 22 module PNGs vs redraw.

## Risks
- §7 frozen contract (parent/child or attrs-upgrade both touch it) — STOP + Loo approval + migration + RLS audit.
- 158 historical orders + P1 byte-identical promise — need a compat path.
- Server-recompute (already ruled out) is the real scope bomb — keep it out; do NOT let it creep back in.
- 2990s drag UI violates both style guides — faithful copy = style debt; port logic not architecture (§3).
- Unit mixing (MYR vs sen/centi) → rounding bugs.
- `sofa_fabrics.tier` not yet DB-locked (CF `fabric-tier-db-lock-sofa-fabrics-tier`) — becomes a price backdoor once pricing depends on it; add a 0175-style trigger.
- Scope creep: PIN/PWP/discount/server-recompute are tangled in the 2990s engine but explicitly OUT of scope — cut cleanly.

**Next step: Loo picks the scope tier (B-picker vs C-visual). Then brainstorm the order-persistence + combo + product-model decisions for that tier, then write the plan. Not before.**

---

## CONFIRMED — focused re-read of 2990s pricing/combo/variants/persistence (2026-06-21, Loo wants it IDENTICAL)
Loo chose **C-visual** (full drag builder). A 2nd targeted workflow read the exact 2990s code (file:line confirmed). Findings:

**Pricing precedence (`groupPrice`, sofa-build.ts:1283-1316):** matched **combo** > **bundle** > **custom à-la-carte** (sum of each placed module's master sell price).
- ⚠️ **PRECISION 1 (Loo confirmed rule, but key nuance):** a matched combo applies whenever it matches AND has price>0 — **EVEN IF the combo price is HIGHER than à-la-carte.** The old "only if cheaper" guard was DELETED on Chairman's 2026-05-30 ruling (`if (comboPriceMyr > 0) { basis='combo' }`, no cheaper check; stale "strictly cheaper" doc text at sofa-combo-pricing.ts:22-27 is dead — follow the code).
- ⚠️ **PRECISION 2:** combo price covers ONLY the matched subset. Final line = combo subset price + EXTRA modules beyond matched slots (full master price) + recliner/电动 extras (`basePrice = comboPrice + comboExtrasALaCarte; finalPrice = basePrice + reclinerExtra`, sofa-build.ts:1308-1316). Combos don't absorb piled-on modules.

**Combo matching (`sofa_combo_pricing` table, migrations 0090/0093; matchComboSubset, sofa-combo-pricing.ts:289-333):** a combo = base_model + `modules` jsonb (ORDERED LIST OF SLOTS, each slot = OR-set of acceptable compartment codes, e.g. `[["2A(LHF)","2A(RHF)"],["L(LHF)","L(RHF)"]]`) + tier(NULL=any) + customer_id(NULL=all) + prices_by_height jsonb + effective_from + deleted_at. Match = **SUBSET coverage via Kuhn's bipartite max matching**: matches iff every slot is fillable by a DISTINCT built module whose code ∈ that slot's OR-set. **Order-independent** (matches the set of codes, not canvas arrangement); **extras allowed** (built count may exceed slots). Multiple matches ranked customer+tier(4) > customer+any(3) > company+tier(2) > company+any(1), tie → newest effective_from. B2C passes customerId=null → only company-scope fires.

**PWB / 3D / GWB = verbal slips (grepped whole repo):**
- **PWB → PWP** (Purchase-With-Purchase / 换购): a promo — buy a trigger → buy a reward at special price; for sofas trigger+reward matched by combo; redeemed → charges `sofa_combo_pricing.pwp_prices_by_height` instead of selling price (pwp.ts, migrations 0128/0131). A promo mechanic, NOT a sofa variant.
- **GWB → GWP** (Gift-With-Purchase / 免费赠品): buy a Model → auto-adds a SEPARATE RM0 accessory line (model_default_free_gifts, migration 0174). Does NOT change the sofa price.
- **3D** = NOT a real variant. Likely "tier3_delta"/sofaTier3Delta misheard, or a doc phrase "3D matrix" (Model×Compartment×Depth) for an UNIMPLEMENTED depth-pricing feature. The real price knob it points at = **fabric-tier P2/P3 selling delta** (PRICE_1=+0; this DOES raise the sofa line). 
- Real sofa price knobs: à-la-carte module prices + combo override + fabric-tier P2/P3 delta (core); PWP/Promo/GWP/Free-Item-Campaign (promo layer, the "PWP & Promo" maintenance tab).

**Order persistence — 2990s EXPLODES (one SO line per compartment module SKU):** verified mfg-sales-orders.ts:2499-2563 + so-sofa-split.ts. POS cart = ONE entry per assembled sofa (SofaConfigSnapshot.cells[] = {moduleId,x,y,rot,recliners}). Server recomputes ONE authoritative build price (combo/PWP/fabric/recliner folded) + **0.5% drift gate**, THEN `splitSofaBuildIntoModuleLines` explodes each cell into its own `mfg_sales_order_items` row: item_code=`{BASE_MODEL}-{moduleCode}` (e.g. ANNSA-1A(LHF)); the build price is **distributed proportionally to each module's catalog price, residue-on-last so Σ === build total exactly**; `variants.cells` stripped, each row carries `variants={buildKey, cellIndex, x, y, rot}` to REGROUP into one visual sofa; build-level breakdown on the FIRST line only; fabric/depth/remark on every line. Storage table FLAT (no child table; the only "tree" = per-cell data in variants jsonb). Fallback: missing cells/base_model → legacy single line.

**"Combo explode" RESOLVED:** a combo is PURELY a pricing override, NOT a separate storage shape — the SO line stores NO combo_id (combos fetched only for price-matching at recompute). Both custom AND combo sofas explode through the SAME per-module split (residue-on-last); the only difference is whether the money distributed is the à-la-carte sum or the combo subset price (+extras+recliner). **This is EXACTLY Carres's 0177 combo explode-into-component-lines + residue-on-last pattern + an attrs group key (combo_key ≈ buildKey).** ⟹ The controller's "reuse the combo explode pattern" plan instinct MATCHES 2990s's real behavior. Carres's flat order_lines + attrs jsonb maps 1:1 (per-module rows + buildKey/cellIndex/geometry in attrs).

**The ONE divergence = server recompute + 0.5% drift gate.** 2990s does it (anti-price-fudge). Carres does NOT (Loo ruled it out). "一模一样" now collides with that earlier decision → **must re-confirm with Loo** (see below). Also PWP/GWP/Promo were earlier OUT of scope but Loo just referenced them → **scope of the promo layer must be confirmed.**

**Two decisions pending Loo before the plan:** (1) server recompute + drift gate — keep client-priced (his earlier call) or port 2990s's anti-fudge backend? (2) promo layer (PWP/GWP/Promo) — this initiative, or sofa-assembly+pricing first & promo later?
