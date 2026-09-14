// design-standard: not-a-list-page — this is a central Settings editor, not a Register.
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import Button from "@/components/kit/Button";
import Input from "@/components/kit/Input";
import PageShell from "@/components/kit/PageShell";
import Select from "@/components/kit/Select";
import DatePicker from "@/components/kit/DatePicker";
import PaymentTemplateLibrary from "./PaymentTemplateLibrary";
import { rm } from "@/lib/format-currency";
import { fmtDate } from "@/lib/fmt-date";
import { toast } from "sonner";
import type { PaymentMethodRegistryRow } from "@carres/shared";
import {
  PAYMENT_METHODS_QUERY_KEY,
  manualMethodSpec,
  usePaymentMethodRegistry,
} from "@/lib/payment-methods";
import { qk, usePaymentSettings, type PaymentSettingsPayload } from "@/lib/queries";

/**
 * Settings → Payments (payment/MASTER.md §12 · §16; owner ruling 2026-09-12;
 * migrations 0431 · 0486).
 *
 * The Settings Template: plain-language groups, readable summaries and a
 * focused, authorised `Edit` per section; saving goes through `Review
 * changes`. The ruled section order:
 *
 *   Receiving bank accounts · Which bank to use · Payment methods ·
 *   Collection timing · WhatsApp templates · Invoice and Receipt numbers ·
 *   Storage charges · Online payment provider
 *
 * Every effective change records old value · new value · effective from ·
 * changed by · changed on · reason. No approver name, collection owner or staff
 * roster lives here (Workspace → Staff & Duties owns people). Numbering shows
 * only the next example and `Numbers are created automatically.`
 */
type BankAccount = PaymentSettingsPayload["bank_accounts"][number];
type StorageRule = PaymentSettingsPayload["storage_rules"][number];
type TimingRule = PaymentSettingsPayload["collection_timing"][number];

const SOURCE_WORD: Record<BankAccount["route_source"], string> = {
  pj_showroom: "PJ own-showroom order",
  dealer: "Dealer order",
};
const GROUP_WORD: Record<StorageRule["product_group"], string> = {
  mattress_bedframe: "Mattress / Bedframe",
  sofa: "Sofa",
};

function nextNumberExample(prefix: string): string {
  const d = new Date();
  const kl = new Date(d.toLocaleString("en-US", { timeZone: "Asia/Kuala_Lumpur" }));
  const dd = String(kl.getDate()).padStart(2, "0");
  const mm = String(kl.getMonth() + 1).padStart(2, "0");
  const yy = String(kl.getFullYear()).slice(-2);
  return `${prefix}-${dd}${mm}${yy}-0001`;
}

function todayIso() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kuala_Lumpur" });
}

function Section({ title, lead, children, testId }: {
  title: string; lead?: string; children: React.ReactNode; testId?: string;
}) {
  return <section className="rounded-card border border-kit-slate-5 bg-white p-5" data-testid={testId}>
    <h2 className="text-section">{title}</h2>
    {lead && <p className="mt-1 text-body text-kit-slate-11">{lead}</p>}
    {children}
  </section>;
}

