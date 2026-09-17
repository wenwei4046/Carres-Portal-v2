// design-standard: not-a-list-page — one invoice: its own line list, not a register.
/**
 * ONE other debtor invoice (ARI), at `/finance/other-debtors?invoice=new|<id>`.
 *
 *   new or draft  → the form: Save draft · Issue invoice (· Cancel invoice)
 *   issued        → the object: Record receipt · Cancel invoice (approver)
 *   cancelled     → the object, read only, with the reason
 *
 * Issue posts Dr Other debtors / Cr each line at once, so it asks first. The
 * database decides again on every press; the buttons only stay away from
 * people and states that cannot use them.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  otherDebtorInvoiceInput,
  otherDebtorInvoiceNumberWord,
  otherDebtorInvoiceStatusWord,
  otherDebtorOutstandingWord,
  otherReceiptStatusWord,
  type OtherDebtorInvoiceDetail,
} from "@carres/shared/other-money-in";
import Button from "@/components/kit/Button";
import DatePicker from "@/components/kit/DatePicker";
import Input from "@/components/kit/Input";
import Modal from "@/components/kit/Modal";
import Select from "@/components/kit/Select";
import StatusPill from "@/components/kit/StatusPill";
import Textarea from "@/components/kit/Textarea";
import { appTodayIso, fmtDate } from "@/lib/fmt-date";
import { toast } from "sonner";
import { otherDebtorInvoiceDoc } from "@/lib/pdf/other-money-in-docs";
import {
  useCancelInvoice,
  useMoneyInAccounts,
  useMoneyInMe,
  useOtherDebtorInvoice,
  useOtherDebtorParties,
  useSaveInvoice,
} from "./api";
import {
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

const TONE = { draft: "neutral", issued: "info", cancelled: "neutral" } as const;

export default function InvoicePage({
  invoiceId,
  prefillPartyId,
  onBack,
  onOpen,
}: {
  /** null = a new invoice. */
  invoiceId: string | null;
  prefillPartyId: string | null;
  onBack: () => void;
  onOpen: (id: string) => void;
}) {
  const detail = useOtherDebtorInvoice(invoiceId);
  if (invoiceId === null) {
    return <InvoiceForm key="new" draft={null} prefillPartyId={prefillPartyId} onBack={onBack} onOpen={onOpen} />;
  }
  if (detail.isError) return <LoadFailed what="This invoice" onRetry={() => void detail.refetch()} />;
  if (!detail.data) {
    return (
      <div className="p-6 text-body flex flex-col items-start gap-3">
        <p>Loading invoice…</p>
      </div>
    );
  }
  if (detail.data.invoice.status === "draft") {
    return (
      <InvoiceForm
        key={detail.data.invoice.invoice_id}
        draft={detail.data}
        prefillPartyId={null}
        onBack={onBack}
        onOpen={onOpen}
      />
    );
  }
  return <InvoiceObject detail={detail.data} onBack={onBack} />;
}

/* ── the form: a new invoice or a draft ────────────────────────────────────── */

