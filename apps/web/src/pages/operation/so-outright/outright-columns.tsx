/**
 * The Outright list's columns — v8 `C` + `LAYOUTS` (owner-confirmed handoff,
 * Jess 2026-10-08), one entry per v8 column, same label, width and place.
 *
 * Every cell reads a REAL fact from the module that owns it (owner instruction
 * 2026-10-09: "逐项查来源，不能把未接读取写成资料不存在"). Three honest states
 * are kept apart and never merged:
 *
 *   Not recorded    the owner's record is readable and holds nothing
 *   Could not read  the owner's read failed — amber; never "nothing there"
 *   No access       the record exists but this person may not see it
 *
 * A document that does not exist yet prints `Not yet`, as v8 does. Finance
 * hold unknown is `Could not read`, never `No Finance hold`.
 */
import { registerDeliveryConditionOf, type OutrightFactsFailed, type OutrightOrderFacts } from "@carres/shared";
import type { PaymentMonitorRow } from "@carres/shared/payment-monitor";
import type { RegisterRow } from "../sales-order-columns";
import { salesLocationOf } from "../sales-order-columns";
import type { CPillTone } from "@/components/carres/CPill";

export type CellTone = CPillTone | "none";

export type Cell = {
  t: string;
  sub?: string;
  /** Sub-line colour: muted grey (default secondary), ok green, warn amber. */
  subTone?: "muted" | "ok" | "warn";
  /** 400 · 500 · 600. */
  fw?: 400 | 500 | 600;
  /** Text colour: ink (default: the unselected-tab grey, c-tab), muted, warn. */
  fg?: "ink" | "muted" | "warn";
  pill?: boolean;
  tone?: CellTone;
  align?: "start" | "end";
  /** The Items cell: `› n pcs` opens the items pop-up. */
  pop?: boolean;
  /** The full sentence behind a short state word (hover). */
  title?: string;
  /** The sub-line is an essential fact: it wraps instead of being cut. */
  subWrap?: boolean;
};

export type LayoutKey = "so" | "general" | "payment" | "stock" | "warehouse" | "delivery";

export const LAYOUTS: { key: LayoutKey; label: string; icon: string; columns: string[] }[] = [
  { key: "so", label: "Sales Order", icon: "receipt_long", columns: ["proceed", "order", "items", "channel", "dloc", "reqDate"] },
  { key: "general", label: "Overview", icon: "dashboard", columns: ["order", "proceed", "items", "stock", "delivery", "payment", "pic", "problems"] },
  { key: "payment", label: "Payment", icon: "account_balance_wallet", columns: ["order", "value", "paid", "balance", "rcpt", "payDue", "payment", "hold"] },
  { key: "stock", label: "Stock", icon: "inventory_2", columns: ["order", "items", "po", "eta", "sdo", "grnNo", "stock"] },
  { key: "warehouse", label: "Warehouse", icon: "warehouse", columns: ["order", "items", "grnNo", "loc", "load", "delivery"] },
  { key: "delivery", label: "Delivery", icon: "local_shipping", columns: ["order", "logi", "area", "delivery", "appt", "doNo", "payment"] },
];

export const NOT_RECORDED: Cell = { t: "Not recorded", fg: "muted" };
export const NO_ACCESS: Cell = { t: "No access", fg: "muted", title: "You may not see this record." };
export const LOADING: Cell = { t: "Loading", fg: "muted" };
const NOT_YET: Cell = { t: "Not yet", fg: "muted" };
/** COPY "A read failed — {owner}": the short word, the full sentence on hover. */
export function couldNotRead(owner: string, notMean: string): Cell {
  return { t: "Could not read", fg: "warn", title: `Could not read ${owner} for this order. This does not mean ${notMean}.` };
}

