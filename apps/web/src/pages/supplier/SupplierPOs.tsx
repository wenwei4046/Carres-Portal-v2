import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  useSupplierPos,
  useSupplierMe,
  useAcknowledgePo,
  useStartProduction,
  useReadyForPickup,
  useMarkDelivered,
  useSupplierThreadsForPo,
  type SupplierPoRow,
  type SupplierBucket,
  type SupplierSupStatus,
  type SupplierMe,
} from "@/lib/queries";
import DOFileUploadField from "@/components/DOFileUploadField";
import PODrawerThreadList from "./PODrawerThreadList";
import PickupHistoryList from "./PickupHistoryList";

/**
 * Supplier · Purchase Orders page — Phase 6 spec §6.
 *
 * Visual reference: `reference/proto/supplier-pages.jsx:203-683`.
 *
 * Three-stage pipeline tabs (PO / Ready / Delivered) → POCard list →
 * PODrawer detail with DO upload form (text-only DO number per Q2=A).
 *
 * Action buttons (proto:266-321) gate by `suppliers.kind` from useSupplierMe:
 *   - factory_pickup: pending|acknowledged → "Mark in production" (skip Ack)
 *   - own_logistics:  pending → "Acknowledge PO"; acknowledged → "Start production"
 *   - both kinds:     in_production → "Mark Ready for Pickup"
 * While `me` is still loading, fall back to V1 behavior (both buttons on
 * pending) — non-regressive. Closes phase-6-supplier-me-endpoint.
 */

/**
 * Status label is kind-aware: own_logistics suppliers run goods to the WH
 * themselves so "awaiting partner" is nonsensical for them — they're
 * waiting for Logistics to receive at the warehouse. factory_pickup
 * suppliers stage at the factory waiting for a partner pickup, which is
 * where the "awaiting partner" wording applies (Loo 2026-05-11).
 */
function labelFor(ss: SupplierSupStatus, kind: "own_logistics" | "factory_pickup" | null): string {
  if (ss === "ready_for_pickup" || ss === "ready_confirm_sent") {
    return kind === "own_logistics"
      ? "Ready · awaiting logistics receive"
      : "Ready · awaiting partner";
  }
  switch (ss) {
    case "pending":            return "Pending";
    case "acknowledged":       return "Acknowledged";
    case "in_production":      return "In production";
    // 0090 sofa flow: partner WH owner accepted; supplier now self-dispatches.
    case "partner_confirmed":  return "Partner accepted · ready to dispatch";
    case "pickup_assigned":    return "Partner assigned";
    case "pickup_accepted":    return "Pickup scheduled";
    // 2026-05-15 (Task 14): per-thread pickup mid-state (migration 0107). At
    // least one thread is picked but not all — partner can still come back
    // for the remainder.
    case "partially_shipped":  return "Partially picked · partner returning";
    case "shipped":            return "Shipped";
    case "picked_up":          return "Picked up";
    case "delivered":          return "Delivered";
    case "reassign_needed":    return "Customer rejected · awaiting reassignment";
    default:                   return ss;
  }
}

function readyTabHint(kind: "own_logistics" | "factory_pickup" | null): string {
  return kind === "own_logistics"
    ? "Staged · awaiting logistics receive"
    : "Staged · awaiting partner";
}

const TABS: { key: SupplierBucket; label: string }[] = [
  { key: "po", label: "PO" },
  { key: "ready", label: "Ready to Pickup" },
  { key: "delivered", label: "Delivered" },
];

const TAB_HINTS: Record<SupplierBucket, (kind: "own_logistics" | "factory_pickup" | null) => string> = {
  po:        () => "Awaiting ack / in production",
  ready:     readyTabHint,
  delivered: () => "DO uploaded · closed",
};

/** Sort modes for the PO list. `urgency` is the default — surfaces
 *  closest customer ETA at top so the supplier sees what to build first.
 *  `created` keeps the API order (server returns newest-first). */
type SortKey = "urgency" | "po_id" | "po_eta" | "created";

const URGENCY_RANK: Record<string, number> = { critical: 0, urgent: 1, normal: 2 };

