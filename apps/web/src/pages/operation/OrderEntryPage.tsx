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

// ===========================================================================
// Order Entry config page (0219) — the config center for the POS "Open Sales
// Order" format, reached from the POS sidebar's Maintain section (was a modal
// inside SO Maintenance until 2026-07-12). Two sections:
//   1. Payment methods — add/remove/toggle methods, per-method approval-code
//      toggle + follow-up dropdowns (e.g. the Bank list on Credit/Debit).
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
  // code defaults (incl. Cash + the bank follow-up on Credit/Debit).
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

export default function OrderEntryPage() {
  const cfgQ = useOrderEntryConfig();
  const saveMut = useUpdateOrderEntryConfig();

  const [draft, setDraft] = useState<Draft | null>(null);
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
    setNewMethodName("");
  }

  function removeMethod(i: number) {
    setDraft((d) => (d ? { ...d, methods: d.methods.filter((_, idx) => idx !== i) } : d));
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

  function onSave() {
    if (!draft) return;

    // Client-side guards (the server zod re-validates everything).
    for (const m of draft.methods) {
      if (!m.label.trim()) {
        toast.error(`Payment method "${m.key}" needs a label`);
        return;
      }
      for (const f of m.followUps) {
        if (!f.label.trim()) {
          toast.error(`A follow-up on "${m.label.trim()}" needs a label`);
          return;
        }
        const opts = cleanOptions(f.options);
        if (opts.length === 0) {
          toast.error(`Follow-up "${f.label.trim()}" needs at least one option`);
          return;
        }
        if (opts.length > 60 || opts.some((o) => o.length > 60)) {
          toast.error(`Follow-up "${f.label.trim()}": max 60 options, 60 characters each`);
          return;
        }
      }
    }
    for (const tab of ORDER_ENTRY_TABS) {
      for (const c of draft.tabs[tab].custom) {
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

    const paymentMethods: PaymentMethodConfig[] = draft.methods.map((m) => ({
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
      const t = draft.tabs[tab];
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

  // ----------------------------------------------------------------- render

  return (
    <div className="px-9 py-8 pb-14 max-w-[880px]">
      <div className="mb-6">
        <div className="kicker">Point of Sale</div>
        <h1 className="text-page font-display mt-1.5 text-base-900">Order Entry</h1>
        <p className="text-body text-base-600 mt-1">
          Configure the POS "Open Sales Order" format: the payment methods offered at
          checkout and the Customer-step form fields. Saved config is shared for everyone.
        </p>
      </div>

      {cfgQ.isLoading && <div className="text-body text-base-500">Loading config…</div>}
      {cfgQ.isError && !cfgQ.isLoading && (
        <div className="text-body text-danger">Failed to load the order entry config.</div>
      )}

      {draft && (
        <>
          {/* ------------------------------------------------ payment methods */}
          <div className="label mb-1.5">Payment methods</div>
          <div className="border border-base-200 rounded-[4px] divide-y divide-base-100 mb-2">
            {draft.methods.map((m, i) => (
              <div key={m.key} className="px-3 py-2.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <input
                    value={m.label}
                    onChange={(e) => updateMethod(i, { label: e.target.value })}
                    maxLength={40}
                    aria-label={`${m.key} label`}
                    className={`${INPUT_CLS} max-w-[170px]`}
                  />
                  <input
                    value={m.sublabel}
                    onChange={(e) => updateMethod(i, { sublabel: e.target.value })}
                    maxLength={60}
                    placeholder="Sublabel"
                    aria-label={`${m.key} sublabel`}
                    className={`${INPUT_CLS} max-w-[170px]`}
                  />
                  <span className="text-meta text-base-400 font-mono">{m.key}</span>
                  <label className="flex items-center gap-1.5 text-meta text-base-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={m.active}
                      onChange={(e) => updateMethod(i, { active: e.target.checked })}
                      aria-label={`${m.key} active`}
                    />
                    Active
                  </label>
                  <label className="flex items-center gap-1.5 text-meta text-base-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={m.approvalCodeRequired}
                      onChange={(e) => updateMethod(i, { approvalCodeRequired: e.target.checked })}
                      aria-label={`${m.key} approval code required`}
                    />
                    Approval code required
                  </label>
                  {!PROTECTED_METHOD_KEYS.has(m.key) && (
                    <button
                      type="button"
                      onClick={() => removeMethod(i)}
                      aria-label={`Remove ${m.label || m.key}`}
                      className="ml-auto text-base-400 hover:text-danger"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="mt-2 ml-4 pl-3 border-l-2 border-base-100 space-y-2">
                  {m.followUps.map((fu, j) => (
                    <div key={fu.key} className="flex items-start gap-2 flex-wrap">
                      <input
                        value={fu.label}
                        onChange={(e) => updateFollowUp(i, j, { label: e.target.value })}
                        maxLength={60}
                        placeholder="Follow-up label"
                        aria-label={`${m.key} follow-up ${fu.key} label`}
                        className={`${INPUT_CLS} max-w-[160px]`}
                      />
                      <textarea
                        value={fu.options.join("\n")}
                        onChange={(e) => updateFollowUp(i, j, { options: e.target.value.split("\n") })}
                        rows={3}
                        placeholder="One option per line"
                        aria-label={`${m.key} follow-up ${fu.key} options`}
                        className={`${INPUT_CLS} flex-1 min-w-[200px] font-mono`}
                      />
                      <label className="flex items-center gap-1.5 text-meta text-base-700 cursor-pointer mt-2">
                        <input
                          type="checkbox"
                          checked={fu.required}
                          onChange={(e) => updateFollowUp(i, j, { required: e.target.checked })}
                          aria-label={`${m.key} follow-up ${fu.key} required`}
                        />
                        Required
                      </label>
                      <button
                        type="button"
                        onClick={() => removeFollowUp(i, j)}
                        aria-label={`Remove follow-up ${fu.label || fu.key}`}
                        className="text-base-400 hover:text-danger mt-2"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  {m.followUps.length < 3 && (
                    <button
                      type="button"
                      onClick={() => addFollowUp(i)}
                      className="btn-ghost text-meta"
                    >
                      + Add follow-up
                    </button>
                  )}
                </div>
              </div>
            ))}
            {/* 0230 — Stripe is a SYSTEM method (0224): appended to every
                checkout as "Pay online — Stripe QR / link" with system-generated
                proof, so there is nothing to configure. Shown read-only so this
                page reflects the FULL method list the POS offers. */}
            <div
              className="px-3 py-2.5 flex items-center gap-2 opacity-60"
              data-testid="entry-config-stripe-row"
            >
              <Lock className="w-3 h-3 text-base-400 shrink-0" />
              <span className="text-body text-base-700">{STRIPE_PAYMENT_METHOD.label}</span>
              <span className="text-meta text-base-500">{STRIPE_PAYMENT_METHOD.sublabel}</span>
              <span className="text-meta text-base-400 font-mono">{STRIPE_PAYMENT_METHOD.key}</span>
              <span className="text-label uppercase tracking-[0.05em] text-base-400 ml-auto">
                system · always offered at checkout
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 mb-6">
            <input
              value={newMethodName}
              onChange={(e) => setNewMethodName(e.target.value)}
              maxLength={40}
              placeholder="New method name…"
              aria-label="New method name"
              className={`${INPUT_CLS} max-w-[220px]`}
            />
            {newMethodName.trim() !== "" && (
              <span className="text-meta text-base-400 font-mono">
                {kebabKey(newMethodName) || "—"}
              </span>
            )}
            <button
              type="button"
              onClick={addMethod}
              className="btn-secondary text-meta inline-flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" /> Add method
            </button>
          </div>

          {/* --------------------------------------------------- form fields */}
          <div className="label mb-1.5">Form fields — POS Customer step</div>
          <p className="text-meta text-base-500 mb-3">
            Locked fields are the structural spine (order identity / date engine) and
            always show. Custom fields are stored on the order and shown in the detail.
          </p>

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
            <button type="button" onClick={onReset} className="btn-ghost text-meta">
              Reset
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={saveMut.isPending}
              className="btn-primary text-meta disabled:opacity-40"
            >
              {saveMut.isPending ? "Saving…" : "Save"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
