import { HTTPException } from "hono/http-exception";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computePeopleCost,
  computeScorecards,
  staffCompSourceSchema,
  DEFAULT_KPI,
  type PeopleCost,
  type StaffCompSource,
} from "@carres/shared";
import { loadCommissionMonth } from "./commission-month";

/**
 * ONE place a people-cost month is assembled — the same discipline
 * `commission-month.ts` and `kpi-actuals.ts` apply.
 *
 * WHY REVENUE COMES THROUGH computeScorecards
 *   P7 needs per-store revenue. Rather than write a third query that sums
 *   attributed lines, it calls the SAME shared engine the Performance tab uses
 *   and reads `stores[].sold` off it. That makes "the Performance tab, O1's SOLD
 *   tile and People cost can never disagree" structural instead of a convention.
 *   The kpi metric is pinned to the money one on purpose — a units target must
 *   not change what a cost ratio divides by.
 *
 * WHY COMMISSION TRAVELS SEPARATELY
 *   Loo, 2026-07-26: "separate, don't merge". It is handed to computePeopleCost
 *   as its own input and lands on its own field. Nothing in the chain adds it to
 *   the salary figure — see the guard test in hr-comp.test.ts.
 */

export interface PeopleCostPayload {
  source: StaffCompSource;
  cost: PeopleCost;
}

export async function loadPeopleCostMonth(
  sb: SupabaseClient,
  year: number,
  month: number,
  today: { year: number; month: number },
): Promise<PeopleCostPayload> {
  const src = await sb.rpc("staff_comp_source", { p_year: year, p_month: month });
  if (src.error) {
    if (src.error.code === "42501") throw new HTTPException(403, { message: "forbidden" });
    throw new HTTPException(500, { message: src.error.message });
  }

  // Parsed, not cast: this payload drives salary figures on screen and a silently
  // missing key would render as RM 0 rather than as an error.
  const parsed = staffCompSourceSchema.safeParse(src.data);
  if (!parsed.success) {
    throw new HTTPException(500, {
      message: `staff_comp_source payload: ${parsed.error.issues[0]?.path.join(".")} ${
        parsed.error.issues[0]?.message
      }`,
    });
  }
  const source = parsed.data;

  // The month's staff + attributed lines + commission, all from the one helper.
  const { source: commission, report, bdReport } = await loadCommissionMonth(sb, year, month);

  // Per-store revenue, from the Performance tab's own engine.
  const scorecards = computeScorecards({
    kpiKey: DEFAULT_KPI, // sales_basis — the money metric, always, for a cost ratio
    year,
    month,
    staff: commission.staff,
    lines: commission.lines,
    source: {
      targets: [],
      people: [],
      // computeScorecards only needs the store registry to know which dealers to
      // aggregate; the comp source already carries exactly that list.
      stores: source.stores.map((s) => ({
        dealerId: s.dealerId,
        name: s.name,
        managerUserId: s.managerUserId,
        managerName: s.managerName,
        staffCount: 0,
      })),
      manualActuals: [],
      managerCoverage: { hqTotal: 0, hqWithManager: 0, storesTotal: 0, storesWithManager: 0 },
      managerCandidates: [],
    },
  });

  return {
    source,
    cost: computePeopleCost({
      year,
      month,
      source,
      // `id` is the dealer id on a STORE scorecard row and is non-null by
      // construction; the row's own `dealerId` field is typed nullable because a
      // PERSON row shares the shape and may have no store.
      storeRevenue: scorecards.stores.map((s) => ({ dealerId: s.id, sold: s.sold })),
      commissionCost: report.totalCommission + (bdReport?.totalCommission ?? 0),
      today,
    }),
  };
}
