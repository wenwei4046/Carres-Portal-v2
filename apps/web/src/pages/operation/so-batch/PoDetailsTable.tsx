// design-standard: not-a-list-page — this is a SECTION inside an expanded SO
// Batch Purchase row, not a page. It has no route, no shell and no page
// header: the Register above already owns all three, and wrapping a nested
// disclosure in a second ListPageShell would draw a page inside a page —
// exactly the windows-inside-windows AutoCount pattern the Constitution
// rejects (§2). Its table follows GoodsMiniTable's grammar, its sibling.
/**
 * ⭐ PURCHASE ORDER DETAILS — the read-only record, under its own heading
 * (owner correction 2026-09-11; `docs/purchasing/MASTER.md` §9.1).
 *
 * ONE QUESTION: *which document, and which Unit, already answers this Sales
 * Order — and how much of it?*
 *
 * ── WHY IT IS A TABLE OF ITS OWN, AND NOT MORE ROWS UPSTAIRS ────────────────
 *
 * The goods table above answers *what the customer ordered and what is left to
 * buy*. It is ACTIONABLE: every row on it carries a checkbox and a destination
 * editor, because every row on it is a demand somebody can still act on. This
 * table answers *what has already been bought*, and NOTHING on it can be acted
 * on: a purchase order that has been sent is not re-arranged from a register,
 * and a Unit that exists is not bought again. Two questions, two tables — and
 * the read-only one carries no control at all, which is the only way a reader
 * can be sure that what they are looking at is a record.
 *
 * The defect it closes: fourteen purchase orders were stacked inside ONE cell
 * of the item row — so a single item filled the screen — and then repeated
 * underneath it. The references are not truncated to tidy the screen; they are
 * all here, one document per row, full number, selectable text.
 *
 * ── THE THREE ANSWERS A UNIT CELL CAN GIVE, AND THEY ARE NOT THE SAME ───────
 *
 *   A UNIT ID           the goods exist and the record says which line they
 *                       answer — `ops_stock_items.reserved_order_line_id`, the
 *                       stored binding, or a purchase-order line sourced
 *                       EXCLUSIVELY to this item line. Evidence.
 *   `Not allocated`     the document carries the quantity and no Unit has been
 *                       tied to this line yet. A CONFIRMED absence.
 *   `Loading…` ·        the Unit read has not answered, or failed. An UNKNOWN,
 *   `Could not be       and it must never be printed as a confirmed absence —
 *   loaded`             that is how a reader concludes goods do not exist
 *                       because a request was slow.
 *
 * ── AND THREE ANSWERS FOR *WHICH LINE DOES THIS UNIT ANSWER* ────────────────
 *
 *   EXACT      the record binds it to this line, or a purchase-order line
 *              sourced exclusively to this line carries it. Evidence, and the
 *              row says nothing extra.
 *   INFERRED   the record carries no binding, so the Unit reached this line by
 *              matching its SKU — a pre-0471 reservation. The row says
 *              `Item line matched by SKU`, because an inference that looks like
 *              evidence is the defect this whole section exists to end.
 *   UNRESOLVED this browser's read does not carry the binding at all (an older
 *              Worker). `Item line unknown` — which is a different sentence
 *              from "the record does not say", and must not borrow it.
 *
 * The Unit is SHOWN in all three cases. Evidence is never dropped to tidy a
 * screen; what changes is what the screen CLAIMS about it.
 */
import { fmtDate } from "@/lib/fmt-date";
import type { SoBatchOrderPoFact } from "@carres/shared";

/** What the Unit read is currently able to say about this order. */
export type UnitReadState = "ready" | "loading" | "error";

/** How a Unit came to be on an item line — see the three answers above. */
export type UnitAssociation = "exact" | "inferred" | "unresolved";

/** The sentence each non-exact association prints under its Unit ID. */
const ASSOCIATION_WORD: Record<UnitAssociation, string | null> = {
  exact: null,
  inferred: "Item line matched by SKU",
  unresolved: "Item line unknown",
};

export interface PoDetailRow {
  /** Stable identity for React and for the test that counts these rows. */
  key: string;
  /** The document. Full number, never shortened. */
  poNo: string;
  /** The exact Unit, when one is evidenced for this document and line. */
  unitId: string | null;
  /** Printed when `unitId` is null — and it says WHICH kind of nothing. */
  unitAbsence: string;
  /**
   * How this Unit came to be on this item line. Anything but `exact` prints its
   * own sentence under the Unit ID, so an inference can never be read as
   * evidence and a gap in the READ is never read as a gap in the RECORD.
   */
  association: UnitAssociation;
  sku: string;
  item: string;
  itemDetail: string | null;
  qty: number;
  deliverTo: string | null;
  supplier: string | null;
  poDeliveryDate: string | null;
}

