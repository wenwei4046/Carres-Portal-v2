# Phase 8 Plan — PWP Voucher + Promo (2990s Products 9-tab parity, FINAL phase)

> The heaviest, last phase. This phase introduces the **first stateful, order-path-mutating feature** in the whole initiative — a voucher state machine (`RESERVED`/`USED`/`AVAILABLE`, cross-order carry-forward). Everything P1–P7 was config + read-only recompute. P8 is different in kind, not just degree. Plan accordingly: ship the safe, dormant, stateless slices first; gate the stateful voucher machine behind an explicit Loo go-ahead.
>
> Source: 6-agent parallel research + synthesis workflow `wf_0f2c079b-15a` (2026-06-28). 2990s ref = `C:\Users\wenwe\Projects\2990s`.

---

## 1. CONSOLIDATED UNDERSTANDING (the 2990s engine)

### 1.1 What "PWP & Promo" actually is

It is **NOT a voucher-code-editor**. The principal authors **rules** (a trigger category/model-set → a reward category/model-set, at a ratio). The runtime mints/reserves/redeems voucher codes **automatically**, server-side. There is no admin "generate code" or "code list" screen — codes surface only on the printed/confirmed SO. One admin tab in 2990s (`PwpRulesTab.tsx`) houses four mechanisms: PWP rules, Promo rules, Free Gifts (GWP), Free-Item Campaigns. **Carres already shipped the last two in P7.** The P8 gap is **PWP/Promo rules + the voucher-code layer**.

Two ways the same rule is consumed:
- **`resolvePwp` (pure, POS preview + in-cart toggle)** — decides which toggled reward lines get the PWP/promo price and binds each to a specific trigger unit. Same-cart only.
- **The voucher CODE path (`pwp-codes.ts` + claim loop)** — mints physical codes (`PWP-1234ABCD`) when a trigger enters the cart, lets a reward line claim one (same-cart auto-fill OR a manually-typed **cross-order** code), and locks them at Confirm. This is the stateful layer.

### 1.2 Data model

**`pwp_rules`** (2990s `0128`+`0129`+`0132`+`0145`+`0182`) — the rule definition:

| Concept | Columns |
|---|---|
| Trigger scope | `trigger_category`, `trigger_eligible_model_ids` jsonb ([]=whole cat), `trigger_combo_ids` jsonb (sofa), `trigger_size_codes` + `trigger_compartments` jsonb (0182 refinement) |
| Reward scope | `reward_category`, `eligible_reward_model_ids`, `reward_combo_ids`, `reward_size_codes`, `reward_compartments` |
| Ratio / flavour | `qty_per_trigger` int≥1, `type` text CHECK('pwp','promo') (absent=pwp), `active` bool |

Reward **price is NOT on the rule** — it lives per-SKU (`mfg_products.pwp_price_sen`, sofa: `sofa_combo_pricing.pwp_prices_by_height`). A `'pwp'` rule requires that price > 0 (a discount); a `'promo'` rule lets it stay 0 → **free**. `0129` dropped the one-active-per-pair unique index so multiple differentiated rules coexist per category pair. A statement-level trigger bumps a pricing version (Carres has no equivalent — skip; Carres uses the per-line drift gate instead).

**`pwp_codes`** (2990s `0130`+…) — the voucher, with `code` text **PRIMARY KEY** ("occupy the number"):

| Group | Columns |
|---|---|
| State | `status` text CHECK('RESERVED','USED','AVAILABLE') — **the state machine** |
| Ownership / cart | `owner_staff_id`, `cart_line_key` (delete-on-remove key), `trigger_item_code` |
| Reward snapshot (frozen at mint) | `rule_id` (SET NULL on rule delete), `reward_category`, `eligible_reward_model_ids`, `reward_combo_ids`, `type`, `reward_size_codes`, `reward_compartments` |
| Cross-order lineage | `source_doc_no` (earning SO), `redeemed_doc_no` (consuming SO), `redeemed_item_code`, `customer_id` (binding) |

