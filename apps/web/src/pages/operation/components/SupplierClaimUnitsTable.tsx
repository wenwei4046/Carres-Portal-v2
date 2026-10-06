// design-standard: not-a-list-page — this is the CHILD of a register row, not
// a page. It has no destination, no toolbar and no header of its own; the
// Supplier Claims register above it owns all three.
/**
 * ⭐ THE SUPPLIER CLAIM ROW EXPANSION — the per-Unit evidence inspector.
 *
 * `docs/purchasing/MASTER.md` §9.5 "Row expansion" (owner-confirmed
 * 2026-09-18). ONE job, read-only: no editor, no uploader, no delete, no
 * status change.
 *
 * ```
 * PO No (Unit ID on line two) │ Items │ Qty │ Problem & Evidence │ Supplier Response
 * ```
 *
 * One row per held tracked Unit, Qty 1, with its OWN problem note and only the
 * files that name it (0614). Counted stock keeps its genuine quantity on one
 * row. A file that names no Unit of this claim — every photo stored before 0614
 * — stays on one `Whole claim` row; it is never spread across Units. The row
 * arithmetic is the shared `supplierClaimInspectionRows`; this file only draws.
 *
 * Geometry copies the sibling child table (`PurchaseReturnUnitsTable`): 8px
 * cell padding, 1px dividers, 11px/600 normal-case headers, 13px values, an
 * 11px slate-11 second line. Evidence controls are icon + text at the 12px
 * helper size — never a Button, pill, border or filled background.
 */
import { Fragment, useState, type ReactNode } from "react";
import { Camera, Video } from "lucide-react";
import {
  SUPPLIER_CLAIM_ABSENT,
  SUPPLIER_CLAIM_UNIT_COLUMN_LABELS,
  supplierClaimEvidenceControls,
  supplierClaimInspectionRows,
  supplierClaimUnitLine,
  type SupplierClaimInspectionRow,
} from "@carres/shared";
import { fetchSupplierClaimInspection, useSupplierClaimInspection, type SupplierClaimListRow } from "@/lib/queries";
import { fmtDate } from "@/lib/fmt-date";
import Button from "@/components/kit/Button";
import SavedEvidenceViewer from "@/components/kit/SavedEvidenceViewer";
import SecondLine from "./register-cell";

/** Measured content widths, each the SAME field's width on the sibling child
 *  table: PO No / Unit ID 180 · Items 240 · Qty 64 · Problem & Evidence 320 ·
 *  Supplier Response 176. Fixed, so a wide register never stretches Items. */
const WIDTHS = [180, 240, 64, 320, 176] as const;
const TABLE_WIDTH = WIDTHS.reduce<number>((sum, w) => sum + w, 0);

