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
  Check,
  Factory,
  Info,
  MessageCircle,
  PackageCheck,
  RefreshCw,
  SlidersHorizontal,
  Truck,
  UserRound,
} from "lucide-react";
import {
  type ProductCategory,
  type PurchaseChase,
  type PurchasePlaceGroup,
  type PurchaseReceive,
  type PurchaseUrgencyBucket,
} from "@carres/shared";
import ListPageShell, { type ActiveChip } from "@/components/ListPageShell";
import { SectionCard, SectionBand } from "@/components/SectionPanel";
import Btn from "@/components/Btn";
import PurchasingTabs from "./PurchasingTabs";
import { TopBarIcons } from "./components/GlobalTopBar";
import CreatePOModal, { type CreatePoPrefill } from "./components/CreatePOModal";
import ReceivePOModal from "./components/ReceivePOModal";
import { PurchaseListRow } from "./components/PurchaseListRow";
import { PoDocumentPreview } from "./components/PoDocumentPreview";
import { PurchaseSettingsSheet } from "./components/PurchaseSettingsSheet";
import { fmtDate, fmtDateShort } from "@/lib/fmt-date";
import { buildSupplierChase } from "@/lib/wa-templates";
import { avatarColor, personInitials } from "@/lib/staff-avatar";
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


// Days-to-order strip helpers (next14Days · nonWorkingReason · bucketByDay ·
// upcomingCadenceDays · DayBucket · MY_HOLIDAYS lookup) removed 2026-07-23
// alongside the strip itself — the right-rail Calendar owns all date views now.


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

/** Earliest customer deadline across every SO the group's lines serve — the
 *  real pressure the operator communicates to the supplier. Feeds the late
 *  banner on the PoDocumentPreview. */
function earliestCustomerDeadlineOfGroup(
  group: SplitPlaceGroup,
): string | null {
  const dates: string[] = [];
  for (const l of group.lines)
    for (const o of l.forOrders)
      if (o.deliveryDate) dates.push(o.deliveryDate);
  if (dates.length === 0) return null;
  return dates.sort()[0]!;
}

/** Default WhatsApp draft — plain-English, low-literacy supplier register with
 *  ref-first line items (memory `reference_supplier_chase`: suppliers recognise
 *  their CR/TCF original ref, not our SO number). Editable in the preview. */
