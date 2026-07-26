-- =============================================================================
-- 0267_guarantee_id.sql  (Loo 2026-07-26)
-- =============================================================================
-- Every guarantee gets a human-quotable ID, minted the moment the Sales Order
-- is created. Format (Loo): FOUR random letters + SIX random digits —
-- `ABCD123456`. All downstream tracking is by this ID, and it is what the
-- customer quotes when they come to claim.
--
-- Why the split format is good and not just decoration: the letter block and
-- the digit block are positional, so O-vs-0 and I-vs-1 can never be ambiguous
-- when someone reads the ID off a printed Sales Order and types it in.
--
-- CLAIM RETIRES THE ID (Loo: "被 claim 之后这个 ID 就会被删除"). Implemented as
-- a MOVE, not a DELETE: `guarantee_id` is cleared — so the ID leaves the live
-- space and can never be claimed again, which is the rule he asked for — and
-- the spent string lands in `claimed_guarantee_id`. That one extra column is
-- the difference between ops telling a customer "this was claimed on 3 March"
-- and ops telling them "no such ID", which reads identical to a fake or a
-- typo. Erasing it outright is a one-line change if that is ever wanted.
--
-- The ID is also written BACK onto the order line: `attrs.guarantee.ids` plus
-- an `attrs.remark` sentence, because `lineConfigBits` renders `attrs.remark`
-- as `✎ …` on the order drawer AND the Sales Order PDF — so the customer's own
-- document carries the ID with no template change (Loo: "在这个 item 的 remark
-- 里需要显示出这个 guarantee ID").
--
-- Safe to re-run. Backfills any pre-existing live entitlement (today: none).
--
-- Authorized in conversation 2026-07-26 per CLAUDE.md §7.
-- =============================================================================

ALTER TABLE public.guarantee_entitlements
  ADD COLUMN IF NOT EXISTS guarantee_id         text,
  ADD COLUMN IF NOT EXISTS claimed_guarantee_id text;

-- The live ID space. Partial so a retired (claimed) row frees its string.
CREATE UNIQUE INDEX IF NOT EXISTS guarantee_ent_gid_uidx
  ON public.guarantee_entitlements (guarantee_id)
  WHERE guarantee_id IS NOT NULL;

-- Lookup of a spent ID — "already claimed", not "not found".
CREATE INDEX IF NOT EXISTS guarantee_ent_claimed_gid_idx
  ON public.guarantee_entitlements (claimed_guarantee_id)
  WHERE claimed_guarantee_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- gen_guarantee_id() — 4 letters + 6 digits, retried until unique.
-- Checks BOTH the live and the retired column so a spent ID is never reissued
-- to a different customer (which would make the audit trail ambiguous).
-- Not a secret: it is a lookup handle, and claiming still needs an ops login.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.gen_guarantee_id()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  c_letters constant text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  v_id      text;
  i         int;
  v_tries   int := 0;
BEGIN
  LOOP
    v_id := '';
    FOR i IN 1..4 LOOP
      v_id := v_id || substr(c_letters, 1 + floor(random() * 26)::int, 1);
    END LOOP;
    FOR i IN 1..6 LOOP
      v_id := v_id || floor(random() * 10)::int::text;
    END LOOP;

    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.guarantee_entitlements
       WHERE guarantee_id = v_id OR claimed_guarantee_id = v_id
    );

    v_tries := v_tries + 1;
    IF v_tries > 50 THEN
      RAISE EXCEPTION 'could not allocate a unique guarantee id after % tries', v_tries
        USING ERRCODE = '55000';
    END IF;
  END LOOP;
  RETURN v_id;
END;
$fn$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Mint v2 — same trigger, now stamping the ID and writing it back to the line.
-- Body is 0262's verbatim EXCEPT: the id column, the v_ids collection, and the
-- order_lines write-back at the end.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.guarantee_mint_from_line()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_terms       public.guarantee_terms%ROWTYPE;
  v_order       public.orders%ROWTYPE;
  v_covers_sku  text;
  v_model_id    uuid;
  v_label       text;
  v_covers_line uuid;
  v_customer_id uuid;
  v_phone_key   text;
  v_start       date;
  v_status      text;
  v_gid         text;
  v_ids         text[] := '{}';
  v_remark      text;
  i             int;
