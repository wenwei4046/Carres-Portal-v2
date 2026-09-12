/**
 * DELIVERY MONITOR — the work list that leads, and the confirmed-delivery
 * calendar beside it.
 * Owner ruling 2026-09-10 · `docs/delivery/MASTER.md` §8.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ TWO NAMED VIEWS OVER ONE CANONICAL READ
 *
 * ```
 * Work to do (DEFAULT)   the standard selectable DataGrid over one WORK TO DO
 *                        queue — SO No · Customer · State · Requested Delivery
 *                        Date · Items · Accessories & services · Expected
 *                        arrival · Stock · Actions · Edit Delivery
 * Confirmed deliveries   Day · Week · Month — only rows a customer has agreed
 *                        a day for; NO checkboxes, no writes
 * ```
 *
 * ⭐ THE VIEW IS A NAMED TAB, NEVER A SIDE EFFECT OF A FILTER (owner ruling
 * 2026-09-10, retiring the projection rule). The old rule replaced the calendar
 * with a sheet the moment anyone picked `Selangor`, and the way back was to
 * notice `Clear filters`. Now a STATE / LOGISTICS PARTNER / DELIVERY STATUS
 * pick NARROWS whichever view is open, a WORK TO DO queue belongs to the work
 * list, and `Day · Week · Month` belongs to the calendar.
 *
 * `Week` is the calendar's desktop default (six Mon–Sat columns fitting the
 * width — no horizontal date scrolling), a tablet's Week is the fixed
 * three-day half-week, a phone is only ever the `Day` list. A rail date or a
 * Month-view date opens that date's `Day` and KEEPS the active narrowings.
 *
 * ⭐ THE CONTACT WEEK. Under `Call customer` — the T−3 contact queue — a
 * Monday-to-Saturday strip counts the calls DUE on each operating day, with an
 * always-visible `Overdue` chip so late work cannot hide behind a quiet
 * Thursday. These dates are contact deadlines and the strip says so.
 *
 * ⭐ BULK LOGISTICS ASSIGNMENT LIVES HERE (owner correction 2026-09-06).
 * The planning population includes deliveries that have no formal DO yet,
 * so the journey `No logistics picked → select rows → Assign logistics` runs
 * on Monitor's work list, through the ONE governed door
 * (`AssignLogisticsDialog` → `/delivery-arrangements/assign`). Replacing an
 * existing partner is the governed `Change logistics` act (reason + history)
 * and is offered for ONE row at a time — never as an uncontrolled batch.
 *
 * ⭐ THE RAIL IS THE SHARED FilterRail GRAMMAR (240px, page-owned, never the
 * Portal sidebar), with TWO COMPLETE MONTHS fixed at its top — this month
 * above the next: ONE arrow pair moves both, the selected date wears the
 * governed blue, today stays distinguishable, Sundays are muted, work days
 * carry a dot, and the filter groups scroll independently BELOW it. WORK TO DO
 * is drawn on the work tab only; STATE · LOGISTICS PARTNER · DELIVERY STATUS
 * narrow both views.
 *
 * ── THE WINDOWS ─────────────────────────────────────────────────────────────
 * One `?date=` drives every window — the Day, the desktop's Mon–Sat operating
 * week, the tablet's three-day half-week, the Month, the phone's one-day list
 * (its full month opens through the kit's standard date control). Arrows
 * replace the whole displayed window; the calendar never scrolls sideways.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  PanelLeftOpen,
  Phone,
} from "lucide-react";
import type { DeliveryWorkStatusKind, OrderActionTone } from "@carres/shared";
import {
  ARRIVAL_COPY,
  arrivalNoteOf,
  arrivalSentenceOf,
  deliveryQueueLeads,
  isArrivalException,
  myHolidaySet,
} from "@carres/shared";
import { fmtDate, fmtMonth, appTodayIso } from "@/lib/fmt-date";
import Select from "@/components/kit/Select";
import StatusPill from "@/components/kit/StatusPill";
import {
  useCatalog,
  useDeliveryOrdersRegister,
  useDeliveryPartners,
  useDeliveryArrangements,
  useOperationOrders,
  usePurchasingSettings,
  useSalesOrderExpansion,
  type DeliveryArrangementRow,
} from "@/lib/queries";
import {
  DataGrid,
  type DataGridColumn,
  type DataGridContextMenuItem,
} from "@/components/register/DataGrid";
import ModuleHeader from "./components/ModuleHeader";
import GoodsMiniTable, { goodsCategoryOf, type GoodsMiniLine } from "./components/GoodsMiniTable";
import { FilterRail, FilterRailGroup, FilterRailRow } from "./components/workspace-rail";
import AssignLogisticsDialog from "./components/AssignLogisticsDialog";
import { lineName } from "./sales-order-facts";
import { requestedDeliveryText } from "./sales-order-columns";
import { DATE_TO_BE_CONFIRMED_FULL } from "./sales-order-guidance";
import { DW, type DeliveryScopeRow } from "./delivery-work";
import Segmented from "@/components/Segmented";
import {
  DEFAULT_CALENDAR_VIEW,
  DEFAULT_WORK_VIEW,
  MONITOR_CALENDAR_VIEWS,
  MONITOR_CALENDAR_VIEW_LABEL,
  MONITOR_COLUMN,
  MONITOR_COPY,
  MONITOR_DAYS,
  MONITOR_STATUS_FILTERS,
  MONITOR_STATUS_LABEL,
  MONITOR_TOP_TABS,
  MONITOR_TOP_TAB_LABEL,
  MONITOR_VIEW_LABEL,
  MONITOR_WORK_VIEWS,
  activeFilterLabels,
  buildDeliveryMonitorCards,
  buildMonitorRails,
  contactWeekOf,
  deliveriesFooter,
  emptyRangeSentence,
  filterMonitorCalendarCards,
  filterMonitorListRows,
  groupCardsByDay,
  matchesMonitorSearch,
  missingProofLabels,
  monitorCardHref,
  monitorRowAction,
  monitorRowActionText,
  monthDayCounts,
  monthDaysOf,
  monthStepStart,
  needConfirmedDateSentence,
  nextOperatingWindowStart,
  operatingDaysFrom,
  operatingWeekOf,
  previousOperatingWindowStart,
  selectedSentence,
  tabletWindowOf,
  type DeliveryMonitorCard,
  type DeliveryMonitorFilters,
  type MonitorCalendarView,
  type MonitorDeliveryStatus,
  type MonitorTopTab,
  type MonitorWorkView,
} from "./delivery-monitor";
import MonitorMonthCalendar from "./components/MonitorMonthCalendar";
import MonitorMonthView from "./components/MonitorMonthView";
import DatePicker from "@/components/kit/DatePicker";

/** The two governed action words on this workspace (COPY-STANDARD). */
const ASSIGN_LOGISTICS = "Assign logistics";
const CHANGE_LOGISTICS = "Change logistics";
const EDIT_DELIVERY = "Edit Delivery";

/** The rail-collapse memory (LOCAL FILTER RAIL COLLAPSE law). */
const FILTER_RAIL_STORAGE_KEY = "carres.deliveryMonitor.filterRail";
/** Below this the local rail starts collapsed — the register's own number, so
 *  the two Delivery pages do not disagree about what "narrow" means. */
const NARROW_VIEWPORT_PX = 1100;
/* v4 — the 2026-09-10 ruling changed the DEFAULT column order again (`Items` ·
   `Accessories & services` · `Expected arrival` · `Stock` · `Actions` · `Edit
   Delivery`) and moved six columns into the chooser. A persisted `order` array
   outranks the default, so a key that kept its name would have shown the old
   sheet to every operator who had ever opened this page. */
const WORK_LIST_STORAGE_KEY = "carres.deliveryMonitor.workList.v4";

/**
 * The OPERATIONAL ladder's tones (owner ruling 2026-08-24): waiting is the
 * normal state of most rows, so only a recorded exception spends the
 * attention colour.
 */
const STATUS_TONE: Record<DeliveryWorkStatusKind, OrderActionTone> = {
  waiting_customer_date: "neutral",
  confirmed: "info",
  waiting_warehouse: "neutral",
  ready_for_handover: "info",
  out_for_delivery: "info",
  delivered: "success",
  failed: "warning",
};

/**
 * THE THREE FIXED WINDOWS (owner correction 2026-09-06). The calendar never
 * scrolls horizontally; the viewport picks a FINITE window instead:
 *
 *   phone   < 768px   one operating day (list), full month via the kit's
 *                     standard date control
 *   tablet  < 1280px  a fixed three-day half of the operating week
 *   desktop ≥ 1280px  the fixed six-day operating week, fitting its width
 */
const PHONE_BREAKPOINT = 768;
const TABLET_BREAKPOINT = 1280;

type ViewportMode = "phone" | "tablet" | "desktop";

