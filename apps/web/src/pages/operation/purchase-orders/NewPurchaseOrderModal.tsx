/**
 * New Purchase Order — office staff open a PO with no source, the Houzs way
 * (supplier, Supplier Deliver To, goods, PO Delivery Date).
 * Follows Houzs-ERP backend/src/scm/routes/mfg-purchase-orders.ts:1014
 * per Weisiang's ruling (2026-10-22): clear Carres rules, implement Houzs.
 *
 * Weisiang's decision (Mr Lim, WhatsApp 2026-10-22, relayed by YH 2026-10-23):
 * "as long as they can open SO PO DO". It overturns Jess's "No blank
 * independent PO" rule in docs/purchasing/MASTER.md; Jess was not part of it.
 *
 * The form only collects. `POST /api/operation/pos/new` sends it through the
 * one creation authority `purchasing_issue_pos_batch`, which keeps every
 * existing check (supplier truth, price approval, Deliver To, numbering,
 * Unit IDs). A blank Unit Price takes the Catalog price on the server.
 */
import { useMemo, useState } from "react";
import type { NewPurchaseOrderInput } from "@carres/shared";
import Modal from "@/components/kit/Modal";
import Button from "@/components/kit/Button";
import Select from "@/components/kit/Select";
import Input from "@/components/kit/Input";
import DatePicker from "@/components/kit/DatePicker";
import Textarea from "@/components/kit/Textarea";
import { apiFetch } from "@/lib/api";

export type NewPoLineDraft = { key: number; sku: string; qty: string; price: string };
export type NewPoDraft = { supplierId: string; destinationId: string; etaDate: string | null; note: string; lines: NewPoLineDraft[] };
export type NewPoSku = { sku: string; label: string; supplierId: string | null };

/** The request body, or null while the draft is not complete. */
export function newPurchaseOrderBody(draft: NewPoDraft): NewPurchaseOrderInput | null {
  if (!draft.supplierId || !draft.destinationId) return null;
  const lines = draft.lines.filter((l) => l.sku);
  if (lines.length === 0) return null;
  const out: NewPurchaseOrderInput["lines"] = [];
  for (const l of lines) {
    const qty = Number(l.qty);
    if (!Number.isInteger(qty) || qty < 1) return null;
    const price = l.price.trim() === "" ? null : Number(l.price);
    if (price != null && (!Number.isFinite(price) || price <= 0)) return null;
    out.push({ sku: l.sku, qty, price });
  }
  return {
    supplierId: draft.supplierId,
    destinationId: draft.destinationId,
    etaDate: draft.etaDate,
    ...(draft.note.trim() ? { note: draft.note.trim() } : {}),
    lines: out,
  };
}

let nextKey = 1;
const blankLine = (): NewPoLineDraft => ({ key: nextKey++, sku: "", qty: "1", price: "" });

export default function NewPurchaseOrderModal({
  open,
  onOpenChange,
  suppliers,
  destinations,
  skus,
  onIssued,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  suppliers: ReadonlyArray<{ id: string; name: string }>;
  destinations: ReadonlyArray<{ id: string; name: string }>;
  skus: readonly NewPoSku[];
  onIssued: (poId: string | null) => void;
}) {
  const [draft, setDraft] = useState<NewPoDraft>({ supplierId: "", destinationId: "", etaDate: null, note: "", lines: [blankLine()] });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const body = newPurchaseOrderBody(draft);
  // The engine refuses a SKU whose Catalog supplier is not this supplier, so only offer those.
  const skuOptions = useMemo(
    () => skus.filter((s) => s.supplierId === draft.supplierId).map((s) => ({ value: s.sku, label: s.label })),
    [skus, draft.supplierId],
  );
  const setLine = (key: number, patch: Partial<NewPoLineDraft>) =>
    setDraft((d) => ({ ...d, lines: d.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) }));

  async function issue() {
    if (!body) return;
    setBusy(true);
    setProblem(null);
    try {
      const res = await apiFetch<{ poId: string | null }>("/api/operation/pos/new", { method: "POST", body: JSON.stringify(body) });
      setDraft({ supplierId: "", destinationId: "", etaDate: null, note: "", lines: [blankLine()] });
      onIssued(res.poId);
    } catch (e) {
      const action = ((e as { body?: { action?: string } }).body)?.action;
      setProblem([(e as Error).message || "The Purchase Order was not created.", action].filter(Boolean).join(" "));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="New Purchase Order"
      width="wide"
      footer={<>
        <Button onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
        <Button variant="primary" onClick={() => void issue()} disabled={!body || busy} loading={busy}>Issue PO</Button>
      </>}
    >
      <div className="flex flex-col gap-3" data-testid="new-po-form">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Select id="new-po-supplier" label="Supplier" required value={draft.supplierId || undefined}
            onValueChange={(supplierId) => setDraft((d) => ({ ...d, supplierId, lines: [blankLine()] }))}
            options={suppliers.map((s) => ({ value: s.id, label: s.name }))} />
          <Select id="new-po-deliver-to" label="Supplier Deliver To" required value={draft.destinationId || undefined}
            onValueChange={(destinationId) => setDraft((d) => ({ ...d, destinationId }))}
            options={destinations.map((d) => ({ value: d.id, label: d.name }))} />
          <DatePicker id="new-po-delivery-date" label="PO Delivery Date" value={draft.etaDate}
            onChange={(etaDate) => setDraft((d) => ({ ...d, etaDate }))} />
        </div>
        {draft.lines.map((line, i) => (
          <div key={line.key} className="grid grid-cols-1 items-end gap-3 md:grid-cols-[minmax(0,1fr)_96px_128px_auto]">
            <Select id={`new-po-sku-${line.key}`} label={i === 0 ? "SKU" : undefined} required disabled={!draft.supplierId}
              placeholder={draft.supplierId ? "Select" : "Select a supplier first"}
              value={line.sku || undefined} onValueChange={(sku) => setLine(line.key, { sku })} options={skuOptions} />
            <Input id={`new-po-qty-${line.key}`} label={i === 0 ? "Qty" : undefined} type="number" min={1} step={1}
              value={line.qty} onChange={(e) => setLine(line.key, { qty: e.target.value })} />
            <Input id={`new-po-price-${line.key}`} label={i === 0 ? "Unit Price (RM)" : undefined} type="number" min={0.01} step="0.01"
              placeholder="Catalog" value={line.price} onChange={(e) => setLine(line.key, { price: e.target.value })} />
            <Button variant="ghost" disabled={draft.lines.length === 1}
              onClick={() => setDraft((d) => ({ ...d, lines: d.lines.filter((l) => l.key !== line.key) }))}>Remove</Button>
          </div>
        ))}
        <div><Button icon="add" disabled={!draft.supplierId}
          onClick={() => setDraft((d) => ({ ...d, lines: [...d.lines, blankLine()] }))}>Add item</Button></div>
        <Textarea id="new-po-note" label="Note" rows={2} maxLength={500} value={draft.note}
          onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))} />
        {problem && <p role="alert" className="text-body text-kit-red-11">{problem}</p>}
      </div>
    </Modal>
  );
}
