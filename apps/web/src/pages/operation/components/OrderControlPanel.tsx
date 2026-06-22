import { type ReactNode, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  computeStorageFee,
  DELIVERY_TIME_SLOTS,
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

/**
 * Order-control form pieces — the editable "Master Sheet, live" overlay
 * (P2 of project-orders-control-spec; migration 0159), split into per-category
 * field groups so the order drawer can place each one in its OWN section (P5
 * drawer redesign): stock → Items & stock · time slot → Delivery · payment →
 * Payment · remarks → Notes. ONE shared draft (useOrderControlForm) + ONE Save
 * covers every ops_order_control field no matter which section renders it, so
 * splitting the UI doesn't fragment the save.
 *
 * Routing (logistic + delivery date) writes straight to `orders` via its own
 * mutations (RoutingFields), independent of the draft, and is only inline-
 * editable on status='place' orders (the AutoCount bulk); past Place the formal
 * dispatch flow owns them, so they render read-only.
 */

interface Draft {
  stock_location: string[];
  stock_eta: string;
  delivery_time_slot: string;
  customer_request: string;
  action_for_logistic: string;
  carres_remark: string;
  warehouse_remark: string;
  payment_status: string;
  storage_from: string;
  storage_fee_override: string;
  balance: string;
}

const EMPTY: Draft = {
  stock_location: [],
  stock_eta: "",
  delivery_time_slot: "",
  customer_request: "",
  action_for_logistic: "",
  carres_remark: "",
  warehouse_remark: "",
  payment_status: "",
  storage_from: "",
  storage_fee_override: "",
  balance: "",
};

const RM = (n: number) => `RM ${Math.round(Number(n) || 0).toLocaleString()}`;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Editable control inside a grid cell — a visible bordered box so the operator
 *  can tell at a glance the cell is editable (Jess: every cell should look
 *  editable). Selects keep their native arrow. */
const CELL =
  "w-full border border-base-300 rounded-[3px] bg-white px-2 py-1 text-[12px] text-base-900 outline-none hover:border-base-400 focus:border-primary focus:ring-1 focus:ring-primary/20";

/** One spreadsheet row — label cell + value/control cell, fully bordered.
 *  Field groups render FieldRows; the panel wraps them in a FieldGrid so every
 *  panel reads as one consistent Master-Sheet grid (Jess). */
export function FieldRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[110px_1fr] border-b border-base-200 last:border-b-0">
      <div className="bg-base-50 text-base-700 text-[10px] font-semibold uppercase tracking-[0.04em] px-2 py-1.5 border-r border-base-200">
        {label}
      </div>
      <div className="min-w-0 flex items-center">{children}</div>
    </div>
  );
}

/** Bordered wrapper turning a set of FieldRows into one grid block. */
export function FieldGrid({ children }: { children: ReactNode }) {
  return (
    <div className="border border-base-200 rounded-[3px] overflow-hidden">
      {children}
    </div>
  );
}

/** Shared ops_order_control form state — call ONCE in the drawer, then hand the
 *  returned `form` to each per-category field group. One draft, one Save. */
export interface OrderControlForm {
  draft: Draft;
  set: <K extends keyof Draft>(k: K, v: Draft[K]) => void;
  toggleLoc: (loc: string) => void;
  dirty: boolean;
  isLoading: boolean;
  saving: boolean;
  submit: () => void;
  reset: () => void;
  /** Count of filled remark fields — drives the Notes section summary. */
  remarkCount: number;
  /** Storage-fee inputs from the control overlay (migration 0165). */
  storageFrom: string | null;
  storageOverride: number | null;
}

