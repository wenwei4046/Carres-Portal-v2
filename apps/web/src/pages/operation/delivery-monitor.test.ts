/**
 * DELIVERY MONITOR — the calendar + work-list arithmetic, held as tests.
 * Owner UI corrections 2026-09-06 / 2026-09-07.
 *
 * Seven properties the page cannot check for itself once the pixels render:
 *
 *  1. The windows are EXACT — the six-operating-day week (Sunday omitted),
 *     the tablet half-week, the Day, the Month — and previous/next replace
 *     the whole window.
 *  2. A card is a mapping of facts other owners already recorded — the DO id,
 *     the arrangement's window, the partner, the register's missing-evidence
 *     facts — never a second arithmetic.
 *  3. A card with an issued DO opens the Delivery Order; a card without one
 *     opens Edit Delivery. There is no third door.
 *  4. An expired planned window alone changes NOTHING — no failure, no
 *     "result needed", no invented status.
 *  5. THE PROJECTION RULE — the calendar renders only while NO operational
 *     pick holds (no queue, state, partner or status); any pick answers with
 *     the work list.
 *  6. The rail filters combine, every count is what clicking it produces,
 *     STATE is flat direct names, LOGISTICS PARTNER lists only partners
 *     genuinely carrying matching rows, DELIVERY STATUS is the three fixed
 *     rungs, and `No logistics picked` is a WORK TO DO queue — never
 *     duplicated under LOGISTICS PARTNER.
 *  7. The Month's counts are the SAME queues the rail lists — an `Exceptions`
 *     number is exactly Overdue + Failed Delivery + Upload delivery proof.
 */
import { describe, it, expect } from "vitest";
import type { DeliveryOrderRow, operationOrderListRow } from "@/lib/queries";
import type { DeliveryArrangementRow } from "@carres/shared";
import type { DeliveryScopeRow } from "./delivery-work";
import {
  operatingDaysFrom,
  operatingWeekOf,
  tabletWindowOf,
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
  monthDaysOf,
  monthStepStart,
  monthDayCounts,
  monthDaySentence,
  missingProofLabels,
  needsProof,
  deliveriesFooter,
  selectedSentence,
  MONITOR_DAYS,
  MONITOR_COPY,
  MONITOR_WORK_VIEWS,
  MONITOR_VIEW_LABEL,
  MONITOR_STATUS_FILTERS,
  MONITOR_STATUS_LABEL,
  MONITOR_CALENDAR_VIEWS,
  DEFAULT_CALENDAR_VIEW,
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
  view: null,
  region: null,
  logisticsPartnerId: null,
  status: null,
  search: "",
  todayIso: TODAY,
};

const NO_PROOF_MISSING = { photo: false, signedDo: false };

/* ── 1 · The windows ───────────────────────────────────────────────────── */

describe("operatingDaysFrom", () => {
  it("returns the exact six dates from Thu 3 Sep, omitting Sun 6 Sep", () => {
    expect(operatingDaysFrom("2026-09-03")).toEqual(WINDOW);
  });

  it("defaults to six days", () => {
    expect(MONITOR_DAYS).toBe(6);
    expect(operatingDaysFrom("2026-09-03")).toHaveLength(6);
  });

  it("starts on the requested day even mid-window and still skips Sunday", () => {
    expect(operatingDaysFrom("2026-09-05", 3)).toEqual(["2026-09-05", "2026-09-07", "2026-09-08"]);
  });

  it("never asks the browser's timezone — bare-date arithmetic only", () => {
    expect(operatingDaysFrom("2026-12-31", 2)).toEqual(["2026-12-31", "2027-01-01"]);
  });
});

