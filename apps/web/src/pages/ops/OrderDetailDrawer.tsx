import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";

/**
 * Ops · Order Detail Drawer (Jess 2026-05-14).
 *
 * Slides in from the right when an Inbox row is clicked. Replaces the 19-col
 * Excel scrollfest with a section-grouped layout:
 *   header (ref, customer, status, balance)
 *   items (full line list)
 *   delivery (date + time slot + address)
 *   ops notes (customer_request / carres_remark / action_for_logistic)
 *   logistic assignment (autocount source / ops final / logistic_remark /
 *     logistic_eta)
 *   related (placeholder for SN / Issues / Returns — Phase 2)
 *   timeline (placeholder — will wire to ops_activity_log filtered by entity_ref)
 *
 * Annotation fields save on blur via PATCH /api/ops/orders/:ref/annotation.
 * Logistic re-assignment uses the existing assign-logistic endpoint.
 */

export type ImportedOrder = {
  ref: string;
  customer_name: string;
  customer_phone: string | null;
  delivery_address_1: string | null;
  delivery_address_2: string | null;
  delivery_address_3: string | null;
  delivery_address_4: string | null;
  delivery_location: string | null;
  delivery_date_requested: string | null;
  balance_raw: string | null;
  balance_amount: number | null;
  balance_status: string | null;
  items: { itemGroup: string | null; qty: number; description: string | null; poDocNo: string | null }[];
  total_qty: number;
  order_date: string | null;
  import_source_logistic: string | null;
  ops_assigned_logistic: string | null;
  ops_status: string;
  ops_remark: string | null;
  ops_customer_request?: string | null;
  ops_carres_remark?: string | null;
  ops_action_for_logistic?: string | null;
  ops_logistic_remark?: string | null;
  ops_logistic_eta?: string | null;
  ops_delivery_time_slot?: string | null;
  last_imported_at: string;
  first_imported_at: string;
};

const LOGISTIC_OPTIONS = ["NETS", "TSDD", "AL", "HOUZS", "GAI", "HOOKKA", "Self-pickup", "Other"];
const STATUS_OPTIONS = [
  "inbox",
  "assigned",
  "awaiting_stock",
  "ready",
  "dispatched",
  "delivered",
  "on_hold",
  "cancelled",
];

interface Props {
  order: ImportedOrder | null;
  onClose: () => void;
}

