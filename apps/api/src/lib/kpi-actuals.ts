import { HTTPException } from "hono/http-exception";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computeScorecards,
  isMonthLocked,
  kpiSourceSchema,
  type CommissionRunState,
  type KpiKey,
  type KpiSource,
  type Scorecards,
} from "@carres/shared";
import { loadCommissionMonth } from "./commission-month";

/**
 * ONE place a scoreboard month is assembled — the same discipline
 * `lib/commission-month.ts` applies to commission (HR-P5's "share the call, not
 * the algorithm").
 *
 * Three reads, one answer:
 *   kpi_source          — targets, the scope registries, manager coverage
 *   loadCommissionMonth — the month's staff + attributed lines (0265's slice)
 *   commission_run_state — whether the month's money is settled
 *
 * WHY THE ACTUALS ARE NOT READ FROM THE FROZEN RUN
 *   commission_run_lines.basis is percentage-method only — computeCommission
 *   accumulates it in that branch alone, so a per-model store freezes basis = 0.
 *   Reading it here would print RM 0 sold for such a store, the same way O1's
 *   first draft did with report.totalBasis. So sold is computed from the lines
 *   for open AND closed months alike, which also means this page and O1's SOLD
 *   tile are literally the same arithmetic over the same rows.
 *
 *   The run status still travels, because "this month is closed" is worth saying
 *   — it just does not change which number is shown.
 */

export interface ScorecardPayload {
  source: KpiSource;
  scorecards: Scorecards;
  /** True once the run is approved: the commission for this month is settled. */
  monthLocked: boolean;
  runStatus: string | null;
}

export async function loadScorecardMonth(
  sb: SupabaseClient,
  year: number,
  month: number,
  kpiKey: KpiKey,
): Promise<ScorecardPayload> {
  const src = await sb.rpc("kpi_source", { p_year: year, p_month: month });
  if (src.error) {
    if (src.error.code === "42501") throw new HTTPException(403, { message: "forbidden" });
    throw new HTTPException(500, { message: src.error.message });
  }

  // Parsed, not cast. This payload drives money-shaped figures on screen, and a
  // silently-missing key would render as RM 0 rather than as an error.
  const parsed = kpiSourceSchema.safeParse(src.data);
  if (!parsed.success) {
    throw new HTTPException(500, {
      message: `kpi_source payload: ${parsed.error.issues[0]?.path.join(".")} ${
        parsed.error.issues[0]?.message
      }`,
    });
  }
  const source = parsed.data;

  const { source: commission } = await loadCommissionMonth(sb, year, month);

  const state = await sb.rpc("commission_run_state", {
    p_year: year,
    p_month: month,
    p_program: "staff",
  });
  // A failure here must not take the scoreboard down with it: the badge is
  // context, the numbers are the point.
  const run =
    state.error === null ? (state.data as unknown as CommissionRunState).run ?? null : null;

  return {
    source,
    scorecards: computeScorecards({
      kpiKey,
      year,
      month,
      staff: commission.staff,
      lines: commission.lines,
      source,
    }),
    monthLocked: run ? isMonthLocked(run.status) : false,
    runStatus: run?.status ?? null,
  };
}
