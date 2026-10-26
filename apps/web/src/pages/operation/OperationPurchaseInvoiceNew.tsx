// design-standard: not-a-list-page — a document form (Finance's bill form shape); its lines table is the form's own.
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { DepartmentType } from "@carres/shared";
import { toast } from "sonner";
import { defaultBillDueDate } from "@carres/shared/schemas/finance-ap";
import Button from "@/components/kit/Button";
import { controlClass } from "@/components/kit/field-recipe";
import { apiFetch } from "@/lib/api";
import { appTodayIso } from "@/lib/fmt-date";
import { useApAccounts, useSaveBill } from "@/lib/payables-queries";
import { DepartmentPicker } from "@/pages/finance/department";
import { useOperationSuppliers } from "@/lib/queries";
import { Facts } from "@/pages/finance/payables/PayablesParts";
import { billSaveGap, GrnPicker, lineAmount, toInput, type LineDraft } from "@/pages/finance/payables/SupplierBills";
import { cents, money, refusal } from "@/pages/finance/payables/payables-words";
import SalesOrderTabs from "./SalesOrderTabs";

/**
 * NEW PURCHASE INVOICE — Purchasing enters a supplier bill (Chew, Finance,
 * WhatsApp 2026-10-23, via YH: both Purchasing and Finance may enter a bill).
 * Houzs keeps "New" and "From GRN" beside its Purchase Invoices list; so does
 * this page (`/operation/purchase-invoices/new` and `/from-grn`).
 *
 * ONE ENGINE: this is Finance's own bill door. It saves through
 * POST /api/finance/payables/bills → supplier_bill_save_draft, the GRN list
 * and lines are Finance's own (GrnPicker), and the bill it makes is a draft in
 * Finance → Bills. Q8 (Chew, WhatsApp to YH 2026-10-26 12:34: "once they save
 * should be direct go to related account as set"; Weisiang's ruling puts Houzs
 * first): saving posts the bill at once, as Houzs does. Purchasing bills goods received: every line comes from a
 * GRN, at the PO's price unless the supplier's bill says otherwise. The usual
 * accounts apply. Finance pays it; Purchasing cannot pay or cancel (0721).
 *
 * YH (chat 2026-10-26), following Houzs (purchase-invoices.ts): beside its GRN
 * lines a bill may carry lines with no GRN (freight, a service), with an
 * account from Finance's own list and a department; such a line may not bill a
 * GRN's own goods (the database refuses it by name). Purchasing changes its
 * own draft at `/operation/purchase-invoices/:id/edit`. Houzs locks a bill
 * once a payment is recorded; here a bill is paid only after Finance confirms
 * it, so a draft is the editable window.
 */
type DraftDoc = {
  id: string; supplier_id: string; supplier_invoice_no: string; bill_date: string; due_date: string | null;
  narration: string | null;
  lines: Array<{ warehouse_receipt_id: string | null; po_line_id: string | null; grn_no: string | null; sku: string | null;
    description: string | null; account_code: string | null; qty: number | null; unit_price: number | null;
    amount: number | null; department_type: DepartmentType | null; department_id: string | null }>;
};

let otherSeq = 0;
function draftLine(over: Partial<LineDraft>): LineDraft {
  otherSeq += 1;
  return {
    key: `p${otherSeq}`, warehouseReceiptId: null, poLineId: null, grnNo: null, sku: "", description: "", accountCode: "",
    qty: "", unitPrice: "", amount: "", poUnitCost: null, openQty: null, departmentType: null, departmentId: null,
    channels: null, deliveryOrderId: null, doNo: null, ...over,
  };
}

/** `/operation/purchase-invoices/:id/edit`: Purchasing's own draft. */
export function OperationPurchaseInvoiceEdit() {
  const { id = "" } = useParams();
  const draft = useQuery<DraftDoc>({
    queryKey: ["operation", "purchase-invoices", id],
    queryFn: () => apiFetch(`/api/operation/purchase-invoices/${id}`),
  });
  if (draft.isLoading) return <p className="p-4">Loading the bill…</p>;
  if (draft.isError || !draft.data) return <p className="p-4">This draft bill could not be opened. Only your own draft can be changed.</p>;
  return <OperationPurchaseInvoiceNew draft={draft.data} />;
}

