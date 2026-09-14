import { describe, expect, it } from "vitest";
import {
  sortWarehouseScheduleCards,
  warehouseArrivalScheduleCards,
  warehouseArrivalSourceFacts,
  warehousePickupScheduleCards,
  warehousePickupScopeKey,
  warehouseScheduleOperatingDates,
  warehouseSchedulePreviousFrom,
  type WarehouseArrivalSourceFacts,
  type WarehouseScheduleSettings,
} from "./warehouse-schedule";
import { warehouseOutboundCards } from "./warehouse-outbound";
import { deliveryWarehouseScheduleEvents } from "./delivery-warehouse-schedule";
import { inboundArrivals, type InboundInput } from "./warehouse-inbound";

const TODAY = "2026-09-14";

// ── Inbound fixtures ─────────────────────────────────────────────────────────
//
// Built through `inboundArrivals` on purpose, not hand-written InboundArrival
// objects: the projection under test must agree with the REAL Receiving
// arithmetic, and a hand-made row would let the two drift without failing.

function inboundInput(over: Partial<InboundInput> = {}): InboundInput {
  return {
    pos: [],
    sites: [{ id: "site-1", name: "Carres Klang" }],
    suppliers: [{ id: "sup-1", name: "Ohana" }],
    destinations: [],
    units: [],
    receipts: [],
    results: [],
    lines: [],
    skuNames: [],
    ...over,
  } as InboundInput;
}

function po(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    version: 1,
    supplier_id: "sup-1",
    warehouse_id: "site-1",
    destination_id: null,
    status: "open",
    official_delivery_date: null,
    eta_date: "2026-09-20",
    placed_at: "2026-09-01",
    so: 1362,
    ...over,
  } as InboundInput["pos"][number];
}

function unit(id: string, poNo: string, sku: string) {
  return { id, unit_code: id.toUpperCase(), po_no: poNo, qty: 1, sku };
}

describe("arrival cards — one card per ARRANGEMENT, never per supplier-day", () => {
  it("keeps TWO POs as two cards even on the same supplier and date", () => {
    const input = inboundInput({
      pos: [po("PO-A"), po("PO-B")],
      lines: [
        { po_id: "PO-A", qty: 1, destination_id: null, sku: "sofa:Muro-K" },
        { po_id: "PO-B", qty: 1, destination_id: null, sku: "sofa:Muro-K" },
      ],
      units: [unit("u1", "PO-A", "sofa:Muro-K"), unit("u2", "PO-B", "sofa:Muro-K")],
    });
    const cards = warehouseArrivalScheduleCards(
      inboundArrivals(input),
      warehouseArrivalSourceFacts(input),
      TODAY,
    );
    expect(cards).toHaveLength(2);
    expect(cards.map((c) => c.sourceRef).sort()).toEqual(["PO-A", "PO-B"]);
    // Two source cards means two distinct card identities.
    expect(new Set(cards.map((c) => c.id)).size).toBe(2);
  });

  it("keeps ONE PO of Sofa + Bedframe as one card with two separate lines", () => {
    const input = inboundInput({
      pos: [po("PO-A")],
      lines: [
        { po_id: "PO-A", qty: 1, destination_id: null, sku: "sofa:Muro-K" },
        { po_id: "PO-A", qty: 2, destination_id: null, sku: "bedframe:Jager-Q" },
      ],
      units: [
        unit("u1", "PO-A", "sofa:Muro-K"),
        unit("u2", "PO-A", "bedframe:Jager-Q"),
        unit("u3", "PO-A", "bedframe:Jager-Q"),
      ],
    });
    const [card] = warehouseArrivalScheduleCards(
      inboundArrivals(input),
      warehouseArrivalSourceFacts(input),
      TODAY,
    );
    expect(card.lines).toHaveLength(2);
    expect(card.lines.map((l) => l.categoryKey).sort()).toEqual([
      "Bedframe",
      "Sofa",
    ]);
    expect(card.lines.map((l) => l.plannedQty).sort()).toEqual([1, 2]);
  });

  it("keeps REPEATED lines of the same model apart instead of merging them", () => {
    const input = inboundInput({
      pos: [po("PO-A")],
      lines: [
        { po_id: "PO-A", qty: 1, destination_id: null, sku: "sofa:Muro-K" },
        { po_id: "PO-A", qty: 1, destination_id: null, sku: "sofa:Muro-K" },
      ],
      units: [unit("u1", "PO-A", "sofa:Muro-K"), unit("u2", "PO-A", "sofa:Muro-K")],
    });
    const [card] = warehouseArrivalScheduleCards(
      inboundArrivals(input),
      warehouseArrivalSourceFacts(input),
      TODAY,
    );
    expect(card.lines).toHaveLength(2);
    expect(new Set(card.lines.map((l) => l.id)).size).toBe(2);
    // A Unit carries PO lineage but no PO-LINE lineage, so neither repeated
    // line may claim a share of the receipts. Unknown, not an invented split.
    expect(card.lines.map((l) => l.receivedQty)).toEqual([null, null]);
  });
});

