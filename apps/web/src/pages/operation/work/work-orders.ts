/**
 * THE WORK INBOX, ONE ROW PER ORDER — Workspace MASTER §5.10 A8b.
 *
 * Every open Work occurrence is placed on the ONE Sales Order it belongs to:
 *
 *   sales_order · delivery_scope      its own order id
 *   purchase_order · receiving        the PO's source orders (SO Batch
 *                                     lineage) — only when they name ONE order
 *   purchasing.po_window              each unsent PO whose source orders name
 *                                     ONE order becomes a Send act there; the
 *                                     occurrence still counts ONCE per order
 *   a label `SO-{n}`                  that order
 *
 * An occurrence that resolves to no single order (a PO serving several
 * orders, a stock PO, a window with nothing order-bound) stays its own row
 * under its object's label — it is never copied onto each order (A3).
 *
 * PURE — no clock, no I/O. Counts count OCCURRENCES, never POs (§5, "the same
 * occurrence once").
 */
import { PO_WINDOW_WORK_COPY, type PoWindowWork } from "@carres/shared";
import type { WorkRow } from "../use-open-work";
import type { StopKey, WorkAct, WorkActKind } from "./work-stops";
import { partyOfStop } from "./work-stops";

export interface WorkOrderGroup {
  /** `order:{id}` · `po:{PO id}` (a PO serving several orders, A3) ·
   *  `item:{occurrenceId}`. */
  key: string;
  orderId: string | null;
  /** The PO a `po:` group is about. */
  poId?: string | null;
  /** A PO window row's own day — two windows share a time word. */
  windowDate?: string | null;
  /** `SO-1333`, else the object's own label. */
  label: string;
  items: WorkRow[];
  acts: WorkAct[];
}

export interface WorkOrderIndex {
  /** PO id → every Sales Order it serves (SO Batch lineage). */
  poOrders: ReadonlyMap<string, readonly string[]>;
  /** SO number → order id. */
  orderBySo: ReadonlyMap<number, string>;
  /** Order id → SO number. */
  soByOrder: ReadonlyMap<string, number>;
  /** Order id → the facts a `Related orders` line prints (SO Batch read). */
  orderFacts?: ReadonlyMap<string, { so: number | null; customer: string | null; requested: string | null }>;
  windows: readonly PoWindowWork[];
}

/** The one order an occurrence belongs to, or null. */
export function orderOfItem(item: WorkRow, index: WorkOrderIndex): string | null {
  const object = item.source.object;
  if (object.kind === "sales_order" || object.kind === "delivery_scope") return object.id;
  if (object.kind === "purchase_order" || object.kind === "receiving") {
    const orders = index.poOrders.get(object.label) ?? index.poOrders.get(object.id) ?? [];
    return orders.length === 1 ? orders[0]! : null;
  }
  const so = object.label.match(/^SO-(\d+)/)?.[1];
  return so ? index.orderBySo.get(Number(so)) ?? null : null;
}

const STOP_OF_MODULE: Record<WorkRow["module"], StopKey> = {
  orders: "purchasing",
  purchasing: "purchasing",
  receiving: "receiving",
  delivery: "delivery-date",
  payment: "money",
  issue_tracker: "delivery-order",
};

function act(
  item: WorkRow,
  kind: WorkActKind,
  stop: StopKey,
  title: string,
  why: string | null,
  button: string,
  extra: Partial<WorkAct> = {},
): WorkAct {
  return {
    key: extra.poId ? `${item.id}:${extra.poId}` : item.id,
    occurrenceId: item.id,
    kind,
    stop,
    title,
    why,
    missed: item.timingBucket === "overdue",
    button,
    party: partyOfStop(stop),
    ...extra,
  };
}

/**
 * The act an occurrence puts on its order's Route: the row line and why line
 * of the §5.10 A7 registry table, never invented. `spell` spells a date.
 */
