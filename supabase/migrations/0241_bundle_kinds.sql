-- 0241_bundle_kinds.sql
-- Bundle V2 (Loo 2026-07-19): two bundle kinds.
--   kind='fixed'  — the 0239 behaviour: components [{sku,qty}] pinned; the POS
--                   pops the product's own configure surface first when a
--                   component has spec axes (fabric / divan / legs / gap /
--                   specials), then adds the group.
--   kind='custom' — customizable bundle: `slots` jsonb =
--                   [{label?, qty, modelIds[], variant 'any'|'fixed', sku?}].
--                   The POS walks the slots step by step (customer picks the
--                   product + variant + specs per item) before Add to Cart.
-- Additive + backward-compatible: the existing 0239 row (King Bedroom Set)
-- defaults kind='fixed', slots=[]. RLS unchanged (0239 policies are row-level
-- and cover the new columns). Tail before this = 0240.

BEGIN;

ALTER TABLE public.product_bundles
  ADD COLUMN kind text NOT NULL DEFAULT 'fixed' CHECK (kind IN ('fixed', 'custom')),
  ADD COLUMN slots jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.product_bundles.kind IS
  'fixed = pinned components auto-add (spec popup when axes exist); custom = slots walked step-by-step at the POS (0241).';
COMMENT ON COLUMN public.product_bundles.slots IS
  'kind=custom item slots: [{label?, qty, modelIds[], variant any|fixed, sku?}] (0241). Empty for kind=fixed.';

COMMIT;
