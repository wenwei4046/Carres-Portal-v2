import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Route, Routes, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  awaitsFinance,
  PAYMENT_REQUEST_STAGE_WORD,
  paymentRequestInput,
  paymentRequestStage,
  type PaymentRequestDocument,
  type PaymentRequestRow,
} from "@carres/shared/payment-requests";
import { AP_FILE_MIME } from "@carres/shared/schemas/finance-ap";
import Button from "@/components/kit/Button";
import DatePicker from "@/components/kit/DatePicker";
import Input from "@/components/kit/Input";
import Modal from "@/components/kit/Modal";
import Tabs from "@/components/kit/Tabs";
import Textarea from "@/components/kit/Textarea";
import ListPageShell from "@/components/ListPageShell";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";
import { REGISTER_FIELD_WIDTH as W } from "@/components/register/register-field-widths";
import { fmtDate } from "@/lib/fmt-date";
import {
  openRequestFile,
  uploadRequestFile,
  usePaymentRequest,
  usePaymentRequests,
  useRequestAct,
  useRequestMe,
  useSavePaymentRequest,
  useUploadRequestFile,
} from "@/lib/payment-request-queries";
import ModuleHeader from "@/pages/operation/components/ModuleHeader";
import SalesOrderTabs from "@/pages/operation/SalesOrderTabs";
import { FactRow, Facts, ReadFailed, ReasonModal } from "../payables/PayablesParts";
import { money, num, refusal } from "../payables/payables-words";

/**
 * Finance → Payment Requests (migration 0645; Chew 2026-10-03,
 * docs/finance/MASTER.md §3.3). Staff Finance or the boss allows ask Finance to pay a
 * bill; Finance answers with a payment voucher or a bill; the person who asked
 * sees the stage, read from that voucher or bill.
 *
 *   /finance/payment-requests            the requests: Finance's all, everyone else their own
 *   /finance/payment-requests/new        ask Finance to pay a bill (the bill attached)
 *   /finance/payment-requests/:id        the request: its stage, the bill, its history
 *   /finance/payment-requests/:id/edit   change it while it waits or after it came back
 *
 * Operation staff reach these pages (FinanceApp lets them in here only); the
 * database decides what each person may see and do (`can`).
 */
export default function PaymentRequests() {
  return (
    <Routes>
      <Route index element={<RequestRegister />} />
      <Route path="new" element={<RequestForm />} />
      <Route path=":id" element={<RequestDetail />} />
      <Route path=":id/edit" element={<RequestForm />} />
    </Routes>
  );
}

const link = "text-kit-blue-11 underline underline-offset-2";
const header = <ModuleHeader destinationHeader testId="payment-requests-destination-header" word="Payment Requests" docTitle="Payment Requests · Carres" />;
const stageOf = (r: PaymentRequestRow) => PAYMENT_REQUEST_STAGE_WORD[paymentRequestStage(r)];
const answerOf = (r: PaymentRequestRow) =>
  r.voucher ? (r.voucher.voucher_no ?? "Draft voucher") : r.bill ? (r.bill.bill_no ?? "Draft bill") : "";

// ── register ────────────────────────────────────────────────────────────────

