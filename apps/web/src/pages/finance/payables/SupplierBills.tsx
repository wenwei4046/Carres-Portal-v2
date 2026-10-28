import { useEffect, useMemo, useState } from "react";
import { Link, Route, Routes, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import type {
  ApAccountChoice,
  ApCreditor,
  BillDeliveryOrder,
  GoodsLineChannel,
  GrnCandidateRow,
  SupplierBillDocument,
  SupplierBillDraftInput,
  SupplierBillRegisterRow,
} from "@carres/shared/schemas/finance-ap";
import { billForeignAmountInput, defaultBillDueDate, partyLabel, splitEqually } from "@carres/shared/schemas/finance-ap";
import Input from "@/components/kit/Input";
import { roleAccount, type LedgerAccount } from "@carres/shared/finance-ledger";
import { useLedgerChart } from "../ledger/ledger-queries";
import ListPageShell from "@/components/ListPageShell";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";
import Button from "@/components/kit/Button";
import Checkbox from "@/components/kit/Checkbox";
import Modal from "@/components/kit/Modal";
import { fieldCls } from "@/components/Field";
import type { DepartmentType } from "@carres/shared";
import { DepartmentFilter, DepartmentName, DepartmentPicker, useDepartmentParam } from "../department";
import ModuleHeader from "@/pages/operation/components/ModuleHeader";
import SalesOrderTabs from "@/pages/operation/SalesOrderTabs";
import { appTodayIso, fmtDate } from "@/lib/fmt-date";
import {
  fetchGrnLines,
  useApAccounts,
  useApSuppliers,
  useBillAct,
  useBillNotesToFollowUp,
  useCreateOtherCreditor,
  useGrnCandidates,
  useSaveBill,
  useSetBillForeignAmount,
  useSupplierBill,
  useSupplierBills,
  useApplyAdvance,
  useBillDeliveryOrders,
  useSupplierAdvances,
  useTakeAdvanceOff,
} from "@/lib/payables-queries";
import {
  ADVANCE_APPLICATION_STATUS_WORD,
  BILL_STATUS_WORD,
  cents,
  creditorKindWord,
  money,
  num,
  priceCheckWord,
  priceDiffWord,
  refusal,
  word,
  VOUCHER_STATUS_WORD,
} from "./payables-words";
import { FactRow, Facts, FilesCard, HistoryCard, ReadFailed, ReasonModal } from "./PayablesParts";
import { attachPages, formLines, ReadPaperButton, readPaperNotes } from "./ReadPaper";
import { answerPaymentRequest, usePaymentRequest } from "@/lib/payment-request-queries";
import type { BillReadAnswer } from "@carres/shared/bill-reading";
import { AdvanceModal, AmountField } from "./VoucherAdvance";
import { LineFollowUp } from "./NoteFollowUpParts";
import { useSaveKey } from "../save-key";
import { amountCell, FINANCE_WIDTH } from "../finance-widths";
import { useFinancePersonalLayouts } from "../finance-layouts";
import { documentRowMenu } from "@/components/register/row-menu";
import { BillPreview } from "../preview/previews";

/**
 * Finance → Bills (migration 0477). A supplier's invoice, entered once:
 *   /finance/bills            the register
 *   /finance/bills/new        a new bill — typed, or converted from a GRN
 *   /finance/bills/:id        the bill, with Confirm / Cancel / files / history
 *   /finance/bills/:id/edit   change a draft
 *
 * Confirming a bill posts it: Dr each line's account (goods to 5100 — stock is
 * periodic, nothing moves 1310) · Cr the payables account with the supplier as
 * the party, dated the bill date. The database decides every rule; this page
 * only offers what the database says the person may do (`can`).
 *
 * FINANCE LOOK (Chew 2026-10-13): the supplier and the GRNs wrap rather than
 * being cut, and a zero amount (a paid bill's Unpaid) is a blank cell.
 */
export default function SupplierBills() {
  return (
    <Routes>
      <Route index element={<BillRegister />} />
      <Route path="new" element={<BillForm />} />
      <Route path=":id" element={<BillDetail />} />
      <Route path=":id/edit" element={<BillForm />} />
    </Routes>
  );
}

// ── register ────────────────────────────────────────────────────────────────

/** A confirmed bill with something left to pay: the bill page's own
 *  `New Payment Voucher` condition and destination (Chew 2026-10-21). */
export function billPayDoor(b: { id: string; status: string; supplier_id: string; unpaid: string | number | null }): string | null {
  return b.status === "confirmed" && (num(b.unpaid) ?? 0) > 0
    ? `/finance/payment-vouchers/new?supplier=${b.supplier_id}&bill=${b.id}` : null;
}

function BillRegister() {
  const personalLayouts = useFinancePersonalLayouts("finance_bills");
  const navigate = useNavigate();
  // Double-click previews the bill (Chew 2026-10-21); View opens its page.
  const [peek, setPeek] = useState<string | null>(null);
  const [dept, setDept] = useDepartmentParam();
  const query = useSupplierBills(dept);
  const rows = query.data ?? [];
  const columns = useMemo<DataGridColumn<SupplierBillRegisterRow>[]>(() => [
    { key: "bill", label: "Bill No", width: FINANCE_WIDTH.documentNo,
      accessor: (r) => <Link className="text-kit-blue-11 underline underline-offset-2" to={`/finance/bills/${r.id}`}>{r.bill_no ?? "Draft, no number yet"}</Link>,
      searchValue: (r) => r.bill_no ?? "", exportValue: (r) => r.bill_no ?? "Draft, no number yet" },
    { key: "date", label: "Bill Date", width: 130, accessor: (r) => fmtDate(r.bill_date),
      dateValue: (r) => r.bill_date, filterType: "date", exportValue: (r) => fmtDate(r.bill_date) },
    { key: "supplier", label: "Supplier", width: FINANCE_WIDTH.party, wrap: true, accessor: (r) => r.supplier_name,
      searchValue: (r) => r.supplier_name, filterType: "enum" },
    { key: "kind", label: "Creditor Type", width: 140, defaultHidden: true, accessor: (r) => creditorKindWord(r.supplier_kind),
      filterValue: (r) => creditorKindWord(r.supplier_kind), filterType: "enum" },
    { key: "invoice", label: "Supplier Invoice", width: 160, defaultHidden: true, accessor: (r) => r.supplier_invoice_no,
      searchValue: (r) => r.supplier_invoice_no },
    { key: "grn", label: "GRN", width: 160, defaultHidden: true, wrap: true, accessor: (r) => r.grn_nos ?? "Not from a GRN",
      searchValue: (r) => r.grn_nos ?? "" },
    { key: "due", label: "Due Date", width: 130, accessor: (r) => r.due_date ? fmtDate(r.due_date) : "No due date",
      dateValue: (r) => r.due_date, filterType: "date" },
    { key: "status", label: "Status", width: 120, accessor: (r) => word(BILL_STATUS_WORD, r.status),
      filterValue: (r) => word(BILL_STATUS_WORD, r.status), filterType: "enum" },
    { key: "total", label: "Total", width: FINANCE_WIDTH.amount, align: "right", accessor: (r) => amountCell(r.total_amount),
      numberValue: (r) => num(r.total_amount), filterType: "number", exportValue: (r) => num(r.total_amount) ?? "" },
    { key: "unpaid", label: "Unpaid", width: FINANCE_WIDTH.amount, align: "right",
      accessor: (r) => r.status === "confirmed" ? amountCell(r.unpaid) : r.status === "cancelled" ? "Cancelled" : "Not confirmed",
      numberValue: (r) => num(r.unpaid), filterType: "number" },
    { key: "price", label: "Price Check", width: 180, defaultHidden: true,
      accessor: (r) => priceCheckWord(r),
      filterValue: (r) => r.price_flags > 0 ? "Differs from PO" : "Matches PO", filterType: "enum" },
    { key: "files", label: "Files", width: 90, align: "right", defaultHidden: true, accessor: (r) => String(r.file_count),
      numberValue: (r) => r.file_count },
  ], []);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ModuleHeader destinationHeader testId="bills-destination-header" word="Bills" docTitle="Bills · Carres" />
      {query.isError ? <ReadFailed what="Bills" onRetry={() => void query.refetch()} /> : (
        <ListPageShell register>
          <DataGrid
            rows={rows}
            columns={columns}
            rowKey={(r) => r.id}
            storageKey="carres.finance.bills.v3"
            appearance="reference"
            look="finance" personalLayouts={personalLayouts} fillColumn="supplier"
            exportName="Bills"
            groupBanner={false}
            stickyIdentity
            isLoading={!query.isSuccess}
            searchPlaceholder="Search bills…"
            toolbarStart={
              <span className="flex items-center gap-4">
                <DepartmentFilter value={dept} onChange={setDept} />
                <button
                  type="button"
                  data-testid="new-bill"
                  onClick={() => navigate("/finance/bills/new")}
                  className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full bg-kit-blue-9 px-3 text-body font-semibold text-white hover:opacity-90"
                >
                  + New Bill
                </button>
              </span>
            }
            emptyMessage="No bills yet. A supplier's invoice appears here once it is entered."
            onRowDoubleClick={(r) => setPeek(r.id)}
            contextMenu={(r) => {
              const pay = billPayDoor(r);
              return documentRowMenu({
                view: () => navigate(`/finance/bills/${r.id}`),
                more: pay ? [{ label: "New Payment Voucher", onClick: () => navigate(pay) }] : [],
              });
            }}
            statusSummary={(visible) => {
              const unpaid = visible
                .filter((r) => r.status === "confirmed")
                .reduce((s, r) => s + (num(r.unpaid) ?? 0), 0);
              return (
                <span data-testid="bills-summary">
                  {visible.length} {visible.length === 1 ? "bill" : "bills"} · {money(cents(unpaid))} unpaid
                </span>
              );
            }}
          />
        </ListPageShell>
      )}
      <BillPreview id={peek} onClose={() => setPeek(null)} onView={(id) => navigate(`/finance/bills/${id}`)} />
    </div>
  );
}

