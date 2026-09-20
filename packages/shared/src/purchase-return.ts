/**
 * ⭐ PURCHASE RETURNS — the owner-confirmed register vocabulary.
 *
 * `docs/purchasing/MASTER.md` §9.6 (owner-confirmed 2026-09-18) and
 * `docs/COPY-STANDARD.md` "Purchase Returns register". This file is the ONE
 * place those words, that column order and those rail conditions are written
 * down, because a word that has been ruled and is not written down is a word
 * the next chat re-invents (the failure the COPY dictionary exists to stop).
 *
 * ── WHAT THIS FILE IS NOT ───────────────────────────────────────────────────
 * It is not a custody engine and it does not store anything. §9.6 is explicit:
 * "Issuing the document does not move stock", and the Claim → Purchasing
 * authorisation → Stock physical pickup chain stays exactly where §7.4 and
 * Stock MASTER §12.8 put it. Everything here is presentation truth: labels,
 * the confirmed order, and FACTUAL predicates over facts somebody else owns.
 *
 * ── AND IT INVENTS NO DATES ─────────────────────────────────────────────────
 * §9.6: "Unknown facts remain explicitly unrecorded; never fabricate dates,
 * collectors or receipt evidence." Every accessor here returns `null` for an
 * absent fact and the register prints `Not recorded` — an absent pickup date
 * and a confirmed one are different facts and may never collapse into one.
 */

/** §9.6: "Visible purchase-return references use `PR-`, not `PRTN-`; this is
 *  display vocabulary, not permission to migrate stored identifiers." So the
 *  prefix is applied at the EDGE, on the way to the screen, and the stored
 *  `pr_no` is printed unchanged when it already carries its own prefix. */
export const PURCHASE_RETURN_PREFIX = "PR-";

/** The retired prefix. Kept named so a stored `PRTN-1001` is re-presented
 *  rather than printed raw — and so nothing has to guess what it meant. */
const RETIRED_PURCHASE_RETURN_PREFIX = "PRTN-";

/**
 * The visible purchase-return number.
 *
 * A stored reference already wearing `PR-` prints unchanged; one wearing the
 * retired `PRTN-` is re-presented under the confirmed prefix WITHOUT touching
 * the record; a bare sequence gets the prefix. An unissued document is not a
 * blank — it says so, because "no number yet" is a fact an operator acts on.
 */
export function purchaseReturnNo(stored: string | null | undefined): string {
  const raw = (stored ?? "").trim();
  if (!raw) return PURCHASE_RETURN_NOT_ISSUED;
  if (raw.startsWith(PURCHASE_RETURN_PREFIX)) return raw;
  if (raw.startsWith(RETIRED_PURCHASE_RETURN_PREFIX)) {
    return PURCHASE_RETURN_PREFIX + raw.slice(RETIRED_PURCHASE_RETURN_PREFIX.length);
  }
  return PURCHASE_RETURN_PREFIX + raw;
}

export const PURCHASE_RETURN_NOT_ISSUED = "Not issued";

/** The one word for a fact nobody has recorded, shared with Supplier Claims so
 *  two Purchasing registers cannot print two different absences. */
export const PURCHASE_RETURN_ABSENT = "Not recorded";

/**
 * ⭐ THE CONFIRMED MAIN COLUMN ORDER — §9.6, and it is not a heuristic.
 *
 * UI MASTER §6.7 rule 2 fixes `record date · identity` as the leading pair and
 * COPY-STANDARD's "Every listing, same order and words" gives the general
 * reading order, but §9.6 states THIS page's order exactly, and an exact
 * owner-approved page order "must not be rearranged by a general ordering
 * heuristic". Two things in it are load-bearing and are asserted by tests:
 *
 *   · `category` immediately precedes `po_unit` — §9.6 says so in its own
 *     sentence, twice (main columns AND expansion).
 *   · `po_unit` is ONE cell carrying PO No on line one and Unit ID on line
 *     two, exactly like the stock picker's `PO No / Ref No` provenance cell.
 *     Two columns would be a different design, not a spacing choice.
 *
 * The expand arrow is not listed here: `DataGrid` owns it as a synthetic
 * control column, the same way it does on every other register.
 */
