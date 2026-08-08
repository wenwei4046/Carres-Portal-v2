/**
 * Service Case intake v1 (S1, service-case execution queue — Jess 2026-07-27).
 *
 * The pain this closes: staff cannot fill a free-text form — "What happened"
 * comes back written five different ways by five different people, so the
 * record can never be counted and a new hire freezes at the empty box. The
 * wizard asks five closed questions instead, and every answer is a STABLE KEY,
 * not prose:
 *
 *   1. Who found it?          → CASE_REPORTERS
 *   2. Which product?         → the order line (category derived from its SKU)
 *   3. What's wrong?          → CASE_ISSUES, narrowed by product category
 *   4. Can it still be used?  → CASE_USABLE_OPTIONS  ⇒  the PRIORITY
 *   5. What does the customer want? → CASE_WANTS (multi-pick)
 *
 * Same law as the T4 delivery reasons: keys are what gets stored (labels may be
 * reworded without re-tagging history), the lists live as ONE shared constant —
 * NOT a config table — and the DB mirrors them with CHECK constraints (0285).
 *
 * Priority is DERIVED here and GENERATED in the database (0285): staff never
 * pick it, and no write path can disagree with the rule.
 */
import { lineClass } from "./line-category";

// ── 1 · Who found it ─────────────────────────────────────────────────────────

export type CaseReporterKey =
  | "customer"
  | "warehouse"
  | "logistic"
  | "supplier"
  | "staff";

export interface CaseOption<K extends string> {
  key: K;
  label: string;
}

export const CASE_REPORTERS = [
  { key: "customer", label: "Customer" },
  { key: "warehouse", label: "Warehouse" },
  { key: "logistic", label: "Logistic" },
  { key: "supplier", label: "Supplier" },
  { key: "staff", label: "Staff" },
] as const satisfies readonly CaseOption<CaseReporterKey>[];

export const CASE_REPORTER_KEYS = CASE_REPORTERS.map((r) => r.key) as [
  CaseReporterKey,
  ...CaseReporterKey[],
];

// ── 2 · Which product (category) ─────────────────────────────────────────────

/**
 * The product families the issue list branches on. `other` is everything the
 * SKU classifier calls an accessory/service — and also the case with no order
 * line at all (the live state of every case on file today), so the wizard never
 * dead-ends on a product it cannot name.
 */
export type CaseProductCategory = "mattress" | "bedframe" | "sofa" | "other";

export const CASE_PRODUCT_CATEGORIES = [
  { key: "mattress", label: "Mattress" },
  { key: "bedframe", label: "Bed frame" },
  { key: "sofa", label: "Sofa" },
  { key: "other", label: "Other" },
] as const satisfies readonly CaseOption<CaseProductCategory>[];

export const CASE_PRODUCT_CATEGORY_KEYS = CASE_PRODUCT_CATEGORIES.map((c) => c.key) as [
  CaseProductCategory,
  ...CaseProductCategory[],
];

/**
 * SKU → the wizard's category. Delegates to `lineClass` — the one classifier
 * the orders grid, the drawer badge and the booking gate already share — so a
 * case can never call a sofa a mattress while the order screen calls it a sofa.
 * "acc" (accessories, delivery/service charges) lands in `other` — and since D9
 * so does "unknown", because a complaint about a thing nobody can classify is
 * still a complaint that must be openable. `other` is the wizard's honest
 * bucket, not a claim about the product.
 */
export function caseProductCategory(sku: string | null | undefined): CaseProductCategory {
  if (!sku) return "other";
  const cat = lineClass(sku);
  return cat === "acc" || cat === "unknown" ? "other" : cat;
}

export function caseProductCategoryLabel(cat: CaseProductCategory): string {
  return CASE_PRODUCT_CATEGORIES.find((c) => c.key === cat)?.label ?? cat;
}

// ── 3 · What's wrong ─────────────────────────────────────────────────────────

export type CaseIssueKey =
  | "wrong_sku"
  | "missing_parts"
  | "wrong_spec"
  | "wrong_colour"
  | "colour_uneven"
  | "damaged"
  | "other";

export const CASE_ISSUES = [
  { key: "wrong_sku", label: "Wrong SKU" },
  { key: "missing_parts", label: "Missing parts" },
  { key: "wrong_spec", label: "Wrong specification" },
  { key: "wrong_colour", label: "Wrong colour" },
  { key: "colour_uneven", label: "Colour uneven" },
  { key: "damaged", label: "Damaged" },
  { key: "other", label: "Other" },
] as const satisfies readonly CaseOption<CaseIssueKey>[];

export const CASE_ISSUE_KEYS = CASE_ISSUES.map((i) => i.key) as [
  CaseIssueKey,
  ...CaseIssueKey[],
];

/**
 * Which issues a category may report — Jess's own lists, verbatim (a mattress
 * has no parts to be missing and no two panels to be uneven, so offering those
 * words would invite a wrong answer). The keys are GLOBAL on purpose: S5 counts
 * "damaged" across every category from one column instead of three.
 *
 * `other` (accessories / no order line) gets the small honest set.
 */
export const CASE_ISSUES_BY_CATEGORY: Record<CaseProductCategory, readonly CaseIssueKey[]> = {
  mattress: ["wrong_sku", "damaged", "other"],
  bedframe: ["missing_parts", "wrong_spec", "wrong_colour", "damaged", "other"],
  sofa: ["missing_parts", "wrong_spec", "wrong_colour", "colour_uneven", "damaged", "other"],
  other: ["wrong_sku", "missing_parts", "damaged", "other"],
};

