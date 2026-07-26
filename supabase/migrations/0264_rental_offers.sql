-- =============================================================================
-- 0264_rental_offers.sql (Loo 2026-07-26 — the Rental SETTING closed loop)
-- =============================================================================
-- 0248 authored a rental plan by TYPING a SKU code into a text box: no model,
-- no variant picker, nowhere for "this model rents in these sizes, with the
-- legs restricted to 2in/3in, the fabric narrowed to 4 of CG's 16 colours,
-- and 2 pillows thrown in free". Loo's redesign (mock approved 2026-07-26):
--
--   an OFFER is authored off a Modular model and covers both ways a customer
--   takes the product home — RENT monthly, or BUY outright.
--
-- Five objects, all additive, all DORMANT (every rental table is empty today —
-- verified 0 rows in rental_plans / agreements / billings / service_packages /
-- entitlements / stock units / customers before writing this):
--
--   1. rental_offers        — one row per model: pricing mode, which lanes are
--                             open, the option/fabric price overlay, the
--                             surcharge slots, and the revenue split.
--   2. rental_plans (+cols) — stays THE rent money atom (the 0255 sell-lane
--                             view + create_rental_agreement RPC read it, and
--                             one Stripe Price per monthly amount is a Stripe
--                             fact, not a preference). It gains its parent
--                             offer, a combo target, a line kind and gifts.
--   3. rental_buy_prices    — the outright lane. A separate table, not a
--                             nullable column on rental_plans: a buy price has
--                             no term and no Stripe recurring price, and
--                             faking term_months=0 to share the row would rot.
--   4. rental_offer_services — which service packages an offer attaches, on
--                             which lane they are FREE, how many visits are
--                             free, and what they cost if bought.
--   5. service_packages.category + rental_agreements snapshot columns.
--
-- Pricing model (the numbers a POS will later recompute server-side):
--     monthly = base monthly (variant / Σ compartments / combo)
--             + Σ monthly of the picked option values
--             + Σ monthly of the required and ticked surcharges
--     one-off = Σ one-time of the picked option values
--             + Σ one-time of the required and ticked surcharges
--   Buy lane: one-off price + the one-time side of the same option overlay.
--
-- option_prices shape (jsonb; groups keyed by the SAME allowed_options
-- vocabulary the Modular editor writes, so a rental overlay can only ever
-- NARROW what the model already allows):
--   {
--     "leg_heights": { "required": true,
--                      "values": { "2\"": {"on":true,"oneTime":0,"monthly":0},
--                                  "5\"": {"on":true,"oneTime":0,"monthly":5} } },
--     "divan_heights": { ... }, "gaps": { ... }, "specials": { ... },
--     "fabrics": { "required": true,
--                  "series": { "CG": { "on":true,"oneTime":0,"monthly":0,
--                                      "colors": { "CG-008": {"on":true,"monthly":4} } } } }
--   }
--   A colour's own oneTime/monthly overrides its series; absent = follow the
--   series. Only "on" values ever reach a customer.
--
-- surcharges shape (jsonb array — Loo's manual slot, principal-authored only;
-- a store may TICK an optional one but can never type an amount, guardrail #4
-- "no silent money edits"):
--   [ {"code":"delivery","label":"Delivery & installation",
--      "oneTime":150,"monthly":0,"required":true} ]
--
-- gifts shape (jsonb array — GWP rides a real SKU + qty so stock, delivery and
-- the supplier PO all see it):  [ {"sku":"PILLOW-STD","qty":2} ]
--
-- RLS: read = is_internal() (0253 doctrine — the split percentages are
-- cross-party commercial terms), write = is_principal(). The POS widening is a
-- stripped projection in the sell-lane phase, never a policy loosening.
-- =============================================================================

-- ── 1) rental_offers ────────────────────────────────────────────────────────

