import { useState } from "react";
import { Home, Warehouse } from "lucide-react";
import { toast } from "sonner";
import {
  useDeliveryPartners,
  useSetDeliveryChain,
  usePatchDeliveryStop,
} from "@/lib/queries";
import {
  STOCK_LOCATIONS,
  type DeliveryStop,
  type DeliveryStopStatus,
} from "@carres/shared";

/** Real leg places (§7.6): the known warehouses/suppliers + the customer. */
const LEG_LOCATIONS = [...STOCK_LOCATIONS, "Customer"] as const;

/**
 * DeliveryChain — multi-leg delivery timeline for the Order detail drawer.
 *
 * γ architecture (migration 0156). Orders default to single-leg, driven by
 * `orders.delivery_partner_id`. When operation needs to hand off to another
 * partner mid-route (KL→JB→Singapore is the canonical case), the chain
 * lifts into `orders.delivery_stops jsonb` — each leg has its own partner,
 * from/to, status timeline, and POD slot.
 *
 * UI states:
 *   1. No chain yet (single-leg or unassigned) — compact one-liner with a
 *      "Set up multi-leg route" CTA that pre-fills leg 1 from the current
 *      delivery_partner_id (if set).
 *   2. Chain set — vertical timeline of legs. Each leg shows partner +
 *      from→to + status pill + per-leg action buttons (Mark Picked Up /
 *      Handed Off / Delivered / Edit notes).
 *
 * POD upload is intentionally not in V1 — operation can attach pod_url via
 * the API directly once Storage bucket policies are verified. The notes
 * field gets you most of the way for handoff context. See PR #11 for V2.
 */

const STATUS_LABEL: Record<DeliveryStopStatus, string> = {
  pending: "Pending",
  picked_up: "Picked up",
  handed_off: "Handed off",
  delivered: "Delivered",
  issue: "Issue",
};

const STATUS_DOT: Record<DeliveryStopStatus, string> = {
  pending: "bg-base-300",
  picked_up: "bg-blue-500",
  handed_off: "bg-amber-500",
  delivered: "bg-green-600",
  issue: "bg-error-600",
};

const fmtAt = (iso: string | null | undefined) => {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    return d.toLocaleString("en-MY", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return iso;
  }
};

/** A leg's scheduled_at (ISO datetime) ↔ a `<input type="date">` value
 *  (yyyy-mm-dd). Stored at NOON local so the date never flips across the MYT
 *  (+8) offset when it round-trips through UTC. */
function isoToDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function dateInputToIso(v: string): string {
  return new Date(`${v}T12:00:00`).toISOString();
}

interface Props {
  orderId: string;
  stops: DeliveryStop[] | null;
  /** Fallback when no chain set — used to seed leg 1 and show "via NETS"
   *  on the empty-state. Partner name is looked up from
   *  `useDeliveryPartners()` so the caller doesn't need a join. */
  fallbackPartnerId?: string | null;
}

