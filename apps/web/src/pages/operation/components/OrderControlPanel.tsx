import { type ReactNode, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Plus, Trash2, ShieldCheck, Receipt } from "lucide-react";
import { toast } from "sonner";
import {
  computeStorageFee,
  DELIVERY_TIME_SLOTS,
  PAYMENT_STATUSES,
  PAYMENT_METHODS,
  PAYMENT_KINDS,
  STORAGE_EXTENSION_REASONS,
  summarizePayments,
  type StorageExtensionReason,
  type UpdateOpsOrderControlInput,
  type OpsOrderControl,
  type OrderPaymentRow,
  type OrderPaymentMethod,
  type PaymentKind,
} from "@carres/shared";
import {
  useDeliveryPartners,
  useOperationSetDeliveryDate,
  useOrderControl,
  useSaveOrderControl,
  useSetOpsAssignedLogistic,
  useOrderPayments,
  useRecordPayment,
  useVoidPayment,
  useCollectStorage,
  useRequestStorageWaiver,
  useDecideStorageWaiver,
  useExtendStorage,
} from "@/lib/queries";
import { useAuth } from "@/lib/auth";
import { renderReceiptPdf, renderExtensionAgreementPdf } from "@/lib/pdf/render";
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
  storage_to: string;
  storage_fee_override: string;
  balance: string;
  balance_due_date: string;
  contact_by_days: string;
  logistic_eta: string;
  paid_amount: string;
  storage_paid: string;
  line_locations: Record<string, string[]>;
  line_etas: Record<string, string>;
  called_customer: boolean;
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
  storage_to: "",
  storage_fee_override: "",
  balance: "",
  balance_due_date: "",
  contact_by_days: "",
  logistic_eta: "",
  paid_amount: "",
  storage_paid: "",
  line_locations: {},
  line_etas: {},
  called_customer: false,
};

const RM = (n: number) => `RM ${Math.round(Number(n) || 0).toLocaleString()}`;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Editable control inside a grid cell — a visible bordered box so the operator
 *  can tell at a glance the cell is editable (Jess: every cell should look
 *  editable). Selects keep their native arrow. */
// Read-first cell (Jess 4-col compact): looks like plain text, reveals a border
// on hover, becomes a full input on focus — "click any value to edit".
const CELL =
  "w-full border border-transparent rounded-[3px] bg-transparent px-1 py-0.5 text-[12px] text-base-900 outline-none hover:border-base-200 hover:bg-white focus:border-primary focus:bg-white focus:ring-1 focus:ring-primary/20 transition-colors";

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
    <div className="flex items-center justify-between gap-2 min-w-0 py-[3px] border-b border-base-100/70 last:border-b-0">
      <span className="text-[11px] text-base-400 shrink-0">{label}</span>
      <div className="min-w-0 flex-1 flex items-center justify-end text-right">
        {children}
      </div>
    </div>
  );
}

/** Compact wrapper for a set of FieldRows (Jess 4-col: no heavy border box —
 *  the fields read as plain label · value until clicked). */
export function FieldGrid({ children }: { children: ReactNode }) {
  return <div className="min-w-0">{children}</div>;
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
  /** Set the stock location(s) for one order line (per-SKU; migration 0168). */
  setLineLocation: (sku: string, locs: string[]) => void;
  /** Set the stock ETA for one order line (per-SKU; migration 0170 — products
   *  don't all arrive on the same date, Jess). */
  setLineEta: (sku: string, eta: string) => void;
  /** Storage-fee inputs from the control overlay (migration 0165). */
  storageFrom: string | null;
  storageOverride: number | null;
  /** Raw overlay row as loaded — carries the balance job's gate state
   *  (storage_collected_at / storage_waiver_*) the draft doesn't track
   *  (migration 0184). null until the row exists / loads. */
  control: OpsOrderControl | null;
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
      storage_to: c.storage_to ?? "",
      storage_fee_override:
        c.storage_fee_override != null ? String(c.storage_fee_override) : "",
      balance: c.balance != null ? String(c.balance) : "",
      balance_due_date: c.balance_due_date ?? "",
      contact_by_days: c.contact_by_days != null ? String(c.contact_by_days) : "",
      logistic_eta: c.logistic_eta ?? "",
      paid_amount: c.paid_amount != null ? String(c.paid_amount) : "",
      storage_paid: c.storage_paid ?? "",
      line_locations: c.line_locations ?? {},
      line_etas: c.line_etas ?? {},
      called_customer: c.called_customer ?? false,
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
      storage_to: draft.storage_to.trim() ? draft.storage_to.trim() : null,
      storage_fee_override: draft.storage_fee_override.trim()
        ? Number(draft.storage_fee_override)
        : null,
      balance: draft.balance.trim() ? Number(draft.balance) : null,
      balance_due_date: draft.balance_due_date.trim() ? draft.balance_due_date.trim() : null,
      contact_by_days: draft.contact_by_days.trim() ? Number(draft.contact_by_days) : null,
      logistic_eta: draft.logistic_eta.trim() ? draft.logistic_eta.trim() : null,
      paid_amount: draft.paid_amount.trim() ? Number(draft.paid_amount) : null,
      storage_paid: draft.storage_paid.trim() ? draft.storage_paid.trim() : null,
      line_locations:
        Object.keys(draft.line_locations).length > 0
          ? draft.line_locations
          : null,
      line_etas:
        Object.keys(draft.line_etas).length > 0 ? draft.line_etas : null,
      called_customer: draft.called_customer,
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
    setLineLocation: (sku, locs) =>
      setDraft((d) => ({
        ...d,
        line_locations: { ...d.line_locations, [sku]: locs },
      })),
    setLineEta: (sku, eta) =>
      setDraft((d) => ({
        ...d,
        line_etas: { ...d.line_etas, [sku]: eta },
      })),
    storageFrom: draft.storage_from.trim() ? draft.storage_from : null,
    storageOverride: draft.storage_fee_override.trim()
      ? Number(draft.storage_fee_override)
      : null,
    control: data?.control ?? null,
  };
}

