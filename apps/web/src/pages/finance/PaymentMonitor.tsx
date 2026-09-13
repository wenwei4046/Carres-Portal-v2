import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { InvoiceRegisterRow } from "@carres/shared/payment-invoice-register";
import { invoiceGoodsFacts } from "@carres/shared/payment-invoice-register";
import {
  DEFAULT_MONITOR_FILTER,
  MONITOR_ACTION_WORD,
  MONITOR_FILTERS,
  monitorFilterMatch,
  monitorGoodsWord,
  monitorStorageWord,
  monitorSummaries,
  paymentMonitorRows,
  type MonitorFilterKey,
  type PaymentMonitorRow,
} from "@carres/shared/payment-monitor";
import type { CollectionTimingRule } from "@carres/shared/collection-clock";
import type { OperationWorkItem } from "@carres/shared/operation-work";
import { myHolidaySet } from "@carres/shared/my-holidays";
import { inOrderScope, orderScopeOf } from "@carres/shared/payment-register-scope";
import { PanelLeftOpen } from "lucide-react";
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
import { FilterRail, FilterRailGroup, FilterRailRow } from "@/pages/operation/components/workspace-rail";
import InvoiceCalendar, { type CalendarEntryKind } from "./InvoiceCalendar";
import PaymentCollectionWorkspace from "./PaymentCollectionWorkspace";

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
 * The rail holds the seven factual filters (never tabs) and the clear
 * summary sentences. Completed money leaves this view; it lives in Payment
 * Records.
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

function todayIso() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kuala_Lumpur" });
}

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

function filterKeyOf(raw: string | null): MonitorFilterKey {
  return (MONITOR_FILTERS.find((f) => f.key === raw)?.key) ?? DEFAULT_MONITOR_FILTER;
}

/** The Work feed's resolved owner for this SO's Payment work — the ONE owner
 *  calculation. Absent (no item, or the feed is not readable by this role)
 *  the cell says nothing about a person rather than inventing one. */
function workOwnerFor(row: PaymentMonitorRow, items: readonly OperationWorkItem[] | undefined) {
  if (!items) return null;
  const ids = new Set(row.rows.map((r) => r.id));
  const item = items.find((i) => i.module === "payment" && ids.has(i.object.id)
    && (i.ruleKey === "payment.collect_customer_balance" || i.ruleKey === "payment.missed_promise"
      || i.ruleKey === "payment.send_storage_invoice"));
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
    // (owner ruling 2026-09-13): the action stays visible, management sees
    // nobody holds the duty the owner is set from, and the one assignment
    // door is linked. Ordinary collection is the Responsible Delivery
    // Operation (0489) — established from Delivery Duty, so its failure is
    // Delivery's governed sentence.
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
  const workQ = useOperationWork({ enabled: role === "operation" || role === "principal" });
  const [params, setParams] = useSearchParams();
  const today = todayIso();
  const opts = useMemo(() => ({ holidays: myHolidaySet() }), []);
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
  const filter = filterKeyOf(params.get("view"));
  const setFilter = (key: MonitorFilterKey) => setParams((before) => {
    const next = new URLSearchParams(before);
    if (key === DEFAULT_MONITOR_FILTER) next.delete("view"); else next.set("view", key);
    return next;
  });
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
  const listRows = useMemo<MonitorRow[]>(
    () => scopedRows.filter((r) => monitorFilterMatch(r, filter))
      .map((r) => ({ ...r, owner: workOwnerFor(r, workItems) })),
    [scopedRows, filter, workItems],
  );
  const counts = useMemo(() => Object.fromEntries(
    MONITOR_FILTERS.map((f) => [f.key, scopedRows.filter((r) => monitorFilterMatch(r, f.key)).length]),
  ) as Record<MonitorFilterKey, number>, [scopedRows]);
  const summaries = useMemo(() => monitorSummaries(scopedRows), [scopedRows]);

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

  const showFiltersButton = (
    <button type="button" aria-label="Show filters" title="Show filters"
      data-testid="payment-monitor-show-filters"
      className="grid h-7 w-7 shrink-0 place-items-center rounded-control border border-kit-slate-6 bg-white text-kit-slate-11 hover:bg-kit-slate-3 hover:text-kit-slate-12"
      onClick={() => { setFilterRailVisible(true); setPhoneRailOverride(true); }}>
      <PanelLeftOpen size={16} strokeWidth={1.75} aria-hidden />
    </button>
  );

  const rail = (
    <FilterRail testId="payment-monitor-rail" ariaLabel="Payment Monitor filters"
      onHide={() => { setFilterRailVisible(false); setPhoneRailOverride(false); }}
      /* The clear summaries — fixed above the filters, always in view. Zero
         prints nothing; an empty desk says so in one sentence. */
      header={<div data-testid="payment-monitor-summaries" className="space-y-1 pr-8">
        <p className="text-label font-semibold uppercase tracking-wide text-kit-slate-9">Today</p>
        {loaded
          ? summaries.map((s) => <p key={s} className="text-body text-kit-slate-12">{s}</p>)
          : <p className="text-body text-kit-slate-11">Reading the collection desk…</p>}
      </div>}>
      <FilterRailGroup title="Show">
        {MONITOR_FILTERS.map((f) => <FilterRailRow key={f.key} label={f.label}
          count={loaded ? counts[f.key] : undefined}
          active={filter === f.key} onClick={() => setFilter(f.key)}
          testId={`payment-monitor-filter-${f.key}`} />)}
      </FilterRailGroup>
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
            <ListPageShell register>
              <DataGrid rows={listRows} columns={columns} rowKey={(r) => r.orderId}
                storageKey="carres.payment.monitor.v1" appearance="reference" exportName="Payment Monitor"
                /* No confirmed answer is not an empty list: skeleton until every
                   source has actually answered. */
                groupBanner={false} stickyIdentity isLoading={!loaded} searchPlaceholder="Search by SO, customer or phone…"
                toolbarStart={<span className="flex items-center gap-3 text-body">
                  {isPhone && !railVisible && showFiltersButton}
                  {orderScope !== null && <span className="flex items-center gap-2" data-testid="payment-monitor-order-scope">
                    <span>SO-{orderScope} only</span>
                    <button type="button" className="underline underline-offset-2" onClick={leaveScope}>Show all</button>
                  </span>}
                </span>}
                emptyMessage={orderScope !== null
                  ? `SO-${orderScope} needs no payment right now. Its money is in Payment Records.`
                  : filter === DEFAULT_MONITOR_FILTER
                    ? "No customer money is needed right now."
                    : `Nothing under ${MONITOR_FILTERS.find((f) => f.key === filter)?.label ?? "this filter"} right now.`}
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
