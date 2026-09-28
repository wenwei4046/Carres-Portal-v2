// design-standard: not-a-list-page — this is the CHILD of a register row, not
// a page. It has no destination, no toolbar and no header of its own; the
// register above it owns all three.
/**
 * ⭐ THE REPAIR ORDER EXPANSION — the read-only per-Unit inspector.
 * `docs/purchasing/MASTER.md` §9.7 (owner-confirmed 2026-09-20), exactly:
 *
 * ```
 * Category · PO No / Unit ID · Items · Qty · Problem · Evidence ·
 * Supplier Pickup Location · Collected By · Actual Pickup Date ·
 * Supplier Return Location · Goods Received Date
 * ```
 *
 * `Problem` and `Evidence` are SEPARATE columns (§9.7 does not adopt §9.5's
 * merged cell). One exact Unit per row at Qty 1. No editor, no uploader, no
 * delete, no status change. Geometry is PurchaseReturnUnitsTable's, copied:
 * 8px cells, 1px dividers, 11px/600 child headers, 13px values.
 */
import { useState } from "react";
import {
  REPAIR_ORDER_ABSENT,
  REPAIR_ORDER_UNIT_COLUMN_LABEL,
  REPAIR_ORDER_UNIT_COLUMN_ORDER,
  repairProblemLabel,
  type RepairOrderUnitRow,
} from "@carres/shared";
import SavedEvidenceViewer from "@/components/kit/SavedEvidenceViewer";
import Button from "@/components/kit/Button";
import { fetchRepairOrderEvidence, useRepairOrderEvidence } from "@/lib/queries";
import { fmtDate } from "@/lib/fmt-date";
import SecondLine from "./register-cell";

function Absence({ children = REPAIR_ORDER_ABSENT }: { children?: string }) {
  return <span className="text-kit-slate-11">{children}</span>;
}

const WIDTH: Record<(typeof REPAIR_ORDER_UNIT_COLUMN_ORDER)[number], number | null> = {
  category: 132,
  po_unit: 180,
  items: null,
  qty: 64,
  problem: 220,
  evidence: 150,
  pickup_location: 176,
  collected_by: 160,
  actual_pickup_date: 132,
  return_location: 176,
  goods_received_date: 148,
};
const MIN_WIDTH = REPAIR_ORDER_UNIT_COLUMN_ORDER.reduce((sum, key) => sum + (WIDTH[key] ?? 220), 0);

