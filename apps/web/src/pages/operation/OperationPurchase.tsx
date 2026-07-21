/**
 * OperationPurchase — the Purchase / Procurement MRP cockpit (2026-07-21).
 *
 * A "what to do today" guided worklist for a no-experience operator (Jess's
 * brief, approved mock `purchase-cockpit-mock.html`). It reads GET
 * /api/operation/purchase/today (the pure net-requirements engine over live
 * demand + supply) and lays the day out as: a KPI strip, a data-guard for
 * un-plannable orders, then THREE numbered sections —
 *   ①  Place orders   — LIVE, wired to `bundles` (one card per factory).
 *   ②  Chase factory   — PLACEHOLDER (the endpoint doesn't feed this yet).
 *   ③  Receive         — PLACEHOLDER (static GRN 3-step preview).
 * plus a "Done today" recap (static).
 *
 * Read-only: the "Send order to <factory>" flame is a stub — actually raising
 * the PO is a later unit. No order-write path is touched here.
 *
 * Design: UI-KIT v4 (docs/UI-KIT.md) — ListPageShell frame, token classes only
 * (no raw hex), Lucide icons, `.pill` status tones, English-only copy.
 */
import { useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Factory,
  Info,
  Minus,
  MessageCircle,
  PackageCheck,
  RefreshCw,
  Send,
  type LucideIcon,
} from "lucide-react";
import type {
  ProductCategory,
  PurchaseBundle,
  PurchaseUrgencyBucket,
} from "@carres/shared";
import ListPageShell from "@/components/ListPageShell";
import Btn from "@/components/Btn";
import { fmtDate, fmtDateShort } from "@/lib/fmt-date";
import { usePurchaseToday, useOperationSuppliers } from "@/lib/queries";

// ── Small pure helpers ───────────────────────────────────────────────────────

