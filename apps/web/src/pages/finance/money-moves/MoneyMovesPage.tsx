/**
 * Finance → Money moves, at `/finance/money-moves` (migration 0529).
 *
 * Finance moving its own money: a bank transfer between two cash or bank
 * accounts, or a card payout from a card company's holding account into a
 * bank, less the card company's fee; a bank charge or a bank credit seen only
 * on the statement (0537). Prepared by Finance; the finance approver
 * (not the preparer) approves, and only approval enters it in the ledger.
 * A prepared move is cancelled; an approved one is cancelled by reversal.
 *
 * Built from the kit pieces Other receipts uses; the form sits in a Modal
 * because it has six fields and no lines.
 */
import { useMemo, useState } from "react";
import type { UseMutationResult } from "@tanstack/react-query";
import {
  MONEY_MOVE_KIND_WORD,
  MONEY_MOVE_KINDS,
  MONEY_MOVE_STATUS_WORD,
  moneyMoveActions,
  moneyMoveGross,
  moneyMoveInput,
  moveAccounts,
  type MoneyMoveInput,
  type MoneyMoveKind,
  type MoneyMoveRow,
} from "@carres/shared/money-moves";
import { parseTypedAmount } from "@carres/shared/other-money-in";
import { roleAccount } from "@carres/shared/finance-ledger";
import { CARD_CHANNELS, CARD_CHANNEL_WORD, settlementBank, type CardChannel } from "@carres/shared/money-accounts";
import Button from "@/components/kit/Button";
import DatePicker from "@/components/kit/DatePicker";
import Input from "@/components/kit/Input";
import Modal from "@/components/kit/Modal";
import Select from "@/components/kit/Select";
import StatusPill from "@/components/kit/StatusPill";
import Textarea from "@/components/kit/Textarea";
import ListPageShell from "@/components/ListPageShell";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";
import { appTodayIso, fmtDate } from "@/lib/fmt-date";
import { rm } from "@/lib/format-currency";
import ModuleHeader from "@/pages/operation/components/ModuleHeader";
import { toast } from "sonner";
import { useCardRoutes, useMoneyAccounts } from "../settings/api";
import { useLedgerChart } from "../ledger/ledger-queries";
import { accountLabel, CancelWithReason, LoadFailed } from "../other-money-in/parts";
import { useApproveMoneyMove, useCancelMoneyMove, useMoneyMoves, useMoneyMovesMe, usePrepareMoneyMove } from "./api";

const TONE = { prepared: "warning", approved: "success", reversed: "neutral", cancelled: "neutral" } as const;
const from = (r: MoneyMoveRow) => accountLabel({ code: r.from_account_code, name: r.from_account_name });
const to = (r: MoneyMoveRow) => accountLabel({ code: r.to_account_code, name: r.to_account_name });