function useViewportMode(): ViewportMode {
  const phoneQuery = `(max-width: ${PHONE_BREAKPOINT - 1}px)`;
  const tabletQuery = `(max-width: ${TABLET_BREAKPOINT - 1}px)`;
  const read = (): ViewportMode => {
    if (typeof window === "undefined") return "desktop";
    if (window.matchMedia(phoneQuery).matches) return "phone";
    if (window.matchMedia(tabletQuery).matches) return "tablet";
    return "desktop";
  };
  const [mode, setMode] = useState<ViewportMode>(read);
  useEffect(() => {
    const phone = window.matchMedia(phoneQuery);
    const tablet = window.matchMedia(tabletQuery);
    const onChange = () => setMode(read());
    phone.addEventListener("change", onChange);
    tablet.addEventListener("change", onChange);
    return () => {
      phone.removeEventListener("change", onChange);
      tablet.removeEventListener("change", onChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phoneQuery, tabletQuery]);
  return mode;
}

/** This workspace's row, through the portal's ONE `Requested Delivery Date`
 *  spelling — Sales Orders owns the date, and every reader prints it the
 *  same way. */
function requestedText(r: DeliveryMonitorCard): string {
  return requestedDeliveryText({
    iso: r.scope.customerDeliveryIso,
    tbd: r.scope.customerDateTbd,
  });
}

/** ⭐ AN ABSENCE IS QUIETER THAN A FACT — owner ruling 2026-08-15. */
function Absent({ children }: { children: string }) {
  return (
    <span className="text-kit-slate-9" data-absence="true">
      {children}
    </span>
  );
}

/* ── THE GOODS, THE ARRIVAL AND THE DEADLINE — the row's four new cells ───── */

/** One goods cell as ONE string — what the search, the filter and the Excel
 *  export read, so the sheet and the screen never say two different things. */
function goodsLinesText(lines: readonly { name: string; qty: number; shortQty: number }[]): string {
  return lines
    .map(
      (l) =>
        `${l.name} × ${l.qty}${l.shortQty > 0 ? ` — ${ARRIVAL_COPY.short(l.shortQty)}` : ""}`,
    )
    .join(" · ");
}

/** The `Stock` cell's ONE word. */
function stockText(r: DeliveryMonitorCard): string {
  return r.readiness.ready ? ARRIVAL_COPY.stockReady : ARRIVAL_COPY.stockNotReady;
}

/** The arrival's own date, for sorting — an arrival with no date sorts LAST,
 *  ranked explicitly rather than by a sentinel the collator may not honour. */
function arrivalDateIso(r: DeliveryMonitorCard): string | null {
  return "dateIso" in r.arrival ? r.arrival.dateIso : null;
}

/** The arrival cell as ONE string, for the search, the filter and the sheet —
 *  the SAME sentence the tooltip and the screen reader get, so an Excel reader
 *  and an operator are never told two different things. */
function arrivalText(r: DeliveryMonitorCard): string {
  return arrivalSentenceOf(r.arrival, fmtDate);
}

/**
 * ⭐ THE DATE IS THE INFORMATION (owner ruling 2026-09-10).
 *
 * The date prints first and large; the note under it says WHOSE date it is.
 * When a supplier has MOVED the date, the original prints beside the new one —
 * a delay icon with no new date tells the operator that something is wrong and
 * nothing about when the goods now come.
 *
 * COLOUR IS RESTRAINED AND LOCAL. Amber marks exactly two supplier exceptions
 * (`Supplier delivery date passed` and an open purchase order with no date at
 * all); red is reserved for overdue LOGISTICS work and never appears here. A
 * supplier who answers EARLY is doing the right thing and is not painted.
 *
 * Every icon carries a real label AND a title, so the fact survives a screen
 * reader and a hover alike — colour is never the only communication.
 */
function ArrivalCell({ card }: { card: DeliveryMonitorCard }) {
  const state = card.arrival;
  /* The WHOLE meaning, in one sentence — the tooltip and the accessible name
     read it, and it is the module's own (Law D), never assembled here. */
  const sentence = arrivalSentenceOf(state, fmtDate);
  const exception = isArrivalException(state);
  const iso = arrivalDateIso(card);
  const moved = state.kind === "moved" ? state : null;
  const original =
    moved?.originalIso ??
    (state.kind === "passed" || state.kind === "late_no_date" ? state.originalIso : null);
  /* ONE icon per meaning. `awaiting_reply` wears the question, not the warning:
     an unanswered enquiry is a normal Tuesday, and spending amber on it would
     teach the operator to ignore amber on the day it matters. */
  const Icon = exception
    ? AlertTriangle
    : state.kind === "confirmed"
      ? CheckCircle2
      : state.kind === "awaiting_reply"
        ? HelpCircle
        : moved
          ? CalendarClock
          : null;
  const tone = exception ? "text-kit-amber-11" : "text-kit-slate-11";
  return (
    /* ⭐ ONE accessible name for the whole cell, and the icons inside it are
       DECORATIVE. Giving the icon its own label repeated the sentence a screen
       reader had already read from the text beside it. */
    <span
      className="block min-w-0"
      data-testid={`delivery-monitor-arrival-${state.kind}`}
      role="group"
      aria-label={sentence}
      title={sentence}
    >
      <span className="flex min-w-0 items-center gap-1">
        {Icon ? <Icon size={13} strokeWidth={2} aria-hidden className={`shrink-0 ${tone}`} /> : null}
        {iso ? (
          /* ⭐ THE DATE IS THE CELL (owner ruling 2026-09-11). `Delayed`,
             `Same as PO` and `Not confirmed` under every row turned a column
             of dates into a column of four repeated phrases; the icon and the
             tooltip carry the meaning now. */
          <span className={`truncate ${exception ? "text-kit-amber-11" : "text-kit-slate-12"}`}>
            {fmtDate(iso)}
          </span>
        ) : (
          /* With NO date there is nothing to be compact about: the governed
             absence IS the content, and the three absences are three words. */
          <span className={`truncate ${exception ? "text-kit-amber-11" : "text-kit-slate-9"}`}>
            {arrivalNoteOf(state)}
          </span>
        )}
      </span>
      {original ? (
        /* The ORIGINAL stays as context — never deleted, never the headline. */
        <span className="block truncate text-label text-kit-slate-9">
          {fmtDate(original)}
        </span>
      ) : null}
    </span>
  );
}

/**
 * ⭐ THE CONTACT DEADLINE, ON THE ROW.
 *
 * `Call by {date}` while there is still time, the portal's own
 * `Late — was due {date}` once there is not — and the deadline NEVER MOVES,
 * because the missed day is the evidence. Red is spent here and only here: an
 * overdue customer conversation is the one thing on this row that is late.
 *
 * A row whose customer has named no day carries no deadline at all, and says
 * so: a step with no anchor can never be late (`delivery-queue.ts`).
 */
function ContactDeadline({ card }: { card: DeliveryMonitorCard }) {
  /* The deadline answers the CHASE and nothing else — a delivery with BOTH a
     day and a window agreed has no call left to be late for. A day without a
     window is not a booking, so its conversation is still open (owner ruling
     2026-09-11). */
  /* ⭐ AND A TRIP THAT HAS ALREADY RUN HAS NO CALL LEFT EITHER (owner
     correction 2026-09-11). A delivered row used to print `No contact
     deadline` under an upload action — a grey line about a conversation
     nobody owes, beside work somebody does. */
  if (card.booked || card.settled) return null;
  if (!card.contactDueIso) {
    return (
      <span className="block truncate text-label">
        <Absent>{MONITOR_COPY.noContactDeadline}</Absent>
      </span>
    );
  }
  const date = fmtDate(card.contactDueIso);
  /* ⭐ THE COMPACT CELL IS A PHONE AND A DATE (owner ruling 2026-09-11). The
     full sentence — including that the deadline is overdue and does NOT move —
     is the cell's accessible name and its tooltip; the icon is decorative, so
     a screen reader reads the sentence once, not twice. */
  const sentence = card.contactOverdue
    ? MONITOR_COPY.contactLateSentence(date)
    : MONITOR_COPY.contactDueSentence(date);
  return (
    <span
      className={`flex min-w-0 items-center gap-1 text-label ${
        card.contactOverdue ? "font-medium text-kit-red-11" : "text-kit-slate-11"
      }`}
      data-testid={card.contactOverdue ? "delivery-monitor-contact-late" : "delivery-monitor-contact-due"}
      aria-label={sentence}
      title={sentence}
    >
      <Phone size={12} strokeWidth={2} aria-hidden className="shrink-0" />
      <span className="truncate">{date}</span>
    </span>
  );
}

/**
 * ONE CARD, ONE LINK. No nested button, no competing click target: the card
 * IS the door, and where it opens is the module's one href arithmetic.
 * Calendar cards carry NO checkbox and take no batch selection. A card shows
 * ONLY (owner correction 2026-09-07): confirmed time · DO No or `No delivery
 * order yet` · Customer · City and State · Goods summary · Logistics Partner ·
 * Delivery Status. A recorded result stays `Delivered` — the missing evidence
 * is the `Upload delivery proof` queue's job, never a second status word.
 */
/**
 * ⭐ ONE SINGLE-PICK RAIL GROUP, AS THE KIT'S OWN DROPDOWN (owner ruling
 * 2026-09-12).
 *
 * The group title, the option words and every count are the rail rows' own —
 * only the CONTROL changed. STATE alone carried thirteen rows on production
 * and grows with the data; with the other two groups under it the rail held
 * 1152px of filters in a 421px box, so the thing an operator comes here to
 * DO — `WORK TO DO` — was below the fold.
 *
 * `All` clears ONLY this group's condition; a queue or another group's pick
 * survives it, which is why the count beside it is that group's own
 * cross-computed population and not the register's size.
 */
const RAIL_PICKER_ALL = "__all__";

function RailPicker({
  id,
  label,
  allLabel,
  total,
  value,
  options,
  onPick,
}: {
  id: string;
  label: string;
  allLabel: string;
  total: number;
  value: string | null;
  options: readonly { key: string; label: string; count: number }[];
  onPick: (next: string | null) => void;
}) {
  return (
    /* The kit Select carries no aria-label prop, so the NAME lives on the
       group around it — one accessible name, not a dropped one. */
    <div className="px-1 pb-1" role="group" aria-label={label} data-testid={id + "-select"}>
      <Select
        id={id}
        value={value ?? RAIL_PICKER_ALL}
        onValueChange={(next) => onPick(next === RAIL_PICKER_ALL ? null : next)}
        options={[
          { value: RAIL_PICKER_ALL, label: allLabel + " (" + total + ")" },
          ...options.map((o) => ({ value: o.key, label: o.label + " (" + o.count + ")" })),
        ]}
      />
    </div>
  );
}

function MonitorCard({ card }: { card: DeliveryMonitorCard }) {
  return (
    <Link
      to={monitorCardHref(card)}
      data-testid={`delivery-monitor-card-${card.scopeId}`}
      className="block min-h-11 rounded-control border border-kit-slate-5 bg-white shadow-sm hover:border-kit-slate-6 hover:bg-hovertint"
    >
      <div className="flex flex-col gap-0.5 px-2 py-1.5 text-body">
        {card.confirmedTime ? (
          <div className="font-medium text-kit-slate-12">{card.confirmedTime}</div>
        ) : (
          /* ⭐ A DAY WITH NO WINDOW IS VISIBLY INCOMPLETE, AND THE DAY IS KEPT
             (owner ruling 2026-09-12, correcting the 2026-09-11 card which
             replaced the day with the absence). The agreed day is a real
             recorded fact — losing it to say the time is missing trades one
             error for another — so the card states BOTH: the day it has, then
             the half it does not. */
          <>
            {card.confirmedDate ? (
              <div className="font-medium text-kit-slate-12">{fmtDate(card.confirmedDate)}</div>
            ) : null}
            <div className="text-kit-slate-9" data-absence="true">
              {MONITOR_COPY.noTimeAgreed}
            </div>
          </>
        )}
        {card.doNumber ? (
          <div className="font-mono font-medium text-blue-700">{card.doNumber}</div>
        ) : (
          /* The absence is a stage, not a missing click — the governed gate
             issues the document; this card only explains today's door. */
          <div className="text-kit-slate-9">{MONITOR_COPY.noDeliveryOrder}</div>
        )}
        <div className="truncate font-medium" title={card.customerName}>
          {card.customerName}
        </div>
        {card.locality ? (
          <div className="truncate text-kit-slate-11" title={card.locality}>
            {card.locality}
          </div>
        ) : null}
        <div className="truncate text-kit-slate-11" title={card.goodsSummary}>
          {card.goodsSummary}
        </div>
        {card.logisticsPartnerName ? (
          <div className="text-kit-slate-12">{card.logisticsPartnerName}</div>
        ) : null}
      </div>
      <div className="border-t border-kit-slate-4 px-2 py-1">
        {/* ⭐ A HALF-ANSWERED BOOKING DOES NOT WEAR A CONFIRMED PILL (owner
            ruling 2026-09-12). The ladder reaches `Delivery confirmed` on a
            recorded day alone, so a card missing its window used to claim the
            appointment was settled. While the window is open the footer
            carries the ACT instead — about the TIME, never asking again for a
            date the customer has already given. */}
        {card.booked || card.settled ? (
          <StatusPill tone={STATUS_TONE[card.statusKey]}>{card.statusLabel}</StatusPill>
        ) : (
          <span
            className="block truncate text-label text-kit-slate-12"
            data-testid={"delivery-monitor-card-act-" + card.scopeId}
          >
            {monitorRowAction(card).kind === "confirm_date"
              ? (monitorRowAction(card) as { call: string }).call
              : monitorRowActionText(card)}
          </span>
        )}
      </div>
    </Link>
  );
}

/**
 * ⭐ THE PHONE'S WORK LIST — a readable list, never the desktop sheet squeezed.
 *
 * A work queue on a phone answers the same question it answers on a desk, and
 * the operator standing in a warehouse chasing a carrier must see, WITHOUT
 * opening a Columns chooser: what the customer asked for, whether anyone has
 * agreed a day, who carries it, and the one thing to do next. Those four
 * facts are the card; everything else the sheet offers is a desk job.
 *
 * The words, the absences and the act are the SAME ones the DataGrid prints —
 * `monitorRowAction` and the governed absence strings — so the two viewports
 * can never tell an operator two different things.
 */
function MonitorWorkCard({
  card,
  onAssign,
  onEdit,
  onOpenOrder,
}: {
  card: DeliveryMonitorCard;
  onAssign: (card: DeliveryMonitorCard) => void;
  onEdit: (card: DeliveryMonitorCard) => void;
  onOpenOrder: (card: DeliveryMonitorCard) => void;
}) {
  const action = monitorRowAction(card);
  /* The SAME words the sheet prints — the phone never spells a date twice. */
  const requested = requestedText(card);
  const confirmed = card.confirmedDate ? fmtDate(card.confirmedDate) : DW.noConfirmedDate;
  const row = (label: string, value: string, muted: boolean) => (
    <div className="flex items-baseline justify-between gap-3">
      <span className="shrink-0 text-label text-kit-slate-11">{label}</span>
      <span
        className={`min-w-0 truncate text-body ${muted ? "text-kit-slate-9" : "text-kit-slate-12"}`}
        {...(muted ? { "data-absence": "true" } : {})}
      >
        {value}
      </span>
    </div>
  );
  return (
    <div
      className="rounded-control border border-kit-slate-5 bg-white shadow-sm"
      data-testid={`delivery-monitor-work-card-${card.scopeId}`}
    >
      <div className="flex flex-col gap-1 px-2.5 py-2">
        <div className="flex min-w-0 items-baseline gap-2">
          <button
            type="button"
            className="shrink-0 font-mono font-medium text-blue-700 underline-offset-2"
            onClick={() => onOpenOrder(card)}
          >
            SO-{card.scope.so}
          </button>
          <span className="min-w-0 truncate font-medium text-kit-slate-12">
            {card.customerName}
          </span>
        </div>
        {row(MONITOR_COLUMN.requestedDelivery, requested, !card.scope.customerDeliveryIso)}
        {row(MONITOR_COLUMN.confirmedDelivery, confirmed, card.confirmedDate === null)}
        {row(
          MONITOR_COLUMN.logisticsPartner,
          card.logisticsPartnerName ?? MONITOR_COPY.noLogistics,
          card.logisticsPartnerName === null,
        )}
      </div>
      <div className="flex flex-col gap-1 border-t border-kit-slate-4 px-2.5 py-2">
        {action.kind === "confirm_date" ? (
          <span className="text-body text-kit-slate-12">{action.call}</span>
        ) : action.kind === "upload_proof" ? (
          /* The EXACT missing evidence — the act, then the door below it. */
          <span className="text-body text-kit-slate-12">{action.label}</span>
        ) : null}
        {/* The contact deadline is one of the facts a chase needs, so it is on
            the card rather than behind a Columns chooser the phone has not
            got. Same words, same arithmetic as the sheet. */}
        <ContactDeadline card={card} />
        <button
          type="button"
          className="min-h-11 rounded-control border border-kit-slate-6 bg-white px-3 text-body font-medium text-kit-slate-12"
          data-testid={`delivery-monitor-action-${action.kind}-${card.scopeId}`}
          onClick={() =>
            action.kind === "assign_logistics" ? onAssign(card) : onEdit(card)
          }
        >
          {action.kind === "upload_proof" ? EDIT_DELIVERY : action.label}
        </button>
      </div>
    </div>
  );
}

/**
 * ▸ HAS EXACTLY ONE JOB (owner correction 2026-09-06): this scope's goods
 * lines, read-only — the shared `GoodsMiniTable`, nothing else. Its own
 * component because the Unit facts are their own query and a hook cannot be
 * called inside a render callback.
 */
function ScopeExpansion({ row }: { row: DeliveryScopeRow }) {
  const expansion = useSalesOrderExpansion(row.orderId);
  const lines = row.o.order_lines ?? [];
  const addons = row.o.order_addons ?? [];
  const factsByLine = new Map((expansion.data?.lines ?? []).map((l) => [l.lineId, l]));

  const miniLines: GoodsMiniLine[] = [
    ...lines.map((line, index): GoodsMiniLine => {
      const fact = factsByLine.get(line.id ?? "");
      return {
        key: line.id ?? `${line.sku}-${index}`,
        testId: `delivery-good-${line.sku}`,
        category: goodsCategoryOf(line),
        unitIds: fact?.unitIds ?? [],
        unitAbsence: "Not allocated",
        deliverTo: (fact?.deliverTo ?? []).map((d) =>
          (fact?.deliverTo.length ?? 0) > 1 ? `${d.name} ×${d.qty}` : d.name,
        ),
        deliverToAbsence: expansion.isLoading ? "Loading…" : DW.notRecorded,
        sku: line.sku,
        qty: line.qty,
        item: lineName(line),
        selectable: true,
      };
    }),
    /* A Service moves no goods and allocates no Unit — the dash is the shipped
       ruling for that cell, not an invented word. */
    ...addons.map((addon, index): GoodsMiniLine => ({
      key: `addon-${index}`,
      category: "Service",
      unitIds: [],
      unitAbsence: "—",
      deliverTo: [],
      deliverToAbsence: "—",
      sku: addon.addon_key ?? "",
      qty: addon.qty,
      item: addon.addon_key?.replace(/[_-]+/g, " ") ?? "Add-on",
      selectable: false,
    })),
  ];

  return (
    <div data-testid="delivery-scope-expansion">
      {miniLines.length === 0 ? (
        <div className="px-2 py-2 text-body text-kit-slate-11">{DW.noGoods}</div>
      ) : (
        <GoodsMiniTable label={`Goods on SO-${row.so}`} lines={miniLines} />
      )}
    </div>
  );
}

export default function OperationDelivery() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const ordersQ = useOperationOrders();
  const partnersQ = useDeliveryPartners();
  const docsQ = useDeliveryOrdersRegister();
  const arrangementsQ = useDeliveryArrangements();
  /* Two SHARED reads, neither of them new to the app: the contact deadline's
     own working-day lead (Purchasing → Settings) and the catalog that names an
     add-on. Both are cached app-wide, so opening Monitor costs nothing extra
     once another page has asked. */
  const settingsQ = usePurchasingSettings();
  const catalogQ = useCatalog();
  const today = appTodayIso();
  const viewport = useViewportMode();
  const isPhone = viewport === "phone";

  /* The rail-collapse memory — the browser remembers open/closed (ui MASTER,
     LOCAL FILTER RAIL COLLAPSE). On a phone the rail starts closed: the
     drawer opens on demand and never squeezes the one-day list. */
  const [filterRailOpen, setFilterRailOpen] = useState(() => {
    /* ⭐ NARROW SCREENS START WITH THE RAIL CLOSED (owner ruling 2026-09-12,
       the same 1100px rule the Delivery Orders register already runs). 240px
       of a 949px window is a quarter of the page spent on filters nobody has
       asked for, while the sheet is already scrolling sideways. The
       `Show filters` button and the active narrowing both stay visible, so
       collapsed is DEFERRED, never gone. A REMEMBERED choice still wins at
       any width: the operator who opened it meant it. */
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(FILTER_RAIL_STORAGE_KEY);
    } catch {
      /* Storage may be unavailable; the width rule still answers. */
    }
    if (stored === "0") return false;
    if (stored === "1") return true;
    return typeof window === "undefined" ? true : window.innerWidth >= NARROW_VIEWPORT_PX;
  });
  const setFilterRailVisible = (open: boolean) => {
    setFilterRailOpen(open);
    try {
      localStorage.setItem(FILTER_RAIL_STORAGE_KEY, open ? "1" : "0");
    } catch {
      /* Storage may be unavailable; the live state still works. */
    }
  };
  /* The phone drawer opens on demand only — it overlays the one-day list and
     never squeezes it, so the persistent desktop choice is not consulted. */
  const [phoneRailOverride, setPhoneRailOverride] = useState(false);
  const railVisible = isPhone ? phoneRailOverride : filterRailOpen;

  /* ── THE URL IS THE STATE ──────────────────────────────────────────────── */
  /* ONE selected date (`?date=`) drives every window: the phone's day, the
     tablet's three-day half-week, the desktop's fixed operating week — and
     the rail calendar's blue selection. The retired `?start=`/`?day=`
     spellings still resolve so an old shared URL keeps answering. A Sunday
     lands on the next operating day rather than an empty page nobody planned. */
  const selectedDate = operatingDaysFrom(
    searchParams.get("date") ?? searchParams.get("day") ?? searchParams.get("start") ?? today,
    1,
  )[0]!;

  /* ⭐ `?view=` STILL CARRIES THE WHOLE VIEW (owner ruling 2026-09-10) — one
     param, so refresh, share and Back restore exactly one state. It holds
     EITHER a calendar view (`day` · `week` · `month`), which opens the
     **Confirmed deliveries** tab, OR a WORK TO DO queue, which opens
     **Work to do**. Absent = the DEFAULT LANDING: Work to do, `All delivery
     work`.

     Every retired spelling still resolves, so a shared or bookmarked link
     keeps answering: `calendar` → the week · `delivered_proof_required` →
     `upload_proof` · `waiting_warehouse` (once a queue) → the DELIVERY STATUS
     filter · `?schedule=`/`?checking=` → their queue · `?start=`/`?day=` only
     ever named the calendar, so they open its week. `call_customer` is the
     contact queue's new spelling and `no_confirmed_date` is its old one; both
     open the same rows. */
  const viewParam =
    searchParams.get("view") ??
    searchParams.get("schedule") ??
    (searchParams.get("checking") === "failed"
      ? "failed"
      : searchParams.get("checking") === "delivered_proof_required"
        ? "upload_proof"
        : searchParams.get("checking") === "waiting_warehouse"
          ? "waiting_warehouse"
          : searchParams.has("start") || searchParams.has("day")
            ? "week"
            : null);
  const view: MonitorWorkView =
    viewParam === "all" ||
    viewParam === "no_logistics" ||
    viewParam === "no_confirmed_date" ||
    viewParam === "overdue" ||
    viewParam === "failed" ||
    viewParam === "upload_proof"
      ? viewParam
      : viewParam === "call_customer"
        ? "no_confirmed_date"
        : viewParam === "delivered_proof_required"
          ? "upload_proof"
          : DEFAULT_WORK_VIEW;
  const requestedCalendarView: MonitorCalendarView =
    viewParam === "day" || viewParam === "month"
      ? viewParam
      : DEFAULT_CALENDAR_VIEW;
  /* A phone is ONLY ever the Day list — the Week and Month grids are never
     squeezed into it, whatever the URL asks for. */
  const calendarView: MonitorCalendarView = isPhone ? "day" : requestedCalendarView;
  /* WHICH TAB IS OPEN is read off the same param: a calendar word opens the
     calendar, anything else (a queue, or nothing) opens the work list. */
  const topTab: MonitorTopTab =
    viewParam === "day" || viewParam === "week" || viewParam === "month" || viewParam === "calendar"
      ? "calendar"
      : "work";
  const calendarMode = topTab === "calendar";

  const q = searchParams.get("q") ?? "";
  const region = searchParams.get("region");
  const logistics = searchParams.get("logistics");
  const statusParam = searchParams.get("status") ?? (viewParam === "waiting_warehouse" ? "waiting_warehouse" : null);
  const status: MonitorDeliveryStatus | null =
    statusParam === "waiting_warehouse" ||
    statusParam === "ready_for_handover" ||
    statusParam === "out_for_delivery"
      ? statusParam
      : null;

  /* THE RESOLVED VIEW, as ONE word. A URL that arrived in a retired spelling
     (`?day=`, `?start=`, `?view=calendar`, `?schedule=`) is normalised to it on
     the first interaction, so an arrow press cannot drop the view along with
     the retired param it was riding on. */
  const resolvedViewWord = calendarMode ? calendarView : view;
  const setParams = useCallback(
    (mutate: (next: URLSearchParams) => void, replace = false) => {
      const next = new URLSearchParams(searchParams);
      /* The retired spellings never survive a new pick. */
      next.delete("schedule");
      next.delete("checking");
      mutate(next);
      /* THE URL IS THE STATE: after any interaction it names the open view in
         the current spelling, never by an absence a retired param was
         standing in for. */
      if (!next.has("view")) next.set("view", resolvedViewWord);
      setSearchParams(next, { replace });
    },
    [searchParams, setSearchParams, resolvedViewWord],
  );
  const setParam = (key: string, value: string | null, replace = false) =>
    setParams((next) => {
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
    }, replace);
  /* A queue pick always lands on the Work to do tab — picking the queue IS
     asking for the work list. Picking the SAME queue again returns to the
     default `All delivery work` rather than to nothing, so the tab never
     empties itself. The contact-week pick is spent with the queue. */
  const pickView = (value: MonitorWorkView) =>
    setParams((next) => {
      next.set("view", view === value ? DEFAULT_WORK_VIEW : value);
      next.delete("due");
      next.delete("late");
    });
  /* `toggleParam` is retired with the three rail-row groups (2026-09-12): a
     dropdown REPLACES, and picking the value you already hold is not a request
     to clear it — `All` is. The retired `?view=waiting_warehouse` guard moved
     into `setStatusParam` below, which is now the only writer of `status`. */
  const setStatusParam = (value: string | null) =>
    setParams((next) => {
      if (value === null) next.delete("status");
      else next.set("status", value);
      /* A retired `?view=waiting_warehouse` was this filter — it may not
         linger beside the real one. */
      if (viewParam === "waiting_warehouse") next.delete("view");
    });
  /* `Clear filters` clears the NARROWINGS, never the tab: an operator who
     clears a state pick is not asking to leave the view they are reading. */
  const clearFilters = () =>
    setParams((next) => {
      if (!calendarMode) next.set("view", DEFAULT_WORK_VIEW);
      next.delete("region");
      next.delete("logistics");
      next.delete("status");
      next.delete("due");
      next.delete("late");
    });
  /* Day / Week / Month belong to the Confirmed deliveries calendar and open
     it. `Week` is the default and is spelled `week` rather than by absence,
     because absence now means the Work to do landing. */
  const pickCalendarView = (value: MonitorCalendarView) =>
    setParams((next) => {
      next.set("view", value);
      next.delete("due");
      next.delete("late");
    });
  /* THE TWO TOP-LEVEL TABS. Each one restores its own last sensible state:
     the calendar its `Week`, the work list its `All delivery work`. */
  const pickTopTab = (tab: MonitorTopTab) =>
    setParams((next) => {
      next.set("view", tab === "calendar" ? DEFAULT_CALENDAR_VIEW : DEFAULT_WORK_VIEW);
      next.delete("due");
      next.delete("late");
    });
  /* The one date write from the window arrows — the calendar view stays. */
  const setDate = (iso: string) =>
    setParams((next) => {
      next.set("date", iso);
      next.delete("day");
      next.delete("start");
    });
  /* A rail-calendar or Month-view date click OPENS that date's Day view on the
     Confirmed deliveries tab. The STATE / LOGISTICS / STATUS narrowings SURVIVE
     it now: they apply to both views, and silently dropping them would answer a
     question the operator did not ask. */
  const pickCalendarDate = (iso: string) =>
    setParams((next) => {
      next.set("date", iso);
      next.delete("day");
      next.delete("start");
      next.set("view", "day");
      next.delete("due");
      next.delete("late");
    });
  /* ── THE CONTACT-WEEK PICK — the `Call customer` queue's own narrowing ─── */
  const contactDue = searchParams.get("due");
  const contactOverdueOnly = searchParams.get("late") === "1";
  const pickContactDue = (iso: string | null) =>
    setParams((next) => {
      next.delete("late");
      if (iso === null || contactDue === iso) next.delete("due");
      else next.set("due", iso);
    });
  const toggleContactOverdue = () =>
    setParams((next) => {
      next.delete("due");
      if (contactOverdueOnly) next.delete("late");
      else next.set("late", "1");
    });

  const filters: DeliveryMonitorFilters = useMemo(
    () => ({
      view,
      region,
      logisticsPartnerId: logistics,
      status,
      /* `?q=` narrows the CALENDAR only. The work list's one search is the
         grid's own box — an invisible second narrowing from a carried-over URL
         would make the listing look complete while it is not. */
      search: calendarMode ? q : "",
      contactDue,
      contactOverdueOnly,
      todayIso: today,
    }),
    [view, region, logistics, status, q, today, calendarMode, contactDue, contactOverdueOnly],
  );

  /* ── The cards — the workspace's own reads, mapped once ────────────────── */
  const partners = useMemo(() => partnersQ.data?.partners ?? [], [partnersQ.data]);
  const arrangementsByScope = useMemo(() => {
    const m = new Map<string, DeliveryArrangementRow>();
    for (const a of arrangementsQ.data?.arrangements ?? []) m.set(`${a.order_id}#${a.leg}`, a);
    return m;
  }, [arrangementsQ.data]);
  const partnerNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of partners) m.set(p.id, p.name);
    return m;
  }, [partners]);

  /* The `Confirm delivery date` lead in WORKING DAYS (Purchasing → Settings).
     Undefined until the setting lands, which leaves the step on the shared
     seed — never on a number this page invented. */
  const queueLeads = useMemo(
    () => (settingsQ.data ? deliveryQueueLeads(settingsQ.data) : undefined),
    [settingsQ.data],
  );
  const holidays = useMemo(() => myHolidaySet(), []);
  /* The addon's own catalog NAME — the list read carries the key, the catalog
     carries the word, and the operator may never see the key. */
  const addonNameByKey = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of catalogQ.data?.addons ?? []) {
      if (a.key && a.name) m.set(a.key, a.name);
    }
    return m;
  }, [catalogQ.data]);

  const cards = useMemo(
    () =>
      buildDeliveryMonitorCards({
        orders: ordersQ.data?.orders ?? [],
        deliveryOrders: docsQ.data?.deliveryOrders ?? [],
        attempts: docsQ.data?.attempts ?? [],
        handoverEvents: docsQ.data?.handoverEvents ?? [],
        partnerNameById,
        arrangements: arrangementsByScope,
        queueLeads,
        holidays,
        addonNameByKey,
        todayIso: today,
      }),
    [
      ordersQ.data,
      docsQ.data,
      partnerNameById,
      arrangementsByScope,
      queueLeads,
      holidays,
      addonNameByKey,
      today,
    ],
  );

  /* The FIXED window for this view and viewport — never a horizontal date
     scroll: the Day, the tablet's three-day half-week, the desktop's Mon–Sat
     operating week, or every day of the Month. */
  const visibleDays = useMemo(
    () =>
      calendarView === "day"
        ? [selectedDate]
        : calendarView === "month"
          ? monthDaysOf(selectedDate)
          : viewport === "tablet"
            ? tabletWindowOf(selectedDate)
            : operatingWeekOf(selectedDate),
    [calendarView, viewport, selectedDate],
  );
  /* The dot days for the rail's month calendar — every date genuinely
     holding a confirmed delivery, whatever month it sits in. */
  const workDayIsos = useMemo(
    () => [...new Set(cards.map((c) => c.confirmedDate).filter((d): d is string => d !== null))],
    [cards],
  );
  const rails = useMemo(
    () => buildMonitorRails(cards, filters, partners),
    [cards, filters, partners],
  );
  const calendarCards = useMemo(
    () => filterMonitorCalendarCards(cards, filters, visibleDays),
    [cards, filters, visibleDays],
  );
  /* Every AGREED appointment the current narrowings leave — the Confirmed
     deliveries tab's own badge. It is deliberately not window-scoped: a tab
     count that emptied when the operator paged to a quiet week would say the
     work had gone away. */
  const confirmedCount = useMemo(
    () =>
      cards.filter(
        (c) =>
          c.confirmedDate !== null &&
          (region === null || c.region === region) &&
          (logistics === null || c.logisticsPartnerId === logistics) &&
          (status === null || c.statusKey === status),
      ).length,
    [cards, region, logistics, status],
  );
  /* The PHONE work list's own search box. It is deliberately LOCAL, not the
     URL's `?q=`: a carried-over URL search must never narrow a work list
     invisibly (the desktop sheet applies the same rule with the grid's own
     box), and the phone has no sheet toolbar to put one in. */
  const [phoneSearch, setPhoneSearch] = useState("");

  const listRows = useMemo(() => filterMonitorListRows(cards, filters), [cards, filters]);
  /* ── THE CONTACT WEEK — counted over the queue BEFORE its own date pick ───
     A day's count must say how many calls that Thursday holds, not how many
     survive the Thursday already picked, so the strip counts the queue with
     `due`/`late` cleared and every other narrowing still applied. */
  const contactQueueRows = useMemo(
    () =>
      filterMonitorListRows(cards, {
        ...filters,
        view: "no_confirmed_date",
        contactDue: null,
        contactOverdueOnly: false,
      }),
    [cards, filters],
  );
  const contactWeek = useMemo(
    () => contactWeekOf(contactQueueRows, selectedDate),
    [contactQueueRows, selectedDate],
  );
  const contactOverdueCount = useMemo(
    () => contactQueueRows.filter((c) => c.contactOverdue).length,
    [contactQueueRows],
  );
  /* The phone list's visible rows — the same rows, narrowed by its own box. */
  const phoneRows = useMemo(
    () => listRows.filter((c) => matchesMonitorSearch(c, phoneSearch)),
    [listRows, phoneSearch],
  );
  const byDay = useMemo(
    () => groupCardsByDay(calendarCards, visibleDays),
    [calendarCards, visibleDays],
  );
  /* The Month's compact counts — over the SAME calendar cards. */
  const countsByDay = useMemo(() => monthDayCounts(calendarCards, today), [calendarCards, today]);

  const isError = ordersQ.isError || docsQ.isError;
  const isLoading = ordersQ.isLoading || docsQ.isLoading;

  /* ── SELECTION — work list only. Changing any filter clears it, so a batch
     can never quietly include rows the operator is no longer looking at. ── */
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assigning, setAssigning] = useState<DeliveryScopeRow[] | null>(null);
  useEffect(() => {
    setSelected(new Set());
  }, [view, region, logistics, status, contactDue, contactOverdueOnly]);

  const toggleRow = useCallback(
    (key: string) =>
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      }),
    [],
  );
  /* The header checkbox acts on the VISIBLE filtered rows only — the engine
     hands exactly those keys; hidden or unfiltered rows are never touched. */
  const toggleAll = useCallback(
    (keys: string[], allSelected: boolean) =>
      setSelected((prev) => {
        const next = new Set(prev);
        for (const k of keys) {
          if (allSelected) next.delete(k);
          else next.add(k);
        }
        return next;
      }),
    [],
  );

  const selectedRows = useMemo(
    () => listRows.filter((r) => selected.has(r.scopeId)),
    [listRows, selected],
  );
  /* THE SAFE BULK DEFAULT (owner correction 2026-09-06): bulk assignment only
     when EVERY selected row is unassigned. Replacing an existing partner is
     the governed `Change logistics` act, one row at a time, reason recorded. */
  const allUnassigned =
    selectedRows.length > 0 && selectedRows.every((r) => r.logisticsPartnerId === null);
  const oneAssigned =
    selectedRows.length === 1 && selectedRows[0]!.logisticsPartnerId !== null;

  const openOrder = useCallback(
    (r: DeliveryMonitorCard) => navigate(`/operation/orders/so/${r.orderId}`),
    [navigate],
  );
  /**
   * The Delivery-owned editor, carrying THIS workspace back with it: the
   * operator records the confirmed date and returns to the same queue and the
   * same narrowing, with the row now gone from it. The Journey leg still
   * rides the URL and never reaches the screen as a word.
   */
  const openEditDelivery = useCallback(
    (r: DeliveryMonitorCard) => {
      const params = new URLSearchParams();
      if (r.leg != null) params.set("leg", String(r.leg));
      params.set("from", `${location.pathname}${location.search}`);
      navigate(`/operation/delivery/edit/${r.orderId}?${params.toString()}`);
    },
    [navigate, location.pathname, location.search],
  );

  /* ── THE WORK LIST — the same shared Register engine as Sales Orders ───── */
  const columns = useMemo<DataGridColumn<DeliveryMonitorCard>[]>(
    () => [
      {
        /* THE IDENTITY COLUMN — pins while the sheet scrolls. The customer's
           own reference rides the same cell (the string a partner recognises);
           a Journey leg adds its leg number and route. */
        key: "so",
        label: MONITOR_COLUMN.so,
        width: 150,
        sortable: true,
        filterType: "numbering",
        chooserGroup: "Document",
        accessor: (r) => (
          <span className="block min-w-0">
            <button
              type="button"
              className="font-mono font-medium text-blue-700 underline-offset-2 hover:underline"
              onClick={(event) => {
                event.stopPropagation();
                openOrder(r);
              }}
            >
              SO-{r.scope.so}
            </button>
            {r.scope.refs.length > 0 ? (
              <span className="ml-1.5 text-kit-slate-11">{r.scope.refs.join(" · ")}</span>
            ) : null}
            {r.scope.legRoute ? (
              /* A Journey row names its own two places — the route IS the
                 word; `leg` never reaches the screen (owner correction
                 2026-09-07). */
              <span
                className="block truncate text-label text-kit-slate-11"
                title={r.scope.legRoute}
              >
                {r.scope.legRoute}
              </span>
            ) : null}
          </span>
        ),
        searchValue: (r) => `SO-${r.scope.so} ${r.scope.so} ${r.scope.refs.join(" ")}`,
        filterValue: (r) => `SO-${r.scope.so}`,
        exportValue: (r) =>
          `SO-${r.scope.so}${r.scope.refs.length ? ` ${r.scope.refs.join(" ")}` : ""}`,
        sortFn: (a, b) => a.scope.so - b.scope.so || (a.leg ?? 0) - (b.leg ?? 0),
      },
      {
        key: "customer",
        label: MONITOR_COLUMN.customer,
        width: 170,
        sortable: true,
        chooserGroup: "Customer",
        /* ⭐ THE INLINE SECOND LINE — the ONE exception the Constitution
           allows. Who carries this delivery is the operator's second question
           about a row and it must not cost a Columns chooser; the sortable,
           filterable `Logistics Partner` column still exists beside it. */
        accessor: (r) => (
          <span className="block min-w-0">
            <span className="block truncate font-medium" title={r.customerName}>
              {r.customerName}
            </span>
            {r.logisticsPartnerName ? (
              <span className="block truncate text-label text-kit-slate-11">
                {r.logisticsPartnerName}
              </span>
            ) : (
              <span className="block truncate text-label" data-absence="true">
                <span className="text-kit-slate-9">{MONITOR_COPY.noLogistics}</span>
              </span>
            )}
          </span>
        ),
        searchValue: (r) => `${r.customerName} ${r.scope.o.customer_phone ?? ""}`,
        filterValue: (r) => r.customerName,
      },
      {
        /* The rail's REGION answer, on the row — the ONE address classifier
           (`regionBucketOf`), never a second derivation. */
        key: "state",
        label: MONITOR_COLUMN.state,
        width: 110,
        sortable: true,
        filterType: "enum",
        chooserGroup: "Customer",
        accessor: (r) => r.region ?? <Absent>{DW.notRecorded}</Absent>,
        searchValue: (r) => r.region ?? "",
        filterValue: (r) => r.region ?? DW.notRecorded,
      },
      {
        /* Sales Orders' promise, in the governed word (`Requested Delivery
           Date`, owner ruling 2026-08-27). Delivery reads it, never writes it. */
        key: "customer_delivery",
        label: MONITOR_COLUMN.requestedDelivery,
        width: 176,
        sortable: true,
        filterType: "date",
        chooserGroup: "Dates",
        dateValue: (r) => r.scope.customerDeliveryIso,
        /* ⭐ THE TWO DATES STAY ADJACENT (the 2026-09-09 chase ruling), now as
           ONE cell's two lines: what the customer ASKED FOR, then whether
           anybody has AGREED a day. The sortable `Confirmed Delivery` and
           `Confirmed Time` columns remain in the chooser for the sheet's own
           filtering and export; the answer itself never hides behind one. */
        accessor: (r) => (
          <span className="block min-w-0">
            <span className="block truncate">
              {r.scope.customerDeliveryIso ? (
                requestedText(r)
              ) : (
                <span title={r.scope.customerDateTbd ? DATE_TO_BE_CONFIRMED_FULL : undefined}>
                  <Absent>{requestedText(r)}</Absent>
                </span>
              )}
            </span>
            {r.confirmedDate ? (
              <span className="block truncate text-label text-kit-slate-11">
                {fmtDate(r.confirmedDate)}
                {r.confirmedTime ? (
                  ` · ${r.confirmedTime}`
                ) : (
                  /* ⭐ A DAY IS NOT AN APPOINTMENT (owner correction
                     2026-09-11). Printing the day alone made a half-answered
                     booking look exactly like a finished one — the only
                     difference being a missing fragment an operator reads as
                     formatting. The absence is STATED, in the same governed
                     words the calendar card uses, and the row keeps its
                     follow-up work. */
                  <>
                    {" · "}
                    <span className="text-kit-slate-9" data-absence="true">
                      {MONITOR_COPY.noTimeAgreed}
                    </span>
                  </>
                )}
              </span>
            ) : (
              <span className="block truncate text-label" data-absence="true">
                <span className="text-kit-slate-9">{DW.noConfirmedDate}</span>
              </span>
            )}
          </span>
        ),
        /* ⭐ ONE SPELLING for the cell, the search, the filter and the sheet:
           the export used to flatten `To be confirmed` into `No delivery
           date`, telling an Excel reader the customer had named no day when
           the customer had asked for one still being settled. */
        searchValue: requestedText,
        exportValue: requestedText,
        filterValue: requestedText,
        sortFn: (a, b) =>
          (a.scope.customerDeliveryIso ?? "").localeCompare(b.scope.customerDeliveryIso ?? ""),
      },
      {
        /* ⭐ THE MAIN GOODS — model, size and quantity, one line each, with the
           EXACT missing pieces where the register is short. The size is not a
           separate column: the catalog's own resolved name already carries it
           (`Trion · Queen`), and splitting one name into two cells would make
           the operator reassemble it. */
        key: "items",
        label: MONITOR_COLUMN.items,
        width: 210,
        chooserGroup: "Items",
        accessor: (r) =>
          r.items.length === 0 ? (
            <Absent>{DW.noGoods}</Absent>
          ) : (
            <span className="block min-w-0">
              {r.items.map((line) => (
                <span key={line.key} className="block truncate" title={line.name}>
                  {line.name} × {line.qty}
                  {line.shortQty > 0 ? (
                    <span className="ml-1 text-kit-amber-11">
                      — {ARRIVAL_COPY.short(line.shortQty)}
                    </span>
                  ) : null}
                </span>
              ))}
            </span>
          ),
        searchValue: (r) => r.items.map((l) => l.name).join(" "),
        exportValue: (r) => goodsLinesText(r.items),
        filterValue: (r) => goodsLinesText(r.items),
      },
      {
        /* ⭐ ACCESSORIES AND SERVICES, KEPT APART from the main goods (owner
           ruling 2026-09-10). A pillow that is short and a disposal the crew
           must perform are two different obligations, and neither belongs in
           a summary that starts with a mattress. The site the crew meets —
           Sales Orders' own floor and lift answers — closes the cell, because
           it is what decides whether the job needs more people. */
        key: "extras",
        label: MONITOR_COLUMN.extras,
        width: 230,
        chooserGroup: "Items",
        accessor: (r) =>
          r.extras.length === 0 && r.siteAccess === null ? (
            <Absent>{MONITOR_COPY.noExtras}</Absent>
          ) : (
            <span className="block min-w-0">
              {r.extras.length === 0 ? <Absent>{MONITOR_COPY.noExtras}</Absent> : null}
              {r.extras.map((line) => (
                <span key={line.key} className="block truncate" title={line.name}>
                  {line.kind === "service" ? (
                    <span className="text-kit-slate-11">{line.category} · </span>
                  ) : null}
                  {line.name}
                  {line.qty > 1 ? ` × ${line.qty}` : ""}
                  {line.shortQty > 0 ? (
                    <span className="ml-1 text-kit-amber-11">
                      — {ARRIVAL_COPY.short(line.shortQty)}
                    </span>
                  ) : null}
                </span>
              ))}
              {r.siteAccess ? (
                <span className="block truncate text-label text-kit-slate-11">
                  {r.siteAccess}
                </span>
              ) : null}
            </span>
          ),
        searchValue: (r) => `${r.extras.map((l) => l.name).join(" ")} ${r.siteAccess ?? ""}`,
        exportValue: (r) =>
          [goodsLinesText(r.extras), r.siteAccess].filter(Boolean).join(" · ") ||
          MONITOR_COPY.noExtras,
        filterValue: (r) => goodsLinesText(r.extras) || MONITOR_COPY.noExtras,
      },
      {
        /* ⭐ WHEN THE GOODS REACH US — the DATE first, always. The state and
           every word come from the ONE shared reader; this cell only draws it.
           A revised date keeps the ORIGINAL beside it, so an operator can see
           that it moved and by how much — never a delay icon with no date. */
        key: "expected_arrival",
        label: MONITOR_COLUMN.expectedArrival,
        /* Wide enough for the longest governed note on ONE line — `The factory
           has not given a date` is the absence an operator must be able to
           read without hovering. */
        width: 210,
        chooserGroup: "Items",
        accessor: (r) => <ArrivalCell card={r} />,
        searchValue: (r) => arrivalText(r),
        exportValue: (r) => arrivalText(r),
        filterValue: (r) => arrivalNoteOf(r.arrival),
        sortFn: (a, b) =>
          (arrivalDateIso(a) ?? "￿").localeCompare(arrivalDateIso(b) ?? "￿"),
        sortable: true,
      },
      {
        /* Whether the register HOLDS the goods — separate from when they
           arrive, because "the date is fine" and "the goods are here" are two
           different answers and one row must not blur them. */
        key: "stock",
        label: MONITOR_COLUMN.stock,
        width: 110,
        sortable: true,
        filterType: "enum",
        chooserGroup: "Items",
        accessor: (r) => (
          <span className="block min-w-0">
            <span className={r.readiness.ready ? "text-kit-slate-12" : "text-kit-slate-11"}>
              {stockText(r)}
            </span>
            {r.readiness.shortQty > 0 ? (
              <span className="block truncate text-label text-kit-slate-11">
                {ARRIVAL_COPY.short(r.readiness.shortQty)}
              </span>
            ) : null}
          </span>
        ),
        searchValue: stockText,
        exportValue: (r) =>
          r.readiness.shortQty > 0
            ? `${stockText(r)} · ${ARRIVAL_COPY.short(r.readiness.shortQty)}`
            : stockText(r),
        filterValue: stockText,
      },
      {
        key: "logistics",
        label: MONITOR_COLUMN.logisticsPartner,
        width: 140,
        sortable: true,
        defaultHidden: true,
        filterType: "enum",
        chooserGroup: "Delivery",
        accessor: (r) =>
          r.logisticsPartnerName ?? <Absent>{MONITOR_COPY.noLogistics}</Absent>,
        searchValue: (r) => r.logisticsPartnerName ?? MONITOR_COPY.noLogistics,
        filterValue: (r) => r.logisticsPartnerName ?? MONITOR_COPY.noLogistics,
      },
      {
        /* Delivery's OWN confirmed operational date — the document's when one
           exists, else the confirmed booking. A carrier's provisional date is
           not confirmed and is not printed here. */
        key: "confirmed_delivery",
        label: MONITOR_COLUMN.confirmedDelivery,
        width: 150,
        sortable: true,
        defaultHidden: true,
        filterType: "date",
        chooserGroup: "Delivery",
        dateValue: (r) => r.confirmedDate,
        accessor: (r) =>
          r.confirmedDate ? fmtDate(r.confirmedDate) : <Absent>{DW.noConfirmedDate}</Absent>,
        searchValue: (r) => (r.confirmedDate ? fmtDate(r.confirmedDate) : DW.noConfirmedDate),
        filterValue: (r) => (r.confirmedDate ? fmtDate(r.confirmedDate) : DW.noConfirmedDate),
        sortFn: (a, b) => (a.confirmedDate ?? "").localeCompare(b.confirmedDate ?? ""),
      },
      {
        key: "confirmed_time",
        label: MONITOR_COLUMN.confirmedTime,
        width: 120,
        sortable: true,
        defaultHidden: true,
        filterType: "enum",
        chooserGroup: "Delivery",
        accessor: (r) => r.confirmedTime ?? <Absent>{DW.noTime}</Absent>,
        searchValue: (r) => r.confirmedTime ?? DW.noTime,
        filterValue: (r) => r.confirmedTime ?? DW.noTime,
      },
      {
        key: "do_number",
        label: MONITOR_COLUMN.doNumber,
        width: 150,
        sortable: true,
        defaultHidden: true,
        filterType: "numbering",
        chooserGroup: "Document",
        accessor: (r) =>
          r.doNumber ? (
            <button
              type="button"
              className="font-mono font-medium text-blue-700 underline-offset-2 hover:underline"
              onClick={(event) => {
                event.stopPropagation();
                navigate(`/operation/delivery-orders/${encodeURIComponent(r.doNumber!)}`);
              }}
            >
              {r.doNumber}
            </button>
          ) : (
            /* The SYSTEM issues the document when the trip's requirements are
               met, so the absence is a stage, not a missing click. */
            <Absent>{MONITOR_COPY.noDeliveryOrder}</Absent>
          ),
        searchValue: (r) => r.doNumber ?? MONITOR_COPY.noDeliveryOrder,
        filterValue: (r) => r.doNumber ?? MONITOR_COPY.noDeliveryOrder,
      },
      {
        key: "location",
        label: MONITOR_COLUMN.location,
        width: 170,
        sortable: true,
        defaultHidden: true,
        chooserGroup: "Customer",
        accessor: (r) => (
          <span className="block truncate" title={r.scope.location}>
            {r.scope.location}
          </span>
        ),
        searchValue: (r) => r.scope.location,
        filterValue: (r) => r.scope.location,
      },
      {
        key: "goods",
        label: MONITOR_COLUMN.goods,
        width: 220,
        sortable: true,
        defaultHidden: true,
        chooserGroup: "Items",
        accessor: (r) => (
          <span className="block truncate" title={r.goodsSummary}>
            {r.goodsSummary}
          </span>
        ),
        searchValue: (r) => r.goodsSummary,
        filterValue: (r) => r.goodsSummary,
      },
      {
        key: "delivery_status",
        label: MONITOR_COLUMN.deliveryStatus,
        width: 180,
        sortable: true,
        defaultHidden: true,
        filterType: "enum",
        chooserGroup: "Delivery",
        /* ⭐ THE OPERATION'S progress, not the DOCUMENT's (owner ruling
           2026-08-24) — it always has an answer, and it is never `Created`. */
        accessor: (r) => {
          /* The result stays `Delivered`; the row names the EXACT missing
             evidence beneath it — `Upload delivery photo` and/or `Upload
             signed Delivery Order` (owner correction 2026-09-07). */
          const missing = missingProofLabels(r);
          const second = r.scope.status.reasonLabel ?? (missing.length ? missing.join(" · ") : null);
          return (
            <span className="block min-w-0">
              <StatusPill tone={STATUS_TONE[r.statusKey]}>{r.statusLabel}</StatusPill>
              {second ? (
                <span
                  className="block truncate text-label font-normal text-base-600"
                  title={second}
                  data-testid={missing.length ? "delivery-monitor-missing-proof" : undefined}
                >
                  {second}
                </span>
              ) : null}
            </span>
          );
        },
        searchValue: (r) => [r.statusLabel, ...missingProofLabels(r)].join(" "),
        filterValue: (r) => r.statusLabel,
      },
      {
        /* ⭐ THE CHASE COLUMN — who must be contacted, and the one door that
           records the answer (Delivery MASTER §8, the requested-vs-confirmed
           chase). The act comes from RECORDED facts through the module's one
           `monitorRowAction` arithmetic:

             no Logistics Partner   `Assign logistics` — the governed door
             partner, no date       `Call {partner} — confirm delivery date`,
                                    then `Edit Delivery` records what they said
             everything agreed      `Edit Delivery`

           The partner's NAME comes from the row; no carrier and no employee
           is ever hard-coded here. */
        key: "actions",
        label: MONITOR_COLUMN.actions,
        width: 250,
        chooserGroup: "Delivery",
        accessor: (r) => {
          const action = monitorRowAction(r);
          return (
            <span className="flex min-w-0 flex-col items-start gap-0.5">
              {action.kind === "assign_logistics" ? (
                /* The one act that IS a door — the governed assignment
                   dialog, for one delivery. */
                <button
                  type="button"
                  className="rounded-control border border-kit-slate-6 bg-white px-2 py-0.5 text-meta font-medium text-kit-slate-12 hover:bg-kit-slate-3"
                  data-testid={`delivery-monitor-action-${action.kind}-${r.scopeId}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    setAssigning([r.scope]);
                  }}
                >
                  {action.label}
                </button>
              ) : action.kind === "confirm_date" ? (
                /* ⭐ THE GOVERNED ROW LINE, unchanged: the operator calls the
                   LOGISTICS PARTNER, who arranges the day with the customer
                   (MASTER §2). The QUEUE is named after the customer
                   conversation that must happen; the ROW names who to dial. */
                <span className="block max-w-full truncate text-kit-slate-12" title={action.call}>
                  {action.call}
                </span>
              ) : action.kind === "upload_proof" ? (
                <span
                  className="block max-w-full truncate text-kit-slate-12"
                  title={action.label}
                  data-testid="delivery-monitor-missing-proof"
                >
                  {action.label}
                </span>
              ) : (
                /* Nothing is outstanding: the row states where the work is. */
                <span className="block max-w-full truncate text-kit-slate-11">
                  {r.statusLabel}
                </span>
              )}
              <ContactDeadline card={r} />
            </span>
          );
        },
        /* The sheet prints the same words the screen shows. */
        searchValue: monitorRowActionText,
        exportValue: monitorRowActionText,
        filterValue: monitorRowActionText,
      },
      {
        /* ⭐ THE EDITOR'S OWN COLUMN — the last cell on the ruled row, so the
           one Delivery-owned write door is always in the same place. It is a
           column rather than a second button inside `Actions` because the act
           and the door are two different facts: the act can be a phone call
           nobody records here, and the door is always the same. */
        key: "edit",
        label: EDIT_DELIVERY,
        width: 130,
        chooserGroup: "Delivery",
        accessor: (r) => (
          <button
            type="button"
            className="truncate text-meta font-medium text-blue-700 underline-offset-2 hover:underline"
            data-testid={`delivery-monitor-edit-${r.scopeId}`}
            onClick={(event) => {
              event.stopPropagation();
              openEditDelivery(r);
            }}
          >
            {EDIT_DELIVERY}
          </button>
        ),
        searchValue: () => EDIT_DELIVERY,
        exportValue: () => "",
        filterValue: () => EDIT_DELIVERY,
      },
      {
        /* Off by default: the crew facts belong one click away rather than
           permanently widening the sheet. */
        key: "building",
        label: MONITOR_COLUMN.building,
        width: 120,
        sortable: true,
        defaultHidden: true,
        filterType: "enum",
        chooserGroup: "Customer",
        accessor: (r) =>
          r.scope.building === DW.notGiven ? (
            <Absent>{DW.notGiven}</Absent>
          ) : (
            r.scope.building
          ),
        searchValue: (r) => r.scope.building,
        filterValue: (r) => r.scope.building,
      },
      {
        key: "phone",
        label: MONITOR_COLUMN.phone,
        width: 140,
        sortable: true,
        defaultHidden: true,
        chooserGroup: "Customer",
        accessor: (r) => r.scope.o.customer_phone ?? <Absent>{DW.notGiven}</Absent>,
        searchValue: (r) => r.scope.o.customer_phone ?? "",
        filterValue: (r) => r.scope.o.customer_phone ?? DW.notGiven,
      },
    ],
    [navigate, openOrder, openEditDelivery],
  );

  const contextMenu = useCallback(
    (r: DeliveryMonitorCard): DataGridContextMenuItem[] => [
      { label: EDIT_DELIVERY, onClick: () => openEditDelivery(r) },
      /* The row's act is ALSO one right-click away. `Actions` is the last of
         twelve ruled columns and a wide sheet scrolls, so the governed door
         must not depend on the operator reaching the right-hand edge — and
         `Assign logistics` was the one act the menu could not reach. */
      ...(r.logisticsPartnerId === null
        ? [{ label: ASSIGN_LOGISTICS, onClick: () => setAssigning([r.scope]) }]
        : []),
      { divider: true },
      { label: `Open SO-${r.scope.so}`, onClick: () => openOrder(r) },
      ...(r.doNumber
        ? [
            {
              label: `Open ${r.doNumber}`,
              onClick: () =>
                navigate(`/operation/delivery-orders/${encodeURIComponent(r.doNumber!)}`),
            },
          ]
        : []),
    ],
    [navigate, openOrder, openEditDelivery],
  );

  const rangeLabel =
    calendarView === "day"
      ? fmtDate(selectedDate)
      : calendarView === "month"
        ? fmtMonth(selectedDate.slice(0, 7))
        : `${fmtDate(visibleDays[0]!)} – ${fmtDate(visibleDays[visibleDays.length - 1]!)}`;

  /* Previous/next REPLACES the whole displayed window: one operating day in
     Day, the three-day half-week on a tablet, the whole operating week on the
     desktop (six operating days = exactly one week, Sundays skipped), the
     whole month in Month. */
  const windowStep = calendarView === "day" ? 1 : viewport === "tablet" ? 3 : MONITOR_DAYS;
  const goPrevious = () =>
    setDate(
      calendarView === "month"
        ? monthStepStart(selectedDate, -1)
        : previousOperatingWindowStart(selectedDate, windowStep),
    );
  const goNext = () =>
    setDate(
      calendarView === "month"
        ? monthStepStart(selectedDate, 1)
        : nextOperatingWindowStart(selectedDate, windowStep),
    );
  const previousLabel = calendarView === "month" ? MONITOR_COPY.previousMonth : MONITOR_COPY.previousDays;
  const nextLabel = calendarView === "month" ? MONITOR_COPY.nextMonth : MONITOR_COPY.nextDays;

  /* ── DAY · WEEK · MONTH — the CALENDAR's own control (owner ruling
     2026-09-10, narrowing the 2026-09-07 "on both projections" spelling).
     It belongs to the view it changes: on a work list it lit nothing and
     changed the page out from under the operator. Never on a phone, which is
     only ever the Day list. */
  const calendarControl =
    isPhone || !calendarMode ? null : (
      <Segmented<MonitorCalendarView>
        options={MONITOR_CALENDAR_VIEWS.map((v) => ({
          value: v,
          label: MONITOR_CALENDAR_VIEW_LABEL[v],
        }))}
        value={calendarView}
        onChange={pickCalendarView}
        ariaLabel={MONITOR_COPY.calendarViews}
        testId="delivery-monitor-calendar-view"
      />
    );

  /* ── THE TWO TOP-LEVEL TABS — the page's own first control ─────────────── */
  const topTabs = (
    <div
      role="tablist"
      aria-label={MONITOR_COPY.tabs}
      className="flex h-10 shrink-0 items-stretch gap-6 border-b border-kit-slate-5 bg-white px-3"
      data-testid="delivery-monitor-tabs"
    >
      {MONITOR_TOP_TABS.map((tab) => {
        const active = topTab === tab;
        /* ⭐ A TAB'S COUNT IS THE VIEW'S WHOLE POPULATION, not the pick inside
           it. `Work to do` counts every open delivery and `Confirmed
           deliveries` counts every agreed appointment — both narrowed by the
           STATE / LOGISTICS PARTNER / DELIVERY STATUS picks that apply to
           BOTH views, and by neither the queue nor the visible week. A badge
           that changed with the queue would say what the footer already says
           and stop answering *how much is there?* from the other tab. */
        const count = tab === "work" ? rails.work.all : confirmedCount;
        return (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={active}
            data-testid={`delivery-monitor-tab-${tab}`}
            className={`relative -mb-px flex items-center gap-2 border-b-2 text-body ${
              active
                ? "border-kit-blue-9 font-medium text-kit-slate-12"
                : "border-transparent text-kit-slate-11 hover:text-kit-slate-12"
            }`}
            onClick={() => pickTopTab(tab)}
          >
            {MONITOR_TOP_TAB_LABEL[tab]}
            <span className="text-meta tabular-nums text-kit-slate-11">{count}</span>
          </button>
        );
      })}
    </div>
  );

  /* ── THE CONTACT WEEK — Monday to Saturday, counted by CONTACT DEADLINE ───
     It appears under `Call customer` and nowhere else, because it answers only
     that queue's question. The `Overdue` chip stays visible WITH ITS COUNT at
     every date, so navigating to a quiet Thursday can never hide calls that
     are already late. */
  const contactWeekStrip =
    view !== "no_confirmed_date" || calendarMode ? null : (
      <div
        className="flex h-14 shrink-0 items-stretch gap-1 overflow-x-auto border-b border-kit-slate-5 bg-white px-3"
        aria-label={MONITOR_COPY.contactWeek}
        data-testid="delivery-monitor-contact-week"
      >
        <button
          type="button"
          aria-label={MONITOR_COPY.previousWeek}
          title={MONITOR_COPY.previousWeek}
          className="my-2 flex h-8 w-7 shrink-0 items-center justify-center rounded-control border border-kit-slate-6 bg-white text-kit-slate-11 hover:bg-hovertint"
          onClick={() => setDate(previousOperatingWindowStart(selectedDate, MONITOR_DAYS))}
        >
          <ChevronLeft size={15} />
        </button>
        <button
          type="button"
          aria-pressed={contactOverdueOnly}
          data-testid="delivery-monitor-contact-overdue"
          className={`my-2 flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-meta font-medium ${
            contactOverdueOnly
              ? "border-kit-red-9 bg-kit-red-3 text-kit-red-11"
              : "border-kit-slate-6 bg-white text-kit-slate-11 hover:bg-hovertint"
          }`}
          onClick={toggleContactOverdue}
        >
          {/* ⭐ NOT just `Overdue` (owner ruling 2026-09-11): the rail already
              counts overdue DELIVERIES, and two bare `Overdue` numbers on one
              screen read as one number disagreeing with itself. */}
          {MONITOR_COPY.overdueContact}
          <span className="tabular-nums">{contactOverdueCount}</span>
        </button>
        <div className="flex flex-1 items-stretch gap-1">
          {contactWeek.map((day) => {
            const active = !contactOverdueOnly && contactDue === day.iso;
            return (
              <button
                key={day.iso}
                type="button"
                aria-pressed={active}
                data-testid={`delivery-monitor-contact-day-${day.iso}`}
                aria-label={`${MONITOR_COPY.callBy(fmtDate(day.iso))} · ${day.count}`}
                /* A MINIMUM width, then the row scrolls: six days squeezed to
                   nothing on a phone is a date picker nobody can hit. */
                className={`my-1.5 flex min-w-[86px] flex-1 flex-col items-center justify-center rounded-control border px-1 ${
                  active
                    ? "border-kit-blue-9 bg-kit-blue-3 text-kit-slate-12"
                    : "border-transparent text-kit-slate-11 hover:bg-hovertint"
                }`}
                onClick={() => pickContactDue(day.iso)}
              >
                {/* ONE date spelling, portal-wide (`fmtDate`) — a strip that
                    invents `MON 8` is the second spelling COPY-STANDARD bans. */}
                <span className="w-full truncate text-center text-meta text-kit-slate-12">
                  {fmtDate(day.iso)}
                </span>
                <span className="text-label tabular-nums">{day.count}</span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          aria-label={MONITOR_COPY.nextWeek}
          title={MONITOR_COPY.nextWeek}
          className="my-2 flex h-8 w-7 shrink-0 items-center justify-center rounded-control border border-kit-slate-6 bg-white text-kit-slate-11 hover:bg-hovertint"
          onClick={() => setDate(nextOperatingWindowStart(selectedDate, MONITOR_DAYS))}
        >
          <ChevronRight size={15} />
        </button>
        {/* The caption says what these dates ARE. On a phone the six dates
            need every pixel, and the strip's own aria-label carries the same
            fact for a reader who cannot see the row. */}
        {isPhone ? null : (
          <span className="my-auto shrink-0 pl-2 text-label text-kit-slate-9">
            {MONITOR_COPY.contactWeekScope}
          </span>
        )}
      </div>
    );

  const showFiltersButton = (
    <button
      type="button"
      aria-label={MONITOR_COPY.showFilters}
      title={MONITOR_COPY.showFilters}
      className="grid h-8 w-8 shrink-0 place-items-center rounded-control border border-kit-slate-6 bg-white text-kit-slate-11 hover:bg-kit-slate-3 hover:text-kit-slate-12"
      data-testid="delivery-monitor-show-filters"
      onClick={() => {
        setFilterRailVisible(true);
        setPhoneRailOverride(true);
      }}
    >
      <PanelLeftOpen size={16} strokeWidth={1.75} aria-hidden />
    </button>
  );

  /* ── THE RAIL — month calendar FIXED on top, filters scrolling below ───── */
  const rail = (
    <FilterRail
      testId="delivery-monitor-rail"
      onHide={() => {
        setFilterRailVisible(false);
        setPhoneRailOverride(false);
      }}
      /* The complete month, always in view (owner correction 2026-09-06):
         scrolling the filter groups never removes it. Clicking a date opens
         that date's Day view in the right workspace. */
      header={
        <MonitorMonthCalendar
          selectedIso={selectedDate}
          onSelect={pickCalendarDate}
          workDayIsos={workDayIsos}
          testId="delivery-monitor-month-calendar"
        />
      }
    >
      {/* WORK TO DO belongs to the Work to do tab — a queue pick from the
          Confirmed deliveries calendar would silently change the tab, which is
          exactly the side effect the two tabs replaced. Clicking one there is
          still possible from the tab itself, one click away. */}
      {calendarMode ? null : (
        <FilterRailGroup title={MONITOR_COPY.railWork}>
          {MONITOR_WORK_VIEWS.map((key) => (
            <FilterRailRow
              key={key}
              label={MONITOR_VIEW_LABEL[key]}
              count={rails.work[key]}
              active={view === key}
              onClick={() => pickView(key)}
              testId={`delivery-monitor-work-${key}`}
            />
          ))}
        </FilterRailGroup>
      )}
      {/* ⭐ THREE SINGLE-PICK QUESTIONS, THREE KIT DROPDOWNS (owner ruling
          2026-09-12). STATE grew a row per state the data happened to hold —
          thirteen on production — and with LOGISTICS PARTNER and DELIVERY
          STATUS under it the rail carried 1152px of filters in a 421px box.
          The groups, their words and their counts are UNCHANGED; only the
          control changed, and the two months above it do not move. */}
      <FilterRailGroup title={MONITOR_COPY.railState}>
        <RailPicker
          id="delivery-monitor-region"
          label={MONITOR_COPY.railState}
          allLabel={MONITOR_COPY.allStates}
          total={rails.regionTotal}
          value={region}
          options={rails.regions}
          onPick={(next) => setParam("region", next)}
        />
      </FilterRailGroup>
      <FilterRailGroup title={MONITOR_COPY.railLogistics}>
        <RailPicker
          id="delivery-monitor-logistics"
          label={MONITOR_COPY.railLogistics}
          allLabel={MONITOR_COPY.allPartners}
          total={rails.logisticsTotal}
          value={logistics}
          options={rails.logistics}
          onPick={(next) => setParam("logistics", next)}
        />
      </FilterRailGroup>
      <FilterRailGroup title={MONITOR_COPY.railStatus}>
        <RailPicker
          id="delivery-monitor-status"
          label={MONITOR_COPY.railStatus}
          allLabel={MONITOR_COPY.allStatuses}
          total={rails.statusTotal}
          value={status}
          options={MONITOR_STATUS_FILTERS.map((key) => ({
            key,
            label: MONITOR_STATUS_LABEL[key],
            count: rails.status[key],
          }))}
          onPick={setStatusParam}
        />
      </FilterRailGroup>
    </FilterRail>
  );

  /** One day's stack — the SAME cards and order on desktop and phone. */
  const dayCards = (iso: string) => {
    const list = byDay.get(iso) ?? [];
    if (list.length === 0) {
      return <div className="px-2 py-3 text-body text-kit-slate-9">{MONITOR_COPY.emptyDay}</div>;
    }
    return (
      <div className="flex flex-col gap-1.5 p-1.5">
        {list.map((card) => (
          <MonitorCard key={card.scopeId} card={card} />
        ))}
      </div>
    );
  };

  /* ── THE SPANNING EMPTY RANGE (owner correction 2026-09-06) — one state,
     never the same sentence repeated in six columns. The confirmed-date count
     it offers is the REAL rail count, never an invented number. ──────────── */
  const emptyRange = (
    <div
      className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-4 text-center"
      data-testid="delivery-monitor-empty-range"
    >
      <p className="text-body text-kit-slate-12">
        {emptyRangeSentence(visibleDays, fmtDate)}
      </p>
      {rails.work.no_confirmed_date > 0 ? (
        <>
          <p className="text-body text-kit-slate-11">
            {needConfirmedDateSentence(rails.work.no_confirmed_date)}
          </p>
          <button
            type="button"
            className="rounded-control border border-kit-slate-6 bg-white px-3 py-1.5 text-meta font-medium text-kit-slate-12 hover:bg-kit-slate-3"
            onClick={() => pickView("no_confirmed_date")}
            data-testid="delivery-monitor-open-no-confirmed-date"
          >
            {MONITOR_COPY.openNoConfirmedDate}
          </button>
        </>
      ) : null}
    </div>
  );

  /* ── THE ACTIVE-FILTER SUMMARY — every pick that is ACTUALLY narrowing the
     view in front of the operator. The WORK TO DO queue narrows the work list
     and nothing on the calendar, so naming it above a calendar would claim a
     narrowing the cards never took. ─────────────────────────────────────── */
  const filterLabels = activeFilterLabels(
    {
      ...filters,
      /* The landing's own queue narrows nothing, and the calendar's cards take
         no queue at all — printing `All delivery work · Clear filters` over an
         unfiltered list offers to clear something that is not there. */
      view: calendarMode || view === DEFAULT_WORK_VIEW ? null : view,
    },
    (id) => partnerNameById.get(id) ?? null,
  );
  const filterSummary =
    filterLabels.length > 0 ? (
      <div
        className="flex h-9 shrink-0 items-center gap-3 border-b border-kit-slate-5 bg-white px-3"
        data-testid="delivery-monitor-filter-summary"
      >
        <span className="min-w-0 truncate text-body font-medium text-kit-slate-12">
          {filterLabels.join(" · ")}
        </span>
        <button
          type="button"
          className="ml-auto shrink-0 text-meta font-medium text-blue-700 underline-offset-2 hover:underline"
          onClick={clearFilters}
          data-testid="delivery-monitor-clear-filters"
        >
          {MONITOR_COPY.clearFilters}
        </button>
      </div>
    ) : null;

  return (
    <div
      className="flex h-full min-h-0 flex-col bg-kit-canvas"
      data-testid="operation-delivery-monitor"
    >
      <ModuleHeader
        testId="delivery-monitor-destination-header"
        word={MONITOR_COPY.page}
        docTitle={MONITOR_COPY.docTitle}
        destinationHeader
      />
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {railVisible ? (
          isPhone ? (
            /* The phone FILTER DRAWER — the same rail, overlaid, never
               squeezing the one-day list underneath it. */
            <div className="absolute inset-y-0 left-0 z-20 flex shadow-lg">{rail}</div>
          ) : (
            rail
          )
        ) : null}

        <div className="flex min-w-0 min-h-0 flex-1 flex-col">
          {/* ⭐ THE TWO TOP-LEVEL VIEWS, above everything the page owns. */}
          {isError ? null : topTabs}
          {isError ? (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 bg-white">
              <p className="text-body text-kit-slate-12">{MONITOR_COPY.loadFailed}</p>
              {((ordersQ.error ?? docsQ.error) as Error | undefined)?.message ? (
                <p className="text-meta text-kit-slate-11">
                  {((ordersQ.error ?? docsQ.error) as Error).message}
                </p>
              ) : null}
              <button
                type="button"
                className="rounded-control border border-kit-slate-6 bg-white px-3 py-1.5 text-meta font-medium text-kit-slate-12 hover:bg-kit-slate-3"
                onClick={() => {
                  void ordersQ.refetch();
                  void docsQ.refetch();
                }}
              >
                {MONITOR_COPY.tryAgain}
              </button>
            </div>
          ) : calendarMode ? (
            <>
              {/* The calendar toolbar: where the window stands, Day · Week ·
                  Month, and the one search. */}
              <div className="flex h-11 shrink-0 items-center gap-3 border-b border-kit-slate-5 bg-white px-3">
                {!railVisible ? showFiltersButton : null}
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    aria-label={previousLabel}
                    data-testid="delivery-monitor-previous"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control border border-kit-slate-6 bg-white text-kit-slate-11 hover:bg-hovertint"
                    onClick={goPrevious}
                  >
                    <ChevronLeft size={16} />
                  </button>
                  {isPhone ? (
                    /* The phone's full month opens through the kit's one
                       STANDARD date control (UI-KIT §11) — never a squeezed
                       desktop calendar. */
                    <div className="w-36 shrink-0" data-testid="delivery-monitor-date-control">
                      <DatePicker
                        id="delivery-monitor-date"
                        value={selectedDate}
                        onChange={(iso) => {
                          if (iso) pickCalendarDate(iso);
                        }}
                      />
                    </div>
                  ) : (
                    <span
                      className="min-w-0 truncate px-1 text-body font-medium text-kit-slate-12"
                      data-testid="delivery-monitor-range"
                    >
                      {rangeLabel}
                    </span>
                  )}
                  <button
                    type="button"
                    aria-label={nextLabel}
                    data-testid="delivery-monitor-next"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control border border-kit-slate-6 bg-white text-kit-slate-11 hover:bg-hovertint"
                    onClick={goNext}
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
                {calendarControl}
                <input
                  type="search"
                  value={q}
                  placeholder={MONITOR_COPY.search}
                  /* min-w-0 lets the box yield on a phone so the window
                     arrows and the date control always stay reachable. */
                  className="ml-auto h-8 w-full min-w-0 max-w-60 rounded-control border border-kit-slate-6 bg-white px-2.5 text-body text-kit-slate-12 placeholder:text-kit-slate-9"
                  onChange={(e) => setParam("q", e.target.value, true)}
                />
              </div>
              {filterSummary}
              {/* THE CALENDAR'S OWN BOUNDARY, stated rather than discovered:
                  an unconfirmed delivery is not here, it is in the chase. */}
              <div
                className="shrink-0 border-b border-kit-slate-5 bg-white px-3 py-1 text-label text-kit-slate-9"
                data-testid="delivery-monitor-calendar-scope"
              >
                {MONITOR_COPY.calendarScope}
              </div>

              {calendarView === "day" ? (
                /* ── THE DAY LIST — one operating day, the same cards and
                   order on every viewport; on a phone the ONLY calendar. ── */
                <div className="min-h-0 flex-1 overflow-y-auto" data-testid="delivery-monitor-daily">
                  <div className="sticky top-0 z-10 border-b border-kit-slate-5 bg-white px-3 py-2 text-body font-semibold text-kit-slate-12">
                    {fmtDate(selectedDate)}
                  </div>
                  {dayCards(selectedDate)}
                </div>
              ) : !isLoading && calendarCards.length === 0 ? (
                q.trim() ? (
                  /* A search that matches nothing is a FILTERED empty — a
                     different fact from a genuinely empty range. */
                  <div
                    className="flex min-h-0 flex-1 items-center justify-center px-4 text-body text-kit-slate-11"
                    data-testid="delivery-monitor-empty-search"
                  >
                    {MONITOR_COPY.emptySearch}
                  </div>
                ) : (
                  emptyRange
                )
              ) : calendarView === "month" ? (
                /* ── THE MONTH — compact counts per date, never cards; a
                   date click opens its Day. ──────────────────────────────── */
                <MonitorMonthView
                  monthOfIso={selectedDate}
                  selectedIso={selectedDate}
                  countsByDay={countsByDay}
                  onSelect={pickCalendarDate}
                  testId="delivery-monitor-month-view"
                />
              ) : (
                /* ── THE WEEK'S COLUMNS — six on desktop, three on a tablet,
                   always fitting the available width (no horizontal date
                   scrolling; vertical scrolling inside the days). ───────── */
                <div className="min-h-0 flex-1 overflow-y-auto" aria-busy={isLoading}>
                  <div
                    className={`grid h-full divide-x divide-kit-slate-4 ${
                      viewport === "tablet" ? "grid-cols-3" : "grid-cols-6"
                    }`}
                  >
                    {visibleDays.map((iso) => (
                      <div
                        key={iso}
                        className="flex min-h-0 min-w-0 flex-col"
                        data-testid={`delivery-monitor-day-${iso}`}
                      >
                        <div className="sticky top-0 z-10 border-b border-kit-slate-5 bg-white px-2 py-1.5 text-body font-semibold text-kit-slate-12">
                          {fmtDate(iso)}
                        </div>
                        {dayCards(iso)}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            /* ── THE WORK LIST — the standard selectable Register ──────────── */
            <>
              {filterSummary}
              {contactWeekStrip}
              {isPhone ? (
                /* ⭐ MOBILE IS A LIST, NOT A SQUEEZED SHEET. Same rows, same
                   order, same words — and the three facts a chase needs are
                   on the card, never behind a Columns chooser. Bulk selection
                   stays a desk act: a phone assigns one delivery at a time. */
                <>
                {/* The rail is a DRAWER on a phone, so the door back to it
                    must stay on screen — the sheet's toolbar is not here to
                    carry it. */}
                <div className="flex h-11 shrink-0 items-center gap-3 border-b border-kit-slate-5 bg-white px-3">
                  {!railVisible ? showFiltersButton : null}
                  <input
                    type="search"
                    value={phoneSearch}
                    placeholder={MONITOR_COPY.search}
                    className="ml-auto h-8 w-full min-w-0 rounded-control border border-kit-slate-6 bg-white px-2.5 text-body text-kit-slate-12 placeholder:text-kit-slate-9"
                    data-testid="delivery-monitor-work-list-search"
                    onChange={(e) => setPhoneSearch(e.target.value)}
                  />
                </div>
                <div
                  className="min-h-0 flex-1 overflow-y-auto p-2"
                  data-testid="delivery-monitor-work-list"
                  aria-busy={isLoading}
                >
                  {phoneRows.length === 0 ? (
                    <div className="px-1 py-3 text-body text-kit-slate-9">
                      {cards.length === 0 ? MONITOR_COPY.emptyList : MONITOR_COPY.emptySearch}
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-col gap-1.5">
                        {phoneRows.map((card) => (
                          <MonitorWorkCard
                            key={card.scopeId}
                            card={card}
                            onAssign={(r) => setAssigning([r.scope])}
                            onEdit={openEditDelivery}
                            onOpenOrder={openOrder}
                          />
                        ))}
                      </div>
                      <div
                        className="px-1 py-2 text-meta text-kit-slate-11"
                        data-testid="delivery-monitor-work-list-footer"
                      >
                        {/* `{n} of {m} deliveries` while a search narrows —
                            the sheet's own footer grammar. */}
                        {deliveriesFooter(phoneRows.length, listRows.length)}
                      </div>
                    </>
                  )}
                </div>
                </>
              ) : (
              <div
                className="flex min-w-0 min-h-0 flex-1 flex-col p-2"
                data-testid="delivery-monitor-work-list"
              >
                <DataGrid<DeliveryMonitorCard>
                  appearance="reference"
                  rows={listRows}
                  columns={columns}
                  storageKey={WORK_LIST_STORAGE_KEY}
                  rowKey={(r) => r.scopeId}
                  exportName={MONITOR_COPY.page}
                  searchPlaceholder={MONITOR_COPY.search}
                  isLoading={isLoading}
                  emptyMessage={
                    cards.length === 0 ? MONITOR_COPY.emptyList : MONITOR_COPY.emptySearch
                  }
                  groupBanner={false}
                  /* ⭐ TWO PINS (owner ruling 2026-09-12). Scrolled to
                     `Actions`, one pin left the operator reading
                     `Call NETS — confirm delivery date` with no customer
                     attached to it. `SO No` is the identity; `Customer` is
                     whose row it is, and at 949px the sheet shows under a
                     third of its width at a time. */
                  stickyIdentity={{ columnKey: ["so", "customer"] }}
                  chooserGroupOrder={["Document", "Customer", "Delivery", "Dates", "Items"]}
                  /* A row on this workspace IS a delivery, so opening it
                     opens the delivery (owner correction 2026-08-24). */
                  onRowDoubleClick={openEditDelivery}
                  contextMenu={contextMenu}
                  expandTitle={DW.showItems}
                  expandable={{
                    renderExpansion: (r) => <ScopeExpansion row={r.scope} />,
                  }}
                  selectable={{
                    selectedKeys: selected,
                    onToggle: toggleRow,
                    onToggleAll: toggleAll,
                  }}
                  /* `{N} selected · Clear · Assign logistics` — no invented
                     unit word and nothing between the three (owner correction
                     2026-09-07); the sheet's Export stays on the normal toolbar. */
                  selectionSummary={selectedSentence}
                  hideSelectionExport
                  selectionActions={[
                    ...(allUnassigned
                      ? [
                          {
                            /* Bulk initial assignment — Delivery's own write,
                               through the ONE governed door. */
                            label: () => ASSIGN_LOGISTICS,
                            kind: "write" as const,
                            onClick: (rows: never[]) =>
                              setAssigning(
                                (rows as unknown as DeliveryMonitorCard[]).map((c) => c.scope),
                              ),
                          },
                        ]
                      : []),
                    ...(oneAssigned
                      ? [
                          {
                            /* ONE assigned row — the governed reason/history
                               flow. Never a batch replacement. */
                            label: () => CHANGE_LOGISTICS,
                            kind: "write" as const,
                            onClick: (rows: never[]) =>
                              setAssigning(
                                (rows as unknown as DeliveryMonitorCard[]).map((c) => c.scope),
                              ),
                          },
                        ]
                      : []),
                    {
                      /* ONE row only — Edit Delivery opens a single
                         arrangement. */
                      label: () => EDIT_DELIVERY,
                      kind: "write",
                      visible: (n) => n === 1,
                      onClick: (rows) => {
                        const row = (rows as unknown as DeliveryMonitorCard[])[0];
                        if (row) openEditDelivery(row);
                      },
                    },
                  ]}
                  toolbarStart={
                    <>
                      {!railVisible ? showFiltersButton : null}
                      {calendarControl}
                    </>
                  }
                  statusSummary={(filtered) => {
                    const line = deliveriesFooter(filtered.length, listRows.length);
                    return (
                      <span className="block truncate" title={line}>
                        {line}
                      </span>
                    );
                  }}
                />
              </div>
              )}
            </>
          )}
        </div>
      </div>

      {assigning && assigning.length > 0 && (
        <AssignLogisticsDialog
          scopes={assigning}
          open
          onOpenChange={(next) => {
            if (!next) setAssigning(null);
          }}
          onAssigned={() => {
            /* The picks are spent: leaving them ticked would offer `Assign
               logistics` again over scopes that just took one. */
            setSelected(new Set());
            setAssigning(null);
            void ordersQ.refetch();
            void arrangementsQ.refetch();
          }}
        />
      )}
    </div>
  );
}
