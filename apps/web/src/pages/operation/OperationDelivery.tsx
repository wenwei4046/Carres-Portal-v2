import { useMemo, useState } from "react";
import { ChevronRight, RefreshCw, Truck } from "lucide-react";
import {
  bookingDayOf,
  carrierDayLoads,
  carrierDayNote,
  daysInRange,
  dayWord,
  deliveryDueState,
  deliveryGroupLabel,
  deliveryRange,
  deliveryQueueForLabel,
  deliveryQueueLeads,
  deliveryScopeSentence,
  deliveryStepDueIso,
  deliveryStepOverdue,
  DELIVERY_QUEUES,
  DELIVERY_RANGE_KEYS,
  myHolidaySet,
  orderActionLine,
  orderDeliveryGroups,
  partnerBookingWarnings,
  partnerDeliveryRules,
  sortDeliveryRows,
  type DayBooking,
  type DeliveryGroupKey,
  type DeliveryQueueKey,
  type DeliveryRangeKey,
  type PartnerDeliveryRules,
} from "@carres/shared";
import {
  useDeliveryPartners,
  useOperationOrders,
  useOperationStock,
  usePurchasingSettings,
  type operationOrderListRow,
} from "@/lib/queries";
import { orderBookingDay, orderControlOf } from "@/lib/order-booking";
import { fmtDate } from "@/lib/fmt-date";
import { cjkClassName } from "@/lib/cjk";
import { locationForAddress } from "@/lib/region";
import ListPageShell, { type ActiveChip } from "@/components/ListPageShell";
import { SectionBand, SectionCard } from "@/components/SectionPanel";
import BookingSpine from "./components/BookingSpine";
import OrderDetailDrawer from "./components/OrderDetailDrawer";
// The ladder and its inputs are IMPORTED from the Orders list, never re-derived.
// T11's own law is "the same computed actions the Orders list shows, so the two
// pages can never disagree" — the only way to guarantee that is to run ONE
// `nextActionOf`. When C2 rewrites the ladder into its two layers, both surfaces
// move on the same commit instead of one drifting into a second answer.
import {
  deliveryStepAnchor,
  fmtRM,
  logisticStateOf,
  moneyOf,
  nextActionOf,
  stageOf,
  stockReadiness,
  todayIso,
} from "./OperationOrdersControl";

/**
 * OperationDelivery — T11, the Delivery module page and the LAST card of the
 * delivery line (docs/delivery-execution-queue.md · docs/delivery-module-proposal.md).
 *
 * **This card is ASSEMBLY. It invents nothing**, and that is the point: by T11
 * every signal, queue, word, reason, profile and calendar already ships, so the
 * module is three panes reading what exists —
 *
 *   facet   ← the four live delivery queues + their auto-overdue deadlines (T7)
 *   list    ← the SAME computed action the Orders list shows (one `nextActionOf`)
 *   detail  ← the booking (D1/T1) · groups (T8) · the logistics company's own
 *             delivery rules (T9) · the delivery-photo ledger (T6) · the T5 spine
 *   calendar← `bookingDayOf` (T10) — the ONE confirmed-vs-provisional rule
 *
 * It carries the ONE new sidebar item in the whole plan; everything else in
 * every line upgrades an existing door.
 *
 * **What this page deliberately does NOT do: write anything.** Every booking,
 * every photo, every reason is entered through the order drawer, which is the
 * one place those gates live (server-side `bookingConfirmGate`, the T6 upload
 * door). A second write surface would mean a second set of gates to keep in
 * step, and the first time they diverged an operator would get a confirmation
 * the server refuses. So the detail pane states facts and hands over to the same
 * drawer the Orders list opens — `Open order` is the only door out of it.
 *
 * **No new endpoint.** Every field is already on the orders list payload (T1 put
 * the booking there, T7 the photo ledger) or on `/api/operation/partners` (T9).
 */

/** The four delivery queues, keyed by their live label. The LABELS are not
 *  copied into this file: they come from the shared constant, so the queue word
 *  here, the queue word in the Orders facet and the NEXT-column verb are one
 *  string. (COPY-STANDARD rule 8: renaming them app-wide is C1's job — a
 *  synonym invented here would be the exact failure that rule names.) */
const QUEUE_DEFS = DELIVERY_QUEUES as readonly {
  key: DeliveryQueueKey;
  label: string;
  description: string;
}[];

const NO_LOGISTICS = "__none" as const;
/** COPY-STANDARD, the Logistics word law: `Carrier` / `Partner` are banned UI
 *  words, and a fact may state an absence but never carry a to-do word. */
const NO_LOGISTICS_LABEL = "No logistics picked";

type ViewKey = "queues" | "calendar";