export const PURCHASE_RETURN_COLUMN_ORDER = [
  "pr_doc_date",
  "pr_no",
  "supplier",
  "claim_no",
  "category",
  "po_unit",
  "grn_no",
  "items",
  "qty",
  "pickup_location",
  "return_to",
  "confirmed_pickup_date",
  "collected_by",
  "collected_qty",
  "actual_pickup_date",
  "supplier_received_date",
] as const;

export type PurchaseReturnColumnKey =
  (typeof PURCHASE_RETURN_COLUMN_ORDER)[number];

/** The exact visible heading for each column (COPY-STANDARD, §9.6). */
export const PURCHASE_RETURN_COLUMN_LABEL: Record<
  PurchaseReturnColumnKey,
  string
> = {
  pr_doc_date: "PR Doc Date",
  pr_no: "PR No",
  supplier: "Supplier",
  claim_no: "Supplier Claim No.",
  category: "Category",
  po_unit: "PO No",
  grn_no: "GRN No.",
  items: "Items",
  qty: "Qty",
  pickup_location: "Pickup Location",
  return_to: "Return To",
  confirmed_pickup_date: "Confirmed Pickup Date",
  collected_by: "Collected By",
  collected_qty: "Collected Qty",
  actual_pickup_date: "Actual Pickup Date",
  supplier_received_date: "Supplier Received Date",
};

/**
 * ⭐ THE EXPANDED COLUMN ORDER — §9.6, "one tracked Unit per expanded row".
 *
 * It is NOT the main order with columns dropped: it re-leads on `Category`,
 * because inside the expansion the document's own date and number are already
 * on the parent row and repeating them would spend the reader's first two
 * columns on facts they just read.
 */
export const PURCHASE_RETURN_UNIT_COLUMN_ORDER = [
  "category",
  "po_unit",
  "items",
  "qty",
  "pickup_location",
  "return_to",
  "collected_by",
  "actual_pickup_date",
  "supplier_received_date",
  "evidence",
] as const;

export type PurchaseReturnUnitColumnKey =
  (typeof PURCHASE_RETURN_UNIT_COLUMN_ORDER)[number];

export const PURCHASE_RETURN_UNIT_COLUMN_LABEL: Record<
  PurchaseReturnUnitColumnKey,
  string
> = {
  category: "Category",
  po_unit: "PO No",
  items: "Items",
  qty: "Qty",
  pickup_location: "Pickup Location",
  return_to: "Return To",
  collected_by: "Collected By",
  actual_pickup_date: "Actual Pickup Date",
  supplier_received_date: "Supplier Received Date",
  evidence: "Evidence",
};

/**
 * ⭐ LABELS THIS REGISTER MAY NOT USE — §9.6 and COPY-STANDARD.
 *
 * `Handover` / `Handover proof` / `Units / Qty` / `Return Doc Date` /
 * `Return No` are superseded AS LABELS ON THIS REGISTER. They are NOT globally
 * retired custody vocabulary — Stock still hands goods over and still says so.
 * This list exists so the page's own test can prove the screen does not revive
 * them, which is cheaper than finding one in a screenshot six weeks later.
 */
export const PURCHASE_RETURN_SUPERSEDED_LABELS = [
  "Handover",
  "Handover proof",
  "Units / Qty",
  "Return Doc Date",
  "Return No",
] as const;

/**
 * ⭐ EVIDENCE PURPOSES — three, and they are never interchangeable.
 *
 * §9.6: "Never label damage photos as pickup or receipt proof." The three
 * answer three different questions — why it goes back, that it left, that they
 * got it — and a file filed under the wrong one is a claim Carres cannot
 * prove. Problem evidence is READ from the linked claim; it is not re-uploaded
 * here, which is why this register owns no upload door at all.
 */
export const PURCHASE_RETURN_EVIDENCE_PURPOSES = [
  { key: "problem", label: "Problem evidence", source: "claim" },
  { key: "pickup", label: "Pickup proof", source: "return" },
  { key: "receipt", label: "Supplier receipt proof", source: "return" },
] as const;

