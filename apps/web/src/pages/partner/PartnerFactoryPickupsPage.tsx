import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError, apiFetch } from "@/lib/api";
import { qk } from "@/lib/queries";
import PartnerReceiveAtWhModal from "./components/PartnerReceiveAtWhModal";

/**
 * Partner · Factory pickups — supplier → warehouse pipeline.
 *
 * Proto reference: reference/proto/partner-pickups.jsx (Loo 2026-05-10).
 *
 * 3-column kanban + delivered tail. State machine:
 *   ready_confirm_sent / ready_for_pickup / pickup_assigned  →  Awaiting accept
 *   pickup_accepted                                          →  Scheduled
 *   picked_up                                                →  In transit
 *   delivered (status='open')                                →  Delivered to WH
 *
 * Actions per stage:
 *   Awaiting accept → "Accept · Schedule pickup" (partner_accept_pickup RPC)
 *   Scheduled       → "Mark collected"           (partner_mark_picked_up)
 *   In transit      → "Arrived at WH"            (partner_arrived_at_warehouse)
 *
 * After "Arrived at WH" the PO drops into the delivered tail and the
 * warehouse-side receive flow (logistics_receive_po_with_do, migration
 * 0076) takes over to close it (status='received').
 *
 * Customer-leg deliveries (RFD pending / customer dispatch / POD) live on
 * the separate Deliveries page — completely different leg, completely
 * different state machine.
 */
type PickupLine = {
  id: string;
  sku: string;
  qty: number;
  // 2026-05-11 (Loo): receive-at-arrival flow needs current received_qty so
  // PartnerReceiveAtWhModal can compute pending = qty - received_qty.
  // Server SELECT widened in lockstep.
  received_qty?: number | null;
  attrs: Record<string, unknown> | null;
};

type PickupRow = {
  id: string;
  dl: number | null;
  supplier_id: string;
  warehouse_id: string;
  sup_status: string;
  status: string;
  eta_date: string | null;
  placed_at: string;
  suppliers: { name: string; contact: string | null } | null;
  warehouses: { name: string; address: string | null } | null;
  lines: PickupLine[];
};

type Stage = "awaiting" | "scheduled" | "in_transit" | "delivered";

function stageOf(p: PickupRow): Stage | null {
  if (p.status !== "open") return null;
  if (
    p.sup_status === "ready_confirm_sent" ||
    p.sup_status === "ready_for_pickup" ||
    p.sup_status === "pickup_assigned"
  )
    return "awaiting";
  if (p.sup_status === "pickup_accepted") return "scheduled";
  if (p.sup_status === "picked_up") return "in_transit";
  if (p.sup_status === "delivered") return "delivered";
  return null;
}

function lineSummary(lines: PickupLine[]): { head: string; rest: number; totalQty: number } {
  const totalQty = lines.reduce((s, l) => s + (l.qty ?? 0), 0);
  const head = lines[0];
  if (!head) return { head: "—", rest: 0, totalQty };
  const a = head.attrs as { color?: string; gap?: string; fabric_name?: string } | null;
  let label = head.sku;
  if (a?.color || a?.gap) {
    const bits: string[] = [];
    if (a.color) bits.push(a.color);
    if (a.gap) bits.push(`gap ${a.gap}`);
    label = `${head.sku} · ${bits.join(" · ")}`;
  } else if (a?.fabric_name) {
    label = `${head.sku} · ${a.fabric_name}`;
  }
  return { head: label, rest: lines.length - 1, totalQty };
}

