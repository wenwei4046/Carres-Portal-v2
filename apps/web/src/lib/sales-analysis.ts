/**
 * POS-parity (MAINTAIN → Sales analysis) — pure client-side summarizers over
 * the flattened /api/analytics/sales feed (2990s pattern: server flattens,
 * page aggregates). No React, no IO — unit-testable.
 */

export interface AnalyticsOrder {
  so: number;
  placedAt: string;
  channel: string;
  revenue: number;
  deliveryFee: number;
  paid: number;
  /** Full-order COGS, or null when any line lacks a known cost. */
  cogs: number | null;
  race: string | null;
  gender: string | null;
  birthday: string | null;
}

export interface AnalyticsLine {
  so: number;
  placedAt: string;
  sku: string;
  model: string;
  category: string;
  qty: number;
  revenue: number;
  cost: number | null;
  race: string | null;
  gender: string | null;
  birthday: string | null;
}

export interface SalesAnalyticsResponse {
  months: number;
  orders: AnalyticsOrder[];
  lines: AnalyticsLine[];
}

/** Below this many demographic-carrying orders, distributions get a
 *  thin-sample warning (2990s MIN_SAMPLE). */
export const MIN_SAMPLE = 10;

export const AGE_BANDS = ["<25", "25–34", "35–44", "45–54", "55+"] as const;
export type AgeBand = (typeof AGE_BANDS)[number];

/** Precise age from the birthday (2990s: no stored bucket — banded at render). */
export function ageOf(birthdayIso: string, at: Date): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthdayIso);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  let age = at.getFullYear() - y;
  const birthdayPassed =
    at.getMonth() + 1 > mo || (at.getMonth() + 1 === mo && at.getDate() >= d);
  if (!birthdayPassed) age -= 1;
  return age >= 0 && age <= 120 ? age : null;
}

export function ageBandOf(birthdayIso: string | null, at: Date): AgeBand | null {
  if (!birthdayIso) return null;
  const age = ageOf(birthdayIso, at);
  if (age === null) return null;
  if (age < 25) return "<25";
  if (age < 35) return "25–34";
  if (age < 45) return "35–44";
  if (age < 55) return "45–54";
  return "55+";
}

// ── Overview ────────────────────────────────────────────────────────────────

export interface OverviewKpis {
  orders: number;
  revenue: number;
  aov: number;
  avgDeliveryFee: number;
  /** Gross margin % over the cogs-complete orders only; null when none. */
  grossMarginPct: number | null;
  /** How many orders the margin figure is actually based on. */
  cogsCompleteOrders: number;
}

export function summarizeOverview(orders: AnalyticsOrder[]): OverviewKpis {
  const n = orders.length;
  const revenue = orders.reduce((s, o) => s + o.revenue, 0);
  const delivery = orders.reduce((s, o) => s + o.deliveryFee, 0);
  const withCogs = orders.filter((o) => o.cogs !== null);
  const cogsRevenue = withCogs.reduce((s, o) => s + o.revenue, 0);
  const cogsTotal = withCogs.reduce((s, o) => s + (o.cogs ?? 0), 0);
  return {
    orders: n,
    revenue,
    aov: n > 0 ? revenue / n : 0,
    avgDeliveryFee: n > 0 ? delivery / n : 0,
    grossMarginPct:
      withCogs.length > 0 && cogsRevenue > 0
        ? ((cogsRevenue - cogsTotal) / cogsRevenue) * 100
        : null,
    cogsCompleteOrders: withCogs.length,
  };
}

export interface MonthBar {
  /** "2026-03" sortable key. */
  key: string;
  /** "Mar 26" axis label. */
  label: string;
  revenue: number;
  orders: number;
}

const MONTH_LABEL = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function monthlyRevenue(orders: AnalyticsOrder[]): MonthBar[] {
  const byMonth = new Map<string, MonthBar>();
  for (const o of orders) {
    const d = new Date(o.placedAt);
    if (Number.isNaN(d.getTime())) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const bar =
      byMonth.get(key) ??
      ({
        key,
        label: `${MONTH_LABEL[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`,
        revenue: 0,
        orders: 0,
      } as MonthBar);
    bar.revenue += o.revenue;
    bar.orders += 1;
    byMonth.set(key, bar);
  }
  return [...byMonth.values()].sort((a, b) => a.key.localeCompare(b.key));
}

