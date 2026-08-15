import {
  CircleCheck,
  Banknote,
  Pencil,
  AlertTriangle,
  MessageSquare,
  Package,
  FileText,
  type LucideIcon,
} from "lucide-react";
import {
  eventTypeForLegacyAction,
  fmtMoney,
  isOrderEventType,
  orderEventMeta,
  type OrderEventCategory,
  type OrderEventType,
} from "@carres/shared";
import type { AnnotationTag } from "@/lib/queries";
import { fmtDate } from "@/lib/fmt-date";

// Shared between the per-order timeline (AnnotationTimeline) and the global
// Activity feed (GlobalActivity), so every activity row reads the same.

export const CATEGORY_STYLE: Record<
  OrderEventCategory,
  { icon: LucideIcon; bg: string; fg: string }
> = {
  milestone: { icon: CircleCheck, bg: "#E6F1FB", fg: "#185FA5" },
  money: { icon: Banknote, bg: "#E7F3DC", fg: "#3B6D11" },
  edit: { icon: Pencil, bg: "#FAEEDA", fg: "#854F0B" },
  exception: { icon: AlertTriangle, bg: "#FCECEA", fg: "#A32D2D" },
  note: { icon: MessageSquare, bg: "#F1EFE8", fg: "#5F5E5A" },
  stock: { icon: Package, bg: "#E6F1FB", fg: "#185FA5" },
  system: { icon: FileText, bg: "#F1EFE8", fg: "#5F5E5A" },
};

export const CATEGORY_LABEL: Record<OrderEventCategory, string> = {
  milestone: "Milestones",
  money: "Money",
  edit: "Changes",
  exception: "Alerts",
  note: "Notes",
  stock: "Stock",
  system: "System",
};

export const CATEGORY_ORDER: OrderEventCategory[] = [
  "exception",
  "note",
  "milestone",
  "money",
  "edit",
  "stock",
  "system",
];

const FIELD_LABEL: Record<string, string> = {
  delivery_date: "Delivery date",
  status: "Status",
  balance: "Balance",
  payment_status: "Payment status",
  logistic_eta: "Logistics' date",
  stock_eta: "Expected arrival",
  balance_due_date: "Balance due date",
  called_customer: "Called customer",
  delivery_time_slot: "Delivery time slot",
  customer_request: "Customer request",
  carres_remark: "Carres remark",
  warehouse_remark: "Warehouse remark",
  storage_waiver_status: "Storage waiver",
};

/**
 * NO INTERNAL ENUM ON SCREEN (owner ruling 2026-08-15).
 *
 * `orders.status` is stored as `place | proceed_order | delivered | cancelled`
 * and this panel printed those four raw — a line reading
 * `Status changed — place → proceed_order` is the database talking, not the
 * portal. The four operator words are the dictionary's own (COPY-STANDARD:
 * `Placed` = ordered, no date agreed yet; `Proceed` = the customer confirmed
 * the date and it is ready for a PO).
 *
 * This is the same state-vocabulary law `PLAN_STATUS_LABEL` and
 * `EMERGENCY_STATUS_LABEL` already enforce elsewhere: no DB word reaches the
 * screen. An unknown value is passed through rather than guessed at — a wrong
 * translation is worse than an untranslated one, and an unknown here means the
 * enum grew and this map is what must be updated.
 */
const ORDER_STATUS_LABEL: Record<string, string> = {
  place: "Placed",
  proceed_order: "Proceed",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

/** Fields whose value is a business DATE — printed the one ruled way, never
 *  as the stored `2026-08-28`. */
const DATE_FIELDS = new Set([
  "delivery_date",
  "logistic_eta",
  "stock_eta",
  "balance_due_date",
]);

/** Fields whose value is MONEY — printed `RM 1,250.00`, never the stored
 *  `1250.00` (COPY-STANDARD: a money figure always carries its currency and
 *  its two decimals). */
const MONEY_FIELDS = new Set(["balance"]);

/**
 * One changed value, in operator words.
 *
 * `null` = the value was absent. The caller composes the governed absence
 * phrase from the FIELD's own name, because a bare `—` on the left of an
 * arrow is a dash pretending to be a value — the reader cannot tell an empty
 * field from a value that failed to load.
 */
function fmtVal(field: string | undefined, v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (field === "status") {
    const raw = String(v);
    return ORDER_STATUS_LABEL[raw] ?? raw;
  }
  if (field && DATE_FIELDS.has(field)) return fmtDate(String(v));
  if (field && MONEY_FIELDS.has(field)) {
    const n = Number(v);
    return Number.isFinite(n) ? fmtMoney(n) : String(v);
  }
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v);
}

/**
 * `No delivery date → Sat, 15 Aug 26` — the governed way to say a value did
 * not exist before (owner ruling 2026-08-15). The field's own ruled label
 * supplies the noun, so the phrase names WHICH fact was missing: `No status`
 * and `No payment status` are two different events and this panel renders
 * both, so one shared word for them would be ambiguous on its own screen.
 */