describe("arrival receipt evidence — unknown, zero, partial, full, damaged", () => {
  function receiptCase(results: InboundInput["results"]) {
    const input = inboundInput({
      pos: [po("PO-A")],
      lines: [{ po_id: "PO-A", qty: 2, destination_id: null, sku: "sofa:Muro-K" }],
      units: [unit("u1", "PO-A", "sofa:Muro-K"), unit("u2", "PO-A", "sofa:Muro-K")],
      receipts: [
        {
          id: "r1",
          po_id: "PO-A",
          status: "posted",
          posted_at: "2026-09-10",
          grn_no: "GRN-1",
        },
      ],
      results,
    });
    const [card] = warehouseArrivalScheduleCards(
      inboundArrivals(input),
      warehouseArrivalSourceFacts(input),
      TODAY,
    );
    return card;
  }

  it("reports a CONFIRMED ZERO as 0, not as null", () => {
    const card = receiptCase([
      { receipt_id: "r1", stock_item_id: "u1", outcome: "not_received", issue_kind: null },
      { receipt_id: "r1", stock_item_id: "u2", outcome: "not_received", issue_kind: null },
    ]);
    expect(card.lines[0].receivedQty).toBe(0);
    expect(card.lines[0].damagedQty).toBe(0);
  });

  it("reports a PARTIAL receipt at the line's own scope", () => {
    const card = receiptCase([
      { receipt_id: "r1", stock_item_id: "u1", outcome: "received", issue_kind: null },
      { receipt_id: "r1", stock_item_id: "u2", outcome: "not_received", issue_kind: null },
    ]);
    expect(card.lines[0].plannedQty).toBe(2);
    expect(card.lines[0].receivedQty).toBe(1);
  });

  it("reports a FULL receipt and clears overdue", () => {
    const card = receiptCase([
      { receipt_id: "r1", stock_item_id: "u1", outcome: "received", issue_kind: null },
      { receipt_id: "r1", stock_item_id: "u2", outcome: "received", issue_kind: null },
    ]);
    expect(card.lines[0].receivedQty).toBe(2);
    expect(card.overdue).toBe(false);
  });

  it("counts a DAMAGED Unit inside receivedQty, and again on its own", () => {
    const card = receiptCase([
      { receipt_id: "r1", stock_item_id: "u1", outcome: "received", issue_kind: null },
      {
        receipt_id: "r1",
        stock_item_id: "u2",
        outcome: "received_with_issue",
        issue_kind: "damaged",
      },
    ]);
    // The damaged Unit ARRIVED. It is in received; the two never sum to 3.
    expect(card.lines[0].receivedQty).toBe(2);
    expect(card.lines[0].damagedQty).toBe(1);
  });

  it("does not count a WRONG ITEM as damage, but still as received", () => {
    const card = receiptCase([
      { receipt_id: "r1", stock_item_id: "u1", outcome: "received", issue_kind: null },
      {
        receipt_id: "r1",
        stock_item_id: "u2",
        outcome: "received_with_issue",
        issue_kind: "wrong_item",
      },
    ]);
    expect(card.lines[0].receivedQty).toBe(2);
    expect(card.lines[0].damagedQty).toBe(0);
  });

  it("reports UNKNOWN as null on a source whose lines are its own Units", () => {
    // A posted session with no mapped results: Receiving's own `unknown`.
    const input = inboundInput({
      arrivalSources: [
        {
          id: "src-1",
          source_no: "TR-001",
          kind: "transfer",
          from_site_id: null,
          to_site_id: "site-1",
          party_id: null,
          expected_date: "2026-09-20",
          cancelled_at: null,
        },
      ] as unknown as InboundInput["arrivalSources"],
      sourceUnits: [
        { source_id: "src-1", stock_item_id: "u1" },
      ] as unknown as InboundInput["sourceUnits"],
      units: [unit("u1", "", "sofa:Muro-K")],
      receipts: [
        {
          id: "r1",
          po_id: null,
          arrival_source_id: "src-1",
          status: "posted",
          posted_at: "2026-09-10",
          grn_no: "GRN-9",
        },
      ],
      results: [],
    });
    const [card] = warehouseArrivalScheduleCards(
      inboundArrivals(input),
      warehouseArrivalSourceFacts(input),
      TODAY,
    );
    expect(card.kind).toBe("transfer");
    expect(card.lines[0].receivedQty).toBeNull();
    expect(card.lines[0].damagedQty).toBeNull();
  });
});

