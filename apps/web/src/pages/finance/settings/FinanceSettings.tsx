/**
 * Finance → Settings, at `/finance/settings` (migration 0512).
 *
 * The one list of money accounts: cash, each real bank, and the holding
 * account of each card or online payment company. Every Paid from and
 * Received into picker reads this list; Finance adds, renames and takes an
 * account out of use here. The database picks the code (1121–1129 a bank,
 * 1131–1139 a holding account) and refuses taking an account out of use while
 * the ledger holds money in it.
 *
 * Register shell per UI MASTER §6.7, the same as Other debtors → Parties.
 */
import { useMemo, useState } from "react";
import {
  moneyAccountAddInput,
  moneyAccountKindWord,
  moneyAccountUpdateInput,
  type MoneyAccountRow,
} from "@carres/shared/money-accounts";
import Button from "@/components/kit/Button";
import Checkbox from "@/components/kit/Checkbox";
import Input from "@/components/kit/Input";
import Modal from "@/components/kit/Modal";
import Select from "@/components/kit/Select";
import ListPageShell from "@/components/ListPageShell";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";
import ModuleHeader from "@/pages/operation/components/ModuleHeader";
import { toast } from "sonner";
import { LoadFailed } from "../other-money-in/parts";
import { useMoneyAccounts, useSaveMoneyAccount } from "./api";

const KIND_OPTIONS = [
  { value: "BANK", label: moneyAccountKindWord("BANK") },
  { value: "HOLDING", label: moneyAccountKindWord("HOLDING") },
];

const statusWord = (r: MoneyAccountRow) => (r.is_active ? "Active" : "Not active");

export default function FinanceSettings() {
  const query = useMoneyAccounts();
  /* `undefined` = closed; `null` = a new account; a row = edit that account. */
  const [editing, setEditing] = useState<MoneyAccountRow | null | undefined>(undefined);
  const columns = useMemo<DataGridColumn<MoneyAccountRow>[]>(
    () => [
      { key: "code", label: "Account", width: 110, accessor: (r) => r.code, searchValue: (r) => r.code },
      { key: "name", label: "Name", width: 240, accessor: (r) => r.name, searchValue: (r) => r.name },
      { key: "kind", label: "Kind", width: 160, accessor: (r) => moneyAccountKindWord(r.money_kind), filterType: "enum" },
      { key: "status", label: "Status", width: 120, accessor: statusWord, filterType: "enum" },
    ],
    [],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ModuleHeader destinationHeader testId="finance-settings-destination-header" word="Settings" docTitle="Settings — Carres" />
      {query.isError ? (
        <LoadFailed what="Money accounts" onRetry={() => void query.refetch()} />
      ) : (
        <ListPageShell register>
          <DataGrid
            rows={query.data ?? []}
            columns={columns}
            rowKey={(r) => r.code}
            storageKey="carres.finance.money-accounts.v1"
            appearance="reference"
            exportName="Money accounts"
            groupBanner={false}
            stickyIdentity
            isLoading={!query.isSuccess}
            searchPlaceholder="Search money accounts…"
            toolbarStart={
              <Button variant="primary" size="sm" shape="pill" icon="add" onClick={() => setEditing(null)}>
                New money account
              </Button>
            }
            emptyMessage="No money account yet. Press New money account to add a bank."
            expandTitle="Inspect money account"
            onRowDoubleClick={(r) => setEditing(r)}
            expandable={{
              renderExpansion: (r) => (
                <div className="p-4 text-body flex flex-col items-start gap-1">
                  <p>
                    {r.code} · {r.name} · {moneyAccountKindWord(r.money_kind)} · {statusWord(r)}
                  </p>
                  <div className="mt-2">
                    <Button variant="neutral" onClick={() => setEditing(r)}>
                      Edit money account
                    </Button>
                  </div>
                </div>
              ),
            }}
            statusSummary={(visible) => (
              <span data-testid="money-accounts-summary">
                {visible.length} {visible.length === 1 ? "money account" : "money accounts"}
              </span>
            )}
          />
          {editing !== undefined && (
            <MoneyAccountModal key={editing?.code ?? "new"} account={editing} onClose={() => setEditing(undefined)} />
          )}
        </ListPageShell>
      )}
    </div>
  );
}

function MoneyAccountModal({ account, onClose }: { account: MoneyAccountRow | null; onClose: () => void }) {
  const save = useSaveMoneyAccount();
  const [name, setName] = useState(account?.name ?? "");
  const [kind, setKind] = useState<string | undefined>(undefined);
  const [active, setActive] = useState(account?.is_active ?? true);
  const [refusal, setRefusal] = useState<string | null>(null);

  const done = {
    onSuccess: () => {
      toast.success(account ? "Money account saved." : "Money account added.");
      onClose();
    },
    onError: (e: Error) => setRefusal(e.message),
  };

  const submit = () => {
    setRefusal(null);
    if (account) {
      const p = moneyAccountUpdateInput.safeParse({ name, is_active: active });
      if (!p.success) return setRefusal(p.error.issues[0]?.message ?? null);
      save.mutate({ code: account.code, input: p.data }, done);
    } else {
      const p = moneyAccountAddInput.safeParse({ name, kind });
      if (!p.success) return setRefusal(p.error.issues[0]?.message ?? null);
      save.mutate({ code: null, input: p.data }, done);
    }
  };

  return (
    <Modal
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title={account ? "Edit money account" : "New money account"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Back
          </Button>
          <Button variant="primary" loading={save.isPending} onClick={submit}>
            Save money account
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3" data-testid="money-account-form">
        <Input id="money-account-name" label="Name" required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
        {account ? (
          <Checkbox
            id="money-account-active"
            label="Active — can be chosen on a new voucher or receipt"
            checked={active}
            onCheckedChange={setActive}
          />
        ) : (
          <Select id="money-account-kind" label="Kind" placeholder="Choose the kind" value={kind} onValueChange={setKind} options={KIND_OPTIONS} />
        )}
        {refusal && (
          <p role="alert" className="text-body text-kit-red-11">
            {refusal}
          </p>
        )}
      </div>
    </Modal>
  );
}
