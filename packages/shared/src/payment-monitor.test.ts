import { describe, expect, it } from "vitest";
import {
  MONITOR_ACTION_WORD,
  MONITOR_FILTERS,
  monitorDelivery,
  monitorFilterMatch,
  monitorGoods,
  monitorGoodsWord,
  monitorStorage,
  monitorStorageWord,
  monitorSummaries,
  paymentMonitorRows,
  type MonitorStorageCase,
} from "./payment-monitor";
import type { InvoiceRegisterRow } from "./payment-invoice-register";

const rm = (n: number) => `RM ${n.toFixed(2)}`;

function row(over: {
  id?: string;
  order_id?: string;
  so?: number;
  kind?: InvoiceRegisterRow["kind"];
  status?: InvoiceRegisterRow["status"];
  amount?: number;
  issued_at?: string | null;
  voided_at?: string | null;
  paid?: number | null;
  lines?: Array<{ sku?: string; qty: number; unit_price: number | null }>;
  orderStatus?: string;
  delivery_date?: string | null;
  delivery_date_tbd?: boolean;
  control?: Partial<{
    balance: number | null;
    confirmed_date: string | null;
    line_etas: Record<string, string> | null;
    line_stock_status: Record<string, string> | null;
  }>;
} = {}): InvoiceRegisterRow {
  return {
    id: over.id ?? "i1", invoice_no: over.status === "draft" ? null : "INV-1",
    status: over.status ?? "issued", kind: over.kind ?? "sales",
    amount: over.amount ?? 1000, tax_amount: 0,
    issued_at: over.issued_at === undefined ? "2026-09-01T02:00:00Z" : over.issued_at,
    voided_at: over.voided_at ?? null,
    void_reason: null, replaces_invoice_id: null, created_at: "2026-09-01T00:00:00Z",
    order_id: over.order_id ?? "o1",
    orders: {
      id: over.order_id ?? "o1", so: over.so ?? 1300, customer_name: "LIM KUAN YANG",
      status: over.orderStatus ?? "proceed_order",
      paid: over.paid === undefined ? 0 : over.paid,
      delivery_date: over.delivery_date ?? null,
      delivery_date_tbd: over.delivery_date_tbd ?? false,
      delivered_at: null,
      order_lines: over.lines ?? [{ sku: "A", qty: 1, unit_price: 1000 }],
      order_addons: [],
      ops_order_control: [{
        balance: over.control?.balance ?? null,
        confirmed_date: over.control?.confirmed_date ?? null,
        line_etas: over.control?.line_etas ?? null,
        line_stock_status: over.control?.line_stock_status ?? null,
      }],
    },
  };
}

// Fri 11 Sep 2026. Sundays off, no holidays.
const TODAY = "2026-09-11";
const OPTS = {};