export function actsOfItem(
  item: WorkRow,
  orderId: string | null,
  index: WorkOrderIndex,
  spell: (iso: string) => string,
): WorkAct[] {
  const who = item.recipient?.trim() || null;
  const due = item.dueIso ? spell(item.dueIso) : null;
  const po = item.source.object.label;
  switch (item.ruleKey) {
    case "purchasing.po_window": {
      const window = index.windows.find((w) => w.key === item.source.object.id);
      return (window?.pos ?? [])
        .filter((p) => !p.sent && p.orderIds.length === 1 && p.orderIds[0] === orderId)
        .map((p) =>
          act(item, "send_po", "purchasing", PO_WINDOW_WORK_COPY.send(p.documentNo, p.supplierName), PO_WINDOW_WORK_COPY.notSentWord, "PO sent to supplier", { poId: p.poId }),
        );
    }
    case "purchasing.supplier_date_passed":
      return [act(item, "supplier_answer", "supplier", `Ask ${who ?? "the supplier"} when the goods will arrive`, due ? `The supplier delivery date passed on ${due}` : null, "Record supplier answer", { poId: po })];
    case "purchasing.confirm_tomorrows_delivery":
      /* The feed's own row line (Purchasing §5.7 day-before ask). */
      return [act(item, "supplier_answer", "supplier", item.action, item.problem, "Record supplier answer", { poId: po })];
    case "purchasing.confirm_balance_delivery_date":
      return [act(item, "supplier_answer", "supplier", `Ask ${who ?? "the supplier"} for the balance delivery date`, "The balance delivery date is missing", "Record balance date", { poId: po })];
    case "receiving.check_in":
      return [act(item, "other", "receiving", `Check in ${po}${who ? ` from ${who}` : ""}`, item.problem, "", { poId: po })];
    case "assign_logistics":
      return [act(item, "assign_logistics", "logistics", "Assign logistics", due ? `3 working days before · ${due}` : null, "Assign logistics")];
    case "confirm_delivery_date":
      return [act(item, "delivery_date", "delivery-date", `Call ${who ?? "logistics"}`, due ? `Get the scheduled delivery date · due ${due}` : "Get the scheduled delivery date", "Update date and time")];
    case "deliver_today":
      return [act(item, "other", "deliver", due ? `Deliver on ${due}` : item.action, null, "")];
    case "payment.collect_customer_balance":
      return [act(item, "other", "money", item.action, item.problem, "")];
    default:
      return [act(item, "other", STOP_OF_MODULE[item.module], item.action, item.problem, "")];
  }
}

/** One group per order (and one per occurrence that names no single order). */
export function workOrderGroups(
  items: readonly WorkRow[],
  index: WorkOrderIndex,
  spell: (iso: string) => string,
): WorkOrderGroup[] {
  const groups = new Map<string, WorkOrderGroup>();
  const at = (key: string, orderId: string | null, label: string) => {
    let group = groups.get(key);
    if (!group) groups.set(key, (group = { key, orderId, label, items: [], acts: [] }));
    return group;
  };
  const soLabel = (orderId: string) => {
    const so = index.soByOrder.get(orderId);
    return so != null ? `SO-${so}` : null;
  };
  for (const item of items) {
    if (item.ruleKey === "purchasing.po_window") {
      const window = index.windows.find((w) => w.key === item.source.object.id);
      const orders = new Set(
        (window?.pos ?? []).filter((p) => !p.sent && p.orderIds.length === 1).map((p) => p.orderIds[0]!),
      );
      /* A window with demand left to buy, or a PO serving several orders,
         keeps its own row: buying is window work, not one order's. */
      const ownRow = !window || window.demand.rowIds.length > 0 || (window.pos ?? []).some((p) => !p.sent && p.orderIds.length !== 1);
      for (const orderId of orders) {
        const group = at(`order:${orderId}`, orderId, soLabel(orderId) ?? item.source.object.label);
        group.items.push(item);
        group.acts.push(...actsOfItem(item, orderId, index, spell));
      }
      if (ownRow || orders.size === 0) {
        const own = at(`item:${item.id}`, null, item.source.object.label);
        own.windowDate = window?.date ?? item.source.object.id.slice(0, 10);
        own.items.push(item);
      }
      continue;
    }
    const orderId = orderOfItem(item, index);
    if (!orderId) {
      const kind = item.source.object.kind;
      if (kind === "purchase_order" || kind === "receiving") {
        /* A3: a PO serving two or more orders (or stock) is its own view — the
           PO header and `Related orders · {n}` — and its acts stay ONE
           occurrence each, on the PO. */
        const poId = item.source.object.label;
        const group = at(`po:${poId}`, null, poId);
        group.poId = poId;
        group.items.push(item);
        group.acts.push(...actsOfItem(item, null, index, spell));
        continue;
      }
      at(`item:${item.id}`, null, item.source.object.label).items.push(item);
      continue;
    }
    const group = at(`order:${orderId}`, orderId, soLabel(orderId) ?? item.source.object.label);
    group.items.push(item);
    group.acts.push(...actsOfItem(item, orderId, index, spell));
  }
  /* Orders first (the page's subject), then any object that names no single
     order; within each, missed first, then by label. */
  return [...groups.values()].sort(
    (a, b) =>
      Number(Boolean(b.orderId)) - Number(Boolean(a.orderId)) ||
      Number(b.items.some((i) => i.timingBucket === "overdue")) - Number(a.items.some((i) => i.timingBucket === "overdue")) ||
      a.label.localeCompare(b.label, undefined, { numeric: true }),
  );
}
