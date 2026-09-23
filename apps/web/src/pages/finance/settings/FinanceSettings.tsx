/**
 * Finance Settings, at `/finance/settings` (migration 0512), opened from the
 * header gear — the ERP's one Settings entry (Jess, 19 Aug 2026).
 *
 * The one list of money accounts: cash, each real bank, and the holding
 * account of each card or online payment company. Every Paid from and
 * Received into picker reads this list; Finance adds, renames and takes an
 * account out of use here. The database picks the code from the money-accounts
 * heading (0570: NNN-K000 under NNN-0000, HH01..HH99 under HH00, the smallest
 * free one, banks and holding accounts alike) and refuses taking an account out of use while
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
  CARD_CHANNELS,
  CARD_CHANNEL_WORD,
  MONEY_ACCOUNT_KIND_WORD,
  type CardChannel,
  type CardRouteRow,
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
import { accountLabel, LoadFailed } from "../other-money-in/parts";
import { useCardRoutes, useMoneyAccounts, useSaveCardRoute, useSaveMoneyAccount } from "./api";
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

  if (query.isError) return <LoadFailed what="The accounts" onRetry={() => void query.refetch()} />;
  return (
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
      {query.isSuccess && <CardRoutes accounts={query.data} />}
    </ListPageShell>
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

const CHANNEL_OPTIONS = CARD_CHANNELS.map((v) => ({ value: v, label: CARD_CHANNEL_WORD[v] }));

/**
 * 0541 — Card payout banks: which bank each card holding account pays out to,
 * for machines at a showroom and at a dealer. The card payout form on Money
 * moves defaults its bank from here; the database checks the accounts again.
 */
function CardRoutes({ accounts }: { accounts: MoneyAccountRow[] }) {
  const routes = useCardRoutes();
  /* `undefined` = closed; `null` = a new route; a row = that route. */
  const [editing, setEditing] = useState<CardRouteRow | null | undefined>(undefined);
  const name = (code: string) => {
    const a = accounts.find((x) => x.code === code);
    return a ? accountLabel(a) : code;
  };
  return (
    <section className="border-t border-kit-slate-5 p-5" data-testid="card-routes">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-section">Card payout banks</h2>
        <Button variant="neutral" size="sm" onClick={() => setEditing(null)}>
          Add a card payout bank
        </Button>
      </div>
      {routes.isError && <LoadFailed what="Card payout banks" onRetry={() => void routes.refetch()} />}
      <div className="mt-3 space-y-2">
        {(routes.data ?? []).map((r) => (
          <button
            key={`${r.holding_code}:${r.channel}`}
            type="button"
            className="block w-full text-left text-body"
            data-testid={`card-route-${r.holding_code}-${r.channel}`}
            onClick={() => setEditing(r)}
          >
            {name(r.holding_code)} · {CARD_CHANNEL_WORD[r.channel]} → {name(r.bank_code)}
          </button>
        ))}
      </div>
      {editing !== undefined && (
        <CardRouteModal route={editing} accounts={accounts} onClose={() => setEditing(undefined)} />
      )}
    </section>
  );
}

function CardRouteModal({ route, accounts, onClose }: { route: CardRouteRow | null; accounts: MoneyAccountRow[]; onClose: () => void }) {
  const save = useSaveCardRoute();
  const [holding, setHolding] = useState(route?.holding_code);
  const [channel, setChannel] = useState<CardChannel | undefined>(route?.channel);
  const [bank, setBank] = useState(route?.bank_code);
  const [refusal, setRefusal] = useState<string | null>(null);
  const opts = (kind: MoneyAccountRow["money_kind"]) =>
    accounts.filter((a) => a.is_active && a.money_kind === kind).map((a) => ({ value: a.code, label: accountLabel(a) }));
  const submit = () => {
    setRefusal(null);
    save.mutate(
      { holding_code: holding ?? "", channel: channel as CardChannel, bank_code: bank ?? "" },
      { onSuccess: onClose, onError: (e) => setRefusal(e.message) },
    );
  };
  return (
    <Modal
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title="Card payout bank"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={save.isPending} disabled={!holding || !channel || !bank} onClick={submit}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3" data-testid="card-route-form">
        <Select id="card-route-holding" label="Card account" required value={holding} onValueChange={setHolding}
          options={opts("HOLDING")} disabled={route !== null} placeholder="Choose an account" />
        <Select id="card-route-channel" label="Machine at" required value={channel}
          onValueChange={(v) => setChannel(v as CardChannel)} options={CHANNEL_OPTIONS} disabled={route !== null} />
        <Select id="card-route-bank" label="Pays out to" required value={bank} onValueChange={setBank}
          options={opts("BANK")} placeholder="Choose an account" />
        {refusal && <FieldError>{refusal}</FieldError>}
      </div>
    </Modal>
  );
}
