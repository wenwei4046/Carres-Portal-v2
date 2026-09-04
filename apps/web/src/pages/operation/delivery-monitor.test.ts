/**
 * DELIVERY MONITOR — the calendar arithmetic, held as tests.
 * `CARD-2026-09-04-delivery-01-monitor-calendar`.
 *
 * Five properties the page cannot check for itself once the pixels render:
 *
 *  1. The six-operating-day window is EXACT — consecutive days, Sunday
 *     omitted, and previous/next move by exactly six operating days.
 *  2. A card is a mapping of facts other owners already recorded — the DO id,
 *     the arrangement's window, the partner — never a second arithmetic.
 *  3. A card with an issued DO opens the Delivery Order; a card without one
 *     opens Edit Delivery. There is no third door.
 *  4. An expired planned window alone changes NOTHING — no failure, no
 *     "result needed", no invented status.
 *  5. The rail filters combine, and every count is what clicking it produces.
 */
import { describe, it, expect } from "vitest";
import type { DeliveryOrderRow, operationOrderListRow } from "@/lib/queries";
import type { DeliveryArrangementRow } from "@carres/shared";
import {
  operatingDaysFrom,
  defaultMonitorWindowStart,
  nextOperatingWindowStart,
  previousOperatingWindowStart,
  buildDeliveryMonitorCards,
  filterDeliveryMonitorCards,
  groupCardsByDay,
  buildMonitorRails,
  monitorCardHref,
  MONITOR_DAYS,
  MONITOR_COPY,
  type DeliveryMonitorCard,
  type DeliveryMonitorFilters,
} from "./delivery-monitor";

/* The card's one consistent example: Friday, 4 September 2026. */
const TODAY = "2026-09-04";
const WINDOW = [
  "2026-09-03",
  "2026-09-04",
  "2026-09-05",
  "2026-09-07",
  "2026-09-08",
  "2026-09-09",
];

function order(
  over: Partial<operationOrderListRow> & { id: string; so: number },
): operationOrderListRow {
  return {
    status: "proceed_order",
    operation_stage: "ready_to_dispatch",
    warehouse_id: null,
    customer_name: "kong chai yin",
    customer_phone: null,
    customer_address: "12 Jalan Sekolah, 41000 Klang, Selangor",
    customer_address_city: "Klang",
    customer_address_state: "Selangor",
    building_type: "Landed",
    placed_at: "2026-08-01T00:00:00Z",
    delivery_date: "2026-09-04",
    delivery_date_tbd: false,
    source_system: null,
    source_ref: null,
    ops_assigned_logistic: null,
    order_lines: [{ id: "l-1", sku: "mattress:M1401F-K", qty: 1 }],
    delivery_partner_id: null,
    request_for_delivery_at: null,
    partner_accepted_at: null,
    partner_rejected_at: null,
    partner_rejected_reason: null,
    delivery_partners: null,
    do_number: null,
    dispatched_at: null,
    delivered_at: null,
    outlet_id: null,
    dealer_id: "d-1",
    dealers: { name: "Carres KL" },
    order_supplier_threads: [],
    order_annotations: [],
    ...over,
  };
}

function arrangement(
  over: Partial<DeliveryArrangementRow> & { order_id: string },
): DeliveryArrangementRow {
  return {
    id: `arr-${over.order_id}`,
    leg: 0,
    partner_id: null,
    partner_name: null,
    confirmed_date: null,
    confirmed_time: null,
    expected_arrival: null,
    logistics_note: null,
    reply_proof_path: null,
    driver_name: null,
    vehicle: null,
    updated_at: "2026-09-01T00:00:00Z",
    updated_by: null,
    ...over,
  };
}

function doc(over: Partial<DeliveryOrderRow> & { id: string; do_number: string }): DeliveryOrderRow {
  return {
    order_id: undefined,
    issued_at: "2026-09-01T00:00:00Z",
    trip_groups: null,
    delivery_date: null,
    time_slot: null,
    logistics_partner: null,
    voided_at: null,
    void_reason: null,
    orders: { id: "a", so: 1301, customer_name: "kong chai yin" },
    ...over,
  };
}

