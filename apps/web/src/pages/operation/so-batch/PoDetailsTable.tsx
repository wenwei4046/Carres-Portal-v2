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
 * ONE QUESTION: *which document line, and which Unit, already answers this
 * Sales Order — and how much of it?*
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
 * all here, one document LINE per row, full number, selectable text.
 *
 * ── ONE ROW PER DOCUMENT **LINE**, NOT PER DOCUMENT ─────────────────────────
 *
 * A purchase order may carry one SKU to two destinations through two lines and
 * source both to the same customer item line (the governed `Deliver To`
 * split). Keyed by the document alone, the two collapse and the register has
 * only the PARENT document's destination left to print — **a parent summary
 * standing in for a line's own recorded fact**, which is the thing this page
 * spent the whole correction removing from the row above. `destinationId`
 * arrives per lineage entry: the LINE's, and the document's only where the
 * line has none, which is how the paper itself works.
 *
 * ── THE ANSWERS A UNIT CELL CAN GIVE, AND NONE OF THEM IS A SPARE ───────────
 *
 *   A UNIT ID              exact goods, and the record says they answer THIS
 *                          line. Evidence. It carries `Qty 1` and draws the
 *                          document line's remainder down by one.
 *   `Not unit-tracked`     the goods covering this document line are COUNTED
 *                          (`identity_scope = 'quantity'`, 0453). There is no
 *                          Unit ID and there never will be — the technical
 *                          `QTY-` key is a database fact that must not reach an
 *                          operator (`unit-identity.ts`).
 *   `Not allocated`        the read ANSWERED for this line and no Unit is tied
 *                          to this quantity yet. A CONFIRMED absence.
 *   `Not read`             the read answered for the ORDER but carried no entry
 *                          for this item line. Carres did not look here — a
 *                          different fact from having looked and found nothing.
 *   `Loading…`             the Unit read has not come back.
 *   `Could not be loaded`  it failed.
 *
 * ── AND AN INFERENCE IS NEVER COUNTED AS COVERAGE ───────────────────────────
 *
 * A Unit reaches this line either because the record BINDS it here
 * (`ops_stock_items.reserved_order_line_id`, 0471) or because a purchase-order
 * line sourced EXCLUSIVELY to this item line carries it — both exact. A Unit
 * that got here by matching its SKU is an INFERENCE, and the same physical Unit
 * is offered to every item line of that SKU on the order. So an inferred row:
 *
 *   · is SHOWN — evidence is never dropped to tidy a screen;
 *   · says `Item line matched by SKU`;
 *   · carries NO quantity, and does NOT draw the remainder down.
 *
 * That last clause is the arithmetic. Counting it would let one physical Unit
 * account for two different item lines' quantities at once, and the screen's
 * own numbers would stop adding up. Its quantity stays inside the remainder
 * row, where it is honestly described as not yet allocated.
 */
import {
  soBatchPoDocumentState,
  unitIdOf,
  type SoBatchOrderPoFact,
} from "@carres/shared";
import { fmtDate } from "@/lib/fmt-date";

/** What the Unit read is currently able to say about this ORDER. */
export type UnitReadState = "ready" | "loading" | "error";

/** Whether that read carried an entry for this particular ITEM LINE. */
export type LineReadState = "answered" | "absent";

/** How a Unit came to be on an item line — see the note above. */
export type UnitAssociation = "exact" | "inferred" | "unresolved";

/** The sentence each non-exact association prints under its Unit ID. */
const ASSOCIATION_WORD: Record<UnitAssociation, string | null> = {
  exact: null,
  inferred: "Item line matched by SKU",
  unresolved: "Item line unknown",
};

/** Goods that are counted, not individually tracked — they have no Unit ID. */
const NOT_UNIT_TRACKED = "Not unit-tracked";

