/**
 * Dealer commission and renovation rebate — the one arithmetic (migration 0544).
 *
 * Read-only: nothing here is owed or posted (CLAUDE.md §7). The report reads
 * `dealer_commission_source(month)` and passes it through `dealerCommissionReport`.
 *
 * Commission, per order:
 *   1. A cashback is spread over the lines by value (RM500 on 1499+999+999 → 2997).
 *   2. Each line's rate: a product rate if Finance set one, else the default.
 *      Service and guarantee lines earn nothing; transport and disposal are
 *      add-ons, which are part of the bill but earn nothing.
 *   3. Only collected money earns: each line earns rate × its share of what was
 *      collected, shared by value. The rest is "still to collect".
 * Rebate, per dealer: each month rate × collected that month, capped at the
 * quota left. The quota left is never stored; it is worked out here.
 */
import { z } from "zod";

export const NO_COMMISSION_CATEGORIES = ["service", "guarantee"];

export interface DcLine { modelId: string | null; category: string | null; value: number }
export interface DcOrder {
  orderId: string; so: number | null; dealerId: string; outletId: string | null;
  addons: number; cashback?: number;
  lines: DcLine[];
  payments: { paidOn: string; amount: number }[] | null;
}
export interface DcSource {
  settings: { defaultRate: number };
  rates: { modelId: string; modelName: string; rate: number }[];
  quotas: { dealerId: string; quota: number; rebateRate: number; startsOn: string }[];
  models: { id: string; name: string }[];
  dealers: { id: string; name: string }[];
  outlets: { id: string; name: string; dealerId: string }[];
  orders: DcOrder[];
}

const cents = (n: number) => Math.round(n * 100) / 100;

/** Commission an order earns on `collected`, and what it would earn when paid in full. */
export function orderCommission(order: DcOrder, rateOf: (modelId: string | null) => number, collected: number) {
  const gross = order.lines.reduce((s, l) => s + Number(l.value), 0);
  const cashback = Number(order.cashback ?? 0);
  const bill = gross - cashback + Number(order.addons);
  let full = 0;
  for (const l of order.lines) {
    if (NO_COMMISSION_CATEGORIES.includes(l.category ?? "")) continue;
    const net = gross > 0 ? Number(l.value) - (cashback * Number(l.value)) / gross : 0;
    full += (net * rateOf(l.modelId)) / 100;
  }
  const share = bill > 0 ? Math.min(1, collected / bill) : 0;
  return { earned: full * share, full };
}

/** Month by month from the first month: rebate = rate × collected, capped at the quota left. */
export function rebateByMonth(quota: number, rate: number, collectedByMonth: [string, number][]) {
  let left = quota;
  return collectedByMonth.map(([month, collected]) => {
    const rebate = cents(Math.min((collected * rate) / 100, left));
    left = cents(left - rebate);
    return { month, rebate, quotaLeft: left };
  });
}

export interface DcReportRow {
  dealerId: string; dealer: string;
  earned: number; stillToCollect: number;
  rebate: number | null; quotaLeft: number | null;
}

/** One row per dealer for `month` (YYYY-MM). `outletId` narrows commission; the rebate stays the dealer's. */
export function dealerCommissionReport(src: DcSource, month: string, filter: { dealerId?: string; outletId?: string } = {}): DcReportRow[] {
  const special = new Map(src.rates.map((r) => [r.modelId, Number(r.rate)]));
  const rateOf = (id: string | null) => (id && special.has(id) ? special.get(id)! : Number(src.settings.defaultRate));
  const rows = new Map<string, DcReportRow>();
  for (const d of src.dealers) {
    if (filter.dealerId && d.id !== filter.dealerId) continue;
    rows.set(d.id, { dealerId: d.id, dealer: d.name, earned: 0, stillToCollect: 0, rebate: null, quotaLeft: null });
  }
  const monthly = new Map<string, Map<string, number>>();
  for (const o of src.orders) {
    const row = rows.get(o.dealerId);
    if (!row) continue;
    const pays = o.payments ?? [];
    const before = pays.filter((p) => p.paidOn.slice(0, 7) < month).reduce((s, p) => s + Number(p.amount), 0);
    const through = pays.filter((p) => p.paidOn.slice(0, 7) <= month).reduce((s, p) => s + Number(p.amount), 0);
    for (const p of pays) {
      const m = monthly.get(o.dealerId) ?? new Map<string, number>();
      m.set(p.paidOn, (m.get(p.paidOn) ?? 0) + Number(p.amount));
      monthly.set(o.dealerId, m);
    }
    if (filter.outletId && o.outletId !== filter.outletId) continue;
    const now = orderCommission(o, rateOf, through);
    row.earned += now.earned - orderCommission(o, rateOf, before).earned;
    row.stillToCollect += now.full - now.earned;
  }
  for (const q of src.quotas) {
    const row = rows.get(q.dealerId);
    if (!row) continue;
    const byMonth = new Map<string, number>();
    for (const [day, amt] of monthly.get(q.dealerId) ?? []) {
      if (day < q.startsOn) continue;
      byMonth.set(day.slice(0, 7), (byMonth.get(day.slice(0, 7)) ?? 0) + amt);
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
export const dcSettingsInput = z.object({ defaultRate: rate });
export const dcProductRateInput = z.object({ rate });
export const dcQuotaInput = z.object({
  quota: z.number().min(0).max(9_999_999_999.99),
  rebateRate: rate,
  startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
