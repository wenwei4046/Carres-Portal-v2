/**
 * ⭐ THE STORED CALENDARS AND LEADS REACH THE WORK FEED (9 Oct 2026).
 *
 * Office deadlines count on Settings → Office; the payment clock counts the
 * outstation pair for an outstation company; `Assign logistics` is due by the
 * stored Delivery Rules lead; a GRN's lateness counts on its own Site.
 */
import { describe, expect, it } from "vitest";
import { DEFAULT_OFFICE_CALENDAR, deliveryCalendarOf, officeCalendarOf } from "@carres/shared";
import type { InvoiceRegisterRow } from "@carres/shared/payment-invoice-register";
import {
  projectPaymentCollectionWork,
  projectPurchaseOrderReplyWork,
  projectSalesOrderWork,
  receivingWorkSourceFromModuleFacts,
  workFeedCalendarsOf,
} from "./work";

const person = { userId: "op-1", name: "Shasha" };
const owner = () => ({
  dutyKey: "delivery_duty",
  onDate: "2026-10-20",
  normalOwner: person,
  buddy: null,
  activeCover: null,
  actingPerson: person,
  state: "primary" as const,
  assignmentId: "a-1",
});

function invoice(over: { confirmed: string; kv?: boolean }): InvoiceRegisterRow {
  return {
    id: `inv-${over.confirmed}-${String(over.kv)}`,
    invoice_no: "INV-1",
    status: "issued",
    kind: "sales",
    amount: 1000,
    tax_amount: 0,
    issued_at: "2026-10-01T00:00:00Z",
    voided_at: null,
    void_reason: null,
    replaces_invoice_id: null,
    created_at: "2026-10-01T00:00:00Z",
    order_id: "order-1",
    orders: {
      id: "order-1",
      so: 1,
      customer_name: "Tan",
      status: "proceed_order",
      paid: 0,
      delivery_date: over.confirmed,
      delivery_date_tbd: false,
      delivered_at: null,
      ...(over.kv === undefined ? {} : { delivery_partners: { name: "Co", contact: null, kv_default: over.kv } }),
      order_payments: [],
      payment_communications: [],
      order_lines: [{ sku: "SOFA-1", qty: 1, unit_price: 1000 }],
      order_addons: [],
      ops_order_control: [{ balance: null, confirmed_date: over.confirmed, line_etas: null, line_stock_status: { "SOFA-1": "ready" } }],
    },
  } as InvoiceRegisterRow;
}

describe("the payment clock in Work", () => {
  it("an outstation company's invoice is due 3 working days before delivery, the Klang Valley one 2", () => {
    // Wed 28 Oct 2026: KV deadline Mon 26 · outstation Sat 24 → a Mon–Fri owner acts Fri 23.
    const [kv] = projectPaymentCollectionWork({ invoices: [invoice({ confirmed: "2026-10-28", kv: true })], ownerFor: owner, today: "2026-10-20" });
    const [out] = projectPaymentCollectionWork({ invoices: [invoice({ confirmed: "2026-10-28", kv: false })], ownerFor: owner, today: "2026-10-20" });
    expect(kv?.timing.actionOn).toBe("2026-10-26");
    expect(out?.timing.actionOn).toBe("2026-10-23");
  });

  it("the stored outstation pair is the one counted", () => {
    const rules = [{ askDaysBefore: 3, deadlineDaysBefore: 2, outstationAskDaysBefore: 6, outstationDeadlineDaysBefore: 5, effectiveFrom: "2026-09-01" }];
    const [out] = projectPaymentCollectionWork({
      invoices: [invoice({ confirmed: "2026-10-28", kv: false })], ownerFor: owner, today: "2026-10-20", timingRules: rules,
    });
    // T−5 of Wed 28 (Mon–Sat) = Thu 22.
    expect(out?.timing.actionOn).toBe("2026-10-22");
  });

  it("the owner's action day steps back on the stored Office calendar", () => {
    // Tue 27 Oct: the deadline FACT is Sat 24. A Mon–Fri Office acts Fri 23;
    // an Office whose working weekdays include Saturday acts on Saturday.
    const monFri = projectPaymentCollectionWork({ invoices: [invoice({ confirmed: "2026-10-27" })], ownerFor: owner, today: "2026-10-20" });
    expect(monFri[0]?.timing.actionOn).toBe("2026-10-23");
    const calendars = workFeedCalendarsOf({ ...DEFAULT_OFFICE_CALENDAR, workDays: [1, 2, 3, 4, 5, 6] });
    const monSat = projectPaymentCollectionWork({ invoices: [invoice({ confirmed: "2026-10-27" })], ownerFor: owner, today: "2026-10-20", calendars });
    expect(monSat[0]?.timing.actionOn).toBe("2026-10-24");
  });
});

