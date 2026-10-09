/**
 * Dealer commission, renovation rebate and KPI allowance — the one arithmetic
 * (0544, 0661, 0662, 0664, 0665).
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
 * Renovation rebate, per dealer (rules 7.2–7.4, 0665): rate × the money that
 * counts since the rebate started, never past its total; each month's rebate is
 * the rise since last month. The money follows commission's rules: an order
 * counts nothing until it reaches half, then all it kept since the rebate
 * started; a refund takes back; a cancelled order's money still counts until
 * Finance takes its commission back. An order counts only what it kept since
 * the rebate started, so a refund of older money takes nothing from another
 * order. The total can be filled in later: until then there is no limit. The
 * total left is never stored; it is worked out here.
 *
 * KPI allowance, per dealer (rules 8.1–8.4, 0665): each 15-year guarantee sold
 * counts on its order's day (a line of 2 is two); a cancelled order's do not.
 * A period (a month, or a year) pays the amount per guarantee plus the bonus of
 * the highest tier its count reached; tiers do not add up. The amounts are
 * Finance's, kept in the database (never in this repository).
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
  /** A dealer's renovation rebate; `quota` is its total, null until filled in (0665). */
  quotas: { dealerId: string; quota: number | null; rebateRate: number; startsOn: string }[];
  /** 0665 — the KPI allowance rules, each from its day. */
  kpi?: DcKpiRule[];
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
function monthAfter(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

/** What HQ kept on an order over the days `upTo` accepts: payments less paid refunds, never below zero. */
function kept(o: DcOrder, upTo: (day: string) => boolean) {
  const sum = (xs: { paidOn: string; amount: number }[] | null | undefined) =>
    (xs ?? []).filter((x) => upTo(x.paidOn)).reduce((s, x) => s + Number(x.amount), 0);
  return Math.max(0, sum(o.payments) - sum(o.refunds));
}
const keptThrough = (o: DcOrder, day: string) => kept(o, (d) => d <= day);

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
  // 0664: the statement reads every order to today, so an earlier month can
  // see an order placed after it. It is not in that month at all.
  const placedLater = !!o.orderedOn && o.orderedOn > end;
  const stillToEarn = cancelled || takenBack || placedLater ? 0 : Math.max(0, terms.full - earnedToMonthEnd);
  const keptToMonthEnd = keptThrough(o, end);
  const keptThisMonth = keptToMonthEnd - keptThrough(o, prevEnd);
  const isNew = !!o.orderedOn && o.orderedOn.slice(0, 7) === month;
  const cancelledThisMonth = !!o.cancelledOn && o.cancelledOn.slice(0, 7) === month;
  const group: DcOrderGroup | null = placedLater ? null
    : isNew ? "new"
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
 * Month by month from the first month: the rebate due so far is rate × the money
 * that counts so far, never below zero and never past the total (null: not filled
 * in yet, no limit, rule 7.3); a month's rebate is what that month adds. A month
 * of refunds is negative and takes back only rebate that was actually given.
 */
export function rebateByMonth(quota: number | null, rate: number, collectedByMonth: [string, number][]) {
  let collected = 0;
  let given = 0;
  return collectedByMonth.map(([month, c]) => {
    collected += c;
    const worked = (collected * rate) / 100;
    const due = cents(Math.max(0, quota === null ? worked : Math.min(worked, quota)));
    const rebate = cents(due - given);
    given = due;
    return { month, rebate, quotaLeft: quota === null ? null : cents(quota - due) };
  });
}

/**
 * The money that counts toward a dealer's renovation rebate by the end of `day`
 * (rules 7.2–7.4): each order's money kept since the rebate started, once the
 * order has reached half (then all of it), and none once its commission is
 * taken back.
 */
function rebateMoneyThrough(orders: DcOrder[], from: string, day: string): number {
  let sum = 0;
  for (const o of orders) {
    if (o.takeBackOn && o.takeBackOn <= day) continue;
    const half = halfReachedOn(o, orderTerms(o));
    if (half === null || half > day) continue;
    sum += kept(o, (d) => d >= from && d <= day);
  }
  return sum;
}

/**
 * 0665 — a KPI allowance rule from its day (Finance MASTER §3.2, rules 8.1–8.4).
 * The amounts are Finance's, kept in the database, never in this repository.
 */
export interface DcKpiRule {
  id: string;
  startsOn: string;
  /** The guarantee product counted. */
  modelId: string;
  perUnit: number;
  tiers: { units: number; bonus: number }[];
  period: "month" | "year";
}

/** What a count earns under a rule: the amount per guarantee, plus the bonus of
 *  the highest tier the count reached (tiers do not add up). */
export function kpiAmount(rule: Pick<DcKpiRule, "perUnit" | "tiers">, units: number): number {
  const bonus = rule.tiers.reduce((best, t) => (units >= Number(t.units) ? Math.max(best, Number(t.bonus)) : best), 0);
  return cents(Number(rule.perUnit) * units + bonus);
}

function kpiRuleOn(rules: DcKpiRule[], day: string): DcKpiRule | null {
  let best: DcKpiRule | null = null;
  for (const r of rules) if (r.startsOn <= day && (!best || r.startsOn > best.startsOn)) best = r;
  return best;
}

/** The guarantees sold on orders placed from `from` to `to` (rule 8.1);
 *  a cancelled order's do not count (8.4). */
function guaranteesSold(orders: DcOrder[], modelId: string, from: string, to: string): number {
  let n = 0;
  for (const o of orders) {
    if (!o.orderedOn || o.orderedOn < from || o.orderedOn > to || o.cancelledOn) continue;
    for (const l of o.lines) if (l.modelId === modelId) n += Math.max(0, Number(l.qty ?? 1));
  }
  return n;
}

/**
 * What one dealer's KPI allowance adds in `month`, by the rule in force at the
 * month's end: the period's allowance by the month's end less what the same
 * period had by the end of the month before. A monthly count starts again each
 * month; a yearly one pays each guarantee as it comes and a tier's bonus in the
 * month it is reached. Orders before the first rule's day do not count. Null
 * when no rule is in force.
 */
export function kpiForMonth(rules: DcKpiRule[] | undefined, orders: DcOrder[], month: string): { amount: number; units: number } | null {
  const all = rules ?? [];
  const rule = kpiRuleOn(all, endOf(month));
  if (!rule) return null;
  const first = all.reduce((min, r) => (r.startsOn < min ? r.startsOn : min), rule.startsOn);
  const periodStart = rule.period === "year" ? `${month.slice(0, 4)}-01-01` : `${month}-01`;
  const from = periodStart > first ? periodStart : first;
  const now = guaranteesSold(orders, rule.modelId, from, endOf(month));
  const before = rule.period === "year" && !month.endsWith("-01")
    ? guaranteesSold(orders, rule.modelId, from, endOf(monthBefore(month)))
    : 0;
  return { amount: cents(kpiAmount(rule, now) - kpiAmount(rule, before)), units: now - before };
}

export interface DcReportRow {
  dealerId: string; dealer: string;
  earned: number; stillToCollect: number;
  /** Null: the dealer has no renovation rebate. */
  rebate: number | null;
  /** Null: no rebate, or its total is not filled in yet (no limit). */
  quotaLeft: number | null;
  /** 0665 — the KPI allowance the month adds; null when no KPI rule is in force. */
  kpi: number | null;
  /** The guarantees the month adds to the KPI count. */
  kpiUnits: number;
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
    rows.set(d.id, { dealerId: d.id, dealer: d.name, earned: 0, stillToCollect: 0, rebate: null, quotaLeft: null, kpi: null, kpiUnits: 0 });
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
    const orders = src.orders.filter((o) => o.dealerId === q.dealerId);
    const quota = q.quota === null || q.quota === undefined ? null : Number(q.quota);
    // The money that counts, month by month from the rebate's first month.
    const months: [string, number][] = [];
    let before = 0;
    for (let m = q.startsOn.slice(0, 7); m <= month; m = monthAfter(m)) {
      const now = rebateMoneyThrough(orders, q.startsOn, endOf(m));
      months.push([m, now - before]);
      before = now;
    }
    const steps = rebateByMonth(quota, Number(q.rebateRate), months);
    const last = steps[steps.length - 1];
    row.rebate = last?.month === month ? last.rebate : 0;
    row.quotaLeft = last ? last.quotaLeft : quota;
  }
  for (const row of rows.values()) {
    const k = kpiForMonth(src.kpi, src.orders.filter((o) => o.dealerId === row.dealerId), month);
    row.kpi = k ? k.amount : null;
    row.kpiUnits = k ? k.units : 0;
  }
  return [...rows.values()].map((r) => ({ ...r, earned: cents(r.earned), stillToCollect: cents(r.stillToCollect) }));
}