describe("Goods — Primary School English, and the exact item disclosure", () => {
  it("every line ready → Goods ready", () => {
    const g = monitorGoods(row({ lines: [{ sku: "A", qty: 1, unit_price: 1 }, { sku: "B", qty: 2, unit_price: 1 }],
      control: { line_stock_status: { A: "ready", B: "ready" } } }));
    expect(monitorGoodsWord(g)).toBe("Goods ready");
    expect(g.lines.map((l) => l.word)).toEqual(["Ready", "Ready"]);
  });
  it("some ready, the rest dated → `2 of 3 items ready · Last item arriving Mon, 21 Sep`", () => {
    const g = monitorGoods(row({
      lines: [{ sku: "A", qty: 1, unit_price: 1 }, { sku: "B", qty: 1, unit_price: 1 }, { sku: "C", qty: 1, unit_price: 1 }],
      control: { line_stock_status: { A: "ready", B: "ready", C: "waiting" }, line_etas: { C: "2026-09-21" } },
    }));
    expect(monitorGoodsWord(g)).toBe("2 of 3 items ready · Last item arriving Mon, 21 Sep");
    expect(g.lines[2]).toMatchObject({ sku: "C", qty: 1, word: "Arriving Mon, 21 Sep", ready: false });
  });
  it("nothing ready but every line dated → Arriving {last date}", () => {
    const g = monitorGoods(row({ lines: [{ sku: "A", qty: 1, unit_price: 1 }, { sku: "B", qty: 1, unit_price: 1 }],
      control: { line_etas: { A: "2026-09-15", B: "2026-09-21" } } }));
    expect(monitorGoodsWord(g)).toBe("Arriving Mon, 21 Sep");
  });
  it("a waiting line without a date → Arrival not confirmed, even when others are dated", () => {
    const g = monitorGoods(row({ lines: [{ sku: "A", qty: 1, unit_price: 1 }, { sku: "B", qty: 1, unit_price: 1 }],
      control: { line_stock_status: { A: "ready", B: "nopo" }, line_etas: { A: "2026-09-15" } } }));
    expect(monitorGoodsWord(g)).toBe("Arrival not confirmed");
    expect(g.lines[1]!.word).toBe("Arrival not confirmed");
  });
  it("lines without a SKU still read the ladder's per-SKU signals as the items", () => {
    const g = monitorGoods(row({ lines: [{ qty: 1, unit_price: 1 }],
      control: { line_stock_status: { "MS01-K": "ready" } } }));
    expect(monitorGoodsWord(g)).toBe("Goods ready");
    expect(g.lines.map((l) => l.sku)).toEqual(["MS01-K"]);
  });
  it("no signal at all → Arrival not confirmed; never a technical word", () => {
    const word = monitorGoodsWord(monitorGoods(row()));
    expect(word).toBe("Arrival not confirmed");
    expect(word).not.toMatch(/Stock status|ETA|Yes|No\b/);
  });
});

describe("Storage — the six ruled states", () => {
  const caseOf = (over: Partial<MonitorStorageCase> = {}): MonitorStorageCase => ({
    id: "c1", order_id: "o1", product_group: "mattress_bedframe", storage_start: "2026-09-01",
    rule_free_days: 7, rule_charge_amount: 150, rule_cycle_days: 30, approved_free_until: null,
    approved_at: null, billed_through_period: 0, status: "open", ...over,
  });
  const base = { orderId: "o1", requests: [], storageOwing: 0, todayIso: TODAY };

  it("no case → No storage charge", () => {
    expect(monitorStorageWord(monitorStorage({ ...base, cases: [] }), rm)).toBe("No storage charge");
  });
  it("inside the automatic free week → Free until {day 7}", () => {
    const s = monitorStorage({ ...base, cases: [caseOf({ storage_start: "2026-09-08" })] });
    expect(monitorStorageWord(s, rm)).toBe("Free until Mon, 14 Sep");
  });
  it("Day 15 of a mattress case with 7 free days → `Mattress / Bedframe · Day 15 · RM 150.00 so far` — accrued, NOT in Amount needed", () => {
    const s = monitorStorage({ ...base, cases: [caseOf({ storage_start: "2026-08-28" })] });
    expect(monitorStorageWord(s, rm)).toBe("Mattress / Bedframe · Day 15 · RM 150.00 so far");
  });
  it("a written free request after the last decision → waiting for approval with the estimate", () => {
    const s = monitorStorage({ ...base, cases: [caseOf()],
      requests: [{ order_id: "o1", free_storage_requested: true, recorded_at: "2026-09-10T00:00:00Z" }] });
    expect(monitorStorageWord(s, rm)).toBe("Free request waiting for approval · Estimated charge RM 150.00");
  });
  it("an approved extension → Free storage approved until {approved day}", () => {
    const s = monitorStorage({ ...base, cases: [caseOf({ approved_free_until: "2026-09-21", approved_at: "2026-09-05T00:00:00Z" })] });
    expect(monitorStorageWord(s, rm)).toBe("Free storage approved until Mon, 21 Sep");
  });
  it("a live unpaid Storage Invoice outranks everything → issued · not paid", () => {
    const s = monitorStorage({ ...base, cases: [caseOf({ storage_start: "2026-08-01" })], storageOwing: 200 });
    expect(monitorStorageWord(s, rm)).toBe("Storage Invoice issued · RM 200.00 not paid");
  });
  it("a sofa charges RM200 every 14 days from Day 15", () => {
    const s = monitorStorage({ ...base, cases: [caseOf({ product_group: "sofa", rule_free_days: 14,
      rule_charge_amount: 200, rule_cycle_days: 14, storage_start: "2026-08-14" })] });
    // Day 29 → second period commenced.
    expect(monitorStorageWord(s, rm)).toBe("Sofa · Day 29 · RM 400.00 so far");
  });
});