describe("arrival dateStatus — a date alone is not an agreement", () => {
  const EVIDENCED = {
    po_id: "PO-A",
    po_version: 1,
    kind: "tomorrow_delivery",
    answer: "confirmed",
    new_date: "2026-09-22",
    about_date: null,
    previous_date: null,
    reason: null,
    channel: "whatsapp",
    recipient: "Ohana group",
    evidence: "shot.png",
    reported_by: "Lim",
    reported_at: "2026-09-11T02:00:00Z",
    recorded_by: "user-1",
    recorded_at: "2026-09-11T03:00:00Z",
  };

  it("calls a bare eta_date EXPECTED", () => {
    const [fact] = warehouseArrivalSourceFacts({ pos: [po("PO-A")] });
    expect(fact.dateStatus).toBe("expected");
  });

  it("does NOT let official_delivery_date claim an agreement", () => {
    // 0428 stamps it from the birth eta_date by trigger — an estimate in a
    // formal coat. If this ever returns "scheduled", the rule has been lost.
    const [fact] = warehouseArrivalSourceFacts({
      pos: [po("PO-A", { eta_date: null, official_delivery_date: "2026-09-20" })],
    });
    expect(fact.dateStatus).toBe("expected");
  });

  it("calls an EVIDENCED supplier reply SCHEDULED", () => {
    const [fact] = warehouseArrivalSourceFacts({
      pos: [po("PO-A")],
      promises: [EVIDENCED] as never,
    });
    expect(fact.dateStatus).toBe("scheduled");
  });

  it("refuses SCHEDULED when the reply carries no evidence", () => {
    const [fact] = warehouseArrivalSourceFacts({
      pos: [po("PO-A")],
      promises: [{ ...EVIDENCED, evidence: null }] as never,
    });
    expect(fact.dateStatus).toBe("expected");
  });

  it("reports NO date and NO status when the PO has neither", () => {
    const [fact] = warehouseArrivalSourceFacts({
      pos: [po("PO-A", { eta_date: null, official_delivery_date: null })],
    });
    expect(fact.dateStatus).toBeNull();
  });
});

describe("arrival — cancelled sources, overdue and links", () => {
  it("renders NO card for a cancelled PO", () => {
    const input = inboundInput({
      pos: [po("PO-A", { status: "cancelled" })],
      units: [unit("u1", "PO-A", "sofa:Muro-K")],
    });
    const cards = warehouseArrivalScheduleCards(
      inboundArrivals(input),
      warehouseArrivalSourceFacts(input),
      TODAY,
    );
    expect(cards).toHaveLength(0);
  });

  it("marks a past-dated arrangement with work still owing OVERDUE", () => {
    const input = inboundInput({
      pos: [po("PO-A", { eta_date: "2026-09-01" })],
      lines: [{ po_id: "PO-A", qty: 1, destination_id: null, sku: "sofa:Muro-K" }],
      units: [unit("u1", "PO-A", "sofa:Muro-K")],
    });
    const [card] = warehouseArrivalScheduleCards(
      inboundArrivals(input),
      warehouseArrivalSourceFacts(input),
      TODAY,
    );
    expect(card.overdue).toBe(true);
  });

  it("opens the AUTHORIZED source scope — date, Site ID and source record", () => {
    const input = inboundInput({
      pos: [po("PO-A")],
      lines: [{ po_id: "PO-A", qty: 1, destination_id: null, sku: "sofa:Muro-K" }],
      units: [unit("u1", "PO-A", "sofa:Muro-K")],
    });
    const [card] = warehouseArrivalScheduleCards(
      inboundArrivals(input),
      warehouseArrivalSourceFacts(input),
      TODAY,
    );
    const url = new URL(card.openHref!, "https://x.test");
    expect(url.searchParams.get("tab")).toBe("warehouse-inbound");
    expect(url.searchParams.get("site")).toBe("site-1");
    expect(url.searchParams.get("source")).toBe("PO-A");
    expect(url.searchParams.get("date")).toBe("2026-09-20");
    expect(card.detailHref).toBe("/operation/procurement/PO-A");
    // `so` is a LABEL Purchasing carries, never a record id — so it names the
    // Sales Order and is never built into a link.
    expect(card.soRef).toBe("SO-1362");
    expect(card.relatedRecords.every((r) => r.href.startsWith("/operation"))).toBe(
      true,
    );
  });
});

