import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { InvoiceRegisterRow } from "@carres/shared/payment-invoice-register";
import { invoiceGoodsFacts } from "@carres/shared/payment-invoice-register";
import {
  MONITOR_ACTION_WORD,
  PAYMENT_WEEK_RULE_KIND,
  mondayOf,
  monitorGoodsWord,
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
import { ChevronLeft, ChevronRight, PanelLeftOpen } from "lucide-react";
import ListPageShell from "@/components/ListPageShell";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";
import {
  useCatalog,
  useInvoiceRegister,
  useLaterDeliveryRequests,
  useOperationWork,
  usePaymentSettings,
  usePaymentStorageCases,
} from "@/lib/queries";
import { useAuth } from "@/lib/auth";
import { rm } from "@/lib/format-currency";
import { avatarColor, personInitials, personLabel } from "@/lib/staff-avatar";
import ModuleHeader from "@/pages/operation/components/ModuleHeader";
import { FilterRail, FilterRailRow } from "@/pages/operation/components/workspace-rail";
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
 *   SO No · Customer · Amount needed · Goods · Storage · Customer delivery ·
 *   Payment timing
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
  goods: "Goods",
  storage: "Storage",
  delivery: "Customer delivery",
  timing: "Payment timing",
} as const;

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

/** The Work feed's resolved owner for this SO's Payment work — the ONE owner
 *  calculation. Absent (no item, or the feed is not readable by this role)
 *  the cell says nothing about a person rather than inventing one. */
function workOwnerFor(row: PaymentMonitorRow, items: readonly OperationWorkItem[] | undefined) {
  if (!items) return null;
  const ids = new Set(row.rows.map((r) => r.id));
  const item = items.find((i) => i.module === "payment" && ids.has(i.object.id)
    && i.ruleKey in PAYMENT_WEEK_RULE_KIND);
  if (!item) return null;
  return item.owner;
}

/** A Monitor row with the Work feed's resolved owner riding on it. */
type MonitorRow = PaymentMonitorRow & { owner: OperationWorkItem["owner"] | null };

/** The duty word for the configuration exception — the Duty catalogue's own
 *  names, never a person. */
const DUTY_WORD: Record<string, string> = {
  payment_approver: "Payment Approver",
  storage_waiver_approver: "Storage Waiver Approver",
  delivery_duty: "Delivery Duty",
};

