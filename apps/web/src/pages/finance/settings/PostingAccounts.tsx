/**
 * Finance Settings → Posting accounts (0657, Chew 2026-10-07, docs/finance/
 * MASTER.md §0 "Automatic posting accounts").
 *
 * Every kind of posting the system makes, and the account it goes to, in one
 * list. Chew changes the account of a posting here; the new one must be the
 * same kind (income for income, expense for expense), and the change applies
 * to postings made after it: earlier ones keep their accounts. Each change is
 * kept (who, when, from which account to which) and listed under the postings.
 *
 * FOUR GROUPS, ONE DOOR EACH.
 *   Sales                 an invoice's goods, add-ons and storage: the income
 *                         map (0466). An add-on with no account yet says so:
 *                         its invoices cannot be issued until it has one.
 *   Purchases and charges three roles Finance may change (0657).
 *   Customer money        the money account each way of being paid lands in.
 *                         Payment settings owns the method; Finance sets this
 *                         one setting here (0658, Chew 2026-10-07), through a
 *                         door that writes Payment settings' own record.
 *   Kept by the system    the payables, customer deposits, stock and equity
 *                         accounts: shown, and renamed or renumbered on Chart
 *                         of accounts, never swapped for another here.
 * A row Finance may change opens its window on a click; the window sends the
 * account the screen showed (`was`), and a change someone made meanwhile is
 * refused rather than overwritten.
 */
import { useMemo, useState } from "react";
import type { LedgerIncomePosting, LedgerPostingChange, LedgerRolePosting } from "@carres/shared";
import { ledgerKindWord, type LedgerAccount } from "@carres/shared/finance-ledger";
import Button from "@/components/kit/Button";
import DataTable, { type Column } from "@/components/kit/DataTable";
import Modal from "@/components/kit/Modal";
import Select from "@/components/kit/Select";
import { FieldError } from "@/components/kit/FieldFrame";
import ListPageShell from "@/components/ListPageShell";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";
import { methodLabel, usePaymentMethodRegistry } from "@/lib/payment-methods";
import { fmtDate } from "@/lib/fmt-date";
import { useLedgerChart } from "../ledger/ledger-queries";
import { LoadFailed } from "../other-money-in/parts";
import { usePostingAccounts, useSetPostingAccount } from "./api";

// PROPOSAL - PENDING APPROVAL (docs/COPY-STANDARD.md, Finance (Chew), 0657).
export const POSTING_GROUPS = [
  { key: "sales", label: "Sales" },
  { key: "costs", label: "Purchases and charges" },
  { key: "money", label: "Customer money" },
  { key: "system", label: "Kept by the system · renamed in Chart of accounts" },
] as const;
type GroupKey = (typeof POSTING_GROUPS)[number]["key"];

/** What each role posts, in the words the page prints. */
export const ROLE_WORD: Record<string, string> = {
  // 0659: a goods line takes its item group's purchase account; this role is
  // left for goods whose SKU is not in the catalog.
  COST_OF_GOODS_SOLD: "Goods bought that are not in the catalog",
  BANK_AND_PAYMENT_CHARGES: "Bank and card charges",
  OTHER_INCOME: "Money the bank pays in",
  TRADE_PAYABLE: "Suppliers owed for goods",
  OTHER_PAYABLE: "Suppliers owed for other bills",
  CUSTOMER_DEPOSITS_HELD: "Customer deposits",
  STOCK: "Stock",
  RETAINED_EARNINGS: "Retained earnings",
  OPENING_BALANCE_EQUITY: "Opening balance",
};
const ROLE_ORDER = Object.keys(ROLE_WORD);

/** The kind of account each changeable posting takes. */
const ROLE_KIND: Record<string, "INCOME" | "EXPENSE"> = {
  COST_OF_GOODS_SOLD: "EXPENSE",
  BANK_AND_PAYMENT_CHARGES: "EXPENSE",
  OTHER_INCOME: "INCOME",
};

export function incomeWord(p: Pick<LedgerIncomePosting, "type" | "key" | "name">): string {
  if (p.type === "STORAGE") return "Storage charges";
  if (p.type === "GOODS") return p.key === "rental" ? "Subscription fees" : p.key === "*" ? "Goods sold, when the item group has no sales account" : `Goods sold (${p.key})`;
  return p.name ?? p.key;
}

export interface PostingRow {
  id: string;
  group: GroupKey;
  word: string;
  /** For a row Finance changes here: the door's `what` and `key`, and the kind of account it takes. */
  change: { what: "INCOME" | "ROLE" | "PAYMENT"; key: string; kind: "INCOME" | "EXPENSE" | "MONEY" } | null;
  accountCode: string | null;
  accountName: string | null;
  changedAt: string | null;
  changedBy: string | null;
}

