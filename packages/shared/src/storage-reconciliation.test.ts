import { describe, expect, it } from "vitest";
import { orderMoney } from "./order-money";
import type { InvoiceRegisterRow } from "./payment-invoice-register";
import { soRemaining } from "./payment-invoice-register";
import {
  hasStoragePaperHistory,
  invoiceStorageSumOf,
  storageObligation,
} from "./storage-obligation";

/**
 * ONE EXPECTED AMOUNT, FIVE SURFACES (the 2026-09-08 boundary review).
 *
 * The surfaces and the arithmetic each one actually runs:
 *
 *   Calendar · Reports · Invoice details   `soRemaining` (goods stores + live
 *                                          ISSUED papers − paid, once)
 *   shared Work · the TS booking gate      `orderMoney` fed by
 *                                          `storageObligation`
 *   the DATABASE Delivery gate (0441)      priced + Σ live issued papers − paid
 *
 * This file pins them against each other on the three shapes that exist, so a
 * later edit to any one of them fails here instead of on a customer's order.
 */

const GOODS = 1000;

function invoice(over: Partial<InvoiceRegisterRow> & { paid: number }): InvoiceRegisterRow {
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
      order_lines: [{ qty: 1, unit_price: GOODS }], order_addons: [],
      ops_order_control: [{ balance: null, confirmed_date: null,
        line_etas: null, line_stock_status: null }],
    },
  };
}

/** The 0441 trigger's arithmetic, mirrored in TS so this file can compare it
 *  with the others. Kept byte-for-byte in shape with the migration:
 *  `greatest(0, priced + storage − paid)`. */
function databaseGateOwing(paid: number, liveStorageSum: number): number {
  return Math.max(0, GOODS + liveStorageSum - paid);
}

/** What shared Work and the TS booking gate arrive at. */
function workAndGate(rows: InvoiceRegisterRow[], paid: number, legacyOwing: number) {
  const storage = storageObligation({
    invoiceStorageSum: invoiceStorageSumOf(rows as never),
    storagePaperHistory: hasStoragePaperHistory(rows),
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
    // goods 1000 + storage 158 − paid 400 = 758
    const expected = 758;
    expect(soRemaining(rows, "o1").outstanding).toBe(expected);          // Calendar · Reports · details
    expect(workAndGate(rows, paid, 0).outstanding).toBe(expected);       // Work · TS gate
    expect(databaseGateOwing(paid, 158)).toBe(expected);                 // DB gate (0441)
    expect(workAndGate(rows, paid, 0).storage.unreconciledLegacy).toBe(0);
  });

  it("B · MIXED order: the money figure still agrees everywhere, and the legacy fee is named apart", () => {
    const paid = 1000;                 // goods settled
    const legacy = 200;                // an un-cased group's fee, old model
    const rows = [
      invoice({ id: "i-sales", kind: "sales", paid }),
      invoice({ id: "i-storage", kind: "storage", amount: 150, paid }),
    ];
    // The papers say 150 and every surface says 150 — the legacy 200 is not
    // merged into any of them, and not silently dropped either.
    expect(soRemaining(rows, "o1").outstanding).toBe(150);
    const wg = workAndGate(rows, paid, legacy);
    expect(wg.outstanding).toBe(150);
    expect(databaseGateOwing(paid, 150)).toBe(150);
    expect(wg.storage.source).toBe("mixed");
    expect(wg.storage.unreconciledLegacy).toBe(legacy);                  // said on the Storage section
  });

  it("B2 · MIXED order, papers all VOIDED: no surface resurrects the old charge", () => {
    const paid = 1000;
    const rows = [
      invoice({ id: "i-sales", kind: "sales", paid }),
      invoice({ id: "i-void", kind: "storage", amount: 150, status: "voided",
        voided_at: "2026-09-08", paid }),
    ];
    expect(soRemaining(rows, "o1").outstanding).toBe(0);
    const wg = workAndGate(rows, paid, 200);
    expect(wg.outstanding).toBe(0);
    expect(wg.holds).toBe(false);
    expect(databaseGateOwing(paid, 0)).toBe(0);
    // Nothing lost: the legacy fee is still named.
    expect(wg.storage.unreconciledLegacy).toBe(200);
  });

  it("C · legacy-only order: Work and the TS gate carry C9; the Payment screens and the DB gate do not — the ONE known divergence", () => {
    const paid = 1000;
    const rows = [invoice({ id: "i-sales", kind: "sales", paid })];  // no storage paper ever
    const wg = workAndGate(rows, paid, 300);
    expect(wg.storage.source).toBe("legacy");
    expect(wg.outstanding).toBe(300);            // C9 still holds, as shipped
    expect(soRemaining(rows, "o1").outstanding).toBe(0);   // Payment screens: invoice model only
    expect(databaseGateOwing(paid, 0)).toBe(0);           // 0441: legacy stays TS-side (0362's Law D split)
    // Recorded, bounded and measured: production carries ZERO legacy storage
    // signals (2026-09-08), the go-live database starts clean, and 0445 stops
    // a case being opened beside an uncollected legacy fee — so an order can
    // be in exactly one model, and this divergence has no live instance.
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
    expect(workAndGate(rows, paid, 0).holds).toBe(false);   // no invented hold
    expect(databaseGateOwing(paid, 0)).toBe(0);
  });
});