Indexes only — `(owner_staff_id,status)`, `(cart_line_key)`, `(source_doc_no)`. **No unique constraint on redemption.** Double-spend prevention is purely atomic conditional UPDATEs. **No expiry/TTL** — AVAILABLE vouchers live forever. Trigger refinement is enforced **at mint only**; reward refinement is **snapshotted** onto the code so a later rule edit never invalidates an outstanding voucher.

### 1.3 The state machine (transitions)

1. **(none) → RESERVED** — trigger line added to cart. `POST /pwp-codes/reserve` mints `N = qty_per_trigger × qty` per matching active rule. **Idempotent per `cart_line_key`** (tops up / trims, never double-mints).
2. **RESERVED → DELETED** — trigger removed / qty reduced / cart cleared. Hard `DELETE` — RESERVED is the only deletable state.
3. **RESERVED/AVAILABLE → USED** — at order Confirm, a reward line carrying the code. Atomic claim: `UPDATE … SET status='USED', redeemed_doc_no=docNo … WHERE code=? AND status IN ('RESERVED','AVAILABLE')`. The `.in('status',[…])` predicate **IS** the double-spend guard — concurrent orders race, only one UPDATE matches.
4. **RESERVED → AVAILABLE (carry-forward)** — at Confirm, any RESERVED code on this order's triggers that was **not** applied → becomes a cross-order voucher, bound to `customer_id`, stamped `source_doc_no`.
5. **AVAILABLE → USED** — a later/different order redeems the carried voucher (same atomic claim; `source_doc_no` preserved via COALESCE; gated by customer binding).
6. **USED → prevStatus (rollback)** — any post-claim order failure restores `prevStatus`, nulls `redeemed_doc_no`/`redeemed_item_code`; idempotent via `WHERE status='USED'`.
7. **USED → USED (orphan self-heal)** — a code stuck USED pointing at a SO that was never inserted (a Worker crash between claim and rollback) can be re-claimed by matching the exact orphan row.

### 1.4 Engine signature + algorithm

```ts
// pure, no IO — POS preview + server share it
export function resolvePwp(rules: PwpRule[], lines: PwpLineInput[]): PwpGrant[]
```
For each rule: build a trigger-slot queue (each eligible trigger line contributes `qty × qtyPerTrigger` slots). A line is a trigger if category + model-list (empty=whole cat) + `passesRefinementColumns` match. **Promo one-way gate:** for `type:'promo'`, skip a trigger line that `isReward || pwpRequested`. Then iterate reward lines by idx, granting greedily, **whole-line all-or-nothing** (a line needing 2 with 1 slot left is dropped entirely), one rule per line, only when `pwpRequested && category/model/refinement match && remaining allowance covers full qty`. The grant binds `triggerRef = slots[cursor]`. Price substitution happens downstream (`pwp_price_sen` or 0-for-promo into the recompute), never inside `resolvePwp`.

### 1.5 Order-path claim/reserve/rollback flow (2990s create handler)

Strict ordering, **NOT one DB transaction** — atomicity is faked by conditional-UPDATE claims + manual `rollbackPwpClaims()` at ~14 failure exits:
1. Dropdown/validation 409 gate FIRST (leave nothing behind).
2. Resolve customer identity → `orderCustomerId`.
3. Prefetch all carried codes in ONE `.in()` query; read failure = retryable reject (burn nothing).
4. Per-line claim loop: dedup (one code → one redemption), qty===1, redeemability, reward-category match, customer binding, eligibility (sofa by combo-subset, non-sofa by model + price>0 unless promo), 0182 refinement, then the atomic claim. Successful claims → `claimedPwpCodes` + record granted price.
5. Hard 409 if ANY code refused (rollback first).
6. Recompute + drift gate using the granted prices as authoritative.
7. Insert SO header + items (each failure → rollback).
8. Confirm pass: (a) delete promo+RESERVED codes on reward lines (one-way backstop), (b) flip remaining RESERVED → AVAILABLE bound to customer, (c) re-stamp `trigger_item_code`.