export type PurchaseReturnEvidencePurpose =
  (typeof PURCHASE_RETURN_EVIDENCE_PURPOSES)[number]["key"];

export function purchaseReturnEvidenceLabel(
  key: string | null | undefined,
): string {
  return (
    PURCHASE_RETURN_EVIDENCE_PURPOSES.find((p) => p.key === key)?.label ??
    PURCHASE_RETURN_ABSENT
  );
}

/** The compact entry words, §9.6: "compact icon + text photo/video actions;
 *  no large pills". A purpose with neither file prints neither action — an
 *  absent count is not a `0`, it is nothing to open. */
export function purchaseReturnPhotoAction(count: number): string | null {
  return count > 0 ? `Photos ${count}` : null;
}

export function purchaseReturnVideoAction(count: number): string | null {
  return count > 0 ? `Video ${count}` : null;
}

// ── The row shapes ──────────────────────────────────────────────────────────

/**
 * One tracked Unit on a return document.
 *
 * `qty` is deliberately absent: §9.6 rules "one tracked Unit per expanded row,
 * Qty 1". A quantity FIELD on this shape is how two physical Units end up
 * combined into one evidence row, which is the exact thing that ruling forbids,
 * so the type refuses to carry one and the table prints the constant.
 */
export interface PurchaseReturnUnitRow {
  unit_id: string;
  po_id: string | null;
  category: string | null;
  /** The model, printed on line one of `Items`. */
  item: string | null;
  /** Its specification, printed on line two at 11px (UI MASTER §6.8). */
  item_spec: string | null;
  pickup_location: string | null;
  /** §9.6: the supplier-DESIGNATED destination. Never derived from a supplier
   *  record's registered address — an assumed address is a wrong address. */
  return_to: string | null;
  /** Who physically collected THIS Unit. Absent until it is collected. */
  collected_by: string | null;
  actual_pickup_date: string | null;
  supplier_received_date: string | null;
  evidence: PurchaseReturnEvidenceCount[];
}

export interface PurchaseReturnEvidenceCount {
  purpose: PurchaseReturnEvidencePurpose;
  photos: number;
  videos: number;
}

/** Qty on an expanded row. §9.6 rules it, so it is a constant, not a field. */
export const PURCHASE_RETURN_UNIT_QTY = 1;

export interface PurchaseReturnListRow {
  id: string;
  /** Stored reference; presented through `purchaseReturnNo`. */
  pr_no: string | null;
  /** §9.6: "PR Doc Date is the document date, not goods movement." */
  pr_doc_date: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
  /** The approved Claim this return was authorised by (§7.4: only an approved
   *  Claim/outcome creates a return; there is no blank `+ New`). */
  claim_no: string | null;
  grn_no: string | null;
  /** Whether the return document has been sent to the supplier. */
  document_sent_at: string | null;
  confirmed_pickup_date: string | null;
  units: PurchaseReturnUnitRow[];
}

// ── Derived document facts ──────────────────────────────────────────────────
//
// Every one of these is arithmetic over the Units, computed in ONE place
// (ERP-ARCHITECTURE law D: a derived fact has ONE arithmetic, not two that
// currently agree). The register prints them; it never re-adds them itself.

/** The document's quantity: one per tracked Unit, by §9.6's own rule. */
export function purchaseReturnQty(row: PurchaseReturnListRow): number {
  return row.units.length * PURCHASE_RETURN_UNIT_QTY;
}

/** How many of those Units have actually been collected. */
export function purchaseReturnCollectedQty(row: PurchaseReturnListRow): number {
  return row.units.filter((u) => u.actual_pickup_date != null).length;
}

/**
 * The document's `Collected By`, and it refuses to average.
 *
 * One collector prints their name. Two different collectors print the count,
 * because naming one of them on the parent row would be a false statement
 * about the other Unit — the expansion is where the per-Unit truth lives.
 * Nobody yet prints nothing at all.
 */
