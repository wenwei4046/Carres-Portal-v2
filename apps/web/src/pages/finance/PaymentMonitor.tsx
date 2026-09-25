import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type { InvoiceRegisterRow } from "@carres/shared/payment-invoice-register";
import {
  MONITOR_ACTION_WORD,
  PAYMENT_WEEK_RULE_KIND,
  mondayOf,
  monitorStorageLines,
  monitorStorageWord,
  paymentMonitorRows,
  paymentPlanDay,
  paymentWeekLineWord,
  paymentWeekPlan,
  type PaymentMonitorRow,
  type PaymentWeekDay,
} from "@carres/shared/payment-monitor";
import type { CollectionTimingRule } from "@carres/shared/collection-clock";
import type { OperationWorkItem } from "@carres/shared/operation-work";
import { myHolidayName, myHolidaySet } from "@carres/shared/my-holidays";
import { inOrderScope, orderScopeOf } from "@carres/shared/payment-register-scope";
import {
  ASSIGN_IN_SALES_ORDERS,
  ASSIGN_IN_SALES_ORDERS_HREF,
  COLLECTION_NOT_ASSIGNED as NOT_ASSIGNED,
  NOBODY_ASSIGNED_TO_ORDER as NOBODY_ASSIGNED,
} from "@carres/shared/payment-collection-owner";
import { ChevronLeft, ChevronRight, PanelLeftOpen } from "lucide-react";
import ListPageShell from "@/components/ListPageShell";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";
import {
  useCatalog,
  useInvoiceRegister,
  useLaterDeliveryRequests,
  useOperationOrders,
  useOperationWork,
  usePaymentSettings,
  usePaymentStorageCases,
  type operationOrderListRow,
} from "@/lib/queries";
import { useAuth } from "@/lib/auth";
import { rm } from "@/lib/format-currency";
import { avatarColor, personInitials, personLabel } from "@/lib/staff-avatar";
import ModuleHeader from "@/pages/operation/components/ModuleHeader";
import { FilterRail, FilterRailRow } from "@/pages/operation/components/workspace-rail";
import { ItemsServicesStockPanel } from "@/pages/operation/components/DeliveryBrief";
import { TwoLines, confirmedDeliveryLines, joinLines } from "@/pages/operation/components/MonitorTwoLines";
import { monitorGoodsOf, type MonitorStock } from "@/pages/operation/delivery-monitor";
import { requestedDeliveryText } from "@/pages/operation/sales-order-columns";
import { DATE_TO_BE_CONFIRMED_FULL } from "@/pages/operation/sales-order-guidance";
import InvoiceCalendar, { type CalendarEntryKind } from "./InvoiceCalendar";
import PaymentCollectionWorkspace from "./PaymentCollectionWorkspace";
import { appTodayIso, fmtDate } from "@/lib/fmt-date";

/**
 * PAYMENT MONITOR — the full-width collection control listing (owner ruling
 * 2026-09-12; payment/MASTER.md §3).
 *
 * One row per Sales Order that still needs customer money. It is not a
 * calendar, a document register, a KPI dashboard or a second My Work: every
 * cell is a fact from the owning module through the ONE shared arithmetic
 * (`paymentMonitorRows`), the owner avatar is the shared Work feed's resolved
 * owner (never a second owner calculation), and the row opens the SAME
 * collection workspace shared Work deep-links to.
 *
 *   SO No · Customer · Amount needed · Items & Stock · Storage ·
 *   Requested Delivery Date · Confirmed Delivery · Payment timing
 *
 * ⭐ THE LISTING IS DELIVERY'S LISTING (owner ruling 2026-09-16). The same
 * shared DataGrid, the same fixed 72px row with one fact and one supporting
 * line per cell, `SO No` and `Customer` pinned, the same Search · Columns ·
 * Export · footer. Items & Stock is Delivery's own arithmetic over the Stock
 * register (`monitorGoodsOf`), the two dates are Sales' request and Delivery's
 * confirmed fact, and a row opens its payment workspace BELOW itself the way a
 * Delivery row opens its brief — the picked day, filters, scroll and the row's
 * place never move.
 *
 * The rail is the Monday–Friday FOLLOW-UP PLAN (owner ruling 2026-09-16):
 * each day names the collection work the shared Work Engine placed on it,
 * picking a day narrows this listing to that day's orders, and `All unpaid
 * orders` keeps every unpaid order reachable. Completed money leaves this
 * view; it lives in Payment Records.
 */

const COLUMN = {
  so: "SO No",
  customer: "Customer",
  needed: "Amount needed",
  itemsStock: "Items & Stock",
  storage: "Storage",
  requested: "Requested Delivery Date",
  confirmed: "Scheduled delivery",
  timing: "Payment timing",
} as const;

/** The expand chevron's word — the row opens its payment details below it. */
const SHOW_PAYMENT_DETAILS = "Show payment details";
/** A Finance reader cannot read Operation's stock register (the orders list
 *  is Operation's); the cell says whose fact it is instead of guessing. */
const STOCK_FACTS_ARE_OPERATIONS = "Stock facts are Operation's.";
/** Operation's orders read failed: an honest failure, never a blank cell. */
const STOCK_FACTS_FAILED = "Stock facts could not be loaded.";


/** The rail-collapse memory (ui MASTER, LOCAL FILTER RAIL COLLAPSE). Narrow
 *  windows start with the rail closed, the same 1100px rule Delivery runs. */