function InvoiceForm({
  draft,
  prefillPartyId,
  onBack,
  onOpen,
}: {
  draft: OtherDebtorInvoiceDetail | null;
  prefillPartyId: string | null;
  onBack: () => void;
  onOpen: (id: string) => void;
}) {
  const parties = useOtherDebtorParties();
  const accounts = useMoneyInAccounts();
  const save = useSaveInvoice();
  const cancel = useCancelInvoice();
  const d = draft?.invoice ?? null;

  const [partyId, setPartyId] = useState<string | undefined>(d?.party_id ?? prefillPartyId ?? undefined);
  const [invoiceDate, setInvoiceDate] = useState<string | null>(d?.invoice_date ?? appTodayIso());
  const [dueDate, setDueDate] = useState<string | null>(d?.due_date ?? null);
  const [reference, setReference] = useState(d?.reference ?? "");
  const [narration, setNarration] = useState(d?.narration ?? "");
  const [lines, setLines] = useState<TypedLine[]>(() =>
    draft && draft.lines.length
      ? draft.lines.map((l) => ({
          ...blankLine(),
          account_code: l.account_code,
          description: l.description ?? "",
          amount: Number(l.amount).toFixed(2),
        }))
      : [blankLine()],
  );
  const [lineErrors, setLineErrors] = useState<LineErrors>({});
  const [fieldErrors, setFieldErrors] = useState<{ party?: string; date?: string; due?: string; lines?: string }>({});
  const [refusal, setRefusal] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelRefusal, setCancelRefusal] = useState<string | null>(null);

  const invoiceAccounts = useMemo(() => (accounts.data ?? []).filter((a) => a.for_invoice_line), [accounts.data]);
  /* A retired party can stay on a draft it was already on — the database
     refuses to ISSUE to it, and says so — but it is never offered anew. */
  const partyOptions = useMemo(
    () =>
      (parties.data ?? [])
        .filter((p) => p.is_active || p.party_id === d?.party_id)
        .map((p) => ({ value: p.party_id, label: p.is_active ? p.name : `${p.name} (not active)` })),
    [parties.data, d?.party_id],
  );
  const total = typedTotal(lines);

  const build = (issue: boolean) => {
    const read = readLines(lines);
    const errs: typeof fieldErrors = {};
    if (!partyId) errs.party = "Choose who the invoice is for.";
    if (!invoiceDate) errs.date = "Choose the invoice date.";
    if (invoiceDate && dueDate && dueDate < invoiceDate) errs.due = "The due date cannot be before the invoice date.";
    if (Object.keys(read.errors).length === 0 && read.lines.length === 0) errs.lines = "An invoice needs at least one line.";
    setLineErrors(read.errors);
    setFieldErrors(errs);
    if (Object.keys(errs).length || Object.keys(read.errors).length) return null;
    const parsed = otherDebtorInvoiceInput.safeParse({
      party_id: partyId,
      invoice_date: invoiceDate,
      due_date: dueDate,
      reference: reference.trim() || null,
      narration: narration.trim() || null,
      lines: read.lines,
      issue,
    });
    if (!parsed.success) {
      setRefusal(parsed.error.issues[0]?.message ?? "Check the invoice.");
      return null;
    }
    return parsed.data;
  };

  const submit = (issue: boolean) => {
    setRefusal(null);
    const input = build(issue);
    if (!input) {
      setConfirming(false);
      return;
    }
    save.mutate(
      { id: d?.invoice_id ?? null, input },
      {
        onSuccess: (res) => {
          setConfirming(false);
          toast.success(issue ? "Invoice issued." : "Draft saved.");
          onOpen(res.id);
        },
        onError: (e) => {
          setConfirming(false);
          setRefusal(e.message);
        },
      },
    );
  };

  if (parties.isError || accounts.isError) {
    return (
      <LoadFailed
        what="The parties and accounts for this form"
        onRetry={() => {
          void parties.refetch();
          void accounts.refetch();
        }}
      />
    );
  }

  const partyName = partyOptions.find((p) => p.value === partyId)?.label ?? "the party";

  return (
    <div className="flex-1 overflow-auto p-4" data-testid="other-debtor-invoice-form">
      <div className="flex flex-col gap-4 max-w-5xl">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" icon="back" onClick={onBack}>
            Back to Other debtors
          </Button>
          <span className="text-strong">{d ? otherDebtorInvoiceNumberWord(d) : "New invoice"}</span>
          {d && <StatusPill tone="neutral">Draft</StatusPill>}
        </div>

        <Facts title="Who and when">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Select
              id="invoice-party"
              label="Party"
              required
              value={partyId}
              onValueChange={setPartyId}
              options={partyOptions}
              placeholder={parties.isLoading ? "Loading parties…" : partyOptions.length ? "Choose a party" : "No party yet — add one on Parties"}
              error={fieldErrors.party}
            />
            <Input
              id="invoice-reference"
              label="Reference"
              maxLength={120}
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
            <DatePicker id="invoice-date" label="Invoice date" required value={invoiceDate} onChange={setInvoiceDate} error={fieldErrors.date} />
            <DatePicker
              id="invoice-due"
              label="Due date"
              value={dueDate}
              onChange={setDueDate}
              minDate={invoiceDate ?? undefined}
              placeholder="No due date"
              error={fieldErrors.due}
            />
          </div>
          <Textarea id="invoice-narration" label="Note" rows={2} maxLength={500} value={narration} onChange={(e) => setNarration(e.target.value)} />
        </Facts>

        <Facts title="What it is for">
          <LinesEditor
            idPrefix="invoice"
            lines={lines}
            onChange={setLines}
            accounts={invoiceAccounts}
            errors={lineErrors}
            accountPlaceholder={accounts.isLoading ? "Loading accounts…" : "Choose an account"}
          />
          {fieldErrors.lines && (
            <p role="alert" className="text-meta text-kit-red-11">
              {fieldErrors.lines}
            </p>
          )}
          <p className="text-strong mt-2" data-testid="invoice-total">
            Total {money(total)}
          </p>
        </Facts>

        {refusal && (
          <p role="alert" className="text-body text-kit-red-11" data-testid="invoice-refusal">
            {refusal}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" onClick={() => (build(true) ? setConfirming(true) : undefined)}>
            Issue invoice
          </Button>
          <Button variant="neutral" loading={save.isPending && !confirming} onClick={() => submit(false)}>
            Save draft
          </Button>
          {d && (
            <Button
              variant="ghost"
              onClick={() => {
                setCancelRefusal(null);
                setCancelling(true);
              }}
            >
              Cancel invoice
            </Button>
          )}
        </div>
      </div>

      <Modal
        open={confirming}
        onOpenChange={setConfirming}
        title="Issue this invoice?"
        description={`${money(total)} to ${partyName}. An issued invoice cannot be changed. To undo it, the finance approver cancels it.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Back
            </Button>
            <Button variant="primary" loading={save.isPending} onClick={() => submit(true)}>
              Issue invoice
            </Button>
          </>
        }
      >
        <p className="text-body">It gets its ARI number now, and the amount is added to what {partyName} owes.</p>
      </Modal>

      {d && (
        <CancelWithReason
          open={cancelling}
          onOpenChange={setCancelling}
          title="Cancel this draft?"
          description="The draft stays on the list as Cancelled. Nothing was issued, so nothing is reversed."
          confirmLabel="Cancel invoice"
          busy={cancel.isPending}
          refusal={cancelRefusal}
          onConfirm={(reason) =>
            cancel.mutate(
              { id: d.invoice_id, reason },
              {
                onSuccess: () => {
                  setCancelling(false);
                  toast.success("Invoice cancelled.");
                },
                onError: (e) => setCancelRefusal(e.message),
              },
            )
          }
        />
      )}
    </div>
  );
}

/* ── the object: issued or cancelled ───────────────────────────────────────── */

function InvoiceObject({ detail, onBack }: { detail: OtherDebtorInvoiceDetail; onBack: () => void }) {
  const me = useMoneyInMe();
  const navigate = useNavigate();
  const cancel = useCancelInvoice();
  const [cancelling, setCancelling] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const inv = detail.invoice;
  const outstandingWord = otherDebtorOutstandingWord(inv);
  const liveReceipts = detail.receipts.filter((r) => r.status === "posted");
  const mayCancel = me.data?.mayCancel === true && inv.status === "issued";
  const owes = inv.status === "issued" && (inv.outstanding ?? 0) > 0;
  const parties = useOtherDebtorParties();
  const [printing, setPrinting] = useState(false);
  const downloadPdf = async () => {
    setPrinting(true);
    try {
      const doc = otherDebtorInvoiceDoc(detail, parties.data?.find((p) => p.party_id === inv.party_id));
      if (!doc) return;
      const { renderOtherDebtorInvoicePdf } = await import("@/lib/pdf/render");
      window.open(URL.createObjectURL(await renderOtherDebtorInvoicePdf(doc)), "_blank", "noopener");
    } catch (e) {
      toast.error(`The invoice could not be opened — ${(e as Error).message}`);
    } finally {
      setPrinting(false);
    }
  };

  return (
    <div className="flex-1 overflow-auto p-4" data-testid="other-debtor-invoice-object">
      <div className="flex flex-col gap-4 max-w-5xl">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" icon="back" onClick={onBack}>
            Back to Other debtors
          </Button>
          <span className="text-strong">{otherDebtorInvoiceNumberWord(inv)}</span>
          <StatusPill tone={TONE[inv.status]}>{otherDebtorInvoiceStatusWord(inv.status)}</StatusPill>
          <span className="flex-1" />
          <Button variant="neutral" loading={printing} disabled={parties.isLoading} onClick={downloadPdf}>
            Download PDF
          </Button>
          {owes && (
            <Button
              variant="primary"
              onClick={() => navigate(`/finance/other-receipts?receipt=new&party=${inv.party_id}&invoice=${inv.invoice_id}`)}
            >
              Record receipt
            </Button>
          )}
          {mayCancel && (
            <Button
              variant="neutral"
              onClick={() => {
                setRefusal(null);
                setCancelling(true);
              }}
            >
              Cancel invoice
            </Button>
          )}
        </div>

        <Facts title="Invoice" testId="invoice-facts">
          <Fact label="Party">{inv.party_name}</Fact>
          <Fact label="Invoice date">{fmtDate(inv.invoice_date)}</Fact>
          <Fact label="Due date">{inv.due_date ? fmtDate(inv.due_date) : "No due date"}</Fact>
          <Fact label="Reference">{inv.reference ?? "No reference"}</Fact>
          <Fact label="Note">{inv.narration ?? "No note"}</Fact>
          <Fact label="Total">{money(inv.total_amount)}</Fact>
          <Fact label="Received">{money(inv.received_amount)}</Fact>
          <Fact label="Outstanding">
            <span data-testid="invoice-outstanding">{outstandingWord ?? money(inv.outstanding)}</span>
          </Fact>
        </Facts>

        <Facts title="Lines">
          {detail.lines.map((l) => (
            <p key={l.line_no} className="flex flex-wrap justify-between gap-2">
              <span>
                {l.account_code} · {l.account_name}
                {" — "}
                {l.description ?? "No description"}
              </span>
              <span>{money(l.amount)}</span>
            </p>
          ))}
        </Facts>

        <Facts title="Receipts" testId="invoice-receipts">
          {detail.receipts.length === 0 ? (
            <p>No receipt against this invoice yet.</p>
          ) : (
            detail.receipts.map((r) => (
              <div key={r.receipt_id} className="flex flex-wrap items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => navigate(`/finance/other-receipts?receipt=${r.receipt_id}`)}>
                  {r.receipt_no}
                </Button>
                <span>
                  {fmtDate(r.receipt_date)} · {money(r.amount)}
                  {r.status === "voided" ? ` · ${otherReceiptStatusWord(r.status)}` : ""}
                </span>
              </div>
            ))
          )}
        </Facts>

        <Facts title="History">
          <p>
            Created · {fmtDate(inv.created_at, { time: true })} · {inv.created_by_name ?? "Name not available"}
          </p>
          {inv.issued_at && (
            <p>
              Issued · {fmtDate(inv.issued_at, { time: true })} · {inv.issued_by_name ?? "Name not available"}
              {inv.entry_no ? ` · Ledger entry ${inv.entry_no}` : ""}
            </p>
          )}
          {inv.cancelled_at && (
            <p>
              Cancelled · {fmtDate(inv.cancelled_at, { time: true })} · {inv.cancelled_by_name ?? "Name not available"}
              {" · "}
              {inv.cancel_reason ?? "No reason on file"}
              {inv.reversal_entry_no ? ` · Ledger entry ${inv.reversal_entry_no}` : ""}
            </p>
          )}
        </Facts>
      </div>

      <CancelWithReason
        open={cancelling}
        onOpenChange={setCancelling}
        title="Cancel this invoice?"
        description={
          liveReceipts.length
            ? "Money has been received against it. Cancel those receipts first."
            : "The ledger entry is reversed on the invoice date. The party no longer owes this amount."
        }
        confirmLabel="Cancel invoice"
        busy={cancel.isPending}
        refusal={refusal}
        onConfirm={(reason) =>
          cancel.mutate(
            { id: inv.invoice_id, reason },
            {
              onSuccess: () => {
                setCancelling(false);
                toast.success("Invoice cancelled.");
              },
              onError: (e) => setRefusal(e.message),
            },
          )
        }
      />
    </div>
  );
}