function RequestRegister() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const me = useRequestMe();
  const finance = me.data?.finance === true;
  const query = usePaymentRequests(finance);
  const view = finance && params.get("view") === "all" ? "all" : "waiting";
  const rows = useMemo(() => {
    const all = query.data ?? [];
    return finance && view === "waiting" ? all.filter((r) => awaitsFinance(paymentRequestStage(r))) : all;
  }, [query.data, finance, view]);

  const columns = useMemo<DataGridColumn<PaymentRequestRow>[]>(() => [
    { key: "no", label: "Request No", width: W.documentNo,
      accessor: (r) => <Link className={link} to={`/finance/payment-requests/${r.id}`}>{r.request_no}</Link>,
      searchValue: (r) => r.request_no, exportValue: (r) => r.request_no },
    { key: "date", label: "Date", width: W.date, accessor: (r) => fmtDate(r.created_at), dateValue: (r) => r.created_at.slice(0, 10),
      filterType: "date", exportValue: (r) => r.created_at.slice(0, 10) },
    ...(finance ? [{ key: "who", label: "Requested by", width: 160, accessor: (r: PaymentRequestRow) => r.requested_by_name ?? "",
      filterValue: (r: PaymentRequestRow) => r.requested_by_name ?? "", filterType: "enum" as const }] : []),
    { key: "payee", label: "Pay to", width: 200, accessor: (r) => r.payee_name, searchValue: (r) => r.payee_name },
    { key: "amount", label: "Amount", width: W.amount, align: "right", accessor: (r) => money(r.amount),
      numberValue: (r) => num(r.amount), exportValue: (r) => num(r.amount) ?? "" },
    // The stage is what both sides open the page for: right after the money.
    { key: "stage", label: "Stage", width: 240, accessor: stageOf, filterValue: stageOf, filterType: "enum" },
    { key: "payBy", label: "Pay by", width: W.date, accessor: (r) => (r.pay_by ? fmtDate(r.pay_by) : ""),
      dateValue: (r) => r.pay_by, filterType: "date" },
    { key: "purpose", label: "What it is for", width: 260, accessor: (r) => r.purpose, searchValue: (r) => r.purpose },
    { key: "answer", label: "Paid by", width: W.documentNo, accessor: answerOf, searchValue: answerOf },
    { key: "files", label: "Files", width: W.qty, align: "right", accessor: (r) => String(r.file_count), numberValue: (r) => r.file_count },
  ], [finance]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {header}
      {query.isError || me.isError ? <ReadFailed what="Payment requests" onRetry={() => { void query.refetch(); void me.refetch(); }} /> : <>
        {finance && (
          <div className="shrink-0 px-4 pt-2">
            <Tabs label="Payment requests view" value={view}
              onValueChange={(v) => setParams((before) => {
                const next = new URLSearchParams(before);
                if (v === "all") next.set("view", "all"); else next.delete("view");
                return next;
              })}
              tabs={[{ value: "waiting", label: "Waiting for Finance" }, { value: "all", label: "All requests" }]} />
          </div>
        )}
        <ListPageShell register>
          <DataGrid
            rows={rows}
            columns={columns}
            rowKey={(r) => r.id}
            rowTestId={(r) => `payment-request-row-${r.request_no}`}
            storageKey={`carres.finance.payment-requests.${finance ? view : "mine"}.v1`}
            appearance="reference"
            exportName="Payment requests"
            groupBanner={false}
            stickyIdentity
            wrapToolbar
            isLoading={!query.isSuccess || !me.isSuccess}
            searchPlaceholder="Search payment requests…"
            toolbarStart={me.data?.may_request ? (
              <Button variant="primary" shape="pill" icon="add" data-testid="new-payment-request"
                onClick={() => navigate("/finance/payment-requests/new")}>New Payment Request</Button>
            ) : undefined}
            emptyMessage={finance && view === "waiting"
              ? "No payment request is waiting for Finance."
              : "No payment request yet. Ask Finance to pay a bill with New Payment Request."}
            onRowDoubleClick={(r) => navigate(`/finance/payment-requests/${r.id}`)}
            statusSummary={(visible) => (
              <span data-testid="payment-requests-summary">
                {visible.length} {visible.length === 1 ? "request" : "requests"} · {money(visible.reduce((s, r) => s + Math.round((num(r.amount) ?? 0) * 100), 0) / 100)}
              </span>
            )}
          />
        </ListPageShell>
      </>}
    </div>
  );
}

// ── detail ──────────────────────────────────────────────────────────────────

const EVENT_WORD: Record<string, string> = {
  submitted: "Sent to Finance",
  edited: "Changed",
  resubmitted: "Changed and sent to Finance again",
  withdrawn: "Withdrawn",
  returned: "Returned",
  answered: "Answered with",
  file_added: "File attached",
};

function RequestDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const query = usePaymentRequest(id);
  const act = useRequestAct();
  const upload = useUploadRequestFile(id ?? "");
  const input = useRef<HTMLInputElement>(null);
  const [withdrawing, setWithdrawing] = useState(false);
  const [returning, setReturning] = useState(false);
  const doc = query.data;

  if (query.isError) return <div className="flex h-full min-h-0 flex-col">{header}<ReadFailed what="This payment request" onRetry={() => void query.refetch()} /></div>;
  if (!doc || !id) return <div className="p-6 text-body">Loading payment request…</div>;
  const r = doc.request;
  const stage = paymentRequestStage(r);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SalesOrderTabs
        identity={r.request_no}
        customer={r.payee_name}
        backTo="/finance/payment-requests"
        backLabel="Payment Requests"
        docTitle={`${r.request_no} · Carres`}
        status={<span data-testid="payment-request-stage">{PAYMENT_REQUEST_STAGE_WORD[stage]}</span>}
        right={
          <span className="flex flex-wrap items-center gap-2">
            {doc.can.edit && <Button icon="edit" onClick={() => navigate(`/finance/payment-requests/${id}/edit`)}>Edit</Button>}
            {doc.can.withdraw && <Button onClick={() => setWithdrawing(true)}>Withdraw request</Button>}
          </span>
        }
      />
      <div className="flex-1 overflow-auto p-4" data-testid="payment-request-object-scroll">
        <div className="flex flex-col gap-4">
          {/* Finance's answer sits in the page, not the header: three actions
              wrap here on a phone, where the header cannot. */}
          {(doc.can.answer || doc.can.return) && (
            <Facts title="Answer the request" testId="payment-request-answer">
              <p className="mb-2">Pay it now with a payment voucher, or enter it as a bill to pay later. Each answers this request.</p>
              <div className="flex flex-wrap gap-2">
                {doc.can.answer && <Button variant="primary" onClick={() => navigate(`/finance/payment-vouchers/new?request=${id}`)}>Make payment voucher</Button>}
                {doc.can.answer && <Button onClick={() => navigate(`/finance/bills/new?request=${id}`)}>Make bill</Button>}
                {doc.can.return && <Button onClick={() => setReturning(true)}>Return request</Button>}
              </div>
            </Facts>
          )}
          {r.status === "returned" && r.return_note && (
            <div role="status" className="rounded-card bg-kit-amber-3 px-4 py-3 text-body text-kit-amber-11" data-testid="payment-request-returned">
              Returned by {r.decided_by_name ?? "Finance"}: {r.return_note}
            </div>
          )}
          {doc.can.answer === false && doc.finance && awaitsFinance(stage) && r.file_count === 0 && (
            <div role="status" className="rounded-card bg-kit-amber-3 px-4 py-3 text-body text-kit-amber-11">
              No bill is attached yet. Finance pays a request once its bill is attached.
            </div>
          )}
          <Facts title="What is asked">
            <FactRow label="Requested by">{r.requested_by_name ?? "Name not available"} · {fmtDate(r.created_at, { time: true })}</FactRow>
            <FactRow label="Pay to">{r.payee_name}</FactRow>
            <FactRow label="Amount">{money(r.amount)}</FactRow>
            {r.pay_by && <FactRow label="Pay by">{fmtDate(r.pay_by)}</FactRow>}
            <FactRow label="What it is for">{r.purpose}</FactRow>
            {(r.bill_no || r.bill_date) && (
              <FactRow label="The bill">{[r.bill_no, r.bill_date ? fmtDate(r.bill_date) : null].filter(Boolean).join(" · ")}</FactRow>
            )}
            {(r.bank_name || r.bank_account_no || r.bank_account_holder) && (
              <FactRow label="Pay into">{[r.bank_name, r.bank_account_no, r.bank_account_holder].filter(Boolean).join(" · ")}</FactRow>
            )}
            {r.note && <FactRow label="Note">{r.note}</FactRow>}
            <FactRow label="Stage">{PAYMENT_REQUEST_STAGE_WORD[stage]}</FactRow>
            {(r.voucher || r.bill) && (
              <FactRow label="Paid by">
                {doc.finance
                  ? <Link className={link} to={r.voucher ? `/finance/payment-vouchers/${r.voucher.id}` : `/finance/bills/${r.bill!.id}`}>{answerOf(r)}</Link>
                  : answerOf(r)}
              </FactRow>
            )}
          </Facts>
          <Facts title="The bill" testId="payment-request-files"
            right={doc.can.add_file ? (
              <span>
                <input ref={input} type="file" hidden multiple accept={AP_FILE_MIME.join(",")} aria-label="Attach the bill"
                  data-testid="payment-request-attach-input"
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? []);
                    e.target.value = "";
                    void (async () => {
                      for (const f of files) {
                        try { await upload.mutateAsync(f); } catch (err) { toast.error(refusal(err)); return; }
                      }
                      if (files.length > 0) toast.success(files.length === 1 ? "File attached" : "Files attached");
                    })();
                  }} />
                <Button icon="attach" loading={upload.isPending} onClick={() => input.current?.click()}>Attach file</Button>
              </span>
            ) : undefined}>
            {doc.files.length === 0
              ? <p>No file attached.</p>
              : doc.files.map((f) => (
                <p key={f.id}>
                  <button type="button" className={link} onClick={() => void openRequestFile(f.storage_path).catch((e) => toast.error(refusal(e)))}>
                    {f.file_name}
                  </button>
                  {" · "}{fmtDate(f.uploaded_at, { time: true })} · {f.uploaded_by_name ?? "Name not available"}
                </p>
              ))}
          </Facts>
          <Facts title="History" testId="payment-request-history">
            {doc.events.map((e, i) => (
              <p key={`${e.at}-${i}`}>
                {EVENT_WORD[e.action] ?? e.action}{e.note ? ` ${e.action === "answered" ? "" : "· "}${e.note}` : ""} · {fmtDate(e.at, { time: true })} · {e.actor_name ?? "Name not available"}
              </p>
            ))}
          </Facts>
        </div>
      </div>
      <Modal open={withdrawing} onOpenChange={(o) => { if (!o) setWithdrawing(false); }}
        title="Withdraw this request?"
        description="Finance will not pay it. A withdrawn request cannot be sent again; ask again with a new request."
        footer={<span className="flex gap-2">
          <Button variant="ghost" onClick={() => setWithdrawing(false)}>Back</Button>
          <Button variant="primary" loading={act.isPending} onClick={() => act.mutate({ id, act: "withdraw" }, {
            onSuccess: () => { setWithdrawing(false); toast.success("Request withdrawn"); },
            onError: (e) => toast.error(refusal(e)),
          })}>Withdraw request</Button>
        </span>}>
        <p className="text-body">{r.request_no} · {r.payee_name} · {money(r.amount)}</p>
      </Modal>
      <ReasonModal open={returning} title={`Return ${r.request_no}?`}
        description={`${r.requested_by_name ?? "The person who asked"} reads why, changes the request and sends it again.`}
        action="Return request" busy={act.isPending} onClose={() => setReturning(false)}
        onSubmit={(note) => act.mutate({ id, act: "return", note }, {
          onSuccess: () => { setReturning(false); toast.success("Request returned"); },
          onError: (e) => toast.error(refusal(e)),
        })} />
    </div>
  );
}

