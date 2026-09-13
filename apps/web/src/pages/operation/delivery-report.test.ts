import { describe, expect, it } from "vitest";
import type {
  DeliveryArrangementRow,
  DeliveryOrderAttemptRow,
  DeliveryOrderRow,
  DeliveryPartnerRow,
  operationOrderListRow,
} from "@/lib/queries";
import type { DeliveryContactRow, InboundArrival } from "@carres/shared";
import { buildDeliveryMonitorCards } from "./delivery-monitor";
import {
  DR,
  RATE_MIN_RECORDS,
  ageingBuckets,
  ageingRowsOf,
  commitmentLine,
  commitmentRowsOf,
  contactLine,
  contactRowsOf,
  contactsOverdueToday,
  daysBetween,
  failedReasonGroups,
  failedRowsOf,
  firstDeliveryLine,
  firstDeliveryRowsOf,
  partnerLine,
  partnerRowsOf,
  proofCounts,
  proofRowsOf,
  rateWord,
  registerRowsOf,
  reportMonthsOf,
  returnRowsOf,
  scheduleDaysOf,
  scheduleLine,
  scopeKeyOf,
  warehouseLine,
  warehouseRowsOf,
} from "./delivery-report";

/**
 * Reports → Delivery (Delivery MASTER §12, CARD 17) — the ten listings'
 * arithmetic: computed from the SAME register rows and Monitor cards the
 * registers print, every exclusion stated, and a rate withheld below five
 * records.
 */

const TODAY = "2026-09-13";
const M = "2026-09";

function doc(over: Partial<DeliveryOrderRow> & { id: string; do_number: string }): DeliveryOrderRow {
  return {
    issued_at: "2026-09-01T00:00:00Z",
    trip_groups: null,
    delivery_date: "2026-09-10",
    time_slot: "2 PM to 5 PM",
    logistics_partner: "NETS",
    voided_at: null,
    void_reason: null,
    orders: { id: `o-${over.id}`, so: 1300, customer_name: "kong chai yin", delivery_date: "2026-09-10", delivery_date_tbd: false },
    ...over,
  };
}

function attempt(
  over: Partial<DeliveryOrderAttemptRow> & { do_number: string; result: DeliveryOrderAttemptRow["result"]; recorded_at: string },
): DeliveryOrderAttemptRow {
  return { reason_key: null, ...over };
}

const partners: DeliveryPartnerRow[] = [
  { id: "p-nets", name: "NETS", contact: null, zones: null },
  { id: "p-al", name: "AL", contact: null, zones: null },
];

describe("rateWord — a rate with too few records is not printed (§12)", () => {
  it("withholds below five records and prints from five", () => {
    expect(rateWord(3, RATE_MIN_RECORDS - 1)).toBe(DR.rateWithheld);
    expect(rateWord(4, 5)).toBe("4 of 5 · 80%");
  });
});

describe("Delivery Commitment Performance", () => {
  const docs = [
    doc({ id: "d1", do_number: "DO-1", orders: { id: "o1", so: 1301, customer_name: "a", delivery_date: "2026-09-10", delivery_date_tbd: false } }),
    doc({ id: "d2", do_number: "DO-2", orders: { id: "o2", so: 1302, customer_name: "b", delivery_date: "2026-09-05", delivery_date_tbd: false } }),
    doc({ id: "d3", do_number: "DO-3", orders: { id: "o3", so: 1303, customer_name: "c", delivery_date: null, delivery_date_tbd: true } }),
    /* An intermediate Journey leg — a warehouse trip, excluded. */
    doc({ id: "d4", do_number: "DO-4", leg: 1, orders: { id: "o4", so: 1304, customer_name: "d", delivery_date: "2026-09-10", delivery_date_tbd: false, delivery_stops: [{ leg: 1 }, { leg: 2 }] as never } }),
  ];
  const attempts = [
    attempt({ do_number: "DO-1", result: "delivered", recorded_at: "2026-09-09T08:00:00Z" }),
    attempt({ do_number: "DO-2", result: "delivered", recorded_at: "2026-09-08T08:00:00Z" }),
    attempt({ do_number: "DO-3", result: "partial", recorded_at: "2026-09-07T08:00:00Z" }),
    attempt({ do_number: "DO-4", result: "delivered", recorded_at: "2026-09-06T08:00:00Z" }),
    /* Last month — enters that month's measure only. */
    attempt({ do_number: "DO-1", result: "failed", recorded_at: "2026-08-20T08:00:00Z" }),
  ];
  const rows = registerRowsOf({ deliveryOrders: docs, attempts, handoverEvents: [] });

  it("compares the delivered day with the requested day, lists the undated and excludes legs", () => {
    const out = commitmentRowsOf(rows, attempts, M);
    expect(out.map((r) => [r.row.doNumber, r.kept])).toEqual([
      ["DO-1", true],
      ["DO-2", false],
      ["DO-3", null],
    ]);
    expect(commitmentLine(out)).toBe(`3 deliveries · ${DR.keptRequestedDate} ${DR.rateWithheld}`);
  });

  it("counts first visits as actual delivery events only", () => {
    const out = firstDeliveryRowsOf(rows, attempts, M);
    /* DO-1's first visit was August's failure — not a September first visit. */
    expect(out.map((r) => r.row.doNumber)).toEqual(["DO-2", "DO-3"]);
    expect(firstDeliveryLine(out)).toContain(DR.rateWithheld);
    expect(firstDeliveryRowsOf(rows, attempts, "2026-08").map((r) => [r.row.doNumber, r.first.result])).toEqual([["DO-1", "failed"]]);
  });
});

