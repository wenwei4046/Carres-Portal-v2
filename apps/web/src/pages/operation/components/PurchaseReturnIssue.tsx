// design-standard: not-a-list-page — the Issue Purchase Return FORM beside its paper.
/**
 * ⭐ ISSUE PURCHASE RETURN — Purchasing MASTER §9.6 "CREATION DOOR —
 * OWNER-APPROVED (Jess, 2026-09-25)". Opened from the claim record's Result
 * section once `Return to supplier` is recorded.
 *
 * ```
 * Issue Purchase Return                                   | [ PR paper, DRAFT ]
 * Units to return   ☐ U1-000-001   (refused Units say why) |
 * Pickup Location   per ticked Unit, from its Stock Location|
 * Return To         Supplier Master's return address (grey) |
 * Confirmed Pickup  optional                                |
 *                               [Cancel] [Issue Purchase Return]
 * ```
 *
 * ≥1180 form and PDF side by side (50/50); below that stacked, PDF below;
 * at 390 one Unit tick per row and 40px bottom actions. Issue writes the PR
 * and its Units through the ONE door and moves no stock. A Unit changed under
 * the form is refused by name — `No return was issued.`
 */
import { useMemo, useState } from "react";
import {
  PURCHASE_RETURN_TO_FROM_WORD,
  ISSUE_PURCHASE_RETURN,
  ISSUE_CONSIGNMENT_RETURN,
  purchaseReturnIssueMissing,
  type PurchaseReturnIssueSource,
  type PurchaseReturnPrintData,
} from "@carres/shared";
import { ApiError } from "@/lib/api";
import { useConsignmentReturnSource, useOperationSuppliers, usePurchaseReturnIssueSource, usePurchaseReturnWrite } from "@/lib/queries";
import { usePurchaseReturnPdfUrl } from "@/lib/pdf/purchase-return-pdf";
import { appTodayIso } from "@/lib/fmt-date";
import Block from "@/components/kit/Block";
import Button from "@/components/kit/Button";
import Checkbox from "@/components/kit/Checkbox";
import DatePicker from "@/components/kit/DatePicker";
import EmptyState from "@/components/kit/EmptyState";
import Input from "@/components/kit/Input";
import Select from "@/components/kit/Select";
import PdfPreview from "@/components/kit/PdfPreview";
import { Fact } from "../SalesOrderWorkspace";

const PDF_LOADING = "Loading…";
const PDF_FAILED = "Some information could not be refreshed.";

export function purchaseReturnDraftPrint(
  source: PurchaseReturnIssueSource,
  picked: readonly string[],
  pickup: Readonly<Record<string, string>>,
  confirmed: string | null,
): PurchaseReturnPrintData {
  const byId = new Map(source.units.map((u) => [u.stock_item_id, u]));
  return {
    pr_no: null,
    is_consignment: source.claim_id === null ? true : undefined,
    pr_doc_date: new Date().toISOString(),
    supplier: { name: source.supplier_name ?? "", contact: null },
    return_to: source.return_to,
    claim_no: source.claim_no,
    grn_no: source.grn_no,
    confirmed_pickup_date: confirmed,
    issued_by: null,
    units: picked.flatMap((id) => {
      const u = byId.get(id);
      return u ? [{ unit_id: u.unit_code, po_no: u.po_no, category: u.category, item: u.item, item_spec: u.item_spec, pickup_location: (pickup[id] ?? u.pickup_location ?? "").trim() || null }] : [];
    }),
  };
}

/** `claimId` — issued from a claim. `supplierId` with no claim — `New Purchase
 *  Return`, Weisiang's decision (Mr Lim, WhatsApp 2026-10-22), overturning
 *  Jess's "only after an approved claim"; Jess was not part of it. */
export default function PurchaseReturnIssue({ claimId = null, supplierId = null, onClose, onIssued }: { claimId?: string | null; supplierId?: string | null; onClose: () => void; onIssued: (id: string) => void }) {
  const read = usePurchaseReturnIssueSource(claimId, supplierId);
  if (read.isError) {
    return <div role="alert"><EmptyState title="Some information could not be refreshed." action={<Button variant="neutral" onClick={() => void read.refetch()}>Try again</Button>} /></div>;
  }
  if (read.isLoading || !read.data) return <EmptyState title="Loading…" />;
  return <IssueForm source={read.data.source} onClose={onClose} onIssued={onIssued} />;
}

