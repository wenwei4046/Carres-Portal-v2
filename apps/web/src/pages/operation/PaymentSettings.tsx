// design-standard: not-a-list-page — this is a central Settings editor, not a Register.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import Button from "@/components/kit/Button";
import Input from "@/components/kit/Input";
import PageShell from "@/components/kit/PageShell";
import Select from "@/components/kit/Select";
import PaymentTemplateLibrary from "./PaymentTemplateLibrary";
import { rm } from "@/lib/format-currency";
import { toast } from "sonner";
import type { PaymentMethodRegistryRow } from "@carres/shared";
import {
  PAYMENT_METHODS_QUERY_KEY,
  manualMethodSpec,
  usePaymentMethodRegistry,
} from "@/lib/payment-methods";

/**
 * Settings → Payment (payment/MASTER.md §12 · §16, migration 0431).
 *
 * The Settings Template: plain-language groups, readable summaries and a
 * focused Edit — never raw config fields by default. Numbering shows only the
 * next example and `Numbers are created automatically.` No approver name, no
 * Payment Duty and no staff roster lives here (Workspace owns people).
 *
 * 0476 — Payment methods is the ONE list of methods (payment/MASTER.md §12
 * puts methods here). A manager adds a method, renames it, switches it off and
 * chooses the money account it lands in; every form that records customer
 * money offers the Active rows. Every change is kept in the settings history.
 */
interface BankAccount {
  route_source: "pj_showroom" | "dealer";
  bank_name: string;
  account_name: string | null;
  account_no: string | null;
}
interface StorageRule {
  id: string;
  product_group: "mattress_bedframe" | "sofa";
  free_days: number;
  charge_amount: number;
  cycle_days: number;
  operation_limit_day: number | null;
  waiver_limit_day: number | null;
  extra_free_allowed: boolean;
  inspection_days: number;
  effective_from: string;
}
interface SettingsPayload {
  bank_accounts: BankAccount[];
  storage_rules: StorageRule[];
}

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

export default function PaymentSettings() {
  const qc = useQueryClient();
  const query = useQuery<SettingsPayload>({
    queryKey: ["finance", "payment-settings"],
    queryFn: () => apiFetch("/api/finance/payment-settings"),
  });
  const [editing, setEditing] = useState<BankAccount["route_source"] | null>(null);
  const [accountName, setAccountName] = useState("");
  const [accountNo, setAccountNo] = useState("");
  const saveAccount = useMutation({
    mutationFn: (input: { routeSource: string; bankName: string; accountName: string; accountNo: string }) =>
      apiFetch("/api/finance/payment-settings/bank-account", {
        method: "POST", body: JSON.stringify(input),
      }),
    onSuccess: () => {
      toast.success("Receiving account saved");
      setEditing(null);
      void qc.invalidateQueries({ queryKey: ["finance", "payment-settings"] });
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
  return <PageShell variant="settings" title="Payment Settings">
    <div className="mx-auto grid w-full max-w-4xl gap-5 overflow-auto p-5" data-testid="payment-settings">

      <section className="rounded-card border border-kit-slate-5 bg-white p-5">
        <h2 className="text-section">Receiving bank accounts</h2>
        <p className="mt-1 text-body text-kit-slate-11">
          The system picks the bank from the order source. Staff never choose or type an account.
        </p>
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
      </section>

      <PaymentMethodsCard />

      <section className="rounded-card border border-kit-slate-5 bg-white p-5">
        <h2 className="text-section">Invoice and Receipt numbers</h2>
        <div className="mt-2 text-body space-y-1">
          <p>Next invoice looks like: {nextNumberExample("INV")}</p>
          <p>Next receipt looks like: {nextNumberExample("RC")}</p>
          <p className="font-semibold">Numbers are created automatically.</p>
        </div>
      </section>

      <section className="rounded-card border border-kit-slate-5 bg-white p-5">
        <h2 className="text-section">Storage charges</h2>
        <p className="mt-1 text-body text-kit-slate-11">
          A new rule applies to NEW storage only. An existing case keeps the rule it started under.
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {(["mattress_bedframe", "sofa"] as const).map((group) => {
            const rule = currentRules.get(group);
            return <div key={group} className="rounded-card border border-kit-slate-5 p-4 text-body"
              data-testid={`storage-card-${group}`}>
              <h3 className="font-semibold">{GROUP_WORD[group]}</h3>
              {rule ? <div className="mt-1 space-y-0.5">
                <p>Free storage: {rule.free_days} calendar days</p>
                <p>Charge: {rm(Number(rule.charge_amount))}</p>
                <p>Charge every: {rule.cycle_days} calendar days</p>
                {rule.operation_limit_day != null
                  ? <p>Operation may approve until Day {rule.operation_limit_day}</p> : null}
                {rule.waiver_limit_day != null
                  ? <p>Storage Waiver Approver may approve until Day {rule.waiver_limit_day}</p> : null}
                {!rule.extra_free_allowed && <p>Extra free storage: Not allowed</p>}
                <p>Check stored goods every {rule.inspection_days} calendar days</p>
              </div> : <p className="mt-1">No rule on record yet.</p>}
            </div>;
          })}
        </div>
      </section>

      <section className="rounded-card border border-kit-slate-5 bg-white p-5">
        <h2 className="text-section">WhatsApp templates</h2>
        <p className="mt-1 text-body text-kit-slate-11">
          Each situation keeps one Default. Only Active templates can be chosen when sending.
          Saved versions and actual sent messages stay history forever.
        </p>
        <div className="mt-3">
          <PaymentTemplateLibrary />
        </div>
      </section>
    </div>
  </PageShell>;
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
    void qc.invalidateQueries({ queryKey: ["finance", "payment-settings"] });
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
