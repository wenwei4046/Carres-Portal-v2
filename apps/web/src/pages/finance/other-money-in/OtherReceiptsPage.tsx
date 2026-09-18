/**
 * Finance → Other receipts, at `/finance/other-receipts` (migration 0478).
 *
 * Money that reached our bank or cash and is NOT customer order money: a loan
 * in, a director putting money in, other income, or money a party pays
 * against its other debtor invoices. Customer money is recorded in Payments.
 *
 *   (none)               the receipt Register · Row 2 create: New receipt
 *   ?receipt=new         the form; `&party=&invoice=` prefill it from an invoice
 *   ?receipt=<id>        one receipt, with Cancel receipt for the approver
 *
 * Recording posts at once (Dr the money account / Cr each line, Cr Other
 * debtors for each invoice paid), so the form asks first. The form carries ONE
 * idempotency key per opening: a double press returns the first receipt
 * instead of recording the money twice.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  otherReceiptInput,
  otherReceiptStatusWord,
  parseTypedAmount,
  sumMoney,
  type OtherDebtorInvoiceRow,
  type OtherReceiptDetail,
  type OtherReceiptRow,
} from "@carres/shared/other-money-in";
import Button from "@/components/kit/Button";
import DatePicker from "@/components/kit/DatePicker";
import Input from "@/components/kit/Input";
import Modal from "@/components/kit/Modal";
import Select from "@/components/kit/Select";
import StatusPill from "@/components/kit/StatusPill";
import Textarea from "@/components/kit/Textarea";
import ListPageShell from "@/components/ListPageShell";
import { takesIn } from "@carres/shared/money-accounts";
import { useMoneyAccounts } from "../settings/api";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";
import { appTodayIso, fmtDate } from "@/lib/fmt-date";
import { rm } from "@/lib/format-currency";
import ModuleHeader from "@/pages/operation/components/ModuleHeader";
import { toast } from "sonner";
import { otherReceiptDoc } from "@/lib/pdf/other-money-in-docs";
import {
  useCancelReceipt,
  useMoneyInAccounts,
  useMoneyInMe,
  useOtherDebtorInvoices,
  useOtherDebtorParties,
  useOtherReceipt,
  useOtherReceipts,
  useRecordReceipt,
} from "./api";
import {
  accountLabel,
  blankLine,
  CancelWithReason,
  Fact,
  Facts,
  LinesEditor,
  LoadFailed,
  money,
  readLines,
  typedTotal,
  type LineErrors,
  type TypedLine,
} from "./parts";
import { DepartmentFilter, DepartmentName, useDepartmentParam } from "../department";
import { FieldError } from "@/components/kit/FieldFrame";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NO_PARTY = "none";

const receivedFrom = (r: Pick<OtherReceiptRow, "payer_name" | "party_name">) => r.party_name ?? r.payer_name;
const liveTotal = (rows: OtherReceiptRow[]) => sumMoney(rows.filter((r) => r.status === "posted").map((r) => r.total_amount));

export default function OtherReceiptsPage() {
  const [params, setParams] = useSearchParams();
  const receiptParam = params.get("receipt");
  const partyParam = params.get("party");
  const invoiceParam = params.get("invoice");

  const go = (patch: Record<string, string | null>) =>
    setParams((before) => {
      const next = new URLSearchParams(before);
      for (const [k, v] of Object.entries(patch)) {
        if (v === null) next.delete(k);
        else next.set(k, v);
      }
      return next;
    });
  const open = (id: string) => go({ receipt: id, party: null, invoice: null });
  const back = () => go({ receipt: null, party: null, invoice: null });

  let body: ReactNode;
  if (receiptParam === "new") {
    body = (
      <ReceiptForm
        prefillPartyId={partyParam && UUID_RE.test(partyParam) ? partyParam : null}
        prefillInvoiceId={invoiceParam && UUID_RE.test(invoiceParam) ? invoiceParam : null}
        onBack={back}
        onRecorded={open}
      />
    );
  } else if (receiptParam !== null) {
    body = UUID_RE.test(receiptParam) ? (
      <ReceiptObject key={receiptParam} receiptId={receiptParam} onBack={back} />
    ) : (
      <div className="p-6 text-body flex flex-col items-start gap-3">
        <p>This receipt is not available.</p>
        <Button variant="neutral" onClick={back}>
          Back to Other receipts
        </Button>
      </div>
    );
  } else {
    body = <ReceiptRegister onOpen={open} onNew={() => go({ receipt: "new" })} />;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ModuleHeader destinationHeader testId="other-receipts-destination-header" word="Other receipts" docTitle="Other receipts — Carres" />
      {body}
    </div>
  );
}

/* ── the Register ──────────────────────────────────────────────────────────── */

