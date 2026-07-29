import { type ReactNode, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
  ShieldCheck,
  Receipt,
} from "lucide-react";
import { toast } from "sonner";
import {
  computeStorageFee,
  defaultStorageStart,
  DELIVERY_TIME_SLOTS,
  PAYMENT_STATUSES,
  PAYMENT_METHODS,
  PAYMENT_KINDS,
  DELIVERY_REASONS,
  DELIVERY_REASON_CATEGORY_LABEL,
  deliveryReasonLabel,
  summarizePayments,
  type DeliveryReasonCategory,
  type DeliveryReasonKey,
  type UpdateOpsOrderControlInput,
  type OpsOrderControl,
  type LineStockStatus,
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
  /** Per-line route STOPS (bug-0 fix, UI-KIT §7.6): an ORDERED list of real
   *  locations — [0] = current/default location, further entries = transfer
   *  hops. This is the shape the LIVE order-control schema accepts (the richer
   *  line_legs objects are deploy-gated and no longer written). */
  line_locations: Record<string, string[]>;
  line_etas: Record<string, string>;
  line_stock_status: Record<string, LineStockStatus>;
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
  line_stock_status: {},
  called_customer: false,
};

const RM = (n: number) => `RM ${Math.round(Number(n) || 0).toLocaleString()}`;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Editable control inside a grid cell — a visible bordered box so the operator
 *  can tell at a glance the cell is editable (Jess: every cell should look
 *  editable). Selects keep their native arrow. */
// Lined field cell (Jess: the borderless version read as a "ghost box" — fields
// must clearly look like fields). A visible hairline box on white, flame ring on
// focus — clean but structured.
const CELL =
  "w-full border border-base-300 rounded-[5px] bg-white px-1.5 py-0.5 text-body text-base-900 outline-none hover:border-base-400 focus:border-primary focus:ring-1 focus:ring-primary/20 transition-colors";
/** CELL without the rubber-band w-full (rev25, Jess: fields are FIXED-width
 *  boxes like the approved mock — a date box needs no kilometre). Pair with an
 *  explicit width class at the call site. */
export const CELL_FIT = CELL.replace("w-full ", "");

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
    <div className="flex items-center justify-between gap-2 min-w-0 min-h-9 py-[3px] border-b border-base-100/70 last:border-b-0">
      <span className="text-meta text-base-400 shrink-0">{label}</span>
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
  /** Set one line's route STOPS (per-SKU; rides line_locations — [0] = the
   *  default location, more entries = a multi-hop transfer). Empty array =
   *  clear back to the standard single hop. */
  setLineLocation: (sku: string, locs: string[]) => void;
  /** Set the stock ETA for one order line (per-SKU; migration 0170 — products
   *  don't all arrive on the same date, Jess). */
  setLineEta: (sku: string, eta: string) => void;
  /** Override one line's readiness (per-SKU; migration 0199). null = clear the
   *  override → the badge falls back to the derived free-stock value. */
  setLineStockStatus: (sku: string, status: LineStockStatus | null) => void;
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
      line_stock_status: c.line_stock_status ?? {},
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
      // line_legs is deliberately NOT sent (bug-0, 2026-07-13): the deployed
      // order-control schema .strict()-rejects it ("Unrecognized key"), which
      // failed the WHOLE save. Routes ride line_locations as ordered stops.
      line_locations:
        Object.keys(draft.line_locations).length > 0
          ? draft.line_locations
          : null,
      line_etas:
        Object.keys(draft.line_etas).length > 0 ? draft.line_etas : null,
      line_stock_status:
        Object.keys(draft.line_stock_status).length > 0
          ? draft.line_stock_status
          : null,
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
      setDraft((d) => {
        const next = { ...d.line_locations };
        if (locs.length === 0) delete next[sku];
        else next[sku] = locs;
        return { ...d, line_locations: next };
      }),
    setLineEta: (sku, eta) =>
      setDraft((d) => ({
        ...d,
        line_etas: { ...d.line_etas, [sku]: eta },
      })),
    setLineStockStatus: (sku, status) =>
      setDraft((d) => {
        const next = { ...d.line_stock_status };
        if (status === null) delete next[sku];
        else next[sku] = status;
        return { ...d, line_stock_status: next };
      }),
    storageFrom: draft.storage_from.trim() ? draft.storage_from : null,
    storageOverride: draft.storage_fee_override.trim()
      ? Number(draft.storage_fee_override)
      : null,
    control: data?.control ?? null,
  };
}