export function postingRows(
  income: readonly LedgerIncomePosting[],
  roles: readonly LedgerRolePosting[],
  payments: ReadonlyArray<{
    key: string;
    word: string;
    accountCode: string | null;
    accountName: string | null;
    changedAt?: string | null;
    changedBy?: string | null;
  }>,
): PostingRow[] {
  const sales = income.map((p): PostingRow => ({
    id: `INCOME/${p.type}/${p.key}`,
    group: "sales",
    word: incomeWord(p),
    change: { what: "INCOME", key: `${p.type}/${p.key}`, kind: "INCOME" },
    accountCode: p.accountCode,
    accountName: p.accountName,
    changedAt: p.changedAt,
    changedBy: p.changedBy,
  }));
  const byRole = [...roles].sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role));
  const roleRows = byRole.map((r): PostingRow => ({
    id: `ROLE/${r.role}`,
    group: r.changeable ? "costs" : "system",
    word: ROLE_WORD[r.role] ?? r.role,
    change: r.changeable && ROLE_KIND[r.role] ? { what: "ROLE", key: r.role, kind: ROLE_KIND[r.role]! } : null,
    accountCode: r.accountCode,
    accountName: r.accountName,
    changedAt: r.changedAt,
    changedBy: r.changedBy,
  }));
  const money = payments.map((m): PostingRow => ({
    id: `PAYMENT/${m.key}`,
    group: "money",
    word: m.word,
    change: { what: "PAYMENT", key: m.key, kind: "MONEY" },
    accountCode: m.accountCode,
    accountName: m.accountName,
    changedAt: m.changedAt ?? null,
    changedBy: m.changedBy ?? null,
  }));
  return [...sales, ...roleRows.filter((r) => r.group === "costs"), ...money, ...roleRows.filter((r) => r.group === "system")];
}

/** The POS card and Online payment rows, which have no method row (0541). */
function systemMethodWord(method: string, sourceChannel: string): string {
  if (method === "card") return "POS card";
  return sourceChannel === "stripe_checkout" ? "Online payment · Stripe checkout" : "Online payment";
}

const changedWord = (r: { changedAt: string | null; changedBy: string | null }) =>
  r.changedAt ? `${fmtDate(r.changedAt)}${r.changedBy ? ` · ${r.changedBy}` : ""}` : "";

export default function PostingAccounts() {
  const query = usePostingAccounts();
  const chart = useLedgerChart();
  const registry = usePaymentMethodRegistry();
  const [open, setOpen] = useState<PostingRow | null>(null);

  const rows = useMemo(() => {
    if (!query.data) return [];
    const names = new Map((chart.data?.accounts ?? []).map((a) => [a.code, a.name]));
    const last = new Map((query.data.payments ?? []).map((p) => [p.key, p]));
    const methods = registry.data?.methods ?? [];
    const payments = [
      ...methods.map((m) => ({
        key: `${m.method}/*`,
        word: methodLabel(m.method, methods) + (m.active ? "" : " · Not active"),
        accountCode: m.account_code,
        accountName: m.account_name,
      })),
      ...(registry.data?.system_rows ?? []).map((s) => ({
        key: `${s.method}/${s.source_channel}`,
        word: systemMethodWord(s.method, s.source_channel),
        accountCode: s.account_code,
        accountName: names.get(s.account_code) ?? null,
      })),
    ].map((p) => ({ ...p, changedAt: last.get(p.key)?.changedAt ?? null, changedBy: last.get(p.key)?.changedBy ?? null }));
    return postingRows(query.data.income, query.data.roles, payments);
  }, [query.data, chart.data, registry.data]);

  const columns = useMemo<DataGridColumn<PostingRow>[]>(
    () => [
      { key: "posting", label: "Posting", width: 320, sortable: false, accessor: (r) => r.word, searchValue: (r) => r.word },
      {
        key: "account",
        label: "Account",
        width: 320,
        sortable: false,
        accessor: (r) =>
          r.accountCode ? (
            `${r.accountCode} ${r.accountName ?? ""}`
          ) : (
            // PROPOSAL - PENDING APPROVAL (docs/COPY-STANDARD.md, Finance (Chew), 0657).
            <span className="text-kit-red-11">No account yet</span>
          ),
        searchValue: (r) => `${r.accountCode ?? ""} ${r.accountName ?? ""}`,
        exportValue: (r) => (r.accountCode ? `${r.accountCode} ${r.accountName ?? ""}` : ""),
      },
      { key: "changed", label: "Changed", width: 200, sortable: false, filterable: false, accessor: changedWord },
    ],
    [],
  );

  if (query.isError) return <LoadFailed what="The posting accounts" onRetry={() => void query.refetch()} />;
  return (
    <ListPageShell register>
      <DataGrid
        rows={rows}
        columns={columns}
        rowKey={(r) => r.id}
        storageKey="carres.finance.posting-accounts.v1"
        appearance="reference"
        groupBanner={false}
        allowColumnGrouping={false}
        fixedGroups={{ groups: POSTING_GROUPS.map((g) => ({ key: g.key, label: g.label })), groupOf: (r) => r.group, revealMatches: true }}
        isLoading={!query.isSuccess}
        onRowClick={(r) => {
          if (r.change) setOpen(r);
        }}
      />
      <PostingChanges changes={query.data?.changes ?? []} />
      {open && open.change && (
        <PostingModal
          key={open.id}
          row={open}
          accounts={chart.data?.accounts ?? []}
          moneyAccounts={chart.data?.money_accounts ?? []}
          moneyChoices={registry.data?.money_accounts ?? []}
          onClose={() => setOpen(null)}
        />
      )}
    </ListPageShell>
  );
}

