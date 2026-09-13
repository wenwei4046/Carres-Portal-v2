/**
 * ONE SALES ORDER, ONE COLLECTION OWNER (owner ruling 2026-09-13; 0489).
 *
 * The ordinary customer-balance owner is the RESPONSIBLE DELIVERY OPERATION,
 * established once and kept until the balance is RM 0. These tests pin the
 * ruled behaviours at the projection layer: the owner is a per-order fact
 * handed in (`ownerFor`), so nothing about today, the delivery date, the
 * filter or a reload can rotate it; cover changes the acting person and
 * nothing else; the storage invoice rides the same owner; the exceptions keep
 * their own duties.
 */
import { describe, expect, it } from "vitest";
import {
  WORK_RULES,
  collectionOwnerResolution,
  type CollectionOwnerContextRow,
  type WorkspaceDutyResolution,
} from "@carres/shared";
import {
  projectOverpaymentReviewWork,
  projectPaymentCollectionWork,
  projectStorageInvoiceWork,
} from "./work";

const SHASHA = { userId: "0cab8bcf-6ebb-454e-ba21-b916e18cc419", name: "Shasha" };
const YUJUN = { userId: "aac9edf9-63ad-4d0a-ba91-e495a25f9896", name: "Yu Jun" };

function contextRow(over: Partial<CollectionOwnerContextRow> = {}): CollectionOwnerContextRow {
  return {
    order_id: "order-1", normal_user_id: SHASHA.userId, normal_user_name: SHASHA.name,
    cover_user_id: null, cover_user_name: null,
    acting_user_id: SHASHA.userId, acting_user_name: SHASHA.name,
    is_cover: false, cover_ends_on: null, source: "established",
    effective_from: "2026-09-01", established_on: "2026-09-01", history: [],
    ...over,
  };
}

function invoice(over: {
  id?: string; orderId?: string; so?: number; kind?: "sales" | "storage";
  paid?: number; amount?: number; confirmed?: string | null; invoiceNo?: string;
} = {}) {
  const orderId = over.orderId ?? "order-1";
  const confirmed = over.confirmed === undefined ? "2026-09-09" : over.confirmed;
  return {
    id: over.id ?? "inv-1", invoice_no: over.invoiceNo ?? "INV-1", status: "issued" as const,
    kind: over.kind ?? ("sales" as const), amount: over.amount ?? 1000, tax_amount: 0,
    issued_at: "2026-09-01T00:00:00Z", voided_at: null, void_reason: null, replaces_invoice_id: null,
    created_at: "2026-09-01T00:00:00Z", order_id: orderId,
    orders: {
      id: orderId, so: over.so ?? 2041, customer_name: "Tan Qu Qu", status: "proceed_order",
      paid: over.paid ?? 200, delivery_date: confirmed, delivery_date_tbd: false, delivered_at: null,
      order_payments: [], payment_communications: [],
      order_lines: [{ sku: "SOFA-1", qty: 1, unit_price: 1000 }], order_addons: [],
      ops_order_control: [{ balance: null, confirmed_date: confirmed, line_etas: null, line_stock_status: { "SOFA-1": "ready" } }],
    },
  };
}

const ownerOf = (rows: Record<string, CollectionOwnerContextRow | null>, today: string) =>
  (orderId: string): WorkspaceDutyResolution => collectionOwnerResolution(rows[orderId] ?? null, today);

describe("the rule table — Payment Duty is gone from ordinary collection", () => {
  const byKey = new Map(WORK_RULES.map((r) => [r.key, r]));
  it("ordinary balance, missed promise and the storage invoice resolve to the Responsible Delivery Operation", () => {
    expect(byKey.get("collect")!.ownerRule).toBe("collection_owner");
    expect(byKey.get("payment.collect_customer_balance")!.ownerRule).toBe("collection_owner");
    expect(byKey.get("payment.missed_promise")!.ownerRule).toBe("collection_owner");
    expect(byKey.get("payment.send_storage_invoice")!.ownerRule).toBe("collection_owner");
    for (const r of WORK_RULES) {
      expect((r.ownerRule as string)).not.toBe("payment_duty");
      expect(r.owner).not.toMatch(/Payment Duty/);
    }
  });
  it("Finance exception → Finance Control Duty · wrong or duplicate Payment → Payment Approver", () => {
    expect(byKey.get("resolve_payment_exception")!.ownerRule).toBe("finance_duty");
    expect(byKey.get("payment.review_overpayment")!.ownerRule).toBe("payment_approver_duty");
  });
});