/** One row of the board: the order plus everything the panes ask of it. */
interface DeliveryRow {
  order: operationOrderListRow;
  /** The delivery queue its action names — null when the ladder's answer is
   *  not a delivery step at all (money-held, still waiting on stock, Done). */
  queue: DeliveryQueueKey | null;
  /** The action's QUEUE word — party-free, used for the facet chip. */
  label: string;
  /** The action's ROW LINE, party named — what the operator reads (C1). */
  line: string;
  tone: "danger" | "warning" | "info" | "success" | "neutral";
  locked: boolean;
  dueIso: string | null;
  overdue: boolean;
  bookingIso: string | null;
  promisedIso: string | null;
  so: number;
  logisticsId: string | null;
  logisticsName: string | null;
}

export default function OperationDelivery() {
  const ordersQ = useOperationOrders();
  const partnersQ = useDeliveryPartners();
  const stockQ = useOperationStock();

  const [view, setView] = useState<ViewKey>("queues");
  const [queueFilter, setQueueFilter] = useState<Set<DeliveryQueueKey>>(new Set());
  const [logisticsFilter, setLogisticsFilter] = useState<Set<string>>(new Set());
  const [range, setRange] = useState<DeliveryRangeKey>("today");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [facetOpen, setFacetOpen] = useState(true);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggleGroup = (k: string) =>
    setCollapsed((prev) => {
      const n = new Set(prev);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  const orders = useMemo(() => ordersQ.data?.orders ?? [], [ordersQ.data]);
  const partners = useMemo(() => partnersQ.data?.partners ?? [], [partnersQ.data]);

  const partnerNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of partners) m.set(p.id, p.name);
    return m;
  }, [partners]);

  /** T9 rules per logistics company. A row nobody has edited normalises to the
   *  default, which produces ZERO warnings — absent data means "we never asked",
   *  never "it's fine" (the T9 law, held here). */
  const rulesByPartner = useMemo(() => {
    const m = new Map<string, PartnerDeliveryRules>();
    for (const p of partners) {
      m.set(
        p.id,
        partnerDeliveryRules({
          offDays: p.off_days ?? undefined,
          blackoutDates: (p.blackout_dates ?? []).map((d) => String(d).slice(0, 10)),
          dailyCapacity: p.daily_capacity ?? null,
          bookingLeadDays: p.booking_lead_days ?? 0,
        }),
      );
    }
    return m;
  }, [partners]);

  const availableBySku = useMemo(() => {
    const rows = stockQ.data?.skus ?? [];
    if (rows.length === 0) return undefined;
    const m = new Map<string, number>();
    for (const s of rows) m.set(s.sku, s.available);
    return m;
  }, [stockQ.data]);

  const holidayOpts = useMemo(() => ({ holidays: myHolidaySet() }), []);
  // P1 — the working days of notice on `Confirm delivery date` is a setting
  // (Purchasing → Settings). Read here so this module and the Orders list can
  // never call the same step late on different days.
  const purchasingSettingsQ = usePurchasingSettings();
  const queueLeads = useMemo(
    () =>
      purchasingSettingsQ.data ? deliveryQueueLeads(purchasingSettingsQ.data) : undefined,
    [purchasingSettingsQ.data],
  );
  const today = todayIso();

  /**
   * Every order, read through the ladder ONCE.
   *
   * `queue` is the whole scoping rule: an order is delivery WORK exactly when
   * the ladder says the next thing to do is one of the four delivery actions. A
   * money-held order (🔒 Confirm delivery) carries no queue and never reaches
   * the board — you do not arrange a delivery you are not allowed to make (the
   * PayHold law, decided in T7 and simply obeyed here).
   *
   * Queue-less orders are still BUILT, because the calendar shows every booked
   * truck — including the money-held ones — and clicking one must open a detail
   * pane that says what the Orders list says about it, not a blank.
   */
  const rows = useMemo(() => {
    const out: DeliveryRow[] = [];
    for (const o of orders) {
      const next = nextActionOf(o, stockReadiness(o, availableBySku), o.order_lines ?? []);
      const def = deliveryQueueForLabel(next.label);
      const anchor = def ? deliveryStepAnchor(o, def.key) : null;
      const state = logisticStateOf(o, partnerNameById);
      const money = moneyOf(o);
      out.push({
        order: o,
        queue: def?.key ?? null,
        label: next.label,
        // C1 — the row says the action WITH the party in it, built by the same
        // shared helper the Orders list uses; no second spelling can appear.
        // C3 — the money line has to carry its FIGURE here too: a held order is
        // exactly the kind that reaches this pane (booked truck, off the board),
        // and `Collect from Kong Chai Yin` names no measurable object. The date
        // is deliberately NOT passed: for an order waiting on its booked day the
        // line reads the short `Delivering`, because the two lines under this
        // one already state `confirmed 27 Jul · 12pm–3pm`.
        line: orderActionLine(next.key, {
          logistics: state.partner,
          customer: o.customer_name,
          amount: money.known ? fmtRM(money.outstanding) : null,
        }),
        tone: next.tone,
        locked: !!next.locked,
        dueIso: def ? deliveryStepDueIso(def.key, anchor, holidayOpts) : null,
        overdue: def ? deliveryStepOverdue(def.key, anchor, today, holidayOpts) : false,
        bookingIso: orderBookingDay(o).date,
        promisedIso: o.delivery_date_tbd ? null : o.delivery_date,
        so: o.so,
        logisticsId: o.delivery_partner_id ?? o.ops_assigned_logistic ?? null,
        logisticsName: state.partner,
      });
    }
    return sortDeliveryRows(out);
  }, [orders, availableBySku, partnerNameById, holidayOpts, today, queueLeads]);

  /** The board itself — the queue-carrying rows, in delivery-risk order. */
  const board = useMemo(
    () => rows.filter((r): r is DeliveryRow & { queue: DeliveryQueueKey } => r.queue !== null),
    [rows],
  );

  const queueStats = useMemo(() => {
    const m = new Map<DeliveryQueueKey, { n: number; late: number }>();
    for (const r of board) {
      const cur = m.get(r.queue) ?? { n: 0, late: 0 };
      cur.n += 1;
      if (r.overdue) cur.late += 1;
      m.set(r.queue, cur);
    }
    return m;
  }, [board]);

  /** Every logistics company is an option even at 0 (the Orders-facet rule), so
   *  the rail reads as the whole roster rather than only today's busy ones. */
  const logisticsEntries = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of board) {
      const key = r.logisticsId ?? NO_LOGISTICS;
      m.set(key, (m.get(key) ?? 0) + 1);
    }
    const named = partners
      .map((p) => ({ key: p.id, label: p.name, count: m.get(p.id) ?? 0 }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    const none = m.get(NO_LOGISTICS) ?? 0;
    return none > 0
      ? [{ key: NO_LOGISTICS as string, label: NO_LOGISTICS_LABEL, count: none }, ...named]
      : named;
  }, [board, partners]);

  const filtered = useMemo(
    () =>
      board.filter((r) => {
        if (queueFilter.size > 0 && !queueFilter.has(r.queue)) return false;
        if (logisticsFilter.size > 0 && !logisticsFilter.has(r.logisticsId ?? NO_LOGISTICS))
          return false;
        return true;
      }),
    [board, queueFilter, logisticsFilter],
  );

  const lateCount = filtered.filter((r) => r.overdue).length;

  const selected = useMemo(
    () => rows.find((r) => r.order.id === selectedId) ?? null,
    [rows, selectedId],
  );

  const activeChips: ActiveChip[] = [
    ...[...queueFilter].map((k) => ({
      label: QUEUE_DEFS.find((q) => q.key === k)?.label ?? k,
      onClear: () =>
        setQueueFilter((prev) => {
          const n = new Set(prev);
          n.delete(k);
          return n;
        }),
    })),
    ...[...logisticsFilter].map((id) => ({
      label: id === NO_LOGISTICS ? NO_LOGISTICS_LABEL : partnerNameById.get(id) ?? id,
      onClear: () =>
        setLogisticsFilter((prev) => {
          const n = new Set(prev);
          n.delete(id);
          return n;
        }),
    })),
  ];

  return (
    <>
      <ListPageShell
        testId="operation-delivery"
        breadcrumb={
          <>
            <span>Operations</span>
            <ChevronRight size={12} className="text-base-300" />
            <span className="text-base-600">Delivery</span>
          </>
        }
        title={
          <span className="inline-flex items-baseline gap-3">
            <span>Delivery</span>
            <span className="inline-flex items-center gap-1.5 text-[12px] font-normal text-base-400">
              <span className="tabular-nums">Today {fmtDate(today)}</span>
              <button
                type="button"
                onClick={() => void ordersQ.refetch()}
                title="Refresh"
                aria-label="Refresh delivery board"
                className="p-0.5 rounded hover:text-base-900 hover:bg-hovertint transition-colors"
              >
                <RefreshCw size={14} strokeWidth={2} />
              </button>
            </span>
          </span>
        }
        facetOpen={facetOpen}
        onFacetToggle={() => setFacetOpen((v) => !v)}
        facetWidthPx={210}
        activeChips={activeChips}
        facet={
          <>
            <SectionCard>
              <SectionBand
                title="DELIVERY"
                strong
                collapsed={collapsed.has("DELIVERY")}
                onToggle={() => toggleGroup("DELIVERY")}
                total={board.length}
              />
              {/* All FOUR queues always show, even at 0 — unlike the Orders
                  facet, which hides an empty row because delivery is one group
                  among a dozen there. Here the four steps ARE the module, so a
                  rail that shrinks to two rows reads as though the page were
                  broken, and "0 to assign" is a real answer. */}
              {!collapsed.has("DELIVERY") && (
                <div className="flex flex-col gap-0.5 mt-0.5" data-testid="delivery-queues">
                  {QUEUE_DEFS.map((def) => {
                    const key = def.key;
                    const s = queueStats.get(key);
                    return (
                      <FacetRow
                        key={key}
                        label={def.label}
                        // Numbers up front (COPY-STANDARD rule 3): "5 · 2 late".
                        value={s ? (s.late > 0 ? `${s.n} · ${s.late} late` : `${s.n}`) : "0"}
                        tone={s && s.late > 0 ? "danger" : undefined}
                        active={queueFilter.has(key)}
                        title={
                          s && s.late > 0
                            ? `${def.description}. ${s.late} of ${s.n} already past that deadline.`
                            : def.description
                        }
                        onClick={() =>
                          setQueueFilter((prev) => {
                            const n = new Set(prev);
                            if (n.has(key)) n.delete(key);
                            else n.add(key);
                            return n;
                          })
                        }
                      />
                    );
                  })}
                </div>
              )}
            </SectionCard>

            {logisticsEntries.length > 0 && (
              <SectionCard>
                <SectionBand
                  title="LOGISTICS"
                  strong
                  collapsed={collapsed.has("LOGISTICS")}
                  onToggle={() => toggleGroup("LOGISTICS")}
                />
                {!collapsed.has("LOGISTICS") && (
                  <div className="flex flex-col gap-0.5 mt-0.5" data-testid="delivery-logistics">
                    {logisticsEntries.map((e) => (
                      <FacetRow
                        key={e.key}
                        label={e.label}
                        value={`${e.count}`}
                        active={logisticsFilter.has(e.key)}
                        onClick={() =>
                          setLogisticsFilter((prev) => {
                            const n = new Set(prev);
                            if (n.has(e.key)) n.delete(e.key);
                            else n.add(e.key);
                            return n;
                          })
                        }
                      />
                    ))}
                  </div>
                )}
              </SectionCard>
            )}
          </>
        }
        toolbar={
          <div className="flex items-center gap-1 p-1 bg-base-100 rounded" role="tablist">
            {(["queues", "calendar"] as ViewKey[]).map((v) => (
              <button
                key={v}
                role="tab"
                aria-selected={view === v}
                onClick={() => setView(v)}
                className={`px-3 py-1.5 text-[12px] rounded whitespace-nowrap ${
                  view === v
                    ? "bg-white text-base-900 font-semibold shadow-sm"
                    : "text-base-600 font-medium hover:text-base-900"
                }`}
              >
                {v === "queues" ? "Queues" : "Calendar"}
              </button>
            ))}
          </div>
        }
        toolbarRight={
          <span className="text-[12px] text-base-500 tabular-nums">
            {filtered.length} to do
            {lateCount > 0 && <span className="text-danger font-semibold"> · {lateCount} late</span>}
          </span>
        }
      >
        {/* The 3-pane body: list ~420 · detail fills the rest. The facet rail is
            the shell's own aside, so the three panes share one frame with
            Purchasing and Orders (module discipline — the one part of the old
            proposal that survives intact). */}
        <div className="flex-1 min-h-0 flex gap-4">
          <div className="w-[420px] shrink-0 flex flex-col min-h-0 bg-white border border-base-200 rounded-[12px] overflow-hidden">
            {view === "queues" ? (
              <QueueList
                rows={filtered}
                selectedId={selectedId}
                onSelect={setSelectedId}
                loading={ordersQ.isLoading}
              />
            ) : (
              <CalendarPane
                orders={orders}
                partnerNameById={partnerNameById}
                rulesByPartner={rulesByPartner}
                range={range}
                onRange={setRange}
                today={today}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
            )}
          </div>
          <div className="flex-1 min-w-0 flex flex-col min-h-0 bg-white border border-base-200 rounded-[12px] overflow-y-auto">
            {selected ? (
              <DeliveryDetail
                row={selected}
                rulesByPartner={rulesByPartner}
                today={today}
                holidays={holidayOpts.holidays}
                onOpenOrder={() => setDrawerId(selected.order.id)}
              />
            ) : (
              <div className="flex-1 grid place-items-center p-8 text-center">
                <div className="max-w-[280px]">
                  <Truck size={18} className="mx-auto mb-2 text-base-300" aria-hidden />
                  <div className="text-[13px] text-base-600">
                    Pick a row on the left to see the delivery, who is carrying it, and
                    what is still missing.
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </ListPageShell>

      {drawerId && (
        <OrderDetailDrawer orderId={drawerId} onClose={() => setDrawerId(null)} />
      )}
    </>
  );
}

/* ─── Facet row ───────────────────────────────────────────────────────────── */

function FacetRow({
  label,
  value,
  active,
  tone,
  title,
  onClick,
}: {
  label: string;
  value: string;
  active: boolean;
  tone?: "danger";
  title?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={`w-full flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-left transition-colors ${
        active ? "is-selected" : "hover:bg-hovertint"
      }`}
    >
      <span
        className={`flex-1 min-w-0 truncate text-[13px] ${
          active ? "font-bold text-base-900" : "text-base-700"
        }`}
      >
        {label}
      </span>
      <span
        className={`text-[13px] tabular-nums shrink-0 ${
          tone === "danger" ? "text-danger font-semibold" : "text-base-500"
        }`}
      >
        {value}
      </span>
    </button>
  );
}

/* ─── Queue list pane ─────────────────────────────────────────────────────── */

/** Every action pill on this page is the ladder's own tone, mapped to the same
 *  status pill the Orders list MANAGE column uses (UI-KIT §A0 action law) — one
 *  colour language across the two pages. */
const PILL_CLASS: Record<DeliveryRow["tone"], string> = {
  danger: "pill-overdue",
  warning: "pill-warning",
  info: "pill-warning",
  success: "pill-confirmed",
  neutral: "pill-neutral",
};

function QueueList({
  rows,
  selectedId,
  onSelect,
  loading,
}: {
  rows: DeliveryRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  loading: boolean;
}) {
  if (loading && rows.length === 0) {
    return (
      <div className="p-1.5" data-testid="delivery-list-skeleton">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-16 mb-1 rounded animate-pulse bg-base-50" />
        ))}
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="flex-1 grid place-items-center p-8 text-center">
        {/* An empty state that teaches (COPY-STANDARD rule 5): it says what the
            list means, not "no results". */}
        <div className="max-w-[300px] text-[13px] text-base-600">
          Nothing to do here. An order joins this board the moment its goods are in
          and a delivery step is the next thing someone must do.
        </div>
      </div>
    );
  }
  return (
    <div className="flex-1 overflow-y-auto" data-testid="delivery-list">
      {rows.map((r) => (
        <QueueRow
          key={r.order.id}
          row={r}
          selected={r.order.id === selectedId}
          onSelect={() => onSelect(r.order.id)}
        />
      ))}
    </div>
  );
}