/** `6 Oct 26` over `Tue` — v8 `dF`. */
export function dayCell(iso: string | null | undefined, fw: 400 | 500 = 500): Cell | null {
  if (!iso) return null;
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00+08:00` : iso);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kuala_Lumpur", day: "numeric", month: "numeric", year: "2-digit", weekday: "short",
  }).formatToParts(d);
  const v = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(v("month")) - 1];
  return { t: `${Number(v("day"))} ${mon} ${v("year")}`, sub: v("weekday"), subTone: "muted", fw };
}

/** `RM 14,170` — v8 `rmF`, Inter tabular (never a mono face). */
export function rm(n: number): string {
  return `RM ${n.toLocaleString("en-MY", { maximumFractionDigits: 2 })}`;
}

export function pcsOf(r: RegisterRow): number {
  return (r.o.order_lines ?? []).reduce((sum, l) => sum + (Number(l.qty) || 0), 0);
}

export function isDelivered(r: RegisterRow): boolean {
  return registerDeliveryConditionOf(r.o.order_lines ?? [], r.o.allocated_units ?? []) === "fully_delivered";
}

/** Goods physically in for this order: its reserved or sold units. */
function goodsIn(r: RegisterRow): number {
  return (r.o.allocated_units ?? []).reduce((sum, u) => sum + (Number(u.qty) || 0), 0);
}

/** The earliest open supplier date for the order's POs (reply first). */
function supplierEta(r: RegisterRow): string | null {
  const dates = (r.o.po_arrivals ?? [])
    .filter((a) => a.owedSkus.length > 0)
    .map((a) => a.reply?.newIso ?? a.plannedIso)
    .filter((d): d is string => Boolean(d))
    .sort();
  return dates[0] ?? null;
}

function shortDay(iso: string): string {
  const c = dayCell(iso, 400);
  return c ? c.t.replace(/ \d\d$/, "") : iso;
}

/** One server read as a cell sees it: still loading, refused, failed, or answered. */
export type OwnedRead =
  | { state: "loading" }
  | { state: "denied" }
  | { state: "failed" }
  | {
      state: "ok";
      /** null = the server answered without this order's owner facts. */
      facts: OutrightOrderFacts | null;
      cases: "open" | "closed" | "none" | null;
      failed: Partial<OutrightFactsFailed> & { cases?: boolean };
    };

/** Payments' own collection clock for the order (the Payment Monitor's row). */
export type PayByRead =
  | { state: "loading" }
  | { state: "denied" }
  | { state: "failed" }
  /** `row` null = Payments has no unpaid collection for this order. */
  | { state: "ok"; row: PaymentMonitorRow | null };

export type CellContext = {
  /** Payment status key from the register (`paid` · `partial` · `unpaid` · `unknown`). */
  payment: (r: RegisterRow) => string;
  owned: (r: RegisterRow) => OwnedRead;
  payBy: (r: RegisterRow) => PayByRead;
};

/** Run `fn` on the order's owner facts, or print the honest read state. */
function fromOwner(
  r: RegisterRow,
  ctx: CellContext,
  flag: keyof OutrightFactsFailed,
  owner: string,
  notMean: string,
  fn: (f: OutrightOrderFacts) => Cell,
): Cell {
  const read = ctx.owned(r);
  if (read.state === "loading") return LOADING;
  if (read.state === "denied") return NO_ACCESS;
  if (read.state === "failed" || read.failed[flag] || !read.facts) return couldNotRead(owner, notMean);
  return fn(read.facts);
}

/** A stored time window in the governed spelling (`9am to 12pm`): no dash on
 *  screen, even when an older row was saved as `9am–12pm`. */
export function timeWords(t: string | null | undefined): string | undefined {
  const v = (t ?? "").trim();
  if (!v) return undefined;
  return v.replace(/\s*[\u2013\u2014]\s*/g, " to ").replace(/(\d(?:\s?[ap]m)?)\s*-\s*(\d)/gi, "$1 to $2");
}

const HANDOVER_WORD: Record<NonNullable<OutrightOrderFacts["loading"]["kind"]>, string> = {
  ready_for_handover: "Ready for handover",
  handed_over: "Handed over",
  received_by_logistics: "Received by logistics",
};

export type Column = {
  key: string;
  label: string;
  /** v8's grid track. */
  width: string;
  cell: (r: RegisterRow, ctx: CellContext) => Cell;
  /** v8 marks these filterable: the header opens a value menu. */
  filterable?: boolean;
  /** Money columns sit right. */
  align?: "end";
};

const docs = (list: (string | null | undefined)[]): Cell => {
  const real = list.filter((n): n is string => Boolean(n));
  if (real.length === 0) return NOT_YET;
  return { t: real[0] + (real.length > 1 ? ` +${real.length - 1}` : ""), fw: 500, fg: "ink" };
};

export const COLUMNS: Record<string, Column> = {
  proceed: {
    key: "proceed", label: "Proceed Date", width: "100px",
    cell: (r) => dayCell(r.proceeded) ?? NOT_RECORDED,
  },
  order: {
    key: "order", label: "SO No.", width: "minmax(118px,1fr)",
    cell: (r) => ({ t: `SO-${r.so}`, fw: 600, fg: "ink", sub: r.customer || "Not recorded" }),
  },
  items: {
    key: "items", label: "Items", width: "84px",
    cell: (r) => { const n = pcsOf(r); return { t: `${n} ${n === 1 ? "pc" : "pcs"}`, pop: true }; },
  },
  channel: {
    key: "channel", label: "Sales location", width: "minmax(100px,.9fr)",
    cell: (r) => ({ t: salesLocationOf(r.o) || "Not recorded", sub: r.o.salespersons?.name?.trim() || "Not recorded" }),
  },
  dloc: {
    key: "dloc", label: "Delivery location", width: "minmax(100px,.9fr)",
    cell: (r) => {
      const city = r.o.customer_address_city?.trim();
      const state = r.o.customer_address_state?.trim();
      return city || state ? { t: city || "Not recorded", sub: state || "Not recorded" } : NOT_RECORDED;
    },
  },
  reqDate: {
    key: "reqDate", label: "Customer original delivery date", width: "112px",
    cell: (r) => {
      const c = dayCell(r.customerDelivery);
      if (!c) return NOT_RECORDED;
      return isDelivered(r) ? { ...c, sub: `${c.sub} · Delivered`, subTone: "ok" } : c;
    },
  },
  stock: {
    key: "stock", label: "Stock", width: "120px", filterable: true,
    cell: (r) => {
      const total = pcsOf(r);
      const inn = Math.min(goodsIn(r), total);
      const eta = supplierEta(r);
      return {
        t: `${inn}/${total} in`, pill: true, tone: inn === total ? "ok" : "warn",
        sub: inn === total ? undefined : eta ? `ETA ${shortDay(eta)}` : "ETA Not recorded",
        subTone: "muted",
      };
    },
  },
  delivery: {
    key: "delivery", label: "Customer confirmed delivery date", width: "130px",
    cell: (r, ctx) => {
      if (isDelivered(r) && r.o.delivered_at) {
        const c = dayCell(r.o.delivered_at, 400)!;
        return { t: c.t, fg: "ink", sub: "Delivered", subTone: "ok" };
      }
      /* Delivery's own ladder (DO → arrangement → confirmed booking). */
      return fromOwner(r, ctx, "delivery", "Delivery", "nothing is arranged", (f) => {
        /* The day only: its time is printed once, under Appointment. */
        const c = dayCell(f.delivery.dateIso, 400);
        if (!c) return { t: "Not scheduled", fg: "muted" };
        return { t: c.t, fg: "ink", sub: c.sub, subTone: "muted" };
      });
    },
  },
  payment: {
    key: "payment", label: "Payment", width: "120px", filterable: true,
    cell: (r, ctx) => {
      const s = ctx.payment(r);
      if (s === "paid") return { t: "Paid", pill: true, tone: "ok" };
      if (s === "partial" || s === "unpaid") return { t: "Owes", pill: true, tone: "warn" };
      return NOT_RECORDED;
    },
  },
  pic: {
    key: "pic", label: "SO PIC", width: "minmax(100px,.9fr)", filterable: true,
    /* Orders MASTER §2.2: `ops_order_control.assigned_staff`, named from People. */
    cell: (r, ctx) => fromOwner(r, ctx, "pic", "the SO PIC", "the order has no PIC", (f) => {
      if (!f.pic) return NOT_RECORDED;
      if (!f.pic.name) return { ...NO_ACCESS, title: "A PIC is recorded, but you may not see this person's name." };
      return { t: f.pic.name };
    }),
  },
  problems: {
    key: "problems", label: "Problems", width: "90px", filterable: true,
    cell: (r, ctx) => {
      const read = ctx.owned(r);
      if (read.state === "loading") return LOADING;
      if (read.state === "denied") return NO_ACCESS;
      if (read.state === "failed" || read.failed.cases || read.cases === null) return couldNotRead("Service Cases", "there is no case");
      if (read.cases === "open") return { t: "Open case", pill: true, tone: "warn" };
      return { t: "None", pill: true, tone: "none" };
    },
  },
  value: {
    key: "value", label: "Order value", width: "110px", align: "end",
    cell: (r) => (r.total.kind === "amount" ? { t: rm(r.total.value), align: "end" } : { ...NOT_RECORDED, align: "end" }),
  },
  paid: {
    key: "paid", label: "Paid", width: "110px", align: "end",
    cell: (r) => (r.paid.kind === "amount" ? { t: rm(r.paid.value), align: "end" } : { ...NOT_RECORDED, align: "end" }),
  },
  balance: {
    key: "balance", label: "Balance", width: "110px", align: "end",
    cell: (r) => {
      if (r.balance.kind === "settled") return { t: "RM 0", align: "end" };
      if (r.balance.kind !== "amount") return { ...NOT_RECORDED, align: "end" };
      return r.balance.value > 0
        ? { t: rm(r.balance.value), fw: 600, fg: "warn", align: "end" }
        : { t: "RM 0", align: "end" };
    },
  },
  rcpt: {
    key: "rcpt", label: "Receipt No.", width: "130px",
    cell: (r) => (r.receipts === undefined ? couldNotRead("Payments", "there is no receipt") : docs(r.receipts.map((x) => x.receipt_no))),
  },
  payDue: {
    key: "payDue", label: "Pay by", width: "110px",
    /* Payments' own collection clock — the Payment Monitor's `dueIso`. */
    cell: (r, ctx) => {
      if (ctx.payment(r) === "paid") return { t: "Paid", fg: "muted" };
      const read = ctx.payBy(r);
      if (read.state === "loading") return LOADING;
      if (read.state === "denied") return NO_ACCESS;
      if (read.state === "failed") return couldNotRead("Payments", "the order is unpaid");
      if (!read.row) return NOT_RECORDED;
      const c = dayCell(read.row.timing.dueIso, 400);
      if (!c) return { t: read.row.timing.fact, fg: "muted" };
      return read.row.timing.late ? { ...c, fw: 600, fg: "warn" } : { ...c, fg: "ink" };
    },
  },
  hold: {
    key: "hold", label: "Finance hold", width: "170px", filterable: true,
    /* An OPEN `order_finance_exceptions` row (0355). Unknown is never no hold. */
    cell: (r, ctx) => fromOwner(r, ctx, "finance", "Finance", "there is no Finance hold", (f) =>
      f.financeHold
        ? { t: "Hold delivery", pill: true, tone: "warn", sub: f.financeHold.reason ? `Finance hold · ${f.financeHold.reason}` : "Finance hold", subTone: "warn", subWrap: true }
        : { t: "No Finance hold", fg: "muted" }),
  },
  po: {
    key: "po", label: "PO No.", width: "130px",
    cell: (r) => docs(r.poNumbers),
  },
  eta: {
    key: "eta", label: "Supplier ETA", width: "110px",
    cell: (r) => {
      if (pcsOf(r) > 0 && goodsIn(r) >= pcsOf(r)) return { t: "In" };
      const eta = supplierEta(r);
      return eta ? { t: `Due ${shortDay(eta)}` } : NOT_RECORDED;
    },
  },
  sdo: {
    key: "sdo", label: "Supplier DO", width: "120px",
    /* Purchasing MASTER §5.7 — the DO number recorded on the order's POs. */
    cell: (r, ctx) => fromOwner(r, ctx, "purchasing", "Purchasing", "there is no Supplier DO", (f) => docs(f.supplierDos)),
  },
  grnNo: {
    key: "grnNo", label: "GRN No.", width: "120px",
    /* Receiving §9.4 — posted GRNs that counted one of the order's PO lines. */
    cell: (r, ctx) => fromOwner(r, ctx, "purchasing", "Receiving", "nothing was received", (f) => docs(f.grns)),
  },
  loc: {
    key: "loc", label: "Location", width: "110px",
    /* Stock — the sites holding the order's reserved Units. */
    cell: (r, ctx) => {
      if (isDelivered(r)) return { t: "Fully delivered", fg: "muted" };
      return fromOwner(r, ctx, "location", "Stock", "the goods are not in", (f) => {
        if (f.locations.length > 0) return docs(f.locations);
        return goodsIn(r) > 0 ? NOT_RECORDED : NOT_YET;
      });
    },
  },
  load: {
    key: "load", label: "Loading", width: "110px",
    /* Delivery MASTER §4 — the newest handover record on the customer leg's DO. */
    cell: (r, ctx) => fromOwner(r, ctx, "loading", "Delivery", "nothing was handed over", (f) =>
      f.loading.kind ? { t: HANDOVER_WORD[f.loading.kind], fg: "ink" } : NOT_YET),
  },
  logi: {
    key: "logi", label: "Logistics", width: "100px", filterable: true,
    /* Delivery's arrangement first, the order row only as fallback (one reader). */
    cell: (r, ctx) => fromOwner(r, ctx, "delivery", "Delivery", "logistics is not assigned", (f) => {
      if (!f.delivery.partnerId) return { t: "Not assigned", fg: "muted" };
      return f.delivery.partnerName ? { t: f.delivery.partnerName } : couldNotRead("Delivery", "logistics is not assigned");
    }),
  },
  area: {
    key: "area", label: "Area", width: "110px", filterable: true,
    cell: (r) => (r.o.customer_address_city?.trim() ? { t: r.o.customer_address_city.trim() } : NOT_RECORDED),
  },
  appt: {
    /* 160px, not v8's 110: the governed slot words (`Afternoon (12pm to 3pm)`)
       must read whole — content decides the width. */
    key: "appt", label: "Appointment", width: "160px", filterable: true,
    /* COPY "Scheduled delivery": `Scheduled` · `Not scheduled`, then the time. */
    cell: (r, ctx) => {
      if (isDelivered(r)) return { t: "Delivered", pill: true, tone: "ok" };
      return fromOwner(r, ctx, "delivery", "Delivery", "nothing is arranged", (f) =>
        f.delivery.dateIso
          ? { t: "Scheduled", pill: true, tone: "ok", sub: timeWords(f.delivery.time), subTone: "muted" }
          : { t: "Not scheduled", pill: true, tone: "none" });
    },
  },
  doNo: {
    key: "doNo", label: "DO No.", width: "120px",
    cell: (r) => docs(r.deliveryOrders.map((d) => d.do_number)),
  },
};

/**
 * Where each owner fact comes from — the report's source table (owner
 * instruction 2026-10-09). Every column now reads its owner; none is a
 * placeholder.
 */
export const OUTRIGHT_FACT_SOURCES: { column: string; owner: string; source: string }[] = [
  { column: "SO PIC", owner: "Sales Orders · People", source: "ops_order_control.assigned_staff → app_users.name" },
  { column: "Supplier DO", owner: "Purchasing", source: "po_line_sources → purchase_orders.do_number" },
  { column: "GRN No.", owner: "Receiving", source: "posted warehouse_receipts counting the order's PO lines → grn_no" },
  { column: "Customer confirmed delivery date · Appointment · Logistics", owner: "Delivery", source: "live DO → ops_delivery_arrangements → confirmed booking (customerLegDeliveryOf); partner by assignedLogisticsIdOf" },
  { column: "Loading", owner: "Delivery", source: "delivery_handover_events on the customer leg's live DO" },
  { column: "Location", owner: "Stock", source: "reserved ops_stock_items.warehouse_id → warehouses.name" },
  { column: "Pay by", owner: "Payments", source: "Payment Monitor clock (paymentMonitorRows → timing.dueIso)" },
  { column: "Finance hold", owner: "Finance", source: "open order_finance_exceptions → reason" },
];
