-- 0183_combo_cost.sql
-- 2990s Products parity Phase 5 — Combo cost/sell split.
--
-- Carres already stores the SELLING side on both combo systems
-- (combos.combo_price + sofa_combo_pricing.prices_by_height). 2990s additionally
-- tracks a COST per combo so the principal can see margin (and, in 2990s, to
-- benchmark PO procurement). This phase adds the COST dimension alongside the
-- existing selling, on BOTH systems (Loo, 2026-06-26):
--   • combos.cost           — single RM value, companion to combo_price
--   • sofa_combo_pricing.cost_by_height — per-seat-height map, companion to
--                              prices_by_height (same { height -> numeric|null } shape)
--
-- COST IS A PRINCIPAL-ONLY BENCHMARK — exactly like product_skus.cost. It does
-- NOT feed any order / finance / PO consumer (the selling side drives invoices;
-- PO cost already comes from each component's product_skus.cost; finance COGS is
-- still the 55% placeholder). The pure pricing engine (computeSofaPrice /
-- explodeCombo) stays selling-only and is UNTOUCHED.
--
-- NO RLS change + NO 0175-style trigger needed: unlike product_skus (which has
-- an internal/operation write path), BOTH combos and sofa_combo_pricing are
-- ENTIRELY principal-only write already (combos_write_principal /
-- sofa_combo_pricing write policy via is_principal()), so the new cost columns
-- inherit that lock automatically.
--
-- Both columns NULLABLE (null = "cost not set yet"), mirroring product_skus.cost
-- and special_addons.cost. Additive + zero behaviour change (existing rows read
-- null cost; selling unchanged). Tail after this = 0183.

ALTER TABLE public.combos
  ADD COLUMN cost numeric(14,2);

COMMENT ON COLUMN public.combos.cost IS
  'Principal-only cost benchmark (RM) companion to combo_price; null = unset. Benchmark only — never charged, no order/finance/PO consumer (0183).';

ALTER TABLE public.sofa_combo_pricing
  ADD COLUMN cost_by_height jsonb;

COMMENT ON COLUMN public.sofa_combo_pricing.cost_by_height IS
  'Principal-only per-seat-height cost benchmark { height -> numeric|null } companion to prices_by_height; null = unset. Benchmark only (0183).';