// ── detail ──────────────────────────────────────────────────────────────────

function BillDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const query = useSupplierBill(id);
  const act = useBillAct();
  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [applying, setApplying] = useState(false);
  const [takeOff, setTakeOff] = useState<string | null>(null);
  const takeOffAct = useTakeAdvanceOff();
  const doc = query.data;

  if (query.isError) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <ModuleHeader destinationHeader testId="bills-destination-header" word="Bills" docTitle="Bills · Carres" />
        <ReadFailed what="This bill" onRetry={() => void query.refetch()} />
      </div>
    );
  }
  if (!doc || !id) {
    return <div className="p-6 text-body">Loading bill…</div>;
  }
  const b = doc.bill;
  const confirm = () => act.mutate({ id, act: "confirm" }, {
    onSuccess: () => { setConfirming(false); toast.success("Bill confirmed"); },
    onError: (e) => toast.error(refusal(e)),
  });
  const cancel = (reason: string) => act.mutate({ id, act: "cancel", reason }, {
    onSuccess: () => { setCancelling(false); toast.success("Bill cancelled"); },
    onError: (e) => toast.error(refusal(e)),
  });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SalesOrderTabs
        identity={b.bill_no ?? "Draft bill"}
        customer={b.supplier_name}
        backTo="/finance/bills"
        backLabel="Bills"
        docTitle={`${b.bill_no ?? "Draft bill"} · Carres`}
        status={<span data-testid="bill-status">{word(BILL_STATUS_WORD, b.status)}</span>}
        right={
          <span className="flex items-center gap-2">
            {doc.can.edit && <Button onClick={() => navigate(`/finance/bills/${id}/edit`)} icon="edit">Edit</Button>}
            {doc.can.cancel && <Button onClick={() => setCancelling(true)}>Cancel bill</Button>}
            {doc.can.confirm && <Button variant="primary" onClick={() => setConfirming(true)}>Confirm bill</Button>}
            {/* Paying is a confirmed bill's next step: the kit's primary button, as on a debit note. */}
            {(() => {
              const pay = billPayDoor({ ...b, unpaid: doc.unpaid });
              return pay && (
                <Button variant="primary" data-testid="pay-bill" onClick={() => navigate(pay)}>
                  New Payment Voucher
                </Button>
              );
            })()}
          </span>
        }
      />
      <div className="flex-1 overflow-auto p-4" data-testid="bill-object-scroll">
        <div className="flex flex-col gap-4">
          <Facts title="Bill facts">
            <FactRow label="Supplier">{b.supplier_name} · {creditorKindWord(b.supplier_kind)}</FactRow>
            <FactRow label="Supplier invoice">{b.supplier_invoice_no}</FactRow>
            <FactRow label="Bill date">{fmtDate(b.bill_date)}</FactRow>
            <FactRow label="Due date">{b.due_date ? fmtDate(b.due_date) : "No due date"}</FactRow>
            <FactRow label="Payables account">{b.ap_account_code} {b.ap_account_name ?? ""}</FactRow>
            <FactRow label="Total">{money(b.total_amount)}</FactRow>
            <FactRow label="Paid">{b.status === "confirmed" ? money(doc.paid_total) : "Not confirmed"}</FactRow>
            <FactRow label="Unpaid">{b.status === "confirmed" ? money(doc.unpaid) : "Not confirmed"}</FactRow>
            {/* 0682: the currency the supplier invoiced in. A record only: the bill stays in RM. */}
            {doc.foreign_amount !== undefined && (
              <FactRow label="Foreign currency">
                <ForeignAmountFact doc={doc} canEdit={doc.can.add_file} />
              </FactRow>
            )}
            {b.narration && <FactRow label="Note">{b.narration}</FactRow>}
            <FactRow label="Ledger entry">
              {b.entry_no ?? "None yet. Confirming the bill makes it"}
              {b.reversal_entry_no ? ` · reversed by ${b.reversal_entry_no}` : ""}
            </FactRow>
            {b.status === "cancelled" && (
              <FactRow label="Cancelled">
                {fmtDate(b.cancelled_at, { time: true })} · {b.cancelled_by_name ?? "Name not available"} · {b.cancel_reason ?? "No reason on file"}
              </FactRow>
            )}
          </Facts>
          <BillLinesCard doc={doc} />
          <Facts
            title="Payments"
            testId="bill-payments"
            right={doc.can.apply_advance && (num(doc.advance_open) ?? 0) > 0
              ? <Button variant="primary" onClick={() => setApplying(true)}>Apply advance</Button>
              : undefined}
          >
            {doc.payments.length === 0
              ? <p>No payment voucher pays this bill yet.</p>
              : doc.payments.map((p) => p.kind === "credit_note"
                ? (
                  // 0642: a credit note knocked off this bill. It is taken off
                  // on the credit note, the one place its knock-offs are kept.
                  <p key={p.application_id ?? `${p.voucher_id}-credit`} data-testid={`bill-credit-note-${p.voucher_id}`}>
                    Credit note{" "}
                    <Link className="text-kit-blue-11 underline underline-offset-2" to={`/finance/credit-notes/${p.voucher_id}`}>{p.voucher_no ?? "Draft credit note"}</Link>
                    {" · "}{word(ADVANCE_APPLICATION_STATUS_WORD, p.status)}
                    {" · "}{fmtDate(p.applied_on ?? p.voucher_date)} · {money(p.amount_applied)}
                  </p>
                )
                : p.kind === "advance"
                ? (
                  <p key={p.application_id ?? `${p.voucher_id}-advance`}>
                    Advance from{" "}
                    <Link className="text-kit-blue-11 underline underline-offset-2" to={`/finance/payment-vouchers/${p.voucher_id}`}>{p.voucher_no ?? "Draft voucher"}</Link>
                    {" · "}{word(ADVANCE_APPLICATION_STATUS_WORD, p.status)}
                    {" · "}{fmtDate(p.applied_on ?? p.voucher_date)} · {money(p.amount_applied)}
                    {doc.can.take_advance_off && p.status === "applied" && p.application_id && (
                      <>
                        {" "}
                        <Button size="sm" variant="ghost" onClick={() => setTakeOff(p.application_id)}>
                          Take advance off
                        </Button>
                      </>
                    )}
                  </p>
                )
                : (
                  <p key={p.voucher_id}>
                    <Link className="text-kit-blue-11 underline underline-offset-2" to={`/finance/payment-vouchers/${p.voucher_id}`}>{p.voucher_no ?? "Draft voucher"}</Link>
                    {" · "}{word(VOUCHER_STATUS_WORD, p.status)} · {fmtDate(p.voucher_date)} · {money(p.amount_applied)}
                  </p>
                ))}
          </Facts>
          <FilesCard kind="bills" id={id} files={doc.files} canAdd={doc.can.add_file} />
          <HistoryCard events={doc.events} />
        </div>
      </div>
      <Modal
        open={confirming}
        onOpenChange={(o) => { if (!o) setConfirming(false); }}
        title="Confirm this bill?"
        description={`${money(b.total_amount)} is entered in the ledger as owed to ${b.supplier_name}, dated ${fmtDate(b.bill_date)}. A confirmed bill cannot be edited.`}
        footer={
          <span className="flex gap-2">
            <Button variant="ghost" onClick={() => setConfirming(false)}>Cancel</Button>
            <Button variant="primary" loading={act.isPending} onClick={confirm}>Confirm bill</Button>
          </span>
        }
      >
        <p className="text-body">Check the lines and the price against the supplier's invoice first.</p>
      </Modal>
      <ReasonModal
        open={cancelling}
        title="Cancel this bill?"
        description={b.status === "confirmed"
          ? "The ledger entry is reversed on the bill date. A bill already on a payment voucher, or with an advance applied, cannot be cancelled."
          : "The draft is kept, marked cancelled."}
        action="Cancel bill"
        busy={act.isPending}
        onClose={() => setCancelling(false)}
        onSubmit={cancel}
      />
      <ReasonModal
        open={takeOff !== null}
        title="Take this advance off the bill?"
        description="Nothing is entered in the ledger. The bill is unpaid again by this amount, and the advance is left to use."
        action="Take advance off"
        busy={takeOffAct.isPending}
        onClose={() => setTakeOff(null)}
        onSubmit={(reason) => takeOff && takeOffAct.mutate({ applicationId: takeOff, reason }, {
          onSuccess: () => { setTakeOff(null); toast.success("Advance taken off"); },
          onError: (e) => toast.error(refusal(e)),
        })}
      />
      {applying && (
        <ApplyToBillModal
          billId={id}
          supplierId={b.supplier_id}
          apAccountCode={b.ap_account_code}
          leftToPay={num(doc.left_to_pay) ?? 0}
          onClose={() => setApplying(false)}
        />
      )}
    </div>
  );
}

