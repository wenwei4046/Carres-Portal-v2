/**
 * R2 · A receiving issue auto-becomes a supplier claim
 * (docs/receiving-claim-execution-queue.md, locked with Jess 2026-07-27).
 *
 * R1 gave a PO line three honest numbers — received · damaged · wrong item —
 * and left them sitting on the line. A number on a line chases nobody. R2 turns
 * every one of those numbers into a CASE: PO · supplier · SKU · qty · photos ·
 * who reported it, when. The card's whole test is
 *
 *     "a receiving problem cannot exist without a case row chasing it"
 *
 * which is why the claim is minted by the receive itself and guarded in the
 * database (0288): raising a line's damaged/wrong counter without a covering
 * claim is REFUSED, whichever door tries it.
 *
 * ── The vocabulary is S1's, not a second one ────────────────────────────────
 * A claim type is a `CaseIssueKey` (service-case-intake.ts) — the same words
 * the Service-Case wizard puts in front of staff, narrowed by the same
 * category lists, because "Wrong colour" means the same thing whether the
 * customer found it or the warehouse did. This file ADDS exactly one key:
 *
 *   `late_delivery` — the supplier promised a date and the goods are not here.
 *
 * It is category-independent (anything can be late) and it is the only claim
 * type with NO photo: there is nothing to photograph.
 *
 * ── The evidence law (S2's, applied here) ───────────────────────────────────
 * No evidence, no claim. A damaged or wrong-item claim MUST carry at least one
 * photo — enforced three times over: this module (what the modal asks), the
 * RPC (what the server refuses) and a CHECK constraint (what the table itself
 * will not store).
 *
 * ── Money rule (Jess, locked) ───────────────────────────────────────────────
 * A supplier claim NEVER produces a credit note. Credit notes are Finance-only,
 * for billing mistakes. Claim resolutions are goods actions — which is why
 * nothing in this module speaks money.
 *
 * PURE — no I/O, no clock. The web (pickers + gates), the API (validation) and
 * the tests read this one copy; the database mirrors it in CHECK constraints,
 * because SQL cannot import TypeScript.
 */
import {
  CASE_ISSUES,
  caseIssuesFor,
  type CaseIssueKey,
  type CaseOption,
  type CaseProductCategory,
} from "./service-case-intake";

// ── The claim type ───────────────────────────────────────────────────────────

/** S1's issue keys, plus the one thing a customer never reports: a late
 *  supplier. */
export type SupplierClaimType = CaseIssueKey | "late_delivery";

export const SUPPLIER_CLAIM_LATE = "late_delivery" as const;

export const SUPPLIER_CLAIM_TYPES = [
  ...CASE_ISSUES,
  { key: SUPPLIER_CLAIM_LATE, label: "Late delivery" },
] as const satisfies readonly CaseOption<SupplierClaimType>[];

export const SUPPLIER_CLAIM_TYPE_KEYS = SUPPLIER_CLAIM_TYPES.map((t) => t.key) as [
  SupplierClaimType,
  ...SupplierClaimType[],
];

export function supplierClaimTypeLabel(key: string | null | undefined): string {
  if (!key) return "—";
  return SUPPLIER_CLAIM_TYPES.find((t) => t.key === key)?.label ?? key;
}

/**
 * Which claim types a receiving operator may pick for a WRONG-ITEM unit of
 * this category.
 *
 * `damaged` is excluded on purpose: damage has its own box on the receive form,
 * so offering it here would let one unit be counted twice under two names. The
 * database relies on exactly this split — a claim typed `damaged` covers the
 * damaged counter, every other non-late type covers the wrong-item counter —
 * so the two domains must stay disjoint.
 *
 * A mattress therefore offers `Wrong SKU · Other`, a bed frame adds
 * `Missing parts / Wrong specification / Wrong colour`, and a sofa adds
 * `Colour uneven` on top — Jess's own lists, unchanged.
 */
export function wrongItemClaimTypesFor(
  cat: CaseProductCategory,
): CaseOption<CaseIssueKey>[] {
  return caseIssuesFor(cat).filter((o) => o.key !== "damaged");
}

/**
 * Is `type` a legal wrong-item claim for `cat`?
 *
 * `other` is the category we could not name (an accessory, or a SKU the
 * classifier does not recognise). It accepts ANY issue key rather than its own
 * narrow list: refusing "colour uneven" on a sofa the classifier failed to
 * recognise would block a real receiving over a naming detail, and a blocked
 * receiving is worse than a loosely-typed claim. Mirrored by the same rule in
 * 0288 so client and server cannot disagree about what the picker offered.
 */