// ── Pickup fixtures ──────────────────────────────────────────────────────────

function pickupEvents(
  units: Array<{ unitId: string; sku: string; handed?: boolean; confirmed?: boolean }>,
  over: Record<string, unknown> = {},
) {
  return units.flatMap((u) =>
    deliveryWarehouseScheduleEvents({
      unitId: u.unitId,
      deliveryOrderId: "do-1",
      orderId: "order-1",
      leg: 0,
      so: 1362,
      fromLocation: "Carres Klang",
      warehouseSiteId: "site-1",
      toCustomer: "12 Jalan Test",
      logisticsPartner: "NETS",
      driverName: null,
      vehicle: null,
      doNumber: "DO-1",
      collectionDate: "2026-09-20",
      collectionWindow: null,
      customerHandoverDate: null,
      actualCollectionAt: null,
      actualArrivalAt: null,
      hasCollectionEvidence: false,
      hasDeliveryEvidence: false,
      sku: u.sku,
      productName: null,
      unitHandedOverAt: u.handed ? "2026-09-20T02:00:00Z" : null,
      unitDriverConfirmedAt: u.confirmed ? "2026-09-20T03:00:00Z" : null,
      ...over,
    }),
  );
}

describe("pickup cards — one card per DELIVERY SCOPE", () => {
  it("keeps ONE mixed-category delivery scope as one card", () => {
    const cards = warehousePickupScheduleCards(
      warehouseOutboundCards(
        pickupEvents([
          { unitId: "U-1", sku: "sofa:Muro-K" },
          { unitId: "U-2", sku: "mattress:Breeze-Q" },
        ]),
      ),
      TODAY,
    );
    // Mixed categories alone never split the card.
    expect(cards).toHaveLength(1);
    expect(cards[0].lines).toHaveLength(2);
    expect(cards[0].lines.map((l) => l.categoryKey).sort()).toEqual([
      "Mattress",
      "Sofa",
    ]);
  });

  it("keeps two Units of the SAME model as two lines with their own ids", () => {
    const [card] = warehousePickupScheduleCards(
      warehouseOutboundCards(
        pickupEvents([
          { unitId: "U-1", sku: "sofa:Muro-K" },
          { unitId: "U-2", sku: "sofa:Muro-K" },
        ]),
      ),
      TODAY,
    );
    expect(card.lines.map((l) => l.id).sort()).toEqual(["U-1", "U-2"]);
  });

  it("keeps LOADING and DRIVER ACCEPTANCE as two separate facts", () => {
    const [card] = warehousePickupScheduleCards(
      warehouseOutboundCards(
        pickupEvents([
          // Loaded by the warehouse, NOT confirmed by the driver.
          { unitId: "U-1", sku: "sofa:Muro-K", handed: true },
          // Confirmed by the driver with NO warehouse loading record.
          { unitId: "U-2", sku: "sofa:Muro-K", confirmed: true },
        ]),
      ),
      TODAY,
    );
    expect(card.lines.find((l) => l.id === "U-1")!.loadedQty).toBe(1);
    expect(card.lines.find((l) => l.id === "U-2")!.loadedQty).toBe(0);
    // One loaded, one driver-confirmed — the counts disagree, and they must.
    expect(card.driverConfirmedQty).toBe(1);
    expect(card.lines.reduce((n, l) => n + (l.loadedQty ?? 0), 0)).toBe(1);
  });

  it("never borrows a receiving or damage fact onto a pickup line", () => {
    const [card] = warehousePickupScheduleCards(
      warehouseOutboundCards(pickupEvents([{ unitId: "U-1", sku: "sofa:Muro-K" }])),
      TODAY,
    );
    expect(card.lines[0].receivedQty).toBeNull();
    expect(card.lines[0].damagedQty).toBeNull();
  });

  it("marks an unfinished past pickup OVERDUE and links the real records", () => {
    const [card] = warehousePickupScheduleCards(
      warehouseOutboundCards(
        pickupEvents([{ unitId: "U-1", sku: "sofa:Muro-K" }], {
          collectionDate: "2026-09-01",
        }),
      ),
      TODAY,
    );
    expect(card.overdue).toBe(true);
    expect(card.detailHref).toBe("/operation/delivery-orders/DO-1");
    const url = new URL(card.openHref!, "https://x.test");
    expect(url.searchParams.get("tab")).toBe("warehouse-outbound");
    expect(url.searchParams.get("site")).toBe("site-1");
    expect(url.searchParams.get("do")).toBe("DO-1");
    expect(card.relatedRecords[0].href).toBe("/operation/orders/so/order-1");
  });
});

