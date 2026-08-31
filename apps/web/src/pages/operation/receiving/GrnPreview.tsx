import type { ReceivingSession } from "@/lib/queries";
import { fmtDateShort } from "@/lib/fmt-date";

// design-standard: not-a-list-page — embedded immutable official document preview.

function fact(value: string | null | undefined): string {
  return value && value.trim() ? value : "—";
}

function date(value: string | null | undefined): string {
  return value ? fmtDateShort(value.slice(0, 10)) : "—";
}

function authority(value: NonNullable<ReceivingSession["grn_snapshot"]>["postAuthority"]): string {
  if (value === "operations_superuser") return "Operations Superuser";
  if (value === "grn_duty_cover") return "GRN Duty cover";
  if (value === "grn_duty") return "GRN Duty";
  return "—";
}

export default function GrnPreview({
  session,
}: {
  session: ReceivingSession;
}) {
  const snapshot = session.grn_snapshot;
  if (!snapshot) {
    return (
      <article className="min-w-0 bg-white p-5 print:p-0" data-testid="grn-preview">
        <p className="text-body font-medium text-kit-red-11">Official GRN snapshot unavailable</p>
        <p className="mt-1 text-meta text-kit-slate-9">Do not print or reprint this document until its stored evidence is restored.</p>
      </article>
    );
  }
  const lines = snapshot.lines ?? [];
  const sourceLines = new Map((snapshot.sourceSnapshot.lines ?? []).map((line) => [line.poLineId, line]));
  const outcomes = new Map<string, string>();
  for (const unit of snapshot.unitOutcomes ?? []) outcomes.set(unit.unitId, unit.outcome);
  return (
    <article className="min-w-0 bg-white p-5 print:p-0" data-testid="grn-preview">
      <div className="border-b border-kit-slate-6 pb-4 text-center">
        <p className="text-label font-semibold tracking-[0.18em] text-kit-slate-9">CARRES</p>
        <h2 className="mt-1 text-page font-semibold text-kit-slate-12">GOODS RECEIPT NOTE</h2>
        <p className="mt-1 font-mono text-strong font-semibold text-kit-slate-12">{fact(snapshot.grnNumber)}</p>
      </div>

      <dl className="mt-4 grid grid-cols-[150px_minmax(0,1fr)] gap-x-3 gap-y-2 text-body">
        <dt className="text-kit-slate-9">Source</dt><dd className="font-mono">{snapshot.sourceSnapshot.sourceId} · Rev {snapshot.sourceSnapshot.sourceVersion}</dd>
        <dt className="text-kit-slate-9">Supplier</dt><dd>{fact(snapshot.supplierSnapshot.name)}</dd>
        <dt className="text-kit-slate-9">Deliver To</dt><dd>{fact(snapshot.destinationSnapshot.name)}</dd>
        <dt className="text-kit-slate-9">PO Issued</dt><dd>{date(snapshot.sourceSnapshot.poIssuedAt)}</dd>
        <dt className="text-kit-slate-9">PO Delivery Date</dt><dd>{date(snapshot.sourceSnapshot.poDeliveryDate)}</dd>
        <dt className="text-kit-slate-9">Supplier Delivery Date</dt><dd>{date(snapshot.supplierDeliveryDate)}</dd>
        <dt className="text-kit-slate-9">Supplier DO No.</dt><dd className="font-mono">{fact(snapshot.supplierDoNo)}</dd>
        <dt className="text-kit-slate-9">Goods Received At</dt><dd>{date(snapshot.goodsReceivedAt)}</dd>
        <dt className="text-kit-slate-9">Posted At</dt><dd>{date(snapshot.postedAt)}</dd>
      </dl>

      <div className="mt-5 overflow-x-auto">
        <table className="w-full border-collapse text-body">
          <thead><tr className="border-y border-kit-slate-6 text-left text-label text-kit-slate-9"><th className="py-2">Item</th><th>Order Qty</th><th>Received Qty</th><th>Damaged Qty</th><th>Wrong Item Qty</th><th>Extra Qty</th><th>Pending Delivery Qty</th><th>Unit ID / outcome</th><th>Evidence</th></tr></thead>
          <tbody>{lines.map((line, index) => {
            const source = sourceLines.get(line.poLineId ?? "");
            const received = line.receivedQty ?? line.received_now ?? 0;
            const damaged = line.damagedQty ?? line.damaged_qty ?? 0;
            const wrong = line.wrongItemQty ?? line.wrong_item_qty ?? 0;
            const extra = line.extraQty ?? 0;
            const evidence = [
              ...(line.damagedPhotos ?? []),
              ...(line.wrongItemPhotos ?? []),
              ...(line.extraEvidence ?? []),
              ...(line.wrongItemReason ? [line.wrongItemReason] : []),
            ];
            return (
            <tr key={line.poLineId ?? line.id ?? `${line.sku}-${index}`} className="border-b border-kit-slate-5">
              <td className="py-2">{line.sku}</td>
              <td>{source?.orderQty ?? "—"}</td>
              <td>{received}</td>
              <td>{damaged}</td>
              <td>{wrong}</td>
              <td>{extra}</td>
              <td>{source ? Math.max(0, source.orderQty - source.receivedQtyAtOpen - received) : "—"}</td>
              <td className="font-mono">{line.unitIds?.length ? line.unitIds.map((id) => `${id} (${outcomes.get(id) ?? "recorded"})`).join(", ") : "—"}</td>
              <td>{evidence.length ? evidence.join(", ") : "—"}</td>
            </tr>
          );})}</tbody>
        </table>
      </div>

      <dl className="mt-5 grid grid-cols-[150px_minmax(0,1fr)] gap-x-3 gap-y-2 text-body">
        <dt className="text-kit-slate-9">Actual actor</dt><dd>{fact(snapshot.actualActor?.name)}</dd>
        <dt className="text-kit-slate-9">Normal GRN Duty</dt><dd>{fact(snapshot.normalGrnDuty?.name)}</dd>
        <dt className="text-kit-slate-9">Dated cover</dt><dd>{fact(snapshot.datedCover?.name)}</dd>
        <dt className="text-kit-slate-9">Authority used</dt><dd>{authority(snapshot.postAuthority)}</dd>
      </dl>
    </article>
  );
}