export function useOrderControlForm(orderId: string): OrderControlForm {
  const { data, isLoading } = useOrderControl(orderId);
  const save = useSaveOrderControl(orderId, {
    onSuccess: () => toast.success("Control fields saved"),
    onError: (e) => toast.error(`Couldn't save — ${e.message}`),
  });

  const loaded: Draft = useMemo(() => {
    const c = data?.control;
    if (!c) return EMPTY;
    return {
      stock_location: c.stock_location ?? [],
      stock_eta: c.stock_eta ?? "",
      delivery_time_slot: c.delivery_time_slot ?? "",
      customer_request: c.customer_request ?? "",
      action_for_logistic: c.action_for_logistic ?? "",
      carres_remark: c.carres_remark ?? "",
      warehouse_remark: c.warehouse_remark ?? "",
      payment_status: c.payment_status ?? "",
      storage_from: c.storage_from ?? "",
      storage_fee_override:
        c.storage_fee_override != null ? String(c.storage_fee_override) : "",
      balance: c.balance != null ? String(c.balance) : "",
    };
  }, [data]);

  const [draft, setDraft] = useState<Draft>(EMPTY);
  useEffect(() => setDraft(loaded), [loaded]);

  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(loaded),
    [draft, loaded],
  );

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
      delivery_time_slot: draft.delivery_time_slot.trim() || null,
      customer_request: draft.customer_request.trim() || null,
      action_for_logistic: draft.action_for_logistic.trim() || null,
      carres_remark: draft.carres_remark.trim() || null,
      warehouse_remark: draft.warehouse_remark.trim() || null,
      payment_status: draft.payment_status.trim() || null,
      storage_from: draft.storage_from.trim() ? draft.storage_from.trim() : null,
      storage_fee_override: draft.storage_fee_override.trim()
        ? Number(draft.storage_fee_override)
        : null,
      balance: draft.balance.trim() ? Number(draft.balance) : null,
    };
    save.mutate(payload);
  }

  const remarkCount = [
    draft.customer_request,
    draft.action_for_logistic,
    draft.carres_remark,
    draft.warehouse_remark,
  ].filter((v) => v.trim()).length;

  return {
    draft,
    set,
    toggleLoc,
    dirty,
    isLoading,
    saving: save.isPending,
    submit,
    reset: () => setDraft(loaded),
    remarkCount,
    storageFrom: draft.storage_from.trim() ? draft.storage_from : null,
    storageOverride: draft.storage_fee_override.trim()
      ? Number(draft.storage_fee_override)
      : null,
  };
}