function cards(
  orders: operationOrderListRow[],
  opts?: {
    deliveryOrders?: DeliveryOrderRow[];
    arrangements?: DeliveryArrangementRow[];
    attempts?: { do_number: string | null; result: "delivered" | "partial" | "failed"; reason_key: string | null; recorded_at: string }[];
  },
): DeliveryMonitorCard[] {
  const byScope = new Map<string, DeliveryArrangementRow>();
  for (const a of opts?.arrangements ?? []) byScope.set(`${a.order_id}#${a.leg}`, a);
  return buildDeliveryMonitorCards({
    orders,
    deliveryOrders: opts?.deliveryOrders ?? [],
    attempts: opts?.attempts ?? [],
    handoverEvents: [],
    partnerNameById: new Map(),
    arrangements: byScope,
  });
}

const noFilters: DeliveryMonitorFilters = {
  schedule: "calendar",
  checking: null,
  region: null,
  logisticsPartnerId: null,
  search: "",
  todayIso: TODAY,
};

/* ── 1 · The six-operating-day window ──────────────────────────────────── */

describe("operatingDaysFrom", () => {
  it("returns the card's exact six dates from Thu 3 Sep, omitting Sun 6 Sep", () => {
    expect(operatingDaysFrom("2026-09-03", 6)).toEqual(WINDOW);
  });

  it("defaults to six days", () => {
    expect(MONITOR_DAYS).toBe(6);
    expect(operatingDaysFrom("2026-09-03")).toEqual(WINDOW);
  });

  it("starts on the requested day even mid-window and still skips Sunday", () => {
    expect(operatingDaysFrom("2026-09-05", 3)).toEqual([
      "2026-09-05",
      "2026-09-07",
      "2026-09-08",
    ]);
  });

  it("never asks the browser's timezone — bare-date arithmetic only", () => {
    // 31 Dec → 2 Jan across a year boundary, Sunday 2027-01-03 not reached.
    expect(operatingDaysFrom("2026-12-31", 2)).toEqual(["2026-12-31", "2027-01-01"]);
  });
});

describe("the selected window", () => {
  it("on Friday 4 Sep the default range begins Thursday 3 Sep", () => {
    expect(defaultMonitorWindowStart(TODAY)).toBe("2026-09-03");
  });

  it("on Monday the previous operating day is Saturday, never Sunday", () => {
    expect(defaultMonitorWindowStart("2026-09-07")).toBe("2026-09-05");
  });

  it("next moves exactly six operating days forward", () => {
    expect(nextOperatingWindowStart("2026-09-03")).toBe("2026-09-10");
  });

  it("previous moves exactly six operating days back", () => {
    expect(previousOperatingWindowStart("2026-09-03")).toBe("2026-08-27");
    // The two directions are inverses.
    expect(nextOperatingWindowStart(previousOperatingWindowStart("2026-09-03"))).toBe(
      "2026-09-03",
    );
  });
});

/* ── 2 · Card mapping — read facts, never a second arithmetic ──────────── */

