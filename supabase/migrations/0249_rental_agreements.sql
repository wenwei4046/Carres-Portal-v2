-- 0249_rental_agreements.sql
-- Rental + Service Plan base (Loo 2026-07-25) — the LIVING side: agreements,
-- their monthly billing schedule, the rented-out asset registry and the
-- service entitlement engine. All additive + DORMANT (nothing writes here
-- until the POS rental lane ships; the ops/P&M base UIs read-only over empty
-- tables).
--
-- Lifecycle (Loo's rulings, 2026-07-25):
--   • RENT-TO-OWN: after the last month is paid the agreement completes and
--     the customer signs a request-to-buy form → ownership transfers.
--   • Early exit = BUYOUT: settle the remaining months in one payment.
--   • Default: repossess the unit; residual settlement can continue slowly
--     (agreement stays `defaulted`/`repossessed` while billings settle).
--   • Every collected month splits: supplier_rate_pct → supplier,
--     commission_base_pct → seller (recorded per billing row for finance).
--
-- Service entitlements are ONE engine with multiple sources: included with a
-- rental, bought as a service SKU, gifted free with a grand product, or
-- granted manually. Visits pre-generate on mint, spaced 12/visits_per_year
-- months apart; completion decrements remaining and logs onto the physical
-- unit's event trail (warranty/service history per unit, Loo's ask).
--
-- rental_stock_units: a deployed mattress has LEFT the warehouse (DO'd out)
-- but is still a Carres ASSET until ownership transfers — its own registry,
-- own unit code (RU-1001…), own service/warranty event history.

CREATE SEQUENCE public.rental_agreement_seq START 1001;
CREATE SEQUENCE public.rental_unit_seq      START 1001;

CREATE TABLE public.rental_agreements (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_no          text NOT NULL UNIQUE
                        DEFAULT ('RA-' || nextval('public.rental_agreement_seq')::text),
  customer_id           uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  dealer_id             uuid REFERENCES public.dealers(id),
  salesperson_id        uuid REFERENCES public.salespersons(id),
  order_id              uuid REFERENCES public.orders(id),
  plan_id               uuid REFERENCES public.rental_plans(id),
  -- snapshots at signup (a later plan re-price never rewrites a live agreement)
  sku                   text NOT NULL,
  term_months           integer NOT NULL CHECK (term_months > 0),
  monthly_fee           numeric(10,2) NOT NULL CHECK (monthly_fee >= 0),
  supplier_rate_pct     numeric(5,2) NOT NULL DEFAULT 0,
  commission_base_pct   numeric(5,2) NOT NULL DEFAULT 0,
  start_date            date NOT NULL,
  status                text NOT NULL DEFAULT 'active' CHECK (status IN (
                          'active',                -- collecting monthly
                          'buyout_pending',        -- customer settling remaining early
                          'completed',             -- all months in; request-to-buy issued
                          'ownership_transferred', -- form signed; unit is the customer's
                          'defaulted',             -- payments broken; recovery started
                          'repossessed',           -- unit collected back; residual settles
                          'cancelled'
                        )),
  buyout_at             timestamptz,
  buyout_amount         numeric(12,2),
  ownership_transfer_at timestamptz,
  ownership_doc_url     text,          -- the signed request-to-buy form
  stripe_customer_id    text,          -- wired when the Stripe sell lane ships
  stripe_subscription_id text,
  notes                 text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  created_by            uuid
);

CREATE INDEX rental_agreements_status_idx   ON public.rental_agreements (status, start_date);
CREATE INDEX rental_agreements_customer_idx ON public.rental_agreements (customer_id);

CREATE TABLE public.rental_billings (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_id      uuid NOT NULL REFERENCES public.rental_agreements(id) ON DELETE CASCADE,
  seq               integer NOT NULL CHECK (seq >= 1),
  due_date          date NOT NULL,
  amount_due        numeric(10,2) NOT NULL CHECK (amount_due >= 0),
  status            text NOT NULL DEFAULT 'due' CHECK (status IN (
                      'due', 'paid', 'overdue', 'waived', 'written_off'
                    )),
  paid_at           timestamptz,
  paid_amount       numeric(10,2),
  method            text,
  reference         text,
  -- finance split recorded at collection time (Loo: 记录在 finance 上面)
  supplier_share    numeric(10,2),
  commission_share  numeric(10,2),
  stripe_invoice_id text,
  recorded_by       uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agreement_id, seq)
);

CREATE INDEX rental_billings_status_due_idx ON public.rental_billings (status, due_date);

