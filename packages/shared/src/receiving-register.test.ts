import { describe, expect, it } from "vitest";
import {
  buildReceivingRegister,
  receivingDateRail,
  type ReceivingRegisterInput,
} from "./receiving-register";

const BASE: ReceivingRegisterInput = {
  today: "2026-08-31",
  holidays: ["2026-08-31"],
  sources: [{
    id: "PO-1001",
    kind: "purchase_order",
    version: 2,
    issuedAt: "2026-08-20T02:00:00.000Z",
    supplier: "Ohana",
    deliverTo: "Carres Klang",
    poDeliveryDate: "2026-09-02",
    lines: [{ id: "line-1", sku: "MS01-K", orderQty: 10, receivedQty: 4 }],
  }],
  supplierPromises: [],
  sessions: [{
    id: "receipt-1",
    sourceId: "PO-1001",
    grnNumber: "GRN-20260831-0001",
    goodsReceivedAt: "2026-08-29T03:00:00.000Z",
    supplierDoNo: "DO-55",
    lines: [{
      poLineId: "line-1",
      sku: "MS01-K",
      receivedQty: 4,
      damagedQty: 1,
      wrongItemQty: 1,
      extraQty: 1,
      unitIds: ["U1", "U2", "U3", "U4", "U5", "U6", "U7"],
    }],
  }],
};

describe("one Receiving Register projection", () => {
  it("keeps PO balance as the parent and the physical session/GRN as its child", () => {
    const result = buildReceivingRegister(BASE);
    expect(result.parents).toHaveLength(1);
    expect(result.parents[0]).toMatchObject({
      sourceNumber: "PO-1001",
      poIssuedAt: "2026-08-20T02:00:00.000Z",
      supplier: "Ohana",
      deliverTo: "Carres Klang",
      poDeliveryDate: "2026-09-02",
      supplierDeliveryDate: "2026-09-02",
      sameAsPo: true,
      orderQty: 10,
      receivedQty: 4,
      damagedQty: 1,
      wrongItemQty: 1,
      extraQty: 1,
      pendingDeliveryQty: 6,
      lines: [expect.objectContaining({ id: "line-1", sku: "MS01-K", orderQty: 10, receivedQty: 4 })],
    });
    expect(result.parents[0]?.children[0]).toMatchObject({
      id: "receipt-1",
      grnNumber: "GRN-20260831-0001",
      goodsReceivedAt: "2026-08-29T03:00:00.000Z",
      supplierDoNo: "DO-55",
      receivedQty: 4,
      damagedQty: 1,
      wrongItemQty: 1,
      extraQty: 1,
      unitIds: ["U1", "U2", "U3", "U4", "U5", "U6", "U7"],
    });
  });

  it("uses the latest supplier answer without rewriting the PO Delivery Date", () => {
    const result = buildReceivingRegister({
      ...BASE,
      supplierPromises: [
        { sourceId: "PO-1001", deliveryDate: "2026-09-03", recordedAt: "2026-08-28T02:00:00Z" },
        { sourceId: "PO-1001", deliveryDate: "2026-09-05", recordedAt: "2026-08-29T02:00:00Z" },
      ],
    });
    expect(result.parents[0]).toMatchObject({
      poDeliveryDate: "2026-09-02",
      supplierDeliveryDate: "2026-09-05",
      sameAsPo: false,
      receivingDate: "2026-09-05",
    });
  });

  it("returns six real Warehouse work dates and explicit zero counts", () => {
    const rail = receivingDateRail("2026-08-31", [], ["2026-08-31"]);
    expect(rail.map((r) => r.key)).toEqual([
      "late",
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
      "2026-09-04",
      "2026-09-05",
      "2026-09-07",
      "later",
      "none",
    ]);
    expect(rail.every((r) => r.count === 0)).toBe(true);
  });

  it("sorts late first and filters late, dated, later and no-date balances", () => {
    const sources = [
      { ...BASE.sources[0]!, id: "PO-LATE", poDeliveryDate: "2026-08-30" },
      { ...BASE.sources[0]!, id: "PO-DATE", poDeliveryDate: "2026-09-02" },
      { ...BASE.sources[0]!, id: "PO-LATER", poDeliveryDate: "2026-09-20" },
      { ...BASE.sources[0]!, id: "PO-NONE", poDeliveryDate: null },
    ];
    const all = buildReceivingRegister({ ...BASE, sources, sessions: [] });
    expect(all.parents.map((p) => p.sourceNumber)).toEqual([
      "PO-LATE", "PO-DATE", "PO-LATER", "PO-NONE",
    ]);
    expect(buildReceivingRegister({ ...BASE, sources, sessions: [], filter: "late" }).parents)
      .toHaveLength(1);
    expect(buildReceivingRegister({ ...BASE, sources, sessions: [], filter: "2026-09-02" }).parents[0]?.sourceNumber)
      .toBe("PO-DATE");
    expect(buildReceivingRegister({ ...BASE, sources, sessions: [], filter: "later" }).parents[0]?.sourceNumber)
      .toBe("PO-LATER");
    expect(buildReceivingRegister({ ...BASE, sources, sessions: [], filter: "none" }).parents[0]?.sourceNumber)
      .toBe("PO-NONE");
  });
});
