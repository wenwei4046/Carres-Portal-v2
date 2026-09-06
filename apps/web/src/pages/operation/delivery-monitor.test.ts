/**
 * DELIVERY MONITOR — the calendar + work-list arithmetic, held as tests.
 * Owner UI correction 2026-09-06.
 *
 * Six properties the page cannot check for itself once the pixels render:
 *
 *  1. The six-operating-day window is EXACT — consecutive days, Sunday
 *     omitted, and previous/next move by exactly six operating days.
 *  2. A card is a mapping of facts other owners already recorded — the DO id,
 *     the arrangement's window, the partner — never a second arithmetic.
 *  3. A card with an issued DO opens the Delivery Order; a card without one
 *     opens Edit Delivery. There is no third door.
 *  4. An expired planned window alone changes NOTHING — no failure, no
 *     "result needed", no invented status.
 *  5. THE PROJECTION RULE — the calendar renders only for the untouched
 *     Calendar view; any operational pick answers with the work list.
 *  6. The rail filters combine, every count is what clicking it produces,
 *     REGION is flat direct names, and LOGISTICS lists only partners
 *     genuinely carrying matching scopes plus `No logistics picked`.
 */
import { describe, it, expect } from "vitest";
import type { DeliveryOrderRow, operationOrderListRow } from "@/lib/queries";
import type { DeliveryArrangementRow } from "@carres/shared";
import type { DeliveryScopeRow } from "./delivery-work";
import {
  operatingDaysFrom,
  defaultMonitorWindowStart,
  nextOperatingWindowStart,
  previousOperatingWindowStart,
  buildDeliveryMonitorCards,
  filterMonitorCalendarCards,
  filterMonitorListRows,
  groupCardsByDay,
  buildMonitorRails,
  monitorCardHref,
  isCalendarProjection,
  emptyRangeSentence,
  needConfirmedDateSentence,
  activeFilterLabels,
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
  view: "calendar",
  region: null,
  logisticsPartnerId: null,
  search: "",
  todayIso: TODAY,
};

/* ── 1 · The six-operating-day window ──────────────────────────────────── */