describe("buildDeliveryMonitorCards", () => {
  it("maps an arranged scope's own facts onto one card", () => {
    const out = cards(
      [order({ id: "a", so: 1301 })],
      {
        arrangements: [
          arrangement({
            order_id: "a",
            partner_id: "p-nets",
            partner_name: "NETS",
            confirmed_date: "2026-09-04",
            confirmed_time: "11:00–13:00",
            expected_arrival: "12:00",
          }),
        ],
      },
    );
    expect(out).toHaveLength(1);
    const c = out[0]!;
    expect(c.orderId).toBe("a");
    expect(c.confirmedDate).toBe("2026-09-04");
    expect(c.confirmedTime).toBe("11:00–13:00");
    expect(c.expectedArrival).toBe("12:00");
    expect(c.logisticsPartnerId).toBe("p-nets");
    expect(c.logisticsPartnerName).toBe("NETS");
    expect(c.customerName).toBe("Kong Chai Yin");
    expect(c.locality).toBe("Klang, Selangor");
    expect(c.region).toBe("Selangor");
    expect(c.goodsSummary).toBeTruthy();
    expect(c.deliveryOrderId).toBeNull();
    expect(c.doNumber).toBeNull();
  });

  it("carries the issued DO's id and number when one exists", () => {
    const out = cards(
      [order({ id: "a", so: 1301, do_number: "DO-040926-0001" })],
      {
        deliveryOrders: [
          doc({ id: "do-row-1", do_number: "DO-040926-0001", delivery_date: "2026-09-04" }),
        ],
      },
    );
    expect(out[0]!.deliveryOrderId).toBe("do-row-1");
    expect(out[0]!.doNumber).toBe("DO-040926-0001");
  });

  it("a scope with no confirmed date stays a card, dateless", () => {
    const out = cards([order({ id: "a", so: 1301, delivery_date: null })]);
    expect(out).toHaveLength(1);
    expect(out[0]!.confirmedDate).toBeNull();
  });

  it("speaks the shared status arithmetic, never its own", () => {
    const out = cards(
      [order({ id: "a", so: 1301 })],
      {
        arrangements: [arrangement({ order_id: "a", confirmed_date: "2026-09-04" })],
      },
    );
    expect(out[0]!.statusKey).toBe("confirmed");
    expect(out[0]!.statusLabel).toBe("Delivery confirmed");
  });

  it("marks a recorded delivery with an empty photo ledger as proof required", () => {
    const delivered = cards(
      [order({ id: "a", so: 1301, do_number: "DO-1", delivery_photos: [] })],
      {
        deliveryOrders: [doc({ id: "do-1", do_number: "DO-1" })],
        attempts: [
          { do_number: "DO-1", result: "delivered", reason_key: null, recorded_at: "2026-09-03T10:00:00Z" },
        ],
      },
    );
    expect(delivered[0]!.statusKey).toBe("delivered");
    expect(delivered[0]!.proofRequired).toBe(true);

    const withPhoto = cards(
      [
        order({
          id: "a",
          so: 1301,
          do_number: "DO-1",
          delivery_photos: [{ path: "p.jpg", at: "2026-09-03T11:00:00Z", by: null }],
        }),
      ],
      {
        deliveryOrders: [doc({ id: "do-1", do_number: "DO-1" })],
        attempts: [
          { do_number: "DO-1", result: "delivered", reason_key: null, recorded_at: "2026-09-03T10:00:00Z" },
        ],
      },
    );
    expect(withPhoto[0]!.proofRequired).toBe(false);
  });

  it("an UNKNOWN photo ledger claims nothing", () => {
    // `delivery_photos: undefined` means an older payload — not a missing proof.
    const out = cards(
      [order({ id: "a", so: 1301, do_number: "DO-1", delivery_photos: undefined })],
      {
        deliveryOrders: [doc({ id: "do-1", do_number: "DO-1" })],
        attempts: [
          { do_number: "DO-1", result: "delivered", reason_key: null, recorded_at: "2026-09-03T10:00:00Z" },
        ],
      },
    );
    expect(out[0]!.proofRequired).toBe(false);
  });
});

/* ── 3 · One door per card ─────────────────────────────────────────────── */

describe("monitorCardHref", () => {
  it("an issued DO opens the Delivery Order object", () => {
    const out = cards(
      [order({ id: "a", so: 1301, do_number: "DO-1" })],
      { deliveryOrders: [doc({ id: "do-row-1", do_number: "DO-1" })] },
    );
    expect(monitorCardHref(out[0]!)).toBe("/operation/delivery-orders/do-row-1");
  });

  it("no DO yet opens Edit Delivery — Monitor never issues the document", () => {
    const out = cards([order({ id: "a", so: 1301 })]);
    expect(monitorCardHref(out[0]!)).toBe("/operation/delivery/edit/a");
  });

  it("a Journey leg's door carries its leg", () => {
    const out = cards([
      order({
        id: "b",
        so: 1302,
        delivery_stops: [
          { leg: 1, partner_id: null, partner_name: null, from_loc: "Klang WH", to_loc: "JB transit", scheduled_at: "2026-09-04T04:00:00.000Z", status: "pending" },
          { leg: 2, partner_id: null, partner_name: null, from_loc: "JB transit", to_loc: "Singapore customer", scheduled_at: "2026-09-05T04:00:00.000Z", status: "pending" },
        ],
      }),
    ]);
    expect(out).toHaveLength(2);
    expect(monitorCardHref(out[0]!)).toBe("/operation/delivery/edit/b?leg=1");
  });
});

