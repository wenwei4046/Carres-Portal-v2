import { useEffect, useState } from "react";
import { Lock, Plus, X } from "lucide-react";
import { toast } from "sonner";
import {
  DEFAULT_PAYMENT_METHODS,
  ORDER_ENTRY_TABS,
  POS_FORM_BUILTINS,
  STRIPE_PAYMENT_METHOD,
  resolveFormTab,
  type CustomField,
  type CustomFieldType,
  type FormFieldsConfig,
  type OrderEntryConfigDto,
  type OrderEntryTab,
  type PaymentMethodConfig,
} from "@carres/shared";
import { useOrderEntryConfig, useUpdateOrderEntryConfig } from "@/lib/queries";
import { INPUT_CLS } from "./components/Modal";
import Button from "@/components/kit/Button";
import Drawer from "@/components/kit/Drawer";

// ===========================================================================
// Order Entry config page (0219) — the config center for the POS "Open Sales
// Order" format, reached from the POS sidebar's Maintain section (was a modal
// inside SO Maintenance until 2026-07-12). Two sections:
//   1. Payment methods — add/remove/toggle methods, per-method approval-code
//      toggle + required-information dropdowns (e.g. the Bank list on Credit/Debit).
//   2. Form fields — the Customer step's 4 tabs: builtin enable/require
//      toggles (locked fields are display-only) + operator custom fields.
// Save = full PUT replace (mirrors the 0174 grid-config pattern: the field
// UNIVERSE lives in code; the DB stores only overrides + custom lists).
// ===========================================================================

/** Methods the POS submit pipeline knows structurally — deactivate, never remove. */
const PROTECTED_METHOD_KEYS = new Set(["online", "credit", "installment", "cash"]);

const TAB_LABELS: Record<OrderEntryTab, string> = {
  customer: "Customer",
  address: "Address",
  emergency: "Emergency",
  target: "Target date",
};

const FIELD_TYPES: CustomFieldType[] = ["text", "select", "date", "number"];

/** Derive a kebab-case key from a human name (creation-time ONLY — keys are
 *  permanent once created; edits to a label never re-derive its key). */
function kebabKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
}

function cleanOptions(options: string[]): string[] {
  return options.map((o) => o.trim()).filter(Boolean);
}

interface BuiltinToggle {
  enabled: boolean;
  required: boolean;
}

interface TabDraft {
  /** Non-locked builtin keys only. */
  builtins: Record<string, BuiltinToggle>;
  custom: CustomField[];
}

interface Draft {
  methods: PaymentMethodConfig[];
  tabs: Record<OrderEntryTab, TabDraft>;
}

function initDraft(cfg: OrderEntryConfigDto): Draft {
  // Start from what the POS currently shows: the configured list, else the
  // code defaults (incl. Cash + the required Bank information on Credit/Debit).
  const source = cfg.paymentMethods.length > 0 ? cfg.paymentMethods : DEFAULT_PAYMENT_METHODS;
  const methods = source.map((m) => ({
    ...m,
    followUps: m.followUps.map((f) => ({ ...f, options: [...f.options] })),
  }));

  const tabs = {} as Record<OrderEntryTab, TabDraft>;
  for (const tab of ORDER_ENTRY_TABS) {
    const resolved = resolveFormTab(cfg.formFields, tab);
    const builtins: Record<string, BuiltinToggle> = {};
    for (const f of POS_FORM_BUILTINS) {
      if (f.tab !== tab || f.locked) continue;
      const r = resolved.builtins[f.key];
      builtins[f.key] = { enabled: r.enabled, required: r.required };
    }
    tabs[tab] = {
      builtins,
      custom: resolved.custom.map((c) => ({ ...c, options: [...c.options] })),
    };
  }
  return { methods, tabs };
}

/** `embedded` renders the editor as a SECTION of `Sales Order Settings` —
 *  same form, same config row, no second page header. It is a placement flag
 *  and nothing else: there is still exactly one Order Entry editor. */