export function purchaseReturnCollectedBy(
  row: PurchaseReturnListRow,
): string | null {
  const names = [
    ...new Set(
      row.units
        .map((u) => u.collected_by)
        .filter((n): n is string => !!n && n.trim() !== ""),
    ),
  ];
  if (names.length === 0) return null;
  if (names.length === 1) return names[0];
  return `${names.length} collectors`;
}

/**
 * A document-level fact that is TRUE ONLY WHEN EVERY UNIT AGREES.
 *
 * `Actual Pickup Date` and `Supplier Received Date` are per-Unit facts (§9.6
 * lists both in the expansion). On the parent row they may only be printed
 * when the document has one answer: the LATEST date once every Unit carries
 * one, and `null` while any Unit is still outstanding. A half-collected return
 * showing a pickup date reads as finished, and §9.6's whole point is that
 * "fully picked up does not mean received by the supplier" — the same trap one
 * level up.
 */
function latestWhenComplete(
  row: PurchaseReturnListRow,
  pick: (unit: PurchaseReturnUnitRow) => string | null,
): string | null {
  if (row.units.length === 0) return null;
  const dates = row.units.map(pick);
  if (dates.some((d) => d == null)) return null;
  return (dates as string[]).reduce((a, b) => (a > b ? a : b));
}

export function purchaseReturnActualPickupDate(
  row: PurchaseReturnListRow,
): string | null {
  return latestWhenComplete(row, (u) => u.actual_pickup_date);
}

export function purchaseReturnSupplierReceivedDate(
  row: PurchaseReturnListRow,
): string | null {
  return latestWhenComplete(row, (u) => u.supplier_received_date);
}

/** The distinct values of a per-Unit text fact, for the parent row. Same law as
 *  `purchaseReturnCollectedBy`: one value prints, several print their count. */
function oneOrCount(
  row: PurchaseReturnListRow,
  pick: (unit: PurchaseReturnUnitRow) => string | null,
  plural: string,
): string | null {
  const values = [
    ...new Set(
      row.units.map(pick).filter((v): v is string => !!v && v.trim() !== ""),
    ),
  ];
  if (values.length === 0) return null;
  if (values.length === 1) return values[0];
  return `${values.length} ${plural}`;
}

export function purchaseReturnPickupLocation(
  row: PurchaseReturnListRow,
): string | null {
  return oneOrCount(row, (u) => u.pickup_location, "locations");
}

export function purchaseReturnReturnTo(
  row: PurchaseReturnListRow,
): string | null {
  return oneOrCount(row, (u) => u.return_to, "destinations");
}

export function purchaseReturnCategory(
  row: PurchaseReturnListRow,
): string | null {
  return oneOrCount(row, (u) => u.category, "categories");
}

export function purchaseReturnPoNo(row: PurchaseReturnListRow): string | null {
  return oneOrCount(row, (u) => u.po_id, "purchase orders");
}

/**
 * The second line of the combined identity cell.
 *
 * One Unit prints its own ID. Several print the COUNT, and §9.6 names that
 * count "the expansion entry" — it is the invitation to open the row, not a
 * summary that pretends to be one Unit.
 */
export function purchaseReturnUnitCell(row: PurchaseReturnListRow): string {
  if (row.units.length === 1) return row.units[0].unit_id;
  if (row.units.length === 0) return PURCHASE_RETURN_ABSENT;
  return `${row.units.length} Units`;
}

/** The goods summary, `Items`. One model prints; several print their count. */
export function purchaseReturnItems(row: PurchaseReturnListRow): string | null {
  return oneOrCount(row, (u) => u.item, "items");
}

/** Its second line: the specification, only while there is exactly one model. */
export function purchaseReturnItemSpec(
  row: PurchaseReturnListRow,
): string | null {
  const models = new Set(
    row.units.map((u) => u.item).filter((v): v is string => !!v),
  );
  if (models.size !== 1) return null;
  const specs = new Set(
    row.units.map((u) => u.item_spec).filter((v): v is string => !!v),
  );
  return specs.size === 1 ? [...specs][0] : null;
}

// ── The left rail — four sections, §9.6's confirmed preview ─────────────────