### 1.6 Promo no-funding guards (5, plus client mirrors)

| # | Guard | Prevents |
|---|---|---|
| 1 | `pwp.ts:130` — promo trigger loop skips `isReward \| pwpRequested` | free unit funding another free unit (the infinite-free loop) |
| 2 | free-GIFT line never a trigger (`isFreeGift`) | **Carres already ported (P7)** |
| 3 | Confirm-time delete of promo+RESERVED codes on reward lines | persistence backstop for #1 (the "PWP-7615UAWC incident") |
| 4 | free line excluded from delivery charged-category set | **Carres already ported (P7)** |
| 5 | free line skips special delivery fee | **Carres already ported (P7)** |

**Net for P8: only guards #1 and #3 are new work** (the PWP/Promo voucher half). The gift/free-item half is done.

### 1.7 Admin + POS UI inventory

- **Admin:** a PWP/Promo rules list (pwp/promo grouped cards) + an editor (Kind chip pwp/promo · Trigger cat+models+sofa by-Combo/by-Model toggle+refinement · Reward cat+models+refinement · Ratio int≥1 · active). A **"PWP Price" column** in SKU Master (the per-SKU reward price). No name/code/max-qty on the rule.
- **POS:** an **"Insert PWP Code"** rail in the configure drawer (applied state + entry input + same-cart **Auto Fill** + cross-order **Apply** validate + error map), a redeemed-price preview, a cart-line "PWP price · from <trigger>" summary with qty locked to 1, and SO-confirmation rendering of earned/spent codes.

---

## 2. CARRES MAPPING

