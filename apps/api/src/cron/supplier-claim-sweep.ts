import type { Bindings } from "../types";

/**
 * Retired application entry point — Purchasing MASTER §9.5.
 * A passed ETA or routine partial delivery must never create a product Claim.
 * Keep old imports harmless while the governed database retirement remains
 * outstanding. No database client is constructed and no records are changed.
 */
export async function runSupplierClaimSweepCron(_env: Bindings): Promise<number> {
  return 0;
}
