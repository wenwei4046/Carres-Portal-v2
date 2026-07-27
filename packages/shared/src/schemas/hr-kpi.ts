import { z } from "zod";
import type { CommissionLine, CommissionStaff } from "../commission";

/**
 * HR-P6 — targets and the scoreboard that reads them (migration 0276, 2026-07-26).
 *
 * WHERE THE ACTUALS COME FROM, AND WHY IT IS NOT THE FROZEN RUN
 *   The tempting design is: open month -> recompute, closed month -> read
 *   commission_run_lines.basis. That is wrong. `basis` accumulates only in
 *   computeCommission's PERCENTAGE branch, so a per-model store freezes
 *   basis = 0 — the same trap O1 hit when it reached for report.totalBasis.
 *   So sold is computed HERE from the month's attributed lines, identically for
 *   open and closed months, which makes it method-independent and makes O1's
 *   SOLD tile and this page's per-person figures agree by construction.
 *
 *   The safety this gives up is real but small, and it is bounded: P6 shows NO
 *   commission, so it cannot contradict a frozen statement. What it can do is
 *   move if somebody edits an old order's lines — the month lock (0272) stops
 *   re-attribution but not line edits. Carry-forward kpi-actuals-not-frozen.
 *
 * THE SCOPE LADDER IS TWO RUNGS, NOT FIVE
 *   The ratified spec wanted person > store > position > department > band. Live
 *   there are two sellers in one store; three of those rungs cannot resolve, and
 *   a department-scoped SALES target is meaningless for Operation / Finance / HR.
 *   See the 0276 header. Adding a rung later is a CHECK change plus a case here.
 */

// ── the metric list — a CONSTANT, deliberately not a config table ────────────
// The spec's own risk register (#4) says "closed metric enum, one computed metric
// added per phase max, no formula builder". A closed enum living in a config table
// invites a row the code cannot compute, so it lives here and the kpi_key CHECK in
// 0276 mirrors it. kpiKeysMatchMigration() below is asserted by the test suite.

export const kpiKeySchema = z.enum(["sales_basis", "units_sold", "orders_count"]);
export type KpiKey = z.infer<typeof kpiKeySchema>;

export interface KpiMetric {
  readonly key: KpiKey;
  readonly label: string;
  /** How the number is written — drives RM vs plain formatting, never logic. */
  readonly unit: "rm" | "qty";
  /**
   * `computed` = derived from attribution. `manual` = typed in by HR via
   * kpi_manual_actuals. Nothing is `manual` today; the branch exists so adding a
   * non-sales KPI is a one-line change here instead of a migration.
   * Carry-forward kpi-manual-metric-none-authored.
   */
  readonly source: "computed" | "manual";
}

export const KPI_METRICS: readonly KpiMetric[] = [
  { key: "sales_basis", label: "Sales", unit: "rm", source: "computed" },
  { key: "units_sold", label: "Units sold", unit: "qty", source: "computed" },
  { key: "orders_count", label: "Orders", unit: "qty", source: "computed" },
];

export const DEFAULT_KPI: KpiKey = "sales_basis";

export function kpiMetric(key: KpiKey): KpiMetric {
  const m = KPI_METRICS.find((x) => x.key === key);
  // Unreachable through the zod schema; a throw beats silently scoring the wrong
  // number if someone widens the enum in one place only.
  if (!m) throw new Error(`unknown kpi metric: ${key}`);
  return m;
}

/** The keys 0276's CHECK constraint must list. Asserted by the suite. */
export function kpiKeysForMigration(): string[] {
  return KPI_METRICS.map((m) => m.key);
}

// ── the kpi_source payload ───────────────────────────────────────────────────

export const kpiScopeKindSchema = z.enum(["person", "store"]);
export type KpiScopeKind = z.infer<typeof kpiScopeKindSchema>;

export const kpiTargetRowSchema = z.object({
  id: z.string().uuid(),
  kpiKey: z.string(),
  scopeKind: kpiScopeKindSchema,
  employeeId: z.string().uuid().nullable(),
  dealerId: z.string().uuid().nullable(),
  subjectName: z.string().nullable(),
  staffCode: z.string().nullable(),
  targetValue: z.number(),
  effectiveFrom: z.string(),
  note: z.string().nullable(),
  setByName: z.string().nullable(),
});
export type KpiTargetRow = z.infer<typeof kpiTargetRowSchema>;

