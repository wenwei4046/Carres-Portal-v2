/**
 * Dealer commission and renovation rebate — the one arithmetic (0544, 0661, 0662).
 *
 * Read-only: nothing here is owed or posted (CLAUDE.md §7). The report reads
 * `dealer_commission_source(month)` and passes it through `dealerCommissionReport`
 * (one row per dealer) or `dealerCommissionOrders` (one row per order).
 *
 * THE RULES (docs/finance/MASTER.md §3.2, Chew and management 2026-10-05 to
 * 2026-10-07). Commission follows money the customer paid and Carres kept:
 *   1. Each line's rate is the database's (0661, `dealer_commission_rate`):
 *      the rate in force on the order's day. Service, the guarantee and a kind
 *      switched off come with rate 0; transport and disposal are add-ons.
 *      Together they are what EARNS NOTHING.
 *   2. A bundle discount is shared equally by the order's mattress pieces
 *      (a line of quantity 2 is two pieces; 「3张就500 除3」). No order
 *      records one yet; the order must say it carries one.
 *   3. The first money pays for what earns nothing; only money beyond it
 *      earns, at the order's own blend of rates (「service 要扣掉」, 1 是乙:
 *      goods RM 3,000 at 25% plus service RM 300, RM 1,650 paid first earns
 *      (1,650 − 300) × 25% = RM 337.50; the RM 1,650 balance earns RM 412.50).
 *   4. Nothing is earned until the money kept reaches half the order total,
 *      service included; the month it does pays on everything kept so far
 *      (「收的第一笔低过50% 是不出的」, 「9月收超过50%就补回给他」). Once
 *      reached, it stays reached.
 *   5. Money kept is payments less refunds paid out, never below zero; a
 *      refund takes its commission back in the month it is paid (0597). A
 *      card payment counts in full, before the card fee.
 *   6. A cancelled order has nothing still to earn from the day it was
 *      cancelled. What it earned on money Carres kept stays, unless Finance
 *      takes it back (0662), which counts in the month Finance does it.
 *   7. A month's commission is what the order has earned by the month's end
 *      less what it had earned by the end of the month before.
 * Amendments: an amended order is worked out again with its original rates.
 * Until months are closed (dealer commission step 4), an earlier month is
 * worked out again from today's order; closing makes the difference land in
 * the month of the change.
 *
 * Rebate, per dealer: rate × everything collected since the quota started,
 * capped at the quota; each month's rebate is the rise since last month. An
 * order counts only what it kept since the quota started, so a refund of older
 * money takes nothing from another order. Cancelled orders do not count. The
 * quota left is never stored; it is worked out here. (Step 4 brings the
 * rebate's own rules.)
 *
 * Days are `YYYY-MM-DD` strings and compare as text; `${month}-31` is the last
 * day of any month for that comparison.
 */
import { z } from "zod";

/** One order line. `rate` is the percentage it earns on the order's day
 *  (0661); 0 = in the bill, earning nothing. `qty` counts mattress pieces. */
export interface DcLine { modelId: string | null; category: string | null; value: number; rate: number | null; qty?: number | null }
export interface DcOrder {
  orderId: string; so: number | null; dealerId: string; outletId: string | null;
  /** The order's day in Malaysia, whose rates its lines take (0661). */
  orderedOn?: string;
  customer?: string | null;
  addons: number;
  /** The order's bundle discount. No order records one yet. */
  bundleDiscount?: number | null;
  lines: DcLine[];
  payments: { paidOn: string; amount: number }[] | null;
  /** Refunds HQ has paid to the customer, by the day paid (0597). */
  refunds?: { paidOn: string; amount: number }[] | null;
  /** The day a cancelled order was cancelled (0662). */
  cancelledOn?: string | null;
  /** The day Finance took a cancelled order's commission back (0662). */
  takeBackOn?: string | null;
}
export interface DcSource {
  /** Today's standard rate and product rates (0661: read from the dated
   *  rules). The report reads each line's own rate instead. */
  settings: { defaultRate: number };
  rates: { modelId: string; modelName: string; rate: number }[];
  quotas: { dealerId: string; quota: number; rebateRate: number; startsOn: string }[];
  models: { id: string; name: string }[];
  dealers: { id: string; name: string }[];
  outlets: { id: string; name: string; dealerId: string }[];
  orders: DcOrder[];
}

