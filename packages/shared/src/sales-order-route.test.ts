import { describe, expect, it } from "vitest";
import {
  resolveSalesOrderRoute,
  type RoutePurchaseOrder,
  type SalesOrderRouteInput,
} from "./sales-order-route";
import type { AllocationUnit } from "./sales-order-allocation";

/* ─────────────────────────────────────────────────────────────────────────────
 * Fixtures. Every scenario in the owner's matrix is built from these three
 * helpers so a test reads as the situation it describes.
 * ──────────────────────────────────────────────────────────────────────────── */

const unit = (over: Partial<AllocationUnit> & { id: string }): AllocationUnit => ({
  unitCode: null,
  sku: "BED-A",
  status: "reserved",
  condition: "new",
  warehouseId: "wh-1",
  poNo: null,
  qty: 1,
  dateIn: "2026-08-12",
  ...over,
});

const line = (over: Partial<SalesOrderRouteInput["allocation"]["lines"][number]> & { sku: string }) => ({
  committedQty: 1,
  reservedUnits: [],
  soldUnits: [],
  reservedQty: 0,
  soldQty: 0,
  outstandingQty: 0,
  ...over,
});

const po = (over: Partial<RoutePurchaseOrder> & { id: string }): RoutePurchaseOrder => ({
  issuedAt: "2026-08-13",
  expectedReadyDate: null,
  lines: [],
  ...over,
});

function input(over: Partial<SalesOrderRouteInput> = {}): SalesOrderRouteInput {
  return {
    order: {
      id: "order-1",
      so: 1319,
      customerName: "LIM KUAN YANG",
      placedAt: "2026-08-12",
      deliveryDate: "2026-09-24",
      deliveredAt: null,
    },
    lineLabels: { "B1201S": "B1201S · King" },
    lineDestinations: {},
    cancelledLines: [],
    allocation: {
      orderId: "order-1",
      soRef: "SO-1319",
      lines: [
        line({
          sku: "B1201S",
          committedQty: 3,
          reservedUnits: [unit({ id: "u1", unitCode: "UNT-8821", sku: "B1201S" })],
          reservedQty: 1,
          outstandingQty: 2,
        }),
      ],
      unmatchedUnits: [],
      totals: { committedQty: 3, reservedQty: 1, soldQty: 0, outstandingQty: 2 },
    },
    purchaseOrders: [po({ id: "PO-2048", lines: [{ sku: "B1201S", qty: 2, receivedQty: 0 }] })],
    receivingRecords: [],
    delivery: { booking: null, attempts: [] },
    money: { known: true, outstanding: 1249, holds: true },
    cases: [],
    claims: [],
    ...over,
  };
}

const track = (route: ReturnType<typeof resolveSalesOrderRoute>, key: string) =>
  route.tracks.find((t) => t.key === key)!;
const requirement = (route: ReturnType<typeof resolveSalesOrderRoute>, id: string) =>
  route.release.requirements.find((r) => r.id === id)!;

/* ─────────────────────────────────────────────────────────────────────────────
 * Layer 1 — ORDER TRACKS
 * ──────────────────────────────────────────────────────────────────────────── */