/** Region + logistic select + delivery date → the Delivery grid. Writes
 *  straight to `orders` (own mutations). Always editable so the operator can
 *  fix or (re)assign the carrier / date at any stage (Jess: every cell edits). */
export function RoutingFields({
  orderId: _orderId,
  customerAddress,
  deliveryDate,
  proceedDate,
  opsAssignedLogistic,
  form,
}: {
  orderId: string;
  customerAddress: string | null;
  deliveryDate: string | null;
  /** orders.proceed_date — Phase 11.1: set_order_date now requires a proceed
   *  date <= the delivery date. Carried so an inline Deadline edit can re-send
   *  it (keep the existing one when still valid, else default to the new date). */
  proceedDate: string | null;
  opsAssignedLogistic: string | null;
  form: OrderControlForm;
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
              // Phase 11.1: set_order_date requires a proceed date <= the
              // delivery date. Keep the existing proceed date when still valid;
              // otherwise default it to the new delivery date.
              const pd = proceedDate && proceedDate <= v ? proceedDate : v;
              setDate.mutate({ date: v, proceedDate: pd });
            }
          }}
          className={CELL}
        />
      </FieldRow>
      {area === "Outstation" && (
        <FieldRow label="Call before PO">
          <select
            value={form.draft.called_customer ? "yes" : "no"}
            onChange={(e) =>
              form.set("called_customer", e.target.value === "yes")
            }
            className={CELL}
          >
            <option value="no">Not called yet</option>
            <option value="yes">Called ✓</option>
          </select>
        </FieldRow>
      )}
    </>
  );
}

/** Logistic ETA (the carrier's committed delivery date) → the Delivery section's
 *  RIGHT column. Distinct from Deadline (the customer's requested date); this is
 *  what the logistic partner updates. */
