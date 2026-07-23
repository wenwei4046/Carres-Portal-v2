/**
 * OperationPurchase — the Purchase / To-Order cockpit (LOCKED design 2026-07-22,
 * round-2 refinements 2026-07-22 same day).
 *
 * See `docs/purchase-cockpit-handoff.md` §5 for the full spec.
 * UI text follows `docs/COPY-STANDARD.md` (vocabulary + row action-line +
 * "What to do" step block). Header follows `docs/UI-KIT.md` "Module-tab law"
 * — the tab bar IS the title, so `<ListPageShell>` gets no breadcrumb / title.
 *
 * ROUND-2 REFINEMENTS (Jess 2026-07-22, all agreed):
 *  - Stage TABS replace KPI cards (① Send · ② Chase · ③ Receive with the same
 *    ①/②/③ badge that appears in the facet + middle-list header — three panels,
 *    one visual token).
 *  - "This week's plan" panel MERGED into the days-to-order strip; the strip
 *    now marks Mon/Wed/Fri (review cadence) and its lead line carries the
 *    plan sentence (`Today: N to send · Mon 27: 2 · Wed 29: skip · Fri 31: skip`).
 *  - Category ICON (Bed / BedDouble / Sofa / Factory) replaces the "mattress
 *    factory" text tag on every row — the icon says the category, the name
 *    stays the brand.
 *  - Row copy: `5 units` (not `5u`), `3 SOs` (not `3 orders` — SO = customer
 *    sales order, not PO; the two must not blur).
 *  - Detail header: three prominent rows (`Total N units · for K SOs · deliver to Klg`,
 *    `By size King 2 · Queen 2 · Super Single 1`, `Send by Thu 23 Jul (in 1 day)`)
 *    so a new operator sees "how many, what sizes, by when" at a glance.
 *  - SKU table: 7 international-standard columns (SKU · MODEL · SIZE · QTY ·
 *    IN STOCK · DEADLINE · ORDER). No `×` prefix on QTY. `Ready` renamed to
 *    `IN STOCK`. New `DEADLINE` = earliest customer delivery date (from the
 *    shared schema's `deliveryDate` on each `forOrder`). `ORDER` = SO number
 *    (with `+N more` when a SKU serves multiple SOs).
 *  - `WhatToDo` inline horizontal (was a 4-row vertical list) — one line per
 *    stage, saves ~50px of vertical space.
 *  - Per-stage WhatToDo copy, correctly scoped:
 *      ① SEND    : WhatsApp → Paste SKU list → Click Send PO here     (3 steps)
 *      ② CHASE   : WhatsApp → Ask/update ready date → Arrange NETS → Update ETA (4)
 *      ③ RECEIVE : Count → Photograph DO → Book into Klg → Reserve   (4 steps)
 *    Send stage does NOT wait for supplier confirmation before sending — that
 *    conversation happens in Chase (SAP MM's requested-vs-confirmed pattern).
 *  - `Something wrong?` KEPT so it's not forgotten (Jess 2026-07-22) but with
 *    `(soon)` marker + popup top note stating the options record intent but
 *    don't act yet. Will be un-marked when the escape-hatch write path lands.
 *
 * VOCAB: ① Send · ② Chase · ③ Receive. Internal stage key stays `"place"` to
 *        preserve URL param + wire compat; all user-facing labels say Send. See
 *        COPY-STANDARD §Vocabulary for why Send ≠ Place.
 *
 * Read-only: every write affordance (Send PO / Chase on WhatsApp / Check-in /
 * Something wrong) is a STUB. Actually raising a PO / booking a GRN is a later
 * unit (see handoff §6 LATER UNITS). No order-write path is touched.
 *
 * Design: UI-KIT v4 — token classes only (no raw hex), Lucide icons, `.pill`
 * status tones, English-only copy, `Btn` primitive, date via `fmtDate()`.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Bed,
  BedDouble,
  Check,
  Clock,
  Factory,
  Info,
  MessageCircle,
  Minus,
  Package,
  PackageCheck,
  RefreshCw,
  Send,
  Sofa,
  SlidersHorizontal,
  Truck,
  UserRound,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  type ProductCategory,
  type PurchaseChase,
  type PurchasePlaceGroup,
  type PurchasePlaceGroupLine,
  type PurchaseReceive,
  type PurchaseUrgencyBucket,
} from "@carres/shared";
import ListPageShell, { type ActiveChip } from "@/components/ListPageShell";
import Btn from "@/components/Btn";
import PurchasingTabs from "./PurchasingTabs";
import { TopBarIcons } from "./components/GlobalTopBar";
import CreatePOModal, { type CreatePoPrefill } from "./components/CreatePOModal";
import ReceivePOModal from "./components/ReceivePOModal";
import { fmtDate, fmtDateShort } from "@/lib/fmt-date";
import { buildSupplierChase } from "@/lib/wa-templates";
import type { SupplierRow } from "@/lib/queries";
import {
  usePurchaseToday,
  useOperationSuppliers,
  useOperationPos,
  useOperationWarehouse,
  useChasePoEventMutation,
  useOperationPoDuty,
} from "@/lib/queries";

// ── Types ────────────────────────────────────────────────────────────────────

type Stage = "place" | "chase" | "receive";
type Attn = "overdue" | "missing" | null;

type Selection =
  | { kind: "place"; groupKey: string }
  | { kind: "chase"; poId: string }
  | { kind: "receive"; poId: string }
  | null;

/** A place group split by category — each split gets a unique `groupKey` so
 *  the middle list renders one row per (supplier × category) while the facet
 *  still groups by supplier. When a supplier serves ≥2 procurable categories
 *  the split produces one row per category (Jess 2026-07-22 Q3 — a sofa PO
 *  and a bedframe PO are different documents even from the same factory). */
