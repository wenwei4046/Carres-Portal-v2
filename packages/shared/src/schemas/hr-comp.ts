import { z } from "zod";
import { monthEndExclusive } from "./hr-kpi";

/**
 * HR-P7 — what the team costs (migration 0278, 2026-07-26).
 *
 * ══ LOO'S RULING, MADE STRUCTURAL ══════════════════════════════════════════
 *   "separate, don't merge" (2026-07-26). Commission is NEVER added into the
 *   people-cost figure. The ratified spec's formula was
 *   `loaded cost = (base+allowance)×(1+burden) + run totals`; that was rejected
 *   because commission is a VARIABLE cost tracking revenue, so folding it into
 *   fixed salary makes "average cost per person" meaningless and makes a good
 *   sales month look like cost inflation.
 *
 *   `PeopleCost` therefore carries `fixedCost` and `commissionCost` as two
 *   fields and **NO field that sums them**. A screen wanting a combined number
 *   must add them itself and think about why. There is a test asserting no such
 *   field exists — if you add `totalCost` here, it fails, and that is the point.
 *
 * ══ THE OTHER LAW, CARRIED FROM P6 ═════════════════════════════════════════
 *   Never divide a number to make a screen look complete.
 *     * HQ salary is never allocated across stores — there is no allocation
 *       function in this file. Overhead is reported as overhead.
 *     * The cost/revenue ratio is not produced while the month is still
 *       running. A full month of salary over a partial month of sales reads as
 *       a collapse. Live at build time: every order in the database sat in
 *       2026-07-21..26 — six days of a 31-day month.
 *
 * ══ WHERE REVENUE COMES FROM ═══════════════════════════════════════════════
 *   It is an INPUT, not something this file computes. The caller obtains it
 *   from `computeScorecards` (hr-kpi.ts), which is the same computation the
 *   Performance tab and O1's SOLD tile use. That makes "one revenue number
 *   across three screens" structural rather than a convention someone has to
 *   remember.
 */

// ── the staff_comp_source payload ────────────────────────────────────────────

export const staffCompRowSchema = z.object({
  id: z.string().uuid(),
  employeeId: z.string().uuid(),
  baseMonthly: z.number(),
  fixedAllowance: z.number(),
  employerBurdenPct: z.number(),
  effectiveFrom: z.string(),
  note: z.string().nullable(),
  setByName: z.string().nullable(),
});
export type StaffCompRow = z.infer<typeof staffCompRowSchema>;

export const compPersonSchema = z.object({
  employeeId: z.string().uuid(),
  appUserId: z.string().uuid().nullable(),
  staffCode: z.string().nullable(),
  name: z.string(),
  kind: z.enum(["hq", "floor"]),
  positionName: z.string().nullable(),
  departmentName: z.string().nullable(),
  dealerId: z.string().uuid().nullable(),
  storeName: z.string().nullable(),
  staffRole: z.string().nullable(),
  accessActive: z.boolean(),
});
export type CompPerson = z.infer<typeof compPersonSchema>;

export const compStoreSchema = z.object({
  dealerId: z.string().uuid(),
  name: z.string(),
  managerUserId: z.string().uuid().nullable(),
  managerName: z.string().nullable(),
});
export type CompStore = z.infer<typeof compStoreSchema>;

/** How much of the month the sales data actually covers. */
export const compCoverageSchema = z.object({
  firstOrderDate: z.string().nullable(),
  lastOrderDate: z.string().nullable(),
  daysWithOrders: z.number().int(),
  orderCount: z.number().int(),
  daysInMonth: z.number().int(),
});
export type CompCoverage = z.infer<typeof compCoverageSchema>;

export const staffCompSourceSchema = z.object({
  comp: z.array(staffCompRowSchema),
  people: z.array(compPersonSchema),
  stores: z.array(compStoreSchema),
  coverage: compCoverageSchema,
});
export type StaffCompSource = z.infer<typeof staffCompSourceSchema>;

