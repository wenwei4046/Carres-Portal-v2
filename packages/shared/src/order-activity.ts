/**
 * Order activity history — the canonical event taxonomy (P1).
 *
 * One append-only event log per order is the single source of truth; the three
 * views (customer · operation · management) are the SAME log filtered by who may
 * see each event. This module is the pure backbone shared by:
 *   - the DB trigger/RPC layer (which `event_type` to stamp),
 *   - the operation + management timelines (category → icon/colour),
 *   - the future customer tracking page (customerVisible filter).
 *
 * Decisions locked with Jess 2026-07-10 (see
 * docs/superpowers/plans/2026-07-10-order-activity-history-plan.md):
 *   - Customer sees ONLY milestones + payment (placed / confirmed / dispatched /
 *     delivered / cancelled / payment) — NEVER internal stock/PO states.
 *   - System events are immutable; human notes are editable (edits logged).
 *   - Management sees everything operation sees (+ cross-order aggregates that
 *     live outside this per-event model).
 */

export type OrderEventCategory =
  | "milestone" // order moved forward in its lifecycle
  | "money" // payment / refund / balance
  | "edit" // a field was changed (fixes the old silent-edit gap)
  | "exception" // needs attention — escalation / waiver
  | "note" // a human-written note
  | "stock" // warehouse / unit movements
  | "system"; // PO / import / assignment plumbing

export type OrderEventType =
  // lifecycle milestones
  | "order.placed"
  | "order.confirmed"
  | "order.dispatched"
  | "order.delivered"
  | "order.cancelled"
  // edits (previously silent)
  | "order.date_changed"
  | "order.field_changed"
  // money
  | "payment.received"
  | "payment.voided"
  // stock
  | "stock.reserved"
  | "stock.released"
  | "stock.reassigned"
  | "stock.takeout"
  | "stock.flag_repair"
  | "stock.ready"
  // system / plumbing
  | "order.imported"
  | "po.raised"
  | "po.status_changed"
  | "partner.assigned"
  // exceptions
  | "escalation.raised"
  | "escalation.resolved"
  | "waiver.requested"
  | "waiver.approved"
  | "waiver.rejected"
  // human notes
  | "note.added"
  | "note.edited"
  | "note.deleted";

export interface OrderEventTypeMeta {
  category: OrderEventCategory;
  /** Shows on the public (no-login) customer tracking page. */
  customerVisible: boolean;
  /** Hidden from ops staff, visible only to management. None today — reserved. */
  managementOnly: boolean;
  /** Append-only system event (true) vs an editable human note (false). */
  immutable: boolean;
  /** Fallback label when the event carries no custom title. */
  defaultTitle: string;
}

const M = (
  category: OrderEventCategory,
  defaultTitle: string,
  opts: Partial<Pick<OrderEventTypeMeta, "customerVisible" | "managementOnly" | "immutable">> = {},
): OrderEventTypeMeta => ({
  category,
  defaultTitle,
  customerVisible: opts.customerVisible ?? false,
  managementOnly: opts.managementOnly ?? false,
  immutable: opts.immutable ?? true,
});

/** The full taxonomy. Adding an event type is a one-line, type-checked change. */
export const ORDER_EVENT_TYPES: Record<OrderEventType, OrderEventTypeMeta> = {
  "order.placed": M("milestone", "Order placed", { customerVisible: true }),
  "order.confirmed": M("milestone", "Order confirmed", { customerVisible: true }),
  "order.dispatched": M("milestone", "Out for delivery", { customerVisible: true }),
  "order.delivered": M("milestone", "Delivered", { customerVisible: true }),
  "order.cancelled": M("milestone", "Order cancelled", { customerVisible: true }),

  "order.date_changed": M("edit", "Delivery date changed"),
  "order.field_changed": M("edit", "Order details changed"),

  "payment.received": M("money", "Payment received", { customerVisible: true }),
  "payment.voided": M("money", "Payment voided"),

  "stock.reserved": M("stock", "Stock reserved"),
  "stock.released": M("stock", "Stock released"),
  "stock.reassigned": M("stock", "Stock reassigned"),
  "stock.takeout": M("stock", "Stock taken out"),
  "stock.flag_repair": M("stock", "Unit flagged for repair"),
  "stock.ready": M("milestone", "Stock ready"), // internal only — customer never sees supply state

  "order.imported": M("system", "Imported from AutoCount"),
  "po.raised": M("system", "PO raised to supplier"),
  "po.status_changed": M("system", "PO status changed"),
  "partner.assigned": M("system", "Delivery partner assigned"),

  "escalation.raised": M("exception", "Escalated"),
  "escalation.resolved": M("exception", "Escalation resolved"),
  "waiver.requested": M("exception", "Storage waiver requested"),
  "waiver.approved": M("exception", "Storage waiver approved"),
  "waiver.rejected": M("exception", "Storage waiver rejected"),

  "note.added": M("note", "Note added", { immutable: false }),
  "note.edited": M("note", "Note edited", { immutable: false }),
  "note.deleted": M("note", "Note deleted", { immutable: false }),
};

export type OrderEventViewer = "customer" | "operation" | "management";

export function isOrderEventType(value: string): value is OrderEventType {
  return Object.prototype.hasOwnProperty.call(ORDER_EVENT_TYPES, value);
}

export function orderEventMeta(type: OrderEventType): OrderEventTypeMeta {
  return ORDER_EVENT_TYPES[type];
}

export function orderEventCategory(type: OrderEventType): OrderEventCategory {
  return ORDER_EVENT_TYPES[type].category;
}

export function isCustomerVisible(type: OrderEventType): boolean {
  return ORDER_EVENT_TYPES[type].customerVisible;
}

/** Whether a system event may never be edited/deleted (notes are editable). */
export function isImmutableEvent(type: OrderEventType): boolean {
  return ORDER_EVENT_TYPES[type].immutable;
}

/** The single visibility rule that powers all three views. */
export function visibleTo(type: OrderEventType, viewer: OrderEventViewer): boolean {
  const meta = ORDER_EVENT_TYPES[type];
  if (viewer === "customer") return meta.customerVisible;
  if (viewer === "operation") return !meta.managementOnly;
  return true; // management sees everything
}

/** Filter a batch of events for a viewer, preserving order. Unknown types are
 *  dropped defensively so an un-mapped event can never leak to a customer. */
export function filterEventsForViewer<T extends { eventType: string }>(
  events: readonly T[],
  viewer: OrderEventViewer,
): T[] {
  return events.filter(
    (e) => isOrderEventType(e.eventType) && visibleTo(e.eventType, viewer),
  );
}

/**
 * The action strings today's `ops_activity_log` already writes, mapped onto the
 * taxonomy. Lets the existing per-order timeline render human, categorised
 * labels (via `orderEventMeta`) with NO database change — a pure display upgrade.
 * (0138/0139: inbox_assign · autocount_import · stock_* · annotation_added.)
 */
export const LEGACY_ACTIVITY_ACTION_TO_EVENT_TYPE: Record<string, OrderEventType> = {
  annotation_added: "note.added",
  inbox_assign: "partner.assigned",
  autocount_import: "order.imported",
  stock_reserve: "stock.reserved",
  stock_release: "stock.released",
  stock_reassign: "stock.reassigned",
  stock_takeout: "stock.takeout",
  stock_flag_repair: "stock.flag_repair",
};

export function eventTypeForLegacyAction(
  action: string | null | undefined,
): OrderEventType | null {
  if (!action) return null;
  return LEGACY_ACTIVITY_ACTION_TO_EVENT_TYPE[action] ?? null;
}
