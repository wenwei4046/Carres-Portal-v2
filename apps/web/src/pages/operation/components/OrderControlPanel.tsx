import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  PAYMENT_STATUSES,
  STOCK_LOCATIONS,
  type UpdateOpsOrderControlInput,
} from "@carres/shared";
import {
  useDeliveryPartners,
  useOperationSetDeliveryDate,
  useOrderControl,
  useSaveOrderControl,
  useSetOpsAssignedLogistic,
} from "@/lib/queries";
import { areaForAddress, suggestCarrier } from "@/lib/region";
import { fmtDate } from "@/lib/fmt-date";

/**
 * OrderControlPanel — the editable "Master Sheet, live" section of the order
 * drawer (P2 of project-orders-control-spec; migration 0159).
 *
 * Three blocks:
 *   1. Routing & schedule — AREA (KV/Outstation) + region-suggested carrier
 *      (apps/web/src/lib/region.ts), plus inline-edit of the planned logistic
 *      (orders.ops_assigned_logistic) and the delivery date. Both write to
 *      `orders` and are only editable on status='place' orders (the AutoCount
 *      bulk); past Place the formal dispatch flow owns them, so they render
 *      read-only.
 *   2. The editable ops_order_control overlay: stock location(s) + ETA, four
 *      remark fields, payment-follow-up status. One Save upserts the set.
 *
 * Next slices: [+ Service Note / Refund / Issue] shortcuts + Raise PO.
 */

interface Props {
  orderId: string;
  customerAddress: string | null;
  /** orders.status — gates whether routing/date are inline-editable here. */
  status: string;
  deliveryDate: string | null;
  deliveryDateTbd: boolean;
  /** orders.ops_assigned_logistic — the planned carrier (status='place'). */
  opsAssignedLogistic: string | null;
  /** orders.delivery_partner_id — the formal LP (post-dispatch); shown
   *  read-only when the order is past Place. */
  deliveryPartnerId?: string | null;
}

interface Draft {
  stock_location: string[];
  stock_eta: string;
  customer_request: string;
  action_for_logistic: string;
  carres_remark: string;
  warehouse_remark: string;
  payment_status: string;
}