/* ── 4 · An expired window proves nothing ──────────────────────────────── */

describe("expired planned time", () => {
  it("a confirmed date behind us with no recorded result keeps its status", () => {
    const out = cards(
      [order({ id: "a", so: 1301 })],
      { arrangements: [arrangement({ order_id: "a", confirmed_date: "2026-09-01" })] },
    );
    // Not failed, not "result needed" — the calendar passing records nothing.
    expect(out[0]!.statusKey).toBe("confirmed");
    expect(out[0]!.proofRequired).toBe(false);
  });
});

/* ── 5 · Filters, grouping, counts ─────────────────────────────────────── */

function datedCard(over: Partial<DeliveryMonitorCard> & { scopeId: string }): DeliveryMonitorCard {
  return {
    orderId: over.scopeId,
    leg: null,
    deliveryOrderId: null,
    doNumber: null,
    confirmedDate: "2026-09-04",
    confirmedTime: null,
    expectedArrival: null,
    customerName: "Kong Chai Yin",
    locality: "Klang, Selangor",
    goodsSummary: "Mattress ×1",
    logisticsPartnerId: null,
    logisticsPartnerName: null,
    region: "Selangor",
    statusKey: "confirmed",
    statusLabel: "Delivery confirmed",
    proofRequired: false,
    ...over,
  };
}

describe("filterDeliveryMonitorCards", () => {
  const set = [
    datedCard({ scopeId: "in-window" }),
    datedCard({ scopeId: "sunday", confirmedDate: "2026-09-06" }),
    datedCard({ scopeId: "dateless", confirmedDate: null }),
    datedCard({ scopeId: "overdue", confirmedDate: "2026-09-01" }),
    datedCard({ scopeId: "failed", statusKey: "failed", statusLabel: "Failed Delivery" }),
    datedCard({
      scopeId: "nets",
      logisticsPartnerId: "p-nets",
      logisticsPartnerName: "NETS",
      region: "Kuala Lumpur",
      customerName: "Aida Rahim",
    }),
  ];

  it("Calendar keeps only cards inside the visible days", () => {
    const out = filterDeliveryMonitorCards(set, noFilters, WINDOW);
    expect(out.map((c) => c.scopeId).sort()).toEqual(["failed", "in-window", "nets"]);
  });

  it("No confirmed date keeps only dateless cards", () => {
    const out = filterDeliveryMonitorCards(
      set,
      { ...noFilters, schedule: "no_confirmed_date" },
      WINDOW,
    );
    expect(out.map((c) => c.scopeId)).toEqual(["dateless"]);
  });

  it("Overdue keeps only dated cards behind today", () => {
    const out = filterDeliveryMonitorCards(set, { ...noFilters, schedule: "overdue" }, WINDOW);
    expect(out.map((c) => c.scopeId)).toEqual(["overdue"]);
  });

  it("checking, region, logistics and search all COMBINE with the schedule", () => {
    expect(
      filterDeliveryMonitorCards(set, { ...noFilters, checking: "failed" }, WINDOW).map(
        (c) => c.scopeId,
      ),
    ).toEqual(["failed"]);
    expect(
      filterDeliveryMonitorCards(set, { ...noFilters, region: "Kuala Lumpur" }, WINDOW).map(
        (c) => c.scopeId,
      ),
    ).toEqual(["nets"]);
    expect(
      filterDeliveryMonitorCards(set, { ...noFilters, logisticsPartnerId: "p-nets" }, WINDOW).map(
        (c) => c.scopeId,
      ),
    ).toEqual(["nets"]);
    expect(
      filterDeliveryMonitorCards(set, { ...noFilters, logisticsPartnerId: "none" }, WINDOW)
        .map((c) => c.scopeId)
        .sort(),
    ).toEqual(["failed", "in-window"]);
    expect(
      filterDeliveryMonitorCards(set, { ...noFilters, search: "aida" }, WINDOW).map(
        (c) => c.scopeId,
      ),
    ).toEqual(["nets"]);
  });
});

