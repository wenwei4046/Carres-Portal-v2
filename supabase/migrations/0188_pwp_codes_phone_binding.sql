-- 0188_pwp_codes_phone_binding.sql
-- 2990s Products parity Phase 8d — CROSS-ORDER VOUCHER CARRY-FORWARD (the FINAL
-- slice). Turns ON the cross-order path P8c (0187) shipped dormant. Adds:
--   (1) pwp_codes.bound_customer_phone — the CANONICAL phone (pwp_phone_key:
--       digits, strip 60, strip leading 0) an AVAILABLE carry-forward voucher is
--       bound to. The cross-order claim asserts the redeeming order's canonical
--       phone matches. customer_id (uuid, P8c dormant) stays unused.
--   (2) pwp_rules.carry_forward — per-rule policy; + carry_forward_days (optional
--       expiry, NULL = perpetual).
--   (3) RLS SELECT widened NARROWLY: owner OR (AVAILABLE within the caller's
--       dealer scope) OR (internal-role AVAILABLE). NOT global — AVAILABLE is NOT
--       world-readable. Cross-dealer / by-phone / by-code discovery goes through
--       pwp_discover_available (DEFINER, minimal projection, server-side phone
--       match). RESERVED/USED stay owner-private. (DROP+recreate the P8c
--       pwp_codes_owner_select policy.)
--   (4) pwp_claim_available_code — sibling claim RPC: atomic AVAILABLE→USED gated
--       by the phone binding + optional expiry. SECURITY DEFINER.
--   (5) pwp_release_available_code / pwp_stamp_redeemed — DEFINER, but BOUND to a
--       caller-supplied code allowlist (code = ANY(p_codes)) so a forged
--       claim_group cannot reach foreign codes, and a committed-stamped code
--       cannot be released.
--   (6) pwp_discover_available — DEFINER read returning a MINIMAL projection (no
--       phone / owner / trigger sku); server-side phone match → boolean.
--   (7) pwp_codes_on_order_cancel rewritten (3 disjoint branches): consumed
--       cross-order → restore AVAILABLE; minted carry-forward → delete; same-cart
--       USED → delete.
--   (8) pwp_phone_key(text) — the MY-aware canonicalizer (JS twin = phoneKeyMy).
--   (9) pwp_reap_orphans_all extended with a CROSS-ORDER reap branch (§4.5): a
--       crash-stranded cross-order claim (USED, source NOT NULL, no committed
--       adopter) → restore to AVAILABLE (not RESERVED); the same-cart reap branch
--       is scoped to source NULL so the two stay disjoint. Cron-only (unwired CF).
-- Additive + DORMANT (0 active rules → 0 carry-forward → 0 AVAILABLE → byte-
-- identical orders). FILE ONLY — the lead applies after the pre-apply checklist.
-- Tail after this = 0188.
--
-- SUPABASE FOOTGUN (P8c lesson, 0187 lines 339-345): REVOKE FROM public is NOT
-- sufficient on Supabase to make a DEFINER fn un-callable — its default privileges
-- grant EXECUTE to authenticated/anon DIRECTLY (not via PUBLIC). ALL FOUR P8d RPCs
-- here ARE authenticated-callable by design (claim / release / stamp / discover),
-- so GRANT EXECUTE ... TO authenticated is the CORRECT posture for them (no extra
-- REVOKE FROM authenticated, anon needed — unlike pwp_reap_orphans_all).

BEGIN;