/** Stock location chips + stock ETA → the Items & stock section. */
export function StockControlFields({ form }: { form: OrderControlForm }) {
  const { draft, toggleLoc, set } = form;
  return (
    <>
      <FieldRow label="Stock location">
        <div className="flex flex-wrap gap-1 px-2 py-1.5">
          {STOCK_LOCATIONS.map((loc) => {
            const on = draft.stock_location.includes(loc);
            return (
              <button
                key={loc}
                type="button"
                onClick={() => toggleLoc(loc)}
                aria-pressed={on}
                className={`text-[11px] px-2 py-0.5 rounded border ${
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
      </FieldRow>
      <FieldRow label="Stock ETA">
        <input
          type="date"
          value={draft.stock_eta}
          onChange={(e) => set("stock_eta", e.target.value)}
          className={CELL}
        />
      </FieldRow>
    </>
  );
}

/** Region + logistic select + delivery date → the Delivery grid. Writes
 *  straight to `orders` (own mutations). Always editable so the operator can
 *  fix or (re)assign the carrier / date at any stage (Jess: every cell edits). */
export function RoutingFields({
  orderId: _orderId,
  customerAddress,
  deliveryDate,
  opsAssignedLogistic,
}: {
  orderId: string;
  customerAddress: string | null;
  deliveryDate: string | null;
  opsAssignedLogistic: string | null;
}) {
  const { data: partnersData } = useDeliveryPartners();
  const partners = useMemo(
    () =>
      [...(partnersData?.partners ?? [])].sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    [partnersData],
  );
  const setLogistic = useSetOpsAssignedLogistic(_orderId, {
    onSuccess: () => toast.success("Logistic updated"),
    onError: (e) => toast.error(`Couldn't set logistic — ${e.message}`),
  });
  const setDate = useOperationSetDeliveryDate(_orderId, {
    onSuccess: () => toast.success("Delivery date updated"),
    onError: (e) => toast.error(`Couldn't set date — ${e.message}`),
  });

  const area = areaForAddress(customerAddress);
  const suggestion = suggestCarrier(customerAddress);
  const suggestedPartner = suggestion
    ? partners.find((p) => p.name === suggestion.partner)
    : undefined;

  return (
    <>
      <FieldRow label="Region">
        <div className="px-2 py-1.5">
          <AreaBadge area={area} />
        </div>
      </FieldRow>

      <FieldRow label="Logistic">
        <div className="flex items-center gap-2 flex-wrap w-full px-1">
          <select
            value={opsAssignedLogistic ?? ""}
            disabled={setLogistic.isPending}
            onChange={(e) =>
              setLogistic.mutate({ deliveryPartnerId: e.target.value || null })
            }
            className={`${CELL} flex-1 min-w-[110px] disabled:opacity-50`}
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
              className="text-[11px] px-2 py-0.5 rounded border border-primary text-primary font-medium hover:bg-primary/5 disabled:opacity-50 whitespace-nowrap"
            >
              Apply {suggestedPartner.name}
            </button>
          )}
        </div>
      </FieldRow>

      <FieldRow label="Deadline">
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
          className={CELL}
        />
      </FieldRow>
    </>
  );
}

/** Delivery time slot → the Delivery section. */
export function DeliveryTimeSlotField({ form }: { form: OrderControlForm }) {
  const { draft, set } = form;
  return (
    <FieldRow label="Time slot">
      <select
        value={draft.delivery_time_slot}
        onChange={(e) => set("delivery_time_slot", e.target.value)}
        className={CELL}
      >
        <option value="">—</option>
        {DELIVERY_TIME_SLOTS.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    </FieldRow>
  );
}

/** Read-only money summary + manual follow-up status → the Payment section. */
export function PaymentControlFields({
  form,
  paid,
  total,
}: {
  form: OrderControlForm;
  paid: number;
  total: number;
}) {
  const { draft, set } = form;
  // Bill = operator-keyed invoice / owing amount (balance); falls back to the
  // computed line total for native orders. Outstanding = Bill − Paid.
  const bill = draft.balance.trim() ? Number(draft.balance) : total;
  const hasBill = bill > 0;
  const outstanding = Math.max(0, bill - paid);
  const settled = hasBill && outstanding <= 0;
  return (
    <div data-testid="payment-summary">
      <FieldRow label="Bill">
        <input
          type="number"
          min={0}
          value={draft.balance}
          onChange={(e) => set("balance", e.target.value)}
          placeholder={total > 0 ? `${total} (from items)` : "key invoice total"}
          className={CELL}
        />
      </FieldRow>
      <FieldRow label="Paid">
        <div className="px-2 py-1.5 font-mono text-[12px] font-semibold text-base-900">
          {RM(paid)}
        </div>
      </FieldRow>
      <FieldRow label="Outstanding">
        <div
          className={`px-2 py-1.5 font-mono text-[12px] font-semibold ${
            !hasBill ? "text-base-400" : settled ? "text-success" : "text-primary"
          }`}
        >
          {!hasBill ? "—" : settled ? "Settled" : RM(outstanding)}
        </div>
      </FieldRow>
      <FieldRow label="Pay status">
        <select
          value={draft.payment_status}
          onChange={(e) => set("payment_status", e.target.value)}
          aria-label="Payment follow-up status"
          className={CELL}
        >
          <option value="">—</option>
          {PAYMENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </FieldRow>
    </div>
  );
}

/** Storage block → the RIGHT column of the Payment panel (Jess): accrues from
 *  the ETA per the locked rule; leave the fee blank for the auto amount
 *  (shown as the placeholder) or key a number to override. */
export function StorageControlFields({
  form,
  hasMsbf = false,
  hasSof = false,
}: {
  form: OrderControlForm;
  hasMsbf?: boolean;
  hasSof?: boolean;
}) {
  const { draft, set } = form;
  const today = new Date().toISOString().slice(0, 10);
  const storage = computeStorageFee({
    startDate: form.storageFrom,
    asOf: today,
    hasMsbf,
    hasSof,
  });
  const incurred = draft.storage_from.trim() !== "";
  return (
    <>
      <FieldRow label="Storage?">
        <select
          value={incurred ? "yes" : "no"}
          onChange={(e) => {
            if (e.target.value === "yes") {
              if (!draft.storage_from.trim()) set("storage_from", today);
            } else {
              set("storage_from", "");
              set("storage_fee_override", "");
            }
          }}
          className={CELL}
        >
          <option value="no">No</option>
          <option value="yes">Yes — incurred</option>
        </select>
      </FieldRow>
      {incurred && (
        <>
          <FieldRow label="From">
            <input
              type="date"
              value={draft.storage_from}
              onChange={(e) => set("storage_from", e.target.value)}
              className={CELL}
            />
          </FieldRow>
          <FieldRow label="Fee">
            <input
              type="number"
              min={0}
              value={draft.storage_fee_override}
              onChange={(e) => set("storage_fee_override", e.target.value)}
              placeholder={storage.total > 0 ? `auto ${storage.total}` : "auto"}
              className={CELL}
            />
          </FieldRow>
          <FieldRow label="Rate">
            <div className="px-2 py-1.5 text-[11px] text-base-500">
              MS/BF RM150/mo · Sofa RM200/2wk
            </div>
          </FieldRow>
        </>
      )}
    </>
  );
}

/** The four free-text remark fields → the Notes & actions section. */
export function RemarkControlFields({ form }: { form: OrderControlForm }) {
  const { draft, set } = form;
  return (
    <div className="space-y-2.5">
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
    </div>
  );
}

/** A single remark field, placed in its own related panel (P5 v3): customer
 *  request → Order · action for logistic → Delivery · warehouse remark →
 *  Items & stock. All share the one form draft + one Save. */
export function RemarkControlField({
  form,
  field,
  label,
  placeholder,
}: {
  form: OrderControlForm;
  field:
    | "customer_request"
    | "action_for_logistic"
    | "carres_remark"
    | "warehouse_remark";
  label: string;
  placeholder?: string;
}) {
  return (
    <FieldRow label={label}>
      <textarea
        rows={2}
        value={form.draft[field]}
        onChange={(e) => form.set(field, e.target.value)}
        placeholder={placeholder}
        className={CELL + " resize-y block py-1"}
      />
    </FieldRow>
  );
}

/** Reset + Save for the shared control draft → lives in the pinned action bar.
 *  Renders nothing when the draft is clean so the bar stays quiet. */
export function OrderControlSaveBar({ form }: { form: OrderControlForm }) {
  if (!form.dirty) return null;
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        className="text-[11px] text-base-500 hover:text-base-700"
        onClick={form.reset}
        disabled={form.saving}
      >
        Reset
      </button>
      <button
        type="button"
        className="btn-primary text-[12px] disabled:opacity-50"
        onClick={form.submit}
        disabled={form.saving}
      >
        {form.saving ? "Saving…" : "Save changes"}
      </button>
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
      className={`inline-block text-[9px] font-bold uppercase tracking-[0.04em] py-[3px] px-[7px] border rounded-[3px] ${tone}`}
    >
      {area === "KV"
        ? "Klang Valley"
        : area === "Outstation"
          ? "Outstation"
          : "Area —"}
    </span>
  );
}

/** Read-only money summary: Total / Paid / Outstanding. Outstanding is the
 *  customer-owe-HQ figure — terracotta while owing, green "Settled" once the
 *  paid amount covers the total. Derived from real order data, never edited.
 *
 *  Many AutoCount-imported orders carry a `paid` deposit but no line prices
 *  (total = 0), so we can't compute a real outstanding. In that case show "—"
 *  for Total + Outstanding rather than a misleading "Settled" — the operator
 *  falls back to the manual Follow-up status below. */
export function PaymentSummary({ paid, total }: { paid: number; total: number }) {
  const hasTotal = total > 0;
  const outstanding = Math.max(0, total - paid);
  const settled = hasTotal && outstanding <= 0;
  const rows: { label: string; value: string; tone: string }[] = [
    { label: "Total", value: hasTotal ? RM(total) : "—", tone: "text-base-900" },
    { label: "Paid", value: RM(paid), tone: "text-base-900" },
    {
      label: "Outstanding",
      value: !hasTotal ? "—" : settled ? "Settled" : RM(outstanding),
      tone: !hasTotal
        ? "text-base-400"
        : settled
          ? "text-success"
          : "text-primary",
    },
  ];
  return (
    <div data-testid="payment-summary">
      {rows.map((r) => (
        <div
          key={r.label}
          className="flex items-baseline justify-between gap-3 py-1 border-b border-base-100 last:border-0"
        >
          <span className="text-[10px] uppercase tracking-[0.04em] text-base-500">
            {r.label}
          </span>
          <span className={`font-mono text-[12px] font-semibold ${r.tone}`}>
            {r.value}
          </span>
        </div>
      ))}
    </div>
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
      <div className="label mb-1">{label}</div>
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
