import { useEffect, useMemo, useState } from "react";
import { Link, Route, Routes, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  PAYMENT_VOUCHER_METHODS,
  type ApAccountChoice,
  type ApBillOutstandingRow,
  type PaymentVoucherDocument,
  type PaymentVoucherDraftInput,
  type PaymentVoucherRegisterRow,
  type SupplierBillRegisterRow,
} from "@carres/shared/schemas/finance-ap";
import ListPageShell from "@/components/ListPageShell";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";
import Button from "@/components/kit/Button";
import Modal from "@/components/kit/Modal";
import { fieldCls } from "@/components/Field";
import ModuleHeader from "@/pages/operation/components/ModuleHeader";
import SalesOrderTabs from "@/pages/operation/SalesOrderTabs";
import { appTodayIso, fmtDate } from "@/lib/fmt-date";
import {
  useApAccounts,
  useApBillOutstanding,
  useApSuppliers,
  usePaymentVoucher,
  useSupplierBills,
  usePaymentVouchers,
  useSaveVoucher,
  useVoucherAct,
  type VoucherAct,
} from "@/lib/payables-queries";
import {
  PAY_METHOD_WORD,
  VOUCHER_PURPOSE_WORD,
  VOUCHER_STATUS_WORD,
  cents,
  creditorKindWord,
  money,
  num,
  priceCheckWord,
  refusal,
  word,
} from "./payables-words";
import { FactRow, Facts, FilesCard, HistoryCard, PayablesSwitch, ReadFailed, ReasonModal } from "./PayablesParts";
import { VoucherAdvanceCard } from "./VoucherAdvance";
import { paymentVoucherPrint } from "./voucher-print";
import { paysOut } from "@carres/shared/money-accounts";
import { useMoneyAccounts } from "../settings/api";

/**
 * Finance → Payment Vouchers (migration 0477). The ONE door money leaves
 * Carres by — a supplier's bills, a landlord's rent, a direct expense:
 *   /finance/payment-vouchers            the register
 *   /finance/payment-vouchers/new        a new voucher (?supplier= · ?bill=)
 *   /finance/payment-vouchers/:id        the voucher, walked Draft → Prepared → Checked → Approved
 *   /finance/payment-vouchers/:id/edit   change a draft
 *
 * Approving posts it: Dr the payables account of every bill paid and Dr every
 * direct line's account · Cr the account the money left from, dated the
 * voucher date. Cancelling an approved voucher reverses that entry on the same
 * date. Who may do each step is the database's answer (`can`), never this page's.
 *
 * Advance (0484–0485): a supplier voucher may also carry money paid before
 * the bill. Approving posts it Dr the payables account like a bill payment;
 * it is applied to a bill later, or sent back, from the voucher's Advance card.
 */
export default function PaymentVouchers() {
  return (
    <Routes>
      <Route index element={<VoucherRegister />} />
      <Route path="new" element={<VoucherForm />} />
      <Route path=":id" element={<VoucherDetail />} />
      <Route path=":id/edit" element={<VoucherForm />} />
    </Routes>
  );
}

// ── register ────────────────────────────────────────────────────────────────

