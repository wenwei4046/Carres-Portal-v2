import { describe, expect, it } from "vitest";
import { orderMoney } from "./order-money";
import type { InvoiceRegisterRow } from "./payment-invoice-register";
import { soRemaining } from "./payment-invoice-register";
import { invoiceStorageSumOf, storageObligation } from "./storage-obligation";

/**
 * ONE EXPECTED AMOUNT, FIVE SURFACES (2026-09-08, corrected).
 *
 *   Calendar · Reports · Invoice details   `soRemaining` (goods stores + live
 *                                          ISSUED papers + the legacy C9 fee)
 *   shared Work · the TS booking gate      `orderMoney` ← `storageObligation`
 *   the DATABASE Delivery gate (0447)      priced + Σ live issued papers
 *                                          + the KEYED legacy ladder − paid
 *
 * The pure-legacy divergence the review refused to accept is CLOSED here: a
 * legacy-only order now reads the same on every surface. The one remaining,
 * deliberate split is 0362's own: the legacy ACCRUAL (a `storage_from` walk
 * with no keyed figure) stays TS-side, because its date walk and catalog
 * lookup do not belong in a trigger — pinned by its own case below.
 */

const GOODS = 1000;

function invoice(over: Partial<InvoiceRegisterRow> & { paid: number; legacy?: number }): InvoiceRegisterRow {
  return {
    id: over.id ?? "i1", invoice_no: "INV-1", status: over.status ?? "issued",
    kind: over.kind ?? "sales",
    amount: over.amount ?? GOODS, tax_amount: over.tax_amount ?? 0,
    issued_at: "2026-09-06", voided_at: over.voided_at ?? null,
    void_reason: null, replaces_invoice_id: over.replaces_invoice_id ?? null,
    created_at: "2026-09-06T00:00:00Z", order_id: "o1",
    orders: {
      id: "o1", so: 1319, customer_name: "LIM KUAN YANG",
      status: "proceed_order", paid: over.paid,
      delivery_date: null, delivery_date_tbd: false, delivered_at: null,
      legacy_storage_owing: over.legacy ?? 0,
      order_lines: [{ qty: 1, unit_price: GOODS }], order_addons: [],
      ops_order_control: [{ balance: null, confirmed_date: null,
        line_etas: null, line_stock_status: null }],
    },
  };
}

/** The 0447 trigger's arithmetic mirrored in TS so this file can compare it.
 *  SQL behaviour itself is proven by the rolled-back production probe on the
 *  real `ops_delivery_orders` door — a TS mirror is never that proof. */
function databaseGateOwing(paid: number, liveStorageSum: number, keyedLegacy = 0): number {
  return Math.max(0, GOODS + liveStorageSum - paid) + keyedLegacy;
}

function workAndGate(rows: InvoiceRegisterRow[], paid: number, legacyOwing: number) {
  const storage = storageObligation({
    invoiceStorageSum: invoiceStorageSumOf(rows as never),
    goodsTotal: GOODS,
    paid,
    legacyOwing,
    legacyReleased: false,
  });
  const money = orderMoney({ lineSum: GOODS, paid, storageOwing: storage.owing });
  return { outstanding: money.outstanding, holds: money.holds, storage };
}