BEGIN
  -- (a) backfill — this line may be the item an EARLIER guarantee line covers.
  IF EXISTS (
    SELECT 1 FROM public.guarantee_entitlements
     WHERE order_id = NEW.order_id AND covers_line_id IS NULL
  ) THEN
    UPDATE public.guarantee_entitlements g
       SET covers_line_id = NEW.id
     WHERE g.order_id = NEW.order_id
       AND g.covers_line_id IS NULL
       AND g.covers_sku = NEW.sku
       AND g.order_line_id IS DISTINCT FROM NEW.id;
  END IF;

  -- (b) mint
  SELECT * INTO v_terms
    FROM public.guarantee_terms
   WHERE guarantee_sku = NEW.sku AND active;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = NEW.order_id;

  v_covers_sku := nullif(NEW.attrs #>> '{guarantee,covers_sku}', '');

  IF v_covers_sku IS NOT NULL THEN
    SELECT ps.model_id, coalesce(pm.name, '') ||
           CASE WHEN ps.variant IS NULL OR ps.variant = coalesce(pm.name, '')
                THEN '' ELSE ' ' || ps.variant END
      INTO v_model_id, v_label
      FROM public.product_skus ps
      LEFT JOIN public.product_models pm ON pm.id = ps.model_id
     WHERE ps.sku = v_covers_sku;

    SELECT ol.id INTO v_covers_line
      FROM public.order_lines ol
     WHERE ol.order_id = NEW.order_id
       AND ol.sku = v_covers_sku
       AND ol.id <> NEW.id
     ORDER BY ol.created_at
     LIMIT 1;
  END IF;

  v_phone_key := CASE
    WHEN nullif(v_order.customer_phone, '') IS NULL THEN NULL
    ELSE public.pwp_phone_key(v_order.customer_phone)
  END;
  IF v_phone_key IS NOT NULL THEN
    SELECT c.id INTO v_customer_id FROM public.customers c WHERE c.phone_key = v_phone_key;
  END IF;

  v_start  := v_order.delivered_at::date;
  v_status := CASE
    WHEN v_order.status = 'cancelled'  THEN 'void'
    WHEN v_start IS NOT NULL           THEN 'active'
    ELSE 'pending'
  END;

  -- 1:1 (ruling #2) — qty N mints N rows, each with its OWN id.
  FOR i IN 1..NEW.qty LOOP
    v_gid := public.gen_guarantee_id();
    INSERT INTO public.guarantee_entitlements (
      order_id, order_line_id, guarantee_sku, unit_no, guarantee_id,
      covers_line_id, covers_sku, covers_model_id, covers_label,
      customer_id, customer_name, customer_phone, phone_key,
      coverage_years, remedy, starts_on, expires_on, status, void_reason
    ) VALUES (
      NEW.order_id, NEW.id, NEW.sku, i, v_gid,
      v_covers_line, v_covers_sku, v_model_id, nullif(v_label, ''),
      v_customer_id, coalesce(v_order.customer_name, ''), v_order.customer_phone, v_phone_key,
      v_terms.coverage_years, v_terms.remedy,
      v_start,
      CASE WHEN v_start IS NULL THEN NULL
           ELSE (v_start + (v_terms.coverage_years || ' years')::interval)::date END,
      v_status,
      CASE WHEN v_status = 'void' THEN 'order cancelled' END
    )
    ON CONFLICT DO NOTHING;
    IF FOUND THEN
      v_ids := v_ids || v_gid;
    END IF;
  END LOOP;

  -- (c) write the ID(s) back onto the line so the customer's own Sales Order
  -- carries them: `attrs.remark` is what lineConfigBits prints as `✎ …` on the
  -- drawer and the SO PDF. An operator-typed remark is preserved, not clobbered.
  IF array_length(v_ids, 1) > 0 THEN
    v_remark := nullif(NEW.attrs->>'remark', '');
    UPDATE public.order_lines
       SET attrs = coalesce(attrs, '{}'::jsonb)
                 || jsonb_build_object(
                      'guarantee',
                      coalesce(attrs->'guarantee', '{}'::jsonb)
                        || jsonb_build_object('ids', to_jsonb(v_ids))
                    )
                 || jsonb_build_object(
                      'remark',
                      coalesce(v_remark || ' · ', '')
                        || 'Guarantee ID: ' || array_to_string(v_ids, ', ')
                    )
     WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$fn$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Claim v2 — retires the ID out of the live space and names it in the history
-- line, so the audit entry reads like the counter conversation did.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.guarantee_claim(
  p_entitlement_id  uuid,
  p_case_id         uuid DEFAULT NULL,
  p_replacement_sku text DEFAULT NULL,
  p_notes           text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  g public.guarantee_entitlements%ROWTYPE;
BEGIN
  IF NOT (SELECT public.is_operation()) THEN
    RAISE EXCEPTION 'forbidden: operation or principal only'
      USING ERRCODE = '42501', DETAIL = 'guarantee_claim_internal_only';
  END IF;

  SELECT * INTO g FROM public.guarantee_entitlements WHERE id = p_entitlement_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'guarantee not found' USING ERRCODE = 'P0002';
  END IF;

  IF g.status = 'claimed' THEN
    RAISE EXCEPTION 'guarantee % was already claimed on %',
      coalesce(g.claimed_guarantee_id, g.guarantee_id, '(no id)'), g.claimed_at::date
      USING ERRCODE = '22023', DETAIL = 'guarantee_already_claimed';
  END IF;
  IF g.status <> 'active' THEN
    RAISE EXCEPTION 'guarantee is % - only a delivered, live guarantee can be claimed', g.status
      USING ERRCODE = '22023', DETAIL = 'guarantee_not_active';
  END IF;
  IF g.expires_on IS NOT NULL AND g.expires_on < CURRENT_DATE THEN
    RAISE EXCEPTION 'guarantee expired on %', g.expires_on
      USING ERRCODE = '22023', DETAIL = 'guarantee_expired';
  END IF;

  UPDATE public.guarantee_entitlements
     SET status               = 'claimed',
         claimed_at           = now(),
         claimed_by           = auth.uid(),
         claim_case_id        = coalesce(p_case_id, claim_case_id),
         replacement_sku      = coalesce(nullif(p_replacement_sku, ''), replacement_sku),
         claim_notes          = coalesce(nullif(p_notes, ''), claim_notes),
         -- the ID leaves the live space; the spent string is kept so a
         -- re-presented ID reads "already claimed", never "not found"
         claimed_guarantee_id = coalesce(claimed_guarantee_id, guarantee_id),
         guarantee_id         = NULL
   WHERE id = p_entitlement_id;

  INSERT INTO public.order_history (order_id, text, by_role, by_user_id)
  VALUES (
    g.order_id,
    'Guarantee ' || coalesce(g.guarantee_id, '(no id)')
      || ' claimed - one-for-one replacement of '
      || coalesce(g.covers_label, g.covers_sku, 'the covered item')
      || coalesce(' -> ' || nullif(p_replacement_sku, ''), '')
      || coalesce(' · ' || nullif(p_notes, ''), ''),
    (SELECT public.app_role()),
    (SELECT id FROM public.app_users WHERE id = auth.uid())
  );

  RETURN jsonb_build_object(
    'ok', true,
    'entitlement_id', p_entitlement_id,
    'status', 'claimed',
    'retired_guarantee_id', g.guarantee_id
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.guarantee_claim(uuid, uuid, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.guarantee_claim(uuid, uuid, text, text) TO authenticated;

-- Backfill any live entitlement that predates this migration (today: none).
UPDATE public.guarantee_entitlements
   SET guarantee_id = public.gen_guarantee_id()
 WHERE guarantee_id IS NULL
   AND status <> 'claimed';

-- Backfill the LINE remark for entitlements that already existed when this
-- migration ran (Loo had placed one live test order before it applied), so
-- their Sales Order carries the ID too. Idempotent: skips a line whose remark
-- already names an ID, and preserves any operator-typed remark.
UPDATE public.order_lines ol
   SET attrs = coalesce(ol.attrs, '{}'::jsonb)
             || jsonb_build_object(
                  'guarantee',
                  coalesce(ol.attrs->'guarantee', '{}'::jsonb)
                    || jsonb_build_object('ids', to_jsonb(g.ids))
                )
             || jsonb_build_object(
                  'remark',
                  coalesce(nullif(ol.attrs->>'remark', '') || ' · ', '')
                    || 'Guarantee ID: ' || array_to_string(g.ids, ', ')
                )
  FROM (
    SELECT order_line_id, array_agg(guarantee_id ORDER BY unit_no) AS ids
      FROM public.guarantee_entitlements
     WHERE order_line_id IS NOT NULL AND guarantee_id IS NOT NULL
     GROUP BY order_line_id
  ) g
 WHERE ol.id = g.order_line_id
   AND coalesce(ol.attrs->>'remark', '') NOT LIKE '%Guarantee ID:%';
