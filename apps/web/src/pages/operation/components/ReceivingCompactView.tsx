/** Receiving adapter for the shared module card. Full GRN owns edits and PDF. */
import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { documentDisplayNumber, receivingDisplayNo, receivingExtraQty, warehouseReceiptTotals } from "@carres/shared";
import CompactModuleCard from "@/components/kit/CompactModuleCard";
import Panel from "@/components/kit/Panel";
import Button from "@/components/kit/Button";
import SavedEvidenceViewer from "@/components/kit/SavedEvidenceViewer";
import { fetchReceivingSessionDetail, useReceivingSessionDetail, type WarehouseReceiptQueueRow } from "@/lib/queries";
import { fmtDate } from "@/lib/fmt-date";

import { receivingEventLabel } from "./receiving-event-label";

export default function ReceivingCompactView({ row, items, onOpen, onClose }: {
  row: WarehouseReceiptQueueRow; items: (receipt: WarehouseReceiptQueueRow) => ReactNode; onOpen: () => void; onClose: () => void;
}) {
  const query = useReceivingSessionDetail(row.id);
  const detail = query.data?.receipt.id === row.id ? query.data : undefined;
  const receipt: WarehouseReceiptQueueRow = detail ? { ...row, ...detail.receipt,
    unit_ids_by_line: detail.receipt.unit_results.some(unit => !unit.po_line_id) ? null :
      detail.receipt.unit_results.reduce<Record<string, string[]>>((lines, unit) => {
        (lines[unit.po_line_id!] ??= []).push(unit.unit_code); return lines;
      }, {}),
  } : row;
  const totals = warehouseReceiptTotals(receipt.lines);
  const number = receivingDisplayNo(receipt);
  const [evidenceId, setEvidenceId] = useState<string | null>(null);
  const evidence = detail?.receipt.arrival_evidence ?? [];
  const unavailable = query.isError ? "Unavailable" : "Loading…";
  const details = <div className="flex flex-col gap-3">
    <dl className="grid grid-cols-2 gap-3 text-body">
      {[
        ["Supplier DO No", receipt.do_number || "Not recorded"],
        ["Goods arrived at", receipt.actual_site_name || receipt.warehouse_name || "Not recorded"],
        ["Goods Received Date", receipt.goods_received_time ? fmtDate(receipt.goods_received_time, { time: true }) : receipt.goods_received_at ? `${fmtDate(receipt.goods_received_at)} · Time not recorded` : "Not recorded"],
        ["Received by", receipt.received_by_name || (detail ? "Not recorded" : unavailable)],
      ].map(([label, value]) => <div key={label}><dt className="text-kit-slate-11">{label}</dt><dd className="break-words text-kit-slate-12">{value}</dd></div>)}
    </dl>
    <Panel title="Evidence">
      {!detail ? <div role="status">{unavailable}{query.isError && <Button onClick={() => void query.refetch()}>Try again</Button>}</div> :
        <div className="flex flex-wrap items-center gap-2">
          {receipt.do_file_url ? <a href={receipt.do_file_url} target="_blank" rel="noopener noreferrer" className="text-kit-blue-9 underline">Supplier DO</a> : <span className="text-body">{receipt.do_file_path ? "Evidence could not be loaded" : "Supplier DO · Not recorded"}</span>}
          {evidence.map((file, index) => <Button key={file.path} onClick={() => setEvidenceId(file.path)}>{file.kind === "video" ? "Video" : "Photo"} {index + 1}</Button>)}
        </div>}
    </Panel>
    <Panel title="Related records">
      <div className="flex flex-col gap-2 text-body">
        {receipt.po_id && <Link className="text-kit-blue-9 underline" to={`/operation/procurement?po=${encodeURIComponent(receipt.po_id)}`}>{documentDisplayNumber(receipt.po_id)}</Link>}
        {(row.source_refs ?? []).map(ref => <span key={ref}>{documentDisplayNumber(ref)}</span>)}
        <Button onClick={onOpen}>Open full page</Button>
      </div>
    </Panel>
  </div>;
  return <div data-testid="receiving-quick-view">
    <CompactModuleCard key={row.id} name={receipt.supplier_name || receipt.source_party_name || (detail ? "Not recorded" : unavailable)}
      reference={number} referenceStatus={receipt.status === "voided" ? "Cancelled" : undefined} openLabel="Open full page" onOpen={onOpen} onClose={onClose}
      initialModule="receipt" modulesLabel="Receiving" modules={[{
        key: "receipt", label: "Receiving", detailsLabel: "Receipt details", items: items(receipt), details,
        summary: [
          { key: "received", label: "Received Qty", value: String(totals.received) },
          { key: "damaged", label: "Damaged Qty", value: String(totals.damaged) },
          { key: "wrong", label: "Wrong Item Qty", value: String(totals.wrongItem) },
          { key: "extra", label: "Extra Qty", value: String(receivingExtraQty(receipt.extra_lines ?? [])) },
        ],
      }]}
      timelineStatus={!detail ? unavailable : undefined}
      timeline={(detail?.events ?? []).map(event => ({
        id: event.id, actorName: event.actor_name || "Staff identity not recorded",
        actorInitial: (event.actor_name || "?").slice(0, 1),
        summary: receivingEventLabel(event.event), at: event.event_at,
        result: event.payload.reason || (event.payload.grn_no ? documentDisplayNumber(event.payload.grn_no) : undefined),
      }))} />
    <SavedEvidenceViewer activeId={evidenceId} onClose={() => setEvidenceId(null)}
      files={evidence.map(file => ({ id: file.path, kind: file.kind,
        url: receipt.arrival_evidence_files?.find(saved => saved.path === file.path)?.url ?? null,
        context: `${number} · Arrival evidence` }))}
      onRetry={async id => {
        const fresh = await fetchReceivingSessionDetail(row.id);
        return fresh.receipt.arrival_evidence_files?.find(file => file.path === id)?.url ?? null;
      }} />
  </div>;
}
