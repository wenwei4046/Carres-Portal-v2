import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  ASSIGN_IN_SALES_ORDERS,
  ASSIGN_IN_SALES_ORDERS_HREF,
  NOBODY_ASSIGNED_TO_ORDER,
  type CollectionOwnerContextRow,
} from "@carres/shared/payment-collection-owner";
import { SectionCard } from "@/components/SectionPanel";
import { apiFetch } from "@/lib/api";
import { appTodayIso, fmtDate } from "@/lib/fmt-date";
import { qk, useCollectionOwner, useOperationWork, useWorkspaceDuties } from "@/lib/queries";
import { toast } from "sonner";

/**
 * COLLECTION OWNER — one Sales Order keeps one collection owner (owner
 * ruling 2026-09-13; 0489 · 0504). The section prints the three facts every
 * surface agrees on — normal owner · today's cover · acting person — from the
 * SAME read the Work feed uses, then the append-only history, and (for a
 * principal or manager) the one formal `Hand over collection` door. Cover is
 * never written here: leave and buddy cover live in Staff & Duties. The owner
 * itself is the individual the Sales Order was dealt to (0504), so the
 * unresolved case points at the assignment, not at a duty holder.
 */
export default function InvoiceCollectionOwner({ orderId, canRead }: {
  orderId: string;
  /** Operation / principal read the owner; Finance reads the facts only. */
  canRead: boolean;
}) {
  const ownerQ = useCollectionOwner(orderId, canRead);
  const dutiesQ = useWorkspaceDuties({ enabled: canRead });
  const canHandover = dutiesQ.data?.can_assign === true;
  const [handing, setHanding] = useState(false);
  const owner = ownerQ.data?.owner ?? null;

  return <SectionCard><div className="p-3" data-testid="collection-owner">
    <h2 className="text-strong mb-2">Collection owner</h2>
    <div className="text-body">
      {!canRead ? <p>Owner facts are Operation's.</p>
      : ownerQ.isLoading ? <p>Loading…</p>
      : ownerQ.isError ? <p>Owner facts could not be loaded.</p>
      : !owner ? <>
          <p className="text-kit-red-11" data-testid="collection-owner-none">{NOBODY_ASSIGNED_TO_ORDER}</p>
          <p className="text-label font-normal">
            <Link to={ASSIGN_IN_SALES_ORDERS_HREF} className="underline underline-offset-2">{ASSIGN_IN_SALES_ORDERS}</Link>
          </p>
        </>
      : <OwnerFacts owner={owner} />}
      {canRead && owner && <History owner={owner} />}
      {canRead && canHandover && !handing &&
        <button type="button" className="btn-secondary mt-2" onClick={() => setHanding(true)} data-testid="collection-owner-handover-open">
          Hand over collection
        </button>}
      {canRead && canHandover && handing &&
        <HandoverForm orderId={orderId} current={owner} onClose={() => setHanding(false)} />}
    </div>
  </div></SectionCard>;
}

/** `Normal owner: Shasha · Today's cover: Yu Jun · Actual staff: Yu Jun` —
 *  three distinct facts, never collapsed into one name. */
function OwnerFacts({ owner }: { owner: CollectionOwnerContextRow }) {
  return <div data-testid="collection-owner-facts">
    <p>Normal owner: <span data-testid="collection-owner-normal">{owner.normal_user_name ?? "Name not recorded"}</span></p>
    <p>Today's cover: <span data-testid="collection-owner-cover">{owner.is_cover ? `${owner.cover_user_name ?? "Name not recorded"}${owner.cover_ends_on ? ` · until ${fmtDate(owner.cover_ends_on)}` : ""}` : "No cover today"}</span></p>
    <p>Acting today: <span data-testid="collection-owner-acting">{owner.acting_user_name ?? "Name not recorded"}</span></p>
    <p className="text-label font-normal">
      {owner.source === "handover" ? "Handed over" : "Responsible Delivery Operation"} · since {fmtDate(owner.effective_from)}
    </p>
  </div>;
}

function History({ owner }: { owner: CollectionOwnerContextRow }) {
  const rows = [...owner.history].reverse();
  if (rows.length === 0) return null;
  return <details className="mt-2" data-testid="collection-owner-history">
    <summary className="cursor-pointer text-label">History · {rows.length} {rows.length === 1 ? "change" : "changes"}</summary>
    <div className="mt-1 space-y-1 text-label font-normal">
      {rows.map((h) => <p key={h.id}>
        {h.source === "handover"
          ? `Handed over · ${h.previous_owner_user_name ?? "Nobody"} → ${h.owner_user_name ?? "Name not recorded"} · ${h.reason} · by ${h.changed_by_name ?? "Staff identity not recorded"} · ${fmtDate(h.changed_at, { time: true })} · effective from ${fmtDate(h.effective_from)}`
          : `Established · ${h.owner_user_name ?? "Name not recorded"} · ${h.reason} · ${fmtDate(h.changed_at, { time: true })}`}
      </p>)}
    </div>
  </details>;
}

/** The formal handover — new owner · reason · effective from. The SQL door
 *  writes previous owner · changed by · changed on and refuses a non-manager. */
function HandoverForm({ orderId, current, onClose }: {
  orderId: string;
  current: CollectionOwnerContextRow | null;
  onClose: () => void;
}) {
  const staffQ = useOperationWork();
  const staff = (staffQ.data?.staff ?? []).filter((s) => s.userId !== current?.normal_user_id);
  const [newOwner, setNewOwner] = useState("");
  const [reason, setReason] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(appTodayIso());
  const qc = useQueryClient();
  const handover = useMutation({
    mutationFn: () => apiFetch("/api/finance/collection-owner/handover", {
      method: "POST",
      body: JSON.stringify({
        order_id: orderId, new_owner_user_id: newOwner, reason: reason.trim(), effective_from: effectiveFrom || null,
      }),
    }),
    onSuccess: () => {
      toast.success("Collection handed over");
      void qc.invalidateQueries({ queryKey: qk.finance.collectionOwner(orderId) });
      void qc.invalidateQueries({ queryKey: qk.operation.work() });
      onClose();
    },
    onError: (e: Error) => toast.error(`The handover was not recorded — ${e.message}`),
  });
  const ready = newOwner !== "" && reason.trim().length >= 3 && effectiveFrom >= appTodayIso();
  return <div className="mt-2 space-y-2" data-testid="collection-owner-handover">
    {current && <p className="text-label font-normal">Previous owner: {current.normal_user_name ?? "Name not recorded"}</p>}
    <label className="block text-label">New owner
      <select className="input mt-1 w-full" value={newOwner} onChange={(e) => setNewOwner(e.target.value)} data-testid="collection-owner-new">
        <option value="">Choose staff…</option>
        {staff.map((s) => <option key={s.userId} value={s.userId}>{s.name ?? s.email}</option>)}
      </select>
    </label>
    <label className="block text-label">Reason
      <input className="input mt-1 w-full" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why the collection changes hands" data-testid="collection-owner-reason" />
    </label>
    <label className="block text-label">Effective from
      <input type="date" className="input mt-1" value={effectiveFrom} min={appTodayIso()} onChange={(e) => setEffectiveFrom(e.target.value)} data-testid="collection-owner-from" />
    </label>
    <span className="flex gap-2">
      <button type="button" className="btn-primary" disabled={!ready || handover.isPending} onClick={() => handover.mutate()} data-testid="collection-owner-handover-save">
        Hand over collection
      </button>
      <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
    </span>
  </div>;
}