/**
 * 0664 — a dealer's statement, like a supplier's (Finance MASTER §3.2 "Dealer
 * statement", 「我欠他多少，几时付他」): what Carres owes the dealer month by
 * month and the payments made to it, with a running balance, live. Each
 * month's commission and rebate are the same arithmetic as the report; a
 * month's lines fall due on the 15th of the month after (Chew 2026-10-06).
 */
export interface DcStatementSource {
  today: string;
  dealer: { id: string; name: string };
  orders: DcOrder[];
  quotas: DcSource["quotas"];
  /** 0665 — the KPI allowance rules. */
  kpi?: DcKpiRule[];
  /** Paid vouchers counted as payments to this dealer. */
  payments: { id: string; voucherId: string; voucherNo: string; paidOn: string; amount: number }[];
}

export type DcStatementLineKind = "commission" | "rebate" | "kpi" | "payment";

export interface DcStatementLine {
  /** The month's last day (today for the month in progress), or the voucher's day. */
  day: string;
  kind: DcStatementLineKind;
  /** YYYY-MM for commission, rebate and KPI allowance. */
  month: string | null;
  /** The month in progress: its commission so far. */
  soFar: boolean;
  /** The 15th of the month after, for commission, rebate and KPI allowance. */
  due: string | null;
  voucherNo: string | null;
  paymentId: string | null;
  /** What the line adds to what Carres owes (can be negative: taken back). */
  owed: number;
  paid: number;
  balance: number;
}

