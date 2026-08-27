import { describe, expect, it } from "vitest";
import {
  resolveSalesOrderRoute,
  type RouteNode,
  type RoutePurchaseOrder,
  type SalesOrderRouteInput,
  type SalesOrderRouteMap,
} from "./sales-order-route";
import type { AllocationUnit } from "./sales-order-allocation";

/* ─────────────────────────────────────────────────────────────────────────────
 * Fixtures. Every scenario in the owner's card is built from these helpers so a
 * test reads as the situation it describes.
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
    lineLabels: { B1201S: "B1201S · King" },
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
    delivery: { logistics: null, booking: null, attempts: [] },
    money: { known: true, outstanding: 1249 },
    financeExceptions: [],
    paymentApprovals: [],
    loans: [],
    cases: [],
    claims: [],
    ...over,
  };
}

const node = (map: SalesOrderRouteMap, id: string): RouteNode =>
  map.nodes.find((n) => n.id === id)!;
const kinds = (map: SalesOrderRouteMap, kind: string) =>
  map.nodes.filter((n) => n.kind === kind);
const edge = (map: SalesOrderRouteMap, from: string, to: string) =>
  map.edges.find((e) => e.from === from && e.to === to);
const requirement = (map: SalesOrderRouteMap, id: string) =>
  node(map, "delivery-order").requirements.find((r) => r.id === id);

/* ─────────────────────────────────────────────────────────────────────────────
 * THE MAP IS ONE GRAPH — the Sales Order is its only root.
 * ──────────────────────────────────────────────────────────────────────────── */