describe("groupCardsByDay", () => {
  it("orders a day by window start, then customer, then stable id — and an empty day exists", () => {
    const grouped = groupCardsByDay(
      [
        datedCard({ scopeId: "b-later", confirmedTime: "14:00–16:00", customerName: "Aida" }),
        datedCard({ scopeId: "z-no-time", confirmedTime: null, customerName: "Aida" }),
        datedCard({ scopeId: "a-early", confirmedTime: "11:00–13:00", customerName: "Aida" }),
        datedCard({ scopeId: "tie-2", confirmedTime: "11:00–13:00", customerName: "Zul" }),
      ],
      WINDOW,
    );
    expect(grouped.get("2026-09-04")!.map((c) => c.scopeId)).toEqual([
      "a-early",
      "tie-2",
      "b-later",
      "z-no-time",
    ]);
    // Every visible day answers, even empty.
    expect(grouped.get("2026-09-09")).toEqual([]);
  });
});

describe("buildMonitorRails", () => {
  const set = [
    datedCard({ scopeId: "in-window" }),
    datedCard({ scopeId: "dateless", confirmedDate: null }),
    datedCard({ scopeId: "overdue", confirmedDate: "2026-09-01" }),
    datedCard({ scopeId: "failed", statusKey: "failed", statusLabel: "Failed Delivery" }),
    datedCard({ scopeId: "proof", statusKey: "delivered", statusLabel: "Delivered", proofRequired: true }),
    datedCard({ scopeId: "wh", statusKey: "waiting_warehouse", statusLabel: "Waiting for warehouse" }),
    datedCard({ scopeId: "nets", logisticsPartnerId: "p-nets", logisticsPartnerName: "NETS", region: "Kuala Lumpur" }),
  ];
  const partners = [
    { id: "p-nets", name: "NETS" },
    { id: "p-al", name: "AL" },
    { id: "p-houzs", name: "HOUZS" },
  ];

  it("counts every schedule and checking row over the OTHER filters' narrowing", () => {
    const rails = buildMonitorRails(set, noFilters, WINDOW, partners);
    // Five of the seven cards sit inside the window (dateless + overdue don't).
    expect(rails.schedule.calendar).toBe(5);
    expect(rails.schedule.noConfirmedDate).toBe(1);
    expect(rails.schedule.overdue).toBe(1);
    expect(rails.checking.failed).toBe(1);
    expect(rails.checking.deliveredProofRequired).toBe(1);
    expect(rails.checking.waitingWarehouse).toBe(1);
  });

  it("a picked partner narrows the region counts but not its own group", () => {
    const rails = buildMonitorRails(
      set,
      { ...noFilters, logisticsPartnerId: "p-nets" },
      WINDOW,
      partners,
    );
    // Regions are counted over the partner narrowing…
    expect(rails.regions.find((r) => r.key === "Kuala Lumpur")!.count).toBe(1);
    expect(rails.regions.find((r) => r.key === "Selangor")?.count ?? 0).toBe(0);
    // …but the logistics group still shows what each partner WOULD give.
    expect(rails.logistics.find((r) => r.key === "p-nets")!.count).toBe(1);
    // In-window cards nobody carries: in-window, failed, proof, wh.
    expect(rails.logistics.find((r) => r.key === "none")!.count).toBe(4);
  });

  it("keeps the governed roster visible at zero and lists no-logistics last", () => {
    const rails = buildMonitorRails(set, noFilters, WINDOW, partners);
    const labels = rails.logistics.map((r) => r.label);
    expect(labels).toContain("NETS");
    expect(labels).toContain("AL");
    expect(labels).toContain("HOUZS");
    expect(rails.logistics.find((r) => r.label === "AL")!.count).toBe(0);
    expect(rails.logistics[rails.logistics.length - 1]!.key).toBe("none");
    expect(rails.logistics[rails.logistics.length - 1]!.label).toBe(MONITOR_COPY.noLogistics);
  });
});