// ── form ────────────────────────────────────────────────────────────────────

function RequestForm() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const existing = usePaymentRequest(id);
  const save = useSavePaymentRequest();
  const input = useRef<HTMLInputElement>(null);

  const [payee, setPayee] = useState("");
  const [amount, setAmount] = useState("");
  const [purpose, setPurpose] = useState("");
  const [payBy, setPayBy] = useState<string | null>(null);
  const [billNo, setBillNo] = useState("");
  const [billDate, setBillDate] = useState<string | null>(null);
  const [bankName, setBankName] = useState("");
  const [accountNo, setAccountNo] = useState("");
  const [holder, setHolder] = useState("");
  const [note, setNote] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [loaded, setLoaded] = useState(!id);

  useEffect(() => {
    const d: PaymentRequestDocument | undefined = existing.data;
    if (!id || loaded || !d) return;
    const r = d.request;
    setPayee(r.payee_name);
    setAmount(String(r.amount));
    setPurpose(r.purpose);
    setPayBy(r.pay_by);
    setBillNo(r.bill_no ?? "");
    setBillDate(r.bill_date);
    setBankName(r.bank_name ?? "");
    setAccountNo(r.bank_account_no ?? "");
    setHolder(r.bank_account_holder ?? "");
    setNote(r.note ?? "");
    setLoaded(true);
  }, [id, loaded, existing.data]);

  const typed = {
    payeeName: payee, amount: amount.trim() === "" ? Number.NaN : Number(amount), purpose,
    payBy, note, bankName, bankAccountNo: accountNo, bankAccountHolder: holder, billNo, billDate,
  };
  const checked = paymentRequestInput.safeParse(typed);
  const gap = !checked.success
    ? (Number.isNaN(typed.amount) && payee.trim() !== "" ? "Type the amount" : checked.error.issues[0]?.message ?? "Check the form")
    : !id && files.length === 0 ? "Attach the bill" : null;

  const submit = () => {
    if (!checked.success || gap) return;
    save.mutate({ id, input: checked.data }, {
      onSuccess: async (out) => {
        for (const f of files) {
          try {
            await uploadRequestFile(out.id, f);
          } catch {
            toast.error("The request is sent, but the bill could not be attached. Attach it on the request.");
            break;
          }
        }
        toast.success(id ? "Request changed" : "Request sent to Finance");
        navigate(`/finance/payment-requests/${out.id}`);
      },
      onError: (e) => toast.error(refusal(e)),
    });
  };

  if (id && existing.isError) return <ReadFailed what="This payment request" onRetry={() => void existing.refetch()} />;
  if (id && !loaded) return <div className="p-6 text-body">Loading payment request…</div>;
  if (id && existing.data && !existing.data.can.edit) {
    return <div className="p-6 text-body">Only a request waiting for Finance, or returned to you, can be changed. <Link className={link} to={`/finance/payment-requests/${id}`}>Back to the request</Link></div>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SalesOrderTabs
        identity={id ? (existing.data?.request.request_no ?? "Payment request") : "New Payment Request"}
        customer={payee.trim() || null}
        backTo={id ? `/finance/payment-requests/${id}` : "/finance/payment-requests"}
        backLabel={id ? "Payment request" : "Payment Requests"}
        right={
          <span className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => navigate(id ? `/finance/payment-requests/${id}` : "/finance/payment-requests")}>Back</Button>
            <Button variant="primary" disabled={gap !== null} loading={save.isPending} onClick={submit} data-testid="send-payment-request">
              {gap ?? (id ? "Send again" : "Send to Finance")}
            </Button>
          </span>
        }
      />
      <div className="flex-1 overflow-auto p-4" data-testid="payment-request-form">
        <div className="flex max-w-[900px] flex-col gap-4">
          <Facts title="What to pay">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Input id="prq-payee" label="Pay to" value={payee} maxLength={120} onChange={(e) => setPayee(e.target.value)} />
              <Input id="prq-amount" label="Amount (RM)" type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
              <Input id="prq-purpose" label="What it is for" value={purpose} maxLength={300} onChange={(e) => setPurpose(e.target.value)} />
              <DatePicker id="prq-pay-by" label="Pay by" value={payBy} onChange={setPayBy} hint="Leave empty when there is no date." />
            </div>
          </Facts>
          <Facts title="The bill">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Input id="prq-bill-no" label="Bill No" value={billNo} maxLength={80} onChange={(e) => setBillNo(e.target.value)} hint="The number printed on the bill." />
              <DatePicker id="prq-bill-date" label="Bill date" value={billDate} onChange={setBillDate} />
            </div>
            {!id && (
              <div className="mt-3 flex flex-col gap-2" data-testid="payment-request-form-files">
                <input ref={input} type="file" hidden multiple accept={AP_FILE_MIME.join(",")} aria-label="Attach the bill"
                  data-testid="payment-request-form-input"
                  onChange={(e) => { const picked = Array.from(e.target.files ?? []); e.target.value = ""; setFiles((b) => [...b, ...picked]); }} />
                {files.map((f, i) => (
                  <span key={`${f.name}-${i}`} className="flex items-center gap-2 text-body">
                    {f.name}
                    <Button size="sm" variant="ghost" onClick={() => setFiles((b) => b.filter((_, j) => j !== i))}>Remove</Button>
                  </span>
                ))}
                <span><Button icon="attach" onClick={() => input.current?.click()}>Attach the bill</Button></span>
              </div>
            )}
          </Facts>
          <Facts title="Pay into">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <Input id="prq-bank" label="Bank" value={bankName} maxLength={80} onChange={(e) => setBankName(e.target.value)} />
              <Input id="prq-account" label="Account No" value={accountNo} maxLength={40} inputMode="numeric" onChange={(e) => setAccountNo(e.target.value)} />
              <Input id="prq-holder" label="Account holder" value={holder} maxLength={120} onChange={(e) => setHolder(e.target.value)} />
            </div>
          </Facts>
          <Facts title="Note to Finance">
            <Textarea id="prq-note" label="Note" value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} />
          </Facts>
        </div>
      </div>
    </div>
  );
}