/**
 * The lineage of ONE item line, resolved into rows.
 *
 * Every `po_line_sources` entry for the line becomes at least one row: the
 * Units the read can EVIDENCE for that document, and — when the document
 * carries more than those Units account for — one row for the remainder, which
 * is the honest way to say "this much is on that paper and no Unit is tied to
 * it yet". Nothing is invented and nothing is dropped: a Unit naming a document
 * this line's lineage does not contain still gets a row, because a disagreement
 * between two authoritative reads is exactly the thing an audit register must
 * not hide.
 */
export function poDetailRowsForLine(input: {
  lineKey: string;
  sku: string;
  item: string;
  itemDetail: string | null;
  /** `po_line_sources` for this line: the document, and the units it carries. */
  lineage: ReadonlyArray<{ poId: string; qty: number }>;
  /** Unit IDs this line holds, from the Sales Order expansion door. */
  unitIds: readonly string[];
  /** Unit → the purchase order it came in on, where one can be evidenced. */
  unitCoverage: Readonly<Record<string, string | null>>;
  /** Unit → the item line the RECORD binds it to; `null` = never recorded. */
  unitLines: Readonly<Record<string, string | null>> | undefined;
  /** This line's own id, to test a binding against. */
  orderLineId: string;
  unitRead: UnitReadState;
  po: (poId: string) => SoBatchOrderPoFact | undefined;
  destinationName: (id: string | null) => string;
}): PoDetailRow[] {
  const {
    lineKey, sku, item, itemDetail, lineage, unitIds, unitCoverage, unitLines,
    orderLineId, unitRead, po, destinationName,
  } = input;

  const absence =
    unitRead === "loading"
      ? "Loading…"
      : unitRead === "error"
        ? "Could not be loaded"
        : "Not allocated";

  /* A binding that names ANOTHER line is not this line's Unit, whatever SKU it
     wears. A Unit ABSENT from the map is incoming on a purchase-order line
     sourced exclusively to this item line — the document evidences it, and
     reserved/sold Units are the only ones the map carries. */
  const association = (unitId: string): UnitAssociation => {
    if (!unitLines) return "unresolved";
    if (!(unitId in unitLines)) return "exact"; // incoming, exclusive by document
    if (unitLines[unitId] === orderLineId) return "exact";
    /* No binding at all, or a binding naming another line: either way this row
       got here by SKU, and the screen says which kind of claim that is. */
    return "inferred";
  };

  const facts = (poNo: string) => {
    const p = po(poNo);
    return {
      deliverTo: p ? destinationName(p.destinationId) || null : null,
      supplier: p?.supplierName ?? null,
      poDeliveryDate: p?.officialDeliveryDate ? fmtDate(p.officialDeliveryDate) : null,
    };
  };

  const rows: PoDetailRow[] = [];
  const used = new Set<string>();

  for (const { poId, qty } of lineage) {
    const units = unitIds.filter((u) => unitCoverage[u] === poId);
    for (const unitId of units) {
      used.add(unitId);
      rows.push({
        key: `${lineKey}::${poId}::${unitId}`,
        poNo: poId,
        unitId,
        unitAbsence: absence,
        association: association(unitId),
        sku, item, itemDetail,
        qty: 1,
        ...facts(poId),
      });
    }
    const remaining = qty - units.length;
    if (remaining > 0) {
      rows.push({
        key: `${lineKey}::${poId}::rest`,
        poNo: poId,
        unitId: null,
        unitAbsence: absence,
        association: "exact",
        sku, item, itemDetail,
        qty: remaining,
        ...facts(poId),
      });
    }
  }

  /* A Unit that names a document this line's lineage does not carry. Rare, and
     exactly the disagreement a register must print rather than swallow. */
  for (const unitId of unitIds) {
    if (used.has(unitId)) continue;
    const poNo = unitCoverage[unitId];
    if (!poNo) continue; // no document behind it — that is Ready Stock's answer
    rows.push({
      key: `${lineKey}::${poNo}::${unitId}::extra`,
      poNo,
      unitId,
      unitAbsence: absence,
      association: association(unitId),
      sku, item, itemDetail,
      qty: 1,
      ...facts(poNo),
    });
  }

  return rows;
}

/** Governed absence — a muted sentence, never a bare dash without a reason. */
function Absence({ children }: { children: string }) {
  return (
    <span className="font-sans text-kit-slate-9" data-absence="true">
      {children}
    </span>
  );
}