| 2990s piece | Carres mapping | Reuse / net-new |
|---|---|---|
| `pwp_rules` table | **NEW** `pwp_rules` (migration 0186), RLS copied verbatim from `0185_free_gifts.sql` (`read_all` = `auth.uid() IS NOT NULL`; `write_principal` = `(SELECT public.is_principal())` InitPlan-wrapped) | net-new table; RLS shape **reused** |
| Reward price `pwp_price_sen` per SKU | **NEW** `product_skus.pwp_price` numeric nullable (principal-only, mirrors the `cost` lock — likely needs a 0175-style trigger OR rely on existing principal write-gate). Sofa: `sofa_combo_pricing.pwp_prices_by_height` jsonb (mirrors P5's `cost_by_height`) | net-new columns; principal-lock pattern **reused** |
| `pwp_codes` table + state machine | **NEW** `pwp_codes` (migration 0187), but RLS is **harder** — needs owner-scoped + cross-order read (see §3) | net-new table; **the genuinely new RLS design** |
| `addons(key)` FK seeds | If a promo reward rides an `order_addon` we seed keys like 0184 did; but rewards more likely ride `order_lines.attrs.pwp` at a forced price (the free-item precedent), needing **no addon seed** | reuse 0184's seed pattern only if needed |
| `resolvePwp` pure engine | **NEW** `packages/shared/src/pwp.ts` — imports `passesRefinementColumns`/`refinementMatchesLine` from existing `rule-target.ts` (P6) | net-new pure module; **RuleTarget matcher reused verbatim** |
| `passesRefinementColumns` / combo subset | **REUSED** `packages/shared/src/rule-target.ts` (`lineMatchesTargets`, `refinementMatchesLine`, delegates to existing `matchSofaCombo` + `normalizeCompartmentCode`) | reused |
| `RuleLineInput` derivation | **REUSED** `apps/api/src/lib/rule-line-input.ts` `resolveSkuInfo(sb, skus)` → `{modelId,category,variant}` | reused |
| combo→slots map | **REUSED** `loadComboSlots` (free-gift-resolve.ts:135) / `loadComboModules` (delivery) server-side; `comboModulesMap` (free-line.ts) on POS | reused |
| Anti-tamper claim/validate template | **REUSED** `apps/api/src/lib/free-gift-resolve.ts` `validateFreeItemClaims` (strip client markers → re-derive identity → re-validate eligibility → force price → aggregate cap → 409 reject) | the **closest 1:1 template** for stateless PWP claim validation |
| Recompute lib structure (outcome union, dormant short-circuit, fail-closed read) | **REUSED** `apps/api/src/lib/delivery-fee-recompute.ts` shape | reused as the module skeleton |
| Order-route stage wiring | **NEW** stage(s) in `apps/api/src/routes/orders.ts` between line 375 (`finalLines` merge) and line 388 (`recomputeDeliveryFee`) — PWP discount must NOT change delivery basis, so the PWP-adjusted lines feed `recomputeDeliveryFee` | net-new wiring; **slot identified** |
| `create_order` RPC | **UNTOUCHED** — verified last redefined 0165, untouched by 0181/0184/0185. PWP rewards ride `order_lines.attrs.pwp` + a forced unitPrice through the blind insert loop | hard constraint held |
| Catalog bundle exposure | Add `pwpRules` to the GET `/api/catalog` `Promise.all` (catalog.ts ~:181) + `catalogResponseSchema.parse` with `.optional()` keys; **strip `pwp_price` / any principal-economic field for non-internal roles** before parse (the `combo-cost-pos-bundle-exposure` precedent) | bundle pattern reused; **new exposure-strip CF** |
| zod schemas + adapters + constants | **NEW** in `packages/shared/src/schemas/catalog.ts` (mirror `freeItemCampaignSchema`/Input), `adapters.ts` (`pwpRuleFromRow` mirrors `freeItemCampaignFromRow`), `tables.ts` (`PWP_RULES`, `PWP_CODES`) | reused patterns |
| Admin editor UI | **NEW** PWP section/tab in `apps/web/src/pages/catalog/tabs/PromoTab.tsx` (or a sibling `PwpTab.tsx` + new `"pwp"` TabKey in `ProductMaintenancePage.tsx`). The PWP editor is a **bespoke control set** (trigger/reward/ratio + sofa toggle) — 2990s does NOT reuse RuleTargetPicker for it; Carres can reuse `RuleTargetRefinementRow` for the inline size/compartment refinement only | bespoke editor; **refinement row reused** |
| SKU Master "PWP Price" column | **NEW** column in the existing SkuMaster grid (`apps/web/src/pages/catalog/...`), principal-gated like the `cost` column | net-new |
| React Query hooks | **NEW** `useCreate/Update/DeletePwpRule` in `apps/web/src/lib/queries.ts`, each `invalidateQueries(['catalog'])` (mirror `useCreateFreeItemCampaign` :4981-5035) | reused 1:1 |
| Voucher reserve/claim API | **NEW** `pwp-codes` route + `usePwpCodeSync`-style cart reconciler + Configurator "Insert PWP Code" rail + `markLineFree`-style transient-price apply (free-line.ts) | the **heaviest net-new** layer |

---

## 3. THE HARD PROBLEMS (ranked, riskiest first)

### H1 — Voucher reservation atomicity + RLS scope (HIGHEST)
The state machine has **no DB unique constraint**; double-spend is prevented solely by `UPDATE … WHERE status IN ('RESERVED','AVAILABLE') … .select().maybeSingle()` returning the row or not. **Carres's recompute reads through `userClient`/RLS, never service_role** (red line). The 2990s `pwp_codes` RLS is owner-scoped *and* needs cross-order reads (an AVAILABLE voucher earned by dealer A's customer must be redeemable on a later order). This is the **first table whose RLS must allow a write that mutates a row another session created** — every prior Carres table is read-all + principal-write or dealer-scoped-own-rows.