// ── the money ────────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Loaded monthly cost for one person: (base + allowance) × (1 + burden%).
 *
 * `burden` is a percentage a HUMAN TYPED as an estimate. Carres never computes
 * EPF / SOCSO / EIS / PCB and never will — §6 of the HR spec, ruled twice.
 */
export function loadedCost(c: {
  baseMonthly: number;
  fixedAllowance: number;
  employerBurdenPct: number;
}): number {
  return round2((c.baseMonthly + c.fixedAllowance) * (1 + c.employerBurdenPct / 100));
}

/**
 * The comp row in force for each person in (year, month) — the latest row whose
 * effective_from falls on or before the month's end. A row dated later is
 * ignored, which is what lets HR record a raise before it starts.
 *
 * Same shape and the same reason as `resolveKpiTargets`: string comparison on
 * ISO dates, no Date round-trip, so no timezone can move a raise into the wrong
 * month for anyone east of UTC.
 */
export function resolveStaffComp(
  comp: StaffCompRow[],
  year: number,
  month: number,
): Map<string, StaffCompRow> {
  const bound = monthEndExclusive(year, month);
  const best = new Map<string, StaffCompRow>();
  for (const c of comp) {
    if (c.effectiveFrom >= bound) continue; // not in force yet
    const current = best.get(c.employeeId);
    if (!current || c.effectiveFrom > current.effectiveFrom) best.set(c.employeeId, c);
  }
  return best;
}

/**
 * Is (year, month) still running as of `today`? Injected rather than read from
 * the clock so this stays pure and testable.
 */
export function monthInProgress(
  year: number,
  month: number,
  today: { year: number; month: number },
): boolean {
  return year === today.year && month === today.month;
}

// ── grouping ─────────────────────────────────────────────────────────────────

export const MANAGEMENT_GROUP = "Management";
export const SHOWROOMS_GROUP = "Showrooms";

/**
 * Why a group's revenue is a dash rather than a number. Printed verbatim-ish by
 * the UI so "—" always comes with a reason (the O1 lesson: an empty cell that
 * cannot be explained teaches people to ignore the screen).
 */
export type RevenueAbsence = "does_not_sell" | "not_enrolled" | "overhead";

export const REVENUE_ABSENCE_LABEL: Record<RevenueAbsence, string> = {
  does_not_sell: "does not sell",
  not_enrolled: "not enrolled",
  overhead: "company overhead",
};

/**
 * Which group a person's cost belongs to.
 *
 * Floor staff → Showrooms (their salary IS store cost). HQ staff → their
 * department, or Management when they have none: the Chairman and COO are
 * department-less by design (P1b — they top the org chart), so "Management" is
 * a truthful bucket rather than an error state.
 *
 * A MERGED person (HQ login + floor identity, the O4-route-B shape) stays HQ:
 * their salary is head-office cost even if they also serve customers. Deliberate
 * — see the store-cost note in computePeopleCost.
 */
export function compGroupOf(p: CompPerson): string {
  if (p.kind === "floor") return SHOWROOMS_GROUP;
  return p.departmentName ?? MANAGEMENT_GROUP;
}

export interface CompGroupRow {
  name: string;
  headcount: number;
  /** How many of them have a salary on file for this month. */
  recorded: number;
  fixedCost: number;
  /** Null when the group has no revenue of its own — never a fake 0. */
  revenue: number | null;
  absence: RevenueAbsence | null;
  /** Only once the month is complete AND revenue is known. */
  costPctOfRevenue: number | null;
}

export interface CompStoreCostRow {
  dealerId: string;
  name: string;
  headcount: number;
  recorded: number;
  fixedCost: number;
  revenue: number;
  /** Null while the month is still running — see monthInProgress. */
  costPctOfRevenue: number | null;
}

export interface CompRegisterRow {
  employeeId: string;
  staffCode: string | null;
  name: string;
  positionName: string | null;
  storeName: string | null;
  /** Null when nothing has been recorded for this person yet. */
  compId: string | null;
  baseMonthly: number | null;
  fixedAllowance: number | null;
  employerBurdenPct: number | null;
  loaded: number | null;
  effectiveFrom: string | null;
  setByName: string | null;
}