export default function SupplierPOs() {
  const [active, setActive] = useState<SupplierBucket>("po");
  const [sortBy, setSortBy] = useState<SortKey>("urgency");
  const [openPo, setOpenPo] = useState<SupplierPoRow | null>(null);

  const pos = useSupplierPos(active);
  const me  = useSupplierMe();
  const rows = pos.data ?? [];
  const supplierKind = me.data?.kind ?? null;

  const sortedRows = useMemo(() => {
    const arr = [...rows];
    if (sortBy === "urgency") {
      arr.sort((a, b) => {
        const ra = URGENCY_RANK[a.urgency ?? "normal"] ?? 99;
        const rb = URGENCY_RANK[b.urgency ?? "normal"] ?? 99;
        if (ra !== rb) return ra - rb;
        // tiebreak by customer_eta_min (earlier delivery first).
        return (a.customer_eta_min ?? "9999").localeCompare(b.customer_eta_min ?? "9999");
      });
    } else if (sortBy === "po_eta") {
      arr.sort((a, b) => (a.eta_date ?? "9999").localeCompare(b.eta_date ?? "9999"));
    } else if (sortBy === "po_id") {
      arr.sort((a, b) => a.id.localeCompare(b.id));
    }
    // "created" → leave server order (placed_at desc).
    return arr;
  }, [rows, sortBy]);

  return (
    <div className="p-9 max-w-[1400px] mx-auto">
      <header className="mb-7 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            Operations
          </div>
          <h1 className="font-display text-[32px] mt-1.5 mb-1 text-foreground tracking-[-0.02em]">
            Purchase Orders
          </h1>
          <div className="text-[13px] text-muted-foreground">
            Three-stage pipeline · PO → Ready to Pickup → Delivered
          </div>
        </div>
        <label className="flex items-center gap-2 text-[11px] text-muted-foreground self-end">
          <span className="uppercase tracking-[0.08em]">Sort</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortKey)}
            data-testid="supplier-pos-sort"
            className="border border-border bg-card rounded px-2.5 py-1 text-[12px] text-foreground"
          >
            <option value="urgency">Urgency</option>
            <option value="po_eta">PO ETA</option>
            <option value="po_id">PO ID</option>
            <option value="created">Created</option>
          </select>
        </label>
      </header>

      {/* Stage tabs */}
      <div
        className="grid grid-cols-3 border-b border-border mb-6"
        data-testid="supplier-pos-tabs"
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setActive(t.key)}
            className={`text-left px-4 py-4 -mb-px border-b-2 ${
              active === t.key
                ? "border-primary"
                : "border-transparent"
            }`}
          >
            <div className="flex items-baseline gap-2.5">
              <span
                className={`text-[15px] font-bold ${
                  active === t.key ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                {t.label}
              </span>
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              {TAB_HINTS[t.key](supplierKind)}
            </div>
          </button>
        ))}
      </div>

      {/* Stage body */}
      {pos.isLoading ? (
        <Empty hint="Loading…" />
      ) : sortedRows.length === 0 ? (
        <Empty hint={emptyHintFor(active)} />
      ) : (
        <div className="flex flex-col gap-2.5">
          {sortedRows.map((p) => (
            <POCard
              key={p.id}
              po={p}
              stage={active}
              supplierKind={supplierKind}
              onOpen={setOpenPo}
            />
          ))}
        </div>
      )}

      {openPo && (
        <PODrawer
          po={rows.find((r) => r.id === openPo.id) ?? openPo}
          supplierKind={supplierKind}
          onClose={() => setOpenPo(null)}
        />
      )}
    </div>
  );
}

/**
 * 2026-05-16 (Loo) — per-thread state subtitle next to the StatusPill.
 * Renders the "X of Y" hint specific to the current column. Hidden on
 * stockpile POs (total === 0; caller already gates that).
 */
function ThreadStateSubtitle({
  counts,
  stage,
}: {
  counts: { producing: number; ready: number; picked: number; total: number };
  stage: SupplierBucket;
}) {
  if (stage === "po" && counts.producing > 0) {
    return (
      <span className="text-[11px] text-muted-foreground">
        <strong className="text-foreground">{counts.producing} of {counts.total}</strong> still producing
      </span>
    );
  }
  if (stage === "ready" && counts.ready > 0) {
    return (
      <span className="text-[11px] text-primary">
        <strong>{counts.ready} of {counts.total}</strong> ready · partner can pickup
      </span>
    );
  }
  if (stage === "delivered" && counts.picked > 0) {
    return (
      <span className="text-[11px] text-success">
        <strong>{counts.picked} of {counts.total}</strong> picked up
      </span>
    );
  }
  return null;
}

function emptyHintFor(stage: SupplierBucket) {
  if (stage === "po")
    return "No incoming POs. New POs from Carres Procurement will land here.";
  if (stage === "ready")
    return "Nothing staged. Mark a PO ready from the previous tab to populate.";
  return "No completed POs yet.";
}

function StatusPill({
  ss,
  kind,
}: {
  ss: SupplierSupStatus;
  kind: "own_logistics" | "factory_pickup" | null;
}) {
  const label = labelFor(ss, kind);
  const tone =
    ss === "delivered" || ss === "picked_up"
      ? "ok"
      : ss === "pending" || ss === "ready_for_pickup" || ss === "reassign_needed"
        ? "warn"
        : "info";
  const cls =
    tone === "ok"
      ? "bg-success/15 text-success"
      : tone === "warn"
        ? "bg-primary/10 text-primary"
        : "bg-blue-100 text-blue-800";
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold ${cls}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}

function POCard({
  po,
  stage,
  supplierKind,
  onOpen,
}: {
  po: SupplierPoRow;
  stage: SupplierBucket;
  supplierKind: SupplierMe["kind"] | null;
  onOpen: (p: SupplierPoRow) => void;
}) {
  const ack = useAcknowledgePo();
  const startProd = useStartProduction();
  const readyPick = useReadyForPickup();

  const ss = po.sup_status;
  const isPending = ss === "pending";
  const isAck = ss === "acknowledged";
  const isProd = ss === "in_production";

  // Button gating: factory_pickup skips Acknowledge entirely. own_logistics
  // gets Acknowledge on pending (no secondary). When `me` is still loading
  // (kind === null), fall back to V1 behavior — both buttons on pending —
  // so the page stays interactive during the round-trip.
  const showAck      = stage === "po" && isPending && supplierKind !== "factory_pickup";
  const showMarkProd =
    stage === "po"
    && (
      // factory_pickup: pending|acknowledged → straight to in_production
      (supplierKind === "factory_pickup" && (isPending || isAck))
      // unknown kind: legacy V1 fallback (secondary on pending)
      || (supplierKind === null && isPending)
    );
  const showStartProd = stage === "po" && supplierKind === "own_logistics" && isAck;

  return (
    <div
      onClick={() => onOpen(po)}
      className={`border rounded-md bg-card p-5 cursor-pointer hover:border-primary transition-colors ${
        isPending ? "border-primary" : "border-border"
      }`}
      data-testid={`po-card-${po.id}`}
    >
      <div className="flex items-center gap-7 flex-wrap">
        <div className="min-w-[120px]">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="font-mono text-[14px] font-bold tracking-wide">
              {po.id}
            </div>
            {/* Task 9 — urgency badge derived from min(customer ETA) across
                linked threads. critical <7d · urgent 7-13d · normal >=14d.
                Null when no threads (forecast/stockpile PO) → hidden. */}
            {po.urgency && (
              <span
                className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-[0.06em] ${
                  po.urgency === "critical"
                    ? "bg-destructive/10 text-destructive"
                    : po.urgency === "urgent"
                      ? "bg-warning/15 text-warning"
                      : "bg-success/10 text-success"
                }`}
                data-testid={`urgency-${po.id}`}
              >
                {po.urgency === "critical"
                  ? "🔴 Critical"
                  : po.urgency === "urgent"
                    ? "🟠 Urgent"
                    : "🟢 Normal"}
              </span>
            )}
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            Placed {new Date(po.placed_at).toLocaleDateString()}
          </div>
        </div>

        <div className="flex items-baseline gap-2 pr-3 border-r border-border pl-1">
          <span className="font-display text-[24px] font-semibold leading-none">
            {(po.lines ?? []).reduce((s, l) => s + (l.qty ?? 0), 0)}
          </span>
          <span className="text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
            units
          </span>
        </div>

        <div className="flex items-center gap-5 flex-1 flex-wrap">
          <div className="flex flex-col gap-1">
            <StatusPill ss={ss} kind={supplierKind} />
            {/* 2026-05-16 (Loo) — per-thread state subtitle. Same PO can land
                in `po` and `ready` columns when partial; the subtitle tells
                the supplier which subset of SOs each column is talking about
                (3 of 4 still producing here, 1 of 4 ready in the other). */}
            {po.thread_state_counts && po.thread_state_counts.total > 0 && (
              <ThreadStateSubtitle counts={po.thread_state_counts} stage={stage} />
            )}
          </div>
          {po.expected_ready_date && (
            <div className="text-[11px] text-muted-foreground flex flex-col">
              <span className="text-[9px] uppercase tracking-[0.12em]">Ready by</span>
              <span className="font-semibold text-primary">
                {po.expected_ready_date}
              </span>
            </div>
          )}
          {/* Task 9 — customer's promised delivery date (min across threads).
              Sits next to "Ready by" so supplier sees their PO ETA vs the
              customer's required date side-by-side. */}
          {po.customer_eta_min && (
            <div className="text-[11px] text-muted-foreground flex flex-col">
              <span className="text-[9px] uppercase tracking-[0.12em]">
                Customer ETA
              </span>
              <span className="font-mono font-semibold text-foreground">
                {po.customer_eta_min}
              </span>
              {po.behind_schedule && (
                <span className="text-[10px] text-destructive font-semibold mt-0.5">
                  ⚠ Behind schedule
                </span>
              )}
            </div>
          )}
          {po.warehouses && (
            <div
              className="text-[11px] text-muted-foreground flex flex-col"
              data-testid={`po-destination-${po.id}`}
            >
              <span className="text-[9px] uppercase tracking-[0.12em]">Send to</span>
              <span className="font-semibold text-foreground">
                {po.warehouses.name}
                {po.warehouses.owner && (
                  <span className="text-muted-foreground font-normal">
                    {" · "}LP: {po.warehouses.owner.name}
                  </span>
                )}
              </span>
              {po.warehouses.address && (
                <span className="text-[10.5px] text-muted-foreground mt-0.5 max-w-[280px] truncate">
                  {po.warehouses.address}
                  {po.warehouses.owner?.contact && (
                    <span> · {po.warehouses.owner.contact}</span>
                  )}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {showAck && (
            <button
              type="button"
              disabled={ack.isPending}
              onClick={(e) => {
                e.stopPropagation();
                ack.mutate(po.id, {
                  onSuccess: () => toast.success(`${po.id} acknowledged`),
                  onError: (err) => toast.error(err.message),
                });
              }}
              className="px-4 py-2 text-[12px] font-semibold rounded-md bg-primary text-primary-foreground disabled:opacity-50"
            >
              Acknowledge PO
            </button>
          )}
          {showMarkProd && (
            <button
              type="button"
              disabled={startProd.isPending}
              onClick={(e) => {
                e.stopPropagation();
                startProd.mutate(po.id, {
                  onSuccess: () => toast.success(`${po.id} · production started`),
                  onError: (err) => toast.error(err.message),
                });
              }}
              className={
                supplierKind === "factory_pickup"
                  ? "px-4 py-2 text-[12px] font-semibold rounded-md bg-primary text-primary-foreground disabled:opacity-50"
                  : "px-3 py-2 text-[12px] font-medium rounded-md border border-border"
              }
              title={
                supplierKind === "factory_pickup"
                  ? "Factory pickup — skip ack and go straight to production"
                  : "Skip ack — pending → in_production"
              }
            >
              Mark in production
            </button>
          )}
          {showStartProd && (
            <button
              type="button"
              disabled={startProd.isPending}
              onClick={(e) => {
                e.stopPropagation();
                startProd.mutate(po.id, {
                  onSuccess: () => toast.success(`${po.id} · production started`),
                  onError: (err) => toast.error(err.message),
                });
              }}
              className="px-4 py-2 text-[12px] font-semibold rounded-md bg-primary text-primary-foreground disabled:opacity-50"
            >
              Start production
            </button>
          )}
          {/* 2026-05-16 (Loo) — legacy PO-level "Mark Ready" button is HIDDEN
              when the PO has linked threads. The per-thread checklist inside
              the PODrawer is the source of truth; this button used to flip
              the whole PO's sup_status at once which bypassed the per-thread
              state and produced ghost POs that showed up as "ready" without
              any SO actually being ready. For stockpile / forecast POs (no
              threads) it stays — those have no checklist to drive readiness. */}
          {stage === "po" && isProd && (po.thread_state_counts?.total ?? 0) === 0 && (
            <button
              type="button"
              disabled={readyPick.isPending}
              onClick={(e) => {
                e.stopPropagation();
                readyPick.mutate(po.id, {
                  onSuccess: () => toast.success(`${po.id} marked ready · Logistics notified`),
                  onError: (err) => toast.error(err.message),
                });
              }}
              className="px-4 py-2 text-[12px] font-semibold rounded-md bg-primary text-primary-foreground disabled:opacity-50"
            >
              Mark Ready for Pickup
            </button>
          )}
          {/* When the PO has threads, surface a hint button that opens the
              drawer (where the per-thread checklist lives). */}
          {stage === "po" && isProd && (po.thread_state_counts?.total ?? 0) > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpen(po);
              }}
              className="px-4 py-2 text-[12px] font-semibold rounded-md border border-primary text-primary"
              title="Open the PO drawer to mark individual SOs ready"
            >
              Tick SOs ready →
            </button>
          )}
        </div>
      </div>

      <div className="pt-3 mt-3 border-t border-dashed border-border text-[13px]">
        {/* 2026-05-10 (Loo) — render every line with qty + cascade variant
            (color/gap/fabric) so the supplier knows exactly what to make.
            Multi-variant POs (post-migration 0076) can carry the same SKU
            twice with different attrs; render them as separate rows. */}
        {(po.lines ?? []).map((l) => {
          const a = (l.attrs ?? {}) as {
            color?: string;
            gap?: string;
            fabric_name?: string;
            fabric_surcharge?: number;
          };
          const variantBits: string[] = [];
          if (a.color) variantBits.push(a.color);
          if (a.gap) variantBits.push(`gap ${a.gap}`);
          if (a.fabric_name) {
            variantBits.push(
              a.fabric_surcharge && a.fabric_surcharge > 0
                ? `${a.fabric_name} (+RM ${a.fabric_surcharge})`
                : a.fabric_name,
            );
          }
          return (
            <div
              key={l.id}
              className="flex items-baseline justify-between gap-3 mb-1 last:mb-0"
            >
              <div className="min-w-0">
                <div className="font-semibold text-foreground truncate">{l.sku}</div>
                {variantBits.length > 0 && (
                  <div className="text-[11px] text-primary font-semibold mt-0.5">
                    {variantBits.join(" · ")}
                  </div>
                )}
              </div>
              <div className="font-mono text-[12px] text-muted-foreground whitespace-nowrap">
                ×{l.qty}
              </div>
            </div>
          );
        })}
        <div className="font-mono text-[10.5px] text-muted-foreground mt-1.5 tracking-wide">
          ETA {po.eta_date ?? "—"}
          {po.do_number && ` · DO ${po.do_number}`}
        </div>
        {/* Task 9 — deduped sku × qty roll-up from the server (sku_summary).
            Acts as a tooltip-style one-liner summary for at-a-glance scanning
            even when the multi-line block above is collapsed. */}
        {po.sku_summary && po.sku_summary.length > 0 && (
          <div
            className="text-[11px] text-muted-foreground mt-1.5"
            data-testid={`sku-summary-${po.id}`}
          >
            {po.sku_summary.map((l) => `${l.sku} × ${l.qty}`).join(" · ")}
          </div>
        )}
      </div>
    </div>
  );
}