export interface PoDetailRow {
  /** Stable identity for React and for the test that counts these rows. */
  key: string;
  /** The document. Full number, never shortened. */
  poNo: string;
  /** The document's own state, in the one Purchasing vocabulary. */
  poStatus: string;
  /** The exact Unit, when one is evidenced for this document line. */
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
  /**
   * `null` where this row's quantity is accounted for by the remainder row
   * below it — an inferred or unresolved Unit is evidence, not coverage, and
   * counting it here would state the same units twice.
   */
  qty: number | null;
  deliverTo: string | null;
  supplier: string | null;
  poDeliveryDate: string | null;
}

/** One `po_line_sources` fact: the document LINE, its units and where it sends them. */
export interface PoLineage {
  poId: string;
  poLineId?: string | null;
  qty: number;
  /** The LINE's destination, already resolved by the server. */
  destinationId?: string | null;
}

/**
 * The lineage of ONE item line, resolved into rows.
 *
 * Every `po_line_sources` entry becomes at least one row: the Units the read
 * can EVIDENCE for that document line, and — when the line carries more than
 * those Units account for — one row for the remainder, which is the honest way
 * to say "this much is on that paper and no Unit is tied to it yet". Nothing is
 * invented and nothing is dropped: a Unit naming a document this item line's
 * lineage does not contain still gets a row, because a disagreement between two
 * authoritative reads is exactly the thing an audit register must not hide.
 */
