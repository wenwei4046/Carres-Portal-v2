import { useState } from "react";
import { toast } from "sonner";
import {
  useSupplierPos,
  useSupplierMe,
  useAcknowledgePo,
  useStartProduction,
  useReadyForPickup,
  useMarkDelivered,
  type SupplierPoRow,
  type SupplierBucket,
  type SupplierSupStatus,
  type SupplierMe,
} from "@/lib/queries";

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

export default function SupplierPOs() {
  const [active, setActive] = useState<SupplierBucket>("po");
  const [openPo, setOpenPo] = useState<SupplierPoRow | null>(null);

  const pos = useSupplierPos(active);
  const me  = useSupplierMe();
  const rows = pos.data ?? [];
  const supplierKind = me.data?.kind ?? null;

  return (
    <div className="p-9 max-w-[1400px] mx-auto">
      <header className="mb-7">
        <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
          Operations
        </div>
        <h1 className="font-display text-[32px] mt-1.5 mb-1 text-foreground tracking-[-0.02em]">
          Purchase Orders
        </h1>
        <div className="text-[13px] text-muted-foreground">
          Three-stage pipeline · PO → Ready to Pickup → Delivered
        </div>
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
      ) : rows.length === 0 ? (
        <Empty hint={emptyHintFor(active)} />
      ) : (
        <div className="flex flex-col gap-2.5">
          {rows.map((p) => (
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
          <div className="font-mono text-[14px] font-bold tracking-wide">
            {po.id}
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
          <StatusPill ss={ss} kind={supplierKind} />
          {po.expected_ready_date && (
            <div className="text-[11px] text-muted-foreground flex flex-col">
              <span className="text-[9px] uppercase tracking-[0.12em]">Ready by</span>
              <span className="font-semibold text-primary">
                {po.expected_ready_date}
              </span>
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
          {stage === "po" && isProd && (
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
  const markDelivered = useMarkDelivered();

  const canSubmit = doNumber.trim().length > 0 && doConfirm;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    markDelivered.mutate(
      { poId: po.id, doNumber: doNumber.trim(), doNote: doNote.trim() || undefined },
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

          {/* 2026-05-10 (Loo) — full line table. Variant suffix per row so
              the supplier can build the right version even when the same
              SKU appears multiple times (multi-variant bedframe POs). */}
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
                      <div className="text-[13px] font-semibold truncate">
                        {l.sku}
                      </div>
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