describe("Failed Delivery Analysis — observed reason, grouped", () => {
  it("lists every failed visit of the month by the reason library's word and category", () => {
    const docs = [doc({ id: "d1", do_number: "DO-1" }), doc({ id: "d2", do_number: "DO-2" })];
    const attempts = [
      attempt({ do_number: "DO-1", result: "failed", reason_key: "customer_unreachable", recorded_at: "2026-09-02T08:00:00Z" }),
      attempt({ do_number: "DO-2", result: "failed", reason_key: "customer_unreachable", recorded_at: "2026-09-03T08:00:00Z" }),
      attempt({ do_number: "DO-2", result: "failed", reason_key: "vehicle_breakdown", recorded_at: "2026-09-04T08:00:00Z" }),
      attempt({ do_number: "DO-2", result: "delivered", recorded_at: "2026-09-05T08:00:00Z" }),
    ];
    const rows = registerRowsOf({ deliveryOrders: docs, attempts, handoverEvents: [] });
    const out = failedRowsOf(rows, attempts, M);
    expect(out).toHaveLength(3);
    expect(failedReasonGroups(out)).toEqual([
      { reason: "Customer unreachable", category: "Customer", count: 2 },
      { reason: "Vehicle breakdown", category: "Logistic", count: 1 },
    ]);
  });
});

describe("Logistics Partner Performance", () => {
  it("counts results by the partner named on the document, and Cannot Deliver by the partner that said so", () => {
    const docs = [
      doc({ id: "d1", do_number: "DO-1", logistics_partner: "NETS" }),
      doc({ id: "d2", do_number: "DO-2", logistics_partner: "AL" }),
      doc({ id: "d3", do_number: "DO-3", logistics_partner: null }),
    ];
    const attempts = [
      attempt({ do_number: "DO-1", result: "delivered", recorded_at: "2026-09-02T08:00:00Z" }),
      attempt({ do_number: "DO-1", result: "failed", recorded_at: "2026-09-01T08:00:00Z" }),
      attempt({ do_number: "DO-2", result: "partial", recorded_at: "2026-09-02T08:00:00Z" }),
      attempt({ do_number: "DO-3", result: "delivered", recorded_at: "2026-09-02T08:00:00Z" }),
    ];
    const rows = registerRowsOf({ deliveryOrders: docs, attempts, handoverEvents: [] });
    const out = partnerRowsOf({
      rows,
      attempts,
      partners,
      month: M,
      cannotDeliver: [
        { id: "c1", order_id: "o1", leg: 0, partner_id: "p-nets", reason_key: "no_capacity", note: null, recorded_at: "2026-09-03T00:00:00Z" },
        { id: "c2", order_id: "o9", leg: 0, partner_id: "p-nets", reason_key: "wrong_area", note: null, recorded_at: "2026-08-03T00:00:00Z" },
      ],
    });
    expect(out.map((r) => [r.name, r.trips, r.delivered, r.partial, r.failed, r.cannotDeliver])).toEqual([
      ["NETS", 2, 1, 0, 1, 1],
      ["AL", 1, 0, 1, 0, 0],
      [DR.noLogisticsNamed, 1, 1, 0, 0, 0],
    ]);
    expect(out[0].href).toBe("/operation?tab=delivery&view=all&logistics=p-nets");
    expect(partnerLine(out[0])).toBe("2 trips · 1 delivered · 1 failed · Cannot Deliver 1");
    expect(partnerLine(out[1])).toBe("1 trip · 0 delivered · 1 partly delivered · 0 failed · Cannot Deliver 0");
  });

  it("says Not available when the Cannot Deliver read is absent — never 0", () => {
    const docs = [doc({ id: "d1", do_number: "DO-1" })];
    const attempts = [attempt({ do_number: "DO-1", result: "delivered", recorded_at: "2026-09-02T08:00:00Z" })];
    const rows = registerRowsOf({ deliveryOrders: docs, attempts, handoverEvents: [] });
    const out = partnerRowsOf({ rows, attempts, partners, month: M, cannotDeliver: undefined });
    expect(out[0].cannotDeliver).toBeNull();
    expect(partnerLine(out[0])).toContain(`Cannot Deliver ${DR.notAvailable}`);
  });
});