/** Calendar days between two ISO dates (`to − from`), or null if either bad. */
function daysBetween(fromIso: string | null, toIso: string | null): number | null {
  if (!fromIso || !toIso) return null;
  const a = new Date(`${fromIso.slice(0, 10)}T00:00:00`);
  const b = new Date(`${toIso.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
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

// ── Page ─────────────────────────────────────────────────────────────────────

export default function OperationPurchase() {
  const { data, isLoading, isError, error, refetch } = usePurchaseToday();
  const suppliersQ = useOperationSuppliers();
  const [facetOpen, setFacetOpen] = useState(true);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggleGroup = (k: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(k) ? next.delete(k) : next.add(k);
      return next;
    });

  const supplierName = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of suppliersQ.data?.suppliers ?? []) m.set(s.id, s.name);
    return (id: string) => m.get(id) ?? "Factory";
  }, [suppliersQ.data]);

  const bundles = data?.bundles ?? [];
  const bySku = data?.bySku ?? [];
  const summary = data?.summary;
  const today = data?.today ?? null;

  // Advisory free stock per SKU (from the buy list) — surfaced as the "kept as
  // ready stock, ordering fresh" note on a place-order line.
  const freeStockBySku = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of bySku) if (s.freeStock > 0) m.set(s.sku, s.freeStock);
    return m;
  }, [bySku]);

  // ① Place orders — one card PER (bundle × supplier). A bed-set bundle can
  // span a mattress factory + a bed-frame factory → two factory cards.
  const placeCards = useMemo(() => {
    const cards: Array<{
      key: string;
      bundle: PurchaseBundle;
      supplierId: string;
      items: PurchaseBundle["items"];
    }> = [];
    for (const b of bundles) {
      const bySupplier = new Map<string, PurchaseBundle["items"]>();
      for (const it of b.items) {
        const arr = bySupplier.get(it.supplierId) ?? [];
        arr.push(it);
        bySupplier.set(it.supplierId, arr);
      }
      for (const [supplierId, items] of bySupplier) {
        cards.push({ key: `${b.bundleKey}:${supplierId}`, bundle: b, supplierId, items });
      }
    }
    return cards;
  }, [bundles]);

  // Facet · By factory — units still to buy, grouped by supplier.
  const byFactory = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of bySku) m.set(s.supplierId, (m.get(s.supplierId) ?? 0) + s.toOrder);
    return [...m.entries()]
      .map(([id, units]) => ({ id, units, name: supplierName(id) }))
      .sort((a, b) => b.units - a.units);
  }, [bySku, supplierName]);

  // Facet · Raise-by schedule — bundles grouped by their raise-by date (real,
  // derived from the engine — this is the honest "week ahead").
  const raiseBySchedule = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of bundles) {
      if (!b.raiseBy) continue;
      m.set(b.raiseBy, (m.get(b.raiseBy) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).slice(0, 6);
  }, [bundles]);

  // Orders that can't be planned (no deadline) — the data guard + facet alert.
  const noDeadlineBundles = useMemo(
    () => bundles.filter((b) => b.urgency === "no_deadline"),
    [bundles],
  );

  const lateCount = summary?.late ?? 0;
  const noDeadlineCount = summary?.no_deadline ?? 0;
  const toPlaceBundles = summary?.toPlaceBundles ?? 0;

  // ── Error state ──
  if (isError) {
    return (
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
    );
  }

  return (
    <ListPageShell
      testId="operation-purchase"
      breadcrumb={
        <>
          <span>Operations</span>
          <ChevronRight size={12} className="text-base-300" />
          <span className="text-base-600">Purchase</span>
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
      title="Purchase"
      facetOpen={facetOpen}
      onFacetToggle={() => setFacetOpen((v) => !v)}
      facetToggleTitle="Show overview"
      facet={
        <>
          {/* Needs attention (alarm) */}
          <div className="bg-white border border-base-200 rounded-[12px] p-1.5">
            <FacetGroup
              title="Needs attention"
              danger
              collapsed={collapsed.has("attn")}
              onToggle={() => toggleGroup("attn")}
            >
              <FacetRow label="Overdue" count={lateCount} tone={lateCount > 0 ? "danger" : "muted"} />
              <FacetRow
                label="Missing deadline"
                count={noDeadlineCount}
                tone={noDeadlineCount > 0 ? "danger" : "muted"}
              />
            </FacetGroup>

            {/* Today's work — the ①②③ jump list */}
            <FacetGroup
              title="Today's work"
              total={toPlaceBundles}
              collapsed={collapsed.has("work")}
              onToggle={() => toggleGroup("work")}
            >
              <FacetRow numbered="1" label="Place orders" count={toPlaceBundles} />
              <FacetRow numbered="2" label="Chase factory" count={0} soon />
              <FacetRow numbered="3" label="Receive" count={0} soon />
            </FacetGroup>

            {/* By factory · to buy */}
            <FacetGroup
              title="By factory · to buy"
              collapsed={collapsed.has("factory")}
              onToggle={() => toggleGroup("factory")}
            >
              {byFactory.length === 0 ? (
                <EmptyFacetHint text="Nothing to buy" />
              ) : (
                byFactory.map((f) => (
                  <FacetRow key={f.id} label={f.name} count={f.units} unit="units" />
                ))
              )}
            </FacetGroup>

            {/* Raise-by schedule — derived from the engine (the honest week-ahead) */}
            <FacetGroup
              title="Raise-by schedule"
              collapsed={collapsed.has("sched")}
              onToggle={() => toggleGroup("sched")}
            >
              {raiseBySchedule.length === 0 ? (
                <EmptyFacetHint text="No dated bundles" />
              ) : (
                raiseBySchedule.map(([d, n]) => (
                  <FacetRow key={d} label={fmtDateShort(d)} count={n} />
                ))
              )}
            </FacetGroup>
          </div>
        </>
      }
    >
      <div className="flex-1 min-h-0 overflow-y-auto pr-1">
        <div className="mx-auto w-full max-w-[820px] flex flex-col pb-10">
          {/* ── KPI strip ─────────────────────────────────────────────── */}
          <div className="grid grid-cols-3 gap-2.5">
            <KpiCard
              value={isLoading ? "…" : toPlaceBundles}
              label="orders to place"
              sub={lateCount > 0 ? `${lateCount} overdue` : "on track"}
              subTone={lateCount > 0 ? "danger" : "muted"}
            />
            <KpiCard
              value="—"
              label="factory to chase"
              sub="coming next"
              subTone="muted"
            />
            <KpiCard
              value="—"
              label="delivery to receive"
              sub="coming next"
              subTone="muted"
            />
          </div>

          {/* ── Data guard — un-plannable orders ──────────────────────── */}
          {noDeadlineCount > 0 && (
            <div className="mt-3.5 rounded-[12px] border border-danger bg-error-soft px-4 py-3 flex items-start justify-between gap-3">
              <div className="min-w-0 flex items-start gap-2.5">
                <AlertTriangle size={16} className="text-danger shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold text-danger">
                    {noDeadlineCount} {noDeadlineCount === 1 ? "order" : "orders"} can&rsquo;t be planned yet
                  </div>
                  <div className="text-[12px] text-base-600 mt-0.5">
                    {noDeadlineBundles.length > 0 && (
                      <>
                        {noDeadlineBundles
                          .map((b) => (b.so ? `SO-${b.so}` : "an order"))
                          .slice(0, 4)
                          .join(", ")}{" "}
                      </>
                    )}
                    {noDeadlineCount === 1 ? "has" : "have"} no delivery deadline — the system
                    can&rsquo;t schedule the purchase. Ask the salesperson to set a deadline.
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── ①  PLACE ORDERS (LIVE) ────────────────────────────────── */}
          <StepHead
            n="1"
            title="Place orders"
            subtitle="Send these to your factories now. Red = already late."
            count={`${placeCards.length} to send`}
            action={
              placeCards.length > 0 ? (
                <Btn
                  variant="hero"
                  size="md"
                  icon={Send}
                  title="Send all of today's orders to their factories (raising the POs is a later unit)"
                  onClick={() => {
                    /* TODO: batch PO-raise — send every factory card at once. The
                       PO-raise action is a separate, not-yet-built unit; stub for now. */
                  }}
                >
                  Send today&rsquo;s orders
                </Btn>
              ) : undefined
            }
          />

          {isLoading ? (
            <PanelHint text="Loading today's purchase plan…" />
          ) : placeCards.length === 0 ? (
            <div className="rounded-[14px] border border-base-200 bg-white px-5 py-8 text-center">
              <div className="mx-auto mb-2 grid place-items-center w-9 h-9 rounded-full bg-success-soft">
                <Check size={18} className="text-success" />
              </div>
              <div className="text-[13px] font-semibold text-base-900">
                Nothing to order today
              </div>
              <div className="text-[12px] text-base-500 mt-1">
                Every live order is already covered by ready stock or an open PO.
              </div>
            </div>
          ) : (
            placeCards.map((card) => (
              <PlaceCard
                key={card.key}
                card={card}
                today={today}
                supplierName={supplierName}
                freeStockBySku={freeStockBySku}
              />
            ))
          )}

          {/* ── ②  CHASE FACTORY (PLACEHOLDER) ────────────────────────── */}
          <StepHead
            n="2"
            title="Chase factory"
            subtitle="Orders you already sent, running late at the factory."
            count="coming next"
          />
          <PlaceholderSection
            Icon={MessageCircle}
            title="Chase list — coming next"
            body="Once a PO is raised, the factory-chase queue (late POs, one-tap WhatsApp reminder) lands here. Not wired to the backend yet."
          />

          {/* ── ③  RECEIVE (PLACEHOLDER + static GRN preview) ─────────── */}
          <StepHead
            n="3"
            title="Receive deliveries"
            subtitle="Check goods in, then book them into Klang."
            count="coming next"
          />
          <PlaceholderSection
            Icon={PackageCheck}
            title="Receiving — coming next"
            body="Arriving lorries will show here. The 3-step check-in below is a preview of the flow — it is not functional yet."
          />
          <GrnPreview />

          {/* ── DONE TODAY (static recap) ─────────────────────────────── */}
          <div className="mt-6 flex items-center gap-2.5 mb-3">
            <span className="grid place-items-center w-6 h-6 rounded-md bg-success text-white text-[12px] font-bold font-mono">
              <Check size={14} />
            </span>
            <div>
              <div className="text-[13px] font-bold text-base-900">Done today</div>
              <div className="text-[12px] text-base-500">
                Already handled — for your record.
              </div>
            </div>
          </div>
          <div className="rounded-[12px] border border-base-200 bg-white px-5 py-6 text-center text-[12px] text-base-500">
            <CheckCircle2 size={18} className="mx-auto mb-1.5 text-base-300" />
            Completed placements + receipts will be recorded here as the flow goes live.
          </div>
        </div>
      </div>
    </ListPageShell>
  );
}

// ── ①  Factory place-order card ──────────────────────────────────────────────

function PlaceCard({
  card,
  today,
  supplierName,
  freeStockBySku,
}: {
  card: { bundle: PurchaseBundle; supplierId: string; items: PurchaseBundle["items"] };
  today: string | null;
  supplierName: (id: string) => string;
  freeStockBySku: Map<string, number>;
}) {
  const { bundle, supplierId, items } = card;
  const u = urgencyStyle(bundle.urgency);
  const hot = bundle.urgency === "late" || bundle.urgency === "urgent";
  const kind = CATEGORY_KIND[items[0]?.category ?? "mattress"];
  const name = supplierName(supplierId);
  const overdueDays =
    bundle.urgency === "late" && bundle.raiseBy && today
      ? daysBetween(bundle.raiseBy, today)
      : null;
  // Customer name is the card's primary label; SO number falls to the sub-line.
  const soLabel = bundle.so ? `SO-${bundle.so}` : "Order";
  const customer = bundle.customerName?.trim() || "";
  const primaryLabel = customer || soLabel;
  // System cost (advisory / display only): Σ(unit cost × units to order) on this
  // card. Null costs count as 0 — the total is still shown.
  const cardCost = items.reduce((sum, it) => sum + (it.cost ?? 0) * it.toOrder, 0);

  return (
    <div
      className={`mb-3 rounded-[14px] bg-white overflow-hidden shadow-sm border ${
        hot ? "border-danger" : "border-base-200"
      }`}
    >
      {/* header */}
      <div className="flex items-start justify-between gap-3 px-4 pt-3.5 pb-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[15px] font-bold text-base-900">
            <Factory size={16} className="text-base-400 shrink-0" />
            <span className="truncate">{name}</span>
            <span className="text-[12px] font-medium text-base-500">· {kind}</span>
          </div>
          <div className="mt-1">
            <div className="text-[13px] font-semibold text-base-900 truncate">
              {primaryLabel}
            </div>
            <div className="text-[12px] text-base-600">
              {customer && (
                <>
                  <span className="font-medium text-base-800">{soLabel}</span>
                  {" · "}
                </>
              )}
              {bundle.deadline ? (
                <>deliver by {fmtDate(bundle.deadline)}</>
              ) : (
                <span className="text-danger">no delivery date yet</span>
              )}
            {bundle.raiseBy && (
              <>
                {" · "}
                {bundle.urgency === "late" ? (
                  <span className="text-danger font-semibold">
                    was due to order {fmtDateShort(bundle.raiseBy)}
                    {overdueDays != null && overdueDays > 0 ? ` (${overdueDays}d late)` : ""}
                  </span>
                ) : (
                  <>order by {fmtDateShort(bundle.raiseBy)}</>
                )}
              </>
            )}
            </div>
          </div>
        </div>
        <span className={`pill ${u.cls} shrink-0`}>
          <u.Icon />
          {u.label}
        </span>
      </div>

      {/* items */}
      <div className="px-4 pb-1">
        {items.map((it) => {
          const free = freeStockBySku.get(it.sku) ?? 0;
          return (
            <div
              key={it.sku}
              className="flex items-start justify-between gap-3 py-2.5 border-t border-base-100"
            >
              <div className="min-w-0">
                <div className="text-[13px] font-bold font-mono text-base-900">{it.sku}</div>
                <div className="text-[12px] text-base-500 mt-0.5">{it.why}</div>
                {free > 0 && (
                  <span className="inline-flex items-center gap-1 mt-1 text-[11px] text-base-600 bg-base-100 rounded px-1.5 py-0.5">
                    <Info size={12} className="text-base-400" />
                    {free} also in Klang — kept as ready stock, ordering fresh (a manager can change
                    this)
                  </span>
                )}
              </div>
              <div className="text-[13px] font-bold font-mono text-base-900 whitespace-nowrap tabular-nums">
                × {it.toOrder}
              </div>
            </div>
          );
        })}
      </div>

      {/* system cost — advisory, display only (never a pricing input) */}
      <div className="px-4 pb-2 pt-1.5">
        <span className="text-[11px] text-base-400">
          Cost (system): RM{" "}
          {cardCost.toLocaleString("en-MY", { maximumFractionDigits: 0 })}
        </span>
      </div>

      {/* footer */}
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-base-50 border-t border-base-200">
        <button
          type="button"
          title="Report a problem with this line (coming soon)"
          className="text-[12px] text-base-500 underline underline-offset-2 hover:text-base-800"
          onClick={() => {
            /* TODO: escape hatch — flag / edit a to-order line (later unit). */
          }}
        >
          Something wrong?
        </button>
        <Btn
          variant="box"
          size="md"
          icon={Send}
          title={`Send order to ${name} (raising the PO is a later unit)`}
          onClick={() => {
            /* TODO: raise the PO for this factory card. The PO-raise action is a
               separate, not-yet-built unit — this button is a stub for now. */
          }}
        >
          Send order to {name}
        </Btn>
      </div>
    </div>
  );
}

// ── Section head (①②③) ───────────────────────────────────────────────────────

function StepHead({
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
  /** Optional right-aligned action (e.g. the section's single batch CTA). */
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 mt-6 mb-3">
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

// ── Placeholder / hints ──────────────────────────────────────────────────────

function PlaceholderSection({
  Icon,
  title,
  body,
}: {
  Icon: LucideIcon;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-[14px] border border-dashed border-base-300 bg-white px-5 py-6">
      <div className="flex items-start gap-3">
        <span className="grid place-items-center w-9 h-9 rounded-full bg-base-100 shrink-0">
          <Icon size={18} className="text-base-400" />
        </span>
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-base-700">{title}</div>
          <div className="text-[12px] text-base-500 mt-0.5">{body}</div>
        </div>
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

/** Static, non-functional preview of the receive (GRN) 3-step flow. */
function GrnPreview() {
  const steps: Array<{ n: string; label: string; hint: string }> = [
    { n: "1", label: "How many arrived?", hint: "of ordered · fewer = partial, rest stays on the PO" },
    { n: "2", label: "Factory DO number + photo", hint: "attach the delivery-order slip" },
    { n: "3", label: "Book into warehouse", hint: "Klang stock updates · auto-reserved to the order" },
  ];
  return (
    <div className="mt-3 rounded-[14px] border border-base-200 bg-white overflow-hidden opacity-70">
      <div className="px-4 pt-3 pb-2 text-[11px] font-bold uppercase tracking-[0.05em] text-base-400">
        Check it in — 3 steps (preview)
      </div>
      <div className="px-4 pb-4 flex flex-col gap-2">
        {steps.map((s) => (
          <div key={s.n} className="flex items-center gap-3">
            <span className="grid place-items-center w-5 h-5 rounded-full bg-base-200 text-base-600 text-[11px] font-bold font-mono shrink-0">
              {s.n}
            </span>
            <span className="text-[12px] font-medium text-base-700 min-w-[160px]">{s.label}</span>
            <span className="text-[11px] text-base-400">{s.hint}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── KPI card ─────────────────────────────────────────────────────────────────

function KpiCard({
  value,
  label,
  sub,
  subTone,
}: {
  value: number | string;
  label: string;
  sub: string;
  subTone: "danger" | "muted";
}) {
  return (
    <div className="bg-white border border-base-200 rounded-[12px] shadow-sm px-4 py-3 flex flex-col gap-0.5">
      <span className="text-[20px] font-bold font-mono tabular-nums leading-none text-base-900">
        {value}
      </span>
      <span className="text-[12px] font-semibold text-base-600">{label}</span>
      <span
        className={`text-[11px] font-semibold ${
          subTone === "danger" ? "text-danger" : "text-base-400"
        }`}
      >
        {sub}
      </span>
    </div>
  );
}

// ── Facet primitives (token-only, blue hover per the KIT hover law) ───────────

function FacetGroup({
  title,
  total,
  danger,
  collapsed,
  onToggle,
  children,
}: {
  title: string;
  total?: number;
  danger?: boolean;
  collapsed: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-1">
      <button
        type="button"
        onClick={onToggle}
        className={`w-full flex items-center gap-1 rounded-md px-2 py-1.5 hover:bg-hovertint ${
          danger ? "bg-error-soft" : "bg-base-100"
        }`}
      >
        {collapsed ? (
          <ChevronRight size={12} className="shrink-0 text-base-500" />
        ) : (
          <ChevronDown size={12} className="shrink-0 text-base-500" />
        )}
        <span
          className={`uppercase flex-1 text-left text-[11px] font-bold tracking-[0.04em] ${
            danger ? "text-danger" : "text-base-900"
          }`}
        >
          {title}
        </span>
        {total !== undefined && (
          <span className="tabular-nums shrink-0 text-[11px] font-semibold text-base-500">
            {total}
          </span>
        )}
      </button>
      {!collapsed && <div className="flex flex-col gap-0.5 mt-0.5">{children}</div>}
    </div>
  );
}

function FacetRow({
  label,
  count,
  tone = "default",
  numbered,
  unit,
  soon,
}: {
  label: string;
  count: number;
  tone?: "default" | "danger" | "muted";
  /** A small ①②③-style ordinal badge before the label. */
  numbered?: string;
  /** A unit suffix on the count (e.g. "units"). */
  unit?: string;
  /** Dim the row + show "soon" — a not-yet-wired jump target. */
  soon?: boolean;
}) {
  return (
    <div
      className={`w-full flex items-center gap-2 rounded-full text-left px-2.5 py-1.5 ${
        soon ? "opacity-55" : ""
      }`}
    >
      {numbered && (
        <span className="grid place-items-center w-[18px] h-[18px] rounded bg-base-900 text-white text-[11px] font-bold font-mono shrink-0">
          {numbered}
        </span>
      )}
      <span className="flex-1 min-w-0 truncate text-[13px] text-base-700">{label}</span>
      {soon ? (
        <span className="text-[11px] text-base-400 shrink-0">soon</span>
      ) : (
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
      )}
    </div>
  );
}

function EmptyFacetHint({ text }: { text: string }) {
  return <div className="px-2.5 py-1.5 text-[12px] text-base-400">{text}</div>;
}
