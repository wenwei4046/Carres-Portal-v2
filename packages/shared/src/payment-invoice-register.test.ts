import { describe, expect, it } from "vitest";
import {
  invoiceCustomerDelivery,
  invoiceGoodsFacts,
  invoiceGoodsWord,
  invoiceNeeded,
  invoicePaymentTiming,
  soRemaining,
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

describe("soRemaining — the SO across every live invoice kind", () => {
  /** The meaningful fixture: one SO carrying all three kinds, a partial
   *  payment and a voided obligation. Goods RM 1,000; live issued Storage
   *  RM 150 + RM 8 tax; a VOIDED Additional Storage RM 100 (dead); a DRAFT
   *  additional storage RM 60 (asks nothing yet); paid RM 400. */
  const so = (): InvoiceRegisterRow[] => [
    { ...row({ paid: 400 }), id: "i-sales", kind: "sales", status: "issued",
      issued_at: "2026-09-01" },
    { ...row({ paid: 400 }), id: "i-storage", kind: "storage", status: "issued",
      issued_at: "2026-09-02", amount: 150, tax_amount: 8 },
    { ...row({ paid: 400 }), id: "i-extra-void", kind: "additional_storage",
      status: "voided", issued_at: "2026-09-02", voided_at: "2026-09-03",
      amount: 100 },
    { ...row({ paid: 400 }), id: "i-extra-draft", kind: "additional_storage",
      status: "draft", amount: 60 },
  ];
  it("the Sales door does not hide the storage obligation, paid subtracts ONCE", () => {
    // 1000 goods + 158 live storage − 400 paid = 758. Never 600 (storage
    // omitted), never 858 (the voided obligation revived), never 918 (the
    // draft charged), never 508 (paid subtracted from goods AND storage).
    expect(soRemaining(so(), "o1")).toEqual({
      known: true, outstanding: 758, storageOwing: 158, overpaid: 0,
    });
  });
  it("a payment larger than goods spills into storage instead of inflating it", () => {
    const rows = so().map((r) => ({
      ...r, orders: r.orders ? { ...r.orders, paid: 1100 } : r.orders,
    }));
    // 1000 + 158 − 1100 = 58: the customer who paid past the goods value has
    // that excess honoured against storage — the clamp-goods-first shape
    // would have said 158.
    expect(soRemaining(rows, "o1")).toMatchObject({ outstanding: 58, overpaid: 0 });
    // Past EVERY obligation the excess is the §5 review money, said as such.
    const over = so().map((r) => ({
      ...r, orders: r.orders ? { ...r.orders, paid: 1300 } : r.orders,
    }));
    expect(soRemaining(over, "o1")).toMatchObject({ outstanding: 0, overpaid: 142 });
  });
  it("a keyed (imported) order adds storage to the keyed outstanding", () => {
    const keyed = so().map((r) => ({
      ...r,
      orders: r.orders ? { ...r.orders, paid: 0, order_lines: [] } : r.orders,
      ...(r.id === "i-sales" ? {} : {}),
    })).map((r) => ({
      ...r,
      orders: r.orders ? {
        ...r.orders,
        ops_order_control: [{ ...r.orders.ops_order_control[0], balance: 500 }],
      } : r.orders,
    }));
    expect(soRemaining(keyed, "o1").outstanding).toBe(658);
  });
  it("a correction in flight asks nothing — §2 exactly, no draft-debt rule", () => {
    const rows = [
      { ...row({ paid: 400 }), id: "i-sales", kind: "sales", status: "issued" },
      // The correction in flight: voided RM150 with a draft replacement RM150.
      { ...row({ paid: 400 }), id: "i-void", kind: "storage", status: "voided",
        voided_at: "2026-09-06", amount: 150 },
      { ...row({ paid: 400 }), id: "i-replacement", kind: "storage", status: "draft",
        amount: 150, replaces_invoice_id: "i-void" },
    ] as InvoiceRegisterRow[];
    // §2: outstanding = ISSUED live obligations − paid. During void → reissue
    // the paper is in flight and not asked; the voided one is dead and never
    // double-counted. Continuity is the lifecycle's (billed_through_period
    // never rolls back; the replacement is there to ISSUE) — not a reader
    // inventing debt from a draft.
    expect(soRemaining(rows, "o1")).toMatchObject({ outstanding: 600, storageOwing: 0 });
  });
  it("the timing's paid check is the SO across kinds when the rows are given", () => {
    // Goods fully paid, storage RM150 issued, delivery confirmed and past —
    // WITH the rows the SO is not `paid`; without them the goods answer stands.
    const rows = [
      { ...row({ paid: 1000, control: { confirmed_date: "2026-09-01",
        line_stock_status: { A: "ready" } } }), id: "i-sales", kind: "sales", status: "issued" },
      { ...row({ paid: 1000, control: { confirmed_date: "2026-09-01",
        line_stock_status: { A: "ready" } } }), id: "i-storage", kind: "storage",
        status: "issued", amount: 150 },
    ] as InvoiceRegisterRow[];
    expect(invoicePaymentTiming(rows[0], TODAY, OPTS).timing.kind).toBe("paid");
    expect(invoicePaymentTiming(rows[0], TODAY, OPTS, rows).timing.kind).not.toBe("paid");
  });
  it("an unpriced SO stays honestly unknown, and an absent SO answers nothing", () => {
    const unknown = so().map((r) => ({
      ...r, orders: r.orders ? { ...r.orders, order_lines: [] } : r.orders,
    }));
    expect(soRemaining(unknown, "o1").known).toBe(false);
    expect(soRemaining(so(), "o-else")).toEqual({
      known: false, outstanding: 0, storageOwing: 0, overpaid: 0,
    });
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