function ReceiptRegister({ onOpen, onNew }: { onOpen: (id: string) => void; onNew: () => void }) {
  const [dept, setDept] = useDepartmentParam();
  const query = useOtherReceipts(dept);
  const columns = useMemo<DataGridColumn<OtherReceiptRow>[]>(
    () => [
      {
        key: "receipt",
        label: "Receipt No",
        width: 190,
        accessor: (r) => r.receipt_no,
        searchValue: (r) => r.receipt_no,
        filterValue: (r) => r.receipt_no,
        filterType: "numbering",
      },
      {
        key: "date",
        label: "Receipt Date",
        width: 140,
        accessor: (r) => fmtDate(r.receipt_date),
        dateValue: (r) => r.receipt_date,
        filterType: "date",
        exportValue: (r) => fmtDate(r.receipt_date),
      },
      {
        key: "from",
        label: "Received from",
        width: 220,
        accessor: receivedFrom,
        searchValue: (r) => [r.party_name, r.payer_name].filter(Boolean).join(" "),
        filterType: "enum",
      },
      {
        key: "what",
        label: "What for",
        width: 260,
        accessor: (r) => r.what ?? "Not available",
        searchValue: (r) => [r.what, r.reference, r.narration].filter(Boolean).join(" "),
      },
      {
        key: "into",
        label: "Received into",
        width: 200,
        accessor: (r) => accountLabel({ code: r.money_account_code, name: r.money_account_name }),
        filterType: "enum",
      },
      {
        key: "amount",
        label: "Amount",
        width: 130,
        align: "right",
        accessor: (r) => rm(Number(r.total_amount)),
        numberValue: (r) => Number(r.total_amount),
        filterType: "number",
        exportValue: (r) => Number(r.total_amount),
      },
      {
        key: "status",
        label: "Status",
        width: 120,
        accessor: (r) => otherReceiptStatusWord(r.status),
        searchValue: (r) => otherReceiptStatusWord(r.status),
        filterType: "enum",
      },
      {
        key: "reference",
        label: "Reference",
        width: 160,
        defaultHidden: true,
        accessor: (r) => r.reference ?? "No reference",
        searchValue: (r) => r.reference ?? "",
      },
      {
        key: "by",
        label: "Recorded by",
        width: 160,
        defaultHidden: true,
        accessor: (r) => r.created_by_name ?? "Name not available",
        filterType: "enum",
      },
    ],
    [],
  );

  if (query.isError) return <LoadFailed what="Other receipts" onRetry={() => void query.refetch()} />;

  return (
    <ListPageShell register>
      <DataGrid
        rows={query.data ?? []}
        columns={columns}
        rowKey={(r) => r.receipt_id}
        storageKey="carres.finance.other-receipts.v1"
        appearance="reference"
        exportName="Other receipts"
        groupBanner={false}
        stickyIdentity
        isLoading={!query.isSuccess}
        searchPlaceholder="Search receipts…"
        toolbarStart={
          <span className="flex items-center gap-4">
            <Button variant="primary" size="sm" shape="pill" icon="add" onClick={onNew}>
              New receipt
            </Button>
            <DepartmentFilter value={dept} onChange={setDept} />
          </span>
        }
        emptyMessage="No other receipt yet. Press New receipt to record a loan in, other income, or money against an invoice."
        expandTitle="Inspect receipt"
        onRowDoubleClick={(r) => onOpen(r.receipt_id)}
        expandable={{
          renderExpansion: (r) => (
            <div className="p-4 text-body flex flex-col items-start gap-1">
              <p>
                {receivedFrom(r)} · {r.what ?? "Not available"}
              </p>
              <p>
                {rm(Number(r.total_amount))} into {accountLabel({ code: r.money_account_code, name: r.money_account_name })}
              </p>
              {r.status === "voided" && <p>Cancelled · {r.void_reason ?? "No reason on file"}</p>}
              <div className="mt-2">
                <Button variant="neutral" onClick={() => onOpen(r.receipt_id)}>
                  Open receipt
                </Button>
              </div>
            </div>
          ),
        }}
        statusSummary={(visible) => (
          <span data-testid="other-receipts-summary">
            {visible.length} {visible.length === 1 ? "receipt" : "receipts"} · {rm(liveTotal(visible))} received
          </span>
        )}
      />
    </ListPageShell>
  );
}