function VoucherRegister() {
  const navigate = useNavigate();
  const query = usePaymentVouchers();
  const rows = query.data ?? [];
  const columns = useMemo<DataGridColumn<PaymentVoucherRegisterRow>[]>(() => [
    { key: "voucher", label: "Voucher No", width: 170,
      accessor: (r) => <Link className="text-kit-blue-11 underline underline-offset-2" to={`/finance/payment-vouchers/${r.id}`}>{r.voucher_no ?? "Draft, no number yet"}</Link>,
      searchValue: (r) => r.voucher_no ?? "", exportValue: (r) => r.voucher_no ?? "Draft, no number yet" },
    { key: "date", label: "Voucher Date", width: 130, accessor: (r) => fmtDate(r.voucher_date),
      dateValue: (r) => r.voucher_date, filterType: "date", exportValue: (r) => fmtDate(r.voucher_date) },
    { key: "payee", label: "Payee", width: 200, accessor: (r) => r.payee_name, searchValue: (r) => r.payee_name },
    { key: "supplier", label: "Supplier", width: 200, accessor: (r) => r.supplier_name ?? "No supplier",
      searchValue: (r) => r.supplier_name ?? "", filterType: "enum" },
    { key: "purpose", label: "Purpose", width: 160, accessor: (r) => word(VOUCHER_PURPOSE_WORD, r.purpose),
      filterValue: (r) => word(VOUCHER_PURPOSE_WORD, r.purpose), filterType: "enum" },
    { key: "bills", label: "Bills Paid", width: 200, accessor: (r) => r.bill_nos ?? "No bill",
      searchValue: (r) => r.bill_nos ?? "" },
    { key: "from", label: "Paid From", width: 180,
      accessor: (r) => `${r.pay_from_account_code} ${r.pay_from_name ?? ""}`.trim(), filterType: "enum" },
    { key: "method", label: "Method", width: 130, accessor: (r) => word(PAY_METHOD_WORD, r.pay_method),
      filterValue: (r) => word(PAY_METHOD_WORD, r.pay_method), filterType: "enum" },
    { key: "status", label: "Status", width: 120, accessor: (r) => word(VOUCHER_STATUS_WORD, r.status),
      filterValue: (r) => word(VOUCHER_STATUS_WORD, r.status), filterType: "enum" },
    { key: "advance", label: "Advance", width: 190, accessor: (r) => advanceCell(r),
      exportValue: (r) => num(r.advance_amount) ?? "" },
    { key: "amount", label: "Amount", width: 140, align: "right", accessor: (r) => money(r.amount),
      numberValue: (r) => num(r.amount), filterType: "number", exportValue: (r) => num(r.amount) ?? "" },
    { key: "prepared", label: "Prepared By", width: 150, accessor: (r) => r.prepared_by_name ?? "Not prepared yet",
      filterType: "enum" },
    { key: "checked", label: "Checked By", width: 150, accessor: (r) => r.checked_by_name ?? "Not checked yet",
      filterType: "enum" },
    { key: "approved", label: "Approved By", width: 150, accessor: (r) => r.approved_by_name ?? "Not approved yet",
      filterType: "enum" },
    { key: "files", label: "Files", width: 90, align: "right", accessor: (r) => String(r.file_count),
      numberValue: (r) => r.file_count },
  ], []);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ModuleHeader destinationHeader testId="vouchers-destination-header" word="Payment Vouchers"
        docTitle="Payment Vouchers — Carres" />
      {query.isError ? <ReadFailed what="Payment vouchers" onRetry={() => void query.refetch()} /> : (
        <ListPageShell register>
          <DataGrid
            rows={rows}
            columns={columns}
            rowKey={(r) => r.id}
            storageKey="carres.finance.payment-vouchers.v1"
            appearance="reference"
            exportName="Payment Vouchers"
            groupBanner={false}
            stickyIdentity
            isLoading={!query.isSuccess}
            searchPlaceholder="Search payment vouchers…"
            toolbarStart={
              <span className="flex items-center gap-4">
                <button
                  type="button"
                  data-testid="new-voucher"
                  onClick={() => navigate("/finance/payment-vouchers/new")}
                  className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full bg-kit-blue-9 px-3 text-meta font-semibold text-white hover:opacity-90"
                >
                  + New Payment Voucher
                </button>
                <PayablesSwitch current="vouchers" />
              </span>
            }
            emptyMessage="No payment vouchers yet. Every payment to a supplier or creditor starts here."
            onRowDoubleClick={(r) => navigate(`/finance/payment-vouchers/${r.id}`)}
            statusSummary={(visible) => {
              const paid = visible
                .filter((r) => r.status === "approved")
                .reduce((s, r) => s + (num(r.amount) ?? 0), 0);
              const waiting = visible.filter((r) => r.status === "prepared" || r.status === "checked").length;
              return (
                <span data-testid="vouchers-summary">
                  {visible.length} {visible.length === 1 ? "voucher" : "vouchers"} · {money(cents(paid))} paid
                  · {waiting} waiting for check or approval
                </span>
              );
            }}
          />
        </ListPageShell>
      )}
    </div>
  );
}

/** "No advance", or the advance and — once approved — what is left of it. */
function advanceCell(r: PaymentVoucherRegisterRow): string {
  const amount = num(r.advance_amount) ?? 0;
  if (amount <= 0) return "No advance";
  return r.advance_open === null ? money(amount) : `${money(amount)} · ${money(r.advance_open)} left`;
}

// ── detail ──────────────────────────────────────────────────────────────────

const STEP: Record<"prepare" | "check" | "approve", { label: string; done: string; ask: string }> = {
  prepare: {
    label: "Prepare voucher",
    done: "Voucher prepared — someone else checks it next",
    ask: "Prepare this voucher? After this it cannot be changed unless it is returned to draft.",
  },
  check: {
    label: "Check voucher",
    done: "Voucher checked — it waits for a finance approver",
    ask: "Check this voucher? You confirm the bills, the amounts and the payee match the papers attached.",
  },
  approve: {
    label: "Approve payment",
    done: "Payment approved and entered in the ledger",
    ask: "",
  },
};

function VoucherDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const query = usePaymentVoucher(id);
  const act = useVoucherAct();
  const [asking, setAsking] = useState<"prepare" | "check" | "approve" | null>(null);
  const [reasonFor, setReasonFor] = useState<"reject" | "cancel" | null>(null);
  const [printing, setPrinting] = useState(false);
  const doc = query.data;

  if (query.isError) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <ModuleHeader destinationHeader testId="vouchers-destination-header" word="Payment Vouchers"
          docTitle="Payment Vouchers — Carres" />
        <ReadFailed what="This payment voucher" onRetry={() => void query.refetch()} />
      </div>
    );
  }
  if (!doc || !id) return <div className="p-6 text-body">Loading payment voucher…</div>;

  const v = doc.voucher;
  const run = (step: VoucherAct, reason?: string, done?: string) =>
    act.mutate({ id, act: step, reason }, {
      onSuccess: () => {
        setAsking(null);
        setReasonFor(null);
        toast.success(done ?? "Done");
      },
      onError: (e) => toast.error(refusal(e)),
    });
  const next: "prepare" | "check" | "approve" | null =
    doc.can.prepare ? "prepare" : doc.can.check ? "check" : doc.can.approve ? "approve" : null;
  const printable = paymentVoucherPrint(doc);
  const print = async () => {
    if (!printable) return;
    setPrinting(true);
    try {
      const { renderPaymentVoucherPdf } = await import("@/lib/pdf/render");
      window.open(URL.createObjectURL(await renderPaymentVoucherPdf(printable)), "_blank", "noopener");
    } catch (e) {
      toast.error(`The voucher could not be opened — ${(e as Error).message}`);
    } finally {
      setPrinting(false);
    }
  };
  const approveAsk = `Approve paying ${money(v.amount)} to ${v.payee_name} from ${v.pay_from_account_code} ${v.pay_from_name ?? ""}? `
    + `It is entered in the ledger on ${fmtDate(v.voucher_date)}.`;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SalesOrderTabs
        identity={v.voucher_no ?? "Draft voucher"}
        customer={v.payee_name}
        backTo="/finance/payment-vouchers"
        backLabel="Payment Vouchers"
        docTitle={`${v.voucher_no ?? "Draft voucher"} — Carres`}
        status={<span data-testid="voucher-status">{word(VOUCHER_STATUS_WORD, v.status)}</span>}
        right={
          <span className="flex items-center gap-2">
            {printable && <Button loading={printing} onClick={() => void print()}>Print</Button>}
            {doc.can.edit && (
              <Button icon="edit" onClick={() => navigate(`/finance/payment-vouchers/${id}/edit`)}>Edit</Button>
            )}
            {doc.can.reject && <Button onClick={() => setReasonFor("reject")}>Return to draft</Button>}
            {doc.can.cancel && <Button onClick={() => setReasonFor("cancel")}>Cancel voucher</Button>}
            {next && <Button variant="primary" onClick={() => setAsking(next)}>{STEP[next].label}</Button>}
          </span>
        }
      />
      <div className="flex-1 overflow-auto p-4" data-testid="voucher-object-scroll">
        <div className="flex flex-col gap-4">
          {doc.you_prepared && (v.status === "prepared" || v.status === "checked") && (
            <p className="text-body" data-testid="voucher-self-note">
              You prepared this voucher, so someone else checks and approves it.
            </p>
          )}
          {v.status === "draft" && v.reject_reason && (
            <p className="text-body" data-testid="voucher-returned-note">
              Returned to draft · {fmtDate(v.rejected_at, { time: true })} · {v.rejected_by_name ?? "Name not available"} · {v.reject_reason}
            </p>
          )}
          <Facts title="Voucher facts">
            <FactRow label="Purpose">{word(VOUCHER_PURPOSE_WORD, v.purpose)}</FactRow>
            <FactRow label="Supplier">
              {v.supplier_name ? `${v.supplier_name} · ${creditorKindWord(v.supplier_kind)}` : "No supplier"}
            </FactRow>
            <FactRow label="Payee">{v.payee_name}</FactRow>
            <FactRow label="Voucher date">{fmtDate(v.voucher_date)}</FactRow>
            <FactRow label="Paid from">{v.pay_from_account_code} {v.pay_from_name ?? ""}</FactRow>
            <FactRow label="Method">{word(PAY_METHOD_WORD, v.pay_method)}</FactRow>
            <FactRow label="Reference">{v.pay_reference ?? "No reference"}</FactRow>
            <FactRow label="Amount"><span data-testid="voucher-amount">{money(v.amount)}</span></FactRow>
            {(num(v.advance_amount) ?? 0) > 0 && <FactRow label="Advance">{money(v.advance_amount)}</FactRow>}
            {v.narration && <FactRow label="Note">{v.narration}</FactRow>}
            <FactRow label="Prepared">{stepWho(v.prepared_at, v.prepared_by_name, "Not prepared yet")}</FactRow>
            <FactRow label="Checked">{stepWho(v.checked_at, v.checked_by_name, "Not checked yet")}</FactRow>
            <FactRow label="Approved">{stepWho(v.approved_at, v.approved_by_name, "Not approved yet")}</FactRow>
            <FactRow label="Ledger entry">
              {v.entry_no ?? "None yet — approving the payment makes it"}
              {v.reversal_entry_no ? ` · reversed by ${v.reversal_entry_no}` : ""}
            </FactRow>
            {v.status === "cancelled" && (
              <FactRow label="Cancelled">
                {stepWho(v.cancelled_at, v.cancelled_by_name, "Date not available")} · {v.cancel_reason ?? "No reason on file"}
              </FactRow>
            )}
          </Facts>
          <VoucherBillsCard doc={doc} />
          <VoucherAdvanceCard doc={doc} />
          <VoucherLinesCard doc={doc} />
          <FilesCard kind="vouchers" id={id} files={doc.files} canAdd={doc.can.add_file} />
          <HistoryCard events={doc.events} />
        </div>
      </div>
      <Modal
        open={asking !== null}
        onOpenChange={(o) => { if (!o) setAsking(null); }}
        title={asking ? `${STEP[asking].label}?` : "Payment voucher"}
        description={asking === "approve" ? approveAsk : asking ? STEP[asking].ask : undefined}
        footer={
          <span className="flex gap-2">
            <Button variant="ghost" onClick={() => setAsking(null)}>Cancel</Button>
            <Button variant="primary" loading={act.isPending}
              onClick={() => asking && run(asking, undefined, STEP[asking].done)}>
              {asking ? STEP[asking].label : "Continue"}
            </Button>
          </span>
        }
      >
        <p className="text-body">{v.voucher_no ?? "Draft voucher"} · {v.payee_name} · {money(v.amount)}</p>
      </Modal>
      <ReasonModal
        open={reasonFor !== null}
        title={reasonFor === "cancel" ? "Cancel this payment voucher?" : "Return this voucher to draft?"}
        description={reasonFor === "cancel"
          ? v.status === "approved"
            ? `The ledger entry is reversed on ${fmtDate(v.voucher_date)}, and the bills it paid are unpaid again.`
              + ((num(v.advance_amount) ?? 0) > 0
                ? " An advance applied to a bill or sent back must be taken off or cancelled first."
                : "")
            : "The voucher is kept, marked cancelled. Its bills are free to pay on another voucher."
          : "The person who prepared it can change it and prepare it again."}
        action={reasonFor === "cancel" ? "Cancel voucher" : "Return to draft"}
        busy={act.isPending}
        onClose={() => setReasonFor(null)}
        onSubmit={(reason) => reasonFor && run(reasonFor, reason,
          reasonFor === "cancel" ? "Payment voucher cancelled" : "Voucher returned to draft")}
      />
    </div>
  );
}

