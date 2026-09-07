import { describe, expect, it } from "vitest";
import { orderMoney } from "./order-money";
import { invoiceStorageSumOf, storageObligation } from "./storage-obligation";

describe("storageObligation — one precedence law, subtract once", () => {
  it("invoice-backed storage WINS over a keyed legacy fee — never both", () => {
    const r = storageObligation({
      invoiceStorageSum: 158, goodsTotal: 1000, paid: 0,
      legacyOwing: 300, legacyReleased: false,
    });
    expect(r).toMatchObject({ owing: 158, gross: 158, source: "invoices" });
  });
  it("paid past the goods value spills into storage instead of leaving a stale hold", () => {
    // goods 1000 · storage 158 · paid 1100 → total out 58, goods out 0.
    const r = storageObligation({
      invoiceStorageSum: 158, goodsTotal: 1000, paid: 1100,
      legacyOwing: 0, legacyReleased: false,
    });
    expect(r.owing).toBe(58);
    // And through the gate's own orderMoney the outstanding is EXACT:
    const money = orderMoney({ lineSum: 1000, paid: 1100, storageOwing: r.owing });
    expect(money.outstanding).toBe(58);
    expect(money.holds).toBe(true);
  });
  it("a fully paid SO leaves NO stale storage hold in the gate", () => {
    const r = storageObligation({
      invoiceStorageSum: 158, goodsTotal: 1000, paid: 1158,
      legacyOwing: 0, legacyReleased: false,
    });
    expect(r.owing).toBe(0);
    const money = orderMoney({ lineSum: 1000, paid: 1158, storageOwing: r.owing });
    expect(money.outstanding).toBe(0);
    expect(money.holds).toBe(false);
  });
  it("partial payment holds the remainder — both goods and storage", () => {
    const r = storageObligation({
      invoiceStorageSum: 150, goodsTotal: 1000, paid: 400,
      legacyOwing: 0, legacyReleased: false,
    });
    expect(r.owing).toBe(150);
    const money = orderMoney({ lineSum: 1000, paid: 400, storageOwing: r.owing });
    expect(money.outstanding).toBe(750);
    expect(money.holds).toBe(true);
  });
  it("with NO storage paper the legacy C9 answer passes through byte-identical", () => {
    const r = storageObligation({
      invoiceStorageSum: 0, goodsTotal: 1000, paid: 5000,
      legacyOwing: 200, legacyReleased: false,
    });
    // NOT netted against paid — C9's clearing fact is collected_at, not paid.
    expect(r).toMatchObject({ owing: 200, gross: 200, source: "legacy" });
  });
  it("the C9 release flag passes through on both sources and clears nothing", () => {
    const inv = storageObligation({
      invoiceStorageSum: 150, goodsTotal: 1000, paid: 1000,
      legacyOwing: 0, legacyReleased: true,
    });
    expect(inv).toMatchObject({ owing: 150, released: true });
    const money = orderMoney({
      lineSum: 1000, paid: 1000, storageOwing: inv.owing, storageReleased: inv.released,
    });
    // Released lifts the HOLD, never the debt (C9) — the shipped TS behaviour.
    expect(money.outstanding).toBe(150);
    expect(money.holding).toBe(0);
  });
  it("no paper and no legacy fee is honestly nothing", () => {
    expect(storageObligation({
      invoiceStorageSum: 0, goodsTotal: 1000, paid: 0,
      legacyOwing: 0, legacyReleased: false,
    })).toMatchObject({ owing: 0, source: "none" });
  });
});

describe("invoiceStorageSumOf — §2 exactly", () => {
  it("issued live storage papers count with tax; drafts, voids and sales do not", () => {
    expect(invoiceStorageSumOf([
      { kind: "storage", status: "issued", amount: 150, tax_amount: 8, voided_at: null },
      { kind: "additional_storage", status: "issued", amount: 200, tax_amount: 0, voided_at: null },
      // §2: a draft asks nothing — even a replacement draft (no draft-debt rule).
      { kind: "storage", status: "draft", amount: 999, tax_amount: 0, voided_at: null },
      { kind: "additional_storage", status: "voided", amount: 100, tax_amount: 0, voided_at: "2026-09-01" },
      { kind: "sales", status: "issued", amount: 5000, tax_amount: 0, voided_at: null },
    ])).toBe(358);
    expect(invoiceStorageSumOf(null)).toBe(0);
  });
});