export default function OrderEntryPage({ embedded = false }: { embedded?: boolean } = {}) {
  const cfgQ = useOrderEntryConfig();
  const saveMut = useUpdateOrderEntryConfig();

  const [draft, setDraft] = useState<Draft | null>(null);
  const [editingMethod, setEditingMethod] = useState<number | null>(null);
  const [addingMethod, setAddingMethod] = useState(false);
  const [editingFields, setEditingFields] = useState(false);
  const [newMethodName, setNewMethodName] = useState("");
  const [newFieldNames, setNewFieldNames] = useState<Record<OrderEntryTab, string>>({
    customer: "",
    address: "",
    emergency: "",
    target: "",
  });

  const entryConfig = cfgQ.data?.entryConfig;
  useEffect(() => {
    if (entryConfig && !draft) setDraft(initDraft(entryConfig));
  }, [entryConfig, draft]);

  // ------------------------------------------------------------------ methods

  function updateMethod(i: number, patch: Partial<PaymentMethodConfig>) {
    setDraft((d) =>
      d ? { ...d, methods: d.methods.map((m, idx) => (idx === i ? { ...m, ...patch } : m)) } : d,
    );
  }

  function updateFollowUp(
    i: number,
    j: number,
    patch: Partial<PaymentMethodConfig["followUps"][number]>,
  ) {
    setDraft((d) =>
      d
        ? {
            ...d,
            methods: d.methods.map((m, idx) =>
              idx === i
                ? {
                    ...m,
                    followUps: m.followUps.map((f, jdx) => (jdx === j ? { ...f, ...patch } : f)),
                  }
                : m,
            ),
          }
        : d,
    );
  }

  function addFollowUp(i: number) {
    setDraft((d) => {
      if (!d) return d;
      const m = d.methods[i];
      if (m.followUps.length >= 3) return d;
      const used = new Set(m.followUps.map((f) => f.key));
      let n = 1;
      while (used.has(`q${n}`)) n++;
      return {
        ...d,
        methods: d.methods.map((mm, idx) =>
          idx === i
            ? {
                ...mm,
                followUps: [
                  ...mm.followUps,
                  { key: `q${n}`, label: "", options: [], required: false },
                ],
              }
            : mm,
        ),
      };
    });
  }

  function removeFollowUp(i: number, j: number) {
    setDraft((d) =>
      d
        ? {
            ...d,
            methods: d.methods.map((m, idx) =>
              idx === i ? { ...m, followUps: m.followUps.filter((_, jdx) => jdx !== j) } : m,
            ),
          }
        : d,
    );
  }

  function addMethod() {
    if (!draft) return;
    const name = newMethodName.trim();
    const key = kebabKey(name);
    if (!name || !key) {
      toast.error("Enter a method name first");
      return;
    }
    if (draft.methods.length >= 12) {
      toast.error("Max 12 payment methods");
      return;
    }
    if (draft.methods.some((m) => m.key === key)) {
      toast.error(`A method with key "${key}" already exists`);
      return;
    }
    setDraft({
      ...draft,
      methods: [
        ...draft.methods,
        {
          key,
          label: name.slice(0, 40),
          sublabel: "",
          active: true,
          approvalCodeRequired: false,
          followUps: [],
        },
      ],
    });
    setEditingMethod(draft.methods.length);
    setAddingMethod(false);
    setNewMethodName("");
  }

  // -------------------------------------------------------------- form fields

  function setBuiltin(tab: OrderEntryTab, key: string, patch: Partial<BuiltinToggle>) {
    setDraft((d) =>
      d
        ? {
            ...d,
            tabs: {
              ...d.tabs,
              [tab]: {
                ...d.tabs[tab],
                builtins: {
                  ...d.tabs[tab].builtins,
                  [key]: { ...d.tabs[tab].builtins[key], ...patch },
                },
              },
            },
          }
        : d,
    );
  }

  function updateCustom(tab: OrderEntryTab, i: number, patch: Partial<CustomField>) {
    setDraft((d) =>
      d
        ? {
            ...d,
            tabs: {
              ...d.tabs,
              [tab]: {
                ...d.tabs[tab],
                custom: d.tabs[tab].custom.map((c, idx) => (idx === i ? { ...c, ...patch } : c)),
              },
            },
          }
        : d,
    );
  }

  function removeCustom(tab: OrderEntryTab, i: number) {
    setDraft((d) =>
      d
        ? {
            ...d,
            tabs: {
              ...d.tabs,
              [tab]: { ...d.tabs[tab], custom: d.tabs[tab].custom.filter((_, idx) => idx !== i) },
            },
          }
        : d,
    );
  }

  function addCustom(tab: OrderEntryTab) {
    if (!draft) return;
    const name = newFieldNames[tab].trim();
    const key = kebabKey(name);
    if (!name || !key) {
      toast.error("Enter a field name first");
      return;
    }
    if (draft.tabs[tab].custom.length >= 12) {
      toast.error("Max 12 custom fields per tab");
      return;
    }
    // Keys are unique across ALL tabs (and never shadow a builtin).
    const taken = new Set<string>(POS_FORM_BUILTINS.map((f) => f.key));
    for (const t of ORDER_ENTRY_TABS) for (const c of draft.tabs[t].custom) taken.add(c.key);
    if (taken.has(key)) {
      toast.error(`A field with key "${key}" already exists`);
      return;
    }
    setDraft({
      ...draft,
      tabs: {
        ...draft.tabs,
        [tab]: {
          ...draft.tabs[tab],
          custom: [
            ...draft.tabs[tab].custom,
            { key, label: name.slice(0, 60), type: "text", required: false, options: [] },
          ],
        },
      },
    });
    setNewFieldNames((n) => ({ ...n, [tab]: "" }));
  }

  // --------------------------------------------------------------------- save

  function onSave(nextDraft: Draft | null = draft) {
    if (!nextDraft) return;

    // Client-side guards (the server zod re-validates everything).
    for (const m of nextDraft.methods) {
      if (!m.label.trim()) {
        toast.error(`Payment method "${m.key}" needs a label`);
        return;
      }
      for (const f of m.followUps) {
        if (!f.label.trim()) {
          toast.error(`Required information on "${m.label.trim()}" needs a label`);
          return;
        }
        const opts = cleanOptions(f.options);
        if (opts.length === 0) {
          toast.error(`Required information "${f.label.trim()}" needs at least one option`);
          return;
        }
        if (opts.length > 60 || opts.some((o) => o.length > 60)) {
          toast.error(`Required information "${f.label.trim()}": max 60 options, 60 characters each`);
          return;
        }
      }
    }
    for (const tab of ORDER_ENTRY_TABS) {
      for (const c of nextDraft.tabs[tab].custom) {
        if (!c.label.trim()) {
          toast.error(`A custom field on the ${TAB_LABELS[tab]} tab needs a label`);
          return;
        }
        if (c.type === "select") {
          const opts = cleanOptions(c.options);
          if (opts.length === 0) {
            toast.error(`Select field "${c.label.trim()}" needs at least one option`);
            return;
          }
          if (opts.length > 60 || opts.some((o) => o.length > 60)) {
            toast.error(`Select field "${c.label.trim()}": max 60 options, 60 characters each`);
            return;
          }
        }
      }
    }

    const paymentMethods: PaymentMethodConfig[] = nextDraft.methods.map((m) => ({
      key: m.key,
      label: m.label.trim(),
      sublabel: m.sublabel.trim(),
      active: m.active,
      approvalCodeRequired: m.approvalCodeRequired,
      followUps: m.followUps.map((f) => ({
        key: f.key,
        label: f.label.trim(),
        options: cleanOptions(f.options),
        required: f.required,
      })),
    }));

    // Only overrides + customs; locked builtin keys never appear.
    const formFields: FormFieldsConfig = {};
    for (const tab of ORDER_ENTRY_TABS) {
      const t = nextDraft.tabs[tab];
      formFields[tab] = {
        builtins: Object.fromEntries(
          Object.entries(t.builtins).map(([k, v]) => [
            k,
            { enabled: v.enabled, required: v.enabled ? v.required : false },
          ]),
        ),
        custom: t.custom.map((c) => ({
          key: c.key,
          label: c.label.trim(),
          type: c.type,
          required: c.required,
          options: c.type === "select" ? cleanOptions(c.options) : [],
        })),
      };
    }

    saveMut.mutate(
      { paymentMethods, formFields },
      {
        onSuccess: (res) => {
          toast.success("Order entry config saved — the POS updates on next load");
          setDraft(initDraft(res.entryConfig));
        },
        onError: (e) => toast.error(e.message ?? "Save failed"),
      },
    );
  }

  function onReset() {
    if (entryConfig) setDraft(initDraft(entryConfig));
  }

  function closeMethodDrawer() {
    if (entryConfig) setDraft(initDraft(entryConfig));
    setEditingMethod(null);
    setAddingMethod(false);
    setNewMethodName("");
  }

  function requiredInformationSummary(method: PaymentMethodConfig): string[] {
    return method.followUps.map((field) => {
      const noun = field.label.toLowerCase() === "bank" ? "accepted banks" : `${field.label.toLowerCase()} options`;
      return field.options.length > 4
        ? `${field.options.length} ${noun}`
        : `${field.label}: ${field.options.join(", ")}`;
    });
  }

  // ----------------------------------------------------------------- render

  return (
    <div className={embedded ? "" : "px-9 py-8 pb-14 max-w-[880px]"}>
      <div className="mb-6">
        {embedded ? (
          <>
            <div className="label mb-1.5">Order Entry</div>
            <p className="text-meta text-base-500">
              What the POS asks when an order is opened, and the payment methods offered at
              checkout. Shared by everyone.
            </p>
          </>
        ) : (
          <>
            <div className="kicker">Point of Sale</div>
            <h1 className="text-page font-display mt-1.5 text-base-900">Order Entry</h1>
            <p className="text-body text-base-600 mt-1">
              Configure the POS "Open Sales Order" format: the payment methods offered at
              checkout and the Customer-step form fields. Saved config is shared for everyone.
            </p>
          </>
        )}
      </div>

      {cfgQ.isLoading && <div className="text-body text-base-500">Loading config…</div>}
      {cfgQ.isError && !cfgQ.isLoading && (
        <div className="text-body text-danger">Failed to load the order entry config.</div>
      )}

      {draft && (
        <>
          {/* ------------------------------------------------ payment methods */}
          <section className="mb-6 rounded-card border border-base-200 bg-white p-5 shadow-sm" data-testid="payment-methods-panel" data-settings-pattern="2990-maintenance-panel">
            <header className="mb-4 flex items-start justify-between gap-4">
              <div><h2 className="text-strong font-display text-base-900">Payment methods</h2><p className="mt-1 text-meta text-base-500">Methods offered at checkout. Open one method to change its fields.</p></div>
              <Button variant="neutral" size="sm" icon="add" onClick={() => setAddingMethod(true)}>Add payment method</Button>
            </header>
          <div className="space-y-2">
            {draft.methods.map((m, i) => (
              <div key={m.key} data-testid={`payment-method-${m.key}`} data-status={m.active ? "active" : "inactive"} className={`grid min-h-16 items-center gap-3 rounded-control border border-base-200 bg-base-50 px-4 py-3 sm:grid-cols-[1fr_auto_auto] ${m.active ? "" : "opacity-55"}`}>
                    <div>
                      <div className="text-body font-medium text-base-900">{m.label}</div>
                      <div className="mt-0.5 text-meta text-base-600">{m.sublabel || "No checkout label"}</div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-meta text-base-500">
                        <span>Approval code required: {m.approvalCodeRequired ? "Yes" : "No"}</span>
                        {requiredInformationSummary(m).map((summary) => <span key={summary}>{summary}</span>)}
                      </div>
                    </div>
                    <span className={`text-meta font-medium ${m.active ? "text-success" : "text-base-500"}`}>{m.active ? "Active" : "Inactive"}</span>
                    <Button variant="neutral" size="sm" icon="edit" aria-label={`Edit ${m.label}`} onClick={() => setEditingMethod(i)}>Edit</Button>
              </div>
            ))}
            {/* 0230 — Stripe is a SYSTEM method (0224): appended to every
                checkout as "Pay online — Stripe QR / link" with system-generated
                proof, so there is nothing to configure. Shown read-only so this
                page reflects the FULL method list the POS offers. */}
            <div
              className="grid min-h-16 items-center gap-3 rounded-control border border-base-200 bg-base-50 px-4 py-3 opacity-60 sm:grid-cols-[1fr_auto]"
              data-testid="entry-config-stripe-row"
            >
              <div><div className="flex items-center gap-2 text-body font-medium text-base-800"><Lock className="h-3.5 w-3.5" />{STRIPE_PAYMENT_METHOD.label}</div><div className="mt-0.5 text-meta text-base-500"><span>{STRIPE_PAYMENT_METHOD.sublabel}</span> · always offered at checkout</div></div>
              <span className="text-label uppercase tracking-[0.05em] text-base-500">System managed</span>
            </div>
          </div>
          </section>

          <Drawer open={editingMethod !== null || addingMethod} onOpenChange={(open) => { if (!open) closeMethodDrawer(); }} title={addingMethod ? "Add payment method" : "Edit payment method"} description={addingMethod ? "Create a checkout method for new Sales Orders." : "Change this method without exposing configuration fields on the Settings page."} footer={addingMethod ? <><Button variant="ghost" onClick={closeMethodDrawer}>Cancel</Button><Button variant="primary" icon="add" onClick={addMethod}>Add method</Button></> : <>{editingMethod !== null && !PROTECTED_METHOD_KEYS.has(draft.methods[editingMethod]?.key ?? "") && <Button variant="neutral" icon="delete" onClick={() => { const next = { ...draft, methods: draft.methods.filter((_, idx) => idx !== editingMethod) }; setDraft(next); onSave(next); setEditingMethod(null); }}>Remove method</Button>}<Button variant="ghost" onClick={closeMethodDrawer}>Cancel</Button><Button variant="primary" onClick={() => { onSave(); setEditingMethod(null); }}>Save changes</Button></>}>
            {addingMethod ? <label className="block"><span className="label mb-1.5 block">Method name</span><input value={newMethodName} onChange={(e) => setNewMethodName(e.target.value)} maxLength={40} placeholder="New method name…" aria-label="New method name" className={INPUT_CLS} />{newMethodName.trim() !== "" && <span className="mt-2 block text-meta text-base-400">Permanent key: <span className="font-mono">{kebabKey(newMethodName) || "—"}</span></span>}</label> : editingMethod !== null ? (() => {
              const m = draft.methods[editingMethod]; if (!m) return null; const i = editingMethod;
              return <div className="space-y-5"><div className="grid gap-4 sm:grid-cols-2"><label><span className="label mb-1.5 block">Display name</span><input value={m.label} onChange={(e) => updateMethod(i, { label: e.target.value })} maxLength={40} aria-label={`${m.key} label`} className={INPUT_CLS} /></label><label><span className="label mb-1.5 block">Checkout label</span><input value={m.sublabel} onChange={(e) => updateMethod(i, { sublabel: e.target.value })} maxLength={60} placeholder="Checkout label" aria-label={`${m.key} sublabel`} className={INPUT_CLS} /></label></div><div className="space-y-3 rounded-control border border-base-200 bg-base-50 p-4"><label className="flex items-center gap-2 text-body text-base-700"><input type="checkbox" checked={m.active} onChange={(e) => updateMethod(i, { active: e.target.checked })} aria-label={`${m.key} active`} />Active</label><label className="flex items-center gap-2 text-body text-base-700"><input type="checkbox" checked={m.approvalCodeRequired} onChange={(e) => updateMethod(i, { approvalCodeRequired: e.target.checked })} aria-label={`${m.key} approval code required`} />Approval code required</label></div><section><div className="mb-2 flex items-center justify-between"><div><div className="text-body font-medium text-base-900">Required information</div><p className="text-meta text-base-500">Questions shown after this payment method is selected.</p></div>{m.followUps.length < 3 && <Button variant="neutral" size="sm" icon="add" onClick={() => addFollowUp(i)}>Add required information</Button>}</div><div className="space-y-3">{m.followUps.map((fu, j) => <div key={fu.key} className="rounded-control border border-base-200 p-3"><div className="grid gap-3 sm:grid-cols-[1fr_auto]"><input value={fu.label} onChange={(e) => updateFollowUp(i, j, { label: e.target.value })} maxLength={60} placeholder="Required information label" aria-label={`${m.key} required information ${fu.key} label`} className={INPUT_CLS} /><Button variant="ghost" size="sm" icon="delete" aria-label={`Remove required information ${fu.label || fu.key}`} onClick={() => removeFollowUp(i, j)}>Remove</Button></div><textarea value={fu.options.join("\n")} onChange={(e) => updateFollowUp(i, j, { options: e.target.value.split("\n") })} rows={6} placeholder="One option per line" aria-label={`${m.key} required information ${fu.key} options`} className={`${INPUT_CLS} mt-3 font-mono`} /><label className="mt-3 flex items-center gap-2 text-meta text-base-700"><input type="checkbox" checked={fu.required} onChange={(e) => updateFollowUp(i, j, { required: e.target.checked })} aria-label={`${m.key} required information ${fu.key} required`} />Required</label></div>)}</div></section></div>;
            })() : null}
          </Drawer>

          {/* --------------------------------------------------- form fields */}
          <div className="label mb-1.5">Form fields — POS Customer step</div>
          {!editingFields ? (
            <div className="mb-6 grid items-start gap-3 rounded-[4px] border border-base-200 px-3 py-3 sm:grid-cols-[1fr_auto]">
              <p className="text-meta text-base-600">Customer, address, emergency and target-date fields · {ORDER_ENTRY_TABS.reduce((count, tab) => count + draft.tabs[tab].custom.length, 0)} custom fields</p>
              <button type="button" aria-label="Edit Order Entry fields" className="btn-ghost text-meta" onClick={() => setEditingFields(true)}>Edit →</button>
            </div>
          ) : <>
          <p className="text-meta text-base-500 mb-3">Locked fields always show. Custom fields are stored on the order and shown in its detail.</p>

          {ORDER_ENTRY_TABS.map((tab) => {
            const t = draft.tabs[tab];
            const builtins = POS_FORM_BUILTINS.filter((f) => f.tab === tab);
            return (
              <div key={tab} className="mb-5">
                <div className="text-strong font-display text-base-800 mb-1.5">{TAB_LABELS[tab]}</div>
                <div className="border border-base-200 rounded-[4px] divide-y divide-base-100">
                  {builtins.map((f) => {
                    if (f.locked) {
                      return (
                        <div key={f.key} className="flex items-center gap-2 px-3 py-1.5 opacity-60">
                          <Lock className="w-3 h-3 text-base-400 shrink-0" />
                          <span className="text-body text-base-500">{f.label}</span>
                          <span className="text-label uppercase tracking-[0.05em] text-base-400 ml-auto">locked</span>
                        </div>
                      );
                    }
                    const st = t.builtins[f.key];
                    return (
                      <div key={f.key} className="flex items-center gap-4 px-3 py-1.5">
                        <span className="text-body text-base-700 flex-1">{f.label}</span>
                        <label className="flex items-center gap-1.5 text-meta text-base-600 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={st.enabled}
                            onChange={(e) =>
                              setBuiltin(tab, f.key, {
                                enabled: e.target.checked,
                                required: e.target.checked ? f.defaultRequired : false,
                              })
                            }
                            aria-label={`${f.label} enabled`}
                          />
                          Enabled
                        </label>
                        <label
                          className={`flex items-center gap-1.5 text-meta text-base-600 ${
                            !st.enabled || !f.requiredToggleable
                              ? "opacity-40"
                              : "cursor-pointer"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={st.required}
                            disabled={!st.enabled || !f.requiredToggleable}
                            onChange={(e) => setBuiltin(tab, f.key, { required: e.target.checked })}
                            aria-label={`${f.label} required`}
                          />
                          Required
                        </label>
                      </div>
                    );
                  })}

                  {t.custom.map((cf, i) => (
                    <div key={cf.key} className="px-3 py-2 bg-base-50/60">
                      <div className="flex items-center gap-2 flex-wrap">
                        <input
                          value={cf.label}
                          onChange={(e) => updateCustom(tab, i, { label: e.target.value })}
                          maxLength={60}
                          aria-label={`${tab} custom ${cf.key} label`}
                          className={`${INPUT_CLS} max-w-[180px]`}
                        />
                        <span className="text-meta text-base-400 font-mono">{cf.key}</span>
                        <select
                          value={cf.type}
                          onChange={(e) =>
                            updateCustom(tab, i, { type: e.target.value as CustomFieldType })
                          }
                          aria-label={`${tab} custom ${cf.key} type`}
                          className={`${INPUT_CLS} max-w-[110px]`}
                        >
                          {FIELD_TYPES.map((ty) => (
                            <option key={ty} value={ty}>
                              {ty}
                            </option>
                          ))}
                        </select>
                        <label className="flex items-center gap-1.5 text-meta text-base-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={cf.required}
                            onChange={(e) => updateCustom(tab, i, { required: e.target.checked })}
                            aria-label={`${tab} custom ${cf.key} required`}
                          />
                          Required
                        </label>
                        <button
                          type="button"
                          onClick={() => removeCustom(tab, i)}
                          aria-label={`Remove field ${cf.label || cf.key}`}
                          className="ml-auto text-base-400 hover:text-danger"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      {cf.type === "select" && (
                        <textarea
                          value={cf.options.join("\n")}
                          onChange={(e) =>
                            updateCustom(tab, i, { options: e.target.value.split("\n") })
                          }
                          rows={3}
                          placeholder="One option per line"
                          aria-label={`${tab} custom ${cf.key} options`}
                          className={`${INPUT_CLS} mt-2 font-mono`}
                        />
                      )}
                    </div>
                  ))}
                </div>

                <div className="flex items-center gap-2 mt-2">
                  <input
                    value={newFieldNames[tab]}
                    onChange={(e) => setNewFieldNames((n) => ({ ...n, [tab]: e.target.value }))}
                    maxLength={60}
                    placeholder="New field label…"
                    aria-label={`New ${tab} field name`}
                    className={`${INPUT_CLS} max-w-[220px]`}
                  />
                  {newFieldNames[tab].trim() !== "" && (
                    <span className="text-meta text-base-400 font-mono">
                      {kebabKey(newFieldNames[tab]) || "—"}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => addCustom(tab)}
                    className="btn-ghost text-meta inline-flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add field
                  </button>
                </div>
              </div>
            );
          })}

          {/* ---------------------------------------------------------- save */}
          <div className="flex justify-end gap-2 mt-2">
            <button type="button" onClick={() => { onReset(); setEditingFields(false); }} className="btn-ghost text-meta">
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onSave()}
              disabled={saveMut.isPending}
              className="btn-primary text-meta disabled:opacity-40"
            >
              {saveMut.isPending ? "Saving…" : "Save changes"}
            </button>
          </div>
          </>}
        </>
      )}
    </div>
  );
}