export default function PartnerFactoryPickupsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  // Loo 2026-05-11: "Arrived at WH" now opens a full receive modal that
  // uploads DO + ticks per-line qty, atomically flipping the PO to received.
  const [receivingPoId, setReceivingPoId] = useState<string | null>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: qk.partner.pickups(),
    queryFn: () => apiFetch<PickupRow[]>("/api/partner/pickups"),
  });

  const accept = useMutation({
    mutationFn: (poId: string) =>
      apiFetch(`/api/partner/pickups/${poId}/accept`, { method: "POST" }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: qk.partner.pickups() });
      await qc.invalidateQueries({ queryKey: qk.partner.dashboard() });
    },
  });
  const markCollected = useMutation({
    mutationFn: (poId: string) =>
      apiFetch(`/api/partner/pickups/${poId}/mark-picked-up`, { method: "POST" }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: qk.partner.pickups() });
      await qc.invalidateQueries({ queryKey: qk.partner.dashboard() });
    },
  });
  // markArrived RPC kept on the API (POST /:id/arrived → partner_arrived_at_warehouse)
  // for the rare "I'm here but don't have DO yet" case, but no UI trigger now —
  // every code path goes through the receive modal instead.

  const buckets = useMemo(() => {
    const out = {
      awaiting: [] as PickupRow[],
      scheduled: [] as PickupRow[],
      in_transit: [] as PickupRow[],
      delivered: [] as PickupRow[],
    };
    const matchSearch = (p: PickupRow) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      if (p.id.toLowerCase().includes(q)) return true;
      if (p.suppliers?.name.toLowerCase().includes(q)) return true;
      return p.lines.some((l) => l.sku.toLowerCase().includes(q));
    };
    for (const p of rows) {
      if (!matchSearch(p)) continue;
      const stage = stageOf(p);
      if (stage) out[stage].push(p);
    }
    return out;
  }, [rows, search]);

  const totalAll = rows.length;
  const totalAwait = buckets.awaiting.length;
  const openPo = openId ? rows.find((p) => p.id === openId) ?? null : null;

  if (isLoading) {
    return (
      <div className="px-9 py-8 pb-14 text-[13px] text-base-600">Loading…</div>
    );
  }

  return (
    <div className="px-9 py-7 pb-14 space-y-5">
      <header className="flex justify-between items-end gap-4 flex-wrap">
        <div>
          <div className="kicker">Factory pickups</div>
          <h1 className="font-display text-[32px] mt-1.5 leading-[1.05] tracking-[-0.025em] font-bold text-base-900">
            Supplier collections
          </h1>
          <div className="font-body text-[13px] text-base-600 mt-1">
            {totalAll} job{totalAll === 1 ? "" : "s"} · {totalAwait} awaiting accept
          </div>
        </div>
        <input
          type="search"
          placeholder="Search PO / SKU / supplier…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-3.5 py-2 border border-base-300 rounded-[4px] text-[13px] min-w-[240px] outline-none focus:border-primary"
        />
      </header>

      {totalAll === 0 ? (
        <div className="bg-white border border-base-200 rounded-md p-15 text-center text-[13px] text-base-500">
          No factory pickups assigned to you yet.
        </div>
      ) : (
        <>
          <div className="kicker text-base-500">Active pipeline</div>
          <div className="grid grid-cols-3 gap-3.5">
            <PipelineColumn
              label="Awaiting accept"
              hint="Dispatched to you · accept to schedule"
              accent="warning"
              items={buckets.awaiting}
              renderAction={(po) => (
                <button
                  type="button"
                  disabled={accept.isPending}
                  onClick={() =>
                    accept.mutate(po.id, {
                      onSuccess: () =>
                        toast.success(`${po.id} accepted · scheduled for pickup`),
                      onError: (err) =>
                        toast.error(
                          err instanceof ApiError ? err.message : "Accept failed",
                        ),
                    })
                  }
                  className="w-full px-3 py-1.5 bg-primary text-white rounded text-[12px] font-semibold disabled:opacity-50"
                >
                  ✓ Accept pickup
                </button>
              )}
              onOpen={setOpenId}
            />
            <PipelineColumn
              label="Scheduled"
              hint="Pickup booked · waiting for collection"
              accent="info"
              items={buckets.scheduled}
              renderAction={(po) => (
                <button
                  type="button"
                  disabled={markCollected.isPending}
                  onClick={() =>
                    markCollected.mutate(po.id, {
                      onSuccess: () =>
                        toast.success(`${po.id} collected · in transit`),
                      onError: (err) =>
                        toast.error(
                          err instanceof ApiError ? err.message : "Mark failed",
                        ),
                    })
                  }
                  className="w-full px-3 py-1.5 bg-primary text-white rounded text-[12px] font-semibold disabled:opacity-50"
                >
                  📦 Mark collected
                </button>
              )}
              onOpen={setOpenId}
            />
            <PipelineColumn
              label="In transit"
              hint="Goods loaded · en route to warehouse"
              accent="info"
              items={buckets.in_transit}
              renderAction={(po) => (
                <button
                  type="button"
                  onClick={() => setReceivingPoId(po.id)}
                  className="w-full px-3 py-1.5 bg-primary text-white rounded text-[12px] font-semibold"
                  data-testid={`receive-at-wh-${po.id}`}
                >
                  🏢 Arrived at WH · Receive
                </button>
              )}
              onOpen={setOpenId}
            />
          </div>

          {buckets.delivered.length > 0 && (
            <section className="space-y-2 mt-2">
              <div className="flex items-baseline gap-2.5">
                <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-success">
                  Delivered to WH
                </span>
                <span className="font-mono text-[12px] font-semibold text-base-700 px-2 py-0.5 rounded-full bg-base-100">
                  {buckets.delivered.length}
                </span>
                <span className="font-body text-[11px] text-base-500">
                  Awaiting warehouse receive
                </span>
              </div>
              <div className="grid grid-cols-1 gap-2.5">
                {buckets.delivered.map((p) => (
                  <DeliveredRow key={p.id} po={p} onOpen={setOpenId} />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {openPo && (
        <PickupDrawer
          po={openPo}
          onClose={() => setOpenId(null)}
          onAccept={() =>
            accept.mutate(openPo.id, {
              onSuccess: () => {
                toast.success(`${openPo.id} accepted · scheduled for pickup`);
                setOpenId(null);
              },
              onError: (err) =>
                toast.error(err instanceof ApiError ? err.message : "Accept failed"),
            })
          }
          onMarkCollected={() =>
            markCollected.mutate(openPo.id, {
              onSuccess: () => {
                toast.success(`${openPo.id} collected · in transit`);
                setOpenId(null);
              },
              onError: (err) =>
                toast.error(err instanceof ApiError ? err.message : "Mark failed"),
            })
          }
          onMarkArrived={() => {
            // Drawer's In-transit CTA now opens the receive modal too — same
            // pivot as the kanban-card button.
            const id = openPo.id;
            setOpenId(null);
            setReceivingPoId(id);
          }}
          accepting={accept.isPending}
          markingCollected={markCollected.isPending}
        />
      )}

      {receivingPoId &&
        (() => {
          const po = rows.find((p) => p.id === receivingPoId);
          if (!po) return null;
          return (
            <PartnerReceiveAtWhModal
              po={po}
              onClose={() => setReceivingPoId(null)}
            />
          );
        })()}
    </div>
  );
}

function PipelineColumn({
  label,
  hint,
  accent,
  items,
  renderAction,
  onOpen,
}: {
  label: string;
  hint: string;
  accent: "warning" | "info";
  items: PickupRow[];
  renderAction: (p: PickupRow) => React.ReactNode;
  onOpen: (id: string) => void;
}) {
  const accentCls = accent === "warning" ? "text-warning" : "text-info";
  return (
    <div className="bg-white border border-base-200 rounded-md overflow-hidden flex flex-col">
      <div className="px-4 py-3.5 border-b border-base-100">
        <div className="flex justify-between items-baseline">
          <div
            className={`text-[11px] font-bold uppercase tracking-[0.14em] ${accentCls}`}
          >
            {label}
          </div>
          <span className="font-mono text-[13px] font-semibold">
            {items.length}
          </span>
        </div>
        <div className="font-body text-[11px] text-base-500 mt-0.5">{hint}</div>
      </div>
      <div className="p-2.5 min-h-[220px] flex flex-col gap-2">
        {items.length === 0 ? (
          <div className="text-center text-base-400 text-[11px] py-6">—</div>
        ) : (
          items.map((p) => (
            <PipelineCard
              key={p.id}
              po={p}
              renderAction={() => renderAction(p)}
              onOpen={() => onOpen(p.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function PipelineCard({
  po,
  renderAction,
  onOpen,
}: {
  po: PickupRow;
  renderAction: () => React.ReactNode;
  onOpen: () => void;
}) {
  const { head, rest, totalQty } = lineSummary(po.lines);
  const summary = rest > 0 ? `${head} +${rest} more` : head;
  return (
    <div className="bg-white border border-base-100 rounded-[4px] p-3 hover:border-primary transition-colors">
      <div className="flex justify-between items-baseline mb-1">
        <span className="font-mono text-[11px] font-semibold">{po.id}</span>
        <span className="font-mono text-[11px] text-base-500">×{totalQty}</span>
      </div>
      <div className="font-display text-[13px] font-semibold leading-[1.25] tracking-[-0.01em] mb-1.5 break-words">
        {summary}
      </div>
      <div className="font-body text-[11px] text-base-600 leading-[1.5]">
        🏭 {po.suppliers?.name ?? "—"}
      </div>
      <div className="font-body text-[11px] text-base-600 leading-[1.5]">
        🏢 → {po.warehouses?.name ?? "—"}
      </div>
      <div className="font-mono text-[10px] text-base-500 mt-1">
        📅 {po.eta_date ? `Pickup ${po.eta_date}` : "Pickup TBD"}
      </div>
      <div className="flex flex-col gap-1.5 mt-2.5">
        {renderAction()}
        <button
          type="button"
          onClick={onOpen}
          className="text-[11px] py-1 px-2 text-base-600 hover:text-base-900 text-left"
        >
          Details ›
        </button>
      </div>
    </div>
  );
}

function DeliveredRow({
  po,
  onOpen,
}: {
  po: PickupRow;
  onOpen: (id: string) => void;
}) {
  const { head, rest, totalQty } = lineSummary(po.lines);
  const summary = rest > 0 ? `${head} +${rest} more` : head;
  return (
    <button
      type="button"
      onClick={() => onOpen(po.id)}
      className="bg-white border border-base-100 rounded-md px-4 py-3 grid grid-cols-[auto_1fr_auto] gap-4 items-center cursor-pointer hover:border-primary transition-colors text-left"
    >
      <span className="font-mono text-[12px] font-semibold">{po.id}</span>
      <div>
        <div className="font-body text-[12px]">{summary}</div>
        <div className="font-body text-[11px] text-base-500 mt-0.5">
          {po.suppliers?.name ?? "—"} → {po.warehouses?.name ?? "—"} · ×{totalQty}
        </div>
      </div>
      <span className="font-mono text-[10px] text-success uppercase tracking-[0.1em] font-bold">
        Awaiting receive
      </span>
    </button>
  );
}

function PickupDrawer({
  po,
  onClose,
  onAccept,
  onMarkCollected,
  onMarkArrived,
  accepting,
  markingCollected,
}: {
  po: PickupRow;
  onClose: () => void;
  onAccept: () => void;
  onMarkCollected: () => void;
  onMarkArrived: () => void;
  accepting: boolean;
  markingCollected: boolean;
}) {
  const stage = stageOf(po);
  const { totalQty } = lineSummary(po.lines);

  return (
    <div
      className="fixed inset-0 bg-black/40 flex justify-end z-50"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-[520px] max-w-full h-full bg-white shadow-xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        data-testid="partner-pickup-drawer"
      >
        <div className="px-6 py-5 border-b border-base-100 flex justify-between items-start gap-3">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.12em] text-base-500">
              Pickup brief
            </div>
            <div className="font-mono text-[14px] font-semibold mt-1">{po.id}</div>
            <div className="text-[12px] text-base-600 mt-1">
              {po.lines.length} line{po.lines.length === 1 ? "" : "s"} ·{" "}
              <strong>{totalQty}</strong> unit{totalQty === 1 ? "" : "s"}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[22px] text-base-500 hover:text-base-900"
            aria-label="Close drawer"
          >
            ×
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          <div>
            <div className="text-[10px] uppercase tracking-[0.12em] text-base-500 mb-2">
              From
            </div>
            <div className="bg-white border border-base-100 rounded-md px-3.5 py-2.5">
              <div className="text-[13px] font-semibold">
                {po.suppliers?.name ?? "Supplier"}
              </div>
              {po.suppliers?.contact && (
                <div className="text-[11px] text-base-600 mt-0.5">
                  {po.suppliers.contact}
                </div>
              )}
            </div>
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-[0.12em] text-base-500 mb-2">
              To
            </div>
            <div className="bg-white border border-base-100 rounded-md px-3.5 py-2.5">
              <div className="text-[13px] font-semibold">
                {po.warehouses?.name ?? "Carres warehouse"}
              </div>
              {po.warehouses?.address && (
                <div className="text-[11px] text-base-600 mt-0.5">
                  {po.warehouses.address}
                </div>
              )}
            </div>
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-[0.12em] text-base-500 mb-2">
              Lines
            </div>
            <div className="bg-white border border-base-100 rounded-md divide-y divide-base-100">
              {po.lines.map((l) => {
                const a = (l.attrs ?? {}) as {
                  color?: string;
                  gap?: string;
                  fabric_name?: string;
                };
                const variant: string[] = [];
                if (a.color) variant.push(a.color);
                if (a.gap) variant.push(`gap ${a.gap}`);
                if (a.fabric_name) variant.push(a.fabric_name);
                return (
                  <div
                    key={l.id}
                    className="flex justify-between items-baseline gap-3 px-3.5 py-2.5"
                  >
                    <div className="min-w-0">
                      <div className="text-[12px] font-semibold truncate">
                        {l.sku}
                      </div>
                      {variant.length > 0 && (
                        <div className="text-[11px] text-primary mt-0.5">
                          {variant.join(" · ")}
                        </div>
                      )}
                    </div>
                    <div className="font-mono text-[12px]">×{l.qty}</div>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-[0.12em] text-base-500 mb-1">
              Status
            </div>
            <div className="text-[13px]">{po.sup_status}</div>
            {po.eta_date && (
              <div className="text-[11px] text-base-500 mt-0.5">
                Pickup target: {po.eta_date}
              </div>
            )}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-base-100 flex gap-2 justify-end">
          {stage === "awaiting" && (
            <button
              type="button"
              disabled={accepting}
              onClick={onAccept}
              className="px-5 py-2 bg-primary text-white rounded-md text-[13px] font-semibold disabled:opacity-50"
            >
              {accepting ? "Accepting…" : "✓ Accept pickup"}
            </button>
          )}
          {stage === "scheduled" && (
            <button
              type="button"
              disabled={markingCollected}
              onClick={onMarkCollected}
              className="px-5 py-2 bg-primary text-white rounded-md text-[13px] font-semibold disabled:opacity-50"
            >
              {markingCollected ? "Marking…" : "📦 Mark collected"}
            </button>
          )}
          {stage === "in_transit" && (
            <button
              type="button"
              onClick={onMarkArrived}
              className="px-5 py-2 bg-primary text-white rounded-md text-[13px] font-semibold"
            >
              🏢 Arrived at WH · Receive
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