const FILTER_RAIL_STORAGE_KEY = "carres.paymentMonitor.filterRail";
const NARROW_VIEWPORT_PX = 1100;
const PHONE_BREAKPOINT = 768;

function useIsPhone(): boolean {
  const query = `(max-width: ${PHONE_BREAKPOINT - 1}px)`;
  const canAsk = typeof window !== "undefined" && typeof window.matchMedia === "function";
  const read = () => canAsk && window.matchMedia(query).matches;
  const [phone, setPhone] = useState<boolean>(read);
  useEffect(() => {
    if (!canAsk) return;
    const mql = window.matchMedia(query);
    const onChange = () => setPhone(read());
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return phone;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
/** `?day=all` — every unpaid order, the entry for orders no plan reaches yet. */
const ALL_UNPAID = "all";

function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d! + n));
  return dt.toISOString().slice(0, 10);
}

/** The shared Work feed's collection item for this SO — the ONE owner
 *  calculation and the ONE action. Absent (no item, or the feed is not
 *  readable by this role) the cell names no action and no person. */
function workItemFor(row: PaymentMonitorRow, items: readonly OperationWorkItem[] | undefined) {
  if (!items) return null;
  const ids = new Set(row.rows.map((r) => r.id));
  const mine = items.filter((i) => i.module === "payment" && ids.has(i.object.id)
    && i.ruleKey in PAYMENT_WEEK_RULE_KIND);
  /* One order can carry two collection items (its balance AND an unpaid
     Storage Invoice). Line 2 answers line 1, so the item whose work IS the
     printed fact wins; otherwise the engine's own order stands. */
  const wanted = row.timing.kind === "storage_invoice_unpaid" ? "payment.send_storage_invoice"
    : row.timing.kind === "promised_today" ? "payment.missed_promise"
      : "payment.collect_customer_balance";
  return mine.find((i) => i.ruleKey === wanted) ?? mine[0] ?? null;
}

/** A Monitor row with what rides beside it: the Work item and Delivery's
 *  Items & Stock for the order. */
type MonitorRow = PaymentMonitorRow & {
  work: OperationWorkItem | null;
  stock: MonitorStock | null;
  /** The order row Delivery's panel reads; null for a reader without it. */
  order: operationOrderListRow | null;
};

function OwnerChip({ owner }: { owner: OperationWorkItem["owner"] }) {
  const person = owner.acting ?? owner.normal;
  if (!person?.userId) {
    /* ⭐ 0504 (owner instruction 2026-09-16 — the stale `Nobody holds Delivery
       Duty.` hint is cleared): the collection owner is the individual the Sales
       Order was dealt to, so an unresolved owner means nobody is assigned to
       THIS order. The word stays short on the fixed row; the full sentence and
       the one door that fixes it are the link's own name. */
    return <Link to={ASSIGN_IN_SALES_ORDERS_HREF} className="shrink-0 font-semibold text-kit-red-11 underline underline-offset-2"
      aria-label={`${NOBODY_ASSIGNED} ${ASSIGN_IN_SALES_ORDERS}`} title={`${NOBODY_ASSIGNED} ${ASSIGN_IN_SALES_ORDERS}`}
      onClick={(event) => event.stopPropagation()}
      data-testid="monitor-owner-unassigned">{NOT_ASSIGNED}</Link>;
  }
  const colors = avatarColor(person.userId);
  const label = personLabel(person.name, "");
  // Normal owner and today's cover are DISTINCT facts: the avatar is the
  // acting person; the title keeps the normal owner beside the cover.
  const normal = owner.normal?.name ? personLabel(owner.normal.name, "") : null;
  const title = owner.activeCover && normal && normal !== label
    ? `Normal owner: ${normal} · Today's cover: ${label}`
    : label;
  return <span
    className={`inline-grid h-5 w-5 shrink-0 place-items-center rounded-full text-label font-semibold${owner.activeCover ? " ring-2 ring-kit-amber-3" : ""}`}
    style={{ background: colors.bg, color: colors.fg }}
    title={title}
    role="img"
    aria-label={label}
    data-testid="monitor-owner-avatar"
    data-normal-owner={normal ?? undefined}
    data-cover={owner.activeCover ? label : undefined}
  >{personInitials(person.name, "")}</span>;
}

/** `TCF0541 · CR1122` — the customer's own references, never joined to the SO. */
function refsOf(r: PaymentMonitorRow): string | null {
  const raw = r.door.orders?.source_ref;
  const refs = (Array.isArray(raw) ? raw : raw ? [raw] : []).map((x) => String(x).trim()).filter(Boolean);
  return refs.length ? refs.join(" · ") : null;
}

function requestedText(r: PaymentMonitorRow): string {
  return requestedDeliveryText({ iso: r.delivery.requested.iso, tbd: r.delivery.requested.tbd });
}

/** Line two of `Payment timing` — the Work item's own action, or `Wait`. */
function timingActionText(r: MonitorRow): string | null {
  if (r.work) return r.work.action;
  return r.timing.action === "wait" ? MONITOR_ACTION_WORD.wait : null;
}

