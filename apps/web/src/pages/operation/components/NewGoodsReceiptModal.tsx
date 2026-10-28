/**
 * New Goods Receipt — goods that came with no Purchase Order (0728).
 * Follows Houzs-ERP backend/src/scm/routes/grns.ts:1408 (supplier + items, no
 * parent PO; posting writes the stock IN) per Weisiang's ruling (2026-10-22):
 * clear Carres rules, implement Houzs. YH 2026-10-27 asked for it; the idea
 * comes from PR #2100's unidentified delivery.
 *
 * The form only collects. `POST /api/operation/pos/receive-without-po` posts it
 * through `office_receive_without_po`, which owns every rule.
 */
import { useMemo, useState } from "react";
import type { OfficeReceiveWithoutPoInput } from "@carres/shared";
import Modal from "@/components/kit/Modal";
import Button from "@/components/kit/Button";
import Select from "@/components/kit/Select";
import Input from "@/components/kit/Input";
import DatePicker from "@/components/kit/DatePicker";
import Textarea from "@/components/kit/Textarea";
import DOFileUploadField from "@/components/DOFileUploadField";
import { apiFetch } from "@/lib/api";
import type { NewPoDraft, NewPoLineDraft, NewPoSku } from "../purchase-orders/NewPurchaseOrderModal";
import { newPurchaseOrderBody } from "../purchase-orders/NewPurchaseOrderModal";

export type NewGrnDraft = Omit<NewPoDraft, "etaDate"> & { receivedAt: string | null; doNumber: string; doFilePath: string | null };

/** The request body, or null while the draft is not complete. */
export function newGoodsReceiptBody(draft: NewGrnDraft, saveKey: string): OfficeReceiveWithoutPoInput | null {
  const po = newPurchaseOrderBody({ ...draft, etaDate: null });
  if (!po || draft.doNumber.trim().length < 3 || !draft.doFilePath) return null;
  return {
    supplierId: po.supplierId, destinationId: po.destinationId, lines: po.lines,
    doNumber: draft.doNumber.trim(), doFilePath: draft.doFilePath, saveKey,
    ...(draft.receivedAt ? { goodsReceivedAt: draft.receivedAt } : {}),
    ...(po.note ? { note: po.note } : {}),
  };
}

let nextKey = 1;
const blankLine = (): NewPoLineDraft => ({ key: nextKey++, sku: "", qty: "1", price: "" });
const blank = (): NewGrnDraft => ({ supplierId: "", destinationId: "", receivedAt: null, doNumber: "", doFilePath: null, note: "", lines: [blankLine()] });