describe("one stable normal owner", () => {
  const rows = { "order-1": contextRow() };

  it("same SO on different days → same normal owner", () => {
    const [mon] = projectPaymentCollectionWork({ invoices: [invoice()], ownerFor: ownerOf(rows, "2026-09-07"), today: "2026-09-07" });
    const [wed] = projectPaymentCollectionWork({ invoices: [invoice()], ownerFor: ownerOf(rows, "2026-09-09"), today: "2026-09-09" });
    const [fri] = projectPaymentCollectionWork({ invoices: [invoice()], ownerFor: ownerOf(rows, "2026-09-11"), today: "2026-09-11" });
    for (const item of [mon, wed, fri]) {
      expect(item?.owner.normal).toEqual(SHASHA);
      expect(item?.owner.acting).toEqual(SHASHA);
      expect(item?.owner.state).toBe("primary");
    }
  });

  it("page reload → same normal owner (the projection is deterministic over the same owner fact)", () => {
    const first = projectPaymentCollectionWork({ invoices: [invoice()], ownerFor: ownerOf(rows, "2026-09-08"), today: "2026-09-08" });
    const again = projectPaymentCollectionWork({ invoices: [invoice()], ownerFor: ownerOf(rows, "2026-09-08"), today: "2026-09-08" });
    expect(again).toEqual(first);
    expect(again[0]?.owner.normal).toEqual(SHASHA);
  });

  it("collection date changes → no silent owner rotation", () => {
    const [before] = projectPaymentCollectionWork({ invoices: [invoice({ confirmed: "2026-09-09" })], ownerFor: ownerOf(rows, "2026-09-08"), today: "2026-09-08" });
    const [after] = projectPaymentCollectionWork({ invoices: [invoice({ confirmed: "2026-09-10" })], ownerFor: ownerOf(rows, "2026-09-08"), today: "2026-09-08" });
    expect(before?.timing.dueOn).not.toBe(after?.timing.dueOn);
    expect(after?.owner.normal).toEqual(SHASHA);
    expect(after?.owner.acting).toEqual(SHASHA);
  });

  it("the owner is asked per ORDER, never per day or per duty — the projection consults nothing else", () => {
    const asked: string[] = [];
    projectPaymentCollectionWork({
      invoices: [invoice()],
      ownerFor: (orderId) => { asked.push(orderId); return collectionOwnerResolution(rows["order-1"], "2026-09-08"); },
      today: "2026-09-08",
    });
    expect(asked).toEqual(["order-1"]);
  });
});

