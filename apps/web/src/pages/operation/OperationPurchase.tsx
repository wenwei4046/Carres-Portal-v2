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
 * VOCAB (rewritten by card **R8**, 2026-07-28): the three stage cells read
 *        `Send PO` · `Confirm ready date` · `Check in`, straight out of
 *        `order-action-words.ts`. They used to say `Send POs` · `Chase factory`
 *        · `Receive` — and `Chase` is a BANNED word (COPY-STANDARD), while
 *        `Receive` as a verb is banned outright in favour of `Check in`. The
 *        internal stage keys stay `"place" | "chase" | "receive"` to preserve
 *        URL-param and wire compat; nothing user-facing says them.
 *
 * Read-only: every write affordance (Send PO / Chase on WhatsApp / Check-in /
 * Something wrong) is a STUB. Actually raising a PO / booking a GRN is a later
 * unit (see handoff §6 LATER UNITS). No order-write path is touched.
 *
 * Design: UI-KIT v4 — token classes only (no raw hex), Lucide icons, `.pill`
 * status tones, English-only copy, `Btn` primitive, date via `fmtDate()`.
 *
 * P2 (2026-07-28) — the click behaviour becomes real on THIS tab, per
 * `docs/UI-KIT.md` §8.2. No word changed; only what a click does:
 *  - clicking the SAME row again clears it. It always set `selection` to null
 *    and the auto-select effect put the first row straight back, so a re-click
 *    had never once cleared anything;
 *  - clicking the stage you are already on is a no-op. It used to re-run the
 *    reset and silently throw away the supplier filter;
 *  - opening a drawer (CreatePOModal · ReceivePOModal) snapshots the filters,
 *    the selection and the facet rail's scroll, and closing it puts them back.
 *
 * Receiving and Claims are the other two tabs §8.2 still owes; they are ④ R's
 * files and R6 holds them, so P2 shipped the To Order half alone.
 *
 * R8 (2026-07-28) also DELETED the `attn` and `selectedDay` filters. Their tiles
 * were removed on 2026-07-23/24 and the state, the filter branches and the clear
 * chips stayed behind — every writer of both set `null`, so nothing on the page
 * could ever switch either on. Proved by grep before deleting, per the card:
 * unreachable state is not a behaviour change, but only after you have shown it
 * is unreachable. The FEATURES ("only what is late", "only this day") were not
 * ruled out — they were ruled not to sit in the code pretending to exist.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
  Truck,
  UserRound,
} from "lucide-react";
import {
  purchasingActionButton,
  purchasingActionLine,
  purchasingActionQueue,
  type ProductCategory,
  type PurchaseChase,
  type PurchasePlaceGroup,
  type PurchaseReceive,
  type PurchaseUrgencyBucket,
} from "@carres/shared";
import ListPageShell, { type ActiveChip } from "@/components/ListPageShell";
import { SectionCard, SectionBand } from "@/components/SectionPanel";
// UI-KIT §6.1 — this row now renders on TWO Purchasing tabs, so it stopped
// being inline (P2's Receiving half). Appearance only; the §8.2 behaviour
// still lives in each page, and moving THAT is D0.5c on line ⑧.
import FacetRow, { EmptyFacetHint } from "@/components/FacetRow";
import Btn from "@/components/Btn";
import PurchasingTabs from "./PurchasingTabs";
import { TopBarIcons } from "./components/GlobalTopBar";
import CreatePOModal, { type CreatePoPrefill } from "./components/CreatePOModal";
import ReceivePOModal from "./components/ReceivePOModal";
import { PurchaseListRow } from "./components/PurchaseListRow";
import { PoDocumentPreview } from "./components/PoDocumentPreview";
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
  usePurchaseSkipLines,
  usePurchasePushLines,
  usePurchaseSnoozeSupplier,
} from "@/lib/queries";

// ── Types ────────────────────────────────────────────────────────────────────

type Stage = "place" | "chase" | "receive";