describe("one expected amount across every surface", () => {
  it("A · invoice-only order: all five agree", () => {
    const paid = 400;
    const rows = [
      invoice({ id: "i-sales", kind: "sales", paid }),
      invoice({ id: "i-storage", kind: "storage", amount: 150, tax_amount: 8, paid }),
    ];
    const expected = 758;                                   // 1000 + 158 − 400
    expect(soRemaining(rows, "o1").outstanding).toBe(expected);
    expect(workAndGate(rows, paid, 0).outstanding).toBe(expected);
    expect(databaseGateOwing(paid, 158)).toBe(expected);
    expect(workAndGate(rows, paid, 0).storage.unreconciledLegacy).toBe(0);
  });

  it("B · MIXED order: both obligations count, each once, on every surface", () => {
    const paid = 1000;                 // goods settled
    const legacy = 200;
    const rows = [
      invoice({ id: "i-sales", kind: "sales", paid, legacy }),
      invoice({ id: "i-storage", kind: "storage", amount: 150, paid, legacy }),
    ];
    const expected = 350;                                   // 150 papers + 200 C9
    expect(soRemaining(rows, "o1").outstanding).toBe(expected);
    const wg = workAndGate(rows, paid, legacy);
    expect(wg.outstanding).toBe(expected);
    expect(databaseGateOwing(paid, 150, legacy)).toBe(expected);
    expect(wg.storage.source).toBe("mixed");
    expect(wg.storage.unreconciledLegacy).toBe(legacy);     // named, and INCLUDED
  });

  it("B2 · papers all VOIDED: a correction forgives nothing, and the C9 fee still stands", () => {
    const paid = 1000;
    const legacy = 200;
    const rows = [
      invoice({ id: "i-sales", kind: "sales", paid, legacy }),
      invoice({ id: "i-void", kind: "storage", amount: 150, status: "voided",
        voided_at: "2026-09-08", paid, legacy }),
    ];
    // §4: a void is the CORRECTION path. It waives nothing, so the papers ask
    // nothing until a replacement is ISSUED — and the C9 fee, cleared only by
    // collection or an override of 0, is still owed on every surface.
    expect(soRemaining(rows, "o1").outstanding).toBe(legacy);
    expect(workAndGate(rows, paid, legacy).outstanding).toBe(legacy);
    expect(databaseGateOwing(paid, 0, legacy)).toBe(legacy);
  });

  it("C · PURE LEGACY order: every surface now agrees — the divergence is closed", () => {
    const paid = 1000;
    const legacy = 300;
    const rows = [invoice({ id: "i-sales", kind: "sales", paid, legacy })];
    expect(soRemaining(rows, "o1").outstanding).toBe(legacy);   // Payment screens
    const wg = workAndGate(rows, paid, legacy);
    expect(wg.outstanding).toBe(legacy);                        // Work · TS gate
    expect(wg.holds).toBe(true);
    expect(databaseGateOwing(paid, 0, legacy)).toBe(legacy);    // DB gate (0447)
    expect(wg.storage.source).toBe("legacy");
  });

  it("C2 · the ONE deliberate split: a legacy ACCRUAL with no keyed figure stays TS-side", () => {
    const paid = 1000;
    const accrual = 150;   // storage_from walked; no override, no imported pair
    const rows = [invoice({ id: "i-sales", kind: "sales", paid, legacy: accrual })];
    // Payment screens and Work carry it (both read the shared storageHold)…
    expect(soRemaining(rows, "o1").outstanding).toBe(accrual);
    expect(workAndGate(rows, paid, accrual).outstanding).toBe(accrual);
    // …and the trigger does not, because 0362 deliberately left the date walk
    // and its catalog lookup out of SQL. That split is recorded law, not drift.
    expect(databaseGateOwing(paid, 0, 0)).toBe(0);
  });

  it("D · a correction in flight changes nothing anywhere — no draft debt", () => {
    const paid = 1000;
    const rows = [
      invoice({ id: "i-sales", kind: "sales", paid }),
      invoice({ id: "i-void", kind: "storage", amount: 150, status: "voided",
        voided_at: "2026-09-08", paid }),
      invoice({ id: "i-replacement", kind: "storage", amount: 150, status: "draft",
        replaces_invoice_id: "i-void", paid }),
    ];
    expect(soRemaining(rows, "o1").outstanding).toBe(0);
    expect(workAndGate(rows, paid, 0).outstanding).toBe(0);
    expect(workAndGate(rows, paid, 0).holds).toBe(false);
    expect(databaseGateOwing(paid, 0)).toBe(0);
  });

  it("E · a NEVER-ISSUED draft erases nothing — the legacy fee still stands", () => {
    const paid = 1000;
    const legacy = 200;
    const rows = [
      invoice({ id: "i-sales", kind: "sales", paid, legacy }),
      invoice({ id: "i-fresh-draft", kind: "storage", amount: 150, status: "draft",
        paid, legacy }),
    ];
    expect(soRemaining(rows, "o1").outstanding).toBe(legacy);
    expect(workAndGate(rows, paid, legacy).outstanding).toBe(legacy);
    expect(databaseGateOwing(paid, 0, legacy)).toBe(legacy);
  });
});