function stepWho(at: string | null, who: string | null, none: string): string {
  if (!at) return none;
  return `${fmtDate(at, { time: true })} · ${who ?? "Name not available"}`;
}

function VoucherBillsCard({ doc }: { doc: PaymentVoucherDocument }) {
  return (
    <Facts title="Bills paid">
      {doc.allocations.length === 0
        ? <p>This voucher pays no bill.</p>
        : (
          <div className="overflow-x-auto">
            <table className="w-full text-body" data-testid="voucher-bills">
              <thead>
                <tr className="text-left text-base-500">
                  <th className="py-1 pr-3">Bill No</th>
                  <th className="py-1 pr-3">Supplier invoice</th>
                  <th className="py-1 pr-3">Bill date</th>
                  <th className="py-1 pr-3">Due date</th>
                  <th className="py-1 pr-3 text-right">Bill total</th>
                  <th className="py-1 text-right">Paid by this voucher</th>
                </tr>
              </thead>
              <tbody>
                {doc.allocations.map((a) => (
                  <tr key={a.bill_id} className="border-t border-base-100">
                    <td className="py-1 pr-3"><Link className="text-kit-blue-11 underline underline-offset-2" to={`/finance/bills/${a.bill_id}`}>{a.bill_no ?? "Draft bill"}</Link></td>
                    <td className="py-1 pr-3">{a.supplier_invoice_no}</td>
                    <td className="py-1 pr-3">{fmtDate(a.bill_date)}</td>
                    <td className="py-1 pr-3">{a.due_date ? fmtDate(a.due_date) : "No due date"}</td>
                    <td className="py-1 pr-3 text-right">{money(a.bill_total)}</td>
                    <td className="py-1 text-right">{money(a.amount_applied)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </Facts>
  );
}

function VoucherLinesCard({ doc }: { doc: PaymentVoucherDocument }) {
  return (
    <Facts title="Direct lines">
      {doc.lines.length === 0
        ? <p>No direct line.</p>
        : doc.lines.map((l) => (
          <p key={l.line_no}>
            {l.account_code} {l.account_name ?? ""} · {l.description ?? "No description"} · {money(l.amount)}
          </p>
        ))}
    </Facts>
  );
}

// ── form ────────────────────────────────────────────────────────────────────

type Purpose = PaymentVoucherDraftInput["purpose"];
type Method = PaymentVoucherDraftInput["payMethod"];
type BillPick = { on: boolean; amount: string };
type DirectLine = { key: string; accountCode: string; description: string; amount: string };

let seq = 0;
const newLine = (): DirectLine => { seq += 1; return { key: `d${seq}`, accountCode: "", description: "", amount: "" }; };

/** The voucher total is never typed: it is what the ticked bills, the
 *  advance and the direct lines add up to, and the database recomputes it the
 *  same way. An advance counts only on a supplier voucher. */
export function voucherTotal(
  purpose: Purpose,
  picks: Record<string, BillPick>,
  lines: Array<{ amount: string }>,
  advance = "",
): number {
  const billPart = purpose === "SUPPLIER_BILLS"
    ? Object.values(picks).filter((p) => p.on).reduce((s, p) => s + (num(p.amount) ?? 0), 0)
    : 0;
  const advancePart = purpose === "SUPPLIER_BILLS" ? (num(advance) ?? 0) : 0;
  const linePart = lines.reduce((s, l) => s + (num(l.amount) ?? 0), 0);
  return cents(billPart + advancePart + linePart);
}

function VoucherForm() {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const existing = usePaymentVoucher(id);
  const suppliers = useApSuppliers();
  const accounts = useApAccounts();
  const moneyAccounts = useMoneyAccounts();
  const save = useSaveVoucher();

  const [purpose, setPurpose] = useState<Purpose>("SUPPLIER_BILLS");
  const [supplierId, setSupplierId] = useState(params.get("supplier") ?? "");
  const [payee, setPayee] = useState("");
  const [voucherDate, setVoucherDate] = useState(appTodayIso());
  const [payFrom, setPayFrom] = useState("");
  const [method, setMethod] = useState<Method>("BANK_TRANSFER");
  const [reference, setReference] = useState("");
  const [narration, setNarration] = useState("");
  const [picks, setPicks] = useState<Record<string, BillPick>>(() => {
    const bill = params.get("bill");
    return bill ? { [bill]: { on: true, amount: "" } } : {};
  });
  const [lines, setLines] = useState<DirectLine[]>([]);
  const [advance, setAdvance] = useState("");
  const [loaded, setLoaded] = useState(!id);

  // Editing a draft: the form starts from the voucher as saved.
  useEffect(() => {
    const d = existing.data;
    if (!id || loaded || !d) return;
    setPurpose(d.voucher.purpose);
    setSupplierId(d.voucher.supplier_id ?? "");
    setPayee(d.voucher.payee_name);
    setVoucherDate(d.voucher.voucher_date);
    setPayFrom(d.voucher.pay_from_account_code);
    setMethod((PAYMENT_VOUCHER_METHODS as readonly string[]).includes(d.voucher.pay_method)
      ? d.voucher.pay_method as Method : "OTHER");
    setReference(d.voucher.pay_reference ?? "");
    setNarration(d.voucher.narration ?? "");
    setPicks(Object.fromEntries(d.allocations.map((a) => [a.bill_id, { on: true, amount: String(a.amount_applied) }])));
    setLines(d.lines.map((l) => ({ ...newLine(), accountCode: l.account_code, description: l.description ?? "", amount: String(l.amount) })));
    setAdvance((num(d.voucher.advance_amount) ?? 0) > 0 ? String(d.voucher.advance_amount) : "");
    setLoaded(true);
  }, [id, loaded, existing.data]);

  const bills = useApBillOutstanding(supplierId || null, purpose === "SUPPLIER_BILLS" && supplierId !== "");
  // What this voucher already holds on each bill — added back so editing a
  // draft does not count its own allocation against itself.
  const mine = useMemo(() => {
    const out: Record<string, number> = {};
    for (const a of existing.data?.allocations ?? []) out[a.bill_id] = num(a.amount_applied) ?? 0;
    return out;
  }, [existing.data]);
  const billRows = (bills.data ?? [])
    .map((b) => ({ ...b, available: cents((num(b.unallocated) ?? 0) + (mine[b.bill_id] ?? 0)) }))
    .filter((b) => b.available > 0 || picks[b.bill_id]?.on);

  // A bill ticked from the bill page arrives with no amount: it defaults to
  // what is left to pay on it.
  useEffect(() => {
    if (!bills.data) return;
    setPicks((before) => {
      let changed = false;
      const next = { ...before };
      for (const [billId, p] of Object.entries(before)) {
        if (p.on && p.amount === "") {
          const row = bills.data.find((b) => b.bill_id === billId);
          if (row) {
            next[billId] = { on: true, amount: String(cents((num(row.unallocated) ?? 0) + (mine[billId] ?? 0))) };
            changed = true;
          }
        }
      }
      return changed ? next : before;
    });
  }, [bills.data, mine]);

  const supplier = (suppliers.data ?? []).find((s) => s.id === supplierId) ?? null;
  // 0512: Paid from reads the one money-account list — cash and banks only.
  const payFromChoices = (moneyAccounts.data ?? []).filter(paysOut);
  const lineChoices = (accounts.data ?? []).filter((a) => a.for_voucher_line);
  const total = voucherTotal(purpose, picks, lines, advance);
  const advanceN = purpose === "SUPPLIER_BILLS" ? (num(advance) ?? 0) : 0;
  const pickedCount = Object.values(picks).filter((p) => p.on).length;
  // The bill's own price check (the Bills register's Price Check), so Finance
  // sees it where it decides to pay. A flag, never a block (0477).
  const billChecks = Object.fromEntries((useSupplierBills().data ?? []).map((b) => [b.id, b]));

  const submit = () => {
    const input: PaymentVoucherDraftInput = {
      purpose,
      supplierId: supplierId || null,
      payeeName: payee.trim() || null,
      voucherDate,
      payFromAccountCode: payFrom,
      payMethod: method,
      payReference: reference.trim() || null,
      narration: narration.trim() || null,
      lines: lines.map((l) => ({
        accountCode: l.accountCode,
        description: l.description.trim(),
        amount: Number(l.amount),
      })),
      allocations: purpose === "SUPPLIER_BILLS"
        ? Object.entries(picks).filter(([, p]) => p.on).map(([billId, p]) => ({ billId, amount: Number(p.amount) }))
        : [],
      advanceAmount: advanceN,
    };
    save.mutate({ id, input }, {
      onSuccess: (out) => {
        toast.success(id ? "Voucher saved" : "Draft voucher saved");
        navigate(`/finance/payment-vouchers/${out.id}`);
      },
      onError: (e) => toast.error(refusal(e)),
    });
  };

  if (id && existing.isError) return <ReadFailed what="This payment voucher" onRetry={() => void existing.refetch()} />;
  if (id && !loaded) return <div className="p-6 text-body">Loading payment voucher…</div>;
  if (id && existing.data && !existing.data.can.edit) {
    return (
      <div className="p-6 text-body">
        Only a draft voucher can be changed. <Link className="text-kit-blue-11 underline underline-offset-2" to={`/finance/payment-vouchers/${id}`}>Back to the voucher</Link>
      </div>
    );
  }

  const linesOk = lines.every((l) => l.accountCode !== "" && l.description.trim() !== "" && (num(l.amount) ?? 0) > 0);
  const picksOk = Object.values(picks).filter((p) => p.on).every((p) => (num(p.amount) ?? 0) > 0);
  const advanceOk = advance.trim() === "" || (num(advance) ?? -1) >= 0;
  const ready = payFrom !== "" && /^\d{4}-\d{2}-\d{2}$/.test(voucherDate) && linesOk && picksOk && advanceOk
    && total > 0
    && (purpose === "SUPPLIER_BILLS" ? supplierId !== "" && (pickedCount > 0 || advanceN > 0) : lines.length > 0)
    && (supplierId !== "" || payee.trim() !== "");

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SalesOrderTabs
        identity={id ? (existing.data?.voucher.voucher_no ?? "Draft voucher") : "New Payment Voucher"}
        customer={payee.trim() || supplier?.name || null}
        backTo={id ? `/finance/payment-vouchers/${id}` : "/finance/payment-vouchers"}
        backLabel={id ? "Payment Voucher" : "Payment Vouchers"}
        right={
          <span className="flex items-center gap-2">
            <Button variant="ghost"
              onClick={() => navigate(id ? `/finance/payment-vouchers/${id}` : "/finance/payment-vouchers")}>Cancel</Button>
            <Button variant="primary" disabled={!ready} loading={save.isPending} onClick={submit}>Save</Button>
          </span>
        }
      />
      <div className="flex-1 overflow-auto p-4" data-testid="voucher-form">
        <div className="flex max-w-[1100px] flex-col gap-4">
          <Facts title="Who is paid, and from where">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="block">
                Purpose
                <select aria-label="Purpose" className={`${fieldCls} mt-1`} value={purpose}
                  onChange={(e) => setPurpose(e.target.value as Purpose)}>
                  <option value="SUPPLIER_BILLS">{VOUCHER_PURPOSE_WORD.SUPPLIER_BILLS}</option>
                  <option value="DIRECT">{VOUCHER_PURPOSE_WORD.DIRECT}</option>
                </select>
                <span className="text-meta text-base-500">
                  {purpose === "SUPPLIER_BILLS"
                    ? "Pays confirmed bills, or an advance before the bill. Extra lines (a bank charge) can be added below."
                    : "An expense, a loan or money out that has no bill. Add a line for each account."}
                </span>
              </label>
              <label className="block">
                Supplier
                <select aria-label="Supplier" className={`${fieldCls} mt-1`} value={supplierId}
                  onChange={(e) => { setSupplierId(e.target.value); setPicks({}); }}>
                  <option value="">{purpose === "SUPPLIER_BILLS" ? "Choose the supplier" : "No supplier"}</option>
                  {(suppliers.data ?? []).map((s) => (
                    <option key={s.id} value={s.id}>{s.name} · {creditorKindWord(s.kind)}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                Payee
                <input aria-label="Payee" className={`${fieldCls} mt-1`} value={payee} maxLength={160}
                  placeholder={supplier ? supplier.name : "Who receives the money"}
                  onChange={(e) => setPayee(e.target.value)} />
                <span className="text-meta text-base-500">Left empty, the payee is the supplier.</span>
              </label>
              <label className="block">
                Voucher date
                <input aria-label="Voucher date" type="date" className={`${fieldCls} mt-1`} value={voucherDate}
                  onChange={(e) => setVoucherDate(e.target.value)} />
              </label>
              <label className="block">
                Paid from
                <select aria-label="Paid from" className={`${fieldCls} mt-1`} value={payFrom}
                  onChange={(e) => setPayFrom(e.target.value)}>
                  <option value="">Choose the bank or cash account</option>
                  {payFromChoices.map((a) => <option key={a.code} value={a.code}>{a.code} {a.name}</option>)}
                </select>
              </label>
              <label className="block">
                Method
                <select aria-label="Method" className={`${fieldCls} mt-1`} value={method}
                  onChange={(e) => setMethod(e.target.value as Method)}>
                  {PAYMENT_VOUCHER_METHODS.map((m) => <option key={m} value={m}>{PAY_METHOD_WORD[m]}</option>)}
                </select>
              </label>
              <label className="block">
                Reference
                <input aria-label="Reference" className={`${fieldCls} mt-1`} value={reference} maxLength={120}
                  placeholder="Bank reference or cheque No" onChange={(e) => setReference(e.target.value)} />
              </label>
              <label className="block">
                Note
                <input aria-label="Note" className={`${fieldCls} mt-1`} value={narration} maxLength={500}
                  onChange={(e) => setNarration(e.target.value)} />
              </label>
            </div>
          </Facts>
          {purpose === "SUPPLIER_BILLS" && (
            <Facts title="Bills to pay">
              {supplierId === ""
                ? <p>Choose the supplier to see their confirmed bills.</p>
                : bills.isError
                  ? <p role="alert">The bills could not be loaded. Try again.</p>
                  : !bills.isSuccess
                    ? <p>Loading bills…</p>
                    : billRows.length === 0
                      ? <p>This supplier has no confirmed bill left to pay.</p>
                      : <BillPicks rows={billRows} picks={picks} onChange={setPicks} billChecks={billChecks} />}
            </Facts>
          )}
          {purpose === "SUPPLIER_BILLS" && supplierId !== "" && (
            <Facts title="Advance">
              <label className="block">
                Advance
                <input aria-label="Advance" className={`${fieldCls} mt-1 w-40`} inputMode="decimal" value={advance}
                  placeholder="0.00" onChange={(e) => setAdvance(e.target.value)} />
                <span className="block text-meta text-base-500">
                  Money paid before the bill. It is applied to a bill later, or the supplier sends it back.
                </span>
                {!advanceOk && <span className="block text-meta text-kit-red-11">An advance cannot be less than RM 0.00</span>}
              </label>
            </Facts>
          )}
          <Facts title={purpose === "SUPPLIER_BILLS" ? "Other lines" : "Lines"}>
            {lines.length === 0
              ? <p>{purpose === "SUPPLIER_BILLS" ? "No other line." : "No line yet."}</p>
              : lines.map((l, i) => (
                <DirectLineRow key={l.key} line={l} n={i + 1} accounts={lineChoices}
                  onChange={(patch) => setLines((b) => b.map((x) => (x.key === l.key ? { ...x, ...patch } : x)))}
                  onRemove={() => setLines((b) => b.filter((x) => x.key !== l.key))} />
              ))}
            <div className="mt-2">
              <Button variant="ghost" icon="add" onClick={() => setLines((b) => [...b, newLine()])}>Add line</Button>
            </div>
          </Facts>
          <p className="text-strong" data-testid="voucher-form-total">Total {money(total)}</p>
        </div>
      </div>
    </div>
  );
}

function BillPicks({ rows, picks, onChange, billChecks }: {
  rows: Array<ApBillOutstandingRow & { available: number }>;
  picks: Record<string, BillPick>;
  onChange: (next: Record<string, BillPick>) => void;
  billChecks: Record<string, SupplierBillRegisterRow>;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-body" data-testid="voucher-bill-picks">
        <thead>
          <tr className="text-left text-base-500">
            <th className="py-1 pr-2" />
            <th className="py-1 pr-2">Bill No</th>
            <th className="py-1 pr-2">Supplier invoice</th>
            <th className="py-1 pr-2">Bill date</th>
            <th className="py-1 pr-2">Due date</th>
            <th className="py-1 pr-2 text-right">Total</th>
            <th className="py-1 pr-2 text-right">Left to pay</th>
            <th className="py-1 pr-2">Price Check</th>
            <th className="py-1">Pay now</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((b) => {
            const p = picks[b.bill_id] ?? { on: false, amount: "" };
            const over = p.on && (num(p.amount) ?? 0) > b.available;
            return (
              <tr key={b.bill_id} className="border-t border-base-100">
                <td className="py-1 pr-2">
                  <input type="checkbox" aria-label={`Pay ${b.bill_no}`} checked={p.on}
                    onChange={(e) => onChange({
                      ...picks,
                      [b.bill_id]: { on: e.target.checked, amount: e.target.checked ? String(b.available) : "" },
                    })} />
                </td>
                <td className="py-1 pr-2">{b.bill_no}</td>
                <td className="py-1 pr-2">{b.supplier_invoice_no}</td>
                <td className="py-1 pr-2">{fmtDate(b.bill_date)}</td>
                <td className="py-1 pr-2">{b.due_date ? fmtDate(b.due_date) : "No due date"}</td>
                <td className="py-1 pr-2 text-right">{money(b.total_amount)}</td>
                <td className="py-1 pr-2 text-right">{money(b.available)}</td>
                <td className="py-1 pr-2" data-testid={`price-check-${b.bill_id}`}>{billChecks[b.bill_id] ? priceCheckWord(billChecks[b.bill_id]!) : "—"}</td>
                <td className="py-1">
                  <input aria-label={`Amount for ${b.bill_no}`} className={`${fieldCls} w-28`} inputMode="decimal"
                    disabled={!p.on} value={p.amount}
                    onChange={(e) => onChange({ ...picks, [b.bill_id]: { on: true, amount: e.target.value } })} />
                  {over && <span className="block text-meta text-kit-red-11">More than is left to pay</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function DirectLineRow({ line, n, accounts, onChange, onRemove }: {
  line: DirectLine;
  n: number;
  accounts: ApAccountChoice[];
  onChange: (patch: Partial<DirectLine>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex flex-wrap items-start gap-2 py-1">
      <select aria-label={`Line ${n} account`} className={`${fieldCls} w-64`} value={line.accountCode}
        onChange={(e) => onChange({ accountCode: e.target.value })}>
        <option value="">Choose an account</option>
        {accounts.map((a) => <option key={a.code} value={a.code}>{a.code} {a.name}</option>)}
      </select>
      <input aria-label={`Line ${n} description`} className={`${fieldCls} w-72`} value={line.description}
        maxLength={300} placeholder="What it is for" onChange={(e) => onChange({ description: e.target.value })} />
      <input aria-label={`Line ${n} amount`} className={`${fieldCls} w-32`} inputMode="decimal" value={line.amount}
        placeholder="0.00" onChange={(e) => onChange({ amount: e.target.value })} />
      <Button variant="ghost" size="sm" onClick={onRemove}>Remove</Button>
    </div>
  );
}