export default function MoneyMovesPage() {
  const query = useMoneyMoves();
  const me = useMoneyMovesMe();
  const approve = useApproveMoneyMove();
  const cancel = useCancelMoneyMove();
  const [creating, setCreating] = useState(false);
  const [cancelling, setCancelling] = useState<MoneyMoveRow | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const mayApprove = me.data?.mayApprove === true;

  const columns = useMemo<DataGridColumn<MoneyMoveRow>[]>(
    () => [
      { key: "no", label: "Move No", width: 190, accessor: (r) => r.move_no, searchValue: (r) => r.move_no, filterType: "numbering" },
      {
        key: "date",
        label: "Date",
        width: 130,
        accessor: (r) => fmtDate(r.move_date),
        dateValue: (r) => r.move_date,
        filterType: "date",
        exportValue: (r) => fmtDate(r.move_date),
      },
      { key: "kind", label: "Kind", width: 140, accessor: (r) => MONEY_MOVE_KIND_WORD[r.kind], filterType: "enum" },
      { key: "from", label: "Paid from", width: 200, accessor: from, filterType: "enum" },
      { key: "to", label: "Paid into", width: 200, accessor: to, filterType: "enum" },
      {
        key: "amount",
        label: "Amount",
        width: 130,
        align: "right",
        accessor: (r) => rm(Number(r.amount)),
        numberValue: (r) => Number(r.amount),
        filterType: "number",
        exportValue: (r) => Number(r.amount),
      },
      {
        key: "fee",
        label: "Fee",
        width: 110,
        align: "right",
        accessor: (r) => rm(Number(r.fee)),
        numberValue: (r) => Number(r.fee),
        exportValue: (r) => Number(r.fee),
      },
      {
        key: "status",
        label: "Status",
        width: 120,
        accessor: (r) => <StatusPill tone={TONE[r.status]}>{MONEY_MOVE_STATUS_WORD[r.status]}</StatusPill>,
        searchValue: (r) => MONEY_MOVE_STATUS_WORD[r.status],
        filterValue: (r) => MONEY_MOVE_STATUS_WORD[r.status],
        exportValue: (r) => MONEY_MOVE_STATUS_WORD[r.status],
        filterType: "enum",
      },
      {
        key: "reference",
        label: "Reference",
        width: 160,
        defaultHidden: true,
        accessor: (r) => r.reference ?? "No reference",
        searchValue: (r) => [r.reference, r.note].filter(Boolean).join(" "),
      },
    ],
    [],
  );

  const doApprove = (r: MoneyMoveRow) =>
    approve.mutate(r.move_id, {
      onSuccess: () => toast.success(`${r.move_no} approved.`),
      onError: (e) => toast.error(e.message),
    });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ModuleHeader destinationHeader testId="money-moves-destination-header" word="Money moves" docTitle="Money moves — Carres" />
      {query.isError ? (
        <LoadFailed what="Money moves" onRetry={() => void query.refetch()} />
      ) : (
        <ListPageShell register>
          <DataGrid
            rows={query.data ?? []}
            columns={columns}
            rowKey={(r) => r.move_id}
            storageKey="carres.finance.money-moves.v1"
            appearance="reference"
            exportName="Money moves"
            groupBanner={false}
            stickyIdentity
            isLoading={!query.isSuccess}
            searchPlaceholder="Search money moves…"
            toolbarStart={
              <Button variant="primary" size="sm" shape="pill" icon="add" onClick={() => setCreating(true)}>
                New money move
              </Button>
            }
            emptyMessage="No money move yet. Press New money move to record a bank transfer or a card payout."
            expandTitle="Inspect money move"
            expandable={{
              renderExpansion: (r) => {
                const can = moneyMoveActions(r, mayApprove);
                return (
                  <div className="p-4 text-body flex flex-col items-start gap-1" data-testid={`money-move-${r.move_no}`}>
                    <p>
                      {MONEY_MOVE_KIND_WORD[r.kind]} · {rm(moneyMoveGross(Number(r.amount), Number(r.fee)))} from {from(r)} ·{" "}
                      {rm(Number(r.amount))} into {to(r)}
                      {Number(r.fee) > 0 ? ` · Fee ${rm(Number(r.fee))}` : ""}
                    </p>
                    <p>{r.note ?? "No note"}</p>
                    <p>
                      Prepared · {fmtDate(r.prepared_at, { time: true })} · {r.prepared_by_name ?? "Name not available"}
                    </p>
                    {r.approved_at && (
                      <p>
                        Approved · {fmtDate(r.approved_at, { time: true })} · {r.approved_by_name ?? "Name not available"}
                      </p>
                    )}
                    {r.ended_at && (
                      <p>
                        {MONEY_MOVE_STATUS_WORD[r.status]} · {fmtDate(r.ended_at, { time: true })} · {r.ended_by_name ?? "Name not available"} ·{" "}
                        {r.end_reason ?? "No reason on file"}
                      </p>
                    )}
                    {r.status === "prepared" && r.prepared_by_me && <p>You prepared this. Another finance approver approves it.</p>}
                    <div className="mt-2 flex gap-2">
                      {can.approve && (
                        <Button variant="primary" loading={approve.isPending} onClick={() => doApprove(r)}>
                          Approve
                        </Button>
                      )}
                      {can.cancel && (
                        <Button
                          variant="neutral"
                          onClick={() => {
                            setRefusal(null);
                            setCancelling(r);
                          }}
                        >
                          Cancel money move
                        </Button>
                      )}
                    </div>
                  </div>
                );
              },
            }}
            statusSummary={(visible) => (
              <span data-testid="money-moves-summary">
                {visible.length} {visible.length === 1 ? "money move" : "money moves"} · {visible.filter((r) => r.status === "prepared").length} to approve
              </span>
            )}
          />
        </ListPageShell>
      )}

      {creating && <MoneyMoveForm onClose={() => setCreating(false)} />}

      <CancelWithReason
        open={cancelling !== null}
        onOpenChange={(o) => !o && setCancelling(null)}
        title="Cancel this money move?"
        description={
          cancelling?.status === "approved"
            ? "The ledger entry is reversed on the money move date."
            : "Nothing was entered in the ledger yet."
        }
        confirmLabel="Cancel money move"
        busy={cancel.isPending}
        refusal={refusal}
        onConfirm={(reason) =>
          cancelling &&
          cancel.mutate(
            { id: cancelling.move_id, reason },
            {
              onSuccess: () => {
                setCancelling(null);
                toast.success("Money move cancelled.");
              },
              onError: (e) => setRefusal(e.message),
            },
          )
        }
      />
    </div>
  );
}