/** ⭐ NEW CONSIGNMENT RETURN (0706 §2) — straight from the supplier's consigned
 *  stock, no Supplier Claim. Follows Houzs
 *  frontend/src/pages/scm-v2/PurchaseConsignmentReturnNew.tsx:12-15 and
 *  PurchaseConsignmentReturnFromReceive.tsx (pick a supplier, tick its lines)
 *  per Weisiang's ruling (2026-10-22): clear Carres rules, implement Houzs. */
export function ConsignmentReturnIssue({ onClose, onIssued }: { onClose: () => void; onIssued: (id: string) => void }) {
  const [supplierId, setSupplierId] = useState<string | undefined>(undefined);
  const suppliers = useOperationSuppliers();
  const read = useConsignmentReturnSource(supplierId ?? null);
  return <div className="flex min-h-0 flex-1 flex-col gap-3" data-testid="consignment-return-new">
    <div className="max-w-[360px]">
      <Select id="crtn-supplier" label="Supplier" value={supplierId} onValueChange={setSupplierId}
        options={(suppliers.data?.suppliers ?? []).map((s) => ({ value: s.id, label: s.name }))} />
    </div>
    {!supplierId ? <div className="flex justify-end"><Button variant="neutral" onClick={onClose}>Cancel</Button></div>
      : read.isError ? <div role="alert"><EmptyState title="Some information could not be refreshed." action={<Button variant="neutral" onClick={() => void read.refetch()}>Try again</Button>} /></div>
      : read.isLoading || !read.data ? <EmptyState title="Loading…" />
      : <IssueForm key={supplierId} source={read.data.source} onClose={onClose} onIssued={onIssued} />}
  </div>;
}