describe("pickup dateStatus — the partner's reply is the agreement", () => {
  const cards = () =>
    warehouseOutboundCards(pickupEvents([{ unitId: "U-1", sku: "sofa:Muro-K" }]));

  it("is EXPECTED when only a confirmed_date exists", () => {
    // Prepared, copied, opened or sent never means confirmed.
    const [card] = warehousePickupScheduleCards(cards(), TODAY);
    expect(card.dateStatus).toBe("expected");
  });

  it("is SCHEDULED once the partner's reply is on file", () => {
    const [card] = warehousePickupScheduleCards(
      cards(),
      TODAY,
      new Set([warehousePickupScopeKey("order-1", 0)]),
    );
    expect(card.dateStatus).toBe("scheduled");
  });

  it("does not let one scope's proof upgrade a different scope", () => {
    const [card] = warehousePickupScheduleCards(
      cards(),
      TODAY,
      new Set([warehousePickupScopeKey("order-1", 3)]),
    );
    expect(card.dateStatus).toBe("expected");
  });
});

describe("no-date work survives the window", () => {
  it("keeps an undated arrangement in the result, sorted last", () => {
    const input = inboundInput({
      pos: [
        po("PO-DATED", { eta_date: "2026-09-20" }),
        po("PO-UNDATED", { eta_date: null }),
      ],
      units: [
        unit("u1", "PO-DATED", "sofa:Muro-K"),
        unit("u2", "PO-UNDATED", "sofa:Muro-K"),
      ],
    });
    const cards = sortWarehouseScheduleCards(
      warehouseArrivalScheduleCards(
        inboundArrivals(input),
        warehouseArrivalSourceFacts(input),
        TODAY,
      ),
    );
    expect(cards.map((c) => c.sourceRef)).toEqual(["PO-DATED", "PO-UNDATED"]);
    const undated = cards[1];
    expect(undated.date).toBeNull();
    expect(undated.dateStatus).toBeNull();
    // Absence is not lateness.
    expect(undated.overdue).toBe(false);
  });
});

describe("operating dates come from the CONFIGURED Site schedule", () => {
  const settings = (
    over: Partial<WarehouseScheduleSettings> = {},
  ): WarehouseScheduleSettings =>
    ({
      siteStatus: "active",
      workingHours: [],
      specialDates: [],
      holidayPolicy: null,
      holidayDates: [],
      ...over,
    }) as WarehouseScheduleSettings;

  it("falls back to the GOVERNED WEEK when settings are unreadable", () => {
    /* CORRECTED 2026-09-14 after the production finding. This test used to
       assert that Sunday 2026-09-20 was KEPT — it encoded the defect as law.
       Knowing nothing about the configuration is not a reason to contradict
       the approved operating week. */
    const dates = warehouseScheduleOperatingDates("2026-09-18", 4, "arrival", null);
    expect(dates).toEqual(["2026-09-18", "2026-09-19", "2026-09-21", "2026-09-22"]);
  });

  it("keeps an unconfigured WEEKDAY — nobody said is not closed", () => {
    // Fri and Sat carry no configuration and are kept; only the governed
    // weekly closure is skipped, and it is skipped because it is APPROVED,
    // not because this function invented it.
    const dates = warehouseScheduleOperatingDates(
      "2026-09-18",
      3,
      "arrival",
      settings(),
    );
    expect(dates).toEqual(["2026-09-18", "2026-09-19", "2026-09-21"]);
  });

  it("drops a date the configuration proves CLOSED", () => {
    const dates = warehouseScheduleOperatingDates(
      "2026-09-18",
      3,
      "arrival",
      settings({
        specialDates: [
          { onDate: "2026-09-19", kind: "closed_all_day", opensAt: null, closesAt: null },
        ] as WarehouseScheduleSettings["specialDates"],
      }),
    );
    expect(dates).toEqual(["2026-09-18", "2026-09-21", "2026-09-22"]);
  });

  it("reads ARRIVAL against Receiving hours and PICKUP against Collection", () => {
    const only = settings({
      specialDates: [
        {
          onDate: "2026-09-19",
          kind: "receiving_unavailable",
          opensAt: null,
          closesAt: null,
        },
      ] as WarehouseScheduleSettings["specialDates"],
    });
    expect(
      warehouseScheduleOperatingDates("2026-09-18", 2, "arrival", only),
    ).toEqual(["2026-09-18", "2026-09-21"]);
    // The same date stays open for collection — the two acts are configured
    // separately and one may never speak for the other.
    expect(warehouseScheduleOperatingDates("2026-09-18", 2, "pickup", only)).toEqual([
      "2026-09-18",
      "2026-09-19",
    ]);
  });
});