describe("the fixed operating week (owner correction 2026-09-06)", () => {
  it("is the Mon–Sat week containing the date — Friday 4 Sep sits in Mon 31 Aug – Sat 5 Sep", () => {
    expect(operatingWeekOf("2026-09-04")).toEqual([
      "2026-08-31",
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
      "2026-09-04",
      "2026-09-05",
    ]);
    expect(operatingWeekOf("2026-08-31")[0]).toBe("2026-08-31");
    expect(operatingWeekOf("2026-09-05")[0]).toBe("2026-08-31");
  });

  it("a Sunday snaps FORWARD to Monday's week — no operating week holds a Sunday", () => {
    expect(operatingWeekOf("2026-09-06")[0]).toBe("2026-09-07");
    expect(operatingWeekOf("2026-09-06")).not.toContain("2026-09-06");
  });

  it("the tablet window is the aligned three-day half-week containing the date", () => {
    expect(tabletWindowOf("2026-09-04")).toEqual(["2026-09-03", "2026-09-04", "2026-09-05"]);
    expect(tabletWindowOf("2026-09-01")).toEqual(["2026-08-31", "2026-09-01", "2026-09-02"]);
  });

  it("the arrows replace the whole window: ±6 operating days is exactly one week, ±3 the other half", () => {
    expect(nextOperatingWindowStart("2026-09-04", 6)).toBe("2026-09-11");
    expect(previousOperatingWindowStart("2026-09-11", 6)).toBe("2026-09-04");
    expect(nextOperatingWindowStart("2026-09-04", 3)).toBe("2026-09-08");
    expect(previousOperatingWindowStart("2026-09-08", 3)).toBe("2026-09-04");
    expect(nextOperatingWindowStart("2026-09-05", 1)).toBe("2026-09-07");
  });
});

describe("the month (owner correction 2026-09-07)", () => {
  it("lists every calendar day of the month — Sundays included, so a Sunday delivery is still counted", () => {
    const days = monthDaysOf("2026-09-04");
    expect(days).toHaveLength(30);
    expect(days[0]).toBe("2026-09-01");
    expect(days[29]).toBe("2026-09-30");
    expect(days).toContain("2026-09-06");
    expect(monthDaysOf("2026-02-10")).toHaveLength(28);
  });

  it("previous/next replace the whole month and land on its first OPERATING day", () => {
    expect(monthStepStart("2026-09-04", 1)).toBe("2026-10-01");
    expect(monthStepStart("2026-09-04", -1)).toBe("2026-08-01");
    // 1 Nov 2026 is a Sunday — the month opens on Monday 2 Nov.
    expect(monthStepStart("2026-10-15", 1)).toBe("2026-11-02");
    expect(monthStepStart("2026-01-10", -1)).toBe("2025-12-01");
  });

  it("the toolbar control is Day · Week · Month with Week the desktop default", () => {
    expect(MONITOR_CALENDAR_VIEWS).toEqual(["day", "week", "month"]);
    expect(DEFAULT_CALENDAR_VIEW).toBe("week");
  });
});

/* ── 2 · A card is a mapping of recorded facts ─────────────────────────── */