function buildPlaceWaTemplate(
  group: SplitPlaceGroup,
  preparedByName: string | null,
): string {
  const supplier = group.supplierName ?? "the factory";
  const lines: string[] = [];
  lines.push(`${supplier}, we place new order. Please help arrange:`);
  lines.push("");
  for (const l of group.lines) {
    const size = parseSize(l.sku);
    const sz = size ? ` ${size.label}` : "";
    lines.push(`  ${l.sku}${sz} × ${l.need}`);
  }
  lines.push("");
  lines.push("Please confirm receive. Thank you.");
  lines.push(`${preparedByName ?? "Ops"} · Carres`);
  return lines.join("\n");
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

export default function OperationPurchase() {
  const { data, isLoading, isError, error, refetch } = usePurchaseToday();
  const suppliersQ = useOperationSuppliers();
  const [facetOpen, setFacetOpen] = useState(true);
  const [stage, setStage] = useState<Stage>("place");
  const [supplierFilter, setSupplierFilter] = useState<string | null>(null);
  const [attn, setAttn] = useState<Attn>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection>(null);
  // v2 (Loo 2026-07-23): PROJECTS facet lets the operator scope to one big
  // customer whose SOs span multiple factories (Dorsett Loft = 40 rooms →
  // 3+ POs). Data lives in `PurchasePlaceGroupLine.forOrders[i].customerName`
  // — zero migration; group Place rows whose lines serve that customer.
  // v2 (Loo 2026-07-23): Purchase settings side sheet — replaces the small
  // LeadTimesButton modal. Section 1 = Lead times · 2 = Arrival buffer · 3 =
  // PO days · 4 = Duty rotation indicator (edit stays on the Team card).
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Section collapse — one Set for all bands; default all expanded.
  const [collapsedFacet, setCollapsedFacet] = useState<Set<string>>(
    () => new Set(),
  );
  const toggleFacet = (key: string) =>
    setCollapsedFacet((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
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
  // v2 (Jess 2026-07-23): the master-detail preview needs the duty holder for
  // the "prepared by" line + the "on PO duty" badge next to Send PO. Send +
  // Chase are the PO-duty holder (one voice to suppliers); Receive/GRN is
  // OFFSET by one month (next month's holder) so SOD is achieved without a
  // warehouse team — same 3-person office ops crew, different owner per stage.
  const dutyQ = useOperationPoDuty();
  const poDutyHolder = dutyQ.data?.holder ?? null;
  const currentMonth = dutyQ.data?.month ?? "";
  const grnDutyHolder =
    (dutyQ.data?.roster ?? []).find((r) => r.month > currentMonth) ?? null;
  const poDutyChip = poDutyHolder ? (
    <span
      className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
      style={{
        background: avatarColor(poDutyHolder.userId).bg,
        color: avatarColor(poDutyHolder.userId).fg,
      }}
      title={`${poDutyHolder.name ?? poDutyHolder.email} · on PO duty`}
    >
      {personInitials(poDutyHolder.name, poDutyHolder.email)}
    </span>
  ) : null;
  const grnDutyChip = grnDutyHolder ? (
    <span
      className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
      style={{
        background: avatarColor(grnDutyHolder.userId).bg,
        color: avatarColor(grnDutyHolder.userId).fg,
      }}
      title={`${grnDutyHolder.name ?? grnDutyHolder.email} · on GRN duty (offset-1 rotation)`}
    >
      {personInitials(grnDutyHolder.name, grnDutyHolder.email)}
    </span>
  ) : null;

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

  // Group placeShown by category for the facet's nested tree under Send POs
  // (Jess 2026-07-24 v2 rev 4 — middle-panel-into-facet refactor).
  const placesByCategory = useMemo(() => {
    const byCat = new Map<ProductCategory, SplitPlaceGroup[]>();
    for (const g of placeShown) {
      const cat = g.splitCategory ?? g.categories[0];
      if (!cat) continue;
      if (!byCat.has(cat)) byCat.set(cat, []);
      byCat.get(cat)!.push(g);
    }
    return [...byCat.entries()];
  }, [placeShown]);

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
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              title="Purchase settings — lead times, buffer, PO days, duty"
              aria-label="Open Purchase settings"
              className="p-1 rounded hover:text-base-900 hover:bg-hovertint transition-colors text-base-500"
            >
              <SlidersHorizontal size={14} strokeWidth={2} />
            </button>
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
          facetWidthPx={320}
          activeChips={activeChips}
          facet={
            <div className="flex flex-col gap-2 min-h-0 flex-1">
              {/* + New PO — Gmail compose style (Jess 2026-07-23). Always
                  visible at the top; opens CreatePOModal with EMPTY prefill
                  so the operator can raise an ad-hoc PO (stockpile / runner /
                  special order) not tied to a specific SO. Grey box (not
                  flame — Send PO in the preview owns the ONE flame per page,
                  UI-KIT §A5). */}
              <button
                type="button"
                onClick={() => {
                  posCountBeforeSend.current = posQ.data?.pos.length ?? 0;
                  setCreatePoPrefill({ lines: [] });
                }}
                className="shrink-0 flex items-center justify-center gap-2 h-9 rounded-full border border-base-200 bg-white text-base-800 text-[13px] font-semibold hover:bg-hovertint transition-colors"
              >
                <span className="text-[16px] leading-none">+</span> New PO
              </button>

              <SectionCard>
              {/* TODAY'S WORK — 3 stages with avatar chip left (Jess 2026-07-23
                  v2 · rev 2): chip = who's on duty for that stage. Numbers
                  1/2/3 removed (spine implied by top-to-bottom order + label).
                  Attention counts inline (`⚠ N late`) next to Send POs when
                  any PO is overdue. NEEDS ATTENTION section deleted; PROJECTS
                  section deleted. */}
              <SectionBand
                title="Today's work"
                strong
                collapsed={collapsedFacet.has("today")}
                onToggle={() => toggleFacet("today")}
              />
              {!collapsedFacet.has("today") && (
                <div>
                  <FacetRow
                    leadingChip={poDutyChip}
                    label="Send POs"
                    count={placeCount}
                    suffix={
                      placeOverdue > 0 ? (
                        <span className="text-danger font-semibold">
                          ⚠ {placeOverdue} late
                        </span>
                      ) : undefined
                    }
                    active={stage === "place"}
                    onClick={() => goStage("place")}
                  />

                  {/* Nested Send-POs tree — category-grouped POs (Jess
                      2026-07-24 v2 rev 4). Only visible when Send POs is the
                      active stage AND Today's Work isn't collapsed. Middle
                      list panel deleted; clicking a PO here updates the
                      preview column on the right. */}
                  {stage === "place" && placeShown.length > 0 && (
                    <div className="ml-3 pl-2 border-l border-base-200 my-1 space-y-1">
                      {placesByCategory.map(([cat, groups]) => {
                        const totalUnits = groups.reduce(
                          (s, g) => s + g.totalUnits,
                          0,
                        );
                        const anyLate = groups.some(
                          (g) => g.urgency === "late",
                        );
                        const earliestIso = groups
                          .map((g) => g.earliestOrderBy)
                          .filter((d): d is string => Boolean(d))
                          .sort()[0];
                        return (
                          <div key={cat}>
                            <div className="flex items-center gap-1 py-1 text-[11px] uppercase tracking-[0.05em] text-base-600">
                              <span className="font-semibold">{cat}</span>
                              <span className="ml-auto tabular-nums font-normal">
                                {groups.length} PO · {totalUnits} units
                              </span>
                            </div>
                            <div className="flex items-center gap-1 text-[11px] text-base-500 pb-1">
                              {earliestIso && (
                                <span className="tabular-nums">
                                  Send by {fmtDate(earliestIso)}
                                </span>
                              )}
                              {anyLate && (
                                <span className="pill pill-overdue">Late</span>
                              )}
                            </div>
                            {groups.map((g) => {
                              const isSel =
                                selection?.kind === "place" &&
                                selection.groupKey === g.groupKey;
                              return (
                                <button
                                  key={g.groupKey}
                                  type="button"
                                  onClick={() =>
                                    setSelection(
                                      isSel
                                        ? null
                                        : {
                                            kind: "place",
                                            groupKey: g.groupKey,
                                          },
                                    )
                                  }
                                  className={`w-full text-left rounded-md px-2 py-1 flex items-center gap-2 transition-colors ${
                                    isSel
                                      ? "is-selected"
                                      : "hover:bg-hovertint"
                                  }`}
                                >
                                  <span className="text-[12.5px] font-medium text-base-900 truncate">
                                    {g.supplierName ?? "the factory"}
                                  </span>
                                  <span className="ml-auto shrink-0 text-[11px] tabular-nums text-base-500">
                                    {g.totalUnits} units
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <FacetRow
                    leadingChip={poDutyChip}
                    label="Chase factory"
                    count={chaseCount}
                    tone={chaseCount > 0 ? "danger" : "muted"}
                    active={stage === "chase"}
                    onClick={() => goStage("chase")}
                  />
                  <FacetRow
                    leadingChip={grnDutyChip}
                    label="Receive"
                    count={receiveCount}
                    active={stage === "receive"}
                    onClick={() => goStage("receive")}
                  />
                </div>
              )}

              {/* SUPPLIER (was BY FACTORY) — units in the current stage; click
                  filters the middle list to that supplier. */}
              <SectionBand
                title="Supplier"
                strong
                collapsed={collapsedFacet.has("factory")}
                onToggle={() => toggleFacet("factory")}
              />
              {!collapsedFacet.has("factory") && (
                <div>
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
                </div>
              )}
              </SectionCard>
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

            {/* ── Place stage · Jess 2026-07-24 (v2 rev4): the middle-panel
                LIST is DELETED; POs are folded into the facet tree under
                Send POs (category grouped). This body column now shows ONLY
                the PREVIEW (PDF-style doc + SOs covered + WhatsApp draft +
                Send flame). Chase / Receive keep the 2-column split for now
                — their tree fold is a follow-up. */}
            {stage === "place" ? (
              <div className="min-h-0 flex flex-col bg-white rounded-[12px] border border-base-200 shadow-sm overflow-hidden p-3 flex-1">
                {isLoading ? (
                  <PanelHint text="Loading today's plan…" />
                ) : selectedPlace ? (
                  <PoDocumentPreview
                    group={selectedPlace}
                    today={today}
                    earliestCustomerDeadline={earliestCustomerDeadlineOfGroup(
                      selectedPlace,
                    )}
                    preparedByName={dutyQ.data?.holder?.name ?? null}
                    dutyHolderName={dutyQ.data?.holder?.name ?? null}
                    onSendPo={(prefill) => {
                      posCountBeforeSend.current = posQ.data?.pos.length ?? 0;
                      setCreatePoPrefill(prefill);
                    }}
                    buildPrefill={() => buildPlacePrefill(selectedPlace)}
                    waTemplate={buildPlaceWaTemplate(
                      selectedPlace,
                      dutyQ.data?.holder?.name ?? null,
                    )}
                  />
                ) : placeShown.length === 0 ? (
                  <EmptyDone
                    text="Nothing to send today"
                    sub="Clear a filter or wait for the next SO to land."
                  />
                ) : (
                  <DetailEmpty stage={stage} />
                )}
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
                        chaseShown.map((r) => {
                          const total = r.items.reduce(
                            (s, it) => s + it.outstanding,
                            0,
                          );
                          return (
                            <PurchaseListRow
                              key={r.poId}
                              Icon={Factory}
                              title={supplierName(r.supplierId)}
                              subtitle={`${total} unit${total === 1 ? "" : "s"} still waiting`}
                              dateIso={r.expectedReadyDate}
                              dateLabel="promised"
                              urgency={
                                r.daysLate > 0
                                  ? {
                                      tone: "overdue",
                                      Icon: AlertCircle,
                                      label: `${r.daysLate}d late`,
                                    }
                                  : null
                              }
                              selected={
                                selection?.kind === "chase" &&
                                selection.poId === r.poId
                              }
                              onSelect={() =>
                                setSelection({ kind: "chase", poId: r.poId })
                              }
                              testId={`chase-row-${r.poId}`}
                            />
                          );
                        })
                      )
                    ) : receiveShown.length === 0 ? (
                      <EmptyDone
                        text="Nothing to receive here"
                        sub="No factory has goods ready or arriving."
                      />
                    ) : (
                      receiveShown.map((r) => {
                        const total = r.items.reduce(
                          (s, it) => s + it.outstanding,
                          0,
                        );
                        const when = r.etaDate ?? r.expectedReadyDate;
                        return (
                          <PurchaseListRow
                            key={r.poId}
                            Icon={Truck}
                            title={supplierName(r.supplierId)}
                            subtitle={`${total} unit${total === 1 ? "" : "s"} to check in`}
                            dateIso={when}
                            dateLabel={r.etaDate ? "ETA" : "ready"}
                            urgency={{
                              tone: "sent",
                              Icon: PackageCheck,
                              label: `${total} to check in`,
                            }}
                            selected={
                              selection?.kind === "receive" &&
                              selection.poId === r.poId
                            }
                            onSelect={() =>
                              setSelection({ kind: "receive", poId: r.poId })
                            }
                            testId={`receive-row-${r.poId}`}
                          />
                        );
                      })
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
      <PurchaseSettingsSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        dutyHolderName={dutyQ.data?.holder?.name ?? null}
        dutyUntilLabel={
          dutyQ.data?.month
            ? (() => {
                const y = Number(dutyQ.data.month.slice(0, 4));
                const m = Number(dutyQ.data.month.slice(5, 7));
                const eom = new Date(Date.UTC(y, m, 0));
                const iso = eom.toISOString().slice(0, 10);
                return fmtDateShort(iso);
              })()
            : null
        }
        rotationRows={(() => {
          // PO + GRN rotation, offset-1 (Jess 2026-07-23): GRN = next month's
          // PO holder. Roster from the po-duty API. Show up to 4 months so
          // the operator sees the wheel turning.
          const roster = dutyQ.data?.roster ?? [];
          const cur = dutyQ.data?.month ?? "";
          const sorted = [...roster].sort((a, b) => a.month.localeCompare(b.month));
          const rows: {
            month: string;
            poHolderName: string | null;
            grnHolderName: string | null;
          }[] = [];
          for (let i = 0; i < sorted.length; i++) {
            const r = sorted[i]!;
            // Only include the current month and forward.
            if (cur && r.month < cur) continue;
            const monthLabel = new Date(`${r.month}-01T00:00:00Z`)
              .toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
            const grn = sorted[i + 1] ?? null;
            rows.push({
              month: monthLabel,
              poHolderName: r.name ?? r.email ?? null,
              grnHolderName: grn ? (grn.name ?? grn.email ?? null) : null,
            });
            if (rows.length >= 4) break;
          }
          return rows;
        })()}
      />
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
      <span className="text-[13px] font-semibold text-base-900 truncate">
        {title}
      </span>
      <span className="text-[11px] font-semibold text-base-500 tabular-nums shrink-0">
        {badge}
      </span>
    </div>
  );
}

// PlaceListRow deleted 2026-07-23 (v2 · Loo) — the expanding card + inline
// per-SKU detail were folded into `<PurchaseListRow>` + `<PoDocumentPreview>`
// master-detail. The Send PO button moved from the row footer to the preview
// column's flame CTA. See the Place branch above for the current render.

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


function FacetRow({
  label,
  count,
  tone = "default",
  leadingChip,
  unit,
  suffix,
  active,
  onClick,
}: {
  label: string;
  count: number;
  tone?: "default" | "danger" | "muted";
  /** Optional avatar/status chip rendered BEFORE the label (Jess 2026-07-23:
   *  duty owner chip on the Today's work stages — chip left, label right). */
  leadingChip?: React.ReactNode;
  unit?: string;
  /** Optional inline suffix (e.g. "⚠ N late") shown between label and count. */
  suffix?: React.ReactNode;
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
      {leadingChip}
      <span
        className={`min-w-0 truncate text-[13px] ${
          active ? "text-base-900 font-semibold" : "text-base-700"
        }`}
      >
        {label}
      </span>
      {suffix && (
        <span className="text-[11px] shrink-0">{suffix}</span>
      )}
      <span
        className={`ml-auto text-[12px] tabular-nums shrink-0 ${
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
