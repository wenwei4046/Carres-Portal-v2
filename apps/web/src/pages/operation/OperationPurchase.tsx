/**
 * OperationPurchase — the Purchase / To-Order cockpit (LOCKED design 2026-07-22).
 *
 * See `docs/purchase-cockpit-handoff.md` §5 for the full spec.
 * UI text follows `docs/COPY-STANDARD.md` (vocabulary + row action-line +
 * "What to do" step block). Header follows `docs/UI-KIT.md` "Module-tab law"
 * — the tab bar IS the title, so `<ListPageShell>` gets no breadcrumb / title.
 *
 * LAYOUT (uses width, saves height — 1000 orders/month, max 15 suppliers/day):
 *
 *   PurchasingTabs · [ Today · Wed 22 Jul · ⟳ ]      ← tab bar right slot
 *   ────────────────────────────────────────────────
 *   FACET   │ KPI strip (Send · Chase · Receive)     ← stage switcher
 *   240px   │ This week's plan (Mon-anchor cadence)  ← ① Send only
 *           │ Days-to-order strip (14 days)
 *           │ Today: <lead line>
 *           ├───────────────────────┬─────────────────
 *           │ MIDDLE LIST (~420px)  │ DETAIL (fills)
 *           │ ≤15 rows @ ~46px      │ SKU table + What to do
 *           └───────────────────────┴─────────────────
 *
 * VOCAB: ① Send · ② Chase · ③ Receive. Internal stage key stays `"place"`
 *        to preserve URL param + wire compatibility; all user-facing labels
 *        say Send. See COPY-STANDARD §Vocabulary for why Send ≠ Place.
 *
 * Read-only: every write affordance (Send PO / Chase on WhatsApp / Check-in /
 * Something wrong) is a STUB. Actually raising a PO / booking a GRN is a
 * later unit (see handoff §6 LATER UNITS). No order-write path is touched.
 *
 * Design: UI-KIT v4 — token classes only (no raw hex), Lucide icons, `.pill`
 * status tones, English-only copy, `Btn` primitive, date via `fmtDate()`.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Factory,
  Info,
  MessageCircle,
  Minus,
  PackageCheck,
  RefreshCw,
  Send,
  Truck,
  type LucideIcon,
} from "lucide-react";
import type {
  ProductCategory,
  PurchaseChase,
  PurchasePlaceGroup,
  PurchaseReceive,
  PurchaseUrgencyBucket,
} from "@carres/shared";
import ListPageShell, { type ActiveChip } from "@/components/ListPageShell";
import Btn from "@/components/Btn";
import PurchasingTabs from "./PurchasingTabs";
import { fmtDate, fmtDateShort } from "@/lib/fmt-date";
import { buildSupplierChase } from "@/lib/wa-templates";
import type { SupplierRow } from "@/lib/queries";
import { usePurchaseToday, useOperationSuppliers } from "@/lib/queries";

// ── Types ────────────────────────────────────────────────────────────────────

type Stage = "place" | "chase" | "receive";
type Attn = "overdue" | "missing" | null;

type Selection =
  | { kind: "place"; supplierId: string }
  | { kind: "chase"; poId: string }
  | { kind: "receive"; poId: string }
  | null;

// ── Small pure helpers ───────────────────────────────────────────────────────

/** Calendar days between two ISO dates (`to − from`), or null if either bad. */
function daysBetween(fromIso: string | null, toIso: string | null): number | null {
  if (!fromIso || !toIso) return null;
  const a = new Date(`${fromIso.slice(0, 10)}T00:00:00`);
  const b = new Date(`${toIso.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/** Return ISO of `iso + n` calendar days. Uses UTC to avoid the MYT-offset
 *  round-trip bug: a bare `T00:00:00` parse is LOCAL, but `toISOString()` is
 *  UTC, so in a UTC+8 browser the roundtrip shifts the day back by 1. Parsing
 *  as `T00:00:00Z` + `setUTCDate` keeps every day-of-year computation stable. */
function addDaysIso(iso: string, n: number): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 0 = Sun · 1 = Mon · ... · 6 = Sat (UTC-consistent with addDaysIso). */
function dayOfWeek(iso: string): number {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`).getUTCDay();
}

/** Short weekday name: "Mon"/"Tue"/etc. */
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
function dayName(iso: string): string {
  return DOW[dayOfWeek(iso)];
}

/** Short in-cell day label: "22 Jul" (UTC-consistent — see addDaysIso). */
function dayLabelShort(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return `${d.getUTCDate()} ${d.toLocaleString("en-GB", { month: "short", timeZone: "UTC" })}`;
}

/** Phone → wa.me base link (MY-aware). Local copy of OperationPayments.waLink so
 *  this page doesn't pull in the payments module. */
function waLink(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const first = phone.split(/[|,/]/)[0] ?? "";
  let d = first.replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("60")) {
    /* already international */
  } else if (d.startsWith("0")) {
    d = `60${d.slice(1)}`;
  } else {
    d = `60${d}`;
  }
  return `https://wa.me/${d}`;
}

const CATEGORY_KIND: Record<ProductCategory, string> = {
  mattress: "mattress factory",
  bedframe: "bed-frame factory",
  sofa: "sofa factory",
  accessory: "accessory supplier",
  service: "service",
};

interface UrgencyStyle {
  cls: string;
  Icon: LucideIcon;
  label: string;
}
function urgencyStyle(u: PurchaseUrgencyBucket): UrgencyStyle {
  switch (u) {
    case "late":
      return { cls: "pill-overdue", Icon: AlertCircle, label: "Late" };
    case "urgent":
      return { cls: "pill-overdue", Icon: AlertCircle, label: "Send now" };
    case "due":
      return { cls: "pill-warning", Icon: Clock, label: "Due soon" };
    case "scheduled":
      return { cls: "pill-sent", Icon: Clock, label: "Scheduled" };
    case "no_deadline":
      return { cls: "pill-neutral", Icon: Minus, label: "No deadline" };
    default:
      return { cls: "pill-neutral", Icon: Minus, label: "—" };
  }
}

/** Row action-line per COPY-STANDARD row template (verb + object + when). */
function placeActionLine(g: PurchasePlaceGroup, today: string | null): string {
  const name = g.supplierName ?? "the factory";
  if (g.urgency === "late" && g.earliestOrderBy && today) {
    const late = daysBetween(g.earliestOrderBy, today) ?? 0;
    if (late > 0) return `Send order to ${name} today — ${late}d late.`;
    return `Send order to ${name} today.`;
  }
  if (g.urgency === "urgent") return `Send order to ${name} today.`;
  if (g.urgency === "due" && g.earliestOrderBy) {
    return `Prepare order to ${name} by ${dayName(g.earliestOrderBy)}.`;
  }
  if (g.urgency === "no_deadline")
    return `${name} — waiting on a deadline before we can plan.`;
  if (g.earliestOrderBy)
    return `Order to ${name} from ${dayName(g.earliestOrderBy)}.`;
  return `Review the ${name} order.`;
}

function chaseActionLine(r: PurchaseChase, supplierName: string): string {
  if (r.daysLate > 0) return `Chase ${supplierName} — ${r.daysLate}d late.`;
  return `Remind ${supplierName} — check ready date.`;
}