export default function RepairOrderUnitsTable({
  roId,
  units,
  pickupLocation,
  returnLocation,
  onRemove,
}: {
  roId: string;
  units: readonly RepairOrderUnitRow[];
  pickupLocation: string | null;
  returnLocation: string | null;
  /** Object page only, before Issue: take a Unit off the RO. The register's
   *  expansion never passes it — the inspector stays read-only (§9.7). */
  onRemove?: (unit: RepairOrderUnitRow) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const hasEvidence = units.some((u) => u.evidence.length > 0);
  const evidence = useRepairOrderEvidence(hasEvidence && open ? roId : null);

  return (
    <div className="overflow-x-auto">
      <table
        className="border-separate border-spacing-0 border border-kit-slate-5 bg-white text-body"
        style={{ minWidth: MIN_WIDTH }}
        data-testid="repair-order-units-table"
      >
        <thead>
          <tr>
            {REPAIR_ORDER_UNIT_COLUMN_ORDER.map((key) => (
              <th
                key={key}
                scope="col"
                style={WIDTH[key] ? { width: WIDTH[key]! } : undefined}
                className={`border-b border-kit-slate-5 px-2 py-1.5 align-bottom text-label font-semibold text-kit-slate-11 ${key === "qty" ? "text-right" : "text-left"}`}
              >
                {REPAIR_ORDER_UNIT_COLUMN_LABEL[key]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {units.map((unit) => {
            const photos = unit.evidence.filter((e) => e.kind === "photo").length;
            const videos = unit.evidence.filter((e) => e.kind === "video").length;
            return (
              <tr key={unit.stock_item_id}>
                <Cell>{unit.category ?? <Absence />}</Cell>
                <Cell>
                  <div className="break-words">{unit.po_no ?? <Absence />}</div>
                  <SecondLine>{unit.unit_id}</SecondLine>
                  {onRemove ? (
                    <Button variant="ghost" size="sm" onClick={() => onRemove(unit)}>Remove</Button>
                  ) : null}
                </Cell>
                <Cell>
                  <div className="break-words">{unit.item ?? <Absence />}</div>
                  {unit.item_spec ? <SecondLine>{unit.item_spec}</SecondLine> : null}
                </Cell>
                <Cell right>1</Cell>
                <Cell>
                  <div>{repairProblemLabel(unit.problem)}</div>
                  <SecondLine>{unit.problem_note}</SecondLine>
                </Cell>
                <Cell>
                  {/* A kind with zero files prints no control (§9.7). */}
                  <div className="flex flex-col items-start gap-1">
                    {photos > 0 ? (
                      <button
                        type="button"
                        aria-expanded={open === unit.stock_item_id}
                        onClick={() => setOpen(unit.stock_item_id)}
                        className="rounded-control text-meta text-kit-blue-11 hover:bg-hovertint focus-visible:outline focus-visible:outline-2 focus-visible:outline-kit-blue-9"
                      >
                        {`Photos ${photos}`}
                      </button>
                    ) : null}
                    {videos > 0 ? (
                      <button
                        type="button"
                        aria-expanded={open === unit.stock_item_id}
                        onClick={() => setOpen(unit.stock_item_id)}
                        className="rounded-control text-meta text-kit-blue-11 hover:bg-hovertint focus-visible:outline focus-visible:outline-2 focus-visible:outline-kit-blue-9"
                      >
                        {`Video ${videos}`}
                      </button>
                    ) : null}
                    {photos + videos === 0 ? <Absence /> : null}
                  </div>
                </Cell>
                <Cell>
                  <div>{pickupLocation ?? <Absence />}</div>
                  {unit.display ? <SecondLine>Display</SecondLine> : null}
                </Cell>
                <Cell>{unit.collected_by ?? <Absence />}</Cell>
                <Cell>{unit.actual_pickup_date ? fmtDate(unit.actual_pickup_date) : <Absence />}</Cell>
                <Cell>{returnLocation ?? <Absence />}</Cell>
                <Cell>{unit.goods_received_date ? fmtDate(unit.goods_received_date) : <Absence />}</Cell>
              </tr>
            );
          })}
        </tbody>
      </table>
      {evidence.isError ? (
        <div role="alert" className="flex items-center gap-2 px-2 py-2 text-body">
          <span>Evidence could not be loaded</span>
          <Button variant="neutral" onClick={() => void evidence.refetch()}>Try again</Button>
        </div>
      ) : null}
      <SavedEvidenceViewer
        activeId={evidence.data ? (evidence.data.files.find((f) => f.stock_item_id === open)?.path ?? null) : null}
        onClose={() => setOpen(null)}
        files={(evidence.data?.files ?? []).map((f) => ({
          id: f.path,
          kind: f.kind,
          url: f.url,
          context: `${f.unit_id} · Problem evidence`,
          unitCodes: [f.unit_id],
        }))}
        onRetry={async (id) => {
          const refreshed = await fetchRepairOrderEvidence(roId);
          return refreshed.files.find((f) => f.path === id)?.url ?? null;
        }}
      />
    </div>
  );
}

function Cell({ children, right = false }: { children: React.ReactNode; right?: boolean }) {
  return (
    <td className={`border-t border-kit-slate-5 px-2 py-2 align-top ${right ? "text-right tabular-nums" : ""}`}>{children}</td>
  );
}