export default function DeliveryChain({
  orderId,
  stops,
  fallbackPartnerId,
}: Props) {
  const chain = stops ?? [];
  const hasChain = chain.length > 0;

  const { data: partnersData } = useDeliveryPartners();
  const partners = partnersData?.partners ?? [];
  const fallbackPartnerName =
    partners.find((p) => p.id === fallbackPartnerId)?.name ?? null;

  const setChain = useSetDeliveryChain(orderId, {
    onSuccess: () => toast.success("Delivery chain updated"),
    onError: (e) => toast.error(`Couldn't update chain — ${e.message}`),
  });
  const patchStop = usePatchDeliveryStop(orderId, {
    onSuccess: () => toast.success("Leg updated"),
    onError: (e) => toast.error(`Couldn't update leg — ${e.message}`),
  });

  const [showAddLeg, setShowAddLeg] = useState(false);

  // --- "No chain yet" view — compact single-trip read-out (Jess 4-col) --------
  // A normal order is a single trip via the carrier picked in Delivery. Adding a
  // stop opens the pick-partner form directly (previously "Set up multi-leg
  // route" seeded an EMPTY chain when no carrier was assigned → a dead no-op).
  if (!hasChain) {
    return (
      <div className="text-xs">
        {/* Single trip — the SAME wordless journey-bar language as the item Route
            (Jess 2026-07-11): warehouse → partner → customer. Icons are the
            places, colour is the progress; the only word is the partner pill. */}
        <div className="flex items-center gap-1.5 mb-2">
          <Warehouse
            className="w-3.5 h-3.5 text-base-400 shrink-0"
            strokeWidth={2}
          />
          <span
            className="h-1.5 flex-1 rounded-full min-w-[10px]"
            style={{ backgroundColor: fallbackPartnerName ? "#2563EB" : "#D8D3C8" }}
          />
          {fallbackPartnerName ? (
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-white border border-base-200 whitespace-nowrap">
              {fallbackPartnerName}
            </span>
          ) : (
            <span className="text-[10px] text-base-400 whitespace-nowrap">
              set in Delivery
            </span>
          )}
          <span className="h-1.5 flex-1 rounded-full min-w-[10px] bg-[#D8D3C8]" />
          <Home
            className="w-3.5 h-3.5 text-base-400 shrink-0"
            strokeWidth={2}
          />
        </div>
        {showAddLeg ? (
          <AddLegForm
            nextLeg={1}
            partners={partners}
            previousToLoc="Carres warehouse"
            onCancel={() => setShowAddLeg(false)}
            onSubmit={(newStop) =>
              setChain.mutate(
                { stops: [newStop] },
                { onSuccess: () => setShowAddLeg(false) },
              )
            }
            pending={setChain.isPending}
          />
        ) : (
          <button
            type="button"
            className="text-[11px] font-medium text-primary hover:underline"
            onClick={() => setShowAddLeg(true)}
          >
            + Add stop (multi-leg)
          </button>
        )}
      </div>
    );
  }

  // --- "Has chain" view: timeline -------------------------------------------
  return (
    <div className="space-y-2">
      {chain.map((stop, idx) => (
        <StopRow
          key={stop.leg}
          stop={stop}
          isLast={idx === chain.length - 1}
          onPatch={(patch) =>
            patchStop.mutate({ leg: stop.leg, patch })
          }
          patchPending={patchStop.isPending}
          onRemove={() => {
            const next = chain
              .filter((s) => s.leg !== stop.leg)
              .map((s, i) => ({ ...s, leg: i + 1 }));
            setChain.mutate({ stops: next });
          }}
        />
      ))}

      {!showAddLeg ? (
        <button
          type="button"
          className="w-full rounded border border-dashed border-base-300 px-3 py-2 text-xs font-medium text-base-600 hover:bg-base-50 hover:text-base-900"
          onClick={() => setShowAddLeg(true)}
        >
          + Add another leg
        </button>
      ) : (
        <AddLegForm
          nextLeg={chain.length + 1}
          partners={partners}
          previousToLoc={chain[chain.length - 1]?.to_loc ?? ""}
          onCancel={() => setShowAddLeg(false)}
          onSubmit={(newStop) => {
            const next = [...chain, newStop];
            setChain.mutate(
              { stops: next },
              {
                onSuccess: () => setShowAddLeg(false),
              },
            );
          }}
          pending={setChain.isPending}
        />
      )}

      <div className="pt-1 text-right">
        <button
          type="button"
          className="text-[11px] text-base-500 hover:text-error-700"
          onClick={() => {
            if (!confirm("Clear the whole delivery chain back to single-leg?")) return;
            setChain.mutate({ stops: [] });
          }}
        >
          Clear chain (back to single-leg)
        </button>
      </div>
    </div>
  );
}

// =====================================================================
// Per-leg row
// =====================================================================
interface StopRowProps {
  stop: DeliveryStop;
  isLast: boolean;
  onPatch: (patch: Partial<DeliveryStop>) => void;
  patchPending: boolean;
  onRemove: () => void;
}