function receiveActionLine(r: PurchaseReceive, supplierName: string): string {
  const total = r.items.reduce((s, it) => s + it.outstanding, 0);
  return `Check in from ${supplierName} (${total} item${total === 1 ? "" : "s"}).`;
}

/** Customer names for a place group's line "FOR" column, "+N more" when many. */
function forSummary(
  forOrders: PurchasePlaceGroup["lines"][number]["forOrders"],
  max = 2,
): string {
  const names = forOrders
    .map((o) => o.customerName?.trim() || (o.so ? `SO-${o.so}` : null))
    .filter((s): s is string => Boolean(s));
  if (names.length === 0) return "—";
  if (names.length <= max) return names.join(", ");
  return `${names.slice(0, max).join(", ")} +${names.length - max} more`;
}

// ── Days-to-order strip helpers ──────────────────────────────────────────────

/** 14 ISO days from today (inclusive). */
function next14Days(todayIso: string | null): string[] {
  if (!todayIso) return [];
  return Array.from({ length: 14 }, (_, i) => addDaysIso(todayIso, i));
}

interface DayBucket {
  iso: string;
  units: number;
  status: "late" | "today" | "due" | "empty";
}

/** Bucket the ① Send groups (or ② Chase / ③ Receive rows) by their key date. */
function bucketByDay(
  days: string[],
  todayIso: string | null,
  keyDates: Array<{ date: string | null; units: number }>,
): DayBucket[] {
  const counts = new Map<string, number>();
  let overflowLate = 0;
  for (const k of keyDates) {
    if (!k.date) continue;
    if (todayIso && k.date < todayIso) {
      overflowLate += k.units;
      continue;
    }
    counts.set(k.date, (counts.get(k.date) ?? 0) + k.units);
  }
  return days.map((iso, i) => {
    const units = (counts.get(iso) ?? 0) + (i === 0 ? overflowLate : 0);
    let status: DayBucket["status"] = "empty";
    if (units > 0) {
      if (i === 0 && overflowLate > 0) status = "late";
      else if (i === 0) status = "today";
      else status = "due";
    }
    return { iso, units, status };
  });
}

// ── This week's plan (Mon-anchor cadence) ────────────────────────────────────

/**
 * Return the ISO of {this / next} Monday · Wednesday · Friday from `todayIso`.
 * If today IS one of those days, that day is returned as-is (still fireable).
 */