describe("ORDER TRACKS", () => {
  it("always renders exactly four tracks, in the ruled order, and never merges them", () => {
    const route = resolveSalesOrderRoute(input());
    expect(route.tracks.map((t) => t.title)).toEqual(["GOODS", "STOCK", "DELIVERY", "MONEY"]);
    /* There is no overall Sales Order status field to read. */
    expect(route).not.toHaveProperty("status");
    expect(route).not.toHaveProperty("overall");
  });

  it("states the owner's own four facts", () => {
    const route = resolveSalesOrderRoute(input());
    expect(track(route, "goods").status).toBe("2 items on order with the supplier");
    expect(track(route, "stock").status).toBe("1 of 3 Units ready");
    expect(track(route, "delivery").status).toBe("Appointment not confirmed");
    expect(track(route, "money").status).toBe("RM 1,249.00 still to collect");
  });

  it("gives MONEY the door to the desk that owns collection, and no other track a door", () => {
    const route = resolveSalesOrderRoute(input());
    expect(track(route, "money").door).toEqual({
      label: "Open Payments →",
      href: "/operation?tab=payments&so=1319",
    });
    for (const key of ["goods", "stock", "delivery"]) expect(track(route, key).door).toBeNull();
  });

  it("says a line is waiting for Purchasing when no Purchase Order covers it", () => {
    const route = resolveSalesOrderRoute(input({ purchaseOrders: [] }));
    expect(track(route, "goods").status).toBe("2 items waiting for Purchasing");
    expect(track(route, "goods").mark).toBe("current");
  });

  it("blocks GOODS with its reason when a Unit sits outside the order lines", () => {
    const route = resolveSalesOrderRoute(
      input({
        allocation: {
          ...input().allocation,
          unmatchedUnits: [unit({ id: "stray", unitCode: "UNT-9000", sku: "OTHER" })],
        },
      }),
    );
    expect(track(route, "goods").mark).toBe("blocked");
    expect(track(route, "goods").status).toContain("not on this order");
  });

  it("labels the delivery appointment date rather than printing a bare date", () => {
    const route = resolveSalesOrderRoute(
      input({ delivery: { booking: { confirmedDate: "2026-09-24", slot: null, scope: null }, attempts: [] } }),
    );
    expect(track(route, "delivery").status).toBe("Delivery appointment: 2026-09-24");
  });

  it("reads a failed attempt as blocked, with its reason", () => {
    const route = resolveSalesOrderRoute(
      input({
        delivery: {
          booking: null,
          attempts: [
            {
              id: "a1",
              attemptNo: 1,
              result: "failed",
              reason: "Customer unavailable",
              doNumber: "DO-2088",
              scheduledDate: "2026-09-20",
              recordedAt: "2026-09-20",
            },
          ],
        },
      }),
    );
    expect(track(route, "delivery").mark).toBe("blocked");
    expect(track(route, "delivery").status).toContain("Customer unavailable");
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
 * LINKED PROBLEMS — never a fifth track
 * ──────────────────────────────────────────────────────────────────────────── */

describe("LINKED PROBLEMS", () => {
  it("is empty when nothing is linked", () => {
    expect(resolveSalesOrderRoute(input()).linkedProblems).toEqual([]);
  });

  it("renders an open Service Case with its door and never as a track", () => {
    const route = resolveSalesOrderRoute(
      input({
        cases: [{ id: "case-1", caseNo: "SC-1031", statusLabel: "Investigation in progress", closed: false }],
      }),
    );
    expect(route.linkedProblems).toEqual([
      {
        id: "case:case-1",
        title: "SC-1031 · Investigation in progress",
        door: { label: "Open SC-1031 →", href: "/operation?tab=service-notes&case=case-1" },
      },
    ]);
    expect(route.tracks).toHaveLength(4);
    expect(route.tracks.map((t) => t.title)).not.toContain("SERVICE");
  });

  it("drops a closed exception — a closed case is not a problem", () => {
    const route = resolveSalesOrderRoute(
      input({
        cases: [{ id: "case-1", caseNo: "SC-1031", statusLabel: "Closed", closed: true }],
        claims: [{ id: "claim-1", claimNo: "CLM-4", statusLabel: "Settled", closed: true }],
      }),
    );
    expect(route.linkedProblems).toEqual([]);
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
 * Layer 2 — GOODS ROUTES
 * ──────────────────────────────────────────────────────────────────────────── */

describe("GOODS ROUTES", () => {
  it("forks a split quantity into two sub-lanes with their counts", () => {
    const route = resolveSalesOrderRoute(input());
    const goods = route.goodsRoutes[0]!;
    expect(goods.title).toBe("B1201S · King · Qty 3");
    expect(goods.forked).toBe(true);
    expect(goods.lanes.map((l) => l.title)).toEqual(["Qty 1 · READY STOCK", "Qty 2 · PURCHASE"]);
  });

  it("puts CURRENT on a sub-lane station, never on the Sales Order", () => {
    const route = resolveSalesOrderRoute(input());
    const currents = route.goodsRoutes.flatMap((g) =>
      g.lanes.flatMap((l) => l.stations.filter((s) => s.current).map((s) => `${l.title} · ${s.title}`)),
    );
    /* The ready-stock lane is complete and holds no CURRENT; the purchase lane
       stands at SUPPLIER. Two lanes, one position each where work remains. */
    expect(currents).toEqual(["Qty 2 · PURCHASE · SUPPLIER"]);
    expect(route).not.toHaveProperty("currentPositions");
  });

  it("renders a ready-stock lane without any purchase station", () => {
    const route = resolveSalesOrderRoute(
      input({
        allocation: {
          ...input().allocation,
          lines: [
            line({
              sku: "B1201S",
              committedQty: 1,
              reservedUnits: [unit({ id: "u1", unitCode: "UNT-8821", sku: "B1201S" })],
              reservedQty: 1,
              outstandingQty: 0,
            }),
          ],
          totals: { committedQty: 1, reservedQty: 1, soldQty: 0, outstandingQty: 0 },
        },
        purchaseOrders: [],
        lineDestinations: { "B1201S": [{ name: "Carres Klang", qty: 1 }] },
      }),
    );
    const lanes = route.goodsRoutes[0]!.lanes;
    expect(lanes).toHaveLength(1);
    expect(lanes[0]!.stations.map((s) => s.title)).toEqual(["STOCK"]);
    expect(lanes[0]!.stations[0]!.evidence).toBe("UNT-8821 · Carres Klang");
  });

  it("gives every ✓ station its document number, labelled date and door", () => {
    const route = resolveSalesOrderRoute(
      input({
        purchaseOrders: [
          po({
            id: "PO-2048",
            issuedAt: "2026-08-13",
            expectedReadyDate: "2026-09-01",
            lines: [{ sku: "B1201S", qty: 2, receivedQty: 0 }],
          }),
        ],
      }),
    );
    const purchase = route.goodsRoutes[0]!.lanes.find((l) => l.source === "purchase")!;
    const purchasing = purchase.stations.find((s) => s.title === "PURCHASING")!;
    expect(purchasing.mark).toBe("complete");
    expect(purchasing.evidence).toBe("PO-2048 · Issued: 2026-08-13");
    expect(purchasing.door).toEqual({ label: "Open PO-2048 →", href: "/operation/procurement?po=PO-2048" });

    const supplier = purchase.stations.find((s) => s.title === "SUPPLIER")!;
    expect(supplier.mark).toBe("complete");
    expect(supplier.evidence).toBe("Estimated ready: 2026-09-01");
  });

  it("marks the SALES ORDER origin with its Ordered date — never a bare date", () => {
    const route = resolveSalesOrderRoute(input());
    expect(route.goodsRoutes[0]!.origin!.evidence).toBe("SO-1319 · Ordered: 2026-08-12");
  });

  it("names every not-started station in words rather than a dash", () => {
    const route = resolveSalesOrderRoute(input());
    const purchase = route.goodsRoutes[0]!.lanes.find((l) => l.source === "purchase")!;
    const notStarted = purchase.stations.filter((s) => s.mark !== "complete").map((s) => s.status);
    expect(notStarted).toEqual([
      "Ready date not confirmed",
      "Not received yet",
      "Units not created yet",
    ]);
    for (const station of purchase.stations) expect(station.status).not.toBe("—");
  });

  it("keeps a partly-received station CURRENT and says how far it got", () => {
    const route = resolveSalesOrderRoute(
      input({
        purchaseOrders: [
          po({
            id: "PO-2048",
            expectedReadyDate: "2026-09-01",
            lines: [{ sku: "B1201S", qty: 2, receivedQty: 1 }],
          }),
        ],
      }),
    );
    const purchase = route.goodsRoutes[0]!.lanes.find((l) => l.source === "purchase")!;
    const receiving = purchase.stations.find((s) => s.title === "RECEIVING")!;
    expect(receiving.mark).toBe("current");
    expect(receiving.current).toBe(true);
    expect(receiving.status).toBe("1 of 2 received");
  });

  it("completes RECEIVING only against a real receiving record", () => {
    const withRecord = resolveSalesOrderRoute(
      input({
        purchaseOrders: [
          po({ id: "PO-2048", expectedReadyDate: "2026-09-01", lines: [{ sku: "B1201S", qty: 2, receivedQty: 2 }] }),
        ],
        receivingRecords: [{ id: "rec-1", recordNo: "GRN-77", poId: "PO-2048", receivedAt: "2026-09-05" }],
      }),
    );
    const receiving = withRecord.goodsRoutes[0]!.lanes
      .find((l) => l.source === "purchase")!
      .stations.find((s) => s.title === "RECEIVING")!;
    expect(receiving.mark).toBe("complete");
    expect(receiving.evidence).toBe("GRN-77 · Received: 2026-09-05");
    expect(receiving.door).toEqual({ label: "Open GRN-77 →", href: "/operation?tab=receiving&receipt=rec-1" });
  });

  it("carries the action-engine line with its owner on the CURRENT station only", () => {
    const route = resolveSalesOrderRoute(input());
    const purchase = route.goodsRoutes[0]!.lanes.find((l) => l.source === "purchase")!;
    const supplier = purchase.stations.find((s) => s.title === "SUPPLIER")!;
    expect(supplier.action).toEqual({ ownerKey: "purchasing", label: "Confirm the ready date" });
    for (const station of purchase.stations.filter((s) => !s.current)) {
      expect(station.action).toBeNull();
    }
  });

  it("blocks the lane that has no Purchase Order and shows only that station", () => {
    const route = resolveSalesOrderRoute(input({ purchaseOrders: [] }));
    const lane = route.goodsRoutes[0]!.lanes.find((l) => l.source === "unassigned")!;
    expect(lane.title).toBe("Qty 2 · PURCHASE");
    expect(lane.stations).toHaveLength(1);
    expect(lane.stations[0]!.mark).toBe("blocked");
    expect(lane.stations[0]!.status).toBe("No Purchase Order yet");
    expect(lane.stations[0]!.action).toEqual({ ownerKey: "purchasing", label: "Raise the Purchase Order" });
  });

  it("splits ONE purchase lane into one lane per Deliver To when Purchasing names the split", () => {
    const route = resolveSalesOrderRoute(
      input({
        lineDestinations: {
          "B1201S": [
            { name: "Carres Klang", qty: 1 },
            { name: "Balakong", qty: 1 },
          ],
        },
      }),
    );
    const purchaseLanes = route.goodsRoutes[0]!.lanes.filter((l) => l.source === "purchase");
    expect(purchaseLanes.map((l) => l.title)).toEqual([
      "Qty 1 · PURCHASE · Carres Klang",
      "Qty 1 · PURCHASE · Balakong",
    ]);
  });

  it("refuses to distribute a destination it cannot prove", () => {
    /* Two destinations whose quantities do not add up to the lane: the split
       is not this order's, so the lane states them instead of inventing one. */
    const route = resolveSalesOrderRoute(
      input({
        lineDestinations: {
          "B1201S": [
            { name: "Carres Klang", qty: 5 },
            { name: "Balakong", qty: 4 },
          ],
        },
      }),
    );
    const purchaseLanes = route.goodsRoutes[0]!.lanes.filter((l) => l.source === "purchase");
    expect(purchaseLanes).toHaveLength(1);
    expect(purchaseLanes[0]!.destination).toBe("Carres Klang ×5 · Balakong ×4");
  });

  it("renders a delivered quantity as its own lane", () => {
    const route = resolveSalesOrderRoute(
      input({
        allocation: {
          ...input().allocation,
          lines: [
            line({
              sku: "B1201S",
              committedQty: 2,
              soldUnits: [unit({ id: "u9", unitCode: "UNT-9001", sku: "B1201S", status: "sold" })],
              soldQty: 1,
              reservedUnits: [unit({ id: "u8", unitCode: "UNT-9002", sku: "B1201S" })],
              reservedQty: 1,
              outstandingQty: 0,
            }),
          ],
          totals: { committedQty: 2, reservedQty: 1, soldQty: 1, outstandingQty: 0 },
        },
        purchaseOrders: [],
      }),
    );
    expect(route.goodsRoutes[0]!.lanes.map((l) => l.title)).toEqual([
      "Qty 1 · DELIVERED",
      "Qty 1 · READY STOCK",
    ]);
  });

  it("states a cancelled line's outcome and gives it no stations", () => {
    const route = resolveSalesOrderRoute(
      input({ cancelledLines: [{ sku: "SOFA-X", label: "Haven Sofa", qty: 1, revision: 3 }] }),
    );
    const cancelled = route.goodsRoutes.find((g) => g.cancelled)!;
    expect(cancelled.title).toBe("Haven Sofa · Qty 1");
    expect(cancelled.cancelledWord).toBe("Cancelled · Rev 3");
    expect(cancelled.lanes).toEqual([]);
    expect(cancelled.origin).toBeNull();
  });

  it("gives a service-only order no goods route at all", () => {
    const route = resolveSalesOrderRoute(
      input({
        allocation: {
          ...input().allocation,
          lines: [],
          totals: { committedQty: 0, reservedQty: 0, soldQty: 0, outstandingQty: 0 },
        },
        purchaseOrders: [],
      }),
    );
    expect(route.goodsRoutes).toEqual([]);
    expect(track(route, "goods").status).toBe("No goods on this order");
  });

  it("has no writer — no station carries anything tickable", () => {
    const route = resolveSalesOrderRoute(input());
    for (const goods of route.goodsRoutes) {
      for (const lane of goods.lanes) {
        for (const station of lane.stations) {
          expect(Object.keys(station)).toEqual([
            "id",
            "title",
            "mark",
            "evidence",
            "status",
            "action",
            "door",
            "current",
          ]);
        }
      }
    }
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
 * DELIVERY RELEASE
 * ──────────────────────────────────────────────────────────────────────────── */

describe("DELIVERY RELEASE", () => {
  it("counts the open requirements and offers only the Delivery door", () => {
    const route = resolveSalesOrderRoute(input());
    expect(route.release.ready).toBe(false);
    expect(route.release.headline).toBe("NOT READY FOR DELIVERY");
    expect(route.release.summary).toBe("3 requirements still open");
    expect(route.release.door).toEqual({
      label: "Open Delivery →",
      href: "/operation?tab=delivery&order=order-1",
    });
    expect(route.release).not.toHaveProperty("action");
  });

  it("keeps the partial-goods gate honest", () => {
    const route = resolveSalesOrderRoute(input());
    const goods = requirement(route, "goods");
    expect(goods.mark).toBe("waiting");
    expect(goods.title).toBe("Goods not ready");
    expect(goods.details).toEqual(["1 of 3 ready"]);
  });

  it("shows the two money facts apart — a release never hides the amount", () => {
    const held = requirement(resolveSalesOrderRoute(input()), "money");
    expect(held.mark).toBe("blocked");
    expect(held.title).toBe("Money release not cleared");
    expect(held.details).toEqual(["RM 1,249.00 still to collect"]);

    const released = requirement(
      resolveSalesOrderRoute(input({ money: { known: true, outstanding: 1249, holds: false } })),
      "money",
    );
    expect(released.mark).toBe("complete");
    expect(released.title).toBe("Money release cleared");
    expect(released.details).toEqual(["RM 1,249.00 remains to collect", "Manager release recorded"]);
  });

  it("never lets an unknown price hold a delivery", () => {
    const money = requirement(
      resolveSalesOrderRoute(input({ money: { known: false, outstanding: 0, holds: false } })),
      "money",
    );
    expect(money.mark).toBe("complete");
    expect(money.details).toContain("No price yet");
  });

  it("states the customer's requested date under an unconfirmed appointment", () => {
    const appointment = requirement(resolveSalesOrderRoute(input()), "appointment");
    expect(appointment.mark).toBe("waiting");
    expect(appointment.title).toBe("Appointment not confirmed");
    expect(appointment.details).toEqual(["Customer requested: 2026-09-24"]);
  });

  it("says READY only when every requirement is complete", () => {
    const route = resolveSalesOrderRoute(
      input({
        allocation: {
          ...input().allocation,
          lines: [
            line({
              sku: "B1201S",
              committedQty: 1,
              reservedUnits: [unit({ id: "u1", unitCode: "UNT-8821", sku: "B1201S" })],
              reservedQty: 1,
              outstandingQty: 0,
            }),
          ],
          totals: { committedQty: 1, reservedQty: 1, soldQty: 0, outstandingQty: 0 },
        },
        purchaseOrders: [],
        delivery: { booking: { confirmedDate: "2026-09-24", slot: "10:00–12:00", scope: null }, attempts: [] },
        money: { known: true, outstanding: 0, holds: false },
      }),
    );
    expect(route.release.ready).toBe(true);
    expect(route.release.headline).toBe("READY FOR DELIVERY");
    expect(route.release.summary).toBe("All release requirements are complete.");
    expect(route.release.openCount).toBe(0);
  });

  it("allows ✓ on partial goods only with an explicit, displayed delivery scope", () => {
    const bedOnly = resolveSalesOrderRoute(
      input({
        allocation: {
          orderId: "order-1",
          soRef: "SO-1319",
          lines: [
            line({
              sku: "M1401F-K",
              committedQty: 1,
              reservedUnits: [unit({ id: "u1", unitCode: "UNT-1", sku: "M1401F-K" })],
              reservedQty: 1,
              outstandingQty: 0,
            }),
            line({ sku: "SOFA-2S", committedQty: 2, outstandingQty: 2 }),
          ],
          unmatchedUnits: [],
          totals: { committedQty: 3, reservedQty: 1, soldQty: 0, outstandingQty: 2 },
        },
        purchaseOrders: [],
        delivery: {
          booking: { confirmedDate: "2026-09-24", slot: null, scope: ["bed"] },
          attempts: [
            {
              id: "a1",
              attemptNo: 1,
              result: "partial",
              reason: null,
              doNumber: "DO-2088",
              scheduledDate: "2026-09-24",
              recordedAt: null,
            },
          ],
        },
      }),
    );
    const goods = requirement(bedOnly, "goods");
    expect(goods.mark).toBe("complete");
    expect(goods.title).toBe("Goods ready for this delivery");
    expect(goods.details).toEqual(["1 Unit included in DO-2088", "2 Units remain open"]);
  });
});