/** From the bill: choose one of the supplier's approved advances on the same
 *  payables account, and how much of it to knock off this bill. Posts nothing. */
function ApplyToBillModal({ billId, supplierId, apAccountCode, leftToPay, onClose }: {
  billId: string;
  supplierId: string;
  apAccountCode: string;
  leftToPay: number;
  onClose: () => void;
}) {
  const advances = useSupplierAdvances(supplierId);
  const apply = useApplyAdvance();
  const rows = (advances.data ?? [])
    .filter((a) => (num(a.advance_open) ?? 0) > 0 && a.ap_account_code === apAccountCode);
  const [voucherId, setVoucherId] = useState("");
  const [amount, setAmount] = useState("");
  const row = rows.find((a) => a.voucher_id === voucherId) ?? null;
  const cap = row ? cents(Math.min(num(row.advance_open) ?? 0, leftToPay)) : leftToPay;
  const n = num(amount);
  const ready = row !== null && n !== null && n > 0 && n <= cap;

  return (
    <AdvanceModal
      title="Apply advance to this bill?"
      description="Nothing is entered in the ledger: the advance is already on the supplier's account. The bill shows it as paid by this amount."
      action="Apply advance"
      ready={ready}
      busy={apply.isPending}
      onClose={onClose}
      onSubmit={() => apply.mutate({ voucherId, input: { billId, amount: n ?? 0 } }, {
        onSuccess: () => { toast.success("Advance applied"); onClose(); },
        onError: (e) => toast.error(refusal(e)),
      })}
    >
      {advances.isError
        ? <p role="alert">The advances could not be loaded. Try again.</p>
        : !advances.isSuccess
          ? <p>Loading advances…</p>
          : rows.length === 0
            ? <p>This supplier has no advance left.</p>
            : (
              <div className="flex flex-col gap-3">
                <label className="block">
                  Advance
                  <select aria-label="Advance" className={`${fieldCls} mt-1`} value={voucherId}
                    onChange={(e) => {
                      setVoucherId(e.target.value);
                      const a = rows.find((r) => r.voucher_id === e.target.value);
                      setAmount(a ? String(cents(Math.min(num(a.advance_open) ?? 0, leftToPay))) : "");
                    }}>
                    <option value="">Choose the advance</option>
                    {rows.map((a) => (
                      <option key={a.voucher_id} value={a.voucher_id}>
                        {a.voucher_no} · {fmtDate(a.voucher_date)} · {money(a.advance_open)} left
                      </option>
                    ))}
                  </select>
                </label>
                <AmountField amount={amount} onChange={setAmount} cap={cap} capWord="More than can be applied" />
              </div>
            )}
    </AdvanceModal>
  );
}

/** 0682 (Chew 2026-10-03): the currency, amount and rate a supplier invoiced
 *  in, recorded beside the bill. The bill's lines stay in RM; nothing posts,
 *  and no exchange difference is worked out. */
function ForeignAmountFact({ doc, canEdit }: { doc: SupplierBillDocument; canEdit: boolean }) {
  const [open, setOpen] = useState(false);
  const fx = doc.foreign_amount ?? null;
  const rate = num(fx?.rate ?? null);
  const amount = num(fx?.foreign_amount ?? null);
  return (
    <span data-testid="bill-foreign-amount">
      {fx && amount !== null && rate !== null
        ? `${fx.currency} ${amount.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} at ${rate} · ${money(cents(amount * rate))} at this rate`
        : "None"}
      {canEdit && (
        <>
          {" "}
          <Button size="sm" variant="ghost" data-testid="record-foreign-amount" onClick={() => setOpen(true)}>
            {fx ? "Change" : "Record foreign currency"}
          </Button>
        </>
      )}
      {open && <ForeignAmountModal doc={doc} onClose={() => setOpen(false)} />}
    </span>
  );
}