export default function SupplierClaimUnitsTable({ claim }: { claim: SupplierClaimListRow }) {
  const inspection = useSupplierClaimInspection(claim.id);
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const [viewing, setViewing] = useState<{ row: SupplierClaimInspectionRow; kind: "photo" | "video"; id: string } | null>(null);

  if (claim.units == null) {
    return <p className="px-2 py-2 text-body text-kit-slate-11" data-testid="claim-inspector">Units could not be loaded</p>;
  }
  const known = inspection.data != null;
  const rows = supplierClaimInspectionRows(claim, inspection.data ?? { files: [], problems: [] });
  const items = claim.product_description
    ? <><div className="break-words">{claim.product_description}</div>{claim.product_variant ? <SecondLine>{claim.product_variant}</SecondLine> : null}</>
    : <><div className="break-words">{claim.sku}</div><SecondLine>Recorded SKU</SecondLine></>;
  const toggle = (key: string) => setOpen((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  return <div tabIndex={-1} data-claim-units={claim.id} className="flex flex-col gap-2 overflow-x-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-kit-blue-9" data-testid="claim-inspector">
    {inspection.isError && <div role="alert" className="flex flex-wrap items-center gap-2 px-2 text-body text-kit-slate-12">
      <span>Evidence could not be loaded</span>
      <Button variant="neutral" onClick={() => void inspection.refetch()}>Try again</Button>
    </div>}
    {rows.length === 0
      ? <p className="px-2 py-2 text-body text-kit-slate-11">{supplierClaimUnitLine(claim.units)}</p>
      : <table className="table-fixed border-separate border-spacing-0 border border-kit-slate-5 bg-white text-body" style={{ width: TABLE_WIDTH }}>
        <thead>
          <tr>
            {SUPPLIER_CLAIM_UNIT_COLUMN_LABELS.map((label, i) => <th key={label} scope="col" style={{ width: WIDTHS[i] }}
              className={`border-b border-kit-slate-5 px-2 py-1.5 align-bottom text-label font-semibold text-kit-slate-11 ${i === 2 ? "text-right" : "text-left"}`}>{label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const controls = supplierClaimEvidenceControls(row.files);
            const expanded = open.has(row.key);
            return <Fragment key={row.key}>
              <tr data-testid={`claim-unit-row-${row.key}`}>
                <Cell>
                  <div className="break-words">{claim.po_id || SUPPLIER_CLAIM_ABSENT}</div>
                  <SecondLine>{row.unitLine}</SecondLine>
                </Cell>
                <Cell>{items}</Cell>
                <Cell align="right">{row.qty}</Cell>
                <Cell>
                  <div>{row.problem}</div>
                  {row.note && <div className="whitespace-pre-wrap break-words text-kit-slate-11">{row.note}</div>}
                  {inspection.isLoading ? <p className="text-meta text-kit-slate-11">Loading…</p>
                    : known && controls.length > 0 && <div className="mt-0.5 flex flex-wrap gap-x-3">
                      {controls.map((c) => <button key={c.kind} type="button" aria-expanded={expanded} onClick={() => toggle(row.key)}
                        className="inline-flex items-center gap-1 rounded-control text-meta text-kit-blue-11 hover:bg-kit-slate-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-kit-blue-9">
                        {c.kind === "photo" ? <Camera size={14} strokeWidth={1.75} aria-hidden /> : <Video size={14} strokeWidth={1.75} aria-hidden />}
                        <span>{c.label}</span>
                      </button>)}
                    </div>}
                </Cell>
                <Cell>
                  <div>{row.response}</div>
                  {row.responseLine && <SecondLine>{row.responseLine}</SecondLine>}
                </Cell>
              </tr>
              {expanded && <tr data-testid={`claim-unit-evidence-${row.key}`}>
                <td colSpan={5} className="border-b border-kit-slate-5 bg-kit-slate-2 px-2 py-2">
                  <div className="flex flex-wrap gap-3">
                    {(["photo", "video"] as const).flatMap((kind) => row.files.filter((f) => f.kind === kind).map((file, index) =>
                      <button key={file.path} type="button" onClick={() => setViewing({ row, kind, id: file.path })}
                        className="inline-flex flex-col items-start rounded-control text-left text-meta text-kit-blue-11 hover:bg-kit-slate-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-kit-blue-9">
                        <span>{`${kind === "photo" ? "Photo" : "Video"} ${index + 1}`}</span>
                        {file.at && <span className="text-label font-normal text-kit-slate-11">{fmtDate(file.at)}</span>}
                      </button>))}
                  </div>
                </td>
              </tr>}
            </Fragment>;
          })}
        </tbody>
      </table>}
    <SavedEvidenceViewer activeId={viewing?.id ?? null} onClose={() => setViewing(null)}
      // One kind at a time, so the viewer's `Photo {n}` / `Video {n}` is the
      // same number the control printed.
      files={(viewing?.row.files ?? []).filter((file) => file.kind === viewing?.kind).map((file) => ({
        id: file.path, kind: file.kind, url: file.url,
        context: `${claim.claim_no} · ${viewing!.row.unitLine} · Problem evidence${file.at ? ` · ${fmtDate(file.at)}` : ""}`,
        ...(viewing!.row.scope === "unit" ? { unitCodes: [viewing!.row.unitLine] } : {}),
      }))}
      onRetry={async (id) => (await fetchSupplierClaimInspection(claim.id)).files.find((f) => f.path === id)?.url ?? null} />
  </div>;
}

function Cell({ children, align = "left" }: { children: ReactNode; align?: "left" | "right" }) {
  return <td className={`border-b border-kit-slate-5 px-2 py-2 align-top ${align === "right" ? "text-right tabular-nums" : ""}`}>{children}</td>;
}