describe("buildDeliveryMonitorCards", () => {
  it("maps an arranged row's own facts onto one card", () => {
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
          }),
        ],
      },
    );
    expect(out).toHaveLength(1);
    const c = out[0]!;
    expect(c.orderId).toBe("a");
    expect(c.confirmedDate).toBe("2026-09-04");
    expect(c.confirmedTime).toBe("11:00–13:00");
    expect(c.logisticsPartnerId).toBe("p-nets");
    expect(c.logisticsPartnerName).toBe("NETS");
    expect(c.customerName).toBe("Kong Chai Yin");
    /* City and State — the one locality spelling. */
    expect(c.locality).toBe("Klang, Selangor");
    expect(c.region).toBe("Selangor");
    expect(c.goodsSummary).toBeTruthy();
    expect(c.deliveryOrderId).toBeNull();
    expect(c.doNumber).toBeNull();
    expect(c.missingProof).toEqual(NO_PROOF_MISSING);
    /* The work list's columns read the row itself — it rides the card. */
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

  it("a row with no confirmed date stays a card, dateless", () => {
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

  describe("the missing evidence — the Delivery Orders register's own arithmetic", () => {
    const delivered = (over: Partial<operationOrderListRow>, docOver: Partial<DeliveryOrderRow> = {}) =>
      cards(
        [order({ id: "a", so: 1301, do_number: "DO-1", ...over })],
        {
          deliveryOrders: [doc({ id: "do-1", do_number: "DO-1", ...docOver })],
          attempts: [
            { do_number: "DO-1", result: "delivered", reason_key: null, recorded_at: "2026-09-03T10:00:00Z" },
          ],
        },
      )[0]!;

    it("a recorded delivery with an empty photo ledger and no signed DO is owed BOTH files", () => {
      const c = delivered({ ops_order_control: { delivery_photos: [] } });
      expect(c.statusKey).toBe("delivered");
      /* The result stays `Delivered` — the evidence is a separate fact. */
      expect(c.statusLabel).toBe("Delivered");
      expect(c.missingProof).toEqual({ photo: true, signedDo: true });
      expect(needsProof(c)).toBe(true);
      expect(missingProofLabels(c)).toEqual(["Upload delivery photo", "Upload signed Delivery Order"]);
    });

    it("a photo on file leaves only the signed Delivery Order owed", () => {
      const c = delivered({
        ops_order_control: {
          delivery_photos: [{ path: "p.jpg", at: "2026-09-03T11:00:00Z", by: null }],
        },
      });
      expect(c.missingProof).toEqual({ photo: false, signedDo: true });
      expect(missingProofLabels(c)).toEqual(["Upload signed Delivery Order"]);
    });

    it("the signed document on file (`orders.do_file_path`) clears that half", () => {
      const c = delivered(
        { ops_order_control: { delivery_photos: [] } },
        { orders: { id: "a", so: 1301, customer_name: "kong chai yin", do_file_path: "signed.pdf" } },
      );
      expect(c.missingProof).toEqual({ photo: true, signedDo: false });
      expect(missingProofLabels(c)).toEqual(["Upload delivery photo"]);
    });

    it("both on file — nothing owed, the row leaves the queue", () => {
      const c = delivered(
        { ops_order_control: { delivery_photos: [{ path: "p.jpg", at: "2026-09-03T11:00:00Z", by: null }] } },
        { orders: { id: "a", so: 1301, customer_name: "kong chai yin", do_file_path: "signed.pdf" } },
      );
      expect(needsProof(c)).toBe(false);
    });

    it("an UNKNOWN photo ledger claims no missing photo", () => {
      // No overlay row at all means the answer is UNKNOWN — not a missing proof.
      const c = delivered({ ops_order_control: null });
      expect(c.missingProof.photo).toBe(false);
    });

    it("a result that never reached the customer owes no proof", () => {
      const c = cards(
        [order({ id: "a", so: 1301, do_number: "DO-1", ops_order_control: { delivery_photos: [] } })],
        {
          deliveryOrders: [doc({ id: "do-1", do_number: "DO-1" })],
          attempts: [
            { do_number: "DO-1", result: "failed", reason_key: "customer_absent", recorded_at: "2026-09-03T10:00:00Z" },
          ],
        },
      )[0]!;
      expect(c.statusKey).toBe("failed");
      expect(c.missingProof).toEqual(NO_PROOF_MISSING);
    });
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

  it("a Journey row's door carries its leg in the URL only", () => {
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
    expect(out[0]!.missingProof).toEqual(NO_PROOF_MISSING);
  });
});

/* ── 5 · The projection rule ───────────────────────────────────────────── */

describe("isCalendarProjection", () => {
  it("no operational pick is the only calendar projection", () => {
    expect(isCalendarProjection(noFilters)).toBe(true);
  });

  it("any operational pick answers with the work list, never a card wall", () => {
    expect(isCalendarProjection({ ...noFilters, view: "all" })).toBe(false);
    expect(isCalendarProjection({ ...noFilters, view: "no_confirmed_date" })).toBe(false);
    expect(isCalendarProjection({ ...noFilters, view: "failed" })).toBe(false);
    expect(isCalendarProjection({ ...noFilters, region: "Johor" })).toBe(false);
    expect(isCalendarProjection({ ...noFilters, logisticsPartnerId: "none" })).toBe(false);
    expect(isCalendarProjection({ ...noFilters, status: "waiting_warehouse" })).toBe(false);
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
    customerName: "Kong Chai Yin",
    locality: "Klang, Selangor",
    goodsSummary: "Mattress ×1",
    logisticsPartnerId: null,
    logisticsPartnerName: null,
    region: "Selangor",
    statusKey: "confirmed",
    statusLabel: "Delivery confirmed",
    missingProof: NO_PROOF_MISSING,
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
    const out = filterMonitorListRows(SET, { ...noFilters, view: "no_confirmed_date" });
    expect(out.map((c) => c.scopeId)).toEqual(["dateless"]);
  });

  it("Overdue keeps only dated rows behind today — and never a recorded delivery", () => {
    const withDelivered = [
      ...SET,
      datedCard({
        scopeId: "done-yesterday",
        confirmedDate: "2026-09-03",
        statusKey: "delivered",
        statusLabel: "Delivered",
        missingProof: { photo: true, signedDo: false },
      }),
    ];
    const out = filterMonitorListRows(withDelivered, { ...noFilters, view: "overdue" });
    expect(out.map((c) => c.scopeId)).toEqual(["overdue"]);
  });

  it("Upload delivery proof keeps only recorded results still owed evidence — across ALL dates", () => {
    const withProof = [
      ...SET,
      datedCard({
        scopeId: "old-no-photo",
        confirmedDate: "2026-08-20",
        statusKey: "delivered",
        statusLabel: "Delivered",
        missingProof: { photo: true, signedDo: false },
      }),
      datedCard({
        scopeId: "no-signed",
        statusKey: "delivered",
        statusLabel: "Delivered",
        missingProof: { photo: false, signedDo: true },
      }),
      datedCard({ scopeId: "complete", statusKey: "delivered", statusLabel: "Delivered" }),
    ];
    const out = filterMonitorListRows(withProof, { ...noFilters, view: "upload_proof" });
    expect(out.map((c) => c.scopeId).sort()).toEqual(["no-signed", "old-no-photo"]);
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
      filterMonitorListRows(withPastFailure, { ...noFilters, view: "failed" })
        .map((c) => c.scopeId)
        .sort(),
    ).toEqual(["failed", "old-failed"]);
  });

  it("`All delivery work` lists every open row — the unfiltered selectable listing", () => {
    const out = filterMonitorListRows(SET, { ...noFilters, view: "all" });
    expect(out).toHaveLength(SET.length);
  });

  it("`No logistics picked` keeps every unassigned row across ALL dates — DO-less and dateless included", () => {
    const out = filterMonitorListRows(SET, { ...noFilters, view: "no_logistics" });
    expect(out.map((c) => c.scopeId).sort()).toEqual([
      "dateless",
      "failed",
      "in-window",
      "overdue",
      "sunday",
    ]);
    // The one assigned card is the only one excluded.
    expect(out.some((c) => c.scopeId === "nets")).toBe(false);
  });

  it("a STATE pick combines with `No logistics picked` — Selangor · No logistics picked", () => {
    const out = filterMonitorListRows(SET, { ...noFilters, view: "no_logistics", region: "Selangor" });
    expect(out.map((c) => c.scopeId).sort()).toEqual([
      "dateless",
      "failed",
      "in-window",
      "overdue",
      "sunday",
    ]);
  });

  it("a state, partner or status pick alone lists EVERY matching open row", () => {
    expect(
      filterMonitorListRows(SET, { ...noFilters, region: "Selangor" })
        .map((c) => c.scopeId)
        .sort(),
    ).toEqual(["dateless", "failed", "in-window", "overdue", "sunday"]);
    expect(
      filterMonitorListRows(SET, { ...noFilters, logisticsPartnerId: "p-nets" }).map((c) => c.scopeId),
    ).toEqual(["nets"]);
    const withWh = [
      ...SET,
      datedCard({ scopeId: "wh", statusKey: "waiting_warehouse", statusLabel: "Waiting for warehouse" }),
    ];
    expect(
      filterMonitorListRows(withWh, { ...noFilters, status: "waiting_warehouse" }).map((c) => c.scopeId),
    ).toEqual(["wh"]);
  });

  it("the filters COMBINE — No confirmed date · No logistics picked", () => {
    expect(
      filterMonitorListRows(SET, { ...noFilters, view: "no_confirmed_date", logisticsPartnerId: "none" }).map(
        (c) => c.scopeId,
      ),
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

/* ── 7 · The Month's counts are the rail's own queues ──────────────────── */

describe("monthDayCounts", () => {
  it("counts deliveries, exceptions (Overdue + Failed Delivery + Upload delivery proof) and No logistics picked per date", () => {
    const set = [
      datedCard({ scopeId: "a" }),
      datedCard({ scopeId: "b", statusKey: "failed", statusLabel: "Failed Delivery" }),
      datedCard({ scopeId: "c", logisticsPartnerId: "p-nets", logisticsPartnerName: "NETS" }),
      datedCard({ scopeId: "overdue", confirmedDate: "2026-09-01" }),
      datedCard({
        scopeId: "proof",
        confirmedDate: "2026-09-01",
        statusKey: "delivered",
        statusLabel: "Delivered",
        logisticsPartnerId: "p-nets",
        missingProof: { photo: true, signedDo: true },
      }),
      datedCard({ scopeId: "dateless", confirmedDate: null }),
    ];
    const counts = monthDayCounts(set, TODAY);
    expect(counts.get("2026-09-04")).toEqual({ deliveries: 3, exceptions: 1, noLogistics: 2 });
    expect(counts.get("2026-09-01")).toEqual({ deliveries: 2, exceptions: 2, noLogistics: 1 });
    // A dateless row sits on no day.
    expect(counts.size).toBe(2);
  });

  it("the cell's sentence says the same three facts in words — zero lines omitted", () => {
    expect(monthDaySentence("Fri, 4 Sep", { deliveries: 3, exceptions: 1, noLogistics: 2 })).toBe(
      "Fri, 4 Sep — 3 deliveries · 1 exception · 2 No logistics picked",
    );
    expect(monthDaySentence("Fri, 4 Sep", { deliveries: 1, exceptions: 0, noLogistics: 0 })).toBe(
      "Fri, 4 Sep — 1 delivery",
    );
    expect(monthDaySentence("Fri, 4 Sep", undefined)).toBe("Fri, 4 Sep — No deliveries");
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

describe("the work list's own words — never `scope` (owner correction 2026-09-07)", () => {
  it("the footer counts deliveries", () => {
    expect(deliveriesFooter(1, 1)).toBe("1 delivery");
    expect(deliveriesFooter(3, 3)).toBe("3 deliveries");
    expect(deliveriesFooter(2, 9)).toBe("2 of 9 deliveries");
  });

  it("the selection toolbar counts with no invented unit word", () => {
    expect(selectedSentence(1)).toBe("1 selected");
    expect(selectedSentence(3)).toBe("3 selected");
  });

  it("no visible word says scope or leg", () => {
    for (const word of Object.values(MONITOR_COPY)) {
      expect(word).not.toMatch(/\bscopes?\b/i);
      expect(word).not.toMatch(/\blegs?\b/i);
    }
  });
});

describe("activeFilterLabels", () => {
  it("names every active pick in rail order — the combined narrowing is visible", () => {
    expect(
      activeFilterLabels(
        { ...noFilters, view: "no_confirmed_date", logisticsPartnerId: "none", status: "waiting_warehouse" },
        () => null,
      ),
    ).toEqual([MONITOR_COPY.noConfirmedDate, MONITOR_COPY.noLogistics, MONITOR_STATUS_LABEL.waiting_warehouse]);
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

  it("`All delivery work` is a pick like any other and prints — the way back to the Calendar stays on screen", () => {
    expect(activeFilterLabels({ ...noFilters, view: "all" }, () => null)).toEqual([
      MONITOR_COPY.allDeliveryWork,
    ]);
  });
});

describe("buildMonitorRails", () => {
  const set = [
    datedCard({ scopeId: "in-window" }),
    datedCard({ scopeId: "dateless", confirmedDate: null }),
    datedCard({ scopeId: "overdue", confirmedDate: "2026-09-01" }),
    datedCard({ scopeId: "failed", statusKey: "failed", statusLabel: "Failed Delivery" }),
    datedCard({
      scopeId: "proof",
      statusKey: "delivered",
      statusLabel: "Delivered",
      missingProof: { photo: true, signedDo: false },
    }),
    datedCard({ scopeId: "wh", statusKey: "waiting_warehouse", statusLabel: "Waiting for warehouse" }),
    datedCard({ scopeId: "ready", statusKey: "ready_for_handover", statusLabel: "Ready for handover" }),
    datedCard({ scopeId: "nets", logisticsPartnerId: "p-nets", logisticsPartnerName: "NETS", region: "Kuala Lumpur", statusKey: "out_for_delivery", statusLabel: "Out for delivery" }),
  ];
  const partners = [
    { id: "p-nets", name: "NETS" },
    { id: "p-al", name: "AL" },
    { id: "p-houzs", name: "HOUZS" },
  ];

  it("counts every WORK TO DO row over the OTHER filters' narrowing — no Calendar row, no Waiting for warehouse row", () => {
    const rails = buildMonitorRails(set, noFilters, partners);
    expect(rails.work.all).toBe(8);
    // Every card but the NETS one is unassigned — the primary queue's count.
    expect(rails.work.no_logistics).toBe(7);
    expect(rails.work.no_confirmed_date).toBe(1);
    expect(rails.work.overdue).toBe(1);
    expect(rails.work.failed).toBe(1);
    expect(rails.work.upload_proof).toBe(1);
    expect(Object.keys(rails.work).sort()).toEqual([...MONITOR_WORK_VIEWS].sort());
  });

  it("DELIVERY STATUS counts the three fixed rungs, zero printed", () => {
    const rails = buildMonitorRails(set, noFilters, partners);
    expect(rails.status).toEqual({ waiting_warehouse: 1, ready_for_handover: 1, out_for_delivery: 1 });
    const narrowed = buildMonitorRails(set, { ...noFilters, region: "Selangor" }, partners);
    expect(narrowed.status.out_for_delivery).toBe(0);
  });

  it("a picked partner narrows the state counts but not its own group", () => {
    const rails = buildMonitorRails(set, { ...noFilters, logisticsPartnerId: "p-nets" }, partners);
    // States are counted over the partner narrowing…
    expect(rails.regions.find((r) => r.key === "Kuala Lumpur")!.count).toBe(1);
    expect(rails.regions.find((r) => r.key === "Selangor")).toBeUndefined();
    // …but the logistics group still shows what each partner WOULD give.
    expect(rails.logistics.find((r) => r.key === "p-nets")!.count).toBe(1);
    // The unassigned queue lives in WORK TO DO, never as a partner row —
    // and under the NETS pick its count is honestly what clicking gives: 0.
    expect(rails.logistics.some((r) => r.key === "none")).toBe(false);
    expect(rails.work.no_logistics).toBe(0);
  });

  it("a picked status narrows the work counts", () => {
    const rails = buildMonitorRails(set, { ...noFilters, status: "waiting_warehouse" }, partners);
    expect(rails.work.all).toBe(1);
    expect(rails.work.no_logistics).toBe(1);
    expect(rails.work.failed).toBe(0);
  });

  it("STATE is FLAT direct names — no sub-headings, no fixed zero rows", () => {
    const rails = buildMonitorRails(set, noFilters, partners);
    expect(rails.regions.map((r) => r.key)).toEqual(["Selangor", "Kuala Lumpur"]);
    expect(rails.regions.every((r) => !("heading" in r && r.heading))).toBe(true);
  });

  it("a picked state never disappears — it stays listed at 0", () => {
    const rails = buildMonitorRails(set, { ...noFilters, region: "Sabah" }, partners);
    expect(rails.regions.find((r) => r.key === "Sabah")!.count).toBe(0);
  });

  it("LOGISTICS PARTNER lists only partners genuinely carrying a matching row — never a duplicated No logistics picked row", () => {
    const rails = buildMonitorRails(set, noFilters, partners);
    const labels = rails.logistics.map((r) => r.label);
    // NETS carries one; AL and HOUZS carry nothing and are not listed.
    expect(labels).toEqual(["NETS"]);
    expect(labels).not.toContain(MONITOR_COPY.noLogistics);
  });

  it("a partner the table read missed still lands on its NAME, never a raw id", () => {
    const withLeg = [
      ...set,
      datedCard({ scopeId: "leg", logisticsPartnerId: "p-ssy", logisticsPartnerName: "SSY" }),
    ];
    const rails = buildMonitorRails(withLeg, noFilters, partners);
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
    const rails = buildMonitorRails(withMore, noFilters, partners);
    // NETS · AL · HOUZS is the governed order — never alphabetical.
    expect(rails.logistics.map((r) => r.label)).toEqual(["NETS", "AL", "HOUZS"]);
  });
});

describe("the ruled rail groups (owner correction 2026-09-07)", () => {
  it("WORK TO DO is the six queues in the ruled order — no Calendar, no Waiting for warehouse, no Proof Required", () => {
    expect(MONITOR_WORK_VIEWS).toEqual([
      "all",
      "no_logistics",
      "no_confirmed_date",
      "overdue",
      "failed",
      "upload_proof",
    ]);
    expect(MONITOR_VIEW_LABEL.all).toBe(MONITOR_COPY.allDeliveryWork);
    expect(MONITOR_VIEW_LABEL.no_logistics).toBe(MONITOR_COPY.noLogistics);
    expect(MONITOR_VIEW_LABEL.upload_proof).toBe("Upload delivery proof");
    expect(Object.values(MONITOR_VIEW_LABEL)).not.toContain("Calendar");
    expect(Object.values(MONITOR_VIEW_LABEL)).not.toContain("Delivered — Proof Required");
  });

  it("DELIVERY STATUS is the three fixed rungs in the shared words", () => {
    expect(MONITOR_STATUS_FILTERS).toEqual(["waiting_warehouse", "ready_for_handover", "out_for_delivery"]);
    expect(MONITOR_STATUS_LABEL.waiting_warehouse).toBe("Waiting for warehouse");
    expect(MONITOR_STATUS_LABEL.ready_for_handover).toBe("Ready for handover");
    expect(MONITOR_STATUS_LABEL.out_for_delivery).toBe("Out for delivery");
  });

  it("the group headings are the owner's words", () => {
    expect(MONITOR_COPY.railWork).toBe("WORK TO DO");
    expect(MONITOR_COPY.railState).toBe("STATE");
    expect(MONITOR_COPY.railLogistics).toBe("LOGISTICS PARTNER");
    expect(MONITOR_COPY.railStatus).toBe("DELIVERY STATUS");
  });
});
