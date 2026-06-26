-- 0185_free_gifts.sql
-- 2990s Products parity Phase 7 — Default Free Gifts + Free Item Campaigns (GWP).
-- Loo (2026-06-26): do BOTH mechanisms.
--
-- Two principal-owned config tables (both reuse the P6 RuleTarget abstraction):
--   1. model_default_free_gifts — code-free, DETERMINISTIC: a model that, when
--      bought, auto-adds an accessory SKU @ RM0 (optional size/compartment
--      condition). Server resolves + APPENDS the free order_lines at create.
--   2. free_item_campaigns — a named campaign + an `eligible` RuleTarget[]; a
--      salesperson "Make Free"s an ELIGIBLE cart line (up to max_free_qty); the
--      server validates the claim + forces that line's unitPrice to 0.
--
-- A free line books as a real order_line @ unitPrice 0 with an attrs marker
-- (attrs.free_gift / attrs.free_item) — create_order / order_lines / DraftLine
-- are UNTOUCHED. NO-FUNDING is structural: a RM0 line adds 0 to the total and
-- `paid` is dealer-entered, so a free item can never reduce what's owed beyond
-- its own (intended) RM0. An all-free order (total <= 0) is NOT blocked at
-- create_order — create accepts it; it is blocked DOWNSTREAM at proceed_order,
-- whose deposit gate rejects v_total <= 0 (so it can never advance into
-- fulfilment). No create-time guard is added here (out of scope). Both tables
-- additive + principal-only write (mirrors 0181/0182/0183/0184). DORMANT until
-- the principal authors gifts/campaigns. Tail after this = 0185.

-- ---------------------------------------------------------------------------
-- model_default_free_gifts — per-model deterministic free gift(s).
-- gifts jsonb = [{ giftSku:text (accessory product_skus.sku), qty:int>=1,
--   label?:text, condition?:TargetRefinement (P6 RuleTarget refinement) }].
-- ---------------------------------------------------------------------------
CREATE TABLE public.model_default_free_gifts (
  model_id   uuid PRIMARY KEY REFERENCES public.product_models(id) ON DELETE CASCADE,
  gifts      jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.model_default_free_gifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY model_default_free_gifts_read_all
  ON public.model_default_free_gifts
  FOR SELECT
  USING ((SELECT auth.uid()) IS NOT NULL);

CREATE POLICY model_default_free_gifts_write_principal
  ON public.model_default_free_gifts
  FOR ALL
  USING      ((SELECT public.is_principal()))
  WITH CHECK ((SELECT public.is_principal()));

-- ---------------------------------------------------------------------------
-- free_item_campaigns — salesperson "Make Free" eligibility.
-- eligible jsonb = RuleTarget[] (model|variant|combo|compartment). active=false
-- by default; max_free_qty caps how many units of an eligible line may be freed.
-- ---------------------------------------------------------------------------
CREATE TABLE public.free_item_campaigns (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  active       boolean NOT NULL DEFAULT false,
  max_free_qty integer NOT NULL DEFAULT 1 CHECK (max_free_qty >= 1),
  eligible     jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  updated_by   uuid
);

CREATE INDEX free_item_campaigns_active_idx
  ON public.free_item_campaigns (active);

ALTER TABLE public.free_item_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY free_item_campaigns_read_all
  ON public.free_item_campaigns
  FOR SELECT
  USING ((SELECT auth.uid()) IS NOT NULL);

CREATE POLICY free_item_campaigns_write_principal
  ON public.free_item_campaigns
  FOR ALL
  USING      ((SELECT public.is_principal()))
  WITH CHECK ((SELECT public.is_principal()));