export function LogisticEtaField({ form }: { form: OrderControlForm }) {
  return (
    <FieldRow label="Logistic ETA">
      <input
        type="date"
        value={form.draft.logistic_eta}
        onChange={(e) => form.set("logistic_eta", e.target.value)}
        className={CELL}
      />
    </FieldRow>
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

const todayIso = () => new Date().toISOString().slice(0, 10);

/** Payment section. With an `orderId` it renders the real multi-entry ledger
 *  (migration 0184) — list + add-payment form + Outstanding from the ledger.
 *  Without one (the unit-test harness) it keeps the legacy keyed Paid /
 *  Outstanding so older callers don't regress. */
export function PaymentControlFields({
  form,
  paid,
  total,
  orderId,
  receiptMeta,
}: {
  form: OrderControlForm;
  paid: number;
  total: number;
  orderId?: string;
  receiptMeta?: { orderCode: string; customerName: string };
}) {
  const { draft, set } = form;
  // Bill = operator-keyed invoice / owing amount (balance); falls back to the
  // computed line total for native orders.
  const bill = draft.balance.trim() ? Number(draft.balance) : total;
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
      <DueDateRow form={form} bill={bill} orderId={orderId} />
      {orderId ? (
        <PaymentLedger orderId={orderId} bill={bill} receiptMeta={receiptMeta} />
      ) : (
        <LegacyPaidOutstanding form={form} paid={paid} bill={bill} />
      )}
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

/** Balance due-date key-in + overdue flag (Jess: the simple tracker's one real
 *  gap). Overdue = due < today AND there's still an outstanding goods balance. */
function DueDateRow({
  form,
  bill,
  orderId,
}: {
  form: OrderControlForm;
  bill: number;
  orderId?: string;
}) {
  const { draft, set } = form;
  const { data } = useOrderPayments(orderId ?? null);
  const goodsPaid = (data?.payments ?? [])
    .filter((p) => p.kind !== "storage")
    .reduce((s, p) => s + Number(p.amount || 0), 0);
  const outstanding = Math.max(0, bill - goodsPaid);
  const due = draft.balance_due_date.trim();
  const overdue = !!due && due < todayIso() && outstanding > 0;
  return (
    <FieldRow label="Due date">
      <div className="flex items-center gap-2 px-1 w-full">
        <input
          type="date"
          value={draft.balance_due_date}
          onChange={(e) => set("balance_due_date", e.target.value)}
          aria-label="Balance due date"
          className={CELL + " flex-1"}
        />
        {overdue && (
          <span className="pill pill-overdue inline-flex items-center gap-1 shrink-0">
            <AlertTriangle size={11} strokeWidth={2.5} />
            Overdue
          </span>
        )}
      </div>
    </FieldRow>
  );
}

/** Legacy keyed Paid / Outstanding — kept for callers without an orderId. */
function LegacyPaidOutstanding({
  form,
  paid,
  bill,
}: {
  form: OrderControlForm;
  paid: number;
  bill: number;
}) {
  const { draft, set } = form;
  const effPaid = draft.paid_amount.trim() ? Number(draft.paid_amount) : paid;
  const hasBill = bill > 0;
  const outstanding = Math.max(0, bill - effPaid);
  const settled = hasBill && outstanding <= 0;
  return (
    <>
      <FieldRow label="Paid">
        <input
          type="number"
          min={0}
          value={draft.paid_amount}
          onChange={(e) => set("paid_amount", e.target.value)}
          placeholder={paid > 0 ? `${paid} (deposit)` : "key amount paid"}
          className={CELL}
        />
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
    </>
  );
}

const KIND_LABEL: Record<PaymentKind, string> = {
  payment: "payment",
  deposit: "deposit",
  storage: "storage",
};

/** The real payment ledger for an order: list of entries + an inline
 *  "Add payment" form, with Paid / Outstanding derived live (storage excluded
 *  from the goods balance). Principal can void a mis-keyed row. */
function PaymentLedger({
  orderId,
  bill,
  receiptMeta,
}: {
  orderId: string;
  bill: number;
  receiptMeta?: { orderCode: string; customerName: string };
}) {
  const role = useAuth((s) => s.role);
  const isPrincipal = role === "principal";
  const { data, isLoading } = useOrderPayments(orderId);
  const payments = data?.payments ?? [];
  const summary = summarizePayments(
    payments.map((p) => ({ amount: Number(p.amount), kind: p.kind })),
    bill,
  );
  const hasBill = bill > 0;
  const settled = hasBill && summary.outstanding <= 0;

  const record = useRecordPayment(orderId, {
    onError: (e) => toast.error(`Couldn't record payment — ${e.message}`),
  });
  const voidPay = useVoidPayment(orderId, {
    onError: (e) => toast.error(`Couldn't void — ${e.message}`),
  });
  const [adding, setAdding] = useState(false);

  return (
    <FieldRow label="Payments">
      <div className="px-1.5 py-1.5 w-full space-y-1.5">
        {isLoading && <div className="text-[11px] text-base-400">Loading…</div>}
        {!isLoading && payments.length === 0 && (
          <div className="text-[11px] text-base-400">No payments recorded yet.</div>
        )}
        {payments.map((p) => (
          <LedgerRow
            key={p.id}
            row={p}
            canVoid={isPrincipal && !voidPay.isPending}
            onVoid={() => voidPay.mutate(p.id)}
            receiptMeta={receiptMeta}
          />
        ))}

        {adding ? (
          <AddPaymentForm
            pending={record.isPending}
            onCancel={() => setAdding(false)}
            onSubmit={(input) =>
              record.mutate(input, { onSuccess: () => setAdding(false) })
            }
          />
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
          >
            <Plus size={12} strokeWidth={2.5} /> Add payment
          </button>
        )}

        <div className="flex items-center justify-between border-t border-base-100 pt-1.5 mt-1.5 text-[12px]">
          <span className="text-base-500">Paid {RM(summary.byKind.payment + summary.byKind.deposit)}</span>
          <span
            className={`font-mono font-semibold ${
              !hasBill ? "text-base-400" : settled ? "text-success" : "text-primary"
            }`}
          >
            {!hasBill ? "—" : settled ? "Settled" : RM(summary.outstanding)}
          </span>
        </div>
      </div>
    </FieldRow>
  );
}

/** Render + open a receipt PDF for one ledger entry (on-demand, client-side). */
async function printReceipt(
  row: OrderPaymentRow,
  meta: { orderCode: string; customerName: string },
) {
  try {
    const blob = await renderReceiptPdf({
      receipt_no: row.receipt_no ?? row.id.slice(0, 8),
      issue_date: row.paid_on,
      order_code: meta.orderCode,
      customer: { name: meta.customerName },
      amount: Number(row.amount),
      method: row.method,
      kind: row.kind,
      reference: row.reference,
      note: row.note,
      currency: "MYR",
    });
    window.open(URL.createObjectURL(blob), "_blank");
  } catch (e) {
    toast.error(`Couldn't open receipt — ${(e as Error).message}`);
  }
}

/** One ledger line: date · amount · kind · method · receipt, with a receipt
 *  print + a void ✕ for the principal. */
function LedgerRow({
  row,
  canVoid,
  onVoid,
  receiptMeta,
}: {
  row: OrderPaymentRow;
  canVoid: boolean;
  onVoid: () => void;
  receiptMeta?: { orderCode: string; customerName: string };
}) {
  return (
    <div className="flex items-center gap-2 text-[11.5px]">
      <span className="text-base-500 tabular-nums w-[68px] shrink-0">{row.paid_on}</span>
      <span className="font-mono font-semibold text-base-900 w-[78px] shrink-0">
        {RM(Number(row.amount))}
      </span>
      <span className="text-base-600 capitalize flex-1 truncate">
        {KIND_LABEL[row.kind]} · {row.method}
        {row.receipt_no ? ` · ${row.receipt_no}` : ""}
      </span>
      {receiptMeta && (
        <button
          type="button"
          onClick={() => void printReceipt(row, receiptMeta)}
          title="Print receipt"
          aria-label={`Receipt ${row.receipt_no ?? row.id}`}
          className="text-base-400 hover:text-primary shrink-0"
        >
          <Receipt size={12} strokeWidth={2} />
        </button>
      )}
      {canVoid && (
        <button
          type="button"
          onClick={onVoid}
          title="Void this entry"
          aria-label={`Void payment ${row.receipt_no ?? row.id}`}
          className="text-base-400 hover:text-danger shrink-0"
        >
          <Trash2 size={12} strokeWidth={2} />
        </button>
      )}
    </div>
  );
}

/** Inline add-payment form: amount · date · method · kind → Record. */
function AddPaymentForm({
  pending,
  onCancel,
  onSubmit,
}: {
  pending: boolean;
  onCancel: () => void;
  onSubmit: (input: {
    amount: number;
    paidOn: string;
    method: OrderPaymentMethod;
    kind: PaymentKind;
  }) => void;
}) {
  const [amount, setAmount] = useState("");
  const [paidOn, setPaidOn] = useState(todayIso());
  const [method, setMethod] = useState<OrderPaymentMethod>("cash");
  const [kind, setKind] = useState<PaymentKind>("payment");
  const amt = Number(amount);
  const valid = amount.trim() !== "" && Number.isFinite(amt) && amt > 0 && !pending;
  return (
    <div className="border border-base-200 rounded-[3px] p-2 space-y-1.5 bg-base-50">
      <div className="grid grid-cols-2 gap-1.5">
        <input
          type="number"
          min={0}
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Amount (RM)"
          aria-label="Payment amount"
          className={CELL}
        />
        <input
          type="date"
          value={paidOn}
          onChange={(e) => setPaidOn(e.target.value)}
          aria-label="Payment date"
          className={CELL}
        />
        <select
          value={method}
          onChange={(e) => setMethod(e.target.value as OrderPaymentMethod)}
          aria-label="Payment method"
          className={CELL}
        >
          {PAYMENT_METHODS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as PaymentKind)}
          aria-label="Payment kind"
          className={CELL}
        >
          {PAYMENT_KINDS.filter((k) => k !== "storage").map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={!valid}
          onClick={() => onSubmit({ amount: amt, paidOn, method, kind })}
          className="btn-primary text-[11px] py-1 px-2.5 disabled:opacity-50"
        >
          {pending ? "Recording…" : "Record"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-[11px] text-base-500 hover:text-base-700"
        >
          Cancel
        </button>
      </div>
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
  orderId,
  meta,
}: {
  form: OrderControlForm;
  hasMsbf?: boolean;
  hasSof?: boolean;
  orderId?: string;
  meta?: { orderCode: string; customerName: string; customerPhone: string };
}) {
  const { draft, set } = form;
  const today = new Date().toISOString().slice(0, 10);
  // End of the storage window (Jess): explicit storage_to, else the logistic's
  // committed ETA (when it'll leave), else today (still accruing). Auto-shown but
  // editable — set it to freeze the fee on the actual collection/delivery date.
  const endEff = draft.storage_to.trim() || draft.logistic_eta.trim() || today;
  // Storage free-window basis: once a one-time extension is recorded, it's the
  // snapshotted ORIGINAL delivery date (migration 0196) so the free window holds
  // even after the target date moves; otherwise the operator's manual From date.
  const storageBasis = form.control?.extension_original_date ?? form.storageFrom;
  const storage = computeStorageFee({
    startDate: storageBasis,
    asOf: endEff,
    hasMsbf,
    hasSof,
  });
  // Each category is free for a working-day window from the basis (original
  // delivery) date; the fee accrues only after it (Jess 2026-06-30). Shown so
  // the operator sees WHY the auto fee is what it is — "free until X" or the
  // chargeable months / flat sofa fee.
  const fmtShort = (iso: string | null) =>
    iso
      ? new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
          year: "2-digit",
        })
      : "—";
  const incurred = draft.storage_from.trim() !== "";
  // Storage alert (Jess) — countdown to the To date, SAME pills as the Deadline
  // column (amber pill-warning / red pill-overdue + ⚠), NOT emoji. Shows only
  // when ≤3 days out, overdue, OR the logistic ETA is missing / later than To
  // (storage extending → collect payment). Healthy (>3d) shows nothing.
  const toDiff = Math.round(
    (new Date(`${endEff}T00:00:00`).getTime() -
      new Date(`${today}T00:00:00`).getTime()) /
      86_400_000,
  );
  const extending =
    !draft.logistic_eta.trim() || draft.logistic_eta.trim() > endEff;
  const storageAlert =
    !incurred || (toDiff > 3 && !extending)
      ? null
      : toDiff < 0
        ? { label: `Overdue ${-toDiff}d`, pill: "pill-overdue", urgent: true }
        : toDiff <= 1
          ? {
              label: toDiff === 0 ? "Due today" : "Due soon 1d",
              pill: "pill-overdue",
              urgent: true,
            }
          : { label: `Due soon ${toDiff}d`, pill: "pill-warning", urgent: false };
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
          <FieldRow label="To (end)">
            <input
              type="date"
              value={endEff}
              onChange={(e) => set("storage_to", e.target.value)}
              className={CELL}
            />
          </FieldRow>
          {storageAlert && (
            <FieldRow label="Alert">
              <div className="px-2 py-1">
                <span
                  className={`pill ${storageAlert.pill} ${storageAlert.urgent ? "inline-flex items-center gap-1" : ""}`}
                >
                  {storageAlert.urgent && (
                    <AlertTriangle size={11} strokeWidth={2.5} />
                  )}
                  {storageAlert.label}
                </span>
              </div>
            </FieldRow>
          )}
          {/* Auto breakdown — separate MS/BF (per month) and Sofa (per 2 weeks)
              lines (Jess), each = rate × commenced periods between From and To. */}
          {hasMsbf && (
            <FieldRow label="MS / BF">
              <div className="px-2 py-1.5 text-[12px] font-semibold text-base-900">
                RM {storage.msbf.toLocaleString()}
                <span className="ml-1 text-[11px] font-normal text-base-500">
                  {storage.msbf > 0
                    ? `· ${storage.msbfMonths} mth × RM150`
                    : `· free until ${fmtShort(storage.freeUntilMsbf)}`}
                </span>
              </div>
            </FieldRow>
          )}
          {hasSof && (
            <FieldRow label="Sofa">
              <div className="px-2 py-1.5 text-[12px] font-semibold text-base-900">
                RM {storage.sof.toLocaleString()}
                <span className="ml-1 text-[11px] font-normal text-base-500">
                  {storage.sofCharged
                    ? "· flat RM200 / order"
                    : `· free until ${fmtShort(storage.freeUntilSof)}`}
                </span>
              </div>
            </FieldRow>
          )}
          <FieldRow label="Charge">
            <input
              type="number"
              min={0}
              value={draft.storage_fee_override}
              onChange={(e) => set("storage_fee_override", e.target.value)}
              placeholder={
                storage.total > 0
                  ? `auto RM ${storage.total.toLocaleString()} (${storage.days}d)`
                  : "override auto"
              }
              className={CELL}
            />
          </FieldRow>
          <FieldRow label="Paid?">
            <select
              value={draft.storage_paid ?? ""}
              onChange={(e) => set("storage_paid", e.target.value)}
              className={CELL}
            >
              <option value="">—</option>
              <option value="Unpaid">Unpaid</option>
              <option value="Paid">Paid</option>
            </select>
          </FieldRow>
          {orderId && (
            <StorageCollectWaiver
              orderId={orderId}
              control={form.control}
              charge={draft.storage_fee_override.trim() ? Number(draft.storage_fee_override) : storage.total}
            />
          )}
          {orderId && (
            <StorageExtensionRow
              orderId={orderId}
              control={form.control}
              hasMsbf={hasMsbf}
              hasSof={hasSof}
              meta={meta}
            />
          )}
        </>
      )}
    </>
  );
}

