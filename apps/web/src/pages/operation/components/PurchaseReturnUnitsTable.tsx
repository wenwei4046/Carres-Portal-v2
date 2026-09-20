// design-standard: not-a-list-page — this is the CHILD of a register row, not
// a page. It has no destination, no toolbar and no header of its own; the
// register above it owns all three.
/**
 * ⭐ THE PURCHASE RETURN EXPANSION — one row per tracked Unit.
 *
 * `docs/purchasing/MASTER.md` §9.6 (Jess, 2026-09-18):
 *
 * ```
 * Category │ PO No / Unit ID │ Items │ Qty │ Pickup Location │ Return To │
 * Collected By │ Actual Pickup Date │ Supplier Received Date │ Evidence
 * ```
 *
 * ── WHY THIS IS ITS OWN TABLE AND NOT `GoodsMiniTable` ──────────────────────
 * `GoodsMiniTable` answers "what goods does this order cover" — category, Unit,
 * deliver-to, SKU, qty, item. This answers a different question: "where is this
 * exact Unit in its return journey, and what can we prove". Six of these ten
 * columns do not exist there and three of its six do not exist here, so
 * passing a third layout flag through that file would put two unrelated tables
 * in one body — the drift UI MASTER §6.8's one-implementation rule exists to
 * stop. What IS shared is the GEOMETRY, and it is copied rather than
 * approximated: 8px cell padding, 1px dividers, 11px/600 normal-case headers,
 * 13px values, an 11px slate-11 second line, measured content widths.
 *
 * ── QTY IS A CONSTANT, AND THAT IS THE POINT ────────────────────────────────
 * §9.6: "One tracked Unit per expanded row, Qty 1; never combine two physical
 * Units into one evidence row." So `Qty` prints the constant and the row shape
 * carries no quantity field at all — a field would be the door through which
 * two Units eventually share one row, and one shared row means one set of
 * pickup photos standing for two pieces of furniture nobody can tell apart.
 */
import { Fragment, useState, type ReactNode } from "react";
import { Camera, ChevronDown, ChevronRight, Video } from "lucide-react";
import {
  PURCHASE_RETURN_ABSENT,
  PURCHASE_RETURN_EVIDENCE_PURPOSES,
  PURCHASE_RETURN_UNIT_COLUMN_LABEL,
  PURCHASE_RETURN_UNIT_QTY,
  purchaseReturnPhotoAction,
  purchaseReturnVideoAction,
  type PurchaseReturnEvidenceCount,
  type PurchaseReturnUnitRow,
} from "@carres/shared";
import { fmtDate } from "@/lib/fmt-date";
import SecondLine from "./register-cell";

/** `Absence` is a FACT, not an apology — `docs/COPY-STANDARD.md`. */
function Absence({ children = PURCHASE_RETURN_ABSENT }: { children?: string }) {
  return <span className="text-kit-slate-11">{children}</span>;
}

/**
 * Measured content widths, and every one of them is the SAME FIELD'S width
 * elsewhere (UI MASTER §6.8: "Same field/role shares its default width";
 * §9.6: "Use the shared field-width registry and kit geometry, not
 * page-specific width standards").
 *
 * ```
 *   Category                `Mattress protector`  → 132   (GoodsMiniTable's)
 *   PO No / Unit ID         two full identifiers  → 180   (the register's)
 *   Items                   the flexible remainder→ flex
 *   Qty                     header floor          →  64   (GoodsMiniTable's)
 *   Pickup Location         a real site name      → 176
 *   Return To               a factory address     → 200
 *   Collected By            a person's full name  → 160
 *   Actual Pickup Date      a cross-year date     → 132
 *   Supplier Received Date  its two-line header   → 148
 *   Evidence                three compact entries → 210
 * ```
 *
 * `Items` is the ONLY flexible column and it is deliberately NOT last: §9.6
 * fixes `Evidence` last. A flexible column in the middle normally moves every
 * column after it, which is why `GoodsMiniTable` forbids one — here the
 * columns after it are fixed and the table sets its own minimum width, so the
 * flex absorbs spare canvas without shifting the fixed block's internal
 * alignment.
 */