CREATE TABLE public.rental_offers (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- one offer per model; dropping the model drops its offer
  model_id            uuid NOT NULL UNIQUE
                      REFERENCES public.product_models(id) ON DELETE CASCADE,
  -- how the base monthly figure is reached:
  --   variant     — per sellable SKU (mattress / bed frame)
  --   compartment — Σ of the picked sofa parts (Loo: 1A 10 + 2A 20 = 30/mo)
  --   combo       — one fixed monthly per sofa combo (Loo: 150/mo)
  --   both        — sofa offering compartment AND combo, customer picks
  pricing_mode        text NOT NULL DEFAULT 'variant'
                      CHECK (pricing_mode IN ('variant','compartment','combo','both')),
  rent_enabled        boolean NOT NULL DEFAULT true,
  buy_enabled         boolean NOT NULL DEFAULT false,
  -- terms the authoring grid shows a column for; the authoritative term of a
  -- price row is rental_plans.term_months
  terms_months        integer[] NOT NULL DEFAULT '{60,84}',
  option_prices       jsonb NOT NULL DEFAULT '{}'::jsonb,
  surcharges          jsonb NOT NULL DEFAULT '[]'::jsonb,
  supplier_rate_pct   numeric(5,2) NOT NULL DEFAULT 0
                      CHECK (supplier_rate_pct BETWEEN 0 AND 100),
  commission_base_pct numeric(5,2) NOT NULL DEFAULT 0
                      CHECK (commission_base_pct BETWEEN 0 AND 100),
  active              boolean NOT NULL DEFAULT false,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid,
  CONSTRAINT rental_offers_split_cap
    CHECK (supplier_rate_pct + commission_base_pct <= 100),
  CONSTRAINT rental_offers_option_prices_object
    CHECK (jsonb_typeof(option_prices) = 'object'),
  CONSTRAINT rental_offers_surcharges_array
    CHECK (jsonb_typeof(surcharges) = 'array')
);

CREATE INDEX rental_offers_active_idx ON public.rental_offers (active, model_id);

COMMENT ON TABLE public.rental_offers IS
  'One rent/buy offer per product model (0264). Owns the option + fabric price overlay, the surcharge slots and the revenue split; the per-variant money lives in rental_plans (rent) and rental_buy_prices (outright).';

-- ── 2) rental_plans — still the rent money atom, now a child of an offer ────

ALTER TABLE public.rental_plans
  ADD COLUMN offer_id  uuid REFERENCES public.rental_offers(id) ON DELETE CASCADE,
  ADD COLUMN combo_id  uuid REFERENCES public.sofa_combo_pricing(id) ON DELETE CASCADE,
  ADD COLUMN line_kind text NOT NULL DEFAULT 'unit'
             CHECK (line_kind IN ('unit','compartment','combo')),
  ADD COLUMN gifts     jsonb NOT NULL DEFAULT '[]'::jsonb;

-- A combo line has no SKU (a combo is a shape, not a sellable code), so the
-- 0248 NOT NULL has to go — replaced by "exactly one target".
ALTER TABLE public.rental_plans ALTER COLUMN sku DROP NOT NULL;

ALTER TABLE public.rental_plans
  ADD CONSTRAINT rental_plans_one_target
    CHECK (
      (sku IS NOT NULL AND combo_id IS NULL AND line_kind IN ('unit','compartment'))
      OR (sku IS NULL AND combo_id IS NOT NULL AND line_kind = 'combo')
    ),
  ADD CONSTRAINT rental_plans_gifts_array
    CHECK (jsonb_typeof(gifts) = 'array');

-- 0248's UNIQUE (sku, term_months) still guards SKU lines (NULLs are distinct
-- in Postgres, so combo rows slip past it) — combos get their own.
CREATE UNIQUE INDEX rental_plans_combo_term_uq
  ON public.rental_plans (combo_id, term_months)
  WHERE combo_id IS NOT NULL;

CREATE INDEX rental_plans_offer_idx ON public.rental_plans (offer_id);

COMMENT ON COLUMN public.rental_plans.line_kind IS
  'unit = one sellable SKU rented whole · compartment = a sofa part''s monthly rate (the build adds up) · combo = a fixed monthly for a sofa combo (0264).';

-- ── 3) rental_buy_prices — the outright lane ────────────────────────────────

CREATE TABLE public.rental_buy_prices (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id   uuid NOT NULL REFERENCES public.rental_offers(id) ON DELETE CASCADE,
  sku        text REFERENCES public.product_skus(sku) ON DELETE RESTRICT,
  combo_id   uuid REFERENCES public.sofa_combo_pricing(id) ON DELETE CASCADE,
  -- NULL = "sell it at whatever SKU Master says"; a number overrides the list
  -- price for this offer only
  price      numeric(12,2) CHECK (price IS NULL OR price >= 0),
  gifts      jsonb NOT NULL DEFAULT '[]'::jsonb,
  active     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT rental_buy_prices_one_target
    CHECK ((sku IS NOT NULL AND combo_id IS NULL) OR (sku IS NULL AND combo_id IS NOT NULL)),
  CONSTRAINT rental_buy_prices_gifts_array
    CHECK (jsonb_typeof(gifts) = 'array')
);

CREATE UNIQUE INDEX rental_buy_prices_sku_uq
  ON public.rental_buy_prices (offer_id, sku) WHERE sku IS NOT NULL;
