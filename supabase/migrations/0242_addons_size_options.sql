-- 0242_addons_size_options
-- Loo 2026-07-21: size lists for order add-ons become CONFIG, not code.
-- Previously "which add-on needs a size pick + which sizes" was hardcoded in
-- the web app (DISPOSAL_SIZE_OPTIONS: dispose-mattress / dispose-bedframe
-- only), so a newly created add-on (e.g. dispose old wardrobe) could never
-- get a size dropdown without a code deploy. Now each addons row carries its
-- own list: NULL / [] = no size pick; non-empty = the POS renders one
-- per-unit dropdown per qty (attrs.sizes + composed attrs.size summary).
-- Additive + nullable; RLS untouched (addons writes stay is_internal-gated).
--
-- NOTE: the number 0242 is shared with a parallel session's
-- 0242_loan_logistics_legs (cosmetic — the tracker keys on timestamp; same
-- 0165/0166/0241 precedent). Applied to prod 2026-07-21.

alter table addons add column if not exists size_options jsonb;

comment on column addons.size_options is
  'Optional size list for this add-on (jsonb string array). NULL or [] = no size pick needed at checkout; non-empty = POS requires one size PER UNIT (order_addons.attrs.sizes) and composes attrs.size as the human summary.';

-- Seed the two legacy hardcoded disposal lists so behaviour is unchanged.
update addons
   set size_options = '["King","Queen","Super Single","Single"]'::jsonb
 where key in ('dispose-mattress', 'dispose-bedframe')
   and size_options is null;