describe("existing consumers stay compatible", () => {
  it("leaves warehouseOutboundCards' own contract untouched", () => {
    const [card] = warehouseOutboundCards(
      pickupEvents([
        { unitId: "U-1", sku: "sofa:Muro-K", handed: true },
        { unitId: "U-2", sku: "sofa:Muro-K" },
      ]),
    );
    // The Monitor and Outbound Register read these; the Schedule adds to them
    // and replaces none of them.
    expect(card.unitsRequired).toBe(2);
    expect(card.handedOver).toBe(1);
    expect(card.notHandedOver).toBe(1);
    expect(card.products).toHaveLength(1);
  });

  it("leaves inboundArrivals' own contract untouched", () => {
    const input = inboundInput({
      pos: [po("PO-A")],
      lines: [{ po_id: "PO-A", qty: 1, destination_id: null, sku: "sofa:Muro-K" }],
      units: [unit("u1", "PO-A", "sofa:Muro-K")],
    });
    const [arrival] = inboundArrivals(input);
    expect(arrival.expected).toBe(1);
    expect(arrival.remaining).toBe(1);
    expect(arrival.products).toHaveLength(1);
  });
});

describe("facts scoping", () => {
  it("does not let one PO's ordered lines leak onto another PO's card", () => {
    const facts: WarehouseArrivalSourceFacts[] = warehouseArrivalSourceFacts({
      pos: [po("PO-A"), po("PO-B")],
      lines: [
        { id: "l1", po_id: "PO-A", qty: 1, sku: "sofa:Muro-K" },
        { id: "l2", po_id: "PO-B", qty: 5, sku: "mattress:Breeze-Q" },
      ],
    });
    expect(facts.find((f) => f.sourceId === "PO-A")!.lines).toEqual([
      { id: "l1", sku: "sofa:Muro-K", qty: 1 },
    ]);
    expect(facts.find((f) => f.sourceId === "PO-B")!.lines).toEqual([
      { id: "l2", sku: "mattress:Breeze-Q", qty: 5 },
    ]);
  });
});

describe("the governed weekly closure survives an UNCONFIGURED Site", () => {
  /* PRODUCTION, 2026-09-14: `warehouse_working_hours` holds ZERO rows for the
     one Site, so every weekday resolves `not_configured`. The Schedule then
     showed `Sun 20 Sept — Fri 25 Sept`. The Stock MASTER's own worked example
     for the strip is `Tue 1 · Wed 2 · Thu 3 · Fri 4 · Sat 5 · Mon 7 Sep` —
     Sunday 6 Sep omitted — so an unconfigured Site must still omit the
     governed weekly closure. Configuration OVERRIDES it; silence does not
     delete it. */
  const unconfigured = {
    siteStatus: "active",
    workingHours: [],
    specialDates: [],
    holidayPolicy: null,
    holidayDates: [],
  } as unknown as WarehouseScheduleSettings;

  it("reproduces the MASTER's worked example from Tue 1 Sep", () => {
    expect(
      warehouseScheduleOperatingDates("2026-09-01", 6, "arrival", unconfigured),
    ).toEqual([
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
      "2026-09-04",
      "2026-09-05",
      "2026-09-07",
    ]);
  });

  it("omits Sunday when the window is ADVANCED onto one", () => {
    // The reported production window. 2026-09-20 is a Sunday.
    expect(
      warehouseScheduleOperatingDates("2026-09-20", 6, "arrival", unconfigured),
    ).not.toContain("2026-09-20");
  });

  it("reproduces the EXACT reported production advance, corrected", () => {
    /* The operator was on 14–19 Sept (Mon–Sat). The board advances by setting
       `from` to the day after the last date shown — 2026-09-20, a Sunday —
       and the strip then read `Sun 20 Sept — Fri 25 Sept`. With the closure
       restored the same advance lands on Mon 21 — Sat 26. */
    const firstWindow = warehouseScheduleOperatingDates(
      "2026-09-14",
      6,
      "arrival",
      unconfigured,
    );
    expect(firstWindow).toEqual([
      "2026-09-14",
      "2026-09-15",
      "2026-09-16",
      "2026-09-17",
      "2026-09-18",
      "2026-09-19",
    ]);
    // The advance anchor A uses: the day after the last date shown.
    const advanced = warehouseScheduleOperatingDates(
      "2026-09-20",
      6,
      "arrival",
      unconfigured,
    );
    expect(advanced).toEqual([
      "2026-09-21",
      "2026-09-22",
      "2026-09-23",
      "2026-09-24",
      "2026-09-25",
      "2026-09-26",
    ]);
  });

  it("omits Sunday when settings cannot be read at all", () => {
    expect(
      warehouseScheduleOperatingDates("2026-09-20", 6, "arrival", null),
    ).not.toContain("2026-09-20");
  });

  it("KEEPS a Sunday the Site explicitly configured OPEN", () => {
    // Configuration outranks the default closure in both directions.
    const sundayOpen = {
      ...unconfigured,
      workingHours: [
        {
          weekday: 0,
          activity: "receiving",
          closed: false,
          opensAt: "09:00",
          closesAt: "17:00",
        },
      ],
    } as unknown as WarehouseScheduleSettings;
    expect(
      warehouseScheduleOperatingDates("2026-09-20", 3, "arrival", sundayOpen),
    ).toContain("2026-09-20");
  });

  it("still drops a weekday the Site explicitly configured CLOSED", () => {
    const mondayClosed = {
      ...unconfigured,
      workingHours: [
        { weekday: 1, activity: "receiving", closed: true, opensAt: null, closesAt: null },
      ],
    } as unknown as WarehouseScheduleSettings;
    expect(
      warehouseScheduleOperatingDates("2026-09-21", 3, "arrival", mondayClosed),
    ).not.toContain("2026-09-21");
  });
});

