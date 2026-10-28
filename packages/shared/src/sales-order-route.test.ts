import { describe, expect, it } from "vitest";
import {
  resolveSalesOrderRoute,
  ROUTE_TEXT_BUDGET,
  wrapRouteText,
  type RouteDeliveryScope,
  type RouteNode,
  type RoutePurchaseOrder,
  type SalesOrderRouteInput,
  type SalesOrderRouteMap,
} from "./sales-order-route";
import type { AllocationUnit } from "./sales-order-allocation";
import type { RouteGoodsLine, RouteGoodsSource } from "./sales-order-route-goods";

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
    expect(so.lines).toEqual(["SO-1319", "SO Doc Date: 2026-08-12"]);
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
    expect(purchasing.lines.join(" ")).toBe("Carres has not issued a Purchase Order");
    expect(purchasing.action).toEqual({
      ownerKey: "purchasing",
      label: "Issue PO",
      context: {
        detail: "B1201S · King · 2 Units · Carres Warehouse · Customer requested: 2026-09-24",
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
    /* Waiting on the supplier is not Carres' work (Purchasing §5.8): the
       position moves on to the step Carres will act on. */
    expect(node(map, "PO-2048:supplier").current).toBe(false);
    expect(node(map, "PO-2048:receiving").current).toBe(true);
    expect(node(map, "PO-2048:receiving").mark).toBe("current");
    expect(node(map, "B1201S:stock").current).toBe(false);
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
    expect(node(map, "PO-2048:receiving").action?.label).toBe("Check in");
    /* The retired `Confirm ready date` is owed by nobody; Stock owes nothing
       while the wait belongs to Receiving. */
    expect(node(map, "PO-2048:supplier").action).toBeNull();
    expect(node(map, "B1201S:stock").action).toBeNull();
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
    expect(loan.lines.join(" ")).toBe("1 sofa on loan to customer Collect back on delivery day");
    const link = edge(map, "loan:L1", "deliver")!;
    expect(link.style).toBe("dashed");
    expect(link.labelLines).toEqual(["collect back"]);
    /* It never joins the gate — it may not hold a delivery. */
    expect(edge(map, "loan:L1", "delivery-order")).toBeUndefined();
  });

  it("0492 — an OPEN offer is the loan's current state before any item is out; a decline renders nothing", () => {
    const offered = resolveSalesOrderRoute(
      input({ loanOffers: [{ id: "O1", event: "offered", label: "Display sofa · HK55-3S", reason: null, recordedAt: "2026-09-13T01:00:00Z" }] }),
    );
    const node1 = node(offered, "loan-offer:O1");
    expect(node1.lines).toEqual(["Loan offered", "Display sofa · HK55-3S", "Waiting for the customer's", "answer"]);
    /* A loan is an obligation, not a position: it never takes CURRENT and so
       never carries the action line — its door names where the answer is recorded. */
    expect(node1.action).toBeNull();
    expect(node1.door?.label).toBe("Open Sales Order →");
    expect(node1.mark).toBe("blocked");
    const accepted = resolveSalesOrderRoute(
      input({
        loanOffers: [
          { id: "O1", event: "offered", label: "Display sofa · HK55-3S", reason: null, recordedAt: "2026-09-13T01:00:00Z", seq: 1 },
          { id: "O2", event: "accepted", label: "Display sofa · HK55-3S", reason: null, recordedAt: "2026-09-13T01:00:00Z", seq: 2 },
        ],
      }),
    );
    expect(node(accepted, "loan-offer:O2").lines).toEqual(["Customer accepted the loan", "Display sofa · HK55-3S", "Prepare the loan Unit"]);
    const declined = resolveSalesOrderRoute(
      input({ loanOffers: [{ id: "O3", event: "declined", label: "Display sofa", reason: "Will wait", recordedAt: "2026-09-13T01:00:00Z" }] }),
    );
    expect(kinds(declined, "loan")).toHaveLength(0);
    /* Once the item is OUT, the loan row itself is the node — never both. */
    const out = resolveSalesOrderRoute(
      input({
        loans: [{ id: "L1", label: "sofa", qty: 1, returned: false }],
        loanOffers: [{ id: "O2", event: "accepted", label: "sofa", reason: null, recordedAt: "2026-09-13T01:00:00Z" }],
      }),
    );
    expect(kinds(out, "loan").map((n) => n.id)).toEqual(["loan:L1"]);
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
      "Warehouse has 1 of 3 Units ready",
      "Logistics not assigned",
      "Logistics has not scheduled the delivery",
      "Customer has not paid RM 1,249.00",
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
      text: "Hold delivery · Finance hold · Chargeback under investigation",
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
      text: "Customer has not paid RM 1,249.00",
    });
    const money = node(map, "money");
    expect(money.mark).not.toBe("complete");
    expect(money.lines[0]).toBe("Hold delivery");
  });

  it("an APPROVED payment approval meets the money requirement — and the collect stays open", () => {
    const map = resolveSalesOrderRoute(
      input({ paymentApprovals: [{ id: "pa-1", status: "approved" }] }),
    );
    expect(requirement(map, "money")).toEqual({
      id: "money",
      met: true,
      text: "Customer paid in full",
    });
    /* The approval does not forgive the money: the branch still owes and
       still acts. It does not HOLD the delivery, so it does not say so. */
    const money = node(map, "money");
    expect(money.mark).not.toBe("complete");
    expect(money.lines).toEqual(["Customer has not paid", "RM 1,249.00", "Customer must pay by", "2026-09-22"]);
    expect(money.action?.label).toBe("Collect");
  });

  it("a PENDING request keeps the money requirement unmet, and no surface invites a decision", () => {
    const map = resolveSalesOrderRoute(
      input({ paymentApprovals: [{ id: "pa-1", status: "pending" }] }),
    );
    const req = requirement(map, "money")!;
    expect(req.met).toBe(false);
    expect(req.text).toBe("Customer has not paid RM 1,249.00");
  });

  it("paid in full meets the money requirement with no approval", () => {
    const map = resolveSalesOrderRoute(
      input({ money: { known: true, outstanding: 0 } }),
    );
    expect(requirement(map, "money")).toEqual({
      id: "money",
      met: true,
      text: "Customer paid in full",
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
      text: "No price yet. Money does not hold this delivery",
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
      text: "Date falls on a Sunday. Pick another day",
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
      "Date falls on a public holiday. Pick another day",
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
    expect(node(map, "delivery-photo").lines.join(" ")).toBe("Logistics has not uploaded the delivery photo");
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
    expect(map.bands.map((b) => b.label)).toEqual(["GOODS", "DELIVERY", "PAYMENT"]);
    /* No text ever sits on a connector — the one edge fact left is the
       loan's `collect back`. */
    expect(map.edges.filter((e) => e.labelLines.length > 0)).toHaveLength(0);
    /* The product name lives on the plate, never on a line. */
    const plate = node(map, "B1201S:goods-line");
    expect(plate.title).toBe("B1201S · King");
    expect(plate.lines).toEqual(["Customer ordered 3", "Carres ordered 2 from supplier"]);
    expect(plate.door).toBeNull();
    expect(plate.action).toBeNull();
  });

  it("adds the LOAN band only when a loan is out", () => {
    const map = resolveSalesOrderRoute(
      input({ loans: [{ id: "L1", label: "sofa", qty: 1, returned: false }] }),
    );
    expect(map.bands.map((b) => b.label)).toEqual(["GOODS", "DELIVERY", "PAYMENT", "LOAN"]);
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
      href: "/operation?tab=delivery&view=all&open=order-1",
    });
    expect(node(map, "money").door).toEqual({
      label: "Open Payments →",
      href: "/finance/payments?order=1319",
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

/* ─────────────────────────────────────────────────────────────────────────────
 * SCOPE A · ORDER ROUTE READS ITS OWNERS (owner rulings 2026-09-25 / 2026-09-26,
 * `docs/orders/MASTER.md` §0.0). The PAYMENT node speaks in two lines, a failed
 * read is `unreadable` and never a business sentence, and a waiting amendment
 * is announced above the map.
 * ──────────────────────────────────────────────────────────────────────────── */

describe("PAYMENT speaks in two lines (owner ruling 2026-09-26)", () => {
  it("titles the node and its band PAYMENT, never MONEY", () => {
    const map = resolveSalesOrderRoute(input());
    expect(node(map, "money").title).toBe("PAYMENT");
    expect(map.bands.map((b) => b.label)).toEqual(["GOODS", "DELIVERY", "PAYMENT"]);
    expect(map.nodes.some((n) => n.title === "MONEY")).toBe(false);
  });

  it("owing: Hold delivery over the amount and the payment deadline", () => {
    /* Requested Thu, 24 Sep 2026; Klang Valley = 2 working days before. */
    const map = resolveSalesOrderRoute(input());
    expect(node(map, "money").lines).toEqual([
      "Hold delivery",
      "Customer has not paid",
      "RM 1,249.00",
      "Customer must pay by",
      "2026-09-22",
    ]);
    expect(requirement(map, "money")).toEqual({
      id: "money",
      met: false,
      text: "Customer has not paid RM 1,249.00",
    });
  });

  it("the deadline anchors on the Scheduled delivery when one is recorded, 3 working days outstation", () => {
    const map = resolveSalesOrderRoute(
      input({
        delivery: {
          logistics: { partnerName: "AL" },
          booking: { confirmedDate: "2026-09-30", slot: null, scope: null },
          attempts: [],
          outstation: true,
        },
      }),
    );
    expect(node(map, "money").lines.slice(-2)).toEqual(["Customer must pay by", "2026-09-26"]);
  });

  it("the deadline reads the stored Collection timing and the Office holidays (9 Oct 2026)", () => {
    // Scheduled Wed 30 Sep, outstation. A stored outstation deadline of 4 → Fri 25.
    const outstation = {
      logistics: { partnerName: "AL" },
      booking: { confirmedDate: "2026-09-30", slot: null, scope: null },
      attempts: [],
      outstation: true,
    };
    const stored = resolveSalesOrderRoute(input({
      delivery: outstation,
      paymentClock: { timing: { askDaysBefore: 3, deadlineDaysBefore: 2, outstationAskDaysBefore: 5, outstationDeadlineDaysBefore: 4 } },
    }));
    expect(node(stored, "money").lines.slice(-2)).toEqual(["Customer must pay by", "2026-09-25"]);
    // An Office holiday on Sat 26 moves the 3-day outstation deadline to Fri 25.
    const holiday = resolveSalesOrderRoute(input({ delivery: outstation, paymentClock: { holidays: ["2026-09-26"] } }));
    expect(node(holiday, "money").lines.slice(-2)).toEqual(["Customer must pay by", "2026-09-25"]);
  });

  it("an unassigned LOGISTICS node prints the one `Assign logistics by` date when the lead was read", () => {
    // Requested Thu 24 Sep; lead 3 on the Mon–Sat week → Mon 21. PO issued earlier opens it only.
    const read = resolveSalesOrderRoute(input({ delivery: { logistics: null, booking: null, attempts: [], assignLeadWorkingDays: 3 } }));
    expect(node(read, "logistics").lines).toEqual(["Logistics not assigned", "Assign logistics by", "2026-09-21"]);
    const five = resolveSalesOrderRoute(input({ delivery: { logistics: null, booking: null, attempts: [], assignLeadWorkingDays: 5 } }));
    expect(node(five, "logistics").lines.slice(1)).toEqual(["Assign logistics by", "2026-09-18"]);
    // A caller that did not read the setting says nothing about it.
    expect(node(resolveSalesOrderRoute(input()), "logistics").lines).toEqual(["Logistics not assigned"]);
  });

  it("paid: one word, and the gate line agrees", () => {
    const map = resolveSalesOrderRoute(input({ money: { known: true, outstanding: 0 } }));
    expect(node(map, "money").lines).toEqual(["Customer paid in full"]);
    expect(requirement(map, "money")).toEqual({ id: "money", met: true, text: "Customer paid in full" });
  });

  it("an OPEN Finance exception: Hold delivery over Finance hold and its reason", () => {
    const map = resolveSalesOrderRoute(
      input({
        money: { known: true, outstanding: 0 },
        financeExceptions: [{ id: "fx1", status: "open", reason: "Cheque bounced" }],
      }),
    );
    expect(node(map, "money").lines).toEqual(["Hold delivery", "Finance hold", "Cheque bounced"]);
    expect(node(map, "money").mark).not.toBe("complete");
    expect(requirement(map, "finance-exception")).toEqual({
      id: "finance-exception",
      met: false,
      text: "Hold delivery · Finance hold · Cheque bounced",
    });
  });

  it("no price: the dictionary's one spelling on the node and on the gate", () => {
    const map = resolveSalesOrderRoute(input({ money: { known: false, outstanding: 0 } }));
    expect(node(map, "money").lines.join(" ")).toBe("No price yet. Money does not hold this delivery");
    expect(requirement(map, "money")?.text).toBe("No price yet. Money does not hold this delivery");
  });

  it("prints none of the words retired on 2026-09-26, approval rows or not", () => {
    const retired = [
      "still to collect",
      "still outstanding",
      "Money in full",
      "Paid in full",
      "COD approved",
      "Payment approval waiting",
      "request a payment approval",
      "unknown never holds",
    ];
    for (const approvals of [[], [{ id: "a", status: "pending" as const }], [{ id: "a", status: "approved" as const }]]) {
      for (const money of [{ known: true, outstanding: 764 }, { known: true, outstanding: 0 }, { known: false, outstanding: 0 }]) {
        const map = resolveSalesOrderRoute(input({ money, paymentApprovals: approvals }));
        const printed = map.nodes.flatMap((n) => [...n.lines, ...n.requirements.map((r) => r.text)]).join("\n");
        for (const word of retired) expect(printed).not.toContain(word);
      }
    }
  });

  it("a pre-closure approval is still honoured by the gate, and reads Paid on the terms recorded", () => {
    const map = resolveSalesOrderRoute(
      input({ paymentApprovals: [{ id: "a", status: "approved" }] }),
    );
    expect(requirement(map, "money")).toEqual({ id: "money", met: true, text: "Customer paid in full" });
  });
});

describe("the Route's date words (owner ruling 2026-09-26)", () => {
  it("prints SO Doc Date on the SALES ORDER node", () => {
    const map = resolveSalesOrderRoute(input());
    expect(node(map, "sales-order").lines).toEqual(["SO-1319", "SO Doc Date: 2026-08-12"]);
  });

  it("never prints the retired SO Date or Requested Delivery Date labels", () => {
    const map = resolveSalesOrderRoute(input());
    const printed = map.nodes
      .flatMap((n) => [...n.lines, n.action?.context.detail ?? ""])
      .join("\n");
    expect(printed).not.toMatch(/SO Date:/);
    expect(printed).not.toContain("Requested Delivery Date");
    expect(printed).toContain("Customer requested: 2026-09-24");
  });
});

describe("a failed read is unreadable, never a business sentence (owner ruling 2026-09-26)", () => {
  it("Delivery: every DELIVERY node is unreadable; goods and payment still draw", () => {
    const map = resolveSalesOrderRoute(input({ unreadable: { delivery: true } }));
    const logistics = node(map, "logistics");
    expect(logistics.mark).toBe("unreadable");
    expect(logistics.lines.join(" ")).toBe(
      "Could not read Delivery for this order. This does not mean nothing is arranged.",
    );
    /* No sentence is cut by the 208px box: every line fits the node. */
    for (const l of logistics.lines) expect(l.length).toBeLessThanOrEqual(ROUTE_TEXT_BUDGET.line);
    expect(logistics.door).toEqual({ label: "Try again →", href: "#retry-delivery" });
    expect(logistics.action).toBeNull();
    for (const id of ["delivery-date", "delivery-order", "deliver", "delivery-photo"]) {
      expect(node(map, id).mark).toBe("unreadable");
      expect(node(map, id).current).toBe(false);
    }
    expect(map.nodes.some((n) => n.lines.includes("Logistics not assigned"))).toBe(false);
    expect(map.nodes.some((n) => n.lines.includes("Not scheduled yet"))).toBe(false);
    expect(node(map, "money").lines[0]).toBe("Hold delivery");
    expect(node(map, "PO-2048:purchasing").mark).toBe("complete");
  });

  it("Payments: the PAYMENT node is unreadable and the gate prints no balance sentence", () => {
    const map = resolveSalesOrderRoute(input({ unreadable: { payments: true } }));
    const payment = node(map, "money");
    expect(payment.mark).toBe("unreadable");
    expect(payment.lines.join(" ")).toBe(
      "Could not read Payments for this order. This does not mean the order is unpaid.",
    );
    expect(payment.door?.label).toBe("Try again →");
    const gate = node(map, "delivery-order");
    expect(gate.mark).toBe("unreadable");
    expect(gate.requirements.some((r) => /unpaid|Paid/.test(r.text))).toBe(false);
    expect(node(map, "logistics").mark).not.toBe("unreadable");
  });

  it("Purchasing: the goods chains are unreadable and STOCK is never CURRENT from a guess", () => {
    const map = resolveSalesOrderRoute(input({ unreadable: { purchasing: true } }));
    const goods = map.nodes.filter((n) => n.branch === "goods" && n.kind !== "goods-line");
    expect(goods.length).toBeGreaterThan(0);
    const head = goods[0]!;
    expect(head.mark).toBe("unreadable");
    expect(head.lines.join(" ")).toBe(
      "Could not read Purchasing for this line. This does not mean there is no purchase order.",
    );
    expect(map.nodes.some((n) => n.lines.includes("No Purchase Order yet"))).toBe(false);
    expect(goods.every((n) => !n.current && n.mark !== "complete")).toBe(true);
    expect(node(map, "logistics").mark).not.toBe("unreadable");
    expect(node(map, "money").mark).not.toBe("unreadable");
  });

  it("an unreadable node is never ticked, never CURRENT, and every edge out of it is dashed", () => {
    const map = resolveSalesOrderRoute(
      input({ unreadable: { delivery: true, payments: true, purchasing: true } }),
    );
    const failed = map.nodes.filter((n) => n.mark === "unreadable");
    expect(failed.length).toBeGreaterThan(3);
    for (const n of failed) {
      expect(n.current).toBe(false);
      for (const e of map.edges.filter((edge) => edge.from === n.id)) expect(e.style).toBe("dashed");
    }
    /* The map is still whole: no orphan, the Sales Order still the root. */
    expect(node(map, "sales-order").mark).toBe("complete");
  });
});

describe("PROPOSED CHANGE is announced above the map (owner ruling 2026-09-25)", () => {
  it("a submitted amendment: the fact with who and when, the door, the reading rule", () => {
    const map = resolveSalesOrderRoute(
      input({
        amendment: { status: "submitted", submittedAt: "2026-09-24", submittedBy: "Mei Ling" },
      }),
    );
    expect(map.proposedChange).toEqual({
      kind: "waiting",
      fact: "Mei Ling asked to change this order on 2026-09-24. The approver has not approved it yet.",
      changes: [],
      more: 0,
      door: { label: "Open the request →", href: "/operation/orders/so/order-1" },
      rule: "The map shows the order as it stands today, not the change.",
    });
  });

  it("an out of date request changes line 1 only", () => {
    const map = resolveSalesOrderRoute(
      input({ amendment: { status: "stale", submittedAt: "2026-09-24", submittedBy: "Mei Ling" } }),
    );
    expect(map.proposedChange?.fact).toBe(
      "Mei Ling asked to change this order on 2026-09-24. The order changed after that. Mei Ling must send the request again.",
    );
    expect(map.proposedChange?.rule).toBe("The map shows the order as it stands today, not the change.");
  });

  it("nothing waiting draws nothing, and the map itself never changes", () => {
    const plain = resolveSalesOrderRoute(input());
    expect(plain.proposedChange).toBeNull();
    const waiting = resolveSalesOrderRoute(
      input({ amendment: { status: "submitted", submittedAt: "2026-09-24", submittedBy: "Mei Ling" } }),
    );
    expect(waiting.nodes).toEqual(plain.nodes);
    expect(waiting.edges).toEqual(plain.edges);
  });

  it("a failed read of the change requests says so instead of drawing no banner", () => {
    const map = resolveSalesOrderRoute(input({ unreadable: { amendment: true } }));
    expect(map.proposedChange).toEqual({
      kind: "unreadable",
      fact: "Could not read the change requests for this order.",
      changes: [],
      more: 0,
      door: { label: "Try again →", href: "#retry-amendment" },
      rule: null,
    });
  });
});

describe("a node that acts still shows its door (approved mock 2026-09-26)", () => {
  it("PAYMENT owing carries Collect AND Open Payments, and the box is tall enough for both", () => {
    const map = resolveSalesOrderRoute(input());
    const payment = node(map, "money");
    expect(payment.action?.label).toBe("Collect");
    expect(payment.door).toEqual({ label: "Open Payments →", href: "/finance/payments?order=1319" });
    /* pad 22 + title 20 + the fact rows × 18 + action 22 + context 18 + door 18 */
    expect(payment.h).toBe(22 + 20 + payment.lines.length * 18 + 22 + 18 + 18);
  });
});

describe("nothing on a node is ever cut (measured 2026-09-27: spelled lines overflowed the 208px box)", () => {
  const spelled = (text: string) => text.replace(/\d{4}-\d{2}-\d{2}/g, "Thu, 24 Sep");

  it("wraps on a word, counts a date at its SPELLED length and never drops a word", () => {
    /* A row breaks at the ` · ` separator first: the line break does its work. */
    expect(wrapRouteText("RM 1,500.00 unpaid · by 2026-09-22", ROUTE_TEXT_BUDGET.line)).toEqual([
      "RM 1,500.00 unpaid",
      "by 2026-09-22",
    ]);
    /* An amount is one word: RM never ends a row with its number on the next. */
    expect(wrapRouteText("Customer has not paid RM 1,500.00", ROUTE_TEXT_BUDGET.line)).toEqual([
      "Customer has not paid",
      "RM 1,500.00",
    ]);
    /* Facts that fit one row stay on it, separator and all. */
    expect(wrapRouteText("Qty 3 · 2 on order", ROUTE_TEXT_BUDGET.line)).toEqual(["Qty 3 · 2 on order"]);
    /* One long fact is broken on a word, and no word is dropped. */
    const sentence = "This does not mean there is no purchase order.";
    const rows = wrapRouteText(sentence, ROUTE_TEXT_BUDGET.line);
    expect(rows.join(" ")).toBe(sentence);
    for (const row of rows) expect(spelled(row).length).toBeLessThanOrEqual(ROUTE_TEXT_BUDGET.line);
  });

  it("every fact line, requirement row and context row fits its budget, and the box is tall enough", () => {
    const map = resolveSalesOrderRoute(
      input({ financeExceptions: [{ id: "f", status: "open", reason: "Chargeback under investigation by the bank" }] }),
    );
    for (const n of map.nodes) {
      const budget = n.kind === "goods-line" || n.kind === "delivery-lane" ? ROUTE_TEXT_BUDGET.context : ROUTE_TEXT_BUDGET.line;
      for (const line of n.lines) expect(spelled(line).length).toBeLessThanOrEqual(budget);
      const reqRows = n.requirements.flatMap((r) => wrapRouteText(r.text, ROUTE_TEXT_BUDGET.requirement));
      const ctxRows = n.action ? wrapRouteText(n.action.context.detail, ROUTE_TEXT_BUDGET.context) : [];
      const expected =
        22 + 20 + n.lines.length * 18 + reqRows.length * 16 +
        (n.action ? 22 + ctxRows.length * 18 : 0) + (n.door ? 18 : 0);
      expect(n.h).toBe(expected);
    }
    const gate = node(map, "delivery-order");
    expect(gate.requirements.map((r) => r.text)).toContain("Customer has not paid RM 1,249.00");
  });
});

describe("every line names WHO (owner ruling 2026-09-27: who + object + who + action)", () => {
  it("the plate says who ordered what, and what Carres has not ordered", () => {
    const map = resolveSalesOrderRoute(input({ purchaseOrders: [po({ id: "PO-2048", lines: [{ sku: "B1201S", qty: 1, receivedQty: 0 }] })] }));
    expect(node(map, "B1201S:goods-line").lines).toEqual([
      "Customer ordered 3",
      "Carres ordered 1 from supplier",
      "Carres has not ordered 1 yet",
    ]);
  });

  it("the banner says WHAT changes, who asked and who decides", () => {
    const map = resolveSalesOrderRoute(
      input({
        amendment: {
          status: "submitted",
          submittedAt: "2026-09-23",
          submittedBy: "Shasha",
          approver: "Jess",
          changes: [
            { what: "Customer Requested Delivery Date", before: "2026-09-24", after: "2026-10-05" },
            { what: "Latex Pillow", before: "Qty 4", after: "Qty 2" },
            { what: "Address", before: "Not recorded", after: "12 Jalan Satu" },
            { what: "Phone", before: "012", after: "013" },
          ],
        },
      }),
    );
    expect(map.proposedChange?.fact).toBe(
      "Shasha asked to change this order on 2026-09-23. Jess has not approved it yet.",
    );
    expect(map.proposedChange?.changes).toEqual([
      "Customer Requested Delivery Date: 2026-09-24 → 2026-10-05",
      "Latex Pillow: Qty 4 → Qty 2",
      "Address: Not recorded → 12 Jalan Satu",
    ]);
    expect(map.proposedChange?.more).toBe(1);
  });

  it("no waiting or missing line is left without its subject, and no dash is printed", () => {
    const map = resolveSalesOrderRoute(input({ purchaseOrders: [] }));
    const printed = map.nodes.flatMap((n) => n.spoken);
    for (const retired of ["Not received yet", "Ready date not confirmed", "No Purchase Order yet", "Not scheduled yet", "Not delivered yet", "No delivery photo yet", "on order", "to buy"]) {
      expect(printed.join("\n")).not.toContain(retired);
    }
    expect(printed).toEqual(expect.arrayContaining([
      "Carres has not issued a Purchase Order",
      "Supplier has not confirmed the ready date",
      "Warehouse has not received the goods",
      "Logistics has not scheduled the delivery",
      "Logistics has not delivered the goods",
      "Logistics has not uploaded the delivery photo",
    ]));
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
 * SCOPE A2 · THE DELIVERY GROUP READS DELIVERY'S OWN RECORDS (owner ruling
 * 2026-09-26). A scope is one (leg, trip) of `ops_delivery_orders`; each takes
 * a lane. Measured on SO-1362: two arrangements, two Delivery Orders, two
 * delivered attempts — and the map printed `Logistics not assigned`.
 * ──────────────────────────────────────────────────────────────────────────── */

const scope = (over: Partial<RouteDeliveryScope> & { leg: number }): RouteDeliveryScope => ({
  trip: 0,
  plate: null,
  transfer: false,
  legStop: null,
  partnerName: null,
  confirmedDate: null,
  confirmedTime: null,
  deliveryOrder: null,
  tripGroups: null,
  attempts: [],
  handoverEvents: [],
  photos: [],
  ...over,
});

const journey = (): SalesOrderRouteInput =>
  input({
    order: {
      id: "order-1",
      so: 1362,
      customerName: "CARD 14 JOURNEY WALK",
      placedAt: "2026-09-13",
      deliveryDate: "2026-09-17",
      deliveredAt: "2026-09-13",
    },
    allocation: {
      orderId: "order-1",
      soRef: "SO-1362",
      lines: [
        line({
          sku: "JAGER-SS",
          committedQty: 1,
          soldUnits: [unit({ id: "u1", unitCode: "id-dtd627907", sku: "JAGER-SS", status: "sold" })],
          soldQty: 1,
        }),
      ],
      unmatchedUnits: [],
      totals: { committedQty: 1, reservedQty: 0, soldQty: 1, outstandingQty: 0 },
    },
    lineLabels: { "JAGER-SS": "Jager · Super Single" },
    purchaseOrders: [],
    money: { known: true, outstanding: 0 },
    delivery: {
      logistics: null,
      booking: null,
      attempts: [],
      scopes: [
        scope({
          leg: 1,
          plate: "Leg 1 · Carres Klang → JB transit warehouse",
          transfer: true,
          legStop: "JB transit warehouse",
          partnerName: "NETS",
          confirmedDate: "2026-09-15",
          confirmedTime: "10 AM to 1 PM",
          deliveryOrder: { id: "do-1", number: "DO-130926-0842" },
          attempts: [{ result: "delivered", reasonKey: null, recordedAt: "2026-09-13T04:00:00Z" }],
        }),
        scope({
          leg: 2,
          plate: "Leg 2 · JB transit warehouse → customer",
          partnerName: "AL",
          confirmedDate: "2026-09-17",
          confirmedTime: "2 PM to 5 PM",
          deliveryOrder: { id: "do-2", number: "DO-130926-3223" },
          attempts: [{ result: "delivered", reasonKey: null, recordedAt: "2026-09-13T08:00:00Z" }],
        }),
      ],
    },
  });

describe("one delivery scope is one lane (owner ruling 2026-09-26)", () => {
  it("SO-1362: two legs draw two lanes, two issued Delivery Orders, Delivered to customer and Customer paid in full", () => {
    const map = resolveSalesOrderRoute(journey());
    const plates = kinds(map, "delivery-lane");
    expect(plates.map((p) => p.spoken.join(" "))).toEqual([
      "Leg 1 · Carres Klang → JB transit warehouse",
      "Leg 2 · JB transit warehouse → customer",
    ]);
    expect(node(map, "logistics:1:0").spoken).toEqual(["NETS"]);
    expect(node(map, "logistics:2:0").spoken).toEqual(["AL"]);
    expect(node(map, "delivery-date:1:0").spoken).toEqual(["Scheduled delivery: 2026-09-15", "10 AM to 1 PM"]);
    const gates = kinds(map, "delivery-order");
    expect(gates.map((g) => g.spoken[0])).toEqual(["DO-130926-0842", "DO-130926-3223"]);
    expect(gates.every((g) => g.mark === "complete")).toBe(true);
    /* The door opens the document by its row id — a number may change format. */
    expect(gates[0]!.door).toEqual({ label: "Open DO-130926-0842 →", href: "/operation/delivery-orders/do-1" });
    expect(node(map, "deliver:1:0").spoken[0]).toBe("Arrived at JB transit warehouse");
    expect(node(map, "deliver:2:0").spoken[0]).toBe("Delivered to customer");
    expect(node(map, "money").spoken).toEqual(["Customer paid in full"]);
    expect(map.nodes.some((n) => n.spoken.includes("Logistics not assigned"))).toBe(false);
  });

  it("a transfer leg draws no DELIVERY PHOTO, and the last node of a lane has no trailing line", () => {
    const map = resolveSalesOrderRoute(journey());
    expect(map.nodes.some((n) => n.id === "delivery-photo:1:0")).toBe(false);
    expect(map.nodes.some((n) => n.id === "delivery-photo:2:0")).toBe(true);
    expect(map.edges.filter((e) => e.from === "deliver:1:0")).toHaveLength(0);
    expect(map.edges.filter((e) => e.from === "delivery-photo:2:0")).toHaveLength(0);
  });

  it("CURRENT stays ONE for the whole DELIVERY group — the earliest unfinished lane", () => {
    const base = journey();
    const map = resolveSalesOrderRoute({
      ...base,
      order: { ...base.order, deliveredAt: null },
      delivery: {
        ...base.delivery,
        scopes: [
          base.delivery.scopes![0]!,
          scope({ leg: 2, plate: "Leg 2 · JB transit warehouse → customer", partnerName: null }),
        ],
      },
    });
    const current = map.nodes.filter((n) => n.current && n.branch === "delivery");
    expect(current.map((n) => n.id)).toEqual(["logistics:2:0"]);
    expect(node(map, "logistics:2:0").spoken).toEqual(["Logistics not assigned"]);
  });

  it("leg 2's gate carries the extra requirement about leg 1, and every goods tail joins leg 1's gate", () => {
    const base = journey();
    const waiting = resolveSalesOrderRoute({
      ...base,
      order: { ...base.order, deliveredAt: null },
      delivery: {
        ...base.delivery,
        scopes: [
          scope({ ...base.delivery.scopes![0]!, deliveryOrder: null, attempts: [] }),
          scope({ ...base.delivery.scopes![1]!, deliveryOrder: null, attempts: [] }),
        ],
      },
    });
    const gate2 = node(waiting, "delivery-order:2:0");
    expect(gate2.requirements.map((r) => r.text)).toContain("Leg 1 not arrived yet");
    expect(node(waiting, "delivery-order:1:0").requirements.some((r) => r.id === "previous-leg")).toBe(false);
    expect(edge(waiting, "JAGER-SS:stock", "delivery-order:1:0")).toBeDefined();
    expect(edge(waiting, "JAGER-SS:stock", "delivery-order:2:0")).toBeUndefined();

    const arrived = resolveSalesOrderRoute({
      ...base,
      delivery: {
        ...base.delivery,
        scopes: [base.delivery.scopes![0]!, scope({ ...base.delivery.scopes![1]!, deliveryOrder: null, attempts: [] })],
      },
    });
    expect(node(arrived, "delivery-order:2:0").requirements).toContainEqual({
      id: "previous-leg",
      met: true,
      text: "Leg 1 arrived at JB transit warehouse",
    });
  });

  it("a split delivery: one lane per trip, and each goods tail joins the gate of the trip that carries it", () => {
    const map = resolveSalesOrderRoute(
      input({
        allocation: {
          orderId: "order-1",
          soRef: "SO-1319",
          lines: [
            line({ sku: "MS12 Firmcare 10inch Queen", committedQty: 1, reservedQty: 1, reservedUnits: [unit({ id: "m1", sku: "MS12 Firmcare 10inch Queen" })] }),
            line({ sku: "SF03 Muro 2 Seater", committedQty: 1, outstandingQty: 1 }),
          ],
          unmatchedUnits: [],
          totals: { committedQty: 2, reservedQty: 1, soldQty: 0, outstandingQty: 1 },
        },
        purchaseOrders: [],
        delivery: {
          logistics: null,
          booking: null,
          attempts: [],
          scopes: [
            scope({ leg: 0, trip: 1, plate: "Trip 1 · Mattress, 1 item", tripGroups: ["bed"], partnerName: "NETS", confirmedDate: "2026-09-22" }),
            scope({ leg: 0, trip: 2, plate: "Trip 2 · not booked yet", tripGroups: ["sofa"] }),
          ],
        },
      }),
    );
    expect(kinds(map, "delivery-lane").map((p) => p.spoken.join(" "))).toEqual([
      "Trip 1 · Mattress, 1 item",
      "Trip 2 · not booked yet",
    ]);
    expect(edge(map, "MS12 Firmcare 10inch Queen:stock", "delivery-order:0:1")).toBeDefined();
    expect(edge(map, "SF03 Muro 2 Seater:stock", "delivery-order:0:2")).toBeDefined();
    /* Readiness follows the shipment, not the whole Sales Order. */
    expect(node(map, "delivery-order:0:1").requirements.find((r) => r.id === "goods")).toEqual({
      id: "goods",
      met: true,
      text: "Warehouse has 1 Unit ready",
    });
    expect(node(map, "delivery-order:0:2").requirements.find((r) => r.id === "goods")?.met).toBe(false);
  });

  it("an ordinary order has one scope, no plate, and exactly the single chain — read from Delivery's record", () => {
    const map = resolveSalesOrderRoute(
      input({
        delivery: {
          /* The V1 booking fields say nothing; Delivery's own record does. */
          logistics: null,
          booking: null,
          attempts: [],
          scopes: [scope({ leg: 0, partnerName: "NETS", confirmedDate: "2026-09-30" })],
        },
      }),
    );
    expect(kinds(map, "delivery-lane")).toHaveLength(0);
    expect(node(map, "logistics").spoken).toEqual(["NETS"]);
    expect(node(map, "delivery-date").spoken).toEqual(["Scheduled delivery: 2026-09-30"]);
    expect(requirement(map, "logistics")).toEqual({ id: "logistics", met: true, text: "Logistics chosen (NETS)" });
    expect(node(map, "deliver").spoken[0]).toBe("Logistics has not delivered the goods");
    /* The payment deadline anchors on Delivery's scheduled day. */
    expect(node(map, "money").spoken[1]).toBe("Customer has not paid RM 1,249.00 · Customer must pay by 2026-09-28");
  });

  it("DELIVER prints Delivery's words through its one label function once a Delivery Order exists", () => {
    const map = resolveSalesOrderRoute(
      input({
        delivery: {
          logistics: null,
          booking: null,
          attempts: [],
          scopes: [
            scope({
              leg: 0,
              partnerName: "NETS",
              confirmedDate: "2026-09-30",
              deliveryOrder: { id: "do-9", number: "DO2609-4827" },
              handoverEvents: [{ kind: "received_by_logistics", recordedAt: "2026-09-30T01:00:00Z" }],
            }),
          ],
        },
      }),
    );
    expect(node(map, "deliver").spoken[0]).toBe("Collected by NETS");
    expect(node(map, "delivery-order").door?.href).toBe("/operation/delivery-orders/do-9");
  });

  it("no two nodes overlap and no node is an orphan on a two-lane map", () => {
    const map = resolveSalesOrderRoute(journey());
    for (const a of map.nodes) {
      for (const b of map.nodes) {
        if (a.id >= b.id) continue;
        const apart = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
        expect(apart, `${a.id} overlaps ${b.id}`).toBe(true);
      }
    }
    for (const n of map.nodes) {
      if (n.kind === "sales-order") continue;
      expect(map.edges.some((e) => e.to === n.id), `${n.id} is an orphan`).toBe(true);
    }
  });
});

describe("found on the rendered Journey (2026-09-28)", () => {
  it("the photo step names the day Delivery recorded, never `Delivery date not recorded` beside a delivered leg", () => {
    const map = resolveSalesOrderRoute({ ...journey(), order: { ...journey().order, deliveredAt: null } });
    const photo = node(map, "delivery-photo:2:0");
    expect(photo.action?.context.detail).toBe("DO-130926-3223 · Delivered: 2026-09-13");
  });

  it("a line into a lane's gate turns in the gap just above the gate, so it never runs behind a node", () => {
    const map = resolveSalesOrderRoute(journey());
    const gate = node(map, "delivery-order:1:0");
    for (const from of ["JAGER-SS:stock", "money"]) {
      const line = edge(map, from, "delivery-order:1:0")!;
      expect(line.late).toBe(true);
      const across = line.points[1]!.y;
      expect(across).toBe(line.points[2]!.y);
      expect(across).toBeLessThan(gate.y);
      expect(across).toBeGreaterThan(node(map, "delivery-date:1:0").y + node(map, "delivery-date:1:0").h);
    }
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
 * SCOPE A3 · THE GOODS CHAIN READS PURCHASING, RECEIVING AND STOCK (owner
 * ruling 2026-09-26), in the who + object + action grammar (2026-09-27).
 * ──────────────────────────────────────────────────────────────────────────── */

const goodsSource = (over: Partial<RouteGoodsSource> & { poId: string }): RouteGoodsSource => ({
  supplierName: "Ohana",
  sent: true,
  qty: 1,
  issuedAt: "2026-09-03",
  poDeliveryDate: "2026-09-18",
  expectedArrival: null,
  confirmed: false,
  dayBeforeCheckOpen: false,
  receivedQty: 0,
  pendingQty: 1,
  damagedOrWrongQty: 0,
  latestGrn: null,
  ...over,
});

const goodsLine = (over: Partial<RouteGoodsLine> & { lineId: string }): RouteGoodsLine => ({
  sku: "B1201S",
  label: "B1201S · King",
  qty: 1,
  sources: [],
  onOrderQty: 0,
  readyQty: 0,
  unitCodes: [],
  uncoveredQty: 1,
  shortBecause: "not-ordered",
  readyStockQty: 0,
  ...over,
});

describe("the goods chain reads its owners (owner ruling 2026-09-26)", () => {
  it("SO-1319: PO Delivery Date, the delayed arrival with its reason, and 0 of 1 received", () => {
    const map = resolveSalesOrderRoute(
      input({
        goods: [
          goodsLine({
            lineId: "L1",
            sources: [
              goodsSource({
                poId: "PO-20260903-4354",
                expectedArrival: { date: "2026-09-28", change: "delayed", reason: "Production delay" },
              }),
            ],
            onOrderQty: 1,
            uncoveredQty: 0,
            shortBecause: "not-received",
          }),
        ],
      }),
    );
    expect(node(map, "L1:goods-line").spoken).toEqual(["Customer ordered 1", "Carres ordered 1 from supplier"]);
    expect(node(map, "L1:PO-20260903-4354:purchasing").spoken).toEqual(["PO-20260903-4354", "Issued: 2026-09-03"]);
    expect(node(map, "L1:PO-20260903-4354:supplier").spoken).toEqual([
      "PO Delivery Date: 2026-09-18",
      "Expected arrival: 2026-09-28 · Delayed · Production delay",
    ]);
    expect(node(map, "L1:PO-20260903-4354:receiving").spoken).toEqual(["Warehouse received 0 of 1"]);
    expect(node(map, "L1:stock").spoken).toEqual([
      "Warehouse has 0 of 1 Units ready",
      "Warehouse has not received the goods",
    ]);
    const printed = map.nodes.flatMap((n) => n.spoken).join("\n");
    for (const retired of ["Estimated ready", "Create the Units", "to buy from factory", "Waiting for purchase"]) {
      expect(printed).not.toContain(retired);
    }
  });

  it("the supplier is asked for the Supplier DO ONLY while the day-before check is open, never a standing action", () => {
    const at = (dayBeforeCheckOpen: boolean) =>
      node(
        resolveSalesOrderRoute(
          input({
            goods: [
              goodsLine({
                lineId: "L1",
                sources: [goodsSource({ poId: "PO-1", dayBeforeCheckOpen })],
                onOrderQty: 1,
                uncoveredQty: 0,
                shortBecause: "not-received",
              }),
            ],
          }),
        ),
        "L1:PO-1:supplier",
      );
    expect(at(true).action?.label).toBe("Ask Ohana for the Supplier DO for PO-1");
    expect(at(false).action).toBeNull();
    /* Waiting on the supplier is not Carres' work: the position moves on. */
    expect(at(false).current).toBe(false);
  });

  it("an issued PO nobody has sent: PURCHASING owes `Send {PO No} to {Supplier}` and holds CURRENT", () => {
    const map = resolveSalesOrderRoute(
      input({
        goods: [
          goodsLine({
            lineId: "L1",
            sources: [goodsSource({ poId: "PO-1", sent: false, dayBeforeCheckOpen: true })],
            onOrderQty: 1,
            uncoveredQty: 0,
            shortBecause: "not-received",
          }),
        ],
      }),
    );
    const purchasing = node(map, "L1:PO-1:purchasing");
    expect(purchasing.mark).toBe("current");
    expect(purchasing.action?.label).toBe("Send PO-1 to Ohana");
    /* The supplier cannot be asked for a PO it was never sent. */
    expect(node(map, "L1:PO-1:supplier").action).toBeNull();
    expect(node(map, "L1:PO-1:supplier").current).toBe(false);
  });

  it("a long instruction wraps under the owner chip and the node grows for it — never an ellipsis", () => {
    const at = (supplierName: string) =>
      node(
        resolveSalesOrderRoute(
          input({
            goods: [
              goodsLine({
                lineId: "L1",
                sources: [goodsSource({ poId: "PO-20260903-4354", supplierName, dayBeforeCheckOpen: true })],
                onOrderQty: 1,
                uncoveredQty: 0,
                shortBecause: "not-received",
              }),
            ],
          }),
        ),
        "L1:PO-20260903-4354:supplier",
      );
    const long = at("Nice Future Furniture Sdn Bhd");
    const rows = wrapRouteText(long.action!.label, ROUTE_TEXT_BUDGET.action);
    expect(rows.length).toBeGreaterThan(1);
    expect(rows.every((row) => row.length <= ROUTE_TEXT_BUDGET.action || !row.includes(" "))).toBe(true);
    expect(long.h).toBeGreaterThan(at("Oh").h);
  });

  it("a sent PO completes PURCHASING and owes no send", () => {
    const map = resolveSalesOrderRoute(
      input({
        goods: [
          goodsLine({
            lineId: "L1",
            sources: [goodsSource({ poId: "PO-1", sent: true })],
            onOrderQty: 1,
            uncoveredQty: 0,
            shortBecause: "not-received",
          }),
        ],
      }),
    );
    expect(node(map, "L1:PO-1:purchasing").mark).toBe("complete");
    expect(node(map, "L1:PO-1:purchasing").action).toBeNull();
  });

  it("without goods facts STOCK never revives `Waiting for purchase` or `Create the Units`", () => {
    const map = resolveSalesOrderRoute(input());
    const words = map.nodes.flatMap((n) => [...n.lines, n.action?.label ?? ""]).join(" | ");
    for (const retired of ["Waiting for purchase", "Create the Units", "Confirm ready date"]) {
      expect(words).not.toContain(retired);
    }
    expect(node(map, "B1201S:stock").lines).toContain("Warehouse has not received");
  });

  it("partial receiving keeps its count after a receipt is posted, and RECEIVING holds CURRENT", () => {
    const map = resolveSalesOrderRoute(
      input({
        goods: [
          goodsLine({
            lineId: "L1",
            qty: 5,
            sources: [
              goodsSource({
                poId: "PO-1",
                qty: 5,
                confirmed: true,
                receivedQty: 3,
                pendingQty: 2,
                damagedOrWrongQty: 1,
                latestGrn: { id: "r2", number: "GRN2609-0041", receivedAt: "2026-09-19" },
              }),
            ],
            onOrderQty: 2,
            readyQty: 3,
            unitCodes: ["U1", "U2", "U3"],
            uncoveredQty: 0,
            shortBecause: "not-received",
          }),
        ],
      }),
    );
    const receiving = node(map, "L1:PO-1:receiving");
    expect(receiving.spoken).toEqual([
      "Warehouse received 3 of 5",
      "Latest: GRN2609-0041 · Received: 2026-09-19",
      "1 damaged or wrong",
    ]);
    expect(receiving.current).toBe(true);
    expect(receiving.action?.label).toBe("Check in");
    expect(receiving.door).toEqual({
      label: "Open GRN2609-0041 →",
      href: "/operation?tab=receiving&receipt=r2",
    });
  });

  it("received whole: the GRN and its day, a tick, and the Units by their IDs", () => {
    const map = resolveSalesOrderRoute(
      input({
        goods: [
          goodsLine({
            lineId: "L1",
            sources: [
              goodsSource({
                poId: "PO-1",
                confirmed: true,
                receivedQty: 1,
                pendingQty: 0,
                latestGrn: { id: "r1", number: "GRN2609-0040", receivedAt: "2026-09-18" },
              }),
            ],
            readyQty: 1,
            unitCodes: ["U1-000-231"],
            uncoveredQty: 0,
            shortBecause: null,
          }),
        ],
      }),
    );
    expect(node(map, "L1:PO-1:receiving")).toMatchObject({
      mark: "complete",
      spoken: ["GRN2609-0040 · Received: 2026-09-18"],
    });
    expect(node(map, "L1:stock")).toMatchObject({
      mark: "complete",
      spoken: ["Warehouse has 1 Unit ready", "U1-000-231"],
    });
    expect(node(map, "L1:goods-line").spoken).toEqual(["Customer ordered 1"]);
  });

  it("STOCK offers Choose Ready Unit only when eligible Ready Stock exists; otherwise the wait is not Stock's", () => {
    const offered = node(
      resolveSalesOrderRoute(input({ goods: [goodsLine({ lineId: "L1", readyStockQty: 2 })] })),
      "L1:stock",
    );
    expect(offered.action).toMatchObject({ ownerKey: "sales", label: "Choose Ready Unit" });
    expect(offered.door).toEqual({ label: "Open Ready Stock →", href: "/operation?tab=purchase&so=1319" });
    expect(offered.spoken).toEqual(["Warehouse has 0 of 1 Units ready", "Carres has not ordered the goods"]);
    const none = node(
      resolveSalesOrderRoute(input({ goods: [goodsLine({ lineId: "L1" })] })),
      "L1:stock",
    );
    expect(none.action).toBeNull();
    expect(none.current).toBe(false);
  });

  it("from shelf stock the purchase chain is omitted entirely", () => {
    const map = resolveSalesOrderRoute(
      input({
        goods: [goodsLine({ lineId: "L1", readyQty: 1, unitCodes: ["U9"], uncoveredQty: 0, shortBecause: null })],
      }),
    );
    expect(map.nodes.filter((n) => n.branch === "goods").map((n) => n.kind)).toEqual(["goods-line", "stock"]);
  });

  it("two lines of one SKU draw two lanes, and each Purchase Order stands in its own", () => {
    const map = resolveSalesOrderRoute(
      input({
        goods: [
          goodsLine({ lineId: "L1", sources: [goodsSource({ poId: "PO-1" })], onOrderQty: 1, uncoveredQty: 0, shortBecause: "not-received" }),
          goodsLine({ lineId: "L2", sources: [goodsSource({ poId: "PO-2" })], onOrderQty: 1, uncoveredQty: 0, shortBecause: "not-received" }),
        ],
      }),
    );
    expect(kinds(map, "goods-line").map((n) => n.id)).toEqual(["L1:goods-line", "L2:goods-line"]);
    expect(edge(map, "L1:goods-line", "L1:PO-1:purchasing")).toBeDefined();
    expect(edge(map, "L2:goods-line", "L2:PO-2:purchasing")).toBeDefined();
    expect(edge(map, "L1:goods-line", "L2:PO-2:purchasing")).toBeUndefined();
  });

  it("a failed Purchasing read yellows this line's chain only", () => {
    const map = resolveSalesOrderRoute(
      input({
        goods: [
          goodsLine({ lineId: "L1", sources: [goodsSource({ poId: "PO-1" })], onOrderQty: 1, uncoveredQty: 0, shortBecause: "not-received" }),
          goodsLine({ lineId: "L2", sku: "PILLOW", label: "Pillow", readyQty: 1, unitCodes: ["U2"], uncoveredQty: 0, shortBecause: null }),
        ],
        unreadable: { purchasing: ["L1"] },
      }),
    );
    expect(node(map, "L1:unreadable:purchasing").mark).toBe("unreadable");
    expect(node(map, "L1:stock").spoken).toEqual(["Warehouse has 0 of 1 Units ready"]);
    expect(node(map, "L2:stock").mark).toBe("complete");
    expect(map.nodes.filter((n) => n.mark === "unreadable").every((n) => n.id.startsWith("L1:"))).toBe(true);
  });

  it("the gate counts the Units bound to the lines", () => {
    const map = resolveSalesOrderRoute(
      input({
        goods: [
          goodsLine({ lineId: "L1", qty: 2, readyQty: 1, unitCodes: ["U1"], uncoveredQty: 1 }),
          goodsLine({ lineId: "L2", readyQty: 1, unitCodes: ["U2"], uncoveredQty: 0, shortBecause: null }),
        ],
      }),
    );
    expect(requirement(map, "goods")).toEqual({ id: "goods", met: false, text: "Warehouse has 2 of 3 Units ready" });
  });
});
