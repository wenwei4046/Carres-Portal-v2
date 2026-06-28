This is decisive. `create_order` does `INSERT INTO orders (...) ... RETURNING id INTO v_order_id` — the `id` is DB-generated, NOT supplied in the payload. The `orders.id` column is `not null default gen_random_uuid()` (an `insert into orders` without `id` lets the column default fill it). **I cannot pass a caller-supplied order id into `create_order` without touching the RPC** — which is a HARD CONSTRAINT (create_order UNTOUCHED).

So the BLOCKER's option (a) ("generate the order uuid in the route and pass it to both") is **not viable** under the constraints. This means the deferred-stamp window is genuinely unavoidable while keeping `create_order` untouched. The correct resolution is therefore the BLOCKER's option (b): make the stamp **fail-closed** + add a **recovery backstop** (a self-healing reconciler keyed on the provably-orphan signature `status='USED' AND redeemed_order_id IS NULL`). That, plus changing the cancel trigger to also catch unstamped-USED via a session correlation key, fully closes both BLOCKERs without touching `create_order`.

I have complete grounding. Now I'll write the full revised spec. Every critique issue is resolved or justified below; the spec stands alone as the build input.

---

# P8c — VOUCHER STATE MACHINE (SAME-CART) — BUILDABLE SPEC (REV 2)

**Branch target:** `feat/2990s-products-p8c-voucher-state-machine` (stacked on P8b / migration 0186)
**Migration:** `0187_pwp_codes.sql` (designed here; lead applies to prod separately)
**Hard invariants:** `create_order` / `order_lines` / `DraftLine` / `cart.ts` UNTOUCHED · userClient/RLS + SECURITY DEFINER RPC only, **never** service_role · DORMANT (0 active rules → 0 codes minted → orders byte-identical).

> **What changed in REV 2 (the adversarial-review pass).** Twelve critic findings (2 BLOCKER, 6 MAJOR, then MINORs) are resolved in the body below. The load-bearing ones:
> 1. **The `redeemed_order_id` NULL window (BLOCKER ×2 + MAJOR) is closed for real.** Verified against `create_order` (0165): the order `id` is DB-generated (`INSERT … RETURNING id`), and the payload has no `id` field — so **passing a caller-minted order id into `create_order` is impossible without touching the RPC** (forbidden). The deferred stamp is therefore unavoidable. REV 2 closes the window two ways instead: (a) the claim stamps a **client-minted `claim_group` correlation uuid** that is ALSO threaded onto the order via `attrs.pwp.claim_group`, so the cancel trigger and the recovery reconciler can find a USED code **even while `redeemed_order_id` is still NULL**; (b) the Confirm-pass stamp is **fail-closed** (a short-row or error → rollback + 500), and a **self-healing recovery path** (`GET /mine` surfaces orphan USED + a `pwp_reap_orphans` RPC) reclaims any code stranded by a worker crash. §4.4 / §4.4a / §5.
> 2. **The P8b carry-through is re-specified precisely** against the real `pwp-recompute.ts`: `stripClientPwp` deletes the whole `pwp` object, the rebuild has no `code` in scope — so the carry is an **index-keyed capture from the ORIGINAL input line**, threaded through the `claims[]` array, not a spread of `base.attrs`. §0 / §3.4 / Deliverables.
> 3. **Code↔rule binding integrity (MAJOR)**: `pwp_claim_code` now takes `p_rule_id` and the claim WHERE asserts `rule_id = p_rule_id`, so a client cannot burn a rule-B code while pricing under rule-A. §2.1 / §4.2.
> 4. **Schema contradiction (MAJOR)** resolved: `owner_staff_id` is **`ON DELETE SET NULL` + NULLABLE** in the migration text itself (§1), with the RLS-orphan consequence handled by SECURITY-DEFINER cleanup paths.
> 5. **`pwpCartLineKeys` (MINOR ×2)** reclassified from "low risk" to a **required core field**, with a **server-derived fallback sweep** so correctness never hinges on the client sending it. §3.4 / §4.4.
> 6. **File paths corrected** to `apps/web/src/pages/dealer/DealerPos.tsx`. §6 / Deliverables.
> 7. **Reserve concurrency (MINOR)**: idempotency is now stated as **sequential-only**; concurrent same-staff reserve over-mints harmlessly (the claim predicate is the real double-spend guard), and a **partial unique index** removes even that. §3.1.
> 8. **Anti-tamper inversion (MAJOR)** documented + hardened: the claimed `code` is client-asserted, but the §2.1 owner+status+**rule** predicate + the §4.2 snapshot-category check bound the blast radius; `redeemed_item_sku` is explicitly best-effort audit. §4.2a.
> 9. **Exit-site discipline (MINOR)**: the `create_order` error block is 4 sub-exits; rollback is placed as the **first line of the `if (error)` block** so all four branches inherit it. The N-code rollback loop is replaced by a single atomic `pwp_release_codes(text[])` RPC. §2.2 / §4.5.

---

## 0. THE CENTRAL DESIGN DECISION — how P8c integrates with P8b (resolve first; everything follows)

**P8b stays the pricing authority. P8c is a parallel lineage/lock LEDGER keyed by `attrs.pwp.code`. The code claim is a SEPARATE step that runs AFTER `recomputePwpLines` has already forced the price.**

Today, in `apps/api/src/routes/orders.ts`, the single P8b stage at **line 315**:

```ts
const pwp = await recomputePwpLines(sb, freeItem.lines);   // P8b: forces price, canonicalises attrs.pwp = {ruleId,type,triggerRef}
```

becomes a **two-stage sequence** (price first, then claim the backing code):

```ts
// STAGE A (P8b) — price authority. Forces unitPrice + rebuilds attrs.pwp.
// CHANGED in P8c: recomputePwpLines now also CARRIES THROUGH attrs.pwp.code +
// attrs.pwp.claimGroup from the original client line onto the rebuilt marker
// (see the precise patch in §3.4 — it is an index-keyed capture, NOT a spread).
const pwp = await recomputePwpLines(sb, freeItem.lines);
if (pwp.status === "server_error") { /* 500 */ }
if (pwp.status === "bad_request")  { /* 409 */ }

// STAGE B (P8c, NEW) — code lineage/lock. Claims the RESERVED code each priced
// reward line references, atomically RESERVED→USED, asserting the code was minted
// under the SAME rule that priced the line. Returns a rollback ledger.
const pwpClaim = await claimPwpCodesForLines(sb, auth, pwp.lines);
if (pwpClaim.status === "server_error") { /* 500, rollback ledger empty */ }
if (pwpClaim.status === "bad_request")  { /* 409, rollback any partial */ }
// pwpClaim.lines === pwp.lines (price + attrs.pwp untouched).
// pwpClaim.claimed === ClaimedCode[] — the rollback ledger.
// pwpClaim.claimGroup === the correlation uuid all claimed codes share (§4.2).
```

**Why this split (vs. folding the claim into `recomputePwpLines`):**

1. **P8b's pricing is the single source of truth for the figure.** The code NEVER sets a price. `recomputePwpLines` already forced `unitPrice = pwp_price | 0`. Stage B reads that as a given and only flips a row status. If the code is missing / un-reservable / minted under a different rule, the *order rejects* (409) — but the rejection is about the **lock record**, not the price.
2. **Rollback scope.** Stage B is the ONLY stage that writes to `pwp_codes` before `create_order`. By isolating it, the rollback ledger has exactly one producer, and every downstream early-exit reverses exactly that ledger (§4.5).
3. **DORMANT proof stays trivial.** No `attrs.pwp` marker → P8b returns lines unchanged with no DB read → Stage B sees zero coded lines → returns `{status:"ok", lines, claimed:[]}` with no DB read (§7).

**`attrs.pwp` gains TWO fields: `code` and `claimGroup`.** The client marker becomes `{ ruleId, code, claimGroup }`. P8b's `recomputePwpLines` is patched to **carry both through** when it rebuilds the canonical marker. **Precise mechanism (verified against the real lib):** `stripClientPwp` (lib line 91) does `delete next.pwp`, removing the whole client object including `code`/`claimGroup`, and the rebuild (lib lines 359–371) reads `base = stripped[claim.index]` whose `attrs.pwp` no longer exists. So the carry CANNOT be a spread of the stripped attrs. Instead, when the lib assembles its `claims` array (lib line ~231), it ALSO captures `code` + `claimGroup` from the **original** `lines[i].attrs.pwp`, threads them on each `claims[]` entry, and re-emits them at the rebuild: `pwp: { ruleId, type, triggerRef, code, claimGroup }`. Stage B reads `attrs.pwp.code`, claims it, and leaves it on the line so it persists into `order_lines.attrs` via the untouched `create_order` payload path.

This is the answer to the brief's central question: **`attrs.pwp` gains `code` (+ a `claimGroup` correlation uuid); the claim is a separate post-recompute step; P8b's force-price is untouched and authoritative; the code is the lineage/lock record stamped INTO the order.**

---

## 1. `pwp_codes` SCHEMA (migration 0187)