function ForeignAmountModal({ doc, onClose }: { doc: SupplierBillDocument; onClose: () => void }) {
  const save = useSetBillForeignAmount();
  const fx = doc.foreign_amount ?? null;
  const [currency, setCurrency] = useState(fx?.currency ?? "");
  const [amount, setAmount] = useState(fx ? String(fx.foreign_amount) : "");
  const [rate, setRate] = useState(fx ? String(Number(fx.rate)) : "");
  const input = { currency: currency.trim(), foreignAmount: Number(amount), rate: Number(rate) };
  const checked = billForeignAmountInput.safeParse(input);
  const gap = currency.trim() === "" ? "Save: type the currency"
    : amount.trim() === "" ? "Save: type the amount"
    : rate.trim() === "" ? "Save: type the rate"
    : checked.success ? null : `Save: ${(checked.error.issues[0]?.message ?? "check the form").replace(/^./, (c) => c.toLowerCase())}`;
  const rm = Number(amount) > 0 && Number(rate) > 0 ? cents(Number(amount) * Number(rate)) : null;
  const send = (body: Parameters<typeof save.mutate>[0]["input"], done: string) =>
    save.mutate({ id: doc.bill.id, input: body }, {
      onSuccess: () => { toast.success(done); onClose(); },
      onError: (e) => toast.error(refusal(e)),
    });
  return (
    <Modal
      open
      onOpenChange={(o) => { if (!o) onClose(); }}
      title="Foreign currency"
      description={`What the supplier's invoice says, when it is not in ringgit. A record only: the bill stays at ${money(doc.bill.total_amount)} and nothing is entered in the ledger.`}
      footer={
        <span className="flex gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          {fx && <Button variant="ghost" loading={save.isPending} onClick={() => send({ currency: null }, "Foreign currency removed")}>Remove</Button>}
          <Button variant="primary" disabled={gap !== null} loading={save.isPending}
            onClick={() => checked.success && send(checked.data, "Foreign currency recorded")}>{gap ?? "Save"}</Button>
        </span>
      }
    >
      <div className="flex flex-col gap-3" data-testid="foreign-amount-form">
        <Input id="foreign-currency" label="Currency" value={currency} maxLength={3} placeholder="USD"
          onChange={(e) => setCurrency(e.target.value.toUpperCase())} />
        <Input id="foreign-amount" label="Amount on the supplier's invoice" type="number" inputMode="decimal" value={amount}
          onChange={(e) => setAmount(e.target.value)} />
        <Input id="foreign-rate" label="Rate (RM for 1)" type="number" inputMode="decimal" value={rate}
          onChange={(e) => setRate(e.target.value)}
          hint={rm !== null ? `${money(rm)} at this rate. The bill is ${money(doc.bill.total_amount)}.` : undefined} />
      </div>
    </Modal>
  );
}

function BillLinesCard({ doc }: { doc: SupplierBillDocument }) {
  // 0676: a confirmed bill's line priced off its PO price can be followed up.
  const notes = useBillNotesToFollowUp(doc.bill.id, doc.bill.status !== "draft");
  return (
    <Facts title="Lines">
      <div className="overflow-x-auto">
        <table className="w-full text-body" data-testid="bill-lines">
          <thead>
            <tr className="text-left text-base-500">
              <th className="py-1 pr-3">#</th>
              <th className="py-1 pr-3">From</th>
              <th className="py-1 pr-3">Item</th>
              <th className="py-1 pr-3">Account</th>
              <th className="py-1 pr-3 text-right">Qty</th>
              <th className="py-1 pr-3 text-right">Unit price</th>
              <th className="py-1 pr-3">Against PO</th>
              <th className="py-1 pr-3">Department</th>
              <th className="py-1 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {doc.lines.map((l) => (
              <tr key={l.line_no} className="border-t border-base-100">
                <td className="py-1 pr-3">{l.line_no}</td>
                <td className={`py-1 pr-3${l.warehouse_receipt_id || l.delivery_order_id ? " whitespace-nowrap" : ""}`}>
                  {l.warehouse_receipt_id ? (l.grn_no ?? `GRN of ${l.grn_po_id ?? "a PO"}`)
                    : l.delivery_order_id ? (l.do_no ?? "Delivery order") : "Not from a GRN"}
                </td>
                <td className="py-1 pr-3">{l.description ?? l.sku ?? "No description"}</td>
                <td className="py-1 pr-3">{l.account_code} {l.account_name ?? ""}</td>
                <td className="py-1 pr-3 text-right">{l.qty ?? ""}</td>
                <td className="py-1 pr-3 text-right">{money(l.unit_price)}</td>
                <td className="py-1 pr-3">
                  {l.po_line_id ? priceDiffWord(num(l.price_diff)) : l.delivery_order_id ? "" : "No PO price"}
                  {l.po_line_id && (
                    <span className="ml-2">
                      <LineFollowUp billId={doc.bill.id} billStatus={doc.bill.status} line={l} notes={notes.data} />
                    </span>
                  )}
                </td>
                <td className="py-1 pr-3"><DepartmentName type={l.department_type} id={l.department_id} /></td>
                <td className="py-1 text-right">{money(l.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Facts>
  );
}

// ── form ────────────────────────────────────────────────────────────────────

export type LineDraft = {
  key: string;
  warehouseReceiptId: string | null;
  poLineId: string | null;
  grnNo: string | null;
  sku: string;
  description: string;
  accountCode: string;
  qty: string;
  unitPrice: string;
  amount: string;
  poUnitCost: number | null;
  openQty: number | null;
  departmentType: DepartmentType | null;
  departmentId: string | null;
  /** 0683: a goods line's channels, worked out from its orders; null = not read yet. */
  channels: GoodsLineChannel[] | null;
  /** 0689: the delivery order a logistics partner's line charges for, and its number. */
  deliveryOrderId: string | null;
  doNo: string | null;
};

let lineSeq = 0;
function newKey() { lineSeq += 1; return `l${lineSeq}`; }

function blankLine(): LineDraft {
  return {
    key: newKey(), warehouseReceiptId: null, poLineId: null, grnNo: null, sku: "", description: "",
    accountCode: "", qty: "", unitPrice: "", amount: "", poUnitCost: null, openQty: null, departmentType: null, departmentId: null,
    channels: null, deliveryOrderId: null, doNo: null,
  };
}

/** What a line comes to. Qty × price when both are typed, else the typed amount. */
export function lineAmount(l: Pick<LineDraft, "qty" | "unitPrice" | "amount">): number | null {
  const q = num(l.qty.trim() === "" ? null : l.qty);
  const p = num(l.unitPrice.trim() === "" ? null : l.unitPrice);
  if (q !== null && p !== null) return cents(q * p);
  return num(l.amount.trim() === "" ? null : l.amount);
}

/** The Receiving button law (COPY-STANDARD): a disabled Save names the FIRST
 *  missing fact, top to bottom. null = nothing missing, Save is live. */
export function billSaveGap(f: {
  supplierId: string;
  invoiceNo: string;
  billDate: string;
  lines: Array<Pick<LineDraft, "qty" | "unitPrice" | "amount" | "departmentType">
    & { warehouseReceiptId?: string | null; deliveryOrderId?: string | null }>;
}): string | null {
  if (f.supplierId === "") return "Save: pick the supplier";
  if (f.invoiceNo.trim() === "") return "Save: type the supplier invoice No";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.billDate)) return "Save: pick the bill date";
  if (f.lines.length === 0) return "Save: add a line";
  for (const [i, l] of f.lines.entries()) {
    if ((lineAmount(l) ?? 0) <= 0) return `Save: type the amount on line ${i + 1}`;
    // 0683: a goods line's channel comes from its orders, and (0689) a delivery
    // order's line from its order, so nobody picks either.
    if (!l.warehouseReceiptId && !l.deliveryOrderId && l.departmentType === null) return `Save: pick the department on line ${i + 1}`;
  }
  return null;
}

export function toInput(l: LineDraft): SupplierBillDraftInput["lines"][number] {
  const q = l.qty.trim() === "" ? null : Number(l.qty);
  const p = l.unitPrice.trim() === "" ? null : Number(l.unitPrice);
  if (l.warehouseReceiptId && l.poLineId) {
    // 0683: the database works out a goods line's channel; none is sent.
    return {
      warehouseReceiptId: l.warehouseReceiptId, poLineId: l.poLineId,
      accountCode: l.accountCode || null, sku: l.sku || null, description: l.description || null,
      qty: q, unitPrice: p, departmentType: null, departmentId: null,
    };
  }
  if (l.deliveryOrderId) {
    // 0689: the database takes a delivery order's channel from its order; none is sent.
    return {
      deliveryOrderId: l.deliveryOrderId,
      accountCode: l.accountCode || null, description: l.description || null,
      qty: null, unitPrice: null, departmentType: null, departmentId: null,
      amount: l.amount.trim() === "" ? null : Number(l.amount),
    };
  }
  return {
    accountCode: l.accountCode || null, sku: l.sku || null, description: l.description || null,
    qty: q, unitPrice: p, departmentType: l.departmentType, departmentId: l.departmentId,
    amount: q !== null && p !== null ? null : (l.amount.trim() === "" ? null : Number(l.amount)),
  };
}

