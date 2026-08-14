import { describe, expect, it } from "vitest";
import { resolveSalesOrderRoute, type SalesOrderRouteInput } from "./sales-order-route";

const input = (): SalesOrderRouteInput => ({
  order: {
    id: "order-1",
    so: 1318,
    placedAt: "2026-08-01T03:00:00Z",
    deliveryDate: "2026-08-20",
    doNumber: "DO-130826-0031",
    dispatchedAt: "2026-08-13T02:00:00Z",
    deliveredAt: null,
    invoiceNo: "INV-1318",
  },
  revisions: [1, 2],
  lineLabels: { "BED-A": "Cloud Bed", "SOFA-B": "Haven Sofa" },
  allocation: {
    orderId: "order-1",
    soRef: "SO-1318",
    lines: [
      {
        sku: "BED-A",
        committedQty: 1,
        reservedUnits: [],
        soldUnits: [{
          id: "unit-bed",
          unitCode: "id-bed000001",
          sku: "BED-A",
          status: "sold",
          condition: "new",
          warehouseId: "wh-1",
          poNo: "PO-8001",
          qty: 1,
          dateIn: "2026-08-10",
          soldAt: "2026-08-13T04:00:00Z",
        }],
        reservedQty: 0,
        soldQty: 1,
        outstandingQty: 0,
      },
      {
        sku: "SOFA-B",
        committedQty: 2,
        reservedUnits: [{
          id: "unit-sofa",
          unitCode: "id-sofa00001",
          sku: "SOFA-B",
          status: "reserved",
          condition: "new",
          warehouseId: "wh-2",
          poNo: "PO-8002",
          qty: 1,
          dateIn: "2026-08-12",
        }],
        soldUnits: [],
        reservedQty: 1,
        soldQty: 0,
        outstandingQty: 1,
      },
    ],
    unmatchedUnits: [],
    totals: { committedQty: 3, reservedQty: 1, soldQty: 1, outstandingQty: 1 },
  },
  purchaseOrders: [
    {
      id: "PO-8001",
      currentFact: "Fully received",
      etaDate: "2026-08-10",
      supplierDoNumber: "SDO-81",
      lines: [{ sku: "BED-A", qty: 1, receivedQty: 1 }],
    },
    {
      id: "PO-8002",
      currentFact: "In production at supplier",
      etaDate: "2026-08-18",
      supplierDoNumber: null,
      lines: [{ sku: "SOFA-B", qty: 2, receivedQty: 1 }],
    },
  ],
  receivingRecords: [],
  delivery: {
    booking: { date: "2026-08-15", slot: "10:00–12:00", partnerName: "Amy Logistics" },
    attempts: [
      {
        id: "attempt-1",
        attemptNo: 1,
        result: "failed",
        reason: "Customer unavailable",
        doNumber: "DO-130826-0031",
        scheduledDate: "2026-08-13",
        recordedAt: "2026-08-13T05:00:00Z",
      },
    ],
  },
  money: { known: true, total: 4500, paid: 3000, outstanding: 1500 },
  refunds: [{ id: "refund-1", amount: 200, status: "approved", requestedAt: "2026-08-12" }],
  loans: [{
    id: "loan-1",
    label: "Display sofa",
    status: "returned",
    source: "supplier",
    loanNoteNo: "LN-91",
    loanedAt: "2026-08-02",
    returnedAt: "2026-08-09",
    returnedToSupplierAt: null,
  }],
  cases: [{ id: "case-1", caseNo: "SC2608-01", closed: false, openedAt: "2026-08-11" }],
  claims: [],
  work: [{ id: "work-1", module: "purchasing", title: "Review PO quantity", state: "open", createdAt: "2026-08-12" }],
});

