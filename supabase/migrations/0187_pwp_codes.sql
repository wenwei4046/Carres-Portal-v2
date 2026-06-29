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
--
-- FILE ONLY — the lead applies this to prod after review (run the §5.4 pre-apply
-- checklist first). Every CREATE OR REPLACE here is a NEW function (verified: no
-- pwp_claim_code / pwp_release_codes / pwp_reap_orphans / pwp_codes_on_order_cancel
-- exists today) — nothing is clobbered.

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

-- ===========================================================================
-- §2 — THE THREE SECURITY DEFINER RPCs. All authenticated-grant-only (NOT
-- service_role). Each replicates the RLS owner scope in its body so a definer
-- call is no more powerful than an owner-scoped RLS write.
-- ===========================================================================

-- §2.1 pwp_claim_code — atomic RESERVED → USED, bound to the pricing rule + a claim_group.
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

COMMENT ON FUNCTION public.pwp_claim_code(text, uuid, uuid, text) IS
  '2990s Products parity P8c (0187) — atomic same-cart claim: flip a RESERVED code owned by the caller AND minted under p_rule_id to USED, stamping p_claim_group + the reward sku. WHERE (status=RESERVED AND rule_id=p_rule_id AND owner=auth.uid()) is the double-spend / wrong-rule / cross-owner guard. NULL row = not claimable (409). redeemed_order_id stays NULL (stamped by the Confirm-pass). SECURITY DEFINER, authenticated-only, NEVER service_role.';

-- §2.2 pwp_release_codes — idempotent USED → RESERVED (atomic batch rollback).
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

COMMENT ON FUNCTION public.pwp_release_codes(text[]) IS
  '2990s Products parity P8c (0187) — idempotent atomic batch rollback: USED → RESERVED for an array of the caller-owned codes in ONE statement (un-stamps claim_group / redeemed_order_id / redeemed_item_sku). Idempotent via WHERE status=USED. The post-claim failure-exit rollback in the order route. SECURITY DEFINER, authenticated-only.';