/**
 * ⭐ THE CONFIRMED RAIL, AND NOTHING ELSE.
 *
 * §9.6 closes with a sentence written specifically to stop the next chat being
 * helpful: "Date-range and Pickup Location rail sections discussed as
 * possibilities were not in the confirmed preview; do not silently treat them
 * as approved additions." So four sections, in this order, and a test that
 * fails if a fifth appears.
 */
export const PURCHASE_RETURN_RAIL_SECTIONS = [
  { key: "supplier", title: "Supplier" },
  { key: "document", title: "Return document" },
  { key: "pickup", title: "Pickup" },
  { key: "evidence", title: "Evidence" },
] as const;

export type PurchaseReturnRailSection =
  (typeof PURCHASE_RETURN_RAIL_SECTIONS)[number]["key"];

/** The exact condition words. §9.6 lists them; COPY-STANDARD locks them. */
export const PURCHASE_RETURN_CONDITIONS = {
  documentNotSent: "Return document not sent",
  pickupNotConfirmed: "Pickup date not confirmed",
  notPickedUp: "Not picked up",
  partlyPickedUp: "Partly picked up",
  fullyPickedUp: "Fully picked up",
  pickupProofMissing: "Pickup proof missing",
} as const;

export type PurchaseReturnCondition =
  (typeof PURCHASE_RETURN_CONDITIONS)[keyof typeof PURCHASE_RETURN_CONDITIONS];

/**
 * ⭐ THE CONDITIONS ARE FACTS, AND THEY ARE ALLOWED TO OVERLAP.
 *
 * §9.6: "These are factual filters, not new stored states" and "conditions may
 * overlap". Both sentences matter, and the second is the unusual one.
 *
 * A return whose pickup date was never confirmed AND which nobody has
 * collected is BOTH `Pickup date not confirmed` and `Not picked up`. A status
 * column would have to choose one and would therefore lie about the other;
 * this returns a SET, so each row is counted under every condition that is
 * true of it. That is why the rail's counts do not sum to the register's
 * total, and why they must not be made to.
 *
 * `Fully picked up` says only that every Unit left — §9.6: "Fully picked up
 * does not mean received by the supplier." Supplier receipt is a separate
 * fact, deliberately WITHOUT a confirmed rail condition of its own.
 */
export function purchaseReturnConditions(
  row: PurchaseReturnListRow,
): PurchaseReturnCondition[] {
  const out: PurchaseReturnCondition[] = [];
  const qty = purchaseReturnQty(row);
  const collected = purchaseReturnCollectedQty(row);

  if (row.document_sent_at == null) {
    out.push(PURCHASE_RETURN_CONDITIONS.documentNotSent);
  }
  if (row.confirmed_pickup_date == null) {
    out.push(PURCHASE_RETURN_CONDITIONS.pickupNotConfirmed);
  }
  // A document with no Units is not "fully picked up" — nothing was. It falls
  // in `Not picked up`, which is the honest reading of an empty return.
  if (collected === 0) {
    out.push(PURCHASE_RETURN_CONDITIONS.notPickedUp);
  } else if (collected < qty) {
    out.push(PURCHASE_RETURN_CONDITIONS.partlyPickedUp);
  } else {
    out.push(PURCHASE_RETURN_CONDITIONS.fullyPickedUp);
  }
  if (purchaseReturnPickupProofMissing(row)) {
    out.push(PURCHASE_RETURN_CONDITIONS.pickupProofMissing);
  }
  return out;
}

/**
 * `Pickup proof missing` — and it only accuses a Unit that has actually left.
 *
 * A Unit nobody has collected has nothing to photograph, so it is not missing
 * proof; it is `Not picked up`, which the rail already says. Counting it here
 * too would put every untouched return in the evidence queue and the queue
 * would stop meaning anything. A collected Unit with no pickup photo AND no
 * pickup video is the real gap.
 */
export function purchaseReturnPickupProofMissing(
  row: PurchaseReturnListRow,
): boolean {
  return row.units.some((unit) => {
    if (unit.actual_pickup_date == null) return false;
    const proof = unit.evidence.find((e) => e.purpose === "pickup");
    return !proof || proof.photos + proof.videos === 0;
  });
}

