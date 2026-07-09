import { describe, it, expect } from "vitest";
import {
  ORDER_EVENT_TYPES,
  type OrderEventType,
  isOrderEventType,
  orderEventMeta,
  orderEventCategory,
  isCustomerVisible,
  isImmutableEvent,
  visibleTo,
  filterEventsForViewer,
  eventTypeForLegacyAction,
  LEGACY_ACTIVITY_ACTION_TO_EVENT_TYPE,
} from "./order-activity";

const ALL_TYPES = Object.keys(ORDER_EVENT_TYPES) as OrderEventType[];

/** The ONLY events a customer may ever see (Jess 2026-07-10: 5 milestones +
 *  payment; never internal stock/PO). Guard this hard — a leak here is a
 *  customer-facing privacy/confidence bug. */
const CUSTOMER_VISIBLE = new Set<OrderEventType>([
  "order.placed",
  "order.confirmed",
  "order.dispatched",
  "order.delivered",
  "order.cancelled",
  "payment.received",
]);

describe("order-activity taxonomy", () => {
  it("maps every type with a category + default title", () => {
    for (const t of ALL_TYPES) {
      const meta = orderEventMeta(t);
      expect(meta.category).toBeTruthy();
      expect(meta.defaultTitle.length).toBeGreaterThan(0);
    }
  });

  it("exposes exactly the intended customer-visible set — no internal leakage", () => {
    const visible = ALL_TYPES.filter((t) => isCustomerVisible(t));
    expect(new Set(visible)).toEqual(CUSTOMER_VISIBLE);
  });

  it("never exposes stock or PO plumbing to the customer", () => {
    expect(isCustomerVisible("stock.ready")).toBe(false);
    expect(isCustomerVisible("stock.reserved")).toBe(false);
    expect(isCustomerVisible("po.raised")).toBe(false);
    expect(isCustomerVisible("partner.assigned")).toBe(false);
  });

  it("marks system events immutable and human notes editable", () => {
    expect(isImmutableEvent("order.delivered")).toBe(true);
    expect(isImmutableEvent("payment.received")).toBe(true);
    expect(isImmutableEvent("order.field_changed")).toBe(true);
    expect(isImmutableEvent("note.added")).toBe(false);
    expect(isImmutableEvent("note.edited")).toBe(false);
    expect(isImmutableEvent("note.deleted")).toBe(false);
  });

  it("categorises edits and exceptions correctly", () => {
    expect(orderEventCategory("order.date_changed")).toBe("edit");
    expect(orderEventCategory("order.field_changed")).toBe("edit");
    expect(orderEventCategory("escalation.raised")).toBe("exception");
    expect(orderEventCategory("waiver.requested")).toBe("exception");
    expect(orderEventCategory("payment.received")).toBe("money");
    expect(orderEventCategory("order.delivered")).toBe("milestone");
  });
});

describe("visibleTo — the one rule behind all three views", () => {
  it("customer sees only customer-visible events", () => {
    expect(visibleTo("order.delivered", "customer")).toBe(true);
    expect(visibleTo("payment.received", "customer")).toBe(true);
    expect(visibleTo("stock.ready", "customer")).toBe(false);
    expect(visibleTo("escalation.raised", "customer")).toBe(false);
    expect(visibleTo("note.added", "customer")).toBe(false);
  });

  it("operation sees everything except management-only (none today)", () => {
    for (const t of ALL_TYPES) {
      expect(visibleTo(t, "operation")).toBe(!ORDER_EVENT_TYPES[t].managementOnly);
    }
  });

  it("management sees absolutely everything", () => {
    for (const t of ALL_TYPES) {
      expect(visibleTo(t, "management")).toBe(true);
    }
  });
});

describe("filterEventsForViewer", () => {
  const events = [
    { eventType: "order.placed", id: 1 },
    { eventType: "stock.ready", id: 2 },
    { eventType: "note.added", id: 3 },
    { eventType: "order.delivered", id: 4 },
    { eventType: "escalation.raised", id: 5 },
    { eventType: "payment.received", id: 6 },
  ];

  it("gives the customer only the clean milestone/payment set, in order", () => {
    const out = filterEventsForViewer(events, "customer").map((e) => e.id);
    expect(out).toEqual([1, 4, 6]);
  });

  it("gives operation everything (order preserved)", () => {
    const out = filterEventsForViewer(events, "operation").map((e) => e.id);
    expect(out).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("defensively drops unknown/unmapped event types (never leaks to customer)", () => {
    const withJunk = [...events, { eventType: "totally.unknown", id: 99 }];
    expect(filterEventsForViewer(withJunk, "customer").some((e) => e.id === 99)).toBe(false);
    expect(filterEventsForViewer(withJunk, "management").some((e) => e.id === 99)).toBe(false);
  });
});

describe("legacy activity-action mapping (pure display upgrade, no DB change)", () => {
  it("maps every known ops_activity_log action to a real taxonomy type", () => {
    for (const [action, type] of Object.entries(LEGACY_ACTIVITY_ACTION_TO_EVENT_TYPE)) {
      expect(isOrderEventType(type)).toBe(true);
      expect(eventTypeForLegacyAction(action)).toBe(type);
    }
  });

  it("gives the noisy legacy actions a human title + category", () => {
    const imported = orderEventMeta(eventTypeForLegacyAction("autocount_import")!);
    expect(imported.defaultTitle).toBe("Imported from AutoCount");
    expect(imported.category).toBe("system");
    expect(orderEventCategory(eventTypeForLegacyAction("stock_reserve")!)).toBe("stock");
    expect(orderEventCategory(eventTypeForLegacyAction("inbox_assign")!)).toBe("system");
  });

  it("returns null for unknown / empty actions (falls back to raw label)", () => {
    expect(eventTypeForLegacyAction("something_new")).toBeNull();
    expect(eventTypeForLegacyAction(null)).toBeNull();
    expect(eventTypeForLegacyAction(undefined)).toBeNull();
    expect(eventTypeForLegacyAction("")).toBeNull();
  });
});

describe("isOrderEventType guard", () => {
  it("accepts known, rejects unknown", () => {
    expect(isOrderEventType("order.delivered")).toBe(true);
    expect(isOrderEventType("note.added")).toBe(true);
    expect(isOrderEventType("nope")).toBe(false);
    expect(isOrderEventType("")).toBe(false);
  });
});
