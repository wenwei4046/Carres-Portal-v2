import { HTTPException } from "hono/http-exception";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computeBdCommission,
  computeCommission,
  type BdDealer,
  type BdDealerLine,
  type BdRateRow,
  type BdUser,
  type CommissionConfig,
  type CommissionLine,
  type CommissionMethod,
  type CommissionReport,
  type CommissionStaff,
  type DealerOrderAgg,
} from "@carres/shared";

/**
 * ONE place a commission month is computed.
 *
 * HR-P5 (0272) made this a shared helper rather than leaving the calculation inline
 * in `/api/hr/report`. Closing a month persists the engine's output forever, so the
 * figures the operator reviewed and the figures that get frozen must come from
 * literally the same call — not from two copies of the same three lines that drift
 * the first time somebody edits one of them.
 *
 * The math itself stays where it belongs: the pure `computeCommission` /
 * `computeBdCommission` in @carres/shared. Nothing here calculates.
 */

export interface HrSource {
  staff: CommissionStaff[];
  models: { id: string; name: string; category: string }[];
  lines: CommissionLine[];
  legacyUnattributed?: number;
  bdUsers?: BdUser[];
  bdMethod?: CommissionMethod;
  dealers?: BdDealer[];
  dealerOrders?: DealerOrderAgg[];
  dealerLines?: BdDealerLine[];
  config: CommissionConfig & { bdRates?: BdRateRow[] };
}

export interface CommissionMonth {
  source: HrSource;
  report: CommissionReport;
  bdReport: ReturnType<typeof computeBdCommission>;
  /** O1's headline. Deliberately NOT report.totalBasis — that is percentage-method
   *  only, so a per-model store would report RM 0 sold. */
  monthSold: { amount: number; orderCount: number };
}

export async function loadCommissionMonth(
  sb: SupabaseClient,
  year: number,
  month: number,
): Promise<CommissionMonth> {
  const { data, error } = await sb.rpc("hr_commission_source", {
    p_year: year,
    p_month: month,
  });
  if (error) {
    if (error.code === "42501") throw new HTTPException(403, { message: "forbidden" });
    throw new HTTPException(500, { message: error.message });
  }

  const source = data as unknown as HrSource;
  const report = computeCommission(source.staff, source.lines, source.config);

  const monthSold = {
    amount: source.lines.reduce((sum, l) => sum + l.qty * l.unitPrice, 0),
    orderCount: new Set(source.lines.map((l) => l.orderId)).size,
  };

  const bdReport = computeBdCommission({
    users: source.bdUsers ?? [],
    dealers: source.dealers ?? [],
    orders: source.dealerOrders ?? [],
    rates: source.config.bdRates ?? [],
    method: source.bdMethod,
    dealerLines: source.dealerLines,
    modelRates: source.config.modelRates,
    modelTiers: source.config.modelTiers,
    milestones: source.config.milestones,
  });

  return { source, report, bdReport, monthSold };
}

/**
 * The engine's per-staff results, mapped onto the shape `commission_close_month`
 * persists. The RPC does not calculate — it validates and stores what this returns.
 *
 * `breakdown` keeps the detail that renders the statement years later, including the
 * rate that was in force: `staff_commission_rates` is effective-dated but model
 * rates, tiers, milestones and the scheme method are NOT, so without this snapshot a
 * closed month could not be explained after somebody edited a tier.
 */
export function reportToRunLines(report: CommissionReport) {
  return report.perStaff.map((s) => ({
    subjectKind: "salesperson" as const,
    subjectId: s.staff.id,
    // staff_code is NOT sent: CommissionStaff does not carry one, and the DB is its
    // authoritative home. commission_close_month resolves it from salespersons.
    name: s.staff.name,
    storeName: s.staff.storeName ?? null,
    orderCount: s.orderCount,
    basis: s.basis,
    ratePct: s.pctUsed,
    direct: s.directCommission,
    override: s.overrideCommission,
    perModel: s.perModelCommission,
    milestone: s.milestoneCommission,
    total: s.total,
    breakdown: {
      pctUsed: s.pctUsed,
      overrideDetail: s.overrideDetail,
      perModel: s.perModel,
      milestones: s.milestones,
    },
  }));
}