function upcomingCadenceDays(todayIso: string): {
  mon: string;
  wed: string;
  fri: string;
} {
  const dow = dayOfWeek(todayIso); // 0 = Sun
  // Days from today until the next Mon (1). Sun → 1, Mon → 0, Tue → 6, …
  const dMon = (1 - dow + 7) % 7;
  const dWed = (3 - dow + 7) % 7;
  const dFri = (5 - dow + 7) % 7;
  return {
    mon: addDaysIso(todayIso, dMon),
    wed: addDaysIso(todayIso, dWed),
    fri: addDaysIso(todayIso, dFri),
  };
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function OperationPurchase() {
  const { data, isLoading, isError, error, refetch } = usePurchaseToday();
  const suppliersQ = useOperationSuppliers();
  const [facetOpen, setFacetOpen] = useState(true);
  const [stage, setStage] = useState<Stage>("place");
  const [supplierFilter, setSupplierFilter] = useState<string | null>(null);
  const [attn, setAttn] = useState<Attn>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection>(null);

  const supplierById = useMemo(() => {
    const m = new Map<string, SupplierRow>();
    for (const s of suppliersQ.data?.suppliers ?? []) m.set(s.id, s);
    return m;
  }, [suppliersQ.data]);
  const supplierName = useMemo(
    () => (id: string) => supplierById.get(id)?.name ?? "Factory",
    [supplierById],
  );

  const chase = data?.chase ?? [];
  const receive = data?.receive ?? [];
  const summary = data?.summary;
  const today = data?.today ?? null;

  // ① Send groups — resolve each supplier's display name (the engine leaves it
  // null; the web maps it via useOperationSuppliers, like the rest of the page).
  const placeGroups = useMemo(
    () =>
      (data?.placeGroups ?? []).map((g) => ({
        ...g,
        supplierName: g.supplierName ?? supplierName(g.supplierId),
      })),
    [data?.placeGroups, supplierName],
  );

  // Switching stage clears the per-stage facet filters + selection + selected day.
  const goStage = (s: Stage) => {
    setStage(s);
    setSupplierFilter(null);
    setAttn(null);
    setSelectedDay(null);
    setSelection(null);
  };

  // Stage counts — the KPI cards + the TODAY'S WORK facet read from these, so the
  // left numbers always tally the right list.
  const placeCount = placeGroups.length;
  const placeOverdue = placeGroups.filter((g) => g.urgency === "late").length;
  const missingCount = placeGroups.filter((g) => g.urgency === "no_deadline").length;
  const chaseCount = chase.length;
  const chaseLate = summary?.chaseLate ?? 0;
  const receiveCount = receive.length;

  // BY FACTORY facet — per-supplier units for the CURRENT stage.
  const byFactory = useMemo(() => {
    const m = new Map<string, number>();
    if (stage === "place") {
      for (const g of placeGroups) m.set(g.supplierId, g.totalUnits);
    } else if (stage === "chase") {
      for (const r of chase)
        m.set(
          r.supplierId,
          (m.get(r.supplierId) ?? 0) +
            r.items.reduce((s, it) => s + it.outstanding, 0),
        );
    } else {
      for (const r of receive)
        m.set(
          r.supplierId,
          (m.get(r.supplierId) ?? 0) +
            r.items.reduce((s, it) => s + it.outstanding, 0),
        );
    }
    return [...m.entries()]
      .map(([id, units]) => ({ id, units, name: supplierName(id) }))
      .sort((a, b) => b.units - a.units);
  }, [stage, placeGroups, chase, receive, supplierName]);

  // 14-day strip — buckets by the stage's key date. Send groups use
  // earliestOrderBy; chase rows use expectedReadyDate (ready → arrival);
  // receive rows use etaDate ?? expectedReadyDate.
  const stripDays = useMemo(() => next14Days(today), [today]);
  const stripBuckets = useMemo(() => {
    if (stage === "place")
      return bucketByDay(
        stripDays,
        today,
        placeGroups.map((g) => ({ date: g.earliestOrderBy, units: g.totalUnits })),
      );
    if (stage === "chase")
      return bucketByDay(
        stripDays,
        today,
        chase.map((r) => ({
          date: r.expectedReadyDate,
          units: r.items.reduce((s, it) => s + it.outstanding, 0),
        })),
      );
    return bucketByDay(
      stripDays,
      today,
      receive.map((r) => ({
        date: r.etaDate ?? r.expectedReadyDate,
        units: r.items.reduce((s, it) => s + it.outstanding, 0),
      })),
    );
  }, [stage, stripDays, today, placeGroups, chase, receive]);

  // Lead line under the strip — plain sentence per COPY-STANDARD.
  const leadLine = useMemo(() => {
    if (stage === "place") {
      if (placeCount === 0) return "Nothing to send today. Every live order is covered.";
      const late = placeOverdue;
      return late > 0
        ? `Today: ${placeCount} to send. ${late} ${late === 1 ? "is" : "are"} late.`
        : `Today: ${placeCount} to send. On track.`;
    }
    if (stage === "chase") {
      if (chaseCount === 0) return "Nothing to chase today. No factory is late.";
      return `Today: ${chaseCount} to chase. All past their promised date.`;
    }
    if (receiveCount === 0) return "Nothing to receive today. No goods arriving.";
    return `Today: ${receiveCount} to receive. Check in when they arrive.`;
  }, [stage, placeCount, placeOverdue, chaseCount, receiveCount]);

  // ── ① Send — the filtered middle list.
  const placeShown = useMemo(
    () =>
      placeGroups.filter((g) => {
        if (supplierFilter && g.supplierId !== supplierFilter) return false;
        if (attn === "overdue" && g.urgency !== "late") return false;
        if (attn === "missing" && g.urgency !== "no_deadline") return false;
        if (selectedDay) {
          // Overdue groups collapse into the "today" cell in the strip; keep
          // them visible when today is selected so the numbers match.
          if (selectedDay === today) {
            if (
              g.urgency !== "late" &&
              g.earliestOrderBy !== selectedDay
            )
              return false;
          } else if (g.earliestOrderBy !== selectedDay) return false;
        }
        return true;
      }),
    [placeGroups, supplierFilter, attn, selectedDay, today],
  );
  const chaseShown = useMemo(
    () =>
      chase.filter((r) => {
        if (supplierFilter && r.supplierId !== supplierFilter) return false;
        if (selectedDay) {
          if (selectedDay === today) {
            if (
              r.daysLate <= 0 &&
              r.expectedReadyDate !== selectedDay
            )
              return false;
          } else if (r.expectedReadyDate !== selectedDay) return false;
        }
        return true;
      }),
    [chase, supplierFilter, selectedDay, today],
  );
  const receiveShown = useMemo(
    () =>
      receive.filter((r) => {
        if (supplierFilter && r.supplierId !== supplierFilter) return false;
        if (selectedDay) {
          const key = r.etaDate ?? r.expectedReadyDate;
          if (selectedDay === today) {
            if (!key || key > selectedDay) return false;
          } else if (key !== selectedDay) return false;
        }
        return true;
      }),
    [receive, supplierFilter, selectedDay, today],
  );

  // Auto-select the first visible row when the list changes and the current
  // selection isn't visible any more (so the detail pane never sits empty).
  useEffect(() => {
    if (stage !== "place") return;
    const stillVisible =
      selection?.kind === "place" &&
      placeShown.some((g) => g.supplierId === selection.supplierId);
    if (stillVisible) return;
    setSelection(
      placeShown[0] ? { kind: "place", supplierId: placeShown[0].supplierId } : null,
    );
  }, [stage, placeShown, selection]);
  useEffect(() => {
    if (stage !== "chase") return;
    const stillVisible =
      selection?.kind === "chase" && chaseShown.some((r) => r.poId === selection.poId);
    if (stillVisible) return;
    setSelection(chaseShown[0] ? { kind: "chase", poId: chaseShown[0].poId } : null);
  }, [stage, chaseShown, selection]);
  useEffect(() => {
    if (stage !== "receive") return;
    const stillVisible =
      selection?.kind === "receive" &&
      receiveShown.some((r) => r.poId === selection.poId);
    if (stillVisible) return;
    setSelection(
      receiveShown[0] ? { kind: "receive", poId: receiveShown[0].poId } : null,
    );
  }, [stage, receiveShown, selection]);

  const selectedPlace =
    selection?.kind === "place"
      ? placeGroups.find((g) => g.supplierId === selection.supplierId) ?? null
      : null;
  const selectedChase =
    selection?.kind === "chase"
      ? chase.find((r) => r.poId === selection.poId) ?? null
      : null;
  const selectedReceive =
    selection?.kind === "receive"
      ? receive.find((r) => r.poId === selection.poId) ?? null
      : null;

  // Missing-deadline SO list — flagged in the top-of-list guard on ① Send.
  const missingSoLabels = useMemo(() => {
    const seen = new Set<string>();
    for (const g of placeGroups) {
      if (g.urgency !== "no_deadline") continue;
      for (const ln of g.lines)
        for (const o of ln.forOrders) if (o.so) seen.add(`SO-${o.so}`);
    }
    return [...seen];
  }, [placeGroups]);

  // Active-filter chips per §5.3 — one X-able chip per active filter.
  const activeChips: ActiveChip[] = [];
  if (attn === "overdue")
    activeChips.push({ label: "Late only", onClear: () => setAttn(null) });
  if (attn === "missing")
    activeChips.push({ label: "No deadline", onClear: () => setAttn(null) });
  if (supplierFilter)
    activeChips.push({
      label: `Factory: ${supplierName(supplierFilter)}`,
      onClear: () => setSupplierFilter(null),
    });
  if (selectedDay)
    activeChips.push({
      label: `Day: ${dayName(selectedDay)} ${dayLabelShort(selectedDay)}`,
      onClear: () => setSelectedDay(null),
    });

  const toggleSupplier = (id: string) =>
    setSupplierFilter((cur) => (cur === id ? null : id));

  // ── Error state ─────────────────────────────────────────────────────────────
  if (isError) {
    return (
      <div className="h-full flex flex-col">
        <PurchasingTabs />
        <div className="px-6 py-8">
          <div className="max-w-[560px] rounded-[12px] border border-danger bg-error-soft p-4">
            <div className="text-[13px] font-semibold text-danger mb-1">
              Couldn&rsquo;t load the purchase plan.
            </div>
            <div className="text-[12px] text-base-600 mb-3">
              {(error as Error | undefined)?.message ??
                "Try again. If it keeps failing, ask a developer to check the API."}
            </div>
            <Btn variant="box" size="sm" icon={RefreshCw} onClick={() => void refetch()}>
              Retry
            </Btn>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <PurchasingTabs
        right={<TodayRefresh today={today} onRefresh={() => void refetch()} />}
      />
      <div className="flex-1 min-h-0">
        <ListPageShell
          testId="operation-purchase"
          facetOpen={facetOpen}
          onFacetToggle={() => setFacetOpen((v) => !v)}
          facetToggleTitle="Show overview"
          activeChips={activeChips}
          facet={
            <div className="bg-white border border-base-200 rounded-[12px] p-1.5">
              {/* Needs attention (alarm) — ① Send only */}
              <FacetGroup title="Needs attention" danger>
                <FacetRow
                  label="Overdue"
                  count={placeOverdue}
                  tone={placeOverdue > 0 ? "danger" : "muted"}
                  active={stage === "place" && attn === "overdue"}
                  onClick={() => {
                    setStage("place");
                    setSelection(null);
                    setSupplierFilter(null);
                    setSelectedDay(null);
                    setAttn((a) => (a === "overdue" ? null : "overdue"));
                  }}
                />
                <FacetRow
                  label="No deadline"
                  count={missingCount}
                  tone={missingCount > 0 ? "danger" : "muted"}
                  active={stage === "place" && attn === "missing"}
                  onClick={() => {
                    setStage("place");
                    setSelection(null);
                    setSupplierFilter(null);
                    setSelectedDay(null);
                    setAttn((a) => (a === "missing" ? null : "missing"));
                  }}
                />
              </FacetGroup>

              {/* Today's work — the ①②③ stage jump (mirrors the KPI cards) */}
              <FacetGroup title="Today's work">
                <FacetRow
                  numbered="1"
                  label="Send orders"
                  count={placeCount}
                  active={stage === "place"}
                  onClick={() => goStage("place")}
                />
                <FacetRow
                  numbered="2"
                  label="Chase factory"
                  count={chaseCount}
                  tone={chaseCount > 0 ? "danger" : "muted"}
                  active={stage === "chase"}
                  onClick={() => goStage("chase")}
                />
                <FacetRow
                  numbered="3"
                  label="Receive"
                  count={receiveCount}
                  active={stage === "receive"}
                  onClick={() => goStage("receive")}
                />
              </FacetGroup>

              {/* By factory — units in the CURRENT stage; click filters the middle */}
              <FacetGroup
                title={
                  stage === "place"
                    ? "By factory · to send"
                    : stage === "chase"
                      ? "By factory · to chase"
                      : "By factory · to receive"
                }
              >
                {byFactory.length === 0 ? (
                  <EmptyFacetHint text="Nothing here" />
                ) : (
                  byFactory.map((f) => (
                    <FacetRow
                      key={f.id}
                      label={f.name}
                      count={f.units}
                      unit="units"
                      active={supplierFilter === f.id}
                      onClick={() => toggleSupplier(f.id)}
                    />
                  ))
                )}
              </FacetGroup>
            </div>
          }
        >
          <div className="flex-1 min-h-0 flex flex-col gap-3">
            {/* ── KPI strip = STAGE SWITCHER ─────────────────────────────── */}
            <div className="grid grid-cols-3 gap-2.5 shrink-0">
              <KpiCard
                value={isLoading ? "…" : placeCount}
                label="To send"
                sub={placeOverdue > 0 ? `${placeOverdue} late` : "on track"}
                subTone={placeOverdue > 0 ? "danger" : "muted"}
                active={stage === "place"}
                onClick={() => goStage("place")}
              />
              <KpiCard
                value={isLoading ? "…" : chaseCount}
                label="To chase"
                sub={chaseLate > 0 ? `${chaseLate} late` : "on track"}
                subTone={chaseLate > 0 ? "danger" : "muted"}
                active={stage === "chase"}
                onClick={() => goStage("chase")}
              />
              <KpiCard
                value={isLoading ? "…" : receiveCount}
                label="To receive"
                sub={receiveCount > 0 ? "ready to check in" : "nothing arriving"}
                subTone="muted"
                active={stage === "receive"}
                onClick={() => goStage("receive")}
              />
            </div>

            {/* ── This week's plan — Monday-anchor cadence (① Send only) ── */}
            {stage === "place" && today && placeCount > 0 && (
              <ThisWeeksPlan today={today} groups={placeGroups} />
            )}

            {/* ── 14-day date strip ──────────────────────────────────────── */}
            {today && (
              <DaysToOrderStrip
                buckets={stripBuckets}
                todayIso={today}
                selectedDay={selectedDay}
                onSelectDay={(iso) =>
                  setSelectedDay((cur) => (cur === iso ? null : iso))
                }
                leadLine={leadLine}
              />
            )}

            {/* ── Data guard — un-plannable orders (① Send stage only) ────── */}
            {stage === "place" && missingCount > 0 && (
              <div className="rounded-[12px] border border-danger bg-error-soft px-4 py-2.5 flex items-start gap-2.5 shrink-0">
                <AlertTriangle size={16} className="text-danger shrink-0 mt-0.5" />
                <div className="min-w-0 text-[12px]">
                  <span className="font-semibold text-danger">
                    {missingCount} {missingCount === 1 ? "order" : "orders"} can&rsquo;t be sent yet.
                  </span>{" "}
                  <span className="text-base-600">
                    {missingSoLabels.length > 0 && (
                      <>{missingSoLabels.slice(0, 4).join(", ")}: </>
                    )}
                    no delivery deadline — ask the salesperson to set one.
                  </span>
                </div>
              </div>
            )}

            {/* ── Middle list + Detail pane (2-column split) ─────────────── */}
            <div className="flex-1 min-h-0 grid grid-cols-[minmax(360px,420px)_1fr] gap-4">
              {/* MIDDLE — the compact list */}
              <div className="min-h-0 flex flex-col bg-white rounded-[12px] border border-base-200 shadow-sm overflow-hidden">
                <MiddleListHeader
                  stage={stage}
                  shownCount={
                    stage === "place"
                      ? placeShown.length
                      : stage === "chase"
                        ? chaseShown.length
                        : receiveShown.length
                  }
                  totalCount={
                    stage === "place" ? placeCount : stage === "chase" ? chaseCount : receiveCount
                  }
                />
                <div className="flex-1 min-h-0 overflow-y-auto">
                  {isLoading ? (
                    <PanelHint text="Loading today's plan…" />
                  ) : stage === "place" ? (
                    placeShown.length === 0 ? (
                      <EmptyDone
                        text="Nothing to send here"
                        sub="Change or clear the filter to see other suppliers."
                      />
                    ) : (
                      placeShown.map((g) => (
                        <PlaceListRow
                          key={g.supplierId}
                          group={g}
                          today={today}
                          selected={
                            selection?.kind === "place" &&
                            selection.supplierId === g.supplierId
                          }
                          onSelect={() =>
                            setSelection({ kind: "place", supplierId: g.supplierId })
                          }
                        />
                      ))
                    )
                  ) : stage === "chase" ? (
                    chaseShown.length === 0 ? (
                      <EmptyDone
                        text="Nothing to chase here"
                        sub="No factory is past its promised ready date."
                      />
                    ) : (
                      chaseShown.map((r) => (
                        <ChaseListRow
                          key={r.poId}
                          row={r}
                          supplierName={supplierName(r.supplierId)}
                          selected={
                            selection?.kind === "chase" && selection.poId === r.poId
                          }
                          onSelect={() => setSelection({ kind: "chase", poId: r.poId })}
                        />
                      ))
                    )
                  ) : receiveShown.length === 0 ? (
                    <EmptyDone
                      text="Nothing to receive here"
                      sub="No factory has goods ready or arriving."
                    />
                  ) : (
                    receiveShown.map((r) => (
                      <ReceiveListRow
                        key={r.poId}
                        row={r}
                        supplierName={supplierName(r.supplierId)}
                        selected={selection?.kind === "receive" && selection.poId === r.poId}
                        onSelect={() => setSelection({ kind: "receive", poId: r.poId })}
                      />
                    ))
                  )}
                </div>
              </div>

              {/* DETAIL — the selected row's expanded view */}
              <div className="min-h-0 flex flex-col bg-white rounded-[12px] border border-base-200 shadow-sm overflow-hidden">
                {selectedPlace ? (
                  <PlaceDetail group={selectedPlace} today={today} />
                ) : selectedChase ? (
                  <ChaseDetail
                    row={selectedChase}
                    supplierName={supplierName(selectedChase.supplierId)}
                    supplier={supplierById.get(selectedChase.supplierId)}
                  />
                ) : selectedReceive ? (
                  <ReceiveDetail
                    row={selectedReceive}
                    supplierName={supplierName(selectedReceive.supplierId)}
                  />
                ) : (
                  <DetailEmpty stage={stage} />
                )}
              </div>
            </div>
          </div>
        </ListPageShell>
      </div>
    </div>
  );
}

// ── TodayRefresh — the freshness stamp + refresh icon on PurchasingTabs' right ─

function TodayRefresh({
  today,
  onRefresh,
}: {
  today: string | null;
  onRefresh: () => void;
}) {
  return (
    <>
      <span className="text-[12px] text-base-500 tabular-nums">
        {today ? `Today · ${fmtDate(today)}` : "—"}
      </span>
      <button
        type="button"
        onClick={onRefresh}
        title="Refresh — fetch today's plan again"
        aria-label="Refresh purchase plan"
        className="p-1 rounded hover:text-base-900 hover:bg-hovertint transition-colors text-base-500"
      >
        <RefreshCw size={14} strokeWidth={2} />
      </button>
    </>
  );
}

// ── This week's plan — Monday-anchor cadence block ───────────────────────────

function ThisWeeksPlan({
  today,
  groups,
}: {
  today: string;
  groups: PurchasePlaceGroup[];
}) {
  const { mon, wed, fri } = upcomingCadenceDays(today);
  // Count groups whose earliestOrderBy falls exactly on that anchor day.
  const countOn = (iso: string) =>
    groups.filter((g) => g.earliestOrderBy === iso).length;
  const nMon = countOn(mon);
  const nWed = countOn(wed);
  const nFri = countOn(fri);
  const rows: Array<{ iso: string; label: string; n: number; note: string }> = [
    { iso: mon, label: `Mon ${dayLabelShort(mon)}`, n: nMon, note: "main day" },
    {
      iso: wed,
      label: `Wed ${dayLabelShort(wed)}`,
      n: nWed,
      note: nWed === 0 ? "skip — nothing forces it" : "backup fire",
    },
    {
      iso: fri,
      label: `Fri ${dayLabelShort(fri)}`,
      n: nFri,
      note: nFri === 0 ? "skip — nothing forces it" : "backup fire",
    },
  ];
  return (
    <div className="rounded-[12px] border border-base-200 bg-white shadow-sm px-4 py-2.5 shrink-0">
      <div className="text-[11px] font-bold uppercase tracking-[0.05em] text-base-500 mb-1.5">
        This week&rsquo;s plan
      </div>
      <div className="grid grid-cols-3 gap-3">
        {rows.map((r) => (
          <div key={r.iso} className="flex items-center gap-2 min-w-0">
            <span className="text-[13px] font-semibold text-base-900 tabular-nums shrink-0">
              {r.label}
            </span>
            <span className="text-[12px] text-base-600 truncate">
              {r.n > 0 ? (
                <>
                  <span className="font-semibold text-base-800 tabular-nums">
                    {r.n} {r.n === 1 ? "factory" : "factories"}
                  </span>{" "}
                  <span className="text-base-500">· {r.note}</span>
                </>
              ) : (
                <span className="text-base-400">— {r.note}</span>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Days-to-order strip ──────────────────────────────────────────────────────

function DaysToOrderStrip({
  buckets,
  todayIso,
  selectedDay,
  onSelectDay,
  leadLine,
}: {
  buckets: DayBucket[];
  todayIso: string;
  selectedDay: string | null;
  onSelectDay: (iso: string) => void;
  leadLine: string;
}) {
  return (
    <div className="rounded-[12px] border border-base-200 bg-white shadow-sm px-3 py-2.5 shrink-0">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[11px] font-bold uppercase tracking-[0.05em] text-base-500">
          Days to order (next 14 · click a day to focus)
        </div>
        {selectedDay && (
          <button
            type="button"
            onClick={() => onSelectDay(selectedDay)}
            className="text-[11px] text-base-500 hover:text-base-900 transition-colors"
          >
            Clear day
          </button>
        )}
      </div>
      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: `repeat(${buckets.length}, minmax(0, 1fr))` }}
      >
        {buckets.map((b) => {
          const isToday = b.iso === todayIso;
          const isSel = selectedDay === b.iso;
          const empty = b.units === 0;
          return (
            <button
              key={b.iso}
              type="button"
              onClick={() => onSelectDay(b.iso)}
              aria-pressed={isSel}
              title={`${dayName(b.iso)} ${dayLabelShort(b.iso)} — ${
                b.units > 0 ? `${b.units} to send` : "nothing"
              }`}
              className={[
                "flex flex-col items-center justify-center rounded-md py-1.5 transition-colors",
                isSel
                  ? "bg-hovertint ring-1 ring-primary"
                  : empty
                    ? "hover:bg-hovertint text-base-400"
                    : "hover:bg-hovertint",
              ].join(" ")}
            >
              <span
                className={`text-[10px] font-semibold ${
                  isToday ? "text-primary" : "text-base-500"
                }`}
              >
                {dayName(b.iso)}
              </span>
              <span
                className={`text-[12px] font-mono tabular-nums leading-tight ${
                  isToday ? "text-base-900 font-bold" : "text-base-700"
                }`}
              >
                {dayLabelShort(b.iso).split(" ")[0]}
              </span>
              <span
                className={`text-[13px] font-bold font-mono tabular-nums leading-tight mt-0.5 ${
                  b.status === "late"
                    ? "text-danger"
                    : b.status === "today"
                      ? "text-base-900"
                      : b.status === "due"
                        ? "text-base-800"
                        : "text-base-300"
                }`}
              >
                {b.units > 0 ? b.units : "—"}
              </span>
              <span
                className={`text-[9px] font-bold uppercase tracking-[0.04em] leading-tight ${
                  b.status === "late"
                    ? "text-danger"
                    : b.status === "today"
                      ? "text-primary"
                      : b.status === "due"
                        ? "text-base-500"
                        : "text-transparent"
                }`}
              >
                {b.status === "late"
                  ? "late"
                  : b.status === "today"
                    ? "today"
                    : b.status === "due"
                      ? "due"
                      : "—"}
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-2 pt-2 border-t border-base-100 text-[12px] text-base-700">
        {leadLine}
      </div>
    </div>
  );
}

// ── Middle list — header + rows ──────────────────────────────────────────────

function MiddleListHeader({
  stage,
  shownCount,
  totalCount,
}: {
  stage: Stage;
  shownCount: number;
  totalCount: number;
}) {
  const title =
    stage === "place"
      ? "Send orders"
      : stage === "chase"
        ? "Chase factories"
        : "Receive deliveries";
  const badge =
    shownCount === totalCount
      ? `${shownCount}`
      : `${shownCount} of ${totalCount}`;
  return (
    <div className="shrink-0 px-3 py-2 border-b border-base-200 bg-base-50 flex items-center justify-between">
      <div className="flex items-center gap-2 min-w-0">
        <span className="grid place-items-center w-5 h-5 rounded bg-base-900 text-white text-[11px] font-bold font-mono shrink-0">
          {stage === "place" ? "1" : stage === "chase" ? "2" : "3"}
        </span>
        <span className="text-[13px] font-semibold text-base-900 truncate">
          {title}
        </span>
      </div>
      <span className="text-[11px] font-semibold text-base-500 tabular-nums shrink-0">
        {badge}
      </span>
    </div>
  );
}

function PlaceListRow({
  group,
  today,
  selected,
  onSelect,
}: {
  group: PurchasePlaceGroup;
  today: string | null;
  selected: boolean;
  onSelect: () => void;
}) {
  const u = urgencyStyle(group.urgency);
  const kind = CATEGORY_KIND[group.categories[0] ?? "mattress"];
  const action = placeActionLine(group, today);
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={[
        "w-full text-left px-3 py-2 border-b border-base-100 transition-colors",
        selected ? "bg-hovertint" : "hover:bg-hovertint",
      ].join(" ")}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <Factory size={14} className="text-base-400 shrink-0" />
        <span className={`text-[13px] truncate ${selected ? "font-bold text-base-900" : "font-semibold text-base-900"}`}>
          {group.supplierName}
        </span>
        <span className="text-[11px] font-medium text-base-500 shrink-0">· {kind}</span>
        <span className={`pill ${u.cls} shrink-0 ml-auto`}>
          <u.Icon />
          {u.label}
        </span>
      </div>
      <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-base-500 min-w-0">
        <span className="tabular-nums shrink-0">
          {group.totalUnits}u · {group.orderCount} {group.orderCount === 1 ? "order" : "orders"}
        </span>
        {group.earliestOrderBy && (
          <span className="tabular-nums shrink-0 text-base-400">
            · {dayName(group.earliestOrderBy)} {dayLabelShort(group.earliestOrderBy)}
          </span>
        )}
      </div>
      <div className="mt-1 text-[12px] text-base-700 truncate">{action}</div>
    </button>
  );
}

function ChaseListRow({
  row,
  supplierName,
  selected,
  onSelect,
}: {
  row: PurchaseChase;
  supplierName: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const total = row.items.reduce((s, it) => s + it.outstanding, 0);
  const action = chaseActionLine(row, supplierName);
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={[
        "w-full text-left px-3 py-2 border-b border-base-100 transition-colors",
        selected ? "bg-hovertint" : "hover:bg-hovertint",
      ].join(" ")}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <Factory size={14} className="text-base-400 shrink-0" />
        <span className={`text-[13px] truncate ${selected ? "font-bold text-base-900" : "font-semibold text-base-900"}`}>
          {supplierName}
        </span>
        <span className="pill pill-overdue shrink-0 ml-auto">
          <AlertCircle />
          {row.daysLate}d late
        </span>
      </div>
      <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-base-500 min-w-0">
        <span className="tabular-nums shrink-0">
          {total} {total === 1 ? "item" : "items"} still waiting
        </span>
        {row.expectedReadyDate && (
          <span className="tabular-nums shrink-0 text-base-400">
            · promised {dayLabelShort(row.expectedReadyDate)}
          </span>
        )}
      </div>
      <div className="mt-1 text-[12px] text-base-700 truncate">{action}</div>
    </button>
  );
}

function ReceiveListRow({
  row,
  supplierName,
  selected,
  onSelect,
}: {
  row: PurchaseReceive;
  supplierName: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const total = row.items.reduce((s, it) => s + it.outstanding, 0);
  const when = row.etaDate ?? row.expectedReadyDate;
  const action = receiveActionLine(row, supplierName);
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={[
        "w-full text-left px-3 py-2 border-b border-base-100 transition-colors",
        selected ? "bg-hovertint" : "hover:bg-hovertint",
      ].join(" ")}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <Truck size={14} className="text-base-400 shrink-0" />
        <span className={`text-[13px] truncate ${selected ? "font-bold text-base-900" : "font-semibold text-base-900"}`}>
          {supplierName}
        </span>
        <span className="pill pill-sent shrink-0 ml-auto">
          <PackageCheck />
          {total} to check in
        </span>
      </div>
      <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-base-500 min-w-0">
        {when && (
          <span className="tabular-nums shrink-0">
            {row.etaDate ? "ETA" : "ready"} {dayLabelShort(when)}
          </span>
        )}
      </div>
      <div className="mt-1 text-[12px] text-base-700 truncate">{action}</div>
    </button>
  );
}

// ── Detail pane — empty + per-stage variants ─────────────────────────────────

function DetailEmpty({ stage }: { stage: Stage }) {
  const hint =
    stage === "place"
      ? "Select a factory on the left to see the SKU list."
      : stage === "chase"
        ? "Select a PO on the left to see the items to chase."
        : "Select a PO on the left to see the items to check in.";
  return (
    <div className="flex-1 min-h-0 grid place-items-center px-6 py-10">
      <div className="text-center max-w-[300px]">
        <div className="mx-auto mb-2.5 grid place-items-center w-9 h-9 rounded-full bg-base-100 text-base-500">
          <Info size={18} />
        </div>
        <div className="text-[13px] text-base-600">{hint}</div>
      </div>
    </div>
  );
}

// ── ① Send — Detail pane (SKU table + What to do + actions) ──────────────────

const WRONG_OPTIONS = [
  "Factory has no stock",
  "Price changed",
  "Customer cancelled",
  "Ask manager",
] as const;

function PlaceDetail({
  group,
  today,
}: {
  group: PurchasePlaceGroup;
  today: string | null;
}) {
  const [wrongOpen, setWrongOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const wrongRef = useRef<HTMLDivElement | null>(null);

  // Reset expand + popover when the selected supplier changes.
  useEffect(() => {
    setExpanded(new Set());
    setWrongOpen(false);
  }, [group.supplierId]);

  // Close the "Something wrong?" menu on outside click.
  useEffect(() => {
    if (!wrongOpen) return;
    const onDown = (e: MouseEvent) => {
      if (wrongRef.current && !wrongRef.current.contains(e.target as Node))
        setWrongOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [wrongOpen]);

  const toggleRow = (sku: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(sku) ? next.delete(sku) : next.add(sku);
      return next;
    });

  const hasCost = group.lines.some((l) => l.cost != null && l.cost > 0);
  const buyCost = group.lines.reduce((sum, l) => sum + (l.cost ?? 0) * l.need, 0);
  const lateLines =
    today != null
      ? group.lines.filter((l) => l.orderBy != null && l.orderBy < today).length
      : 0;

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* header */}
      <div className="shrink-0 border-b border-base-200 px-4 py-3 bg-base-50">
        <div className="flex items-center gap-1.5 text-[15px] font-bold text-base-900">
          <Factory size={16} className="text-base-400 shrink-0" />
          <span className="truncate">Send order to {group.supplierName}</span>
        </div>
        <div className="text-[12px] text-base-600 mt-1">
          <span className="font-semibold text-base-800 tabular-nums">
            {group.totalUnits} {group.totalUnits === 1 ? "unit" : "units"}
          </span>
          {" · "}
          <span className="tabular-nums">
            {group.orderCount} {group.orderCount === 1 ? "order" : "orders"}
          </span>
          {" · "}
          <span>&rarr; Klg</span>
          {group.earliestOrderBy && (
            <>
              {" · "}order-by from {fmtDateShort(group.earliestOrderBy)}
              {lateLines > 0 && (
                <span className="text-danger font-semibold"> ({lateLines} late)</span>
              )}
            </>
          )}
        </div>
      </div>

      {/* aggregated SKU table */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.04em] text-base-400 border-b border-base-100 sticky top-0 bg-white">
          <span>Model / sku</span>
          <span className="text-right">Need</span>
          <span className="text-right">Ready</span>
        </div>
        {group.lines.map((l) => {
          const open = expanded.has(l.sku);
          return (
            <div key={l.sku} className="border-b border-base-100">
              <button
                type="button"
                onClick={() => toggleRow(l.sku)}
                className="w-full grid grid-cols-[1fr_auto_auto] gap-x-4 items-center px-4 py-2 text-left hover:bg-hovertint transition-colors"
              >
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-[13px] font-semibold text-base-900">
                    {open ? (
                      <ChevronDown size={13} className="shrink-0 text-base-400" />
                    ) : (
                      <ChevronRight size={13} className="shrink-0 text-base-400" />
                    )}
                    <span className="truncate">{l.modelName ?? l.sku}</span>
                  </span>
                  <span className="block pl-[19px] text-[11px] font-mono text-base-500 truncate">
                    {l.sku} · for {forSummary(l.forOrders)}
                    {l.orderBy && (
                      <span className="text-base-400"> · order-by {fmtDateShort(l.orderBy)}</span>
                    )}
                  </span>
                </span>
                <span className="text-[13px] font-bold font-mono text-base-900 tabular-nums text-right">
                  &times; {l.need}
                </span>
                <span className="text-[12px] font-mono tabular-nums text-right text-base-500">
                  {l.ready > 0 ? l.ready : "—"}
                </span>
              </button>
              {open && (
                <div className="px-4 pb-2 pl-[42px] flex flex-col gap-0.5">
                  {l.forOrders.map((o, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between gap-3 text-[12px] text-base-600"
                    >
                      <span className="truncate">
                        {o.customerName?.trim() || (o.so ? `SO-${o.so}` : "—")}
                      </span>
                      {o.so && (
                        <span className="shrink-0 font-mono text-base-400">SO-{o.so}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* What to do — the 4-step block, COPY-STANDARD template */}
      <WhatToDo
        steps={[
          `WhatsApp ${group.supplierName}.`,
          "Send the SKU list above.",
          "Ask for a ready date.",
          "Click Send PO.",
        ]}
      />

      {/* footer */}
      <div className="shrink-0 border-t border-base-200 px-4 py-2.5 flex items-center justify-between gap-3 bg-base-50">
        <div className="flex items-center gap-3 min-w-0">
          {hasCost && (
            <span className="text-[12px] text-base-500 whitespace-nowrap">
              Buy cost{" "}
              <span className="font-semibold text-base-800">
                RM {buyCost.toLocaleString("en-MY", { maximumFractionDigits: 0 })}
              </span>
            </span>
          )}
          <div className="relative" ref={wrongRef}>
            <Btn
              variant="box"
              size="sm"
              onClick={() => setWrongOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={wrongOpen}
            >
              Something wrong?
            </Btn>
            {wrongOpen && (
              <div
                role="menu"
                className="absolute bottom-full left-0 mb-1.5 w-[220px] rounded-[12px] border border-base-200 bg-white shadow-lg py-1 z-10"
              >
                {WRONG_OPTIONS.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      /* TODO: escape-hatch — flag this factory order (later unit). */
                      setWrongOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 text-[13px] text-base-700 hover:bg-hovertint transition-colors"
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <Btn
          variant="hero"
          size="md"
          icon={Send}
          title={`Send the PO to ${group.supplierName} (raising the PO is a later unit).`}
          onClick={() => {
            /* TODO: raise the PO for this factory order. The PO-raise write path
               is a separate, not-yet-built unit — this button is a stub. */
          }}
        >
          Send PO
        </Btn>
      </div>
    </div>
  );
}

// ── ② Chase — Detail pane ────────────────────────────────────────────────────

function ChaseDetail({
  row,
  supplierName,
  supplier,
}: {
  row: PurchaseChase;
  supplierName: string;
  supplier: SupplierRow | undefined;
}) {
  const customers = row.linkedOrders
    .map((o) => o.customerName?.trim() || (o.so ? `SO-${o.so}` : null))
    .filter((s): s is string => Boolean(s));
  const deadline = row.earliestDeliveryDate;

  // Prefer the supplier's phone (prefillable wa.me deep link); fall back to
  // the WhatsApp group URL (open only, can't carry ?text=).
  const waBase = waLink(supplier?.contact);
  const groupUrl = supplier?.whatsapp_group_url?.trim() || null;
  const chaseText = buildSupplierChase({
    poNo: null,
    ref: null,
    lines: row.items.map((it) => ({ sku: it.sku, qty: it.outstanding })),
    deadline: deadline ? fmtDateShort(deadline) : "TBD",
  });
  const onChase = () => {
    if (waBase) {
      window.open(`${waBase}?text=${encodeURIComponent(chaseText)}`, "_blank", "noopener");
    } else if (groupUrl) {
      window.open(groupUrl, "_blank", "noopener");
    }
  };
  const canChase = Boolean(waBase || groupUrl);

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* header */}
      <div className="shrink-0 border-b border-base-200 px-4 py-3 bg-base-50">
        <div className="flex items-center gap-1.5 text-[15px] font-bold text-base-900">
          <Factory size={16} className="text-base-400 shrink-0" />
          <span className="truncate">Chase {supplierName}</span>
          <span className="pill pill-overdue shrink-0 ml-auto">
            <AlertCircle />
            {row.daysLate}d late
          </span>
        </div>
        <div className="text-[12px] text-base-600 mt-1">
          {customers.length > 0 ? (
            <span className="truncate">for {customers.slice(0, 3).join(", ")}</span>
          ) : (
            <span className="text-base-400">no linked customer</span>
          )}
          {deadline && (
            <>
              {" · "}deliver by {fmtDate(deadline)}
            </>
          )}
          {row.expectedReadyDate && (
            <>
              {" · "}promised {fmtDateShort(row.expectedReadyDate)}
            </>
          )}
        </div>
      </div>

      {/* items */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4">
        {row.items.map((it) => (
          <div
            key={it.sku}
            className="flex items-center justify-between gap-3 py-2.5 border-b border-base-100"
          >
            <div className="text-[13px] font-bold font-mono text-base-900">{it.sku}</div>
            <div className="text-[12px] text-base-500">
              still waiting{" "}
              <span className="font-bold font-mono text-base-900 tabular-nums">
                &times; {it.outstanding}
              </span>
            </div>
          </div>
        ))}
      </div>

      <WhatToDo
        steps={[
          `WhatsApp ${supplierName}.`,
          "Ask for a new ready date.",
          "Write it in the PO.",
          "Tell the salesperson.",
        ]}
      />

      {/* footer */}
      <div className="shrink-0 border-t border-base-200 px-4 py-2.5 flex items-center justify-end gap-3 bg-base-50">
        <Btn
          variant="hero"
          size="md"
          icon={MessageCircle}
          disabled={!canChase}
          title={
            canChase
              ? `Chase ${supplierName} on WhatsApp.`
              : "No WhatsApp contact on file for this factory."
          }
          onClick={onChase}
        >
          Chase on WhatsApp
        </Btn>
      </div>
    </div>
  );
}

// ── ③ Receive — Detail pane ──────────────────────────────────────────────────

function ReceiveDetail({
  row,
  supplierName,
}: {
  row: PurchaseReceive;
  supplierName: string;
}) {
  const customers = row.linkedOrders
    .map((o) => o.customerName?.trim() || (o.so ? `SO-${o.so}` : null))
    .filter((s): s is string => Boolean(s));
  const when = row.etaDate ?? row.expectedReadyDate;
  const total = row.items.reduce((sum, it) => sum + it.outstanding, 0);

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* header */}
      <div className="shrink-0 border-b border-base-200 px-4 py-3 bg-base-50">
        <div className="flex items-center gap-1.5 text-[15px] font-bold text-base-900">
          <Truck size={16} className="text-base-400 shrink-0" />
          <span className="truncate">Check in from {supplierName}</span>
          <span className="pill pill-sent shrink-0 ml-auto">
            <PackageCheck />
            {total} to check in
          </span>
        </div>
        <div className="text-[12px] text-base-600 mt-1">
          {customers.length > 0 ? (
            <span className="truncate">for {customers.slice(0, 3).join(", ")}</span>
          ) : (
            <span className="text-base-400">no linked customer</span>
          )}
          {when && (
            <>
              {" · "}
              {row.etaDate ? "ETA" : "ready"} {fmtDate(when)}
            </>
          )}
        </div>
      </div>

      {/* items */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4">
        {row.items.map((it) => (
          <div
            key={it.sku}
            className="flex items-center justify-between gap-3 py-2.5 border-b border-base-100"
          >
            <div className="text-[13px] font-bold font-mono text-base-900">{it.sku}</div>
            <div className="text-[13px] font-bold font-mono text-base-900 tabular-nums">
              &times; {it.outstanding}
            </div>
          </div>
        ))}
      </div>

      <WhatToDo
        steps={[
          "Count the goods on arrival.",
          "Photograph the factory DO slip.",
          "Book into Klg stock.",
          "Reserve to the customer order.",
        ]}
      />

      {/* footer */}
      <div className="shrink-0 border-t border-base-200 px-4 py-2.5 flex items-center justify-end gap-3 bg-base-50">
        <Btn
          variant="hero"
          size="md"
          icon={PackageCheck}
          title="Check these goods into Klang (booking flow is a later unit)."
          onClick={() => {
            /* TODO: GRN write path — receive units + attach DO + book into Klang
               stock. Separate, not-yet-built unit; stub for now. */
          }}
        >
          Check in
        </Btn>
      </div>
    </div>
  );
}

// ── What to do — the 4-step block below the detail pane's items ──────────────

function WhatToDo({ steps }: { steps: string[] }) {
  return (
    <div className="shrink-0 mx-4 mb-2 mt-2 rounded-[10px] border border-dashed border-base-200 bg-base-50/70 px-3 py-2">
      <div className="text-[11px] font-bold uppercase tracking-[0.05em] text-base-500 mb-1.5">
        What to do
      </div>
      <ol className="flex flex-col gap-1">
        {steps.map((s, i) => (
          <li key={i} className="flex items-start gap-2 text-[12px] text-base-700">
            <span className="grid place-items-center w-4 h-4 rounded-full bg-base-200 text-base-700 text-[10px] font-bold font-mono shrink-0 mt-0.5">
              {i + 1}
            </span>
            <span className="min-w-0">{s}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ── Loading + empty-state primitives ─────────────────────────────────────────

function PanelHint({ text }: { text: string }) {
  return (
    <div className="px-4 py-8 text-center text-[12px] text-base-500">{text}</div>
  );
}

function EmptyDone({ text, sub }: { text: string; sub: string }) {
  return (
    <div className="px-4 py-8 text-center">
      <div className="mx-auto mb-2 grid place-items-center w-9 h-9 rounded-full bg-success-soft">
        <Check size={18} className="text-success" />
      </div>
      <div className="text-[13px] font-semibold text-base-900">{text}</div>
      <div className="text-[12px] text-base-500 mt-1">{sub}</div>
    </div>
  );
}

// ── KPI card (stage switcher) ─────────────────────────────────────────────────

function KpiCard({
  value,
  label,
  sub,
  subTone,
  active,
  onClick,
}: {
  value: number | string;
  label: string;
  sub: string;
  subTone: "danger" | "muted";
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`text-left bg-white rounded-[12px] shadow-sm px-4 py-2.5 flex flex-col gap-0.5 border transition-colors ${
        active
          ? "border-primary ring-1 ring-primary"
          : "border-base-200 hover:border-base-300"
      }`}
    >
      <span className="text-[20px] font-bold font-mono tabular-nums leading-none text-base-900">
        {value}
      </span>
      <span
        className={`text-[12px] font-semibold ${active ? "text-primary" : "text-base-600"}`}
      >
        {label}
      </span>
      <span
        className={`text-[11px] font-semibold ${
          subTone === "danger" ? "text-danger" : "text-base-400"
        }`}
      >
        {sub}
      </span>
    </button>
  );
}

// ── Facet primitives (token-only, blue hover per UI-KIT hover law) ───────────

function FacetGroup({
  title,
  danger,
  children,
}: {
  title: string;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-1">
      <div
        className={`w-full flex items-center gap-1 rounded-md px-2 py-1.5 ${
          danger ? "bg-error-soft" : "bg-base-100"
        }`}
      >
        <span
          className={`uppercase flex-1 text-left text-[11px] font-bold tracking-[0.04em] ${
            danger ? "text-danger" : "text-base-900"
          }`}
        >
          {title}
        </span>
      </div>
      <div className="flex flex-col gap-0.5 mt-0.5">{children}</div>
    </div>
  );
}

function FacetRow({
  label,
  count,
  tone = "default",
  numbered,
  unit,
  active,
  onClick,
}: {
  label: string;
  count: number;
  tone?: "default" | "danger" | "muted";
  numbered?: string;
  unit?: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`w-full flex items-center gap-2 rounded-full text-left px-2.5 py-1.5 transition-colors ${
        active ? "bg-hovertint" : "hover:bg-hovertint"
      }`}
    >
      {numbered && (
        <span className="grid place-items-center w-[18px] h-[18px] rounded bg-base-900 text-white text-[11px] font-bold font-mono shrink-0">
          {numbered}
        </span>
      )}
      <span
        className={`flex-1 min-w-0 truncate text-[13px] ${
          active ? "text-base-900 font-semibold" : "text-base-700"
        }`}
      >
        {label}
      </span>
      <span
        className={`text-[12px] tabular-nums shrink-0 ${
          tone === "danger"
            ? "text-danger font-bold"
            : tone === "muted"
              ? "text-base-400"
              : "text-base-500 font-semibold"
        }`}
      >
        {count}
        {unit ? <span className="text-base-400 font-normal"> {unit}</span> : null}
      </span>
    </button>
  );
}

function EmptyFacetHint({ text }: { text: string }) {
  return <div className="px-2.5 py-1.5 text-[12px] text-base-400">{text}</div>;
}