export interface PeopleCost {
  year: number;
  month: number;

  /** Loaded FIXED people cost for the month. Never includes commission. */
  fixedCost: number;
  /** What the fixed cost is made of — for the composition bar. */
  breakdown: { base: number; allowance: number; burden: number };

  /**
   * The month's commission, kept as its OWN number (Loo: "separate, don't
   * merge"). Nothing on this object adds it to fixedCost.
   */
  commissionCost: number;

  headcount: number;
  recorded: number;
  /** Fixed cost ÷ headcount. Meaningful precisely BECAUSE commission is excluded. */
  avgFixedPerPerson: number;

  groups: CompGroupRow[];
  stores: CompStoreCostRow[];
  register: CompRegisterRow[];

  coverage: CompCoverage & {
    monthInProgress: boolean;
    /** True when a cost/revenue ratio is safe to print at all. */
    ratioReady: boolean;
    /** True when sales exist but cover only part of the month — say so out loud. */
    partial: boolean;
  };
}

export interface PeopleCostInput {
  year: number;
  month: number;
  source: StaffCompSource;
  /**
   * Per-store revenue for the month. An INPUT because the caller must obtain it
   * from `computeScorecards` — the same computation the Performance tab and O1's
   * SOLD tile use. Do not recompute revenue in this file.
   */
  storeRevenue: { dealerId: string; sold: number }[];
  /** The month's commission total, kept separate. */
  commissionCost: number;
  today: { year: number; month: number };
}

