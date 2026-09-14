import { useEffect, useMemo, useState } from "react";
import { Link, Route, Routes, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import type {
  ApAccountChoice,
  ApCreditor,
  GrnCandidateRow,
  SupplierBillDocument,
  SupplierBillDraftInput,
  SupplierBillRegisterRow,
} from "@carres/shared/schemas/finance-ap";
import ListPageShell from "@/components/ListPageShell";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";
import Button from "@/components/kit/Button";
import Modal from "@/components/kit/Modal";
import { fieldCls } from "@/components/Field";
import ModuleHeader from "@/pages/operation/components/ModuleHeader";
import SalesOrderTabs from "@/pages/operation/SalesOrderTabs";
import { fmtDate } from "@/lib/fmt-date";
import {
  fetchGrnLines,
  useApAccounts,
  useApSuppliers,
  useBillAct,
  useCreateOtherCreditor,
  useGrnCandidates,
  useSaveBill,
  useSupplierBill,
  useSupplierBills,
  useApplyAdvance,
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
  priceDiffWord,
  refusal,
  todayIso,
  word,
  VOUCHER_STATUS_WORD,
} from "./payables-words";
import { FactRow, Facts, FilesCard, HistoryCard, PayablesSwitch, ReadFailed, ReasonModal } from "./PayablesParts";
import { AdvanceModal, AmountField } from "./VoucherAdvance";

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

function BillRegister() {
  const navigate = useNavigate();
  const query = useSupplierBills();
  const rows = query.data ?? [];
  const columns = useMemo<DataGridColumn<SupplierBillRegisterRow>[]>(() => [
    { key: "bill", label: "Bill No", width: 170,
      accessor: (r) => <Link className="text-kit-blue-11 underline underline-offset-2" to={`/finance/bills/${r.id}`}>{r.bill_no ?? "Draft, no number yet"}</Link>,
      searchValue: (r) => r.bill_no ?? "", exportValue: (r) => r.bill_no ?? "Draft, no number yet" },
    { key: "date", label: "Bill Date", width: 130, accessor: (r) => fmtDate(r.bill_date),
      dateValue: (r) => r.bill_date, filterType: "date", exportValue: (r) => fmtDate(r.bill_date) },
    { key: "supplier", label: "Supplier", width: 220, accessor: (r) => r.supplier_name,
      searchValue: (r) => r.supplier_name, filterType: "enum" },
    { key: "kind", label: "Creditor Type", width: 140, accessor: (r) => creditorKindWord(r.supplier_kind),
      filterValue: (r) => creditorKindWord(r.supplier_kind), filterType: "enum" },
    { key: "invoice", label: "Supplier Invoice", width: 160, accessor: (r) => r.supplier_invoice_no,
      searchValue: (r) => r.supplier_invoice_no },
    { key: "grn", label: "GRN", width: 160, accessor: (r) => r.grn_nos ?? "Not from a GRN",
      searchValue: (r) => r.grn_nos ?? "" },
    { key: "due", label: "Due Date", width: 130, accessor: (r) => r.due_date ? fmtDate(r.due_date) : "No due date",
      dateValue: (r) => r.due_date, filterType: "date" },
    { key: "status", label: "Status", width: 120, accessor: (r) => word(BILL_STATUS_WORD, r.status),
      filterValue: (r) => word(BILL_STATUS_WORD, r.status), filterType: "enum" },
    { key: "total", label: "Total", width: 140, align: "right", accessor: (r) => money(r.total_amount),
      numberValue: (r) => num(r.total_amount), filterType: "number", exportValue: (r) => num(r.total_amount) ?? "" },
    { key: "unpaid", label: "Unpaid", width: 140, align: "right",
      accessor: (r) => r.status === "confirmed" ? money(r.unpaid) : r.status === "cancelled" ? "Cancelled" : "Not confirmed",
      numberValue: (r) => num(r.unpaid), filterType: "number" },
    { key: "price", label: "Price Check", width: 180,
      accessor: (r) => r.price_flags > 0
        ? `${r.price_flags} ${r.price_flags === 1 ? "line differs" : "lines differ"} from PO`
        : r.grn_nos ? "Matches PO" : "No PO price",
      filterValue: (r) => r.price_flags > 0 ? "Differs from PO" : "Matches PO", filterType: "enum" },
    { key: "files", label: "Files", width: 90, align: "right", accessor: (r) => String(r.file_count),
      numberValue: (r) => r.file_count },
  ], []);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ModuleHeader destinationHeader testId="bills-destination-header" word="Bills" docTitle="Bills — Carres" />
      {query.isError ? <ReadFailed what="Bills" onRetry={() => void query.refetch()} /> : (
        <ListPageShell register>
          <DataGrid
            rows={rows}
            columns={columns}
            rowKey={(r) => r.id}
            storageKey="carres.finance.bills.v1"
            appearance="reference"
            exportName="Bills"
            groupBanner={false}
            stickyIdentity
            isLoading={!query.isSuccess}
            searchPlaceholder="Search bills…"
            toolbarStart={
              <span className="flex items-center gap-4">
                <button
                  type="button"
                  data-testid="new-bill"
                  onClick={() => navigate("/finance/bills/new")}
                  className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full bg-kit-blue-9 px-3 text-meta font-semibold text-white hover:opacity-90"
                >
                  + New Bill
                </button>
                <PayablesSwitch current="bills" />
              </span>
            }
            emptyMessage="No bills yet. A supplier's invoice appears here once it is entered."
            onRowDoubleClick={(r) => navigate(`/finance/bills/${r.id}`)}
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
        <ModuleHeader destinationHeader testId="bills-destination-header" word="Bills" docTitle="Bills — Carres" />
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
        docTitle={`${b.bill_no ?? "Draft bill"} — Carres`}
        status={<span data-testid="bill-status">{word(BILL_STATUS_WORD, b.status)}</span>}
        right={
          <span className="flex items-center gap-2">
            {doc.can.edit && <Button onClick={() => navigate(`/finance/bills/${id}/edit`)} icon="edit">Edit</Button>}
            {doc.can.cancel && <Button onClick={() => setCancelling(true)}>Cancel bill</Button>}
            {doc.can.confirm && <Button variant="primary" onClick={() => setConfirming(true)}>Confirm bill</Button>}
            {b.status === "confirmed" && num(doc.unpaid) !== null && (num(doc.unpaid) ?? 0) > 0 && (
              <Link className="btn-secondary" to={`/finance/payment-vouchers/new?supplier=${b.supplier_id}&bill=${b.id}`}>
                New Payment Voucher
              </Link>
            )}
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
            {b.narration && <FactRow label="Note">{b.narration}</FactRow>}
            <FactRow label="Ledger entry">
              {b.entry_no ?? "None yet — confirming the bill makes it"}
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
              : doc.payments.map((p) => p.kind === "advance"
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

function BillLinesCard({ doc }: { doc: SupplierBillDocument }) {
  return (
    <Facts title="Lines">
      <div className="overflow-x-auto">
        <table className="w-full text-body" data-testid="bill-lines">
          <thead>
            <tr className="text-left text-base-500">
              <th className="py-1 pr-3">#</th>
              <th className="py-1 pr-3">GRN</th>
              <th className="py-1 pr-3">Item</th>
              <th className="py-1 pr-3">Account</th>
              <th className="py-1 pr-3 text-right">Qty</th>
              <th className="py-1 pr-3 text-right">Unit price</th>
              <th className="py-1 pr-3">Against PO</th>
              <th className="py-1 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {doc.lines.map((l) => (
              <tr key={l.line_no} className="border-t border-base-100">
                <td className="py-1 pr-3">{l.line_no}</td>
                <td className="py-1 pr-3">{l.warehouse_receipt_id ? (l.grn_no ?? `GRN of ${l.grn_po_id ?? "a PO"}`) : "Not from a GRN"}</td>
                <td className="py-1 pr-3">{l.description ?? l.sku ?? "No description"}</td>
                <td className="py-1 pr-3">{l.account_code} {l.account_name ?? ""}</td>
                <td className="py-1 pr-3 text-right">{l.qty ?? "—"}</td>
                <td className="py-1 pr-3 text-right">{money(l.unit_price)}</td>
                <td className="py-1 pr-3">{l.po_line_id ? priceDiffWord(num(l.price_diff)) : "No PO price"}</td>
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

type LineDraft = {
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
};

let lineSeq = 0;
function newKey() { lineSeq += 1; return `l${lineSeq}`; }

function blankLine(): LineDraft {
  return {
    key: newKey(), warehouseReceiptId: null, poLineId: null, grnNo: null, sku: "", description: "",
    accountCode: "", qty: "", unitPrice: "", amount: "", poUnitCost: null, openQty: null,
  };
}

/** What a line comes to. Qty × price when both are typed, else the typed amount. */
export function lineAmount(l: Pick<LineDraft, "qty" | "unitPrice" | "amount">): number | null {
  const q = num(l.qty.trim() === "" ? null : l.qty);
  const p = num(l.unitPrice.trim() === "" ? null : l.unitPrice);
  if (q !== null && p !== null) return cents(q * p);
  return num(l.amount.trim() === "" ? null : l.amount);
}

function toInput(l: LineDraft): SupplierBillDraftInput["lines"][number] {
  const q = l.qty.trim() === "" ? null : Number(l.qty);
  const p = l.unitPrice.trim() === "" ? null : Number(l.unitPrice);
  if (l.warehouseReceiptId && l.poLineId) {
    return {
      warehouseReceiptId: l.warehouseReceiptId, poLineId: l.poLineId,
      accountCode: l.accountCode || null, sku: l.sku || null, description: l.description || null,
      qty: q, unitPrice: p,
    };
  }
  return {
    accountCode: l.accountCode || null, sku: l.sku || null, description: l.description || null,
    qty: q, unitPrice: p,
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
  const save = useSaveBill();

  const [supplierId, setSupplierId] = useState(params.get("supplier") ?? "");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [billDate, setBillDate] = useState(todayIso());
  const [dueDate, setDueDate] = useState("");
  const [apAccount, setApAccount] = useState("");
  const [narration, setNarration] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [grnOpen, setGrnOpen] = useState(params.has("po"));
  const [creditorOpen, setCreditorOpen] = useState(false);
  const [loaded, setLoaded] = useState(!id);

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
      accountCode: l.account_code,
      qty: l.qty == null ? "" : String(l.qty),
      unitPrice: l.unit_price == null ? "" : String(l.unit_price),
      amount: String(l.amount),
      poUnitCost: num(l.po_unit_cost),
      openQty: null,
    })));
    setLoaded(true);
  }, [id, loaded, existing.data]);

  const supplier = (suppliers.data ?? []).find((s) => s.id === supplierId) ?? null;
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
      onSuccess: (out) => {
        toast.success(id ? "Bill saved" : "Draft bill saved");
        navigate(`/finance/bills/${out.id}`);
      },
      onError: (e) => toast.error(refusal(e)),
    });
  };

  if (id && existing.isError) return <ReadFailed what="This bill" onRetry={() => void existing.refetch()} />;
  if (id && !loaded) return <div className="p-6 text-body">Loading bill…</div>;
  if (id && existing.data && !existing.data.can.edit) {
    return <div className="p-6 text-body">Only a draft bill can be changed. <Link className="text-kit-blue-11 underline underline-offset-2" to={`/finance/bills/${id}`}>Back to the bill</Link></div>;
  }

  const ready = supplierId !== "" && invoiceNo.trim() !== "" && /^\d{4}-\d{2}-\d{2}$/.test(billDate)
    && lines.length > 0 && lines.every((l) => (lineAmount(l) ?? 0) > 0);

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
            <Button variant="primary" disabled={!ready} loading={save.isPending} onClick={submit}>Save</Button>
          </span>
        }
      />
      <div className="flex-1 overflow-auto p-4" data-testid="bill-form">
        <div className="flex max-w-[1100px] flex-col gap-4">
          <Facts title="Who sent this bill">
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
                  onChange={(e) => setDueDate(e.target.value)} />
              </label>
              <label className="block">
                Payables account
                <select aria-label="Payables account" className={`${fieldCls} mt-1`} value={apAccount}
                  onChange={(e) => setApAccount(e.target.value)}>
                  <option value="">
                    {supplier?.kind === "other_creditor" ? "2120 Other payables (usual)" : "2110 Trade payables (usual)"}
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
              <Button variant="ghost" icon="add" onClick={() => setLines((b) => [...b, blankLine()])}>Add line</Button>
            </div>
            {lines.length === 0
              ? <p>No line yet. Convert a GRN, or add a line for a bill that is not for goods.</p>
              : (
                <div className="overflow-x-auto">
                  <table className="w-full text-body" data-testid="bill-form-lines">
                    <thead>
                      <tr className="text-left text-base-500">
                        <th className="py-1 pr-2">GRN</th>
                        <th className="py-1 pr-2">Item</th>
                        <th className="py-1 pr-2">Account</th>
                        <th className="py-1 pr-2">Qty</th>
                        <th className="py-1 pr-2">Unit price</th>
                        <th className="py-1 pr-2">Amount</th>
                        <th className="py-1 pr-2">Against PO</th>
                        <th className="py-1" />
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((l, i) => (
                        <BillLineRow key={l.key} line={l} index={i} accounts={lineAccounts}
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
        onPick={(picked, supplierOfGrn) => {
          if (!supplierId) setSupplierId(supplierOfGrn);
          setLines((before) => [...before.filter((l) => lineAmount(l) !== null || l.description !== ""), ...picked]);
          setGrnOpen(false);
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
        {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </optgroup>
      <optgroup label="Other creditors">
        {others.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </optgroup>
    </>
  );
}

function BillLineRow({ line, index, accounts, onChange, onRemove }: {
  line: LineDraft;
  index: number;
  accounts: ApAccountChoice[];
  onChange: (patch: Partial<LineDraft>) => void;
  onRemove: () => void;
}) {
  const fromGrn = !!line.warehouseReceiptId;
  const price = num(line.unitPrice.trim() === "" ? null : line.unitPrice);
  const diff = fromGrn && price !== null && line.poUnitCost !== null ? cents(price - line.poUnitCost) : null;
  const amount = lineAmount(line);
  const qtyTooMany = fromGrn && line.openQty !== null && (num(line.qty) ?? 0) > line.openQty;
  const n = index + 1;
  return (
    <tr className="border-t border-base-100 align-top">
      <td className="py-1 pr-2">{fromGrn ? (line.grnNo ?? "GRN") : "Not from a GRN"}</td>
      <td className="py-1 pr-2">
        {fromGrn
          ? <span>{line.sku}</span>
          : <input aria-label={`Line ${n} description`} className={fieldCls} value={line.description}
              maxLength={300} onChange={(e) => onChange({ description: e.target.value })} />}
      </td>
      <td className="py-1 pr-2">
        <select aria-label={`Line ${n} account`} className={fieldCls} value={line.accountCode}
          onChange={(e) => onChange({ accountCode: e.target.value })}>
          <option value="">{fromGrn ? "5100 Cost of goods sold (usual)" : "Choose an account"}</option>
          {accounts.map((a) => <option key={a.code} value={a.code}>{a.code} {a.name}</option>)}
        </select>
      </td>
      <td className="py-1 pr-2">
        <input aria-label={`Line ${n} qty`} className={`${fieldCls} w-20`} inputMode="decimal" value={line.qty}
          onChange={(e) => onChange({ qty: e.target.value })} />
        {fromGrn && line.openQty !== null && (
          <span className={`block text-meta ${qtyTooMany ? "text-kit-red-11" : "text-base-500"}`}>
            {line.openQty} received, not billed yet
          </span>
        )}
      </td>
      <td className="py-1 pr-2">
        <input aria-label={`Line ${n} unit price`} className={`${fieldCls} w-28`} inputMode="decimal"
          value={line.unitPrice} onChange={(e) => onChange({ unitPrice: e.target.value })} />
      </td>
      <td className="py-1 pr-2">
        {fromGrn || (line.qty.trim() !== "" && line.unitPrice.trim() !== "")
          ? <span>{money(amount)}</span>
          : <input aria-label={`Line ${n} amount`} className={`${fieldCls} w-28`} inputMode="decimal"
              value={line.amount} onChange={(e) => onChange({ amount: e.target.value })} />}
      </td>
      <td className="py-1 pr-2" data-testid={`line-${n}-price-check`}>
        {fromGrn ? priceDiffWord(diff) : "No PO price"}
      </td>
      <td className="py-1">
        <Button variant="ghost" size="sm" onClick={onRemove}>Remove</Button>
      </td>
    </tr>
  );
}

/** The GRNs that still have goods to bill. Picking one fills the lines from
 *  the GRN — never re-keyed: open qty, the PO's price, account 5100. */
function GrnPicker({ open, supplierId, poId, onClose, onPick }: {
  open: boolean;
  supplierId: string | null;
  poId: string | null;
  onClose: () => void;
  onPick: (lines: LineDraft[], supplierId: string) => void;
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
        }));
      if (picked.length === 0) toast.error("Everything on that GRN is already billed.");
      else onPick(picked, g.supplier_id);
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
