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
import { onPoOf, promiseBroken } from "./sales-order-facts";

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

describe("the default row — amended 2026-08-11", () => {
  it("SO No · Customer · Items · Current · Total · Balance · Promised · Ordered", () => {
    expect(DEFAULT_COLUMNS).toEqual([
      "so",
      "customer",
      "items",
      "current",
      "total",
      "balance",
      "promised",
      "ordered",
    ]);
  });

  /* THE AMENDMENT'S OWN PROPERTY, and the reason it is not a preference:
     permanent screen space is earned by frequency and decision value, so the
     row must have got NARROWER while saying MORE. If a later card widens the
     default row past what Stage 1 spent, this fails and asks why. */
  it("the operator's default row is narrower than Stage 1's, and carries the lifecycle pointer", () => {
    const px = (k: string) =>
      parseFloat(REGISTER_FIELDS.find((f) => f.key === k)!.width);
    const opsRow = REGISTER_FIELDS.filter((f) => defaultOnFor(f, "operation"));
    const opsWidth = opsRow.reduce((s, f) => s + parseFloat(f.width), 0);

    /* Stage 1's operator row: the nine minus the two money columns. */
    const stage1Width =
      px("so") + px("customer") + px("items") + px("promised") + px("ordered") +
      px("dealer") + px("showroom");

    expect(opsRow.map((f) => f.key)).toEqual([
      "so", "customer", "items", "current", "promised", "ordered",
    ]);
    expect(opsWidth).toBeLessThan(stage1Width);
  });

  it("Dealer and Showroom keep their catalog entry — demoted, never deleted", () => {
    for (const key of ["dealer", "showroom"]) {
      const f = REGISTER_FIELDS.find((x) => x.key === key)!;
      expect(f.group).toBe("Source");
      expect(f.on).toBeUndefined();
    }
  });
});

describe("FIX 2 · Current is a DOCUMENT pointer", () => {
  /* FIX 2's substance — `Current` belongs to DOCUMENT, never to OPERATION —
     is what this pins. Its position inside the group moved when it became a
     DEFAULT column, because a default column leads its group. */
  it("Current sits in DOCUMENT, and leads it as the group's default column", () => {
    const doc = REGISTER_FIELDS.filter((f) => f.group === "Document").map((f) => f.key);
    expect(doc).toEqual(["so", "current", "source_ref", "do_number", "invoice_no"]);
    expect(REGISTER_FIELDS.find((f) => f.key === "current")!.group).not.toBe("Operation");
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

  /* 🔴 THE DEFECT REPAIR, 2026-08-11 — held so it cannot come back.
     `PO issued` asked `order_supplier_threads[].po_id` and nothing else. That
     field is written 0 times in 76 on the live wire; D1's `po_skus` is written
     19 and the import's `source_po` 37. The column measured 1% filled — it was
     promoted to the default row on the assumption it said something, and it
     said nothing. Each rung below is a field somebody actually writes. */
  it("PO issued reads EVERY field that proves a purchase order — po_skus and source_po included", () => {
    expect(currentOf(order({ po_skus: ["M1401F-K"] }))).toBe("PO issued");
    expect(
      currentOf(
        order({ order_lines: [{ sku: "M1401F-K", qty: 1, source_po: "PO-2051" }] }),
      ),
    ).toBe("PO issued");
  });

  it("a document still outranks a PO, and an empty order still says nothing", () => {
    expect(currentOf(order({ po_skus: ["M1401F-K"], invoice_no: "INV-1" }))).toBe("INV INV-1");
    expect(currentOf(order({ po_skus: [] }))).toBe("");
    expect(currentOf(order({ po_skus: undefined }))).toBe("");
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
 * AMENDMENT 2026-08-11 — the two facts the amendment added, held as law.
 * Both are RECORD FACTS. Neither may ever grow a verb: what to DO about a
 * broken promise or an unbought line belongs to Work (SO V2 Cards 9/10).
 * ─────────────────────────────────────────────────────────────────────────── */

describe("promiseBroken — the promise, judged against an INJECTED day", () => {
  const TODAY = "2026-08-11";

  it("a promised day that has passed on undelivered goods is broken", () => {
    expect(promiseBroken(order({ delivery_date: "2026-08-10" }), TODAY)).toBe(true);
  });

  it("today itself is not yet broken — the day is not over", () => {
    expect(promiseBroken(order({ delivery_date: TODAY }), TODAY)).toBe(false);
  });

  it("DELIVERED never reads as broken, however old the promise", () => {
    expect(
      promiseBroken(order({ delivery_date: "2026-01-01", status: "delivered" }), TODAY),
    ).toBe(false);
    expect(
      promiseBroken(
        order({ delivery_date: "2026-01-01", operation_stage: "delivered" }),
        TODAY,
      ),
    ).toBe(false);
  });

  it("a promise with NO DATE ON IT cannot be broken — tbd or null alike", () => {
    expect(promiseBroken(order({ delivery_date: null }), TODAY)).toBe(false);
    expect(
      promiseBroken(order({ delivery_date: "2026-01-01", delivery_date_tbd: true }), TODAY),
    ).toBe(false);
  });
});

describe("onPoOf — is this line bought? and the blank has ONE meaning", () => {
  const line = { sku: "M1401F-K", qty: 1 };

  it("the line's own PO number wins — it is the most specific record", () => {
    expect(onPoOf(order({ po_skus: [] }), { ...line, source_po: "PO-2051" })).toBe("PO-2051");
  });

  it("D1's po_skus answers with the string this repository already ships", () => {
    expect(onPoOf(order({ po_skus: ["M1401F-K"] }), line)).toBe("PO issued");
    expect(onPoOf(order({ po_skus: ["M1401F-K"] }), line)).toBe(
      currentOf(
        order({
          order_supplier_threads: [
            { po_id: "po-1" } as operationOrderListRow["order_supplier_threads"][number],
          ],
        }),
      ),
    );
  });

  it("nothing proving a PO covers the line reads blank — and a pre-D1 Worker lands on the SAME blank, never an accusation", () => {
    expect(onPoOf(order({ po_skus: ["OTHER-SKU"] }), line)).toBe("");
    expect(onPoOf(order({ po_skus: undefined }), line)).toBe("");
  });
});
