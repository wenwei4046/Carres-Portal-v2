/**
 * THE ONE UNIT IDENTITY. Purchasing MASTER §6.2 · Stock MASTER §3 ·
 * CARD-2026-09-07-purchasing-10 · migrations 0381 · 0442 · 0443 · 0453.
 *
 * PURE. No I/O, no clock. Every screen, PDF, export and scan reads a Unit's
 * identity through THIS file, so a Unit cannot be called one thing on the
 * register and another on the paper the customer signs.
 *
 * ── THE RULE ────────────────────────────────────────────────────────────────
 *
 *   identity_scope = 'unit'      exact traceable goods. ONE permanent Carres
 *                                Unit ID per piece — `U1-000-001` — born with
 *                                the official PO and printed on the label.
 *
 *   identity_scope = 'quantity'  counted goods. NO identity at all. The row
 *                                still needs a primary key, and it has one
 *                                (`QTY-000000001`), but that key is a database
 *                                fact and MUST NOT reach an operator. It is not
 *                                on a label, no supplier has ever seen it and
 *                                scanning it means nothing.
 *
 * ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
 * Until 0453, `unit_code` carried both, in one shape, and no reader was given
 * `identity_scope`. So a bulk row of 893 accessories printed `id-aam135002`
 * under a `Unit ID` heading — a technical key presented as an identity. The
 * type below makes that unrepresentable: ask for the ID and a counted row
 * answers `null`, every time, on every surface.
 */

/** The two ways Carres identifies stock (0442). */
export type IdentityScope = "unit" | "quantity";

/** The approved Carres Unit ID — `U1-000-001` (0381 `format_unit_id`). */
export const UNIT_ID_PATTERN = /^U\d+-\d{3}-\d{3}$/;

/** The technical key of a counted row — `QTY-000000001` (0453). Never shown. */
export const QUANTITY_KEY_PATTERN = /^QTY-\d{9}$/;

/**
 * Historical only — `id-abc123456`, minted by the dropped `gen_unit_code()`
 * before 0453. These are on real labels and real supplier PDFs, so they are
 * displayed exactly as stored and never rewritten. Nothing can make another.
 */
export const LEGACY_UNIT_ID_PATTERN = /^id-[a-z]{3}\d{6}$/;

/** What the operator sees where a Unit has no ID to show. */
export const NO_UNIT_ID = "—";

/** The least a row must carry for its identity to be resolved. */
export interface UnitIdentityRow {
  unitCode: string | null;
  identityScope?: IdentityScope | string | null;
}

/**
 * THE authoritative Unit ID of a row, or `null` when it has none.
 *
 * A counted row has no identity — not an empty one, not a placeholder one, and
 * never its technical key. A row whose scope is not yet known is read from the
 * stored code's own shape, so a reader that predates 0453's `identity_scope`
 * still cannot leak a `QTY-` key.
 */
export function unitIdOf(row: UnitIdentityRow): string | null {
  const code = row.unitCode?.trim() ?? "";
  if (code === "") return null;
  if (row.identityScope === "quantity") return null;
  // Shape is the fallback authority AND the backstop: a QTY- key is never an
  // identity, whatever a caller claims the scope is.
  if (QUANTITY_KEY_PATTERN.test(code)) return null;
  return code;
}

/** True when this row is one exact, individually tracked piece of furniture. */
export function isExactUnit(row: UnitIdentityRow): boolean {
  return unitIdOf(row) !== null;
}

/**
 * The Unit ID as it appears on screen, in a PDF and in an export — the stored
 * identity EXACTLY as stored, or `—`.
 *
 * Display never normalises. `U1-000-001` prints `U1-000-001`; a grandfathered
 * `id-abc123456` prints `id-abc123456`, because that is what is on the label
 * and on the paper the supplier already holds.
 */
export function displayUnitId(row: UnitIdentityRow): string {
  return unitIdOf(row) ?? NO_UNIT_ID;
}

/**
 * Search normalisation — INPUT ONLY.
 *
 * An operator types what they can see and reach: a scanner may upper-case, a
 * phone may lower-case, a label may be read as `U1 000 001` or `u1000001`. All
 * of those must find the Unit. Strip case and every separator, and compare the
 * bare characters. This is applied to the QUERY and to the STORED value for the
 * purpose of comparison only — it never changes what is displayed or printed.
 */
export function normaliseUnitIdQuery(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Does this row answer to what the operator typed?
 *
 * Counted rows answer to nothing: their key is not an identity, so it is not
 * searchable as one. Otherwise the comparison is punctuation- and
 * case-insensitive in both directions.
 */
export function matchesUnitId(row: UnitIdentityRow, rawQuery: string): boolean {
  const id = unitIdOf(row);
  if (id === null) return false;
  const q = normaliseUnitIdQuery(rawQuery);
  if (q === "") return false;
  return normaliseUnitIdQuery(id) === q;
}

/**
 * The canonical `U1-000-001` spelling of whatever the operator typed, or
 * `null` when it cannot be one.
 *
 * A scanner that drops the hyphens, a keyboard left on caps, a label read as
 * `u1 000 001` — all of them name the same Unit, and a lookup door should find
 * it. The two trailing 3-digit groups are fixed by 0381's `format_unit_id`, so
 * everything before them is the series.
 *
 * This produces a SEARCH KEY. It is never stored and never displayed.
 */
export function canonicalUnitIdFrom(raw: string): string | null {
  const v = normaliseUnitIdQuery(raw);
  const m = /^u(\d+)$/.exec(v);
  if (!m) return null;
  const digits = m[1];
  if (digits.length < 7) return null; // series + two 3-digit groups
  const series = digits.slice(0, digits.length - 6);
  const hi = digits.slice(digits.length - 6, digits.length - 3);
  const lo = digits.slice(digits.length - 3);
  if (series.startsWith("0")) return null; // a series is never zero-padded
  return `U${series}-${hi}-${lo}`;
}

/** Is this text shaped like something a Unit ID field should accept at all? */
export function looksLikeUnitId(raw: string): boolean {
  const v = raw.trim();
  return UNIT_ID_PATTERN.test(v) || LEGACY_UNIT_ID_PATTERN.test(v);
}
