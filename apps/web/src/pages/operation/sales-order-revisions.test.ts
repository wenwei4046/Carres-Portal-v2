import { describe, expect, it } from "vitest";
import type { SalesOrderSnapshot } from "@/lib/queries";
import { describeRevisionChanges } from "./sales-order-revisions";

const snap = (over: Partial<SalesOrderSnapshot>): SalesOrderSnapshot => ({
  header: {
    customer_name: "Kimmy",
    delivery_date: "2026-08-30",
    delivery_floor: 1,
    ...((over.header as Record<string, unknown>) ?? {}),
  },
  lines: over.lines ?? [
    { id: "l1", sku: "B1201S-K", qty: 1, unit_price: 2499, description: "B1201S (King)" },
  ],
  addons: over.addons ?? [],
});

describe("describeRevisionChanges — + added · − removed · old → new", () => {
  it("Rev 1 is the original, one sentence", () => {
    expect(describeRevisionChanges(null, snap({}))).toEqual([
      "Original — the agreement as first recorded",
    ]);
  });

  it("a moved promise reads old → new, in the register's date words", () => {
    const out = describeRevisionChanges(
      snap({}),
      snap({ header: { customer_name: "Kimmy", delivery_date: "2026-09-05", delivery_floor: 1 } }),
    );
    expect(out).toEqual(["Promised delivery: Sun, 30 Aug 26 → Sat, 5 Sep 26"]);
  });

  it("added / removed / qty lines carry their signs", () => {
    const out = describeRevisionChanges(
      snap({}),
      snap({
        lines: [
          { id: "l1", sku: "B1201S-K", qty: 2, unit_price: 2499, description: "B1201S (King)" },
          { id: "l2", sku: "TRION-Q", qty: 1, unit_price: 1999, description: "Trion (Queen)" },
        ],
      }),
    );
    expect(out).toContain("B1201S (King): ×1 → ×2");
    expect(out).toContain("+ added Trion (Queen) ×1");
    const removed = describeRevisionChanges(snap({}), snap({ lines: [] }));
    expect(removed).toEqual(["− removed B1201S (King) ×1"]);
  });

  it("a cleared field prints the em-dash, not a blank", () => {
    const out = describeRevisionChanges(
      snap({ header: { customer_name: "Kimmy", customer_phone: "019-1", delivery_date: "2026-08-30", delivery_floor: 1 } }),
      snap({ header: { customer_name: "Kimmy", customer_phone: null, delivery_date: "2026-08-30", delivery_floor: 1 } }),
    );
    expect(out).toEqual(["Phone: 019-1 → —"]);
  });

  it("keeps the instalment plan in complete historical versions", () => {
    const out = describeRevisionChanges(
      snap({ header: { customer_name: "Kimmy", delivery_date: "2026-08-30", delivery_floor: 1, installment_months: 6 } }),
      snap({ header: { customer_name: "Kimmy", delivery_date: "2026-08-30", delivery_floor: 1, installment_months: 12 } }),
    );
    expect(out).toEqual(["Instalment plan: 6 months → 12 months"]);
  });
});