export function isWrongItemClaimTypeFor(
  cat: CaseProductCategory,
  type: string | null | undefined,
): boolean {
  if (!type) return false;
  if (type === "damaged" || type === SUPPLIER_CLAIM_LATE) return false;
  if (cat === "other") return CASE_ISSUES.some((i) => i.key === type);
  return wrongItemClaimTypesFor(cat).some((o) => o.key === type);
}

/** Damage and wrong item need a photo; a late delivery has nothing to
 *  photograph. The one place that answers "must this claim carry evidence?" */
export function claimNeedsEvidence(type: string | null | undefined): boolean {
  return type !== SUPPLIER_CLAIM_LATE;
}

// ── The claim's own state ────────────────────────────────────────────────────

/** R2 gives a claim a birth and a queue. The ASK / ANSWER pair and the
 *  resolution flow are R3's card — this stays deliberately two-valued so R3 can
 *  grow it without unpicking anything. */
export type SupplierClaimStatus = "open" | "closed";

export const SUPPLIER_CLAIM_STATUSES = [
  { key: "open", label: "Open" },
  { key: "closed", label: "Closed" },
] as const satisfies readonly CaseOption<SupplierClaimStatus>[];

export function supplierClaimStatusLabel(key: string | null | undefined): string {
  if (!key) return "—";
  return SUPPLIER_CLAIM_STATUSES.find((s) => s.key === key)?.label ?? key;
}

// ── What the receive form must satisfy before it may be submitted ────────────

/** One line's inspection result, as the receive modal holds it. */
export interface ReceiveLineClaimDraft {
  /** Units this DO found broken. */
  damagedQty: number;
  /** Photos of the damage — storage object keys already uploaded. */
  damagedPhotos: readonly string[];
  /** Units this DO found to be something other than what was ordered. */
  wrongItemQty: number;
  /** WHICH kind of wrong — narrowed by the line's product category. */
  wrongItemClaimType: string | null;
  /** Photos of the wrong item. */
  wrongItemPhotos: readonly string[];
  /** The line's product family, for narrowing the picker. */
  category: CaseProductCategory;
}

export type ReceiveLineClaimProblem =
  | "damaged_photo_required"
  | "wrong_item_type_required"
  | "wrong_item_type_invalid"
  | "wrong_item_photo_required";

/**
 * What is still missing before this line's issue may be filed.
 *
 * Returns an EMPTY array for a clean line (nothing reported = nothing to
 * prove), which is why a normal delivery never sees any of this. The receive
 * modal's Submit asks this question for every line and the RPC asks the
 * equivalent one server-side, so the button and the server agree about what
 * "complete" means — the same law as `caseIntakeComplete` in S1.
 */
export function receiveLineClaimProblems(
  d: ReceiveLineClaimDraft,
): ReceiveLineClaimProblem[] {
  const out: ReceiveLineClaimProblem[] = [];
  if (d.damagedQty > 0 && d.damagedPhotos.length === 0)
    out.push("damaged_photo_required");
  if (d.wrongItemQty > 0) {
    if (!d.wrongItemClaimType) out.push("wrong_item_type_required");
    else if (!isWrongItemClaimTypeFor(d.category, d.wrongItemClaimType))
      out.push("wrong_item_type_invalid");
    if (d.wrongItemPhotos.length === 0) out.push("wrong_item_photo_required");
  }
  return out;
}

/** Plain words for the operator — no codes, no jargon (the copy law: a new hire
 *  must be able to fix the problem without asking anyone). */
export const RECEIVE_LINE_CLAIM_PROBLEM_TEXT: Record<
  ReceiveLineClaimProblem,
  string
> = {
  damaged_photo_required: "Add a photo of the damage",
  wrong_item_type_required: "Say what is wrong with the item",
  wrong_item_type_invalid: "Pick one of the listed problems",
  wrong_item_photo_required: "Add a photo of the wrong item",
};

// ── The row the Claims queue shows ───────────────────────────────────────────

export interface SupplierClaimPhoto {
  path: string;
  at: string;
  by?: string | null;
}

export interface SupplierClaimRow {
  id: string;
  claim_no: string;
  po_id: string;
  po_line_id: string | null;
  supplier_id: string;
  sku: string;
  product_category: CaseProductCategory;
  claim_type: SupplierClaimType;
  qty: number;
  status: SupplierClaimStatus;
  do_number: string | null;
  photos: SupplierClaimPhoto[];
  note: string | null;
  reported_by_name: string | null;
  reported_at: string;
}

/** The one-line sentence a claim row shows — "3 units · Damaged · MS01-K".
 *  Composed, never typed (S1's law: prose is a render of structured answers). */
export function supplierClaimSummary(c: {
  qty: number;
  claim_type: string;
  sku: string;
}): string {
  const units = `${c.qty} unit${c.qty === 1 ? "" : "s"}`;
  return `${units} · ${supplierClaimTypeLabel(c.claim_type)} · ${c.sku}`;
}