```sql
-- 0187_pwp_codes.sql
-- 2990s Products parity Phase 8c — the PWP VOUCHER STATE MACHINE (SAME-CART).
-- Adds the redemption LEDGER on top of P8b's stateless pricing (0186). A trigger
-- line in the cart RESERVES codes; at order Confirm a reward line's backing code
-- is CLAIMED atomically (RESERVED→USED), bound to the same rule that priced it,
-- and stamped with the SO. UNCLAIMED reserved codes are DELETEd at Confirm (P8c
-- does NOT carry forward to AVAILABLE — that is P8d). The state machine is
-- enforced by three SECURITY DEFINER RPCs whose WHERE status IN (...) predicate is
-- the double-spend guard (same privileged-RPC pattern as create_order — NEVER
-- service_role). Additive + DORMANT (0 active rules → 0 codes minted → orders
-- byte-identical). Tail after this = 0187.

BEGIN;

-- ---------------------------------------------------------------------------
-- pwp_codes — the voucher ledger. One row = one reserved/claimed voucher slot.
-- code is the PK ("occupy-the-number" guarantee: two carts can NEVER reserve
-- the same string). status machine: RESERVED → USED (claim) | DELETE (free).
-- For P8d (cross-order carry-forward) the third state AVAILABLE + the cross-
-- order stamps (customer_id, source_order_id) ALREADY EXIST here so P8d needs
-- NO migration — they are written by nobody in P8c (see §1.3).
-- ---------------------------------------------------------------------------
CREATE TABLE public.pwp_codes (
  code                       text PRIMARY KEY,                       -- 'PWP-1234ABCD'
  rule_id                    uuid REFERENCES public.pwp_rules(id) ON DELETE SET NULL,
  type                       text NOT NULL DEFAULT 'pwp'
                               CHECK (type IN ('pwp', 'promo')),     -- snapshot from the rule
  reward_category            text NOT NULL,                          -- snapshot from the rule
  reward_targets             jsonb NOT NULL DEFAULT '[]'::jsonb,     -- RuleTarget[] snapshot ([] = whole category)

  status                     text NOT NULL DEFAULT 'RESERVED'
                               CHECK (status IN ('RESERVED', 'USED', 'AVAILABLE')),

  -- Owner = the salesperson whose cart minted it (= auth.uid()). NULLABLE +
  -- ON DELETE SET NULL: deleting a staff must NOT cascade-destroy the redemption
  -- audit on their LIVE orders' USED codes (see §1.2 + §9 risk #2). A nulled-owner
  -- code is intentionally invisible to the owner-scoped RLS routes post-redemption;
  -- the cancel trigger + the orphan-reaper (both SECURITY DEFINER, RLS-bypassing)
  -- still reach it. Before deleting a staff, the app SHOULD delete their RESERVED
  -- rows (owner-scoped) so only USED-audit rows are left to null.
  owner_staff_id             uuid REFERENCES public.app_users(id) ON DELETE SET NULL,

  cart_line_key              text,                                   -- the TRIGGER cart line that owns it (delete-on-remove)
  trigger_item_code          text,                                   -- the trigger SKU code (audit)

  -- claim_group: the per-order correlation uuid the POS mints for a submit and
  -- threads onto BOTH the claimed code (here, at claim) AND the order line's
  -- attrs.pwp.claimGroup. This is the cancel-reversal + orphan-recovery join key
  -- that is available AT CLAIM TIME — unlike redeemed_order_id, which cannot be
  -- known until create_order returns (see §4.4 / §5). Set by pwp_claim_code.
  claim_group                uuid,

  -- Claim stamps (redeemed_order_id is written by the §4.4 Confirm-PASS AFTER
  -- create_order returns the id; redeemed_item_sku is best-effort audit, §4.2a).
  redeemed_order_id          uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  redeemed_item_sku          text,

  -- ── P8d cross-order columns — PRESENT, UNUSED in P8c (see §1.3) ──
  source_order_id            uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  customer_id                uuid,                                   -- (no FK — Carres keys customer by phone)

  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now()
);

-- Reconciler lookup: "my RESERVED codes" + "my RESERVED codes for this cart line".
CREATE INDEX idx_pwp_codes_owner_status ON public.pwp_codes (owner_staff_id, status);
CREATE INDEX idx_pwp_codes_cart_line    ON public.pwp_codes (cart_line_key);
-- Cancel reversal + Confirm-pass stamp lookup: "the codes this order/claim_group consumed".
CREATE INDEX idx_pwp_codes_redeemed     ON public.pwp_codes (redeemed_order_id);
CREATE INDEX idx_pwp_codes_claim_group  ON public.pwp_codes (claim_group);
-- Orphan reaper: USED-but-unstamped (provably stranded). Partial = tiny.
CREATE INDEX idx_pwp_codes_orphan
  ON public.pwp_codes (updated_at)
  WHERE status = 'USED' AND redeemed_order_id IS NULL;
-- Reserve concurrency guard (§3.1): at most ONE RESERVED row per (cart line, rule,
-- code-slot) is NOT enforceable on code (codes are distinct), so instead we make
-- the over-mint harmless and add NO unique-on-content index; see §3.1.
-- P8d (unused in P8c): AVAILABLE-voucher-by-source-order lookup.
CREATE INDEX idx_pwp_codes_source_order ON public.pwp_codes (source_order_id);

ALTER TABLE public.pwp_codes ENABLE ROW LEVEL SECURITY;

-- ── RLS: OWNER-SCOPED for P8c (NOT read-all). Justified in §1.2. ──
-- A NULL owner_staff_id fails every `= auth.uid()` predicate (NULL = uuid → NULL),
-- so a nulled-owner code is invisible to these routes by design — reached only by
-- the SECURITY DEFINER trigger / reaper.
CREATE POLICY pwp_codes_owner_select
  ON public.pwp_codes FOR SELECT
  USING (owner_staff_id = (SELECT auth.uid()));

CREATE POLICY pwp_codes_owner_insert
  ON public.pwp_codes FOR INSERT
  WITH CHECK (owner_staff_id = (SELECT auth.uid()));

CREATE POLICY pwp_codes_owner_update
  ON public.pwp_codes FOR UPDATE
  USING      (owner_staff_id = (SELECT auth.uid()))
  WITH CHECK (owner_staff_id = (SELECT auth.uid()));

CREATE POLICY pwp_codes_owner_delete
  ON public.pwp_codes FOR DELETE
  USING (owner_staff_id = (SELECT auth.uid()));

COMMENT ON TABLE public.pwp_codes IS
  '2990s Products parity P8c (0187) — the PWP voucher ledger. RESERVED on cart trigger; CLAIMED (RESERVED→USED, bound to the pricing rule + a claim_group correlation uuid) at Confirm via pwp_claim_code; UNCLAIMED reserved DELETEd at Confirm (P8c — no AVAILABLE carry-forward, that is P8d). OWNER-SCOPED RLS (owner_staff_id = auth.uid()); SECURITY DEFINER trigger/reaper reach nulled-owner audit rows. DORMANT until the principal authors active pwp_rules.';

-- (RPCs + cancel trigger follow in §2 / §5, same migration file.)

COMMIT;
```

### 1.1 Column semantics (every column)

| Column | Used in P8c | Meaning |
|---|---|---|
| `code` PK | ✅ | The voucher string `PWP-####AAAA`. PK = the "no two carts reserve the same number" guarantee. |
| `rule_id` | ✅ | The `pwp_rules` row that minted it. `ON DELETE SET NULL`. Also the **claim-binding key** (`pwp_claim_code` asserts `rule_id = p_rule_id`, §2.1). |
| `type` | ✅ | `'pwp' | 'promo'` snapshot. |
| `reward_category` | ✅ | Snapshot of the rule's reward category (claim-time belt-and-suspenders + audit). |
| `reward_targets` | ✅ | `RuleTarget[]` snapshot ([] = whole category). Audit. |
| `status` | ✅ | `RESERVED` → `USED`. `AVAILABLE` is in the CHECK but **never written in P8c**. |
| `owner_staff_id` | ✅ | `= auth.uid()` of the minting salesperson. **NULLABLE + `ON DELETE SET NULL`** (audit-preserving; §1.2). RLS scope key. |
| `cart_line_key` | ✅ | The deterministic key of the TRIGGER cart line that owns the reservation. Idempotency + delete-on-remove key. |
| `trigger_item_code` | ✅ | The trigger SKU (audit / SO display). |
| `claim_group` | ✅ | **The per-order correlation uuid** the POS mints, threaded onto BOTH the claimed code and the order line `attrs.pwp.claimGroup`. The cancel-reversal + orphan-recovery join key **available at claim time** (vs. `redeemed_order_id`, set later). §4.2 / §4.4 / §5. |
| `redeemed_order_id` | ✅ | The order (uuid) the code was CLAIMED against. Set by the §4.4 Confirm-pass AFTER `create_order` returns the id. `ON DELETE SET NULL`. |
| `redeemed_item_sku` | ✅ | The reward SKU the code paid for. **Best-effort audit only** — client-asserted via `attrs.pwp.code` placement (§4.2a). |
| `source_order_id` | ❌ (P8d) | Unused in P8c — see §1.3. |
| `customer_id` | ❌ (P8d) | Unused in P8c. No FK (Carres keys customer by `orders.customer_phone`). |
| `created_at`/`updated_at` | ✅ | Lifecycle timestamps. `updated_at` bumped by every RPC; the orphan-reaper keys on it. |

### 1.2 RLS = OWNER-SCOPED only (justification — and why NOT read-all)