CREATE UNIQUE INDEX rental_buy_prices_combo_uq
  ON public.rental_buy_prices (offer_id, combo_id) WHERE combo_id IS NOT NULL;

COMMENT ON TABLE public.rental_buy_prices IS
  'Outright (buy-it-once) prices for an offer (0264). NULL price = fall back to product_skus.price. No term, no Stripe recurring price — that is why it is not a column on rental_plans.';

-- ── 4) rental_offer_services — service plans attached to an offer ───────────

CREATE TABLE public.rental_offer_services (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id       uuid NOT NULL REFERENCES public.rental_offers(id) ON DELETE CASCADE,
  package_id     uuid NOT NULL REFERENCES public.service_packages(id) ON DELETE CASCADE,
  -- which lane gets this plan for nothing; NULL = never free (always paid)
  free_lane      text CHECK (free_lane IN ('rent','buy','both')),
  -- how many of the package's visits are on us when it IS free; NULL = all of
  -- them (serviceVisitsTotal(duration, visitsPerYear))
  free_visits    integer CHECK (free_visits IS NULL OR free_visits >= 0),
  -- what the customer pays when it is not free (either, both, or neither)
  monthly_price  numeric(10,2) CHECK (monthly_price IS NULL OR monthly_price >= 0),
  outright_price numeric(12,2) CHECK (outright_price IS NULL OR outright_price >= 0),
  active         boolean NOT NULL DEFAULT true,
  sort_order     integer NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  updated_by     uuid,
  UNIQUE (offer_id, package_id)
);

CREATE INDEX rental_offer_services_offer_idx
  ON public.rental_offer_services (offer_id, sort_order);

COMMENT ON TABLE public.rental_offer_services IS
  'Service packages an offer attaches (0264): free on the rent lane, the buy lane, both, or sold at a monthly / one-off price. Selling or gifting one mints a service_entitlements schedule in the sell-lane phase.';

-- ── 5a) service_packages.category — the SKU token + the offer filter ────────
-- Loo 2026-07-26: a plan's auto SKU reads SVC-{CATEGORY}-{TYPE}-{years}Y{visits}
-- (SVC-MAT-CLEAN-1Y2). The category also filters the picker: a mattress offer
-- only lists SVC-MAT-… plans. Nullable = a legacy/global plan (none exist).

ALTER TABLE public.service_packages
  ADD COLUMN category text
    CHECK (category IS NULL OR category IN ('mattress','bedframe','sofa','accessory'));

COMMENT ON COLUMN public.service_packages.category IS
  'Product family this care plan is for (0264). Drives the SVC-{MAT|BF|SOFA|ACC}-… SKU token and filters which offers may attach it.';

-- ── 5b) rental_agreements — what the customer actually signed ───────────────
-- The config above can be re-priced any day; a signed agreement must remember
-- the exact build, options, gifts and one-off money of ITS day. Dormant until
-- the sell lane writes them (segment ②).

ALTER TABLE public.rental_agreements
  ADD COLUMN offer_id        uuid REFERENCES public.rental_offers(id),
  ADD COLUMN selected_options jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN gifts            jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN one_off_total    numeric(12,2) NOT NULL DEFAULT 0
                              CHECK (one_off_total >= 0);

COMMENT ON COLUMN public.rental_agreements.selected_options IS
  'Frozen snapshot of the options/fabric colour/surcharges the customer picked at signing, plus the sofa build if any (0264). A later re-price of the offer never rewrites it.';

-- ── 6) RLS — read internal, write principal (0253 doctrine) ─────────────────

ALTER TABLE public.rental_offers          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_buy_prices      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_offer_services  ENABLE ROW LEVEL SECURITY;

CREATE POLICY rental_offers_read_internal
  ON public.rental_offers FOR SELECT
  USING ((SELECT public.is_internal()));

CREATE POLICY rental_offers_write_principal
  ON public.rental_offers FOR ALL
  USING      ((SELECT public.is_principal()))
  WITH CHECK ((SELECT public.is_principal()));

CREATE POLICY rental_buy_prices_read_internal
  ON public.rental_buy_prices FOR SELECT
  USING ((SELECT public.is_internal()));

CREATE POLICY rental_buy_prices_write_principal
  ON public.rental_buy_prices FOR ALL
  USING      ((SELECT public.is_principal()))
  WITH CHECK ((SELECT public.is_principal()));

CREATE POLICY rental_offer_services_read_internal
  ON public.rental_offer_services FOR SELECT
  USING ((SELECT public.is_internal()));

CREATE POLICY rental_offer_services_write_principal
  ON public.rental_offer_services FOR ALL
  USING      ((SELECT public.is_principal()))
  WITH CHECK ((SELECT public.is_principal()));
