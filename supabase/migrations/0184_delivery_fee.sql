-- 0184_delivery_fee.sql
-- 2990s Products parity Phase 6 — RuleTarget + Delivery Fee subsystem.
--
-- Carres today only has floor_config (a per-floor STAIR surcharge, client-computed).
-- 2990s additionally has a delivery TRIP fee: a base fee per order + a
-- cross-category surcharge (sofa mixed with mattress/bedframe) + per-target
-- (model/variant/combo/compartment) special overrides via the shared RuleTarget
-- abstraction. P6 brings that model into Carres (Loo, 2026-06-26: all-in-one,
-- full incl cross-order follow-up + a principal-selectable category/model gate
-- for the default fee).
--
-- DORMANT BY DEFAULT: base_fee + cross_category_fee seed to 0, so order totals
-- stay byte-identical to today (floor stair only) until the principal sets real
-- rates in the Maintenance UI. The order-path wiring (Hono server-recompute that
-- appends delivery order_addons) is live but computes 0 until configured.
--
-- The floor STAIR surcharge (floor_config) is KEPT and coexists — stairs and the
-- delivery trip fee are different charges; both fold into the order total.
--
-- Both tables are additive + principal-only write (mirrors floor_config /
-- 0181 / 0182 / 0183). The delivery fee is charged via order_addons appended by
-- the Hono recompute — create_order / order_lines / DraftLine are UNTOUCHED.
-- Tail after this = 0184.

-- ---------------------------------------------------------------------------
-- delivery_fee_config — singleton (id always 1), principal-owned.
-- ---------------------------------------------------------------------------
CREATE TABLE public.delivery_fee_config (
  id                          integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  -- flat trip fee charged once per order that contains >=1 charged-category line
  base_fee                    numeric(12,2) NOT NULL DEFAULT 0 CHECK (base_fee >= 0),
  -- added once when an order mixes sofa with mattress/bedframe (a 2nd vehicle trip)
  cross_category_fee          numeric(12,2) NOT NULL DEFAULT 0 CHECK (cross_category_fee >= 0),
  -- which product categories incur the base trip fee (principal selects). An order
  -- charges base_fee only if it has >=1 line whose category is in this set.
  charged_categories          text[] NOT NULL DEFAULT '{sofa,mattress,bedframe}',
  -- lead-time floors (days) surfaced for principal editing (Carres current rule).
  mattress_bedframe_lead_days integer NOT NULL DEFAULT 14 CHECK (mattress_bedframe_lead_days >= 0),
  sofa_lead_days              integer NOT NULL DEFAULT 21 CHECK (sofa_lead_days >= 0),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  updated_by                  uuid
);

-- seed the singleton (all fees 0 → dormant; GET always returns a row)
INSERT INTO public.delivery_fee_config (id) VALUES (1)
  ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.delivery_fee_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY delivery_fee_config_read_all
  ON public.delivery_fee_config
  FOR SELECT
  USING ((SELECT auth.uid()) IS NOT NULL);

CREATE POLICY delivery_fee_config_write_principal
  ON public.delivery_fee_config
  FOR ALL
  USING      ((SELECT public.is_principal()))
  WITH CHECK ((SELECT public.is_principal()));

-- ---------------------------------------------------------------------------
-- special_delivery_fee_rules — per-RuleTarget overrides of the base fee.
-- `target` is a RuleTarget[] jsonb: [{ scope:'model'|'variant'|'combo'|'compartment',
--   modelId?, sizeCodes?, comboIds?, compartments? }]. A matched line's special
-- standalone_fee supersedes the config base_fee (highest wins). Principal-owned.
-- ---------------------------------------------------------------------------
CREATE TABLE public.special_delivery_fee_rules (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target                 jsonb NOT NULL DEFAULT '[]'::jsonb,
  standalone_fee         numeric(12,2) NOT NULL DEFAULT 0 CHECK (standalone_fee >= 0),
  cross_cat_followup_fee numeric(12,2) NOT NULL DEFAULT 0 CHECK (cross_cat_followup_fee >= 0),
  label                  text,
  active                 boolean NOT NULL DEFAULT true,
  sort_order             integer NOT NULL DEFAULT 0,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  updated_by             uuid
);

CREATE INDEX special_delivery_fee_rules_active_sort_idx
  ON public.special_delivery_fee_rules (active, sort_order);

ALTER TABLE public.special_delivery_fee_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY special_delivery_fee_rules_read_all
  ON public.special_delivery_fee_rules
  FOR SELECT
  USING ((SELECT auth.uid()) IS NOT NULL);

CREATE POLICY special_delivery_fee_rules_write_principal
  ON public.special_delivery_fee_rules
  FOR ALL
  USING      ((SELECT public.is_principal()))
  WITH CHECK ((SELECT public.is_principal()));

-- ---------------------------------------------------------------------------
-- Delivery-fee addon defs. The delivery TRIP fee is charged by APPENDING
-- order_addons in the Hono server-recompute (mirroring how disposal addons
-- flow) — create_order / order_lines / DraftLine stay UNTOUCHED. But
-- order_addons.addon_key is FK-constrained: `addon_key text not null references
-- addons(key)` (0001_init.sql), so the three delivery addon keys MUST exist in
-- the addons reference table before the recompute can append them. Seeded at
-- price 0 (the actual unit_price is supplied per order_addons row by the
-- recompute, which is itself 0 until the principal sets rates → dormant).
--   DELIVERY        — the base trip fee
--   DELIVERY_CROSS  — the cross-category (sofa × mattress/bedframe) surcharge
--   DELIVERY_ADD    — the operator's free-form additional fee
INSERT INTO public.addons (key, name, price, active) VALUES
  ('DELIVERY',       'Delivery fee',                0, true),
  ('DELIVERY_CROSS', 'Cross-category delivery fee', 0, true),
  ('DELIVERY_ADD',   'Additional delivery fee',     0, true)
ON CONFLICT (key) DO NOTHING;