function changeBody(field: string | undefined, fieldWord: string, from: unknown, to: unknown): string {
  const before = fmtVal(field, from) ?? `No ${fieldWord.toLowerCase()}`;
  const after = fmtVal(field, to) ?? `No ${fieldWord.toLowerCase()}`;
  return `${before} → ${after}`;
}

/** The minimal shape both a per-order entry and a global row satisfy. */
export interface ActivityLike {
  kind: string;
  action?: string | null;
  detail?: unknown;
  content?: string | null;
  tag?: AnnotationTag | null;
  actor_name?: string | null;
}

export function isImport(row: ActivityLike): boolean {
  return (
    row.kind === "activity" &&
    (row.action === "autocount_import" ||
      eventTypeForLegacyAction(row.action ?? null) === "order.imported")
  );
}

export function describeActivity(row: ActivityLike): {
  category: OrderEventCategory;
  title: string;
  body: string | null;
} {
  if (row.kind === "annotation") {
    return {
      category: row.tag === "escalate" ? "exception" : "note",
      title: row.actor_name ?? "Note",
      body: row.content ?? null,
    };
  }
  const action = row.action ?? "";
  const type: OrderEventType | null = isOrderEventType(action)
    ? action
    : eventTypeForLegacyAction(action);
  if (type) {
    const meta = orderEventMeta(type);
    const d = (row.detail ?? null) as {
      field?: string;
      from?: unknown;
      to?: unknown;
      amount?: unknown;
      kind?: unknown;
      method?: unknown;
      receipt_no?: unknown;
      reason?: unknown;
    } | null;
    // 0347 — money says its FIGURE. `payment.received` / `payment.voided` are
    // the two declared money events, and the RPC hands the timeline the amount,
    // the kind, the method and the receipt number, so the line never re-derives
    // a sentence from an order it cannot see. A bare "Payment received" on a
    // row whose whole purpose is the amount is the vague wording the standard
    // bans.
    if ((type === "payment.received" || type === "payment.voided") && d?.amount != null) {
      const amount = Number(d.amount);
      // The METHOD is deliberately absent: the portal spells it two ways today
      // (`online` prints as "Online" on the SO document and "e-wallet" in the
      // drawer), and a timeline is not the place to pick a winner. The ledger
      // row beside it states the method; reported for the copy owner.
      const bits = [
        Number.isFinite(amount) ? fmtMoney(amount) : null,
        d.kind === "deposit" ? "Deposit" : d.kind === "storage" ? "Storage fee" : null,
        typeof d.receipt_no === "string" ? d.receipt_no : null,
        typeof d.reason === "string" && d.reason.trim() ? d.reason.trim() : null,
      ].filter(Boolean) as string[];
      return {
        category: meta.category,
        title: meta.defaultTitle,
        body: bits.length > 0 ? bits.join(" · ") : null,
      };
    }
    if (
      (type === "order.field_changed" || type === "order.date_changed") &&
      d &&
      (d.from !== undefined || d.to !== undefined)
    ) {
      const field = (d.field && FIELD_LABEL[d.field]) || d.field || "Details";
      return {
        category: meta.category,
        title: `${field} changed`,
        body: changeBody(d.field, field, d.from, d.to),
      };
    }
    return { category: meta.category, title: meta.defaultTitle, body: null };
  }
  // An action with no declared event type is a DEFECT — some writer stamped a
  // type the taxonomy never declared. This used to print the raw key with its
  // underscores swapped for spaces (`stock_flag_repair` → `stock flag repair`),
  // which put the database's own vocabulary on the operator's screen to
  // describe an event the portal cannot name. The row keeps its order, its
  // person and its time; the undeclared key is engineering's problem, not a
  // word an operator should have to read. (Every action live in production
  // today resolves above — measured 2026-08-15: six distinct actions, all
  // declared or mapped.)
  return { category: "system", title: "Activity", body: null };
}

export function IconChip({ category, size = 28 }: { category: OrderEventCategory; size?: number }) {
  const style = CATEGORY_STYLE[category];
  const Icon = style.icon;
  return (
    <div
      className="flex-none rounded-full grid place-items-center"
      style={{ width: size, height: size, backgroundColor: style.bg, color: style.fg }}
      aria-hidden
    >
      <Icon size={Math.round(size * 0.54)} strokeWidth={2} />
    </div>
  );
}

export function isToday(iso: string): boolean {
  const d = new Date(iso);
  const n = new Date();
  return (
    d.getFullYear() === n.getFullYear() &&
    d.getMonth() === n.getMonth() &&
    d.getDate() === n.getDate()
  );
}

export function isYesterday(iso: string): boolean {
  const d = new Date(iso);
  const n = new Date();
  n.setDate(n.getDate() - 1);
  return (
    d.getFullYear() === n.getFullYear() &&
    d.getMonth() === n.getMonth() &&
    d.getDate() === n.getDate()
  );
}