describe("Warehouse Performance — the handover chain against the delivery day", () => {
  it("times the handover against the confirmed day and lists an undated one uncounted", () => {
    const docs = [
      doc({ id: "d1", do_number: "DO-1", delivery_date: "2026-09-10" }),
      doc({ id: "d2", do_number: "DO-2", delivery_date: "2026-09-10" }),
      doc({ id: "d3", do_number: "DO-3", delivery_date: null }),
    ];
    const rows = registerRowsOf({ deliveryOrders: docs, attempts: [], handoverEvents: [] });
    const out = warehouseRowsOf(rows, [
      { delivery_order_id: "d1", kind: "ready_for_handover", recorded_at: "2026-09-08T02:00:00Z" },
      { delivery_order_id: "d1", kind: "handed_over", recorded_at: "2026-09-10T01:00:00Z" },
      { delivery_order_id: "d2", kind: "handed_over", recorded_at: "2026-09-11T01:00:00Z" },
      { delivery_order_id: "d3", kind: "received_by_logistics", recorded_at: "2026-09-12T01:00:00Z" },
      { delivery_order_id: "d3", kind: "ready_for_handover", recorded_at: "2026-08-12T01:00:00Z" },
    ], M);
    expect(out.map((r) => [r.row.doNumber, r.byDeliveryDay, r.readyAt !== null])).toEqual([
      ["DO-3", null, true],
      ["DO-2", false, false],
      ["DO-1", true, true],
    ]);
    expect(warehouseLine(out)).toBe(`3 handovers · ${DR.handedOverByDeliveryDay} ${DR.rateWithheld}`);
  });
});

describe("Delivery Proof Control — the register's own state", () => {
  it("names each reached result's proof state and counts them", () => {
    const docs = [
      doc({ id: "d1", do_number: "DO-1", orders: { id: "o1", so: 1301, customer_name: "a", do_file_path: "signed.pdf", do_uploaded_at: "2026-09-10T09:00:00Z", ops_order_control: { delivery_photos: [{ path: "p.jpg", at: "2026-09-10T08:30:00Z", doNumber: "DO-1" }] } as never } }),
      doc({ id: "d2", do_number: "DO-2", orders: { id: "o2", so: 1302, customer_name: "b", do_file_path: null, ops_order_control: { delivery_photos: [] } as never } }),
    ];
    const attempts = [
      attempt({ do_number: "DO-1", result: "delivered", recorded_at: "2026-09-10T08:00:00Z" }),
      attempt({ do_number: "DO-2", result: "delivered", recorded_at: "2026-09-11T08:00:00Z" }),
    ];
    const rows = registerRowsOf({
      deliveryOrders: docs,
      attempts,
      handoverEvents: [],
      proofReviews: [{ id: "r1", order_id: "o1", do_number: "DO-1", attempt_id: null, decision: "accepted", reason: null, reviewed_by: null, reviewed_at: "2026-09-10T10:00:00Z" }],
    });
    const out = proofRowsOf(rows, attempts, M);
    expect(out.map((r) => [r.row.doNumber, r.word, r.missing])).toEqual([
      ["DO-2", DR.noProofYet, ["Delivery photo missing", "Signed Delivery Order missing"]],
      ["DO-1", "Proof Accepted", []],
    ]);
    expect(proofCounts(out)).toEqual([
      { word: DR.noProofYet, count: 1 },
      { word: "Proof Accepted", count: 1 },
    ]);
  });
});