export default function OperationPurchaseInvoiceNew({ fromGrn = false, draft }: { fromGrn?: boolean; draft?: DraftDoc }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const suppliers = useOperationSuppliers();
  const save = useSaveBill();
  const accounts = useApAccounts();
  const lineAccounts = (accounts.data ?? []).filter((a) => a.for_bill_line);

  const [supplierId, setSupplierId] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [billDate, setBillDate] = useState(appTodayIso());
  const [dueDate, setDueDate] = useState("");
  const [dueTouched, setDueTouched] = useState(false);
  const [poTermsDays, setPoTermsDays] = useState<number | null>(null);
  const [narration, setNarration] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [grnOpen, setGrnOpen] = useState(fromGrn);

  useEffect(() => {
    if (!draft) return;
    setSupplierId(draft.supplier_id);
    setInvoiceNo(draft.supplier_invoice_no);
    setBillDate(draft.bill_date);
    if (draft.due_date) { setDueTouched(true); setDueDate(draft.due_date); }
    setNarration(draft.narration ?? "");
    const str = (n: number | null) => (n == null ? "" : String(n));
    setLines(draft.lines.map((l) => draftLine({
      warehouseReceiptId: l.warehouse_receipt_id, poLineId: l.po_line_id, grnNo: l.grn_no, sku: l.sku ?? "",
      description: l.warehouse_receipt_id ? "" : (l.description ?? ""), accountCode: l.account_code ?? "",
      qty: str(l.qty), unitPrice: str(l.unit_price), amount: l.warehouse_receipt_id ? "" : str(l.amount),
      departmentType: l.department_type, departmentId: l.department_id,
    })));
  }, [draft]);

  const suggestedDue = defaultBillDueDate(billDate, poTermsDays, null) ?? "";
  const due = dueTouched ? dueDate : suggestedDue;
  const supplierName = (suppliers.data?.suppliers ?? []).find((s) => s.id === supplierId)?.name ?? null;
  const total = cents(lines.reduce((s, l) => s + (lineAmount(l) ?? 0), 0));
  const gap = billSaveGap({ supplierId, invoiceNo, billDate, lines })
    ?? (lines.some((l) => l.warehouseReceiptId) ? null : "Save: add a GRN");
  const back = "/operation?tab=purchase-invoices";
  const fieldCls = controlClass(false, "single");

  const setLine = (key: string, patch: Partial<LineDraft>) =>
    setLines((before) => before.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const submit = () => {
    save.mutate({
      id: draft?.id,
      input: {
        supplierId,
        supplierInvoiceNo: invoiceNo.trim(),
        billDate,
        dueDate: due || null,
        apAccountCode: null,
        narration: narration.trim() || null,
        lines: lines.map(toInput),
      },
    }, {
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: ["operation", "purchase-invoices"] });
        toast.success(draft ? "Bill saved." : "Bill saved and posted to its accounts.");
        navigate(back);
      },
      onError: (e) => toast.error(refusal(e)),
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SalesOrderTabs
        identity={draft ? "Draft Purchase Invoice" : "New Purchase Invoice"}
        customer={supplierName}
        backTo={back}
        backLabel="Purchase Invoices"
        right={
          <span className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => navigate(back)}>Cancel</Button>
            <Button variant="primary" disabled={gap !== null} loading={save.isPending} onClick={submit}
              data-testid="purchase-invoice-save">{gap ?? "Save"}</Button>
          </span>
        }
      />
      <div className="flex-1 overflow-auto p-4" data-testid="purchase-invoice-form">
        <div className="flex max-w-[1100px] flex-col gap-4">
          <Facts title="Who sent this bill">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="block">
                Supplier
                <select aria-label="Supplier" className={`${fieldCls} mt-1`} value={supplierId}
                  disabled={lines.length > 0}
                  onChange={(e) => setSupplierId(e.target.value)}>
                  <option value="">Choose who sent this bill</option>
                  {(suppliers.data?.suppliers ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
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
                <span className="text-meta text-base-500">The date printed on the supplier's bill.</span>
              </label>
              <label className="block">
                Due date
                <input aria-label="Due date" type="date" className={`${fieldCls} mt-1`} value={due}
                  onChange={(e) => { setDueTouched(true); setDueDate(e.target.value); }} />
                {!dueTouched && poTermsDays != null && suggestedDue !== "" && (
                  <span className="text-meta text-base-500">Bill date + {poTermsDays} days, from the PO's terms</span>
                )}
              </label>
              <label className="block md:col-span-2">
                Note
                <input aria-label="Note" className={`${fieldCls} mt-1`} value={narration} maxLength={500}
                  onChange={(e) => setNarration(e.target.value)} />
              </label>
            </div>
          </Facts>
          <Facts title="Goods received">
            <div className="mb-3 flex flex-wrap gap-2">
              <Button variant="primary" onClick={() => setGrnOpen(true)} data-testid="purchase-invoice-add-grn">Add GRN</Button>
              <Button variant="neutral" onClick={() => setLines((b) => [...b, draftLine({})])}
                data-testid="purchase-invoice-add-other">Add other line</Button>
            </div>
            {lines.length === 0
              ? <p>No line yet. Add the GRN this invoice is for. Its lines come across with the PO's price.</p>
              : (
                <div className="overflow-x-auto">
                  <table className="w-full text-body" data-testid="purchase-invoice-lines">
                    <thead>
                      <tr className="text-left text-base-500">
                        <th className="py-1 pr-2">GRN</th>
                        <th className="py-1 pr-2">Item</th>
                        <th className="py-1 pr-2">Account</th>
                        <th className="py-1 pr-2">Department</th>
                        <th className="py-1 pr-2">Qty</th>
                        <th className="py-1 pr-2">Unit price</th>
                        <th className="py-1 pr-2 text-right">Amount</th>
                        <th className="py-1" />
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((l, i) => (
                        <tr key={l.key} className="border-t border-base-100">
                          <td className="py-1 pr-2">{l.warehouseReceiptId ? l.grnNo : "No GRN"}</td>
                          <td className="py-1 pr-2">
                            {l.warehouseReceiptId ? l.sku : (
                              <input aria-label={`Description on line ${i + 1}`} className={fieldCls} value={l.description}
                                maxLength={300} placeholder="Freight, a service…" onChange={(e) => setLine(l.key, { description: e.target.value })} />
                            )}
                          </td>
                          <td className="py-1 pr-2">
                            {l.warehouseReceiptId ? <span className="text-base-500">Usual goods account</span> : (
                              <select aria-label={`Account on line ${i + 1}`} className={fieldCls} value={l.accountCode}
                                onChange={(e) => setLine(l.key, { accountCode: e.target.value })}>
                                <option value="">Choose an account</option>
                                {lineAccounts.map((a) => <option key={a.code} value={a.code}>{a.code} {a.name}</option>)}
                              </select>
                            )}
                          </td>
                          <td className="py-1 pr-2">
                            {l.warehouseReceiptId ? <span className="text-base-500">From its orders</span> : (
                              <DepartmentPicker label={`Department on line ${i + 1}`} type={l.departmentType} id={l.departmentId}
                                income={lineAccounts.find((a) => a.code === l.accountCode)?.kind === "INCOME"}
                                onChange={(patch) => setLine(l.key, patch)} />
                            )}
                          </td>
                          <td className="py-1 pr-2">
                            <input aria-label={`Qty on line ${i + 1}`} className={`${fieldCls} w-24`} inputMode="decimal"
                              value={l.qty} onChange={(e) => setLine(l.key, { qty: e.target.value })} />
                            {l.openQty != null && <span className="ml-1 text-meta text-base-500">of {l.openQty}</span>}
                          </td>
                          <td className="py-1 pr-2">
                            <input aria-label={`Unit price on line ${i + 1}`} className={`${fieldCls} w-28`} inputMode="decimal"
                              value={l.unitPrice} onChange={(e) => setLine(l.key, { unitPrice: e.target.value })} />
                          </td>
                          <td className="py-1 pr-2 text-right">
                            {l.warehouseReceiptId || (l.qty.trim() !== "" && l.unitPrice.trim() !== "")
                              ? money(lineAmount(l))
                              : <input aria-label={`Amount on line ${i + 1}`} className={`${fieldCls} w-28`} inputMode="decimal"
                                  value={l.amount} onChange={(e) => setLine(l.key, { amount: e.target.value })} />}
                          </td>
                          <td className="py-1">
                            <Button variant="ghost" size="sm" onClick={() => setLines((b) => b.filter((x) => x.key !== l.key))}>Remove</Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            <p className="mt-3 text-strong" data-testid="purchase-invoice-total">Total {money(total)}</p>
            <p className="mt-1 text-meta text-base-500">Saving posts the bill to its accounts (Chew, 2026-10-26, Houzs way). Finance pays it.</p>
          </Facts>
        </div>
      </div>
      <GrnPicker
        open={grnOpen}
        supplierId={supplierId || null}
        poId={null}
        onClose={() => setGrnOpen(false)}
        onPick={(picked, supplierOfGrn, poTerms) => {
          if (!supplierId) setSupplierId(supplierOfGrn);
          setPoTermsDays(poTerms);
          setLines((before) => [...before.filter((b) => !picked.some((p) => p.poLineId === b.poLineId && p.warehouseReceiptId === b.warehouseReceiptId)), ...picked]);
          setGrnOpen(false);
        }}
      />
    </div>
  );
}
