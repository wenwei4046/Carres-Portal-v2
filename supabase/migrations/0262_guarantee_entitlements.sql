-- =============================================================================
-- 0262_guarantee_entitlements.sql  (Loo 2026-07-26)
-- =============================================================================
-- The guarantee registry — the thing ops actually works from when a customer
-- walks in and says "my mattress broke, I bought the guarantee".
--
-- Loo's three rulings (2026-07-26, in conversation):
--   1. The clock starts on DELIVERY, not on order date. An entitlement is born
--      'pending' and flips to 'active' the moment orders.delivered_at is set;
--      expires_on = delivered date + coverage_years.
--   2. ONE guarantee covers ONE unit (1:1). Two mattresses = two guarantees.
--      A guarantee line with qty N mints N entitlement rows (unit_no 1..N) so
--      each swap consumes exactly one.
--   3. A claim is ONE-SHOT. Swap the mattress → the entitlement is spent
--      ('claimed', terminal). The replacement carries no guarantee unless the
--      customer buys a new one.
--
-- Track-back axes Loo asked for (all indexed): Sales Order · customer name ·
-- customer id / phone. Every row snapshots the covered SKU + model + label, so
-- a catalog rename or a discontinued model years later never orphans a claim.
--
-- WHY A TRIGGER AND NOT RPC EDITS: guarantee lines can enter an order through
-- FIVE doors today — create_order (0089), add_order_lines (0231/0232),
-- replace_order_lines (0255/0256), the change-request approve path (0233/0257)
-- and the AutoCount import (0132/0237). Patching five RPCs leaks; one AFTER
-- INSERT trigger on order_lines closes every door at once, forever.
--
-- Perf (CLAUDE.md §8): the orders trigger carries a WHEN clause so it only
-- fires on the four columns that matter; the order_lines trigger costs one PK
-- probe on a tiny config table per inserted line, plus one partial-index probe.
--
-- Authorized in conversation 2026-07-26 per CLAUDE.md §7.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. guarantee_terms — what a guarantee SKU promises. Config, principal-owned.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.guarantee_terms (
  guarantee_sku   text PRIMARY KEY,
  label           text NOT NULL,
  -- Which product category a line must be for this guarantee to attach to it.
  covers_category product_category NOT NULL,
  coverage_years  int  NOT NULL CHECK (coverage_years > 0 AND coverage_years <= 50),
  -- v1 is one-for-one replacement. 'repair' left open for a future tier.
  remedy          text NOT NULL DEFAULT 'replace' CHECK (remedy IN ('replace', 'repair')),
  -- Customer-facing sentence printed on the invoice.
  terms_text      text,
  active          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER guarantee_terms_set_updated_at
  BEFORE UPDATE ON public.guarantee_terms
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. guarantee_entitlements — one row per covered unit. The claim ledger.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.guarantee_entitlements (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- What was sold -------------------------------------------------------------
  order_id        uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  -- SET NULL not CASCADE: a removed line must leave a voided audit trail behind,
  -- never vanish. A claimed entitlement survives its line being replaced.
  order_line_id   uuid REFERENCES order_lines(id) ON DELETE SET NULL,
  guarantee_sku   text NOT NULL,
  unit_no         int  NOT NULL DEFAULT 1,

  -- What it covers (snapshot — survives catalog drift) -------------------------
  covers_line_id  uuid REFERENCES order_lines(id) ON DELETE SET NULL,
  covers_sku      text,
  covers_model_id uuid REFERENCES product_models(id) ON DELETE SET NULL,
  covers_label    text,

  -- Who owns it — Loo's three track-back axes ---------------------------------
  customer_id     uuid REFERENCES customers(id) ON DELETE SET NULL,
  customer_name   text NOT NULL DEFAULT '',
  customer_phone  text,
  phone_key       text,

  -- The promise ---------------------------------------------------------------
  coverage_years  int  NOT NULL,
  remedy          text NOT NULL DEFAULT 'replace',
  starts_on       date,          -- NULL until delivered (ruling #1)
  expires_on      date,          -- NULL until delivered
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'active', 'claimed', 'expired', 'void')),

  -- The claim (ruling #3 — terminal) ------------------------------------------
  claimed_at      timestamptz,
  claimed_by      uuid,
  claim_case_id   uuid REFERENCES service_cases(id) ON DELETE SET NULL,
  claim_notes     text,
  replacement_sku text,
  void_reason     text,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER guarantee_entitlements_set_updated_at
  BEFORE UPDATE ON public.guarantee_entitlements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Re-mint guard: the same line + unit can never produce two entitlements, so a
-- retried RPC or a double-fired trigger is a no-op instead of a duplicate.
CREATE UNIQUE INDEX guarantee_ent_line_unit_uidx
  ON public.guarantee_entitlements (order_line_id, unit_no)
  WHERE order_line_id IS NOT NULL;

-- Track-back axes.
CREATE INDEX guarantee_ent_order_idx    ON public.guarantee_entitlements (order_id);
CREATE INDEX guarantee_ent_customer_idx ON public.guarantee_entitlements (customer_id);
CREATE INDEX guarantee_ent_phone_idx    ON public.guarantee_entitlements (phone_key);
CREATE INDEX guarantee_ent_name_idx     ON public.guarantee_entitlements (lower(customer_name));
CREATE INDEX guarantee_ent_status_idx   ON public.guarantee_entitlements (status, expires_on);
-- Keeps the per-line-insert backfill probe (below) to a trivial partial scan.
CREATE INDEX guarantee_ent_unresolved_idx
  ON public.guarantee_entitlements (order_id)
  WHERE covers_line_id IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. RLS
--    terms  : read = any authenticated (POS gates on it); write = principal.
--    ledger : read = internal OR the dealer/store that owns the order (the POS
--             order-detail badge); write = operation/principal only. The mint
--             path is SECURITY DEFINER so a dealer's own order still mints.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.guarantee_terms          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guarantee_entitlements   ENABLE ROW LEVEL SECURITY;

-- "any authenticated" spelled the way skus_read_all / addons_read_all spell it.
CREATE POLICY guarantee_terms_read_all
  ON public.guarantee_terms FOR SELECT
  USING ((SELECT auth.uid()) IS NOT NULL);

CREATE POLICY guarantee_terms_principal_write
  ON public.guarantee_terms FOR ALL
  USING      ((SELECT public.app_role()) = 'principal')
  WITH CHECK ((SELECT public.app_role()) = 'principal');

CREATE POLICY guarantee_ent_select_scoped
  ON public.guarantee_entitlements FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM orders o
       WHERE o.id = guarantee_entitlements.order_id
         AND ((SELECT public.is_internal()) OR o.dealer_id = (SELECT public.app_dealer_id()))
    )
  );