export default function OrderDetailDrawer({ order, onClose }: Props) {
  const qc = useQueryClient();
  // Local edit buffer so user types freely; saves on blur or button click.
  const [draft, setDraft] = useState({
    ops_customer_request: order?.ops_customer_request ?? "",
    ops_carres_remark: order?.ops_carres_remark ?? "",
    ops_action_for_logistic: order?.ops_action_for_logistic ?? "",
    ops_logistic_remark: order?.ops_logistic_remark ?? "",
    ops_logistic_eta: order?.ops_logistic_eta ?? "",
    ops_delivery_time_slot: order?.ops_delivery_time_slot ?? "",
    ops_assigned_logistic: order?.ops_assigned_logistic ?? "",
    ops_status: order?.ops_status ?? "inbox",
  });

  // Reset draft when a different order is selected.
  useEffect(() => {
    if (!order) return;
    setDraft({
      ops_customer_request: order.ops_customer_request ?? "",
      ops_carres_remark: order.ops_carres_remark ?? "",
      ops_action_for_logistic: order.ops_action_for_logistic ?? "",
      ops_logistic_remark: order.ops_logistic_remark ?? "",
      ops_logistic_eta: order.ops_logistic_eta ?? "",
      ops_delivery_time_slot: order.ops_delivery_time_slot ?? "",
      ops_assigned_logistic: order.ops_assigned_logistic ?? "",
      ops_status: order.ops_status ?? "inbox",
    });
  }, [order?.ref]); // eslint-disable-line react-hooks/exhaustive-deps

  const annotationMut = useMutation({
    mutationFn: async (input: Record<string, string | null>) => {
      if (!order) return;
      await apiFetch(`/api/ops/orders/${encodeURIComponent(order.ref)}/annotation`, {
        method: "PATCH",
        body: JSON.stringify(input),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ops"] });
    },
    onError: (err) => {
      toast.error(`Save failed: ${err instanceof Error ? err.message : "unknown"}`);
    },
  });

  const assignMut = useMutation({
    mutationFn: async ({ logistic }: { logistic: string }) => {
      if (!order) return;
      await apiFetch(`/api/ops/orders/${encodeURIComponent(order.ref)}/assign-logistic`, {
        method: "POST",
        body: JSON.stringify({ logistic }),
      });
    },
    onSuccess: () => {
      toast.success("Logistic updated");
      qc.invalidateQueries({ queryKey: ["ops"] });
    },
    onError: (err) => {
      toast.error(`Assign failed: ${err instanceof Error ? err.message : "unknown"}`);
    },
  });

  const statusMut = useMutation({
    mutationFn: async ({ status }: { status: string }) => {
      if (!order) return;
      await apiFetch(`/api/ops/orders/${encodeURIComponent(order.ref)}/status`, {
        method: "POST",
        body: JSON.stringify({ status }),
      });
    },
    onSuccess: () => {
      toast.success("Status updated");
      qc.invalidateQueries({ queryKey: ["ops"] });
    },
    onError: (err) => {
      toast.error(`Status update failed: ${err instanceof Error ? err.message : "unknown"}`);
    },
  });

  if (!order) return null;

  function saveField(field: keyof typeof draft, apiField: string) {
    const current = (order as unknown as Record<string, string | null>)[field] ?? "";
    const next = draft[field];
    if (current === next) return; // no-op
    annotationMut.mutate({ [apiField]: next === "" ? null : next });
  }

  const addressLines = [
    order.delivery_address_1,
    order.delivery_address_2,
    order.delivery_address_3,
    order.delivery_address_4,
  ].filter(Boolean);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40"
        onClick={onClose}
        aria-label="Close detail"
      />
      {/* Drawer */}
      <aside
        className="fixed top-0 right-0 h-screen bg-white shadow-2xl z-50 overflow-y-auto"
        style={{ width: "min(680px, 92vw)" }}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-base-200 px-5 py-4 z-10">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="min-w-0">
              <div className="font-mono text-[15px] font-bold text-base-900">{order.ref}</div>
              <div className="text-[15px] font-semibold text-base-900 truncate mt-0.5">
                {order.customer_name}
              </div>
              <div className="text-[12px] text-base-500 mt-0.5">
                {order.customer_phone && <span>📞 {order.customer_phone}</span>}
                {order.customer_phone && order.delivery_location && <span> · </span>}
                {order.delivery_location && <span>📍 {order.delivery_location}</span>}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-base-400 hover:text-base-700 text-[20px] leading-none"
              aria-label="Close"
            >
              ×
            </button>
          </div>
          <div className="flex items-center gap-3 text-[12px]">
            <span
              className="font-ui font-bold uppercase border rounded-[3px] inline-block"
              style={{
                fontSize: 9,
                letterSpacing: "0.12em",
                padding: "3px 7px",
                color: order.ops_status === "inbox" ? "#C84F1D" : "#555",
                borderColor: order.ops_status === "inbox" ? "#C84F1D" : "#999",
              }}
            >
              {order.ops_status}
            </span>
            {order.balance_raw && (
              <span className="text-base-700">
                Balance: <span className="font-semibold">{order.balance_raw}</span>
              </span>
            )}
          </div>
        </div>

        <div className="px-5 py-4 space-y-6">
          {/* Items */}
          <section>
            <div className="text-[10px] uppercase tracking-wider text-base-500 font-semibold mb-2">
              📦 Items ({order.items?.length ?? 0} lines · {order.total_qty} pcs total)
            </div>
            <div className="card p-0">
              {(order.items ?? []).map((it, i) => (
                <div
                  key={i}
                  className="grid gap-2 px-3 py-2 border-b border-base-100 last:border-b-0 text-[12.5px]"
                  style={{ gridTemplateColumns: "90px 40px 1fr 140px" }}
                >
                  <div className="text-base-600">{it.itemGroup ?? "—"}</div>
                  <div className="text-right font-mono text-base-700">×{it.qty}</div>
                  <div className="text-base-800 truncate" title={it.description ?? ""}>
                    {it.description ?? "—"}
                  </div>
                  <div className="text-[10.5px] text-base-500 font-mono truncate" title={it.poDocNo ?? ""}>
                    {it.poDocNo ?? ""}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Delivery */}
          <section>
            <div className="text-[10px] uppercase tracking-wider text-base-500 font-semibold mb-2">
              🚚 Delivery
            </div>
            <div className="card p-3 space-y-2">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-base-500 block mb-1">Date requested</label>
                  <div className="text-[12.5px] text-base-800">
                    {order.delivery_date_requested ?? "—"}
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-base-500 block mb-1">Time slot</label>
                  <input
                    type="text"
                    placeholder="e.g. 2-4pm / TBC"
                    className="input w-full text-[12.5px] px-2 py-1"
                    value={draft.ops_delivery_time_slot}
                    onChange={(e) =>
                      setDraft({ ...draft, ops_delivery_time_slot: e.target.value })
                    }
                    onBlur={() => saveField("ops_delivery_time_slot", "deliveryTimeSlot")}
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] text-base-500 block mb-1">Address</label>
                <div className="text-[12.5px] text-base-800 whitespace-pre-line">
                  {addressLines.length > 0 ? addressLines.join("\n") : "—"}
                </div>
              </div>
            </div>
          </section>

          {/* Ops Notes */}
          <section>
            <div className="text-[10px] uppercase tracking-wider text-base-500 font-semibold mb-2">
              📋 Ops Notes <span className="text-base-400 normal-case">(saves on blur)</span>
            </div>
            <div className="card p-3 space-y-3">
              <div>
                <label className="text-[10px] text-base-500 block mb-1">Customer request</label>
                <textarea
                  rows={2}
                  placeholder='e.g. "deliver weekday 2-4pm" / "call before arriving"'
                  className="input w-full text-[12.5px] px-2 py-1.5"
                  value={draft.ops_customer_request}
                  onChange={(e) => setDraft({ ...draft, ops_customer_request: e.target.value })}
                  onBlur={() => saveField("ops_customer_request", "customerRequest")}
                />
              </div>
              <div>
                <label className="text-[10px] text-base-500 block mb-1">Carres remark (internal)</label>
                <textarea
                  rows={2}
                  placeholder="internal note for the team"
                  className="input w-full text-[12.5px] px-2 py-1.5"
                  value={draft.ops_carres_remark}
                  onChange={(e) => setDraft({ ...draft, ops_carres_remark: e.target.value })}
                  onBlur={() => saveField("ops_carres_remark", "carresRemark")}
                />
              </div>
              <div>
                <label className="text-[10px] text-base-500 block mb-1">Action for logistic</label>
                <textarea
                  rows={2}
                  placeholder='e.g. "call before arriving" / "deliver with sofa together"'
                  className="input w-full text-[12.5px] px-2 py-1.5"
                  value={draft.ops_action_for_logistic}
                  onChange={(e) =>
                    setDraft({ ...draft, ops_action_for_logistic: e.target.value })
                  }
                  onBlur={() => saveField("ops_action_for_logistic", "actionForLogistic")}
                />
              </div>
            </div>
          </section>

          {/* Logistic Assignment */}
          <section>
            <div className="text-[10px] uppercase tracking-wider text-base-500 font-semibold mb-2">
              🚛 Logistic Assignment
            </div>
            <div className="card p-3 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-base-500 block mb-1">AutoCount source</label>
                  <div className="text-[12.5px] text-base-600 italic">
                    {order.import_source_logistic ?? "—"}
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-base-500 block mb-1">Ops final assignment</label>
                  <div className="flex gap-2">
                    <select
                      className="input flex-1 text-[12.5px] px-2 py-1"
                      value={draft.ops_assigned_logistic}
                      onChange={(e) => setDraft({ ...draft, ops_assigned_logistic: e.target.value })}
                    >
                      <option value="">— unset —</option>
                      {LOGISTIC_OPTIONS.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn-primary text-[11px] px-2.5 py-1"
                      disabled={
                        !draft.ops_assigned_logistic ||
                        draft.ops_assigned_logistic === order.ops_assigned_logistic ||
                        assignMut.isPending
                      }
                      onClick={() => assignMut.mutate({ logistic: draft.ops_assigned_logistic })}
                    >
                      {assignMut.isPending ? "…" : "Save"}
                    </button>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-base-500 block mb-1">Logistic ETA</label>
                  <input
                    type="date"
                    className="input w-full text-[12.5px] px-2 py-1"
                    value={draft.ops_logistic_eta}
                    onChange={(e) => setDraft({ ...draft, ops_logistic_eta: e.target.value })}
                    onBlur={() => saveField("ops_logistic_eta", "logisticEta")}
                  />
                </div>
                <div>
                  <label className="text-[10px] text-base-500 block mb-1">Status</label>
                  <div className="flex gap-2">
                    <select
                      className="input flex-1 text-[12.5px] px-2 py-1"
                      value={draft.ops_status}
                      onChange={(e) => setDraft({ ...draft, ops_status: e.target.value })}
                    >
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn-primary text-[11px] px-2.5 py-1"
                      disabled={
                        draft.ops_status === order.ops_status || statusMut.isPending
                      }
                      onClick={() => statusMut.mutate({ status: draft.ops_status })}
                    >
                      {statusMut.isPending ? "…" : "Save"}
                    </button>
                  </div>
                </div>
              </div>
              <div>
                <label className="text-[10px] text-base-500 block mb-1">Logistic remark</label>
                <textarea
                  rows={2}
                  placeholder='what the logistic partner told us — e.g. "NETS confirmed Tue 2pm"'
                  className="input w-full text-[12.5px] px-2 py-1.5"
                  value={draft.ops_logistic_remark}
                  onChange={(e) => setDraft({ ...draft, ops_logistic_remark: e.target.value })}
                  onBlur={() => saveField("ops_logistic_remark", "logisticRemark")}
                />
              </div>
            </div>
          </section>

          {/* Related (Phase 2 placeholders) */}
          <section>
            <div className="text-[10px] uppercase tracking-wider text-base-500 font-semibold mb-2">
              🔗 Related
            </div>
            <div className="card p-3 text-[12px] text-base-500">
              Service Notes (0) · Issues (0) · Returns (0) ·{" "}
              <span className="italic">cross-module links arrive in Phase 2</span>
            </div>
          </section>

          {/* Timeline */}
          <section>
            <div className="text-[10px] uppercase tracking-wider text-base-500 font-semibold mb-2">
              📜 Timeline
            </div>
            <div className="card p-3 text-[12px] text-base-700 space-y-1">
              <div>
                <span className="text-base-500">First imported:</span>{" "}
                {new Date(order.first_imported_at).toLocaleString()}
              </div>
              <div>
                <span className="text-base-500">Last imported:</span>{" "}
                {new Date(order.last_imported_at).toLocaleString()}
              </div>
            </div>
          </section>
        </div>
      </aside>
    </>
  );
}