describe("Schedule and Capacity — the confirmed days", () => {
  it("counts confirmed arrangements per day and per partner, booked when a time is agreed", () => {
    const base = { expected_arrival: null, logistics_note: null, reply_proof_path: null, driver_name: null, vehicle: null, updated_at: "", updated_by: null };
    const arrangements: DeliveryArrangementRow[] = [
      { id: "a1", order_id: "o1", leg: 0, partner_id: "p-nets", partner_name: "NETS", confirmed_date: "2026-09-10", confirmed_time: "2 PM to 5 PM", ...base },
      { id: "a2", order_id: "o2", leg: 0, partner_id: "p-nets", partner_name: null, confirmed_date: "2026-09-10", confirmed_time: null, ...base },
      { id: "a3", order_id: "o3", leg: 0, partner_id: null, partner_name: null, confirmed_date: "2026-09-12", confirmed_time: "10 AM", ...base },
      { id: "a4", order_id: "o4", leg: 0, partner_id: null, partner_name: null, confirmed_date: null, confirmed_time: null, ...base },
    ];
    const out = scheduleDaysOf(arrangements, new Map([["p-nets", "NETS"]]), M);
    expect(out.map((d) => [d.day, d.total, d.booked, d.byPartner])).toEqual([
      ["2026-09-10", 2, 1, [{ name: "NETS", count: 2 }]],
      ["2026-09-12", 1, 1, [{ name: DR.noLogisticsNamed, count: 1 }]],
    ]);
    expect(out[0].href).toBe("/operation?tab=delivery&date=2026-09-10");
    expect(scheduleLine(out)).toBe("3 deliveries confirmed across 2 days · busiest 2026-09-10 with 2");
  });
});

/* ── Today's facts ride the SAME Monitor cards Monitor draws ───────────── */

function order(over: Partial<operationOrderListRow> & { id: string; so: number }): operationOrderListRow {
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
    delivery_floor: 0,
    delivery_has_lift: true,
    placed_at: "2026-08-01T00:00:00Z",
    delivery_date: "2026-09-10",
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
  } as operationOrderListRow;
}