/** Region + logistic select + delivery date → the Delivery grid. Writes
 *  straight to `orders` (own mutations). Always editable so the operator can
 *  fix or (re)assign the logistics company / date at any stage (every cell edits). */
export function RoutingFields({
  orderId: _orderId,
  customerAddress,
  deliveryDate,
  proceedDate,
  opsAssignedLogistic,
  form,
  hideRegion = false,
  hideDeadline = false,
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
  /** Delivery card shows the region once in its header — hide the duplicate
   *  Region row here (Jess: no repeated region). */
  hideRegion?: boolean;
  /** rev23 (Jess): the deadline is auto-filled by the AutoCount/Master import
   *  and read-only in the Delivery tab — the caller renders its own read-only
   *  row (with the Postponed affordance), so this component skips its editable
   *  Deadline input. */
  hideDeadline?: boolean;
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
    onSuccess: () => toast.success("Logistics updated"),
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
      {!hideRegion && (
        <FieldRow label="Region">
          <div className="px-2 py-1.5">
            <AreaBadge area={area} />
          </div>
        </FieldRow>
      )}

      <FieldRow label="Logistics">
        <div className="flex items-center gap-2 flex-wrap w-full px-1">
          <select
            id="fld-logistic"
            value={opsAssignedLogistic ?? ""}
            disabled={setLogistic.isPending}
            onChange={(e) =>
              setLogistic.mutate({ deliveryPartnerId: e.target.value || null })
            }
            className={`${CELL_FIT} w-[240px] disabled:opacity-50`}
          >
            <option value="">— pick logistics —</option>
            {partners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
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
              className="text-meta px-2 py-0.5 rounded border border-primary text-primary font-medium hover:bg-primary/5 disabled:opacity-50 whitespace-nowrap"
            >
              Apply {suggestedPartner.name}
            </button>
          )}
        </div>
      </FieldRow>

      {!hideDeadline && (
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
      )}
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

/** The logistics company's own date → the Delivery section's RIGHT column.
 *  Distinct from Deadline (the customer's requested date) and from the
 *  CUSTOMER's confirmation: this is only what logistics said (COPY-STANDARD
 *  calls it "Logistics' date" and it is never green). */
export function LogisticEtaField({
  form,
  onCommit,
}: {
  form: OrderControlForm;
  /** 2A instant-save (Jess 2026-07-18): fire a sparse save as soon as a full
   *  date is picked / cleared — the Delivery tab has no draft Save anymore. */
  onCommit?: (value: string) => void;
}) {
  return (
    <FieldRow label="Logistics' date">
      <input
        id="fld-logistic-eta"
        type="date"
        value={form.draft.logistic_eta}
        onChange={(e) => {
          const v = e.target.value;
          form.set("logistic_eta", v);
          if (onCommit && (v === "" || ISO_DATE.test(v))) onCommit(v);
        }}
        className={`${CELL_FIT} w-[170px]`}
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
  // Operation has NO Bill/Total (Jess 2026-07-02): AutoCount + Master carry only the
  // OUTSTANDING owed, if any (the total bill surfaces in a future non-operation panel).
  // So `balance` IS the amount owed; payments in the ledger reduce it. No `total` fallback.
  const owing = draft.balance.trim() ? Number(draft.balance) : 0;
  void total;
  return (
    <div data-testid="payment-summary">
      <FieldRow label="Owing (RM)">
        <input
          type="number"
          min={0}
          value={draft.balance}
          onChange={(e) => set("balance", e.target.value)}
          placeholder="amount owed (from import)"
          className={CELL}
        />
      </FieldRow>
      <DueDateRow form={form} bill={owing} orderId={orderId} />
      {orderId ? (
        <PaymentLedger orderId={orderId} bill={owing} receiptMeta={receiptMeta} />
      ) : (
        <LegacyPaidOutstanding form={form} paid={paid} bill={owing} />
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
            <AlertTriangle size={14} strokeWidth={2.5} />
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
          className={`px-2 py-1.5 font-mono text-body font-semibold ${
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
  const paidSoFar = summary.byKind.payment + summary.byKind.deposit;
  // Auto status pill (Jess 2026-07-02): Paid (cleared) · Partial (some paid) ·
  // Owing (nothing paid yet) · —(nothing owed). The red "On hold" comes from the
  // delivery gate in the panel header, not here.
  const status = !hasBill
    ? { t: "—", c: "pill-neutral" }
    : settled
      ? { t: "Paid", c: "pill-confirmed" }
      : paidSoFar > 0
        ? { t: "Partial", c: "pill-warning" }
        : { t: "Owing", c: "pill-neutral" };

  const record = useRecordPayment(orderId, {
    onError: (e) => toast.error(`Couldn't record payment — ${e.message}`),
  });
  const voidPay = useVoidPayment(orderId, {
    onError: (e) => toast.error(`Couldn't void — ${e.message}`),
  });
  const [adding, setAdding] = useState(false);

  return (
    <FieldRow label="Balance">
      <div className="px-1.5 py-1.5 w-full space-y-1.5">
        {/* Outstanding headline + auto status (Jess 2026-07-02). */}
        <div className="flex items-end justify-between gap-2">
          <div>
            <div className="text-meta uppercase tracking-[0.05em] text-base-400">
              Outstanding
            </div>
            <div
              className={`font-mono text-strong font-semibold leading-tight ${
                !hasBill ? "text-base-400" : settled ? "text-success" : "text-primary"
              }`}
            >
              {!hasBill ? "—" : settled ? "Settled" : RM(summary.outstanding)}
            </div>
          </div>
          <span className={`pill ${status.c} mb-0.5`}>{status.t}</span>
        </div>
        {hasBill && (
          <div className="text-meta text-base-500">
            Paid {RM(paidSoFar)} of {RM(bill)} owed
          </div>
        )}
        {isLoading && <div className="text-meta text-base-400">Loading…</div>}
        {!isLoading && payments.length === 0 && (
          <div className="text-meta text-base-400">No payments recorded yet.</div>
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
            className="inline-flex items-center gap-1 text-meta font-semibold text-primary hover:underline"
          >
            <Plus size={14} strokeWidth={2.5} /> Record payment
          </button>
        )}
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
    <div className="flex items-center gap-2 text-meta">
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
          <Receipt size={14} strokeWidth={2} />
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
          <Trash2 size={14} strokeWidth={2} />
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
          className="btn-primary text-meta py-1 px-2.5 disabled:opacity-50"
        >
          {pending ? "Recording…" : "Record"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-meta text-base-500 hover:text-base-700"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/** Storage block (§7.5, 2026-07-13): fee = START→END window. START (From) is
 *  auto-suggested as the next SAME WEEKDAY after the delivery deadline
 *  (`defaultStorageStart`, deadline + 7 days); END = the actual delivery /
 *  collection date (else the logistic ETA, else today while accruing). MS/BF
 *  RM150 per commenced month; sofa free for the window's first 14 days then a
 *  flat RM200. Leave the fee blank for the auto amount or key an override. */
export function StorageControlFields({
  form,
  hasMsbf = false,
  hasSof = false,
  orderId,
  deadline,
  meta,
}: {
  form: OrderControlForm;
  hasMsbf?: boolean;
  hasSof?: boolean;
  orderId?: string;
  /** The order's delivery deadline — basis for the auto START (deadline+7d). */
  deadline?: string | null;
  meta?: { orderCode: string; customerName: string; customerPhone: string };
}) {
  const { draft, set } = form;
  const today = new Date().toISOString().slice(0, 10);
  // S1 (Jess 2026-07-18, thin inputs): waiver + extension fold away by
  // default — they auto-open only when one is already in play.
  const hasWaiverOrExt =
    (form.control?.storage_waiver_status ?? "none") !== "none" ||
    form.control?.storage_collected_at != null ||
    (form.control?.extension_count ?? 0) > 0;
  const [moreOpen, setMoreOpen] = useState(hasWaiverOrExt);
  // The control row loads async — pop the fold open once data shows a live
  // waiver / extension (never auto-closes).
  useEffect(() => {
    if (hasWaiverOrExt) setMoreOpen(true);
  }, [hasWaiverOrExt]);
  // End of the storage window: explicit storage_to (the actual delivery /
  // collection), else the logistic's committed ETA, else today (still
  // accruing). Auto-shown but editable — set it to freeze the fee.
  const endEff = draft.storage_to.trim() || draft.logistic_eta.trim() || today;
  const storage = computeStorageFee({
    startDate: form.storageFrom,
    asOf: endEff,
    hasMsbf,
    hasSof,
  });
  // Shown so the operator sees WHY the auto fee is what it is — the chargeable
  // months / the sofa free-window / the flat fee.
  const fmtShort = (iso: string | null) =>
    iso
      ? new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
          year: "2-digit",
        })
      : "—";
  // Master-imported storage fees (migration 0207, Jess 2026-07-06) — the fee Jess
  // hand-computes in the Master. When present it REPLACES the auto number in the
  // tile + is the Charge default (a manual override still wins); and a Master fee
  // auto-counts the order as incurred (Jess: "有费用自动标 incurred").
  const impMsbf = form.control?.storage_fee_msbf ?? null;
  const impSof = form.control?.storage_fee_sof ?? null;
  const hasImportedFee = (impMsbf ?? 0) > 0 || (impSof ?? 0) > 0;
  const dispMsbf = impMsbf ?? storage.msbf;
  const dispSof = impSof ?? storage.sof;
  // Effective auto/imported total (before a manual override) — imported wins.
  const effAutoTotal = hasImportedFee ? (impMsbf ?? 0) + (impSof ?? 0) : storage.total;
  const incurred = draft.storage_from.trim() !== "" || hasImportedFee;
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
              // §7.5 auto START — the next same weekday AFTER the deadline
              // (deadline + 7d); today only when there's no deadline to anchor.
              if (!draft.storage_from.trim())
                set(
                  "storage_from",
                  defaultStorageStart(deadline ?? null) ?? today,
                );
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
          {/* From – End on ONE row (§7.5). From auto = deadline+7d, editable;
              End = the actual delivery / collection date. */}
          <FieldRow label="From – End">
            <div className="flex items-center gap-1 w-full min-w-0">
              <input
                type="date"
                value={draft.storage_from}
                onChange={(e) => set("storage_from", e.target.value)}
                aria-label="Storage from"
                title="Storage START — auto: the next same weekday after the deadline"
                className={`${CELL} flex-1 min-w-0`}
              />
              <span className="text-base-300 shrink-0">–</span>
              <input
                type="date"
                value={endEff}
                onChange={(e) => set("storage_to", e.target.value)}
                aria-label="Storage end"
                title="Storage END — the actual delivery / collection date"
                className={`${CELL} flex-1 min-w-0`}
              />
            </div>
          </FieldRow>
          {storageAlert && (
            <FieldRow label="Alert">
              <div className="px-2 py-1">
                <span
                  className={`pill ${storageAlert.pill} ${storageAlert.urgent ? "inline-flex items-center gap-1" : ""}`}
                >
                  {storageAlert.urgent && (
                    <AlertTriangle size={14} strokeWidth={2.5} />
                  )}
                  {storageAlert.label}
                </span>
              </div>
            </FieldRow>
          )}
          {/* Auto breakdown — separate MS/BF (per month) and Sofa (per 2 weeks)
              lines (Jess), each = rate × commenced periods between From and To. */}
          {/* Category fees 2-col (Jess: MS/BF vs Sofa side by side) — display-only
              readout of the auto-computed fee + its free-window; the shared
              controls below (Charge / Paid / waiver / extension) stay full-width. */}
          <div
            className={`px-1 py-1 grid gap-2 ${hasMsbf && hasSof ? "grid-cols-2" : "grid-cols-1"}`}
          >
            {hasMsbf && (
              <div className="rounded-md border border-base-100 bg-base-50 px-2 py-1.5">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-meta uppercase tracking-[0.04em] text-base-400">
                    MS / BF
                  </span>
                  {impMsbf != null && (
                    <span className="text-meta uppercase tracking-[0.04em] text-primary font-semibold">
                      Master
                    </span>
                  )}
                </div>
                <div className="text-body font-semibold text-base-900">
                  RM {dispMsbf.toLocaleString()}
                </div>
                <div className="text-meta text-base-500">
                  {impMsbf != null
                    ? "imported fee"
                    : storage.msbf > 0
                      ? `${storage.msbfMonths} mth × RM150`
                      : `runs from ${fmtShort(storage.freeUntilMsbf)}`}
                </div>
              </div>
            )}
            {hasSof && (
              <div className="rounded-md border border-base-100 bg-base-50 px-2 py-1.5">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-meta uppercase tracking-[0.04em] text-base-400">
                    Sofa
                  </span>
                  {impSof != null && (
                    <span className="text-meta uppercase tracking-[0.04em] text-primary font-semibold">
                      Master
                    </span>
                  )}
                </div>
                <div className="text-body font-semibold text-base-900">
                  RM {dispSof.toLocaleString()}
                </div>
                <div className="text-meta text-base-500">
                  {impSof != null
                    ? "imported fee"
                    : storage.sofCharged
                      ? "flat RM200 / order"
                      : `free until ${fmtShort(storage.freeUntilSof)}`}
                </div>
              </div>
            )}
          </div>
          <FieldRow label="Charge">
            <input
              type="number"
              min={0}
              value={draft.storage_fee_override}
              onChange={(e) => set("storage_fee_override", e.target.value)}
              placeholder={
                effAutoTotal > 0
                  ? `${hasImportedFee ? "Master" : "auto"} RM ${effAutoTotal.toLocaleString()}${hasImportedFee ? "" : ` (${storage.days}d)`}`
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
            <>
              <button
                type="button"
                onClick={() => setMoreOpen((v) => !v)}
                className="flex items-center gap-1 text-meta text-base-500 hover:text-base-700 px-1 py-0.5"
              >
                {moreOpen ? (
                  <ChevronDown size={14} strokeWidth={2} />
                ) : (
                  <ChevronRight size={14} strokeWidth={2} />
                )}
                Waiver &amp; extension
              </button>
              {moreOpen && (
                <>
                  <StorageCollectWaiver
                    orderId={orderId}
                    control={form.control}
                    charge={
                      draft.storage_fee_override.trim()
                        ? Number(draft.storage_fee_override)
                        : effAutoTotal
                    }
                  />
                  <StorageExtensionRow
                    orderId={orderId}
                    control={form.control}
                    hasMsbf={hasMsbf}
                    hasSof={hasSof}
                    meta={meta}
                  />
                </>
              )}
            </>
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
export function StorageExtensionRow({
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
  // Policy lines follow the §7.5 rule: storage starts the same weekday the week
  // after the requested delivery date; MS/BF RM150/month; sofa 14 days free
  // then a one-time RM200.
  const exportAgreement = async () => {
    try {
      const policy: string[] = [];
      if (hasMsbf)
        policy.push(
          "Mattress / bed frame: storage starts the same weekday the week after the requested delivery date; a storage fee of RM150 per month applies over the storage period.",
        );
      if (hasSof)
        policy.push(
          "Sofa: storage starts the same weekday the week after the requested delivery date; the first 14 days are free, after which a one-time storage fee of RM200 per order applies.",
        );
      if (policy.length === 0)
        policy.push(
          "Storage fees, where applicable, run from the week after the requested delivery date until actual delivery or collection.",
        );
      // T4: stored value is a reason KEY (legacy rows hold the old words —
      // deliveryReasonLabel passes those through as-is).
      const reasonLabel = deliveryReasonLabel(control?.extension_reason);
      const reasonText = control?.extension_note
        ? `${reasonLabel} — ${control.extension_note}`
        : reasonLabel;
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
  // T4 Reason Library: no default — a reschedule cannot be saved without an
  // explicit reason pick (a silent default would record a wrong fact).
  const [reasonKey, setReasonKey] = useState<DeliveryReasonKey | "">("");
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
        <div className="px-2 py-1.5 text-body w-full">
          <div className="font-semibold text-base-900">
            → {fmt(control?.extension_new_date)}
            <span className="ml-1 text-meta font-normal text-base-500">
              · {deliveryReasonLabel(control?.extension_reason)} · free from {fmt(control?.extension_original_date)}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-3">
            <button
              type="button"
              onClick={() => void exportAgreement()}
              className="text-meta text-primary hover:underline inline-flex items-center gap-1"
            >
              <Receipt size={14} strokeWidth={2} />
              Export agreement (PDF)
            </button>
            {isPrincipal && (
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="text-meta text-primary hover:underline"
              >
                + Extend again
              </button>
            )}
          </div>
          {!isPrincipal && (
            <span className="mt-0.5 inline-block pill bg-base-100 text-base-500">
              1/1 used
            </span>
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
          className="px-2 py-1.5 text-body text-primary hover:underline inline-flex items-center gap-1"
        >
          <Plus size={14} strokeWidth={2.5} />
          Extend storage
        </button>
      </FieldRow>
    );
  }

  // T4 done-when: no reason pick → no save.
  const canSubmit = !!newDate && ack && !!reasonKey && !extend.isPending;

  const reasonGroups = (
    Object.keys(DELIVERY_REASON_CATEGORY_LABEL) as DeliveryReasonCategory[]
  )
    .map((cat) => ({
      cat,
      label: DELIVERY_REASON_CATEGORY_LABEL[cat],
      reasons: DELIVERY_REASONS.filter((r) => r.category === cat),
    }))
    .filter((g) => g.reasons.length > 0);

  return (
    <FieldRow label="Extension">
      <div className="px-1.5 py-1.5 w-full space-y-1.5 border border-base-200 rounded-[3px] bg-base-50">
        <div className="grid grid-cols-2 gap-1.5">
          <label className="text-meta text-base-500 uppercase tracking-wide flex flex-col gap-0.5">
            New delivery date
            <input
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              aria-label="New delivery date"
              className={CELL}
            />
          </label>
          <label className="text-meta text-base-500 uppercase tracking-wide flex flex-col gap-0.5">
            Reason
            <select
              value={reasonKey}
              onChange={(e) => setReasonKey(e.target.value as DeliveryReasonKey | "")}
              aria-label="Extension reason"
              className={CELL}
            >
              <option value="" disabled>
                Select reason…
              </option>
              {reasonGroups.map((g) => (
                <optgroup key={g.cat} label={g.label}>
                  {g.reasons.map((r) => (
                    <option key={r.key} value={r.key}>
                      {r.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
        </div>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Detail (optional)"
          aria-label="Extension note"
          className={CELL + " w-full"}
        />
        <label className="flex items-start gap-1.5 text-meta text-base-700">
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
            onClick={() => {
              if (!reasonKey) return;
              extend.mutate({
                newDeliveryDate: newDate,
                reasonKey,
                note: note.trim() || null,
                acknowledged: true,
              });
            }}
            className="btn-primary text-meta px-2 py-1 disabled:opacity-40"
          >
            {extend.isPending ? "Saving…" : "Record extension"}
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-meta text-base-500 hover:text-base-900"
          >
            Cancel
          </button>
        </div>
      </div>
    </FieldRow>
  );
}

/** Collect-before-delivery (migration 0184): collect the storage fee → issue a
 *  receipt → open the delivery gate. Reads the gate state off the loaded
 *  overlay row (form.control).
 *
 *  C9 (Jess 2026-07-27) — the manager's decision is TWO outcomes, not one, and
 *  the operator sees which one was taken. `Release, fee still owed` is the
 *  default: the goods go and `Collect RM …` stays on the worklist. `Release and
 *  waive the fee` writes it off. Only the manager decides — Jess IS the
 *  principal, so this never gates her; it stops an operator releasing their own
 *  order. */
export function StorageCollectWaiver({
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
    onSuccess: () => toast.success("Release requested — the manager decides"),
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
        <div className="px-2 py-1.5 text-body text-success font-semibold inline-flex items-center gap-1">
          <ShieldCheck size={14} strokeWidth={2.5} />
          Collected {String(collectedAt).slice(0, 10)} · delivery unlocked
        </div>
      </FieldRow>
    );
  }
  // C9 — released. The fee tells the operator WHICH release it was: a waived
  // fee is 0 (the manager wrote it off), an owed one is still on the bill and
  // its Collect action is still on the row. The two states must not read alike.
  if (waiverStatus === "approved") {
    const stillOwed = charge > 0;
    return (
      <FieldRow label="Released">
        <div className="px-2 py-1.5 text-body font-semibold inline-flex items-center gap-1 text-success">
          <ShieldCheck size={14} strokeWidth={2.5} />
          {stillOwed
            ? `Released by the manager · RM ${Math.round(charge).toLocaleString()} storage fee still to collect`
            : "Released by the manager · storage fee written off"}
        </div>
      </FieldRow>
    );
  }

  return (
    <FieldRow label="Collect">
      <div className="px-1.5 py-1.5 w-full space-y-1.5">
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
                className="btn-primary text-meta py-1 px-2.5 disabled:opacity-50"
              >
                {collect.isPending ? "Collecting…" : "Collect + receipt"}
              </button>
              <button
                type="button"
                onClick={() => setCollecting(false)}
                className="text-meta text-base-500 hover:text-base-700"
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
              className="btn-primary text-meta py-1 px-2.5"
            >
              Collect storage fee
            </button>
            {waiverStatus !== "requested" && (
              <button
                type="button"
                onClick={() => setRequesting((v) => !v)}
                className="text-meta text-base-500 hover:text-base-700"
              >
                Ask the manager to release
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
              placeholder="Why must these goods go before the storage fee is in? (the manager reads this)"
              aria-label="Reason for releasing the delivery"
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
                className="btn-primary text-meta py-1 px-2.5 disabled:opacity-50"
              >
                {requestWaiver.isPending ? "Requesting…" : "Submit request"}
              </button>
              <button
                type="button"
                onClick={() => setRequesting(false)}
                className="text-meta text-base-500 hover:text-base-700"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Release requested — the operator sees the state, the manager picks
            ONE of two outcomes out loud (C9). The default releases the goods
            and leaves the money owed; waiving is the deliberate second click,
            because an override must never quietly forgive money. */}
        {waiverStatus === "requested" && (
          <div className="border border-warning/40 bg-warning-soft/40 rounded-[3px] p-2 space-y-1.5">
            <div className="text-meta text-base-700">
              <span className="pill pill-warning mr-1.5">Release requested</span>
              {control?.storage_waiver_reason ?? ""}
            </div>
            {isPrincipal ? (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={decideWaiver.isPending}
                  onClick={() => decideWaiver.mutate({ decision: "released" })}
                  title={
                    charge > 0
                      ? `The goods go now. RM ${Math.round(charge).toLocaleString()} of storage fee stays on this order to collect.`
                      : "The goods go now. Any storage fee stays on this order to collect."
                  }
                  className="btn-primary text-meta py-1 px-2.5 disabled:opacity-50"
                >
                  Release, fee still owed
                </button>
                <button
                  type="button"
                  disabled={decideWaiver.isPending}
                  onClick={() => decideWaiver.mutate({ decision: "waived" })}
                  title={
                    charge > 0
                      ? `The goods go now and RM ${Math.round(charge).toLocaleString()} is written off. Carres never collects it.`
                      : "The goods go now and the storage fee is written off."
                  }
                  className="text-meta text-base-700 hover:underline"
                >
                  Release and waive the fee
                </button>
                <button
                  type="button"
                  disabled={decideWaiver.isPending}
                  onClick={() => decideWaiver.mutate({ decision: "rejected" })}
                  title="The goods stay. Collect the storage fee first."
                  className="text-meta text-danger hover:underline"
                >
                  Reject
                </button>
              </div>
            ) : (
              <div className="text-meta text-base-500">
                The manager decides. The goods stay until then.
              </div>
            )}
          </div>
        )}

        {waiverStatus === "rejected" && (
          <div className="text-meta text-danger">
            Release rejected — collect the storage fee before this order goes out.
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
  onCommit,
}: {
  form: OrderControlForm;
  field:
    | "customer_request"
    | "action_for_logistic"
    | "carres_remark"
    | "warehouse_remark";
  label: string;
  placeholder?: string;
  /** 2A instant-save: called with the final value when the textarea blurs
   *  (only if it actually changed) — the caller fires the sparse save. */
  onCommit?: (value: string) => void;
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
          onBlur={() => {
            setEditing(false);
            const saved = form.control?.[field] ?? "";
            if (onCommit && val !== saved) onCommit(val);
          }}
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
        className="w-full text-left border border-base-300 rounded-[5px] bg-white px-1.5 py-0.5 hover:border-base-400 truncate text-body"
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
        className="text-meta text-base-500 hover:text-base-700"
        onClick={form.reset}
        disabled={form.saving}
      >
        Reset
      </button>
      <button
        type="button"
        className="btn-primary text-body disabled:opacity-50"
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
      className={`inline-block text-meta font-semibold uppercase tracking-[0.04em] py-[3px] px-[7px] border rounded-[3px] ${tone}`}
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
          <span className="text-meta uppercase tracking-[0.04em] text-base-500">
            {r.label}
          </span>
          <span className={`font-mono text-body font-semibold ${r.tone}`}>
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
        className="w-full px-2 py-1.5 border border-base-200 rounded text-body bg-white outline-none focus:border-base-700 resize-y"
      />
    </div>
  );
}