/** R8 — the three stage cells, worded by the dictionary and nowhere else. The
 *  KEY stays the old internal word (URL param + wire compat); the LABEL is the
 *  shared module's, so this page structurally cannot spell one action its own
 *  way. `MiddleListHeader` reads the same map, which is the point: the cell and
 *  the list header are ONE label rendered twice, and that is exactly where "the
 *  same act, two words, on one screen" came from in the first place. */
const STAGE_LABEL: Record<Stage, string> = {
  place: purchasingActionQueue("send_po"),
  chase: purchasingActionQueue("confirm_ready_date"),
  receive: purchasingActionQueue("check_in"),
};

type Selection =
  | { kind: "place"; groupKey: string }
  | { kind: "chase"; poId: string }
  | { kind: "receive"; poId: string }
  | null;

/**
 * P2 — everything the To Order list is "left as" when a drawer opens, so that
 * closing the drawer gives it back (`docs/UI-KIT.md` §8.2). The scroll target
 * is the facet rail, because after the middle list was folded into the tree
 * (2026-07-24) the rail IS this tab's list.
 */
interface ToOrderListState {
  stage: Stage;
  supplierFilter: string | null;
  selection: Selection;
  selectionCleared: boolean;
  facetScrollTop: number;
}

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

// R8 — `dayOfWeek` / `DOW` / `dayName` / `dayLabelShort` deleted with the
// `selectedDay` filter: their only caller was that filter's clear chip.

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
 *  ref-first line items (Jess 2026-07-24 top-to-toe §4: suppliers recognise
 *  their CR/TCF original ref, NOT the SO number, NOT the SKU code). Groups
 *  the group's SKU lines by their customer REF (fallback SO-N when ref null
 *  for a native POS order with no imported ref), one section per order. */
