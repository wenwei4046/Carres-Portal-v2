/**
 * STAGE 1 — the register's catalog, tested as LAW:
 *   · the default row is the owner's EIGHT, in the owner's order
 *   · every field sits in one of the card's eight chooser groups
 *   · role defaults: Operations opens money-hidden, Finance money-visible
 *   · the money columns carry a footer sum (AutoCount's power)
 *   · a blank never carries two meanings (the money sentences)
 */
import { describe, expect, it } from "vitest";
import type { operationOrderListRow } from "@/lib/queries";
import {
  buildRegisterRow,
  DEFAULT_COLUMNS,
  defaultOnFor,
  moneyText,
  MUTED_ABSENCES,
  NO_DATE_YET,
  NOT_GIVEN,
  NOT_RECORDED,
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

describe("the default row is the owner's EIGHT, in the owner's order", () => {
  it("SO No · Ordered · Customer Delivery · Customer · Delivery Location · Showroom · PO No · DO No", () => {
    expect(DEFAULT_COLUMNS).toEqual([
      "so",
      "ordered",
      "customer_delivery",
      "customer",
      "delivery_location",
      "showroom",
      "po_number",
      "do_number",
    ]);
  });

  /* `Showroom` was promoted, not invented — it has been a declaration in this
     catalog since Stage 1. The register may never grow a writer for it. */
  it("Showroom READS the Sales-ownership fact the order already carries", () => {
    const showroom = REGISTER_FIELDS.find((f) => f.key === "showroom")!;
    expect(showroom.group).toBe("Sales ownership");
    /* The cell prints the PLACE (owner ruling 2026-08-15): every showroom is
     * ours and the column already says `Showroom`, so the house name only
     * clipped the part that identifies the branch. Display only — the outlet's
     * registered name is untouched, and `Deliver To` deliberately keeps its
     * `Carres ` because there it separates our warehouse from a partner's. */
    expect(showroom.text(buildRegisterRow(order({ outlets: { name: "Carres Kelana Jaya" } })))).toBe(
      "Kelana Jaya",
    );
    /* A showroom without the prefix is printed as it stands, never stripped
     * into nothing. */
    expect(showroom.text(buildRegisterRow(order({ outlets: { name: "Kepong" } })))).toBe("Kepong");
    expect(showroom.text(buildRegisterRow(order({ outlets: null })))).toBe(NOT_RECORDED);
  });

  /* An absence is quieter than a fact — the page mutes exactly these two and
     never `No delivery date`, which heads a governed two-line action. */
  it("mutes `Not recorded` and `Not given`, and only those", () => {
    expect(MUTED_ABSENCES.has(NOT_RECORDED)).toBe(true);
    expect(MUTED_ABSENCES.has(NOT_GIVEN)).toBe(true);
    expect(MUTED_ABSENCES.has(NO_DATE_YET)).toBe(false);
    expect(MUTED_ABSENCES.size).toBe(2);
  });
});
describe("FIX 2 · Current is a DOCUMENT pointer", () => {
  it("the DOCUMENT group reads SO No · Customer reference · Current · DO No · Invoice No", () => {
    const doc = REGISTER_FIELDS.filter((f) => f.group === "Document").map((f) => f.key);
    expect(doc).toContain("so");
    expect(doc).toContain("po_number");
    expect(doc).toContain("do_number");
    expect(doc).not.toContain("current");
  });
});

describe("the chooser is grouped — Stage 1's eight, no field outside them", () => {
  it("every field carries one of the eight groups", () => {
    const groups = new Set(REGISTER_FIELDS.map((f) => f.group));
    for (const g of groups) {
      expect([
        "Document",
        "Customer",
        "Sales ownership",
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
    const money = REGISTER_FIELDS.filter((f) => f.group === "Money");
    expect(money.length).toBeGreaterThan(0);
    for (const f of money) {
      expect(defaultOnFor(f, "operation")).toBe(false);
      expect(defaultOnFor(f, "finance")).toBe(false);
      expect(defaultOnFor(f, "principal")).toBe(false);
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