describe("cover and handover", () => {
  it("owner leave → buddy cover acts, normal owner preserved", () => {
    const rows = { "order-1": contextRow({ cover_user_id: YUJUN.userId, cover_user_name: YUJUN.name, acting_user_id: YUJUN.userId, acting_user_name: YUJUN.name, is_cover: true, cover_ends_on: "2026-09-12" }) };
    const [item] = projectPaymentCollectionWork({ invoices: [invoice()], ownerFor: ownerOf(rows, "2026-09-10"), today: "2026-09-10" });
    expect(item?.owner).toMatchObject({ normal: SHASHA, activeCover: YUJUN, acting: YUJUN, state: "covered" });
  });

  it("cover ends → work returns to the normal owner", () => {
    const rows = { "order-1": contextRow() };
    const [item] = projectPaymentCollectionWork({ invoices: [invoice()], ownerFor: ownerOf(rows, "2026-09-14"), today: "2026-09-14" });
    expect(item?.owner).toMatchObject({ normal: SHASHA, activeCover: null, acting: SHASHA, state: "primary" });
  });

  it("formal handover → the new normal owner, with the audit evidence on the row", () => {
    const row = contextRow({
      normal_user_id: YUJUN.userId, normal_user_name: YUJUN.name, acting_user_id: YUJUN.userId, acting_user_name: YUJUN.name,
      source: "handover", effective_from: "2026-09-10",
      history: [
        { id: "h1", source: "established", owner_user_id: SHASHA.userId, owner_user_name: SHASHA.name, previous_owner_user_id: null, previous_owner_user_name: null, reason: "Responsible Delivery Operation — the Delivery Duty holder when collection first became actionable", changed_by: null, changed_by_name: null, changed_at: "2026-09-01T01:00:00Z", effective_from: "2026-09-01" },
        { id: "h2", source: "handover", owner_user_id: YUJUN.userId, owner_user_name: YUJUN.name, previous_owner_user_id: SHASHA.userId, previous_owner_user_name: SHASHA.name, reason: "Shasha moves to the showroom", changed_by: "902bb2ed-45d2-406c-b5c7-6675c775597a", changed_by_name: "Jess", changed_at: "2026-09-10T02:00:00Z", effective_from: "2026-09-10" },
      ],
    });
    const [item] = projectPaymentCollectionWork({ invoices: [invoice()], ownerFor: ownerOf({ "order-1": row }, "2026-09-11"), today: "2026-09-11" });
    expect(item?.owner).toMatchObject({ normal: YUJUN, acting: YUJUN, state: "primary" });
    const handover = row.history[1]!;
    expect(handover).toMatchObject({
      previous_owner_user_name: "Shasha", owner_user_name: "Yu Jun", reason: "Shasha moves to the showroom",
      changed_by_name: "Jess", effective_from: "2026-09-10",
    });
    expect(handover.changed_at).toBeTruthy();
  });

  it("no owner established (no Delivery Duty holder) → not assigned under the Delivery Duty word, the action preserved", () => {
    const [item] = projectPaymentCollectionWork({ invoices: [invoice()], ownerFor: ownerOf({}, "2026-09-08"), today: "2026-09-08" });
    expect(item?.owner).toMatchObject({ dutyKey: "delivery_duty", normal: null, acting: null, state: "not_assigned" });
    expect(item?.action).toBe("Ask customer to pay");
  });
});

describe("split delivery, completion and the sibling duties", () => {
  it("split delivery → one stable collection owner for every invoice of the order", () => {
    const rows = { "order-1": contextRow() };
    const asked: string[] = [];
    const items = projectPaymentCollectionWork({
      invoices: [invoice({ id: "inv-a", invoiceNo: "INV-A" }), invoice({ id: "inv-b", invoiceNo: "INV-B", confirmed: "2026-09-16" })],
      ownerFor: (orderId) => { asked.push(orderId); return collectionOwnerResolution(rows[orderId as "order-1"] ?? null, "2026-09-08"); },
      today: "2026-09-08",
    });
    expect(items.length).toBeGreaterThanOrEqual(1);
    expect(new Set(asked)).toEqual(new Set(["order-1"]));
    for (const item of items) expect(item.owner.normal).toEqual(SHASHA);
  });

  it("payment completed → the collection action closes", () => {
    const rows = { "order-1": contextRow() };
    const items = projectPaymentCollectionWork({ invoices: [invoice({ paid: 1000 })], ownerFor: ownerOf(rows, "2026-09-08"), today: "2026-09-08" });
    expect(items).toEqual([]);
  });

  it("storage collection → the same Responsible Delivery Operation", () => {
    const rows = { "order-1": contextRow() };
    const storage = invoice({ id: "inv-s", invoiceNo: "SINV-1", kind: "storage", amount: 150, paid: 0 });
    const [item] = projectStorageInvoiceWork({ invoices: [storage], today: "2026-09-08", ownerFor: ownerOf(rows, "2026-09-08") });
    expect(item).toBeTruthy();
    expect(item?.owner).toMatchObject({ dutyKey: "delivery_duty", normal: SHASHA, acting: SHASHA });
    expect(item?.action).toBe("Send the invoice and collect payment");
  });

  it("wrong or duplicate Payment → Payment Approver, never the collection owner", () => {
    const jess = { userId: "902bb2ed-45d2-406c-b5c7-6675c775597a", name: "Jess" };
    const approver: WorkspaceDutyResolution = {
      dutyKey: "payment_approver", onDate: "2026-09-08", normalOwner: jess, buddy: null, activeCover: null,
      actingPerson: jess, state: "primary", assignmentId: "assignment-approver",
    };
    const [item] = projectOverpaymentReviewWork({ invoices: [invoice({ paid: 1200 })], refunds: [], approver, today: "2026-09-08" });
    expect(item?.owner).toMatchObject({ dutyKey: "payment_approver", acting: jess });
  });
});