function buildPlaceWaTemplate(
  group: SplitPlaceGroup,
  preparedByName: string | null,
): string {
  const supplier = group.supplierName ?? "the factory";
  // Bucket every (line × forOrder) pair by ref/SO so each customer's PO
  // becomes one clean block in the message. Preserves the earliest-deadline-
  // first order (matches the ORDER column in the SKU table above).
  interface OrderBucket {
    key: string;
    label: string; // "CR-2025-0812" or "SO-1234"
    customerName: string | null;
    deliveryDate: string | null;
    items: Array<{ sku: string; modelName: string | null; size: string | null; qty: number }>;
  }
  const bucketByKey = new Map<string, OrderBucket>();
  for (const l of group.lines) {
    const size = parseSize(l.sku);
    // A line's `need` is aggregated across its forOrders — split back per
    // forOrder so the WA breakdown ties each qty to its own customer. A line
    // with N forOrders and need M sends M ÷ N per order (integer split; any
    // rounding residue lands on the first). Not perfect for exotic
    // many-to-many splits but matches the operator's mental model 95% of
    // the time. Real per-order qty lives on the source order_lines; a
    // follow-up commit can plumb it through instead of splitting here.
    const perOrder = l.forOrders.length > 0
      ? Math.floor(l.need / l.forOrders.length)
      : l.need;
    const residue = l.forOrders.length > 0
      ? l.need - perOrder * l.forOrders.length
      : 0;
    l.forOrders.forEach((o, i) => {
      const key = o.ref ?? (o.so != null ? `SO-${o.so}` : "unknown");
      const label = o.ref ?? (o.so != null ? `SO-${o.so}` : "—");
      let bucket = bucketByKey.get(key);
      if (!bucket) {
        bucket = {
          key,
          label,
          customerName: o.customerName ?? null,
          deliveryDate: o.deliveryDate ?? null,
          items: [],
        };
        bucketByKey.set(key, bucket);
      }
      bucket.items.push({
        sku: l.sku,
        modelName: l.modelName ?? null,
        size: size?.label ?? null,
        qty: perOrder + (i === 0 ? residue : 0),
      });
    });
  }
  const buckets = [...bucketByKey.values()].sort((a, b) => {
    const da = a.deliveryDate ?? "9999";
    const db = b.deliveryDate ?? "9999";
    return da.localeCompare(db) || a.label.localeCompare(b.label);
  });

  const lines: string[] = [];
  lines.push(`${supplier}, we place new order. Please help arrange:`);
  lines.push("");
  for (const b of buckets) {
    const meta = [b.customerName, b.deliveryDate ? `deliver by ${b.deliveryDate}` : null]
      .filter((s): s is string => Boolean(s))
      .join(" · ");
    lines.push(meta ? `${b.label} (${meta})` : b.label);
    for (const it of b.items) {
      const parts = [it.modelName, it.size].filter((s): s is string => Boolean(s));
      const desc = parts.length > 0 ? parts.join(" ") : it.sku;
      lines.push(`  · ${desc} × ${it.qty}`);
    }
    lines.push("");
  }
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
      className="flex items-center gap-1.5 rounded-full border border-base-200 bg-base-50 px-2.5 py-1 text-meta text-base-600"
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
  const [selection, setSelection] = useState<Selection>(null);
  // P2 — "click the same cell again and it clears" (UI-KIT §8.2). The rows
  // ALREADY toggled to null; the auto-select effects below then put the first
  // row straight back, so a re-click has never once cleared anything. This
  // flag is what tells those effects the empty selection was ASKED FOR. It is
  // state, not a ref, because the effects have to re-run when it changes.
  const [selectionCleared, setSelectionCleared] = useState(false);
  // v2 (Loo 2026-07-23): PROJECTS facet lets the operator scope to one big
  // customer whose SOs span multiple factories (Dorsett Loft = 40 rooms →
  // 3+ POs). Data lives in `PurchasePlaceGroupLine.forOrders[i].customerName`
  // — zero migration; group Place rows whose lines serve that customer.
  // v2 (Loo 2026-07-23): Purchase settings side sheet — replaces the small
  // LeadTimesButton modal. Section 1 = Lead times · 2 = Arrival buffer · 3 =
  // PO days · 4 = Duty rotation indicator (edit stays on the Team card).
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
  // Purchase §6 — the 3 line-⋮ actions + Snooze wired to real routes
  // (migration 0243). Each invalidates /today on success so the plan
  // refreshes without a manual reload.
  const skipLines = usePurchaseSkipLines();
  const pushLines = usePurchasePushLines();
  const snoozeSupplier = usePurchaseSnoozeSupplier();
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
      className="w-5 h-5 rounded-full flex items-center justify-center text-label font-semibold shrink-0"
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
      className="w-5 h-5 rounded-full flex items-center justify-center text-label font-semibold shrink-0"
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

  // Switching stage clears the per-stage facet filter + selection.
  //
  // P2 — clicking the stage you are ALREADY on is a no-op. It used to re-run
  // the whole reset, so a second click on `Send POs` silently threw away the
  // supplier the operator had just picked — the exact opposite of §8.2's "the
  // table keeps its filter". A stage is not a filter: there are three and one
  // of them is always on, so there is no "cleared" state to toggle into.
  const goStage = (s: Stage) => {
    if (s === stage) return;
    setStage(s);
    setSupplierFilter(null);
    setSelection(null);
    setSelectionCleared(false);
  };

  /** Pick a row, or clear it when the same row is clicked again (§8.2). */
  const toggleSelection = (next: NonNullable<Selection>, isSelected: boolean) => {
    setSelection(isSelected ? null : next);
    setSelectionCleared(isSelected);
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
      splitPlaceGroups.filter(
        (g) => !supplierFilter || g.supplierId === supplierFilter,
      ),
    [splitPlaceGroups, supplierFilter],
  );
  const chaseShown = useMemo(
    () => chase.filter((r) => !supplierFilter || r.supplierId === supplierFilter),
    [chase, supplierFilter],
  );
  const receiveShown = useMemo(
    () => receive.filter((r) => !supplierFilter || r.supplierId === supplierFilter),
    [receive, supplierFilter],
  );

  // Auto-select the first visible row per stage so the detail pane isn't empty.
  // P2 — but never against the operator's own clear: `selectionCleared` means
  // the empty selection is the answer, not an accident to be filled in.
  useEffect(() => {
    if (stage !== "place" || selectionCleared) return;
    const stillVisible =
      selection?.kind === "place" &&
      placeShown.some((g) => g.groupKey === selection.groupKey);
    if (stillVisible) return;
    setSelection(
      placeShown[0] ? { kind: "place", groupKey: placeShown[0].groupKey } : null,
    );
  }, [stage, placeShown, selection, selectionCleared]);
  useEffect(() => {
    if (stage !== "chase" || selectionCleared) return;
    const stillVisible =
      selection?.kind === "chase" && chaseShown.some((r) => r.poId === selection.poId);
    if (stillVisible) return;
    setSelection(chaseShown[0] ? { kind: "chase", poId: chaseShown[0].poId } : null);
  }, [stage, chaseShown, selection, selectionCleared]);
  useEffect(() => {
    if (stage !== "receive" || selectionCleared) return;
    const stillVisible =
      selection?.kind === "receive" &&
      receiveShown.some((r) => r.poId === selection.poId);
    if (stillVisible) return;
    setSelection(
      receiveShown[0] ? { kind: "receive", poId: receiveShown[0].poId } : null,
    );
  }, [stage, receiveShown, selection, selectionCleared]);

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

  // Active-filter chips per §5.3 — one X-able chip per active filter. There is
  // exactly ONE filter on this tab (R8 deleted the two that nothing could set).
  //
  // R8 — the word is `Supplier`, not `Factory`. The band above this chip has
  // said `Supplier` since 2026-07-24, both sibling Purchasing tabs say
  // `Supplier: {name}`, and COPY-STANDARD's facet-heading table lists `Supplier`
  // and no `Factory`. One facet, one word, across the whole module.
  const activeChips: ActiveChip[] = [];
  if (supplierFilter)
    activeChips.push({
      label: `Supplier: ${supplierName(supplierFilter)}`,
      onClear: () => setSupplierFilter(null),
    });

  // P2 — the one facet cell on this tab that has always obeyed §8.2: click the
  // same supplier again and the filter clears. Kept, and now covered by a test
  // so it cannot quietly stop being true.
  const toggleSupplier = (id: string) => {
    setSupplierFilter((cur) => (cur === id ? null : id));
    // A different filter is a different list — auto-select may resume.
    setSelectionCleared(false);
  };

  // ── P2 · closing a drawer gives the list back (UI-KIT §8.2) ────────────────
  //
  // The two drawers this tab opens are CreatePOModal (Send PO · + New PO ·
  // Send separately) and ReceivePOModal (Check in). Both close by refetching
  // the plan, which re-renders the facet tree — and a shorter tree makes the
  // browser clamp the rail's scrollTop before React has finished. So the state
  // is snapshotted when the drawer opens and put back when it closes.
  const facetInnerRef = useRef<HTMLDivElement | null>(null);
  const getFacetScroller = () =>
    facetInnerRef.current?.closest<HTMLElement>(
      '[data-testid="listshell-facet"]',
    ) ?? null;
  const listStateBeforeDrawer = useRef<ToOrderListState | null>(null);
  const pendingFacetScroll = useRef<number | null>(null);

  const captureListState = () => {
    listStateBeforeDrawer.current = {
      stage,
      supplierFilter,
      selection,
      selectionCleared,
      facetScrollTop: getFacetScroller()?.scrollTop ?? 0,
    };
  };

  const restoreListState = () => {
    const s = listStateBeforeDrawer.current;
    listStateBeforeDrawer.current = null;
    if (!s) return;
    setStage(s.stage);
    setSupplierFilter(s.supplierFilter);
    setSelection(s.selection);
    setSelectionCleared(s.selectionCleared);
    pendingFacetScroll.current = s.facetScrollTop;
  };

  // Re-apply the scroll after every render until it sticks. One assignment is
  // not enough: the refetch that runs on close lands a frame or two later and
  // re-lays the tree out underneath it. Gives up once the rail is too short to
  // hold the old position — a group that was sent is genuinely gone.
  useLayoutEffect(() => {
    const want = pendingFacetScroll.current;
    if (want == null) return;
    const el = getFacetScroller();
    if (!el) return;
    el.scrollTop = want;
    if (el.scrollTop === want || el.scrollHeight - el.clientHeight <= want) {
      pendingFacetScroll.current = null;
    }
  });

  /** Open a drawer — always through here, so nothing can open one without
   *  first recording what the list looked like. */
  const openCreatePo = (prefill: CreatePoPrefill) => {
    captureListState();
    posCountBeforeSend.current = posQ.data?.pos.length ?? 0;
    setCreatePoPrefill(prefill);
  };

  // ── Error state ─────────────────────────────────────────────────────────────
  if (isError) {
    return (
      <div className="h-full flex flex-col">
        <PurchasingTabs />
        <div className="px-6 py-8">
          <div className="max-w-[560px] rounded-[12px] border border-danger bg-error-soft p-4">
            <div className="text-body font-semibold text-danger mb-1">
              Couldn&rsquo;t load the purchase plan.
            </div>
            <div className="text-meta text-base-600 mb-3">
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
      {/* P1 — the gear that opened a READ-ONLY settings sheet is gone. It
          carried its own copies of the numbers (PO days as Mon + Thu, months
          after Jess moved to Mon/Wed/Fri) and a promise that they would become
          editable "when the lead-time table ships". This is that table: the
          Settings tab beside Claims. */}
      <PurchasingTabs
        right={
          <>
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
            <div ref={facetInnerRef} className="flex flex-col gap-2 min-h-0 flex-1">
              {/* + New PO — Gmail compose style (Jess 2026-07-23). Always
                  visible at the top; opens CreatePOModal with EMPTY prefill
                  so the operator can raise an ad-hoc PO (stockpile / runner /
                  special order) not tied to a specific SO. Grey box (not
                  flame — Send PO in the preview owns the ONE flame per page,
                  UI-KIT §A5). */}
              <button
                type="button"
                onClick={() => openCreatePo({ lines: [] })}
                className="shrink-0 flex items-center justify-center gap-2 h-9 rounded-full border border-base-200 bg-white text-base-800 text-body font-semibold hover:bg-hovertint transition-colors"
              >
                <span className="text-strong leading-none">+</span> New PO
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
                    testId="facet-stage-place"
                    leadingChip={poDutyChip}
                    label={STAGE_LABEL.place}
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
                            {/* Category header — Jess 2026-07-24 top-to-toe §3:
                                collapsed the old 2-row shape into ONE row.
                                Left = CAT · N PO · N units (uppercase spine).
                                Right = date + optional Late pill (normal case
                                so the date reads naturally). Vertical space
                                halved per category, ~24px saved per row × N
                                categories = big scroll win once real data
                                lands. */}
                            <div className="flex items-baseline gap-1.5 py-1 pb-1 text-label uppercase tracking-[0.05em] text-base-600">
                              <span className="font-semibold">{cat}</span>
                              <span className="tabular-nums font-normal text-base-500">
                                · {groups.length} PO · {totalUnits} units
                              </span>
                              <span className="ml-auto flex items-center gap-1.5 tabular-nums font-normal text-base-500 normal-case">
                                {earliestIso && <span>{fmtDate(earliestIso)}</span>}
                                {anyLate && (
                                  <span className="pill pill-overdue">Late</span>
                                )}
                              </span>
                            </div>
                            {groups.map((g) => {
                              const isSel =
                                selection?.kind === "place" &&
                                selection.groupKey === g.groupKey;
                              return (
                                <button
                                  key={g.groupKey}
                                  type="button"
                                  data-testid={`place-row-${g.groupKey}`}
                                  aria-pressed={isSel}
                                  onClick={() =>
                                    toggleSelection(
                                      { kind: "place", groupKey: g.groupKey },
                                      isSel,
                                    )
                                  }
                                  className={`w-full text-left rounded-md px-2 py-1 flex items-center gap-2 transition-colors ${
                                    isSel
                                      ? "is-selected"
                                      : "hover:bg-hovertint"
                                  }`}
                                >
                                  <span className="text-meta font-medium text-base-900 truncate">
                                    {g.supplierName ?? "the factory"}
                                  </span>
                                  <span className="ml-auto shrink-0 text-label tabular-nums text-base-500">
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
                    testId="facet-stage-chase"
                    leadingChip={poDutyChip}
                    label={STAGE_LABEL.chase}
                    count={chaseCount}
                    tone={chaseCount > 0 ? "danger" : "muted"}
                    active={stage === "chase"}
                    onClick={() => goStage("chase")}
                  />
                  <FacetRow
                    testId="facet-stage-receive"
                    leadingChip={grnDutyChip}
                    label={STAGE_LABEL.receive}
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
                        testId={`facet-supplier-${f.id}`}
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
                <div className="min-w-0 text-meta">
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

            {/* ── P1 guard — a factory with no production working days. The
                line is held OUT of the plan rather than planned on a guessed
                number, and named here so it cannot be missed. Live it should
                never appear: the migration seeds every pair that owns a SKU. */}
            {stage === "place" && (data?.unrated?.length ?? 0) > 0 && (
              <div className="rounded-[12px] border border-warning bg-warning-soft px-4 py-2.5 flex items-start gap-2.5 shrink-0" data-testid="purchase-unrated-guard">
                <AlertTriangle size={16} className="text-warning shrink-0 mt-0.5" />
                <div className="min-w-0 text-meta">
                  <span className="font-semibold text-warning">Set a number</span>{" "}
                  <span className="text-base-600">
                    {(data?.unrated ?? [])
                      .map((u) => `${u.supplierName ?? "This factory"} · ${u.category}`)
                      .join(", ")}
                    {" "}has no production working days, so no order-by date is
                    computed. Set it on the Settings tab.
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
                    onSendPo={(prefill) => openCreatePo(prefill)}
                    buildPrefill={() => buildPlacePrefill(selectedPlace)}
                    waTemplate={buildPlaceWaTemplate(
                      selectedPlace,
                      dutyQ.data?.holder?.name ?? null,
                    )}
                    actions={{
                      onSkip: (lineIds) =>
                        skipLines.mutate(lineIds, {
                          onSuccess: (r) =>
                            toast.success(
                              `Skipped ${r.skipped} line${r.skipped === 1 ? "" : "s"} — won't be bought`,
                            ),
                          onError: (e) => toast.error(e.message),
                        }),
                      onPushNext: (lineIds) =>
                        pushLines.mutate(
                          { lineIds },
                          {
                            onSuccess: (r) =>
                              toast.success(
                                `Pushed to the next PO day (${fmtDate(r.until.slice(0, 10))})`,
                              ),
                            onError: (e) => toast.error(e.message),
                          },
                        ),
                      onSendSeparately: (sku) => {
                        // Open CreatePOModal with ONLY this SKU line.
                        const ln = selectedPlace.lines.find((l) => l.sku === sku);
                        if (!ln) return;
                        openCreatePo({
                          supplierId: selectedPlace.supplierId,
                          lines: [{ sku: ln.sku, qty: ln.need, attrs: null }],
                          note: `Sent separately from cockpit · ${ln.sku} × ${ln.need}`,
                        });
                      },
                      onSnooze: (untilIso) =>
                        snoozeSupplier.mutate(
                          {
                            supplierId: selectedPlace.supplierId,
                            until: untilIso,
                          },
                          {
                            onError: (e) => toast.error(e.message),
                          },
                        ),
                    }}
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
                                toggleSelection(
                                  { kind: "chase", poId: r.poId },
                                  selection?.kind === "chase" &&
                                    selection.poId === r.poId,
                                )
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
                              toggleSelection(
                                { kind: "receive", poId: r.poId },
                                selection?.kind === "receive" &&
                                  selection.poId === r.poId,
                              )
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
                      onCheckIn={(poId) => {
                        captureListState();
                        setCheckInPoId(poId);
                      }}
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
            // P2 — the list comes back exactly as it was left, BEFORE the
            // refetch re-renders the tree underneath it.
            restoreListState();
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
              restoreListState();
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
      <span className="text-meta text-base-500 tabular-nums">
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
  // R8 — the SAME label the facet cell above renders, from the same map. Two
  // spellings of one act on one screen is the defect this card exists to end.
  const title = STAGE_LABEL[stage];
  const badge =
    shownCount === totalCount
      ? `${shownCount}`
      : `${shownCount} of ${totalCount}`;
  return (
    <div className="shrink-0 px-3 py-2 border-b border-base-200 bg-base-50 flex items-center justify-between">
      <span className="text-body font-semibold text-base-900 truncate">
        {title}
      </span>
      <span className="text-label font-semibold text-base-500 tabular-nums shrink-0">
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
        <div className="text-body text-base-600">{hint}</div>
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
        <div className="flex items-center gap-1.5 text-strong font-semibold text-base-900">
          <Factory size={18} className="text-base-500 shrink-0" />
          <span className="truncate">Chase {supplierName}</span>
          <span className="pill pill-overdue shrink-0 ml-auto">
            <AlertCircle />
            {row.daysLate}d late
          </span>
        </div>
        <div className="text-meta text-base-600 mt-1">
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
            <div className="text-body font-semibold font-mono text-base-900">{it.sku}</div>
            <div className="text-meta text-base-500">
              still waiting{" "}
              <span className="font-semibold font-mono text-base-900 tabular-nums">
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
        <div className="flex items-center gap-1.5 text-strong font-semibold text-base-900">
          <Truck size={18} className="text-base-500 shrink-0" />
          <span className="truncate">
            {purchasingActionLine("check_in", { supplier: supplierName })}
          </span>
          <span className="pill pill-sent shrink-0 ml-auto">
            <PackageCheck />
            {total} to check in
          </span>
        </div>
        <div className="text-meta text-base-600 mt-1">
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
            <div className="text-body font-semibold font-mono text-base-900">{it.sku}</div>
            <div className="text-body font-semibold font-mono text-base-900 tabular-nums">
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
          {purchasingActionButton("check_in")}
        </Btn>
      </div>
    </div>
  );
}

// ── What to do — inline horizontal (all steps on one line with → separators) ─

function WhatToDo({ steps }: { steps: string[] }) {
  return (
    <div className="shrink-0 mx-4 mb-2 mt-2 rounded-[10px] border border-dashed border-base-200 bg-base-50/70 px-3 py-2">
      <div className="flex items-center gap-2 flex-wrap text-meta text-base-700">
        <span className="text-label font-semibold uppercase tracking-[0.05em] text-base-500 shrink-0">
          What to do
        </span>
        {steps.map((s, i) => (
          <span key={i} className="flex items-center gap-1 shrink-0">
            <span className="grid place-items-center w-4 h-4 rounded-full bg-base-200 text-base-700 text-label font-semibold font-mono">
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
    <div className="px-4 py-8 text-center text-meta text-base-500">{text}</div>
  );
}

function EmptyDone({ text, sub }: { text: string; sub: string }) {
  return (
    <div className="px-4 py-8 text-center">
      <div className="mx-auto mb-2 grid place-items-center w-9 h-9 rounded-full bg-success-soft">
        <Check size={18} className="text-success" />
      </div>
      <div className="text-body font-semibold text-base-900">{text}</div>
      <div className="text-meta text-base-500 mt-1">{sub}</div>
    </div>
  );
}