CREATE TABLE public.rental_stock_units (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_code     text NOT NULL UNIQUE
                DEFAULT ('RU-' || nextval('public.rental_unit_seq')::text),
  sku           text NOT NULL,
  agreement_id  uuid REFERENCES public.rental_agreements(id) ON DELETE SET NULL,
  customer_id   uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  status        text NOT NULL DEFAULT 'allocated' CHECK (status IN (
                  'allocated',    -- earmarked, not yet delivered
                  'in_rental',    -- deployed at the customer's home
                  'returned',     -- back with Carres (buyback / default / end)
                  'refurbishing', -- being cleaned/repaired for redeploy
                  'transferred',  -- ownership passed to the customer (rent-to-own end)
                  'retired'       -- written off
                )),
  deployed_at    date,
  returned_at    date,
  warranty_until date,
  notes          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  updated_by     uuid
);

CREATE INDEX rental_stock_units_status_idx    ON public.rental_stock_units (status);
CREATE INDEX rental_stock_units_agreement_idx ON public.rental_stock_units (agreement_id);

CREATE TABLE public.service_entitlements (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id   uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  package_id    uuid REFERENCES public.service_packages(id),
  source        text NOT NULL CHECK (source IN ('rental', 'purchase', 'free_gift', 'manual')),
  agreement_id  uuid REFERENCES public.rental_agreements(id) ON DELETE SET NULL,
  order_id      uuid REFERENCES public.orders(id),
  visits_total  integer NOT NULL CHECK (visits_total >= 1),
  visits_used   integer NOT NULL DEFAULT 0 CHECK (visits_used >= 0),
  starts_on     date NOT NULL,
  expires_on    date,
  status        text NOT NULL DEFAULT 'active' CHECK (status IN (
                  'active', 'exhausted', 'expired', 'cancelled'
                )),
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid,
  CHECK (visits_used <= visits_total)
);

CREATE INDEX service_entitlements_customer_idx ON public.service_entitlements (customer_id, status);

CREATE TABLE public.service_visits (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entitlement_id  uuid NOT NULL REFERENCES public.service_entitlements(id) ON DELETE CASCADE,
  seq             integer NOT NULL CHECK (seq >= 1),
  due_date        date NOT NULL,
  scheduled_date  date,
  -- free-text until the cleaning-partner tab ships (next phase) — then an FK
  partner         text,
  unit_id         uuid REFERENCES public.rental_stock_units(id) ON DELETE SET NULL,
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN (
                    'pending', 'scheduled', 'completed', 'skipped', 'cancelled'
                  )),
  completed_at    timestamptz,
  completed_by    uuid,
  photo_url       text,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entitlement_id, seq)
);

CREATE INDEX service_visits_due_idx ON public.service_visits (status, due_date);

CREATE TABLE public.rental_unit_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id      uuid NOT NULL REFERENCES public.rental_stock_units(id) ON DELETE CASCADE,
  event_type   text NOT NULL CHECK (event_type IN (
                 'deployed', 'service', 'warranty_claim', 'repair',
                 'returned', 'refurbished', 'transferred', 'note'
               )),
  visit_id     uuid REFERENCES public.service_visits(id) ON DELETE SET NULL,
  description  text,
  photo_url    text,
  actor        uuid,
  occurred_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX rental_unit_events_unit_idx ON public.rental_unit_events (unit_id, occurred_at DESC);

-- RLS — internal HQ only for the whole living side (operation/finance/
-- principal/bd via is_internal()). Store + customer surfaces get their own
-- deliberately-scoped policies when those phases ship.
ALTER TABLE public.rental_agreements    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_billings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_stock_units   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_visits       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_unit_events   ENABLE ROW LEVEL SECURITY;

CREATE POLICY rental_agreements_internal_all ON public.rental_agreements
  FOR ALL USING ((SELECT public.is_internal())) WITH CHECK ((SELECT public.is_internal()));
CREATE POLICY rental_billings_internal_all ON public.rental_billings
  FOR ALL USING ((SELECT public.is_internal())) WITH CHECK ((SELECT public.is_internal()));
CREATE POLICY rental_stock_units_internal_all ON public.rental_stock_units
  FOR ALL USING ((SELECT public.is_internal())) WITH CHECK ((SELECT public.is_internal()));
CREATE POLICY service_entitlements_internal_all ON public.service_entitlements
  FOR ALL USING ((SELECT public.is_internal())) WITH CHECK ((SELECT public.is_internal()));
CREATE POLICY service_visits_internal_all ON public.service_visits
  FOR ALL USING ((SELECT public.is_internal())) WITH CHECK ((SELECT public.is_internal()));
CREATE POLICY rental_unit_events_internal_all ON public.rental_unit_events
  FOR ALL USING ((SELECT public.is_internal())) WITH CHECK ((SELECT public.is_internal()));
