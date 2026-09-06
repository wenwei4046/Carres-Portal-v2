// design-standard: not-a-list-page — this is a central Settings editor, not a Register.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import Button from "@/components/kit/Button";
import Input from "@/components/kit/Input";
import PageShell from "@/components/kit/PageShell";
import { rm } from "@/lib/format-currency";
import { toast } from "sonner";

/**
 * Settings → Payment (payment/MASTER.md §12 · §16, migration 0431).
 *
 * The Settings Template: plain-language groups, readable summaries and a
 * focused Edit — never raw config fields by default. Numbering shows only the
 * next example and `Numbers are created automatically.` No approver name, no
 * Payment Duty and no staff roster lives here (Workspace owns people).
 */
interface BankAccount {
  route_source: "pj_showroom" | "dealer";
  bank_name: string;
  account_name: string | null;
  account_no: string | null;
}
interface ManualMethod { method: string; active: boolean; sort: number }
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
  manual_methods: ManualMethod[];
  storage_rules: StorageRule[];
}

const SOURCE_WORD: Record<BankAccount["route_source"], string> = {
  pj_showroom: "PJ own-showroom order",
  dealer: "Dealer order",
};
const METHOD_WORD: Record<string, string> = {
  bank: "Bank transfer — transfer slip",
  duitnow_qr: "DuitNow QR — payment screenshot",
  cheque: "Cheque — cheque photo and cheque number",
  cash: "Cash — cash collection proof",
  credit_card: "Credit card — terminal receipt and approval code",
  debit_card: "Debit card — terminal receipt and approval code",
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
  const toggleMethod = useMutation({
    mutationFn: (input: { method: string; active: boolean }) =>
      apiFetch("/api/finance/payment-settings/method", {
        method: "POST", body: JSON.stringify(input),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["finance", "payment-settings"] }),
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

      <section className="rounded-card border border-kit-slate-5 bg-white p-5">
        <h2 className="text-section">Payment methods</h2>
        <p className="mt-1 text-body text-kit-slate-11">
          Only Active methods can be chosen when recording money. Online payment is recorded by
          the provider and is never a manual method.
        </p>
        <div className="mt-3 space-y-1.5">
          {(data?.manual_methods ?? []).map((m) => <label key={m.method}
            className="flex items-center gap-2 text-body">
            <input type="checkbox" checked={m.active}
              disabled={toggleMethod.isPending}
              onChange={(e) => toggleMethod.mutate({ method: m.method, active: e.target.checked })}
              aria-label={METHOD_WORD[m.method] ?? m.method} />
            <span>{METHOD_WORD[m.method] ?? m.method}</span>
            {!m.active && <span className="text-label">Inactive</span>}
          </label>)}
        </div>
      </section>

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
          The template library is not built yet. Messages keep their current one prepared wording.
        </p>
      </section>
    </div>
  </PageShell>;
}