export const kpiPersonSchema = z.object({
  employeeId: z.string().uuid(),
  appUserId: z.string().uuid().nullable(),
  salespersonId: z.string().uuid().nullable(),
  staffCode: z.string().nullable(),
  name: z.string(),
  positionName: z.string().nullable(),
  departmentName: z.string().nullable(),
  dealerId: z.string().uuid().nullable(),
  storeName: z.string().nullable(),
  staffRole: z.string().nullable(),
  /** Can a SALES metric be scored for them at all (active floor identity). */
  canSell: z.boolean(),
});
export type KpiPerson = z.infer<typeof kpiPersonSchema>;

export const kpiStoreSchema = z.object({
  dealerId: z.string().uuid(),
  name: z.string(),
  managerUserId: z.string().uuid().nullable(),
  managerName: z.string().nullable(),
  staffCount: z.number().int(),
});
export type KpiStore = z.infer<typeof kpiStoreSchema>;

export const kpiManualActualSchema = z.object({
  kpiKey: z.string(),
  employeeId: z.string().uuid().nullable(),
  dealerId: z.string().uuid().nullable(),
  value: z.number(),
  note: z.string().nullable(),
});
export type KpiManualActual = z.infer<typeof kpiManualActualSchema>;

export const kpiManagerCoverageSchema = z.object({
  hqTotal: z.number().int(),
  hqWithManager: z.number().int(),
  storesTotal: z.number().int(),
  storesWithManager: z.number().int(),
});
export type KpiManagerCoverage = z.infer<typeof kpiManagerCoverageSchema>;

export const kpiManagerCandidateSchema = z.object({
  appUserId: z.string().uuid(),
  name: z.string(),
  staffCode: z.string().nullable(),
  positionName: z.string().nullable(),
});
export type KpiManagerCandidate = z.infer<typeof kpiManagerCandidateSchema>;

export const kpiSourceSchema = z.object({
  targets: z.array(kpiTargetRowSchema),
  people: z.array(kpiPersonSchema),
  stores: z.array(kpiStoreSchema),
  manualActuals: z.array(kpiManualActualSchema),
  managerCoverage: kpiManagerCoverageSchema,
  managerCandidates: z.array(kpiManagerCandidateSchema),
});
export type KpiSource = z.infer<typeof kpiSourceSchema>;

// ── effective-date resolution ────────────────────────────────────────────────

/**
 * First day of the month AFTER (year, month), as an ISO date string.
 *
 * Deliberately string arithmetic, not Date maths: every value being compared is
 * a plain `YYYY-MM-DD` from Postgres, ISO dates sort lexicographically, and a
 * Date round-trip is where a timezone quietly moves a target into the wrong
 * month for anyone east of UTC — which is everyone here.
 */
export function monthEndExclusive(year: number, month: number): string {
  const y = month === 12 ? year + 1 : year;
  const m = month === 12 ? 1 : month + 1;
  return `${y}-${String(m).padStart(2, "0")}-01`;
}

function scopeKey(kind: KpiScopeKind, id: string): string {
  return `${kind}:${id}`;
}

/**
 * The target in force for each scope in (year, month) — the latest row whose
 * effective_from falls on or before the month's end. A row dated later in the
 * year is ignored, which is what lets HR set next quarter's numbers early.
 */
export function resolveKpiTargets(
  targets: KpiTargetRow[],
  kpiKey: KpiKey,
  year: number,
  month: number,
): Map<string, KpiTargetRow> {
  const bound = monthEndExclusive(year, month);
  const best = new Map<string, KpiTargetRow>();

  for (const t of targets) {
    if (t.kpiKey !== kpiKey) continue;
    if (t.effectiveFrom >= bound) continue; // not in force yet

    const id = t.scopeKind === "person" ? t.employeeId : t.dealerId;
    if (!id) continue; // the CHECK makes this unreachable from the DB

    const key = scopeKey(t.scopeKind, id);
    const current = best.get(key);
    if (!current || t.effectiveFrom > current.effectiveFrom) best.set(key, t);
  }

  return best;
}