type SplitPlaceGroup = PurchasePlaceGroup & {
  groupKey: string;
  /** Present only on split rows — undefined for suppliers with a single category. */
  splitCategory?: ProductCategory;
};

// ── Small pure helpers ───────────────────────────────────────────────────────

/** Calendar days between two ISO dates (`to − from`), or null if either bad. */
function daysBetween(fromIso: string | null, toIso: string | null): number | null {
  if (!fromIso || !toIso) return null;
  const a = new Date(`${fromIso.slice(0, 10)}T00:00:00Z`);
  const b = new Date(`${toIso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/** 0 = Sun · 1 = Mon · ... · 6 = Sat (UTC-consistent). */
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

// ── Category icons (Jess 2026-07-22: same icon language as the Orders panel) ─

function categoryIconOf(cat: ProductCategory | undefined): LucideIcon {
  switch (cat) {
    case "mattress":
      return Bed;
    case "bedframe":
      return BedDouble;
    case "sofa":
      return Sofa;
    case "accessory":
      return Package;
    default:
      return Factory;
  }
}

// ── Size code parser (SKU suffix → size code + label) ───────────────────────

interface SizeInfo {
  code: string;
  label: string;
}
const SIZE_ALIASES: Record<string, SizeInfo> = {
  Q: { code: "Q", label: "Queen" },
  K: { code: "K", label: "King" },
  S: { code: "S", label: "Single" },
  SS: { code: "SS", label: "Super Single" },
  SK: { code: "SK", label: "Super King" },
};
/** Parse a SIZE token from the SKU tail (`N1001S-Q` → `Q` = Queen). Returns
 *  null when the SKU has no `-XX` suffix or the suffix is unknown. */
function parseSize(sku: string): SizeInfo | null {
  const parts = sku.split("-");
  if (parts.length < 2) return null;
  const tail = parts[parts.length - 1]?.toUpperCase() ?? "";
  return SIZE_ALIASES[tail] ?? null;
}

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

/** Row action-line per COPY-STANDARD (verb + object + when). "PO" everywhere
 *  the reader is doing supplier work — never plain "order" (that's the customer
 *  SO in Carres vocab). Jess 2026-07-22. */
function placeActionLine(g: PurchasePlaceGroup, today: string | null): string {
  const name = g.supplierName ?? "the factory";
  if (g.urgency === "no_deadline")
    return `${name} — waiting on a deadline before we can plan.`;
  // ASAP model (Jess 2026-07-23): we proceed the moment a sales order lands — no
  // holding for a review cycle. Every PO that needs raising reads "today"; the
  // urgency PILL (Late / Due soon / Scheduled) carries how pressing it is, not
  // the action line. Only a late one appends how many days behind we are.
  if (g.urgency === "late" && g.earliestOrderBy && today) {
    const late = daysBetween(g.earliestOrderBy, today) ?? 0;
    if (late > 0) return `Send PO to ${name} today — ${late}d late.`;
  }
  return `Send PO to ${name} today.`;
}

/** Build the CreatePOModal prefill from a place group. soRefs = unique customer
 *  SOs; lines = planned SKUs + qty + first-SO attrs; supplierId preselects the
 *  group. Shared by the card's Send PO and the expanded detail's Send PO. */
function buildPlacePrefill(group: SplitPlaceGroup): CreatePoPrefill {
  const soRefs = Array.from(
    new Set(
      group.lines.flatMap((l) =>
        l.forOrders.map((o) => o.so).filter((n): n is number => n != null),
      ),
    ),
  );
  const lines = group.lines.map((l) => ({
    sku: l.sku,
    qty: l.need,
    attrs:
      (l.forOrders[0] as { attrs?: Record<string, unknown> | null } | undefined)
        ?.attrs ?? null,
  }));
  return {
    supplierId: group.supplierId,
    soRefs: soRefs.length > 0 ? soRefs : undefined,
    lines,
    note: `Auto-planned from cockpit · ${group.orderCount} SO${
      group.orderCount === 1 ? "" : "s"
    } · ${group.totalUnits} units${
      group.splitCategory ? ` (${group.splitCategory})` : ""
    }`,
  };
}

function chaseActionLine(r: PurchaseChase, supplierName: string): string {
  if (r.daysLate > 0) return `Chase ${supplierName} — ${r.daysLate}d late.`;
  return `Remind ${supplierName} — check ready date.`;
}

function receiveActionLine(r: PurchaseReceive, supplierName: string): string {
  const total = r.items.reduce((s, it) => s + it.outstanding, 0);
  return `Check in from ${supplierName} (${total} item${total === 1 ? "" : "s"}).`;
}

// Days-to-order strip helpers (next14Days · nonWorkingReason · bucketByDay ·
// upcomingCadenceDays · DayBucket · MY_HOLIDAYS lookup) removed 2026-07-23
// alongside the strip itself — the right-rail Calendar owns all date views now.

// ── Place-detail helpers: size breakdown + earliest deadline per line ────────

/** Compute the by-size roll-up for a place group's SKU lines. Empty when no
 *  SKUs parse a known size. */
function bySizeBreakdown(
  lines: readonly PurchasePlaceGroupLine[],
): Array<{ code: string; label: string; qty: number }> {
  const m = new Map<string, { label: string; qty: number }>();
  for (const l of lines) {
    const s = parseSize(l.sku);
    if (!s) continue;
    const cur = m.get(s.code);
    if (cur) cur.qty += l.need;
    else m.set(s.code, { label: s.label, qty: l.need });
  }
  return [...m.entries()]
    .map(([code, v]) => ({ code, label: v.label, qty: v.qty }))
    .sort((a, b) => b.qty - a.qty);
}

/** Earliest customer delivery date across a SKU line's forOrders, or null. */
function earliestDeadline(
  forOrders: PurchasePlaceGroupLine["forOrders"],
): string | null {
  const dates = forOrders
    .map((o) => o.deliveryDate ?? null)
    .filter((d): d is string => Boolean(d));
  if (dates.length === 0) return null;
  return dates.sort()[0]!;
}

/** ORDER column text: SO- or `SO-XXXX +N` when there are >1 unique SOs.
 *  The `+N` is enough — no "more" word (Jess 2026-07-22). */
function orderColText(forOrders: PurchasePlaceGroupLine["forOrders"]): string {
  const sos = [...new Set(forOrders.map((o) => o.so).filter((s): s is number => s != null))];
  if (sos.length === 0) return "—";
  if (sos.length === 1) return `SO-${sos[0]}`;
  return `SO-${sos[0]} +${sos.length - 1}`;
}

/** Category breakdown across a place group — `sofa 6 · bedframe 4`. Used on
 *  the row + detail header when the supplier serves >1 procurable category. */
function categoryBreakdown(
  group: PurchasePlaceGroup,
): Array<{ category: ProductCategory; units: number }> {
  const m = new Map<ProductCategory, number>();
  for (const l of group.lines) {
    m.set(l.category, (m.get(l.category) ?? 0) + l.need);
  }
  return [...m.entries()]
    .map(([category, units]) => ({ category, units }))
    .sort((a, b) => b.units - a.units);
}

/** Recompute the urgency bucket for a subset of lines from its own
 *  earliestOrderBy vs today. Mirrors the engine's rank approximately —
 *  used by the split so a bedframe split doesn't inherit its sofa sibling's
 *  urgency. */
function urgencyFromOrderBy(
  orderBy: string | null,
  today: string | null,
): PurchaseUrgencyBucket {
  if (!orderBy) return "no_deadline";
  if (!today) return "scheduled";
  const days = daysBetween(today, orderBy);
  if (days == null) return "scheduled";
  if (days < 0) return "late";
  if (days === 0) return "urgent";
  if (days <= 3) return "due";
  return "scheduled";
}

/** Split multi-category place groups into one row per (supplier × category).
 *  Single-category groups pass through as-is (groupKey = supplierId). */
function splitByCategory(
  groups: readonly PurchasePlaceGroup[],
  today: string | null,
): SplitPlaceGroup[] {
  const out: SplitPlaceGroup[] = [];
  for (const g of groups) {
    if (g.categories.length <= 1) {
      out.push({ ...g, groupKey: g.supplierId });
      continue;
    }
    for (const cat of g.categories) {
      const catLines = g.lines.filter((l) => l.category === cat);
      if (catLines.length === 0) continue;
      const totalUnits = catLines.reduce((s, l) => s + l.need, 0);
      const orderCount = new Set(
        catLines.flatMap((l) =>
          l.forOrders.map((o) => o.so).filter((x): x is number => x != null),
        ),
      ).size;
      const earliestOrderBy =
        catLines
          .map((l) => l.orderBy)
          .filter((d): d is string => Boolean(d))
          .sort()[0] ?? null;
      out.push({
        ...g,
        groupKey: `${g.supplierId}::${cat}`,
        splitCategory: cat,
        categories: [cat],
        lines: catLines,
        totalUnits,
        orderCount,
        earliestOrderBy,
        urgency: urgencyFromOrderBy(earliestOrderBy, today),
      });
    }
  }
  return out;
}

// ── Page ─────────────────────────────────────────────────────────────────────

// PO duty chip on the tab bar (Jess 2026-07-23) — surfaces WHO controls
// company-wide POs this month (货合买: one holder per month, auto-rotating via
// /api/operation/po-duty). Hidden while the duty layer is dormant (no holder);
// reads the same data as the right-rail Team panel. Urgent orders bypass duty.
function PoDutyTabChip() {
  const dutyQ = useOperationPoDuty();
  const holder = dutyQ.data?.holder ?? null;
  if (!holder?.name) return null;
  const month = dutyQ.data?.month ?? "";
  const monthLabel = month
    ? new Date(`${month}-01T00:00:00`).toLocaleDateString("en-US", { month: "short" })
    : "";
  return (
    <span
      className="flex items-center gap-1.5 rounded-full border border-base-200 bg-base-50 px-2.5 py-1 text-[12px] text-base-600"
      title="PO duty — one person controls company-wide POs each month (urgent orders bypass)"
      data-testid="po-duty-chip"
    >
      <UserRound size={13} strokeWidth={2} className="text-base-400" />
      <span>
        PO duty · {monthLabel}:{" "}
        <span className="font-semibold text-base-900">{holder.name}</span>
      </span>
    </span>
  );
}

// Lead Times settings (Jess: the editable lead-time table). Reachable from the
// Purchase tab bar. Shows the arrival buffer + per-category make+deliver leads
// the ordering engine uses; per-supplier editing + save ships with the 0243
// lead_time_config table.
const MAKE_DELIVER_DAYS: ReadonlyArray<[string, number]> = [
  ["Mattress", 7],
  ["Bedframe", 7],
  ["Sofa", 10],
];
function LeadTimesButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-full border border-base-200 bg-base-50 px-2.5 py-1 text-[12px] text-base-600 hover:text-base-900"
        title="Lead times — arrival buffer + make/deliver days"
      >
        <SlidersHorizontal size={13} strokeWidth={2} className="text-base-400" />
        Lead times
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-[420px] rounded-[14px] bg-white border border-base-200 shadow-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-base-200">
              <span className="text-[15px] font-semibold text-base-900">Lead times</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-base-400 hover:text-base-900"
              >
                <X size={16} />
              </button>
            </div>
            <div className="p-4 space-y-4 text-[13px]">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-base-500 mb-1.5">
                  Delivery buffer
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span>Stock should arrive</span>
                  <span className="inline-flex items-center justify-center w-10 h-7 rounded-md border border-base-200 bg-base-50 font-mono tabular-nums font-semibold">
                    7
                  </span>
                  <span>working days before the deadline</span>
                </div>
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-base-500 mb-1.5">
                  Make + deliver time (working days)
                </div>
                <div className="space-y-1.5">
                  {MAKE_DELIVER_DAYS.map(([label, days]) => (
                    <div key={label} className="flex items-center justify-between">
                      <span className="text-base-700">{label}</span>
                      <span className="inline-flex items-center justify-center w-10 h-7 rounded-md border border-base-200 bg-base-50 font-mono tabular-nums font-semibold">
                        {days}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <p className="text-[12px] text-base-500 leading-snug">
                Order date = deadline − buffer − make/deliver. These are the
                values the ordering engine uses today (Nice Future runs Mon–Fri,
                other factories Mon–Sat). Per-supplier editing + save ships with
                the lead-time table.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function OperationPurchase() {
  const { data, isLoading, isError, error, refetch } = usePurchaseToday();
  const suppliersQ = useOperationSuppliers();
  const [facetOpen, setFacetOpen] = useState(true);
  const [stage, setStage] = useState<Stage>("place");
  const [supplierFilter, setSupplierFilter] = useState<string | null>(null);
  const [attn, setAttn] = useState<Attn>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection>(null);
  // Send PO wire (Jess 2026-07-23) — clicking a PlaceDetail's Send PO button
  // opens the shipped CreatePOModal prefilled with the supplier + SO refs +
  // line qtys from the cockpit's plan. User then completes cost / warehouse /
  // ETA / cascade attrs (sofa fabric · bedframe color+gap) inside the modal
  // and issues the PO. On success the modal closes + purchase data refetches.
  const [createPoPrefill, setCreatePoPrefill] = useState<CreatePoPrefill | null>(null);
  // Cross-module jump wire (Jess 2026-07-23) — after a Send PO commits, jump
  // to the Purchase Orders tab so the operator sees the new PO land. Snap the
  // PO-count before opening the modal; on close, refetch + compare to know
  // if the modal was submitted (count went up) vs cancelled (unchanged).
  const posCountBeforeSend = useRef(0);
  const navigate = useNavigate();
  // Check in wire (Jess 2026-07-23) — clicking ReceiveDetail's Check in button
  // opens the shipped ReceivePOModal for the same PO. The modal needs the full
  // operationPoListRow (with purchase_order_lines nested) — that comes from
  // useOperationPos, which the Purchase Orders tab already fetches. Cockpit
  // reuses the same list read so the two tabs stay in sync on receive events.
  const [checkInPoId, setCheckInPoId] = useState<string | null>(null);
  const posQ = useOperationPos();
  const warehousesQ = useOperationWarehouse();

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

  // Split per (supplier × category) so a supplier with sofa + bedframe
  // (e.g. Ohana) renders as two rows / two POs — Jess 2026-07-22 Q3.
  const splitPlaceGroups = useMemo(
    () => splitByCategory(placeGroups, data?.today ?? null),
    [placeGroups, data?.today],
  );

  // Switching stage clears the per-stage facet filters + selection + selected day.
  const goStage = (s: Stage) => {
    setStage(s);
    setSupplierFilter(null);
    setAttn(null);
    setSelectedDay(null);
    setSelection(null);
  };

  // Stage counts + attention sub-counts — from SPLIT groups so a supplier with
  // 2 categories (Ohana sofa + bedframe) counts as 2 POs to send, matching the
  // 2 rows the operator sees in the middle list. Fixes the "3 of 2" mismatch
  // (Jess 2026-07-22 late round).
  const placeCount = splitPlaceGroups.length;
  const placeOverdue = splitPlaceGroups.filter((g) => g.urgency === "late").length;
  const missingCount = splitPlaceGroups.filter((g) => g.urgency === "no_deadline").length;
  const chaseCount = chase.length;
  const receiveCount = receive.length;

  // BY FACTORY facet — per-supplier units for the CURRENT stage. Aggregates
  // across splits (unsplit `placeGroups`) so a factory is still one facet row.
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

  // 14-day strip + lead-line memos removed 2026-07-23 with the strip itself
  // (Jess). The right-rail Calendar is now the single source of date navigation
  // (full month, tab-filtered by stage). stripOffset kept as a constant above
  // so any lingering ref doesn't crash — safe no-op.

  // ── Filtered lists per stage.
  const placeShown = useMemo(
    () =>
      splitPlaceGroups.filter((g) => {
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
    [splitPlaceGroups, supplierFilter, attn, selectedDay, today],
  );
  const chaseShown = useMemo(
    () =>
      chase.filter((r) => {
        if (supplierFilter && r.supplierId !== supplierFilter) return false;
        if (selectedDay) {
          if (selectedDay === today) {
            if (r.daysLate <= 0 && r.expectedReadyDate !== selectedDay) return false;
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

  // Auto-select the first visible row per stage so the detail pane isn't empty.
  useEffect(() => {
    if (stage !== "place") return;
    const stillVisible =
      selection?.kind === "place" &&
      placeShown.some((g) => g.groupKey === selection.groupKey);
    if (stillVisible) return;
    setSelection(
      placeShown[0] ? { kind: "place", groupKey: placeShown[0].groupKey } : null,
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
      ? splitPlaceGroups.find((g) => g.groupKey === selection.groupKey) ?? null
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
        right={
          <>
            <LeadTimesButton />
            <PoDutyTabChip />
            <TodayRefresh today={today} onRefresh={() => void refetch()} />
          </>
        }
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

              {/* Today's work — the ①②③ stage jump (mirrors the KPI tabs) */}
              <FacetGroup title="Today's work">
                <FacetRow
                  numbered="1"
                  label="Send POs"
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
            {/* Jess 2026-07-23 — the 3-pill StageTabs row + top DaysToOrder
                strip both removed. StageTabs duplicated the facet rail; the
                strip is now the RIGHT-RAIL Calendar (full-month, tab-filtered
                by Send / Chase / Receive / Deliveries — one place for all
                dates). Stage switch stays on the facet rail. */}

            {/* ── Data guard — un-plannable orders (① Send stage only) ────── */}
            {stage === "place" && missingCount > 0 && (
              <div className="rounded-[12px] border border-danger bg-error-soft px-4 py-2.5 flex items-start gap-2.5 shrink-0">
                <AlertTriangle size={16} className="text-danger shrink-0 mt-0.5" />
                <div className="min-w-0 text-[12px]">
                  <span className="font-semibold text-danger">
                    {missingCount} {missingCount === 1 ? "SO" : "SOs"} missing a delivery deadline.
                  </span>{" "}
                  <span className="text-base-600">
                    {missingSoLabels.length > 0 && (
                      <>{missingSoLabels.slice(0, 4).join(", ")}: </>
                    )}
                    Purchase can&rsquo;t plan the PO until Sales sets one.
                  </span>
                </div>
              </div>
            )}

            {/* ── Place = self-contained expanding CARDS (Jess 2026-07-23: the
                card owns everything — click to expand its per-SKU detail + Send
                PO inline; no separate right pane). Chase / Receive keep the
                list + detail split. ─────────────────────────────────────────── */}
            {stage === "place" ? (
              <div className="flex-1 min-h-0 flex flex-col">
                <MiddleListHeader
                  stage={stage}
                  shownCount={placeShown.length}
                  totalCount={placeCount}
                />
                <div className="flex-1 min-h-0 overflow-y-auto pt-2 pr-0.5">
                  {isLoading ? (
                    <PanelHint text="Loading today's plan…" />
                  ) : placeShown.length === 0 ? (
                    <EmptyDone
                      text="Nothing to send here"
                      sub="Change or clear the filter to see other factories."
                    />
                  ) : (
                    placeShown.map((g) => {
                      const isSel =
                        selection?.kind === "place" &&
                        selection.groupKey === g.groupKey;
                      return (
                        <div key={g.groupKey}>
                          <PlaceListRow
                            group={g}
                            today={today}
                            selected={isSel}
                            onSelect={() =>
                              setSelection(
                                isSel
                                  ? null
                                  : { kind: "place", groupKey: g.groupKey },
                              )
                            }
                            onSendPo={(prefill) => {
                              posCountBeforeSend.current =
                                posQ.data?.pos.length ?? 0;
                              setCreatePoPrefill(prefill);
                            }}
                          />
                          {isSel && selectedPlace && (
                            <div className="-mt-1 mb-2 rounded-b-[12px] border border-t-0 border-primary/30 bg-white overflow-hidden">
                              <PlaceDetail
                                group={selectedPlace}
                                today={today}
                                onSendPo={(prefill) => {
                                  posCountBeforeSend.current =
                                    posQ.data?.pos.length ?? 0;
                                  setCreatePoPrefill(prefill);
                                }}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            ) : (
              <div className="flex-1 min-h-0 grid grid-cols-[minmax(360px,420px)_1fr] gap-4">
                {/* MIDDLE — the compact list (Chase / Receive) */}
                <div className="min-h-0 flex flex-col bg-white rounded-[12px] border border-base-200 shadow-sm overflow-hidden">
                  <MiddleListHeader
                    stage={stage}
                    shownCount={
                      stage === "chase" ? chaseShown.length : receiveShown.length
                    }
                    totalCount={stage === "chase" ? chaseCount : receiveCount}
                  />
                  <div className="flex-1 min-h-0 overflow-y-auto">
                    {isLoading ? (
                      <PanelHint text="Loading today's plan…" />
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

                {/* DETAIL — the selected Chase / Receive row */}
                <div className="min-h-0 flex flex-col bg-white rounded-[12px] border border-base-200 shadow-sm overflow-hidden">
                  {selectedChase ? (
                    <ChaseDetail
                      row={selectedChase}
                      supplierName={supplierName(selectedChase.supplierId)}
                      supplier={supplierById.get(selectedChase.supplierId)}
                    />
                  ) : selectedReceive ? (
                    <ReceiveDetail
                      row={selectedReceive}
                      supplierName={supplierName(selectedReceive.supplierId)}
                      onCheckIn={(poId) => setCheckInPoId(poId)}
                    />
                  ) : (
                    <DetailEmpty stage={stage} />
                  )}
                </div>
              </div>
            )}
          </div>
        </ListPageShell>
      </div>
      {createPoPrefill && (
        <CreatePOModal
          prefill={createPoPrefill}
          onClose={async () => {
            setCreatePoPrefill(null);
            void refetch();
            const before = posCountBeforeSend.current;
            const fresh = await posQ.refetch();
            const after = fresh.data?.pos.length ?? before;
            if (after > before) {
              const n = after - before;
              toast.success(
                `${n} PO${n === 1 ? "" : "s"} sent — opening Purchase Orders`,
              );
              navigate("/operation/procurement");
            }
          }}
        />
      )}
      {checkInPoId && (() => {
        const po = posQ.data?.pos.find((p) => p.id === checkInPoId);
        if (!po) return null;
        const supplier = supplierById.get(po.supplier_id);
        const warehouse = warehousesQ.data?.warehouses.find(
          (w) => w.id === po.warehouse_id,
        );
        return (
          <ReceivePOModal
            po={po}
            supplier={supplier}
            warehouse={warehouse}
            onClose={() => {
              setCheckInPoId(null);
              void refetch();
              void posQ.refetch();
            }}
          />
        );
      })()}
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
  // Q9 Option B (Jess 2026-07-22): TopBarIcons (Alerts / Help / Settings) live
  // here instead of in the slim GlobalTopBar — module-tab pages skip the outer
  // bar entirely (OperationApp gates it), so this is the one place a
  // Purchasing-page operator reaches those affordances.
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
      <span className="mx-1 h-4 w-px bg-base-200" aria-hidden />
      <TopBarIcons />
    </>
  );
}

// StageTabs removed 2026-07-23 (Jess) — the 3-pill switcher row duplicated
// the facet rail's Today's work group and burned ~60px of vertical space.
// DaysToOrderStrip removed 2026-07-23 (Jess) — the right-rail Calendar owns
// all date navigation now (full month, tab-filtered by Send/Chase/Receive).



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
      ? "Send POs"
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

// Self-contained place CARD (Jess 2026-07-23 agreed ASCII): header + status +
// "Stock to" + one row per SKU (buy N) + "N of N selected" + Send PO — the card
// owns everything, no separate detail pane. Clicking the header still expands
// the full SKU-size/deadline table below for power users.
function PlaceListRow({
  group,
  today,
  selected,
  onSelect,
  onSendPo,
}: {
  group: SplitPlaceGroup;
  today: string | null;
  selected: boolean;
  onSelect: () => void;
  onSendPo: (prefill: CreatePoPrefill) => void;
}) {
  const u = urgencyStyle(group.urgency);
  const action = placeActionLine(group, today);
  const cat = group.categories[0];
  const Icon = categoryIconOf(cat);
  // Per-card buy cost = Σ(system cost × need) — advisory only, null costs
  // skipped. Hidden when 0.
  const rm = group.lines.reduce(
    (s, l) => s + (l.cost != null ? l.cost * l.need : 0),
    0,
  );
  const n = group.lines.length;
  return (
    <div
      className={[
        "rounded-[12px] border mb-2 bg-white overflow-hidden",
        selected ? "border-primary/40" : "border-base-200",
      ].join(" ")}
    >
      {/* header — click to expand the full SKU detail below */}
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className="w-full text-left p-3 hover:bg-hovertint transition-colors"
      >
        <div className="flex items-start gap-1.5 min-w-0">
          <Icon size={16} className="text-base-500 shrink-0 mt-0.5" />
          <span className="text-[14px] font-semibold text-base-900 truncate">
            {group.supplierName}
            {cat && (
              <span className="ml-1 text-[12px] font-medium text-base-500">— {cat}</span>
            )}
          </span>
          <span className="ml-auto text-[12px] text-base-500 shrink-0">
            {group.orderCount} {group.orderCount === 1 ? "sales order" : "sales orders"}
          </span>
        </div>
        <div className="mt-1.5 flex items-center gap-2 min-w-0">
          <span className={`pill ${u.cls} shrink-0`}>
            <u.Icon />
            {u.label}
          </span>
          <span className="text-[12px] text-base-700 truncate">{action}</span>
          {group.earliestOrderBy && (
            <span className="ml-auto shrink-0 text-[11px] tabular-nums text-base-500">
              Send by {dayName(group.earliestOrderBy)}{" "}
              {dayLabelShort(group.earliestOrderBy)}
            </span>
          )}
        </div>
        <div className="mt-1.5 flex items-center justify-between gap-2 text-[12px] text-base-500">
          <span className="truncate">Stock to: Carres Klang · NETS pickup</span>
          {rm > 0 && (
            <span className="tabular-nums font-semibold text-base-900 shrink-0">
              RM {Math.round(rm).toLocaleString()}
            </span>
          )}
        </div>
      </button>
      {/* per-SKU rows — what to buy (always on the card) */}
      <div className="border-t border-base-100">
        {group.lines.map((l) => (
          <div
            key={l.sku}
            className="h-[38px] px-3 flex items-center gap-2 text-[12px] border-b border-base-50 last:border-b-0"
          >
            <Check size={14} className="text-success shrink-0" />
            <span className="font-mono text-base-800 truncate">{l.sku}</span>
            <span className="ml-auto text-base-600 shrink-0">
              buy{" "}
              <span className="font-semibold tabular-nums text-base-900">{l.need}</span>
            </span>
            <span className="hidden sm:inline text-base-400 shrink-0">
              Carres Klang · NETS
            </span>
          </div>
        ))}
      </div>
      {/* footer — N of N selected + Send PO on the card */}
      <div className="px-3 py-2 flex items-center justify-between border-t border-base-100">
        <span className="text-[12px] text-base-500 tabular-nums">
          {n} of {n} selected
        </span>
        <Btn
          variant={group.urgency === "late" ? "hero" : "box"}
          size="sm"
          icon={Send}
          title={`Open the PO form to raise this order to ${group.supplierName}.`}
          onClick={() => onSendPo(buildPlacePrefill(group))}
        >
          Send PO
        </Btn>
      </div>
    </div>
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
        <Factory size={16} className="text-base-500 shrink-0" />
        <span
          className={`text-[13px] truncate ${
            selected ? "font-bold text-base-900" : "font-semibold text-base-900"
          }`}
        >
          {supplierName}
        </span>
        <span className="pill pill-overdue shrink-0 ml-auto">
          <AlertCircle />
          {row.daysLate}d late
        </span>
      </div>
      <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-base-500 min-w-0">
        <span className="tabular-nums shrink-0">
          {total} {total === 1 ? "unit" : "units"} still waiting
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
        <Truck size={16} className="text-base-500 shrink-0" />
        <span
          className={`text-[13px] truncate ${
            selected ? "font-bold text-base-900" : "font-semibold text-base-900"
          }`}
        >
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

// ── ① Send — Detail pane (3-row header · 7-col SKU table · WhatToDo · actions) ─

const WRONG_OPTIONS = [
  "Factory has no stock",
  "Price changed",
  "Customer cancelled",
  "Ask manager",
] as const;

function PlaceDetail({
  group,
  today,
  onSendPo,
}: {
  group: SplitPlaceGroup;
  today: string | null;
  onSendPo: (prefill: CreatePoPrefill) => void;
}) {
  const [wrongOpen, setWrongOpen] = useState(false);
  const wrongRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setWrongOpen(false);
  }, [group.supplierId]);

  useEffect(() => {
    if (!wrongOpen) return;
    const onDown = (e: MouseEvent) => {
      if (wrongRef.current && !wrongRef.current.contains(e.target as Node))
        setWrongOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [wrongOpen]);

  const hasCost = group.lines.some((l) => l.cost != null && l.cost > 0);
  const buyCost = group.lines.reduce((sum, l) => sum + (l.cost ?? 0) * l.need, 0);
  // Post-split, categories[] is length-1 for split rows; the parent-cat title
  // suffix (" · sofa") echoes the row's split label so the operator sees the
  // detail is scoped to that category's PO.
  const visibleCats = group.categories.slice(0, 2);
  const catBreak = categoryBreakdown(group);
  const catSuffix = group.splitCategory ? ` (${group.splitCategory})` : "";

  const bySize = bySizeBreakdown(group.lines);
  const sendByDays =
    group.earliestOrderBy && today ? daysBetween(today, group.earliestOrderBy) : null;
  const sendByTone =
    group.urgency === "late" || sendByDays === 0 ? "text-danger" : "text-base-900";
  const sendBySubtitle = (() => {
    if (!group.earliestOrderBy) return "";
    if (sendByDays == null) return "";
    if (sendByDays < 0) return `(${Math.abs(sendByDays)}d late)`;
    if (sendByDays === 0) return "(today)";
    if (sendByDays === 1) return "(in 1 day)";
    return `(in ${sendByDays} days)`;
  })();

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* header — 2 rows (Jess 2026-07-22 Q7): title + Send by inline,
          then one dense line with total / by-size / category mix / destination. */}
      <div className="shrink-0 border-b border-base-200 px-4 py-3 bg-base-50">
        <div className="flex items-start justify-between gap-3 mb-1.5">
          <div className="flex items-center gap-1.5 text-[15px] font-bold text-base-900 min-w-0">
            <span className="flex items-center gap-0.5 shrink-0">
              {visibleCats.map((cat) => {
                const Icon = categoryIconOf(cat);
                return <Icon key={cat} size={18} className="text-base-500" />;
              })}
            </span>
            <span className="truncate">Send PO to {group.supplierName}{catSuffix}</span>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-[10px] font-semibold uppercase tracking-[0.04em] text-base-500 leading-none">
              Send by
            </div>
            <div className={`text-[14px] font-bold tabular-nums leading-tight ${sendByTone}`}>
              {group.earliestOrderBy ? (
                <>
                  {fmtDate(group.earliestOrderBy)}{" "}
                  <span className="text-base-500 font-medium">{sendBySubtitle}</span>
                </>
              ) : (
                <span className="text-base-400">—</span>
              )}
            </div>
          </div>
        </div>
        <div className="text-[12px] text-base-800 flex items-center gap-1 flex-wrap">
          <span className="font-bold tabular-nums">{group.totalUnits}</span>
          <span>units · for</span>
          <span className="font-bold tabular-nums">{group.orderCount}</span>
          <span>{group.orderCount === 1 ? "SO" : "SOs"}</span>
          {catBreak.length > 1 && (
            <>
              <span className="text-base-400">·</span>
              {catBreak.map((b, i) => (
                <span key={b.category}>
                  {i > 0 && <span className="text-base-400"> · </span>}
                  {b.category} <span className="font-bold tabular-nums">{b.units}</span>
                </span>
              ))}
            </>
          )}
          {bySize.length > 0 && (
            <>
              <span className="text-base-400">·</span>
              {bySize.map((s, i) => (
                <span key={s.code}>
                  {i > 0 && <span className="text-base-400"> · </span>}
                  {s.label} <span className="font-bold tabular-nums">{s.qty}</span>
                </span>
              ))}
            </>
          )}
          <span className="text-base-400">·</span>
          <span>deliver to Klg</span>
        </div>
      </div>

      {/* SKU table — 7 cols: SKU · MODEL · SIZE · QTY · IN STOCK · DEADLINE · ORDER */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div
          className="grid gap-x-3 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.04em] text-base-400 border-b border-base-100 sticky top-0 bg-white"
          style={{
            gridTemplateColumns:
              "minmax(90px, 1.1fr) minmax(80px, 1fr) 40px 46px 60px minmax(80px, 1fr) minmax(70px, 1fr)",
          }}
        >
          <span>SKU</span>
          <span>Model</span>
          <span className="text-right">Size</span>
          <span className="text-right">Qty</span>
          <span className="text-right">In stock</span>
          <span>Deadline</span>
          <span>Order</span>
        </div>
        {group.lines.map((l) => {
          const size = parseSize(l.sku);
          const deadline = earliestDeadline(l.forOrders);
          const order = orderColText(l.forOrders);
          return (
            <div
              key={l.sku}
              className="grid gap-x-3 px-4 py-2 border-b border-base-100 items-center hover:bg-hovertint transition-colors"
              style={{
                gridTemplateColumns:
                  "minmax(90px, 1.1fr) minmax(80px, 1fr) 40px 46px 60px minmax(80px, 1fr) minmax(70px, 1fr)",
              }}
            >
              <span className="text-[12px] font-mono font-semibold text-base-900 truncate">
                {l.sku}
              </span>
              <span className="text-[12px] text-base-700 truncate">
                {l.modelName ?? "—"}
              </span>
              <span className="text-[12px] font-mono font-bold text-base-800 text-right">
                {size?.code ?? "—"}
              </span>
              <span className="text-[13px] font-bold font-mono tabular-nums text-base-900 text-right">
                {l.need}
              </span>
              <span className="text-[12px] font-mono tabular-nums text-right text-base-500">
                {l.ready > 0 ? l.ready : "—"}
              </span>
              <span
                className={`text-[12px] tabular-nums ${
                  deadline && today && deadline < today
                    ? "text-danger font-semibold"
                    : "text-base-700"
                }`}
              >
                {deadline
                  ? `${dayName(deadline)} ${dayLabelShort(deadline)}`
                  : <span className="text-base-400">—</span>}
              </span>
              <span className="text-[12px] font-mono text-base-700 truncate">
                {order}
              </span>
            </div>
          );
        })}
      </div>

      {/* What to do — inline horizontal (Jess 2026-07-22, saves vertical space) */}
      <WhatToDo
        steps={[
          `WhatsApp ${group.supplierName}`,
          "Paste SKU list above as PO",
          "Click Send PO here to record",
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
              Something wrong?{" "}
              <span className="text-base-400 font-normal">(soon)</span>
            </Btn>
            {wrongOpen && (
              <div
                role="menu"
                className="absolute bottom-full left-0 mb-1.5 w-[260px] rounded-[12px] border border-base-200 bg-white shadow-lg py-1 z-10"
              >
                <div className="px-3 py-2 border-b border-base-100 text-[11px] text-base-500 leading-snug">
                  Coming soon — the options here record intent but don&rsquo;t act yet.
                </div>
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
          title={`Open the PO form to raise this order to ${group.supplierName}.`}
          onClick={() => {
            // Build CreatePOModal prefill from this cockpit plan. soRefs = the
            // unique customer SOs feeding this group; lines = the planned SKUs
            // with qty + any per-SO attrs (sofa fabric_id · bedframe
            // color+gap). supplierId preselects the group. The modal handles
            // cost / warehouse / ETA / cascade completion + fires
            // useCreatePoMutation on submit.
            const soRefs = Array.from(
              new Set(
                group.lines.flatMap((l) =>
                  l.forOrders.map((o) => o.so).filter((n): n is number => n != null),
                ),
              ),
            );
            const lines = group.lines.map((l) => ({
              sku: l.sku,
              qty: l.need,
              // Prefer the first SO's attrs (sofa fabric / bedframe color+gap)
              // when the source SOs carry them; null = mattress or pre-cascade
              // legacy — modal's cascade picker fills any gaps.
              attrs:
                (l.forOrders[0] as { attrs?: Record<string, unknown> | null } | undefined)
                  ?.attrs ?? null,
            }));
            onSendPo({
              supplierId: group.supplierId,
              soRefs: soRefs.length > 0 ? soRefs : undefined,
              lines,
              note: `Auto-planned from cockpit · ${group.orderCount} SO${
                group.orderCount === 1 ? "" : "s"
              } · ${group.totalUnits} units${
                group.splitCategory ? ` (${group.splitCategory})` : ""
              }`,
            });
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
  const chaseEvent = useChasePoEventMutation();
  const customers = row.linkedOrders
    .map((o) => o.customerName?.trim() || (o.so ? `SO-${o.so}` : null))
    .filter((s): s is string => Boolean(s));
  const deadline = row.earliestDeliveryDate;

  const waBase = waLink(supplier?.contact);
  const groupUrl = supplier?.whatsapp_group_url?.trim() || null;
  const chaseText = buildSupplierChase({
    poNo: null,
    ref: null,
    lines: row.items.map((it) => ({ sku: it.sku, qty: it.outstanding })),
    deadline: deadline ? fmtDateShort(deadline) : "TBD",
  });
  const onChase = () => {
    // Jess 2026-07-23 — record the chase in audit_log BEFORE opening WA so
    // the log lands even if the operator closes the new tab. Failure is
    // best-effort (toasted via mutation error handler in the future); the
    // WA link opens regardless.
    chaseEvent.mutate({ poId: row.poId });
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
          <Factory size={18} className="text-base-500 shrink-0" />
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
                {it.outstanding}
              </span>
            </div>
          </div>
        ))}
      </div>

      <WhatToDo
        steps={[
          `WhatsApp ${supplierName}`,
          "Ask/update final ready date",
          "Arrange NETS pickup once ready",
          "Update ETA here",
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
  onCheckIn,
}: {
  row: PurchaseReceive;
  supplierName: string;
  onCheckIn: (poId: string) => void;
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
          <Truck size={18} className="text-base-500 shrink-0" />
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
              {it.outstanding}
            </div>
          </div>
        ))}
      </div>

      <WhatToDo
        steps={[
          "Count goods on arrival",
          "Photograph the DO slip",
          "Book into Klg stock",
          "Reserve to customer order",
        ]}
      />

      {/* footer */}
      <div className="shrink-0 border-t border-base-200 px-4 py-2.5 flex items-center justify-end gap-3 bg-base-50">
        <Btn
          variant="hero"
          size="md"
          icon={PackageCheck}
          title={`Open the check-in form for ${row.poId}.`}
          onClick={() => onCheckIn(row.poId)}
        >
          Check in
        </Btn>
      </div>
    </div>
  );
}

// ── What to do — inline horizontal (all steps on one line with → separators) ─

function WhatToDo({ steps }: { steps: string[] }) {
  return (
    <div className="shrink-0 mx-4 mb-2 mt-2 rounded-[10px] border border-dashed border-base-200 bg-base-50/70 px-3 py-2">
      <div className="flex items-center gap-2 flex-wrap text-[12px] text-base-700">
        <span className="text-[11px] font-bold uppercase tracking-[0.05em] text-base-500 shrink-0">
          What to do
        </span>
        {steps.map((s, i) => (
          <span key={i} className="flex items-center gap-1 shrink-0">
            <span className="grid place-items-center w-4 h-4 rounded-full bg-base-200 text-base-700 text-[10px] font-bold font-mono">
              {i + 1}
            </span>
            <span>{s}</span>
            {i < steps.length - 1 && (
              <ArrowRight size={12} className="text-base-400 ml-1" />
            )}
          </span>
        ))}
      </div>
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
