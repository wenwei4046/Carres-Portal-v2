/**
 * Rental + Service Plan base (migrations 0247-0249) — the PURE plan math.
 *
 * No DB/IO — shared verbatim by the config UI previews, the entitlement mint
 * and the finance split recording so the figures cannot drift (the
 * specials/sofa/delivery/bundle honest-pricing pattern).
 */

/** 2dp money rounding (same convention as special-addons/option-picks). */
const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Total visits a service package mints over its life: visits accrue at
 * `visitsPerYear` across `durationMonths`, floored to whole visits, and a
 * package always grants AT LEAST one visit (a 6-month × 1/year package still
 * delivers its single clean).
 *
 * serviceVisitsTotal(12, 3) = 3 · (24, 3) = 6 · (18, 3) = 4 · (6, 1) = 1.
 */
export function serviceVisitsTotal(durationMonths: number, visitsPerYear: number): number {
  return Math.max(1, Math.floor((durationMonths * visitsPerYear) / 12));
}

/**
 * Months between two pre-generated visits: 12 / visitsPerYear (3 visits/year →
 * every 4 months). May be fractional (e.g. 5/year → 2.4) — the scheduler
 * decides how to land fractional months on calendar dates.
 */
export function serviceVisitIntervalMonths(visitsPerYear: number): number {
  return 12 / visitsPerYear;
}

/**
 * Full contract value of a rental agreement: monthly fee × term months
 * (RM59 × 84 = RM4,956). Also the buyout ceiling (remaining months settle
 * against this figure).
 */
export function rentalContractValue(monthlyFee: number, termMonths: number): number {
  return monthlyFee * termMonths;
}

/** The three-way split of ONE collected month — see `rentalMonthlySplit`. */
export interface RentalMonthlySplit {
  supplierShare: number;
  commissionShare: number;
  carresShare: number;
}

/**
 * Splits one collected month three ways: `supplierRatePct`% → supplier,
 * `commissionBasePct`% → the selling dealer/salesperson (flat base — the full
 * commission hierarchy lives in the HR line), remainder → Carres.
 *
 * Each share is rounded to 2dp; `carresShare` is computed FROM THE ROUNDED
 * shares (fee − supplier − commission) so the three always sum exactly to the
 * fee — no lost or minted cent (the Σ-exact convention of explodeBundle).
 *
 * rentalMonthlySplit(59, 49, 20) → { 28.91, 11.80, 18.29 } (Σ = 59).
 */
export function rentalMonthlySplit(
  monthlyFee: number,
  supplierRatePct: number,
  commissionBasePct: number,
): RentalMonthlySplit {
  const supplierShare = round2((monthlyFee * supplierRatePct) / 100);
  const commissionShare = round2((monthlyFee * commissionBasePct) / 100);
  // From the ROUNDED shares — Σ-exact; round2 only clears float noise.
  const carresShare = round2(monthlyFee - supplierShare - commissionShare);
  return { supplierShare, commissionShare, carresShare };
}