describe("Customer delivery — the confirmed date, else the request, else none", () => {
  it("confirmed → the day word, no note", () => {
    expect(monitorDelivery(row({ control: { confirmed_date: "2026-09-18" } })))
      .toEqual({ dateIso: "2026-09-18", confirmed: true, status: "confirmed", word: "Fri, 18 Sep", note: null });
  });
  it("requested only → the day word with `Not confirmed yet`", () => {
    expect(monitorDelivery(row({ delivery_date: "2026-09-18" })).note).toBe("Not confirmed yet");
  });
  it("no date → No delivery date, never a Logistics ETA", () => {
    expect(monitorDelivery(row()).word).toBe("No delivery date");
  });
  /* ⭐ ONE READ, ONE ANSWER (Law D, 2026-09-14). The Monitor used to flatten
     `delivery_date_tbd` into `No delivery date` while the collection workspace
     the row opens called the same order `Customer not sure`. Both now read
     `invoiceCustomerDelivery`, so the row and the page cannot disagree. */
  it("customer not sure is its own state, and it is the SAME word the workspace prints", () => {
    const r = monitorDelivery(row({ delivery_date: "2026-09-18", delivery_date_tbd: true }));
    expect(r).toMatchObject({ status: "customer_not_sure", word: "Customer not sure", dateIso: null });
  });
});