describe("the node map", () => {
  it("has no stacked-layer shape left on it — one node list, one edge list", () => {
    const map = resolveSalesOrderRoute(input());
    expect(map).not.toHaveProperty("tracks");
    expect(map).not.toHaveProperty("goodsRoutes");
    expect(map).not.toHaveProperty("release");
    expect(map).not.toHaveProperty("status");
    expect(Array.isArray(map.nodes)).toBe(true);
    expect(Array.isArray(map.edges)).toBe(true);
  });

  it("makes SALES ORDER the only root, and goods + delivery + money leave it at once", () => {
    const map = resolveSalesOrderRoute(input());
    const roots = map.nodes.filter((n) => !map.edges.some((e) => e.to === n.id));
    expect(roots.map((n) => n.id)).toEqual(["sales-order"]);

    const leaving = map.edges.filter((e) => e.from === "sales-order");
    const branches = new Set(leaving.map((e) => node(map, e.to).branch));
    expect(branches).toEqual(new Set(["goods", "delivery", "money"]));
    /* Simultaneously: every one of them starts at the same y. */
    const tops = new Set(leaving.map((e) => node(map, e.to).y));
    expect(tops.size).toBe(1);
  });

  it("carries the SO number and its labelled ordered date, and no circular door", () => {
    const so = node(resolveSalesOrderRoute(input()), "sales-order");
    expect(so.lines).toEqual(["SO-1319", "Ordered: 2026-08-12"]);
    expect(so.door).toBeNull();
    expect(so.mark).toBe("complete");
  });

  it("draws every node inside the reported bounding box", () => {
    const map = resolveSalesOrderRoute(input());
    for (const n of map.nodes) {
      expect(n.x).toBeGreaterThanOrEqual(0);
      expect(n.y).toBeGreaterThanOrEqual(0);
      expect(n.x + n.w).toBeLessThanOrEqual(map.width);
      expect(n.y + n.h).toBeLessThanOrEqual(map.height);
      expect(n.h).toBeGreaterThan(0);
    }
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
 * GOODS — one fork per line and per source quantity.
 * ──────────────────────────────────────────────────────────────────────────── */

describe("goods forks", () => {
  it("draws one LANE per line — plate, then the chain, converging on the line's ONE STOCK node", () => {
    const map = resolveSalesOrderRoute(input());
    expect(edge(map, "sales-order", "B1201S:goods-line")).toBeDefined();
    expect(edge(map, "B1201S:goods-line", "PO-2048:purchasing")).toBeDefined();
    expect(edge(map, "PO-2048:purchasing", "PO-2048:supplier")).toBeDefined();
    expect(edge(map, "PO-2048:supplier", "PO-2048:receiving")).toBeDefined();
    /* STOCK is the lane's tail: the chain converges on it, it joins the gate. */
    expect(edge(map, "PO-2048:receiving", "B1201S:stock")).toBeDefined();
    expect(edge(map, "B1201S:stock", "delivery-order")).toBeDefined();
    /* One line, one column — the whole journey shares one x. */
    expect(node(map, "B1201S:stock").x).toBe(node(map, "PO-2048:purchasing").x);
    expect(node(map, "B1201S:stock").y).toBeGreaterThan(node(map, "PO-2048:receiving").y);
  });

  it("forks once per Purchase Order under ONE plate, and every fork converges on the one STOCK", () => {
    const map = resolveSalesOrderRoute(
      input({
        purchaseOrders: [
          po({ id: "PO-1", lines: [{ sku: "B1201S", qty: 1, receivedQty: 0 }] }),
          po({ id: "PO-2", lines: [{ sku: "B1201S", qty: 1, receivedQty: 0 }] }),
        ],
      }),
    );
    expect(edge(map, "B1201S:goods-line", "PO-1:purchasing")).toBeDefined();
    expect(edge(map, "B1201S:goods-line", "PO-2:purchasing")).toBeDefined();
    expect(node(map, "PO-1:purchasing").x).not.toBe(node(map, "PO-2:purchasing").x);
    /* The plate spans both columns; the line still has exactly one STOCK. */
    expect(node(map, "B1201S:goods-line").w).toBeGreaterThan(node(map, "PO-1:purchasing").w);
    expect(edge(map, "PO-1:receiving", "B1201S:stock")).toBeDefined();
    expect(edge(map, "PO-2:receiving", "B1201S:stock")).toBeDefined();
    expect(kinds(map, "stock")).toHaveLength(1);
  });

  it("still walks the whole chain for a quantity no Purchase Order covers", () => {
    const map = resolveSalesOrderRoute(input({ purchaseOrders: [] }));
    const purchasing = node(map, "B1201S:unassigned:purchasing");
    expect(purchasing.lines).toContain("No Purchase Order yet");
    expect(purchasing.action).toEqual({
      ownerKey: "purchasing",
      label: "Issue PO",
      context: {
        detail: "B1201S · King · 2 Units · Carres Warehouse · Requested Delivery Date: 2026-09-24",
      },
    });
    /* The steps behind it are a path the work has not walked — dashed, not absent. */
    expect(node(map, "B1201S:unassigned:supplier").mark).toBe("future");
    expect(node(map, "B1201S:unassigned:receiving").mark).toBe("future");
    expect(edge(map, "B1201S:unassigned:purchasing", "B1201S:unassigned:supplier")!.style).toBe(
      "dashed",
    );
  });

  it("keeps a PO whose goods arrived on the map instead of vanishing at the STOCK step", () => {
    const map = resolveSalesOrderRoute(
      input({
        purchaseOrders: [po({ id: "PO-2048", lines: [{ sku: "B1201S", qty: 2, receivedQty: 2 }] })],
        receivingRecords: [
          { id: "r1", recordNo: "GRN-77", poId: "PO-2048", receivedAt: "2026-08-20" },
        ],
      }),
    );
    const receiving = node(map, "PO-2048:receiving");
    expect(receiving.mark).toBe("complete");
    expect(receiving.lines).toEqual(["GRN-77", "Received: 2026-08-20"]);
  });

  it("states a cancelled line's outcome and gives it no chain and no gate edge", () => {
    const map = resolveSalesOrderRoute(
      input({ cancelledLines: [{ sku: "OLD", label: "Old sofa", qty: 1, revision: 3 }] }),
    );
    const cancelled = node(map, "cancelled:OLD");
    expect(cancelled.lines).toEqual(["Old sofa · Qty 1", "Cancelled · Rev 3"]);
    expect(edge(map, "cancelled:OLD", "delivery-order")).toBeUndefined();
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
 * CURRENT — one per route, up to three, never a fourth.
 * ──────────────────────────────────────────────────────────────────────────── */

describe("CURRENT", () => {
  it("marks exactly one node per route and no more than three in total", () => {
    const map = resolveSalesOrderRoute(input());
    const current = map.nodes.filter((n) => n.current);
    expect(current.length).toBeLessThanOrEqual(3);
    expect(current.map((n) => n.branch).sort()).toEqual(["delivery", "goods", "money"]);
    /* One per route — never two on the same one. */
    expect(new Set(current.map((n) => n.branch)).size).toBe(current.length);
  });

  it("puts goods CURRENT on the first unfinished step and leaves the other fork waiting", () => {
    const map = resolveSalesOrderRoute(input());
    expect(node(map, "PO-2048:purchasing").mark).toBe("complete");
    expect(node(map, "PO-2048:supplier").current).toBe(true);
    expect(node(map, "PO-2048:supplier").mark).toBe("current");
    expect(node(map, "PO-2048:receiving").mark).toBe("future");
    expect(node(map, "B1201S:stock").current).toBe(false);
    expect(node(map, "B1201S:stock").mark).toBe("waiting");
  });

  it("never lets a fourth route take a CURRENT — a loan is an obligation, not a position", () => {
    const map = resolveSalesOrderRoute(
      input({ loans: [{ id: "L1", label: "sofa", qty: 1, returned: false }] }),
    );
    expect(map.nodes.filter((n) => n.current).length).toBe(3);
    expect(node(map, "loan:L1").current).toBe(false);
  });

  it("gives the action only to the position being worked", () => {
    const map = resolveSalesOrderRoute(input());
    expect(node(map, "PO-2048:supplier").action).toEqual({
      ownerKey: "purchasing",
      label: "Confirm ready date",
      context: {
        detail: "PO-2048 · 2 Units · Carres Warehouse · Requested Delivery Date: 2026-09-24",
      },
    });
    /* A node nobody has reached carries no instruction. */
    expect(node(map, "PO-2048:receiving").action).toBeNull();
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
 * LOAN — conditional, amber, and it never blocks anything.
 * ──────────────────────────────────────────────────────────────────────────── */

describe("LOAN", () => {
  it("is absent from a clean order", () => {
    expect(kinds(resolveSalesOrderRoute(input()), "loan")).toHaveLength(0);
  });

  it("renders amber and joins DELIVER with a dashed `collect back` edge", () => {
    const map = resolveSalesOrderRoute(
      input({ loans: [{ id: "L1", label: "sofa", qty: 1, returned: false }] }),
    );
    const loan = node(map, "loan:L1");
    expect(loan.mark).toBe("blocked");
    expect(loan.lines).toEqual(["1 sofa on loan to customer", "Collect back on delivery day"]);
    const link = edge(map, "loan:L1", "deliver")!;
    expect(link.style).toBe("dashed");
    expect(link.labelLines).toEqual(["collect back"]);
    /* It never joins the gate — it may not hold a delivery. */
    expect(edge(map, "loan:L1", "delivery-order")).toBeUndefined();
  });

  it("disappears once the item is collected back", () => {
    const map = resolveSalesOrderRoute(
      input({ loans: [{ id: "L1", label: "sofa", qty: 1, returned: true }] }),
    );
    expect(kinds(map, "loan")).toHaveLength(0);
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
 * THE GATE. Read-only, system-issued. Two money requirements since the owner
 * ruling of 2026-08-19: money in full (or an APPROVED payment approval), and
 * no OPEN Finance exception.
 * ──────────────────────────────────────────────────────────────────────────── */

describe("the DELIVERY ORDER gate", () => {
  it("lists every missing requirement in plain sentences with the met count", () => {
    const map = resolveSalesOrderRoute(input());
    const gate = node(map, "delivery-order");
    /* The order owes RM 1,249 with no approval: the balance is a gate
       requirement again (owner ruling 2026-08-19). */
    expect(gate.lines).toEqual(["NOT READY FOR DELIVERY", "1 of 5 requirements met"]);
    expect(gate.requirements.map((r) => r.text)).toEqual([
      "Goods not ready (1 of 3)",
      "No logistics chosen",
      "Date + slot not confirmed",
      "RM 1,249.00 still outstanding — collect, or request a payment approval",
      "No Finance hold",
    ]);
  });

  it("never grows a Release or Approve CONTROL in any state", () => {
    /* The law guards CONTROLS — an action or a door — not the gate's status
       sentences, which since 2026-08-19 legitimately name the payment
       approval. The system issues; nobody presses. */
    for (const map of [
      resolveSalesOrderRoute(input()),
      resolveSalesOrderRoute(input({ money: { known: true, outstanding: 0 } })),
      resolveSalesOrderRoute(
        input({ paymentApprovals: [{ id: "pa-1", status: "approved" }] }),
      ),
    ]) {
      const gate = node(map, "delivery-order");
      expect(gate.door).toBeNull();
      const controls = map.nodes
        .flatMap((n) => [n.action?.label ?? "", n.door?.label ?? ""])
        .join(" ")
        .toLowerCase();
      expect(controls).not.toContain("release");
      expect(controls).not.toContain("approve");
      expect(controls).not.toContain("issue");
    }
  });

  /**
   * ⭐ THE LAW-D GUARD, REWRITTEN FROM DECISION B — NEVER DELETED. Its
   * ancestor read: "keeps MONEY a requirement — the map may not say
   * releasable while the engine refuses." The LAW is unchanged and this test
   * still enforces it: the map may not say releasable while the engine
   * refuses. What changed is the PREDICATE the engine refuses on — decision A
   * re-keyed `deliveryOrderIssueGate` and `order-actions` onto the OPEN
   * Finance exception, so the map asks the same question they do. Deleting
   * this guard instead of re-keying it is how decision B comes back.
   */
  it("⭐ the map may not say releasable while the engine refuses — now keyed on the Finance exception", () => {
    const map = resolveSalesOrderRoute(
      input({
        financeExceptions: [
          { id: "fe-1", status: "open", reason: "Chargeback under investigation" },
        ],
      }),
    );
    expect(requirement(map, "finance-exception")).toEqual({
      id: "finance-exception",
      met: false,
      text: "Finance is holding this delivery: Chargeback under investigation — Finance clears it",
    });
  });

  it("⭐ an outstanding balance IS a gate requirement again — owner ruling 2026-08-19", () => {
    /* RM 1,249 owed, nothing raised: the money requirement refuses and names
       both closers; the MONEY branch still prints the amount with its open
       collect — the gate and the screen agree. */
    const map = resolveSalesOrderRoute(input());
    expect(requirement(map, "money")).toEqual({
      id: "money",
      met: false,
      text: "RM 1,249.00 still outstanding — collect, or request a payment approval",
    });
    const money = node(map, "money");
    expect(money.mark).not.toBe("complete");
    expect(money.lines).toContain("RM 1,249.00 still to collect");
  });

  it("an APPROVED payment approval meets the money requirement — and the collect stays open", () => {
    const map = resolveSalesOrderRoute(
      input({ paymentApprovals: [{ id: "pa-1", status: "approved" }] }),
    );
    expect(requirement(map, "money")).toEqual({
      id: "money",
      met: true,
      text: "COD approved — collect before unloading",
    });
    /* COD does not forgive the money: the branch still owes and still acts. */
    const money = node(map, "money");
    expect(money.mark).not.toBe("complete");
    expect(money.lines).toContain("COD approved — collect before unloading");
  });

  it("a PENDING request keeps the money requirement unmet and says the decision is awaited", () => {
    const map = resolveSalesOrderRoute(
      input({ paymentApprovals: [{ id: "pa-1", status: "pending" }] }),
    );
    const req = requirement(map, "money")!;
    expect(req.met).toBe(false);
    expect(req.text).toContain("approval waiting for decision");
  });

  it("paid in full meets the money requirement with no approval", () => {
    const map = resolveSalesOrderRoute(
      input({ money: { known: true, outstanding: 0 } }),
    );
    expect(requirement(map, "money")).toEqual({
      id: "money",
      met: true,
      text: "Money in full",
    });
  });

  it("a CLEARED exception removes the block", () => {
    const map = resolveSalesOrderRoute(
      input({
        financeExceptions: [
          { id: "fe-1", status: "cleared", reason: "Chargeback under investigation" },
        ],
      }),
    );
    expect(requirement(map, "finance-exception")!.met).toBe(true);
  });

  it("names the count when Finance holds for more than one reason", () => {
    const map = resolveSalesOrderRoute(
      input({
        financeExceptions: [
          { id: "a", status: "open", reason: "Chargeback under investigation" },
          { id: "b", status: "open", reason: "Suspected duplicate payment" },
        ],
      }),
    );
    expect(requirement(map, "finance-exception")!.text).toContain("2 reasons");
  });

  it("lets an unpriced order through — a number nobody knows may not hold the goods", () => {
    const map = resolveSalesOrderRoute(
      input({ money: { known: false, outstanding: 0 } }),
    );
    expect(requirement(map, "finance-exception")!.met).toBe(true);
    expect(requirement(map, "money")).toEqual({
      id: "money",
      met: true,
      text: "No price yet — unknown never holds",
    });
  });

  it("names a refused delivery day instead of failing silently", () => {
    /* 2026-09-06 is a Sunday. */
    const map = resolveSalesOrderRoute(
      input({
        delivery: {
          logistics: { partnerName: "NETS" },
          booking: { confirmedDate: "2026-09-06", slot: "12pm–3pm", scope: null },
          attempts: [],
        },
      }),
    );
    expect(requirement(map, "refused-day")).toEqual({
      id: "refused-day",
      met: false,
      text: "Date falls on a Sunday — pick another day",
    });
  });

  it("names a Malaysian public holiday the same way", () => {
    const map = resolveSalesOrderRoute(
      input({
        delivery: {
          logistics: { partnerName: "NETS" },
          booking: { confirmedDate: "2026-01-01", slot: "12pm–3pm", scope: null },
          attempts: [],
        },
        publicHolidays: ["2026-01-01"],
      }),
    );
    expect(requirement(map, "refused-day")!.text).toBe(
      "Date falls on a public holiday — pick another day",
    );
  });

  it("adds no refused-day line on an ordinary working day", () => {
    const map = resolveSalesOrderRoute(
      input({
        delivery: {
          logistics: { partnerName: "NETS" },
          booking: { confirmedDate: "2026-09-24", slot: "12pm–3pm", scope: null },
          attempts: [],
        },
      }),
    );
    expect(requirement(map, "refused-day")).toBeUndefined();
  });

  it("shows the DO number and turns green once the system has issued it", () => {
    const map = resolveSalesOrderRoute(
      input({
        allocation: {
          orderId: "order-1",
          soRef: "SO-1319",
          lines: [
            line({
              sku: "B1201S",
              committedQty: 1,
              reservedUnits: [unit({ id: "u1", unitCode: "UNT-8821", sku: "B1201S" })],
              reservedQty: 1,
              outstandingQty: 0,
            }),
          ],
          unmatchedUnits: [],
          totals: { committedQty: 1, reservedQty: 1, soldQty: 0, outstandingQty: 0 },
        },
        purchaseOrders: [],
        delivery: {
          logistics: { partnerName: "NETS" },
          booking: { confirmedDate: "2026-09-24", slot: "12pm–3pm", scope: null },
          attempts: [
            {
              id: "a1",
              attemptNo: 1,
              result: "delivered",
              reason: null,
              doNumber: "DO-240926-0031",
              scheduledDate: "2026-09-24",
              recordedAt: "2026-09-24",
            },
          ],
        },
        money: { known: true, outstanding: 0 },
      }),
    );
    const gate = node(map, "delivery-order");
    expect(gate.mark).toBe("complete");
    expect(gate.lines).toEqual(["DO-240926-0031", "Delivery order issued"]);
    expect(gate.requirements).toEqual([]);
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
 * THE TAIL — DELIVER then DELIVERY PHOTO, and the last node has no line out.
 * ──────────────────────────────────────────────────────────────────────────── */

describe("the tail after the gate", () => {
  it("hangs DELIVER and DELIVERY PHOTO below the gate in a straight line", () => {
    const map = resolveSalesOrderRoute(input());
    expect(edge(map, "delivery-order", "deliver")).toBeDefined();
    expect(edge(map, "deliver", "delivery-photo")).toBeDefined();
    const gate = node(map, "delivery-order");
    const deliver = node(map, "deliver");
    const photo = node(map, "delivery-photo");
    expect(deliver.x).toBe(gate.x);
    expect(photo.x).toBe(gate.x);
    expect(deliver.y).toBeGreaterThan(gate.y);
    expect(photo.y).toBeGreaterThan(deliver.y);
  });

  it("leaves the last node with no trailing line", () => {
    const map = resolveSalesOrderRoute(input());
    expect(map.edges.filter((e) => e.from === "delivery-photo")).toHaveLength(0);
  });

  it("says what is missing, why and who does what next", () => {
    const map = resolveSalesOrderRoute(input());
    expect(node(map, "delivery-photo").lines).toEqual(["No delivery photo yet"]);
    for (const banned of ["No data", "No results", "Not available"]) {
      expect(JSON.stringify(map)).not.toContain(banned);
    }
  });

  it("names the uploader and the day once the photo is on file", () => {
    const map = resolveSalesOrderRoute(
      input({
        delivery: {
          logistics: null,
          booking: null,
          attempts: [],
          photos: [{ at: "2026-09-28", by: "Shasha" }],
        },
      }),
    );
    const photo = node(map, "delivery-photo");
    expect(photo.mark).toBe("complete");
    expect(photo.lines).toEqual(["Uploaded by Shasha", "Uploaded: 2026-09-28"]);
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
 * CONNECTORS — the geometry the page draws, asserted without a DOM.
 * ──────────────────────────────────────────────────────────────────────────── */

describe("connectors", () => {
  it("leaves the bottom of its source and lands on the top of its target", () => {
    const map = resolveSalesOrderRoute(input());
    for (const e of map.edges) {
      const from = node(map, e.from);
      const to = node(map, e.to);
      const first = e.points[0]!;
      const last = e.points[e.points.length - 1]!;
      expect(first).toEqual({ x: from.x + from.w / 2, y: from.y + from.h });
      expect(last).toEqual({ x: to.x + to.w / 2, y: to.y });
    }
  });

  it("draws every segment orthogonally — each step is either vertical or horizontal", () => {
    const map = resolveSalesOrderRoute(input());
    for (const e of map.edges) {
      for (let i = 0; i < e.points.length - 1; i += 1) {
        const a = e.points[i]!;
        const b = e.points[i + 1]!;
        expect(a.x === b.x || a.y === b.y).toBe(true);
      }
    }
  });

  it("draws a walked segment solid and an unwalked one dashed", () => {
    const map = resolveSalesOrderRoute(input());
    /* PURCHASING is done, so the step out of it has been walked. */
    expect(edge(map, "PO-2048:purchasing", "PO-2048:supplier")!.style).toBe("solid");
    /* SUPPLIER has not answered, so what follows is still a future path. */
    expect(edge(map, "PO-2048:supplier", "PO-2048:receiving")!.style).toBe("dashed");
  });

  it("names the routes on their group bands, and no edge carries a route caption", () => {
    const map = resolveSalesOrderRoute(input());
    expect(map.bands.map((b) => b.label)).toEqual(["GOODS", "DELIVERY", "MONEY"]);
    /* No text ever sits on a connector — the one edge fact left is the
       loan's `collect back`. */
    expect(map.edges.filter((e) => e.labelLines.length > 0)).toHaveLength(0);
    /* The product name lives on the plate, never on a line. */
    const plate = node(map, "B1201S:goods-line");
    expect(plate.title).toBe("B1201S · King");
    expect(plate.lines).toEqual(["Qty 3 · 2 to buy from factory"]);
    expect(plate.door).toBeNull();
    expect(plate.action).toBeNull();
  });

  it("adds the LOAN band only when a loan is out", () => {
    const map = resolveSalesOrderRoute(
      input({ loans: [{ id: "L1", label: "sofa", qty: 1, returned: false }] }),
    );
    expect(map.bands.map((b) => b.label)).toEqual(["GOODS", "DELIVERY", "MONEY", "LOAN"]);
  });

  it("converges every goods lane, the delivery date and the money on the one gate", () => {
    const map = resolveSalesOrderRoute(input());
    const into = map.edges.filter((e) => e.to === "delivery-order").map((e) => e.from);
    expect(into.sort()).toEqual(["B1201S:stock", "delivery-date", "money"]);
  });

  it("never lets two nodes overlap, however many forks the order has", () => {
    const map = resolveSalesOrderRoute(
      input({
        lineLabels: { B1201S: "B1201S · King", SOFA9: "Sofa 3-seater" },
        allocation: {
          orderId: "order-1",
          soRef: "SO-1319",
          lines: [
            line({ sku: "B1201S", committedQty: 2, outstandingQty: 2 }),
            line({ sku: "SOFA9", committedQty: 1, outstandingQty: 1 }),
          ],
          unmatchedUnits: [],
          totals: { committedQty: 3, reservedQty: 0, soldQty: 0, outstandingQty: 3 },
        },
        purchaseOrders: [
          po({ id: "PO-2048", lines: [{ sku: "B1201S", qty: 2, receivedQty: 0 }] }),
          po({ id: "PO-2051", lines: [{ sku: "SOFA9", qty: 1, receivedQty: 0 }] }),
        ],
        loans: [{ id: "L1", label: "sofa", qty: 1, returned: false }],
      }),
    );
    for (let i = 0; i < map.nodes.length; i += 1) {
      for (let j = i + 1; j < map.nodes.length; j += 1) {
        const a = map.nodes[i]!;
        const b = map.nodes[j]!;
        const hit =
          a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        expect(hit, `${a.id} overlaps ${b.id}`).toBe(false);
      }
    }
  });

  it("separates the route GROUPS by the wider gap, with the bands above the first node row", () => {
    const map = resolveSalesOrderRoute(input());
    const goods = map.bands.find((b) => b.id === "goods")!;
    const delivery = map.bands.find((b) => b.id === "delivery")!;
    const money = map.bands.find((b) => b.id === "money")!;
    expect(delivery.x - (goods.x + goods.w)).toBe(72);
    expect(money.x - (delivery.x + delivery.w)).toBe(72);
    const firstRow = Math.min(
      ...map.nodes.filter((n) => n.branch !== "root").map((n) => n.y),
    );
    expect(goods.y + goods.h).toBeLessThanOrEqual(firstRow);
    /* And the band row still clears the Sales Order above it. */
    const so = node(map, "sales-order");
    expect(goods.y).toBeGreaterThan(so.y + so.h);
  });

  it("connects every node to the graph — no orphan is ever drawn", () => {
    const map = resolveSalesOrderRoute(
      input({ loans: [{ id: "L1", label: "sofa", qty: 1, returned: false }] }),
    );
    for (const n of map.nodes) {
      if (n.id === "sales-order") continue;
      const joined = map.edges.some((e) => e.to === n.id || e.from === n.id);
      expect(joined, `${n.id} is not joined to the map`).toBe(true);
    }
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
 * DOORS — every node opens the module that owns its fact.
 * ──────────────────────────────────────────────────────────────────────────── */

describe("doors", () => {
  it("opens the owning module from every node that has an owner elsewhere", () => {
    const map = resolveSalesOrderRoute(input());
    expect(node(map, "PO-2048:purchasing").door).toEqual({
      label: "Open PO-2048 →",
      href: "/operation/procurement?po=PO-2048",
    });
    expect(node(map, "B1201S:stock").door).toEqual({
      label: "Open Stock →",
      href: "/operation?tab=stock-onhand",
    });
    expect(node(map, "logistics").door).toEqual({
      label: "Open Delivery →",
      href: "/operation?tab=delivery&order=order-1",
    });
    expect(node(map, "money").door).toEqual({
      label: "Open Payments →",
      href: "/operation?tab=payments&so=1319",
    });
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
 * LINKED PROBLEMS — beside the map, never a node on it.
 * ──────────────────────────────────────────────────────────────────────────── */

describe("linked problems", () => {
  it("keeps an open case off the graph and on its own strip", () => {
    const map = resolveSalesOrderRoute(
      input({
        cases: [{ id: "c1", caseNo: "SC-1031", statusLabel: "Investigation in progress", closed: false }],
      }),
    );
    expect(map.linkedProblems).toHaveLength(1);
    expect(map.linkedProblems[0]!.title).toBe("SC-1031 · Investigation in progress");
    /* Service is never a stage every Sales Order passes through. */
    expect(map.nodes.some((n) => n.id.includes("c1"))).toBe(false);
  });

  it("does not render a closed exception — a closed case is not a problem", () => {
    const map = resolveSalesOrderRoute(
      input({ cases: [{ id: "c1", caseNo: "SC-1031", statusLabel: "Closed", closed: true }] }),
    );
    expect(map.linkedProblems).toHaveLength(0);
  });
});
