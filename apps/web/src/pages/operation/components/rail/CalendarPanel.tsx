import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import Select from "@/components/kit/Select";
import MonthCalendar from "@/components/kit/MonthCalendar";
import {
  documentDisplayNumber,
  type WarehouseCalendarArrival,
  carrierDayLoads,
  carrierDayNote,
  daysInRange,
  deliveryRange,
  DELIVERY_RANGE_KEYS,
  partnerDeliveryRules,
  type CarrierDayLoad,
  type DayBooking,
  type DeliveryRangeKey,
  type PartnerDeliveryRules,
} from "@carres/shared";
import {
  useOperationOrders,
  useWarehouseCalendar,
  useDeliveryPartners,
  type operationOrderListRow,
} from "@/lib/queries";
import { orderBookingDay } from "@/lib/order-booking";
import { cjkClassName } from "@/lib/cjk";
import { locationForAddress } from "@/lib/region";
import { appTodayIso, fmtDate, fmtDateShort } from "@/lib/fmt-date";
import { displayCustomerName } from "@/lib/customer-name";

/** Shared Calendar reads owning-module dates. Expected Warehouse arrangements
 * and actual receipts are separate event types; Receiving never republishes
 * the same arrival. Module, location and day survive the record round trip. */
/** The chip's own text. A single-day range names its day; the span keeps the
 *  one ruled span word. This is the only place the three chips are worded. */
function rangeChipLabel(key: DeliveryRangeKey, fromIso: string): string {
  return key === "week" ? "This week" : fmtDate(fromIso);
}

/** One booked delivery, as the calendar shows it. */
interface DayDelivery extends DayBooking {
  orderId: string;
  so: number;
  customer: string;
  slot: string | null;
  address: string | null;
}