describe("Payment timing — two lines: the fact and the governed action", () => {
  const ready = { line_stock_status: { A: "ready" } };
  const build = (over: Parameters<typeof row>[0], extra: Partial<Parameters<typeof paymentMonitorRows>[0]> = {}) =>
    paymentMonitorRows({ invoices: [row(over)], cases: [], requests: [], todayIso: TODAY, opts: OPTS, ...extra })[0]!;

  it("deadline day → `Payment due today` / Ask customer to pay", () => {
    // Mon 14 Sep delivery: Sat 12 T−1, Fri 11 T−2 (today).
    const r = build({ control: { ...ready, confirmed_date: "2026-09-14" } });
    expect(r.timing).toMatchObject({ kind: "due_today", fact: "Payment due today", action: "ask" });
    expect(MONITOR_ACTION_WORD[r.timing.action!]).toBe("Ask customer to pay");
  });
  it("a Saturday deadline: Operation acts Friday, the fact still names Saturday; a Saturday worker acts Saturday", () => {
    // Tue 15 Sep delivery: Mon 14 T−1, Sat 12 T−2 — today is Friday 11.
    const op = build({ control: { ...ready, confirmed_date: "2026-09-15" } });
    expect(op.timing).toMatchObject({ kind: "due_today", fact: "Payment due Sat, 12 Sep", action: "ask", actionDueIso: "2026-09-11", dueIso: "2026-09-12" });
    const sat = build({ control: { ...ready, confirmed_date: "2026-09-15" } }, { owner: { offDays: [0] } });
    expect(sat.timing).toMatchObject({ kind: "ask_today", actionDueIso: "2026-09-12" });
  });
  it("ask day → `Ask customer today`", () => {
    // Tue 15 Sep delivery: Mon 14 T−1, Sat 12 T−2 → Fri 11; Fri 11 T−3 → same day = deadline.
    // Use Wed 16: Tue 15 T−1, Mon 14 T−2, Sat 12 T−3 → Fri 11 is the ask day.
    const r = build({ control: { ...ready, confirmed_date: "2026-09-16" } });
    expect(r.timing).toMatchObject({ kind: "ask_today", fact: "Ask customer today", action: "ask" });
  });
  it("past the deadline → `Payment should have been received`", () => {
    const r = build({ control: { ...ready, confirmed_date: "2026-09-12" } });
    expect(r.timing).toMatchObject({ kind: "should_have_paid", fact: "Payment should have been received", action: "ask", late: true });
  });
  it("the customer's promise for today outranks the clock word", () => {
    const r = build({ control: { ...ready, confirmed_date: "2026-09-30" } },
      { promisedByOrder: new Map([["o1", TODAY]]) });
    expect(r.timing).toMatchObject({ kind: "promised_today", fact: "Customer promised to pay today", action: "ask" });
  });
  it("goods not ready and arrival unknown → `Arrival not confirmed` / Wait — no blind collection", () => {
    const r = build({ control: { confirmed_date: "2026-09-12" } });
    expect(r.timing).toMatchObject({ kind: "arrival_not_confirmed", fact: "Arrival not confirmed", action: "wait" });
    expect(MONITOR_ACTION_WORD.wait).toBe("Wait");
  });
  it("a reliable expected arrival that supports the delivery admits collection", () => {
    const r = build({ control: { line_etas: { A: "2026-09-13" }, confirmed_date: "2026-09-14" } });
    expect(r.timing.action).toBe("ask");
  });
  it("no delivery date → No delivery date / Wait", () => {
    expect(build({ control: ready }).timing).toMatchObject({ kind: "no_date", action: "wait" });
  });
  it("before the ask day → `Payment due {day}` / Wait", () => {
    const r = build({ control: { ...ready, confirmed_date: "2026-09-30" } });
    expect(r.timing).toMatchObject({ kind: "due_later", fact: "Payment due Mon, 28 Sep", action: "wait" });
  });
  it("a live unpaid Storage Invoice → `Storage Invoice not paid` / Send the invoice and collect payment", () => {
    const rows = [
      row({ id: "s", kind: "sales", control: { ...ready, confirmed_date: "2026-09-30" }, paid: 1000 }),
      row({ id: "st", kind: "storage", amount: 150, control: { ...ready, confirmed_date: "2026-09-30" }, paid: 1000 }),
    ];
    const r = paymentMonitorRows({ invoices: rows, cases: [], requests: [], todayIso: TODAY, opts: OPTS })[0]!;
    expect(r.money.outstanding).toBe(150);
    expect(r.storage.kind).toBe("invoice_unpaid");
    expect(r.timing).toMatchObject({ kind: "storage_invoice_unpaid", fact: "Storage Invoice not paid", action: "send_invoice" });
    expect(MONITOR_ACTION_WORD.send_invoice).toBe("Send the invoice and collect payment");
  });
  it("a draft Sales Invoice in the window asks to be SENT, not chased", () => {
    const r = build({ status: "draft", issued_at: null, control: { ...ready, confirmed_date: "2026-09-14" } });
    expect(r.timing.action).toBe("send_invoice");
  });
  it("the effective timing rule is the one in force on the invoice's issue day", () => {
    const rules = [
      { effectiveFrom: "2026-08-19", askDaysBefore: 3, deadlineDaysBefore: 2 },
      { effectiveFrom: "2026-09-10", askDaysBefore: 6, deadlineDaysBefore: 5 },
    ];
    // Issued 1 Sep → old rule (3·2): Fri 18 delivery → deadline Wed 16, ask Tue 15 → today none.
    const old = build({ issued_at: "2026-09-01T00:00:00Z", control: { ...ready, confirmed_date: "2026-09-18" } }, { timingRules: rules });
    expect(old.timing.kind).toBe("due_later");
    // Issued 10 Sep → new rule (6·5): deadline Sat 12 → Fri 11 = today.
    const fresh = build({ issued_at: "2026-09-10T00:00:00Z", control: { ...ready, confirmed_date: "2026-09-18" } }, { timingRules: rules });
    expect(fresh.timing.kind).toBe("due_today");
  });
});