export default function PaymentMonitor() {
  const invoicesQ = useInvoiceRegister();
  const casesQ = usePaymentStorageCases();
  const requestsQ = useLaterDeliveryRequests();
  const settingsQ = usePaymentSettings();
  const catalogQ = useCatalog();
  const role = useAuth((s) => s.role);
  // The Work feed is Operation's; a finance reader sees the facts and no owner.
  const canReadWork = role === "operation" || role === "principal";
  const workQ = useOperationWork({ enabled: canReadWork });
  // Items & Stock is Delivery's arithmetic over Operation's orders list — the
  // SAME read the Delivery Monitor builds its rows from.
  const ordersQ = useOperationOrders({}, { enabled: canReadWork });
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const today = appTodayIso();
  const holidays = useMemo(() => myHolidaySet(), []);
  const opts = useMemo(() => ({ holidays }), [holidays]);
  const isPhone = useIsPhone();

  /* ── The rail-collapse memory ─────────────────────────────────────────── */
  const [filterRailOpen, setFilterRailOpen] = useState(() => {
    let stored: string | null = null;
    try { stored = localStorage.getItem(FILTER_RAIL_STORAGE_KEY); } catch { /* unavailable */ }
    if (stored === "0") return false;
    if (stored === "1") return true;
    return typeof window === "undefined" ? true : window.innerWidth >= NARROW_VIEWPORT_PX;
  });
  const setFilterRailVisible = (open: boolean) => {
    setFilterRailOpen(open);
    try { localStorage.setItem(FILTER_RAIL_STORAGE_KEY, open ? "1" : "0"); } catch { /* live state still works */ }
  };
  const [phoneRailOverride, setPhoneRailOverride] = useState(false);
  const railVisible = isPhone ? phoneRailOverride : filterRailOpen;

  /* ── The URL is the state ─────────────────────────────────────────────── */
  /* ⭐ THE PICKED DAY (owner ruling 2026-09-16). Absent = the plan day —
     today when Operation works today, else the next working day. A reader
     without the Work feed has no plan, so its landing is every unpaid order. */
  const planDay = paymentPlanDay(today, holidays);
  const rawDay = params.get("day");
  // A door that names one order (`?order=`) opens on every day — the order
  // is the question, not the plan.
  const picked: string = !canReadWork || rawDay === ALL_UNPAID
    || (rawDay === null && (params.get("order") !== null || params.get("invoice") !== null))
    ? ALL_UNPAID
    : rawDay && ISO_DAY.test(rawDay) ? rawDay : planDay;
  const weekOf = picked === ALL_UNPAID ? planDay : picked;
  const pickDay = (iso: string) => {
    setParams((before) => {
      const next = new URLSearchParams(before);
      if (iso === planDay) next.delete("day"); else next.set("day", iso);
      return next;
    });
    setPhoneRailOverride(false);
  };
  /* Previous / next week: the plan day when the week holds it, else Monday. */
  const moveWeek = (weeks: number) => {
    const monday = addDays(mondayOf(weekOf), weeks * 7);
    pickDay(mondayOf(planDay) === monday ? planDay : monday);
  };
  const orderScope = orderScopeOf(params.get("order"));
  const leaveScope = () => setParams((before) => {
    const next = new URLSearchParams(before); next.delete("order"); return next;
  });
  /* ⭐ THE ROW OPENS BELOW ITSELF (owner ruling 2026-09-16). `?invoice=` is
     still the address shared Work deep-links to; it now names the row whose
     payment details are open. `section` brings the cell's own part into view. */
  const [reveal, setReveal] = useState<{ key: string; section: "items" | "storage" | null } | null>(null);
  const openRow = useCallback((r: PaymentMonitorRow, section: "items" | "storage" | null) => {
    setReveal(null);
    setTimeout(() => setReveal({ key: r.orderId, section }), 0);
  }, []);
  const open = (r: InvoiceRegisterRow) => setParams((before) => {
    const next = new URLSearchParams(before); next.set("invoice", r.id); return next;
  });
  const close = () => setParams((before) => {
    const next = new URLSearchParams(before); next.delete("invoice"); return next;
  });
  // §17 — a date cell is a door into the Calendar at that date's fixed
  // workweek, carrying the exact SO to highlight.
  const openCalendar = (r: InvoiceRegisterRow, dateIso: string, from: CalendarEntryKind) =>
    setParams((before) => {
      const next = new URLSearchParams(before);
      next.set("calendar", "1"); next.set("date", dateIso); next.set("so", r.order_id); next.set("from", from);
      return next;
    });
  const closeCalendar = () => setParams((before) => {
    const next = new URLSearchParams(before);
    next.delete("calendar"); next.delete("date"); next.delete("so"); next.delete("from");
    return next;
  });
  const [calendarFilter, setCalendarFilter] = useState<"all" | CalendarEntryKind>("all");

  /* ── The rows, through the one shared derivation ──────────────────────── */
  const invoices = useMemo(() => invoicesQ.data ?? [], [invoicesQ.data]);
  const timingRules = useMemo<CollectionTimingRule[]>(() => (settingsQ.data?.collection_timing ?? [])
    .map((r) => ({ askDaysBefore: r.ask_days_before, deadlineDaysBefore: r.deadline_days_before, effectiveFrom: r.effective_from })),
    [settingsQ.data]);
  const promisedByOrder = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of invoices) {
      const p = r.orders?.latest_promise?.promised_date;
      if (p && !map.has(r.order_id)) map.set(r.order_id, p);
    }
    return map;
  }, [invoices]);
  const allRows = useMemo(() => paymentMonitorRows({
    invoices,
    cases: casesQ.data?.cases ?? [],
    requests: requestsQ.data?.requests ?? [],
    todayIso: today,
    opts,
    timingRules,
    promisedByOrder,
  }), [invoices, casesQ.data, requestsQ.data, today, opts, timingRules, promisedByOrder]);
  const scopedRows = useMemo(
    () => allRows.filter((r) => inOrderScope(r.door, orderScope)),
    [allRows, orderScope],
  );
  const workItems = workQ.data?.items;
  // The owner rides ON the row: the shared DataGrid renders a cell from its
  // row data, and a column accessor that read outer state would show the
  // owner the grid was mounted with, not the one the feed answered.
  // The week is a VIEW of the shared Work Engine: its items, its days, its
  // owners — nothing scheduled here.
  const plan = useMemo(() => paymentWeekPlan({
    items: (workItems ?? []).filter((i) => i.module === "payment"),
    rows: scopedRows, todayIso: today, weekOfIso: weekOf, holidays, holidayName: myHolidayName,
  }), [workItems, scopedRows, today, weekOf, holidays]);
  const pickedDay = picked === ALL_UNPAID ? null : (plan.days.find((d) => d.iso === picked) ?? null);
  const orderById = useMemo(
    () => new Map((canReadWork ? ordersQ.data?.orders ?? [] : []).map((o) => [o.id, o] as const)),
    [ordersQ.data, canReadWork],
  );
  const addonNameByKey = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of catalogQ.data?.addons ?? []) if (a.key && a.name) m.set(a.key, a.name);
    return m;
  }, [catalogQ.data]);
  /* Items & Stock for the WHOLE order — the payment is the Sales Order's, so
     its readiness is every line's, through Delivery's own arithmetic. */
  const goodsOf = (r: PaymentMonitorRow, order: operationOrderListRow) => monitorGoodsOf({
    o: order, lines: order.order_lines ?? [], leg: null,
    requestedIso: r.delivery.requested.iso, todayIso: today, holidays, addonNameByKey,
  });
  const stockOf = (r: PaymentMonitorRow, order: operationOrderListRow): MonitorStock => {
    const delivered = order.status === "delivered" || !!r.door.orders?.delivered_at;
    return delivered ? { line1: "Delivered", line2: null, ready: true } : goodsOf(r, order).stock;
  };
  const listRows = useMemo<MonitorRow[]>(() => {
    const onDay = picked === ALL_UNPAID ? null : new Set(pickedDay?.orderIds ?? []);
    return scopedRows.filter((r) => !onDay || onDay.has(r.orderId))
      .map((r): MonitorRow => {
        const order = orderById.get(r.orderId) ?? null;
        return { ...r, work: workItemFor(r, workItems), order, stock: order ? stockOf(r, order) : null };
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopedRows, picked, pickedDay, workItems, orderById, addonNameByKey]);

  const stockAbsence = !canReadWork ? STOCK_FACTS_ARE_OPERATIONS : ordersQ.isError ? STOCK_FACTS_FAILED : "";
  const stockText = (r: MonitorRow) => r.stock
    ? joinLines(r.stock.line1, r.stock.line2)
    : stockAbsence;
  const columns = useMemo<DataGridColumn<MonitorRow>[]>(() => [
    /* SO No — the number opens the formal Sales Order; the customer's own
       reference is the supporting line, never glued to the number. */
    { key: "so", label: COLUMN.so, width: 130, sortable: true, filterType: "numbering",
      accessor: (r) => <span className="block min-w-0">
        <span className="block truncate">
          {r.so != null
            ? <button type="button" className="font-mono font-medium text-blue-700 underline-offset-2 hover:underline"
                onClick={(event) => { event.stopPropagation(); navigate(`/operation/orders/so/${r.orderId}`); }}>SO-{r.so}</button>
            : <span>SO not available</span>}
        </span>
        {refsOf(r) && <TwoLinesRef text={refsOf(r)!} />}
      </span>,
      searchValue: (r) => `${r.so != null ? `SO-${r.so} ${r.so}` : ""} ${refsOf(r) ?? ""}`,
      filterValue: (r) => r.so != null ? `SO-${r.so}` : "SO not available",
      exportValue: (r) => joinLines(r.so != null ? `SO-${r.so}` : "SO not available", refsOf(r)),
      sortFn: (a, b) => (a.so ?? 0) - (b.so ?? 0) },
    { key: "customer", label: COLUMN.customer, width: 180, sortable: true,
      accessor: (r) => <TwoLines reveal line1={r.customer} line2={r.door.orders?.customer_phone ?? null} />,
      searchValue: (r) => `${r.customer} ${r.door.orders?.customer_phone ?? ""}`,
      filterValue: (r) => r.customer,
      exportValue: (r) => joinLines(r.customer, r.door.orders?.customer_phone ?? null) },
    { key: "needed", label: COLUMN.needed, width: 200, align: "right", sortable: true,
      accessor: (r) => <TwoLines
        line1={r.money.known ? rm(r.money.outstanding) : "Value not recorded"}
        line2={r.money.known && r.money.storageOwing > 0 ? `includes storage ${rm(r.money.storageOwing)}` : null} />,
      numberValue: (r) => r.money.known ? r.money.outstanding : null, filterType: "number",
      exportValue: (r) => r.money.known ? r.money.outstanding : "Value not recorded" },
    /* Items & Stock — Delivery's words over Delivery's arithmetic. The cell
       opens the row at its items: what, how many, ready or arriving, and the
       Unit and PO behind each piece. */
    { key: "items_stock", label: COLUMN.itemsStock, width: 170, sortable: true, filterType: "enum",
      accessor: (r) => r.stock
        ? <button type="button" className="block w-full min-w-0 text-left" data-testid={`payment-monitor-stock-${r.so ?? r.orderId}`}
            aria-label={`${COLUMN.itemsStock} · ${joinLines(r.stock.line1, r.stock.line2)}`}
            onClick={(event) => { event.stopPropagation(); openRow(r, "items"); }}>
            <TwoLines line1={r.stock.line1} tone={r.stock.ready ? "green" : "orange"} line2={r.stock.line2} />
          </button>
        : <TwoLines line1={stockAbsence} />,
      searchValue: stockText, filterValue: (r) => r.stock?.line1 ?? stockText(r), exportValue: stockText },
    /* Storage — every real state, on two lines. The cell opens the row at its
       Storage section; nothing here edits a charge. */
    { key: "storage", label: COLUMN.storage, width: 230, sortable: true, filterType: "enum",
      accessor: (r) => {
        const lines = monitorStorageLines(r.storage, rm);
        const owing = r.storage.kind === "invoice_unpaid" || r.storage.kind === "charging";
        return <button type="button" className="block w-full min-w-0 text-left" data-testid={`payment-monitor-storage-${r.so ?? r.orderId}`}
          aria-label={`${COLUMN.storage} · ${monitorStorageWord(r.storage, rm)}`}
          onClick={(event) => { event.stopPropagation(); openRow(r, "storage"); }}>
          <TwoLines line1={lines.line1} tone={r.storage.kind === "none" ? "none" : owing ? "orange" : "none"} line2={lines.line2} />
        </button>;
      },
      searchValue: (r) => monitorStorageWord(r.storage, rm),
      filterValue: (r) => monitorStorageLines(r.storage, rm).line1,
      exportValue: (r) => monitorStorageWord(r.storage, rm) },
    /* Requested Delivery Date — Sales' request, kept after Delivery confirms. */
    { key: "requested", label: COLUMN.requested, width: 176, sortable: true, filterType: "date",
      dateValue: (r) => r.delivery.requested.iso,
      accessor: (r) => <TwoLines line1={requestedText(r)} tone={r.delivery.requested.iso ? "none" : "orange"}
        line1Title={!r.delivery.requested.iso && r.delivery.requested.tbd ? DATE_TO_BE_CONFIRMED_FULL : undefined} />,
      searchValue: requestedText, filterValue: requestedText, exportValue: requestedText,
      sortFn: (a, b) => (a.delivery.requested.iso ?? "").localeCompare(b.delivery.requested.iso ?? "") },
    /* Confirmed Delivery — Delivery's fact, Delivery's spelling. */
    { key: "confirmed", label: COLUMN.confirmed, width: 190, sortable: true, filterType: "date",
      dateValue: (r) => r.delivery.confirmed.dateIso,
      accessor: (r) => {
        const c = confirmedDeliveryLines(r.delivery.confirmed);
        const cell = <TwoLines line1={c.line1} tone={c.tone} line2={c.line2} line2Tone={c.line2Tone} />;
        /* §17 — a day is a door into the Calendar at that date's workweek. */
        return r.delivery.confirmed.dateIso
          ? <button type="button" className="block w-full min-w-0 text-left"
              aria-label={`Open Calendar · ${COLUMN.confirmed} ${joinLines(c.line1, c.line2)}`}
              onClick={(event) => { event.stopPropagation(); openCalendar(r.door, r.delivery.confirmed.dateIso!, "delivery"); }}>{cell}</button>
          : cell;
      },
      searchValue: (r) => { const c = confirmedDeliveryLines(r.delivery.confirmed); return joinLines(c.line1, c.line2); },
      filterValue: (r) => confirmedDeliveryLines(r.delivery.confirmed).line1,
      exportValue: (r) => { const c = confirmedDeliveryLines(r.delivery.confirmed); return joinLines(c.line1, c.line2); },
      sortFn: (a, b) => (a.delivery.confirmed.dateIso ?? "").localeCompare(b.delivery.confirmed.dateIso ?? "") },
    /* ⭐ THE TWO-LINE FACT/ACTION SURFACE (owner rulings 2026-09-12 ·
       2026-09-16). Line 1 the fact. Line 2 the shared Work item's OWN action
       beside its owner avatar — no Work item, no action and no person; only
       the ruled `Wait` stands alone. The owner is never a word in the line. */
    { key: "timing", label: COLUMN.timing, width: 300, sortable: true, filterType: "enum",
      accessor: (r) => {
        const action = timingActionText(r);
        return <span className="block min-w-0" data-testid={`monitor-timing-${r.so ?? r.orderId}`}>
          <span className={`block truncate font-semibold ${r.timing.late ? "text-kit-red-11" : "text-kit-slate-12"}`} title={r.timing.fact}>{r.timing.fact}</span>
          {action && <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-label font-normal text-kit-slate-11">
            {r.work && <OwnerChip owner={r.work.owner} />}
            <span className="truncate" title={action}>{action}</span>
          </span>}
        </span>;
      },
      searchValue: (r) => joinLines(r.timing.fact, timingActionText(r)),
      filterValue: (r) => r.timing.fact,
      exportValue: (r) => joinLines(r.timing.fact, timingActionText(r)),
      sortFn: (a, b) => monitorRiskRank(a) - monitorRiskRank(b) },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [today, canReadWork, stockAbsence]);

  const selected = params.get("invoice");
  const invoice = invoices.find((r) => r.id === selected);
  /* A Work deep link names an invoice: when its order is on the Monitor the
     row opens below itself; only money no longer on the Monitor (already
     paid) keeps the full-page workspace. */
  const invoiceRow = invoice ? allRows.find((r) => r.orderId === invoice.order_id) ?? null : null;
  const revealKey = reveal?.key ?? invoiceRow?.orderId;
  const isError = invoicesQ.isError || casesQ.isError || requestsQ.isError || settingsQ.isError;
  const loaded = invoicesQ.isSuccess && casesQ.isSuccess && requestsQ.isSuccess && settingsQ.isSuccess
    && (!canReadWork || ordersQ.isSuccess || ordersQ.isError);
  const planLoaded = loaded && canReadWork && workQ.isSuccess;
  const planFailed = canReadWork && workQ.isError;
  /** The day's words — the rail card and the collapsed sheet header say the same. */
  const dayWords = (d: PaymentWeekDay): string[] => {
    const words = d.lines.map(paymentWeekLineWord);
    // A date inside a wrapped sentence never breaks in two (`Thu, 17 | Sep`).
    const day = (iso: string) => fmtDate(iso).replace(/ /g, "\u00a0");
    if (d.carried) words.push(`Includes ${d.carried.count} not done since ${day(d.carried.sinceIso)}`);
    if (d.countedOnPlanDay > 0) {
      words.push(`${d.countedOnPlanDay} not done · counted under ${plan.planDayIso === today ? "Today" : day(plan.planDayIso)}`);
    }
    if (words.length === 0) words.push("No follow-up planned");
    return words;
  };

  /* The picked day survives the rail being collapsed (2026-09-14 measured
     that a collapsed rail took its governed words with it): the sheet header
     repeats the day and its work for exactly the state where the rail is off
     screen. */
  const pickedWords = picked === ALL_UNPAID
    ? ["All unpaid orders"]
    : !planLoaded ? [planFailed ? "The follow-up plan could not be loaded." : "Reading the collection desk…"]
      : pickedDay ? dayWords(pickedDay) : ["No follow-up planned"];
  const pickedHeading = picked === ALL_UNPAID ? null
    : `${fmtDate(picked)}${pickedDay?.isToday ? " · Today" : ""}`;

  const showFiltersButton = (
    <button type="button" aria-label="Show filters" title="Show filters"
      data-testid="payment-monitor-show-filters"
      className="grid h-7 w-7 shrink-0 place-items-center rounded-control border border-kit-slate-6 bg-white text-kit-slate-11 hover:bg-kit-slate-3 hover:text-kit-slate-12"
      onClick={() => { setFilterRailVisible(true); setPhoneRailOverride(true); }}>
      <PanelLeftOpen size={16} strokeWidth={1.75} aria-hidden />
    </button>
  );

  const weekStart = plan.weekStartIso;
  const weekLabel = `${fmtDate(weekStart)} – ${fmtDate(addDays(weekStart, 4))}`;
  const onPlanWeek = mondayOf(planDay) === weekStart;
  const weekArrow = "grid h-8 w-7 shrink-0 place-items-center rounded-control border border-kit-slate-6 bg-white text-kit-slate-11 hover:bg-kit-slate-3";

  const rail = (
    <FilterRail testId="payment-monitor-rail" ariaLabel="Payment follow-up plan"
      onHide={() => { setFilterRailVisible(false); setPhoneRailOverride(false); }}
      header={canReadWork
        /* The week, fixed above the days: ‹ Mon, 14 Sep – Fri, 18 Sep ›. */
        ? <div data-testid="payment-monitor-week" className="space-y-1.5 pr-8">
          <div className="flex items-center gap-1">
            <button type="button" aria-label="Previous week" title="Previous week" className={weekArrow}
              data-testid="payment-monitor-previous-week" onClick={() => moveWeek(-1)}>
              <ChevronLeft size={15} aria-hidden />
            </button>
            <span className="min-w-0 flex-1 break-words text-center text-body font-semibold text-kit-slate-12"
              data-testid="payment-monitor-week-label" aria-label={weekLabel}>
              {/* Each date stays whole: the break falls between the two days,
                  never inside `Fri, 18 Sep`. */}
              <span className="whitespace-nowrap">{fmtDate(weekStart)} –</span>{" "}
              <span className="whitespace-nowrap">{fmtDate(addDays(weekStart, 4))}</span>
            </span>
            <button type="button" aria-label="Next week" title="Next week" className={weekArrow}
              data-testid="payment-monitor-next-week" onClick={() => moveWeek(1)}>
              <ChevronRight size={15} aria-hidden />
            </button>
          </div>
          {!onPlanWeek && <button type="button" className="text-meta text-kit-slate-11 underline underline-offset-2"
            data-testid="payment-monitor-this-week" onClick={() => pickDay(planDay)}>This week</button>}
        </div>
        : <p className="pr-8 text-body text-kit-slate-11">The follow-up plan is Operation's.</p>}>
      {canReadWork && <div className="flex flex-col gap-1 py-3" data-testid="payment-monitor-days">
        {planFailed
          ? <div role="alert" className="px-1.5 text-body">
            <p>The follow-up plan could not be loaded.</p>
            <button type="button" className="btn-secondary mt-2" onClick={() => void workQ.refetch()}>Try again</button>
          </div>
          : plan.days.map((d) => <DayCard key={d.iso} day={d} active={picked === d.iso}
              words={planLoaded ? dayWords(d) : null} onPick={() => pickDay(d.iso)} />)}
      </div>}
      <div className={canReadWork ? "border-t border-kit-slate-5 py-2" : "py-2"}>
        <FilterRailRow label="All unpaid orders" count={loaded ? scopedRows.length : undefined}
          active={picked === ALL_UNPAID} resets testId="payment-monitor-all-unpaid"
          onClick={() => { if (canReadWork) pickDay(ALL_UNPAID); }} />
      </div>
    </FilterRail>
  );

  return <div className="flex h-full min-h-0 flex-col" data-testid="payment-monitor">
    {invoice && loaded && !invoiceRow
      ? <PaymentCollectionWorkspace invoice={invoice} rows={invoices} timingRules={timingRules}
          backLabel="Monitor" onClose={close} />
      : <>
        <ModuleHeader destinationHeader testId="payment-monitor-destination-header" word="Monitor" docTitle="Monitor — Payments — Carres" />
        {isError ? <div role="alert" className="p-6 text-body">
          <p>The collection desk could not be loaded. Try again.</p>
          <button className="btn-secondary mt-3" onClick={() => {
            void invoicesQ.refetch(); void casesQ.refetch(); void requestsQ.refetch(); void settingsQ.refetch();
          }}>Try again</button>
        </div>
        : selected && !invoice ? <div className="p-6 text-body">
          <p>{invoicesQ.isLoading ? "Loading the collection details…" : "This order's invoice is not available."}</p>
          <button className="btn-secondary mt-3" onClick={close}>Back to Monitor</button>
        </div>
        : params.get("calendar") === "1"
        ? <InvoiceCalendar rows={invoices}
            selectedDateIso={params.get("date") ?? today}
            highlightOrderId={params.get("so")}
            highlightKind={(params.get("from") === "arrival" || params.get("from") === "delivery")
              ? params.get("from") as CalendarEntryKind : null}
            filter={calendarFilter}
            onPickDate={(iso) => setParams((before) => {
              const next = new URLSearchParams(before); next.set("date", iso); return next;
            })}
            onFilter={setCalendarFilter}
            onOpenInvoice={(r) => { closeCalendar(); open(r); }}
            onBack={closeCalendar} />
        : <div className="relative flex min-h-0 flex-1 overflow-hidden">
          {railVisible
            ? (isPhone
                ? <div className="absolute inset-y-0 left-0 z-20 flex shadow-lg">{rail}</div>
                : rail)
            : !isPhone
              ? <aside className="flex w-11 shrink-0 flex-col items-center gap-2 border-r border-kit-slate-5 bg-white py-2">
                  {showFiltersButton}
                  <span className="text-label text-kit-slate-11 [writing-mode:vertical-rl]">Show filters</span>
                </aside>
              : null}
          <div className="flex min-w-0 min-h-0 flex-1 flex-col">
            {!railVisible && <div data-testid="payment-monitor-day-collapsed"
              className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-kit-slate-5 bg-white px-3 py-1.5">
              {pickedHeading && <span className="text-body font-semibold text-kit-slate-12">{pickedHeading}</span>}
              {pickedWords.map((line) => <span key={line} className="text-body text-kit-slate-12">{line}</span>)}
            </div>}
            {/* The governed Register shell; the Finance frame above it is a fixed
                viewport, so the sheet scrolls INSIDE the page and an opened row
                never pushes the listing or its footer off screen. */}
            <ListPageShell register className="min-h-0 flex-1" testId="payment-monitor-work-list">
              <DataGrid rows={listRows} columns={columns} rowKey={(r) => r.orderId}
                storageKey="carres.payment.monitor.v2" appearance="reference" exportName="Payment Monitor"
                /* No confirmed answer is not an empty list: skeleton until every
                   source has actually answered. */
                /* ⭐ THE ROW KEEPS ITS NAME (owner ruling 2026-09-12, Delivery
                   Monitor; applied here 2026-09-14): `SO No` AND `Customer`
                   stay pinned while the eight columns scroll inside the sheet. */
                /* On a phone the two pins (≈340px) are wider than the sheet
                   itself (≈314px at 390): nothing else could ever scroll into
                   view, so the phone pins the SO number alone. */
                groupBanner={false} stickyIdentity={{ columnKey: isPhone ? ["so"] : ["so", "customer"] }}
                /* ⭐ 72px, one fact and one supporting line in every cell (owner
                   ruling 2026-09-16 — the Payment Monitor's own ruling, beside
                   Delivery's). A cell never grows the row. */
                rowHeight={72}
                isLoading={!loaded || (picked !== ALL_UNPAID && !planLoaded && !planFailed)} searchPlaceholder="Search by SO, customer or phone…"
                toolbarStart={<span className="flex items-center gap-3 text-body">
                  {isPhone && !railVisible && showFiltersButton}
                  {orderScope !== null && <span className="flex items-center gap-2" data-testid="payment-monitor-order-scope">
                    <span>SO-{orderScope} only</span>
                    <button type="button" className="underline underline-offset-2" onClick={leaveScope}>Show all</button>
                  </span>}
                </span>}
                emptyMessage={orderScope !== null
                  ? `SO-${orderScope} needs no payment right now. Its money is in Payment Records.`
                  : picked === ALL_UNPAID
                    ? "No customer money is needed right now."
                    : planFailed ? "The follow-up plan could not be loaded."
                      : `No follow-up planned on ${fmtDate(picked)}.`}
                expandTitle={SHOW_PAYMENT_DETAILS}
                expandable={{
                  fitExpansionToViewport: true,
                  revealExpandedKey: revealKey,
                  renderExpansion: (r) => <PaymentWorkspaceBelow row={r} invoices={invoices} timingRules={timingRules}
                    today={today} holidays={holidays} addonNameByKey={addonNameByKey} stockAbsence={stockAbsence}
                    focusSection={reveal?.key === r.orderId ? reveal.section : null} onClose={close} />,
                }}
                statusSummary={(visible) => {
                  const needed = visible.reduce((sum, r) => sum + (r.money.known ? r.money.outstanding : 0), 0);
                  return <span data-testid="payment-monitor-summary">
                    {visible.length} {visible.length === 1 ? "order" : "orders"} · {rm(needed)} still needed
                  </span>;
                }}
              />
            </ListPageShell>
          </div>
        </div>}
      </>}
  </div>;
}

/**
 * One day of the follow-up plan. Today wears the blue RING and the word
 * `Today`; the picked day wears the blue FILL — the two never compete (UI
 * MASTER). Every line wraps; nothing is truncated.
 */
function DayCard({ day, active, words, onPick }: {
  day: PaymentWeekDay;
  active: boolean;
  /** Null while the Work feed has not answered — no reassuring empty day. */
  words: string[] | null;
  onPick: () => void;
}) {
  const late = (w: string) => w.startsWith("Includes ");
  return <button type="button" onClick={onPick} aria-pressed={active}
    data-testid={`payment-monitor-day-${day.iso}`} data-today={day.isToday ? "yes" : undefined}
    className={[
      "relative flex w-full flex-col items-stretch gap-0.5 rounded-control px-2 py-2 text-left text-body",
      active ? "bg-kit-blue-3 text-kit-slate-12" : "text-kit-slate-12 hover:bg-kit-slate-3",
      day.isToday ? "ring-1 ring-inset ring-kit-blue-9" : "",
    ].join(" ")}>
    {active && <span aria-hidden className="absolute left-0 top-1 bottom-1 w-0.5 bg-kit-blue-9" />}
    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
      <span className="font-semibold text-kit-slate-12">{fmtDate(day.iso)}</span>
      {day.isToday && <span className="rounded-full border border-kit-blue-9 px-1.5 text-label font-semibold text-kit-blue-11"
        data-testid="payment-monitor-today">Today</span>}
    </span>
    {day.holiday !== null && <span className="break-words text-meta text-kit-slate-11">
      {day.holiday ? `Public holiday · ${day.holiday}` : "Public holiday"}</span>}
    {words === null
      ? <span className="text-meta text-kit-slate-11">Reading the collection desk…</span>
      : words.map((w) => <span key={w} className={`break-words ${late(w) ? "text-meta text-kit-red-11" : w === "No follow-up planned" || w.includes(" not done · ") ? "text-meta text-kit-slate-11" : "text-body text-kit-slate-12"}`}>{w}</span>)}
  </button>;
}

/** The reference line under the SO number — cut to fit, the whole value a
 *  click or a keypress away (owner ruling 2026-09-16). */
function TwoLinesRef({ text }: { text: string }) {
  return <span className="block text-label text-kit-slate-11"><TwoLines reveal line1={text} /></span>;
}

const RISK_RANK: Record<PaymentMonitorRow["timing"]["kind"], number> = {
  should_have_paid: 0, storage_invoice_unpaid: 1, promised_today: 2, due_today: 3, ask_today: 4,
  due_later: 5, arrival_not_confirmed: 6, no_date: 7, value_unknown: 8, paid: 9,
};
/** Sorting `Payment timing` returns the listing to its risk order. */
function monitorRiskRank(r: PaymentMonitorRow): number {
  return RISK_RANK[r.timing.kind];
}

/**
 * The row's payment details, opened BELOW the row (owner ruling 2026-09-16):
 * the SAME collection workspace shared Work opens — money, Delivery's dates
 * and items, storage, what to do, the collection owner, invoice, payments and
 * Communication History, with `Record payment`, `Ask customer to pay`,
 * `Record the result`, `Create payment link`, `Statement` and `Print`.
 */
function PaymentWorkspaceBelow({ row, invoices, timingRules, today, holidays, addonNameByKey, stockAbsence, focusSection, onClose }: {
  row: MonitorRow;
  invoices: InvoiceRegisterRow[];
  timingRules: CollectionTimingRule[];
  today: string;
  holidays: ReadonlySet<string>;
  addonNameByKey: Map<string, string>;
  stockAbsence: string;
  focusSection: "items" | "storage" | null;
  onClose: () => void;
}) {
  const order = row.order;
  const goods = order ? monitorGoodsOf({
    o: order, lines: order.order_lines ?? [], leg: null,
    requestedIso: row.delivery.requested.iso, todayIso: today, holidays, addonNameByKey,
  }) : null;
  const confirmed = confirmedDeliveryLines(row.delivery.confirmed);
  return <PaymentCollectionWorkspace invoice={row.door} rows={invoices} timingRules={timingRules}
    backLabel="Monitor" onClose={onClose}
    embedded={{
      focusSection,
      deliveryLines: {
        requested: requestedText(row),
        confirmed: joinLines(confirmed.line1, confirmed.line2),
      },
      goodsPanel: goods && order
        ? <ItemsServicesStockPanel orderId={row.orderId} items={goods.items} extras={goods.extras}
            arrival={goods.arrival} requestedIso={row.delivery.requested.iso} loans={order.ops_sofa_loans} />
        : <p className="text-body text-kit-slate-11">{stockAbsence}</p>,
    }} />;
}