/** What a caller already knows; staff still choose the accounts and press Prepare. */
export interface MoneyMoveFormInitial {
  kind: MoneyMoveKind;
  /** Null: staff type it (a GHL day, whose file has no settlement date). */
  date: string | null;
  amount: number;
  fee: number;
  reference: string;
  /** 0576: the card account the day's sales were paid into; Approve day pays from it only. */
  from?: string;
}

/**
 * 0572 — Card settlement opens this form filled from a matched day and passes
 * its own `prepareDay`: the kind, amount, fee and reference are the file's and
 * cannot be changed here; staff give the date the bank received it and the
 * accounts.
 */
export function MoneyMoveForm({
  onClose,
  initial,
  prepareDay,
}: {
  onClose: () => void;
  initial?: MoneyMoveFormInitial;
  prepareDay?: UseMutationResult<unknown, Error, MoneyMoveInput>;
}) {
  const accounts = useMoneyAccounts();
  const chart = useLedgerChart();
  const prepareMove = usePrepareMoneyMove();
  const prepare = prepareDay ?? prepareMove;
  const fixed = prepareDay !== undefined;
  const [key] = useState(() => crypto.randomUUID());
  const [kind, setKind] = useState<MoneyMoveKind>(initial?.kind ?? "TRANSFER");
  const [date, setDate] = useState<string | null>(initial ? initial.date : appTodayIso());
  const [fromCode, setFromCode] = useState<string | undefined>();
  const [toCode, setToCode] = useState<string | undefined>();
  const [amount, setAmount] = useState(initial ? initial.amount.toFixed(2) : "");
  const [fee, setFee] = useState(initial ? initial.fee.toFixed(2) : "");
  const [reference, setReference] = useState(initial?.reference ?? "");
  const [note, setNote] = useState("");
  const [refusal, setRefusal] = useState<string | null>(null);
  /* 0541 — a card payout's bank defaults from Finance Settings' route; still changeable. */
  const routes = useCardRoutes();
  const [channel, setChannel] = useState<CardChannel | undefined>();
  const routeBank = (holding: string | undefined, ch: CardChannel | undefined) => {
    const bank = settlementBank(routes.data ?? [], holding, ch);
    if (bank && moveAccounts("CARD_PAYOUT", "to", accounts.data ?? []).some((a) => a.code === bank)) setToCode(bank);
  };

  /* 0572 — a card account a route serves is paid out on Card settlement (Approve day) only; the database refuses it here too. */
  const routed = new Set((routes.data ?? []).map((r) => r.holding_code));
  const cardSettlementOnly = kind === "CARD_PAYOUT" && !fixed && routed.size > 0;
  /* 0572 — Approve day pays only from a card account a route serves into that route's bank; the database refuses any other. */
  const routeBanks = (holding: string | undefined) =>
    new Set((routes.data ?? []).filter((r) => r.holding_code === holding).map((r) => r.bank_code));
  const options = (side: "from" | "to", holding?: string) =>
    moveAccounts(kind, side, accounts.data ?? [])
      .filter((a) => !(cardSettlementOnly && side === "from" && routed.has(a.code)))
      .filter((a) => !fixed || (side === "from" ? routed.has(a.code) && a.code === initial?.from : routeBanks(holding).has(a.code)))
      .map((a) => ({ value: a.code, label: accountLabel(a) }));
  const onlyOne = (o: { value: string }[]) => (fixed && o.length === 1 ? o[0]!.value : undefined);
  const fromOptions = options("from");
  const from = fromCode ?? onlyOne(fromOptions);
  const toOptions = options("to", from);
  const to = toCode ?? onlyOne(toOptions);
  const amountN = parseTypedAmount(amount);
  // 0537: a bank credit always comes from the other-income account, a bank
  // charge always goes to the bank-charges account. 0570: which accounts those
  // are is the chart's roles, never a number written here.
  const fixedRole = kind === "BANK_CREDIT" ? "OTHER_INCOME" : kind === "BANK_CHARGE" ? "BANK_AND_PAYMENT_CHARGES" : undefined;
  const fixedAccount = fixedRole ? roleAccount(chart.data, fixedRole) : undefined;
  const fixedFrom = kind === "BANK_CREDIT" ? fixedAccount?.code ?? "" : undefined;
  const fixedTo = kind === "BANK_CHARGE" ? fixedAccount?.code ?? "" : undefined;
  const fixedWhere = fixedAccount
    ? `${fixedAccount.code} ${fixedAccount.name}`
    : chart.isLoading ? null : undefined;
  const feeN = kind !== "CARD_PAYOUT" ? 0 : parseTypedAmount(fee) ?? 0;
  const gross = amountN && !Number.isNaN(amountN) && !Number.isNaN(feeN) ? moneyMoveGross(amountN, feeN) : null;

  const submit = () => {
    setRefusal(null);
    const parsed = moneyMoveInput.safeParse({
      kind,
      move_date: date ?? "",
      from_account_code: fixedFrom ?? from ?? "",
      to_account_code: fixedTo ?? to ?? "",
      amount: amountN === null || Number.isNaN(amountN) ? undefined : amountN,
      fee: Number.isNaN(feeN) ? undefined : feeN,
      reference: reference.trim() || null,
      note: note.trim() || null,
      idempotency_key: key,
    });
    if (!parsed.success) {
      setRefusal(parsed.error.issues[0]?.message ?? "Check the money move.");
      return;
    }
    prepare.mutate(parsed.data, {
      onSuccess: () => {
        toast.success("Money move prepared. A finance approver approves it next.");
        onClose();
      },
      onError: (e) => setRefusal(e.message),
    });
  };

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title="New money move"
      description="Nothing is entered in the ledger until another finance approver approves it."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Back
          </Button>
          <Button variant="primary" loading={prepare.isPending} onClick={submit}>
            Prepare money move
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3" data-testid="money-move-form">
        <Select
          id="move-kind"
          label="Kind"
          required
          value={kind}
          disabled={fixed}
          onValueChange={(v) => {
            setKind(v as MoneyMoveKind);
            setFromCode(undefined);
            setToCode(undefined);
          }}
          options={MONEY_MOVE_KINDS.map((k) => ({ value: k, label: MONEY_MOVE_KIND_WORD[k] }))}
        />
        <DatePicker id="move-date" label={fixed ? "Date the bank received it" : "Date"} required value={date} onChange={setDate} />
        {fixedFrom === undefined && (
          <Select
            id="move-from"
            label="Paid from"
            required
            value={from}
            onValueChange={(v) => {
              setFromCode(v);
              if (fixed) setToCode(undefined);
              if (kind === "CARD_PAYOUT") routeBank(v, channel);
            }}
            options={fromOptions}
            hint={
              cardSettlementOnly
                ? "A card account that has a payout bank in Finance Settings is paid out on Card settlement."
                : fixed && routes.isError
                  ? "The payout banks did not load. Close this and try again."
                  : fixed && routes.isSuccess && fromOptions.length === 0
                    ? `${initial?.from ?? "This day's card account"} has no payout bank in Finance Settings yet. Set one there first.`
                    : undefined
            }
            placeholder={accounts.isLoading ? "Loading accounts…" : "Choose an account"}
          />
        )}
        {kind === "CARD_PAYOUT" && (
          <Select
            id="move-channel"
            label="Machine at"
            value={channel}
            onValueChange={(v) => {
              setChannel(v as CardChannel);
              routeBank(from, v as CardChannel);
            }}
            options={CARD_CHANNELS.map((v) => ({ value: v, label: CARD_CHANNEL_WORD[v] }))}
          />
        )}
        {fixedTo === undefined && (
          <Select
            id="move-to"
            label="Paid into"
            required
            value={to}
            onValueChange={setToCode}
            options={toOptions}
            placeholder={accounts.isLoading ? "Loading accounts…" : "Choose an account"}
          />
        )}
        <Input
          id="move-amount"
          label={kind === "CARD_PAYOUT" ? "Paid into the bank (RM)" : "Amount (RM)"}
          required
          inputMode="decimal"
          readOnly={fixed}
          hint={
            !fixedRole
              ? undefined
              : fixedWhere === null
                ? "Loading accounts…"
                : fixedWhere === undefined
                  ? "The chart of accounts could not be loaded. Try again."
                  : kind === "BANK_CHARGE"
                    ? `Goes to ${fixedWhere}.`
                    : `Goes to ${fixedWhere}. Money from a customer is recorded as a payment, not here.`
          }
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        {kind === "CARD_PAYOUT" && (
          <Input
            id="move-fee"
            label="Card company fee (RM)"
            inputMode="decimal"
            readOnly={fixed}
            value={fee}
            hint={gross !== null ? `${rm(gross)} leaves ${from ?? "the holding account"}` : undefined}
            onChange={(e) => setFee(e.target.value)}
          />
        )}
        <Input id="move-reference" label="Reference" maxLength={120} readOnly={fixed} value={reference} onChange={(e) => setReference(e.target.value)} />
        <Textarea id="move-note" label="Note" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
        {accounts.isError && <p role="alert">The accounts could not be loaded. Try again.</p>}
        {refusal && (
          <p role="alert" className="text-body text-kit-red-11" data-testid="money-move-refusal">
            {refusal}
          </p>
        )}
      </div>
    </Modal>
  );
}