/** One-time storage delivery-extension (migration 0196; the two Delivery-
 *  Extension Google Forms, Jess 2026-06-30). Operation may record ONE extension;
 *  a 2nd needs a principal (the route 403s `extension_used`). The free storage
 *  window recomputes from the snapshotted original delivery date. */
function StorageExtensionRow({
  orderId,
  control,
  hasMsbf = false,
  hasSof = false,
  meta,
}: {
  orderId: string;
  control: OpsOrderControl | null;
  hasMsbf?: boolean;
  hasSof?: boolean;
  meta?: { orderCode: string; customerName: string; customerPhone: string };
}) {
  const role = useAuth((s) => s.role);
  const isPrincipal = role === "principal";
  const count = control?.extension_count ?? 0;
  const extended = count >= 1;

  // Open the one-time extension agreement (the Google-Form replacement) as a PDF.
  // Policy lines are category-specific (the two forms): MS/BF 24 working days
  // free → RM150/month; Sofa 14 working days free → flat RM200/order.
  const exportAgreement = async () => {
    try {
      const policy: string[] = [];
      if (hasMsbf)
        policy.push(
          "Mattress / bed frame: up to 24 working days of free storage from the original requested delivery date; a storage fee of RM150 per month applies thereafter.",
        );
      if (hasSof)
        policy.push(
          "Sofa: up to 14 working days of free storage from the original requested delivery date; a one-time storage fee of RM200 per order applies thereafter.",
        );
      if (policy.length === 0)
        policy.push(
          "Storage fees, where applicable, apply after the free storage window from the original requested delivery date.",
        );
      const reasonText =
        control?.extension_reason === "Others" && control?.extension_note
          ? `Others — ${control.extension_note}`
          : control?.extension_reason ?? "—";
      const blob = await renderExtensionAgreementPdf({
        order_code: meta?.orderCode ?? "—",
        issue_date: (control?.extension_acknowledged_at ?? control?.extended_at ?? "").slice(0, 10),
        customer: { name: meta?.customerName ?? "", phone: meta?.customerPhone ?? "" },
        original_date: control?.extension_original_date ?? "",
        new_date: control?.extension_new_date ?? "",
        reason: reasonText,
        policy_lines: policy,
      });
      window.open(URL.createObjectURL(blob), "_blank");
    } catch (e) {
      toast.error(`Couldn't open agreement — ${(e as Error).message}`);
    }
  };

  const extend = useExtendStorage(orderId, {
    onSuccess: () => {
      toast.success("Storage extension recorded");
      setOpen(false);
    },
    onError: (e) => toast.error(`Couldn't extend — ${e.message}`),
  });

  const [open, setOpen] = useState(false);
  const [newDate, setNewDate] = useState("");
  const [reason, setReason] = useState<StorageExtensionReason>("Renovation");
  const [note, setNote] = useState("");
  const [ack, setAck] = useState(false);

  const fmt = (iso: string | null | undefined) =>
    iso
      ? new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
          year: "2-digit",
        })
      : "—";

  // Already extended → readout. A principal can still record a further one.
  if (extended && !open) {
    return (
      <FieldRow label="Extension">
        <div className="px-2 py-1.5 text-[12px] w-full">
          <div className="font-semibold text-base-900">
            → {fmt(control?.extension_new_date)}
            <span className="ml-1 text-[11px] font-normal text-base-500">
              · {control?.extension_reason ?? "—"} · free from {fmt(control?.extension_original_date)}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-3">
            <button
              type="button"
              onClick={() => void exportAgreement()}
              className="text-[11px] text-primary hover:underline inline-flex items-center gap-1"
            >
              <Receipt size={12} strokeWidth={2} />
              Export agreement (PDF)
            </button>
            {isPrincipal && (
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="text-[11px] text-primary hover:underline"
              >
                + Extend again
              </button>
            )}
          </div>
          {!isPrincipal && (
            <div className="mt-0.5 text-[11px] text-base-400">
              One-time extension used — a further extension needs principal approval.
            </div>
          )}
        </div>
      </FieldRow>
    );
  }

  if (!open) {
    return (
      <FieldRow label="Extension">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="px-2 py-1.5 text-[12px] text-primary hover:underline inline-flex items-center gap-1"
        >
          <Plus size={13} strokeWidth={2.5} />
          Extend storage
        </button>
      </FieldRow>
    );
  }

  const canSubmit =
    !!newDate && ack && (reason !== "Others" || !!note.trim()) && !extend.isPending;

  return (
    <FieldRow label="Extension">
      <div className="px-1.5 py-1.5 w-full space-y-1.5 border border-base-200 rounded-[3px] bg-base-50">
        <div className="grid grid-cols-2 gap-1.5">
          <label className="text-[10px] text-base-500 uppercase tracking-wide flex flex-col gap-0.5">
            New delivery date
            <input
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              aria-label="New delivery date"
              className={CELL}
            />
          </label>
          <label className="text-[10px] text-base-500 uppercase tracking-wide flex flex-col gap-0.5">
            Reason
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value as StorageExtensionReason)}
              aria-label="Extension reason"
              className={CELL}
            >
              {STORAGE_EXTENSION_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
        </div>
        {reason === "Others" && (
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Reason detail (required)"
            aria-label="Extension note"
            className={CELL + " w-full"}
          />
        )}
        <label className="flex items-start gap-1.5 text-[11px] text-base-700">
          <input
            type="checkbox"
            checked={ack}
            onChange={(e) => setAck(e.target.checked)}
            className="mt-0.5"
          />
          Customer acknowledges this is a one-time extension and the storage-fee policy.
        </label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() =>
              extend.mutate({
                newDeliveryDate: newDate,
                reason,
                note: reason === "Others" ? note.trim() : note.trim() || null,
                acknowledged: true,
              })
            }
            className="btn-primary text-[11px] px-2 py-1 disabled:opacity-40"
          >
            {extend.isPending ? "Saving…" : "Record extension"}
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-[11px] text-base-500 hover:text-base-900"
          >
            Cancel
          </button>
        </div>
      </div>
    </FieldRow>
  );
}