function StopRow({ stop, isLast, onPatch, patchPending, onRemove }: StopRowProps) {
  const [editingNotes, setEditingNotes] = useState(false);
  const [noteDraft, setNoteDraft] = useState(stop.notes ?? "");
  const [editingEta, setEditingEta] = useState(false);
  const [etaDraft, setEtaDraft] = useState(isoToDateInput(stop.scheduled_at));

  const stamp = stop.delivered_at ?? stop.handed_off_at ?? stop.picked_up_at ?? null;
  const stampLabel = stamp ? fmtAt(stamp) : null;
  const etaLabel = stop.scheduled_at
    ? new Date(stop.scheduled_at).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "2-digit",
      })
    : null;

  // Next status in the natural flow: pending → picked_up → handed_off (or
  // delivered for the last leg) → delivered. Issue is set manually.
  const nextStatus: { label: string; status: DeliveryStopStatus } | null = (() => {
    if (stop.status === "pending") return { label: "Mark Picked Up", status: "picked_up" };
    if (stop.status === "picked_up") {
      return isLast
        ? { label: "Mark Delivered", status: "delivered" }
        : { label: "Mark Handed Off", status: "handed_off" };
    }
    if (stop.status === "handed_off" && isLast) return { label: "Mark Delivered", status: "delivered" };
    return null;
  })();

  return (
    <div className="rounded border border-base-200 bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-base-500">LEG {stop.leg}</span>
            <span className="text-sm font-semibold text-base-900">{stop.partner_name}</span>
            <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium text-base-700 bg-base-100`}>
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${STATUS_DOT[stop.status]}`} />
              {STATUS_LABEL[stop.status]}
              {stampLabel ? <span className="text-base-500"> · {stampLabel}</span> : null}
            </span>
          </div>
          <div className="mt-1 text-xs text-base-600">
            <span className="font-mono">{stop.from_loc}</span>
            <span className="mx-1 text-base-400">→</span>
            <span className="font-mono">{stop.to_loc}</span>
          </div>
        </div>
        <button
          type="button"
          className="text-[11px] text-base-400 hover:text-error-700"
          onClick={onRemove}
          title="Remove this leg"
        >
          ✕
        </button>
      </div>

      {/* Stop ETA (scheduled_at) — inline-editable per leg */}
      <div className="mt-2 text-xs">
        {editingEta ? (
          <div className="flex items-center gap-2">
            <input
              type="date"
              className="rounded border border-base-300 px-2 py-1 text-xs"
              value={etaDraft}
              onChange={(e) => setEtaDraft(e.target.value)}
            />
            <button
              type="button"
              className="rounded bg-base-900 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-base-800 disabled:opacity-50"
              disabled={patchPending}
              onClick={() => {
                onPatch({ scheduled_at: etaDraft ? dateInputToIso(etaDraft) : null });
                setEditingEta(false);
              }}
            >
              Save
            </button>
            <button
              type="button"
              className="text-[11px] text-base-500"
              onClick={() => {
                setEtaDraft(isoToDateInput(stop.scheduled_at));
                setEditingEta(false);
              }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="text-[11px] text-base-500 hover:text-base-700"
            onClick={() => setEditingEta(true)}
          >
            {etaLabel ? (
              <span className="text-base-700">🕑 ETA {etaLabel}</span>
            ) : (
              <span>+ Set stop ETA</span>
            )}
          </button>
        )}
      </div>

      {/* Notes — inline-editable */}
      <div className="mt-2 text-xs">
        {editingNotes ? (
          <div className="space-y-1">
            <textarea
              className="w-full rounded border border-base-300 px-2 py-1 text-xs"
              rows={2}
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              placeholder="Handoff context, customer comments, partner notes…"
            />
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded bg-base-900 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-base-800 disabled:opacity-50"
                disabled={patchPending}
                onClick={() => {
                  onPatch({ notes: noteDraft || null });
                  setEditingNotes(false);
                }}
              >
                Save
              </button>
              <button
                type="button"
                className="text-[11px] text-base-500"
                onClick={() => {
                  setNoteDraft(stop.notes ?? "");
                  setEditingNotes(false);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="w-full text-left text-[11px] text-base-500 hover:text-base-700"
            onClick={() => setEditingNotes(true)}
          >
            {stop.notes ? <span className="text-base-700">📝 {stop.notes}</span> : <span>+ Add notes</span>}
          </button>
        )}
      </div>

      {/* Status action buttons */}
      {nextStatus ? (
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            className="rounded bg-base-900 px-2 py-1 text-[11px] font-medium text-white hover:bg-base-800 disabled:opacity-50"
            disabled={patchPending}
            onClick={() => onPatch({ status: nextStatus.status })}
          >
            {patchPending ? "Working…" : nextStatus.label}
          </button>
        </div>
      ) : null}
    </div>
  );
}

// =====================================================================
// Add-leg form
// =====================================================================
interface AddLegProps {
  nextLeg: number;
  partners: { id: string; name: string; zones?: string | null }[];
  previousToLoc: string;
  onSubmit: (newStop: DeliveryStop) => void;
  onCancel: () => void;
  pending: boolean;
}

function AddLegForm({
  nextLeg,
  partners,
  previousToLoc,
  onSubmit,
  onCancel,
  pending,
}: AddLegProps) {
  const [partnerId, setPartnerId] = useState<string>("");
  const [fromLoc, setFromLoc] = useState<string>(previousToLoc || "");
  const [toLoc, setToLoc] = useState<string>("");

  const partner = partners.find((p) => p.id === partnerId);
  const canSubmit = !!partner && fromLoc.trim().length > 0 && toLoc.trim().length > 0;

  return (
    <div className="rounded border border-primary/30 bg-primary/5 p-3 space-y-2">
      <div className="text-[11px] font-semibold text-base-900">Add Leg {nextLeg}</div>
      <select
        className="w-full rounded border border-base-300 bg-white px-2 py-1 text-xs"
        value={partnerId}
        onChange={(e) => setPartnerId(e.target.value)}
      >
        <option value="">— pick partner —</option>
        {partners.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
            {p.zones ? ` · ${p.zones}` : ""}
          </option>
        ))}
      </select>
      {/* §7.6 — legs use REAL locations (warehouse / supplier / customer),
          not free text. A previous leg's custom destination stays pickable. */}
      <div className="grid grid-cols-2 gap-2">
        <select
          className="rounded border border-base-300 px-2 py-1 text-xs bg-white"
          aria-label="Leg from"
          value={fromLoc}
          onChange={(e) => setFromLoc(e.target.value)}
        >
          <option value="">From…</option>
          {!!fromLoc &&
            !LEG_LOCATIONS.includes(fromLoc as (typeof LEG_LOCATIONS)[number]) && (
              <option value={fromLoc}>{fromLoc}</option>
            )}
          {LEG_LOCATIONS.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <select
          className="rounded border border-base-300 px-2 py-1 text-xs bg-white"
          aria-label="Leg to"
          value={toLoc}
          onChange={(e) => setToLoc(e.target.value)}
        >
          <option value="">To…</option>
          {LEG_LOCATIONS.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      </div>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          className="text-[11px] text-base-500 hover:text-base-700"
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          type="button"
          className="rounded bg-primary px-2 py-1 text-[11px] font-medium text-white hover:opacity-90 disabled:opacity-50"
          disabled={!canSubmit || pending}
          onClick={() => {
            if (!partner) return;
            onSubmit({
              leg: nextLeg,
              partner_id: partner.id,
              partner_name: partner.name,
              from_loc: fromLoc.trim(),
              to_loc: toLoc.trim(),
              status: "pending",
            });
          }}
        >
          {pending ? "Adding…" : "Add leg"}
        </button>
      </div>
    </div>
  );
}
