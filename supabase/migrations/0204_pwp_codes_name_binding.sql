-- ============================================================================
-- 0204 — PWP cross-order voucher binding: NAME + PHONE (2990s parity)
--
-- Loo 2026-07-06: "Voucher Code System 和 Cross Delivery Code System 都是绑定
-- 客户姓名和客户电话号码的" — the 2990s reference binds a carried-forward
-- voucher to the customer identity keyed on NAME + PHONE (its `customers`
-- unique key is (lower(trim(name)), phone): a shared phone with a DIFFERENT
-- name is a DIFFERENT customer, so the voucher never crosses). 0188 bound by
-- canonical PHONE only; this migration adds the NAME half.
--
--   (1) pwp_codes.bound_customer_name — the canonical (lower/trim) name the
--       carry-forward sweep stamps alongside bound_customer_phone.
--   (2) pwp_name_key(text) — the SQL canonicalizer (JS twin: shared nameKey).
--   (3) pwp_claim_available_code — DROP the 5-arg version + recreate with
--       p_customer_name; the claim now asserts BOTH bindings. A legacy code
--       (bound_customer_name IS NULL, stamped pre-0204) stays phone-only.
--   (4) pwp_discover_available — DROP the 2-arg version + recreate with p_name
--       + a server-computed name_matches boolean (PII never returned).
--
-- DROP + CREATE (not CREATE OR REPLACE) on both RPCs because the signatures
-- change — CREATE OR REPLACE with a new arg list would leave the old overload
-- live as a ghost ([[feedback_verify_pg_signature_before_create_or_replace]]).
-- A sanity block asserts exactly ONE overload of each survives.
--
-- NO RLS policy changes.
-- ============================================================================

-- (1) The bound-name column. NULL = pre-0204 code (phone-only binding).
ALTER TABLE public.pwp_codes
  ADD COLUMN IF NOT EXISTS bound_customer_name text;

COMMENT ON COLUMN public.pwp_codes.bound_customer_name IS
  '0204 — canonical (lower/trim) customer name stamped at carry-forward, the NAME half of the 2990s name+phone voucher binding. NULL = legacy phone-only code.';

-- (2) The canonicalizer. IMMUTABLE — pure text transform.
CREATE OR REPLACE FUNCTION public.pwp_name_key(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$ SELECT lower(btrim(coalesce(p, ''))) $$;

COMMENT ON FUNCTION public.pwp_name_key(text) IS
  '0204 — canonical customer-name key for the voucher binding (lower + trim). JS twin: @carres/shared nameKey.';

-- (3) pwp_claim_available_code — signature change: + p_customer_name.
DROP FUNCTION IF EXISTS public.pwp_claim_available_code(text, uuid, uuid, text, text);

CREATE FUNCTION public.pwp_claim_available_code(
  p_code            text,
  p_rule_id         uuid,
  p_claim_group     uuid,
  p_redeemed_sku    text,
  p_customer_phone  text,          -- the REDEEMING order's customer phone (raw)
  p_customer_name   text           -- the REDEEMING order's customer name (raw)
)
RETURNS public.pwp_codes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_want_phone text := public.pwp_phone_key(p_customer_phone);
  v_want_name  text := public.pwp_name_key(p_customer_name);
  v_row        public.pwp_codes;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth required' USING ERRCODE = '42501';
  END IF;
  IF p_claim_group IS NULL THEN
    RAISE EXCEPTION 'claim_group required' USING ERRCODE = '22023';
  END IF;
  IF v_want_phone = '' THEN
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
     AND bound_customer_phone  = v_want_phone         -- ← the PHONE binding
     -- ← the NAME binding (0204): a code stamped with a name only redeems for
     --   the SAME name (2990s: shared phone + different name = different
     --   customer). A legacy code (name NULL) stays phone-only.
     AND (bound_customer_name IS NULL
          OR (v_want_name <> '' AND bound_customer_name = v_want_name))
  RETURNING * INTO v_row;
  -- 0 rows → NULL → already USED / wrong rule / expired / phone or name mismatch.
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.pwp_claim_available_code(text, uuid, uuid, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.pwp_claim_available_code(text, uuid, uuid, text, text, text) TO authenticated;

COMMENT ON FUNCTION public.pwp_claim_available_code(text, uuid, uuid, text, text, text) IS
  '0204 — the CROSS-ORDER claim: atomic AVAILABLE→USED gated by (rule_id + phone binding + NAME binding + expiry). 2990s parity: the voucher identity is NAME+PHONE; a legacy (pre-0204, name-NULL) code stays phone-only. NEVER service_role.';

-- (4) pwp_discover_available — signature + return-shape change: + p_name in,
--     + name_matches out.
DROP FUNCTION IF EXISTS public.pwp_discover_available(text, text);

CREATE FUNCTION public.pwp_discover_available(
  p_phone  text DEFAULT NULL,          -- the cart's customer phone (raw); REQUIRED for the phone branch
  p_code   text DEFAULT NULL,          -- exact code (manual entry); validated, never echoes PII
  p_name   text DEFAULT NULL           -- the cart's customer name (raw); drives name_matches
)
RETURNS TABLE (
  code             text,
  rule_id          uuid,
  type             text,
  reward_category  text,
  reward_targets   jsonb,
  source_order_id  uuid,
  expires_at       timestamptz,
  phone_matches    boolean,            -- does this voucher's phone binding match p_phone? (server-side)
  name_matches     boolean             -- does its NAME binding match p_name? (legacy name-NULL codes → true)
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid        uuid    := auth.uid();
  v_dealer     uuid    := public.app_dealer_id();
  v_internal   boolean := public.is_internal();
  v_want       text    := public.pwp_phone_key(p_phone);
  v_want_name  text    := public.pwp_name_key(p_name);
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
         (pc.bound_customer_phone IS NOT NULL AND pc.bound_customer_phone = v_want) AS phone_matches,
         (pc.bound_customer_name IS NULL
          OR (v_want_name <> '' AND pc.bound_customer_name = v_want_name)) AS name_matches
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

REVOKE ALL ON FUNCTION public.pwp_discover_available(text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.pwp_discover_available(text, text, text) TO authenticated;

COMMENT ON FUNCTION public.pwp_discover_available(text, text, text) IS
  '0204 — cross-order voucher DISCOVERY (stripped projection, no PII). Adds p_name + the server-computed name_matches so the POS can warn before a claim that would 409 on the 2990s name+phone identity. Selector still phone-or-code; dealer-scoped for salespeople.';

-- ── Sanity: exactly ONE overload of each RPC survives (no ghost overloads). ──
DO $sanity$
DECLARE v_n integer;
BEGIN
  SELECT count(*) INTO v_n FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'pwp_claim_available_code';
  IF v_n <> 1 THEN
    RAISE EXCEPTION '0204 sanity: expected 1 pwp_claim_available_code overload, found %', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'pwp_discover_available';
  IF v_n <> 1 THEN
    RAISE EXCEPTION '0204 sanity: expected 1 pwp_discover_available overload, found %', v_n;
  END IF;
END;
$sanity$;