describe("resolveSalesOrderRoute", () => {
  it("keeps split fulfilment as simultaneous goods positions", () => {
    const route = resolveSalesOrderRoute(input());
    const goods = route.lanes.find((lane) => lane.key === "goods")!;

    expect(goods.groups.map((group) => group.title)).toEqual(["Cloud Bed · 1", "Haven Sofa · 2"]);
    expect(goods.groups[0]!.facts.map((fact) => fact.title)).toEqual([
      "Delivered · Unit id-bed000001",
    ]);
    expect(goods.groups[1]!.facts.map((fact) => fact.title)).toEqual([
      "At Carres · Unit id-sofa00001",
      "In production at supplier · PO-8002",
    ]);
    expect(route.currentPositions).toEqual([
      "Cloud Bed · Delivered",
      "Haven Sofa · At Carres / In production at supplier",
    ]);
  });

  it("builds clickable document lineage without inventing sent or received evidence", () => {
    const route = resolveSalesOrderRoute(input());
    expect(route.documents.map((doc) => [doc.kind, doc.number, doc.href])).toEqual([
      ["Sales Order", "SO-1318", "/operation/orders/so/order-1"],
      ["Revision", "Rev 1", "/operation/orders/so/order-1?revision=1"],
      ["Revision", "Rev 2", "/operation/orders/so/order-1?revision=2"],
      ["Purchase Order", "PO-8001", "/operation/procurement?po=PO-8001"],
      ["Supplier DO", "SDO-81", "/operation/procurement?po=PO-8001"],
      ["Purchase Order", "PO-8002", "/operation/procurement?po=PO-8002"],
      ["Delivery Order", "DO-130826-0031", "/operation?tab=delivery&order=order-1"],
      ["Invoice", "INV-1318", "/finance/invoices?order=order-1"],
      ["Loan Note", "LN-91", "/operation/orders/so/order-1?route=1#loan"],
      ["Service Case", "SC2608-01", "/operation?tab=service-notes&case=case-1"],
    ]);
    expect(route.documents.every((doc) => !/sent|received by customer/i.test(doc.detail ?? ""))).toBe(true);
  });

  it("keeps delivery runs, both money directions, loan return, cases and owner work independent", () => {
    const route = resolveSalesOrderRoute(input());
    const lane = (key: string) => route.lanes.find((item) => item.key === key)!;

    expect(lane("delivery").groups[0]!.facts.map((fact) => fact.title)).toEqual([
      "Delivery 1 · Not Delivered",
      "Amy Logistics · Confirmed",
    ]);
    expect(lane("delivery").groups[0]!.facts[0]!.detail).toContain("Customer unavailable");
    expect(lane("money").groups.flatMap((group) => group.facts.map((fact) => fact.title))).toEqual([
      "RM 1,500.00 owed by customer",
      "RM 200.00 approved refund not paid",
    ]);
    expect(lane("loan").groups[0]!.facts[0]!.title).toBe("Returned by customer · supplier return open");
    expect(lane("other").groups.filter((group) => group.id !== "claims").flatMap((group) => group.facts.map((fact) => fact.title))).toEqual([
      "SC2608-01 · Open",
      "Review PO quantity · Open",
    ]);
    expect(route.noActionRequired).toBe(false);
  });

  it("includes real receiving and supplier-claim documents with owner links", () => {
    const facts = input();
    facts.receivingRecords = [{
      id: "receipt-1",
      recordNo: "GRN-120826-4491",
      poId: "PO-8002",
      supplierDoNumber: "SDO-92",
      status: "Posted",
      receivedAt: "2026-08-12",
    }];
    facts.claims = [{
      id: "claim-1",
      claimNo: "CL-109",
      poId: "PO-8002",
      status: "open",
      reportedAt: "2026-08-12",
    }];
    const route = resolveSalesOrderRoute(facts);
    expect(route.documents).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "Supplier DO", number: "SDO-92", href: "/operation?tab=receiving&receipt=receipt-1" }),
      expect.objectContaining({ kind: "Receiving Record", number: "GRN-120826-4491", href: "/operation?tab=receiving&receipt=receipt-1" }),
      expect.objectContaining({ kind: "Supplier Claim", number: "CL-109", href: "/operation?tab=claims&claim=claim-1" }),
    ]));
    const other = route.lanes.find((lane) => lane.key === "other")!;
    expect(other.groups[0]!.facts[0]!.title).toBe("CL-109 · Open");
    expect(route.noActionRequired).toBe(false);
  });

  it("states unassigned goods plainly and reports no action only when every applicable obligation is clear", () => {
    const facts = input();
    facts.allocation.lines = [{
      sku: "MATTRESS-C",
      committedQty: 1,
      reservedUnits: [],
      soldUnits: [],
      reservedQty: 0,
      soldQty: 0,
      outstandingQty: 1,
    }];
    facts.allocation.totals = { committedQty: 1, reservedQty: 0, soldQty: 0, outstandingQty: 1 };
    facts.purchaseOrders = [];
    facts.delivery.booking = null;
    facts.delivery.attempts = [];
    let route = resolveSalesOrderRoute(facts);
    expect(route.lanes[0]!.groups[0]!.facts[0]!.title).toBe("Waiting for Purchasing · 1 item");
    expect(route.lanes.find((lane) => lane.key === "delivery")!.groups[0]!.facts[0]).toMatchObject({
      title: "Promised this day, no date yet",
      detail: "Customer Delivery · 2026-08-20",
    });
    expect(route.noActionRequired).toBe(false);

    facts.allocation.lines[0] = {
      ...facts.allocation.lines[0]!,
      soldUnits: [{
        id: "u1", unitCode: "id-1", sku: "MATTRESS-C", status: "sold", condition: "new",
        warehouseId: null, poNo: null, qty: 1, dateIn: null, soldAt: "2026-08-13",
      }],
      soldQty: 1,
      outstandingQty: 0,
    };
    facts.allocation.totals = { committedQty: 1, reservedQty: 0, soldQty: 1, outstandingQty: 0 };
    facts.delivery.attempts = [{
      id: "d", attemptNo: 1, result: "delivered", reason: null, doNumber: "DO-1",
      scheduledDate: "2026-08-13", recordedAt: "2026-08-13",
    }];
    facts.money = { known: true, total: 4500, paid: 4500, outstanding: 0 };
    facts.refunds = [{ id: "r", amount: 200, status: "paid", requestedAt: "2026-08-12" }];
    facts.loans = [{ ...facts.loans[0]!, returnedToSupplierAt: "2026-08-12" }];
    facts.cases = [{ ...facts.cases[0]!, closed: true }];
    facts.work = [{ ...facts.work[0]!, state: "closed" }];

    route = resolveSalesOrderRoute(facts);
    expect(route.noActionRequired).toBe(true);
  });
});