/** Collect-before-delivery (migration 0184): collect the storage fee → issue a
 *  receipt → open the delivery gate. A waiver is the principal-approved
 *  alternative. Reads the gate state off the loaded overlay row (form.control).
 *  Jess IS the principal, so this never gates him — it's the operator guardrail. */
function StorageCollectWaiver({
  orderId,
  control,
  charge,
}: {
  orderId: string;
  control: OpsOrderControl | null;
  charge: number;
}) {
  const role = useAuth((s) => s.role);
  const isPrincipal = role === "principal";
  const collectedAt = control?.storage_collected_at ?? null;
  const waiverStatus = control?.storage_waiver_status ?? "none";

  const collect = useCollectStorage(orderId, {
    onSuccess: () => toast.success("Storage fee collected — receipt issued"),
    onError: (e) => toast.error(`Couldn't collect — ${e.message}`),
  });
  const requestWaiver = useRequestStorageWaiver(orderId, {
    onSuccess: () => toast.success("Waiver requested — pending principal approval"),
    onError: (e) => toast.error(`Couldn't request — ${e.message}`),
  });
  const decideWaiver = useDecideStorageWaiver(orderId, {
    onError: (e) => toast.error(`Couldn't decide — ${e.message}`),
  });

  const [collecting, setCollecting] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<OrderPaymentMethod>("cash");

  // Already cleared → just confirm the gate is open.
  if (collectedAt) {
    return (
      <FieldRow label="Collected">
        <div className="px-2 py-1.5 text-[12px] text-success font-semibold inline-flex items-center gap-1">
          <ShieldCheck size={13} strokeWidth={2.5} />
          Collected {String(collectedAt).slice(0, 10)} · delivery unlocked
        </div>
      </FieldRow>
    );
  }
  if (waiverStatus === "approved") {
    return (
      <FieldRow label="Waiver">
        <div className="px-2 py-1.5 text-[12px] text-success font-semibold inline-flex items-center gap-1">
          <ShieldCheck size={13} strokeWidth={2.5} />
          Waived by principal · delivery unlocked
        </div>
      </FieldRow>
    );
  }

  return (
    <FieldRow label="Collect">
      <div className="px-1.5 py-1.5 w-full space-y-1.5">
        <div className="text-[11px] text-warning font-medium">
          Storage fee must be collected (or waived) before dispatch.
        </div>

        {/* Collect */}
        {collecting ? (
          <div className="border border-base-200 rounded-[3px] p-2 space-y-1.5 bg-base-50">
            <div className="grid grid-cols-2 gap-1.5">
              <input
                type="number"
                min={0}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={charge > 0 ? `${Math.round(charge)} (fee)` : "Amount (RM)"}
                aria-label="Storage amount collected"
                className={CELL}
              />
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value as OrderPaymentMethod)}
                aria-label="Storage payment method"
                className={CELL}
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={collect.isPending}
                onClick={() => {
                  const amt = amount.trim() ? Number(amount) : charge;
                  if (!Number.isFinite(amt) || amt <= 0) {
                    toast.error("Enter the amount collected");
                    return;
                  }
                  collect.mutate(
                    { amount: amt, paidOn: todayIso(), method },
                    { onSuccess: () => setCollecting(false) },
                  );
                }}
                className="btn-primary text-[11px] py-1 px-2.5 disabled:opacity-50"
              >
                {collect.isPending ? "Collecting…" : "Collect + receipt"}
              </button>
              <button
                type="button"
                onClick={() => setCollecting(false)}
                className="text-[11px] text-base-500 hover:text-base-700"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setCollecting(true)}
              className="btn-primary text-[11px] py-1 px-2.5"
            >
              Collect storage fee
            </button>
            {waiverStatus !== "requested" && (
              <button
                type="button"
                onClick={() => setRequesting((v) => !v)}
                className="text-[11px] text-base-500 hover:text-base-700"
              >
                Request waiver
              </button>
            )}
          </div>
        )}

        {/* Waiver request (operator) */}
        {requesting && waiverStatus !== "requested" && (
          <div className="border border-base-200 rounded-[3px] p-2 space-y-1.5 bg-base-50">
            <textarea
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason for waiver (the principal reviews this)"
              aria-label="Waiver reason"
              className={CELL + " resize-y block"}
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={reason.trim().length < 3 || requestWaiver.isPending}
                onClick={() =>
                  requestWaiver.mutate(
                    { reason: reason.trim() },
                    { onSuccess: () => setRequesting(false) },
                  )
                }
                className="btn-primary text-[11px] py-1 px-2.5 disabled:opacity-50"
              >
                {requestWaiver.isPending ? "Requesting…" : "Submit request"}
              </button>
              <button
                type="button"
                onClick={() => setRequesting(false)}
                className="text-[11px] text-base-500 hover:text-base-700"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Waiver pending — operator sees status, principal decides */}
        {waiverStatus === "requested" && (
          <div className="border border-warning/40 bg-warning-soft/40 rounded-[3px] p-2 space-y-1.5">
            <div className="text-[11px] text-base-700">
              <span className="pill pill-warning mr-1.5">Waiver requested</span>
              {control?.storage_waiver_reason ?? ""}
            </div>
            {isPrincipal ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={decideWaiver.isPending}
                  onClick={() => decideWaiver.mutate({ decision: "approved" })}
                  className="btn-primary text-[11px] py-1 px-2.5 disabled:opacity-50"
                >
                  Approve waiver
                </button>
                <button
                  type="button"
                  disabled={decideWaiver.isPending}
                  onClick={() => decideWaiver.mutate({ decision: "rejected" })}
                  className="text-[11px] text-danger hover:underline"
                >
                  Reject
                </button>
              </div>
            ) : (
              <div className="text-[11px] text-base-500">Awaiting principal approval.</div>
            )}
          </div>
        )}

        {waiverStatus === "rejected" && (
          <div className="text-[11px] text-danger">
            Waiver rejected — collect the fee to dispatch.
          </div>
        )}
      </div>
    </FieldRow>
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
  const [editing, setEditing] = useState(false);
  const val = form.draft[field];
  // Compact read-first (Jess one-screen fit): empty remarks collapse to a single
  // "+ add" line; a filled remark shows on one line; click expands the textarea.
  if (editing) {
    return (
      <FieldRow label={label}>
        <textarea
          rows={2}
          autoFocus
          value={val}
          onChange={(e) => form.set(field, e.target.value)}
          onBlur={() => setEditing(false)}
          placeholder={placeholder}
          className={CELL + " resize-y block py-1"}
        />
      </FieldRow>
    );
  }
  return (
    <FieldRow label={label}>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="w-full text-left px-1 py-0.5 rounded hover:bg-white hover:border hover:border-base-200 truncate text-[12px]"
      >
        {val.trim() ? (
          <span className="text-base-900">{val}</span>
        ) : (
          <span className="text-base-400">+ add</span>
        )}
      </button>
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
