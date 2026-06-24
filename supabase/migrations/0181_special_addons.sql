-- 0181_special_addons.sql
-- 2990s Products parity Phase 3 — Special Add-ons (per-model SELLING surcharges
-- with optional one-level follow-up question groups). Faithful port of the 2990s
-- `special_addons` table, adapted to Carres conventions:
--   • prices in RM numeric (not sen)
--   • principal-only writes (mirrors 0177/0179) — special add-ons carry selling
--     prices, so per the 0175 Master-Admin pricing intent the whole table is
--     principal-owned. (2990s left it editor-writable; Carres tightens it.)
--
-- Per-model ATTACH needs NO schema change: a model declares the codes it offers
-- in product_models.allowed_options.specials (jsonb, .passthrough()) — edited via
-- the existing PATCH /models/:id. Per-order SELECTIONS ride in order_lines.attrs
-- (free jsonb) and fold into the line unitPrice — create_order / order_lines /
-- DraftLine are UNTOUCHED.
--
-- Additive + zero behaviour change (empty table). Tail after this = 0181.

CREATE TABLE public.special_addons (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- stable business key referenced from allowed_options.specials + order_lines.attrs
  code           text NOT NULL UNIQUE,
  label          text NOT NULL,
  -- text printed under the product on the sales order
  so_description text NOT NULL DEFAULT '',
  -- which product categories may offer this add-on (mattress/bedframe/sofa/...)
  categories     text[] NOT NULL DEFAULT '{}',
  -- POS selling surcharge added when picked. NO >= 0 check — negatives allowed
  -- (a deduction, e.g. "No Side Panel" = -40.00).
  selling_price  numeric(12,2) NOT NULL DEFAULT 0,
  -- procurement benchmark only; never summed into the selling total. Nullable.
  cost           numeric(14,2),
  -- one-level follow-up questions: [{ label, required, choices:[{ label, extra }] }]
  option_groups  jsonb NOT NULL DEFAULT '[]'::jsonb,
  active         boolean NOT NULL DEFAULT true,
  sort_order     integer NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  updated_by     uuid
);

CREATE INDEX special_addons_active_sort_idx
  ON public.special_addons (active, sort_order);

ALTER TABLE public.special_addons ENABLE ROW LEVEL SECURITY;

-- read by any authenticated user (POS configurator + Maintenance need it)
CREATE POLICY special_addons_read_all
  ON public.special_addons
  FOR SELECT
  USING ((SELECT auth.uid()) IS NOT NULL);

-- write by principal only — InitPlan-wrapped is_principal() (§8 compliant)
CREATE POLICY special_addons_write_principal
  ON public.special_addons
  FOR ALL
  USING      ((SELECT public.is_principal()))
  WITH CHECK ((SELECT public.is_principal()));
