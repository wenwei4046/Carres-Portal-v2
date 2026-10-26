// design-standard: not-a-list-page — a document form (Finance's bill form shape); its lines table is the form's own.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { defaultBillDueDate } from "@carres/shared/schemas/finance-ap";
import Button from "@/components/kit/Button";
import { controlClass } from "@/components/kit/field-recipe";
import { appTodayIso } from "@/lib/fmt-date";
import { useSaveBill } from "@/lib/payables-queries";
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
 * Finance → Bills. Purchasing bills goods received: every line comes from a
 * GRN, at the PO's price unless the supplier's bill says otherwise. The usual
 * accounts apply. Finance checks and confirms the bill (that posts it) and pays
 * it; Purchasing can do neither (0721).
 */
export default function OperationPurchaseInvoiceNew({ fromGrn = false }: { fromGrn?: boolean }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const suppliers = useOperationSuppliers();
  const save = useSaveBill();

  const [supplierId, setSupplierId] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [billDate, setBillDate] = useState(appTodayIso());
  const [dueDate, setDueDate] = useState("");
  const [dueTouched, setDueTouched] = useState(false);
  const [poTermsDays, setPoTermsDays] = useState<number | null>(null);
  const [narration, setNarration] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [grnOpen, setGrnOpen] = useState(fromGrn);

  const suggestedDue = defaultBillDueDate(billDate, poTermsDays, null) ?? "";
  const due = dueTouched ? dueDate : suggestedDue;
  const supplierName = (suppliers.data?.suppliers ?? []).find((s) => s.id === supplierId)?.name ?? null;
  const total = cents(lines.reduce((s, l) => s + (lineAmount(l) ?? 0), 0));
  const gap = billSaveGap({ supplierId, invoiceNo, billDate, lines })
    ?? (lines.length > 0 ? null : "Save: add a GRN");
  const back = "/operation?tab=purchase-invoices";
  const fieldCls = controlClass(false, "single");

  const setLine = (key: string, patch: Partial<LineDraft>) =>
    setLines((before) => before.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const submit = () => {
    save.mutate({
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
        toast.success("Draft bill saved. Finance confirms it.");
        navigate(back);
      },
      onError: (e) => toast.error(refusal(e)),
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SalesOrderTabs
        identity="New Purchase Invoice"
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
                        <th className="py-1 pr-2">Qty</th>
                        <th className="py-1 pr-2">Unit price</th>
                        <th className="py-1 pr-2 text-right">Amount</th>
                        <th className="py-1" />
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((l, i) => (
                        <tr key={l.key} className="border-t border-base-100">
                          <td className="py-1 pr-2">{l.grnNo}</td>
                          <td className="py-1 pr-2">{l.sku}</td>
                          <td className="py-1 pr-2">
                            <input aria-label={`Qty on line ${i + 1}`} className={`${fieldCls} w-24`} inputMode="decimal"
                              value={l.qty} onChange={(e) => setLine(l.key, { qty: e.target.value })} />
                            {l.openQty != null && <span className="ml-1 text-meta text-base-500">of {l.openQty}</span>}
                          </td>
                          <td className="py-1 pr-2">
                            <input aria-label={`Unit price on line ${i + 1}`} className={`${fieldCls} w-28`} inputMode="decimal"
                              value={l.unitPrice} onChange={(e) => setLine(l.key, { unitPrice: e.target.value })} />
                          </td>
                          <td className="py-1 pr-2 text-right">{money(lineAmount(l))}</td>
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
            <p className="mt-1 text-meta text-base-500">Saved as a draft bill. Finance confirms it and pays it.</p>
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
