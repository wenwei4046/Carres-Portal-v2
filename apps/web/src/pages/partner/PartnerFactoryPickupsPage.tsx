import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError, apiFetch } from "@/lib/api";
import { qk, usePartnerMarkPickupCollected } from "@/lib/queries";
import PartnerReceiveAtWhModal from "./components/PartnerReceiveAtWhModal";
import PickupBatchDialog from "./components/PickupBatchDialog";

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

/**
 * 2026-05-15 (Task 11) — per-thread readiness embedded on the partner pickups
 * SELECT. Each thread is one linked sales order; supplier_ready_at + pickup
 * _event_id together drive the multi-select pickup UI (factory_pickup POs).
 * Ready & unpicked threads are picked-eligible.
 */
type PickupThread = {
  id: string;
  order_id: string;
  supplier_ready_at: string | null;
  pickup_event_id: string | null;
  orders: { dl: number; delivery_date: string | null; customer_name: string } | null;
};

type PickupEvent = {
  id: string;
  do_number: string;
  picked_up_at: string | null;
  // 2026-05-17 (migration 0119) — null = SCHEDULED (DO booked, partner has
  // not yet physically collected); non-null = IN TRANSIT (loaded + driving).
  departed_at: string | null;
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
  procurement_partner_id: string | null;
  // 2026-05-11 (Loo migration 0090): supplier.kind drives Accept-Pickup vs
  // Accept-Receive button branching at sup_status='ready_confirm_sent'.
  // warehouse.kind + owning_partner_id surface so the UI can label
  // partner-WH-owned PO rows distinctly from procurement-assignment ones.
  suppliers: { name: string; contact: string | null; kind: "own_logistics" | "factory_pickup" | null } | null;
  warehouses: { name: string; address: string | null; kind: "own" | "logistics_partner" | null; owning_partner_id: string | null } | null;
  lines: PickupLine[];
  threads?: PickupThread[];
  // 2026-05-17 — embedded so the drawer's In-transit section can resolve
  // thread.pickup_event_id to its DO# without a second round-trip.
  pickup_events?: PickupEvent[];
};

/**
 * 2026-05-15 (Task 11) — predicate: thread is supplier-ready and not yet
 * picked. Used to derive the multi-select list per PO + gate "Pickup selected"
 * button.
 */
function readyThreadsOf(p: PickupRow): PickupThread[] {
  return (p.threads ?? []).filter(
    (t) => t.supplier_ready_at !== null && t.pickup_event_id === null,
  );
}

/** Threads still being made at the supplier — not yet ready, not picked. */
function producingThreadsOf(p: PickupRow): PickupThread[] {
  return (p.threads ?? []).filter(
    (t) => t.supplier_ready_at === null && t.pickup_event_id === null,
  );
}

/** Threads attached to a pickup_event — partner has booked them.
 *  Split below by event.departed_at into scheduled vs in-transit. */
function pickedThreadsOf(p: PickupRow): PickupThread[] {
  return (p.threads ?? []).filter((t) => t.pickup_event_id !== null);
}

/** Picked threads whose event has been booked but not yet physically
 *  collected (event.departed_at IS NULL). PO surfaces in SCHEDULED. */
function scheduledThreadsOf(p: PickupRow): PickupThread[] {
  const eventById = new Map((p.pickup_events ?? []).map((e) => [e.id, e]));
  return pickedThreadsOf(p).filter((t) => {
    const e = t.pickup_event_id ? eventById.get(t.pickup_event_id) : null;
    return e != null && e.departed_at == null;
  });
}

/** Picked threads whose event has been physically collected (departed_at
 *  IS NOT NULL). PO surfaces in IN TRANSIT. */
function inTransitThreadsOf(p: PickupRow): PickupThread[] {
  const eventById = new Map((p.pickup_events ?? []).map((e) => [e.id, e]));
  return pickedThreadsOf(p).filter((t) => {
    const e = t.pickup_event_id ? eventById.get(t.pickup_event_id) : null;
    return e != null && e.departed_at != null;
  });
}