**Recommended approach:** Design `pwp_codes` RLS as: SELECT = `owner_staff_id = auth.uid()` OR `status='AVAILABLE'` (cross-order discovery) OR a SO-scoped read; UPDATE = the same predicate the atomic claim relies on. Critically — **the conditional-UPDATE claim must run under a policy that lets the claiming session mutate an AVAILABLE code it does not own.** If RLS blocks that, the claim silently returns 0 rows and the order can't redeem a legit voucher. Write a dedicated RLS test that proves: (a) dealer B can claim dealer A's customer's AVAILABLE code, (b) dealer B cannot delete/claim dealer A's RESERVED code, (c) the `.in('status',…)` predicate genuinely serializes two concurrent claims (test with two clients). Strongly consider that, because this is the one place a pure-RLS conditional UPDATE is fragile, **a `SECURITY DEFINER` claim RPC** (`pwp_claim_code(code, doc_no, item_code)` returning the claimed row or null) is the safer primitive — it keeps the atomic predicate in one audited place, is callable by `userClient`, and sidesteps RLS-vs-claim subtlety. This is the single most important design decision in P8.

### H2 — Rollback on order cancel (the 2990s known gap)
2990s's `PATCH status → CANCELLED` does **NOT** reverse `pwp_codes` — a USED voucher on a cancelled SO stays USED, and any AVAILABLE voucher the cancelled order minted stays live. Line-DELETE and TBC-swap paths DO release codes; whole-order cancel is asymmetric. This is the gap most likely to leak a "free" voucher.