/**
 * The ruled columns. `PO No` and `Unit ID` lead and sit beside each other —
 * they are the two identifiers a person copies, and a reader who has to look
 * across four columns to pair a document with its goods pairs them wrongly.
 * Both are mono and both are printed in FULL: `PO-20260904-4665` is the
 * document's number and shortening it would name a document that does not
 * exist.
 *
 * `Ready Stock`, `To buy` and the tick column are deliberately ABSENT. They
 * would print a dash on every row of this table forever, and a column of
 * dashes is a column that states nothing in the width of a real answer.
 */
const COLUMNS = [
  { key: "poNo", label: "PO No", width: 168 },
  { key: "unitId", label: "Unit ID", width: 168 },
  { key: "sku", label: "SKU", width: 152 },
  { key: "item", label: "Item", width: null },
  { key: "qty", label: "Qty", width: 64 },
  { key: "deliverTo", label: "Deliver To", width: 150 },
  { key: "supplier", label: "Supplier", width: 140 },
  { key: "poDeliveryDate", label: "PO Delivery Date", width: 150 },
] as const;

const ITEM_FLOOR = 200;

export default function PoDetailsTable({
  label,
  rows,
  onPoClick,
}: {
  label: string;
  rows: readonly PoDetailRow[];
  onPoClick?: (poId: string) => void;
}) {
  const minWidth = COLUMNS.reduce((n, c) => n + (c.width ?? ITEM_FLOOR), 0);
  return (
    <div
      className="overflow-x-auto border-t border-base-200 bg-white"
      data-testid="po-details-table"
    >
      <table className="w-full table-fixed text-left" style={{ minWidth }} aria-label={label}>
        <colgroup>
          {COLUMNS.map((c) => (
            <col key={c.key} style={c.width ? { width: c.width } : undefined} />
          ))}
        </colgroup>
        {/* The goods table's own header treatment — 11px, grey, uppercase. The
            eye must not have to learn a second header style one section down. */}
        <thead className="border-b border-base-200 bg-base-50">
          <tr className="divide-x divide-base-200">
            {COLUMNS.map((c) => (
              <th
                key={c.key}
                scope="col"
                className="px-2 py-1.5 text-label font-semibold uppercase text-base-500"
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        {/* ⛔ NOT A DISABLED-LOOKING GREY BLOCK. A record is read far more often
            than a demand is bought, and greying the whole table would say
            "this is switched off" about the page's own audit evidence. It is
            ordinary readable white rows; what makes it read-only is that there
            is no control on it. */}
        <tbody className="divide-y divide-base-200 text-body">
          {rows.map((r) => (
            <tr
              key={r.key}
              data-testid={`po-detail-${r.key}`}
              data-row="record"
              className="divide-x divide-base-200 align-top"
            >
              <td className="px-2 py-2 tabular-nums">
                {onPoClick ? (
                  <button
                    type="button"
                    className="text-kit-blue-11 underline-offset-2 hover:underline"
                    data-testid={`po-detail-link-${r.poNo}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onPoClick(r.poNo);
                    }}
                  >
                    {r.poNo}
                  </button>
                ) : (
                  r.poNo
                )}
              </td>
              <td className="px-2 py-2 tabular-nums">
                {r.unitId ? (
                  <>
                    <div>{r.unitId}</div>
                    {ASSOCIATION_WORD[r.association] ? (
                      /* The Unit is real and it is on this Sales Order. HOW it
                         reached this item line is a separate fact, and the row
                         states it rather than letting a SKU match pass for a
                         binding. */
                      <div className="mt-0.5">
                        <Absence>{ASSOCIATION_WORD[r.association]!}</Absence>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <Absence>{r.unitAbsence}</Absence>
                )}
              </td>
              <td className="px-2 py-2 tabular-nums">{r.sku}</td>
              <td className="px-2 py-2">
                <div className="font-medium text-base-900">{r.item}</div>
                {r.itemDetail ? <div className="mt-0.5 text-base-600">{r.itemDetail}</div> : null}
              </td>
              <td className="px-2 py-2 tabular-nums">{r.qty}</td>
              <td className="px-2 py-2">
                {r.deliverTo ? r.deliverTo : <Absence>Not recorded</Absence>}
              </td>
              <td className="px-2 py-2">
                {r.supplier ? r.supplier : <Absence>Not recorded</Absence>}
              </td>
              <td className="px-2 py-2">
                {r.poDeliveryDate ? (
                  r.poDeliveryDate
                ) : (
                  /* The document exists and its ORIGINAL supplier-facing date
                     is not on file — the same word Purchase Orders uses for the
                     same fact, and never back-filled from today's planning
                     date. */
                  <Absence>Not recorded</Absence>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
