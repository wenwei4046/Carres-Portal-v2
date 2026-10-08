/**
 * The Outright list's columns — v8 `C` + `LAYOUTS` (owner-confirmed handoff,
 * Jess 2026-10-08), one entry per v8 column, same label, width and place.
 *
 * Every cell reads a REAL fact of the order. A fact the list does not read yet
 * prints `Not set` in the muted grey (owner ruling 2026-10-08: keep the column
 * where v8 puts it; never invent the value) and is named, with the module it
 * must come from, in `OUTRIGHT_MISSING_FACTS` for the report. A document that
 * simply does not exist yet prints `Not yet`, as v8 does.
 */
import { registerDeliveryConditionOf } from "@carres/shared";
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
  /** Text colour: ink (default body grey `#4A4F57` → c-tab), muted, warn. */
  fg?: "ink" | "muted" | "warn";
  pill?: boolean;
  tone?: CellTone;
  align?: "start" | "end";
  /** The Items cell: `› n pcs` opens the items pop-up. */
  pop?: boolean;
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

export const NOT_SET: Cell = { t: "Not set", fg: "muted" };
const NOT_YET: Cell = { t: "Not yet", fg: "muted" };

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

export type CellContext = {
  /** Payment status key from the register (`paid` · `partial` · `unpaid` · `unknown`). */
  payment: (r: RegisterRow) => string;
  /** Open customer cases on the order (`open` · `closed` · `none`), or null when unread. */
  cases: (r: RegisterRow) => string | null;
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
    cell: (r) => dayCell(r.proceeded) ?? NOT_SET,
  },
  order: {
    key: "order", label: "SO No.", width: "minmax(118px,1fr)",
    cell: (r) => ({ t: `SO-${r.so}`, fw: 600, fg: "ink", sub: r.customer || "Not set" }),
  },
  items: {
    key: "items", label: "Items", width: "84px",
    cell: (r) => { const n = pcsOf(r); return { t: `${n} ${n === 1 ? "pc" : "pcs"}`, pop: true }; },
  },
  channel: {
    key: "channel", label: "Sales location", width: "minmax(100px,.9fr)",
    cell: (r) => ({ t: salesLocationOf(r.o) || "Not set", sub: r.o.salespersons?.name?.trim() || "Not set" }),
  },
  dloc: {
    key: "dloc", label: "Delivery location", width: "minmax(100px,.9fr)",
    cell: (r) => {
      const city = r.o.customer_address_city?.trim();
      const state = r.o.customer_address_state?.trim();
      return city || state ? { t: city || "Not set", sub: state || "Not set" } : NOT_SET;
    },
  },
  reqDate: {
    key: "reqDate", label: "Customer original delivery date", width: "112px",
    cell: (r) => {
      const c = dayCell(r.customerDelivery);
      if (!c) return NOT_SET;
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
        sub: inn === total ? undefined : eta ? `ETA ${shortDay(eta)}` : "ETA Not set",
        subTone: "muted",
      };
    },
  },
  delivery: {
    key: "delivery", label: "Customer confirmed delivery date", width: "130px",
    cell: (r) => {
      if (isDelivered(r) && r.o.delivered_at) {
        const c = dayCell(r.o.delivered_at, 400)!;
        return { t: c.t, fg: "ink", sub: "Delivered", subTone: "ok" };
      }
      return NOT_SET;
    },
  },
  payment: {
    key: "payment", label: "Payment", width: "120px", filterable: true,
    cell: (r, ctx) => {
      const s = ctx.payment(r);
      if (s === "paid") return { t: "Paid", pill: true, tone: "ok" };
      if (s === "partial" || s === "unpaid") return { t: "Owes", pill: true, tone: "warn" };
      return NOT_SET;
    },
  },
  pic: { key: "pic", label: "SO PIC", width: "minmax(100px,.9fr)", filterable: true, cell: () => NOT_SET },
  problems: {
    key: "problems", label: "Problems", width: "90px", filterable: true,
    cell: (r, ctx) => {
      const c = ctx.cases(r);
      if (c === "open") return { t: "Open case", pill: true, tone: "warn" };
      if (c === "closed" || c === "none") return { t: "None", pill: true, tone: "none" };
      return NOT_SET;
    },
  },
  value: {
    key: "value", label: "Order value", width: "110px", align: "end",
    cell: (r) => (r.total.kind === "amount" ? { t: rm(r.total.value), align: "end" } : { ...NOT_SET, align: "end" }),
  },
  paid: {
    key: "paid", label: "Paid", width: "110px", align: "end",
    cell: (r) => (r.paid.kind === "amount" ? { t: rm(r.paid.value), align: "end" } : { ...NOT_SET, align: "end" }),
  },
  balance: {
    key: "balance", label: "Balance", width: "110px", align: "end",
    cell: (r) => {
      if (r.balance.kind === "settled") return { t: "RM 0", align: "end" };
      if (r.balance.kind !== "amount") return { ...NOT_SET, align: "end" };
      return r.balance.value > 0
        ? { t: rm(r.balance.value), fw: 600, fg: "warn", align: "end" }
        : { t: "RM 0", align: "end" };
    },
  },
  rcpt: {
    key: "rcpt", label: "Receipt No.", width: "130px",
    cell: (r) => (r.receipts === undefined ? NOT_SET : docs(r.receipts.map((x) => x.receipt_no))),
  },
  payDue: { key: "payDue", label: "Pay by", width: "110px", cell: () => NOT_SET },
  hold: { key: "hold", label: "Finance hold", width: "110px", filterable: true, cell: () => NOT_SET },
  po: {
    key: "po", label: "PO No.", width: "130px",
    cell: (r) => docs(r.poNumbers),
  },
  eta: {
    key: "eta", label: "Supplier ETA", width: "110px",
    cell: (r) => {
      if (pcsOf(r) > 0 && goodsIn(r) >= pcsOf(r)) return { t: "In" };
      const eta = supplierEta(r);
      return eta ? { t: `Due ${shortDay(eta)}` } : NOT_SET;
    },
  },
  sdo: { key: "sdo", label: "Supplier DO", width: "120px", cell: () => NOT_SET },
  grnNo: { key: "grnNo", label: "GRN No.", width: "120px", cell: () => NOT_SET },
  loc: { key: "loc", label: "Location", width: "110px", cell: () => NOT_SET },
  load: { key: "load", label: "Loading", width: "110px", cell: () => NOT_SET },
  logi: {
    key: "logi", label: "Logistics", width: "100px", filterable: true,
    cell: (r) => (r.o.delivery_partners?.name ? { t: r.o.delivery_partners.name } : NOT_SET),
  },
  area: {
    key: "area", label: "Area", width: "110px", filterable: true,
    cell: (r) => (r.o.customer_address_city?.trim() ? { t: r.o.customer_address_city.trim() } : NOT_SET),
  },
  appt: { key: "appt", label: "Appointment", width: "110px", filterable: true, cell: () => NOT_SET },
  doNo: {
    key: "doNo", label: "DO No.", width: "120px",
    cell: (r) => docs(r.deliveryOrders.map((d) => d.do_number)),
  },
};

/**
 * The facts the list does not read yet — each prints `Not set` today. The
 * report names them with the module that owns the fact (owner ruling
 * 2026-10-08).
 */
export const OUTRIGHT_MISSING_FACTS: { column: string; owner: string; note: string }[] = [
  { column: "Customer confirmed delivery date", owner: "Delivery", note: "the date Logistics and the customer agreed; only Delivered shows today" },
  { column: "SO PIC", owner: "Workspace / Staff & Duties", note: "the order's Operations owner is not in the list read" },
  { column: "Pay by", owner: "Payments", note: "2 working days before delivery, from Payment settings" },
  { column: "Finance hold", owner: "Payments (Finance)", note: "the hold flag is not in the list read" },
  { column: "Supplier DO", owner: "Purchasing", note: "supplier delivery order numbers per PO" },
  { column: "GRN No.", owner: "Warehouse", note: "GRN numbers of the order's received goods" },
  { column: "Location", owner: "Warehouse", note: "the site / location holding the order's units" },
  { column: "Loading", owner: "Delivery / Warehouse", note: "loading day and handover state" },
  { column: "Appointment", owner: "Delivery", note: "Confirmed / To confirm from the logistics booking" },
];