const cents = (n: number) => Math.round(n * 100) / 100;
const endOf = (month: string) => `${month}-31`;
function monthBefore(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

/** What HQ kept on an order over the days `upTo` accepts: payments less paid refunds, never below zero. */
function kept(o: DcOrder, upTo: (day: string) => boolean) {
  const sum = (xs: { paidOn: string; amount: number }[] | null | undefined) =>
    (xs ?? []).filter((x) => upTo(x.paidOn)).reduce((s, x) => s + Number(x.amount), 0);
  return Math.max(0, sum(o.payments) - sum(o.refunds));
}
const keptThrough = (o: DcOrder, day: string) => kept(o, (d) => d <= day);

/**
 * Day by day from `from`, what an order adds to the dealer's collections: the rise in
 * what HQ kept since `from`. A refund is a fall, but never past zero for that order, so a
 * refund of money paid before `from` takes nothing from another order.
 */
function keptByDay(o: DcOrder, from: string): [string, number][] {
  const days = [...new Set([...(o.payments ?? []), ...(o.refunds ?? [])].map((x) => x.paidOn))]
    .filter((d) => d >= from).sort();
  let prev = 0;
  return days.map((day) => {
    const k = kept(o, (d) => d >= from && d <= day);
    const step: [string, number] = [day, k - prev];
    prev = k;
    return step;
  });
}

/** An order's fixed figures: its total, what earns nothing, the earning base
 *  and its commission when paid in full. */
export interface DcTerms { total: number; noEarn: number; base: number; full: number }

export function orderTerms(o: DcOrder): DcTerms {
  const value = (l: DcLine) => Number(l.value);
  const pieces = (l: DcLine) => (l.category === "mattress" ? Math.max(0, Number(l.qty ?? 1)) : 0);
  const gross = o.lines.reduce((s, l) => s + value(l), 0);
  const discount = Math.max(0, Number(o.bundleDiscount ?? 0));
  const mattressPieces = o.lines.reduce((s, l) => s + pieces(l), 0);
  const earningGross = o.lines.reduce((s, l) => s + (Number(l.rate ?? 0) > 0 ? value(l) : 0), 0);
  let noEarn = Number(o.addons);
  let base = 0;
  let full = 0;
  for (const l of o.lines) {
    const rate = Number(l.rate ?? 0);
    // The bundle discount: equal per mattress piece; with no mattress, by
    // value over the lines that earn.
    const share = mattressPieces > 0
      ? (discount * pieces(l)) / mattressPieces
      : rate > 0 && earningGross > 0 ? (discount * value(l)) / earningGross : 0;
    const net = value(l) - share;
    if (rate > 0) {
      base += net;
      full += (net * rate) / 100;
    } else {
      noEarn += net;
    }
  }
  return { total: gross - discount + Number(o.addons), noEarn, base, full };
}

/** The first day the money kept reached half the order total, or null. */
function halfReachedOn(o: DcOrder, terms: DcTerms): string | null {
  if (!(terms.total > 0)) return null;
  const days = [...new Set([...(o.payments ?? []), ...(o.refunds ?? [])].map((x) => x.paidOn))].sort();
  return days.find((d) => keptThrough(o, d) >= terms.total / 2) ?? null;
}

/** What an order has earned by the end of `day`. */
function earnedThrough(o: DcOrder, terms: DcTerms, half: string | null, day: string): number {
  if (o.takeBackOn && o.takeBackOn <= day) return 0;
  if (half === null || half > day || !(terms.base > 0)) return 0;
  const share = Math.min(1, Math.max(0, (keptThrough(o, day) - terms.noEarn) / terms.base));
  return terms.full * share;
}

/** Where an order stands in a month: which group it shows in. A cancelled
 *  order shows in the month it was cancelled, where its commission can be
 *  taken back, and in the month it is. */
export type DcOrderGroup = "new" | "cancelled" | "taken_back" | "balance" | "waiting";

export interface DcOrderMonth {
  order: DcOrder;
  terms: DcTerms;
  /** The money kept by the month's end, and what came in (net of refunds) during it. */
  keptToMonthEnd: number;
  keptThisMonth: number;
  /** The day the money kept reached half the order total, if it has by the month's end. */
  halfReachedOn: string | null;
  earnedToMonthEnd: number;
  /** This month's commission: earned by its end less earned by the end of the month before. */
  earned: number;
  /** Commission the order would still earn when paid in full; 0 once cancelled. */
  stillToEarn: number;
  cancelled: boolean;
  takenBack: boolean;
  group: DcOrderGroup | null;
}

/** One order in `month` (YYYY-MM). */
export function orderMonth(o: DcOrder, month: string): DcOrderMonth {
  const terms = orderTerms(o);
  const end = endOf(month);
  const prevEnd = endOf(monthBefore(month));
  const reached = halfReachedOn(o, terms);
  const half = reached !== null && reached <= end ? reached : null;
  const earnedToMonthEnd = earnedThrough(o, terms, reached, end);
  const earned = earnedToMonthEnd - earnedThrough(o, terms, reached, prevEnd);
  const cancelled = !!o.cancelledOn && o.cancelledOn <= end;
  const takenBack = !!o.takeBackOn && o.takeBackOn <= end;
  const stillToEarn = cancelled || takenBack ? 0 : Math.max(0, terms.full - earnedToMonthEnd);
  const keptToMonthEnd = keptThrough(o, end);
  const keptThisMonth = keptToMonthEnd - keptThrough(o, prevEnd);
  const isNew = !!o.orderedOn && o.orderedOn.slice(0, 7) === month;
  const cancelledThisMonth = !!o.cancelledOn && o.cancelledOn.slice(0, 7) === month;
  const group: DcOrderGroup | null = isNew ? "new"
    : cents(earned) < 0 ? "taken_back"
    : cancelledThisMonth ? "cancelled"
    : cents(earned) > 0 || cents(keptThisMonth) !== 0 ? "balance"
    : cents(stillToEarn) > 0 ? "waiting"
    : null;
  return {
    order: o, terms, keptToMonthEnd: cents(keptToMonthEnd), keptThisMonth: cents(keptThisMonth),
    halfReachedOn: half, earnedToMonthEnd: cents(earnedToMonthEnd), earned: cents(earned),
    stillToEarn: cents(stillToEarn), cancelled, takenBack, group,
  };
}

/**
 * Month by month from the first month: the rebate due so far is rate × collected so far,
 * capped at the quota and never below zero; a month's rebate is what that month adds.
 * A month of refunds is negative and takes back only rebate that was actually given.
 */
export function rebateByMonth(quota: number, rate: number, collectedByMonth: [string, number][]) {
  let collected = 0;
  let given = 0;
  return collectedByMonth.map(([month, c]) => {
    collected += c;
    const due = cents(Math.max(0, Math.min((collected * rate) / 100, quota)));
    const rebate = cents(due - given);
    given = due;
    return { month, rebate, quotaLeft: cents(quota - due) };
  });
}

export interface DcReportRow {
  dealerId: string; dealer: string;
  earned: number; stillToCollect: number;
  rebate: number | null; quotaLeft: number | null;
}

export interface DcFilter { dealerId?: string; outletId?: string }

/** One row per order in `month`, for the orders that show in it (a group). */
export function dealerCommissionOrders(src: DcSource, month: string, filter: DcFilter = {}): (DcOrderMonth & { dealer: string })[] {
  const names = new Map(src.dealers.map((d) => [d.id, d.name]));
  return src.orders
    .filter((o) => names.has(o.dealerId)
      && (!filter.dealerId || o.dealerId === filter.dealerId)
      && (!filter.outletId || o.outletId === filter.outletId))
    .map((o) => ({ ...orderMonth(o, month), dealer: names.get(o.dealerId)! }))
    .filter((r) => r.group !== null);
}

/** One row per dealer for `month` (YYYY-MM). `outletId` narrows commission; the rebate stays the dealer's. */
export function dealerCommissionReport(src: DcSource, month: string, filter: DcFilter = {}): DcReportRow[] {
  const rows = new Map<string, DcReportRow>();
  for (const d of src.dealers) {
    if (filter.dealerId && d.id !== filter.dealerId) continue;
    rows.set(d.id, { dealerId: d.id, dealer: d.name, earned: 0, stillToCollect: 0, rebate: null, quotaLeft: null });
  }
  for (const o of src.orders) {
    const row = rows.get(o.dealerId);
    if (!row) continue;
    if (filter.outletId && o.outletId !== filter.outletId) continue;
    const m = orderMonth(o, month);
    row.earned += m.earned;
    row.stillToCollect += m.stillToEarn;
  }
  for (const q of src.quotas) {
    const row = rows.get(q.dealerId);
    if (!row) continue;
    const byMonth = new Map<string, number>();
    for (const o of src.orders) {
      if (o.dealerId !== q.dealerId || o.cancelledOn) continue;
      for (const [day, amt] of keptByDay(o, q.startsOn)) {
        byMonth.set(day.slice(0, 7), (byMonth.get(day.slice(0, 7)) ?? 0) + amt);
      }
    }
    const months = [...byMonth.entries()].filter(([m]) => m <= month).sort(([a], [b]) => a.localeCompare(b));
    const steps = rebateByMonth(Number(q.quota), Number(q.rebateRate), months);
    const last = steps[steps.length - 1];
    row.rebate = last?.month === month ? last.rebate : 0;
    row.quotaLeft = last ? last.quotaLeft : Number(q.quota);
  }
  return [...rows.values()].map((r) => ({ ...r, earned: cents(r.earned), stillToCollect: cents(r.stillToCollect) }));
}

const rate = z.number().min(0).max(100);

/**
 * 0661 — Finance's dated commission rules (docs/finance/MASTER.md §3.2,
 * Chew 2026-10-05 to 2026-10-07). Each is a rate or a switch from a day; a
 * row is never changed: a new rate is a new row, a mistake is removed.
 *   standard   the rate every product takes
 *   dealer     a dealer's own rate
 *   product    a product's own rate
 *   promotion  a product is a promotion item, taking `rate` points off, or is not
 *   category   a kind of product earns commission, or does not
 * Order: the product's rate, else the dealer's, else the standard; then a
 * promotion item's points off. The database decides; these are its shapes.
 */
export const DC_RULE_KINDS = ["standard", "dealer", "product", "promotion", "category"] as const;
export type DcRuleKind = (typeof DC_RULE_KINDS)[number];

export interface DcRule {
  id: string;
  kind: DcRuleKind;
  dealerId: string | null; dealerName: string | null;
  modelId: string | null; modelName: string | null;
  category: string | null;
  /** standard, dealer, product: the percentage. promotion (on): the points off. */
  rate: number | null;
  /** category: earns commission. promotion: is a promotion item. */
  isOn: boolean | null;
  /** null: from the start. */
  startsOn: string | null;
  memo: string | null;
  createdAt: string; createdBy: string | null;
  /** in_use: the one in force today · replaced: an earlier one · later: starts after today. */
  state: "in_use" | "replaced" | "later";
}

export interface DcRulesRead {
  today: string;
  rules: DcRule[];
  dealers: { id: string; name: string }[];
  models: { id: string; name: string; category: string }[];
  /** The kinds of product a switch may name (service and the guarantee never earn). */
  categories: string[];
}

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the day the rate starts.");
const memo = z.string().trim().max(200, "Keep the memo to 200 characters.").nullish();
export const dcRuleAddInput = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("standard"), rate, startsOn: day, memo }).strict(),
  z.object({ kind: z.literal("dealer"), dealerId: z.string().uuid(), rate, startsOn: day, memo }).strict(),
  z.object({ kind: z.literal("product"), modelId: z.string().uuid(), rate, startsOn: day, memo }).strict(),
  z.object({
    kind: z.literal("promotion"), modelId: z.string().uuid(), isOn: z.boolean(),
    points: z.number().gt(0).max(100).nullish(), startsOn: day, memo,
  }).strict(),
  z.object({ kind: z.literal("category"), category: z.string().min(1).max(40), isOn: z.boolean(), startsOn: day, memo }).strict(),
]);
export type DcRuleAddInput = z.infer<typeof dcRuleAddInput>;

/** 0662 — take a cancelled order's commission back, or keep it again. */
export const dcTakeBackInput = z.object({ takeBack: z.boolean() }).strict();

export const dcQuotaInput = z.object({
  quota: z.number().min(0).max(9_999_999_999.99),
  rebateRate: rate,
  startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