function BillForm() {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const existing = useSupplierBill(id);
  const suppliers = useApSuppliers();
  const accounts = useApAccounts();
  const chart = useLedgerChart();
  const save = useSaveBill();

  const [supplierId, setSupplierId] = useState(params.get("supplier") ?? "");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [billDate, setBillDate] = useState(appTodayIso());
  const [dueDate, setDueDate] = useState("");
  // 0530 — the due date follows bill date + terms until the user types one.
  // A saved draft keeps what it has.
  const [dueTouched, setDueTouched] = useState(Boolean(id));
  // ponytail: the last picked GRN's PO; bills spanning two POs use that one's terms.
  const [poTermsDays, setPoTermsDays] = useState<number | null>(null);
  const [apAccount, setApAccount] = useState("");
  const [narration, setNarration] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [grnOpen, setGrnOpen] = useState(params.has("po"));
  // 0689: a logistics partner's bill, line by delivery order.
  const [doOpen, setDoOpen] = useState(false);
  const [creditorOpen, setCreditorOpen] = useState(false);
  const [loaded, setLoaded] = useState(!id);
  // Chew 2026-10-03: the pages read with "Read the bill", attached once the
  // bill is saved, and what to check about the reading.
  const [read, setRead] = useState<{ files: File[]; notes: string[] } | null>(null);
  // 0645 (Chew 2026-10-03): a bill made for a payment request starts from what
  // was asked, and answers the request once it is saved.
  const requestId = id ? null : params.get("request");
  const fromRequest = usePaymentRequest(requestId);
  const [requestApplied, setRequestApplied] = useState(false);
  useEffect(() => {
    const r = fromRequest.data?.request;
    if (!r || requestApplied) return;
    if (r.bill_no) setInvoiceNo(r.bill_no);
    if (r.bill_date) setBillDate(r.bill_date);
    setNarration(`Payment request ${r.request_no} · ${r.purpose}`.slice(0, 500));
    setLines([{ ...blankLine(), description: r.purpose.slice(0, 200), amount: String(r.amount) }]);
    setRequestApplied(true);
  }, [fromRequest.data, requestApplied]);

  // Editing a draft: the form starts from the bill as saved.
  useEffect(() => {
    const d = existing.data;
    if (!id || loaded || !d) return;
    setSupplierId(d.bill.supplier_id);
    setInvoiceNo(d.bill.supplier_invoice_no);
    setBillDate(d.bill.bill_date);
    setDueDate(d.bill.due_date ?? "");
    setApAccount(d.bill.ap_account_code);
    setNarration(d.bill.narration ?? "");
    setLines(d.lines.map((l) => ({
      key: newKey(),
      warehouseReceiptId: l.warehouse_receipt_id,
      poLineId: l.po_line_id,
      grnNo: l.grn_no,
      sku: l.sku ?? "",
      description: l.description ?? "",
      // 0659: a goods line nobody chose an account for stays on its item
      // group's account, so it is sent back empty, not as a choice.
      accountCode: l.po_line_id && l.account_chosen === false ? "" : l.account_code,
      qty: l.qty == null ? "" : String(l.qty),
      unitPrice: l.unit_price == null ? "" : String(l.unit_price),
      amount: String(l.amount),
      poUnitCost: num(l.po_unit_cost),
      openQty: null,
      departmentType: (l.department_type ?? null) as DepartmentType | null,
      departmentId: l.department_id ?? null,
      // 0683: a saved goods line already went to one channel.
      channels: l.po_line_id && l.department_type
        ? [{ department_type: l.department_type, department_id: l.department_id ?? null, qty: l.qty ?? 0 }]
        : null,
      // 0689: a saved delivery order line keeps its DO, and its order's channel.
      deliveryOrderId: l.delivery_order_id ?? null,
      doNo: l.do_no ?? null,
    })));
    setLoaded(true);
  }, [id, loaded, existing.data]);

  const supplier = (suppliers.data ?? []).find((s) => s.id === supplierId) ?? null;
  const suggestedDue = defaultBillDueDate(billDate, poTermsDays, supplier?.terms_days) ?? "";
  useEffect(() => {
    if (!dueTouched) setDueDate(suggestedDue);
  }, [dueTouched, suggestedDue]);
  const lineAccounts = (accounts.data ?? []).filter((a) => a.for_bill_line);
  const apAccounts = (accounts.data ?? []).filter((a) => a.for_ap);
  const total = cents(lines.reduce((s, l) => s + (lineAmount(l) ?? 0), 0));

  const setLine = (key: string, patch: Partial<LineDraft>) =>
    setLines((before) => before.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const submit = () => {
    const input: SupplierBillDraftInput = {
      supplierId,
      supplierInvoiceNo: invoiceNo.trim(),
      billDate,
      dueDate: dueDate || null,
      apAccountCode: apAccount || null,
      narration: narration.trim() || null,
      lines: lines.map(toInput),
    };
    save.mutate({ id, input }, {
      onSuccess: async (out) => {
        toast.success(id ? "Bill saved" : "Draft bill saved");
        if (read && !(await attachPages("bills", out.id, read.files))) {
          toast.error("The bill is saved, but a page that was read could not be attached. Attach it on the bill.");
        }
        if (requestId && fromRequest.data) {
          try {
            await answerPaymentRequest(requestId, { billId: out.id });
            toast.success(`${fromRequest.data.request.request_no} is answered by this bill`);
          } catch (e) {
            toast.error(`The bill is saved, but it does not answer ${fromRequest.data.request.request_no}: ${refusal(e)}`);
          }
        }
        navigate(`/finance/bills/${out.id}`);
      },
      onError: (e) => toast.error(refusal(e)),
    });
  };

  /** What "Read the bill" found fills only what the form does not have yet. */
  const applyReading = (answer: BillReadAnswer, files: File[]) => {
    const r = answer.reading;
    if (supplierId === "" && answer.supplier) setSupplierId(answer.supplier.id);
    if (invoiceNo.trim() === "" && r.invoiceNumber) setInvoiceNo(r.invoiceNumber);
    if (r.invoiceDate) setBillDate(r.invoiceDate);
    if (r.dueDate) { setDueTouched(true); setDueDate(r.dueDate); }
    const linesKept = lines.length > 0;
    if (!linesKept) setLines(formLines(answer).map((l) => ({ ...blankLine(), ...l })));
    setRead({ files, notes: readPaperNotes(answer, { pages: files.length, expect: "bill", linesKept }) });
  };

  const gap = billSaveGap({ supplierId, invoiceNo, billDate, lines });
  // An existing bill saves by key only once it has loaded and is still a draft.
  // It waits while the GRN picker or Add other creditor is open over the form.
  useSaveKey(submit, gap === null && !save.isPending && !grnOpen && !creditorOpen
    && (!id || existing.data?.can.edit === true));

  if (id && existing.isError) return <ReadFailed what="This bill" onRetry={() => void existing.refetch()} />;
  if (id && !loaded) return <div className="p-6 text-body">Loading bill…</div>;
  if (id && existing.data && !existing.data.can.edit) {
    return <div className="p-6 text-body">Only a draft bill can be changed. <Link className="text-kit-blue-11 underline underline-offset-2" to={`/finance/bills/${id}`}>Back to the bill</Link></div>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SalesOrderTabs
        identity={id ? (existing.data?.bill.bill_no ?? "Draft bill") : "New Bill"}
        customer={supplier?.name ?? null}
        backTo={id ? `/finance/bills/${id}` : "/finance/bills"}
        backLabel={id ? "Bill" : "Bills"}
        right={
          <span className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => navigate(id ? `/finance/bills/${id}` : "/finance/bills")}>Cancel</Button>
            <Button variant="primary" disabled={gap !== null} loading={save.isPending} onClick={submit}>{gap ?? "Save"}</Button>
          </span>
        }
      />
      <div className="flex-1 overflow-auto p-4" data-testid="bill-form">
        <div className="flex max-w-[1100px] flex-col gap-4">
          <Facts title="Who sent this bill" right={<ReadPaperButton label="Read the bill" testId="read-bill" onRead={applyReading} />}>
            {read && (
              <ul className="mb-3 list-disc pl-5 text-body" data-testid="bill-read-notes">
                {read.notes.map((n) => <li key={n}>{n}</li>)}
              </ul>
            )}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="block">
                Supplier
                <select aria-label="Supplier" className={`${fieldCls} mt-1`} value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}>
                  <option value="">Choose who sent this bill</option>
                  <CreditorOptions rows={suppliers.data ?? []} />
                </select>
                <button type="button" className="mt-1 text-meta underline underline-offset-2"
                  onClick={() => setCreditorOpen(true)}>Add other creditor</button>
              </label>
              <label className="block">
                Supplier invoice No
                <input aria-label="Supplier invoice No" className={`${fieldCls} mt-1`} value={invoiceNo}
                  maxLength={80} onChange={(e) => setInvoiceNo(e.target.value)} />
              </label>
              <label className="block">
                Bill date
                <input aria-label="Bill date" type="date" className={`${fieldCls} mt-1`} value={billDate}
                  onChange={(e) => setBillDate(e.target.value)} />
                <span className="text-meta text-base-500">The date printed on the supplier's bill. The bill is entered in that month.</span>
              </label>
              <label className="block">
                Due date
                <input aria-label="Due date" type="date" className={`${fieldCls} mt-1`} value={dueDate}
                  onChange={(e) => { setDueTouched(true); setDueDate(e.target.value); }} />
                {!dueTouched && suggestedDue !== "" && (
                  <span className="text-meta text-base-500" data-testid="due-from-terms">
                    {poTermsDays != null
                      ? `Bill date + ${poTermsDays} days, from the PO's terms`
                      : `Bill date + ${supplier?.terms_days} days, from the supplier's terms`}
                  </span>
                )}
              </label>
              <label className="block">
                Payables account
                <select aria-label="Payables account" className={`${fieldCls} mt-1`} value={apAccount}
                  onChange={(e) => setApAccount(e.target.value)}>
                  <option value="">
                    {usualLabel(roleAccount(chart.data, supplier?.kind === "other_creditor" ? "OTHER_PAYABLE" : "TRADE_PAYABLE"))}
                  </option>
                  {apAccounts.map((a) => <option key={a.code} value={a.code}>{a.code} {a.name}</option>)}
                </select>
              </label>
              <label className="block">
                Note
                <input aria-label="Note" className={`${fieldCls} mt-1`} value={narration} maxLength={500}
                  onChange={(e) => setNarration(e.target.value)} />
              </label>
            </div>
          </Facts>
          <Facts title="Lines">
            <div className="mb-3 flex flex-wrap gap-2">
              <Button variant="primary" onClick={() => setGrnOpen(true)} data-testid="convert-grn">Convert GRN to bill</Button>
              {/* 0689 (Chew ruling 5): a logistics partner's bill, charged to each delivery order's order. */}
              <Button variant="neutral" onClick={() => setDoOpen(true)} data-testid="add-delivery-orders">Add delivery orders</Button>
              <Button variant="ghost" icon="add" onClick={() => setLines((b) => [...b, blankLine()])}>Add line</Button>
            </div>
            {lines.length === 0
              ? <p>No line yet. Convert a GRN, add the delivery orders a transport bill is for, or add a line for any other bill.</p>
              : (
                <div className="overflow-x-auto">
                  <table className="w-full text-body" data-testid="bill-form-lines">
                    <thead>
                      <tr className="text-left text-base-500">
                        <th className="py-1 pr-2">From</th>
                        <th className="py-1 pr-2">Item</th>
                        <th className="py-1 pr-2">Account</th>
                        <th className="py-1 pr-2">Qty</th>
                        <th className="py-1 pr-2">Unit price</th>
                        <th className="py-1 pr-2">Amount</th>
                        <th className="py-1 pr-2">Against PO</th>
                        <th className="py-1 pr-2">Department</th>
                        <th className="py-1" />
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((l, i) => (
                        <BillLineRow key={l.key} line={l} index={i} accounts={lineAccounts}
                          usualGoods={ITEM_GROUP_USUAL}
                          usualTransport={usualLabel(roleAccount(chart.data, "DELIVERY_TRANSPORT"))}
                          onChange={(patch) => setLine(l.key, patch)}
                          onRemove={() => setLines((b) => b.filter((x) => x.key !== l.key))} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            <p className="mt-3 text-strong" data-testid="bill-form-total">Total {money(total)}</p>
          </Facts>
        </div>
      </div>
      <GrnPicker
        open={grnOpen}
        supplierId={supplierId || null}
        poId={params.get("po")}
        onClose={() => setGrnOpen(false)}
        onPick={(picked, supplierOfGrn, poTerms) => {
          if (!supplierId) setSupplierId(supplierOfGrn);
          setPoTermsDays(poTerms);
          setLines((before) => [...before.filter((l) => lineAmount(l) !== null || l.description !== ""), ...picked]);
          setGrnOpen(false);
        }}
      />
      <DeliveryOrderPicker
        open={doOpen}
        billId={id ?? null}
        onBill={new Set(lines.map((l) => l.deliveryOrderId).filter((d): d is string => !!d))}
        onClose={() => setDoOpen(false)}
        onPick={(picked) => {
          setLines((before) => [...before.filter((l) => lineAmount(l) !== null || l.description !== ""), ...picked]);
          setDoOpen(false);
        }}
      />
      <OtherCreditorModal open={creditorOpen} onClose={() => setCreditorOpen(false)}
        onCreated={(newId) => { setSupplierId(newId); setCreditorOpen(false); }} />
    </div>
  );
}

function CreditorOptions({ rows }: { rows: ApCreditor[] }) {
  const suppliers = rows.filter((r) => r.kind !== "other_creditor");
  const others = rows.filter((r) => r.kind === "other_creditor");
  return (
    <>
      <optgroup label="Suppliers">
        {suppliers.map((s) => <option key={s.id} value={s.id}>{partyLabel(s)}</option>)}
      </optgroup>
      <optgroup label="Other creditors">
        {others.map((s) => <option key={s.id} value={s.id}>{partyLabel(s)}</option>)}
      </optgroup>
    </>
  );
}

/* 0570: the account a blank choice falls back to is the chart's role, named
   from the chart, never a number written here. Until the chart is read the
   row says only that the usual account is used.
   PROPOSAL - PENDING APPROVAL: "The usual account". */
/* 0659: a goods line's usual account is its item group's purchase account,
   which differs line by line (Finance Settings → Item groups).
   PROPOSAL - PENDING APPROVAL (docs/COPY-STANDARD.md, Finance (Chew), 0659). */
const ITEM_GROUP_USUAL = "The item group's account (usual)";

function usualLabel(a: LedgerAccount | undefined): string {
  return a ? `${a.code} ${a.name} (usual)` : "The usual account";
}

/** 0683 (Chew ruling 2): a goods line's channel is worked out from the orders
 *  it was bought for, never picked. A line going to more than one channel is
 *  saved as one line per channel. */
function GoodsLineChannels({ channels, n }: { channels: GoodsLineChannel[] | null; n: number }) {
  if (!channels || channels.length === 0) {
    return <span className="text-base-500" data-testid={`line-${n}-channel`}>From its orders</span>;
  }
  if (channels.length === 1) {
    const c = channels[0]!;
    return <span data-testid={`line-${n}-channel`}><DepartmentName type={c.department_type} id={c.department_id} /></span>;
  }
  return (
    <span data-testid={`line-${n}-channel`}>
      {channels.map((c) => (
        <span key={`${c.department_type}:${c.department_id ?? ""}`} className="block">
          <DepartmentName type={c.department_type} id={c.department_id} />: {num(c.qty)}
        </span>
      ))}
      <span className="block text-meta text-base-500">Split when saved</span>
    </span>
  );
}

function BillLineRow({ line, index, accounts, usualGoods, usualTransport, onChange, onRemove }: {
  line: LineDraft;
  index: number;
  accounts: ApAccountChoice[];
  usualGoods: string;
  /** 0689: the account a delivery order's line falls back to. */
  usualTransport: string;
  onChange: (patch: Partial<LineDraft>) => void;
  onRemove: () => void;
}) {
  const fromGrn = !!line.warehouseReceiptId;
  const fromDo = !!line.deliveryOrderId;
  const price = num(line.unitPrice.trim() === "" ? null : line.unitPrice);
  const diff = fromGrn && price !== null && line.poUnitCost !== null ? cents(price - line.poUnitCost) : null;
  const amount = lineAmount(line);
  const qtyTooMany = fromGrn && line.openQty !== null && (num(line.qty) ?? 0) > line.openQty;
  const n = index + 1;
  return (
    <tr className="border-t border-base-100 align-top">
      <td className={`py-1 pr-2${fromGrn || fromDo ? " whitespace-nowrap" : ""}`} data-testid={`line-${n}-source`}>
        {fromGrn ? (line.grnNo ?? "GRN") : fromDo ? (line.doNo ?? "Delivery order") : "Not from a GRN"}
      </td>
      <td className="py-1 pr-2">
        {fromGrn
          ? <span>{line.sku}</span>
          : <input aria-label={`Line ${n} description`} className={fieldCls} value={line.description}
              maxLength={300} onChange={(e) => onChange({ description: e.target.value })} />}
      </td>
      <td className="py-1 pr-2">
        <select aria-label={`Line ${n} account`} className={fieldCls} value={line.accountCode}
          onChange={(e) => onChange({ accountCode: e.target.value })}>
          <option value="">{fromGrn ? usualGoods : fromDo ? usualTransport : "Choose an account"}</option>
          {accounts.map((a) => <option key={a.code} value={a.code}>{a.code} {a.name}</option>)}
        </select>
      </td>
      {/* 0689: a delivery order's line is charged as one amount, with no qty or unit price. */}
      <td className="py-1 pr-2">
        {!fromDo && (
          <input aria-label={`Line ${n} qty`} className={`${fieldCls} w-20`} inputMode="decimal" value={line.qty}
            onChange={(e) => onChange({ qty: e.target.value })} />
        )}
        {fromGrn && line.openQty !== null && (
          <span className={`block text-meta ${qtyTooMany ? "text-kit-red-11" : "text-base-500"}`}>
            {line.openQty} received, not billed yet
          </span>
        )}
      </td>
      <td className="py-1 pr-2">
        {!fromDo && (
          <input aria-label={`Line ${n} unit price`} className={`${fieldCls} w-28`} inputMode="decimal"
            value={line.unitPrice} onChange={(e) => onChange({ unitPrice: e.target.value })} />
        )}
      </td>
      <td className="py-1 pr-2">
        {fromGrn || (line.qty.trim() !== "" && line.unitPrice.trim() !== "")
          ? <span>{money(amount)}</span>
          : <input aria-label={`Line ${n} amount`} className={`${fieldCls} w-28`} inputMode="decimal"
              value={line.amount} onChange={(e) => onChange({ amount: e.target.value })} />}
      </td>
      {/* 0689: transport has no PO to compare, so a delivery order's line says nothing here. */}
      <td className="py-1 pr-2" data-testid={`line-${n}-price-check`}>
        {fromGrn ? priceDiffWord(diff) : fromDo ? "" : "No PO price"}
      </td>
      <td className="py-1 pr-2">
        {fromGrn
          ? <GoodsLineChannels channels={line.channels} n={n} />
          : fromDo
            // 0689: a delivery order's line goes to its order's channel; nobody picks it.
            ? <span data-testid={`line-${n}-channel`}>
                {line.departmentType
                  ? <DepartmentName type={line.departmentType} id={line.departmentId} />
                  : <span className="text-base-500">From its order</span>}
              </span>
            : <DepartmentPicker label={`Line ${n} department`} type={line.departmentType} id={line.departmentId}
                income={accounts.find((a) => a.code === line.accountCode)?.kind === "INCOME"} onChange={onChange} />}
      </td>
      <td className="py-1">
        <Button variant="ghost" size="sm" onClick={onRemove}>Remove</Button>
      </td>
    </tr>
  );
}

/** The GRNs that still have goods to bill. Picking one fills the lines from
 *  the GRN — never re-keyed: open qty, the PO's price, account 5100. */
/** 0721: also Purchasing's way to add goods received to a bill. */
export function GrnPicker({ open, supplierId, poId, onClose, onPick }: {
  open: boolean;
  supplierId: string | null;
  poId: string | null;
  onClose: () => void;
  onPick: (lines: LineDraft[], supplierId: string, poTermsDays: number | null) => void;
}) {
  const candidates = useGrnCandidates(supplierId, open);
  const [busy, setBusy] = useState<string | null>(null);
  const rows = (candidates.data ?? []).filter((r) => !poId || r.po_id === poId);
  const pick = async (g: GrnCandidateRow) => {
    setBusy(g.receipt_id);
    try {
      const grnLines = await fetchGrnLines(g.receipt_id);
      const picked = grnLines
        .filter((l) => (num(l.open_qty) ?? 0) > 0)
        .map<LineDraft>((l) => ({
          key: newKey(),
          warehouseReceiptId: l.receipt_id,
          poLineId: l.po_line_id,
          grnNo: l.grn_no ?? `GRN of ${l.po_id}`,
          sku: l.sku,
          description: l.sku,
          accountCode: "",
          qty: String(num(l.open_qty) ?? ""),
          unitPrice: l.po_unit_cost == null ? "" : String(l.po_unit_cost),
          amount: "",
          poUnitCost: num(l.po_unit_cost),
          openQty: num(l.open_qty),
          departmentType: (l.department_type ?? null) as DepartmentType | null,
          departmentId: l.department_id ?? null,
          channels: l.channels ?? null,
          deliveryOrderId: null,
          doNo: null,
        }));
      if (picked.length === 0) toast.error("Everything on that GRN is already billed.");
      else onPick(picked, g.supplier_id, g.po_terms_days ?? null);
    } catch (e) {
      toast.error(refusal(e));
    } finally {
      setBusy(null);
    }
  };
  return (
    <Modal open={open} onOpenChange={(o) => { if (!o) onClose(); }} width="wide"
      title="Convert GRN to bill"
      description="Goods received and not billed yet. Pick the GRN this invoice is for; its lines come across with the PO's price.">
      {candidates.isError
        ? <p className="text-body">The GRNs could not be loaded. Close this and try again.</p>
        : !candidates.isSuccess
          ? <p className="text-body">Loading GRNs…</p>
          : rows.length === 0
            ? <p className="text-body">No GRN is waiting to be billed{supplierId ? " for this supplier" : ""}.</p>
            : (
              <div className="overflow-x-auto">
                <table className="w-full text-body" data-testid="grn-candidates">
                  <thead>
                    <tr className="text-left text-base-500">
                      <th className="py-1 pr-2">GRN</th>
                      <th className="py-1 pr-2">PO</th>
                      <th className="py-1 pr-2">Supplier</th>
                      <th className="py-1 pr-2">Received</th>
                      <th className="py-1 pr-2 text-right">Not billed</th>
                      <th className="py-1 pr-2 text-right">At PO price</th>
                      <th className="py-1" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((g) => (
                      <tr key={g.receipt_id} className="border-t border-base-100">
                        <td className="py-1 pr-2">{g.grn_no ?? `GRN of ${g.po_id}`}</td>
                        <td className="py-1 pr-2">{g.po_id}</td>
                        <td className="py-1 pr-2">{g.supplier_name}</td>
                        <td className="py-1 pr-2">{fmtDate(g.received_on)}</td>
                        <td className="py-1 pr-2 text-right">{g.open_qty} in {g.open_lines} {g.open_lines === 1 ? "line" : "lines"}</td>
                        <td className="py-1 pr-2 text-right">{money(g.open_value_at_po_cost)}</td>
                        <td className="py-1">
                          <Button size="sm" loading={busy === g.receipt_id} onClick={() => void pick(g)}>Use this GRN</Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
    </Modal>
  );
}

/** 0689 (Chew ruling 5, 「虽然是我们出，但是还是要记录运输费用啊，根据订单」): a
 *  logistics partner's bill names the delivery orders it covers. Pick the
 *  partner, tick its delivery orders, then type each one's amount, or the
 *  bill's total and split it equally (「如果一个总数就平除」). Each becomes a
 *  line on delivery transport, in the channel of the DO's order. */
function DeliveryOrderPicker({ open, billId, onBill, onClose, onPick }: {
  open: boolean;
  billId: string | null;
  /** The delivery orders already on the form, which are not offered again. */
  onBill: ReadonlySet<string>;
  onClose: () => void;
  onPick: (lines: LineDraft[]) => void;
}) {
  const partners = useBillDeliveryOrders(billId, open);
  const [partnerId, setPartnerId] = useState("");
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [total, setTotal] = useState("");
  const partner = (partners.data ?? []).find((p) => p.partner_id === partnerId) ?? null;
  const dos = (partner?.delivery_orders ?? []).filter((d) => !onBill.has(d.id));
  const chosen = dos.filter((d) => d.id in picked);
  const amountOf = (d: BillDeliveryOrder) => num((picked[d.id] ?? "").trim() === "" ? null : picked[d.id]!);
  const totalNum = num(total.trim() === "" ? null : total);
  const reset = () => { setPartnerId(""); setPicked({}); setTotal(""); };
  const close = () => { reset(); onClose(); };
  const toggle = (d: BillDeliveryOrder, on: boolean) => setPicked((before) => {
    const next = { ...before };
    if (on) next[d.id] = ""; else delete next[d.id];
    return next;
  });
  const split = () => {
    if (totalNum === null || chosen.length === 0) return;
    const parts = splitEqually(totalNum, chosen.length);
    setPicked((before) => ({ ...before, ...Object.fromEntries(chosen.map((d, i) => [d.id, String(parts[i])])) }));
  };
  // The Receiving button law: a disabled button names its gap.
  const gap = chosen.length === 0 ? "Add: tick a delivery order"
    : chosen.some((d) => (amountOf(d) ?? 0) <= 0) ? "Add: type each amount, or split the total"
      : null;
  const add = () => {
    onPick(chosen.map<LineDraft>((d) => ({
      ...blankLine(),
      deliveryOrderId: d.id,
      doNo: d.do_no,
      description: `Transport · ${d.do_no}${d.so !== null ? ` · SO-${d.so}` : ""}`,
      amount: picked[d.id] ?? "",
      departmentType: (d.department_type ?? null) as DepartmentType | null,
      departmentId: d.department_id ?? null,
    })));
    reset();
  };
  return (
    <Modal open={open} onOpenChange={(o) => { if (!o) close(); }} width="wide"
      title="Add delivery orders"
      description="The delivery orders a logistics bill is for. Each becomes a line on delivery transport, in the channel of its order."
      footer={
        <span className="flex gap-2">
          <Button variant="ghost" onClick={close}>Cancel</Button>
          <Button variant="primary" disabled={gap !== null} onClick={add} data-testid="add-delivery-order-lines">
            {gap ?? `Add ${chosen.length} ${chosen.length === 1 ? "line" : "lines"}`}
          </Button>
        </span>
      }>
      {partners.isError
        ? <p className="text-body">The delivery orders could not be loaded. Close this and try again.</p>
        : !partners.isSuccess
          ? <p className="text-body">Loading delivery orders…</p>
          : partners.data.length === 0
            ? <p className="text-body">No delivery order is waiting to be billed.</p>
            : (
              <div className="flex flex-col gap-3 text-body">
                <label className="block">
                  Logistics company
                  <select aria-label="Logistics company" className={`${fieldCls} mt-1`} value={partnerId}
                    onChange={(e) => { setPartnerId(e.target.value); setPicked({}); }}>
                    <option value="">Choose the logistics company</option>
                    {partners.data.map((p) => <option key={p.partner_id} value={p.partner_id}>{p.name}</option>)}
                  </select>
                </label>
                {partner && (dos.length === 0
                  ? <p>Every delivery order of {partner.name} is on this bill already.</p>
                  : (
                    <>
                      <div className="overflow-x-auto">
                        <table className="w-full" data-testid="delivery-order-candidates">
                          <thead>
                            <tr className="text-left text-base-500">
                              <th className="py-1 pr-2" />
                              <th className="py-1 pr-2">DO No</th>
                              <th className="py-1 pr-2">Delivery date</th>
                              <th className="py-1 pr-2">SO No</th>
                              <th className="py-1 pr-2">Channel</th>
                              <th className="py-1 pr-2">Amount (RM)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {dos.map((d) => (
                              <tr key={d.id} className="border-t border-base-100">
                                <td className="py-1 pr-2">
                                  <Checkbox id={`do-${d.id}`} ariaLabel={`Charge ${d.do_no}`} checked={d.id in picked}
                                    onCheckedChange={(on) => toggle(d, on)} />
                                </td>
                                <td className="whitespace-nowrap py-1 pr-2">{d.do_no}</td>
                                <td className="whitespace-nowrap py-1 pr-2">{d.delivery_date ? fmtDate(d.delivery_date) : ""}</td>
                                <td className="whitespace-nowrap py-1 pr-2">{d.so !== null ? `SO-${d.so}` : ""}</td>
                                <td className="py-1 pr-2"><DepartmentName type={d.department_type} id={d.department_id} /></td>
                                <td className="py-1 pr-2">
                                  {d.id in picked && (
                                    <input aria-label={`${d.do_no} amount`} className={`${fieldCls} w-28`} inputMode="decimal"
                                      value={picked[d.id]} onChange={(e) => setPicked((b) => ({ ...b, [d.id]: e.target.value }))} />
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="flex flex-wrap items-end gap-2">
                        <label className="block">
                          Total on the bill (RM)
                          <input aria-label="Total on the bill" className={`${fieldCls} mt-1 w-36`} inputMode="decimal"
                            value={total} onChange={(e) => setTotal(e.target.value)} />
                        </label>
                        <Button variant="neutral" disabled={chosen.length === 0 || (totalNum ?? 0) <= 0} onClick={split}>
                          Split equally
                        </Button>
                      </div>
                    </>
                  ))}
              </div>
            )}
    </Modal>
  );
}

/** A landlord, an advertiser, a lorry company on credit: a creditor that is
 *  not a furniture supplier. Its bills go to 2120 Other payables. */
function OtherCreditorModal({ open, onClose, onCreated }: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const create = useCreateOtherCreditor();
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const ready = name.trim().length >= 2;
  return (
    <Modal open={open} onOpenChange={(o) => { if (!o) onClose(); }}
      title="Add other creditor"
      description="Someone Carres owes money to who is not a furniture supplier: a landlord, an advertiser, a lorry company."
      footer={
        <span className="flex gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!ready} loading={create.isPending}
            onClick={() => create.mutate({ name: name.trim(), contact: contact.trim() || null }, {
              onSuccess: (out) => { toast.success(`${name.trim()} added`); setName(""); setContact(""); onCreated(out.id); },
              onError: (e) => toast.error(refusal(e)),
            })}>Add creditor</Button>
        </span>
      }>
      <label className="block text-body">
        Name
        <input aria-label="Creditor name" className={`${fieldCls} mt-1`} value={name} maxLength={120}
          onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="mt-3 block text-body">
        Contact
        <input aria-label="Creditor contact" className={`${fieldCls} mt-1`} value={contact} maxLength={120}
          onChange={(e) => setContact(e.target.value)} />
      </label>
    </Modal>
  );
}
