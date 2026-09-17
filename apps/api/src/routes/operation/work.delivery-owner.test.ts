/**
 * DELIVERY WORK OWNER = THE SALES ORDER'S PIC — the Work FEED (owner ruling
 * 2026-09-17). Every surface that prints a Delivery owner — Work, Team Work,
 * the Right Rail, the Delivery Order page — reads this one feed, so the feed
 * must carry the order's responsible Operation person (0504's read, handed in
 * per order) and fall back to Delivery Duty only when the order has none.
 */
import { describe, expect, it } from "vitest";
import {
  collectionOwnerResolution,
  type CollectionOwnerContextRow,
  type WorkspaceDutyResolution,
} from "@carres/shared";
import { projectSalesOrdersFromModuleFacts } from "./work";

const YUJUN = { userId: "aac9edf9-63ad-4d0a-ba91-e495a25f9896", name: "Yu Jun" };
const SHASHA = { userId: "0cab8bcf-6ebb-454e-ba21-b916e18cc419", name: "Shasha" };
const JESS = { userId: "902bb2ed-45d2-406c-b5c7-6675c775597a", name: "Jess" };
const TODAY = "2026-09-17";

function order(id: string, so: number, assignedStaff: string | null) {
  return {
    id, so, status: "proceed_order", operation_stage: "ready_to_dispatch",
    customer_name: `Customer ${so}`, delivery_date: "2026-09-25", delivery_date_tbd: false,
    placed_at: "2026-09-01", do_number: null, paid: 1000,
    // no company chosen → `Assign logistics` is open
    ops_assigned_logistic: null, delivery_partner_id: null,
    salesperson_id: null, salespersons: null, po_skus: [],
    order_lines: [{ sku: "SOFA-1", qty: 1, unit_price: 1000 }],
    order_addons: [], order_supplier_threads: [], order_finance_exceptions: [], ops_sofa_loans: [],
    ops_order_control: {
      assigned_staff: assignedStaff, booking_stage: null, confirmed_date: null,
      delivery_photos: [], line_etas: null, line_stock_status: { "SOFA-1": "ready" },
    },
  };
}

function contextRow(orderId: string, normal: typeof YUJUN, cover: typeof YUJUN | null = null): CollectionOwnerContextRow {
  const acting = cover ?? normal;
  return {
    order_id: orderId, normal_user_id: normal.userId, normal_user_name: normal.name,
    cover_user_id: cover?.userId ?? null, cover_user_name: cover?.name ?? null,
    acting_user_id: acting.userId, acting_user_name: acting.name,
    is_cover: !!cover, cover_ends_on: cover ? TODAY : null, source: "assigned",
    effective_from: "2026-09-14", established_on: null, history: [],
  };
}

function project(input: {
  rows: Record<string, CollectionOwnerContextRow>;
  deliveryDuty?: WorkspaceDutyResolution | null;
  orders?: ReturnType<typeof order>[];
}) {
  return projectSalesOrdersFromModuleFacts({
    orders: input.orders ?? [
      order("order-yj", 1401, YUJUN.userId),
      order("order-sh", 1402, SHASHA.userId),
      order("order-none", 1403, null),
    ],
    stock: [{ sku: "SOFA-1", available: 1 }],
    staff: [
      { user_id: YUJUN.userId, name: YUJUN.name, email: "yujun@carres.test" },
      { user_id: SHASHA.userId, name: SHASHA.name, email: "shasha@carres.test" },
      { user_id: JESS.userId, name: JESS.name, email: "jess@carres.test" },
    ],
    dutyResolutions: input.deliveryDuty ? { delivery_duty: input.deliveryDuty } : {},
    responsibleOperationFor: (orderId) => collectionOwnerResolution(input.rows[orderId] ?? null, TODAY),
    today: TODAY,
    safetyDays: 3,
  });
}

const assignOf = (items: ReturnType<typeof project>, orderId: string) =>
  items.find((i) => i.ruleKey === "assign_logistics" && i.object.id === orderId);

describe("the Work feed — delivery actions carry the order's PIC", () => {
  it("an order dealt to Yu Jun → `Assign logistics` is Yu Jun's", () => {
    const items = project({ rows: { "order-yj": contextRow("order-yj", YUJUN) } });
    expect(assignOf(items, "order-yj")?.owner).toMatchObject({
      rule: "responsible_operation", normal: YUJUN, acting: YUJUN, state: "primary",
    });
  });

  it("Yu Jun away, Shasha covering → acting Shasha, normal Yu Jun", () => {
    const items = project({ rows: { "order-yj": contextRow("order-yj", YUJUN, SHASHA) } });
    expect(assignOf(items, "order-yj")?.owner).toMatchObject({
      normal: YUJUN, activeCover: SHASHA, acting: SHASHA, state: "covered",
    });
  });

  it("no PIC and nobody holds Delivery Duty → the Delivery Duty group, holderless", () => {
    const items = project({ rows: {} });
    const item = assignOf(items, "order-none");
    expect(item?.owner).toMatchObject({ dutyKey: "delivery_duty", normal: null, acting: null, state: "not_assigned" });
  });

  it("no PIC with a Delivery Duty holder → the holder; dealt orders never move to the holder", () => {
    const holder: WorkspaceDutyResolution = {
      dutyKey: "delivery_duty", onDate: TODAY, normalOwner: SHASHA, buddy: null,
      activeCover: null, actingPerson: SHASHA, state: "primary", assignmentId: "a-dd",
    };
    const items = project({ rows: { "order-yj": contextRow("order-yj", YUJUN) }, deliveryDuty: holder });
    expect(assignOf(items, "order-none")?.owner.acting).toEqual(SHASHA);
    expect(assignOf(items, "order-yj")?.owner.acting).toEqual(YUJUN);
  });

  it("Team Work grouping and the Right Rail count agree — one owner per item, from one resolution", () => {
    const items = project({
      rows: {
        "order-yj": contextRow("order-yj", YUJUN),
        "order-sh": contextRow("order-sh", SHASHA),
      },
    }).filter((i) => i.module === "delivery");
    // Team Work groups by the normal owner; My Work / Right Rail count by the
    // acting person. With no cover, both sides of every person reconcile.
    const count = (pick: (i: (typeof items)[number]) => string | null) => {
      const m = new Map<string, number>();
      for (const i of items) { const k = pick(i) ?? "duty:delivery_duty"; m.set(k, (m.get(k) ?? 0) + 1); }
      return Object.fromEntries(m);
    };
    expect(count((i) => i.owner.normal?.userId ?? null)).toEqual(count((i) => i.owner.acting?.userId ?? null));
    expect(count((i) => i.owner.acting?.userId ?? null)).toEqual({
      [YUJUN.userId]: 1, [SHASHA.userId]: 1, "duty:delivery_duty": 1,
    });
  });

  it("no manager is ever the resolved Delivery owner — the raw assignment is not an owner source", () => {
    // Even if the assignment column names Jess, only 0504's read decides; a
    // person the read does not return owns nothing.
    const items = project({ rows: {}, orders: [order("order-jess", 1404, JESS.userId)] });
    for (const item of items.filter((i) => i.module === "delivery")) {
      expect(item.owner.acting?.userId).not.toBe(JESS.userId);
      expect(item.owner.normal?.userId).not.toBe(JESS.userId);
    }
  });
});