function PODrawer({
  po,
  onClose,
  supplierKind,
}: {
  po: SupplierPoRow;
  onClose: () => void;
  supplierKind: "own_logistics" | "factory_pickup" | null;
}) {
  const [showDOForm, setShowDOForm] = useState(false);
  const [doNumber, setDoNumber] = useState("");
  const [doNote, setDoNote] = useState("");
  const [doConfirm, setDoConfirm] = useState(false);
  // DO file path captured from DOFileUploadField. Uploads stream to the
  // `delivery-orders` Storage bucket via /api/storage/dos/sign-upload first
  // (server route widened to admit supplier role per migration 0094); the
  // canonical path rides the mark-delivered mutation. Photo upload is
  // REQUIRED — supplier_mark_delivered RPC 0094 422s without it.
  const [doFilePath, setDoFilePath] = useState<string | null>(null);
  const markDelivered = useMarkDelivered();

  // doNumber ≥ 3 mirrors the storage sign-upload server check
  // (`do_number: z.string().min(3)`); enforce client-side so the file upload
  // doesn't 422 with a confusing message.
  const canSubmit =
    doNumber.trim().length >= 3 && !!doFilePath && doConfirm;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !doFilePath) return;
    markDelivered.mutate(
      {
        poId: po.id,
        doNumber: doNumber.trim(),
        doFilePath,
        doNote: doNote.trim() || undefined,
      },
      {
        onSuccess: () => {
          toast.success(`DO ${doNumber.trim()} uploaded · ${po.id} closed`);
          onClose();
        },
        onError: (err) => toast.error(err.message),
      },
    );
  }

  // 0090 sofa flow (Loo 2026-05-11): partner_confirmed is the post-accept
  // state for own_logistics PO shipped to a partner-owned WH. Supplier now
  // self-dispatches + uploads DO to close. Migration 0093 already widened
  // supplier_mark_delivered to admit this source state.
  const canUploadDo =
    po.sup_status === "pickup_accepted"
    || po.sup_status === "shipped"
    || po.sup_status === "partner_confirmed";

  return (
    <div
      className="fixed inset-0 bg-black/40 flex justify-end z-50"
      onClick={onClose}
    >
      <div
        className="w-[620px] max-w-full h-full bg-card flex flex-col shadow-xl"
        onClick={(e) => e.stopPropagation()}
        data-testid="po-drawer"
      >
        <div className="px-6 py-5 border-b border-border flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              Purchase Order
            </div>
            <div className="font-mono font-display text-[22px] mt-1">{po.id}</div>
            <div className="text-[12px] text-muted-foreground mt-1">
              {(po.lines ?? []).length} line
              {(po.lines ?? []).length === 1 ? "" : "s"} ·{" "}
              <strong>
                {(po.lines ?? []).reduce((s, l) => s + (l.qty ?? 0), 0)}
              </strong>{" "}
              unit
              {(po.lines ?? []).reduce((s, l) => s + (l.qty ?? 0), 0) === 1
                ? ""
                : "s"}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[22px] text-muted-foreground"
            aria-label="Close drawer"
          >
            ×
          </button>
        </div>

        <div className="px-6 py-5 flex-1 overflow-y-auto">
          <div className="mb-5">
            <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground mb-2">
              Status
            </div>
            <StatusPill ss={po.sup_status} kind={supplierKind} />
          </div>

          {po.warehouses && (
            <div className="mb-5">
              <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground mb-2">
                Send to
              </div>
              <div className="border border-border rounded-md p-3 bg-card">
                <div className="font-display text-[15px] font-semibold text-foreground">
                  {po.warehouses.name}
                  {po.warehouses.kind === "logistics_partner" && (
                    <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono bg-warning/15 text-warning">
                      LP-OWNED
                    </span>
                  )}
                </div>
                {po.warehouses.address && (
                  <div className="text-[12px] text-muted-foreground mt-1">
                    {po.warehouses.address}
                  </div>
                )}
                {po.warehouses.owner && (
                  <div className="text-[11.5px] mt-2 pt-2 border-t border-border">
                    <span className="text-muted-foreground">Logistics Partner: </span>
                    <span className="font-semibold text-foreground">
                      {po.warehouses.owner.name}
                    </span>
                    {po.warehouses.owner.contact && (
                      <span className="text-muted-foreground"> · {po.warehouses.owner.contact}</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 mb-5">
            <Field label="Placed" value={new Date(po.placed_at).toLocaleDateString()} />
            <Field label="ETA" value={po.eta_date ?? "—"} />
            {po.do_number && <Field label="DO Number" value={po.do_number} />}
            {po.expected_ready_date && (
              <Field label="Expected ready" value={po.expected_ready_date} />
            )}
          </div>

          {/* 2026-05-16 (Loo) — Line items panel now thread-aware: aggregates
              per-SKU from the linked customer threads' order_lines, showing
              a running balance "× total · N remaining" that ticks down as the
              supplier marks SOs ready. The per-thread state is the source of
              truth — the legacy PO-level lines (purchase_order_lines) is the
              HQ↔supplier accounting view and stays as a stockpile fallback
              when there are no threads. */}
          <LineItemsPanel po={po} />


          {/* Task 10 (2026-05-15) — per-thread production checklist. One row
              per linked customer-leg thread; supplier toggles each thread's
              "ready for pickup" state independently via mark-ready /
              unmark-ready RPCs (migrations 0107/0108). Forecast / stockpile
              POs (no threads) render an empty-state hint. */}
          <section className="mb-5">
            <h3 className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground mb-3">
              Production checklist
            </h3>
            <PODrawerThreadList poId={po.id} />
          </section>

          {/* Task 13 (2026-05-15) — pickup history. Lists every
              po_pickup_events row for this PO with a "Reprint DO" button
              per row that opens `/print/pickup-event/:eventId` in a new
              tab. PDF rendered browser-side per Workers WASM constraint
              (commit `fa47433`). */}
          <section className="mb-5">
            <h3 className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground mb-3">
              Pickup history
            </h3>
            <PickupHistoryList poId={po.id} />
          </section>

          {showDOForm && (
            <form
              onSubmit={submit}
              className="mb-5 p-4 border-2 border-primary rounded-md bg-primary/5"
              data-testid="do-form"
            >
              <div className="text-[10px] uppercase tracking-[0.12em] text-primary mb-3">
                Upload Delivery Order
              </div>
              <div className="flex flex-col gap-3">
                <label className="text-[12px] text-foreground">
                  DO number
                  <input
                    type="text"
                    value={doNumber}
                    onChange={(e) => setDoNumber(e.target.value)}
                    placeholder="e.g. DO-CMS-9023"
                    className="block w-full mt-1 px-3 py-2 border border-border rounded font-mono text-[13px] bg-background"
                    data-testid="do-number-input"
                  />
                </label>
                <label className="text-[12px] text-foreground">
                  Notes <span className="text-muted-foreground">(optional)</span>
                  <textarea
                    value={doNote}
                    onChange={(e) => setDoNote(e.target.value)}
                    placeholder="Condition, partial, etc."
                    rows={2}
                    className="block w-full mt-1 px-3 py-2 border border-border rounded text-[13px] resize-y bg-background"
                  />
                </label>
                <div
                  className="px-3 py-2.5 border border-dashed border-border rounded bg-background"
                  data-testid="do-file-upload"
                >
                  <div className="text-[12px] text-foreground mb-2">
                    Attach signed DO file{" "}
                    <span className="text-muted-foreground">(PDF/JPG/PNG · ≤10 MB · required)</span>
                  </div>
                  {doNumber.trim().length < 3 ? (
                    // Render a real disabled file picker (not just italic
                    // text) so the supplier sees the upload widget exists
                    // and is locked, not missing — italic hint alone was
                    // too easy to miss (Loo 2026-05-12).
                    <>
                      <input
                        type="file"
                        disabled
                        aria-label="DO file (locked)"
                        className="text-[12px] text-muted-foreground cursor-not-allowed"
                        data-testid="do-file-locked"
                      />
                      <div className="text-[11px] text-primary mt-1.5 font-semibold">
                        ↑ Locked. Enter the DO number above first (min 3 characters).
                      </div>
                    </>
                  ) : (
                    <DOFileUploadField
                      poId={po.id}
                      doNumber={doNumber.trim()}
                      onUploaded={(path) => setDoFilePath(path)}
                    />
                  )}
                </div>
                <label className="flex items-start gap-2 text-[12px] text-foreground leading-snug">
                  <input
                    type="checkbox"
                    checked={doConfirm}
                    onChange={(e) => setDoConfirm(e.target.checked)}
                    className="mt-0.5"
                  />
                  I confirm goods have been handed over and the DO above is signed.
                </label>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={!canSubmit || markDelivered.isPending}
                    className="flex-1 px-4 py-2 bg-primary text-primary-foreground font-semibold rounded-md text-[13px] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Submit DO · Mark Delivered
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowDOForm(false)}
                    className="px-4 py-2 border border-border rounded-md text-[13px]"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </form>
          )}

          {!showDOForm && canUploadDo && (
            <button
              type="button"
              onClick={() => setShowDOForm(true)}
              className="w-full px-4 py-2 mb-5 bg-primary text-primary-foreground font-semibold rounded-md text-[13px]"
            >
              📎 Upload Delivery Order
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * 2026-05-16 (Loo) — Line items panel with running balance derived from
 * thread state. When the PO has linked threads, each SKU is aggregated across
 * threads and shown as: "× total — N remaining" (N counts producing threads,
 * decrementing as the supplier ticks SOs ready). Fully-ready SKUs flip to a
 * green "✓ all ready" pill. Stockpile / forecast POs (no threads) fall back
 * to the PO-level lines view since there's no per-thread state to drive
 * the balance.
 */
function LineItemsPanel({ po }: { po: SupplierPoRow }) {
  const hasThreads = (po.thread_state_counts?.total ?? 0) > 0;
  const threadsQ = useSupplierThreadsForPo(hasThreads ? po.id : null);

  if (!hasThreads) {
    return <StockpileLineItems po={po} />;
  }

  if (threadsQ.isPending) {
    return (
      <div className="mb-5">
        <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground mb-2">
          Line items
        </div>
        <div className="border border-border rounded-md p-3 text-[13px] text-muted-foreground">
          Loading running balance…
        </div>
      </div>
    );
  }

  const threads = threadsQ.data ?? [];
  // Aggregate per-SKU totals across all linked threads.
  const skuMap = new Map<
    string,
    { total: number; remaining: number; ready: number; picked: number }
  >();
  for (const t of threads) {
    const isReady = t.supplier_ready_at !== null;
    const isPicked = t.pickup_event_id !== null;
    for (const line of t.sku_lines ?? []) {
      const cur = skuMap.get(line.sku) ?? {
        total: 0,
        remaining: 0,
        ready: 0,
        picked: 0,
      };
      cur.total += line.qty;
      if (isPicked) cur.picked += line.qty;
      else if (isReady) cur.ready += line.qty;
      else cur.remaining += line.qty;
      skuMap.set(line.sku, cur);
    }
  }
  const rows = [...skuMap.entries()].map(([sku, c]) => ({ sku, ...c }));

  return (
    <div className="mb-5">
      <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground mb-2">
        Line items
      </div>
      <div className="border border-border rounded-md divide-y divide-border">
        {rows.map((r) => {
          const allDone = r.remaining === 0;
          return (
            <div
              key={r.sku}
              className="flex items-baseline justify-between gap-3 px-3 py-2.5"
              data-testid={`line-items-row-${r.sku}`}
            >
              <div className="min-w-0">
                <div className="text-[13px] font-semibold truncate">{r.sku}</div>
                <div className="text-[11px] mt-0.5 flex items-center gap-2 flex-wrap">
                  {allDone ? (
                    <span className="text-success font-semibold">
                      ✓ All {r.total} ready
                    </span>
                  ) : (
                    <>
                      <span className="text-foreground font-semibold">
                        {r.remaining} remaining
                      </span>
                      {r.ready > 0 && (
                        <span className="text-primary">· {r.ready} ready</span>
                      )}
                      {r.picked > 0 && (
                        <span className="text-success">· {r.picked} picked</span>
                      )}
                    </>
                  )}
                </div>
              </div>
              <div className="font-mono text-[13px] text-foreground whitespace-nowrap">
                ×{r.total}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Stockpile fallback — purchase_order_lines view (legacy pre-thread). */
function StockpileLineItems({ po }: { po: SupplierPoRow }) {
  return (
    <div className="mb-5">
      <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground mb-2">
        Line items
      </div>
      <div className="border border-border rounded-md divide-y divide-border">
        {(po.lines ?? []).map((l) => {
          const a = (l.attrs ?? {}) as {
            color?: string;
            gap?: string;
            fabric_name?: string;
            fabric_surcharge?: number;
          };
          const variantBits: string[] = [];
          if (a.color) variantBits.push(a.color);
          if (a.gap) variantBits.push(`gap ${a.gap}`);
          if (a.fabric_name) {
            variantBits.push(
              a.fabric_surcharge && a.fabric_surcharge > 0
                ? `${a.fabric_name} (+RM ${a.fabric_surcharge})`
                : a.fabric_name,
            );
          }
          return (
            <div
              key={l.id}
              className="flex items-baseline justify-between gap-3 px-3 py-2.5"
            >
              <div className="min-w-0">
                <div className="text-[13px] font-semibold truncate">{l.sku}</div>
                {variantBits.length > 0 && (
                  <div className="text-[11px] text-primary mt-0.5">
                    {variantBits.join(" · ")}
                  </div>
                )}
              </div>
              <div className="font-mono text-[13px] text-foreground whitespace-nowrap">
                ×{l.qty}
                {l.received_qty > 0 && (
                  <span className="text-muted-foreground text-[11px] ml-2">
                    ({l.received_qty} rcv)
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.06em] text-muted-foreground mb-1">
        {label}
      </div>
      <div className="text-[13px] text-foreground">{value}</div>
    </div>
  );
}

function Empty({ hint }: { hint: string }) {
  return (
    <div className="text-center py-15 px-5 border border-dashed border-border rounded-md text-[13px] text-muted-foreground">
      {hint}
    </div>
  );
}
