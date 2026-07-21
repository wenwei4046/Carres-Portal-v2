/**
 * OperationPurchase — the Purchase / Procurement cockpit (scale-aware rebuild
 * 2026-07-21).
 *
 * SAP-Fiori faceted list + master-detail. The per-customer "tall card" list did
 * not scale to 500 orders, so the day is now ONE STAGE AT A TIME:
 *
 *   KPI strip (3 cards) = the STAGE SWITCHER  →  ① Place · ② Chase · ③ Receive.
 *   Left facet          = filter + jump; its numbers TALLY the right.
 *   Right               = the active stage's list.
 *   Right-side DRAWER   = the ① Place drill-in (aggregated SKU table).
 *
 * ① Place is ONE ROW PER SUPPLIER (`placeGroups` from the engine) — 2–4 rows
 * even at 500 orders. Reviewing a row opens the drawer's per-SKU table.
 *
 * Read-only: every write affordance (Send all / Send PO / Something wrong /
 * Chase / Check-in) is a STUB — actually raising a PO / booking a GRN is a
 * later unit. No order-write path is touched here.
 *
 * Design: UI-KIT v4 (docs/UI-KIT.md) — ListPageShell frame, token classes only
 * (no raw hex), Lucide icons, `.pill` status tones, `Btn`, English-only copy.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Factory,
  Minus,
  MessageCircle,
  PackageCheck,
  RefreshCw,
  Send,
  Truck,
  X,
  type LucideIcon,
} from "lucide-react";
import type {
  ProductCategory,
  PurchaseChase,
  PurchasePlaceGroup,
  PurchaseReceive,
  PurchaseUrgencyBucket,
} from "@carres/shared";
import ListPageShell from "@/components/ListPageShell";
import Btn from "@/components/Btn";
import PurchasingTabs from "./PurchasingTabs";
import { fmtDate, fmtDateShort } from "@/lib/fmt-date";
import { buildSupplierChase } from "@/lib/wa-templates";
import type { SupplierRow } from "@/lib/queries";
import { usePurchaseToday, useOperationSuppliers } from "@/lib/queries";

// ── Small pure helpers ───────────────────────────────────────────────────────

type Stage = "place" | "chase" | "receive";
type Attn = "overdue" | "missing" | null;

/** Calendar days between two ISO dates (`to − from`), or null if either bad. */
function daysBetween(fromIso: string | null, toIso: string | null): number | null {
  if (!fromIso || !toIso) return null;
  const a = new Date(`${fromIso.slice(0, 10)}T00:00:00`);
  const b = new Date(`${toIso.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
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
      return { cls: "pill-overdue", Icon: AlertCircle, label: "Overdue" };
    case "urgent":
      return { cls: "pill-overdue", Icon: AlertCircle, label: "Order now" };
    case "due":
      return { cls: "pill-warning", Icon: Clock, label: "Order soon" };
    case "scheduled":
      return { cls: "pill-sent", Icon: Clock, label: "Scheduled" };
    case "no_deadline":
      return { cls: "pill-neutral", Icon: Minus, label: "No deadline" };
    default:
      return { cls: "pill-neutral", Icon: Minus, label: "—" };
  }
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

// ── Page ─────────────────────────────────────────────────────────────────────

export default function OperationPurchase() {
  const { data, isLoading, isError, error, refetch } = usePurchaseToday();
  const suppliersQ = useOperationSuppliers();
  const [facetOpen, setFacetOpen] = useState(true);
  const [stage, setStage] = useState<Stage>("place");
  const [supplierFilter, setSupplierFilter] = useState<string | null>(null);
  const [attn, setAttn] = useState<Attn>(null);
  const [drawerSupplierId, setDrawerSupplierId] = useState<string | null>(null);

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

  // ① Place groups — resolve each supplier's display name (the engine leaves it
  // null; the web maps it via useOperationSuppliers, like the rest of the page).
  const placeGroups = useMemo(
    () =>
      (data?.placeGroups ?? []).map((g) => ({
        ...g,
        supplierName: g.supplierName ?? supplierName(g.supplierId),
      })),
    [data?.placeGroups, supplierName],
  );

  // Switching stage resets the per-stage facet filters + closes the drawer.
  const goStage = (s: Stage) => {
    setStage(s);
    setSupplierFilter(null);
    setAttn(null);
    setDrawerSupplierId(null);
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

  // The active stage's filtered right list.
  const placeShown = useMemo(
    () =>
      placeGroups.filter((g) => {
        if (supplierFilter && g.supplierId !== supplierFilter) return false;
        if (attn === "overdue" && g.urgency !== "late") return false;
        if (attn === "missing" && g.urgency !== "no_deadline") return false;
        return true;
      }),
    [placeGroups, supplierFilter, attn],
  );
  const chaseShown = useMemo(
    () => chase.filter((r) => !supplierFilter || r.supplierId === supplierFilter),
    [chase, supplierFilter],
  );
  const receiveShown = useMemo(
    () => receive.filter((r) => !supplierFilter || r.supplierId === supplierFilter),
    [receive, supplierFilter],
  );

  const drawerGroup = drawerSupplierId
    ? placeGroups.find((g) => g.supplierId === drawerSupplierId) ?? null
    : null;

  // Missing-deadline data guard — SOs (from any no-deadline group) to flag.
  const missingSoLabels = useMemo(() => {
    const seen = new Set<string>();
    for (const g of placeGroups) {
      if (g.urgency !== "no_deadline") continue;
      for (const ln of g.lines)
        for (const o of ln.forOrders) if (o.so) seen.add(`SO-${o.so}`);
    }
    return [...seen];
  }, [placeGroups]);

  const toggleSupplier = (id: string) =>
    setSupplierFilter((cur) => (cur === id ? null : id));

  // ── Error state ──
  if (isError) {
    return (
      <div className="h-full flex flex-col">
        <PurchasingTabs />
        <div className="px-6 py-8">
        <div className="max-w-[560px] rounded-[12px] border border-danger bg-error-soft p-4">
          <div className="text-[13px] font-semibold text-danger mb-1">
            Couldn&rsquo;t load the purchase plan
          </div>
          <div className="text-[12px] text-base-600 mb-3">
            {(error as Error | undefined)?.message ?? "Unknown error"}
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
      <PurchasingTabs />
      <div className="flex-1 min-h-0">
        <ListPageShell
          testId="operation-purchase"
      breadcrumb={
        <>
          <span>Operations</span>
          <ChevronRight size={12} className="text-base-300" />
          <span className="text-base-600">To Order</span>
        </>
      }
      meta={
        <div className="flex items-center gap-3">
          <span className="text-[12px] text-base-400">
            {today ? `Today · ${fmtDate(today)}` : "—"}
          </span>
          <button
            type="button"
            onClick={() => void refetch()}
            title="Refresh"
            aria-label="Refresh purchase plan"
            className="p-1 rounded hover:text-base-900 hover:bg-hovertint transition-colors"
          >
            <RefreshCw size={14} strokeWidth={2} />
          </button>
        </div>
      }
      title="To Order"
      facetOpen={facetOpen}
      onFacetToggle={() => setFacetOpen((v) => !v)}
      facetToggleTitle="Show overview"
      facet={
        <div className="bg-white border border-base-200 rounded-[12px] p-1.5">
          {/* Needs attention (alarm) */}
          <FacetGroup title="Needs attention" danger>
            <FacetRow
              label="Overdue"
              count={placeOverdue}
              tone={placeOverdue > 0 ? "danger" : "muted"}
              active={stage === "place" && attn === "overdue"}
              onClick={() => {
                setStage("place");
                setDrawerSupplierId(null);
                setSupplierFilter(null);
                setAttn((a) => (a === "overdue" ? null : "overdue"));
              }}
            />
            <FacetRow
              label="Missing deadline"
              count={missingCount}
              tone={missingCount > 0 ? "danger" : "muted"}
              active={stage === "place" && attn === "missing"}
              onClick={() => {
                setStage("place");
                setDrawerSupplierId(null);
                setSupplierFilter(null);
                setAttn((a) => (a === "missing" ? null : "missing"));
              }}
            />
          </FacetGroup>

          {/* Today's work — the ①②③ stage jump (syncs with the KPI cards) */}
          <FacetGroup title="Today's work">
            <FacetRow
              numbered="1"
              label="Place orders"
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

          {/* By factory — units in the CURRENT stage; click filters the right */}
          <FacetGroup
            title={
              stage === "place"
                ? "By factory · to order"
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
      <div className="flex-1 min-h-0 overflow-y-auto pr-1">
        <div className="mx-auto w-full max-w-[860px] flex flex-col pb-10">
          {/* ── KPI strip = STAGE SWITCHER ─────────────────────────────── */}
          <div className="grid grid-cols-3 gap-2.5">
            <KpiCard
              value={isLoading ? "…" : placeCount}
              label="To place"
              sub={placeOverdue > 0 ? `${placeOverdue} overdue` : "on track"}
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
              sub={receiveCount > 0 ? "ready to book in" : "nothing arriving"}
              subTone="muted"
              active={stage === "receive"}
              onClick={() => goStage("receive")}
            />
          </div>

          {/* ── Data guard — un-plannable orders (place stage only) ───────── */}
          {stage === "place" && missingCount > 0 && (
            <div className="mt-3.5 rounded-[12px] border border-danger bg-error-soft px-4 py-3 flex items-start gap-2.5">
              <AlertTriangle size={16} className="text-danger shrink-0 mt-0.5" />
              <div className="min-w-0">
                <div className="text-[13px] font-semibold text-danger">
                  {missingCount} {missingCount === 1 ? "order" : "orders"} can&rsquo;t be
                  planned yet
                </div>
                <div className="text-[12px] text-base-600 mt-0.5">
                  {missingSoLabels.length > 0 && (
                    <>{missingSoLabels.slice(0, 4).join(", ")} </>
                  )}
                  {missingCount === 1 ? "has" : "have"} no delivery deadline — the system
                  can&rsquo;t schedule the purchase. Ask the salesperson to set a deadline.
                </div>
              </div>
            </div>
          )}

          {/* ── ①  PLACE — one row per supplier ───────────────────────────── */}
          {stage === "place" && (
            <>
              <StageHead
                n="1"
                title="Place orders"
                subtitle="POs to send today. Red = already late."
                count={`${placeShown.length} to send`}
                action={
                  placeShown.length > 0 ? (
                    <Btn
                      variant="hero"
                      size="md"
                      icon={Send}
                      title="Send every factory order at once (raising the POs is a later unit)"
                      onClick={() => {
                        /* TODO: batch PO-raise — send every supplier order at once.
                           The PO-raise action is a separate, not-yet-built unit. */
                      }}
                    >
                      Send all
                    </Btn>
                  ) : undefined
                }
              />
              {isLoading ? (
                <PanelHint text="Loading today's purchase plan…" />
              ) : placeShown.length === 0 ? (
                <EmptyDone
                  text="Nothing to order today"
                  sub="Every live order is already covered by ready stock or an open PO."
                />
              ) : (
                placeShown.map((g) => (
                  <PlaceSupplierRow
                    key={g.supplierId}
                    group={g}
                    today={today}
                    onReview={() => setDrawerSupplierId(g.supplierId)}
                  />
                ))
              )}
            </>
          )}

          {/* ── ②  CHASE ──────────────────────────────────────────────────── */}
          {stage === "chase" && (
            <>
              <StageHead
                n="2"
                title="Chase factory"
                subtitle="Orders you already sent, running late at the factory."
                count={`${chaseShown.length} late`}
              />
              {isLoading ? (
                <PanelHint text="Loading the factory-chase list…" />
              ) : chaseShown.length === 0 ? (
                <EmptyDone
                  text="Nothing to chase today"
                  sub="No factory is past its promised ready date."
                />
              ) : (
                chaseShown.map((row) => (
                  <ChaseCard
                    key={row.poId}
                    row={row}
                    supplierName={supplierName}
                    supplier={supplierById.get(row.supplierId)}
                  />
                ))
              )}
            </>
          )}

          {/* ── ③  RECEIVE ────────────────────────────────────────────────── */}
          {stage === "receive" && (
            <>
              <StageHead
                n="3"
                title="Receive deliveries"
                subtitle="Check goods in, then book them into Klang."
                count={`${receiveShown.length} to receive`}
              />
              {isLoading ? (
                <PanelHint text="Loading arriving deliveries…" />
              ) : receiveShown.length === 0 ? (
                <EmptyDone
                  text="Nothing to receive today"
                  sub="No factory has goods ready or arriving."
                />
              ) : (
                receiveShown.map((row) => (
                  <ReceiveCard key={row.poId} row={row} supplierName={supplierName} />
                ))
              )}
            </>
          )}
        </div>
      </div>

      {/* ── ①  Place drill-in DRAWER (aggregated SKU table) ─────────────── */}
      {drawerGroup && (
        <PlaceDrawer
          group={drawerGroup}
          today={today}
          onClose={() => setDrawerSupplierId(null)}
        />
      )}
        </ListPageShell>
      </div>
    </div>
  );
}

// ── ①  Supplier place row (one factory PO to send) ───────────────────────────

function PlaceSupplierRow({
  group,
  today,
  onReview,
}: {
  group: PurchasePlaceGroup;
  today: string | null;
  onReview: () => void;
}) {
  const u = urgencyStyle(group.urgency);
  const hot = group.urgency === "late" || group.urgency === "urgent";
  const kind = CATEGORY_KIND[group.categories[0] ?? "mattress"];
  const overdueDays =
    group.urgency === "late" && group.earliestOrderBy && today
      ? daysBetween(group.earliestOrderBy, today)
      : null;

  return (
    <div
      className={`mb-3 rounded-[14px] bg-white shadow-sm border px-4 py-3.5 flex items-center gap-4 ${
        hot ? "border-danger" : "border-base-200"
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-[15px] font-bold text-base-900">
          <Factory size={16} className="text-base-400 shrink-0" />
          <span className="truncate">{group.supplierName}</span>
          <span className="text-[12px] font-medium text-base-500">· {kind}</span>
          <span className={`pill ${u.cls} shrink-0 ml-1`}>
            <u.Icon />
            {u.label}
          </span>
        </div>
        <div className="text-[12px] text-base-600 mt-1">
          <span className="font-semibold text-base-800 tabular-nums">
            {group.totalUnits} {group.totalUnits === 1 ? "unit" : "units"}
          </span>
          {" · "}
          <span className="tabular-nums">
            {group.orderCount} {group.orderCount === 1 ? "order" : "orders"}
          </span>
          {group.earliestOrderBy && (
            <>
              {" · "}
              {group.urgency === "late" ? (
                <span className="text-danger font-semibold">
                  order-by {fmtDateShort(group.earliestOrderBy)}
                  {overdueDays != null && overdueDays > 0 ? ` (${overdueDays}d late)` : ""}
                </span>
              ) : (
                <>order-by from {fmtDateShort(group.earliestOrderBy)}</>
              )}
            </>
          )}
        </div>
      </div>
      <Btn
        variant="box"
        size="md"
        icon={ArrowRight}
        title={`Review the ${group.supplierName} order before sending`}
        onClick={onReview}
      >
        Review &amp; send
      </Btn>
    </div>
  );
}

// ── ①  Place drill-in drawer (aggregated SKU table) ──────────────────────────

const WRONG_OPTIONS = [
  "Supplier has no stock",
  "Price changed",
  "Customer cancelled",
  "Ask manager",
] as const;

function PlaceDrawer({
  group,
  today,
  onClose,
}: {
  group: PurchasePlaceGroup;
  today: string | null;
  onClose: () => void;
}) {
  const [wrongOpen, setWrongOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const wrongRef = useRef<HTMLDivElement | null>(null);

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

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

  // Buy cost (advisory) = Σ(cost × need). Hidden entirely when 0 / all null.
  const hasCost = group.lines.some((l) => l.cost != null && l.cost > 0);
  const buyCost = group.lines.reduce((sum, l) => sum + (l.cost ?? 0) * l.need, 0);
  const lateLines =
    today != null
      ? group.lines.filter((l) => l.orderBy != null && l.orderBy < today).length
      : 0;

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true">
      {/* backdrop */}
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-base-900/30"
        onClick={onClose}
      />
      {/* panel */}
      <div className="relative w-full max-w-[560px] h-full bg-white shadow-xl flex flex-col">
        {/* header */}
        <div className="shrink-0 border-b border-base-200 px-5 py-3.5 flex items-start gap-3">
          <div className="min-w-0 flex-1">
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
          <button
            type="button"
            onClick={onClose}
            title="Close"
            aria-label="Close"
            className="shrink-0 p-1 rounded hover:bg-hovertint text-base-500 hover:text-base-900 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* aggregated SKU table */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 px-5 py-2 text-[11px] font-bold uppercase tracking-[0.04em] text-base-400 border-b border-base-100 sticky top-0 bg-white">
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
                  className="w-full grid grid-cols-[1fr_auto_auto] gap-x-4 items-center px-5 py-2.5 text-left hover:bg-hovertint transition-colors"
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
                  <div className="px-5 pb-2.5 pl-[43px] flex flex-col gap-0.5">
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

        {/* footer */}
        <div className="shrink-0 border-t border-base-200 px-5 py-3 flex items-center justify-between gap-3 bg-base-50">
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
                size="md"
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
            title={`Send the PO to ${group.supplierName} (raising the PO is a later unit)`}
            onClick={() => {
              /* TODO: raise the PO for this factory order. The PO-raise write path
                 is a separate, not-yet-built unit — this button is a stub. */
            }}
          >
            Send PO
          </Btn>
        </div>
      </div>
    </div>
  );
}

// ── Stage head (①②③) ─────────────────────────────────────────────────────────

function StageHead({
  n,
  title,
  subtitle,
  count,
  action,
}: {
  n: string;
  title: string;
  subtitle: string;
  count: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 mt-5 mb-3">
      <span className="grid place-items-center w-7 h-7 rounded-lg bg-base-900 text-white text-[13px] font-bold font-mono shrink-0">
        {n}
      </span>
      <div className="min-w-0">
        <div className="text-[15px] font-bold text-base-900">{title}</div>
        <div className="text-[12px] text-base-500">{subtitle}</div>
      </div>
      <div className="ml-auto shrink-0 flex items-center gap-2.5">
        <span className="text-[12px] font-semibold text-base-500 bg-base-100 rounded-full px-2.5 py-1 tabular-nums">
          {count}
        </span>
        {action}
      </div>
    </div>
  );
}

// ── ②  Factory chase card ────────────────────────────────────────────────────

function ChaseCard({
  row,
  supplierName,
  supplier,
}: {
  row: PurchaseChase;
  supplierName: (id: string) => string;
  supplier: SupplierRow | undefined;
}) {
  const name = supplierName(row.supplierId);
  const customers = row.linkedOrders
    .map((o) => o.customerName?.trim() || (o.so ? `SO-${o.so}` : null))
    .filter((s): s is string => Boolean(s));
  const deadline = row.earliestDeliveryDate;

  // WhatsApp chase — prefer the supplier's phone (prefillable wa.me deep link);
  // fall back to the group link (open only — group links can't carry ?text=).
  // TODO: a dedicated `suppliers.whatsapp_group_url` chase entry-point + the
  //       original CR/TCF ref (suppliers speak the ref, not the PO uuid).
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
    /* else: no contact on file — button is disabled below. */
  };
  const canChase = Boolean(waBase || groupUrl);

  return (
    <div className="mb-3 rounded-[14px] bg-white overflow-hidden shadow-sm border border-danger">
      {/* header */}
      <div className="flex items-start justify-between gap-3 px-4 pt-3.5 pb-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[15px] font-bold text-base-900">
            <Factory size={16} className="text-base-400 shrink-0" />
            <span className="truncate">{name}</span>
          </div>
          <div className="text-[12px] text-base-600 mt-0.5">
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
          </div>
        </div>
        <span className="pill pill-overdue shrink-0">
          <AlertCircle />
          {row.daysLate}d late
        </span>
      </div>

      {/* items */}
      <div className="px-4 pb-1">
        {row.items.map((it) => (
          <div
            key={it.sku}
            className="flex items-center justify-between gap-3 py-2.5 border-t border-base-100"
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

      {/* footer */}
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-base-50 border-t border-base-200">
        <span className="text-[12px] text-base-500">
          Promised {row.expectedReadyDate ? fmtDateShort(row.expectedReadyDate) : "—"}
        </span>
        <Btn
          variant="box"
          size="md"
          icon={MessageCircle}
          disabled={!canChase}
          title={
            canChase
              ? `Chase ${name} on WhatsApp`
              : "No WhatsApp contact on file for this factory"
          }
          onClick={onChase}
        >
          Chase on WhatsApp
        </Btn>
      </div>
    </div>
  );
}

// ── ③  Receive (GRN) card ────────────────────────────────────────────────────

function ReceiveCard({
  row,
  supplierName,
}: {
  row: PurchaseReceive;
  supplierName: (id: string) => string;
}) {
  const name = supplierName(row.supplierId);
  const customers = row.linkedOrders
    .map((o) => o.customerName?.trim() || (o.so ? `SO-${o.so}` : null))
    .filter((s): s is string => Boolean(s));
  const when = row.etaDate ?? row.expectedReadyDate;
  const totalUnits = row.items.reduce((sum, it) => sum + it.outstanding, 0);

  return (
    <div className="mb-3 rounded-[14px] bg-white overflow-hidden shadow-sm border border-base-200">
      {/* header */}
      <div className="flex items-start justify-between gap-3 px-4 pt-3.5 pb-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[15px] font-bold text-base-900">
            <Truck size={16} className="text-base-400 shrink-0" />
            <span className="truncate">{name}</span>
          </div>
          <div className="text-[12px] text-base-600 mt-0.5">
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
        <span className="pill pill-sent shrink-0">
          <PackageCheck />
          {totalUnits} to book in
        </span>
      </div>

      {/* items */}
      <div className="px-4 pb-1">
        {row.items.map((it) => (
          <div
            key={it.sku}
            className="flex items-center justify-between gap-3 py-2.5 border-t border-base-100"
          >
            <div className="text-[13px] font-bold font-mono text-base-900">{it.sku}</div>
            <div className="text-[13px] font-bold font-mono text-base-900 tabular-nums">
              &times; {it.outstanding}
            </div>
          </div>
        ))}
      </div>

      {/* GRN 3-step check-in (visual — Check-into-Klg is a later unit) */}
      <GrnSteps />

      {/* footer */}
      <div className="flex items-center justify-end gap-3 px-4 py-2.5 bg-base-50 border-t border-base-200">
        <Btn
          variant="box"
          size="md"
          icon={PackageCheck}
          title="Check these goods into Klang (booking flow is a later unit)"
          onClick={() => {
            /* TODO: GRN write path — receive units + attach DO + book into Klang
               stock. This is a separate, not-yet-built unit; stub for now. */
          }}
        >
          Check into Klg
        </Btn>
      </div>
    </div>
  );
}

/** The receive (GRN) 3-step check-in — a visual guide; not yet functional. */
function GrnSteps() {
  const steps: Array<{ n: string; label: string; hint: string }> = [
    { n: "1", label: "How many arrived?", hint: "of ordered · fewer = partial, rest stays on the PO" },
    { n: "2", label: "Factory DO number + photo", hint: "attach the delivery-order slip" },
    { n: "3", label: "Book into warehouse", hint: "Klang stock updates · auto-reserved to the order" },
  ];
  return (
    <div className="mx-4 mb-3 mt-1 rounded-[10px] border border-dashed border-base-200 bg-base-50/60 px-3 py-2.5">
      <div className="text-[11px] font-bold uppercase tracking-[0.05em] text-base-400 mb-1.5">
        Check it in — 3 steps
      </div>
      <div className="flex flex-col gap-1.5">
        {steps.map((s) => (
          <div key={s.n} className="flex items-center gap-2.5">
            <span className="grid place-items-center w-4 h-4 rounded-full bg-base-200 text-base-600 text-[10px] font-bold font-mono shrink-0">
              {s.n}
            </span>
            <span className="text-[12px] font-medium text-base-700 min-w-[150px]">{s.label}</span>
            <span className="text-[11px] text-base-400 hidden sm:inline">{s.hint}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PanelHint({ text }: { text: string }) {
  return (
    <div className="rounded-[14px] border border-base-200 bg-white px-5 py-8 text-center text-[12px] text-base-500">
      {text}
    </div>
  );
}

/** Honest "nothing to do here ✓" empty state. */
function EmptyDone({ text, sub }: { text: string; sub: string }) {
  return (
    <div className="rounded-[14px] border border-base-200 bg-white px-5 py-8 text-center">
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
      className={`text-left bg-white rounded-[12px] shadow-sm px-4 py-3 flex flex-col gap-0.5 border transition-colors ${
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

// ── Facet primitives (token-only, blue hover per the KIT hover law) ───────────

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