const EMPTY: Draft = {
  stock_location: [],
  stock_eta: "",
  customer_request: "",
  action_for_logistic: "",
  carres_remark: "",
  warehouse_remark: "",
  payment_status: "",
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export default function OrderControlPanel({
  orderId,
  customerAddress,
  status,
  deliveryDate,
  deliveryDateTbd,
  opsAssignedLogistic,
  deliveryPartnerId,
}: Props) {
  const { data, isLoading } = useOrderControl(orderId);
  const { data: partnersData } = useDeliveryPartners();
  const partners = useMemo(
    () =>
      [...(partnersData?.partners ?? [])].sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    [partnersData],
  );

  const save = useSaveOrderControl(orderId, {
    onSuccess: () => toast.success("Control fields saved"),
    onError: (e) => toast.error(`Couldn't save — ${e.message}`),
  });
  const setLogistic = useSetOpsAssignedLogistic(orderId, {
    onSuccess: () => toast.success("Logistic updated"),
    onError: (e) => toast.error(`Couldn't set logistic — ${e.message}`),
  });
  const setDate = useOperationSetDeliveryDate(orderId, {
    onSuccess: () => toast.success("Delivery date updated"),
    onError: (e) => toast.error(`Couldn't set date — ${e.message}`),
  });

  const loaded: Draft = useMemo(() => {
    const c = data?.control;
    if (!c) return EMPTY;
    return {
      stock_location: c.stock_location ?? [],
      stock_eta: c.stock_eta ?? "",
      customer_request: c.customer_request ?? "",
      action_for_logistic: c.action_for_logistic ?? "",
      carres_remark: c.carres_remark ?? "",
      warehouse_remark: c.warehouse_remark ?? "",
      payment_status: c.payment_status ?? "",
    };
  }, [data]);

  const [draft, setDraft] = useState<Draft>(EMPTY);
  useEffect(() => setDraft(loaded), [loaded]);

  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(loaded),
    [draft, loaded],
  );

  const area = areaForAddress(customerAddress);
  const suggestion = suggestCarrier(customerAddress);
  const suggestedPartner = suggestion
    ? partners.find((p) => p.name === suggestion.partner)
    : undefined;
  const editableRouting = status === "place";
  const assignedName =
    partners.find((p) => p.id === deliveryPartnerId)?.name ?? null;
  const plannedName =
    partners.find((p) => p.id === opsAssignedLogistic)?.name ?? null;

  function set<K extends keyof Draft>(k: K, v: Draft[K]) {
    setDraft((d) => ({ ...d, [k]: v }));
  }
  function toggleLoc(loc: string) {
    setDraft((d) => ({
      ...d,
      stock_location: d.stock_location.includes(loc)
        ? d.stock_location.filter((l) => l !== loc)
        : [...d.stock_location, loc],
    }));
  }

  function submit() {
    const payload: UpdateOpsOrderControlInput = {
      stock_location: draft.stock_location,
      stock_eta: draft.stock_eta.trim() ? draft.stock_eta.trim() : null,
      customer_request: draft.customer_request.trim() || null,
      action_for_logistic: draft.action_for_logistic.trim() || null,
      carres_remark: draft.carres_remark.trim() || null,
      warehouse_remark: draft.warehouse_remark.trim() || null,
      payment_status: draft.payment_status.trim() || null,
    };
    save.mutate(payload);
  }

  return (
    <div data-testid="order-control-panel">
      {/* Routing & schedule */}
      <div className="bg-white border border-base-200 rounded-[4px] p-3.5 mb-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <AreaBadge area={area} />
          {suggestion ? (
            <span className="text-[12px] text-base-700">
              Suggested carrier{" "}
              <span className="font-semibold text-base-900">
                {suggestion.partner}
              </span>
              {suggestion.alt ? (
                <span className="text-base-500"> / {suggestion.alt}</span>
              ) : null}
              <span className="text-base-400"> · {suggestion.region}</span>
            </span>
          ) : (
            <span className="text-[12px] text-base-500">
              No carrier suggestion — address region unclear
            </span>
          )}
        </div>

        {/* Logistic */}
        <div>
          <div className="label mb-1.5">Logistic</div>
          {editableRouting ? (
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={opsAssignedLogistic ?? ""}
                disabled={setLogistic.isPending}
                onChange={(e) =>
                  setLogistic.mutate({
                    deliveryPartnerId: e.target.value || null,
                  })
                }
                className="flex-1 min-w-[140px] px-2 py-1.5 border border-base-200 rounded text-[12px] bg-white outline-none focus:border-base-700 disabled:bg-base-100"
              >
                <option value="">— pick carrier —</option>
                {partners.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.zones ? ` · ${p.zones}` : ""}
                  </option>
                ))}
              </select>
              {!opsAssignedLogistic && suggestedPartner && (
                <button
                  type="button"
                  disabled={setLogistic.isPending}
                  onClick={() =>
                    setLogistic.mutate({ deliveryPartnerId: suggestedPartner.id })
                  }
                  className="text-[11px] px-2 py-1.5 rounded border border-primary text-primary font-medium hover:bg-primary/5 disabled:opacity-50 whitespace-nowrap"
                >
                  Apply {suggestedPartner.name}
                </button>
              )}
            </div>
          ) : (
            <div className="text-[13px] text-base-900">
              {assignedName ?? plannedName ?? (
                <span className="text-base-400">—</span>
              )}
              <span className="text-[11px] text-base-500 ml-2">
                (managed in the dispatch flow)
              </span>
            </div>
          )}
        </div>

        {/* Delivery date */}
        <div>
          <div className="label mb-1.5">Delivery date</div>
          {editableRouting ? (
            <input
              type="date"
              defaultValue={deliveryDate ?? ""}
              disabled={setDate.isPending}
              onChange={(e) => {
                const v = e.target.value;
                if (ISO_DATE.test(v) && v !== deliveryDate) {
                  setDate.mutate({ date: v });
                }
              }}
              className="w-full px-2 py-1.5 border border-base-200 rounded text-[12px] bg-white outline-none focus:border-base-700 disabled:bg-base-100"
            />
          ) : (
            <div className="text-[13px] text-base-900">
              {deliveryDateTbd ? (
                <span className="text-warning">TBD</span>
              ) : deliveryDate ? (
                fmtDate(deliveryDate)
              ) : (
                <span className="text-base-400">—</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Editable ops_order_control overlay */}
      {isLoading ? (
        <div className="h-40 bg-base-50 border border-base-100 rounded-[4px] animate-pulse" />
      ) : (
        <div className="bg-white border border-base-200 rounded-[4px] p-3.5 space-y-3.5">
          {/* Stock location (multi) */}
          <div>
            <div className="label mb-1.5">Stock location</div>
            <div className="flex flex-wrap gap-1.5">
              {STOCK_LOCATIONS.map((loc) => {
                const on = draft.stock_location.includes(loc);
                return (
                  <button
                    key={loc}
                    type="button"
                    onClick={() => toggleLoc(loc)}
                    aria-pressed={on}
                    className={`text-[11px] px-2 py-1 rounded border ${
                      on
                        ? "bg-primary/10 border-primary text-primary font-medium"
                        : "bg-white border-base-200 text-base-600 hover:border-base-400"
                    }`}
                  >
                    {loc}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Stock ETA + payment status */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="label mb-1.5">Stock ETA</div>
              <input
                type="date"
                value={draft.stock_eta}
                onChange={(e) => set("stock_eta", e.target.value)}
                className="w-full px-2 py-1.5 border border-base-200 rounded text-[12px] bg-white outline-none focus:border-base-700"
              />
            </div>
            <div>
              <div className="label mb-1.5">Payment status</div>
              <select
                value={draft.payment_status}
                onChange={(e) => set("payment_status", e.target.value)}
                className="w-full px-2 py-1.5 border border-base-200 rounded text-[12px] bg-white outline-none focus:border-base-700"
              >
                <option value="">—</option>
                {PAYMENT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Four remark fields */}
          <RemarkField
            label="Customer request"
            value={draft.customer_request}
            onChange={(v) => set("customer_request", v)}
            placeholder="e.g. postponed to end of May"
          />
          <RemarkField
            label="Action for logistic"
            value={draft.action_for_logistic}
            onChange={(v) => set("action_for_logistic", v)}
            placeholder="e.g. call customer before delivery"
          />
          <RemarkField
            label="Carres remark"
            value={draft.carres_remark}
            onChange={(v) => set("carres_remark", v)}
            placeholder="Internal note"
          />
          <RemarkField
            label="Warehouse remark"
            value={draft.warehouse_remark}
            onChange={(v) => set("warehouse_remark", v)}
            placeholder="Note for the warehouse team"
          />

          <div className="flex items-center justify-end gap-2 pt-1">
            {dirty && (
              <button
                type="button"
                className="text-[11px] text-base-500 hover:text-base-700"
                onClick={() => setDraft(loaded)}
                disabled={save.isPending}
              >
                Reset
              </button>
            )}
            <button
              type="button"
              className="btn-primary text-[12px] disabled:opacity-50"
              onClick={submit}
              disabled={!dirty || save.isPending}
            >
              {save.isPending ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function AreaBadge({ area }: { area: "KV" | "Outstation" | "Unknown" }) {
  const tone =
    area === "KV"
      ? "text-success border-success"
      : area === "Outstation"
        ? "text-warning border-warning"
        : "text-base-400 border-base-200";
  return (
    <span
      className={`inline-block text-[9px] font-bold uppercase tracking-[0.12em] py-[3px] px-[7px] border rounded-[3px] ${tone}`}
    >
      {area === "Unknown" ? "Area —" : area}
    </span>
  );
}

function RemarkField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <div className="label mb-1.5">{label}</div>
      <textarea
        rows={2}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-2 py-1.5 border border-base-200 rounded text-[12px] bg-white outline-none focus:border-base-700 resize-y"
      />
    </div>
  );
}