// ── the scoreboard ───────────────────────────────────────────────────────────

export type KpiState = "on_track" | "behind" | "no_target";

export interface ScorecardRow {
  kind: KpiScopeKind;
  /** employeeId for a person, dealerId for a store. */
  id: string;
  name: string;
  staffCode: string | null;
  storeName: string | null;
  dealerId: string | null;
  sold: number;
  units: number;
  orderCount: number;
  /** The metric's actual, already selected for the metric being scored. */
  actual: number;
  target: number | null;
  targetId: string | null;
  effectiveFrom: string | null;
  /** Whole percent, FLOORED — see attainment(). Null when there is no target. */
  pct: number | null;
  state: KpiState;
}

export interface DepartmentRow {
  name: string;
  headcount: number;
  /** False for a department with no revenue of its own — shows "—", never 0%. */
  sells: boolean;
  actual: number;
  target: number | null;
  pct: number | null;
  state: KpiState;
}

export interface Scorecards {
  kpiKey: KpiKey;
  stores: ScorecardRow[];
  people: ScorecardRow[];
  departments: DepartmentRow[];
  totals: {
    actual: number;
    sold: number;
    orderCount: number;
    target: number | null;
    pct: number | null;
    onTrack: number;
    scored: number;
    /** People with a live sales identity but no target in force. */
    withoutTarget: number;
  };
  /**
   * Store sales attributed to somebody who is NOT on the employee spine (a
   * showroom salesperson with no CR code yet). Surfaced rather than hidden: the
   * store total is computed from lines, so without this the people rows would
   * silently fail to add up to the store row.
   */
  unscoredSold: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Attainment as a WHOLE FLOORED percent.
 *
 * Floored, not rounded, so the number and the pill can never disagree: rounding
 * would print "100%" next to a "Behind" badge at 99.6%. Floor means 100 appears
 * only when the target was genuinely reached, which is the same condition the
 * state uses.
 */
export function attainment(actual: number, target: number | null): number | null {
  if (target === null || target <= 0) return null;
  return Math.floor((actual / target) * 100);
}

export function kpiState(actual: number, target: number | null): KpiState {
  if (target === null || target <= 0) return "no_target";
  return actual >= target ? "on_track" : "behind";
}

export function kpiTone(s: KpiState): "ready" | "waiting" | "neutral" {
  if (s === "on_track") return "ready";
  if (s === "behind") return "waiting";
  return "neutral";
}

interface Agg {
  sold: number;
  units: number;
  orders: Set<string>;
}

function emptyAgg(): Agg {
  return { sold: 0, units: 0, orders: new Set() };
}

function pickActual(kpiKey: KpiKey, a: { sold: number; units: number; orderCount: number }): number {
  if (kpiKey === "units_sold") return a.units;
  if (kpiKey === "orders_count") return a.orderCount;
  return a.sold;
}

export interface ScorecardInput {
  kpiKey: KpiKey;
  year: number;
  month: number;
  /** Showroom staff, as hr_commission_source returns them. */
  staff: CommissionStaff[];
  /** The month's attributed product lines — the same slice the report uses. */
  lines: CommissionLine[];
  source: KpiSource;
}

/**
 * Build the whole page's numbers in one pass.
 *
 * The line filter mirrors computeCommission's exactly (skip a line with no
 * salesperson, skip a salesperson who is not in `staff`) so the two surfaces
 * cannot report different sales for the same month.
 */
export function computeScorecards(input: ScorecardInput): Scorecards {
  const { kpiKey, year, month, staff, lines, source } = input;
  const metric = kpiMetric(kpiKey);

  const staffIds = new Set(staff.map((s) => s.id));
  const scoreableStoreIds = new Set(source.stores.map((s) => s.dealerId));

  // salespersonId -> the employee row that owns that identity
  const employeeBySalesperson = new Map<string, KpiPerson>();
  for (const p of source.people) {
    if (p.salespersonId) employeeBySalesperson.set(p.salespersonId, p);
  }

  const byEmployee = new Map<string, Agg>();
  const byStore = new Map<string, Agg>();
  let unscoredSold = 0;

  for (const line of lines) {
    if (!line.salespersonId) continue; // pays nobody; 0296 makes it unwritable
    if (!staffIds.has(line.salespersonId)) continue; // not showroom staff
    if (!scoreableStoreIds.has(line.dealerId)) continue; // archive holder etc.

    const amount = line.qty * line.unitPrice;

    const store = byStore.get(line.dealerId) ?? emptyAgg();
    store.sold += amount;
    store.units += line.qty;
    store.orders.add(line.orderId);
    byStore.set(line.dealerId, store);

    const person = employeeBySalesperson.get(line.salespersonId);
    if (!person) {
      // Sold by a showroom salesperson with no CR code, so no employee row.
      unscoredSold += amount;
      continue;
    }
    const agg = byEmployee.get(person.employeeId) ?? emptyAgg();
    agg.sold += amount;
    agg.units += line.qty;
    agg.orders.add(line.orderId);
    byEmployee.set(person.employeeId, agg);
  }

  const resolved = resolveKpiTargets(source.targets, kpiKey, year, month);
  const manualByScope = new Map<string, number>();
  for (const m of source.manualActuals) {
    if (m.kpiKey !== kpiKey) continue;
    const id = m.employeeId ?? m.dealerId;
    if (!id) continue;
    manualByScope.set(scopeKey(m.employeeId ? "person" : "store", id), m.value);
  }

  const rowFor = (
    kind: KpiScopeKind,
    id: string,
    name: string,
    extra: { staffCode: string | null; storeName: string | null; dealerId: string | null },
    agg: Agg | undefined,
  ): ScorecardRow => {
    const sold = round2(agg?.sold ?? 0);
    const units = agg?.units ?? 0;
    const orderCount = agg?.orders.size ?? 0;

    const key = scopeKey(kind, id);
    const computed = pickActual(kpiKey, { sold, units, orderCount });
    // A manual metric ignores the computed figure entirely; a computed metric
    // ignores any stray manual row. One source per metric, never a blend.
    const actual = metric.source === "manual" ? (manualByScope.get(key) ?? 0) : computed;

    const t = resolved.get(key);
    const target = t ? t.targetValue : null;

    return {
      kind,
      id,
      name,
      ...extra,
      sold,
      units,
      orderCount,
      actual: round2(actual),
      target,
      targetId: t?.id ?? null,
      effectiveFrom: t?.effectiveFrom ?? null,
      pct: attainment(actual, target),
      state: kpiState(actual, target),
    };
  };

  const stores: ScorecardRow[] = source.stores.map((s) =>
    rowFor(
      "store",
      s.dealerId,
      s.name,
      { staffCode: null, storeName: s.name, dealerId: s.dealerId },
      byStore.get(s.dealerId),
    ),
  );

  // Only people who can actually be scored on a sales metric. An inactive or
  // HQ-only person would otherwise sit at 0% forever and drag the "on track"
  // count down with a number that means nothing.
  const scoreablePeople =
    metric.source === "manual" ? source.people : source.people.filter((p) => p.canSell);

  const people: ScorecardRow[] = scoreablePeople
    .map((p) =>
      rowFor(
        "person",
        p.employeeId,
        p.name,
        { staffCode: p.staffCode, storeName: p.storeName, dealerId: p.dealerId },
        byEmployee.get(p.employeeId),
      ),
    )
    .sort((a, b) => b.actual - a.actual || a.name.localeCompare(b.name));

  // ── departments ───────────────────────────────────────────────────────────
  // "Showrooms" reads the STORE aggregate, not the sum of its people: the two
  // differ whenever a personal target is missing or unscored sales exist, and
  // showing 94% here beside 87% on the store card would be two answers to one
  // question. HQ departments sell nothing, so they carry sells=false and the UI
  // prints "—" rather than a fake 0%.
  const deptCounts = new Map<string, number>();
  let showroomHeads = 0;
  for (const p of source.people) {
    if (p.storeName) {
      showroomHeads += 1;
      continue;
    }
    const name = p.departmentName ?? "Unassigned";
    deptCounts.set(name, (deptCounts.get(name) ?? 0) + 1);
  }

  const storeActual = round2(stores.reduce((s, r) => s + r.actual, 0));
  const storeTargets = stores.filter((r) => r.target !== null);
  const storeTarget = storeTargets.length
    ? round2(storeTargets.reduce((s, r) => s + (r.target ?? 0), 0))
    : null;

  const departments: DepartmentRow[] = [];
  if (showroomHeads > 0 || stores.length > 0) {
    departments.push({
      name: "Showrooms",
      headcount: showroomHeads,
      sells: true,
      actual: storeActual,
      target: storeTarget,
      pct: attainment(storeActual, storeTarget),
      state: kpiState(storeActual, storeTarget),
    });
  }
  for (const [name, headcount] of [...deptCounts.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    departments.push({
      name,
      headcount,
      sells: false,
      actual: 0,
      target: null,
      pct: null,
      state: "no_target",
    });
  }

  const soldTotal = round2(stores.reduce((s, r) => s + r.sold, 0));
  const orderTotal = new Set(
    lines
      .filter(
        (l) =>
          l.salespersonId &&
          staffIds.has(l.salespersonId) &&
          scoreableStoreIds.has(l.dealerId),
      )
      .map((l) => l.orderId),
  ).size;

  return {
    kpiKey,
    stores,
    people,
    departments,
    totals: {
      actual: storeActual,
      sold: soldTotal,
      orderCount: orderTotal,
      target: storeTarget,
      pct: attainment(storeActual, storeTarget),
      onTrack: people.filter((r) => r.state === "on_track").length,
      scored: people.length,
      withoutTarget: people.filter((r) => r.state === "no_target").length,
    },
    unscoredSold: round2(unscoredSold),
  };
}

// ── inputs ───────────────────────────────────────────────────────────────────

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use YYYY-MM-DD");

/**
 * Exactly one scope, enforced here as well as by 0276's CHECK. Sending both is a
 * client bug, and a 422 naming it beats a constraint violation surfacing as 500.
 */
export const setKpiTargetInput = z
  .object({
    kpiKey: kpiKeySchema,
    employeeId: z.string().uuid().nullable().optional(),
    dealerId: z.string().uuid().nullable().optional(),
    targetValue: z.number().positive("Target must be more than zero"),
    effectiveFrom: isoDate,
    note: z.string().trim().max(200).optional(),
  })
  .refine(
    (v) => (v.employeeId ? 1 : 0) + (v.dealerId ? 1 : 0) === 1,
    { message: "Pick either a person or a store, not both" },
  );
export type SetKpiTargetInput = z.infer<typeof setKpiTargetInput>;

export const setManualActualInput = z
  .object({
    kpiKey: kpiKeySchema,
    employeeId: z.string().uuid().nullable().optional(),
    dealerId: z.string().uuid().nullable().optional(),
    year: z.number().int().min(2020).max(2100),
    month: z.number().int().min(1).max(12),
    value: z.number().min(0),
    note: z.string().trim().max(200).optional(),
  })
  .refine(
    (v) => (v.employeeId ? 1 : 0) + (v.dealerId ? 1 : 0) === 1,
    { message: "Pick either a person or a store, not both" },
  );
export type SetManualActualInput = z.infer<typeof setManualActualInput>;

/** null clears the owner — that is a real operation, not a validation failure. */
export const setStoreManagerInput = z.object({
  dealerId: z.string().uuid(),
  appUserId: z.string().uuid().nullable(),
});
export type SetStoreManagerInput = z.infer<typeof setStoreManagerInput>;

// ── the manager view's on/off question ───────────────────────────────────────

/**
 * A manager's number is the sum of the people under them, so the view is only
 * honest once somebody owns each store. Kept here so the API, the card and the
 * tests cannot form three different opinions about whether it is on.
 *
 * Deliberately keyed on STORES, not on reports_to: every person with sales today
 * is floor staff, and floor staff have no reports_to at all (0276 header). A
 * fully-populated HQ chart with no store owner would still roll up RM 0.
 */
export function managerViewReady(c: KpiManagerCoverage): boolean {
  return c.storesTotal > 0 && c.storesWithManager === c.storesTotal;
}