function OwnerChip({ owner }: { owner: OperationWorkItem["owner"] }) {
  const person = owner.acting ?? owner.normal;
  if (!person?.userId) {
    // A governed configuration exception, never a blank or an invented owner
    // (owner ruling 2026-09-13): the action stays visible, and the one door
    // that can fix it is linked.
    //
    // 🔴 0504 — ordinary collection is the Responsible Delivery Operation, and
    // that person is now the individual the SALES ORDER was dealt to, not a
    // duty holder. These words therefore name a door that cannot fix it. They
    // are approved copy, so they wait on the owner rather than change here;
    // the state is unreachable while an individual is in the assignment pool.
    const duty = DUTY_WORD[owner.dutyKey ?? owner.rule] ?? owner.dutyKey ?? owner.rule;
    return <span className="text-label font-normal text-kit-red-11" data-testid="monitor-owner-unassigned">
      Nobody holds {duty}. <Link to="/operation?tab=staff-duties" className="underline underline-offset-2">Staff &amp; Duties</Link>
    </span>;
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
  const picked: string = !canReadWork || rawDay === ALL_UNPAID || (rawDay === null && params.get("order") !== null)
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
  const listRows = useMemo<MonitorRow[]>(() => {
    const onDay = picked === ALL_UNPAID ? null : new Set(pickedDay?.orderIds ?? []);
    return scopedRows.filter((r) => !onDay || onDay.has(r.orderId))
      .map((r) => ({ ...r, owner: workOwnerFor(r, workItems) }));
  }, [scopedRows, picked, pickedDay, workItems]);

  // Items read as human words (register ruling ③): the catalog model name
  // when the SKU is known to it, else the SKU itself — never a blank.
  const itemName = useMemo(() => {
    const skus = new Map((catalogQ.data?.skus ?? []).map((s) => [s.sku, s.modelId]));
    const models = new Map((catalogQ.data?.models ?? []).map((m) => [m.id, m.name]));
    return (sku: string) => models.get(skus.get(sku) ?? "") ?? sku;
  }, [catalogQ.data]);

  const columns = useMemo<DataGridColumn<MonitorRow>[]>(() => [
    { key: "so", label: COLUMN.so, width: 100, sortable: true,
      accessor: (r) => <button type="button" className="text-left font-medium hover:underline"
        onClick={() => open(r.door)}>{r.so != null ? `SO-${r.so}` : "SO not available"}</button>,
      searchValue: (r) => r.so != null ? `SO-${r.so} ${r.so}` : "",
      filterValue: (r) => r.so != null ? `SO-${r.so}` : "SO not available",
      exportValue: (r) => r.so != null ? `SO-${r.so}` : "SO not available",
      sortFn: (a, b) => (a.so ?? 0) - (b.so ?? 0) },
    { key: "customer", label: COLUMN.customer, width: 180, sortable: true,
      accessor: (r) => <button type="button" className="text-left hover:underline"
        onClick={() => open(r.door)}>{r.customer}</button>,
      searchValue: (r) => `${r.customer} ${r.door.orders?.customer_phone ?? ""}`,
      filterValue: (r) => r.customer, exportValue: (r) => r.customer },
    { key: "needed", label: COLUMN.needed, width: 140, align: "right", sortable: true,
      accessor: (r) => <span className="block min-w-0">
        <span className="block">{r.money.known ? rm(r.money.outstanding) : "Value not recorded"}</span>
        {r.money.known && r.money.storageOwing > 0 && <span className="block text-label font-normal text-kit-slate-11">
          includes storage {rm(r.money.storageOwing)}</span>}
      </span>,
      numberValue: (r) => r.money.known ? r.money.outstanding : null, filterType: "number",
      exportValue: (r) => r.money.known ? r.money.outstanding : "Value not recorded" },
    { key: "goods", label: COLUMN.goods, width: 230, wrap: true,
      accessor: (r) => monitorGoodsWord(r.goods),
      searchValue: (r) => monitorGoodsWord(r.goods), filterValue: (r) => monitorGoodsWord(r.goods),
      exportValue: (r) => monitorGoodsWord(r.goods) },
    { key: "storage", label: COLUMN.storage, width: 230, wrap: true,
      accessor: (r) => monitorStorageWord(r.storage, rm),
      searchValue: (r) => monitorStorageWord(r.storage, rm), filterValue: (r) => monitorStorageWord(r.storage, rm),
      exportValue: (r) => monitorStorageWord(r.storage, rm) },
    { key: "delivery", label: COLUMN.delivery, width: 150, sortable: true, filterType: "date",
      dateValue: (r) => r.delivery.dateIso,
      accessor: (r) => <span className="block min-w-0">
        {r.delivery.dateIso
          ? <button type="button" className="block text-left hover:underline"
              aria-label={`Open Calendar · Customer delivery ${r.delivery.word}`}
              onClick={() => openCalendar(r.door, r.delivery.dateIso!, "delivery")}>{r.delivery.word}</button>
          : <span className="block">{r.delivery.word}</span>}
        {r.delivery.note && <span className="block text-label font-normal text-kit-slate-11">{r.delivery.note}</span>}
      </span>,
      exportValue: (r) => r.delivery.note ? `${r.delivery.word} · ${r.delivery.note}` : r.delivery.word },
    /* ⭐ THE TWO-LINE FACT/ACTION SURFACE with the resolved owner (owner
       ruling 2026-09-12 — Monitor is a control listing, the ruled exception
       to the fact-only register cell). Line 1 the fact, line 2 the governed
       action; the owner is the avatar, never a word in the sentence. */
    { key: "timing", label: COLUMN.timing, width: 230, wrap: true,
      accessor: (r) => {
        const owner = r.owner;
        const late = r.timing.late;
        return <span className="block min-w-0" data-testid={`monitor-timing-${r.so ?? r.orderId}`}>
          <span className={`block font-semibold ${late ? "text-kit-red-11" : ""}`}>{r.timing.fact}</span>
          {r.timing.action && <span className="mt-0.5 flex items-center gap-1.5 text-label font-normal text-kit-slate-11">
            {owner && r.timing.action !== "wait" && <OwnerChip owner={owner} />}
            <span>{MONITOR_ACTION_WORD[r.timing.action]}</span>
          </span>}
        </span>;
      },
      searchValue: (r) => r.timing.fact,
      filterValue: (r) => r.timing.fact,
      exportValue: (r) => r.timing.action ? `${r.timing.fact} · ${MONITOR_ACTION_WORD[r.timing.action]}` : r.timing.fact },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [today]);

  const selected = params.get("invoice");
  const invoice = invoices.find((r) => r.id === selected);
  const isError = invoicesQ.isError || casesQ.isError || requestsQ.isError || settingsQ.isError;
  const loaded = invoicesQ.isSuccess && casesQ.isSuccess && requestsQ.isSuccess && settingsQ.isSuccess;
  const planLoaded = loaded && canReadWork && workQ.isSuccess;
  const planFailed = canReadWork && workQ.isError;
  /** The day's words — the rail card and the collapsed sheet header say the same. */
  const dayWords = (d: PaymentWeekDay): string[] => {
    const words = d.lines.map(paymentWeekLineWord);
    if (d.carried) words.push(`Includes ${d.carried.count} not done since ${fmtDate(d.carried.sinceIso)}`);
    if (d.countedOnPlanDay > 0) {
      words.push(`${d.countedOnPlanDay} not done · counted under ${plan.planDayIso === today ? "Today" : fmtDate(plan.planDayIso)}`);
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
              data-testid="payment-monitor-week-label">{weekLabel}</span>
            <button type="button" aria-label="Next week" title="Next week" className={weekArrow}
              data-testid="payment-monitor-next-week" onClick={() => moveWeek(1)}>
              <ChevronRight size={15} aria-hidden />
            </button>
          </div>
          {!onPlanWeek && <button type="button" className="text-label text-kit-slate-11 underline underline-offset-2"
            data-testid="payment-monitor-this-week" onClick={() => pickDay(planDay)}>This week</button>}
        </div>
        : <p className="pr-8 text-body text-kit-slate-11">The follow-up plan is Operation's.</p>}>
      {canReadWork && <div className="flex flex-col gap-1" data-testid="payment-monitor-days">
        {planFailed
          ? <div role="alert" className="px-1.5 text-body">
            <p>The follow-up plan could not be loaded.</p>
            <button type="button" className="btn-secondary mt-2" onClick={() => void workQ.refetch()}>Try again</button>
          </div>
          : plan.days.map((d) => <DayCard key={d.iso} day={d} active={picked === d.iso}
              words={planLoaded ? dayWords(d) : null} onPick={() => pickDay(d.iso)} />)}
      </div>}
      <div className={canReadWork ? "border-t border-kit-slate-5 pt-3" : ""}>
        <FilterRailRow label="All unpaid orders" count={loaded ? scopedRows.length : undefined}
          active={picked === ALL_UNPAID} testId="payment-monitor-all-unpaid"
          onClick={() => { if (canReadWork) pickDay(ALL_UNPAID); }} />
      </div>
    </FilterRail>
  );

  return <div className="flex h-full min-h-0 flex-col" data-testid="payment-monitor">
    {invoice
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
        : selected ? <div className="p-6 text-body">
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
            <ListPageShell register>
              <DataGrid rows={listRows} columns={columns} rowKey={(r) => r.orderId}
                storageKey="carres.payment.monitor.v1" appearance="reference" exportName="Payment Monitor"
                /* No confirmed answer is not an empty list: skeleton until every
                   source has actually answered. */
                /* ⭐ THE ROW KEEPS ITS NAME (owner ruling 2026-09-12, Delivery
                   Monitor; applied here 2026-09-14). Seven columns need 1295px
                   and the sheet has ~950px, so it ALWAYS scrolls; with only
                   `SO No` pinned, the right-hand end showed `Ask customer to
                   pay` with no customer attached to it. Identity is the SO
                   number AND whose row it is. */
                groupBanner={false} stickyIdentity={{ columnKey: ["so", "customer"] }}
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
                expandTitle="Show items" onRowDoubleClick={(r) => open(r.door)}
                expandable={{ renderExpansion: (r) => <ItemsDisclosure row={r} itemName={itemName} /> }}
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
      active ? "bg-kit-blue-3 text-kit-slate-12" : "text-kit-slate-11 hover:bg-kit-slate-3",
      day.isToday ? "ring-1 ring-inset ring-kit-blue-9" : "",
    ].join(" ")}>
    {active && <span aria-hidden className="absolute left-0 top-1 bottom-1 w-0.5 bg-kit-blue-9" />}
    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
      <span className="font-semibold text-kit-slate-12">{fmtDate(day.iso)}</span>
      {day.isToday && <span className="rounded-full border border-kit-blue-9 px-1.5 text-label font-semibold text-kit-blue-11"
        data-testid="payment-monitor-today">Today</span>}
    </span>
    {day.holiday !== null && <span className="break-words text-label text-kit-slate-11">
      {day.holiday ? `Public holiday · ${day.holiday}` : "Public holiday"}</span>}
    {words === null
      ? <span className="text-label text-kit-slate-9">Reading the collection desk…</span>
      : words.map((w) => <span key={w} className={`break-words ${late(w) ? "text-label text-kit-red-11" : w === "No follow-up planned" || w.includes(" not done · ") ? "text-label text-kit-slate-9" : "text-body text-kit-slate-12"}`}>{w}</span>)}
  </button>;
}

/** `Show items` — the read-only exact item disclosure: Item · Qty · Goods,
 *  for the goods of the delivery scope. Payment staff change no stock fact
 *  here; there is nothing to click. */
function ItemsDisclosure({ row, itemName }: { row: MonitorRow; itemName: (sku: string) => string }) {
  const facts = invoiceGoodsFacts(row.door);
  if (row.goods.lines.length === 0) {
    return <div className="p-4 text-body" data-testid="payment-monitor-items">
      <p>No goods lines are recorded on this order.</p>
      <p className="text-label font-normal text-kit-slate-11">{facts.completed ? "The order is delivered." : "Arrival not confirmed"}</p>
    </div>;
  }
  return <div className="p-4" data-testid="payment-monitor-items">
    <table className="w-full text-body">
      <thead>
        <tr className="text-label font-semibold text-kit-slate-11">
          <th scope="col" className="py-1 pr-4 text-left font-semibold">Item</th>
          <th scope="col" className="py-1 pr-4 text-right font-semibold">Qty</th>
          <th scope="col" className="py-1 text-left font-semibold">Goods</th>
        </tr>
      </thead>
      <tbody>
        {row.goods.lines.map((l, i) => <tr key={`${l.sku}-${i}`}>
          <td className="py-1 pr-4"><span title={l.sku}>{itemName(l.sku)}</span></td>
          <td className="py-1 pr-4 text-right tabular-nums">{l.qty}</td>
          <td className="py-1">{l.word}</td>
        </tr>)}
      </tbody>
    </table>
  </div>;
}