function QueueRow({
  row,
  selected,
  onSelect,
}: {
  row: DeliveryRow;
  selected: boolean;
  onSelect: () => void;
}) {
  const due = deliveryDueState(row);
  const o = row.order;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      data-testid="delivery-row"
      className={`w-full text-left px-3 py-2.5 border-b border-base-100 transition-colors ${
        selected ? "is-selected" : "hover:bg-hovertint"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="font-mono text-[13px] font-semibold text-base-900">SO-{o.so}</span>
        <span
          className={`ml-auto pill ${PILL_CLASS[row.tone]} shrink-0 max-w-[60%] truncate`}
          title={row.line}
        >
          {row.locked && <span aria-hidden>🔒 </span>}
          {row.line}
        </span>
      </div>
      <div className={`mt-0.5 text-[13px] text-base-700 truncate ${cjkClassName(o.customer_name)}`}>
        {o.customer_name || "—"}
      </div>
      <div className="mt-0.5 flex items-center gap-1.5 text-[12px] text-base-500">
        <span className="truncate">{row.logisticsName?.trim() || NO_LOGISTICS_LABEL}</span>
        {row.bookingIso && (
          <>
            <span aria-hidden>·</span>
            <span className="tabular-nums shrink-0">{fmtDate(row.bookingIso)}</span>
          </>
        )}
        {/* The step's OWN deadline (T7). A step with no anchor says nothing —
            a TBD customer date has nothing to measure from, and a dash there
            would read as a missing value rather than an honest silence. */}
        {due !== "none" && row.dueIso && (
          <span
            className={`ml-auto shrink-0 tabular-nums ${
              due === "late" ? "text-danger font-semibold" : "text-base-400"
            }`}
          >
            {due === "late" ? `Late — was due ${fmtDate(row.dueIso)}` : `Due ${fmtDate(row.dueIso)}`}
          </span>
        )}
      </div>
    </button>
  );
}

/* ─── Calendar pane ───────────────────────────────────────────────────────── */

interface DayDelivery extends DayBooking {
  orderId: string;
  so: number;
  customer: string;
  slot: string | null;
  address: string | null;
}

/**
 * The calendar view — the same rule, the same shape and the same words as the
 * right-rail Calendar's Deliveries lens (T10). A day is filled by the BOOKING,
 * never by the date we promised; the promise is kept on screen as what it is,
 * with the call that fixes it, and is never counted as a delivery.
 */
function CalendarPane({
  orders,
  partnerNameById,
  rulesByPartner,
  range,
  onRange,
  today,
  selectedId,
  onSelect,
}: {
  orders: operationOrderListRow[];
  partnerNameById: Map<string, string>;
  rulesByPartner: Map<string, PartnerDeliveryRules>;
  range: DeliveryRangeKey;
  onRange: (k: DeliveryRangeKey) => void;
  today: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const partnerOf = (o: operationOrderListRow) => {
    const id = o.delivery_partner_id ?? o.ops_assigned_logistic ?? null;
    return {
      id,
      name: o.delivery_partners?.name ?? (id ? partnerNameById.get(id) ?? null : null),
    };
  };

  const byDay = useMemo(() => {
    const m = new Map<string, DayDelivery[]>();
    for (const o of orders) {
      const booking = orderBookingDay(o);
      if (booking.kind === "none" || !booking.date) continue;
      const p = partnerOf(o);
      const arr = m.get(booking.date) ?? [];
      arr.push({
        orderId: o.id,
        so: o.so,
        customer: o.customer_name,
        partnerId: p.id,
        partnerName: p.name,
        kind: booking.kind,
        date: booking.date,
        slot: booking.slot,
        address: o.customer_address ?? null,
      });
      m.set(booking.date, arr);
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, partnerNameById]);

  const promisedByDay = useMemo(() => {
    const m = new Map<string, operationOrderListRow[]>();
    for (const o of orders) {
      if (o.delivery_date_tbd || !o.delivery_date) continue;
      if (o.status === "delivered") continue; // a kept promise is not work
      if (orderBookingDay(o).kind !== "none") continue;
      const key = o.delivery_date.slice(0, 10);
      const arr = m.get(key) ?? [];
      arr.push(o);
      m.set(key, arr);
    }
    return m;
  }, [orders]);

  const active = deliveryRange(range, today);
  const days = daysInRange(active.fromIso, active.toIso);
  const dayEmpty = (d: string) =>
    (byDay.get(d)?.length ?? 0) === 0 && (promisedByDay.get(d)?.length ?? 0) === 0;
  const anything = days.some((d) => !dayEmpty(d));

  return (
    <div className="flex flex-col min-h-0" data-testid="delivery-calendar">
      <div className="flex gap-1 p-2 border-b border-base-100">
        {DELIVERY_RANGE_KEYS.map((key) => {
          const r = deliveryRange(key, today);
          const n = daysInRange(r.fromIso, r.toIso).reduce(
            (s, d) => s + (byDay.get(d)?.length ?? 0),
            0,
          );
          return (
            <button
              key={key}
              type="button"
              onClick={() => onRange(key)}
              className={`flex-1 flex items-center justify-center gap-1 rounded-lg px-2 py-1 text-[12px] font-semibold transition-colors ${
                range === key
                  ? "bg-base-900 text-white"
                  : "bg-white text-base-500 border border-base-200 hover:bg-hovertint"
              }`}
            >
              <span>{r.label}</span>
              {n > 0 && <span className="tabular-nums">{n}</span>}
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-4">
        {days.length > 1 && !anything && (
          <div className="text-[13px] text-base-500 text-center py-6">
            No deliveries booked these days.
          </div>
        )}
        {days.map((day) => {
          const deliveries = byDay.get(day) ?? [];
          const promised = promisedByDay.get(day) ?? [];
          // On a multi-day range an empty day is noise; on ONE day it is the
          // answer, and must still be said out loud.
          if (days.length > 1 && dayEmpty(day)) return null;
          const word = dayWord(day, today);
          const loads = carrierDayLoads(deliveries, day, rulesByPartner);
          return (
            <div key={day} data-testid={`delivery-day-${day}`}>
              <div className="t-micro text-base-500 mb-2">
                {word ? `${word} · ${fmtDate(day)}` : fmtDate(day)}
              </div>
              {deliveries.length === 0 ? (
                <div className="text-[12px] text-base-400 text-center py-3">
                  No deliveries booked this day.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {deliveries.map((d) => (
                    <button
                      key={d.orderId}
                      type="button"
                      onClick={() => onSelect(d.orderId)}
                      className={`w-full text-left flex gap-2 rounded px-2 py-1.5 transition-colors ${
                        d.orderId === selectedId ? "is-selected" : "bg-base-50 hover:bg-hovertint"
                      }`}
                    >
                      <span
                        className={`w-1 rounded-full shrink-0 ${
                          d.kind === "confirmed" ? "bg-success" : "bg-warning"
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-[12px] font-semibold text-base-900">
                            SO-{d.so}
                          </span>
                          <span
                            className={`text-[11px] font-semibold shrink-0 ${
                              d.kind === "confirmed" ? "text-success" : "text-warning"
                            }`}
                          >
                            {d.kind === "confirmed"
                              ? d.slot
                                ? shortSlot(d.slot)
                                : "Confirmed"
                              : "Logistics' date"}
                          </span>
                        </div>
                        <div
                          className={`text-[12px] text-base-700 truncate ${cjkClassName(d.customer)}`}
                        >
                          {d.customer || "—"}
                        </div>
                        <div className="text-[11px] text-base-500 truncate">
                          {d.partnerName?.trim() || NO_LOGISTICS_LABEL}
                          {locationForAddress(d.address).label
                            ? ` · ${locationForAddress(d.address).label}`
                            : ""}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {loads.map((l) => {
                const note = carrierDayNote(l);
                return (
                  <div key={l.partnerId ?? "none"} className="px-2 pt-1.5">
                    <div
                      className={`flex items-center justify-between gap-2 text-[11px] ${
                        !l.runs || l.atLimit ? "text-warning font-semibold" : "text-base-500"
                      }`}
                    >
                      <span className="truncate">{l.partnerName}</span>
                      <span className="tabular-nums shrink-0">
                        {l.capacity != null
                          ? `${l.confirmed} of ${l.capacity}`
                          : `${l.confirmed + l.provisional}`}
                      </span>
                    </div>
                    {note && <div className="text-[11px] text-warning mt-0.5">{note}</div>}
                  </div>
                );
              })}
              {promised.length > 0 && (
                <div className="pt-2 space-y-1.5">
                  <div className="t-micro text-warning">Promised this day, no date yet</div>
                  {promised.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => onSelect(o.id)}
                      className={`w-full text-left flex gap-2 rounded px-2 py-1.5 transition-colors ${
                        o.id === selectedId ? "is-selected" : "bg-base-50 hover:bg-hovertint"
                      }`}
                    >
                      <span className="w-1 rounded-full bg-warning shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="font-mono text-[12px] font-semibold text-base-900">
                          SO-{o.so}
                        </div>
                        <div className="text-[11px] text-base-500 truncate">
                          Call {o.customer_name?.trim() || "the customer"} — book delivery date
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** "Afternoon (12pm–3pm)" → "12pm–3pm" — the drawer's short-slot read. */
function shortSlot(slot: string): string {
  return /\(([^)]+)\)/.exec(slot)?.[1] ?? slot;
}

/* ─── Detail pane ─────────────────────────────────────────────────────────── */

function DeliveryDetail({
  row,
  rulesByPartner,
  today,
  holidays,
  onOpenOrder,
}: {
  row: DeliveryRow;
  rulesByPartner: Map<string, PartnerDeliveryRules>;
  today: string;
  holidays?: ReadonlySet<string>;
  onOpenOrder: () => void;
}) {
  const o = row.order;
  const ovl = orderControlOf(o);
  const booking = bookingDayOf({
    stage: ovl?.booking_stage ?? null,
    confirmedDate: ovl?.confirmed_date ?? null,
    confirmedSlot: ovl?.confirmed_time_slot ?? null,
    provisionalDate: ovl?.logistic_eta ?? null,
  });
  const photos = ovl?.delivery_photos;
  // The SAME delivered fold the list and the drawer use (`stageOf`): the
  // collapsed `operation_stage`, else `status`. Reading `delivered_at` here
  // instead would let this spine tick a step the drawer's spine does not.
  const delivered = stageOf(o) === "delivered";
  const rules = row.logisticsId ? rulesByPartner.get(row.logisticsId) : undefined;
  const allGroups = orderDeliveryGroups(o.order_lines ?? []);
  // T8: `booking_groups` NULL = the trip carries the whole order (zero backfill
  // by design), so an absent value is never read as "nothing is going".
  const scope = ((ovl?.booking_groups ?? null) as DeliveryGroupKey[] | null) ?? allGroups;
  const secondTrip = deliveryScopeSentence(scope, allGroups);
  const warnings =
    booking.date && row.logisticsName && rules
      ? partnerBookingWarnings({
          partnerName: row.logisticsName,
          rules,
          dateIso: booking.date,
          todayIso: today,
          holidays,
        })
      : [];
  const due = deliveryDueState(row);

  return (
    <div className="flex flex-col" data-testid="delivery-detail">
      <div className="flex items-start gap-3 px-4 py-3 border-b border-base-100">
        <div className="min-w-0">
          <div className="font-mono text-[15px] font-semibold text-base-900">SO-{o.so}</div>
          <div className={`text-[13px] text-base-700 truncate ${cjkClassName(o.customer_name)}`}>
            {o.customer_name || "—"}
          </div>
          {o.customer_address && (
            <div className="text-[12px] text-base-500 mt-0.5">{o.customer_address}</div>
          )}
        </div>
        <button
          type="button"
          onClick={onOpenOrder}
          className="ml-auto shrink-0 btn-secondary text-[12px] py-1.5 px-3"
          title="Open the order to book the date, record a reason or upload the delivery photo"
        >
          Open order
        </button>
      </div>

      {/* What to do next — the SAME action line and tone the row and the Orders
          list show, with the step's own deadline underneath. */}
      <div className="px-4 py-3 border-b border-base-100">
        <div className="flex items-center gap-2">
          <span className={`pill ${PILL_CLASS[row.tone]}`}>
            {row.locked && <span aria-hidden>🔒 </span>}
            {row.line}
          </span>
          {due !== "none" && row.dueIso && (
            <span
              className={`text-[12px] tabular-nums ${
                due === "late" ? "text-danger font-semibold" : "text-base-500"
              }`}
            >
              {due === "late"
                ? `Late — was due ${fmtDate(row.dueIso)}`
                : `Due ${fmtDate(row.dueIso)}`}
            </span>
          )}
        </div>
      </div>

      {/* The booking, as a FACT (T1's vocabulary): confirmed is the only green. */}
      <div className="px-4 py-3 border-b border-base-100">
        <div className="t-micro text-base-500 mb-1.5">Delivery date</div>
        {booking.kind === "confirmed" && booking.date ? (
          <div className="text-[13px] text-success font-semibold">
            {row.logisticsName?.trim() || NO_LOGISTICS_LABEL} · confirmed {fmtDate(booking.date)}
            {booking.slot ? ` · ${shortSlot(booking.slot)}` : ""}
          </div>
        ) : booking.kind === "provisional" && booking.date ? (
          <div className="text-[13px] text-warning font-semibold">
            {row.logisticsName?.trim() || NO_LOGISTICS_LABEL} · logistics&rsquo; date{" "}
            {fmtDate(booking.date)}
          </div>
        ) : (
          <div className="text-[13px] text-base-600">
            {row.logisticsName?.trim() || NO_LOGISTICS_LABEL}
          </div>
        )}
        {row.promisedIso && (
          <div className="text-[12px] text-base-500 mt-1 tabular-nums">
            Promised to the customer: {fmtDate(row.promisedIso)}
          </div>
        )}
      </div>

      {/* T5's spine, unchanged — the same component the drawer renders, fed the
          same signals, so a tick here can never disagree with a tick there. */}
      <div className="px-1">
        <BookingSpine
          partnerAssigned={!!row.logisticsName}
          customerConfirmed={booking.kind === "confirmed"}
          doIssued={!!o.do_number}
          delivered={delivered}
          photoUploaded={Array.isArray(photos) && photos.length > 0}
        />
      </div>

      {/* T8 — what this trip carries, and what is still owed. */}
      {allGroups.length > 0 && (
        <div className="px-4 py-3 border-t border-base-100">
          <div className="t-micro text-base-500 mb-1.5">This trip</div>
          <div className="text-[13px] text-base-800">
            {scope.map(deliveryGroupLabel).join(" + ") || "—"}
          </div>
          {secondTrip && (
            <div className="text-[12px] text-warning mt-1">Second trip — {secondTrip}</div>
          )}
        </div>
      )}

      {/* T9 — the logistics company's own rules, and anything the booked date
          crosses. These WARN and never block (T9's law): the Confirm button
          never reads them, and this page never writes. */}
      <div className="px-4 py-3 border-t border-base-100">
        <div className="t-micro text-base-500 mb-1.5">Delivery rules</div>
        {!row.logisticsName ? (
          <div className="text-[12px] text-base-500">
            No logistics picked — the rules appear once a company is chosen.
          </div>
        ) : !rules || isBareRules(rules) ? (
          <div className="text-[12px] text-base-500">
            No delivery rules recorded for {row.logisticsName}.
          </div>
        ) : (
          <div className="text-[12px] text-base-700 space-y-0.5">
            {rules.bookingLeadDays > 0 && (
              <div>
                {rules.bookingLeadDays} working day{rules.bookingLeadDays === 1 ? "" : "s"} notice
              </div>
            )}
            {rules.dailyCapacity != null && <div>{rules.dailyCapacity} deliveries a day</div>}
            {rules.blackoutDates.length > 0 && (
              <div>Not running on {rules.blackoutDates.map((d) => fmtDate(d)).join(" · ")}</div>
            )}
          </div>
        )}
        {warnings.map((w) => (
          <div key={w.key} className="text-[12px] text-warning mt-1.5">
            {w.message}
          </div>
        ))}
      </div>

      {/* T6 — the delivery photo ledger. `undefined` is UNKNOWN, not "none"
          (an older Worker that does not select the column): it stays silent
          rather than demanding proof it cannot substantiate. */}
      <div className="px-4 py-3 border-t border-base-100">
        <div className="t-micro text-base-500 mb-1.5">Delivery photo</div>
        {!Array.isArray(photos) ? (
          <div className="text-[12px] text-base-500">Open the order to see the delivery photo.</div>
        ) : photos.length > 0 ? (
          <div className="text-[12px] text-base-700 tabular-nums">
            {photos.length} delivery photo{photos.length === 1 ? "" : "s"} on file
          </div>
        ) : delivered ? (
          <div className="text-[12px] text-warning">
            No delivery photo yet — open the order to upload it.
          </div>
        ) : (
          <div className="text-[12px] text-base-500">Uploaded after the delivery.</div>
        )}
      </div>
    </div>
  );
}

/** A logistics company nobody has configured: the house default, which by T9's
 *  law produces no warnings and has nothing worth printing as a rule. */
function isBareRules(r: PartnerDeliveryRules): boolean {
  return r.bookingLeadDays === 0 && r.dailyCapacity == null && r.blackoutDates.length === 0;
}