CREATE POLICY guarantee_ent_ops_write
  ON public.guarantee_entitlements FOR ALL
  USING      ((SELECT public.is_operation()))
  WITH CHECK ((SELECT public.is_operation()));

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Mint — AFTER INSERT ON order_lines
--    Does two jobs:
--    (a) BACKFILL — this new line may be the item an already-inserted guarantee
--        line promised to cover. create_order inserts lines in cart order, so
--        the guarantee can land BEFORE the mattress it covers; covers_line_id
--        is therefore resolved from whichever side arrives second.
--    (b) MINT — if this line IS a guarantee sku, write one row per unit.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.guarantee_mint_from_line()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
  i             int;
BEGIN
  -- (a) backfill — cheap: partial index on (order_id) WHERE covers_line_id IS NULL
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

  -- The POS stamps attrs.guarantee.covers_sku when the seller picks the covered
  -- item. Absent (ops add-line, import) → an unassigned entitlement that ops
  -- attaches later from the Guarantees page.
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

  -- Ruling #1: delivered orders (incl. AutoCount imports) start ticking now.
  v_start  := v_order.delivered_at::date;
  v_status := CASE
    WHEN v_order.status = 'cancelled'  THEN 'void'
    WHEN v_start IS NOT NULL           THEN 'active'
    ELSE 'pending'
  END;

  -- Ruling #2: 1:1 — qty N mints N rows.
  FOR i IN 1..NEW.qty LOOP
    INSERT INTO public.guarantee_entitlements (
      order_id, order_line_id, guarantee_sku, unit_no,
      covers_line_id, covers_sku, covers_model_id, covers_label,
      customer_id, customer_name, customer_phone, phone_key,
      coverage_years, remedy, starts_on, expires_on, status, void_reason
    ) VALUES (
      NEW.order_id, NEW.id, NEW.sku, i,
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
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER order_lines_guarantee_mint
  AFTER INSERT ON public.order_lines
  FOR EACH ROW EXECUTE FUNCTION public.guarantee_mint_from_line();

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Void on line removal — BEFORE DELETE so order_line_id is still readable
--    (the FK's SET NULL fires after). A CLAIMED entitlement is never voided:
--    we already honoured it, the record must stand.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.guarantee_void_from_line_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.guarantee_entitlements
     SET status      = 'void',
         void_reason = coalesce(void_reason, 'guarantee line removed from order')
   WHERE order_line_id = OLD.id
     AND status IN ('pending', 'active');
  RETURN OLD;
END;
$$;

CREATE TRIGGER order_lines_guarantee_void
  BEFORE DELETE ON public.order_lines
  FOR EACH ROW EXECUTE FUNCTION public.guarantee_void_from_line_delete();

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Order-level sync — start the clock on delivery, void on cancel, and keep
--    the customer snapshot honest when the proceed lane edits name / phone.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.guarantee_sync_from_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_phone_key   text;
  v_customer_id uuid;
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    UPDATE public.guarantee_entitlements
       SET status      = 'void',
           void_reason = coalesce(void_reason, 'order cancelled')
     WHERE order_id = NEW.id
       AND status IN ('pending', 'active');
  END IF;

  -- Ruling #1 — the clock starts on delivery.
  IF NEW.delivered_at IS NOT NULL
     AND OLD.delivered_at IS DISTINCT FROM NEW.delivered_at THEN
    UPDATE public.guarantee_entitlements g
       SET starts_on  = NEW.delivered_at::date,
           expires_on = (NEW.delivered_at::date
                         + (g.coverage_years || ' years')::interval)::date,
           status     = CASE WHEN g.status = 'pending' THEN 'active' ELSE g.status END
     WHERE g.order_id = NEW.id
       AND g.status IN ('pending', 'active');
  END IF;

  IF NEW.customer_name  IS DISTINCT FROM OLD.customer_name
     OR NEW.customer_phone IS DISTINCT FROM OLD.customer_phone THEN
    v_phone_key := CASE
      WHEN nullif(NEW.customer_phone, '') IS NULL THEN NULL
      ELSE public.pwp_phone_key(NEW.customer_phone)
    END;
    IF v_phone_key IS NOT NULL THEN
      SELECT c.id INTO v_customer_id FROM public.customers c WHERE c.phone_key = v_phone_key;
    END IF;
    UPDATE public.guarantee_entitlements
       SET customer_name  = coalesce(NEW.customer_name, ''),
           customer_phone = NEW.customer_phone,
           phone_key      = v_phone_key,
           customer_id    = coalesce(v_customer_id, customer_id)
     WHERE order_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

-- WHEN clause = the perf guard. orders is the hottest table in the system; this
-- trigger must stay invisible to every update that isn't one of these four.
CREATE TRIGGER orders_guarantee_sync
  AFTER UPDATE ON public.orders
  FOR EACH ROW
  WHEN (
    OLD.status         IS DISTINCT FROM NEW.status
    OR OLD.delivered_at   IS DISTINCT FROM NEW.delivered_at
    OR OLD.customer_name  IS DISTINCT FROM NEW.customer_name
    OR OLD.customer_phone IS DISTINCT FROM NEW.customer_phone
  )
  EXECUTE FUNCTION public.guarantee_sync_from_order();

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. guarantee_claim — the one-shot swap (ruling #3).
--    Operation / principal only. Refuses anything that isn't a live, in-window,
--    unclaimed guarantee, and writes the swap into order_history so the money
--    /goods movement is never silent (PRE-GOLIVE guardrail 4 + 7).
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
AS $$
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
    RAISE EXCEPTION 'this guarantee was already claimed on %', g.claimed_at::date
      USING ERRCODE = '22023', DETAIL = 'guarantee_already_claimed';
  END IF;
  IF g.status <> 'active' THEN
    RAISE EXCEPTION 'guarantee is % — only a delivered, live guarantee can be claimed', g.status
      USING ERRCODE = '22023', DETAIL = 'guarantee_not_active';
  END IF;
  IF g.expires_on IS NOT NULL AND g.expires_on < CURRENT_DATE THEN
    RAISE EXCEPTION 'guarantee expired on %', g.expires_on
      USING ERRCODE = '22023', DETAIL = 'guarantee_expired';
  END IF;

  UPDATE public.guarantee_entitlements
     SET status          = 'claimed',
         claimed_at      = now(),
         claimed_by      = auth.uid(),
         claim_case_id   = coalesce(p_case_id, claim_case_id),
         replacement_sku = coalesce(nullif(p_replacement_sku, ''), replacement_sku),
         claim_notes     = coalesce(nullif(p_notes, ''), claim_notes)
   WHERE id = p_entitlement_id;

  INSERT INTO public.order_history (order_id, text, by_role, by_user_id)
  VALUES (
    g.order_id,
    'Guarantee claimed — one-for-one replacement of '
      || coalesce(g.covers_label, g.covers_sku, 'the covered item')
      || coalesce(' → ' || nullif(p_replacement_sku, ''), '')
      || coalesce(' · ' || nullif(p_notes, ''), ''),
    (SELECT public.app_role()),
    (SELECT id FROM public.app_users WHERE id = auth.uid())
  );

  RETURN jsonb_build_object('ok', true, 'entitlement_id', p_entitlement_id, 'status', 'claimed');
END;
$$;

REVOKE ALL ON FUNCTION public.guarantee_claim(uuid, uuid, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.guarantee_claim(uuid, uuid, text, text) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. guarantee_attach — ops assigns an unassigned entitlement to a line on the
--    same order (import / ops-added guarantees arrive without attrs.guarantee).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.guarantee_attach(
  p_entitlement_id uuid,
  p_order_line_id  uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  g          public.guarantee_entitlements%ROWTYPE;
  l          public.order_lines%ROWTYPE;
  v_category product_category;
  v_terms    public.guarantee_terms%ROWTYPE;
  v_model_id uuid;
  v_label    text;
BEGIN
  IF NOT (SELECT public.is_operation()) THEN
    RAISE EXCEPTION 'forbidden: operation or principal only'
      USING ERRCODE = '42501', DETAIL = 'guarantee_attach_internal_only';
  END IF;

  SELECT * INTO g FROM public.guarantee_entitlements WHERE id = p_entitlement_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'guarantee not found' USING ERRCODE = 'P0002';
  END IF;
  IF g.status = 'claimed' THEN
    RAISE EXCEPTION 'a claimed guarantee cannot be re-pointed'
      USING ERRCODE = '22023', DETAIL = 'guarantee_already_claimed';
  END IF;

  SELECT * INTO l FROM public.order_lines WHERE id = p_order_line_id;
  IF NOT FOUND OR l.order_id <> g.order_id THEN
    RAISE EXCEPTION 'the covered item must be a line on the same order'
      USING ERRCODE = '22023', DETAIL = 'guarantee_attach_cross_order';
  END IF;

  SELECT pm.category, pm.id,
         coalesce(pm.name, '') ||
         CASE WHEN ps.variant IS NULL OR ps.variant = coalesce(pm.name, '')
              THEN '' ELSE ' ' || ps.variant END
    INTO v_category, v_model_id, v_label
    FROM public.product_skus ps
    JOIN public.product_models pm ON pm.id = ps.model_id
   WHERE ps.sku = l.sku;

  SELECT * INTO v_terms FROM public.guarantee_terms WHERE guarantee_sku = g.guarantee_sku;
  IF FOUND AND v_category IS DISTINCT FROM v_terms.covers_category THEN
    RAISE EXCEPTION '% covers % only — % is %',
      v_terms.label, v_terms.covers_category, l.sku, coalesce(v_category::text, 'uncatalogued')
      USING ERRCODE = '22023', DETAIL = 'guarantee_attach_wrong_category';
  END IF;

  UPDATE public.guarantee_entitlements
     SET covers_line_id  = l.id,
         covers_sku      = l.sku,
         covers_model_id = v_model_id,
         covers_label    = nullif(v_label, '')
   WHERE id = p_entitlement_id;

  RETURN jsonb_build_object('ok', true, 'entitlement_id', p_entitlement_id, 'covers_sku', l.sku);
END;
$$;

REVOKE ALL ON FUNCTION public.guarantee_attach(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.guarantee_attach(uuid, uuid) TO authenticated;