describe("Sales Order Work counts with holidays and the stored leads", () => {
  const context = {
    orderId: "order-9",
    so: 9,
    picName: "PIC",
    picUserId: "pic-1",
    promisedDateIso: "2026-09-17",
    confirmedDateIso: null,
    deliveredAtIso: null,
    delayDetectedAtIso: null,
    delayDecisionAtIso: null,
  };

  it("the Scheduled-date deadline skips Malaysia Day (the feed once passed no holidays at all)", () => {
    // Requested Thu 17 Sep 2026; Wed 16 is Malaysia Day → T−1 Tue 15, T−2 Mon 14.
    const [item] = projectSalesOrderWork({
      open: [{ key: "confirm_delivery_date", track: "delivery", tone: "warning" }],
      context,
      customer: "Tan",
      today: "2026-09-10",
    });
    expect(item?.timing.actionOn).toBe("2026-09-14");
  });

  it("Assign logistics is due by the stored Delivery Rules lead, not the PO day", () => {
    const assign = (leads?: { chase: number; assign?: number }) => projectSalesOrderWork({
      open: [{ key: "assign_logistics", track: "delivery", tone: "warning" }],
      context: { ...context, promisedDateIso: "2026-10-27", poIssuedAtIso: "2026-10-01" },
      customer: "Tan",
      today: "2026-10-05",
      queueLeads: leads,
    })[0]?.timing.actionOn;
    expect(assign()).toBe("2026-10-23"); // the seed 3
    expect(assign({ chase: 3, assign: 5 })).toBe("2026-10-21");
  });
});

describe("Purchasing Work reads the stored Office calendar", () => {
  it("a passed supplier date on an Office holiday moves to the next Office working day", () => {
    const po = {
      id: "PO-1",
      supplier_id: "s-1",
      status: "open" as const,
      version: 1,
      official_delivery_date: "2026-10-21",
      promises: [],
      sends: [{ kind: "confirmed_sent" as const, channel: "whatsapp", sent_at: "2026-10-01T02:00:00Z", po_version: 1 }],
      purchase_order_lines: [{ id: "l-1", qty: 2, received_qty: 0 }],
    };
    const due = (office?: ReturnType<typeof workFeedCalendarsOf>["office"]) =>
      projectPurchaseOrderReplyWork({ pos: [po], suppliers: [], poDuty: null, today: "2026-10-27", office })[0]?.timing.actionOn;
    const before = due();
    const office = workFeedCalendarsOf({
      ...DEFAULT_OFFICE_CALENDAR,
      holidays: [...DEFAULT_OFFICE_CALENDAR.holidays, { date: "2026-10-21", name: "Office closed" }],
    }).office;
    expect(before).toBe("2026-10-21");
    expect(due(office)).toBe("2026-10-22");
  });
});