-- §2.3 pwp_reap_orphans — recovery for crash-stranded USED-unstamped codes.
-- Recovery for the unavoidable post-commit window: a code is claimed USED before
-- create_order, then stamped (redeemed_order_id) only AFTER create_order returns.
-- If the worker dies between the claim commit and the stamp, the code is USED with
-- redeemed_order_id IS NULL and NO live order ever references its claim_group → it
-- is a provable orphan. This reaper RELEASES such codes back to RESERVED so their
-- voucher numbers are reclaimed (never permanently burned).
--
-- SAFE because it only touches codes that are BOTH (a) USED with NULL
-- redeemed_order_id AND (b) older than a grace interval AND (c) whose claim_group
-- is NOT referenced by any non-cancelled order's lines (i.e. no committed order
-- adopted them). A code mid-flight (just claimed, order about to commit) is younger
-- than the grace window → skipped.
--
-- SECURITY (review BLOCKER fix): this is the AUTHENTICATED-callable, SELF-SCOPED
-- form. Unlike pwp_claim_code / pwp_release_codes, the original design left this
-- RPC trusting a caller-supplied p_owner (default NULL = ALL owners) + an
-- arbitrary p_grace_minutes, so any authenticated user could bypass the Hono route
-- and POST /rest/v1/rpc/pwp_reap_orphans {p_grace_minutes:0, p_owner:null} to (a)
-- mutate other owners' / nulled-owner rows and (b) open a grace=0 double-spend
-- window on an in-flight claim. It now (i) REQUIRES auth, (ii) forces the owner to
-- auth.uid() (no p_owner param — the WHERE always scopes to the caller, replicating
-- the RLS owner scope per §2.4), and (iii) clamps the grace to a 15-minute floor so
-- a caller can never reap a just-claimed in-flight code. The all-owners /
-- nulled-owner backstop lives in the SEPARATE pwp_reap_orphans_all() below, which
-- is NOT granted to authenticated (cron/service path only).
--
-- Invoked opportunistically by GET /mine + POST /reap for the CALLER's own
-- orphans (owner-scoped — see §4.4a).
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
     -- belt: no committed (non-cancelled) order adopted this claim_group.
     AND NOT EXISTS (
       SELECT 1
         FROM public.orders o
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

COMMENT ON FUNCTION public.pwp_reap_orphans(integer) IS
  '2990s Products parity P8c (0187) — SELF-SCOPED recovery for the CALLER''s crash-stranded codes: release a USED code back to RESERVED iff it is the caller''s own AND redeemed_order_id IS NULL AND older than max(p_grace_minutes,15) AND no non-cancelled order adopted its claim_group (the NOT EXISTS belt). Owner is forced to auth.uid() (no p_owner param) + a 15-min grace floor — a caller can never reap another owner''s row nor an in-flight claim (review BLOCKER fix). GET /mine self-heal + POST /reap. SECURITY DEFINER, authenticated-only. The all-owners backstop is pwp_reap_orphans_all(), cron-only.';

-- §2.3b pwp_reap_orphans_all — the ALL-OWNERS (incl. nulled-owner) backstop.
-- IDENTICAL reaping logic to the self-scoped form but across EVERY owner, plus the
-- nulled-owner RESERVED-garbage sweep (a RESERVED row with owner_staff_id IS NULL,
-- stranded by mid-cart staff deletion, can never be claimed — the claim requires
-- owner_staff_id = auth.uid() — so it is pure garbage). This is NOT granted to
-- authenticated: it has no auth.uid() context (the daily cron runs it via the
-- scheduled path), so it must never be reachable from a user JWT. The grace floor
-- still applies. Wire this to a daily MYT cron when the orphan-reaper backstop goes
-- live (see CF pwp-orphan-reaper-cron-unwired).
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
BEGIN
  UPDATE public.pwp_codes pc
     SET status            = 'RESERVED',
         claim_group       = NULL,
         redeemed_item_sku = NULL,
         updated_at        = now()
   WHERE pc.status = 'USED'
     AND pc.redeemed_order_id IS NULL
     AND pc.updated_at < now() - make_interval(mins => v_grace)
     AND NOT EXISTS (
       SELECT 1
         FROM public.orders o
         JOIN public.order_lines ol ON ol.order_id = o.id
        WHERE o.status <> 'cancelled'
          AND ol.attrs -> 'pwp' ->> 'claimGroup' = pc.claim_group::text
     );
  GET DIAGNOSTICS v_n = ROW_COUNT;

  -- nulled-owner RESERVED garbage (un-claimable) — hard delete.
  DELETE FROM public.pwp_codes
   WHERE status = 'RESERVED' AND owner_staff_id IS NULL;

  RETURN v_n;
END;
$$;

-- REVOKE FROM public is NOT sufficient on Supabase: its default privileges grant
-- EXECUTE to authenticated/anon DIRECTLY (not via PUBLIC), so the all-owners form
-- must be explicitly revoked from those two roles to stay cron/service-only.
-- service_role keeps EXECUTE (the daily cron runs under it). NOT granted to
-- authenticated — the all-owners form must never be reachable from a user JWT.
REVOKE ALL ON FUNCTION public.pwp_reap_orphans_all(integer) FROM public;
REVOKE ALL ON FUNCTION public.pwp_reap_orphans_all(integer) FROM authenticated, anon;

COMMENT ON FUNCTION public.pwp_reap_orphans_all(integer) IS
  '2990s Products parity P8c (0187) — the ALL-OWNERS (incl. nulled-owner) orphan-reaper backstop: same USED-unstamped release logic as pwp_reap_orphans but across every owner, plus a hard DELETE of nulled-owner RESERVED garbage. 15-min grace floor. NOT granted to authenticated — daily cron / service path only. Wire to a daily MYT cron when the backstop goes live (CF pwp-orphan-reaper-cron-unwired).';

-- §2.3c pwp_restamp_orphans — close the post-commit RE-STAMP lineage gap (review MINOR).
-- The INVERSE of the reaper's belt: if the worker dies AFTER create_order commits but
-- BEFORE the §4.4 Confirm-pass stamp runs, the code is left USED with redeemed_order_id
-- IS NULL while its claim_group IS adopted by exactly one committed non-cancelled order
-- (so the reaper correctly LEAVES it, but nothing ever stamps redeemed_order_id —
-- leaving a permanently unstamped USED row that a "which order redeemed this voucher"
-- report / P8d would mis-read as unstamped). This SELF-SCOPED, idempotent pass stamps
-- the caller's such codes with the adopting order's id. Idempotent: re-running after a
-- successful stamp matches nothing (redeemed_order_id IS NULL is then false). Called by
-- GET /mine alongside the reaper. Only stamps when EXACTLY ONE committed non-cancelled
-- order adopted the claim_group (ambiguous multi-order claim_groups are left for a human).
CREATE OR REPLACE FUNCTION public.pwp_restamp_orphans()
RETURNS integer
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

  UPDATE public.pwp_codes pc
     SET redeemed_order_id = adopt.order_id,
         updated_at        = now()
    FROM (
      SELECT pc2.code AS code, MIN(o.id) AS order_id
        FROM public.pwp_codes pc2
        JOIN public.orders o      ON o.status <> 'cancelled'
        JOIN public.order_lines ol ON ol.order_id = o.id
                                  AND ol.attrs -> 'pwp' ->> 'claimGroup' = pc2.claim_group::text
       WHERE pc2.owner_staff_id = v_uid
         AND pc2.status = 'USED'
         AND pc2.redeemed_order_id IS NULL
         AND pc2.claim_group IS NOT NULL
       GROUP BY pc2.code
      HAVING COUNT(DISTINCT o.id) = 1          -- exactly one adopting order (unambiguous)
    ) AS adopt
   WHERE pc.code = adopt.code
     AND pc.owner_staff_id = v_uid
     AND pc.status = 'USED'
     AND pc.redeemed_order_id IS NULL;         -- idempotent guard
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION public.pwp_restamp_orphans() FROM public;
GRANT EXECUTE ON FUNCTION public.pwp_restamp_orphans() TO authenticated;

COMMENT ON FUNCTION public.pwp_restamp_orphans() IS
  '2990s Products parity P8c (0187) — close the post-commit re-stamp lineage gap (review MINOR): self-scoped + idempotent, stamp the caller''s USED codes that have redeemed_order_id IS NULL but whose claim_group IS adopted by EXACTLY ONE committed non-cancelled order (the inverse of the reaper''s belt) with that order''s id. Called by GET /mine alongside the reaper so P8d''s redeemed_order_id lineage stays accurate. SECURITY DEFINER, authenticated-only.';

-- ===========================================================================
-- §5 — CANCEL REVERSAL (H2): when an order enters 'cancelled', reverse any
-- same-cart P8c codes it consumed. ONE trigger covers cancel_order +
-- operation_abandon_order + any future cancel path. SIBLING-TRIGGER NOTE
-- (corrected — the original "no existing CREATE TRIGGER ON orders" claim was
-- WRONG): three BEFORE-UPDATE triggers already exist on public.orders —
-- orders_auto_issue_on_dispatched_trg (0098), orders_auto_status_delivered_trg
-- (0106), and orders_set_updated_at. All three are BEFORE timing and either guard
-- themselves out of the cancel transition (0106 only rewrites NEW.status on
-- proceed_order→delivered; 0098 is dispatch-only) or are content-agnostic
-- (set_updated_at). This new trigger is AFTER UPDATE OF status, so it neither
-- collides with nor depends on ordering against them (BEFORE fires first + can
-- still rewrite NEW.status; AFTER then sees the final committed NEW.status, and the
-- WHEN clause re-checks NEW.status='cancelled'). The §5.4 pg_trigger pre-apply
-- check remains the hard gate.
-- ===========================================================================

-- H2 (the 2990s gap fixed day-one): when an order enters 'cancelled', reverse any
-- same-cart P8c codes it consumed. The join is BY redeemed_order_id (set on the
-- success path) OR by claim_group (set at claim, so it ALSO catches a code that was
-- claimed-USED but not yet stamped — the post-commit window of §4.4). SAME-CART
-- semantics: a code was RESERVED→USED FOR THIS cart, so cancelling the order means
-- the redemption never happened → DELETE the code (identical to the cart-clear
-- path; there is no AVAILABLE life to restore in P8c). ONE trigger covers
-- cancel_order + operation_abandon_order + any future cancel path. AFTER UPDATE OF
-- status, so it coexists with the three pre-existing BEFORE-UPDATE triggers on
-- orders (see the §5 sibling-trigger note above) with no ordering dependency.
-- SECURITY DEFINER so it runs with table rights regardless of which RPC/role fired
-- the cancel; reads NEW.id (+ resolves claim_groups from the order's own lines).
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

COMMENT ON FUNCTION public.pwp_codes_on_order_cancel() IS
  '2990s Products parity P8c (0187) — H2 cancel reversal: on an order entering cancelled, DELETE the same-cart USED pwp_codes it consumed (joined by redeemed_order_id OR the order lines'' attrs.pwp.claimGroup, so the unstamped-USED post-commit window is also covered). SAME-CART: no AVAILABLE life to restore in P8c. Covers cancel_order + operation_abandon_order + any future cancel path. SECURITY DEFINER.';

CREATE TRIGGER trg_pwp_codes_on_order_cancel
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  WHEN (NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled')
  EXECUTE FUNCTION public.pwp_codes_on_order_cancel();

COMMIT;