describe("undated work is REACHABLE, not merely counted", () => {
  it("leads to each exact record with Site and direction preserved", () => {
    const input = inboundInput({
      pos: [
        po("PO-DATED", { eta_date: "2026-09-20" }),
        po("PO-UNDATED", { eta_date: null, official_delivery_date: null }),
      ],
      lines: [
        { po_id: "PO-UNDATED", qty: 1, destination_id: null, sku: "sofa:Muro-K" },
      ],
      units: [
        unit("u1", "PO-DATED", "sofa:Muro-K"),
        unit("u2", "PO-UNDATED", "sofa:Muro-K"),
      ],
    });
    const cards = warehouseArrivalScheduleCards(
      inboundArrivals(input),
      warehouseArrivalSourceFacts(input),
      TODAY,
    );
    const undated = cards.filter((c) => c.date === null);
    expect(undated).toHaveLength(1);
    const url = new URL(undated[0].openHref!, "https://x.test");
    // The direction and the Site survive the jump...
    expect(url.searchParams.get("tab")).toBe("warehouse-inbound");
    expect(url.searchParams.get("site")).toBe("site-1");
    expect(url.searchParams.get("source")).toBe("PO-UNDATED");
    // ...and NO date is invented, which is what keeps the row findable: a
    // date filter would exclude the very record the link is for.
    expect(url.searchParams.get("date")).toBeNull();
    expect(undated[0].overdue).toBe(false);
    expect(undated[0].dateStatus).toBeNull();
  });
});


