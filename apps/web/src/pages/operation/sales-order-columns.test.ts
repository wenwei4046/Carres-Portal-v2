/**
 * STAGE 1 — the register's catalog, tested as LAW:
 *   · the default row is the owner's ELEVEN, in the owner's order (2026-09-21)
 *   · every field sits in one of the card's eight chooser groups
 *   · role defaults: Operations opens money-hidden, Finance money-visible
 *   · the money columns carry a footer sum (AutoCount's power)
 *   · a blank never carries two meanings (the money sentences)
 */
import { describe, expect, it } from "vitest";
import type { operationOrderListRow } from "@/lib/queries";
import { fmtDate } from "@/lib/fmt-date";
import { REGISTER_FIELD_WIDTH } from "@/components/register/register-field-widths";
import {
  buildRegisterRow,
  DEFAULT_COLUMNS,
  defaultOnFor,
  moneyText,
  MUTED_ABSENCES,
  NO_DATE_YET,
  NO_DO_YET,
  NO_PO_YET,
  NOT_IN_CATALOG,
  NOT_RECORDED,
  REGISTER_FIELDS,
  registerItemsSummary,
  requestedDeliveryOf,
  requestedDeliveryText,
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

describe("the default row is the owner's ELEVEN, in the owner's order (2026-09-21)", () => {
  it("Proceed Date · SO Doc Date · SO No · Sales Location · Salesperson · Customer Requested Delivery Date · Customer Delivery Location · Customer · Items · PO No · DO No", () => {
    expect(DEFAULT_COLUMNS).toEqual([
      "proceeded",
      "ordered",
      "so",
      "sales_location",
      "salesperson",
      "customer_delivery",
      "delivery_location",
      "customer",
      "items",
      "po_number",
      "do_number",
    ]);
    expect(DEFAULT_COLUMNS.map((k) => REGISTER_FIELDS.find((f) => f.key === k)!.label)).toEqual([
      "Proceed Date",
      "SO Doc Date",
      "SO No",
      "Sales Location",
      "Salesperson",
      "Customer Requested Delivery Date",
      "Customer Delivery Location",
      "Customer",
      "Items",
      "PO No",
      "DO No",
    ]);
  });

  it("Proceed Date is the ACTUAL handoff (proceeded_at), never the planned proceed_date", () => {
    const f = REGISTER_FIELDS.find((x) => x.key === "proceeded")!;
    const row = buildRegisterRow(
      order({ proceeded_at: "2026-08-03T04:00:00Z", proceed_date: "2026-09-30" }),
    );
    expect(f.text(row)).toBe(fmtDate("2026-08-03T04:00:00Z"));
    expect(f.iso!(row)).toBe("2026-08-03T04:00:00Z");
  });

  /* `Sales Location` (owner ruling 2026-09-21: "showroom is sales location")
     READS the Sales-ownership facts the order already carries — the outlet,
     else the dealer, in full, exactly as the SO PDF prints it. */
  it("Sales Location is the outlet, else the dealer, printed in full", () => {
    const f = REGISTER_FIELDS.find((x) => x.key === "sales_location")!;
    expect(f.group).toBe("Sales ownership");
    expect(f.text(buildRegisterRow(order({ outlets: { name: "Carres Kelana Jaya" } })))).toBe(
      "Carres Kelana Jaya",
    );
    expect(
      f.text(buildRegisterRow(order({ outlets: null, dealers: { name: "Home Living Sdn Bhd" } }))),
    ).toBe("Home Living Sdn Bhd");
    expect(
      f.text(buildRegisterRow(order({ outlets: { name: "  " }, dealers: { name: "Home Living" } }))),
    ).toBe("Home Living");
  });

  /* ⭐ A REQUIRED FACT PRINTS NO ABSENCE WORD (owner ruling 2026-09-21). An
     empty one is a system error fixed at its source, not a state of the order. */
  it("the nine required facts never print Not recorded, To be confirmed or No delivery date", () => {
    const empty = buildRegisterRow(
      order({
        proceeded_at: null,
        outlets: null,
        dealers: null,
        salespersons: null,
        delivery_date: null,
        delivery_date_tbd: true,
        customer_address_city: null,
        customer_address_state: null,
      }),
    );
    const banned = [NOT_RECORDED, NO_DATE_YET, "To be confirmed", "Date to be confirmed"];
    for (const key of ["proceeded", "sales_location", "salesperson", "customer_delivery", "delivery_location"]) {
      const text = REGISTER_FIELDS.find((f) => f.key === key)!.text(empty);
      for (const word of banned) expect(text).not.toContain(word);
    }
  });

  it("a document that does not exist yet reads No PO yet · No DO yet", () => {
    const row = buildRegisterRow(order({ po_numbers: [] }), []);
    expect(REGISTER_FIELDS.find((f) => f.key === "po_number")!.text(row)).toBe(NO_PO_YET);
    expect(REGISTER_FIELDS.find((f) => f.key === "do_number")!.text(row)).toBe(NO_DO_YET);
  });

  it("Items is {first item} + {n} more, named by the catalog, never the SKU when it is known", () => {
    const o = order({
      order_lines: [
        { sku: "CODY-SK", qty: 1, unit_price: 1, attrs: {} },
        { sku: "PILLOW-1", qty: 2, unit_price: 1, attrs: {} },
      ] as operationOrderListRow["order_lines"],
    });
    expect(registerItemsSummary(o, (sku) => (sku === "CODY-SK" ? "Cody" : undefined))).toBe("Cody + 1 more");
    expect(registerItemsSummary(order())).toBe("Jager · King");
  });

  /* An absence is quieter than a fact: the muted set is the dictionary's
     words for a thing that is not there, and never a required fact. */
  it("mutes the absence words, and only them", () => {
    expect(MUTED_ABSENCES.has(NOT_RECORDED)).toBe(true);
    expect(MUTED_ABSENCES.has(NO_PO_YET)).toBe(true);
    expect(MUTED_ABSENCES.has(NO_DO_YET)).toBe(true);
    expect(MUTED_ABSENCES.has(NO_DATE_YET)).toBe(false);
    expect(MUTED_ABSENCES.has(NOT_IN_CATALOG)).toBe(true);
    expect(MUTED_ABSENCES.size).toBe(4);
  });

  it("every width is a registry entry — the catalog types no pixel number", () => {
    const registry = new Set(Object.values(REGISTER_FIELD_WIDTH));
    for (const f of REGISTER_FIELDS) {
      expect(typeof f.width).toBe("number");
      expect(registry.has(f.width as never)).toBe(true);
    }
    expect(REGISTER_FIELDS.find((f) => f.key === "sales_location")!.width).toBe(REGISTER_FIELD_WIDTH.salesLocation);
    expect(REGISTER_FIELDS.find((f) => f.key === "salesperson")!.width).toBe(REGISTER_FIELD_WIDTH.salesperson);
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

/**
 * POS PARITY COLUMNS (2026-08-24) — race · gender · birthday · stair carry.
 *
 * The till asks for all four at SO creation (0200 demographics, 0104 stair
 * carry) and the DETAIL route always served them — but the register's list
 * never carried them, so a fact the customer was asked for could not be read
 * back on the one screen the office browses. Added as ordinary optional
 * columns: OFF by default (no `on:`), in the chooser like every other, so the
 * owner-ruled default view is untouched.
 */
describe("POS parity columns — the register can show what the till asked", () => {
  const byKey = (k: string) => REGISTER_FIELDS.find((f) => f.key === k)!;

  it("all four exist, in their honest groups, hidden by default", () => {
    for (const k of ["race", "gender", "birthday"]) {
      expect(byKey(k)).toBeTruthy();
      expect(byKey(k).group).toBe("Customer");
      expect(byKey(k).on).toBeUndefined(); // default OFF — the ruled view holds
    }
    // Stair carry is a DELIVERY fact — it sits with Floor and Lift, where the
    // operator planning the trip looks, not under Customer.
    expect(byKey("stair_items").group).toBe("Delivery");
    expect(byKey("stair_items").on).toBeUndefined();
  });

  it("values render; absence renders the dictionary word, never a blank", () => {
    const r = buildRegisterRow(
      order({
        customer_race: "Chinese",
        customer_gender: "F",
        customer_birthday: "1990-04-12",
        delivery_stair_items: 3,
      }),
    );
    expect(byKey("race").text(r)).toBe("Chinese");
    expect(byKey("gender").text(r)).toBe("F");
    expect(byKey("birthday").text(r)).toBe("1990-04-12");
    expect(byKey("stair_items").text(r)).toBe("3");

    const bare = buildRegisterRow(order({}));
    expect(byKey("race").text(bare)).toBe(NOT_RECORDED);
    expect(byKey("gender").text(bare)).toBe(NOT_RECORDED);
    expect(byKey("birthday").text(bare)).toBe(NOT_RECORDED);
    expect(byKey("stair_items").text(bare)).toBe(NOT_RECORDED);
  });

  it("ZERO stair items is a recorded fact, not an absence", () => {
    // `0` means "asked, and the answer was none" — rendering it as NOT_RECORDED
    // would erase a real answer. Only null/undefined is absence.
    const r = buildRegisterRow(order({ delivery_stair_items: 0 }));
    expect(byKey("stair_items").text(r)).toBe("0");
  });
});

/**
 * ONE STORED COLUMN, THREE PRINTED CELLS.
 *
 * `customer_emergency` joins name, phone and relationship into one string. The
 * register printed that string raw, so a cell read `mei . 019-7378283 . Spouse`
 * - the dot-separated schema dump COPY-STANDARD bans, and three facts an
 * operator could neither filter nor sort apart.
 *
 * `RegisterField.text` is the ONE string that is printed, filtered, sorted AND
 * exported, so a second line is not available and would not help: three facts
 * want three columns.
 */
describe("Emergency contact is three columns, not one crammed cell", () => {
  const byKey = (k: string) => REGISTER_FIELDS.find((f) => f.key === k)!;
  const withEmergency = (v: string | null) =>
    buildRegisterRow(order({ customer_emergency: v }));

  it("splits a composed value into name, phone and relationship", () => {
    const r = withEmergency("mei · 019-7378283 · Spouse");
    expect(byKey("emergency").text(r)).toBe("mei");
    expect(byKey("emergency_phone").text(r)).toBe("019-7378283");
    expect(byKey("emergency_relationship").text(r)).toBe("Spouse");
  });

  it("no cell still carries the joined string", () => {
    const r = withEmergency("mei · 019-7378283 · Spouse");
    for (const key of ["emergency", "emergency_phone", "emergency_relationship"]) {
      expect(byKey(key).text(r)).not.toContain("019-7378283 · Spouse");
    }
  });

  it("an absent contact reads as words in all three", () => {
    const r = withEmergency(null);
    expect(byKey("emergency").text(r)).toBe("Not recorded");
    expect(byKey("emergency_phone").text(r)).toBe("Not recorded");
    expect(byKey("emergency_relationship").text(r)).toBe("Not recorded");
  });

  it("a legacy string nobody composed is kept WHOLE, never chopped", () => {
    // `parseEmergencyContact` puts anything it did not write into `name`, so an
    // imported note survives intact instead of losing its tail to a split.
    const r = withEmergency("call the son first, he answers");
    expect(byKey("emergency").text(r)).toBe("call the son first, he answers");
    expect(byKey("emergency_phone").text(r)).toBe("Not recorded");
  });

  it("a relationship containing the separator keeps its tail", () => {
    const r = withEmergency("Ali · 012-3456789 · Friend · from work");
    expect(byKey("emergency_relationship").text(r)).toBe("Friend · from work");
  });
});

/**
 * "SAME AS DELIVERY" IS AN ANSWER, NOT A BLANK.
 *
 * `customer_billing` is empty by design whenever the customer ticked
 * `Billing address same as delivery`. The column printed `Not recorded` on
 * every one of those orders - which reads as "nobody asked" when the truth is
 * "asked, and the answer was: the same address".
 */
describe("Billing address reads the same-as-delivery flag", () => {
  const byKey = (k: string) => REGISTER_FIELDS.find((f) => f.key === k)!;
  const bill = (over: Partial<operationOrderListRow>) =>
    byKey("billing").text(buildRegisterRow(order(over)));

  it("prints the delivery address when billing is the same", () => {
    expect(
      bill({
        customer_billing_same: true,
        customer_billing: null,
        customer_address: "12 Jalan Ampang, 50450 Kuala Lumpur",
      }),
    ).toBe("12 Jalan Ampang, 50450 Kuala Lumpur");
  });

  it("prints the separate billing address when it is NOT the same", () => {
    expect(
      bill({
        customer_billing_same: false,
        customer_billing: "8 Jalan Bangsar, 59100 Kuala Lumpur",
        customer_address: "12 Jalan Ampang, 50450 Kuala Lumpur",
      }),
    ).toBe("8 Jalan Bangsar, 59100 Kuala Lumpur");
  });

  it("still reads as absent when the flag is set and there is no address either", () => {
    // The governed `Address not given yet` case - nothing IS recorded, so the
    // honest cell says so rather than inheriting a blank and calling it an answer.
    expect(bill({ customer_billing_same: true, customer_billing: null, customer_address: null }))
      .toBe("Not recorded");
  });

  it("an older Worker that never sends the flag keeps the old reading", () => {
    // `customer_billing_same` is optional on the wire; absent must not be read
    // as `true` and silently swap in a delivery address nobody asked for.
    expect(bill({ customer_billing: null, customer_address: "12 Jalan Ampang" }))
      .toBe("Not recorded");
  });
});

describe("Requested Delivery Date — ONE arithmetic, ONE spelling", () => {
  it("a named day is the day", () => {
    expect(requestedDeliveryOf({ delivery_date: "2026-09-10", delivery_date_tbd: false })).toEqual({
      iso: "2026-09-10",
      tbd: false,
    });
  });

  it("`to be confirmed` hides the stored day — the customer has not settled one", () => {
    expect(requestedDeliveryOf({ delivery_date: "2026-09-10", delivery_date_tbd: true })).toEqual({
      iso: null,
      tbd: true,
    });
  });

  it("nothing asked for is neither a date nor `to be confirmed`", () => {
    expect(requestedDeliveryOf({ delivery_date: null, delivery_date_tbd: false })).toEqual({
      iso: null,
      tbd: false,
    });
  });

  it("⭐ the three states print three different words, and never share one", () => {
    const day = requestedDeliveryText({ iso: "2026-09-10", tbd: false });
    const tbd = requestedDeliveryText({ iso: null, tbd: true });
    const none = requestedDeliveryText({ iso: null, tbd: false });
    expect(day).toBe(fmtDate("2026-09-10"));
    expect(tbd).toBe("To be confirmed");
    expect(none).toBe("No delivery date");
    expect(new Set([day, tbd, none]).size).toBe(3);
  });

  it("uses no banned absence word", () => {
    for (const banned of ["TBD", "Not available", "N/A", "-", "Pending"]) {
      expect(requestedDeliveryText({ iso: null, tbd: true })).not.toBe(banned);
      expect(requestedDeliveryText({ iso: null, tbd: false })).not.toBe(banned);
    }
  });
});
