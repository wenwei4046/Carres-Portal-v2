import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  Plus,
  ShieldCheck,
  Receipt,
} from "lucide-react";
import { toast } from "sonner";
import {
  DELIVERY_REASONS,
  DELIVERY_REASON_CATEGORY_LABEL,
  deliveryReasonLabel,
  type DeliveryReasonCategory,
  type DeliveryReasonKey,
  type UpdateOpsOrderControlInput,
  type OpsOrderControl,
  type LineStockStatus,
} from "@carres/shared";
import {
  useDeliveryPartners,
  useOperationSetDeliveryDate,
  useOrderControl,
  useSaveOrderControl,
  useSetOpsAssignedLogistic,
  useCollectStorage,
  useRequestStorageWaiver,
  useDecideStorageWaiver,
  useExtendStorage,
} from "@/lib/queries";
import { useAuth } from "@/lib/auth";
import { useManualMethods } from "@/lib/payment-methods";
import { renderExtensionAgreementPdf } from "@/lib/pdf/render";
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
  // The server row the draft was last synced FROM.
  //
  // Every instant save in the drawer — quickSave, the silent chaseStamp behind
  // a WhatsApp Remind/Call, booking confirm, the storage actions — invalidates
  // THIS query, and `updated_at` is in CONTROL_COLUMNS, so the refetched body
  // is never deep-equal and `loaded` always gets a new reference. An
  // unconditional `setDraft(loaded)` therefore threw away the WHOLE unsaved
  // draft — warehouse remark, keyed total, per-line ETAs and stock statuses —
  // and `dirty` went false with it, so the Save bar vanished and the operator
  // was never told. Resync field by field instead: a field touched since the
  // last sync keeps the operator's value, every other field takes the server's.
  const syncedRef = useRef<Draft>(EMPTY);
  useEffect(() => {
    const base = syncedRef.current;
    syncedRef.current = loaded;
    setDraft((d) => {
      const merged = { ...loaded };
      for (const k of Object.keys(loaded) as (keyof Draft)[]) {
        if (JSON.stringify(d[k]) !== JSON.stringify(base[k])) {
          (merged as Record<string, unknown>)[k] = d[k];
        }
      }
      return merged;
    });
  }, [loaded]);

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

const todayIso = () => new Date().toISOString().slice(0, 10);

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
  const [chosenMethod, setMethod] = useState<string>("cash");
  const { methods } = useManualMethods();
  const method = methods.some((m) => m.value === chosenMethod) ? chosenMethod : methods[0].value;

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
                onChange={(e) => setMethod(e.target.value)}
                aria-label="Storage payment method"
                className={CELL}
              >
                {methods.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
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