describe("Exception Ageing and contacts — today's facts", () => {
  const orders = [order({ id: "o1", so: 1301, do_number: "DO-1" }), order({ id: "o2", so: 1302, customer_name: "lim", do_number: "DO-2" }), order({ id: "o3", so: 1303 })];
  const docs = [
    doc({ id: "d1", do_number: "DO-1", order_id: "o1", delivery_date: "2026-09-01", orders: { id: "o1", so: 1301, customer_name: "kong chai yin" } }),
    doc({ id: "d2", do_number: "DO-2", order_id: "o2", delivery_date: "2026-09-12", orders: { id: "o2", so: 1302, customer_name: "lim" } }),
  ];
  const attempts = [attempt({ do_number: "DO-2", result: "failed", reason_key: "customer_unreachable", recorded_at: "2026-09-12T08:00:00Z" })];
  /* Delivery's OWN arrangement carries the confirmed day the Monitor reads. */
  const arrangementOf = (order_id: string, confirmed_date: string): DeliveryArrangementRow => ({
    id: `a-${order_id}`, order_id, leg: 0, partner_id: null, partner_name: null, confirmed_date, confirmed_time: "10 AM",
    expected_arrival: null, logistics_note: null, reply_proof_path: null, driver_name: null, vehicle: null, updated_at: "", updated_by: null,
  });
  const cards = buildDeliveryMonitorCards({
    orders,
    deliveryOrders: docs,
    attempts,
    handoverEvents: [],
    partnerNameById: new Map(),
    arrangements: new Map([
      ["o1#0", arrangementOf("o1", "2026-09-01")],
      ["o2#0", arrangementOf("o2", "2026-09-12")],
    ]),
    todayIso: TODAY,
  });

  it("ages an overdue trip from its confirmed day and a failure from the visit, oldest first", () => {
    const out = ageingRowsOf(cards, attempts, TODAY);
    expect(out.map((r) => [r.card.doNumber, r.kind, r.sinceIso, r.days, r.bucket])).toEqual([
      ["DO-1", DR.overdue, "2026-09-01", 12, DR.ageOver7],
      ["DO-2", DR.failedDelivery, "2026-09-12", 1, DR.age1to2],
    ]);
    expect(out[0].href).toBe("/operation/delivery-orders/d1");
    expect(ageingBuckets(out)).toEqual([
      { bucket: DR.ageOver7, count: 1 },
      { bucket: DR.age1to2, count: 1 },
    ]);
    expect(daysBetween("2026-09-13", "2026-09-13")).toBe(0);
  });

  it("lists the month's contacts as Monitor doors, names a proxy record, and counts today's overdue contacts", () => {
    const base = { contact_owner_user_id: null, reply_evidence_path: null, next_action: null, note: null, recorded_by: null };
    const contacts: DeliveryContactRow[] = [
      { id: "c1", order_id: "o3", leg: 0, purpose_key: "confirm_delivery_date", channel: "whatsapp", contacted_person: "customer", contacted_at: "2026-09-02T03:00:00Z", result_key: "confirmed", on_behalf_of_partner_id: null, recorded_at: "2026-09-02T03:00:00Z", ...base },
      { id: "c2", order_id: "o3", leg: 2, purpose_key: "confirm_delivery_time", channel: "call", contacted_person: "customer", contacted_at: "2026-09-03T03:00:00Z", result_key: "no_answer", on_behalf_of_partner_id: "p-nets", recorded_at: "2026-09-03T03:00:00Z", ...base },
      { id: "c3", order_id: "o3", leg: 0, purpose_key: "confirm_delivery_date", channel: "call", contacted_person: "customer", contacted_at: "2026-08-03T03:00:00Z", result_key: "confirmed", on_behalf_of_partner_id: null, recorded_at: "2026-08-03T03:00:00Z", ...base },
    ];
    const rows = registerRowsOf({ deliveryOrders: docs, attempts, handoverEvents: [] });
    const out = contactRowsOf({ contacts, rows, cards, partnerNameById: new Map([["p-nets", "NETS"]]), month: M });
    expect(out.map((r) => [r.contact.id, r.scopeWord, r.result, r.onBehalfOf, r.href])).toEqual([
      ["c2", "SO-1303 · Kong Chai Yin", "No Answer", "NETS", "/operation?tab=delivery&view=all&open=o3%23leg2"],
      ["c1", "SO-1303 · Kong Chai Yin", "Confirmed", null, "/operation?tab=delivery&view=all&open=o3"],
    ]);
    expect(contactLine(out)).toBe("2 contacts · 1 confirmed · 1 recorded on behalf of a partner");
    expect(scopeKeyOf("o3", null)).toBe("o3");
    /* o3's requested day is 2026-09-10 and nothing is booked: its contact
       deadline has passed — the SAME rule the rail's late row counts. */
    expect(contactsOverdueToday(cards)).toBe(cards.filter((c) => c.contactOverdue).length);
    expect(contactsOverdueToday(cards)).toBeGreaterThan(0);
  });
});