type Stage = "upcoming" | "awaiting" | "scheduled" | "in_transit" | "delivered";

/**
 * 2026-05-16 (Loo screenshot + migration 0114) — stage placement is
 * thread-state-aware. Same PO can fall in BOTH `upcoming` (producing
 * threads still on the floor) AND `awaiting` (ready threads waiting for
 * partner pickup) when partial — returned as a list of stages, not a
 * single stage. Caller buckets the PO into every matching stage.
 *
 * For stockpile / forecast POs (no threads) we keep the old sup_status
 * fallback, since there are no thread booleans to read.
 */
function stagesOf(p: PickupRow): Stage[] {
  if (p.status !== "open") return [];
  const threads = p.threads ?? [];
  // Stockpile fallback — no threads, classify by sup_status (legacy).
  if (threads.length === 0) {
    if (
      p.sup_status === "pending" ||
      p.sup_status === "acknowledged" ||
      p.sup_status === "in_production"
    )
      return ["upcoming"];
    if (
      p.sup_status === "ready_confirm_sent" ||
      p.sup_status === "ready_for_pickup" ||
      p.sup_status === "pickup_assigned" ||
      p.sup_status === "partially_shipped"
    )
      return ["awaiting"];
    if (p.sup_status === "pickup_accepted") return ["scheduled"];
    if (p.sup_status === "picked_up" || p.sup_status === "shipped") return ["in_transit"];
    if (p.sup_status === "delivered") return ["delivered"];
    return [];
  }
  // Terminal sup_status pinning — once the PO is fully delivered it leaves
  // every other bucket.
  if (p.sup_status === "delivered") return ["delivered"];
  if (p.sup_status === "pickup_accepted") return ["scheduled"];
  // 2026-05-17 (Loo screenshot + migration 0119) — partial PO can sit in
  // MULTIPLE columns at once: producing threads → Upcoming, ready threads →
  // Awaiting, picked threads with un-departed event → Scheduled, picked
  // threads with departed event → In transit. The legacy picked_up/shipped
  // early-return was removed because the scheduled vs in-transit split is
  // now per-event (departed_at), not per-PO sup_status.
  const events = p.pickup_events ?? [];
  const eventById = new Map(events.map((e) => [e.id, e]));
  const out: Stage[] = [];
  const producing = threads.some(
    (t) => t.supplier_ready_at === null && t.pickup_event_id === null,
  );
  const ready = threads.some(
    (t) => t.supplier_ready_at !== null && t.pickup_event_id === null,
  );
  const scheduled = threads.some((t) => {
    if (t.pickup_event_id == null) return false;
    const e = eventById.get(t.pickup_event_id);
    return e != null && e.departed_at == null;
  });
  const inTransit = threads.some((t) => {
    if (t.pickup_event_id == null) return false;
    const e = eventById.get(t.pickup_event_id);
    return e != null && e.departed_at != null;
  });
  if (producing) out.push("upcoming");
  if (ready) out.push("awaiting");
  if (scheduled) out.push("scheduled");
  if (inTransit) out.push("in_transit");
  return out;
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
  // 2026-05-15 (Task 11) — per-thread multi-select pickup state. Keyed by
  // poId because each PO has its own thread checklist; clearing on dialog
  // close resets the entire pickup queue so the next batch starts clean.
  const [selectedByPo, setSelectedByPo] = useState<Map<string, Set<string>>>(
    () => new Map(),
  );
  const [openDialog, setOpenDialog] = useState<{
    poId: string;
    threadIds: string[];
  } | null>(null);
  function toggleThread(poId: string, threadId: string) {
    setSelectedByPo((prev) => {
      const next = new Map(prev);
      const set = new Set(next.get(poId) ?? []);
      if (set.has(threadId)) set.delete(threadId);
      else set.add(threadId);
      next.set(poId, set);
      return next;
    });
  }

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
  // 2026-05-11 (Loo migration 0090) — own_logistics + ready_confirm_sent
  // branch. The supplier dispatches the goods themselves; partner only
  // confirms receipt at the partner-WH OR rejects so logistics relocates.
  const confirmReceive = useMutation({
    mutationFn: (poId: string) =>
      apiFetch(`/api/partner/pickups/${poId}/confirm-receive`, { method: "POST" }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: qk.partner.pickups() });
      await qc.invalidateQueries({ queryKey: qk.partner.dashboard() });
      toast.success("Receive confirmed · supplier may dispatch");
    },
    onError: (err: unknown) => {
      const msg = err instanceof ApiError ? err.message : "Confirm failed";
      toast.error(msg);
    },
  });
  const rejectReceive = useMutation({
    mutationFn: ({ poId, reason }: { poId: string; reason: string }) =>
      apiFetch(`/api/partner/pickups/${poId}/reject-receive`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: qk.partner.pickups() });
      await qc.invalidateQueries({ queryKey: qk.partner.dashboard() });
      toast.success("Rejected · Logistics will relocate the warehouse");
    },
    onError: (err: unknown) => {
      const msg = err instanceof ApiError ? err.message : "Reject failed";
      toast.error(msg);
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
  // 2026-05-17 (migration 0119) — per-thread "Mark collected" stamps
  // po_pickup_events.departed_at. Drives the SCHEDULED → IN TRANSIT
  // transition for the per-thread flow.
  const markPickupCollected = usePartnerMarkPickupCollected();
  async function markAllUnDepartedCollected(po: PickupRow) {
    const undeparted = (po.pickup_events ?? []).filter((e) => e.departed_at == null);
    if (undeparted.length === 0) return;
    try {
      await Promise.all(undeparted.map((e) => markPickupCollected.mutateAsync(e.id)));
      toast.success(
        undeparted.length === 1
          ? `${po.id} collected · in transit to WH`
          : `${po.id} · ${undeparted.length} batches collected · in transit`,
      );
      await qc.invalidateQueries({ queryKey: qk.partner.pickups() });
      await qc.invalidateQueries({ queryKey: qk.partner.dashboard() });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Mark collected failed");
    }
  }
  // markArrived RPC kept on the API (POST /:id/arrived → partner_arrived_at_warehouse)
  // for the rare "I'm here but don't have DO yet" case, but no UI trigger now —
  // every code path goes through the receive modal instead.

  const buckets = useMemo(() => {
    const out = {
      upcoming: [] as PickupRow[],
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
      // 2026-05-16 — a partially-ticked PO appears in BOTH `upcoming`
      // (still has producing threads) AND `awaiting` (has ready threads
      // ready for partner pickup). One row, two columns; partner sees
      // the ready threads even while production continues on the rest.
      for (const stage of stagesOf(p)) {
        out[stage].push(p);
      }
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5">
            {/* 2026-05-11 (Loo): Upcoming column = supplier still producing.
                Read-only — no action button (partner just monitors ETA to plan
                capacity until the PO drops into Awaiting accept). */}
            <PipelineColumn
              label="Upcoming"
              hint="Supplier still producing · plan ahead"
              accent="muted"
              items={buckets.upcoming}
              renderAction={(po) => (
                <span className="block w-full text-center font-mono text-[10px] text-base-500 py-1.5">
                  {po.eta_date ? `ETA ${po.eta_date}` : "ETA tbd"}
                </span>
              )}
              onOpen={setOpenId}
            />
            <PipelineColumn
              label="Awaiting accept"
              hint="Dispatched to you · accept to schedule"
              accent="warning"
              items={buckets.awaiting}
              renderAction={(po) => {
                // 2026-05-11 (Loo migration 0090) — branch on supplier kind:
                //   own_logistics + ready_confirm_sent → Accept Receive +
                //     Reject (sofa flow, supplier dispatches themselves to
                //     partner-owned WH, partner only confirms or relocates)
                //   anything else → Accept Pickup (the partner picks up at
                //     the factory in the standard factory_pickup flow)
                const isReceiveFlow =
                  po.suppliers?.kind === "own_logistics" &&
                  po.sup_status === "ready_confirm_sent";
                if (isReceiveFlow) {
                  return (
                    <div className="flex flex-col gap-1.5">
                      <button
                        type="button"
                        disabled={confirmReceive.isPending || rejectReceive.isPending}
                        onClick={() => confirmReceive.mutate(po.id)}
                        className="w-full px-3 py-1.5 bg-primary text-white rounded text-[12px] font-semibold disabled:opacity-50"
                        data-testid={`confirm-receive-${po.id}`}
                      >
                        ✓ Accept · Confirm receive
                      </button>
                      <button
                        type="button"
                        disabled={confirmReceive.isPending || rejectReceive.isPending}
                        onClick={() => {
                          const reason = window.prompt(
                            "Why are you rejecting this incoming delivery? (≥4 chars, optional but recommended)",
                            "",
                          );
                          if (reason === null) return;
                          rejectReceive.mutate({ poId: po.id, reason });
                        }}
                        className="w-full px-3 py-1.5 bg-white border border-warning text-warning rounded text-[12px] font-semibold disabled:opacity-50"
                        data-testid={`reject-receive-${po.id}`}
                      >
                        ✗ Reject · Relocate
                      </button>
                    </div>
                  );
                }
                // 2026-05-15 (Task 11) — per-thread pickup branch. When a
                // factory_pickup PO has 1+ supplier-ready threads (set by
                // supplier_mark_thread_ready RPC, migration 0107), the
                // partner picks them in batches: one DO paper = one trip =
                // one po_pickup_events row covering N threads. PO transitions
                // to partially_shipped (more to pick) or shipped (none left).
                // Falls back to the legacy PO-level Accept Pickup button
                // when no threads are ready (e.g. stockpile / forecast POs).
                const ready = readyThreadsOf(po);
                if (ready.length > 0) {
                  const selSet = selectedByPo.get(po.id) ?? new Set<string>();
                  const selectedCount = selSet.size;
                  return (
                    <div className="flex flex-col gap-1.5">
                      <div
                        className="border border-base-200 rounded-[4px] bg-base-50 p-2 space-y-1"
                        data-testid={`ready-threads-${po.id}`}
                      >
                        <div className="text-[10px] uppercase tracking-[0.06em] text-base-600 font-semibold">
                          Ready threads ({ready.length})
                        </div>
                        {ready.map((t) => (
                          <label
                            key={t.id}
                            className="flex items-center gap-2 cursor-pointer text-[11px] font-body"
                          >
                            <input
                              type="checkbox"
                              checked={selSet.has(t.id)}
                              onChange={() => toggleThread(po.id, t.id)}
                              className="accent-primary"
                              aria-label={`Select thread for SO-${t.orders?.dl ?? "?"}`}
                              data-testid={`thread-checkbox-${t.id}`}
                            />
                            <span className="truncate">
                              <span className="font-mono font-semibold">
                                SO-{t.orders?.dl ?? "?"}
                              </span>{" "}
                              · {t.orders?.customer_name ?? "—"}
                            </span>
                          </label>
                        ))}
                      </div>
                      <button
                        type="button"
                        disabled={selectedCount === 0}
                        onClick={() =>
                          setOpenDialog({
                            poId: po.id,
                            threadIds: Array.from(selSet),
                          })
                        }
                        className="w-full px-3 py-1.5 bg-primary text-white rounded text-[12px] font-semibold disabled:opacity-50"
                        data-testid={`pickup-selected-${po.id}`}
                      >
                        🚚 Pickup selected ({selectedCount})
                      </button>
                    </div>
                  );
                }
                return (
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
                );
              }}
              onOpen={setOpenId}
            />
            <PipelineColumn
              label="Scheduled"
              hint="Pickup booked · waiting for collection"
              accent="info"
              items={buckets.scheduled}
              renderAction={(po) => {
                // 2026-05-17 (Loo + migration 0119) — per-thread branch.
                // When PO has un-departed pickup_events, use the new
                // partner_mark_pickup_collected RPC (stamps departed_at).
                // Falls back to the legacy partner_mark_picked_up RPC for
                // stockpile/non-thread POs sitting at sup_status='pickup_accepted'.
                const undeparted = (po.pickup_events ?? []).filter(
                  (e) => e.departed_at == null,
                );
                if (undeparted.length > 0) {
                  return (
                    <button
                      type="button"
                      disabled={markPickupCollected.isPending}
                      onClick={() => markAllUnDepartedCollected(po)}
                      className="w-full px-3 py-1.5 bg-primary text-white rounded text-[12px] font-semibold disabled:opacity-50"
                      data-testid={`mark-collected-${po.id}`}
                    >
                      📦 Mark collected{undeparted.length > 1 ? ` (${undeparted.length})` : ""}
                    </button>
                  );
                }
                return (
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
                );
              }}
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
          readyThreads={readyThreadsOf(openPo)}
          selectedThreadIds={selectedByPo.get(openPo.id) ?? new Set<string>()}
          onToggleThread={(threadId) => toggleThread(openPo.id, threadId)}
          onPickupSelected={() => {
            const sel = selectedByPo.get(openPo.id) ?? new Set<string>();
            if (sel.size === 0) return;
            const id = openPo.id;
            setOpenDialog({ poId: id, threadIds: Array.from(sel) });
            setOpenId(null);
          }}
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
          onMarkCollected={async () => {
            // 2026-05-17 (Loo + migration 0119) — per-thread branch: stamp
            // every un-departed pickup_event on this PO. Legacy fallback
            // uses partner_mark_picked_up for stockpile/non-thread POs.
            const undeparted = (openPo.pickup_events ?? []).filter(
              (e) => e.departed_at == null,
            );
            if (undeparted.length > 0) {
              setOpenId(null);
              await markAllUnDepartedCollected(openPo);
              return;
            }
            markCollected.mutate(openPo.id, {
              onSuccess: () => {
                toast.success(`${openPo.id} collected · in transit`);
                setOpenId(null);
              },
              onError: (err) =>
                toast.error(err instanceof ApiError ? err.message : "Mark failed"),
            });
          }}
          onMarkArrived={() => {
            // Drawer's In-transit CTA now opens the receive modal too — same
            // pivot as the kanban-card button.
            const id = openPo.id;
            setOpenId(null);
            setReceivingPoId(id);
          }}
          accepting={accept.isPending}
          markingCollected={markCollected.isPending || markPickupCollected.isPending}
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

      {openDialog && (
        <PickupBatchDialog
          poId={openDialog.poId}
          selectedThreadIds={openDialog.threadIds}
          onClose={() => {
            setOpenDialog(null);
            // 2026-05-15 (Task 11) — reset every PO's selection so the
            // next visit to the page starts clean. The success path
            // invalidates qk.partner.pickups() via the mutation hook so
            // ready-thread visibility refreshes automatically.
            setSelectedByPo(new Map());
          }}
        />
      )}
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
  accent: "warning" | "info" | "muted";
  items: PickupRow[];
  renderAction: (p: PickupRow) => React.ReactNode;
  onOpen: (id: string) => void;
}) {
  const accentCls =
    accent === "warning"
      ? "text-warning"
      : accent === "info"
        ? "text-info"
        : "text-base-500";
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
  readyThreads,
  selectedThreadIds,
  onToggleThread,
  onPickupSelected,
  onClose,
  onAccept,
  onMarkCollected,
  onMarkArrived,
  accepting,
  markingCollected,
}: {
  po: PickupRow;
  readyThreads: PickupThread[];
  selectedThreadIds: Set<string>;
  onToggleThread: (threadId: string) => void;
  onPickupSelected: () => void;
  onClose: () => void;
  onAccept: () => void;
  onMarkCollected: () => void;
  onMarkArrived: () => void;
  accepting: boolean;
  markingCollected: boolean;
}) {
  // 2026-05-17 (Loo screenshot) — drawer must honor the SAME multi-stage
  // bucketing as the kanban. A partial PO (`in_production` + 3 ready
  // threads + 2 still producing) belongs to BOTH "upcoming" and "awaiting"
  // simultaneously. Using stageOf() returned only the first ("upcoming")
  // which hid the pickup CTA. Switch to stages.includes() membership and
  // gate the Ready-threads section on hasReadyThreads alone — if any
  // thread is supplier-ready-unpicked the partner can pick it regardless
  // of overall sup_status.
  const stages = stagesOf(po);
  const { totalQty } = lineSummary(po.lines);
  const selectedCount = selectedThreadIds.size;
  const hasReadyThreads = readyThreads.length > 0;
  // 2026-05-17 (Loo) — replace LINES section with thread-grouped pipeline
  // so the drawer shows what's actually still to collect (not the original
  // PO procurement total, which is misleading once partial pickups land).
  // 2026-05-17 (migration 0119) — Scheduled vs In-transit split mirrors
  // the proto's 3-step partner flow: Scheduled = DO booked, awaiting
  // physical collection. In transit = collected, on the road.
  const producingThreads = producingThreadsOf(po);
  const scheduledThreads = scheduledThreadsOf(po);
  const inTransitThreads = inTransitThreadsOf(po);
  const eventById = new Map((po.pickup_events ?? []).map((e) => [e.id, e]));
  const hasAnyThreads =
    producingThreads.length +
      readyThreads.length +
      scheduledThreads.length +
      inTransitThreads.length >
    0;

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

          {/* 2026-05-17 (Loo) — thread-grouped pipeline replaces the static
              PO-line list. Each section tells the partner what's where:
              still being made at the supplier (Producing), waiting at the
              supplier dock (Ready), or already on the truck (In transit). */}
          {hasAnyThreads && (
            <div className="space-y-4">
              {producingThreads.length > 0 && (
                <ThreadGroup
                  title="Producing"
                  count={producingThreads.length}
                  hint="Supplier still making — not ready to collect"
                  testId={`drawer-producing-threads-${po.id}`}
                >
                  {producingThreads.map((t) => (
                    <ThreadRow key={t.id} thread={t} />
                  ))}
                </ThreadGroup>
              )}

              {hasReadyThreads && (
                <div>
                  <div className="flex items-baseline justify-between mb-2">
                    <div className="text-[10px] uppercase tracking-[0.12em] text-base-500">
                      Ready for pickup ({readyThreads.length})
                    </div>
                    <div className="text-[10px] text-base-500">
                      Tick to include in this pickup
                    </div>
                  </div>
                  <div
                    className="bg-base-50 border border-base-200 rounded-md divide-y divide-base-100"
                    data-testid={`drawer-ready-threads-${po.id}`}
                  >
                    {readyThreads.map((t) => (
                      <label
                        key={t.id}
                        className="flex items-center gap-2.5 px-3.5 py-2.5 cursor-pointer hover:bg-base-100"
                      >
                        <input
                          type="checkbox"
                          checked={selectedThreadIds.has(t.id)}
                          onChange={() => onToggleThread(t.id)}
                          className="accent-primary h-3.5 w-3.5"
                          aria-label={`Select thread for SO-${t.orders?.dl ?? "?"}`}
                          data-testid={`drawer-thread-checkbox-${t.id}`}
                        />
                        <span className="flex-1 min-w-0 text-[12px] truncate">
                          <span className="font-mono font-semibold">
                            SO-{t.orders?.dl ?? "?"}
                          </span>{" "}
                          · {t.orders?.customer_name ?? "—"}
                        </span>
                        {t.orders?.delivery_date && (
                          <span className="font-mono text-[10px] text-base-500 shrink-0">
                            {t.orders.delivery_date}
                          </span>
                        )}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {scheduledThreads.length > 0 && (
                <ThreadGroup
                  title="Scheduled"
                  count={scheduledThreads.length}
                  hint="DO booked · awaiting physical collection"
                  testId={`drawer-scheduled-threads-${po.id}`}
                  accent="info"
                >
                  {scheduledThreads.map((t) => (
                    <ThreadRow
                      key={t.id}
                      thread={t}
                      doNumber={
                        t.pickup_event_id
                          ? eventById.get(t.pickup_event_id)?.do_number ?? null
                          : null
                      }
                    />
                  ))}
                </ThreadGroup>
              )}

              {inTransitThreads.length > 0 && (
                <ThreadGroup
                  title="In transit"
                  count={inTransitThreads.length}
                  hint="Collected · driving to warehouse"
                  testId={`drawer-in-transit-threads-${po.id}`}
                  accent="info"
                >
                  {inTransitThreads.map((t) => (
                    <ThreadRow
                      key={t.id}
                      thread={t}
                      doNumber={
                        t.pickup_event_id
                          ? eventById.get(t.pickup_event_id)?.do_number ?? null
                          : null
                      }
                    />
                  ))}
                </ThreadGroup>
              )}
            </div>
          )}

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
          {hasReadyThreads && (
            <button
              type="button"
              disabled={selectedCount === 0}
              onClick={onPickupSelected}
              className="px-5 py-2 bg-primary text-white rounded-md text-[13px] font-semibold disabled:opacity-50"
              data-testid={`drawer-pickup-selected-${po.id}`}
            >
              🚚 Pickup selected ({selectedCount})
            </button>
          )}
          {stages.includes("awaiting") && !hasReadyThreads && (
            <button
              type="button"
              disabled={accepting}
              onClick={onAccept}
              className="px-5 py-2 bg-primary text-white rounded-md text-[13px] font-semibold disabled:opacity-50"
            >
              {accepting ? "Accepting…" : "✓ Accept pickup"}
            </button>
          )}
          {stages.includes("scheduled") && (
            <button
              type="button"
              disabled={markingCollected}
              onClick={onMarkCollected}
              className="px-5 py-2 bg-primary text-white rounded-md text-[13px] font-semibold disabled:opacity-50"
            >
              {markingCollected ? "Marking…" : "📦 Mark collected"}
            </button>
          )}
          {stages.includes("in_transit") && (
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

/**
 * ThreadGroup — shared frame for the drawer's Producing / Ready / In transit
 * sections. Keeps spacing + label typography consistent. `accent` switches
 * the count pill color so In transit reads as "active" rather than "muted".
 */
function ThreadGroup({
  title,
  count,
  hint,
  testId,
  accent,
  children,
}: {
  title: string;
  count: number;
  hint?: string;
  testId?: string;
  accent?: "info";
  children: React.ReactNode;
}) {
  const countCls =
    accent === "info" ? "text-info" : "text-base-700";
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2 gap-3">
        <div className="text-[10px] uppercase tracking-[0.12em] text-base-500">
          {title}{" "}
          <span className={`font-mono font-semibold ${countCls}`}>({count})</span>
        </div>
        {hint && (
          <div className="text-[10px] text-base-500 text-right truncate">{hint}</div>
        )}
      </div>
      <div
        className="bg-white border border-base-100 rounded-md divide-y divide-base-100"
        data-testid={testId}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * ThreadRow — SO# + customer + optional delivery_date + optional DO# pill.
 * Used by the read-only Producing + In transit sections. The Ready section
 * has its own checkbox-row layout inline above because of state coupling.
 */
function ThreadRow({
  thread,
  doNumber,
}: {
  thread: PickupThread;
  doNumber?: string | null;
}) {
  return (
    <div className="flex items-center gap-2.5 px-3.5 py-2.5">
      <span className="flex-1 min-w-0 text-[12px] truncate">
        <span className="font-mono font-semibold">
          SO-{thread.orders?.dl ?? "?"}
        </span>{" "}
        · {thread.orders?.customer_name ?? "—"}
      </span>
      {doNumber && (
        <span
          className="font-mono text-[10px] text-info bg-info/10 px-2 py-0.5 rounded-full shrink-0"
          title="Picked under this DO"
        >
          🚚 {doNumber}
        </span>
      )}
      {thread.orders?.delivery_date && (
        <span className="font-mono text-[10px] text-base-500 shrink-0">
          {thread.orders.delivery_date}
        </span>
      )}
    </div>
  );
}