export function caseIssuesFor(cat: CaseProductCategory): CaseOption<CaseIssueKey>[] {
  return CASE_ISSUES_BY_CATEGORY[cat].map(
    (k) => CASE_ISSUES.find((i) => i.key === k) as CaseOption<CaseIssueKey>,
  );
}

export function caseIssueLabel(key: string | null | undefined): string {
  if (!key) return "—";
  return CASE_ISSUES.find((i) => i.key === key)?.label ?? key;
}

// ── 4 · Can the customer still use it → the priority ─────────────────────────

export type CaseUsableKey = "yes" | "temporary" | "no";
export type CasePriority = "low" | "normal" | "high";

export interface CaseUsableOption extends CaseOption<CaseUsableKey> {
  /** Plain-words help so a new hire picks the right one without asking. */
  hint: string;
  priority: CasePriority;
}

export const CASE_USABLE_OPTIONS = [
  { key: "yes", label: "Yes", hint: "Customer can keep using it as normal", priority: "low" },
  { key: "temporary", label: "Temporarily", hint: "Usable for now, but not acceptable", priority: "normal" },
  { key: "no", label: "No", hint: "Cannot be used at all", priority: "high" },
] as const satisfies readonly CaseUsableOption[];

export const CASE_USABLE_KEYS = CASE_USABLE_OPTIONS.map((o) => o.key) as [
  CaseUsableKey,
  ...CaseUsableKey[],
];

export const CASE_PRIORITIES: CasePriority[] = ["low", "normal", "high"];

/**
 * THE priority rule — the only one. Staff never pick a priority; they answer
 * "can the customer still use it" and the system decides. Mirrored by the
 * generated column in 0285, so the database reaches the same answer even if a
 * future write path forgets to.
 */
export function casePriorityFor(usable: CaseUsableKey | null | undefined): CasePriority | null {
  if (!usable) return null;
  return CASE_USABLE_OPTIONS.find((o) => o.key === usable)?.priority ?? null;
}

/** High priority = a manager has to be told. There is no message-sending
 *  integration anywhere in the API today, so "notify" is a VISIBLE flag on the
 *  list and the case, not a silent send that never happens. */
export function caseNeedsManager(priority: CasePriority | null | undefined): boolean {
  return priority === "high";
}

export function caseUsableLabel(key: string | null | undefined): string {
  if (!key) return "—";
  return CASE_USABLE_OPTIONS.find((o) => o.key === key)?.label ?? key;
}

// ── 5 · What the customer wants ──────────────────────────────────────────────

export type CaseWantKey = "repair" | "replace" | "missing_parts" | "inspection" | "refund";

export const CASE_WANTS = [
  { key: "repair", label: "Repair" },
  { key: "replace", label: "Replace" },
  { key: "missing_parts", label: "Missing parts" },
  { key: "inspection", label: "Inspection" },
  { key: "refund", label: "Refund" },
] as const satisfies readonly CaseOption<CaseWantKey>[];

export const CASE_WANT_KEYS = CASE_WANTS.map((w) => w.key) as [CaseWantKey, ...CaseWantKey[]];

export function caseWantLabel(key: string): string {
  return CASE_WANTS.find((w) => w.key === key)?.label ?? key;
}

// ── The composed record ──────────────────────────────────────────────────────

export interface CaseIntakeAnswers {
  reportedBy: CaseReporterKey | null;
  productCategory: CaseProductCategory | null;
  productSku: string | null;
  productQty?: number | null;
  issueType: CaseIssueKey | null;
  usable: CaseUsableKey | null;
  customerWants: CaseWantKey[];
}

/**
 * The five answers → the ONE sentence that lands in `what_happened`.
 *
 * The wizard's whole point is that nobody types a sentence — but the case list
 * column, the printable Service Note and every existing reader still expect
 * one. Composing it here means the prose is a RENDER of the structured answers
 * (always the same shape, always countable) instead of a second, drifting
 * source of truth. Nothing downstream had to change to keep working.
 */
export function composeCaseSummary(a: CaseIntakeAnswers): string {
  const parts: string[] = [];

  const product = [
    a.productCategory ? caseProductCategoryLabel(a.productCategory) : null,
    a.productSku,
    a.productQty && a.productQty > 1 ? `x${a.productQty}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  parts.push(product ? `${caseIssueLabel(a.issueType)} — ${product}.` : `${caseIssueLabel(a.issueType)}.`);

  if (a.reportedBy) {
    const r = CASE_REPORTERS.find((x) => x.key === a.reportedBy);
    parts.push(`Found by ${r?.label ?? a.reportedBy}.`);
  }
  if (a.usable) parts.push(`Still usable: ${caseUsableLabel(a.usable)}.`);
  if (a.customerWants.length) {
    parts.push(`Customer wants: ${a.customerWants.map(caseWantLabel).join(", ")}.`);
  }

  return parts.join(" ");
}

/**
 * Is the intake complete enough to file? Every question except the product SKU
 * (a case may genuinely have no order line) must be answered — this is the one
 * function the wizard's Submit button and any future server-side gate ask, so
 * they cannot disagree about what "complete" means.
 */
export function caseIntakeComplete(a: CaseIntakeAnswers): boolean {
  return (
    !!a.reportedBy &&
    !!a.productCategory &&
    !!a.issueType &&
    !!a.usable &&
    a.customerWants.length > 0
  );
}