// ── Customer data ───────────────────────────────────────────────────────────

export interface DistributionRow {
  label: string;
  count: number;
  pct: number;
}

export interface Distribution {
  rows: DistributionRow[];
  /** Orders that carried the field (the denominator). */
  known: number;
  total: number;
}

function distributionOf(values: Array<string | null>): Distribution {
  const total = values.length;
  const counts = new Map<string, number>();
  let known = 0;
  for (const v of values) {
    if (!v) continue;
    known += 1;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  const rows = [...counts.entries()]
    .map(([label, count]) => ({ label, count, pct: known > 0 ? (count / known) * 100 : 0 }))
    .sort((a, b) => b.count - a.count);
  return { rows, known, total };
}

export function raceDistribution(orders: AnalyticsOrder[]): Distribution {
  return distributionOf(orders.map((o) => o.race));
}

export function genderDistribution(orders: AnalyticsOrder[]): Distribution {
  return distributionOf(orders.map((o) => o.gender));
}

export function ageDistribution(orders: AnalyticsOrder[], at: Date): Distribution {
  const dist = distributionOf(orders.map((o) => ageBandOf(o.birthday, at)));
  // Keep band order stable (not by count) — an age axis reads oldest→youngest
  // poorly when sorted by popularity.
  dist.rows.sort(
    (a, b) => AGE_BANDS.indexOf(a.label as AgeBand) - AGE_BANDS.indexOf(b.label as AgeBand),
  );
  return dist;
}

export interface SegmentSpend {
  label: string;
  orders: number;
  revenue: number;
  aov: number;
}

export function spendBySegment(
  orders: AnalyticsOrder[],
  key: "race" | "gender",
): SegmentSpend[] {
  const bySeg = new Map<string, SegmentSpend>();
  for (const o of orders) {
    const label = o[key];
    if (!label) continue;
    const seg = bySeg.get(label) ?? { label, orders: 0, revenue: 0, aov: 0 };
    seg.orders += 1;
    seg.revenue += o.revenue;
    bySeg.set(label, seg);
  }
  const out = [...bySeg.values()];
  for (const seg of out) seg.aov = seg.orders > 0 ? seg.revenue / seg.orders : 0;
  return out.sort((a, b) => b.revenue - a.revenue);
}

// ── Products ────────────────────────────────────────────────────────────────

export interface ProductRow {
  model: string;
  category: string;
  units: number;
  revenue: number;
  /** null when any contributing line lacks a cost. */
  marginPct: number | null;
}

export function productRollup(lines: AnalyticsLine[]): ProductRow[] {
  const byModel = new Map<string, ProductRow & { cost: number; costKnown: boolean }>();
  for (const l of lines) {
    const row =
      byModel.get(l.model) ??
      ({ model: l.model, category: l.category, units: 0, revenue: 0, marginPct: null, cost: 0, costKnown: true } as ProductRow & {
        cost: number;
        costKnown: boolean;
      });
    row.units += l.qty;
    row.revenue += l.revenue;
    if (l.cost === null) row.costKnown = false;
    else row.cost += l.cost;
    byModel.set(l.model, row);
  }
  return [...byModel.values()]
    .map(({ cost, costKnown, ...row }) => ({
      ...row,
      marginPct:
        costKnown && row.revenue > 0 ? ((row.revenue - cost) / row.revenue) * 100 : null,
    }))
    .sort((a, b) => b.revenue - a.revenue);
}

/** Buyer demographics per category — one distribution trio per category. */
export function buyerDemographics(
  lines: AnalyticsLine[],
  at: Date,
): Array<{ category: string; race: Distribution; gender: Distribution; age: Distribution }> {
  const byCat = new Map<string, AnalyticsLine[]>();
  for (const l of lines) {
    const bucket = byCat.get(l.category) ?? [];
    bucket.push(l);
    byCat.set(l.category, bucket);
  }
  return [...byCat.entries()].map(([category, ls]) => ({
    category,
    race: distributionOf(ls.map((l) => l.race)),
    gender: distributionOf(ls.map((l) => l.gender)),
    age: (() => {
      const dist = distributionOf(ls.map((l) => ageBandOf(l.birthday, at)));
      dist.rows.sort(
        (a, b) => AGE_BANDS.indexOf(a.label as AgeBand) - AGE_BANDS.indexOf(b.label as AgeBand),
      );
      return dist;
    })(),
  }));
}
