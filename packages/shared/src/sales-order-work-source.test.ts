import { describe, expect, it } from "vitest";
import { openOrderActions } from "./order-actions";
import { salesOrderActionSignalsFromFacts } from "./sales-order-work-source";

describe("Sales Order Work source mapping", () => {
  it("uses PO coverage and booking facts without inventing a universal owner", () => {
    const signals = salesOrderActionSignalsFromFacts({
      status: "proceed_order",
      operationStage: "in_production",
      lines: [{ sku: "SOFA-1", qty: 1 }],
      availableBySku: { "SOFA-1": 0 },
      purchaseOrderSkus: [],
      stockEtaByLine: null,
      stockStatusByLine: null,
      deliveryDate: "2026-09-20",
      deliveryDateTbd: false,
      logisticsAssigned: false,
      bookingStage: null,
      confirmedDate: null,
      deliveryOrderNumber: null,
      deliveryPhotos: [],
      lineTotal: 1000,
      addonTotal: 0,
      paid: 0,
      storageOwing: 0,
      delayDecision: null,
      delayDecisionEta: null,
      today: "2026-09-06",
      safetyDays: 3,
    });

    expect(openOrderActions(signals).map((item) => item.key)).toContain("issue_po");
    expect(signals.moneyOwing).toBe(true);
    expect(signals.hasLogistics).toBe(false);
  });

  it("treats absent stock evidence as unknown rather than ready", () => {
    const signals = salesOrderActionSignalsFromFacts({
      status: "proceed_order",
      operationStage: "confirmed",
      lines: [{ sku: "AUTOCOUNT TEXT", qty: 1 }],
      availableBySku: null,
      purchaseOrderSkus: null,
      stockEtaByLine: null,
      stockStatusByLine: null,
      deliveryDate: null,
      deliveryDateTbd: true,
      logisticsAssigned: false,
      bookingStage: null,
      confirmedDate: null,
      deliveryOrderNumber: undefined,
      deliveryPhotos: undefined,
      lineTotal: null,
      addonTotal: null,
      paid: null,
      storageOwing: 0,
      delayDecision: null,
      delayDecisionEta: null,
      today: "2026-09-06",
      safetyDays: null,
    });
    expect(signals.goodsReady).toBe(false);
    expect(signals.moneyOwing).toBe(false);
    expect(signals.deliveryOrderIssued).toBeNull();
  });
});