export function IssueForm({ source, onClose, onIssued }: { source: PurchaseReturnIssueSource; onClose: () => void; onIssued: (id: string) => void }) {
  const eligible = source.units.filter((u) => !u.refusal);
  const [picked, setPicked] = useState<string[]>(() => eligible.map((u) => u.stock_item_id));
  const [pickup, setPickup] = useState<Record<string, string>>({});
  const [confirmed, setConfirmed] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const claimless = source.claim_id === null;
  const door = usePurchaseReturnWrite<{ id: string }>(claimless ? "/api/operation/purchase-returns/consignment" : "/api/operation/purchase-returns");
  const title = claimless ? ISSUE_CONSIGNMENT_RETURN : ISSUE_PURCHASE_RETURN;
  const missing = purchaseReturnIssueMissing(source, picked);
  const supplier = source.supplier_name ?? "the supplier";

  const draft = useMemo(() => purchaseReturnDraftPrint(source, picked, pickup, confirmed), [source, picked, pickup, confirmed]);
  const key = JSON.stringify(draft.units) + (draft.confirmed_pickup_date ?? "") + (draft.return_to ?? "");
  const pdf = usePurchaseReturnPdfUrl(key, async () => draft);

  const issue = () => {
    setTried(true);
    if (missing.length) return;
    const byId = new Map(source.units.map((u) => [u.stock_item_id, u]));
    door.mutate({
      ...(claimless ? { supplier_id: source.supplier_id } : { claim_id: source.claim_id }),
      units: picked.map((id) => ({ stock_item_id: id, seen: byId.get(id)?.seen ?? "", pickup_location: (pickup[id] ?? byId.get(id)?.pickup_location ?? "").trim() || null })),
      confirmed_pickup_date: confirmed,
    }, { onSuccess: (out) => onIssued(out.id) });
  };
  const refusal = door.error instanceof ApiError ? door.error.message : door.error ? "Not saved · Try again" : null;

  return <div className="flex min-h-0 flex-1 flex-col gap-4 min-[1180px]:flex-row" data-testid="purchase-return-issue">
    <div className="flex min-w-0 flex-col gap-3 min-[1180px]:w-1/2" data-testid="purchase-return-issue-form">
      <p className="text-meta text-kit-slate-11">{source.claim_no ?? (claimless ? supplier : "Supplier Claim")}</p>
      <h1 className="text-page text-kit-slate-12">{title}</h1>
      {refusal ? <p role="alert" className="rounded-control border border-kit-red-9 bg-kit-red-3 px-3 py-2 text-body text-kit-red-11" data-testid="purchase-return-issue-refusal">{refusal}</p> : null}
      <Block title="Units to return">
        <div className="grid gap-1" data-testid="purchase-return-units">
          {source.units.length === 0 ? <p className="text-body text-kit-slate-11">{consignmentReturn ? `No consigned Units from ${supplier}.` : claimless ? "No Units of this supplier in stock." : "No tracked Units on this claim."}</p> : null}
          {source.units.map((u) => <div key={u.stock_item_id} className="flex min-h-[40px] flex-col justify-center border-b border-kit-slate-4 py-1 last:border-b-0">
            <Checkbox id={`pr-unit-${u.stock_item_id}`} label={u.unit_code} disabled={Boolean(u.refusal)}
              checked={picked.includes(u.stock_item_id)}
              onCheckedChange={(on) => setPicked((prev) => (on === true ? [...prev, u.stock_item_id] : prev.filter((x) => x !== u.stock_item_id)))} />
            <p className="pl-7 text-meta text-kit-slate-11">{u.refusal ?? ([u.item, u.item_spec].filter(Boolean).join(" · ") || u.po_no || "Not recorded")}</p>
          </div>)}
        </div>
      </Block>
      <Block title="Pickup Location">
        <div className="grid gap-3">
          {picked.length === 0 ? <p className="text-body text-kit-slate-11">Tick the Units to return.</p> : null}
          {picked.map((id) => {
            const u = source.units.find((x) => x.stock_item_id === id);
            if (!u) return null;
            return <Input key={id} id={`pr-pickup-${id}`} label={u.unit_code} value={pickup[id] ?? u.pickup_location ?? ""}
              onChange={(e) => setPickup((prev) => ({ ...prev, [id]: e.target.value }))} />;
          })}
          <p className="text-meta text-kit-slate-11">Editing the Pickup Location moves nothing.</p>
        </div>
      </Block>
      <Block title="Return To">
        {source.return_to
          ? <div data-testid="purchase-return-return-to"><Fact idPrefix="pr-issue" own={false} framed automatic label="Return To" value={<>
              <span className="whitespace-pre-wrap">{source.return_to}</span>
              {source.return_to_from && <span className="block text-meta text-kit-slate-11">{PURCHASE_RETURN_TO_FROM_WORD[source.return_to_from]}</span>}
            </>} /></div>
          : <p className="text-body text-kit-red-11" data-testid="purchase-return-no-address">{`Add the address of ${supplier}`}</p>}
      </Block>
      <Block title="Confirmed Pickup">
        <DatePicker id="pr-confirmed-pickup" label="Confirmed Pickup" value={confirmed} onChange={setConfirmed} minDate={appTodayIso()} />
      </Block>
      {tried && missing.length > 0 ? <ul className="text-body text-kit-red-11" data-testid="purchase-return-missing">{missing.map((m) => <li key={m}>{m}</li>)}</ul> : null}
      <div className="sticky bottom-0 flex justify-end gap-2 bg-background py-2 [&_button]:min-h-[40px] min-[1180px]:static min-[1180px]:[&_button]:min-h-0">
        <Button variant="neutral" onClick={onClose} disabled={door.isPending}>Cancel</Button>
        <Button variant="primary" loading={door.isPending} onClick={issue} data-testid="purchase-return-issue-save">{title}</Button>
      </div>
    </div>
    <div className="flex min-h-[640px] min-w-0 flex-col min-[1180px]:w-1/2" data-testid="purchase-return-issue-preview">
      {pdf.url ? <PdfPreview src={pdf.url} title="Purchase Return" data-testid="purchase-return-issue-pdf" />
        : <p className="text-body text-kit-slate-11" role="status">{pdf.failed ? PDF_FAILED : PDF_LOADING}</p>}
    </div>
  </div>;
}