/* ── the form ──────────────────────────────────────────────────────────────── */

const newKey = (): string => crypto.randomUUID();

function ReceiptForm({
  prefillPartyId,
  prefillInvoiceId,
  onBack,
  onRecorded,
}: {
  prefillPartyId: string | null;
  prefillInvoiceId: string | null;
  onBack: () => void;
  onRecorded: (id: string) => void;
}) {
  const parties = useOtherDebtorParties();
  const invoices = useOtherDebtorInvoices();
  const accounts = useMoneyInAccounts();
  const moneyAccounts = useMoneyAccounts();
  const record = useRecordReceipt();
  /* One key per opening of this form — never regenerated on a re-render or a
     refused press, so a second press can only find the first receipt. */
  const [idempotencyKey] = useState(newKey);

  const [partyId, setPartyId] = useState<string>(prefillPartyId ?? NO_PARTY);
  const [payerName, setPayerName] = useState("");
  const [moneyAccount, setMoneyAccount] = useState<string | undefined>(undefined);
  const [receiptDate, setReceiptDate] = useState<string | null>(appTodayIso());
  const [reference, setReference] = useState("");
  const [narration, setNarration] = useState("");
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [lines, setLines] = useState<TypedLine[]>(() => [blankLine()]);
  const [lineErrors, setLineErrors] = useState<LineErrors>({});
  const [allocationErrors, setAllocationErrors] = useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = useState<{ payer?: string; account?: string; date?: string; empty?: string }>({});
  const [refusal, setRefusal] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const hasParty = partyId !== NO_PARTY;
  const openInvoices = useMemo<OtherDebtorInvoiceRow[]>(
    () =>
      hasParty
        ? (invoices.data ?? []).filter((i) => i.party_id === partyId && i.status === "issued" && Number(i.outstanding) > 0)
        : [],
    [invoices.data, partyId, hasParty],
  );

  /* The invoice the operator came from is filled with what it still owes —
     once, when the list first arrives; after that the typing is theirs. */
  const prefilled = useRef(false);
  useEffect(() => {
    if (prefilled.current || !prefillInvoiceId || !invoices.data) return;
    prefilled.current = true;
    const inv = invoices.data.find((i) => i.invoice_id === prefillInvoiceId);
    if (inv && inv.status === "issued" && Number(inv.outstanding) > 0) {
      setAllocations({ [inv.invoice_id]: Number(inv.outstanding).toFixed(2) });
    }
  }, [invoices.data, prefillInvoiceId]);

  const moneyOptions = useMemo(
    // 0512: Received into reads the one money-account list — cash, banks and
    // holding accounts (GHL, AhaPay, Online).
    () => (moneyAccounts.data ?? []).filter(takesIn).map((a) => ({ value: a.code, label: accountLabel(a) })),
    [moneyAccounts.data],
  );
  const lineAccounts = useMemo(() => (accounts.data ?? []).filter((a) => a.for_receipt_line), [accounts.data]);
  const partyOptions = useMemo(
    () => [
      { value: NO_PARTY, label: "No party — type who paid" },
      ...(parties.data ?? []).filter((p) => p.is_active).map((p) => ({ value: p.party_id, label: p.name })),
    ],
    [parties.data],
  );
  const goLive = parties.data?.[0]?.go_live_on ?? undefined;

  const allocationTotal = sumMoney(
    openInvoices.map((i) => {
      const n = parseTypedAmount(allocations[i.invoice_id] ?? "");
      return n === null || Number.isNaN(n) ? 0 : n;
    }),
  );
  const total = sumMoney([allocationTotal, typedTotal(lines)]);
  const intoLabel = moneyOptions.find((o) => o.value === moneyAccount)?.label ?? "the chosen account";

  const build = () => {
    const read = readLines(lines);
    const allocErrs: Record<string, string> = {};
    const allocs: Array<{ invoice_id: string; amount: number }> = [];
    for (const inv of openInvoices) {
      const typed = allocations[inv.invoice_id] ?? "";
      const n = parseTypedAmount(typed);
      if (n === null) continue;
      if (Number.isNaN(n)) allocErrs[inv.invoice_id] = "Type the amount in numbers, like 1500.00.";
      else if (n <= 0) allocErrs[inv.invoice_id] = "The amount must be more than RM 0.00.";
      else if (Math.abs(Math.round(n * 100) - n * 100) > 1e-6) allocErrs[inv.invoice_id] = "An amount has at most two decimals.";
      else if (Math.round(n * 100) > Math.round(Number(inv.outstanding) * 100))
        allocErrs[inv.invoice_id] = `More than the ${rm(Number(inv.outstanding))} outstanding on this invoice.`;
      else allocs.push({ invoice_id: inv.invoice_id, amount: n });
    }
    const errs: typeof fieldErrors = {};
    if (!hasParty && !payerName.trim()) errs.payer = "Type who paid, or choose a party.";
    if (!moneyAccount) errs.account = "Choose where the money was received.";
    if (!receiptDate) errs.date = "Choose the date the money was received.";
    if (!Object.keys(allocErrs).length && !Object.keys(read.errors).length && allocs.length + read.lines.length === 0) {
      errs.empty = hasParty && openInvoices.length
        ? "Type an amount against an invoice, or add a line for other money."
        : "Add a line that says what the money was.";
    }
    setLineErrors(read.errors);
    setAllocationErrors(allocErrs);
    setFieldErrors(errs);
    if (Object.keys(errs).length || Object.keys(read.errors).length || Object.keys(allocErrs).length) return null;
    const parsed = otherReceiptInput.safeParse({
      receipt_date: receiptDate,
      money_account_code: moneyAccount,
      party_id: hasParty ? partyId : null,
      payer_name: payerName.trim() || null,
      reference: reference.trim() || null,
      narration: narration.trim() || null,
      lines: read.lines,
      allocations: allocs,
      idempotency_key: idempotencyKey,
    });
    if (!parsed.success) {
      setRefusal(parsed.error.issues[0]?.message ?? "Check the receipt.");
      return null;
    }
    return parsed.data;
  };

  const submit = () => {
    setRefusal(null);
    const input = build();
    if (!input) {
      setConfirming(false);
      return;
    }
    record.mutate(input, {
      onSuccess: (res) => {
        setConfirming(false);
        toast.success("Receipt recorded.");
        onRecorded(res.id);
      },
      onError: (e) => {
        setConfirming(false);
        setRefusal(e.message);
      },
    });
  };

  if (parties.isError || accounts.isError || moneyAccounts.isError || invoices.isError) {
    return (
      <LoadFailed
        what="The parties, invoices and accounts for this form"
        onRetry={() => {
          void parties.refetch();
          void accounts.refetch();
          void moneyAccounts.refetch();
          void invoices.refetch();
        }}
      />
    );
  }

  return (
    <div className="flex-1 overflow-auto p-4" data-testid="other-receipt-form">
      <div className="flex flex-col gap-4 max-w-5xl">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" icon="back" onClick={onBack}>
            Back to Other receipts
          </Button>
          <span className="text-strong">New receipt</span>
        </div>

        <Facts title="Who paid, and where the money went">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Select
              id="receipt-party"
              label="Party"
              value={partyId}
              onValueChange={(v) => {
                setPartyId(v);
                setAllocations({});
                setAllocationErrors({});
              }}
              options={partyOptions}
            />
            <Input
              id="receipt-payer"
              label="Payer name"
              required={!hasParty}
              maxLength={200}
              value={payerName}
              hint={hasParty ? "Leave empty to use the party's name." : undefined}
              error={fieldErrors.payer}
              onChange={(e) => setPayerName(e.target.value)}
            />
            <Select
              id="receipt-into"
              label="Received into"
              required
              value={moneyAccount}
              onValueChange={setMoneyAccount}
              options={moneyOptions}
              placeholder={moneyAccounts.isLoading ? "Loading accounts…" : "Choose the bank or cash account"}
              error={fieldErrors.account}
            />
            <DatePicker
              id="receipt-date"
              label="Receipt date"
              required
              value={receiptDate}
              onChange={setReceiptDate}
              minDate={goLive}
              error={fieldErrors.date}
            />
            <Input id="receipt-reference" label="Reference" maxLength={120} value={reference} onChange={(e) => setReference(e.target.value)} />
          </div>
          <Textarea id="receipt-narration" label="Note" rows={2} maxLength={500} value={narration} onChange={(e) => setNarration(e.target.value)} />
        </Facts>

        {hasParty && (
          <Facts title="Against invoices" testId="receipt-allocations">
            {invoices.isLoading ? (
              <p>Loading invoices…</p>
            ) : openInvoices.length === 0 ? (
              <p>This party has no open invoice.</p>
            ) : (
              openInvoices.map((inv) => (
                <div
                  key={inv.invoice_id}
                  className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,3fr)_minmax(0,1fr)] md:items-end"
                >
                  <p>
                    {inv.invoice_no} · {fmtDate(inv.invoice_date)} · Outstanding {rm(Number(inv.outstanding))}
                  </p>
                  <Input
                    id={`receipt-allocation-${inv.invoice_id}`}
                    label={`Received for ${inv.invoice_no} (RM)`}
                    inputMode="decimal"
                    value={allocations[inv.invoice_id] ?? ""}
                    error={allocationErrors[inv.invoice_id]}
                    onChange={(e) => setAllocations((a) => ({ ...a, [inv.invoice_id]: e.target.value }))}
                  />
                </div>
              ))
            )}
          </Facts>
        )}

        <Facts title={hasParty ? "Other money in this receipt" : "What the money was"}>
          <LinesEditor
            idPrefix="receipt"
            lines={lines}
            onChange={setLines}
            accounts={lineAccounts}
            errors={lineErrors}
            accountPlaceholder={accounts.isLoading ? "Loading accounts…" : "Choose an account"}
          />
        </Facts>

        {fieldErrors.empty && (
          <FieldError>
            {fieldErrors.empty}
          </FieldError>
        )}
        <p className="text-strong" data-testid="receipt-total">
          Total received {money(total)}
        </p>
        {refusal && (
          <FieldError testId="receipt-refusal">
            {refusal}
          </FieldError>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" onClick={() => (build() ? setConfirming(true) : undefined)}>
            Record receipt
          </Button>
          <Button variant="ghost" onClick={onBack}>
            Back
          </Button>
        </div>
      </div>

      <Modal
        open={confirming}
        onOpenChange={setConfirming}
        title="Record this receipt?"
        description={`${money(total)} received into ${intoLabel}. A recorded receipt cannot be changed. To undo it, the finance approver cancels it.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Back
            </Button>
            <Button variant="primary" loading={record.isPending} onClick={submit}>
              Record receipt
            </Button>
          </>
        }
      >
        <p className="text-body">It gets its RV number now.</p>
      </Modal>
    </div>
  );
}

/* ── the object ────────────────────────────────────────────────────────────── */

function ReceiptObject({ receiptId, onBack }: { receiptId: string; onBack: () => void }) {
  const detail = useOtherReceipt(receiptId);
  if (detail.isError) return <LoadFailed what="This receipt" onRetry={() => void detail.refetch()} />;
  if (!detail.data) {
    return (
      <div className="p-6 text-body">
        <p>Loading receipt…</p>
      </div>
    );
  }
  return <ReceiptFacts detail={detail.data} onBack={onBack} />;
}

function ReceiptFacts({ detail, onBack }: { detail: OtherReceiptDetail; onBack: () => void }) {
  const me = useMoneyInMe();
  const navigate = useNavigate();
  const cancel = useCancelReceipt();
  const [cancelling, setCancelling] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const r = detail.receipt;
  const mayCancel = me.data?.mayCancel === true && r.status === "posted";
  const [printing, setPrinting] = useState(false);
  const downloadPdf = async () => {
    setPrinting(true);
    try {
      const { renderReceiptPdf } = await import("@/lib/pdf/render");
      window.open(URL.createObjectURL(await renderReceiptPdf(otherReceiptDoc(detail))), "_blank", "noopener");
    } catch (e) {
      toast.error(`The receipt could not be opened — ${(e as Error).message}`);
    } finally {
      setPrinting(false);
    }
  };

  return (
    <div className="flex-1 overflow-auto p-4" data-testid="other-receipt-object">
      <div className="flex flex-col gap-4 max-w-5xl">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" icon="back" onClick={onBack}>
            Back to Other receipts
          </Button>
          <span className="text-strong">{r.receipt_no}</span>
          <StatusPill tone={r.status === "posted" ? "success" : "neutral"}>{otherReceiptStatusWord(r.status)}</StatusPill>
          <span className="flex-1" />
          <Button variant="neutral" loading={printing} onClick={downloadPdf}>
            Download PDF
          </Button>
          {mayCancel && (
            <Button
              variant="neutral"
              onClick={() => {
                setRefusal(null);
                setCancelling(true);
              }}
            >
              Cancel receipt
            </Button>
          )}
        </div>

        <Facts title="Receipt" testId="receipt-facts">
          <Fact label="Received from">{receivedFrom(r)}</Fact>
          <Fact label="Receipt date">{fmtDate(r.receipt_date)}</Fact>
          <Fact label="Received into">{accountLabel({ code: r.money_account_code, name: r.money_account_name })}</Fact>
          <Fact label="Reference">{r.reference ?? "No reference"}</Fact>
          <Fact label="Note">{r.narration ?? "No note"}</Fact>
          <Fact label="Total">{money(r.total_amount)}</Fact>
        </Facts>

        <Facts title="What it was for" testId="receipt-what">
          {detail.allocations.map((a) => (
            <div key={a.invoice_id} className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => navigate(`/finance/other-debtors?invoice=${a.invoice_id}`)}>
                  {a.invoice_no}
                </Button>
                <span>Invoice of {fmtDate(a.invoice_date)}</span>
              </span>
              <span>{money(a.amount)}</span>
            </div>
          ))}
          {detail.lines.map((l) => (
            <p key={l.line_no} className="flex flex-wrap justify-between gap-2">
              <span>
                {accountLabel({ code: l.account_code, name: l.account_name })}
                {" — "}
                {l.description ?? "No description"}
                {l.department_type && <> · <DepartmentName type={l.department_type} id={l.department_id} /></>}
              </span>
              <span>{money(l.amount)}</span>
            </p>
          ))}
        </Facts>

        <Facts title="History">
          <p>
            Recorded · {fmtDate(r.created_at, { time: true })} · {r.created_by_name ?? "Name not available"}
            {r.entry_no ? ` · Ledger entry ${r.entry_no}` : ""}
          </p>
          {r.voided_at && (
            <p>
              Cancelled · {fmtDate(r.voided_at, { time: true })} · {r.voided_by_name ?? "Name not available"}
              {" · "}
              {r.void_reason ?? "No reason on file"}
              {r.reversal_entry_no ? ` · Ledger entry ${r.reversal_entry_no}` : ""}
            </p>
          )}
        </Facts>
      </div>

      <CancelWithReason
        open={cancelling}
        onOpenChange={setCancelling}
        title="Cancel this receipt?"
        description={
          detail.allocations.length
            ? "The ledger entry is reversed on the receipt date, and the invoices it paid owe that money again."
            : "The ledger entry is reversed on the receipt date."
        }
        confirmLabel="Cancel receipt"
        busy={cancel.isPending}
        refusal={refusal}
        onConfirm={(reason) =>
          cancel.mutate(
            { id: r.receipt_id, reason },
            {
              onSuccess: () => {
                setCancelling(false);
                toast.success("Receipt cancelled.");
              },
              onError: (e) => setRefusal(e.message),
            },
          )
        }
      />
    </div>
  );
}