export function poDetailRowsForLine(input: {
  lineKey: string;
  sku: string;
  item: string;
  itemDetail: string | null;
  lineage: readonly PoLineage[];
  /** Unit IDs this line holds, from the Sales Order expansion door. */
  unitIds: readonly string[];
  /** Unit → the purchase order it came in on, where one can be evidenced. */
  unitCoverage: Readonly<Record<string, string | null>>;
  /** Unit → the item line the RECORD binds it to; `null` = never recorded. */
  unitLines: Readonly<Record<string, string | null>> | undefined;
  /** Unit → `unit` | `quantity` (0453). Absent falls back to the code's shape. */
  unitScopes: Readonly<Record<string, string>> | undefined;
  /** This line's own id, to test a binding against. */
  orderLineId: string;
  unitRead: UnitReadState;
  /** Did that read carry an entry for THIS item line? */
  lineRead: LineReadState;
  po: (poId: string) => SoBatchOrderPoFact | undefined;
  destinationName: (id: string | null) => string;
}): PoDetailRow[] {
  const {
    lineKey, sku, item, itemDetail, lineage, unitIds, unitCoverage, unitLines,
    unitScopes, orderLineId, unitRead, lineRead, po, destinationName,
  } = input;

  /* ⛔ FIVE ANSWERS, NEVER ONE. `Not allocated` is the only one of them that
     claims Carres looked at this line and found nothing. */
  const absence =
    unitRead === "loading"
      ? "Loading…"
      : unitRead === "error"
        ? "Could not be loaded"
        : lineRead === "absent"
          ? "Not read"
          : "Not allocated";

  /* THE ONE UNIT IDENTITY (`unit-identity.ts`). A counted row answers `null`
     here, whatever its technical key looks like, so a `QTY-` key can never
     reach a `Unit ID` heading. */
  const idOf = (code: string): string | null =>
    unitIdOf({ unitCode: code, identityScope: unitScopes?.[code] ?? null });

  /**
   * ⭐ ABSENCE PROVES NOTHING (owner correction 2026-09-11).
   *
   * This used to read a Unit MISSING from `unitLines` as exact, on the ground
   * that only incoming goods are absent from the map and those are evidenced by
   * a purchase-order line sourced exclusively to this item line. The premise
   * was true and the rule was still wrong: it made a gap in the DATA prove a
   * fact about the GOODS, so any future read that stopped populating the map —
   * or populated it partially — would silently start certifying inferences.
   *
   * The server now writes the incoming-exclusive binding INTO the map, so the
   * fact is DECLARED. Absence therefore means nothing evidenced it, and says so.
   */
  const association = (unitId: string): UnitAssociation => {
    if (!unitLines || !(unitId in unitLines)) return "unresolved";
    return unitLines[unitId] === orderLineId ? "exact" : "inferred";
  };

  const facts = (poNo: string, destinationId: string | null | undefined) => {
    const p = po(poNo);
    /* The LINE's destination. The document's own is the fallback the SERVER
       already applied where the line had none; it is never substituted for a
       destination the line actually records. */
    const destination = destinationId !== undefined ? destinationId : (p?.destinationId ?? null);
    return {
      poStatus: p ? soBatchPoDocumentState(p) : "Not recorded",
      deliverTo: destinationName(destination) || null,
      supplier: p?.supplierName ?? null,
      poDeliveryDate: p?.officialDeliveryDate ? fmtDate(p.officialDeliveryDate) : null,
    };
  };

  const rows: PoDetailRow[] = [];
  const used = new Set<string>();

  for (const entry of lineage) {
    const { poId, qty } = entry;
    const onThisDocument = unitIds.filter((u) => unitCoverage[u] === poId);
    /* A counted row is not a Unit and never becomes one. Its presence changes
       the WORD on the remainder — these goods will never carry a Unit ID — and
       nothing else. */
    const counted = onThisDocument.filter((u) => idOf(u) === null);
    const units = onThisDocument.filter((u) => idOf(u) !== null);
    let exact = 0;
    for (const unitId of units) {
      used.add(unitId);
      const how = association(unitId);
      if (how === "exact") exact += 1;
      rows.push({
        key: `${lineKey}::${poId}::${entry.poLineId ?? ""}::${unitId}`,
        poNo: poId,
        unitId: idOf(unitId),
        unitAbsence: absence,
        association: how,
        sku, item, itemDetail,
        /* ⛔ ONLY EVIDENCE CARRIES A QUANTITY. An inferred Unit is offered to
           every item line of its SKU, so counting it here would let one
           physical Unit answer two lines at once. Its quantity stays in the
           remainder row, honestly described. */
        qty: how === "exact" ? 1 : null,
        ...facts(poId, entry.destinationId),
      });
    }
    const remaining = qty - exact;
    if (remaining > 0) {
      rows.push({
        key: `${lineKey}::${poId}::${entry.poLineId ?? ""}::rest`,
        poNo: poId,
        unitId: null,
        unitAbsence: counted.length > 0 && units.length === 0 ? NOT_UNIT_TRACKED : absence,
        association: "exact",
        sku, item, itemDetail,
        qty: remaining,
        ...facts(poId, entry.destinationId),
      });
    }
  }

  /* A Unit that names a document this line's lineage does not carry. Rare, and
     exactly the disagreement a register must print rather than swallow. */
  for (const unitId of unitIds) {
    if (used.has(unitId)) continue;
    const poNo = unitCoverage[unitId];
    if (!poNo) continue; // no document behind it — that is Ready Stock's answer
    if (idOf(unitId) === null) continue; // counted goods are not a Unit record
    rows.push({
      key: `${lineKey}::${poNo}::${unitId}::extra`,
      poNo,
      unitId: idOf(unitId),
      unitAbsence: absence,
      association: association(unitId),
      sku, item, itemDetail,
      /* It is outside this line's lineage, so it answers none of its quantity. */
      qty: null,
      ...facts(poNo, undefined),
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
 * `PO Status` is the DOCUMENT's own recorded state, and it is what makes the
 * arithmetic legible: `On PO` upstairs counts every non-cancelled document,
 * `Completed` ones included, while `To buy` is netted against OPEN documents
 * only. Without this column a reader cannot tell fourteen delivered documents
 * from fourteen outstanding ones.
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
  { key: "poStatus", label: "PO Status", width: 160 },
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
              <td className="px-2 py-2 tabular-nums">
                {r.qty == null ? <Absence>—</Absence> : r.qty}
              </td>
              <td className="px-2 py-2">
                {r.deliverTo ? r.deliverTo : <Absence>Not recorded</Absence>}
              </td>
              <td className="px-2 py-2">
                {r.supplier ? r.supplier : <Absence>Not recorded</Absence>}
              </td>
              <td className="px-2 py-2">{r.poStatus}</td>
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