**Recommended approach:** Carres should **fix this from day one** rather than inherit the bug. When a Carres order carrying PWP codes is cancelled/abandoned, reverse the voucher state: USED-on-this-SO → back to AVAILABLE (or delete if it was same-cart RESERVED→USED with no carry-forward), and AVAILABLE-minted-by-this-SO → delete. But note Carres's order lifecycle differs. **Smallest safe choice:** scope P8's first voucher slice to *same-cart only* (no cross-order carry-forward), so cancel reversal is trivial (codes were never carried forward; the order's RESERVED codes just get deleted with the cart). Defer cross-order + cancel reversal to a later slice gated on a real business need (see Open Decisions O1).

### H3 — Drift gate vs. forced-price reward (the sofa/free-item conflict, restated)
P7 already hit this: a free-item "Make Free" is **disallowed on a sofa-build line** because the sofa recompute uses an **absolute drift gate** — forcing unitPrice 0 would 422 `sofa_price_drift`. A PWP/promo reward forces a discounted/zero price the same way. So **a PWP reward on a sofa-BUILD line collides with the sofa drift gate** identically.

**Recommended approach:** Mirror P7's `free-item-sofa-build-disallowed` CF exactly. Order the pipeline so the PWP claim/validate runs *before* the sofa recompute and **rejects (409) any PWP claim on a line carrying `attrs.sofa_build`** (the free-gift-resolve.ts:302 precedent). A sofa can still be a *reward* via the **sofa-combo path** (`reward_combo_ids` → `sofa_combo_pricing.pwp_prices_by_height`) which prices the *combo* not the build, but a free-hand drag-built sofa line cannot itself be made a PWP reward in v1. Document as a CF. For non-sofa lines, the PWP-forced price must feed the *recompute* as authoritative (like 2990s passes `pwpBaseSen`), not be re-derived — but Carres's special-addon/delivery recomputes run on the post-PWP line set, so the forced price must be set on the line's `unitPrice` *before* those stages and treated as the trusted base.

### H4 — Cross-order carry-forward semantics for a B2C dealer model
2990s is a furniture retailer where a salesperson hands a customer a printed voucher to redeem on a future visit. Carres's business model (§17.4) is "Dealer just sells; customer pays HQ direct." Whether a Carres customer carries a physical/rule-driven voucher across orders is a **product question, not a technical one**. The cross-order machinery (AVAILABLE state, customer binding, validate-by-code, re-point-on-customer-reassign) is ~60% of the voucher complexity and ~80% of the risk.

**Recommended approach:** Treat cross-order as **out of scope for the first voucher slice** (see O1). Same-cart "buy X get Y at PWP price" covers the common "bundle promo" need with a fraction of the state risk (no AVAILABLE, no customer binding, no orphan-self-heal across orders, trivial cancel reversal). If Loo confirms cross-order vouchers are a real Carres need, build them as a separate, explicitly-gated slice (P8d) with the SECURITY DEFINER claim RPC from H1.

### H5 — Dormant-ship correctness
Every prior phase shipped byte-identical-when-dormant. PWP must too: no `pwp_rules`, no codes, no PWP claim on any line → the recompute returns the input lines unchanged *before* any `product_skus` read (the delivery `DORMANT short-circuit` precedent at delivery-fee-recompute.ts:142). Plus the **catalog-bundle exposure**: `pwp_price` is principal-economic and the POS price-preview *does* need it (to show the discounted price), so unlike `cost` it cannot simply be stripped for dealers — but the rule's internal margin/funding fields (if any) must be. Resolve which PWP fields the dealer POS legitimately needs vs. which leak (O3).

---

## 4. PROPOSED SUB-PHASE BREAKDOWN

Ordered smallest-safe-first. **P8a is fully dormant + stateless + reversible** — ship it, get Loo's smoke, then decide how far down the voucher path to go.

### P8a — Config + pure engine + admin UI (DORMANT, stateless) — LOW RISK
**Scope:** `pwp_rules` table + `product_skus.pwp_price` + `sofa_combo_pricing.pwp_prices_by_height`; pure `resolvePwp` (faithful 2990s port incl. the promo one-way guard #1, strict TDD against the 25 `pwp.test.ts` scenarios); admin PWP/Promo rules editor + SKU-Master PWP Price column; catalog-bundle wiring. **No voucher codes, no order-path change.** PWP price is authored + visible to the principal; nothing applies it yet.
**Migration(s):** 0186 (`pwp_rules` + the two price columns; RLS copied from 0185; principal-lock the price columns like `cost`).
**Files:** `supabase/migrations/0186_*`, `packages/shared/src/{pwp.ts, schemas/catalog.ts, adapters.ts, tables.ts}`, `apps/api/src/routes/catalog.ts` (bundle + CRUD route), `apps/web/src/pages/catalog/tabs/{PromoTab or PwpTab}.tsx` + `ProductMaintenancePage.tsx`, SkuMaster column, `apps/web/src/lib/queries.ts`.
**Acceptance:** principal authors a pwp + a promo rule + a PWP price; rules round-trip; `resolvePwp` unit tests green; non-internal catalog bundle does not leak any principal-only-and-POS-unneeded field; **orders are byte-identical (no PWP applied yet)**; full suite zero new failures.
**Risk:** LOW — additive, dormant, no state, no order-path.

### P8b — Stateless same-cart PWP/Promo apply (NO voucher codes) — MEDIUM RISK
**Scope:** apply the PWP/promo discount **within a single cart only**, the `validateFreeItemClaims` way — no `pwp_codes` table at all. A reward line carries `attrs.pwp = { ruleId }` (the free-item precedent); the server re-runs `resolvePwp` against active rules + the cart's lines, validates the claim is genuinely granted, forces the server-authoritative `pwp_price` (or 0 for promo), rejects ineligible/over-allowance claims with a typed 409, and **disallows a PWP claim on a sofa-build line** (H3). POS Configurator gets a "PWP / Promo" rail (toggle the reward at PWP price when a same-cart trigger exists) + cart preview + qty-lock. Promo no-funding guard #1 lives in `resolvePwp`; the server re-validation is the enforcement.
**Migration(s):** none (rides `order_lines.attrs.pwp`; `create_order` untouched).
**Files:** new `apps/api/src/lib/pwp-recompute.ts` (the `validateFreeItemClaims`-shaped lib), order-route stage in `orders.ts` (between :375 and :388, + strip `attrs.pwp` client price + a `PWP_*` addon-key strip if any), POS `apps/web/src/pages/dealer/pos/` apply helper + `CartDrawer`/Configurator rail.
**Acceptance:** in one cart, buying N triggers grants ≤ N×ratio rewards at the PWP/promo price; the (N+1)th reward reprices to full → drift-reject or hard-reject; a promo reward never funds another promo reward (one-way test); a forged `attrs.pwp` on an ineligible line → 409; a PWP claim on a sofa-build line → 409; no-claim orders byte-identical; POS preview price == server price.
**Risk:** MEDIUM — mutates the order path + forces prices, but **stateless** (no voucher rows, no cross-order, trivial rollback — a rejected order just isn't created). This delivers ~70% of the customer value (bundle promos) with none of the state-machine risk. **Recommended as the realistic P8 end-state unless Loo needs cross-order vouchers.**

### P8c — Voucher state machine + reserve/claim API (same-cart codes) — HIGH RISK
**Scope:** introduce `pwp_codes` but **same-cart only** — RESERVED on trigger-add, claimed at Confirm, deleted on cart-remove/cancel; **no AVAILABLE carry-forward**. This adds the reserve reconciler + the atomic claim + rollback machinery without cross-order complexity. Build the **SECURITY DEFINER `pwp_claim_code` RPC** (H1) as the atomic primitive. Promo backstop guard #3 (delete promo+RESERVED on reward lines at Confirm).
**Migration(s):** 0187 (`pwp_codes` table with owner-scoped RLS + the claim RPC). Seed no `addons` keys (rewards stay on `order_lines.attrs`).
**Files:** `apps/api/src/routes/pwp-codes.ts` (reserve/free/mine), claim loop + rollback in the order-route stage, POS `usePwpCodeSync`-style reconciler + Configurator "Insert PWP Code" rail (same-cart Auto Fill only), SO-confirmation code render.
**Acceptance:** reserve is idempotent per cart-line-key; trim/free on cart mutation leaks no codes; concurrent-claim test proves serialization; **order cancel reverses/deletes the order's codes (H2 fixed)**; orphan-self-heal recovers a Worker-crash-stranded code; rollback fires on every post-claim failure exit; dormant (no rules) → no codes minted → byte-identical.
**Risk:** HIGH — first stateful order-path feature; the reconciler + ~14 rollback exits + the RLS/RPC claim are all new and individually testable but collectively the riskiest code in the initiative.

### P8d — Cross-order carry-forward (AVAILABLE vouchers) — HIGHEST RISK, OPTIONAL
**Scope:** RESERVED→AVAILABLE at Confirm bound to `customer_id`; cross-order validate-by-code (`GET /pwp-codes/:code`); customer-binding gate; re-point on customer reassignment; the orphan-self-heal across orders. Only build if O1 says yes.
**Migration(s):** possibly 0188 (a partial unique index or `orders` link column to harden the single-use backstop — the `delivery-followup-integrity` CF lesson: a soft `attrs` read is non-atomic + RLS-scoped).
**Files:** extend `pwp-codes.ts` (validate/by-so), the Confirm-pass carry-forward, the POS cross-order "Apply" path.
**Acceptance:** a customer's AVAILABLE voucher redeems on a later order for the same customer only; a different customer is rejected; the voucher is single-use across concurrent orders (atomic); a cancelled redeeming order returns the voucher to AVAILABLE.
**Risk:** HIGHEST — the full 2990s machine. Defer behind explicit Loo go-ahead.

**Recommended order & smallest first slice:** Ship **P8a** first (dormant, reversible, low-risk — get a smoke + Loo's confidence). Then **P8b** (stateless same-cart apply) — this likely *is* the right Carres end-state. Only proceed to **P8c/P8d** if Loo confirms cross-order printed vouchers are a genuine Carres requirement. **Do not build P8c/P8d speculatively** — they carry the bulk of the risk for a use case Carres's B2C model may not need.

---

## 5. OPEN DECISIONS FOR LOO

**O1 — Cross-order carry-forward: in scope for Carres? (drives whether P8 stops at P8b or goes to P8d).**
2990s lets a salesperson hand a customer a printed voucher (`PWP-1234ABCD`) to redeem on a *future* visit. That AVAILABLE-voucher machinery is ~60% of the complexity and ~80% of the risk. Carres's model is "customer pays HQ direct, dealer just sells." **Default recommendation: NO cross-order for v1 — stop at P8b (same-cart bundle promos).** That covers "buy a mattress, get the bedframe at promo price in the same order" with zero voucher-state risk. If Loo wants the printed-voucher-redeem-later experience, we build P8c+P8d as explicitly-gated slices.

**O2 — Physical printed codes, or rule-driven auto-apply? (drives whether we need `pwp_codes` at all).**
If the answer to O1 is "same-cart only," we likely **don't need a code table at all** — the discount applies by rule the moment a matching trigger+reward sit in one cart (P8b). Codes only earn their keep when a voucher must travel across orders/sessions. **Recommendation: rule-driven auto-apply (no codes) unless O1 = yes.**

**O3 — PWP price exposure to dealers.**
The PWP/promo *discounted price* must reach the dealer POS (to show the customer the deal), so unlike `product_skus.cost` it can't be blanket-stripped from the catalog bundle. But the rule's *internal economics* (if we add any margin/funding/rebate field) would leak. **Decision needed:** do PWP rules carry any principal-only economic field beyond the customer-facing price? If not, no new strip is needed (just document a CF mirroring `combo-cost-pos-bundle-exposure`); if yes, we strip it for non-internal roles before `catalogResponseSchema.parse`.

**O4 — Relationship to the already-shipped Free Gifts (P7) / GWP.**
2990s's "New GWP" button and Carres's P7 `model_default_free_gifts` are the **same mechanism**. Confirm P8 does NOT re-implement GWP — it adds only the PWP (set-price) + Promo (free-via-code) flavours. The one genuinely-new no-funding guard is the promo one-way (`pwp.ts:130` + the Confirm backstop); the gift/free-item/delivery guards are already ported. **Recommendation: P8 scope = PWP rules + Promo rules only; GWP stays as-shipped.**

---

### Files cited (Carres, absolute, verified during research)
- `apps/api/src/routes/orders.ts` — recompute pipeline; **P8 insert point = between line 375 (`finalLines`) and line 388 (`recomputeDeliveryFee`)**; anti-tamper strip precedent at :404-405.
- `apps/api/src/lib/free-gift-resolve.ts:285-381` — `validateFreeItemClaims`, the **1:1 template** for stateless PWP claim/validate (strip markers, re-derive identity via `resolveSkuInfo`, re-validate eligibility, force price, aggregate cap, sofa-build 409 at :302).
- `apps/api/src/lib/delivery-fee-recompute.ts` — recompute lib skeleton (outcome union, dormant short-circuit, fail-closed read).
- `apps/api/src/lib/rule-line-input.ts` (`resolveSkuInfo`), `packages/shared/src/rule-target.ts` (`lineMatchesTargets`/`refinementMatchesLine`) — **reused matchers**.
- `supabase/migrations/0185_free_gifts.sql` — the **RLS + dormant-additive template** for 0186/0187.
- `packages/shared/src/tables.ts` — add `PWP_RULES`, `PWP_CODES`.
- `apps/web/src/pages/catalog/tabs/{PromoTab,RuleTargetPicker}.tsx`, `ProductMaintenancePage.tsx`, `apps/web/src/lib/queries.ts:4981-5035`, `apps/web/src/pages/dealer/pos/free-line.ts` — admin + POS reuse scaffolds.
- `create_order` RPC `supabase/migrations/0165_add_proceed_date.sql:25-184` — **UNTOUCHED** (verified).