export default function PaymentSettings() {
  const qc = useQueryClient();
  const query = usePaymentSettings();
  const [editing, setEditing] = useState<BankAccount["route_source"] | null>(null);
  const [accountName, setAccountName] = useState("");
  const [accountNo, setAccountNo] = useState("");
  const refresh = () => void qc.invalidateQueries({ queryKey: qk.finance.paymentSettings() });
  const saveAccount = useMutation({
    mutationFn: (input: { routeSource: string; bankName: string; accountName: string; accountNo: string }) =>
      apiFetch("/api/finance/payment-settings/bank-account", {
        method: "POST", body: JSON.stringify(input),
      }),
    onSuccess: () => {
      toast.success("Receiving account saved");
      setEditing(null);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (query.isError) {
    return <PageShell variant="settings" title="Payment Settings">
      <div role="alert" className="p-6 text-body">
        <p>Payment settings could not be loaded. Try again.</p>
        <button className="btn-secondary mt-3" onClick={() => void query.refetch()}>Try again</button>
      </div>
    </PageShell>;
  }
  const data = query.data;
  // The newest effective row per group is the CURRENT rule.
  const currentRules = new Map<string, StorageRule>();
  for (const rule of data?.storage_rules ?? []) {
    if (!currentRules.has(rule.product_group)) currentRules.set(rule.product_group, rule);
  }
  const timing = data?.collection_timing?.[0] ?? null;
  return <PageShell variant="settings" title="Payment Settings">
    <div className="mx-auto grid w-full max-w-4xl gap-5 overflow-auto p-5" data-testid="payment-settings">

      <Section title="Receiving bank accounts"
        lead="The system picks the bank from the order source. Staff never choose or type an account.">
        <div className="mt-3 space-y-2">
          {(data?.bank_accounts ?? []).map((a) => <div key={a.route_source} className="text-body">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-semibold">{SOURCE_WORD[a.route_source]} → {a.bank_name}</div>
                <div className="text-label font-normal">
                  {a.account_name && a.account_no
                    ? `${a.account_name} · ${a.account_no}`
                    : "The account is not entered yet. Ask a manager to add it."}
                </div>
              </div>
              {editing !== a.route_source && <Button variant="neutral" onClick={() => {
                setEditing(a.route_source);
                setAccountName(a.account_name ?? "");
                setAccountNo(a.account_no ?? "");
              }}>Edit</Button>}
            </div>
            {editing === a.route_source && <div className="mt-2 grid grid-cols-2 gap-3">
              <Input id={`acc-name-${a.route_source}`} label="Account name" value={accountName}
                onChange={(e) => setAccountName(e.target.value)} />
              <Input id={`acc-no-${a.route_source}`} label="Account number" value={accountNo}
                onChange={(e) => setAccountNo(e.target.value)} />
              <div className="col-span-2 flex gap-2">
                <Button variant="primary" loading={saveAccount.isPending}
                  onClick={() => saveAccount.mutate({
                    routeSource: a.route_source, bankName: a.bank_name,
                    accountName: accountName.trim(), accountNo: accountNo.trim(),
                  })}>Save account</Button>
                <Button variant="neutral" onClick={() => setEditing(null)}>Cancel</Button>
              </div>
            </div>}
          </div>)}
        </div>
      </Section>

      <Section title="Which bank to use" testId="payment-settings-routing">
        <div className="mt-2 space-y-1 text-body">
          {(data?.bank_accounts ?? []).map((a) => <p key={a.route_source}>
            {SOURCE_WORD[a.route_source]} → {a.bank_name}
          </p>)}
          <p className="text-label font-normal text-kit-slate-11">
            The bank follows the order source automatically. It is not chosen at posting time.
          </p>
        </div>
      </Section>

      <PaymentMethodsCard />

      <CollectionTimingCard current={timing} onSaved={refresh} />

      <Section title="WhatsApp templates"
        lead="Each situation keeps one Default. Only Active templates can be chosen when sending. Saved versions and actual sent messages stay history forever.">
        <div className="mt-3">
          <PaymentTemplateLibrary />
        </div>
      </Section>

      <Section title="Invoice and Receipt numbers">
        <div className="mt-2 text-body space-y-1">
          <p>Next invoice looks like: {nextNumberExample("INV")}</p>
          <p>Next receipt looks like: {nextNumberExample("RC")}</p>
          <p className="font-semibold">Numbers are created automatically.</p>
        </div>
      </Section>

      <Section title="Storage charges"
        lead="A new rule applies to NEW storage only. An existing case keeps the rule it started under.">
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {(["mattress_bedframe", "sofa"] as const).map((group) =>
            <StorageRuleCard key={group} group={group} rule={currentRules.get(group) ?? null} onSaved={refresh} />)}
        </div>
      </Section>

      <Section title="Online payment provider" testId="payment-settings-online-provider"
        lead="Online payment is recorded by the provider, never chosen by hand. A successful provider result posts the Payment and creates the Receipt through the same door as every other payment.">
        <div className="mt-2 text-body">
          <p>{data?.online_provider
            ? `${data.online_provider.name} · ${data.online_provider.configured ? "Connected" : "Not connected"}`
            : "Provider status not available"}</p>
          <p className="text-label font-normal text-kit-slate-11">
            The provider key is a server secret. It is not entered or shown here.
          </p>
        </div>
      </Section>

      <ChangeLog changes={data?.setting_changes ?? []} />
    </div>
  </PageShell>;
}

/**
 * Collection timing (0486) — `Start asking the customer to pay {n} working
 * days before Confirmed Delivery` · `Payment must be complete {m} working
 * days before`. Asking must start earlier than the deadline. A new rule
 * applies to new clocks from its effective date; running clocks keep theirs.
 */
function CollectionTimingCard({ current, onSaved }: { current: TimingRule | null; onSaved: () => void }) {
  const [step, setStep] = useState<"view" | "edit" | "review">("view");
  const [ask, setAsk] = useState(String(current?.ask_days_before ?? 3));
  const [deadline, setDeadline] = useState(String(current?.deadline_days_before ?? 2));
  const [effectiveFrom, setEffectiveFrom] = useState(todayIso());
  const [reason, setReason] = useState("");
  const save = useMutation({
    mutationFn: () => apiFetch("/api/finance/payment-settings/collection-timing", {
      method: "POST",
      body: JSON.stringify({
        askDaysBefore: Number(ask), deadlineDaysBefore: Number(deadline),
        effectiveFrom, reason: reason.trim(),
      }),
    }),
    onSuccess: () => { toast.success("Collection timing saved"); setStep("view"); setReason(""); onSaved(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const askN = Number(ask), deadlineN = Number(deadline);
  const gap = !Number.isInteger(askN) || !Number.isInteger(deadlineN) || askN < 0 || deadlineN < 0
    ? "enter whole days"
    : askN <= deadlineN ? "asking must start earlier than the payment deadline"
    : !effectiveFrom ? "choose the effective date"
    : !reason.trim() ? "give a reason"
    : null;
  return <Section title="Collection timing" testId="payment-settings-collection-timing">
    <div className="mt-2 text-body space-y-1">
      <p><span className="font-semibold">Start asking the customer to pay</span><br />
        {current ? `${current.ask_days_before} working days before Confirmed Delivery` : "3 working days before Confirmed Delivery (the ruled default)"}</p>
      <p><span className="font-semibold">Payment must be complete</span><br />
        {current ? `${current.deadline_days_before} working days before Confirmed Delivery` : "2 working days before Confirmed Delivery (the ruled default)"}</p>
      {current && <p className="text-label font-normal text-kit-slate-11">
        In effect from {fmtDate(current.effective_from)}{current.reason ? ` · ${current.reason}` : ""}. An action that lands on a Saturday, Sunday or public holiday moves to the previous working day — Operation does not work on Saturday.
      </p>}
      {step === "view" && <Button variant="neutral" onClick={() => {
        setAsk(String(current?.ask_days_before ?? 3));
        setDeadline(String(current?.deadline_days_before ?? 2));
        setStep("edit");
      }}>Edit</Button>}
    </div>
    {step !== "view" && <div className="mt-3 grid grid-cols-2 gap-3 rounded-card border border-kit-slate-5 p-4" data-testid="collection-timing-form">
      <Input id="timing-ask" label="Start asking (working days before Confirmed Delivery)" type="number" min={0} max={60}
        value={ask} onChange={(e) => setAsk(e.target.value)} disabled={step === "review"} />
      <Input id="timing-deadline" label="Payment must be complete (working days before Confirmed Delivery)" type="number" min={0} max={60}
        value={deadline} onChange={(e) => setDeadline(e.target.value)} disabled={step === "review"} />
      <DatePicker id="timing-effective" label="Effective from" value={effectiveFrom} minDate={todayIso()}
        onChange={(iso) => setEffectiveFrom(iso ?? "")} disabled={step === "review"} />
      <Input id="timing-reason" label="Reason" value={reason} maxLength={500}
        onChange={(e) => setReason(e.target.value)} disabled={step === "review"} />
      {step === "review" && <div className="col-span-2 text-body" data-testid="collection-timing-review">
        <p className="font-semibold">Review changes</p>
        <p>Start asking: {current?.ask_days_before ?? 3} → {askN} working days before</p>
        <p>Payment must be complete: {current?.deadline_days_before ?? 2} → {deadlineN} working days before</p>
        <p>Effective from {fmtDate(effectiveFrom)} · {reason.trim()}</p>
        <p className="text-label font-normal text-kit-slate-11">Clocks already running keep their current rule. New clocks from the effective date use the new one.</p>
      </div>}
      <div className="col-span-2 flex gap-2">
        {step === "edit"
          ? <Button variant="primary" disabled={gap !== null} onClick={() => setStep("review")}>
              {gap ? `Review changes — ${gap}` : "Review changes"}</Button>
          : <Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>Save changes</Button>}
        <Button variant="neutral" onClick={() => step === "review" ? setStep("edit") : setStep("view")}>
          {step === "review" ? "Back" : "Cancel"}</Button>
      </div>
    </div>}
  </Section>;
}

/** One readable rule card per Catalog group, with one governed `Edit`. */
function StorageRuleCard({ group, rule, onSaved }: {
  group: StorageRule["product_group"]; rule: StorageRule | null; onSaved: () => void;
}) {
  const [step, setStep] = useState<"view" | "edit" | "review">("view");
  // The draft is taken from the CURRENT rule the moment Edit is pressed — the
  // card mounts before the settings read answers, so a mount-time copy would
  // be empty forever.
  const fromRule = () => ({
    freeDays: String(rule?.free_days ?? ""), chargeAmount: String(rule?.charge_amount ?? ""),
    cycleDays: String(rule?.cycle_days ?? ""), operationLimitDay: String(rule?.operation_limit_day ?? ""),
    waiverLimitDay: String(rule?.waiver_limit_day ?? ""), extraFreeAllowed: rule?.extra_free_allowed ?? false,
    inspectionDays: String(rule?.inspection_days ?? "30"), effectiveFrom: todayIso(), reason: "",
  });
  const [draft, setDraft] = useState(fromRule);
  const set = (k: keyof typeof draft, v: string | boolean) => setDraft((d) => ({ ...d, [k]: v }));
  const n = (v: string) => (v.trim() === "" ? null : Number(v));
  const free = n(draft.freeDays), charge = n(draft.chargeAmount), cycle = n(draft.cycleDays);
  const op = n(draft.operationLimitDay), waiver = n(draft.waiverLimitDay), insp = n(draft.inspectionDays);
  const gap = free == null || charge == null || cycle == null || insp == null
    || !Number.isInteger(free) || !Number.isInteger(cycle) || !Number.isInteger(insp) || free < 0 || charge < 0 || cycle < 1 || insp < 1
    ? "enter the free days, charge, cycle and check interval"
    : draft.extraFreeAllowed && op != null && free > op ? "free days cannot exceed the Operation limit"
    : draft.extraFreeAllowed && op != null && waiver != null && op > waiver ? "the Operation limit cannot exceed the Approver limit"
    : !draft.effectiveFrom ? "choose the effective date"
    : !draft.reason.trim() ? "give a reason"
    : null;
  const save = useMutation({
    mutationFn: () => apiFetch("/api/finance/payment-settings/storage-rule", {
      method: "POST",
      body: JSON.stringify({
        productGroup: group, freeDays: free, chargeAmount: charge, cycleDays: cycle,
        operationLimitDay: draft.extraFreeAllowed ? op : null,
        waiverLimitDay: draft.extraFreeAllowed ? waiver : null,
        extraFreeAllowed: draft.extraFreeAllowed, inspectionDays: insp,
        effectiveFrom: draft.effectiveFrom, reason: draft.reason.trim(),
      }),
    }),
    onSuccess: () => { toast.success("Storage rule saved"); setStep("view"); set("reason", ""); onSaved(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return <div className="rounded-card border border-kit-slate-5 p-4 text-body" data-testid={`storage-card-${group}`}>
    <h3 className="font-semibold">{GROUP_WORD[group]}</h3>
    {rule ? <div className="mt-1 space-y-0.5">
      <p>Free storage {rule.free_days} calendar days</p>
      <p>Charge {rm(Number(rule.charge_amount))}</p>
      <p>Charge every {rule.cycle_days} calendar days</p>
      {rule.extra_free_allowed && rule.operation_limit_day != null
        ? <p>Operation may approve until Day {rule.operation_limit_day}</p> : null}
      {rule.extra_free_allowed && rule.waiver_limit_day != null
        ? <p>Approver may approve until Day {rule.waiver_limit_day}</p> : null}
      {!rule.extra_free_allowed && <p>Extra free storage Not allowed</p>}
      <p>Check stored goods every {rule.inspection_days} calendar days</p>
      <p className="text-label font-normal text-kit-slate-11">In effect from {fmtDate(rule.effective_from)}</p>
    </div> : <p className="mt-1">No rule on record yet.</p>}
    {step === "view" && <Button variant="neutral" onClick={() => { setDraft(fromRule()); setStep("edit"); }}>Edit</Button>}
    {step !== "view" && <div className="mt-3 grid grid-cols-2 gap-3" data-testid={`storage-rule-form-${group}`}>
      <Input id={`sr-free-${group}`} label="Free storage (calendar days)" type="number" min={0}
        value={draft.freeDays} onChange={(e) => set("freeDays", e.target.value)} disabled={step === "review"} />
      <Input id={`sr-charge-${group}`} label="Charge (RM)" type="number" min={0} step="0.01"
        value={draft.chargeAmount} onChange={(e) => set("chargeAmount", e.target.value)} disabled={step === "review"} />
      <Input id={`sr-cycle-${group}`} label="Charge every (calendar days)" type="number" min={1}
        value={draft.cycleDays} onChange={(e) => set("cycleDays", e.target.value)} disabled={step === "review"} />
      <Input id={`sr-insp-${group}`} label="Check stored goods every (calendar days)" type="number" min={1}
        value={draft.inspectionDays} onChange={(e) => set("inspectionDays", e.target.value)} disabled={step === "review"} />
      <label className="col-span-2 flex items-center gap-2 text-body">
        <input type="checkbox" checked={draft.extraFreeAllowed} disabled={step === "review"}
          onChange={(e) => set("extraFreeAllowed", e.target.checked)} />
        <span>Extra free storage allowed</span>
      </label>
      {draft.extraFreeAllowed && <>
        <Input id={`sr-op-${group}`} label="Operation may approve until Day" type="number" min={0}
          value={draft.operationLimitDay} onChange={(e) => set("operationLimitDay", e.target.value)} disabled={step === "review"} />
        <Input id={`sr-waiver-${group}`} label="Approver may approve until Day" type="number" min={0}
          value={draft.waiverLimitDay} onChange={(e) => set("waiverLimitDay", e.target.value)} disabled={step === "review"} />
      </>}
      <DatePicker id={`sr-eff-${group}`} label="Effective from" value={draft.effectiveFrom} minDate={todayIso()}
        onChange={(iso) => set("effectiveFrom", iso ?? "")} disabled={step === "review"} />
      <Input id={`sr-reason-${group}`} label="Reason" value={draft.reason} maxLength={500}
        onChange={(e) => set("reason", e.target.value)} disabled={step === "review"} />
      {step === "review" && <div className="col-span-2" data-testid={`storage-rule-review-${group}`}>
        <p className="font-semibold">Review changes</p>
        <p>Free storage {rule?.free_days ?? "—"} → {free} calendar days · Charge {rule ? rm(Number(rule.charge_amount)) : "—"} → {rm(charge ?? 0)} every {cycle} days</p>
        <p>Effective from {fmtDate(draft.effectiveFrom)} · {draft.reason.trim()}</p>
        <p className="text-label font-normal text-kit-slate-11">Existing storage cases keep the rule they started under.</p>
      </div>}
      <div className="col-span-2 flex gap-2">
        {step === "edit"
          ? <Button variant="primary" disabled={gap !== null} onClick={() => setStep("review")}>
              {gap ? `Review changes — ${gap}` : "Review changes"}</Button>
          : <Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>Save changes</Button>}
        <Button variant="neutral" onClick={() => step === "review" ? setStep("edit") : setStep("view")}>
          {step === "review" ? "Back" : "Cancel"}</Button>
      </div>
    </div>}
  </div>;
}

const CHANGE_WORD: Record<string, string> = {
  collection_timing: "Collection timing",
  "storage_rule:mattress_bedframe": "Storage charges · Mattress / Bedframe",
  "storage_rule:sofa": "Storage charges · Sofa",
  "bank_account:pj_showroom": "Receiving bank account · PJ own-showroom",
  "bank_account:dealer": "Receiving bank account · Dealer",
};

function changeWord(what: string): string {
  if (CHANGE_WORD[what]) return CHANGE_WORD[what]!;
  if (what.startsWith("method")) return "Payment methods";
  if (what.startsWith("template")) return "WhatsApp templates";
  return what;
}

function valueSummary(v: Record<string, unknown> | null): string {
  if (!v) return "none";
  const keep = ["ask_days_before", "deadline_days_before", "free_days", "charge_amount", "cycle_days",
    "operation_limit_day", "waiver_limit_day", "extra_free_allowed", "inspection_days", "account_no", "active", "label"];
  const parts = keep.filter((k) => k in v && v[k] != null).map((k) => `${k.replaceAll("_", " ")} ${String(v[k])}`);
  return parts.length ? parts.join(" · ") : "recorded";
}

/** Every effective change: old value · new value · effective from · changed
 *  by · changed on · reason — the three-rank record grammar. */
function ChangeLog({ changes }: { changes: PaymentSettingsPayload["setting_changes"] }) {
  return <Section title="Changes" testId="payment-settings-changes">
    {changes.length === 0
      ? <p className="mt-2 text-body">No settings change recorded yet.</p>
      : <div className="mt-2 space-y-3">
        {changes.map((c) => {
          const actor = Array.isArray(c.actor) ? c.actor[0] : c.actor;
          return <div key={c.id} className="text-body">
            <p className="font-semibold">{changeWord(c.what)}</p>
            <p className="text-meta font-normal text-kit-slate-11">
              {actor?.name ?? "Staff identity not recorded"} · {fmtDate(c.changed_at, { time: true })}
              {c.effective_from ? ` · effective from ${fmtDate(c.effective_from)}` : ""}
            </p>
            <p className="text-label font-normal">
              {valueSummary(c.old_value)} → {valueSummary(c.new_value)}{c.reason ? ` · ${c.reason}` : ""}
            </p>
          </div>;
        })}
      </div>}
  </Section>;
}

/** The draft behind the Edit / Add form. `method` null = a new method. */
interface MethodDraft {
  method: string | null;
  label: string;
  accountCode: string;
  active: boolean;
}

/**
 * Payment methods (0476). One row per method: its name, the proof staff attach,
 * the money account it lands in, and Active. `Edit` opens the one form that
 * renames, switches and re-points a method; `Add a payment method` opens the
 * same form empty. The SQL door (payment_method_save) is the guard: manager
 * only, a money account only, at least one method stays Active.
 */
function PaymentMethodsCard() {
  const qc = useQueryClient();
  const registry = usePaymentMethodRegistry();
  const rows = registry.data?.methods ?? [];
  const accounts = registry.data?.money_accounts ?? [];
  const [draft, setDraft] = useState<MethodDraft | null>(null);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: PAYMENT_METHODS_QUERY_KEY });
    void qc.invalidateQueries({ queryKey: qk.finance.paymentSettings() });
  };
  const toggle = useMutation({
    mutationFn: (input: { method: string; active: boolean }) =>
      apiFetch("/api/finance/payment-settings/method", {
        method: "POST", body: JSON.stringify(input),
      }),
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });
  const save = useMutation({
    mutationFn: (d: MethodDraft) =>
      apiFetch("/api/finance/payment-settings/method/save", {
        method: "POST",
        body: JSON.stringify({
          method: d.method, label: d.label.trim(), accountCode: d.accountCode, active: d.active,
        }),
      }),
    onSuccess: () => {
      toast.success("Payment method saved");
      setDraft(null);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const accountOptions = accounts.map((a) => ({ value: a.code, label: `${a.code} · ${a.name}` }));
  const gap = !draft ? null
    : !draft.label.trim() ? "type a name"
    : !draft.accountCode ? "choose a money account"
    : null;

  const form = draft && <div className="mt-2 grid grid-cols-2 gap-3 rounded-card border border-kit-slate-5 p-4"
    data-testid="payment-method-form">
    <Input id="method-name" label="Name" value={draft.label} maxLength={40}
      onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
    <Select id="method-account" label="Money account" placeholder="Choose a money account"
      value={draft.accountCode || undefined} options={accountOptions}
      onValueChange={(v) => setDraft({ ...draft, accountCode: v })} />
    <label className="col-span-2 flex items-center gap-2 text-body">
      <input type="checkbox" checked={draft.active}
        onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />
      <span>Active</span>
    </label>
    <div className="col-span-2 flex gap-2">
      <Button variant="primary" loading={save.isPending} disabled={gap !== null}
        onClick={() => save.mutate(draft)}>
        {gap ? `Save method — ${gap}` : "Save method"}
      </Button>
      <Button variant="neutral" onClick={() => setDraft(null)}>Cancel</Button>
    </div>
  </div>;

  return <section className="rounded-card border border-kit-slate-5 bg-white p-5">
    <h2 className="text-section">Payment methods</h2>
    <p className="mt-1 text-body text-kit-slate-11">
      Only Active methods can be chosen when recording money. Each method lands in one money
      account. Online payment is recorded by the provider and is never a manual method.
    </p>
    {registry.isError && <div role="alert" className="mt-3 text-body">
      <p>Payment methods could not be loaded. Try again.</p>
      <button className="btn-secondary mt-2" onClick={() => void registry.refetch()}>Try again</button>
    </div>}
    <div className="mt-3 space-y-2">
      {rows.map((m: PaymentMethodRegistryRow) => {
        const spec = manualMethodSpec(m.method, rows);
        return <div key={m.method} className="text-body" data-testid={`method-row-${m.method}`}>
          <div className="flex items-center justify-between gap-3">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={m.active}
                disabled={toggle.isPending}
                onChange={(e) => toggle.mutate({ method: m.method, active: e.target.checked })}
                aria-label={`${m.label} — ${spec.evidence}`} />
              <span>
                <span className="font-semibold">{m.label}</span> — {spec.evidence}
                {!m.active && <span className="ml-2 text-label">Inactive</span>}
                <span className="block text-label font-normal">
                  Money account: {m.account_code ? `${m.account_code} · ${m.account_name ?? ""}` : "Not configured"}
                </span>
              </span>
            </label>
            {draft?.method !== m.method && <Button variant="neutral" onClick={() => setDraft({
              method: m.method, label: m.label, accountCode: m.account_code ?? "", active: m.active,
            })}>Edit</Button>}
          </div>
          {draft?.method === m.method && form}
        </div>;
      })}
    </div>
    {draft?.method === null ? form
      : <div className="mt-3">
        <Button variant="neutral" onClick={() => setDraft({
          method: null, label: "", accountCode: "", active: true,
        })}>Add a payment method</Button>
      </div>}
  </section>;
}
