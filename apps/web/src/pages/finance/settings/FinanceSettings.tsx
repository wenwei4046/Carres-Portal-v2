/**
 * Finance Settings, at `/finance/settings` (migration 0512), opened from the
 * header gear — the ERP's one Settings entry (Jess, 19 Aug 2026).
 *
 * The one list of money accounts: cash, each real bank, and the holding
 * account of each card or online payment company. Every Paid from and
 * Received into picker reads this list; Finance adds, renames and takes an
 * account out of use here. The database picks the code (1121–1129 a bank,
 * 1131–1139 a holding account) and refuses taking an account out of use while
 * the ledger holds money in it or a payment method still lands money in it
 * (0515, 0523).
 *
 * Words: every label is an existing COPY-STANDARD word (Money account,
 * Account, Name, Kind, Status, Active, Not active, Save, Cancel, and the pay
 * method words Cash · Bank transfer · Online payment for the kinds). A row
 * click opens it; the only new phrases are the page word and the add button.
 *
 * A second tab, `?tab=chart`, holds the chart of accounts (ChartOfAccounts.tsx).
 */
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  MONEY_ACCOUNT_KIND_WORD,
  type MoneyAccountRow,
} from "@carres/shared/money-accounts";
import Button from "@/components/kit/Button";
import Checkbox from "@/components/kit/Checkbox";
import Input from "@/components/kit/Input";
import Modal from "@/components/kit/Modal";
import Select from "@/components/kit/Select";
import Tabs from "@/components/kit/Tabs";
import ListPageShell from "@/components/ListPageShell";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";
import ModuleHeader from "@/pages/operation/components/ModuleHeader";
import { LoadFailed } from "../other-money-in/parts";
import { useMoneyAccounts, useSaveMoneyAccount } from "./api";
import { FieldError } from "@/components/kit/FieldFrame";
import ChartOfAccounts from "./ChartOfAccounts";

const TABS = [
  { value: "money", label: "Money accounts" },
  { value: "chart", label: "Chart of accounts" },
] as const;

const KIND_OPTIONS = [
  { value: "BANK", label: MONEY_ACCOUNT_KIND_WORD.BANK },
  { value: "HOLDING", label: MONEY_ACCOUNT_KIND_WORD.HOLDING },
];

const statusWord = (r: MoneyAccountRow) => (r.is_active ? "Active" : "Not active");

export default function FinanceSettings() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "chart" ? "chart" : "money";
  return (
    <div className="flex h-full min-h-0 flex-col">
      <ModuleHeader destinationHeader testId="finance-settings-destination-header" word="Finance Settings" docTitle="Finance Settings — Carres" />
      <div className="px-6">
        <Tabs tabs={TABS} value={tab} label="Finance Settings" onValueChange={(v) => setParams(v === "chart" ? { tab: v } : {})} />
      </div>
      <div className="min-h-0 flex-1">{tab === "chart" ? <ChartOfAccounts /> : <MoneyAccounts />}</div>
    </div>
  );
}

function MoneyAccounts() {
  const query = useMoneyAccounts();
  /* `undefined` = closed; `null` = a new account; a row = that account. */
  const [editing, setEditing] = useState<MoneyAccountRow | null | undefined>(undefined);
  const columns = useMemo<DataGridColumn<MoneyAccountRow>[]>(
    () => [
      { key: "code", label: "Account", width: 110, accessor: (r) => r.code, searchValue: (r) => r.code },
      { key: "name", label: "Name", width: 240, accessor: (r) => r.name, searchValue: (r) => r.name },
      { key: "kind", label: "Kind", width: 160, accessor: (r) => MONEY_ACCOUNT_KIND_WORD[r.money_kind], filterType: "enum" },
      { key: "status", label: "Status", width: 120, accessor: statusWord, filterType: "enum" },
    ],
    [],
  );

  return (
    <>
      {query.isError ? (
        <LoadFailed what="The accounts" onRetry={() => void query.refetch()} />
      ) : (
        <ListPageShell register>
          <DataGrid
            rows={query.data ?? []}
            columns={columns}
            rowKey={(r) => r.code}
            storageKey="carres.finance.money-accounts.v1"
            appearance="reference"
            groupBanner={false}
            stickyIdentity
            isLoading={!query.isSuccess}
            toolbarStart={
              <Button variant="primary" size="sm" shape="pill" icon="add" onClick={() => setEditing(null)}>
                Add a money account
              </Button>
            }
            onRowClick={(r) => setEditing(r)}
          />
          {editing !== undefined && (
            <MoneyAccountModal key={editing?.code ?? "new"} account={editing} onClose={() => setEditing(undefined)} />
          )}
        </ListPageShell>
      )}
    </>
  );
}

function MoneyAccountModal({ account, onClose }: { account: MoneyAccountRow | null; onClose: () => void }) {
  const save = useSaveMoneyAccount();
  const [name, setName] = useState(account?.name ?? "");
  const [kind, setKind] = useState<"BANK" | "HOLDING">("BANK");
  const [active, setActive] = useState(account?.is_active ?? true);
  const [refusal, setRefusal] = useState<string | null>(null);
  const trimmed = name.trim();

  /* A blank name cannot be sent (Save stays disabled) and the input stops at
     60 characters, so the only refusals left are the database's own. */
  const submit = () => {
    setRefusal(null);
    save.mutate(
      account
        ? { code: account.code, input: { name: trimmed, is_active: active } }
        : { code: null, input: { name: trimmed, kind } },
      { onSuccess: onClose, onError: (e) => setRefusal(e.message) },
    );
  };

  return (
    <Modal
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title={account ? "Money account" : "Add a money account"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={save.isPending} disabled={!trimmed} onClick={submit}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3" data-testid="money-account-form">
        <Input id="money-account-name" label="Name" required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
        {account ? (
          <Checkbox id="money-account-active" label="Active" checked={active} onCheckedChange={setActive} />
        ) : (
          <Select
            id="money-account-kind"
            label="Kind"
            value={kind}
            onValueChange={(v) => setKind(v as "BANK" | "HOLDING")}
            options={KIND_OPTIONS}
          />
        )}
        {refusal && (
          <FieldError>
            {refusal}
          </FieldError>
        )}
      </div>
    </Modal>
  );
}