describe("the row set — one row per SO that still needs money", () => {
  it("a paid SO leaves the Monitor; a voided-only SO makes no row; a partial stays open with the remainder", () => {
    const rows = paymentMonitorRows({
      invoices: [
        row({ id: "a", order_id: "o1", so: 1, paid: 1000 }),
        row({ id: "b", order_id: "o2", so: 2, status: "voided", voided_at: "2026-09-02T00:00:00Z" }),
        row({ id: "c", order_id: "o3", so: 3, paid: 400 }),
      ], cases: [], requests: [], todayIso: TODAY, opts: OPTS,
    });
    expect(rows.map((r) => r.so)).toEqual([3]);
    expect(rows[0]!.money.outstanding).toBe(600);
  });
  it("one SO with a Sales and a Storage row is ONE row whose Amount needed counts both", () => {
    const rows = paymentMonitorRows({
      invoices: [row({ id: "a", kind: "sales" }), row({ id: "b", kind: "storage", amount: 150 })],
      cases: [], requests: [], todayIso: TODAY, opts: OPTS,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.money.outstanding).toBe(1150);
    expect(rows[0]!.door.kind).toBe("sales");
  });
  it("a value nobody recorded stays, and says so", () => {
    const rows = paymentMonitorRows({
      invoices: [row({ lines: [{ sku: "A", qty: 1, unit_price: null }] })], cases: [], requests: [], todayIso: TODAY, opts: OPTS,
    });
    expect(rows[0]!.timing).toMatchObject({ kind: "value_unknown", fact: "Value not recorded" });
  });
  it("risk order: late first, then storage invoices, promises, due today, ask today, later", () => {
    const ready = { line_stock_status: { A: "ready" } };
    const rows = paymentMonitorRows({
      invoices: [
        row({ id: "later", order_id: "later", so: 5, control: { ...ready, confirmed_date: "2026-09-30" } }),
        row({ id: "late", order_id: "late", so: 1, control: { ...ready, confirmed_date: "2026-09-10" } }),
        row({ id: "today", order_id: "today", so: 3, control: { ...ready, confirmed_date: "2026-09-14" } }),
        row({ id: "ask", order_id: "ask", so: 4, control: { ...ready, confirmed_date: "2026-09-16" } }),
      ], cases: [], requests: [], todayIso: TODAY, opts: OPTS,
    });
    expect(rows.map((r) => r.so)).toEqual([1, 3, 4, 5]);
  });
});

describe("filters are facts, and summaries name the work", () => {
  const ready = { line_stock_status: { A: "ready" } };
  const rows = paymentMonitorRows({
    invoices: [
      row({ id: "late", order_id: "late", so: 1, control: { ...ready, confirmed_date: "2026-09-10" } }),
      row({ id: "today", order_id: "today", so: 3, control: { ...ready, confirmed_date: "2026-09-14" } }),
      row({ id: "wait", order_id: "wait", so: 4, control: { confirmed_date: "2026-09-30" } }),
      row({ id: "storage-s", order_id: "st", so: 6, kind: "sales", paid: 1000, control: { ...ready, confirmed_date: "2026-09-30" } }),
      row({ id: "storage-p", order_id: "st", so: 6, kind: "storage", amount: 200, paid: 1000, control: { ...ready, confirmed_date: "2026-09-30" } }),
      row({ id: "promise", order_id: "pr", so: 7, control: { ...ready, confirmed_date: "2026-09-30" } }),
    ], cases: [], requests: [], todayIso: TODAY, opts: OPTS,
    promisedByOrder: new Map([["pr", TODAY]]),
  });
  const pick = (key: Parameters<typeof monitorFilterMatch>[1]) =>
    rows.filter((r) => monitorFilterMatch(r, key)).map((r) => r.so);

  it("has the seven ruled filters, in order, and they are not tabs", () => {
    expect(MONITOR_FILTERS.map((f) => f.label)).toEqual([
      "Needs attention", "Ask customer today", "Promised today", "Should have been paid",
      "Waiting for goods", "Storage payments", "All unpaid",
    ]);
  });
  it("each filter answers its own fact", () => {
    expect(pick("needs_attention")).toEqual([1, 6, 7, 3]);
    expect(pick("ask_today")).toEqual([3]);
    expect(pick("promised_today")).toEqual([7]);
    expect(pick("should_have_paid")).toEqual([1]);
    expect(pick("waiting_goods")).toEqual([4]);
    expect(pick("storage_payments")).toEqual([6]);
    expect(pick("all_unpaid")).toHaveLength(5);
  });
  it("summaries are sentences that name the work — never `8 open · 2 late`", () => {
    expect(monitorSummaries(rows)).toEqual([
      "2 customer balances need collection today",
      "1 payment should have been received already",
      "1 storage payment needs collection",
    ]);
    expect(monitorSummaries([])).toEqual(["Nothing needs collection today"]);
    for (const s of monitorSummaries(rows)) expect(s).not.toMatch(/\bopen\b|·/);
  });
});