describe("operatingDaysFrom", () => {
  it("returns the exact six dates from Thu 3 Sep, omitting Sun 6 Sep", () => {
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
    /* The work list's columns read the scope row itself — it rides the card. */
    expect(c.scope.so).toBe(1301);
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
      [order({ id: "a", so: 1301, do_number: "DO-1", ops_order_control: { delivery_photos: [] } })],
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
          ops_order_control: {
            delivery_photos: [{ path: "p.jpg", at: "2026-09-03T11:00:00Z", by: null }],
          },
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
    // No overlay row at all means the answer is UNKNOWN — not a missing proof.
    const out = cards(
      [order({ id: "a", so: 1301, do_number: "DO-1", ops_order_control: null })],
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
          { leg: 1, partner_id: "3d0a2b6e-0000-4000-8000-000000000001", partner_name: "TEOW", from_loc: "Klang WH", to_loc: "JB transit", scheduled_at: "2026-09-04T04:00:00.000Z", status: "pending" },
          { leg: 2, partner_id: "3d0a2b6e-0000-4000-8000-000000000002", partner_name: "SSY", from_loc: "JB transit", to_loc: "Singapore customer", scheduled_at: "2026-09-05T04:00:00.000Z", status: "pending" },
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

/* ── 5 · The projection rule ───────────────────────────────────────────── */

describe("isCalendarProjection", () => {
  it("the untouched Calendar view is the only calendar projection", () => {
    expect(isCalendarProjection(noFilters)).toBe(true);
  });

  it("any operational pick answers with the work list, never a card wall", () => {
    expect(isCalendarProjection({ ...noFilters, view: "no_confirmed_date" })).toBe(false);
    expect(isCalendarProjection({ ...noFilters, view: "failed" })).toBe(false);
    expect(isCalendarProjection({ ...noFilters, region: "Johor" })).toBe(false);
    expect(isCalendarProjection({ ...noFilters, logisticsPartnerId: "none" })).toBe(false);
  });
});

/* ── 6 · Filters, grouping, counts ─────────────────────────────────────── */

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
    scope: { so: 0, refs: [] } as unknown as DeliveryScopeRow,
    ...over,
  };
}

const SET = [
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

describe("filterMonitorCalendarCards", () => {
  it("keeps only cards inside the visible days", () => {
    const out = filterMonitorCalendarCards(SET, noFilters, WINDOW);
    expect(out.map((c) => c.scopeId).sort()).toEqual(["failed", "in-window", "nets"]);
  });

  it("search still narrows the calendar", () => {
    const out = filterMonitorCalendarCards(SET, { ...noFilters, search: "aida" }, WINDOW);
    expect(out.map((c) => c.scopeId)).toEqual(["nets"]);
  });
});

describe("filterMonitorListRows", () => {
  it("No confirmed date keeps only dateless rows", () => {
    const out = filterMonitorListRows(SET, { ...noFilters, view: "no_confirmed_date" }, WINDOW);
    expect(out.map((c) => c.scopeId)).toEqual(["dateless"]);
  });

  it("Overdue keeps only dated rows behind today", () => {
    const out = filterMonitorListRows(SET, { ...noFilters, view: "overdue" }, WINDOW);
    expect(out.map((c) => c.scopeId)).toEqual(["overdue"]);
  });

  it("a work queue answers across ALL dates — an exception is not a calendar question", () => {
    const withPastFailure = [
      ...SET,
      datedCard({
        scopeId: "old-failed",
        confirmedDate: "2026-08-20",
        statusKey: "failed",
        statusLabel: "Failed Delivery",
      }),
    ];
    expect(
      filterMonitorListRows(withPastFailure, { ...noFilters, view: "failed" }, WINDOW)
        .map((c) => c.scopeId)
        .sort(),
    ).toEqual(["failed", "old-failed"]);
  });

  it("a region or logistics pick alone lists EVERY matching open scope", () => {
    expect(
      filterMonitorListRows(SET, { ...noFilters, region: "Selangor" }, WINDOW)
        .map((c) => c.scopeId)
        .sort(),
    ).toEqual(["dateless", "failed", "in-window", "overdue", "sunday"]);
    expect(
      filterMonitorListRows(SET, { ...noFilters, logisticsPartnerId: "p-nets" }, WINDOW).map(
        (c) => c.scopeId,
      ),
    ).toEqual(["nets"]);
  });

  it("the filters COMBINE — No confirmed date · No logistics picked", () => {
    expect(
      filterMonitorListRows(
        SET,
        { ...noFilters, view: "no_confirmed_date", logisticsPartnerId: "none" },
        WINDOW,
      ).map((c) => c.scopeId),
    ).toEqual(["dateless"]);
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

describe("the spanning empty range", () => {
  it("prints ONE sentence for the whole empty window", () => {
    expect(emptyRangeSentence(["2026-09-05", "2026-09-11"], (iso) => iso)).toBe(
      "No deliveries are scheduled from 2026-09-05 to 2026-09-11.",
    );
  });

  it("counts the confirmed-date need truthfully, singular included", () => {
    expect(needConfirmedDateSentence(86)).toBe("86 deliveries need a confirmed date.");
    expect(needConfirmedDateSentence(1)).toBe("1 delivery needs a confirmed date.");
  });
});

describe("activeFilterLabels", () => {
  it("names every active pick in rail order — the combined narrowing is visible", () => {
    expect(
      activeFilterLabels(
        { ...noFilters, view: "no_confirmed_date", logisticsPartnerId: "none" },
        () => null,
      ),
    ).toEqual([MONITOR_COPY.noConfirmedDate, MONITOR_COPY.noLogistics]);
  });

  it("a partner pick prints the partner's NAME, never a raw id", () => {
    expect(
      activeFilterLabels(
        { ...noFilters, region: "Johor", logisticsPartnerId: "p-nets" },
        (id) => (id === "p-nets" ? "NETS" : null),
      ),
    ).toEqual(["Johor", "NETS"]);
  });

  it("the untouched calendar has no active filters", () => {
    expect(activeFilterLabels(noFilters, () => null)).toEqual([]);
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

  it("counts every WORK TO DO row over the OTHER filters' narrowing", () => {
    const rails = buildMonitorRails(set, noFilters, WINDOW, partners);
    // Five of the seven cards sit inside the window (dateless + overdue don't).
    expect(rails.work.calendar).toBe(5);
    expect(rails.work.no_confirmed_date).toBe(1);
    expect(rails.work.overdue).toBe(1);
    expect(rails.work.failed).toBe(1);
    expect(rails.work.delivered_proof_required).toBe(1);
    expect(rails.work.waiting_warehouse).toBe(1);
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
    expect(rails.regions.find((r) => r.key === "Selangor")).toBeUndefined();
    // …but the logistics group still shows what each partner WOULD give.
    expect(rails.logistics.find((r) => r.key === "p-nets")!.count).toBe(1);
    // Cards nobody carries: in-window, dateless, overdue, failed, proof, wh.
    expect(rails.logistics.find((r) => r.key === "none")!.count).toBe(6);
  });

  it("REGION is FLAT direct names — no sub-headings, no fixed zero rows (owner correction 2026-09-06)", () => {
    const rails = buildMonitorRails(set, noFilters, WINDOW, partners);
    const keys = rails.regions.map((r) => r.key);
    expect(keys).toEqual(["Selangor", "Kuala Lumpur"]);
    // No heading rows exist in the model at all.
    expect(rails.regions.every((r) => !("heading" in r && r.heading))).toBe(true);
  });

  it("a picked region never disappears — it stays listed at 0", () => {
    const rails = buildMonitorRails(set, { ...noFilters, region: "Sabah" }, WINDOW, partners);
    expect(rails.regions.find((r) => r.key === "Sabah")!.count).toBe(0);
  });

  it("LOGISTICS lists only partners genuinely carrying a matching scope, then No logistics picked", () => {
    const rails = buildMonitorRails(set, noFilters, WINDOW, partners);
    const labels = rails.logistics.map((r) => r.label);
    // NETS carries one; AL and HOUZS carry nothing and are not listed.
    expect(labels).toEqual(["NETS", MONITOR_COPY.noLogistics]);
    expect(rails.logistics[rails.logistics.length - 1]!.key).toBe("none");
  });

  it("a partner the table read missed still lands on its NAME, never a raw id", () => {
    const withLeg = [
      ...set,
      datedCard({ scopeId: "leg", logisticsPartnerId: "p-ssy", logisticsPartnerName: "SSY" }),
    ];
    const rails = buildMonitorRails(withLeg, noFilters, WINDOW, partners);
    const ssy = rails.logistics.find((r) => r.label === "SSY")!;
    expect(ssy.count).toBe(1);
    expect(ssy.key).toBe("p-ssy");
    expect(rails.logistics.some((r) => r.label === "p-ssy")).toBe(false);
  });

  it("the governed roster keeps its ruled reading order among the partners present", () => {
    const withMore = [
      ...set,
      datedCard({ scopeId: "h1", logisticsPartnerId: "p-houzs", logisticsPartnerName: "HOUZS" }),
      datedCard({ scopeId: "a1", logisticsPartnerId: "p-al", logisticsPartnerName: "AL" }),
    ];
    const rails = buildMonitorRails(withMore, noFilters, WINDOW, partners);
    // NETS · AL · HOUZS is the governed order — never alphabetical.
    expect(rails.logistics.map((r) => r.label)).toEqual([
      "NETS",
      "AL",
      "HOUZS",
      MONITOR_COPY.noLogistics,
    ]);
  });
});