describe("GRN lateness names the receiving Site", () => {
  it("carries the actual Site, else the PO's Warehouse", () => {
    const source = receivingWorkSourceFromModuleFacts({
      receipts: [
        { id: "r-1", po_id: "PO-1", supplier_name: "A", status: "submitted", submitted_at: "2026-10-01T00:00:00Z", actual_site_id: "site-b", warehouse_id: "site-a" },
        { id: "r-2", po_id: "PO-2", supplier_name: "B", status: "submitted", submitted_at: "2026-10-01T00:00:00Z", warehouse_id: "site-a" },
        { id: "r-3", po_id: "PO-3", supplier_name: "C", status: "submitted", submitted_at: "2026-10-01T00:00:00Z" },
      ],
    });
    expect(source.submitted.map((r) => r.site_id)).toEqual(["site-b", "site-a", null]);
  });
});

describe("⭐ the Delivery calendar and the responsible person's week reach the feed (9 Oct 2026)", () => {
  /** An Office whose 2026 Kuala Lumpur holidays were recorded — the Sultan of
   *  Selangor's Birthday (Fri 11 Dec) is not one of them. */
  const KL = officeCalendarOf(null, [
    { holiday_date: "2026-01-01", name: "New Year's Day" },
    { holiday_date: "2026-02-01", name: "Federal Territory Day" },
    { holiday_date: "2026-12-25", name: "Christmas Day" },
  ]);

  it("the payment FACT counts on the Delivery (Selangor) calendar, never the Office list", () => {
    // Mon 14 Dec 2026, deadline 2 Delivery working days: Sat 12 · (Fri 11) · Thu 10.
    const [item] = projectPaymentCollectionWork({
      invoices: [invoice({ confirmed: "2026-12-14" })], ownerFor: owner, today: "2026-12-01",
      calendars: workFeedCalendarsOf(KL),
    });
    expect(item?.timing.actionOn).toBe("2026-12-10");
  });

  it("the action day follows the responsible person's own working week; no record ⇒ Office weekdays", () => {
    // Tue 27 Oct: the deadline FACT is Sat 24.
    const people = new Map<string, number[]>([["op-1", [1, 2, 3, 4, 5, 6]]]);
    const calendars = workFeedCalendarsOf(DEFAULT_OFFICE_CALENDAR, undefined, people);
    const sat = projectPaymentCollectionWork({
      invoices: [invoice({ confirmed: "2026-10-27" })], ownerFor: owner, today: "2026-10-20", calendars,
      ownerCalendarFor: () => calendars.ownerOf("op-1"),
    });
    expect(sat[0]?.timing.actionOn).toBe("2026-10-24");
    const unrecorded = projectPaymentCollectionWork({
      invoices: [invoice({ confirmed: "2026-10-27" })], ownerFor: owner, today: "2026-10-20", calendars,
      ownerCalendarFor: () => calendars.ownerOf("op-2"),
    });
    expect(unrecorded[0]?.timing.actionOn).toBe("2026-10-23");
  });

  it("an imported Warehouse (Selangor) holiday moves a Delivery due; the Office calendar does not", () => {
    // Delivered Mon 19 Oct 2026; the imported 2026 calendar closes Tue 20 Oct.
    const imported = deliveryCalendarOf({ region: "Selangor", dates: [{ onDate: "2026-10-20", name: "Imported holiday" }] });
    const photo = (calendars?: ReturnType<typeof workFeedCalendarsOf>) => projectSalesOrderWork({
      open: [{ key: "upload_delivery_photo", track: "delivery", tone: "warning" }],
      context: {
        orderId: "order-7", so: 7, picName: "PIC", picUserId: "pic-1",
        promisedDateIso: "2026-10-19", confirmedDateIso: "2026-10-19", deliveredAtIso: "2026-10-19T08:00:00Z",
        delayDetectedAtIso: null, delayDecisionAtIso: null,
      },
      customer: "Tan",
      today: "2026-10-19",
      calendars,
    })[0]?.timing.actionOn;
    expect(photo()).toBe("2026-10-20");
    expect(photo(workFeedCalendarsOf(DEFAULT_OFFICE_CALENDAR, imported))).toBe("2026-10-21");
  });
});