const UNIT_COLUMNS = [
  { key: "category", width: 132 },
  { key: "po_unit", width: 180 },
  { key: "items", width: null },
  { key: "qty", width: 64, align: "right" },
  { key: "pickup_location", width: 176 },
  { key: "return_to", width: 200 },
  { key: "collected_by", width: 160 },
  { key: "actual_pickup_date", width: 132 },
  { key: "supplier_received_date", width: 148 },
  { key: "evidence", width: 210 },
] as const;

const MIN_WIDTH = UNIT_COLUMNS.reduce((sum, c) => sum + (c.width ?? 220), 0);

export default function PurchaseReturnUnitsTable({
  units,
}: {
  units: readonly PurchaseReturnUnitRow[];
}) {
  if (units.length === 0) {
    /* A return document with no Units is a real state — the document exists
       and its goods have not been named yet. It says so rather than drawing an
       empty grid that reads as a loading failure. */
    return (
      <div className="px-2 py-2 text-body" data-testid="purchase-return-units-empty">
        <Absence>No Units are recorded on this return.</Absence>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table
        className="border-separate border-spacing-0 border border-kit-slate-5 bg-white text-body"
        style={{ minWidth: MIN_WIDTH }}
        data-testid="purchase-return-units-table"
      >
        <thead>
          <tr>
            {UNIT_COLUMNS.map((column) => (
              <th
                key={column.key}
                scope="col"
                style={column.width ? { width: column.width } : undefined}
                className={[
                  // 11px/600, normal casing, neutral slate — a CHILD header,
                  // never the parent's band (UI MASTER §6.8).
                  "border-b border-kit-slate-5 px-2 py-1.5 align-bottom text-label font-semibold text-kit-slate-11",
                  "align" in column && column.align === "right" ? "text-right" : "text-left",
                ].join(" ")}
              >
                {PURCHASE_RETURN_UNIT_COLUMN_LABEL[column.key]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {units.map((unit) => (
            <Fragment key={unit.unit_id}>
              <tr className="border-t border-kit-slate-5">
                <Cell>{unit.category ?? <Absence />}</Cell>
                {/* ONE CELL, TWO LINES: the document, then the Unit under it.
                    Both print in FULL and stay selectable — a shortened number
                    names a document that does not exist. */}
                <Cell>
                  <div className="break-words">{unit.po_id ?? <Absence />}</div>
                  <SecondLine>
                    {unit.unit_id}
                  </SecondLine>
                </Cell>
                <Cell>
                  <div className="break-words">{unit.item ?? <Absence />}</div>
                  {unit.item_spec ? (
                    <SecondLine>
                      {unit.item_spec}
                    </SecondLine>
                  ) : null}
                </Cell>
                <Cell align="right">{PURCHASE_RETURN_UNIT_QTY}</Cell>
                <Cell>{unit.pickup_location ?? <Absence />}</Cell>
                <Cell>{unit.return_to ?? <Absence />}</Cell>
                <Cell>{unit.collected_by ?? <Absence />}</Cell>
                <Cell>
                  {unit.actual_pickup_date ? fmtDate(unit.actual_pickup_date) : <Absence />}
                </Cell>
                <Cell>
                  {unit.supplier_received_date ? (
                    fmtDate(unit.supplier_received_date)
                  ) : (
                    <Absence />
                  )}
                </Cell>
                <Cell>
                  <UnitEvidence unitId={unit.unit_id} evidence={unit.evidence} />
                </Cell>
              </tr>
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Cell({
  children,
  align = "left",
}: {
  children: ReactNode;
  align?: "left" | "right";
}) {
  return (
    <td
      className={`border-b border-kit-slate-5 px-2 py-2 align-top ${
        align === "right" ? "text-right tabular-nums" : ""
      }`}
    >
      {children}
    </td>
  );
}

/**
 * ⭐ EVIDENCE, BY PURPOSE, AND EXPANDED ON REQUEST.
 *
 * §9.6: "per-Unit inspection separates Problem evidence (linked claim), Pickup
 * proof and Supplier receipt proof. Compact icon + text photo/video actions;
 * no large pills or unnecessary row-height increase. Expand evidence on
 * request."
 *
 * So the collapsed state is ONE line — the total, under a disclosure — and the
 * three purposes only appear when the operator asks. That is what keeps the
 * row height of a ten-column table from being set by its evidence cell.
 *
 * ── THE THREE ARE NEVER MERGED ──────────────────────────────────────────────
 * §9.6: "Never label damage photos as pickup or receipt proof." A purpose with
 * no file is drawn with its own words and no action — silence would leave the
 * operator unable to tell "no pickup photo was taken" from "this return has no
 * pickup step", and the first is the gap the rail's `Pickup proof missing`
 * counts.
 *
 * ── AND THE VIEWER IS NOT WIRED HERE ────────────────────────────────────────
 * §9.6: "Use the shared read-only viewer target for photo zoom/pan/reset/
 * navigation and video playback/fullscreen. Viewer and real evidence wiring
 * require build verification." The entries carry `onOpen`, which is the door
 * that viewer plugs into; until the document slice supplies real files there
 * is nothing to open, so the action is drawn `disabled` rather than wired to a
 * viewer that would open empty. A control that does nothing and says nothing
 * is worse than one that says why.
 */
export function UnitEvidence({
  unitId,
  evidence,
  onOpen,
}: {
  unitId: string;
  evidence: readonly PurchaseReturnEvidenceCount[];
  onOpen?: (purpose: string, kind: "photos" | "videos") => void;
}) {
  const [open, setOpen] = useState(false);
  const total = evidence.reduce((sum, e) => sum + e.photos + e.videos, 0);

  if (total === 0) {
    return <Absence>No evidence</Absence>;
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => setOpen((previous) => !previous)}
        aria-expanded={open}
        data-testid={`purchase-return-evidence-toggle-${unitId}`}
        className="flex items-center gap-1 text-left text-kit-blue-11 hover:underline"
      >
        {open ? (
          <ChevronDown size={14} strokeWidth={1.75} aria-hidden />
        ) : (
          <ChevronRight size={14} strokeWidth={1.75} aria-hidden />
        )}
        <span>
          {total} {total === 1 ? "file" : "files"}
        </span>
      </button>
      {open ? (
        <div className="flex flex-col gap-1 pl-4" data-testid={`purchase-return-evidence-${unitId}`}>
          {PURCHASE_RETURN_EVIDENCE_PURPOSES.map((purpose) => {
            const counts = evidence.find((e) => e.purpose === purpose.key);
            const photos = purchaseReturnPhotoAction(counts?.photos ?? 0);
            const videos = purchaseReturnVideoAction(counts?.videos ?? 0);
            return (
              <div key={purpose.key} className="flex flex-wrap items-center gap-x-2">
                <span className="text-meta text-kit-slate-11">{purpose.label}</span>
                {photos ? (
                  <EvidenceAction
                    icon={<Camera size={14} strokeWidth={1.75} aria-hidden />}
                    label={photos}
                    onOpen={onOpen ? () => onOpen(purpose.key, "photos") : undefined}
                  />
                ) : null}
                {videos ? (
                  <EvidenceAction
                    icon={<Video size={14} strokeWidth={1.75} aria-hidden />}
                    label={videos}
                    onOpen={onOpen ? () => onOpen(purpose.key, "videos") : undefined}
                  />
                ) : null}
                {!photos && !videos ? <Absence>None</Absence> : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/** One compact entry: a kit-size icon and its count. Not a pill — §9.6 rules out
 *  the pill treatment precisely so this cell cannot set the row's height. */
function EvidenceAction({
  icon,
  label,
  onOpen,
}: {
  icon: ReactNode;
  label: string;
  onOpen?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={!onOpen}
      title={onOpen ? undefined : "The evidence viewer is not connected yet."}
      className={[
        "inline-flex items-center gap-1",
        onOpen
          ? "text-kit-blue-11 hover:underline"
          : "cursor-not-allowed text-kit-slate-11",
      ].join(" ")}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
