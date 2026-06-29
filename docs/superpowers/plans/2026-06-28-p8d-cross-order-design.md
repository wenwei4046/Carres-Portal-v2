I now have the complete picture, including the `attrsPwpMarkerSchema` with `.passthrough()` where I'll add `crossOrder`. I have all facts verified to write the full revised spec.

Below is the **FULL revised, buildable P8d spec**, with every critique issue resolved (or justified) inline. Same section structure as the original.

---

# P8d — CROSS-ORDER VOUCHER CARRY-FORWARD — BUILDABLE SPEC (REV 2)

**The FINAL slice of the 2990s Products 9-tab parity initiative.**

**Branch target:** `feat/2990s-products-p8d-voucher-carry-forward` (stacked on P8c / migration 0187)
**Migration:** `0188_pwp_codes_phone_binding.sql` (designed here; lead applies to prod separately)
**Hard invariants (inherited):** `create_order` / `order_lines` / `DraftLine` / `cart.ts` UNTOUCHED · userClient/RLS + SECURITY DEFINER RPC only, **never** service_role · DORMANT (0 active rules → 0 carry-forward → 0 AVAILABLE codes → orders byte-identical) · 0188 is authored as a FILE; the lead applies to prod separately.

> **What changed in REV 2 (the adversarial-review pass).** 24 critic findings (8 BLOCKER, 9 MAJOR, MINORs) resolved or justified in the body. The load-bearing ones:
> 1. **The cross-dealer PII leak + voucher enumeration (BLOCKER ×3 + MAJOR ×2) is closed for real.** Verified: `pwpCodeFromRow` (`adapters.ts:344`) maps the FULL row (`ownerStaffId`, `triggerItemCode`, `redeemedItemSku`, `customerId`) and `pwpCodeSchema` (`catalog.ts:640`) carries all of it; the original `?code=` route returned that whole DTO + the new `bound_customer_phone` to ANY authenticated staff (incl. rival dealers — `app_role` has `dealer`/`salesperson`/`showroom`, `0001_init.sql:15`). REV 2 (a) does **NOT** globally widen the table SELECT — AVAILABLE is read only via a **SECURITY DEFINER discovery RPC** that returns a **minimal stripped projection** (code, ruleId, reward category/amount, source SO number) and **never** a phone/owner/trigger SKU; (b) does the phone match **server-side** (returns a boolean, never the stored phone) so a `?code=` lookup is no longer a PII/enumeration oracle; (c) requires a phone-or-exact-code selector — no blind "dump all AVAILABLE". The table SELECT stays owner-scoped except a **dealer-scoped** AVAILABLE clause for the in-app reconciler. §1 / §2 / §6.3.
> 2. **Carry-forward is no longer structurally unreachable (BLOCKER ×3 + MAJOR).** Verified against the SHIPPED `orders.ts:542` — the Confirm-pass + sweep is nested inside `if (claimedPwpCodes.length > 0 && pwpClaimGroup)`, so the headline "buy a trigger, claim nothing, carry a voucher to next order" scenario (`claimedPwpCodes.length === 0`) was skipped entirely. REV 2 **hoists the carry/delete sweep into its own block** gated on a **server-derived RESERVED set** (independent of `pwpCartLineKeys`), so it fires for claim-less orders. §3.
> 3. **`crossOrder` survives the recompute (BLOCKER).** Verified: `pwp-recompute.ts` already carries `code`/`claimGroup` through three sites (capture line 231/240, re-emit line 382). REV 2 patches the SAME three sites to also carry `crossOrder`, plus extends `readPwpClaim` in the claim lib. §4.2 / Deliverables.
> 4. **The two DEFINER mutations are bound to a claimed-code allowlist (MAJOR ×3).** `pwp_release_available_code` and `pwp_stamp_redeemed` now require `code = ANY(p_codes)` (the request's own ledger) AND forbid touching a code already stamped to a live committed order — closing the post-commit double-spend + the forged-`claim_group` lineage corruption. §4.3 / §4.4.
> 5. **Nullable-phone soft-warning (MAJOR)** + **MY-aware phone canonicalization NOW (MAJOR)** + **`phoneKey` promoted to a real shared export (MINOR→required)** + **per-rule carry-forward expiry (MINOR)** + **the cancel-branch disjointness regression test (MAJOR)** + **the on-behalf principal discovery test (MINOR)**.

---

## 0. THE CENTRAL DECISION — phone binding storage + carry-forward policy (resolve first)

Three design decisions everything else follows from (REV 2 adds 0.3 — phone canonicalization — because the binding is now provably broken without it).

### 0.1 Customer binding = a NORMALIZED-PHONE TEXT column (not `customer_id`)

**The problem (verified):** P8c shipped `pwp_codes.customer_id uuid` (no FK — the comment says "Carres keys customer by phone"). Carres has **no `customers` table and no `customer_id`** — a customer is `orders.customer_name` / `orders.customer_phone` free text (`0001_init.sql:251-252`, `customer_phone` is `text` **NULLABLE**). A phone is `text`; `customer_id` is `uuid`; and `pwpCodeSchema.customerId = z.string().uuid().nullable()` (`catalog.ts:655`). Cramming a phone into `customer_id` would (a) fail PG `uuid` typing on insert and (b) fail the zod `.uuid()` parse on read. **Reusing `customer_id` for a phone is broken, not merely inelegant.**

**The decision — add ONE text column `bound_customer_phone` (migration 0188):** the AVAILABLE voucher's binding is the carrying order's customer phone, **canonicalized by `phoneKey` (REV 2: now MY-aware, §0.3)**. `customer_id` stays present-but-unused-forever (a P8c dormant artifact; we do not write it, change its type, or remove it — removing a shipped column is gratuitous churn). One small additive `text` column for `text` data; zero contract breakage.

### 0.2 Carry-forward vs delete = PER-RULE flag, default = carry-forward when the minting rule is still active

**The decision:** add `pwp_rules.carry_forward boolean NOT NULL DEFAULT true` (migration 0188). At Confirm, an unclaimed RESERVED code carries forward to AVAILABLE **iff its minting rule is still active AND `rule.carry_forward = true` AND a customer phone is captured**; otherwise it is DELETEd (P8c behaviour). Rationale: per-rule expresses "free pillow same-cart only" vs "RM1 bed-frame voucher carries"; default `true` is the brief's default; the "rule still active" gate refuses to mint a future entitlement from a dead promotion; DORMANT-safe (0 active rules → nothing to carry).

### 0.3 (NEW, REV 2) Phone canonicalization is MY-aware — resolved NOW, not deferred

**Why this can't be deferred (MAJOR finding).** The binding compares `phoneKey(mint phone)` vs `phoneKey(redeem phone)`, and `phoneKey` today is digits-only (`(p) => (p ?? "").replace(/\D/g, "")`, `delivery-fee-recompute.ts:85`). So `0123456789` (mint) vs `+6012-345 6789` (redeem) → `0123456789` ≠ `60123456789` → **the binding rejects a legitimate returning customer in the common case** (a customer who gives `012…` once and `+6012…` next). A cross-order voucher that legitimate redemptions silently bounce is worse than no feature.

**The decision — a MY-aware `phoneKeyMy` canonicalizer, shared, used by BOTH mint + redeem (+ optionally back-ported to delivery follow-up):**

```ts
// packages/shared/src/phone.ts (NEW)
/** Digits-only (legacy; unchanged behaviour). */
export const phoneKey = (p: string | null | undefined): string =>
  (p ?? "").replace(/\D/g, "");

/** MY-aware canonical phone: strip a leading 60 / 0 country/trunk prefix to a
 *  national core so 012-345 6789, 0123456789, +60 12-345 6789, 60123456789 all
 *  canonicalize to the SAME string (123456789). Non-MY / unrecognized shapes
 *  fall back to the digit string unchanged. Pure + deterministic; the SQL twin
 *  (§1) must produce byte-identical output (a cross-test asserts agreement). */
export const phoneKeyMy = (p: string | null | undefined): string => {
  let d = (p ?? "").replace(/\D/g, "");
  if (d.startsWith("60")) d = d.slice(2);     // +60 / 60 country code
  if (d.startsWith("0")) d = d.replace(/^0+/, ""); // domestic trunk 0
  return d;
};
```

The migration ships a SQL twin used inside the claim RPC + carry-forward (so the route never pre-normalizes, and DB-side + JS-side agree):

```sql
CREATE OR REPLACE FUNCTION public.pwp_phone_key(p text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT regexp_replace(
           regexp_replace(
             regexp_replace(coalesce(p,''), '\D', '', 'g'),  -- digits only
           '^60', ''),                                        -- drop 60
         '^0+', '')                                           -- drop leading 0s
$$;
```

**A cross-test (§8) asserts `phoneKeyMy` (JS) === `pwp_phone_key` (SQL)** over a representative set (`012…`, `0123456789`, `+6012…`, `60123456789`, a non-MY `+65…`), so mint and redeem normalize identically. This is the `delivery-followup-integrity`-shared `phone-canonicalization-country-code` CF, now **closed for PWP**; back-porting delivery follow-up to `phoneKeyMy` is a low-risk follow-on (tracked, not in P8d scope to avoid touching shipped delivery behaviour).

**Net P8d data-model delta = ONE migration, TWO small additive columns** (`pwp_codes.bound_customer_phone text`, `pwp_rules.carry_forward boolean default true`) + ONE optional `pwp_rules.carry_forward_days int` (§9 expiry, default NULL = perpetual) + two partial indexes + a dealer-scoped AVAILABLE RLS clause + the cancel-trigger rewrite + 3 new RPCs (claim / release / stamp) + 1 discovery RPC + the `pwp_phone_key` helper. No column type changes; no table drops.

---

## 1. SCHEMA DELTA — migration 0188 (FILE ONLY)

```sql
-- 0188_pwp_codes_phone_binding.sql
-- 2990s Products parity Phase 8d — CROSS-ORDER VOUCHER CARRY-FORWARD (the FINAL
-- slice). Turns ON the cross-order path P8c shipped dormant. Adds:
--   (1) pwp_codes.bound_customer_phone — the CANONICAL phone (pwp_phone_key:
--       digits, strip 60, strip leading 0) an AVAILABLE carry-forward voucher is
--       bound to. The cross-order claim asserts the redeeming order's canonical
--       phone matches. customer_id (uuid, P8c dormant) stays unused.
--   (2) pwp_rules.carry_forward — per-rule policy; + carry_forward_days (optional
--       expiry, NULL = perpetual).
--   (3) RLS SELECT widened NARROWLY: owner OR (AVAILABLE within the caller's
--       dealer scope). NOT global — AVAILABLE is NOT world-readable. Cross-dealer /
--       full discovery goes through pwp_discover_available (DEFINER, minimal
--       projection, server-side phone match). RESERVED/USED stay owner-private.
--   (4) pwp_claim_available_code — sibling claim RPC: atomic AVAILABLE→USED gated
--       by the phone binding + optional expiry. SECURITY DEFINER.
--   (5) pwp_release_available_code / pwp_stamp_redeemed — DEFINER, but BOUND to a
--       caller-supplied code allowlist (code = ANY(p_codes)) so a forged claim_group
--       cannot reach foreign codes, and a committed-stamped code cannot be released.
--   (6) pwp_discover_available — DEFINER read returning a MINIMAL projection (no
--       phone / owner / trigger sku); server-side phone match → boolean.
--   (7) pwp_codes_on_order_cancel rewritten: consumed cross-order → RESTORE to
--       AVAILABLE; minted carry-forward → DELETE; same-cart USED → DELETE.
--   (8) pwp_phone_key(text) — the MY-aware canonicalizer (JS twin = phoneKeyMy).
-- Additive + DORMANT (0 active rules → 0 carry-forward → 0 AVAILABLE → byte-
-- identical orders). FILE ONLY — the lead applies after the §10 pre-apply checklist.
-- Tail after this = 0188.

BEGIN;

-- (8) the MY-aware phone canonicalizer (JS twin = packages/shared phoneKeyMy).
CREATE OR REPLACE FUNCTION public.pwp_phone_key(p text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT regexp_replace(
           regexp_replace(
             regexp_replace(coalesce(p,''), '\D', '', 'g'),
           '^60', ''),
         '^0+', '')
$$;

-- (1) the cross-order binding = the carrying order's CANONICAL customer phone.
ALTER TABLE public.pwp_codes
  ADD COLUMN bound_customer_phone text;

COMMENT ON COLUMN public.pwp_codes.bound_customer_phone IS
  '2990s Products parity P8d (0188) — the CANONICAL (pwp_phone_key: digits, strip 60, strip leading 0) customer phone an AVAILABLE carry-forward voucher is bound to, stamped from the minting order at Confirm. The cross-order claim asserts pwp_phone_key(redeeming order phone) = this. customer_id (uuid, P8c dormant) is intentionally unused. NULL for every RESERVED / same-cart USED code. NEVER returned to a non-owner client (discovery uses pwp_discover_available with a stripped projection + server-side phone match).';

-- AVAILABLE discovery + cross-order claim lookup, canonical phone. Partial = only
-- the live carry-forward rows.
CREATE INDEX idx_pwp_codes_available_phone
  ON public.pwp_codes (bound_customer_phone)
  WHERE status = 'AVAILABLE';

-- Dealer-scoped AVAILABLE read (the in-app reconciler RLS clause, below).
CREATE INDEX idx_pwp_codes_available_dealer
  ON public.pwp_codes (owner_dealer_id)
  WHERE status = 'AVAILABLE';

-- (1b) owner_dealer_id — the minting salesperson's dealer, snapshotted at mint so
-- the dealer-scoped AVAILABLE RLS clause never joins app_users per row (InitPlan).
-- Backfilled NULL (no rows in a dormant prod). Written by the carry-forward sweep.
ALTER TABLE public.pwp_codes
  ADD COLUMN owner_dealer_id uuid REFERENCES public.dealers(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.pwp_codes.owner_dealer_id IS
  '2990s Products parity P8d (0188) — the minting salesperson''s dealer (snapshot at carry-forward), so the dealer-scoped AVAILABLE RLS clause is a constant comparison (no per-row app_users join). NULL for RESERVED / same-cart USED.';

-- (2) per-rule carry-forward policy + optional expiry.
ALTER TABLE public.pwp_rules
  ADD COLUMN carry_forward boolean NOT NULL DEFAULT true;
ALTER TABLE public.pwp_rules
  ADD COLUMN carry_forward_days integer;        -- NULL = perpetual (default)

COMMENT ON COLUMN public.pwp_rules.carry_forward IS
  '2990s Products parity P8d (0188) — when an unclaimed RESERVED voucher minted by this rule reaches Confirm: TRUE (default) → flip to AVAILABLE (cross-order, bound to phone) iff the rule is still active AND a phone is captured; FALSE → DELETE (same-cart, P8c). Principal-only write (pwp_rules RLS).';
COMMENT ON COLUMN public.pwp_rules.carry_forward_days IS
  '2990s Products parity P8d (0188) — optional validity window for a carry-forward voucher (days from the minting Confirm). NULL = perpetual. When set, the AVAILABLE row is stamped expires_at = now()+days and pwp_claim_available_code asserts expires_at > now().';

-- expires_at on the code (stamped at carry-forward when the rule sets a window).
ALTER TABLE public.pwp_codes
  ADD COLUMN expires_at timestamptz;
COMMENT ON COLUMN public.pwp_codes.expires_at IS
  '2990s Products parity P8d (0188) — when an AVAILABLE carry-forward voucher lapses (set from pwp_rules.carry_forward_days at mint). NULL = perpetual. pwp_claim_available_code asserts (expires_at IS NULL OR expires_at > now()).';

-- ---------------------------------------------------------------------------
-- (3) RLS — widen SELECT NARROWLY. AVAILABLE is NOT globally readable. A salesperson
-- can read an AVAILABLE voucher from the table ONLY within their OWN dealer scope
-- (the in-app same-dealer reconciler convenience). Cross-dealer / by-phone / by-code
-- discovery goes EXCLUSIVELY through pwp_discover_available (DEFINER, stripped
-- projection, server-side phone match) — so a rival dealer can never table-read
-- another customer's voucher PII. INSERT/UPDATE/DELETE stay OWNER-SCOPED.
-- ---------------------------------------------------------------------------
DROP POLICY pwp_codes_owner_select ON public.pwp_codes;

CREATE POLICY pwp_codes_owner_or_dealer_available_select
  ON public.pwp_codes FOR SELECT
  USING (
    owner_staff_id = (SELECT auth.uid())                       -- my own (any status)
    OR (
      status = 'AVAILABLE'
      AND owner_dealer_id IS NOT NULL
      AND owner_dealer_id = (SELECT public.app_dealer_id())     -- same-dealer AVAILABLE only
    )
    OR (
      status = 'AVAILABLE'
      AND (SELECT public.is_internal())                        -- principal/logistics/finance/bd
    )
  );

COMMENT ON POLICY pwp_codes_owner_or_dealer_available_select ON public.pwp_codes IS
  '2990s Products parity P8d (0188) — read scope = my own codes (any status) OR an AVAILABLE voucher minted WITHIN MY DEALER (same-dealer reconciler) OR (internal role) any AVAILABLE. AVAILABLE is NOT world-readable: a rival dealer''s salesperson cannot table-read another dealer''s AVAILABLE voucher (no cross-dealer PII). RESERVED/USED stay strictly owner-private. Cross-dealer / by-phone / by-code discovery uses pwp_discover_available (DEFINER, stripped projection). Mutation stays owner-scoped; the AVAILABLE→USED claim is pwp_claim_available_code. InitPlan-wrapped.';

-- (UPDATE / INSERT / DELETE policies from 0187 UNCHANGED — owner_staff_id = auth.uid().)

-- ===========================================================================
-- (6) pwp_discover_available — the DISCOVERY read. SECURITY DEFINER so it can
-- surface a voucher across dealers WITHOUT exposing it to the table SELECT, and
-- returns a MINIMAL projection (NO phone, NO owner, NO trigger sku). Phone match is
-- SERVER-SIDE: the caller passes the cart's phone; the function returns only the
-- booleans/values the POS needs. A bare call with no selector returns 0 rows (no
-- "dump all AVAILABLE"). Internal roles may pass p_internal := true to discover
-- across dealers; otherwise scoped to the caller's dealer.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.pwp_discover_available(
  p_phone  text DEFAULT NULL,          -- the cart's customer phone (raw); REQUIRED for the phone branch
  p_code   text DEFAULT NULL           -- exact code (manual entry); validated, never echoes PII
)
RETURNS TABLE (
  code             text,
  rule_id          uuid,
  type             text,
  reward_category  text,
  reward_targets   jsonb,
  source_order_id  uuid,
  expires_at       timestamptz,
  phone_matches    boolean             -- does this voucher's binding match p_phone? (server-side)
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid       uuid    := auth.uid();
  v_dealer    uuid    := public.app_dealer_id();
  v_internal  boolean := public.is_internal();
  v_want      text    := public.pwp_phone_key(p_phone);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth required' USING ERRCODE = '42501';
  END IF;
  -- Require a selector — never dump the whole AVAILABLE pool.
  IF (p_code IS NULL OR p_code = '') AND v_want = '' THEN
    RETURN;  -- no rows
  END IF;

  RETURN QUERY
  SELECT pc.code, pc.rule_id, pc.type, pc.reward_category, pc.reward_targets,
         pc.source_order_id, pc.expires_at,
         (pc.bound_customer_phone IS NOT NULL AND pc.bound_customer_phone = v_want) AS phone_matches
    FROM public.pwp_codes pc
   WHERE pc.status = 'AVAILABLE'
     AND (pc.expires_at IS NULL OR pc.expires_at > now())
     -- selector: exact code OR canonical-phone match
     AND (
          (p_code IS NOT NULL AND p_code <> '' AND pc.code = p_code)
       OR (v_want <> '' AND pc.bound_customer_phone = v_want)
     )
     -- scope: internal sees all; a salesperson sees only their dealer's mints
     AND (v_internal OR (pc.owner_dealer_id IS NOT NULL AND pc.owner_dealer_id = v_dealer));
END;
$$;

REVOKE ALL ON FUNCTION public.pwp_discover_available(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.pwp_discover_available(text, text) TO authenticated;

COMMENT ON FUNCTION public.pwp_discover_available(text, text) IS
  '2990s Products parity P8d (0188) — cross-order DISCOVERY. DEFINER so it can surface a voucher across dealers WITHOUT a global table SELECT, returning a MINIMAL projection (NO bound_customer_phone / owner_staff_id / trigger_item_code / redeemed_item_sku). Phone match is SERVER-SIDE (phone_matches boolean) — the stored phone is NEVER returned, killing the ?code= enumeration/PII oracle. Requires a phone-or-code selector (no dump-all). Salesperson scope = own dealer; internal role = all. PDPA-safe.';

-- ===========================================================================
-- (4) pwp_claim_available_code — the CROSS-ORDER claim. Atomic AVAILABLE→USED,
-- gated by the phone binding + expiry. SECURITY DEFINER (mutates a non-owned code).
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.pwp_claim_available_code(
  p_code            text,
  p_rule_id         uuid,
  p_claim_group     uuid,
  p_redeemed_sku    text,
  p_customer_phone  text          -- the REDEEMING order's customer phone (raw)
)
RETURNS public.pwp_codes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_want  text := public.pwp_phone_key(p_customer_phone);
  v_row   public.pwp_codes;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth required' USING ERRCODE = '42501';
  END IF;
  IF p_claim_group IS NULL THEN
    RAISE EXCEPTION 'claim_group required' USING ERRCODE = '22023';
  END IF;
  IF v_want = '' THEN
    RETURN NULL;  -- a cross-order voucher REQUIRES a phone to redeem against → 409
  END IF;

  UPDATE public.pwp_codes
     SET status            = 'USED',
         claim_group       = p_claim_group,
         redeemed_item_sku = p_redeemed_sku,
         updated_at        = now()
   WHERE code                  = p_code
     AND rule_id               = p_rule_id            -- minted under the PRICING rule
     AND status                = 'AVAILABLE'          -- ← single-use guard (the lock)
     AND (expires_at IS NULL OR expires_at > now())   -- ← optional validity window
     AND bound_customer_phone IS NOT NULL
     AND bound_customer_phone  = v_want               -- ← the CUSTOMER BINDING
  RETURNING * INTO v_row;
  -- 0 rows → NULL → already USED / wrong rule / expired / phone mismatch.
  -- redeemed_order_id stays NULL (stamped by the Confirm-pass via claim_group +
  -- code allowlist). source_order_id PRESERVED (lineage origin).
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.pwp_claim_available_code(text, uuid, uuid, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.pwp_claim_available_code(text, uuid, uuid, text, text) TO authenticated;

COMMENT ON FUNCTION public.pwp_claim_available_code(text, uuid, uuid, text, text) IS
  '2990s Products parity P8d (0188) — the CROSS-ORDER claim: atomic AVAILABLE→USED gated by (rule_id + bound_customer_phone = pwp_phone_key(redeeming phone) + expiry). SECURITY DEFINER (mutates a non-owned code). WHERE status=AVAILABLE is the single-use lock (concurrent claims serialize; loser matches 0 → NULL → 409). Stamps claim_group; Confirm-pass stamps redeemed_order_id; PRESERVES source_order_id. NEVER service_role.';

-- ===========================================================================
-- (5a) pwp_release_available_code — rollback a cross-order claim USED→AVAILABLE.
-- DEFINER (the caller does not own the code) but BOUND to: the caller-supplied
-- code allowlist (p_codes = this request's own ledger) AND the per-submit claim_group
-- AND redeemed_order_id IS NULL (NEVER release a code already stamped to a committed
-- order — that path is the cancel trigger ONLY). Closes the post-commit double-spend.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.pwp_release_available_code(
  p_codes        text[],
  p_claim_group  uuid
)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_uid uuid := auth.uid(); v_n integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required' USING ERRCODE='42501'; END IF;
  IF p_codes IS NULL OR array_length(p_codes,1) IS NULL OR p_claim_group IS NULL THEN RETURN 0; END IF;
  UPDATE public.pwp_codes
     SET status='AVAILABLE', claim_group=NULL, redeemed_item_sku=NULL, updated_at=now()
   WHERE code = ANY(p_codes)               -- ← only THIS request's claimed codes
     AND claim_group = p_claim_group        -- ← claimed under THIS submit's group
     AND status='USED'
     AND source_order_id IS NOT NULL        -- only a cross-order voucher restores to AVAILABLE
     AND redeemed_order_id IS NULL;         -- ← NEVER release a committed-stamped code
  GET DIAGNOSTICS v_n = ROW_COUNT; RETURN v_n;
END; $$;
REVOKE ALL ON FUNCTION public.pwp_release_available_code(text[], uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.pwp_release_available_code(text[], uuid) TO authenticated;

COMMENT ON FUNCTION public.pwp_release_available_code(text[], uuid) IS
  '2990s Products parity P8d (0188) — rollback a cross-order claim USED→AVAILABLE. DEFINER (non-owned code) but bounded to the caller-supplied code allowlist + the per-submit claim_group + redeemed_order_id IS NULL. A code already stamped to a committed order is NOT releasable here (only the cancel trigger restores a committed-then-cancelled redemption) — closing the claim→commit→release→re-claim double-spend. Idempotent.';

-- ===========================================================================
-- (5b) pwp_stamp_redeemed — Confirm-pass stamp redeemed_order_id. DEFINER (reaches
-- a non-owned cross-order USED code) but BOUND to the caller-supplied code allowlist
-- so a forged/reused claim_group cannot stamp another submit's codes.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.pwp_stamp_redeemed(
  p_codes        text[],
  p_claim_group  uuid,
  p_order_id     uuid
)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_n integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth required' USING ERRCODE='42501'; END IF;
  IF p_codes IS NULL OR array_length(p_codes,1) IS NULL
     OR p_claim_group IS NULL OR p_order_id IS NULL THEN RETURN 0; END IF;
  UPDATE public.pwp_codes
     SET redeemed_order_id = p_order_id, updated_at = now()
   WHERE code = ANY(p_codes)               -- ← only the codes THIS request claimed
     AND claim_group = p_claim_group        -- ← correlation key (belt)
     AND status = 'USED'
     AND redeemed_order_id IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT; RETURN v_n;
END; $$;
REVOKE ALL ON FUNCTION public.pwp_stamp_redeemed(text[], uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.pwp_stamp_redeemed(text[], uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.pwp_stamp_redeemed(text[], uuid, uuid) IS
  '2990s Products parity P8d (0188) — Confirm-pass stamp of redeemed_order_id on this submit''s claimed codes (own + cross-order). DEFINER (reaches a non-owned cross-order USED code that the owner-scoped RLS UPDATE could not), but the AUTHORITY is the caller-supplied code allowlist (code = ANY(p_codes)), not claim_group alone — so a forged/reused claim_group cannot stamp another submit''s codes. claim_group is a belt-and-suspenders correlation key.';

-- ===========================================================================
-- (7) Cancel reversal — REWRITE for cross-order semantics (3 disjoint branches).
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.pwp_codes_on_order_cancel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_claim_groups text[];
BEGIN
  SELECT array_agg(DISTINCT (ol.attrs -> 'pwp' ->> 'claimGroup'))
    INTO v_claim_groups
    FROM public.order_lines ol
   WHERE ol.order_id = NEW.id
     AND ol.attrs -> 'pwp' ->> 'claimGroup' IS NOT NULL;

  -- (A) RESTORE a CONSUMED cross-order voucher (this order redeemed a code it did
  --     NOT mint). Back to AVAILABLE so the customer keeps it. Keep source +
  --     bound_customer_phone + expires_at intact.
  UPDATE public.pwp_codes pc
     SET status            = 'AVAILABLE',
         redeemed_order_id = NULL,
         redeemed_item_sku = NULL,
         claim_group       = NULL,
         updated_at        = now()
   WHERE pc.status = 'USED'
     AND pc.source_order_id IS NOT NULL
     AND pc.source_order_id IS DISTINCT FROM NEW.id
     AND (
          pc.redeemed_order_id = NEW.id
       OR (v_claim_groups IS NOT NULL AND pc.claim_group::text = ANY(v_claim_groups))
     );

  -- (B) DELETE carry-forwards this CANCELLED order MINTED (never earned).
  DELETE FROM public.pwp_codes pc
   WHERE pc.status = 'AVAILABLE'
     AND pc.source_order_id = NEW.id;

  -- (C) DELETE same-cart USED codes (no source_order_id) — P8c behaviour.
  DELETE FROM public.pwp_codes pc
   WHERE pc.status = 'USED'
     AND pc.source_order_id IS NULL
     AND (
          pc.redeemed_order_id = NEW.id
       OR (v_claim_groups IS NOT NULL AND pc.claim_group::text = ANY(v_claim_groups))
     );

  RETURN NEW;
END;
$$;

-- (the trigger trg_pwp_codes_on_order_cancel is UNCHANGED from 0187; only the
--  function body is REPLACEd. CREATE OR REPLACE keeps the existing binding.)

COMMENT ON FUNCTION public.pwp_codes_on_order_cancel() IS
  '2990s Products parity P8d (0188) — cancel reversal, cross-order aware: (A) consumed cross-order (USED, source present + <> this order) → RESTORE to AVAILABLE; (B) minted carry-forwards (AVAILABLE, source = this order) → DELETE; (C) same-cart USED (no source) → DELETE (P8c). The 3 WHEREs are DISJOINT by status+source (no row matches two). DB invariant (§5.1): a same-cart USED code ALWAYS has source_order_id NULL (pwp_claim_code never sets source), so (A)/(C) never overlap. Joins by redeemed_order_id OR order lines'' attrs.pwp.claimGroup (covers the pre-stamp window). SECURITY DEFINER.';

COMMIT;
```

### 1.1 Column / RLS / RPC summary

| Object | Change | Why |
|---|---|---|
| `pwp_codes.bound_customer_phone text` | **ADD** | Cross-order binding = canonical phone (`pwp_phone_key`). NEVER returned to a non-owner. |
| `pwp_codes.owner_dealer_id uuid` | **ADD** | Dealer-scope snapshot for the same-dealer AVAILABLE RLS clause (no per-row join). |
| `pwp_codes.expires_at timestamptz` | **ADD** | Optional carry-forward validity window (§9 expiry). |
| `idx_pwp_codes_available_phone` / `_available_dealer` (partial) | **ADD** | AVAILABLE discovery/claim lookup. |
| `pwp_rules.carry_forward boolean default true` | **ADD** | Per-rule carry vs delete (§0.2). |
| `pwp_rules.carry_forward_days integer` | **ADD** | Optional expiry window (NULL = perpetual). |
| `pwp_codes_owner_select` → `pwp_codes_owner_or_dealer_available_select` | **DROP+CREATE** | Widen SELECT NARROWLY: owner OR same-dealer-AVAILABLE OR internal-AVAILABLE. **NOT global.** |
| `pwp_codes` INSERT/UPDATE/DELETE policies | **UNCHANGED** | Mutation owner-scoped; cross-order claim uses a DEFINER RPC. |
| `pwp_phone_key(text)` | **ADD** | MY-aware SQL canonicalizer (JS twin `phoneKeyMy`). |
| `pwp_discover_available(text,text)` | **ADD (DEFINER)** | Discovery with a MINIMAL projection + server-side phone match. No PII / no enumeration oracle. |
| `pwp_claim_available_code(...)` | **ADD (DEFINER)** | Atomic AVAILABLE→USED gated by phone + expiry. |
| `pwp_release_available_code(text[],uuid)` | **ADD (DEFINER)** | Rollback bounded to the request's code allowlist + claim_group + NOT-committed. |
| `pwp_stamp_redeemed(text[],uuid,uuid)` | **ADD (DEFINER)** | Confirm-pass stamp bounded to the request's code allowlist (not claim_group alone). |
| `pwp_codes_on_order_cancel()` | **REPLACE body** | Restore consumed / delete minted / delete same-cart (3 disjoint). |
| `customer_id` (uuid, P8c) | **untouched, unused forever** | Removing a shipped column = churn. CF `pwp-customer-id-dead-column`. |

---

## 2. CROSS-SESSION RLS — the exact predicate + leak proof (REV 2: scoped, not global)

**The original critique (BLOCKER):** the global `OR status='AVAILABLE'` made EVERY AVAILABLE row + its full DTO (incl. `bound_customer_phone` = another customer's PII, `owner_staff_id`, `trigger_item_code`) readable by EVERY authenticated user, including a rival dealer's salesperson — a cross-dealer customer-PII leak (PDPA, CLAUDE.md §17.5). **REV 2 fixes the table predicate AND the projection.**

### 2.1 The new TABLE SELECT policy (in-app reconciler convenience only — same-dealer)

```sql
USING (
  owner_staff_id = (SELECT auth.uid())                       -- my own codes (any status)
  OR ( status = 'AVAILABLE'
       AND owner_dealer_id IS NOT NULL
       AND owner_dealer_id = (SELECT public.app_dealer_id()) )  -- same-dealer AVAILABLE only
  OR ( status = 'AVAILABLE' AND (SELECT public.is_internal()) ) -- internal role: all AVAILABLE
)
```

**Why this does NOT leak across dealers — exhaustive case analysis:**

| Row state | Owner = caller? | Same dealer as caller? | Caller internal? | Table-visible? | Correct? |
|---|---|---|---|---|---|
| RESERVED | yes | — | — | ✅ | Own cart reconciler. |
| RESERVED | no | any | any | ❌ | ✅ No cross-cart snooping of an in-flight reservation. |
| USED | yes | — | — | ✅ | Own redemption audit. |
| USED | no | any | any | ❌ | ✅ A consumed voucher is owner-private; single-use guard means it can't be re-claimed anyway. |
| AVAILABLE | yes | — | — | ✅ | The minting salesperson sees their mints. |
| AVAILABLE | no | **yes** | — | ✅ | ✅ A colleague at the SAME dealer serving the same returning customer can reconcile. |
| AVAILABLE | no | **no** | no | ❌ | ✅ **A rival dealer can NOT table-read another dealer's voucher — no cross-dealer PII.** |
| AVAILABLE | no | no | **yes** | ✅ | ✅ Principal/finance/bd can audit all AVAILABLE (operational need). |

**The key safety property:** a non-owner can table-read an AVAILABLE row only within their own dealer (or as an internal role). Cross-dealer discovery of a *different* customer's voucher is **impossible via the table** — and even the table read still exposes the row columns, so the SAME-dealer/internal reads are the only place the raw row (incl. `bound_customer_phone`) is reachable, which is acceptable (a colleague at the same dealer serving the same customer). **All other discovery goes through `pwp_discover_available`, which returns NO phone/owner/trigger-sku.**

> **Business-rule note for Loo (the one judgment call):** "same-dealer AVAILABLE" assumes a returning customer redeems at the same dealer that minted the voucher. If Loo wants a customer to redeem a voucher across *different* dealers, that cross-dealer path is served by `pwp_discover_available` (by phone/code, stripped projection) — it works regardless of dealer because it's DEFINER. So the **default in-app auto-suggest is same-dealer (privacy-preserving); manual by-phone/by-code discovery works cross-dealer through the RPC.** Confirm with Loo whether auto-suggest should also span dealers (then the salesperson route would call `pwp_discover_available` instead of the table read). Tracked decision, not a blocker — the secure default is shipped.

### 2.2 The projection is stripped (the second half of the BLOCKER fix)

Even where a non-owner CAN read an AVAILABLE row (same-dealer / internal), the **discovery API never returns the full DTO**. Two layers:

- **`pwp_discover_available` (DEFINER, §1)** returns only `{ code, ruleId, type, rewardCategory, rewardTargets, sourceOrderId, expiresAt, phoneMatches }` — **never** `boundCustomerPhone`, `ownerStaffId`, `triggerItemCode`, `redeemedItemSku`, `customerId`. The phone is compared **server-side**; the client gets a boolean. This kills both the PII echo and the `?code=` enumeration oracle (an attacker can no longer read a bound phone off a row, so they cannot forge a matching order).
- **The `/available` route (§6.3) calls the RPC, not a table `select('*')`**, and parses into a NEW stripped `pwpDiscoverDtoSchema` (NOT `pwpCodeSchema`). The full `pwpCodeSchema` (with PII) is used ONLY by owner-scoped routes (`GET /mine`).

This mirrors the established `combo-cost-pos-bundle-exposure` defense-in-depth pattern (strip principal-only fields from a payload a lower-trust client receives).

**InitPlan compliance (CLAUDE.md §8 Fix 2):** `(SELECT auth.uid())`, `(SELECT public.app_dealer_id())`, `(SELECT public.is_internal())` are all wrapped → run once per query, not per row. `app_dealer_id()`/`is_internal()` are `stable security definer` (verified `0002_rls.sql:24,49`). The `owner_dealer_id` snapshot column means the AVAILABLE clause is a constant comparison, never a per-row join.

**Why UPDATE/DELETE stay owner-scoped (the brief's explicit ask):** opening the RLS UPDATE to `OR status='AVAILABLE'` would let any client `PATCH …{status:USED}` and burn a voucher with no phone check. Keeping UPDATE owner-scoped + routing the claim through `pwp_claim_available_code` (DEFINER, phone gate in the atomic WHERE) makes the binding unbypassable — the `delivery-followup-integrity` lesson.

---

## 3. CARRY-FORWARD — the Confirm-pass change (REV 2: hoisted out of the claims guard)

### 3.1 The structural fix (BLOCKER ×3 + MAJOR)

**Verified problem:** in the SHIPPED `orders.ts`, the Confirm-pass stamp + sweep (lines 542-590) is nested inside:

```ts
if (claimedPwpCodes.length > 0 && pwpClaimGroup) {   // ← line 542
  /* stamp ... + sweep (carry/delete) ... */
}
```

So the headline scenario — buy a sofa (mints RESERVED), take NO reward this cart (`claimedPwpCodes.length === 0`) — **skips the whole block**, and the RESERVED codes are never carried forward to AVAILABLE (nor deleted; they dangle until the orphan reaper). The feature no-ops for its primary use case.

Additionally, the sweep-key source (lines 564-589) is `bodyKeys (client pwpCartLineKeys) UNION derivedKeys (cart_line_key of the claimed codes)`. With 0 claims, `derivedKeys` is empty → `sweepKeys = bodyKeys` alone → **correctness depends entirely on the client sending `pwpCartLineKeys`**, contradicting the P8c invariant that the field is a hint.

**REV 2 restructures into TWO independent blocks:**

```ts
// ─────────────────────────────────────────────────────────────────────────────
// BLOCK 1 (unchanged scope) — CONFIRM-PASS STAMP. Stamps redeemed_order_id on the
// codes THIS submit claimed (own + cross-order). Only runs when a reward was
// actually claimed. Now via pwp_stamp_redeemed (DEFINER, code-allowlist bound) so
// it reaches a non-owned cross-order USED code (§4.4).
if (claimedPwpCodes.length > 0 && pwpClaimGroup) {
  const { data: stampedN, error: stampErr } = await sb.rpc("pwp_stamp_redeemed", {
    p_codes: claimedPwpCodes,
    p_claim_group: pwpClaimGroup,
    p_order_id: id,
  });
  if (stampErr) { await rollbackPwpClaims(); throw new HTTPException(500, { message: "Order created but PWP code stamp failed; please retry." }); }
  if ((stampedN ?? 0) < claimedPwpCodes.length) { await rollbackPwpClaims(); throw new HTTPException(500, { message: "Order created but PWP code stamp incomplete; please retry." }); }
}

// ─────────────────────────────────────────────────────────────────────────────
// BLOCK 2 (NEW, HOISTED OUT of the claims guard) — CARRY-FORWARD / DELETE SWEEP.
// Runs whenever THIS submit has ANY of the caller's RESERVED codes to dispose of,
// INDEPENDENT of whether a reward was claimed. The RESERVED set is SERVER-DERIVED
// (not the client field), so a claim-less carry-forward fires reliably.
const sweep = await sweepReservedForSubmit(sb, {
  ownerStaffId: auth.id,
  ownerDealerId: effectiveDealerId,          // the order's dealer (mint scope snapshot)
  orderId: id,
  customerPhone: parsed.data.customer.phone,  // raw; canonicalized inside
  finalLines,                                 // to resolve this cart's trigger lines server-side
  clientCartLineKeys: parsed.data.pwpCartLineKeys ?? [],  // hint, UNION'd (never the sole source)
});
if (sweep.status === "server_error") {
  // The order COMMITTED; a sweep failure leaves RESERVED dangling (the orphan
  // reaper / next cart-clear handles it). Do NOT 500 the committed order — log +
  // continue (the codes are harmless RESERVED; never double-counted). (Mirrors the
  // P8c re-fetch "exit 12" philosophy: post-commit, don't punish the client.)
  console.error("pwp carry-forward sweep failed (non-fatal):", sweep.message);
}
if (sweep.softWarning) {
  // MAJOR finding: a carry-forward was skipped for lack of a captured phone.
  // Surface it so the salesperson knows no voucher was minted (§3.3).
  carryForwardWarning = sweep.softWarning;  // folded into the 201 response meta
}
```

### 3.2 `sweepReservedForSubmit` — the server-derived sweep lib (`apps/api/src/lib/pwp-carry-forward.ts`, NEW)

```ts
export type SweepOutcome = {
  status: "ok" | "server_error";
  message?: string;
  carried: number;
  deleted: number;
  softWarning?: string;   // e.g. "2 earned vouchers were not saved (no customer phone captured)."
};

export async function sweepReservedForSubmit(sb, args): Promise<SweepOutcome> {
  // 1. SERVER-DERIVE the trigger set: resolve this cart's trigger SKUs → matching
  //    active rules (reuse the SAME RuleTarget matcher resolvePwp uses), then load
  //    the caller's RESERVED codes whose cart_line_key maps to a trigger line
  //    actually present in finalLines. This is the backstop that does NOT depend on
  //    the client field.
  //    Concretely: load ALL of the caller's RESERVED rows (owner_staff_id = uid,
  //    status='RESERVED') and UNION their cart_line_key with the client hint.
  const { data: reservedRows, error: resErr } = await sb
    .from(PWP_CODES)
    .select("code, rule_id, cart_line_key")
    .eq("owner_staff_id", args.ownerStaffId)
    .eq("status", "RESERVED");
  if (resErr) return { status: "server_error", message: resErr.message, carried: 0, deleted: 0 };

  // Scope to THIS submit: a RESERVED row is part of this submit iff its
  // cart_line_key is in (clientCartLineKeys ∪ the cart_line_keys of trigger lines
  // resolved from finalLines). A salesperson's RESERVED codes from a DIFFERENT
  // open cart (rare; different cart_line_key namespace) are left untouched.
  const submitKeys = new Set([
    ...args.clientCartLineKeys,
    ...deriveTriggerCartLineKeys(args.finalLines),  // server-side, from the order's own trigger lines
  ]);
  const inScope = (reservedRows ?? []).filter((r) => r.cart_line_key && submitKeys.has(r.cart_line_key));
  if (inScope.length === 0) return { status: "ok", carried: 0, deleted: 0 };

  // 2. Which rules carry forward? Live active rules with carry_forward = true.
  const { data: ruleRows, error: ruleErr } = await sb
    .from(PWP_RULES).select("*").eq("active", true);
  if (ruleErr) return { status: "server_error", message: ruleErr.message, carried: 0, deleted: 0 };
  const activeRules = (ruleRows ?? []).map(Adapters.pwpRuleFromRow);
  const carryRule = new Map(activeRules.filter((r) => r.carryForward !== false).map((r) => [r.id, r]));

  const boundPhone = phoneKeyMy(args.customerPhone);   // MY-aware (§0.3)
  const toCarry: Array<{ code: string; ruleId: string }> = [];
  const toDelete: string[] = [];
  let skippedForNoPhone = 0;
  for (const r of inScope) {
    if (r.rule_id && carryRule.has(r.rule_id)) {
      if (boundPhone) toCarry.push({ code: r.code, ruleId: r.rule_id });
      else { toDelete.push(r.code); skippedForNoPhone++; }   // MAJOR: would-carry but no phone
    } else {
      toDelete.push(r.code);                                  // rule inactive / no-carry → delete
    }
  }

  // 3. CARRY: RESERVED → AVAILABLE, stamped source + bound phone + dealer + expiry.
  let carried = 0;
  for (const grp of groupByRule(toCarry)) {  // group so a per-rule carry_forward_days applies
    const rule = carryRule.get(grp.ruleId)!;
    const expiresAt = rule.carryForwardDays
      ? new Date(Date.now() + rule.carryForwardDays * 86400_000).toISOString()
      : null;
    const { data, error } = await sb
      .from(PWP_CODES)
      .update({
        status: "AVAILABLE",
        source_order_id: args.orderId,
        bound_customer_phone: boundPhone,
        owner_dealer_id: args.ownerDealerId,
        expires_at: expiresAt,
        cart_line_key: null,             // detach from the dead cart line
        updated_at: new Date().toISOString(),
      })
      .eq("owner_staff_id", args.ownerStaffId)
      .eq("status", "RESERVED")          // idempotent guard
      .in("code", grp.codes)
      .select("code");
    if (error) return { status: "server_error", message: error.message, carried, deleted: 0 };
    carried += data?.length ?? 0;
  }

  // 4. DELETE the rest (RESERVED only — never AVAILABLE/USED).
  let deleted = 0;
  if (toDelete.length > 0) {
    const { data, error } = await sb
      .from(PWP_CODES).delete()
      .eq("owner_staff_id", args.ownerStaffId)
      .eq("status", "RESERVED")
      .in("code", toDelete)
      .select("code");
    if (error) return { status: "server_error", message: error.message, carried, deleted };
    deleted = data?.length ?? 0;
  }

  const softWarning = skippedForNoPhone > 0
    ? `${skippedForNoPhone} earned voucher(s) were not saved because no customer phone was captured.`
    : undefined;
  return { status: "ok", carried, deleted, softWarning };
}
```

**`deriveTriggerCartLineKeys(finalLines)`** resolves each line's SKU → `{category,modelId,variant}` (reuse `resolveSkuInfo`) and, for any line matching an active rule's TRIGGER scope, returns its deterministic cart-line key (the same key the reserve route stamped). This is the **server backstop** that makes `pwpCartLineKeys` a hint, not a dependency — closing the BLOCKER about the evaporated derived fallback.

### 3.3 The nullable-phone soft-warning (MAJOR fix)

A would-carry code with no captured phone is DELETEd (it can't bind), and `sweepReservedForSubmit` returns a `softWarning`. The route folds it into the 201 response (`meta.carryForwardWarning`), and the POS toasts "N earned voucher(s) were not saved — capture the customer's phone to keep them." This converts a **silent loss of a customer entitlement** into a visible, correctable signal. The POS additionally **requires a phone before a carry-forward rule's trigger reserves** (a UX gate, §6.2) so the common path captures the phone up front.

### 3.4 Idempotency / no new RPC for carry

The carry UPDATE + delete are guarded by `.eq("status","RESERVED")` (re-run matches 0). They run via the table under owner-scoped RLS — the caller owns their own RESERVED codes, and the owner CAN flip their own RESERVED → AVAILABLE (only a CROSS-order claim needs a DEFINER). `cart_line_key` is nulled on carry (the cart is gone; discovery keys on `bound_customer_phone`, not the line key).

---

## 4. CROSS-ORDER CLAIM — the order-path wiring

### 4.1 Decision: a SIBLING RPC (`pwp_claim_available_code`), not an overloaded `pwp_claim_code`

Same-cart predicate = `owner = uid AND status='RESERVED'`; cross-order = `non-owner AND status='AVAILABLE' AND phone matches`. Opposite on both axes. A sibling keeps each WHERE minimal (easier single-use proof) and avoids a breaking 4→5-arg signature change to the shipped `pwp_claim_code` (the ghost-overload trap, CLAUDE.md "verify PG signature").

### 4.2 Stage B extension — `apps/api/src/lib/pwp-codes-claim.ts` (+ `pwp-recompute.ts` carry-through)

**BLOCKER fix — `crossOrder` must survive `recomputePwpLines`.** Verified: the lib already carries `code`/`claimGroup` through three sites (capture at line 231/240; re-emit at line 382). P8d adds `crossOrder` to the SAME three sites:

```ts
// pwp-recompute.ts — site 1 (the claims[] type, ~line 202):
const claims: Array<{ index: number; ruleId: string; code: string; claimGroup: string; crossOrder: boolean }> = [];

// site 2 (the destructure + push, ~line 231/240):
const pwp = (attrs as { pwp?: { ruleId?: unknown; code?: unknown; claimGroup?: unknown; crossOrder?: unknown } } | null)?.pwp;
// ...
const crossOrder = pwp?.crossOrder === true;
claims.push({ index: i, ruleId, code, claimGroup, crossOrder });

// site 3 (the canonical-marker rebuild, ~line 382):
pwp: {
  ruleId: rule.id,
  type: rule.type,
  triggerRef: grant.triggerRef ?? null,
  ...(claim.code ? { code: claim.code } : {}),
  ...(claim.claimGroup ? { claimGroup: claim.claimGroup } : {}),
  ...(claim.crossOrder ? { crossOrder: true } : {}),   // ← NEW (omit when false → byte-identical)
},
```

**A unit test asserts** `out[i].attrs.pwp.crossOrder` survives a full recompute, AND is ABSENT for a same-cart marker (preserving DORMANT byte-identity). Without this patch the cross-order branch below is dead — exactly the critic's BLOCKER.

**The claim lib** (`readPwpClaim` extended to read `crossOrder`):

```ts
function readPwpClaim(attrs): { code; ruleId; claimGroup; crossOrder } {
  const pwp = (attrs as { pwp?: { code?; ruleId?; claimGroup?; crossOrder? } } | null)?.pwp;
  // ... existing code/ruleId/claimGroup ...
  const crossOrder = pwp?.crossOrder === true;
  return { code, ruleId, claimGroup, crossOrder };
}
// coded.push({ index, code, ruleId, claimGroup, sku, crossOrder });
```

Then the per-code claim loop branches on `crossOrder`:

```ts
const rpc = c.crossOrder ? "pwp_claim_available_code" : "pwp_claim_code";
const args = c.crossOrder
  ? { p_code: c.code, p_rule_id: c.ruleId, p_claim_group: claimGroup,
      p_redeemed_sku: c.sku, p_customer_phone: customerPhone }   // ← NEW arg
  : { p_code: c.code, p_rule_id: c.ruleId, p_claim_group: claimGroup,
      p_redeemed_sku: c.sku };
const { data: row, error } = await sb.rpc(rpc, args);
// ... NULL row → releasePartial() + 409 pwp_code_rejected (unchanged).
claimed.push({ code: c.code, crossOrder: c.crossOrder });  // ← ledger records mode (§4.3)
```

**The phone reaches the claim:** `claimPwpCodesForLines` gains `customerPhone: string | null`; `orders.ts` passes `parsed.data.customer.phone` (already in scope — it's passed to `recomputeDeliveryFee` at `:464`). The RPC canonicalizes via `pwp_phone_key` (the SQL twin of `phoneKeyMy`), so the route never pre-normalizes.

### 4.3 The rollback ledger distinguishes same-cart vs cross-order (REV 2: allowlist-bound)

```ts
export type ClaimedCode = { code: string; crossOrder: boolean };   // ← gains mode

// orders.ts rollback helper (split + allowlist-bound):
const rollbackPwpClaims = async (): Promise<void> => {
  const ownCodes   = pwpClaim.claimed.filter((c) => !c.crossOrder).map((c) => c.code);
  const crossCodes = pwpClaim.claimed.filter((c) =>  c.crossOrder).map((c) => c.code);
  if (ownCodes.length)   await sb.rpc("pwp_release_codes", { p_codes: ownCodes });           // USED→RESERVED (owner)
  if (crossCodes.length && pwpClaimGroup)
    await sb.rpc("pwp_release_available_code", { p_codes: crossCodes, p_claim_group: pwpClaimGroup }); // USED→AVAILABLE (DEFINER, bound)
};
```

**MAJOR fix — `pwp_release_available_code` is no longer a griefing/double-spend vector.** The §1 definition requires `code = ANY(p_codes)` AND `claim_group = p_claim_group` AND `redeemed_order_id IS NULL`. Consequences:
- A caller can only release codes **in their own request's ledger** (the route passes `crossCodes` it just claimed), not arbitrary codes.
- A code **already stamped to a committed order** (`redeemed_order_id` set) is **not releasable here** — only the cancel trigger restores a committed-then-cancelled redemption. This closes the **claim → commit → manual-release → re-claim double-spend** the critic flagged: once an order commits and stamps the code, `pwp_release_available_code` can never re-expose it.

### 4.4 The Confirm-pass stamp covers cross-order codes too (REV 2: code-allowlist, not claim_group-only)

A cross-order code is NOT owned by the caller, so the P8c owner-scoped `.update().eq("owner_staff_id", auth.id)` would miss it. **REV 2 routes the stamp through `pwp_stamp_redeemed(p_codes, p_claim_group, p_order_id)`** (§1, BLOCK 1 above). **MINOR/MAJOR fix:** the authority is the **caller-supplied code allowlist** (`code = ANY(p_codes)`), NOT `claim_group` alone — so a forged/reused `claim_group` cannot stamp another submit's unstamped USED codes (the lineage-corruption vector). `claim_group` is a belt-and-suspenders correlation key. `p_codes = claimedPwpCodes` (the exact set this request claimed); the short-row check (`stampedN < claimedPwpCodes.length`) still fail-closes (rollback + 500).

> **`pwp_restamp_orphans()` (P8c) cross-order note:** it is owner-scoped, so it won't restamp a cross-order code stranded in the post-commit crash window. The normal path is covered by the DEFINER stamp above; only a worker crash between `create_order` commit and the stamp leaves a cross-order code USED-unstamped — a lineage gap, not a double-spend (the code is USED, can't be re-claimed). Track CF `pwp-restamp-cross-order` (extend `pwp_restamp_orphans` to adopt a `source_order_id IS NOT NULL` code by the single committed order whose lines carry its `claimGroup`). Low priority.

### 4.5 Cross-order reaper gap (MINOR fix — track + bound)

The P8c `pwp_reap_orphans` (self-scoped, owner-only) will **never** reap a redeemer's crash-stranded cross-order claim (the redeemer doesn't own a cross-order code). A USED+unstamped code with `source_order_id IS NOT NULL` whose `claimGroup` no committed order adopted should return to **AVAILABLE** (not RESERVED, not deleted) so the customer's voucher isn't burned. **REV 2 adds a cross-order branch to `pwp_reap_orphans_all` (the cron-only DEFINER):**

```sql
-- inside pwp_reap_orphans_all, AFTER the own-owner USED→RESERVED reap:
UPDATE public.pwp_codes pc
   SET status='AVAILABLE', claim_group=NULL, redeemed_item_sku=NULL, updated_at=now()
 WHERE pc.status='USED'
   AND pc.redeemed_order_id IS NULL
   AND pc.source_order_id IS NOT NULL          -- ← cross-order lineage
   AND pc.updated_at < now() - make_interval(mins => v_grace)
   AND NOT EXISTS (
     SELECT 1 FROM public.orders o JOIN public.order_lines ol ON ol.order_id=o.id
      WHERE o.status <> 'cancelled' AND ol.attrs->'pwp'->>'claimGroup' = pc.claim_group::text);
```

This is cron-only (no auth.uid()), so a user JWT can never reach it. Until the cron is wired (CF `pwp-orphan-reaper-cron-unwired`, inherited from P8c), a crash-stranded cross-order claim sits USED-unstamped — bounded (requires a worker crash mid-flight) and DORMANT (0 codes). Track CF `pwp-cross-order-reap-cron`.

### 4.6 Rollback exit coverage — UNCHANGED structure

Every post-claim early-exit in `orders.ts` (the 12 exits) already calls `rollbackPwpClaims()`. P8d only changes the helper's BODY (split own/cross release, allowlist-bound). Call sites untouched. Per-exit tests assert a cross-order code returns to **AVAILABLE** (not RESERVED) on rollback.

---

## 5. CANCEL RESTORE — the exact WHERE branches (spelled out) + the disjointness GUARANTEE

The rewritten `pwp_codes_on_order_cancel()` has THREE branches:

| Cancelled order's relationship to the code | `status` | `source_order_id` | join | Action |
|---|---|---|---|---|
| **CONSUMED a cross-order voucher** | `USED` | `IS NOT NULL` and `<> NEW.id` | `redeemed_order_id = NEW.id` OR claim_group match | **RESTORE → AVAILABLE** (keep source + phone + expiry). |
| **MINTED carry-forwards** | `AVAILABLE` | `= NEW.id` | — | **DELETE** (never earned). |
| **same-cart redemption** (P8c) | `USED` | `IS NULL` | `redeemed_order_id = NEW.id` OR claim_group match | **DELETE**. |

### 5.1 The disjointness GUARANTEE (MAJOR fix — was asserted, now enforced + tested)

The critic correctly noted the three branches are disjoint ONLY IF a same-cart USED code always has `source_order_id IS NULL`. **REV 2 makes this a guaranteed invariant, not an assertion:**

1. **`pwp_claim_code` (P8c same-cart) NEVER writes `source_order_id`** — verified (the RPC stamps `status/claim_group/redeemed_item_sku/updated_at` only; `source_order_id` is only ever written by the carry-forward sweep, which writes it together with `status='AVAILABLE'`, never `USED`). So a same-cart USED code structurally cannot carry a source.
2. **`pwp_claim_available_code` PRESERVES `source_order_id`** (it was set at carry-forward; the claim only flips status to USED). So a cross-order USED code structurally always carries a source.
3. **A CHECK constraint makes the invariant DB-enforced** (defense-in-depth):
   ```sql
   ALTER TABLE public.pwp_codes
     ADD CONSTRAINT pwp_codes_samecart_used_no_source
     CHECK (NOT (status = 'USED' AND source_order_id IS NULL AND redeemed_item_sku IS NULL AND claim_group IS NULL))
     NOT VALID;  -- (informational; see note)
   ```
   > Note: a hard CHECK that "same-cart USED ⇒ source NULL AND cross-order USED ⇒ source NOT NULL" cannot be expressed as a single row CHECK without a discriminator column, and adding one is churn. So the **enforcement is by construction** (the two claim RPCs are the only writers of `status='USED'`, and their `source_order_id` behaviour is fixed) + a **regression test** (§8) rather than a constraint. The above CHECK is dropped from the final migration to avoid a meaningless partial guard; the invariant is documented in the function comment + the test is the gate.

**The regression test (the critic's explicit ask, §8.5):** a cancelled order carrying BOTH a same-cart USED code (source NULL) AND a consumed cross-order USED code (source set) **in the same `claim_group`** → branch (C) DELETEs the same-cart one and branch (A) RESTOREs the cross-order one. This proves the `source_order_id` filter — not `claim_group` — is what separates them, so a shared `claim_group` never mis-routes.

### 5.2 Ordering + idempotency

The three statements are disjoint by status+source (no row matches two), so order is irrelevant. A re-fire is blocked by the trigger's `WHEN (OLD.status IS DISTINCT FROM 'cancelled')` (unchanged). Even on a double-fire: (A)'s restored code is now AVAILABLE → (A) matches 0; (B)/(C) already deleted → 0.

### 5.3 The intentional asymmetry (documented)

Mint on order-1 (AVAILABLE) → consume on order-2 (USED, source=1, redeemed=2) → cancel order-2 → **(A) restores to AVAILABLE** → redeemable again on order-3. If order-1 (the minter) is cancelled while the voucher is AVAILABLE → **(B) deletes it**. If order-1 is cancelled while the voucher is USED on order-2 → (A)'s `source <> NEW.id` is FALSE (source = order-1) so it does NOT restore; (B) doesn't match (USED≠AVAILABLE); (C) doesn't match (source not null) → **the USED voucher is left intact** (order-2 legitimately consumed it before order-1 cancelled; we don't claw a redemption from order-2's customer). Conservative + documented. CF `pwp-mint-cancel-consumed-voucher-policy` if Loo wants stricter clawback.

---

## 6. ORDER-PATH + POS

### 6.1 Order-path summary (all in `orders.ts`, patched not rewritten)

1. **Stage B claim** (`claimPwpCodesForLines`, §4.2): gains `customerPhone`; per-code branches same-cart vs cross-order on `attrs.pwp.crossOrder` (now surviving the recompute, §4.2). Cross-order claim asserts phone binding + expiry in the RPC.
2. **Rollback helper** (§4.3): splits own (USED→RESERVED) vs cross (USED→AVAILABLE via `pwp_release_available_code`, allowlist-bound).
3. **Confirm-pass stamp** (§4.4, BLOCK 1): via `pwp_stamp_redeemed` (code-allowlist bound), reaches cross-order codes.
4. **Carry-forward sweep** (§3, BLOCK 2 — **hoisted out of the claims guard**, server-derived RESERVED set): RESERVED → AVAILABLE (active+carry rule + phone) | DELETE.

### 6.2 POS — the cross-order voucher entry (the new affordance)

P8c was Auto-Fill ONLY (bind a RESERVED code minted THIS cart). P8d adds cross-order discovery + manual entry, in `apps/web/src/pages/dealer/pos/CartDrawer.tsx` `PwpRow`:

**(a) Auto-suggest an AVAILABLE voucher by phone.** A new query `usePwpAvailableForPhone(phone)` hits `GET /api/pwp-codes/available?phone=…`, which calls `pwp_discover_available` (DEFINER, stripped projection, server-side phone match). When the cart's customer phone matches an AVAILABLE voucher whose `ruleId` covers the reward line, show **"Redeem saved voucher (RM… / FREE) — earned on SO-####"** (the source SO is in the projection; the phone is NOT). Clicking binds via `markLinePwpWithAvailableCode(line, rule, price, code, claimGroup)` which sets `attrs.pwp.crossOrder = true`.

**(b) Manual "type/scan a voucher number" field.** A text input; on entry, validate via `GET /api/pwp-codes/available?code=…&phone=…` → the route returns the stripped projection + `phoneMatches` boolean (computed server-side). If `phoneMatches && ruleCoversLine` → bind (crossOrder). If `!phoneMatches` → inline "This voucher belongs to a different customer." If not found → "Voucher not found or already used / expired." **The raw bound phone is never sent to the client** (the §1 BLOCKER fix), so a salesperson cannot read another customer's phone off a code lookup.

**THE PHONE-TIMING CONSTRAINT (verified, load-bearing):** POS order = `01 Catalog → 02 Customer → 03 Confirm`. The PWP rail renders in Step 1 but the phone is entered in Step 2 → `draft.customer.phone` is normally empty at the cart. Resolution (two layers):
- **Client UX:** the cross-order affordances are gated on `draft.customer.phone` being non-empty. If absent, the rail shows "Enter the customer's phone (step 2) to redeem a saved voucher," and a **"Saved vouchers for this customer" panel renders in the Confirm step** (after the phone is captured) where the salesperson applies an AVAILABLE voucher to an eligible line. (Auto-Fill same-cart stays in Step 1.) Additionally, a carry-forward rule's trigger reserve **prompts for the phone up front** (§3.3) so the common mint path captures it.
- **Server authority (the real gate):** regardless of WHEN the code is bound client-side, the binding is re-asserted at Confirm by `pwp_claim_available_code` against `pwp_phone_key(parsed.data.customer.phone)` (the FINAL submitted phone). Client gate = UX; server gate = security.

**Phone path (verified):** `draft.customer.phone` → `DealerPos.handleSubmit` `customer.phone` (`:356`) → `orders.ts parsed.data.customer.phone` → `claimPwpCodesForLines(..., customerPhone)` → `pwp_claim_available_code(p_customer_phone)`. No new plumbing beyond passing the existing phone one layer deeper.

### 6.3 New discovery route — `GET /api/pwp-codes/available` (REV 2: RPC + stripped DTO)

```ts
// GET /api/pwp-codes/available?phone=…  OR  ?code=…[&phone=…]
// Cross-order DISCOVERY (P8d). Calls the DEFINER pwp_discover_available — a MINIMAL
// projection (NO bound phone / owner / trigger sku). Phone match is SERVER-SIDE
// (phone_matches boolean). Requires a phone-or-code selector (no dump-all). PDPA-safe.
pwpCodesRouter.get("/available", async (c) => {
  const auth = c.var.auth;
  const sb = userClient(c.env, auth.jwt);
  const url = new URL(c.req.url);
  const phone = url.searchParams.get("phone");   // raw; canonicalized in the RPC
  const code = url.searchParams.get("code");
  if (!phone && !code) return c.json(pwpDiscoverResponseSchema.parse({ vouchers: [] }));

  const { data, error } = await sb.rpc("pwp_discover_available", {
    p_phone: phone ?? null,
    p_code: code ?? null,
  });
  if (error) throw new HTTPException(500, { message: error.message });
  // The RPC already returns the STRIPPED shape — map snake→camel into the discover DTO.
  const vouchers = ((data ?? []) as DB.PwpDiscoverRow[]).map(Adapters.pwpDiscoverFromRow);
  return c.json(pwpDiscoverResponseSchema.parse({ vouchers }));
});
```

**Why this is correct + sufficient:** the DEFINER RPC enforces the dealer/internal scope + the selector requirement + the server-side phone match, and returns NO PII. There is no `select('*')` table read anywhere on the discovery path. (Rate-limiting/audit of `/available` is a low follow-on; the selector requirement + stripped projection already remove the enumeration value.) The MUTATION (claim) is the only privileged write, and it's `pwp_claim_available_code`.

### 6.4 Shared contract additions (`packages/shared`)

- `tables.ts`: `PWP_CODES`/`PWP_RULES` already exist — no change.
- `rpcs.ts`: add `PWP_CLAIM_AVAILABLE_CODE`, `PWP_RELEASE_AVAILABLE_CODE`, `PWP_STAMP_REDEEMED`, `PWP_DISCOVER_AVAILABLE`.
- `db-types.ts`: `PwpCodeRow` gains `bound_customer_phone: string | null`, `owner_dealer_id: string | null`, `expires_at: string | null`; `PwpRuleRow` gains `carry_forward: boolean`, `carry_forward_days: number | null`; NEW `PwpDiscoverRow` (the stripped projection).
- `domain.ts` + `adapters.ts`:
  - `pwpCodeFromRow` maps the 3 new fields. **It is used ONLY by owner-scoped routes (`GET /mine`)** — never by `/available`.
  - NEW `pwpDiscoverFromRow` (maps the stripped `PwpDiscoverRow` → `PwpDiscoverDto`; **no phone/owner/trigger sku**).
  - `pwpRuleFromRow` maps `carryForward: row.carry_forward ?? true` (so a pre-0188 row / mock reads true) + `carryForwardDays: row.carry_forward_days ?? null`. **The existing P8a/P8c rule tests are updated** (not silently broken) to include the new fields (MINOR fix).
  - **`phoneKey` is promoted to a real shared export** `packages/shared/src/phone.ts` (`phoneKey` + the NEW `phoneKeyMy`), re-imported in `orders.ts`, `pwp-carry-forward.ts`, `pwp-codes-claim.ts`. `delivery-fee-recompute.ts:85`'s private const is replaced by the import (behaviour-identical for `phoneKey`; delivery is NOT switched to `phoneKeyMy` in P8d to avoid touching shipped delivery behaviour — tracked). **This is REQUIRED, not optional** — the §3 carry-forward code references `phoneKeyMy` in `orders.ts`/the sweep lib, which cannot import a module-private const (MINOR fix). A cross-test asserts `phoneKeyMy` (JS) === `pwp_phone_key` (SQL).
- `schemas/catalog.ts`:
  - `pwpCodeSchema`: add `boundCustomerPhone: z.string().nullable()`, `ownerDealerId: z.string().uuid().nullable()`, `expiresAt: z.string().nullable()`. **Leave `customerId` as `z.string().uuid().nullable()` (always null) + add a one-line comment that it is permanently null in favour of `boundCustomerPhone`** (MINOR fix). This schema is owner-scoped use only.
  - NEW `pwpDiscoverDtoSchema` = `{ code, ruleId(.uuid().nullable()), type, rewardCategory, rewardTargets, sourceOrderId(.uuid().nullable()), expiresAt(.nullable()), phoneMatches: z.boolean() }` + `pwpDiscoverResponseSchema = { vouchers: array }`. **`customerId`, `ownerStaffId`, `triggerItemCode`, `redeemedItemSku`, `boundCustomerPhone` are NOT in this schema** — the structural guarantee that discovery can't leak PII.
  - `pwpRuleSchema`: add `carryForward: z.boolean()`, `carryForwardDays: z.number().int().positive().nullable()`; the rule input/patch schema adds both optional.
  - `attrsPwpMarkerSchema` (`catalog.ts:687`, `.passthrough()`): add `crossOrder: z.boolean().optional()` (alongside `ruleId`/`code`/`claimGroup`).

### 6.5 Maintenance UI — the `carry_forward` toggle (+ optional expiry)

The principal's PWP rule editor (the P8a "PWP" tab) gains a **"Carry forward unused vouchers to the customer's next order"** checkbox (default checked) + an optional **"Voucher valid for N days (blank = no expiry)"** number field. Writes `carry_forward`/`carry_forward_days` via the existing principal-gated rule PATCH (the `pwp_rules` RLS already restricts writes to `is_principal()` — no new gate).

---

## 7. DORMANT PROOF — byte-identical with 0 active rules

1. **No active rules** → POS `pwpActive` false → reconciler never reserves → 0 RESERVED → `deriveTriggerCartLineKeys` empty → `pwpCartLineKeys: []`.
2. **Carry-forward sweep (BLOCK 2, REV 2):** runs unconditionally post-commit, but `sweepReservedForSubmit` first reads the caller's RESERVED codes → **0 rows** → `inScope.length === 0` → early `{carried:0, deleted:0}` with NO further read (no active-rules fetch). So a dormant order does ONE extra indexed read (`owner_staff_id+status` index, §0187) returning 0 rows — negligible, and 0 writes. (If even that one read must be elided, gate BLOCK 2 on `parsed.data.pwpCartLineKeys.length > 0 || <any cart line matched a trigger>`; but the unconditional 0-row read is cheap and removes the client-dependency, so it ships as-is.)
3. **Cross-order claim:** no line carries `attrs.pwp.crossOrder` → the lib's cross branch never fires → `pwp_claim_available_code` never called. Same-cart DORMANT short-circuit (no `attrs.pwp.code` → 0 DB calls) unchanged.
4. **RLS widening:** the new SELECT adds two AVAILABLE clauses; with 0 AVAILABLE rows they expose nothing. Owner-scoped reads behave identically.
5. **Discovery RPC:** `pwp_discover_available` is never called by the POS when `pwpActive` is false (affordances gated). A direct call with 0 AVAILABLE rows returns 0 rows.
6. **Cancel trigger:** the rewritten body's three branches all match 0 rows on a no-codes order (array_agg NULL, no AVAILABLE/USED). Same indexed-probe cost as P8c.
7. **`create_order` payload:** unchanged — `bound_customer_phone`/`carry_forward`/`owner_dealer_id`/`expires_at` live in `pwp_codes`/`pwp_rules`, never on `order_lines`. `finalLines` identical → identical order + total.

**Net:** 0 active rules ⇒ 0 reserved ⇒ 0 carry-forward ⇒ 0 AVAILABLE ⇒ 0 cross-order claims ⇒ orders byte-identical. The only always-on deltas: three nullable/defaulted columns (no row reads them when empty), a narrower-than-before-but-still-additional SELECT predicate that exposes 0 extra rows, and one 0-row indexed read in the carry-forward sweep.

---

## 8. TEST PLAN

### 8.1 Migration / RLS (integration, real PG or isolation harness)
- **SELECT scope (the BLOCKER):** Staff A (dealer-1) mints an AVAILABLE voucher. Staff B at **dealer-1** `GET /mine` does NOT see it (not RESERVED) but the table SELECT exposes it (same-dealer AVAILABLE). Staff C at **dealer-2** table-SELECT for that code → **0 rows** (cross-dealer AVAILABLE blocked). Internal (principal) table-SELECT → sees it. No staff sees Staff A's RESERVED or USED. Direct `PATCH/DELETE` by anyone but the owner → 0 rows.
- **InitPlan:** grep the new policy uses `(SELECT auth.uid())` / `(SELECT public.app_dealer_id())` / `(SELECT public.is_internal())`.

### 8.2 Discovery RPC (the PII/enumeration BLOCKER)
- `pwp_discover_available(phone=…)` returns the stripped projection (assert `bound_customer_phone`/`owner_staff_id`/`trigger_item_code`/`redeemed_item_sku`/`customer_id` are **absent** from the row shape).
- `?code=X` with a NON-matching phone → row returned but `phoneMatches=false`, and **the raw bound phone is never in the payload** (devtools-readable response contains no phone). 
- No selector (`phone` empty + `code` empty) → 0 rows (no dump-all).
- Cross-dealer: a dealer-2 salesperson `pwp_discover_available(phone=customer-of-dealer-1)` → 0 rows (scope = own dealer) UNLESS Loo enables cross-dealer (then internal/explicit path). Internal role → returns it.
- Expired AVAILABLE (`expires_at < now()`) → not returned.

### 8.3 Carry-forward at Confirm (`orders.test.ts` + isolated `pwp-carry-forward.test.ts`)
- **The headline (BLOCKER regression test):** order with a trigger, **0 rewards claimed**, rule active + `carry_forward=true`, customer phone present → after Confirm: the trigger's RESERVED codes are **AVAILABLE** (source=order, bound phone, dealer stamped, `cart_line_key=NULL`). (Pre-REV-2 this asserted 0 — the hoist is the fix.) Crucially: assert this fires with `claimedPwpCodes.length === 0`.
- **Server-derived sweep (BLOCKER):** same as above but with `pwpCartLineKeys: []` (client omitted) → still carries (the server backstop resolves the trigger lines from `finalLines`).
- `carry_forward=false` → DELETEd, 0 AVAILABLE.
- Rule deactivated between reserve & Confirm → DELETEd.
- **Phone EMPTY (MAJOR):** would-carry but no phone → DELETEd + the 201 response carries a `carryForwardWarning` (assert the soft-warning surfaces).
- `carry_forward_days=30` → AVAILABLE with `expires_at ≈ now()+30d`.
- Mixed: 1 reward claimed (USED, stamped) + 2 unclaimed under a carry rule → 1 USED + 2 AVAILABLE.

### 8.4 Cross-order claim by phone (`orders.test.ts` + `pwp-codes-claim.test.ts`)
- **crossOrder survives recompute (BLOCKER):** unit test asserts `recomputePwpLines` output keeps `attrs.pwp.crossOrder=true` for a cross marker AND omits it for a same-cart marker.
- **Matching phone (ok):** seed AVAILABLE (source=SO-A, bound=`pwp_phone_key('0123456789')`, rule R). Submit order-B `customer.phone='+60 12-345 6789'` + reward line `attrs.pwp={ruleId:R,code,claimGroup,crossOrder:true}` → code USED, `redeemed_order_id=B`, source preserved, price = P8b forced.
- **MY-aware normalization (MAJOR):** assert `0123456789`, `+6012-3456789`, `60123456789` all bind equal; a `+65…` non-MY stays distinct. Cross-test `phoneKeyMy`(JS) === `pwp_phone_key`(SQL) over the set.
- **Mismatched phone → 409**, code stays AVAILABLE. **Wrong rule → 409**. **No-phone order → 409** (`v_want=''`). **Expired → 409**.

### 8.5 Cancel restore vs delete (the three branches + disjointness)
- Restore consumed; delete minted; delete same-cart (each branch).
- **Disjointness regression (MAJOR):** a cancelled order carrying BOTH a same-cart USED code (source NULL) AND a consumed cross-order USED code (source set) **sharing one `claim_group`** → same-cart DELETEd, cross-order RESTORED. Proves `source_order_id` (not `claim_group`) separates them.
- **Pre-stamp window (MINOR):** a cross-order consumer cancelled with `redeemed_order_id` still NULL but `claimGroup` set → branch (A) restores via the claim_group join.
- Minting order cancelled while voucher USED elsewhere → voucher left intact (§5.3 asymmetry).
- Via `operation_abandon_order` → same behaviour (one trigger covers both paths).

### 8.6 Single-use across concurrent redeeming orders (the headline)
- ONE AVAILABLE code, two concurrent `pwp_claim_available_code(...)` → exactly one row, the other NULL (the `status='AVAILABLE'` lock). Document no extra unique index needed (`code` is PK; the predicate serializes).
- **Double-spend closure (MAJOR):** claim → commit (stamped) → call `pwp_release_available_code([code], group)` → **0 rows** (blocked by `redeemed_order_id IS NULL`). The committed voucher cannot be re-exposed.
- **Forged claim_group (MINOR):** `pwp_stamp_redeemed([other-submit-code], guessed_group, my_order)` → 0 rows (the code isn't in this caller's allowlist for that order's flow — assert it cannot stamp a foreign code).

### 8.7 Confirm-pass cross-order stamp + rollback
- Cross-order claim succeeds → `pwp_stamp_redeemed` stamps `redeemed_order_id` (reaches the non-owned code via the code allowlist). Short-row → release + 500.
- Rollback split: a downstream drift exit after a cross-order claim → `pwp_release_available_code` restores to **AVAILABLE**; after a same-cart claim → `pwp_release_codes` restores to RESERVED; mixed batch → each to its correct state.

### 8.8 Dormant no-op (byte-identical guard)
- 0 active rules: place an order → 0 rows in `pwp_codes`, identical order_lines/total vs a pre-P8d baseline, 0 calls to any pwp claim/discover RPC (the sweep does ONE 0-row read), `/available` returns `{vouchers:[]}`. Cancel → trigger no-ops.

### 8.9 POS (web) + on-behalf
- `markLinePwpWithAvailableCode` stamps `attrs.pwp={ruleId,code,claimGroup,crossOrder:true}`.
- Cross-order affordance HIDDEN when `draft.customer.phone` empty (Step 1); SHOWN in Confirm once entered.
- `/available` mocked (stripped DTO) → auto-suggest renders "earned on SO-####" with NO phone in the payload; manual-entry mismatch shows "different customer" from the server `phoneMatches=false`.
- **On-behalf (MINOR fix — explicit test, not a parity bullet):** the principal-on-behalf path (PR #37, `DealerPos` `actingDealerId`) places an order under the PRINCIPAL's internal JWT. Assert: (a) discovery via `pwp_discover_available` works (internal scope → sees the dealer's AVAILABLE voucher); (b) the carry-forward sweep stamps `owner_dealer_id = effectiveDealerId` (the acted-for dealer, NOT the principal) so a later same-dealer salesperson can reconcile it; (c) the claim's phone binding uses `parsed.data.customer.phone` (works identically). Confirm the widened SELECT + discovery don't block the principal.

---

## 9. OPEN RISKS

1. **Phone canonicalization is MY-aware but not E.164-perfect.** `phoneKeyMy` strips `60`/leading-`0` to a national core; it does not validate length or handle a genuinely non-MY number beyond falling back to digits. A customer with a foreign number that collides with a MY core (rare) could mis-bind. Bounded + dormant. The cross-test (§8) locks JS↔SQL agreement — BUT see CF `pwp-phone-key-twin-not-db-verified`: that test compares `phoneKeyMy` (JS) against a hand-written JS re-impl of the SQL, NOT the real Postgres `pwp_phone_key`, so it guards the JS↔JS contract only (a true JS↔Postgres guard needs an integration test running the real function; the JS twin + migration must be edited in lockstep). Firm follow-on: back-port delivery follow-up to `phoneKeyMy` for one canonical identity rule (CF `phone-canonicalization-unify`).
2. **Single-use = the atomic `WHERE status='AVAILABLE'` predicate, not a unique index** — strictly better than the delivery follow-up's soft read. No partial unique index needed (`code` is the PK). Residual: claim → reject downstream → release → re-claim is CORRECT (re-redeemable until a committed order consumes it). The **post-commit** double-spend is closed (§4.3: `pwp_release_available_code` requires `redeemed_order_id IS NULL`).
3. **Cross-order release is DEFINER but allowlist-bound (REV 2).** It restores USED→AVAILABLE only for codes in the caller's own request ledger (`code = ANY(p_codes)`) + matching `claim_group` + NOT committed. The original griefing/double-spend vector (arbitrary codes / committed re-exposure) is CLOSED. Residual: a caller could re-expose a code its OWN in-flight (uncommitted) request just claimed — which is exactly rollback, harmless. CF `pwp-release-available-griefing` closed.
4. **The minting order's cancel does NOT claw back an already-consumed voucher** (§5.3 asymmetry). Intentional + documented. CF `pwp-mint-cancel-consumed-voucher-policy` if Loo wants stricter clawback.
5. **`bound_customer_phone` trusts the order's submitted phone.** A typo binds to an unreachable phone; self-correcting (the voucher sits AVAILABLE) + the soft-warning (§3.3) + the by-code manual redemption (which still asserts the phone) mitigate. Low.
6. **Cross-order reaper is cron-only + unwired in P8c (`pwp-orphan-reaper-cron-unwired`) and the new cross-order reap branch (§4.5) is also cron-only.** A redeemer's crash-stranded cross-order claim sits USED-unstamped until the cron runs. Bounded (worker crash mid-flight) + DORMANT. CF `pwp-cross-order-reap-cron`.
7. **`pwp_restamp_orphans()` is owner-scoped** and won't restamp a cross-order code in the post-commit crash window (lineage gap, not double-spend). CF `pwp-restamp-cross-order`.
8. **`customer_id` (uuid) remains a permanently-dead column** — excluded from BOTH the owner DTO comment + the discovery DTO entirely. CF `pwp-customer-id-dead-column` (drop in a future cleanup migration).
9. **(NEW) Voucher expiry is shipped (per-rule `carry_forward_days`) but defaults to perpetual.** With `carry_forward_days` NULL, an AVAILABLE voucher lives until redeemed or its minting order cancels — the critic's "perpetual voucher" concern. REV 2 gives the principal the lever (`carry_forward_days`) + the claim asserts `expires_at`. A discontinued promotion's already-minted vouchers still survive (deactivating the rule stops new mints, not existing AVAILABLE) — to expire those, the principal sets a window before/at activation, OR a future "expire all vouchers for rule X" admin action (CF `pwp-bulk-expire-vouchers`). The `GET /available` growth concern is bounded by the expiry filter + the selector requirement (no dump-all). Documented so Loo accepts the perpetual default knowingly.
10. **(NEW) Same-dealer auto-suggest is the default discovery scope.** A returning customer is assumed to redeem at the minting dealer for the in-app auto-suggest; cross-dealer redemption works through the by-phone/by-code RPC (internal/explicit). Confirm with Loo whether auto-suggest should span dealers (§2.1 note). Tracked decision, secure default shipped.

### 9.1 Review-pass DEFERRED findings (CFs) — recorded, not coded (P8d adversarial review, 2026-06-28)

These four review findings were verified real but are MINOR + DORMANT (0 codes in prod); the lowest-risk resolution per each finding is a tracked CF, not a code change. (The other findings in the same pass — the `carry_forward` write-path MAJOR, the cross-order reap branch, the delivery `phoneKey` dedup, the cancel-trigger non-exhaustiveness doc, and the phone twin-test limitation — WERE fixed in this pass.)

- `pwp-stamp-short-row-split-state` (Finding 4, MINOR) — BLOCK 1's fail-closed path: `pwp_stamp_redeemed` is one atomic UPDATE, so a "short row" (`stampedN < claimedPwpCodes.length`) means some claimed codes already got `redeemed_order_id` stamped (they matched the WHERE) while others did not, and the subsequent `rollbackPwpClaims()` then releases the OWN codes (USED→RESERVED) but `pwp_release_available_code` refuses any CROSS code whose `redeemed_order_id` is now set (its WHERE requires `redeemed_order_id IS NULL`). Result on this rare path: own codes revert to RESERVED while the just-stamped cross codes stay USED+stamped to the (committed) order — a split ledger the 500/retry doesn't fully unwind. Edge-of-edge: the order DID commit; the cross codes are correctly stamped to the real order, so leaving them is arguably correct. If exact symmetry is wanted, have `pwp_stamp_redeemed` RETURN the stamped code list and roll back only the codes that did NOT stamp. Dormant.
- `pwp-sweep-cross-cart-contamination` (Finding 5, MINOR) — `sweepReservedForSubmit` loads ALL the caller's RESERVED rows globally (`owner_staff_id` + `status=RESERVED`) then scopes by `triggerSkus`(server-derived from `finalLines`) ∪ `clientCartLineKeys`. If the same salesperson has a SECOND in-flight cart (another tab/session) that reserved a voucher for a trigger SKU that ALSO appears in THIS order's `finalLines`, that other cart's RESERVED row matches `triggerSkus` and is swept (carried/deleted) by THIS submit — cross-cart contamination bounded to the same owner. The client `cartLineKey` hint does not prevent it because the server-derived trigger branch is OR'd in. NOTE: the server-derived branch is the §3.2 BLOCKER fix (correctness must not hinge on the client field), so tightening it to require a `cartLineKey`/`claimGroup` correlation as PRIMARY scope partially trades against that design — defer until real multi-cart concurrency is observed. Acceptable as-is for v1 (same-owner, low concurrency, dormant).
- `pwp-carry-forward-warning-toast-unwired` (Finding 8, MINOR) — `orders.ts` sets the `X-Pwp-Carry-Forward-Warning` response header (§3.3 soft-warning: a would-carry voucher was dropped for lack of a captured phone), but `DealerPos.handleSubmit` never reads it — `useCreateOrder`/`apiFetch` return the parsed `Order` body only and don't surface response headers. Wiring it needs `apiFetch`/the TanStack mutation to expose headers (broader plumbing than a minimal fix; the 201 body stays byte-identical by design). Defer; the server-side carry/delete decision + the by-code manual redemption are unaffected. Dormant.
- `pwp-rpc-name-constants` (Finding 9, MINOR) — the four new PWP RPCs are invoked via string literals (`pwp_claim_available_code` / `pwp_release_available_code` / `pwp_stamp_redeemed` / `pwp_discover_available`) rather than constants in a `packages/shared/src/rpcs.ts` (which CLAUDE.md §9.4 mandates but **does not exist anywhere in this repo** — every RPC project-wide is a string literal, incl. the P8c `pwp_claim_code`/`pwp_release_codes`). Spec §6.4 asked for the consts; creating `rpcs.ts` for 4 names while hundreds of other literals remain would be inconsistent + out of scope. Accepted deviation, consistent with the established project-wide pattern; retrofit a real `rpcs.ts` as a separate cleanup if/when the convention is adopted repo-wide.

---

## 10. PRE-APPLY CHECKLIST (run on prod, read-only, before the lead applies 0188)

1. `list_migrations` → confirm tail = **0187** (P8c applied). 0188 stacks on it.
2. Confirm the P8c objects exist: `pwp_codes` (with `source_order_id`, `customer_id`, `status` CHECK admitting `AVAILABLE`, `claim_group`, `owner_staff_id`, `cart_line_key`), `pwp_claim_code`/`pwp_release_codes`/`pwp_reap_orphans`/`pwp_reap_orphans_all`/`pwp_restamp_orphans`, the `pwp_codes_owner_select` policy (to DROP), the 3 owner-scoped INSERT/UPDATE/DELETE policies (to KEEP), and `trg_pwp_codes_on_order_cancel` (binding stays; only the function body is REPLACEd).
3. Verify the live `pwp_codes_on_order_cancel()` body matches the 0187 text before REPLACE (CLAUDE.md "verify PG body before editing") — so the rewrite supersedes the known-good P8c version.
4. Confirm `pwp_rules` has no existing `carry_forward` / `carry_forward_days` column; `pwp_codes` has no `bound_customer_phone` / `owner_dealer_id` / `expires_at` (ADD would 42701).
5. Confirm `pwp_claim_available_code` / `pwp_release_available_code` / `pwp_stamp_redeemed` / `pwp_discover_available` / `pwp_phone_key` do NOT already exist.
6. Confirm `public.app_dealer_id()` + `public.is_internal()` exist + are `stable security definer` (they do — `0002_rls.sql:24,49`) — the new RLS clause depends on them.
7. Confirm `public.dealers(id)` exists (the `owner_dealer_id` FK target) — it does (`0001_init.sql`).
8. Confirm 0 active `pwp_rules` (the dormant assumption) so the apply is byte-identical in prod.

---

## File deliverables for the build

- `supabase/migrations/0188_pwp_codes_phone_binding.sql` — `pwp_phone_key`; ADD `pwp_codes.{bound_customer_phone, owner_dealer_id, expires_at}` + 2 partial indexes; ADD `pwp_rules.{carry_forward, carry_forward_days}`; DROP+CREATE the SELECT policy (owner OR same-dealer-AVAILABLE OR internal-AVAILABLE); CREATE `pwp_discover_available` (DEFINER, stripped projection, server-side phone match) / `pwp_claim_available_code` (DEFINER, phone+expiry) / `pwp_release_available_code` (DEFINER, allowlist+claim_group+NOT-committed) / `pwp_stamp_redeemed` (DEFINER, code-allowlist); extend `pwp_reap_orphans_all` with the cross-order reap branch; REPLACE `pwp_codes_on_order_cancel()` (3-branch). **FILE ONLY — lead applies after §10.**
- `apps/api/src/routes/orders.ts` — Stage B `customerPhone` param; rollback helper split (own/cross, allowlist-bound); Confirm-pass via `pwp_stamp_redeemed` (BLOCK 1, claims-gated); **carry-forward sweep HOISTED into BLOCK 2** (server-derived RESERVED set, runs claim-less); soft-warning folded into the 201 meta. (Patched; `create_order` call UNTOUCHED.)
- `apps/api/src/lib/pwp-carry-forward.ts` — NEW `sweepReservedForSubmit` + `deriveTriggerCartLineKeys` (server-derived RESERVED scope; carry/delete; expiry; soft-warning).
- `apps/api/src/lib/pwp-codes-claim.ts` — `readPwpClaim` reads `crossOrder`; per-code branch `pwp_claim_code` vs `pwp_claim_available_code`; `customerPhone` param; `ClaimedCode` gains `crossOrder`; split partial-release (allowlist-bound).
- `apps/api/src/lib/pwp-recompute.ts` — **carry `crossOrder` through the 3 existing carry-through sites** (claims type, destructure+push, rebuild re-emit). Unit test: crossOrder survives, absent for same-cart.
- `apps/api/src/routes/pwp-codes.ts` — `GET /available?phone=|code=` discovery route calling `pwp_discover_available` (RPC, stripped DTO — NO `select('*')`).
- `packages/shared/src/phone.ts` — NEW: `phoneKey` (promoted) + `phoneKeyMy` (MY-aware). Re-import in `orders.ts`/`pwp-carry-forward.ts`/`pwp-codes-claim.ts`; replace `delivery-fee-recompute.ts:85` private const with the import (behaviour-identical). Cross-test JS↔SQL.
- `packages/shared/src/{rpcs,db-types,domain,adapters}.ts` + `schemas/catalog.ts` — 4 new RPC consts; `bound_customer_phone`/`owner_dealer_id`/`expires_at` on `PwpCodeRow`+domain+`pwpCodeFromRow`; `carry_forward`/`carry_forward_days` on `PwpRuleRow`+`pwpRuleFromRow` (defaults true/null) **with the existing P8a/P8c rule tests UPDATED**; NEW `PwpDiscoverRow`/`PwpDiscoverDto`/`pwpDiscoverFromRow`/`pwpDiscoverDtoSchema`/`pwpDiscoverResponseSchema` (stripped — no PII); `boundCustomerPhone`/`ownerDealerId`/`expiresAt` on `pwpCodeSchema` (owner-scoped use only) + the `customerId` permanently-null comment; `carryForward`/`carryForwardDays` on `pwpRuleSchema`+input; `crossOrder` on `attrsPwpMarkerSchema`.
- `apps/web/src/pages/dealer/pos/pwp-line.ts` — `markLinePwpWithAvailableCode` (stamps `crossOrder:true`); `linePwpCrossOrder` reader.
- `apps/web/src/pages/dealer/pos/CartDrawer.tsx` — cross-order auto-suggest (`usePwpAvailableForPhone`) + manual-entry affordance in `PwpRow`, gated on `draft.customer.phone`; "Saved vouchers for this customer" panel in the Confirm step; the carry-forward-rule phone prompt.
- `apps/web/src/pages/dealer/DealerPos.tsx` — pass `customerPhone` to the rail; `usePwpAvailableForPhone` wiring; surface the `carryForwardWarning` toast.
- The PWP rule Maintenance editor — a `carry_forward` checkbox + optional `carry_forward_days` field (principal-gated via existing `pwp_rules` RLS).