export default function NewGoodsReceiptModal({ open, onOpenChange, suppliers, destinations, skus, onPosted }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  suppliers: ReadonlyArray<{ id: string; name: string }>;
  destinations: ReadonlyArray<{ id: string; name: string }>;
  skus: readonly NewPoSku[];
  onPosted: () => void;
}) {
  const [draft, setDraft] = useState<NewGrnDraft>(blank);
  // One key per form: a lost response retried posts nothing twice.
  const [saveKey, setSaveKey] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // The uploaded file is filed under the DO number, so editing the number drops it; say so.
  const [fileDropped, setFileDropped] = useState(false);
  const [uploadKey, setUploadKey] = useState(0);
  const body = newGoodsReceiptBody(draft, saveKey);
  const missing = [
    !draft.supplierId && "a Supplier", !draft.destinationId && "where it was received",
    draft.doNumber.trim().length < 3 && "a DO number of 3 or more characters",
    !draft.doFilePath && "the uploaded DO file",
    draft.lines.some((l) => !l.sku || !(Number(l.qty) >= 1)) && "an item and quantity on every line",
  ].filter(Boolean);
  const skuOptions = useMemo(
    () => skus.filter((s) => s.supplierId === draft.supplierId).map((s) => ({ value: s.sku, label: s.label })),
    [skus, draft.supplierId],
  );
  const setLine = (key: number, patch: Partial<NewPoLineDraft>) =>
    setDraft((d) => ({ ...d, lines: d.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) }));

  async function post() {
    if (!body) return;
    setBusy(true);
    setProblem(null);
    try {
      await apiFetch("/api/operation/pos/receive-without-po", { method: "POST", body: JSON.stringify(body) });
      setDraft(blank());
      setSaveKey(crypto.randomUUID());
      onPosted();
    } catch (e) {
      setProblem((e as Error).message || "The Goods Receipt was not saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="New Goods Receipt" width="wide"
      footer={<>
        <Button onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
        <Button variant="primary" onClick={() => void post()} disabled={!body || busy} loading={busy}>Post</Button>
      </>}
    >
      <div className="flex flex-col gap-3" data-testid="new-grn-form">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Select id="new-grn-supplier" label="Supplier" required value={draft.supplierId || undefined}
            onValueChange={(supplierId) => setDraft((d) => ({ ...d, supplierId, lines: [blankLine()] }))}
            options={suppliers.map((s) => ({ value: s.id, label: s.name }))} />
          <Select id="new-grn-site" label="Received at" required value={draft.destinationId || undefined}
            onValueChange={(destinationId) => setDraft((d) => ({ ...d, destinationId }))}
            options={destinations.map((d) => ({ value: d.id, label: d.name }))} />
          <DatePicker id="new-grn-date" label="Goods Received Date" value={draft.receivedAt}
            onChange={(receivedAt) => setDraft((d) => ({ ...d, receivedAt }))} />
          <Input id="new-grn-do" label="DO Number" required value={draft.doNumber}
            onChange={(e) => {
              if (draft.doFilePath) { setFileDropped(true); setUploadKey((k) => k + 1); }
              setDraft((d) => ({ ...d, doNumber: e.target.value, doFilePath: null }));
            }} />
          <div className="md:col-span-2">
            <DOFileUploadField key={uploadKey} poId="NO-PO" doNumber={draft.doNumber}
              onUploaded={(doFilePath) => { setFileDropped(false); setDraft((d) => ({ ...d, doFilePath })); }} />
            {fileDropped && <p role="status" className="mt-1 text-body text-kit-red-11">DO number changed, upload the file again.</p>}
          </div>
        </div>
        {draft.lines.map((line, i) => (
          <div key={line.key} className="grid grid-cols-1 items-end gap-3 md:grid-cols-[minmax(0,1fr)_96px_128px_auto]">
            <Select id={`new-grn-sku-${line.key}`} label={i === 0 ? "SKU" : undefined} required disabled={!draft.supplierId}
              placeholder={draft.supplierId ? "Select" : "Select a supplier first"}
              value={line.sku || undefined} onValueChange={(sku) => setLine(line.key, { sku })} options={skuOptions} />
            <Input id={`new-grn-qty-${line.key}`} label={i === 0 ? "Qty" : undefined} type="number" min={1} step={1}
              value={line.qty} onChange={(e) => setLine(line.key, { qty: e.target.value })} />
            <Input id={`new-grn-price-${line.key}`} label={i === 0 ? "Unit Price (RM)" : undefined} type="number" min={0.01} step="0.01"
              placeholder="Catalog" value={line.price} onChange={(e) => setLine(line.key, { price: e.target.value })} />
            <Button variant="ghost" disabled={draft.lines.length === 1}
              onClick={() => setDraft((d) => ({ ...d, lines: d.lines.filter((l) => l.key !== line.key) }))}>Remove</Button>
          </div>
        ))}
        <div><Button icon="add" disabled={!draft.supplierId}
          onClick={() => setDraft((d) => ({ ...d, lines: [...d.lines, blankLine()] }))}>Add item</Button></div>
        <Textarea id="new-grn-note" label="Note" rows={2} maxLength={500} value={draft.note}
          onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))} />
        {!body && missing.length > 0 && <p role="status" className="text-body text-c-muted">Post is off: still needs {missing.join(", ")}.</p>}
        {problem && <p role="alert" className="text-body text-kit-red-11">{problem}</p>}
      </div>
    </Modal>
  );
}
