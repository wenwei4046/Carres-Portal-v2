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
 *
 * An opened account's number changes here too (YH, 24 Sep 2026), through the
 * chart's own door: the same request the Chart of accounts form sends
 * (useSaveAccount, gl_account_update). There is no second renumber.
 */
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { LEDGER_ACCOUNT_CODE_MESSAGE } from "@carres/shared/finance-ledger";
import {
  CARD_CHANNELS,
  CARD_CHANNEL_WORD,
  MONEY_ACCOUNT_KIND_WORD,
  type CardChannel,
  type CardRouteRow,
  type MoneyAccountRow,
} from "@carres/shared/money-accounts";
import { ledgerAccountCodeInput } from "@carres/shared/schemas/finance";
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
import { useCardRoutes, useMoneyAccounts, useSaveAccount, useSaveCardRoute, useSaveMoneyAccount } from "./api";
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

/** The tag a chart refusal carries (0550, forwarded by the API as `code`). */
const refusalTag = (e: unknown): unknown => {
  const body = (e as { body?: unknown } | null)?.body;
  return body && typeof body === "object" ? (body as { code?: unknown }).code : undefined;
};

function MoneyAccountModal({ account, onClose }: { account: MoneyAccountRow | null; onClose: () => void }) {
  const save = useSaveMoneyAccount();
  const renumber = useSaveAccount();
  const [name, setName] = useState(account?.name ?? "");
  const [kind, setKind] = useState<"BANK" | "HOLDING">("BANK");
  const [active, setActive] = useState(account?.is_active ?? true);
  /* Adding (0577): blank = the next free number under the heading. When every
     number is used the database asks for one, and this field is where it goes.
     Editing: the account's own number; a different one renumbers it. */
  const [code, setCode] = useState(account?.code ?? "");
  const [refusal, setRefusal] = useState<string | null>(null);
  /* A refusal about the number, shown under the Number field. */
  const [numberRefusal, setNumberRefusal] = useState<string | null>(null);
  const trimmed = name.trim();

  /* A blank name cannot be sent (Save stays disabled) and the input stops at
     60 characters, so the only refusals left are the database's own. */
  const submit = () => {
    setRefusal(null);
    setNumberRefusal(null);
    if (!account) {
      save.mutate(
        { code: null, input: code.trim() ? { name: trimmed, kind, code: code.trim().toUpperCase() } : { name: trimmed, kind } },
        { onSuccess: onClose, onError: (e) => setRefusal(e.message) },
      );
      return;
    }
    // The chart form's shape check and sentence, so a wrong number is refused
    // under the field before anything is sent. 310-a000 goes up as 310-A000.
    const shaped = ledgerAccountCodeInput.safeParse(code);
    if (!shaped.success) {
      setNumberRefusal(LEDGER_ACCOUNT_CODE_MESSAGE);
      return;
    }
    const input = { name: trimmed, is_active: active };
    if (shaped.data === account.code) {
      save.mutate({ code: account.code, input }, { onSuccess: onClose, onError: (e) => setRefusal(e.message) });
      return;
    }
    void renumberAccount(account, input, shaped.data);
  };

  /* A new number. The name and Active are saved first, at the old number, and
     only when they changed: that save is refused whole (money still in the
     account, a name in use) before the number is touched. Then the chart's
     door renumbers, and every record follows (ON UPDATE CASCADE, 0570).
     If the number is refused after the name or Active was saved, those stay
     saved and the sentence says why the number did not change; pressing Save
     again sends the same two requests, and the first changes nothing. */
  const renumberAccount = async (a: MoneyAccountRow, input: { name: string; is_active: boolean }, newCode: string) => {
    if (input.name !== a.name || input.is_active !== a.is_active) {
      try {
        await save.mutateAsync({ code: a.code, input });
      } catch (e) {
        setRefusal((e as Error).message);
        return;
      }
    }
    try {
      await renumber.mutateAsync({ code: a.code, name: input.name, newCode });
    } catch (e) {
      // A name clash the chart finds (a non-money account with this name)
      // is about the name, not the number.
      const tag = refusalTag(e);
      if (typeof tag === "string" && tag.startsWith("name_")) setRefusal((e as Error).message);
      else setNumberRefusal((e as Error).message);
      return;
    }
    onClose();
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
          <Button
            variant="primary"
            loading={save.isPending || renumber.isPending}
            disabled={!trimmed || (account !== null && !code.trim())}
            onClick={submit}
          >
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
        {/* PROPOSAL - PENDING APPROVAL (docs/COPY-STANDARD.md): the hint is
            0577's, adding only; the field on an opened account is 24 Sep's. */}
        <Input
          id="money-account-code"
          label="Number"
          required={account !== null}
          hint={account ? undefined : "Leave blank to use the next free number."}
          error={numberRefusal ?? undefined}
          maxLength={8}
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
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
