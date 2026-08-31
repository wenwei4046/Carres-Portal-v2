import type { ReceivingRegisterParent } from "@carres/shared";
import type { ReceivingSession } from "@/lib/queries";
import { fmtDateShort } from "@/lib/fmt-date";

function fact(value: string | null | undefined): string {
  return value && value.trim() ? value : "—";
}

function date(value: string | null | undefined): string {
  return value ? fmtDateShort(value.slice(0, 10)) : "—";
}

function authority(value: ReceivingSession["post_authority"]): string {
  if (value === "operations_superuser") return "Operations Superuser";
  if (value === "grn_duty_cover") return "GRN Duty cover";
  if (value === "grn_duty") return "GRN Duty";
  return "—";
}

export default function GrnPreview({
  parent,
  session,
}: {
  parent: ReceivingRegisterParent;
  session: ReceivingSession;
}) {
  const lines = session.lines ?? [];
  return (
    <article className="min-w-0 bg-white p-5 print:p-0" data-testid="grn-preview">
      <div className="border-b border-kit-slate-6 pb-4 text-center">
        <p className="text-label font-semibold tracking-[0.18em] text-kit-slate-9">CARRES</p>
        <h2 className="mt-1 text-page font-semibold text-kit-slate-12">GOODS RECEIPT NOTE</h2>
        <p className="mt-1 font-mono text-strong font-semibold text-kit-slate-12">{fact(session.grn_number)}</p>
      </div>

      <dl className="mt-4 grid grid-cols-[150px_minmax(0,1fr)] gap-x-3 gap-y-2 text-body">
        <dt className="text-kit-slate-9">Source</dt><dd className="font-mono">{parent.sourceNumber} · Rev {session.source_version ?? parent.sourceVersion}</dd>
        <dt className="text-kit-slate-9">Supplier</dt><dd>{parent.supplier}</dd>
        <dt className="text-kit-slate-9">Deliver To</dt><dd>{parent.deliverTo}</dd>
        <dt className="text-kit-slate-9">Supplier DO No.</dt><dd className="font-mono">{fact(session.do_number)}</dd>
        <dt className="text-kit-slate-9">Goods Received At</dt><dd>{date(session.goods_received_timestamp ?? session.goods_received_at)}</dd>
        <dt className="text-kit-slate-9">Posted At</dt><dd>{date(session.posted_at)}</dd>
      </dl>

      <div className="mt-5 overflow-x-auto">
        <table className="w-full border-collapse text-body">
          <thead><tr className="border-y border-kit-slate-6 text-left text-label text-kit-slate-9"><th className="py-2">Item</th><th>Received</th><th>Damaged</th><th>Wrong</th><th>Extra</th><th>Unit ID</th></tr></thead>
          <tbody>{lines.map((line, index) => (
            <tr key={line.poLineId ?? line.id ?? `${line.sku}-${index}`} className="border-b border-kit-slate-5">
              <td className="py-2">{line.sku}</td>
              <td>{line.receivedQty ?? line.received_now ?? 0}</td>
              <td>{line.damagedQty ?? line.damaged_qty ?? 0}</td>
              <td>{line.wrongItemQty ?? line.wrong_item_qty ?? 0}</td>
              <td>{line.extraQty ?? 0}</td>
              <td className="font-mono">{line.unitIds?.length ? line.unitIds.join(", ") : "—"}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>

      <dl className="mt-5 grid grid-cols-[150px_minmax(0,1fr)] gap-x-3 gap-y-2 text-body">
        <dt className="text-kit-slate-9">Actual actor</dt><dd>{fact(session.posted_by_name)}</dd>
        <dt className="text-kit-slate-9">Normal GRN Duty</dt><dd>{fact(session.normal_grn_duty_name)}</dd>
        <dt className="text-kit-slate-9">Dated cover</dt><dd>{fact(session.grn_cover_name)}</dd>
        <dt className="text-kit-slate-9">Authority used</dt><dd>{authority(session.post_authority)}</dd>
      </dl>
    </article>
  );
}
