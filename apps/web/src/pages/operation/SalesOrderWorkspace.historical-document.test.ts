import { describe, expect, it } from "vitest";
import { snapshotTemplateData } from "./SalesOrderWorkspace";
import type { SalesOrderTemplateData } from "@/lib/pdf/types";

/**
 * ⭐ AN OLD VERSION NEVER BORROWS TODAY'S SIGNATURE — APPROVED / LOCKED, owner
 * ruling 2026-09-22 (`docs/orders/MASTER.md` § "Old versions and signatures"):
 *
 *   "A signature belongs to the exact version and document the customer signed;
 *    a new unsigned version says it is unsigned and never borrows the old
 *    signature."
 *
 * THE CONTROL THIS TEST IS BUILT AROUND. Before the fix, `snapshotTemplateData`
 * read `base?.signed` and `base?.signature_url` — the live order's eSign PNG —
 * so printing Rev 1 and Rev 3 produced two different sets of goods, prices and
 * dates under one identical customer signature. Revert those two lines and the
 * first test here goes red; that is what makes it a guard rather than a
 * restatement.
 *
 * WHY IT PRINTS UNSIGNED RATHER THAN THE RIGHT SIGNATURE. `sales_order_snapshot`
 * stores no signing fact, and `orders` carries `signature_url` with no capture
 * timestamp (`pod_signed_at` is Delivery's proof of delivery — a different act).
 * Which revision a stored signature covers is therefore unprovable from what is
 * recorded, so the enforceable half of the rule is the half that ships: never
 * claim a signature the record cannot place.
 */

/** A live order that IS signed — the exact condition that used to leak. */
const SIGNED_BASE = {
  so_number: "SO-1319",
  issue_date: "2026-08-01",
  order_id: "ord-1",
  order_code: "SO-1319",
  status_label: "Proceed",
  channel: "dealer",
  customer: { name: "LIM KUAN YANG", address: "1 Jalan Test", phone: "0100000000", email: null, emergency: null },
  dealer: { name: "Carres", contact: null, address: null, outlet_name: null, outlet_address: null, salesperson_name: null, salesperson_phone: null },
  delivery: { date: "2026-09-10", floor: 1, has_lift: false },
  lines: [],
  addons: [],
  payments: [{ id: "p1", amount: 1999.5 }],
  vouchers: [],
  subtotal: 4130,
  tax_amount: 0,
  total: 4130,
  paid: 1999.5,
  balance_due: 2130.5,
  currency: "MYR",
  signed: true,
  signature_url: "https://storage.example/esign/ord-1.png",
} as unknown as SalesOrderTemplateData;

/** Rev 2's photograph: different goods from the live order, no signing fact —
 *  because the snapshot has never stored one. */
const REV2_SNAPSHOT = {
  header: {
    so: 1319,
    customer_name: "LIM KUAN YANG",
    customer_address: "1 Jalan Test",
    delivery_date: "2026-09-24",
    proceed_date: "2026-08-05",
    placed_at: "2026-08-01T02:00:00.000Z",
  },
  lines: [
    { id: "l1", sku: "B1201S-K", qty: 2, unit_price: 1890, attrs: null, description: "Mattress (King)" },
  ],
  addons: [{ addon_key: "delivery_fee", qty: 1, unit_price: 250, attrs: null }],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

describe("a historical Sales Order version's document", () => {
  it("prints UNSIGNED even when the live order carries a signature", () => {
    const doc = snapshotTemplateData(REV2_SNAPSHOT, SIGNED_BASE);
    expect(doc.signed).toBe(false);
    expect(doc.signature_url).toBeNull();
  });

  /* The leak had a shape: the SAME url on every version. This asserts the url
     cannot travel, not merely that one field is false. */
  it("never carries the live order's signature url onto any revision", () => {
    const rev1 = snapshotTemplateData({ ...REV2_SNAPSHOT, lines: [] }, SIGNED_BASE);
    const rev2 = snapshotTemplateData(REV2_SNAPSHOT, SIGNED_BASE);
    for (const doc of [rev1, rev2]) {
      expect(doc.signature_url).not.toBe(SIGNED_BASE.signature_url);
      expect(JSON.stringify(doc)).not.toContain("esign/ord-1.png");
    }
  });

  /* THE PHOTOGRAPH IS STILL THE PHOTOGRAPH. Removing the signature must not
     quietly remove the version's own truth — the goods, the money they add up
     to and the promised date all come from the snapshot, not from today. */
  it("still prints THAT version's goods, total and promised date", () => {
    const doc = snapshotTemplateData(REV2_SNAPSHOT, SIGNED_BASE);
    expect(doc.lines).toHaveLength(1);
    expect(doc.lines[0]).toMatchObject({ sku: "B1201S-K", qty: 2, unit_price: 1890 });
    // 2 × 1890 goods + 250 service = 4030, NOT the live order's 4130.
    expect(doc.subtotal).toBe(4030);
    expect(doc.total).toBe(4030);
    expect(doc.delivery.date).toBe("2026-09-24");
    expect(doc.so_number).toBe("SO-1319");
  });

  /* ⚠️ MEASURED GAP, ASSERTED AS IT IS RATHER THAN AS IT SHOULD BE. The money
     still rides from the live base, so `balance_due` is this version's goods
     minus TODAY's payments — a figure that described no real moment. Payments
     owns the money and the snapshot stores none, so the honest fix is a stored
     historical position, not a second arithmetic on this page. This test pins
     the CURRENT behaviour so the day it is fixed, it is fixed deliberately and
     this expectation changes with it. */
  it("KNOWN GAP: the money still comes from today, not from the version", () => {
    const doc = snapshotTemplateData(REV2_SNAPSHOT, SIGNED_BASE);
    expect(doc.paid).toBe(1999.5);
    expect(doc.balance_due).toBe(4030 - 1999.5);
  });
});