export default function CalendarPanel({ onOpenRecord }: { onOpenRecord?: () => void } = {}) {
  const deliveryQuery = useOperationOrders();
  const data = deliveryQuery.data;
  const orders = useMemo(() => data?.orders ?? [], [data]);
  const warehouseQuery = useWarehouseCalendar();
  const { data: partnersData } = useDeliveryPartners();
  const [params, setParams] = useSearchParams();
  const moduleValue = params.get("calendarModule");
  const module = moduleValue === "delivery" || moduleValue === "warehouse" ? moduleValue : "all";
  const location = module === "warehouse" ? params.get("calendarLocation") : null;
  const setCalendarFilter = (key: string, value: string | null) => {
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      if (value) next.set(key, value); else next.delete(key);
      if (key === "calendarModule" && value !== "warehouse") next.delete("calendarLocation");
      return next;
    }, { replace: true });
  };
  const calendarHref = (href: string, day: string) => {
    const [path, query = ""] = href.split("?");
    const next = new URLSearchParams(query);
    for (const key of ["calendarModule", "calendarLocation", "calendarDay", "calendarRange"])
      if (params.get(key)) next.set(key, params.get(key)!);
    next.set("calendarDay", day);
    return `${path}?${next}`;
  };

  // T9 logistics rules, keyed by company. A row that has never been
  // edited normalises to DEFAULT — zero warnings, which is every live company
  // today (silence over a false alarm).
  const rulesByPartner = useMemo(() => {
    const m = new Map<string, PartnerDeliveryRules>();
    for (const p of partnersData?.partners ?? []) {
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
  }, [partnersData]);


  const carrierOf = (o: operationOrderListRow): { id: string | null; name: string | null } => ({
    id: o.delivery_partner_id ?? o.ops_assigned_logistic ?? null,
    name: o.delivery_partners?.name ?? null,
  });

  // Bucket deliveries by the BOOKING day (T10) — confirmed date when the
  // customer said yes, otherwise the logistics company's provisional date. An order with
  // neither is not on any day; it is a queue item (Assign / confirm the date).
  const deliveriesByDay = useMemo(() => {
    const m = new Map<string, DayDelivery[]>();
    for (const o of orders) {
      const booking = orderBookingDay(o);
      if (booking.kind === "none" || !booking.date) continue;
      const carrier = carrierOf(o);
      const entry: DayDelivery = {
        orderId: o.id,
        so: o.so,
        customer: displayCustomerName(o.customer_name),
        partnerId: carrier.id,
        partnerName: carrier.name,
        kind: booking.kind,
        date: booking.date,
        slot: booking.slot,
        address: o.customer_address ?? null,
        // No `cancelled` flag to set: the list endpoint filters status IN
        // (place, proceed_order, delivered), so a cancelled order never
        // reaches this panel. `DayBooking.cancelled` exists for callers that
        // read a wider status set.
      };
      const arr = m.get(booking.date) ?? [];
      arr.push(entry);
      m.set(booking.date, arr);
    }
    return m;
  }, [orders]);

  // One Warehouse-owned read, with expected arrangements and physical receipt
  // events kept distinct. No second arrival is published by Receiving.
  const receiveByDay = useMemo(() => {
    const map = new Map<string, WarehouseCalendarArrival[]>();
    if (module === "delivery") return map;
    for (const event of warehouseQuery.data?.events ?? []) {
      if (location && location !== "all" && event.siteId !== location) continue;
      const rows = map.get(event.date) ?? [];
      rows.push(event); map.set(event.date, rows);
    }
    return map;
  }, [warehouseQuery.data, module, location]);
  const activeCount = (key: string): number =>
    (receiveByDay.get(key)?.length ?? 0) + (module === "warehouse" ? 0 : deliveriesByDay.get(key)?.length ?? 0);
  const loading = (module !== "delivery" && warehouseQuery.isPending) || (module !== "warehouse" && deliveryQuery.isPending);
  const failed = (module !== "delivery" && warehouseQuery.error) || (module !== "warehouse" && deliveryQuery.error);

  const todayKey = appTodayIso();
  const savedDay = params.get("calendarDay");
  const picked = savedDay && /^\d{4}-\d{2}-\d{2}$/.test(savedDay)
    && !Number.isNaN(Date.parse(savedDay))
    && new Date(savedDay).toISOString().slice(0, 10) === savedDay ? savedDay : null;
  const initialDay = picked ?? todayKey;
  const [view, setView] = useState({ y: Number(initialDay.slice(0, 4)), m: Number(initialDay.slice(5, 7)) - 1 });
  // T10: exactly ONE of these is active. A range chip clears the picked day; a
  // grid click clears the range. Default = Today, so the panel opens on the
  // question an operator actually has.
  const savedRange = params.get("calendarRange");
  const range: DeliveryRangeKey | null = picked ? null
    : DELIVERY_RANGE_KEYS.includes(savedRange as DeliveryRangeKey) ? savedRange as DeliveryRangeKey : "today";

  const activeRange = range ? deliveryRange(range, todayKey) : null;
  const shownDays = activeRange
    ? daysInRange(activeRange.fromIso, activeRange.toIso)
    : picked
      ? [picked]
      : [];

  const dayIsEmpty = (d: string) => activeCount(d) === 0;
  const hasAnything = shownDays.some((d) => !dayIsEmpty(d));

  return (
    <div className="flex flex-col h-full">
      <div className="mb-3 space-y-2">
        <Select id="calendar-module" label="Filter by module" value={module}
          onValueChange={(value) => setCalendarFilter("calendarModule", value)}
          options={[{ value: "all", label: "All modules" }, { value: "delivery", label: "Delivery" }, { value: "warehouse", label: "Warehouse" }]} />
        {module === "warehouse" && <Select id="calendar-location" label="Filter by location" value={location ?? "all"}
          onValueChange={(value) => setCalendarFilter("calendarLocation", value)}
          options={[{ value: "all", label: "All" }, ...(warehouseQuery.data?.sites ?? []).map((site) => ({ value: site.id, label: site.name }))]} />}
      </div>
      {loading && <p role="status" className="text-meta text-base-500">Loading…</p>}
      {failed && <p role="alert" className="text-meta text-danger">The schedule could not be read for this date.</p>}
      {module !== "delivery" && (warehouseQuery.data?.undatedReceipts ?? 0) > 0 && <p className="text-meta text-base-500">Goods Received Date · Not recorded · {warehouseQuery.data!.undatedReceipts}</p>}
      {/* T10 range chips — Today / Tomorrow / This week. "This week" is the
          REST of the week, ending Saturday (Sunday is not a delivery day). */}
      <div className="flex gap-1 mb-2" data-testid="calendar-ranges">
        {DELIVERY_RANGE_KEYS.map((key) => {
          const r = deliveryRange(key, todayKey);
          const active = range === key;
          return (
            <button
              key={key}
              type="button"
              data-testid={`calendar-range-${key}`}
              onClick={() => {
                setParams((previous) => {
                  const next = new URLSearchParams(previous);
                  next.set("calendarRange", key); next.delete("calendarDay"); return next;
                }, { replace: true });
                // Jump the grid to the month the range lives in.
                const [y, m] = r.fromIso.split("-").map(Number);
                if (y && m) setView({ y, m: m - 1 });
              }}
              /* A SPAN still needs its hover — `This week` names no date.
                 A single-day chip does NOT: THE YEAR RULE (owner ruling
                 2026-08-15) put the full ruled date on the chip face, so a
                 hover could only ever repeat it or, worse, say less. */
              title={
                r.fromIso === r.toIso
                  ? undefined
                  : `${fmtDateShort(r.fromIso)} to ${fmtDateShort(r.toIso)}`
              }
              className={`flex-1 flex items-center justify-center gap-1 rounded-lg px-2 py-1 text-label font-semibold transition-colors ${
                active
                  ? "bg-base-900 text-white"
                  : "bg-white text-base-500 border border-base-200 hover:bg-hovertint"
              }`}
            >
              <span className="truncate">{rangeChipLabel(key, r.fromIso)}</span>
            </button>
          );
        })}
      </div>

      <MonthCalendar
        month={`${view.y}-${String(view.m + 1).padStart(2, "0")}`}
        onMonthChange={(month) => {
          const [y, m] = month.split("-").map(Number);
          setView({ y, m: m - 1 });
        }}
        selected={picked ?? (activeRange?.fromIso === activeRange?.toIso ? activeRange?.fromIso ?? null : null)}
        onSelect={(day) => setCalendarFilter("calendarDay", day)}
        testId="shared-calendar-month"
      />

      {/* The days themselves — one block per day in the active range (or the
          one picked day). Content adapts to the active tab. */}
      <div className="mt-3 pt-3 border-t border-base-200 flex-1 overflow-auto space-y-4">
        {shownDays.length === 0 && (
          <div className="text-meta text-base-400 text-center py-4">
            Pick a day, or Today / Tomorrow / This week.
          </div>
        )}
        {shownDays.length > 1 && !hasAnything && !loading && !failed && (
          <div className="text-meta text-base-400 text-center py-4">
            Nothing on the books for these days.
          </div>
        )}
        {shownDays.map((day) => {
          const dayDeliveries = module === "warehouse" ? [] : deliveriesByDay.get(day) ?? [];
          const dayReceive = receiveByDay.get(day) ?? [];
          // On a multi-day range an empty day is noise; on ONE day it is the
          // answer ("nothing that day") and must still be said out loud.
          if (shownDays.length > 1 && dayIsEmpty(day)) return null;
          const loads = carrierDayLoads(dayDeliveries, day, rulesByPartner);
          return (
            <div key={day} data-testid={`calendar-day-${day}`}>
              {/* The heading is the DAY, spelled the one ruled way. It used to
                  read `TODAY · 15 AUG 26`, and the relative half was the only
                  part an operator read — on the wrong morning it was a lie. */}
              <div className="text-label uppercase tracking-[0.05em] text-base-500 mb-2">
                {fmtDate(day)}
              </div>

              {dayIsEmpty(day) && shownDays.length === 1 && !loading && !failed && (
                <div className="text-meta text-base-400 text-center py-3">No dated events this day.</div>
              )}
              {(["expected_arrival", "actual_arrival"] as const).map((kind) => {
                const rows = dayReceive.filter((row) => row.kind === kind);
                if (!rows.length) return null;
                return <DaySection key={kind}
                  onOpenRecord={onOpenRecord}
                  title={kind === "expected_arrival" ? `Warehouse · ${rows.length} arriving` : `Warehouse · GRN Records · ${rows.length}`}
                  tone="text-base-700"
                  items={rows.map((row) => ({
                    key: row.id,
                    main: documentDisplayNumber(row.receiptRef ?? row.sourceRef ?? "Not recorded"),
                    sub: `${row.siteName ?? "Not recorded"} · ${kind === "expected_arrival" ? "Pending Delivery Qty" : "Physical arrived Qty"} ${row.expectedQty ?? row.physicalQty ?? "Not recorded"}${row.extraQty ? ` · Extra Qty ${row.extraQty}` : ""}`,
                    href: calendarHref(row.href, day),
                  }))} />;
              })}
              {dayDeliveries.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-label uppercase tracking-[0.05em] text-info">Delivery · {dayDeliveries.length} scheduled {dayDeliveries.length === 1 ? "delivery" : "deliveries"}</div>
                  {dayDeliveries.map((d) => <DeliveryRow key={d.orderId} d={d} onOpenRecord={onOpenRecord} href={calendarHref(`/operation?tab=delivery&view=day&date=${day}`, day)} />)}
                  {loads.map((l) => (
                    <CarrierLoadRow key={l.partnerId ?? "none"} load={l} />
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

/** One booked delivery. Confirmed is the ONLY green (T1): the customer said
 *  yes. The carrier's own date is amber — a date nobody has agreed to. */
function DeliveryRow({ d, href, onOpenRecord }: { d: DayDelivery; href: string; onOpenRecord?: () => void }) {
  const confirmed = d.kind === "confirmed";
  const loc = locationForAddress(d.address);
  const carrier = d.partnerName?.trim() || "Logistics not assigned";
  return (
    <Link to={href} onClick={onOpenRecord}
      className="flex gap-2 rounded bg-base-50 hover:bg-base-100 px-2 py-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kit-blue-9"
      title={
        confirmed
          ? "The customer confirmed this date."
          : "Only logistics have given this date. Not confirmed with the customer yet."
      }
    >
      <span className={`w-1 rounded-full shrink-0 ${confirmed ? "bg-success" : "bg-warning"}`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-meta font-semibold text-base-900">SO-{d.so}</span>
          <span
            className={`text-label font-semibold shrink-0 ${confirmed ? "text-success" : "text-warning"}`}
          >
            {confirmed ? (d.slot ? shortSlot(d.slot) : "Confirmed") : "Logistics' date"}
          </span>
        </div>
        <div className={`text-meta text-base-700 truncate ${cjkClassName(d.customer)}`}>
          {d.customer || ""}
        </div>
        <div className="text-label text-base-500 truncate">
          {carrier}
          {loc.label ? ` · ${loc.label}` : ""}
        </div>
      </div>
    </Link>
  );
}

/** "Afternoon (12pm–3pm)" → "12pm–3pm" — the drawer's short-slot read. */
function shortSlot(slot: string): string {
  return /\(([^)]+)\)/.exec(slot)?.[1] ?? slot;
}

/** What a carrier is carrying that day, plus the one sentence its own rules
 *  earn (T9). Silence is the normal case: a carrier with no rules recorded
 *  shows its load and says nothing. */
function CarrierLoadRow({ load }: { load: CarrierDayLoad }) {
  const note = carrierDayNote(load);
  const alert = !load.runs || load.atLimit;
  return (
    <div className="px-2 pt-1">
      <div
        className={`flex items-center justify-between gap-2 text-label ${
          alert ? "text-warning font-semibold" : "text-base-500"
        }`}
      >
        <span className="truncate">{load.partnerName}</span>
        <span className="tabular-nums shrink-0">
          {load.capacity != null
            ? `${load.confirmed} of ${load.capacity}`
            : `${load.confirmed + load.provisional}`}
        </span>
      </div>
      {note && <div className="text-label text-warning mt-0.5">{note}</div>}
    </div>
  );
}

function DaySection({
  title,
  tone,
  items,
  onOpenRecord,
}: {
  title: string;
  tone: string;
  items: Array<{ key: string; main: string; sub: string; href: string }>;
  onOpenRecord?: () => void;
}) {
  return (
    <div className="mb-3">
      <div className={`text-label uppercase tracking-[0.05em] mb-1.5 ${tone}`}>{title}</div>
      <div className="space-y-1.5">
          {items.map((it) => (
            <Link key={it.key} to={it.href} onClick={onOpenRecord} className="flex gap-2 rounded bg-base-50 hover:bg-base-100 px-2 py-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kit-blue-9">
              <div className="min-w-0 flex-1">
                <div className="font-mono text-meta font-semibold text-base-900 break-words">
                  {it.main}
                </div>
                <div className="text-label text-base-500">{it.sub}</div>
              </div>
            </Link>
          ))}
      </div>
    </div>
  );
}