export function computePeopleCost(input: PeopleCostInput): PeopleCost {
  const { year, month, source, storeRevenue, commissionCost, today } = input;

  const inForce = resolveStaffComp(source.comp, year, month);
  const revenueByStore = new Map(storeRevenue.map((s) => [s.dealerId, s.sold]));

  const running = monthInProgress(year, month, today);
  const totalRevenue = round2(storeRevenue.reduce((n, s) => n + s.sold, 0));
  // A ratio needs a finished month AND something to divide by.
  const ratioReady = !running && totalRevenue > 0;
  const partial =
    source.coverage.orderCount > 0 &&
    source.coverage.daysWithOrders < source.coverage.daysInMonth;

  const pct = (cost: number, revenue: number): number | null => {
    if (!ratioReady || revenue <= 0) return null;
    return Math.round((cost / revenue) * 100);
  };

  // ── totals + composition ──────────────────────────────────────────────────
  let base = 0;
  let allowance = 0;
  let fixedCost = 0;
  for (const p of source.people) {
    const c = inForce.get(p.employeeId);
    if (!c) continue;
    base += c.baseMonthly;
    allowance += c.fixedAllowance;
    fixedCost += loadedCost(c);
  }
  base = round2(base);
  allowance = round2(allowance);
  fixedCost = round2(fixedCost);
  const burden = round2(fixedCost - base - allowance);

  // ── groups ────────────────────────────────────────────────────────────────
  const groupOrder: string[] = [];
  const groupAcc = new Map<string, { headcount: number; recorded: number; cost: number }>();
  for (const p of source.people) {
    const key = compGroupOf(p);
    let g = groupAcc.get(key);
    if (!g) {
      g = { headcount: 0, recorded: 0, cost: 0 };
      groupAcc.set(key, g);
      groupOrder.push(key);
    }
    g.headcount += 1;
    const c = inForce.get(p.employeeId);
    if (c) {
      g.recorded += 1;
      g.cost += loadedCost(c);
    }
  }

  const groups: CompGroupRow[] = groupOrder.map((name) => {
    const g = groupAcc.get(name) as { headcount: number; recorded: number; cost: number };
    const cost = round2(g.cost);

    // Showrooms is the ONLY group with revenue of its own today. Everything else
    // gets a dash plus the reason, never a 0 that reads as failure.
    if (name === SHOWROOMS_GROUP) {
      return {
        name,
        headcount: g.headcount,
        recorded: g.recorded,
        fixedCost: cost,
        revenue: totalRevenue,
        absence: null,
        costPctOfRevenue: pct(cost, totalRevenue),
      };
    }

    const absence: RevenueAbsence =
      name === MANAGEMENT_GROUP
        ? "overhead"
        : name === "Business Development"
          ? // BD earns through dealers, and nobody is enrolled: 0 dealers carry a
            // bd_owner, 0 bd_profiles, 0 bd rates (measured 2026-07-26). Claiming
            // RM 0 of revenue would read as failure rather than as "not started".
            // CF hr-comp-bd-revenue-unattributed.
            "not_enrolled"
          : "does_not_sell";

    return {
      name,
      headcount: g.headcount,
      recorded: g.recorded,
      fixedCost: cost,
      revenue: null,
      absence,
      costPctOfRevenue: null,
    };
  });

  // ── per store ─────────────────────────────────────────────────────────────
  // Store staff cost counts people whose PRIMARY identity is the floor. A merged
  // HQ person who also sells stays head-office cost — allocating a slice of a
  // COO's salary to a showroom would be exactly the invented number this phase
  // refuses to print.
  const stores: CompStoreCostRow[] = source.stores.map((s) => {
    const staff = source.people.filter((p) => p.kind === "floor" && p.dealerId === s.dealerId);
    let cost = 0;
    let recorded = 0;
    for (const p of staff) {
      const c = inForce.get(p.employeeId);
      if (c) {
        recorded += 1;
        cost += loadedCost(c);
      }
    }
    cost = round2(cost);
    const revenue = round2(revenueByStore.get(s.dealerId) ?? 0);
    return {
      dealerId: s.dealerId,
      name: s.name,
      headcount: staff.length,
      recorded,
      fixedCost: cost,
      revenue,
      costPctOfRevenue: pct(cost, revenue),
    };
  });

  // ── the register ──────────────────────────────────────────────────────────
  const register: CompRegisterRow[] = source.people
    .map((p) => {
      const c = inForce.get(p.employeeId) ?? null;
      return {
        employeeId: p.employeeId,
        staffCode: p.staffCode,
        name: p.name,
        positionName: p.positionName ?? (p.storeName ? `${p.staffRole ?? "Staff"}` : null),
        storeName: p.storeName,
        compId: c?.id ?? null,
        baseMonthly: c?.baseMonthly ?? null,
        fixedAllowance: c?.fixedAllowance ?? null,
        employerBurdenPct: c?.employerBurdenPct ?? null,
        loaded: c ? loadedCost(c) : null,
        effectiveFrom: c?.effectiveFrom ?? null,
        setByName: c?.setByName ?? null,
      };
    })
    // Recorded first, biggest cost first — the register is read to compare.
    .sort((a, b) => (b.loaded ?? -1) - (a.loaded ?? -1) || a.name.localeCompare(b.name));

  const headcount = source.people.length;
  const recorded = register.filter((r) => r.compId !== null).length;

  return {
    year,
    month,
    fixedCost,
    breakdown: { base, allowance, burden },
    commissionCost: round2(commissionCost),
    headcount,
    recorded,
    avgFixedPerPerson: headcount > 0 ? round2(fixedCost / headcount) : 0,
    groups,
    stores,
    register,
    coverage: { ...source.coverage, monthInProgress: running, ratioReady, partial },
  };
}

// ── inputs ───────────────────────────────────────────────────────────────────

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use YYYY-MM-DD");

export const setStaffCompInput = z.object({
  employeeId: z.string().uuid(),
  baseMonthly: z.number().min(0, "Base cannot be negative"),
  fixedAllowance: z.number().min(0, "Allowance cannot be negative").default(0),
  employerBurdenPct: z
    .number()
    .min(0, "Burden cannot be negative")
    .max(100, "Burden cannot exceed 100%")
    .default(0),
  effectiveFrom: isoDate,
  note: z.string().trim().max(200).optional(),
});
export type SetStaffCompInput = z.infer<typeof setStaffCompInput>;