-- ===========================================================================
-- (8) the MY-aware phone canonicalizer (JS twin = packages/shared phoneKeyMy).
-- Strip a leading 60 / leading 0 trunk so 012-345 6789, 0123456789,
-- +60 12-345 6789, 60123456789 all canonicalize to the SAME national core. A
-- cross-test (packages/shared/src/phone.test.ts) asserts JS phoneKeyMy === this.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.pwp_phone_key(p text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT regexp_replace(
           regexp_replace(
             regexp_replace(coalesce(p,''), '\D', '', 'g'),  -- digits only
           '^60', ''),                                        -- drop leading 60
         '^0+', '')                                           -- drop leading 0s
$$;

COMMENT ON FUNCTION public.pwp_phone_key(text) IS
  '2990s Products parity P8d (0188) — MY-aware phone canonicalizer: digits-only, strip a leading 60 (country code) then leading 0s (domestic trunk), so 012-345 6789 / 0123456789 / +60 12-345 6789 / 60123456789 all map to 123456789. JS twin = packages/shared phoneKeyMy (a cross-test asserts byte-identical output). Used by the cross-order claim binding + the carry-forward sweep + discovery so mint and redeem normalize identically. IMMUTABLE.';

-- ===========================================================================
-- (1) the cross-order binding = the carrying order's CANONICAL customer phone.
-- ===========================================================================
ALTER TABLE public.pwp_codes
  ADD COLUMN bound_customer_phone text;

COMMENT ON COLUMN public.pwp_codes.bound_customer_phone IS
  '2990s Products parity P8d (0188) — the CANONICAL (pwp_phone_key: digits, strip 60, strip leading 0) customer phone an AVAILABLE carry-forward voucher is bound to, stamped from the minting order at Confirm. The cross-order claim asserts pwp_phone_key(redeeming order phone) = this. customer_id (uuid, P8c dormant) is intentionally unused. NULL for every RESERVED / same-cart USED code. NEVER returned to a non-owner client (discovery uses pwp_discover_available with a stripped projection + server-side phone match).';

-- (1b) owner_dealer_id — the minting salesperson's dealer, snapshotted at mint so
-- the dealer-scoped AVAILABLE RLS clause never joins app_users per row (InitPlan).
-- Backfilled NULL (no rows in a dormant prod). Written by the carry-forward sweep.
ALTER TABLE public.pwp_codes
  ADD COLUMN owner_dealer_id uuid REFERENCES public.dealers(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.pwp_codes.owner_dealer_id IS
  '2990s Products parity P8d (0188) — the minting salesperson''s dealer (snapshot at carry-forward), so the dealer-scoped AVAILABLE RLS clause is a constant comparison (no per-row app_users join). NULL for RESERVED / same-cart USED.';

-- expires_at on the code (stamped at carry-forward when the rule sets a window).
ALTER TABLE public.pwp_codes
  ADD COLUMN expires_at timestamptz;

COMMENT ON COLUMN public.pwp_codes.expires_at IS
  '2990s Products parity P8d (0188) — when an AVAILABLE carry-forward voucher lapses (set from pwp_rules.carry_forward_days at mint). NULL = perpetual. pwp_claim_available_code asserts (expires_at IS NULL OR expires_at > now()).';

-- AVAILABLE discovery + cross-order claim lookup, canonical phone. Partial = only
-- the live carry-forward rows.
CREATE INDEX idx_pwp_codes_available_phone
  ON public.pwp_codes (bound_customer_phone)
  WHERE status = 'AVAILABLE';

-- Dealer-scoped AVAILABLE read (the in-app reconciler RLS clause, below).
CREATE INDEX idx_pwp_codes_available_dealer
  ON public.pwp_codes (owner_dealer_id)
  WHERE status = 'AVAILABLE';

-- ===========================================================================
-- (2) per-rule carry-forward policy + optional expiry.
-- ===========================================================================
ALTER TABLE public.pwp_rules
  ADD COLUMN carry_forward boolean NOT NULL DEFAULT true;
ALTER TABLE public.pwp_rules
  ADD COLUMN carry_forward_days integer;        -- NULL = perpetual (default)

COMMENT ON COLUMN public.pwp_rules.carry_forward IS
  '2990s Products parity P8d (0188) — when an unclaimed RESERVED voucher minted by this rule reaches Confirm: TRUE (default) → flip to AVAILABLE (cross-order, bound to phone) iff the rule is still active AND a phone is captured; FALSE → DELETE (same-cart, P8c). Principal-only write (pwp_rules RLS).';
COMMENT ON COLUMN public.pwp_rules.carry_forward_days IS
  '2990s Products parity P8d (0188) — optional validity window for a carry-forward voucher (days from the minting Confirm). NULL = perpetual. When set, the AVAILABLE row is stamped expires_at = now()+days and pwp_claim_available_code asserts expires_at > now().';

-- ===========================================================================
-- (3) RLS — widen SELECT NARROWLY. AVAILABLE is NOT globally readable. A
-- salesperson can read an AVAILABLE voucher from the table ONLY within their OWN
-- dealer scope (the in-app same-dealer reconciler convenience). Cross-dealer /
-- by-phone / by-code discovery goes EXCLUSIVELY through pwp_discover_available
-- (DEFINER, stripped projection, server-side phone match) — so a rival dealer can
-- never table-read another customer's voucher PII. INSERT/UPDATE/DELETE stay
-- OWNER-SCOPED (the cross-order AVAILABLE→USED claim is pwp_claim_available_code).
-- ===========================================================================
DROP POLICY pwp_codes_owner_select ON public.pwp_codes;

CREATE POLICY pwp_codes_owner_or_dealer_available_select
  ON public.pwp_codes FOR SELECT
  USING (
    owner_staff_id = (SELECT auth.uid())                        -- my own (any status)
    OR (
      status = 'AVAILABLE'
      AND owner_dealer_id IS NOT NULL
      AND owner_dealer_id = (SELECT public.app_dealer_id())      -- same-dealer AVAILABLE only
    )
    OR (
      status = 'AVAILABLE'
      AND (SELECT public.is_internal())                         -- principal/logistics/finance/bd
    )
  );

COMMENT ON POLICY pwp_codes_owner_or_dealer_available_select ON public.pwp_codes IS
  '2990s Products parity P8d (0188) — read scope = my own codes (any status) OR an AVAILABLE voucher minted WITHIN MY DEALER (same-dealer reconciler) OR (internal role) any AVAILABLE. AVAILABLE is NOT world-readable: a rival dealer''s salesperson cannot table-read another dealer''s AVAILABLE voucher (no cross-dealer PII). RESERVED/USED stay strictly owner-private. Cross-dealer / by-phone / by-code discovery uses pwp_discover_available (DEFINER, stripped projection). Mutation stays owner-scoped; the AVAILABLE→USED claim is pwp_claim_available_code. InitPlan-wrapped.';

-- (UPDATE / INSERT / DELETE policies from 0187 UNCHANGED — owner_staff_id = auth.uid().)

-- ===========================================================================
-- (6) pwp_discover_available — the DISCOVERY read. SECURITY DEFINER so it can
-- surface a voucher across dealers WITHOUT exposing it to the table SELECT, and
-- returns a MINIMAL projection (NO phone, NO owner, NO trigger sku). Phone match
-- is SERVER-SIDE: the caller passes the cart's phone; the function returns only the
-- booleans/values the POS needs. A bare call with no selector returns 0 rows (no
-- "dump all AVAILABLE"). Internal roles discover across dealers; a salesperson is
-- scoped to their own dealer's mints.
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
  -- redeemed_order_id stays NULL (stamped by the Confirm-pass via pwp_stamp_redeemed
  -- + the code allowlist). source_order_id PRESERVED (lineage origin).
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.pwp_claim_available_code(text, uuid, uuid, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.pwp_claim_available_code(text, uuid, uuid, text, text) TO authenticated;

COMMENT ON FUNCTION public.pwp_claim_available_code(text, uuid, uuid, text, text) IS
  '2990s Products parity P8d (0188) — the CROSS-ORDER claim: atomic AVAILABLE→USED gated by (rule_id + bound_customer_phone = pwp_phone_key(redeeming phone) + expiry). SECURITY DEFINER (mutates a non-owned code). WHERE status=AVAILABLE is the single-use lock (concurrent claims serialize; loser matches 0 → NULL → 409). Stamps claim_group; the Confirm-pass stamps redeemed_order_id; PRESERVES source_order_id. NEVER service_role.';

-- ===========================================================================
-- (5a) pwp_release_available_code — rollback a cross-order claim USED→AVAILABLE.
-- DEFINER (the caller does not own the code) but BOUND to: the caller-supplied
-- code allowlist (p_codes = this request's own ledger) AND the per-submit
-- claim_group AND redeemed_order_id IS NULL (NEVER release a code already stamped
-- to a committed order — that path is the cancel trigger ONLY). Closes the
-- post-commit double-spend.
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
-- a non-owned cross-order USED code) but BOUND to the caller-supplied code
-- allowlist so a forged/reused claim_group cannot stamp another submit's codes.
-- Covers BOTH same-cart (owner) and cross-order (non-owner) USED codes via the
-- code allowlist, so the Confirm-pass no longer needs an owner-scoped table update.
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
-- (A) consumed cross-order voucher (USED, source present + <> this order) →
--     RESTORE to AVAILABLE (keep source + bound_customer_phone + expires_at).
-- (B) carry-forwards this CANCELLED order MINTED (AVAILABLE, source = this order)
--     → DELETE (never earned).
-- (C) same-cart USED (no source) → DELETE (P8c behaviour).
-- DISJOINT by status+source: a same-cart USED code ALWAYS has source_order_id
-- NULL (pwp_claim_code never sets source) + a cross-order USED code ALWAYS carries
-- a source (set at carry-forward, preserved by the cross-order claim), so (A)/(C)
-- never overlap. The CREATE OR REPLACE keeps the existing trigger binding from
-- 0187 (trg_pwp_codes_on_order_cancel) — only the function body is REPLACEd.
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

COMMENT ON FUNCTION public.pwp_codes_on_order_cancel() IS
  '2990s Products parity P8d (0188) — cancel reversal, cross-order aware: (A) consumed cross-order (USED, source present + <> this order) → RESTORE to AVAILABLE; (B) minted carry-forwards (AVAILABLE, source = this order) → DELETE; (C) same-cart USED (no source) → DELETE (P8c). The 3 WHEREs are DISJOINT by status+source (no row matches two). DB invariant: a same-cart USED code ALWAYS has source_order_id NULL (pwp_claim_code never sets source) + a cross-order USED code ALWAYS carries a source, so (A)/(C) never overlap. Joins by redeemed_order_id OR order lines'' attrs.pwp.claimGroup (covers the pre-stamp window). INTENTIONALLY NOT EXHAUSTIVE (spec §5.3): when the MINTING order O1 of a cross-order voucher is cancelled AFTER that voucher was already redeemed by a different order O2 (USED, source=O1, redeemed=O2), the row falls through all three branches — (A) is skipped because source = NEW.id, (B) needs AVAILABLE, (C) needs source NULL. This is BY DESIGN: a committed downstream redemption (O2) is never retroactively repriced/clawed back when its minting order cancels. SECURITY DEFINER.';

-- ===========================================================================
-- (9) pwp_reap_orphans_all — extend the cron-only backstop with a CROSS-ORDER
-- reap branch (spec §4.5). A redeemer's crash-stranded cross-order claim (USED +
-- redeemed_order_id NULL + source_order_id NOT NULL, no committed adopter) must
-- return to AVAILABLE — NOT RESERVED (a cross-order voucher is claimed from
-- AVAILABLE, never RESERVED) and NOT deleted (the customer's entitlement survives).
-- The P8c body restored EVERY USED-unstamped code to RESERVED; we now SCOPE that
-- own-owner branch to same-cart codes (source_order_id IS NULL) so the two reap
-- branches are DISJOINT, then add the cross-order USED→AVAILABLE branch. Still
-- cron/service-only (no auth.uid() context) → REVOKE from authenticated/anon.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.pwp_reap_orphans_all(
  p_grace_minutes integer DEFAULT 15
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_grace integer := GREATEST(COALESCE(p_grace_minutes, 15), 15);  -- 15-min floor
  v_n     integer;
  v_x     integer;
BEGIN
  -- (a) same-cart crash-stranded USED-unstamped → RESERVED (P8c logic, now scoped
  --     to source_order_id IS NULL so a cross-order code falls to branch (b)).
  UPDATE public.pwp_codes pc
     SET status            = 'RESERVED',
         claim_group       = NULL,
         redeemed_item_sku = NULL,
         updated_at        = now()
   WHERE pc.status = 'USED'
     AND pc.redeemed_order_id IS NULL
     AND pc.source_order_id IS NULL                 -- ← same-cart only (P8d scope)
     AND pc.updated_at < now() - make_interval(mins => v_grace)
     AND NOT EXISTS (
       SELECT 1
         FROM public.orders o
         JOIN public.order_lines ol ON ol.order_id = o.id
        WHERE o.status <> 'cancelled'
          AND ol.attrs -> 'pwp' ->> 'claimGroup' = pc.claim_group::text
     );
  GET DIAGNOSTICS v_n = ROW_COUNT;

  -- (b) cross-order crash-stranded USED-unstamped → AVAILABLE (P8d §4.5). The
  --     voucher was minted on another order (source_order_id NOT NULL); a redeemer
  --     crashed before the Confirm-pass stamp, so no committed order adopted its
  --     claimGroup. Restore the customer's entitlement (keep source + bound phone +
  --     expiry intact; only status/claim_group/redeemed_item_sku revert).
  UPDATE public.pwp_codes pc
     SET status            = 'AVAILABLE',
         claim_group       = NULL,
         redeemed_item_sku = NULL,
         updated_at        = now()
   WHERE pc.status = 'USED'
     AND pc.redeemed_order_id IS NULL
     AND pc.source_order_id IS NOT NULL             -- ← cross-order lineage
     AND pc.updated_at < now() - make_interval(mins => v_grace)
     AND NOT EXISTS (
       SELECT 1
         FROM public.orders o
         JOIN public.order_lines ol ON ol.order_id = o.id
        WHERE o.status <> 'cancelled'
          AND ol.attrs -> 'pwp' ->> 'claimGroup' = pc.claim_group::text
     );
  GET DIAGNOSTICS v_x = ROW_COUNT;
  v_n := v_n + v_x;

  -- nulled-owner RESERVED garbage (un-claimable) — hard delete (P8c, unchanged).
  DELETE FROM public.pwp_codes
   WHERE status = 'RESERVED' AND owner_staff_id IS NULL;

  RETURN v_n;
END;
$$;

-- REVOKE FROM public is NOT sufficient on Supabase: its default privileges grant
-- EXECUTE to authenticated/anon DIRECTLY (not via PUBLIC), so the all-owners form
-- must be explicitly revoked from those two roles to stay cron/service-only.
REVOKE ALL ON FUNCTION public.pwp_reap_orphans_all(integer) FROM public;
REVOKE ALL ON FUNCTION public.pwp_reap_orphans_all(integer) FROM authenticated, anon;

COMMENT ON FUNCTION public.pwp_reap_orphans_all(integer) IS
  '2990s Products parity P8d (0188) — the ALL-OWNERS orphan-reaper backstop, now cross-order aware: (a) same-cart crash-stranded USED-unstamped (source NULL) → RESERVED; (b) cross-order crash-stranded USED-unstamped (source NOT NULL, no committed adopter) → AVAILABLE (§4.5, the customer keeps the voucher); + the nulled-owner RESERVED-garbage hard delete. 15-min grace floor. NOT granted to authenticated — daily cron / service path only. Cron still unwired (CF pwp-orphan-reaper-cron-unwired / pwp-cross-order-reap-cron).';

COMMIT;