export interface DcStatement {
  dealer: { id: string; name: string };
  lines: DcStatementLine[];
  /** What Carres owes the dealer after the last line. */
  owedNow: number;
  /** Commission still to earn on the dealer's orders, today. */
  stillToCome: number;
  /** The first due day that the payments made do not cover, and what is due
   *  by then (payments pay the oldest months first), never more than is owed
   *  now. Null when nothing is owed. The day can be past: Carres is late. */
  nextDue: { day: string; amount: number } | null;
}

const lastDayOf = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
};
const KIND_ORDER: Record<DcStatementLineKind, number> = { commission: 0, rebate: 1, kpi: 2, payment: 3 };

/** A statement read as the report source for its one dealer, so the store
 *  page can list a month order by order with the same arithmetic. */
export function statementAsSource(src: DcStatementSource): DcSource {
  return {
    settings: { defaultRate: 0 }, rates: [], models: [], outlets: [],
    quotas: src.quotas, kpi: src.kpi, dealers: [src.dealer], orders: src.orders,
  };
}

export function dealerStatement(src: DcStatementSource): DcStatement {
  const thisMonth = src.today.slice(0, 7);
  const report = statementAsSource(src);
  const firstMonth = src.orders.map((o) => (o.orderedOn ?? src.today).slice(0, 7)).sort()[0] ?? thisMonth;
  const lines: Omit<DcStatementLine, "balance">[] = [];
  for (let m = firstMonth; m <= thisMonth; m = monthAfter(m)) {
    const row = dealerCommissionReport(report, m)[0];
    if (!row) continue;
    const soFar = m === thisMonth;
    const day = soFar ? src.today : lastDayOf(m);
    const due = `${monthAfter(m)}-15`;
    const base = { day, month: m, soFar, due, voucherNo: null, paymentId: null, paid: 0 };
    if (row.earned !== 0) lines.push({ ...base, kind: "commission", owed: row.earned });
    if (row.rebate !== null && row.rebate !== 0) lines.push({ ...base, kind: "rebate", owed: row.rebate });
    if (row.kpi !== null && row.kpi !== 0) lines.push({ ...base, kind: "kpi", owed: row.kpi });
  }
  for (const p of src.payments) {
    lines.push({ day: p.paidOn, kind: "payment", month: null, soFar: false, due: null,
      voucherNo: p.voucherNo, paymentId: p.id, owed: 0, paid: cents(Number(p.amount)) });
  }
  lines.sort((a, b) => a.day.localeCompare(b.day) || KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
  let balance = 0;
  const withBalance = lines.map((l) => {
    balance = cents(balance + l.owed - l.paid);
    return { ...l, balance };
  });
  const now = dealerCommissionReport(report, thisMonth)[0];
  const paid = lines.reduce((s, l) => s + l.paid, 0);
  let nextDue: DcStatement["nextDue"] = null;
  for (const day of [...new Set(lines.flatMap((l) => (l.due ? [l.due] : [])))].sort()) {
    const dueBy = lines.reduce((s, l) => s + (l.due && l.due <= day ? l.owed : 0), 0);
    const amount = cents(Math.min(dueBy - paid, balance));
    if (amount > 0) {
      nextDue = { day, amount };
      break;
    }
  }
  return { dealer: src.dealer, lines: withBalance, owedNow: balance, stillToCome: now?.stillToCollect ?? 0, nextDue };
}

const rate = z.number().min(0).max(100);

/** 0664 — a paid voucher counted as a payment to a dealer. */
export const dcPaymentLinkInput = z.object({ voucherId: z.string().uuid(), dealerId: z.string().uuid() }).strict();

/** 0664 — a paid direct voucher Finance may count as a payment to a dealer. */
export interface DcPaymentChoice {
  id: string; voucherNo: string; voucherDate: string; payee: string; amount: number; narration: string | null;
}

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
  /** 0665: null until Finance fills the total in (rule 7.3). */
  quota: z.number().min(0).max(9_999_999_999.99).nullable(),
  rebateRate: rate,
  startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/** 0665 — a KPI allowance rule as Finance's list reads it. */
export interface DcKpiRuleRow extends DcKpiRule {
  modelName: string | null;
  memo: string | null;
  createdAt: string;
  createdBy: string | null;
  /** in_use: the rule in force today; later: starts after today; replaced: an earlier one. */
  state: "in_use" | "replaced" | "later";
}

export interface DcKpiRulesRead {
  today: string;
  rules: DcKpiRuleRow[];
  /** The guarantee products a rule may count. */
  guarantees: { id: string; name: string }[];
}

const sen = (n: number) => Math.round(n * 100) === n * 100;
const kpiMoney = z.number().min(0).max(9_999_999.99).refine(sen, "Type the amount in ringgit and sen, like 10.00.");

/** 0665 — a KPI allowance rule from a day (rules 8.1–8.3). */
export const dcKpiRuleAddInput = z.object({
  startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the day it starts."),
  modelId: z.string().uuid(),
  perUnit: kpiMoney,
  tiers: z.array(z.object({ units: z.number().int().min(1).max(100_000), bonus: kpiMoney }).strict()).max(20),
  period: z.enum(["month", "year"]),
  memo,
}).strict();
export type DcKpiRuleAddInput = z.infer<typeof dcKpiRuleAddInput>;