describe("categoryKey asks the CATALOG, not the SKU text", () => {
  /* MEASURED ON PRODUCTION 2026-09-14. The governed ladder
     (`goodsCategoryWordOf`) asks a recorded category, then the catalog, then
     a keyword classifier. I was calling it with the SKU alone, so the top two
     rungs were empty and only the classifier ever ran. 15 of the 37 distinct
     SKUs on the live purchasing surface rendered `Other goods` while the
     catalog knew exactly what they were — every `5539-*` and `LYYAR-*` sofa
     among them, which are the very families `line-category.ts` names as the
     trap that adding keywords rebuilds. */
  const input = () =>
    inboundInput({
      pos: [po("PO-A")],
      lines: [
        { po_id: "PO-A", qty: 1, destination_id: null, sku: "5539-CNR" },
        { po_id: "PO-A", qty: 1, destination_id: null, sku: "N1001S-Q" },
      ],
      units: [unit("u1", "PO-A", "5539-CNR"), unit("u2", "PO-A", "N1001S-Q")],
    });

  it("reads the catalog category when it is supplied", () => {
    const i = input();
    const [card] = warehouseArrivalScheduleCards(
      inboundArrivals(i),
      warehouseArrivalSourceFacts(i),
      TODAY,
      new Map([
        ["5539-CNR", "sofa"],
        ["N1001S-Q", "mattress"],
      ]),
    );
    expect(card.lines.map((l) => l.categoryKey)).toEqual(["Sofa", "Mattress"]);
  });

  it("falls through to the classifier only where the catalog is SILENT", () => {
    const i = input();
    const [card] = warehouseArrivalScheduleCards(
      inboundArrivals(i),
      warehouseArrivalSourceFacts(i),
      TODAY,
      new Map([["5539-CNR", null]]),
    );
    // Catalog asked and silent, and no keyword recognises it — it says so
    // rather than claiming a category nobody recorded.
    expect(card.lines[0].categoryKey).toBe("Other goods");
  });

  it("lets the CATALOG outrank a keyword the classifier would have matched", () => {
    const i = inboundInput({
      pos: [po("PO-A")],
      lines: [{ po_id: "PO-A", qty: 1, destination_id: null, sku: "CODY-K" }],
      units: [unit("u1", "PO-A", "CODY-K")],
    });
    // `cody` is a bedframe keyword; the catalog is still the authority.
    expect(
      warehouseArrivalScheduleCards(
        inboundArrivals(i),
        warehouseArrivalSourceFacts(i),
        TODAY,
        new Map([["CODY-K", "sofa"]]),
      )[0].lines[0].categoryKey,
    ).toBe("Sofa");
  });

  it("applies the catalog to UNIT-derived lines too", () => {
    const i = inboundInput({
      arrivalSources: [
        {
          id: "src-1",
          source_no: "TR-001",
          kind: "transfer",
          from_site_id: null,
          to_site_id: "site-1",
          party_id: null,
          expected_date: "2026-09-20",
          cancelled_at: null,
        },
      ] as unknown as InboundInput["arrivalSources"],
      sourceUnits: [
        { source_id: "src-1", stock_item_id: "u1" },
      ] as unknown as InboundInput["sourceUnits"],
      units: [unit("u1", "", "5539-CNR")],
    });
    const [card] = warehouseArrivalScheduleCards(
      inboundArrivals(i),
      warehouseArrivalSourceFacts(i),
      TODAY,
      new Map([["5539-CNR", "sofa"]]),
    );
    expect(card.lines[0].categoryKey).toBe("Sofa");
  });

  it("applies the catalog to PICKUP lines when one is supplied", () => {
    const [card] = warehousePickupScheduleCards(
      warehouseOutboundCards(pickupEvents([{ unitId: "U-1", sku: "5539-CNR" }])),
      TODAY,
      undefined,
      new Map([["5539-CNR", "sofa"]]),
    );
    expect(card.lines[0].categoryKey).toBe("Sofa");
  });
});

/**
 * BACKWARD PAGING — the production defect of 2026-09-14.
 *
 * `Previous` stepped back by the shown window's CALENDAR span. From
 * `Mon 21 – Sat 26` that produced `Tue 15 – Mon 21`: six calendar days back
 * only covers five operating days when a Sunday sits inside the earlier
 * stretch, so the board repeated a column and drifted a day per press.
 */
describe("warehouseSchedulePreviousFrom", () => {
  it("lands the window that ENDS the operating day before, with no overlap", () => {
    /* 2026-09-21 is a Monday; the six operating dates before it are
       Mon 14 - Sat 19, with Sunday 20 skipped. */
    expect(warehouseSchedulePreviousFrom("2026-09-21", 6, "arrival", null)).toBe(
      "2026-09-14",
    );
  });

  it("round-trips: forward then back returns the original window", () => {
    const first = warehouseScheduleOperatingDates("2026-09-14", 6, "arrival", null);
    const next = warehouseScheduleOperatingDates(
      stepOneDay(first[first.length - 1]!),
      6,
      "arrival",
      null,
    );
    const backFrom = warehouseSchedulePreviousFrom(next[0]!, 6, "arrival", null);
    expect(warehouseScheduleOperatingDates(backFrom, 6, "arrival", null)).toEqual(
      first,
    );
  });

  it("skips a governed holiday walking backwards too", () => {
    /* Fri 18 Sep closed → the six before Mon 21 reach back one further day. */
    expect(
      warehouseSchedulePreviousFrom("2026-09-21", 6, "arrival", null, [
        "2026-09-18",
      ]),
    ).toBe("2026-09-12");
  });
});

function stepOneDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const at = new Date(Date.UTC(y!, m! - 1, d! + 1));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${at.getUTCFullYear()}-${p(at.getUTCMonth() + 1)}-${p(at.getUTCDate())}`;
}
