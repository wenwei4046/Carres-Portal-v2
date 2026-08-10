/**
 * 3.1 · GATE 1 held as tests: two allowlists, NO residue, UNKNOWN blocks.
 */
import { describe, expect, it } from "vitest";
import {
  CLASS_A_FIELDS,
  CLASS_B_FIELDS,
  EXECUTION_FIELDS,
  TEST3_FIELDS,
  classify,
} from "./sales-order-classification";
import { SALES_ORDER_WRITABLE_COLUMNS } from "./sales-order-columns.snapshot";

describe("GATE 1 · exhaustiveness — every writable column is classified, no residue", () => {
  it("every column of orders · order_lines · order_addons appears in exactly one list", () => {
    const unplaced: string[] = [];
    const doubled: string[] = [];
    for (const [table, cols] of Object.entries(SALES_ORDER_WRITABLE_COLUMNS)) {
      for (const col of cols) {
        const key = `${table}.${col}`;
        const homes = [
          CLASS_A_FIELDS.has(key),
          CLASS_B_FIELDS.has(key),
          EXECUTION_FIELDS.has(key),
        ].filter(Boolean).length;
        if (homes === 0) unplaced.push(key);
        if (homes > 1) doubled.push(key);
      }
    }
    expect(
      unplaced,
      `UNCLASSIFIED column(s) — GATE 1: classify before it ships: ${unplaced.join(", ")}`,
    ).toEqual([]);
    expect(doubled, `column(s) in TWO lists: ${doubled.join(", ")}`).toEqual([]);
  });

  it("no registry entry points at a column the schema does not have", () => {
    const known = new Set(
      Object.entries(SALES_ORDER_WRITABLE_COLUMNS).flatMap(([t, cols]) =>
        cols.map((c) => `${t}.${c}`),
      ),
    );
    const ghosts = [
      ...[...CLASS_A_FIELDS].filter((f) => !known.has(f)),
      ...[...CLASS_B_FIELDS].filter((f) => !known.has(f)),
      ...[...EXECUTION_FIELDS.keys()].filter((f) => !known.has(f)),
    ];
    expect(ghosts, `registry entries with no column: ${ghosts.join(", ")}`).toEqual([]);
  });

  it("TEST3 is a subset of B — never promoted to A (GATE 1, verbatim)", () => {
    for (const f of TEST3_FIELDS) {
      expect(CLASS_B_FIELDS.has(f), `${f} must be Class B`).toBe(true);
      expect(CLASS_A_FIELDS.has(f), `${f} must NOT be Class A`).toBe(false);
    }
  });
});

describe("classify() — lists only, no analogy, unknown blocks", () => {
  it("a promise move is Class A; a phone fix is Class B", () => {
    expect(classify(["delivery_date"])).toEqual({
      class: "A",
      fields: ["orders.delivery_date"],
      requiresTest3: false,
      unknown: [],
    });
    expect(classify(["customer_phone"]).class).toBe("B");
  });

  it("ANY A field makes a mixed change Class A", () => {
    const c = classify(["customer_phone", "order_lines"]);
    expect(c.class).toBe("A");
    expect(c.unknown).toEqual([]);
  });

  it("attribution fires Test 3 and stays Class B", () => {
    const c = classify(["salesperson_id"]);
    expect(c).toMatchObject({ class: "B", requiresTest3: true, unknown: [] });
  });

  it("an execution fact is UNKNOWN → the caller must block (GATE 5 trap)", () => {
    expect(classify(["do_number"]).unknown).toEqual(["orders.do_number"]);
    expect(classify(["invoice_no"]).unknown).toEqual(["orders.invoice_no"]);
  });

  it("a name nobody classified is UNKNOWN — no fallback, in any form", () => {
    expect(classify(["warranty_term"]).unknown).toEqual(["orders.warranty_term"]);
  });
});
