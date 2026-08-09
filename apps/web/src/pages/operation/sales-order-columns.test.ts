/**
 * STAGE 1 — the register's catalog, tested as LAW:
 *   · the default row is the card's nine, in the card's order
 *   · every field sits in one of the card's eight chooser groups
 *   · role defaults: Operations opens money-hidden, Finance money-visible
 *   · the money columns carry a footer sum (AutoCount's power)
 *   · a blank never carries two meanings (the money sentences)
 */
import { describe, expect, it } from "vitest";
import type { operationOrderListRow } from "@/lib/queries";
import {
  buildRegisterRow,
  currentOf,
  DEFAULT_COLUMNS,
  defaultOnFor,
  moneyText,
  REGISTER_FIELDS,
} from "./sales-order-columns";

const order = (over: Partial<operationOrderListRow> = {}): operationOrderListRow =>
  ({
    id: "o-1",
    so: 1301,
    status: "proceed_order",
    operation_stage: "confirmed",
    warehouse_id: null,
    customer_name: "Tan Mei Ling",
    customer_phone: "012-345 6789",
    placed_at: "2026-08-01T02:00:00Z",
    delivery_date: "2026-08-29",
    delivery_date_tbd: false,
    delivery_partner_id: null,
    request_for_delivery_at: null,
    partner_accepted_at: null,
    partner_rejected_at: null,
    partner_rejected_reason: null,
    delivery_partners: null,
    do_number: null,
    dispatched_at: null,
    delivered_at: null,
    outlet_id: null,
    dealer_id: "d-1",
    dealers: { name: "Carres HQ" },
    order_supplier_threads: [],
    order_annotations: [],
    paid: 500,
    order_lines: [{ sku: "M1401F-K", qty: 1, unit_price: 2500, label: "Jager · King" }],
    order_addons: [],
    ...over,
  }) as operationOrderListRow;

describe("the default row is Stage 1's nine, in Stage 1's order", () => {
  it("SO No · Customer · Items · Total · Balance · Promised · Ordered · Dealer · Showroom", () => {
    expect(DEFAULT_COLUMNS).toEqual([
      "so",
      "customer",
      "items",
      "total",
      "balance",
      "promised",
      "ordered",
      "dealer",
      "showroom",
    ]);
  });
});

describe("FIX 2 · Current is a DOCUMENT pointer", () => {
  it("the DOCUMENT group reads SO No · Customer reference · Current · DO No · Invoice No", () => {
    const doc = REGISTER_FIELDS.filter((f) => f.group === "Document").map((f) => f.key);
    expect(doc).toEqual(["so", "source_ref", "current", "do_number", "invoice_no"]);
  });
});

describe("the chooser is grouped — Stage 1's eight, no field outside them", () => {
  it("every field carries one of the eight groups", () => {
    const groups = new Set(REGISTER_FIELDS.map((f) => f.group));
    for (const g of groups) {
      expect([
        "Document",
        "Customer",
        "Source",
        "Items",
        "Money",
        "Dates",
        "Delivery",
        "Operation",
      ]).toContain(g);
    }
  });
});

describe("role defaults — defaultHidden is NOT permission, only the first paint", () => {
  it("Operations opens with money hidden; the money columns stay in the catalog", () => {
    const money = REGISTER_FIELDS.filter((f) => f.on && f.group === "Money");
    expect(money.length).toBeGreaterThan(0);
    for (const f of money) {
      expect(defaultOnFor(f, "operation")).toBe(false);
      expect(defaultOnFor(f, "finance")).toBe(true);
      expect(defaultOnFor(f, "principal")).toBe(true);
    }
  });
  it("the non-money defaults open for every role", () => {
    for (const f of REGISTER_FIELDS.filter((x) => x.on && x.group !== "Money")) {
      expect(defaultOnFor(f, "operation")).toBe(true);
      expect(defaultOnFor(f, "finance")).toBe(true);
    }
  });
});

describe("footer totals — the money columns sum, nothing else does", () => {
  it("Total · Paid · Balance carry footerSum", () => {
    const withSum = REGISTER_FIELDS.filter((f) => f.footerSum).map((f) => f.key);
    expect(withSum.sort()).toEqual(["balance", "paid", "total"]);
  });
  it("a settled or unpriced state adds zero to the sum", () => {
    const r = buildRegisterRow(order({ paid: 3000 })); // total 2500, paid 3000 → settled
    const balance = REGISTER_FIELDS.find((f) => f.key === "balance")!;
    expect(balance.footerSum!(r)).toBe(0);
  });
});

describe("a blank never carries two meanings", () => {
  it("owed prints the number, settled 'Paid in full', unpriced 'No price yet'", () => {
    const owed = buildRegisterRow(order());
    expect(owed.balance).toEqual({ kind: "amount", value: 2000 });
    const settled = buildRegisterRow(order({ paid: 2500 }));
    expect(moneyText(settled.balance)).toBe("Paid in full");
    const unpriced = buildRegisterRow(
      order({ order_lines: [{ sku: "X", qty: 1, unit_price: 0 }] }),
    );
    expect(moneyText(unpriced.balance)).toBe("No price yet");
  });
});

describe("Current — the derived lifecycle pointer never invents a document", () => {
  it("prefers Invoice, then DO, then Delivered, then PO issued, else nothing", () => {
    expect(currentOf(order({ invoice_no: "INV-1" }))).toBe("INV INV-1");
    expect(currentOf(order({ do_number: "DO-9" }))).toBe("DO DO-9");
    expect(currentOf(order({ status: "delivered" }))).toBe("Delivered");
    expect(
      currentOf(
        order({
          order_supplier_threads: [
            { po_id: "po-1" } as operationOrderListRow["order_supplier_threads"][number],
          ],
        }),
      ),
    ).toBe("PO issued");
    expect(currentOf(order())).toBe("");
  });
});
