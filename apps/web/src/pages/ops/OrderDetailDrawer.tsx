import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";

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

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] uppercase tracking-[0.14em] text-base-900 font-bold border-b border-base-200 pb-1.5 mb-2.5">
      {children}
    </div>
  );
}

function Field({
  label,
  children,
  width = "full",
}: {
  label: string;
  children: React.ReactNode;
  width?: "full" | "half";
}) {
  return (
    <div className={width === "half" ? "" : "mb-2"}>
      <label className="block text-[9.5px] uppercase tracking-wider text-base-500 font-semibold mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}

export default function OrderDetailDrawer({ order, onClose }: Props) {
  const qc = useQueryClient();
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
    if (current === next) return;
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
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} aria-label="Close detail" />
      <aside
        className="fixed top-0 right-0 h-screen bg-white shadow-2xl z-50 overflow-y-auto"
        style={{ width: "min(620px, 92vw)" }}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-base-200 px-5 py-3.5 z-10">
          <div className="flex items-start justify-between gap-3 mb-1.5">
            <div className="min-w-0">
              <div className="font-mono text-[12.5px] font-bold text-primary tracking-wide">
                {order.ref}
              </div>
              <div className="text-[15px] font-semibold text-base-900 truncate leading-tight mt-0.5">
                {order.customer_name}
              </div>
              <div className="text-[11px] text-base-500 mt-0.5">
                {order.customer_phone && <span>{order.customer_phone}</span>}
                {order.customer_phone && order.delivery_location && (
                  <span className="text-base-300"> · </span>
                )}
                {order.delivery_location && <span>{order.delivery_location}</span>}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-base-400 hover:text-base-700 text-[18px] leading-none px-1"
              aria-label="Close"
            >
              ×
            </button>
          </div>
          <div className="flex items-center gap-2 text-[10.5px]">
            <span
              className="font-bold uppercase rounded-sm inline-block"
              style={{
                fontSize: 9,
                letterSpacing: "0.12em",
                padding: "2px 6px",
                color: "#FFFFFF",
                background: order.ops_status === "inbox" ? "#C84F1D" : "#555",
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

        <div className="px-5 py-4 space-y-5">
          {/* ITEMS */}
          <section>
            <SectionHeader>
              Items · {order.items?.length ?? 0} line(s) · {order.total_qty} pcs
            </SectionHeader>
            <div className="border border-base-200 rounded">
              {(order.items ?? []).map((it, i) => (
                <div
                  key={i}
                  className="px-3 py-2 border-b border-base-100 last:border-b-0 text-[12px]"
                >
                  <div
                    className="grid gap-2 items-baseline"
                    style={{ gridTemplateColumns: "70px 32px 1fr" }}
                  >
                    <div className="text-[10.5px] uppercase tracking-wider text-base-500 font-semibold">
                      {it.itemGroup ?? "—"}
                    </div>
                    <div className="text-right font-mono text-base-700">×{it.qty}</div>
                    <div className="text-base-900">{it.description ?? "—"}</div>
                  </div>
                  {it.poDocNo && (
                    <div
                      className="mt-0.5 grid gap-2"
                      style={{ gridTemplateColumns: "70px 32px 1fr" }}
                    >
                      <div></div>
                      <div></div>
                      <div className="text-[10.5px] font-mono text-base-500 break-all">
                        PO: {it.poDocNo}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* DELIVERY */}
          <section>
            <SectionHeader>Delivery</SectionHeader>
            <div className="border border-base-200 rounded p-3">
              <div className="grid grid-cols-2 gap-3 mb-3">
                <Field label="Date requested" width="half">
                  <div className="text-[12px] text-base-900">
                    {order.delivery_date_requested ?? "—"}
                  </div>
                </Field>
                <Field label="Time slot" width="half">
                  <input
                    type="text"
                    placeholder="e.g. 2-4pm / TBC"
                    className="input w-full text-[12px] px-2 py-1"
                    value={draft.ops_delivery_time_slot}
                    onChange={(e) =>
                      setDraft({ ...draft, ops_delivery_time_slot: e.target.value })
                    }
                    onBlur={() => saveField("ops_delivery_time_slot", "deliveryTimeSlot")}
                  />
                </Field>
              </div>
              <Field label="Address">
                <div className="text-[12px] text-base-900 whitespace-pre-line leading-snug">
                  {addressLines.length > 0 ? addressLines.join("\n") : "—"}
                </div>
              </Field>
            </div>
          </section>

          {/* OPS NOTES */}
          <section>
            <SectionHeader>
              Ops Notes <span className="text-base-400 normal-case font-normal">· auto-saves</span>
            </SectionHeader>
            <div className="space-y-2.5">
              <Field label="Customer request">
                <textarea
                  rows={2}
                  placeholder='deliver weekday 2-4pm / call before arriving'
                  className="input w-full text-[12px] px-2 py-1.5 leading-snug"
                  value={draft.ops_customer_request}
                  onChange={(e) => setDraft({ ...draft, ops_customer_request: e.target.value })}
                  onBlur={() => saveField("ops_customer_request", "customerRequest")}
                />
              </Field>
              <Field label="Carres remark (internal)">
                <textarea
                  rows={2}
                  placeholder="internal note for team"
                  className="input w-full text-[12px] px-2 py-1.5 leading-snug"
                  value={draft.ops_carres_remark}
                  onChange={(e) => setDraft({ ...draft, ops_carres_remark: e.target.value })}
                  onBlur={() => saveField("ops_carres_remark", "carresRemark")}
                />
              </Field>
              <Field label="Action for logistic">
                <textarea
                  rows={2}
                  placeholder='call before arriving / deliver with sofa together'
                  className="input w-full text-[12px] px-2 py-1.5 leading-snug"
                  value={draft.ops_action_for_logistic}
                  onChange={(e) =>
                    setDraft({ ...draft, ops_action_for_logistic: e.target.value })
                  }
                  onBlur={() => saveField("ops_action_for_logistic", "actionForLogistic")}
                />
              </Field>
            </div>
          </section>

          {/* LOGISTIC */}
          <section>
            <SectionHeader>Logistic Assignment</SectionHeader>
            <div className="border border-base-200 rounded p-3">
              <div className="grid grid-cols-2 gap-3 mb-3">
                <Field label="AutoCount source" width="half">
                  <div className="text-[12px] text-base-600 italic">
                    {order.import_source_logistic ?? "—"}
                  </div>
                </Field>
                <Field label="Ops final" width="half">
                  <div className="flex gap-1.5">
                    <select
                      className="input flex-1 text-[12px] px-2 py-1"
                      value={draft.ops_assigned_logistic}
                      onChange={(e) =>
                        setDraft({ ...draft, ops_assigned_logistic: e.target.value })
                      }
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
                      className="btn-primary text-[10.5px] px-2.5 py-1"
                      disabled={
                        !draft.ops_assigned_logistic ||
                        draft.ops_assigned_logistic === order.ops_assigned_logistic ||
                        assignMut.isPending
                      }
                      onClick={() => assignMut.mutate({ logistic: draft.ops_assigned_logistic })}
                    >
                      Save
                    </button>
                  </div>
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <Field label="Logistic ETA" width="half">
                  <input
                    type="date"
                    className="input w-full text-[12px] px-2 py-1"
                    value={draft.ops_logistic_eta}
                    onChange={(e) => setDraft({ ...draft, ops_logistic_eta: e.target.value })}
                    onBlur={() => saveField("ops_logistic_eta", "logisticEta")}
                  />
                </Field>
                <Field label="Status" width="half">
                  <div className="flex gap-1.5">
                    <select
                      className="input flex-1 text-[12px] px-2 py-1"
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
                      className="btn-primary text-[10.5px] px-2.5 py-1"
                      disabled={draft.ops_status === order.ops_status || statusMut.isPending}
                      onClick={() => statusMut.mutate({ status: draft.ops_status })}
                    >
                      Save
                    </button>
                  </div>
                </Field>
              </div>
              <Field label="Logistic remark">
                <textarea
                  rows={2}
                  placeholder='what the logistic partner told us'
                  className="input w-full text-[12px] px-2 py-1.5 leading-snug"
                  value={draft.ops_logistic_remark}
                  onChange={(e) => setDraft({ ...draft, ops_logistic_remark: e.target.value })}
                  onBlur={() => saveField("ops_logistic_remark", "logisticRemark")}
                />
              </Field>
            </div>
          </section>

          {/* RELATED */}
          <section>
            <SectionHeader>Related</SectionHeader>
            <div className="border border-base-200 rounded p-3 text-[11.5px] text-base-500">
              Service Notes (0) · Issues (0) · Returns (0)
              <span className="block text-[10.5px] text-base-400 italic mt-1">
                cross-module links arrive in Phase 2
              </span>
            </div>
          </section>

          {/* TIMELINE */}
          <section>
            <SectionHeader>Timeline</SectionHeader>
            <div className="border border-base-200 rounded p-3 text-[11.5px] text-base-700 space-y-1">
              <div>
                <span className="text-base-500">First imported</span>{" "}
                <span className="font-mono">{new Date(order.first_imported_at).toLocaleString()}</span>
              </div>
              <div>
                <span className="text-base-500">Last imported</span>{" "}
                <span className="font-mono">{new Date(order.last_imported_at).toLocaleString()}</span>
              </div>
            </div>
          </section>
        </div>
      </aside>
    </>
  );
}