describe("Return-to-Warehouse Control — Inbound's receipt, never the Logistics report", () => {
  const docs = [doc({ id: "d1", do_number: "DO-1" }), doc({ id: "d2", do_number: "DO-2" }), doc({ id: "d3", do_number: "DO-3" })];
  const attempts = [
    attempt({ do_number: "DO-1", result: "failed", where_goods: "returned_to_warehouse", recorded_at: "2026-09-02T08:00:00Z" }),
    attempt({ do_number: "DO-2", result: "partial", where_goods: "still_with_logistics", recorded_at: "2026-09-03T08:00:00Z" }),
    attempt({ do_number: "DO-3", result: "failed", where_goods: "with_customer", recorded_at: "2026-09-04T08:00:00Z" }),
  ];
  const rows = registerRowsOf({ deliveryOrders: docs, attempts, handoverEvents: [] });
  const arrival = (over: Partial<InboundArrival>): InboundArrival =>
    ({ id: "ar", sourceId: "src-1", sourceType: "failed-delivery-return", documentWord: "DO No", documentNo: "DO-1", party: null, from: "NETS", siteId: "s", site: "Carres Klang", date: null, poDate: null, so: null, expected: 1, received: 0, remaining: 1, issues: 0, products: [], identitiesMissing: false, sessionId: null, sessions: [], units: [], ...over }) as InboundArrival;

  it("joins each returning visit to its Inbound arrival and opens it", () => {
    const out = returnRowsOf({ rows, attempts, arrivals: [arrival({})], month: M });
    expect(out.map((r) => [r.row.doNumber, r.whereGoods, r.inbound, r.href])).toEqual([
      ["DO-2", DR.stillWithLogistics, DR.noInboundArrival, "/operation/delivery-orders/d2"],
      ["DO-1", DR.returnedToWarehouse, `${DR.waitingAtInbound} · 0 of 1 received`, "/operation?tab=arrival-source&arrival=src-1"],
    ]);
    const received = returnRowsOf({ rows, attempts, arrivals: [arrival({ received: 1, remaining: 0 })], month: M });
    expect(received[1].inbound).toBe(`${DR.receivedAtInbound} · Carres Klang`);
  });

  it("says Inbound is not available when that read failed — never no arrival", () => {
    const out = returnRowsOf({ rows, attempts, arrivals: null, month: M });
    expect(out.every((r) => r.inbound === DR.inboundNotAvailable)).toBe(true);
  });
});

describe("reportMonthsOf — the months that hold a dated Delivery event", () => {
  it("collects every clock, newest first", () => {
    expect(
      reportMonthsOf({
        attempts: [attempt({ do_number: "DO-1", result: "failed", recorded_at: "2026-07-02T00:00:00Z" })],
        contacts: [],
        arrangements: [{ id: "a", order_id: "o", leg: 0, partner_id: null, partner_name: null, confirmed_date: "2026-09-10", confirmed_time: null, expected_arrival: null, logistics_note: null, reply_proof_path: null, driver_name: null, vehicle: null, updated_at: "", updated_by: null }],
        handoverEvents: [{ delivery_order_id: "d", kind: "handed_over", recorded_at: "2026-08-01T00:00:00Z" }],
        cannotDeliver: [{ id: "c", order_id: "o", leg: 0, partner_id: null, reason_key: null, note: null, recorded_at: "2026-06-01T00:00:00Z" }],
      }),
    ).toEqual(["2026-09", "2026-08", "2026-07", "2026-06"]);
  });
});

/* ── 【DELIVERY】 CARD 20 — the partner listing counts customer legs only ── */
describe("Logistics Partner Performance excludes a warehouse leg's arrival (Card 20)", () => {
  it("NETS's leg-1 arrival at the JB warehouse is not a delivered trip; AL's customer leg is", () => {
    const stops = [{ leg: 1 }, { leg: 2 }] as never;
    const docs = [
      doc({ id: "l1", do_number: "DO-L1", leg: 1, logistics_partner: "NETS", orders: { id: "o-sg", so: 1362, customer_name: "sg", delivery_date: "2026-09-18", delivery_date_tbd: false, delivery_stops: stops } }),
      doc({ id: "l2", do_number: "DO-L2", leg: 2, logistics_partner: "AL", orders: { id: "o-sg", so: 1362, customer_name: "sg", delivery_date: "2026-09-18", delivery_date_tbd: false, delivery_stops: stops } }),
    ];
    const attempts = [
      attempt({ do_number: "DO-L1", result: "delivered", recorded_at: "2026-09-13T12:23:00Z" }),
      attempt({ do_number: "DO-L2", result: "delivered", recorded_at: "2026-09-13T12:56:00Z" }),
    ];
    const rows = registerRowsOf({ deliveryOrders: docs, attempts, handoverEvents: [] });
    expect(rows.find((r) => r.doNumber === "DO-L1")?.status.kind).toBe("arrived");
    const out = partnerRowsOf({ rows, attempts, cannotDeliver: [], partners, month: M });
    expect(out.map((r) => [r.name, r.trips, r.delivered])).toEqual([["AL", 1, 1]]);
    expect(partnerLine(out[0]!)).toBe("1 trip · 1 delivered · 0 failed · Cannot Deliver 0");
  });
});