/** Which rail section a condition belongs to. One home each, so a condition
 *  cannot be drawn twice by two sections both claiming it. */
export const PURCHASE_RETURN_CONDITION_SECTION: Record<
  PurchaseReturnCondition,
  Exclude<PurchaseReturnRailSection, "supplier">
> = {
  [PURCHASE_RETURN_CONDITIONS.documentNotSent]: "document",
  [PURCHASE_RETURN_CONDITIONS.pickupNotConfirmed]: "pickup",
  [PURCHASE_RETURN_CONDITIONS.notPickedUp]: "pickup",
  [PURCHASE_RETURN_CONDITIONS.partlyPickedUp]: "pickup",
  [PURCHASE_RETURN_CONDITIONS.fullyPickedUp]: "pickup",
  [PURCHASE_RETURN_CONDITIONS.pickupProofMissing]: "evidence",
};

/** The order conditions are drawn within their section — §9.6's own order, so
 *  a rail cannot re-sort itself alphabetically into a different reading. */
export const PURCHASE_RETURN_CONDITION_ORDER: PurchaseReturnCondition[] = [
  PURCHASE_RETURN_CONDITIONS.documentNotSent,
  PURCHASE_RETURN_CONDITIONS.pickupNotConfirmed,
  PURCHASE_RETURN_CONDITIONS.notPickedUp,
  PURCHASE_RETURN_CONDITIONS.partlyPickedUp,
  PURCHASE_RETURN_CONDITIONS.fullyPickedUp,
  PURCHASE_RETURN_CONDITIONS.pickupProofMissing,
];

/**
 * Does this document match the picked supplier and condition?
 *
 * §9.6: "Supplier combines with the operational condition and search". Two
 * dimensions, ANDed — and each is optional, so an unfiltered rail refuses
 * nothing.
 */
export function purchaseReturnMatches(
  row: PurchaseReturnListRow,
  picks: {
    supplier?: string | null;
    condition?: PurchaseReturnCondition | null;
  },
): boolean {
  if (picks.supplier != null) {
    const name = row.supplier_name || PURCHASE_RETURN_ABSENT;
    if (name !== picks.supplier) return false;
  }
  if (picks.condition != null) {
    if (!purchaseReturnConditions(row).includes(picks.condition)) return false;
  }
  return true;
}

/**
 * The supplier rows for the rail: name + how many PR DOCUMENTS match.
 *
 * §9.6: "Counts count matching PR documents, not Units" — a return carrying
 * four Units is one line of work, not four, and a count that said four would
 * send the operator looking for three documents that do not exist.
 *
 * `except` is what makes a facet's own counts stay useful: when Supplier is
 * the facet being counted, the currently picked supplier is EXCLUDED from the
 * predicate, so the list still shows the other suppliers and their true counts
 * under the active condition. Same law Supplier Claims' rail runs on.
 */
export function purchaseReturnSupplierCounts(
  rows: readonly PurchaseReturnListRow[],
  picks: { condition?: PurchaseReturnCondition | null } = {},
): { supplier: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (!purchaseReturnMatches(row, { condition: picks.condition ?? null })) {
      continue;
    }
    const name = row.supplier_name || PURCHASE_RETURN_ABSENT;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts]
    .map(([supplier, count]) => ({ supplier, count }))
    .sort((a, b) => a.supplier.localeCompare(b.supplier));
}

/** The condition rows: the same arithmetic, respecting the picked supplier. */
export function purchaseReturnConditionCounts(
  rows: readonly PurchaseReturnListRow[],
  picks: { supplier?: string | null } = {},
): { condition: PurchaseReturnCondition; count: number }[] {
  const counts = new Map<PurchaseReturnCondition, number>();
  for (const row of rows) {
    if (!purchaseReturnMatches(row, { supplier: picks.supplier ?? null })) {
      continue;
    }
    for (const condition of purchaseReturnConditions(row)) {
      counts.set(condition, (counts.get(condition) ?? 0) + 1);
    }
  }
  return PURCHASE_RETURN_CONDITION_ORDER.filter((c) => counts.has(c)).map(
    (condition) => ({ condition, count: counts.get(condition) as number }),
  );
}