/** Accounts a posting may go to: in use, not a heading, not a control or money
 *  account, and the kind the posting takes (_gl_posting_account_write's own
 *  checks, so the window never offers one the database refuses). */
export function postingAccountOptions(
  kind: "INCOME" | "EXPENSE",
  accounts: readonly LedgerAccount[],
  moneyAccounts: readonly string[],
): LedgerAccount[] {
  const money = new Set(moneyAccounts);
  return accounts
    .filter((a) => a.is_active && !a.is_header && !a.is_control && !money.has(a.code) && a.kind === kind)
    .sort((x, y) => x.code.localeCompare(y.code));
}

function PostingModal({
  row,
  accounts,
  moneyAccounts,
  moneyChoices,
  onClose,
}: {
  row: PostingRow;
  accounts: readonly LedgerAccount[];
  moneyAccounts: readonly string[];
  /** The money accounts in use a way of being paid may land in (payment_method_money_accounts). */
  moneyChoices: ReadonlyArray<{ code: string; name: string }>;
  onClose: () => void;
}) {
  const save = useSetPostingAccount();
  const change = row.change!;
  const [account, setAccount] = useState<string | undefined>(row.accountCode ?? undefined);
  const [refusal, setRefusal] = useState<string | null>(null);
  const options =
    change.kind === "MONEY"
      ? moneyChoices.map((a) => ({ value: a.code, label: `${a.code} ${a.name}` }))
      : postingAccountOptions(change.kind, accounts, moneyAccounts).map((a) => ({ value: a.code, label: `${a.code} ${a.name}` }));
  // The Receiving button law: the disabled Save names its gap.
  const gap = !account ? "Save: pick the account" : account === row.accountCode ? "Save: pick another account" : null;
  return (
    <Modal
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      // PROPOSAL - PENDING APPROVAL (docs/COPY-STANDARD.md, Finance (Chew), 0657).
      title="Posting account"
      description={row.word}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={save.isPending}
            disabled={gap !== null}
            onClick={() => {
              setRefusal(null);
              if (!account) return;
              save.mutate(
                { what: change.what, key: change.key, accountCode: account, was: row.accountCode },
                { onSuccess: onClose, onError: (e) => setRefusal(e.message) },
              );
            }}
          >
            {gap ?? "Save"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3" data-testid="posting-account-form">
        <Select
          id="posting-account"
          label={change.kind === "MONEY" ? "Money account" : `Account (${ledgerKindWord(change.kind)})`}
          required
          value={account ?? ""}
          onValueChange={setAccount}
          options={options}
        />
        <p className="text-body text-kit-slate-11">The new account takes the postings made from now on. Earlier postings keep their account.</p>
        {refusal && <FieldError>{refusal}</FieldError>}
      </div>
    </Modal>
  );
}

const CHANGE_COLUMNS: readonly Column<LedgerPostingChange>[] = [
  { key: "when", label: "When", width: "20%", cell: (c) => changedWord({ changedAt: c.changedAt, changedBy: c.changedBy }) },
  {
    key: "posting",
    label: "Posting",
    width: "30%",
    cell: (c) =>
      c.what === "ROLE"
        ? ROLE_WORD[c.key] ?? c.key
        : c.what === "PAYMENT"
          ? c.name ?? systemMethodWord(c.key.split("/")[0]!, c.key.split("/").slice(1).join("/"))
          : incomeWord({ type: c.key.split("/")[0] as LedgerIncomePosting["type"], key: c.key.split("/").slice(1).join("/"), name: c.name }),
  },
  { key: "from", label: "From", width: "25%", cell: (c) => (c.fromCode ? `${c.fromCode} ${c.fromName ?? ""}` : "No account yet") },
  { key: "to", label: "To", width: "25%", cell: (c) => `${c.toCode} ${c.toName ?? ""}` },
];

function PostingChanges({ changes }: { changes: readonly LedgerPostingChange[] }) {
  return (
    <section className="flex flex-col gap-2 pt-4" data-testid="posting-changes">
      {/* PROPOSAL - PENDING APPROVAL (docs/COPY-STANDARD.md, Finance (Chew), 0657). */}
      <h2 className="text-section">Changes</h2>
      <DataTable
        label="Changes"
        testId="posting-changes-table"
        rows={[...changes]}
        columns={CHANGE_COLUMNS}
        rowId={(c) => c.id}
        empty="No posting account has been changed yet."
      />
    </section>
  );
}
