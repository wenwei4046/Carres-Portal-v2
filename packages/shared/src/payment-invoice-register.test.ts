import { describe, expect, it } from "vitest";
import {
  invoiceCustomerDelivery,
  invoiceGoodsFacts,
  invoiceGoodsWord,
  invoiceNeeded,
  invoicePaymentTiming,
  type InvoiceRegisterRow,
} from "./payment-invoice-register";

function row(over: {
  paid?: number;
  lines?: Array<{ qty: number; unit_price: number }>;
  status?: string;
  delivered_at?: string | null;
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
    id: "i1", invoice_no: null, status: "draft", kind: "sales",
    amount: 1000, tax_amount: 0, issued_at: null, voided_at: null,
    void_reason: null, replaces_invoice_id: null, created_at: "2026-09-06T00:00:00Z",
    order_id: "o1",
    orders: {
      id: "o1", so: 1300, customer_name: "LIM KUAN YANG",
      status: over.status ?? "proceed_order",
      paid: over.paid ?? 0,
      delivery_date: over.delivery_date ?? null,
      delivery_date_tbd: over.delivery_date_tbd ?? false,
      delivered_at: over.delivered_at ?? null,
      order_lines: over.lines ?? [{ qty: 1, unit_price: 1000 }],
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

// A frozen clock — Fri 4 Sep 2026. Sundays off only, no holidays, so the
// working-day arithmetic is deterministic in the test.
const TODAY = "2026-09-04";
const OPTS = {};

describe("invoiceGoodsFacts / invoiceGoodsWord", () => {
  it("all lines ready reads Goods ready", () => {
    const r = row({ control: { line_stock_status: { A: "ready", B: "Ready" } } });
    expect(invoiceGoodsFacts(r).goodsReady).toBe(true);
    expect(invoiceGoodsWord(r)).toBe("Goods ready");
  });
  it("a delivered order is complete goods truth", () => {
    const r = row({ status: "delivered", delivered_at: "2026-09-01" });
    expect(invoiceGoodsWord(r)).toBe("Goods ready");
  });
  it("a waiting line with an ETA reads the §16 arriving spelling", () => {
    const r = row({ control: {
      line_stock_status: { A: "ready", B: "awaiting" },
      line_etas: { B: "2026-09-07" },
    } });
    expect(invoiceGoodsWord(r)).toBe("Arriving Monday, 7 Sep");
  });
  it("no readiness evidence reads Arrival not confirmed", () => {
    expect(invoiceGoodsWord(row())).toBe("Arrival not confirmed");
  });
  it("the latest waiting ETA wins", () => {
    const r = row({ control: {
      line_stock_status: { A: "awaiting", B: "awaiting" },
      line_etas: { A: "2026-09-07", B: "2026-09-10" },
    } });
    expect(invoiceGoodsFacts(r).arrivalIso).toBe("2026-09-10");
  });
});

describe("invoiceNeeded", () => {
  it("is the one orderMoney arithmetic over priced lines", () => {
    const m = invoiceNeeded(row({ paid: 400 }));
    expect(m.outstanding).toBe(600);
    expect(m.source).toBe("lines");
  });
  it("falls back to the keyed control balance when lines carry no prices", () => {
    const m = invoiceNeeded(row({ lines: [], control: { balance: 250 } }));
    expect(m.outstanding).toBe(250);
    expect(m.source).toBe("keyed");
  });
});

describe("invoiceCustomerDelivery", () => {
  it("the confirmed day outranks the requested day", () => {
    const d = invoiceCustomerDelivery(row({
      delivery_date: "2026-09-20", control: { confirmed_date: "2026-09-18" } }));
    expect(d).toEqual({ dateIso: "2026-09-18", word: "confirmed" });
  });
  it("TBD reads customer not sure", () => {
    expect(invoiceCustomerDelivery(row({ delivery_date_tbd: true })).word)
      .toBe("customer_not_sure");
  });
});

describe("invoicePaymentTiming", () => {
  it("settled money reads paid before anything else", () => {
    const { timing } = invoicePaymentTiming(row({ paid: 1000 }), TODAY, OPTS);
    expect(timing).toEqual({ kind: "paid" });
  });
  it("goods not ready and no usable arrival waits — no blind chase", () => {
    const { timing } = invoicePaymentTiming(
      row({ delivery_date: "2026-09-20" }), TODAY, OPTS);
    expect(timing).toEqual({ kind: "wait" });
  });
  it("ready goods with no delivery anchor has no clock", () => {
    const { timing } = invoicePaymentTiming(
      row({ control: { line_stock_status: { A: "ready" } } }), TODAY, OPTS);
    expect(timing).toEqual({ kind: "no_date" });
  });
  it("a future anchor gives the shared T−2 deadline", () => {
    const { timing, clock } = invoicePaymentTiming(
      row({ delivery_date: "2026-09-18", control: { line_stock_status: { A: "ready" } } }),
      TODAY, OPTS);
    expect(timing.kind).toBe("due");
    expect(timing).toEqual({ kind: "due", dueIso: clock.dueIso });
  });
  it("past the deadline while owing is already late", () => {
    const { timing } = invoicePaymentTiming(
      row({ delivery_date: "2026-09-04", control: { line_stock_status: { A: "ready" } } }),
      TODAY, OPTS);
    expect(timing).toEqual({ kind: "late" });
  });
  it("a delivered order with a balance stays collectible, not waiting", () => {
    const { timing } = invoicePaymentTiming(
      row({ status: "delivered", delivered_at: "2026-08-30", paid: 100 }), TODAY, OPTS);
    expect(timing.kind).not.toBe("wait");
  });
});