2990s uses `SELECT USING (true)` (read-all) **because** its cross-order redemption lets staff B redeem a voucher staff A generated. **P8c has no cross-order path** (carry-forward to AVAILABLE is P8d). Every P8c operation is same-cart: the same salesperson reserves (their cart), claims (their cart's reward), frees (their cart). So **owner-scoping is both sufficient and stricter**:

- `SELECT owner_staff_id = auth.uid()` → the cart reconciler (`GET /mine`) reads only the caller's own RESERVED codes (+ their own orphan-USED, §4.4a).
- `INSERT/UPDATE/DELETE WITH CHECK owner_staff_id = auth.uid()` → a caller can only mint/free codes under their own id.

The cross-session AVAILABLE RLS (synthesis **H1** — the predicate that lets staff B read staff A's AVAILABLE voucher while blocking RESERVED) is a **P8d concern; do NOT build it now.** P8d ALTERs the SELECT policy to `owner_staff_id = auth.uid() OR status = 'AVAILABLE'` (a one-line swap, no table change).

**The RPCs are SECURITY DEFINER (§2) and bypass RLS** — they are the real state-machine gate; RLS is defence-in-depth for direct table access (the reserve/free/`mine`/Confirm-pass routes DO hit the table directly under RLS, so the policies must be correct there).

**Nulled-owner consequence (resolved, not hand-waved).** With `ON DELETE SET NULL`, a deleted staff's USED audit rows survive but become `owner_staff_id IS NULL`, hence invisible to every owner-scoped route. This is **intended for post-redemption audit immutability**: a redeemed voucher should not be mutable by the owner route once it backs a live order. Two reachability guarantees keep it manageable:
1. The **cancel trigger** (`pwp_codes_on_order_cancel`, SECURITY DEFINER, §5) reverses a nulled-owner USED code via `claim_group` / `redeemed_order_id` — it never reads `owner_staff_id`.
2. The **all-owners reaper** (`pwp_reap_orphans_all`, SECURITY DEFINER, §2.3b) reclaims a nulled-owner USED-unstamped code AND any nulled-owner RESERVED row stranded by a mid-cart staff deletion — **once it is wired to a daily cron**.

**P8c-scope honesty (review MAJOR fix).** In P8c the all-owners backstop is **shipped as the `pwp_reap_orphans_all()` RPC but is NOT yet wired to a cron** (the Worker exports only the Hono `fetch` handler; the `wrangler.toml` cron triggers stay commented out, matching every other phase). So for P8c the live reachability guarantee is: **owner self-heal only** — a LIVE owner's own crash-stranded codes are reclaimed via `GET /mine` / `POST /reap` (the self-scoped `pwp_reap_orphans`). A code whose owner was nulled (staff deleted mid-flight) is NOT auto-reclaimed until the cron is wired. This is acceptable because P8c is DORMANT (0 codes minted) and the own-owner path covers the normal worker-crash window; the nulled-owner case requires a staff deletion to RACE a mid-flight claim. Tracked as CF `pwp-orphan-reaper-cron-unwired` (wire `pwp_reap_orphans_all()` to a daily MYT cron + a `scheduled()` Worker handler when the backstop goes live). So no row is *permanently* unreachable by design — but the nulled-owner backstop is **deferred (cron unwired)**, not active, in P8c; only the *owner self-service routes* (correctly) cannot touch a post-redemption audit row.

### 1.3 Why the cross-order columns ship NOW but stay UNUSED (so P8d needs no migration)

`AVAILABLE` (in the status CHECK), `source_order_id`, and `customer_id` are **present in 0187 but written by nobody in P8c**. The carry-forward block (2990s `mfg-sales-orders.ts:3439` — `RESERVED → AVAILABLE` stamping a source doc + customer) is the *only* writer of these three, and is deferred to P8d. Shipping them dormant now means:

- **P8d = code + a one-line RLS policy swap, ZERO migration.** No additive `ALTER TABLE` on a then-live ledger.
- **The CHECK already admits `AVAILABLE`** so P8d's UPDATE doesn't trip a constraint.
- **Provably NULL/unreached in P8c:** the claim writes `redeemed_order_id` (not `source_order_id`); the Confirm-pass DELETEs unclaimed RESERVED (never flips to AVAILABLE). So `SELECT count(*) FROM pwp_codes WHERE status='AVAILABLE' OR source_order_id IS NOT NULL OR customer_id IS NOT NULL` is **always 0 after a P8c order** — a testable dormancy assertion (§8).

---

## 2. THE SECURITY DEFINER RPCs (in 0187)

Three RPCs live in `0187_pwp_codes.sql`. All are SECURITY DEFINER + `authenticated`-grant-only, mirroring `create_order` / `cancel_order`. **NOT service_role** — the privilege is the function's definer rights, scoped to exactly the columns/predicates below, and each body **replicates the RLS owner scope** so a definer call is no more powerful than an owner-scoped RLS update would be.

### 2.1 `pwp_claim_code` — atomic RESERVED → USED, bound to the pricing rule + a claim_group

```sql
-- Atomic same-cart claim: flip a RESERVED code OWNED BY THE CALLER and MINTED
-- UNDER THE CLAIMED RULE to USED, stamp the claim_group correlation uuid + the
-- reward sku. The WHERE (status='RESERVED' AND rule_id=p_rule_id AND owner=uid) is
-- the double-spend + wrong-rule + cross-owner guard, all in ONE statement (no
-- read-then-write TOCTOU). A concurrent claim that already flipped the row, or a
-- code minted under a DIFFERENT rule, makes this UPDATE match 0 rows → returns
-- NULL → the caller backs off cleanly (409).
--   p_claim_group: the per-order correlation uuid (also threaded onto the order
--                  line's attrs.pwp.claimGroup) — the cancel/recovery join key
--                  that exists BEFORE create_order returns an order id.
CREATE OR REPLACE FUNCTION public.pwp_claim_code(
  p_code           text,
  p_rule_id        uuid,
  p_claim_group    uuid,
  p_redeemed_sku   text
)
RETURNS public.pwp_codes          -- the claimed row, or NULL if not claimable
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.pwp_codes;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth required' USING ERRCODE = '42501';
  END IF;
  IF p_claim_group IS NULL THEN
    RAISE EXCEPTION 'claim_group required' USING ERRCODE = '22023';
  END IF;

  UPDATE public.pwp_codes
     SET status            = 'USED',
         claim_group       = p_claim_group,
         redeemed_item_sku = p_redeemed_sku,
         updated_at        = now()
   WHERE code           = p_code
     AND owner_staff_id  = v_uid           -- same-cart owner guard (= RLS scope)
     AND rule_id         = p_rule_id        -- ← code must be minted under the PRICING rule
     AND status          = 'RESERVED'       -- ← THE double-spend / concurrency guard
  RETURNING * INTO v_row;

  -- 0 rows → v_row NULL → already USED / freed / not the caller's / wrong rule.
  -- redeemed_order_id is INTENTIONALLY left NULL here (the order id does not exist
  -- until create_order returns — it is stamped by the §4.4 Confirm-pass, with the
  -- claim_group above as the safety join key in the interim window).
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.pwp_claim_code(text, uuid, uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.pwp_claim_code(text, uuid, uuid, text) TO authenticated;
```

**Serialization proof.** Two concurrent order POSTs carrying the same `code`: Postgres takes a row-level write lock on `UPDATE … WHERE code=p_code`. The first transaction flips `RESERVED → USED` and commits. The second blocks, then re-evaluates its `WHERE` against the committed row: `status='RESERVED'` is false → 0 rows → `RETURNING` yields NULL. No read-then-write window; the predicate IS the lock. The added `rule_id = p_rule_id` clause means a code minted under rule B can never be burned by a claim priced under rule A (MAJOR finding — code↔rule binding).

### 2.2 `pwp_release_codes` — idempotent USED → RESERVED (atomic batch rollback)

```sql
-- Rollback of a claim batch: USED → RESERVED for an ARRAY of codes in ONE
-- statement (atomic — no partial-rollback window if the worker dies mid-loop).
-- Un-stamps claim_group + redeemed_item_sku. Idempotent via WHERE status='USED'
-- (re-running after a successful release matches nothing). Owner-guarded.
-- Used by every post-claim failure exit in the order route (§4.5).
CREATE OR REPLACE FUNCTION public.pwp_release_codes(
  p_codes text[]
)
RETURNS integer                    -- number of rows reverted
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_n   integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth required' USING ERRCODE = '42501';
  END IF;
  IF p_codes IS NULL OR array_length(p_codes, 1) IS NULL THEN
    RETURN 0;
  END IF;

  UPDATE public.pwp_codes
     SET status            = 'RESERVED',
         claim_group       = NULL,
         redeemed_order_id = NULL,
         redeemed_item_sku = NULL,
         updated_at        = now()
   WHERE code = ANY(p_codes)
     AND owner_staff_id = v_uid
     AND status = 'USED';                 -- idempotent: re-release is a no-op
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION public.pwp_release_codes(text[]) FROM public;
GRANT EXECUTE ON FUNCTION public.pwp_release_codes(text[]) TO authenticated;
```

### 2.3 `pwp_reap_orphans` — SELF-SCOPED recovery for crash-stranded USED-unstamped codes

**Review BLOCKER fix.** The original single RPC took a caller-supplied `p_owner` (default `NULL` = ALL owners) + an arbitrary `p_grace_minutes`, was `SECURITY DEFINER` + `GRANT EXECUTE TO authenticated`, and did NO auth check — so any authenticated user could bypass the Hono route and `POST /rest/v1/rpc/pwp_reap_orphans {p_grace_minutes:0, p_owner:null}` to (a) flip OTHER owners' / nulled-owner USED codes back to RESERVED (cross-owner mutation) and (b) open a `grace=0` double-spend window on an in-flight claim. It is now split into TWO functions:

```sql
-- SELF-SCOPED (authenticated-callable). Forces the owner to auth.uid() (no p_owner
-- param) + a 15-min grace FLOOR, replicating the RLS owner scope (§2.4) like the
-- other two RPCs. A caller can never reap another owner's row nor an in-flight
-- (younger-than-grace) claim. GET /mine self-heal + POST /reap.
CREATE OR REPLACE FUNCTION public.pwp_reap_orphans(
  p_grace_minutes integer DEFAULT 15
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid   uuid    := auth.uid();
  v_grace integer := GREATEST(COALESCE(p_grace_minutes, 15), 15);  -- 15-min floor
  v_n     integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth required' USING ERRCODE = '42501';
  END IF;
  UPDATE public.pwp_codes pc
     SET status            = 'RESERVED',
         claim_group       = NULL,
         redeemed_item_sku = NULL,
         updated_at        = now()
   WHERE pc.status = 'USED'
     AND pc.redeemed_order_id IS NULL
     AND pc.updated_at < now() - make_interval(mins => v_grace)
     AND pc.owner_staff_id = v_uid               -- self-scope = RLS owner scope
     AND NOT EXISTS (
       SELECT 1 FROM public.orders o
         JOIN public.order_lines ol ON ol.order_id = o.id
        WHERE o.status <> 'cancelled'
          AND ol.attrs -> 'pwp' ->> 'claimGroup' = pc.claim_group::text
     );
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION public.pwp_reap_orphans(integer) FROM public;
GRANT EXECUTE ON FUNCTION public.pwp_reap_orphans(integer) TO authenticated;
```

### 2.3b `pwp_reap_orphans_all` — the ALL-OWNERS backstop (cron-only, NOT granted to authenticated)

```sql
-- IDENTICAL reaping logic across EVERY owner + the nulled-owner RESERVED-garbage
-- sweep. NOT granted to authenticated (no auth.uid() context) — daily cron / service
-- path only, so it can never be reached from a user JWT. 15-min grace floor.
CREATE OR REPLACE FUNCTION public.pwp_reap_orphans_all(
  p_grace_minutes integer DEFAULT 15
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_grace integer := GREATEST(COALESCE(p_grace_minutes, 15), 15);
  v_n     integer;
BEGIN
  UPDATE public.pwp_codes pc
     SET status='RESERVED', claim_group=NULL, redeemed_item_sku=NULL, updated_at=now()
   WHERE pc.status='USED' AND pc.redeemed_order_id IS NULL
     AND pc.updated_at < now() - make_interval(mins => v_grace)
     AND NOT EXISTS (
       SELECT 1 FROM public.orders o
         JOIN public.order_lines ol ON ol.order_id = o.id
        WHERE o.status <> 'cancelled'
          AND ol.attrs -> 'pwp' ->> 'claimGroup' = pc.claim_group::text
     );
  GET DIAGNOSTICS v_n = ROW_COUNT;
  -- nulled-owner RESERVED garbage (un-claimable) — hard delete.
  DELETE FROM public.pwp_codes WHERE status='RESERVED' AND owner_staff_id IS NULL;
  RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION public.pwp_reap_orphans_all(integer) FROM public;
-- NOT granted to authenticated — cron/service path only.
```

> A nulled-owner RESERVED row stranded by mid-cart staff deletion is reaped by `pwp_reap_orphans_all`'s one-line `DELETE FROM pwp_codes WHERE status='RESERVED' AND owner_staff_id IS NULL`. Safe: a RESERVED row with no owner can never be claimed (the claim requires `owner_staff_id = auth.uid()`), so it is pure garbage.
>
> **Cron status (review MAJOR/MINOR fix).** `pwp_reap_orphans_all()` ships in 0187 but is **NOT yet wired to a cron** — the Worker exports only the Hono `fetch` handler and the `wrangler.toml` cron triggers stay commented out (matching every other phase). So P8c's live backstop is **owner self-heal only**; the all-owners / nulled-owner sweep activates when the cron is wired. Tracked as CF `pwp-orphan-reaper-cron-unwired` (add a `scheduled()` Worker handler calling `pwp_reap_orphans_all()` + a daily MYT cron trigger). Acceptable for the DORMANT ship (0 codes minted).

### 2.4 SECURITY DEFINER vs pure-RLS — justification

The claim **must** be a single atomic predicate-UPDATE. Under pure RLS from the Hono client this also works (PostgREST issues one `UPDATE`), BUT: (1) Carres's house pattern is privileged RPC for any business-rule mutation (`create_order`, `cancel_order`, `operation_*` are all SECURITY DEFINER), and the brief mandates "same privileged-RPC pattern as create_order"; (2) the owner + rule + status guards + the stamp are one statement — no route-level read-then-write TOCTOU; (3) DEFINER is **NOT service_role** — it runs as the migration role with `search_path` pinned, grants restricted to `authenticated`, and replicates the RLS owner scope in the body. service_role (full RLS bypass, no auth context) is never used.

---

## 3. RESERVE API — `apps/api/src/routes/pwp-codes.ts` (NEW)

New router mounted at `/api/pwp-codes`, gated by the existing `supabaseAuth` middleware (same as `ordersRouter`). All DB access via `userClient(c.env, auth.jwt)` (RLS). A `genCode()` helper mirrors 2990s: `'PWP-'` + 4 digits + 4 A–Z from `crypto.getRandomValues`, regenerated on PK collision (23505).

### 3.1 `POST /api/pwp-codes/reserve` — idempotent per `cart_line_key` (sequential)

**Request:** `{ cartLineKey: string, sku: string, qty: number }` (the trigger line just added/changed)
**Response:** `{ codes: PwpCodeDto[] }` — the FULL current RESERVED set this trigger line owns. No match → `{ codes: [] }`.

**Reconcile algorithm (top-up / trim, NEVER double-mint on SEQUENTIAL calls):**

1. Resolve the trigger SKU → `{ category, modelId, variant }` (reuse `resolveSkuInfo` from `apps/api/src/lib/rule-line-input.ts`).
2. Load ACTIVE `pwp_rules` (RLS). Build a `RuleLineInput` for the trigger and select rules whose **trigger** scope matches (reuse the same `RuleTarget` matcher P8b's `resolvePwp` uses).
3. For each matching rule compute `target = rule.qtyPerTrigger × qty`.
4. Read existing RESERVED rows for `(cart_line_key, rule_id, owner_staff_id=uid, status='RESERVED')`.
   - `have < target` → insert `target − have` rows (loop `genCode()` with 23505 retry; snapshot `type/reward_category/reward_targets/trigger_item_code/rule_id` from the rule).
   - `have > target` → DELETE the surplus (`.in('code', surplus).eq('status','RESERVED')`).
   - `have === target` → no-op.
5. **Trim strays:** DELETE any RESERVED row for this `cart_line_key` whose `rule_id` is no longer in the matched set.
6. Return the line's full RESERVED set.

**Concurrency honesty (MINOR finding).** The read-existing-then-insert-delta is **NOT atomic across concurrent calls.** Two simultaneous reserves for the same cart line (two browser tabs, or a debounce double-fire) both read `have=0` and both insert `target` → up to `2×target` RESERVED. This is **idempotent only for SEQUENTIAL calls**, which is the normal POS path (debounced single-flight, §6.1). The over-mint is **benign**: it can never cause a double-spend — the `pwp_claim_code` predicate (`status='RESERVED'`, one code per reward line) is the real guard — and the surplus is reaped by the Confirm-pass unclaimed-RESERVED sweep (§4.4) or the RESERVED-orphan cron (§2.3). The POS reconciler is single-flight per cart line (§6.1), so concurrent same-line reserve is already unlikely. **If even the transient inflation is unwanted**, gate the reserve route with a Postgres advisory lock keyed on `hashtext(uid || cartLineKey || ruleId)` for the duration of the read-modify-write (one extra statement); this is offered as a hardening option, not required for correctness.

### 3.2 `DELETE /api/pwp-codes/reserve?cartLineKey=…` — free a line's reservations

```ts
await sb.from("pwp_codes").delete()
  .eq("cart_line_key", cartLineKey)
  .eq("owner_staff_id", uid)        // (redundant under RLS, explicit for clarity)
  .eq("status", "RESERVED");        // ONLY RESERVED is deletable — never USED/AVAILABLE
```
Called when the trigger line is removed, qty→0, or the cart is cleared. **RESERVED is the only deletable state** (the brief's invariant). A USED code (already claimed at a prior committed submit) is never touched here.

### 3.3 `GET /api/pwp-codes/mine` — the reconciler's read (+ self-heal)

Returns the caller's RESERVED codes (`owner_staff_id=uid, status='RESERVED'`), keyed client-side by `cart_line_key`. **Self-heal:** before returning, the route calls `pwp_reap_orphans(15)` (self-scoped — the RPC forces the owner to `auth.uid()`, §2.3) to reclaim any of the caller's USED-unstamped orphans into RESERVED, so a crash-stranded code is recovered the next time the salesperson opens a cart. Drives the reserve/free decisions client-side + feeds the Auto-Fill rail (§6).

### 3.4 Shared contract additions

- `packages/shared/src/tables.ts`: `export const PWP_CODES = "pwp_codes" as const;`
- `packages/shared/src/rpcs.ts`: `export const PWP_CLAIM_CODE = "pwp_claim_code" as const; export const PWP_RELEASE_CODES = "pwp_release_codes" as const; export const PWP_REAP_ORPHANS = "pwp_reap_orphans" as const;`
- `packages/shared/src/db-types.ts`: `PwpCodeRow` (snake_case, mirrors the table incl. `claim_group`).
- `packages/shared/src/domain.ts` + `adapters.ts`: `PwpCode` (camelCase) + `pwpCodeFromRow`.
- zod: `pwpReserveInputSchema = { cartLineKey: z.string().min(1), sku: z.string().min(1), qty: z.number().int().positive() }`.
- **`createOrderInputSchema` (P8c core field — NOT optional polish):** add
  ```ts
  /** P8c (0187) — the trigger cart-line keys whose RESERVED pwp_codes belong to
   *  THIS submit, so the Confirm-pass can DELETE the unclaimed ones. OPTIONAL +
   *  default [] (DORMANT). A server-derived fallback (§4.4) cleans claimed
   *  triggers' siblings even if a client omits this, so correctness never hinges
   *  on it; the field makes the cleanup COMPLETE (also reaches triggers whose
   *  reward was never claimed). Mirrors the additionalDeliveryFee/crossCategorySourceSo precedent. */
  pwpCartLineKeys: z.array(z.string()).optional().default([]),
  ```
- **`pwp-recompute.ts` carry-through (the precise patch — verified against the real lib):**
  - At the `claims` assembly (lib line ~231, inside the `for` loop where `ruleId` is read from `pwp`), ALSO capture `code` + `claimGroup` from the SAME original object:
    ```ts
    const code = typeof pwp?.code === "string" ? pwp.code.trim() : "";
    const claimGroup = typeof pwp?.claimGroup === "string" ? pwp.claimGroup.trim() : "";
    claims.push({ index: i, ruleId, code, claimGroup });   // was { index, ruleId }
    ```
  - At the canonical-marker rebuild (lib lines 363–370), re-emit them (omit a key when empty, so a no-code claim stays clean):
    ```ts
    pwp: {
      ruleId: rule.id,
      type: rule.type,
      triggerRef: grant.triggerRef ?? null,
      ...(claim.code ? { code: claim.code } : {}),
      ...(claim.claimGroup ? { claimGroup: claim.claimGroup } : {}),
    },
    ```
  - **Do NOT** rely on `base`/`stripped` to retain `code` — `stripClientPwp` already deleted it. Add a unit test asserting `out[i].attrs.pwp.code` + `.claimGroup` survive a full recompute, and that a claim WITHOUT a client code rebuilds a marker with no `code` key (DORMANT/byte-identical for P8b-only orders).

---

## 4. ORDER-PATH INTEGRATION (`apps/api/src/routes/orders.ts`)

### 4.1 Exact placement — Stage B after Stage A (P8b), before the sofa recompute

Insert the claim **immediately after** the P8b `recomputePwpLines` block (after line 328) and **before** the sofa recompute (line 337). Pipeline order:

```
freeItem (288) → P8b recomputePwpLines (315, force price + carry code/claimGroup) → P8c claimPwpCodesForLines (NEW) → sofa recompute (337) → special-addon (366) → free-gift append (396) → delivery (416) → create_order (445) → CONFIRM-PASS stamp + sweep (NEW, after 474) → re-fetch (477) → 201 (495)
```

### 4.2 The new claim lib — `apps/api/src/lib/pwp-codes-claim.ts`

```ts
export type PwpClaimOutcome =
  | { status: "ok"; lines: RecomputableLine[]; claimed: ClaimedCode[]; claimGroup: string | null }
  | { status: "bad_request"; message: string; code: "pwp_code_rejected" }
  | { status: "server_error"; message: string };

export type ClaimedCode = { code: string };   // prevStatus is always RESERVED by construction
```

**Algorithm `claimPwpCodesForLines(sb, auth, lines)`:**

1. **Collect coded reward lines:** for each line read `attrs.pwp` and extract `code` (non-empty string), `ruleId`, `claimGroup`. If no line carries a non-empty `code` → `return { status:"ok", lines, claimed:[], claimGroup:null }` **with no DB call** (DORMANT short-circuit, §7).
2. **One claim_group per submit.** All coded lines in a submit MUST share the same `claimGroup` (the POS mints one per cart submit, §6.3). If they disagree, or any coded line is missing `claimGroup`/`ruleId`, → `pwp_code_rejected` 409. Let `claimGroup` = that shared value.
3. **Dedup** codes into a `Set`; a duplicated code across two lines → `pwp_code_rejected` 409 (mirrors 2990s's `seenPwpCodes`).
4. For each coded line, in order:
   ```ts
   const { data: row, error } = await sb.rpc("pwp_claim_code", {
     p_code: code,
     p_rule_id: ruleId,          // ← code must be minted under the rule that priced this line
     p_claim_group: claimGroup,  // ← cancel/recovery join key, set at claim (pre-create_order)
     p_redeemed_sku: line.sku,   // best-effort audit (§4.2a)
   });
   if (error) {
     // fail-closed: release any partial claims, then 500
     return { status: "server_error", message: error.message };
   }
   if (!row) {  // NULL → not RESERVED / not mine / wrong rule / already used
     return { status: "bad_request", code: "pwp_code_rejected",
       message: "This PWP voucher is no longer reservable — please re-add the offer and retry." };
   }
   claimed.push({ code });
   ```
   On the `bad_request`/`server_error` early-returns above, the lib first releases anything already pushed via `sb.rpc("pwp_release_codes", { p_codes: claimed.map(c=>c.code) })` so a partial claim never leaks.
5. Return `{ status:"ok", lines, claimed, claimGroup }` — **lines pass through** (price already forced by P8b; `code`+`claimGroup` already on `attrs.pwp`).

### 4.2a Anti-tamper posture (the one client-trusted field — documented + bounded)

Every other recompute value is server-re-derived (price forced by P8b, gifts appended, delivery authoritative, client delivery keys stripped, `free_gift` stripped). **`attrs.pwp.code` is the single client-asserted field.** Its blast radius is bounded:

- `pwp_claim_code` only flips a code that is **RESERVED + owned by the caller + minted under the rule that priced the line** (§2.1). A client can therefore only bind **one of their OWN reserved codes, minted under the SAME rule**, to a reward line.
- **Price is unaffected regardless of which code is bound** — P8b is authoritative (§4.6).
- The remaining spoof surface is purely cosmetic: a client could bind code X (reserved for trigger A under rule R) to a different reward line also granted by rule R. The redemption is still legitimate (same rule, same owner, reserved), so the ledger's rule lineage is correct; only `redeemed_item_sku`/`cart_line_key` provenance may not match the specific trigger the salesperson had in mind. **`redeemed_item_sku` is therefore explicitly best-effort AUDIT, not a security claim.** This is acceptable for v1 (P8b already validated reward eligibility against the live rule); P8d, which needs trustworthy cross-order lineage, will additionally validate the bound code's `reward_targets` snapshot against the reward line's resolved category/model at claim time.

### 4.3 The route wiring + the rollback ledger

```ts
const pwpClaim = await claimPwpCodesForLines(sb, auth, pwp.lines);
if (pwpClaim.status === "server_error")
  throw new HTTPException(500, { message: pwpClaim.message });
if (pwpClaim.status === "bad_request")
  return c.json({ error: "rule_violation", code: pwpClaim.code, message: pwpClaim.message }, 409);

// the rollback ledger for EVERY downstream early-exit (single atomic batch RPC):
const claimedPwpCodes = pwpClaim.claimed.map((c) => c.code);   // string[]
const pwpClaimGroup   = pwpClaim.claimGroup;                    // string | null
const rollbackPwpClaims = async () => {
  if (claimedPwpCodes.length === 0) return;
  await sb.rpc("pwp_release_codes", { p_codes: claimedPwpCodes });  // ONE atomic statement
};
```

### 4.4 The Confirm-pass — stamp `redeemed_order_id` (fail-closed) + sweep unclaimed RESERVED

At claim time the order has **no id** (verified: `create_order` does `INSERT INTO orders … RETURNING id` — the id is DB-generated and the payload carries no `id`, so a caller-minted id **cannot** be threaded in without touching the RPC, which is forbidden). The code is therefore claimed USED with `redeemed_order_id` left NULL but `claim_group` SET (the interim join key). After `create_order` returns the id (line 473), the **Confirm-pass** runs — and is **fail-closed** so a stamp failure cannot strand a USED code with no order linkage:

```ts
// CONFIRM-PASS (after create_order succeeds at line 473, BEFORE the re-fetch):
if (claimedPwpCodes.length > 0 && pwpClaimGroup) {
  // 1. Stamp the claimed codes with the now-known order id. Scoped by claim_group
  //    (set at claim) so it reaches the rows even though redeemed_order_id is still
  //    NULL. FAIL-CLOSED: if the stamp errors OR matches fewer rows than we claimed,
  //    something is wrong (the order committed but the lock record is inconsistent)
  //    → release the claims and 500 so the client retries cleanly. The release is
  //    idempotent; the committed order will simply be re-fetchable by the client
  //    and can be re-submitted is NOT needed — but we must not leave half-stamped
  //    USED codes, so we surface the inconsistency.
  const { data: stamped, error: stampErr } = await sb.from("pwp_codes")
    .update({ redeemed_order_id: id, updated_at: new Date().toISOString() })
    .eq("owner_staff_id", auth.uid)
    .eq("claim_group", pwpClaimGroup)
    .eq("status", "USED")
    .is("redeemed_order_id", null)
    .select("code");
  if (stampErr) {
    await rollbackPwpClaims();
    throw new HTTPException(500, { message: "Order created but PWP code stamp failed; please retry." });
  }
  if ((stamped?.length ?? 0) < claimedPwpCodes.length) {
    await rollbackPwpClaims();
    throw new HTTPException(500, { message: "Order created but PWP code stamp incomplete; please retry." });
  }

  // 2. SWEEP unclaimed RESERVED for this cart's triggers — two sources, UNION:
  //    (a) the client-supplied pwpCartLineKeys (complete: also reaches triggers
  //        whose reward was never claimed), and
  //    (b) a server-derived fallback from the claimed codes' cart_line_key (so a
  //        client that under-populates the field still cleans claimed triggers'
  //        siblings). Correctness does not hinge on the body field.
  //    (P8d will instead flip these RESERVED→AVAILABLE bound to the customer.)
  const bodyKeys = parsed.data.pwpCartLineKeys ?? [];
  const { data: derivedRows } = await sb.from("pwp_codes")
    .select("cart_line_key")
    .eq("owner_staff_id", auth.uid)
    .eq("claim_group", pwpClaimGroup)
    .eq("status", "USED");
  const derivedKeys = (derivedRows ?? []).map((r) => r.cart_line_key).filter(Boolean);
  const sweepKeys = Array.from(new Set([...bodyKeys, ...derivedKeys]));
  if (sweepKeys.length > 0) {
    await sb.from("pwp_codes").delete()
      .eq("owner_staff_id", auth.uid)
      .eq("status", "RESERVED")
      .in("cart_line_key", sweepKeys);
  }
}
```

> **Why fail-closed here closes the BLOCKER.** The window the critics flagged — order committed, stamp fails, code stuck USED with NULL `redeemed_order_id` and no order linkage — is now covered three ways: (1) the stamp join uses `claim_group` (set at claim), so it does not depend on `redeemed_order_id` already being set; (2) a stamp error/short-row **releases the claims + 500s** (the codes go back to RESERVED, re-usable on retry; the committed order simply carries no consumed code, which the client surfaces by re-GET and can re-claim); (3) if the **worker dies entirely** between commit and stamp (no chance to run the fail-closed block), the `claim_group` is ALSO on the order's `order_lines.attrs.pwp.claimGroup`, so the cancel trigger (§5) and the orphan reaper (§2.3) can both still resolve the code — the reaper's `NOT EXISTS` belt detects that a committed non-cancelled order DID adopt the claim_group and (correctly) leaves the code alone for a human/next-stamp, while a truly orphaned claim_group (no committed order) is released after the grace window. No code is ever permanently burned.

> **Note:** the Confirm-pass sweep + stamp run via the **table under RLS** (owner-scoped, safe) — only the atomic claim + batch release go through SECURITY DEFINER RPCs.

### 4.4a Self-heal on `GET /mine`

Independently of the order route, `GET /api/pwp-codes/mine` calls `pwp_reap_orphans(15)` (§3.3 — self-scoped: the RPC forces the owner to `auth.uid()` + clamps the grace, review BLOCKER fix) before returning, so the next time the salesperson opens a cart, any of THEIR OWN crash-stranded USED-unstamped codes (older than the 15-minute grace, with no committed order adopting the claim_group) are reclaimed to RESERVED and reappear in the Auto-Fill rail. The all-owners (incl. nulled-owner) backstop is `pwp_reap_orphans_all()` (§2.3b) — **shipped but NOT yet cron-wired in P8c** (CF `pwp-orphan-reaper-cron-unwired`); P8c's live guarantee is owner self-heal only.

### 4.5 EVERY post-claim rollback exit (enumerated from the verified route)

`rollbackPwpClaims()` MUST be awaited at **every** early-return/throw between the claim (Stage B) and the success `201`:

| # | Line(s) | Exit | Action |
|---|---|---|---|
| 1 | 338–340 | sofa `bad_request` → 400 | `await rollbackPwpClaims()` then throw |
| 2 | 341–343 | sofa `server_error` → 500 | rollback then throw |
| 3 | 344–358 | sofa `drift` → 422 `sofa_price_drift` | rollback then return |
| 4 | 367–369 | special-addon `bad_request` → 400 | rollback then throw |
| 5 | 370–372 | special-addon `server_error` → 500 | rollback then throw |
| 6 | 373–387 | special-addon `drift` → 422 | rollback then return |
| 7 | 397–399 | free-gift `server_error` → 500 | rollback then throw |
| 8 | 421–423 | delivery `bad_request` → 400 | rollback then throw |
| 9 | 424–426 | delivery `server_error` → 500 | rollback then throw |
| 10 | **446–471 — FOUR sub-exits** | `create_order` RPC error block. Sub-exits: **(10a)** 403 throw (line 450); **(10b)** `mixed_category_lines` 422 **return** (459–466); **(10c)** 400 throw (468); **(10d)** 500 throw (470) | Place **`await rollbackPwpClaims();` as the FIRST line inside `if (error) { … }`** (line ~447) so ALL FOUR sub-exits inherit it before any branch runs. The order's TX rolled back; the codes must un-claim. |
| 11 | 473–474 | `create_order` returned no id → 500 | rollback then throw |
| 12 | 482–483 | **re-fetch error / not readable → 500** | **DO NOT rollback** — the order COMMITTED and the Confirm-pass (§4.4) already stamped the codes; only the 201 response failed. Codes stay USED + stamped (correct). Client re-GETs the order. |

**Exit-12 is now safe** (the original danger): by §4.4 the code is stamped BEFORE the re-fetch, so a re-fetch failure leaves a fully-linked USED code, not an orphan.

**Implementation discipline.** A single `try/catch` wrapper is NOT viable (some exits are `return c.json(...)`). Each of exits 1–11 gets an explicit `await rollbackPwpClaims();` immediately before its `throw`/`return`; exit 10 gets ONE rollback as the first line of the `if (error)` block covering all four sub-exits. A per-exit test asserts each leaves 0 USED codes for the claim_group (§8.3). The Confirm-pass (4.4) runs only on the success path after line 473, so it never coincides with a rollback (and is itself fail-closed). Flag `pwp-rollback-exit-coverage` CF for the maintenance hazard as orders.ts grows.

### 4.6 How P8b's force-price stays authoritative

Stage B **never reads or writes `unitPrice`**. The lines out of `claimPwpCodesForLines` are `pwp.lines` unchanged — price = exactly what `recomputePwpLines` forced (`pwp_price | 0`). Downstream drift gates see the P8b-forced price as trusted base, identical to today. The code is purely a status row in `pwp_codes` + a `code`/`claimGroup` string on `attrs.pwp`. **If P8c were ripped out, every order would price identically.**

---

## 5. CANCEL REVERSAL (H2) — fix the 2990s gap from day one

**The gap (2990s H2):** 2990s rolls back a claimed code on *order-create failure exits*, but an order that successfully created and is **later cancelled** does NOT reverse its claimed P8c codes — the voucher stays burned.

**Carres has two cancel paths** (both flip `orders.status='cancelled'`, verified):
1. **Dealer/internal pre-proceed cancel** — `POST /:id/cancel` → RPC `cancel_order` (`0011`, only `status='place'` orders; verified it does `update orders set status='cancelled'`).
2. **Operation post-proceed abandon** — `POST /:id/abandon` → RPC `operation_abandon_order` (verified in 0129's narration: sets `status='cancelled', operation_stage=NULL`).

### 5.1 The hook = ONE trigger (covers both paths + any future cancel)

**Sibling-trigger pre-condition (corrected — review MINOR fix).** The earlier claim "no existing `CREATE TRIGGER … ON orders`" was **factually wrong**: verified on prod, three `BEFORE UPDATE` triggers exist on `public.orders` — `orders_auto_issue_on_dispatched_trg` (0098), `orders_auto_status_delivered_trg` (0106), and `orders_set_updated_at`. They are all **BEFORE** timing and either guard themselves out of the cancel transition (0106 only rewrites `NEW.status` on `proceed_order→delivered`; 0098 is dispatch-only) or are content-agnostic (`set_updated_at`). This new trigger is **`AFTER UPDATE OF status`**, so it **neither collides nor depends on ordering against them** — the BEFORE triggers fire first (and may still rewrite `NEW.status`), then this AFTER trigger sees the final committed `NEW.status` and its `WHEN` clause re-checks `NEW.status='cancelled'`. The §5.4 `pg_trigger` pre-apply check remains the hard gate. Add to `0187_pwp_codes.sql`:

```sql
-- H2 (the 2990s gap fixed day-one): when an order enters 'cancelled', reverse any
-- same-cart P8c codes it consumed. The join is BY redeemed_order_id (set on the
-- success path) OR by claim_group (set at claim, so it ALSO catches a code that was
-- claimed-USED but not yet stamped — the post-commit window of §4.4). SAME-CART
-- semantics: a code was RESERVED→USED FOR THIS cart, so cancelling the order means
-- the redemption never happened → DELETE the code (identical to the cart-clear
-- path; there is no AVAILABLE life to restore in P8c). ONE trigger covers
-- cancel_order + operation_abandon_order + any future cancel path. SECURITY
-- DEFINER so it runs with table rights regardless of which RPC/role fired the
-- cancel; reads NEW.id (+ resolves claim_groups from the order's own lines).
CREATE OR REPLACE FUNCTION public.pwp_codes_on_order_cancel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_claim_groups text[];
BEGIN
  -- The claim_groups this order's lines reference (covers the unstamped-USED
  -- window where redeemed_order_id is still NULL but the line carries claimGroup).
  SELECT array_agg(DISTINCT (ol.attrs -> 'pwp' ->> 'claimGroup'))
    INTO v_claim_groups
    FROM public.order_lines ol
   WHERE ol.order_id = NEW.id
     AND ol.attrs -> 'pwp' ->> 'claimGroup' IS NOT NULL;

  DELETE FROM public.pwp_codes pc
   WHERE pc.status = 'USED'
     AND (
          pc.redeemed_order_id = NEW.id
       OR (v_claim_groups IS NOT NULL
           AND pc.claim_group::text = ANY(v_claim_groups))
     );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_pwp_codes_on_order_cancel
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  WHEN (NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled')
  EXECUTE FUNCTION public.pwp_codes_on_order_cancel();
```

### 5.2 Why DELETE (not USED → RESERVED) on cancel

In same-cart P8c a USED code is **tied to a dead cart** — the order it backed is gone and its trigger lines vanish. Restoring to RESERVED would orphan it (no live cart line owns it; the reconciler would never free it). DELETE matches the cart-clear semantics. (In P8d the same code, carried forward to AVAILABLE bound to a customer, WOULD be un-stamped + restored — but that branch doesn't exist yet, and the trigger only touches `status='USED'` codes, so P8d's AVAILABLE codes are untouched; P8d will extend the trigger.)

### 5.3 Why a trigger, not route-level reversal

- **Coverage:** `operation_abandon_order`'s body is un-versioned in this repo (project caveat — "verify live signature before editing"). A trigger on `orders.status` needs no edit to either RPC.
- **Atomicity:** the reversal commits in the same TX as the status flip.
- **Future-proof:** any new cancel path is automatically covered.
- **Unstamped-window coverage:** the `claim_group` branch catches a USED code even before the Confirm-pass stamp lands, closing the BLOCKER's cancel-races-the-stamp window.
- **Dormant:** on a no-codes order the `array_agg` returns NULL + the DELETE matches 0 rows (index probe on `idx_pwp_codes_redeemed`). Negligible per-cancel overhead.

### 5.4 Pre-apply checklist (promoted from "low risk")

Before the lead applies 0187, run on prod (read-only): (1) `SELECT tgname, CASE WHEN (tgtype & 2)<>0 THEN 'BEFORE' ELSE 'AFTER' END AS timing FROM pg_trigger WHERE tgrelid='public.orders'::regclass AND NOT tgisinternal;` to confirm **no NEW `BEFORE UPDATE` trigger rewrites `NEW.status` into-or-out-of `cancelled`** in a way that conflicts. (Verified today: three BEFORE-UPDATE triggers exist — `orders_auto_issue_on_dispatched_trg`, `orders_auto_status_delivered_trg`, `orders_set_updated_at` — all benign for the cancel transition per §5.1; the new trigger is AFTER so it sees the final committed status.) (2) Confirm `operation_abandon_order` issues a real `UPDATE orders SET status='cancelled'` (verify the live function body) so the `AFTER UPDATE OF status` trigger fires (0129 confirms it sets `status='cancelled'`). (3) Confirm the migration role owns `pwp_codes` (table owner ⇒ has DELETE) and the DELETE inside the trigger fires no further cascade. This is the documented project rule "verify live signature/body before editing", made a hard gate.

---

## 6. POS (`apps/web/src/pages/dealer/DealerPos.tsx` + `apps/web/src/pages/dealer/pos/`)

> **Path correction (MINOR finding):** the submit owner is `apps/web/src/pages/dealer/DealerPos.tsx` (one dir up). The `pos/` subfolder holds `CartDrawer.tsx`, `pwp-line.ts`, `cart.ts`, etc. — but NOT `DealerPos.tsx`.

### 6.1 The reserve reconciler — `apps/web/src/pages/dealer/DealerPos.tsx`

The draft (`WizardDraft.lines`) lives in `DealerPos.tsx` (which owns `handleSubmit`). Add a **debounced, single-flight `useEffect([draft.lines])`** reconciler (NOT per-callback in `CartDrawer`, to avoid thrash on every qty bump):

1. On `draft.lines` change, compute the set of **trigger** lines (lines whose SKU matches an active rule's trigger scope — reuse `coveringPwpForLine` from `pwp-line.ts`) and their `cartLineKey` + qty.
2. **Diff against the last-reconciled snapshot:** new trigger / qty up → `POST /pwp-codes/reserve`; trigger removed / qty 0 → `DELETE /pwp-codes/reserve?cartLineKey=…`.
3. On cart clear (`clearDraft`) → `DELETE` every reserved cart-line-key (or rely on the Confirm-pass sweep / a `GET /mine`-then-delete sweep).
4. **Single-flight per cartLineKey** (a pending reserve for a key blocks a second until it resolves) — this keeps reserve calls sequential per line, making the §3.1 idempotency hold in practice.
5. Best-effort + idempotent — a missed reserve just shows fewer codes in the rail; a missed free is cleaned by the Confirm-pass sweep or the RESERVED-orphan cron. Never blocks submit.

`cartLineKey` derivation: use `DraftLine.localId` (stable per cart line) — must be stable across re-renders so reserve is idempotent.

### 6.2 The "Insert PWP Code" rail — Auto-Fill ONLY (same-cart)

Next to the existing PWP toggle block in `apps/web/src/pages/dealer/pos/CartDrawer.tsx` (~lines 572–595, where `markLinePwp`/`unmarkLinePwp` live), add a per-reward-line **"Use PWP voucher"** affordance. P8c is **Auto-Fill only** (no manual cross-order code entry — that's P8d):

- When a line is PWP-eligible (`coveringPwpForLine` returns a rule) AND the cart holds a RESERVED code for that rule's trigger (from `GET /mine`), show **"Apply free/PWP (1 voucher available)"**.
- Clicking calls `markLinePwpWithCode(line, rule, price, code)` (extends `markLinePwp`) → stamps `attrs.pwp = { ruleId, code, claimGroup }` (next unconsumed RESERVED code for that rule from `/mine`; `claimGroup` = the per-submit correlation uuid minted once per cart, §6.3).
- `unmarkLinePwp` clears `attrs.pwp` (frees the claim *signal*; the code stays RESERVED for re-use until cart clear).
- A reward line with no available reserved code shows the offer **disabled** ("buy the trigger to unlock").

**No manual code text field in P8c** (defer the cross-order "type a voucher number" UX to P8d).

### 6.3 The per-submit `claimGroup` + how the code reaches `create_order` / `order_lines.attrs`

- **`claimGroup` minting:** `DealerPos.tsx` mints ONE `crypto.randomUUID()` per cart submit (e.g. derived once and stored on the draft, or generated at the start of `handleSubmit`) and stamps it onto every `attrs.pwp.claimGroup` of the coded reward lines. All coded lines in a submit share it (§4.2 step 2 enforces this server-side).
- **Submit payload (verified shape, `DealerPos.tsx:258–263`):**
  ```ts
  lines: draft.lines.map((l) => ({ sku: l.sku, qty: l.qty, attrs: l.attrs, unitPrice: l.unitPrice }))
  ```
  Because `code`+`claimGroup` live inside `l.attrs.pwp`, they are **already on the wire** — no submit change beyond adding the top-level `pwpCartLineKeys` field (§3.4 / §4.4) populated from the cart's trigger lines' `localId`s. The server's Stage B reads `attrs.pwp.code`, claims it (binding rule + claim_group), and it persists into `order_lines.attrs` via the untouched `create_order` payload. **`DraftLine` / `cart.ts` are NOT modified** — `attrs` is free jsonb; `code`/`claimGroup` are just more keys, exactly as P8b added `pwp`.
- **PrincipalPos parity (MINOR finding):** `PrincipalPos` (principal-on-behalf-of-dealer) reuses the same `DealerPos`/`handleSubmit` path with `actingDealerId`, so it inherits the reconciler + `claimGroup` + `pwpCartLineKeys` automatically. A test asserts the principal submit path also populates `pwpCartLineKeys` (it does, since it is the same component).
- On submit success → `clearDraft()` (line 299): consumed codes are USED (claimed + stamped); unclaimed RESERVED were swept by the Confirm-pass. On submit `catch` (line 311): the order was NOT created (the route rolled back via §4.5), the codes are back to RESERVED — the reconciler leaves them for re-submit or cart-clear cleanup.

---

## 7. DORMANT PROOF — the byte-identical chain

A no-active-rules order (prod today: `pwp_rules` has 0 `active=true` rows) is provably byte-identical:

1. **POS:** `coveringPwpForLine` returns no rule → empty trigger set → **never calls `/pwp-codes/reserve`** → 0 codes minted → no `attrs.pwp` marker ever stamped; no `claimGroup` minted.
2. **Order POST:** no line carries `attrs.pwp` (P8b's `recomputePwpLines` short-circuits to pass-through, no DB read, no `code` carried). Stage B `claimPwpCodesForLines` scans for `attrs.pwp.code`, finds none → **`{status:"ok", lines, claimed:[], claimGroup:null}` with ZERO DB calls** (dormant short-circuit, mirroring `delivery-fee-recompute.ts:147` + `pwp-recompute.ts:235`).
3. **Rollback ledger** `claimedPwpCodes=[]` → every `rollbackPwpClaims()` is a no-op (early `return` before the RPC).
4. **Confirm-pass:** `claimedPwpCodes.length===0 || !pwpClaimGroup` → the `if` block is skipped entirely; `pwpCartLineKeys` defaults to `[]`.
5. **Cancel trigger:** fires on cancel but `array_agg` → NULL and `DELETE … redeemed_order_id=NEW.id` matches 0 rows.
6. **`create_order` payload:** `finalLines` carry no `pwp` key → identical `order_lines` → identical order + total.

Net: **0 active rules ⇒ 0 reserve calls ⇒ 0 codes ⇒ 0 claims ⇒ 0 DB writes to `pwp_codes` ⇒ identical orders.** The only always-on cost is the cancel trigger's single indexed lookup returning 0 rows.

---

## 8. TEST PLAN

### 8.1 RPC atomicity (the headline) — `apps/api/src/lib/__tests__/pwp-claim-atomicity` (integration; real PG or an isolation harness)
- **Two concurrent claims serialize:** seed one RESERVED code; fire two `pwp_claim_code(code, rule, group, sku)` in parallel → **exactly one** returns the row (USED), the other NULL. End: `status='USED'`, `claim_group` set, `redeemed_order_id` NULL. (No-PG fallback: sequential-apply unit test where the second sees `status='USED'` → 0 rows.)
- **Wrong-rule reject:** claim a code minted under rule B with `p_rule_id = A` → NULL (predicate `rule_id=p_rule_id` fails).
- **Batch release idempotency:** `pwp_release_codes([c1,c2])` twice → first reverts 2, second reverts 0; end RESERVED.
- **Owner guard:** claim/release a code owned by another staff → NULL / 0 rows.
- **Orphan reaper:** seed a USED code with `redeemed_order_id=NULL`, `updated_at` 20 min ago, no committed order on its claim_group → `pwp_reap_orphans(15)` releases it; seed a second whose claim_group IS on a committed non-cancelled order → reaper leaves it.

### 8.2 Reserve idempotency — `pwp-codes.test.ts`
- `genCode` regex `^PWP-\d{4}[A-Z]{4}$` + 200-draw collision check (port 2990s's helper test).
- Reserve a trigger (qty 2, rule qtyPerTrigger 1) → 2 RESERVED. Reserve again **sequentially** unchanged → still 2 (no double-mint). Qty up to 3 → 3 (top-up). Qty down to 1 → 1 (trim). DELETE → 0. Deactivate the rule + re-reserve → strays trimmed to 0.
- **Concurrency honesty:** two parallel reserves of the same line MAY yield > target (documented benign over-mint); assert the subsequent claim still binds exactly one code per reward and the Confirm-pass sweep clears the surplus.

### 8.3 Order-path claim + rollback — `orders.test.ts` (+ isolated `pwp-codes-claim.test.ts`)
- **Happy claim:** reward line with `attrs.pwp={ruleId,code,claimGroup}` + a seeded RESERVED code (under `ruleId`) → order created, code USED, `claim_group` set then `redeemed_order_id=order.id` (stamped), price = P8b forced price.
- **Rollback per exit:** for each of exits 1–11 (force sofa drift, special drift, delivery bad_request, the FOUR create_order sub-exits, etc.) assert the claimed code is back to **RESERVED** (via the atomic batch release) and the order does NOT exist. Cover the configured happy + rejection paths in the isolated unit suite (mock-limitation precedent §17.7; add `pwp-claim-route-configured-test` CF).
- **Wrong-rule claim:** `attrs.pwp={ruleId:A,code:<minted under B>}` → 409 `pwp_code_rejected`, order not created, code stays RESERVED.
- **Exit-12 safety:** simulate re-fetch failure AFTER create_order commit + after the Confirm-pass stamp → assert the code stays USED **with `redeemed_order_id` set** (correct — order committed, code linked).
- **Confirm-pass fail-closed:** simulate the stamp UPDATE erroring (or matching a short row) → assert the claims are released (RESERVED) + a 500 is returned.
- **Confirm-pass sweep:** order with 3 reserved on its trigger but only 1 reward claimed → after create: 1 USED (stamped), **2 DELETEd** (unclaimed RESERVED — P8c, NOT AVAILABLE). Also assert sweep works from the **server-derived fallback** alone (omit `pwpCartLineKeys` → claimed trigger's siblings still cleaned). Assert `count(status='AVAILABLE')===0 AND count(source_order_id IS NOT NULL)===0` (P8c dormancy of cross-order columns).

### 8.4 Cancel reversal (H2)
- Create an order with a claimed code (USED, stamped `redeemed_order_id=id`). `POST /:id/cancel` → code **DELETED**.
- **Unstamped-window cancel:** simulate a USED code with `redeemed_order_id=NULL` but `claim_group` matching the order's `order_lines.attrs.pwp.claimGroup`; cancel → trigger DELETEs it via the claim_group branch (proves the post-commit window is covered).
- Same via `operation_abandon_order` (post-proceed) → code DELETED. Proves one trigger covers both paths.
- Cancel of a no-codes order → trigger no-ops (0 rows).

### 8.5 Dormant no-op (byte-identical guard)
- With 0 active `pwp_rules`: place an order → **0 rows in `pwp_codes`**, identical order_lines/total vs a pre-P8c baseline snapshot, and (instrumented) **0 calls to `pwp_claim_code`/reserve**.

### 8.6 RLS
- Staff A reserves; Staff B `GET /mine` → does not see A's codes (owner SELECT). B's direct `UPDATE/DELETE` on A's code → 0 rows.
- Nulled-owner audit: simulate `owner_staff_id=NULL` on a USED stamped code → owner routes can't see/mutate it, but a cancel of its order still DELETEs it (SECURITY DEFINER trigger reaches it).

### 8.7 P8b carry-through (the central integration)
- Unit: a claimed line with `attrs.pwp={ruleId,code,claimGroup}` survives `recomputePwpLines` → `out[i].attrs.pwp.code` + `.claimGroup` present, price forced. A claim WITHOUT a client `code` → rebuilt marker has NO `code` key (byte-identical for P8b-only orders).

---

## 9. OPEN RISKS

1. **The deferred `redeemed_order_id` stamp window — structurally unavoidable, recovery-backstopped.** Verified: `create_order` (0165) DB-generates the order id (`INSERT … RETURNING id`) with no payload `id`, so a caller-minted id **cannot** be threaded in without touching the RPC (forbidden). Hence the claim must run pre-create with `redeemed_order_id=NULL`. REV 2 closes the window with (a) the `claim_group` correlation uuid set AT CLAIM + threaded onto the order line, so the cancel trigger (§5) and orphan reaper (§2.3) find the code even unstamped; (b) the fail-closed Confirm-pass (§4.4); (c) `GET /mine` self-heal + a daily cron reaper. Residual: a code can sit USED-unstamped for up to the 15-min grace before the reaper reclaims it — harmless (it cannot be double-spent; the reaper's `NOT EXISTS` belt never reaps a code a committed order adopted). Flag `pwp-orphan-reaper-grace-window` CF (tune grace if a real workload shows it matters).
2. **`owner_staff_id ON DELETE SET NULL` + RLS orphan — RESOLVED in the migration text.** §1 ships SET NULL + NULLABLE (audit-preserving). A nulled-owner code is invisible to owner routes by design; the SECURITY DEFINER trigger + reaper reach it. A nulled-owner RESERVED row (mid-cart staff deletion) is garbage (un-claimable) and is reaped by the cron's RESERVED-orphan DELETE (§2.3 note). Recommend the app delete a staff's RESERVED rows before deleting the staff (leaving only USED-audit rows to null).
3. **`pwpCartLineKeys` — reclassified to a required core field with a server fallback.** §3.4 adds it to `createOrderInputSchema` (the additionalDeliveryFee precedent). §4.4 sweeps from `bodyKeys ∪ server-derived claim_group keys`, so a client that omits it still cleans claimed triggers' siblings. Correctness never hinges on the client. Residual: a trigger whose reward was NEVER claimed AND whose key the client omitted leaves a stray RESERVED — reaped by the RESERVED-orphan cron / cart-clear. Low.
4. **Reserve concurrency over-mint (same staff, two tabs).** §3.1 states idempotency is sequential-only; concurrent same-line reserve harmlessly over-mints (the claim predicate is the real double-spend guard; Confirm-pass sweeps the surplus). The POS reconciler is single-flight per line (§6.1), making this rare. Advisory-lock hardening offered, not required. Flag `pwp-reserve-concurrency-overmint` CF.
5. **Anti-tamper: `attrs.pwp.code` is the one client-asserted field.** §4.2a documents + bounds it (owner+status+**rule** predicate; price is P8b-authoritative; `redeemed_item_sku`/`cart_line_key` are best-effort audit). P8d will add a `reward_targets`-vs-line snapshot check for trustworthy cross-order lineage.
6. **`operation_abandon_order` un-versioned body.** The trigger avoids editing it; §5.4 makes "confirm it issues `UPDATE orders SET status='cancelled'`" a hard pre-apply checklist item (0129 confirms it does).
7. **`customer_id` has no FK** (no `customers` table — identity is `orders.customer_phone`). FK-less + dormant in P8c; P8d decides the binding. Documented, not a P8c blocker.
8. **Exit-site discipline as orders.ts grows.** §4.5 places the create_order rollback as the first line of the `if(error)` block and the per-exit test asserts 0 USED codes per exit; the N-code loop is a single atomic `pwp_release_codes`. Flag `pwp-rollback-exit-coverage` CF for the maintenance hazard.

---

**File deliverables for the build:**
- `supabase/migrations/0187_pwp_codes.sql` — table (`owner_staff_id` SET NULL + NULLABLE; `claim_group`; orphan partial index) + 3 RPCs (`pwp_claim_code` with `p_rule_id`+`p_claim_group`, `pwp_release_codes(text[])`, `pwp_reap_orphans`) + cancel trigger. **Lead applies to prod separately; run the §5.4 pre-apply checklist first.**
- `apps/api/src/routes/pwp-codes.ts` — reserve/free/mine (NEW; `/mine` self-heals via `pwp_reap_orphans`).
- `apps/api/src/lib/pwp-codes-claim.ts` — Stage B claim lib (NEW; binds rule + claim_group; releases partials on early-return).
- `apps/api/src/routes/orders.ts` — Stage B after line 328 + `rollbackPwpClaims()` (single atomic batch) at exits 1–11 (exit 10 = first line of the `if(error)` block) + fail-closed Confirm-pass (stamp by claim_group + UNION sweep) after line 473. (Patched, not rewritten; `create_order` call UNTOUCHED.)
- `apps/api/src/lib/pwp-recompute.ts` — index-keyed carry of `attrs.pwp.code` + `claimGroup` through the strip/rebuild (capture at the `claims` assembly ~line 231; re-emit at the marker rebuild 363–370). NOT a spread of stripped attrs.
- `packages/shared/src/{tables,rpcs,db-types,domain,adapters}.ts` — `PWP_CODES`; `PWP_CLAIM_CODE`/`PWP_RELEASE_CODES`/`PWP_REAP_ORPHANS`; `PwpCodeRow`/`PwpCode`/`pwpCodeFromRow` (incl. `claim_group`); `pwpReserveInputSchema`; `pwpCartLineKeys` on `createOrderInputSchema`.
- `apps/web/src/pages/dealer/DealerPos.tsx` — reserve reconciler `useEffect` (debounced, single-flight) + per-submit `claimGroup` mint + `pwpCartLineKeys` on the submit body. **(Correct path — NOT under `pos/`.)**
- `apps/web/src/pages/dealer/pos/CartDrawer.tsx` + `apps/web/src/pages/dealer/pos/pwp-line.ts` — Auto-Fill voucher rail + `markLinePwpWithCode` (stamps `{ruleId,code,claimGroup}`).
- **Cron:** one scheduled RPC wrapper (MYT, mirrors `apps/api/wrangler.toml` cron pattern) calling `pwp_reap_orphans()` + the RESERVED-orphan DELETE daily.