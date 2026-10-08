/**
 * Dealer commission and renovation rebate — the one arithmetic (migration 0544).
 *
 * Read-only: nothing here is owed or posted (CLAUDE.md §7). The report reads
 * `dealer_commission_source(month)` and passes it through `dealerCommissionReport`.
 *
 * Commission, per order:
 *   1. A cashback is spread over the lines by value (RM500 on 1499+999+999 → 2997).
 *   2. Each line's rate is the database's (0661, `dealer_commission_rate`): the
 *      rate in force on the order's day, from Finance's dated rules — the
 *      product's own rate, else the dealer's, else the standard, less a
 *      promotion item's points. Service, the guarantee and a kind of product
 *      switched off come with rate 0; transport and disposal are add-ons. All
 *      of them are part of the bill but earn nothing.
 *   3. Only collected money earns: each line earns rate × its share of what was
 *      collected, shared by value. The rest is "still to collect".
 *   Collected is payments less refunds HQ has paid out, up to the cut off, never
 *   below zero (0597). A refund lowers the month it was paid in, so that month
 *   can show a negative earned figure.
 * Rebate, per dealer: rate × everything collected since the quota started,
 * capped at the quota; each month's rebate is the rise since last month. An
 * order counts only what it kept since the quota started, so a refund of older
 * money takes nothing from another order. The quota left is never
 * stored; it is worked out here.
 */
import { z } from "zod";

/** One order line. `rate` is the percentage it earns on the order's day
 *  (0661); 0 = in the bill, earning nothing. */
export interface DcLine { modelId: string | null; category: string | null; value: number; rate: number | null }
export interface DcOrder {
  orderId: string; so: number | null; dealerId: string; outletId: string | null;
  /** The order's day in Malaysia, whose rates its lines take (0661). */
  orderedOn?: string;
  addons: number; cashback?: number;
  lines: DcLine[];
  payments: { paidOn: string; amount: number }[] | null;
  /** Refunds HQ has paid to the customer, by the day paid (0597). */
  refunds?: { paidOn: string; amount: number }[] | null;
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

/** What HQ kept on an order over the days `upTo` accepts: payments less paid refunds, never below zero. */
function kept(o: DcOrder, upTo: (day: string) => boolean) {
  const sum = (xs: { paidOn: string; amount: number }[] | null | undefined) =>
    (xs ?? []).filter((x) => upTo(x.paidOn)).reduce((s, x) => s + Number(x.amount), 0);
  return Math.max(0, sum(o.payments) - sum(o.refunds));
}

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

/** Commission an order earns on `collected`, and what it would earn when paid in full. */
export function orderCommission(order: DcOrder, collected: number) {
  const gross = order.lines.reduce((s, l) => s + Number(l.value), 0);
  const cashback = Number(order.cashback ?? 0);
  const bill = gross - cashback + Number(order.addons);
  let full = 0;
  for (const l of order.lines) {
    const rate = Number(l.rate ?? 0);
    if (!(rate > 0)) continue;
    const net = gross > 0 ? Number(l.value) - (cashback * Number(l.value)) / gross : 0;
    full += (net * rate) / 100;
  }
  const share = bill > 0 ? Math.min(1, collected / bill) : 0;
  return { earned: full * share, full };
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

/** One row per dealer for `month` (YYYY-MM). `outletId` narrows commission; the rebate stays the dealer's. */
export function dealerCommissionReport(src: DcSource, month: string, filter: { dealerId?: string; outletId?: string } = {}): DcReportRow[] {
  const rows = new Map<string, DcReportRow>();
  for (const d of src.dealers) {
    if (filter.dealerId && d.id !== filter.dealerId) continue;
    rows.set(d.id, { dealerId: d.id, dealer: d.name, earned: 0, stillToCollect: 0, rebate: null, quotaLeft: null });
  }
  for (const o of src.orders) {
    const row = rows.get(o.dealerId);
    if (!row) continue;
    const before = kept(o, (d) => d.slice(0, 7) < month);
    const through = kept(o, (d) => d.slice(0, 7) <= month);
    if (filter.outletId && o.outletId !== filter.outletId) continue;
    const now = orderCommission(o, through);
    row.earned += now.earned - orderCommission(o, before).earned;
    row.stillToCollect += now.full - now.earned;
  }
  for (const q of src.quotas) {
    const row = rows.get(q.dealerId);
    if (!row) continue;
    const byMonth = new Map<string, number>();
    for (const o of src.orders) {
      if (o.dealerId !== q.dealerId) continue;
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

export const dcQuotaInput = z.object({
  quota: z.number().min(0).max(9_999_999_999.99),
  rebateRate: rate,
  startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
