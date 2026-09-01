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
// R8 — the claim's one dictionary-backed step is worded by the mirror, never
// here. COPY-STANDARD, PURCHASING: `Confirm what happens next`.
import { purchasingActionLine } from "./order-action-words";

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

/** R2 gave a claim a birth and a queue; R3 gives it an end. Still two-valued:
 *  a claim is either being chased or it is settled. Everything about HOW it was
 *  settled lives in the ask/answer pair below, never in a third status word. */
export type SupplierClaimStatus = "open" | "closed";

export const SUPPLIER_CLAIM_STATUSES = [
  { key: "open", label: "Open" },
  { key: "closed", label: "Closed" },
] as const satisfies readonly CaseOption<SupplierClaimStatus>[];

export function supplierClaimStatusLabel(key: string | null | undefined): string {
  if (!key) return "—";
  return SUPPLIER_CLAIM_STATUSES.find((s) => s.key === key)?.label ?? key;
}

// ── R3 · what WE ask, and what the SUPPLIER answered ─────────────────────────
//
// Two separate fields, on purpose (the card's own words): "so 'what we wanted
// vs what we got' is analysable". One field would collapse the two into a
// single settled/not-settled bit and R5's scorecard could never ask the
// interesting question — which suppliers do what we ask, and which negotiate.
//
// Both lists are CLOSED. Free text exists only as a note beside them, never
// instead of them (S1's law: prose is a render of structured answers, and a
// typed sentence cannot be counted).

/** What we ask the supplier to do. Jess's list, verbatim, plus the one thing
 *  her list could not cover — see `SUPPLIER_CLAIM_REQUEST_REMAINING`. */
export type SupplierClaimRequest =
  | "replace"
  | "deliver_missing_parts"
  | "deliver_correct_item"
  | "repair"
  | "return_for_inspection"
  | "deliver_remaining";

/**
 * The ask for goods that never arrived.
 *
 * Jess's ask list covers the five things you do about goods you are HOLDING —
 * every one of them is meaningless for a `late_delivery` claim, where nothing
 * arrived to replace, repair or return. That claim type is minted automatically
 * by the nightly sweep, so a late claim with no legal ask would sit in the
 * queue forever with nothing anyone could pick: the queue would jam on the one
 * claim type nobody files by hand.
 *
 * So a late claim is BORN with this ask already stamped — it is the only thing
 * a late claim can ever ask for ("send the goods you owe us"), there is nothing
 * for a human to decide, and the word is the one the supplier's own answer list
 * already uses (`Deliver remaining`), not a sixth invented one. It is never
 * offered in the picker: see `requestedActionsFor`.
 *
 * REPORTED TO JESS, not decided quietly — the card's ask list has a gap and
 * this is how it was closed.
 */
export const SUPPLIER_CLAIM_REQUEST_REMAINING = "deliver_remaining" as const;

export const SUPPLIER_CLAIM_REQUESTS = [
  { key: "replace", label: "Replace" },
  { key: "deliver_missing_parts", label: "Deliver missing parts" },
  { key: "deliver_correct_item", label: "Deliver correct item" },
  { key: "repair", label: "Repair" },
  { key: "return_for_inspection", label: "Return for inspection" },
  { key: SUPPLIER_CLAIM_REQUEST_REMAINING, label: "Deliver remaining" },
] as const satisfies readonly CaseOption<SupplierClaimRequest>[];

export const SUPPLIER_CLAIM_REQUEST_KEYS = SUPPLIER_CLAIM_REQUESTS.map((r) => r.key) as [
  SupplierClaimRequest,
  ...SupplierClaimRequest[],
];

export function supplierClaimRequestLabel(key: string | null | undefined): string {
  if (!key) return "—";
  return SUPPLIER_CLAIM_REQUESTS.find((r) => r.key === key)?.label ?? key;
}

/** What the supplier came back with. Jess's list, verbatim and unchanged — the
 *  supplier's mouth is not narrowed by what we asked for: they may offer
 *  something else entirely, or refuse. */
export type SupplierClaimResponse =
  | "replacement"
  | "deliver_remaining"
  | "repair"
  | "return_and_replace"
  | "reject"
  | "other_agreement";

export const SUPPLIER_CLAIM_RESPONSES = [
  { key: "replacement", label: "Replacement" },
  { key: "deliver_remaining", label: "Deliver remaining" },
  { key: "repair", label: "Repair" },
  { key: "return_and_replace", label: "Return & replace" },
  { key: "reject", label: "Reject" },
  { key: "other_agreement", label: "Other agreement" },
] as const satisfies readonly CaseOption<SupplierClaimResponse>[];

export const SUPPLIER_CLAIM_RESPONSE_KEYS = SUPPLIER_CLAIM_RESPONSES.map((r) => r.key) as [
  SupplierClaimResponse,
  ...SupplierClaimResponse[],
];

export function supplierClaimResponseLabel(key: string | null | undefined): string {
  if (!key) return "—";
  return SUPPLIER_CLAIM_RESPONSES.find((r) => r.key === key)?.label ?? key;
}

/**
 * Which asks the picker offers for this claim type.
 *
 * TWO buckets, split by one physical fact: did the goods arrive?
 *
 *   - `late_delivery` → nothing arrived, so nothing can be replaced, repaired
 *     or returned. Its ask is stamped at birth and there is nothing to pick.
 *   - everything else → the goods are in our warehouse and all five of Jess's
 *     asks are live.
 *
 * The split is deliberately no finer than that. Narrowing "damaged" to
 * `replace | repair` would be us guessing furniture policy, and R2 already
 * learned the cost of an over-narrow list: a blocked receiving is worse than a
 * loosely-typed claim. The operator knows their supplier; the system knows only
 * whether the goods are here.
 */
export function requestedActionsFor(
  claimType: string | null | undefined,
): CaseOption<SupplierClaimRequest>[] {
  if (claimType === SUPPLIER_CLAIM_LATE) return [];
  return SUPPLIER_CLAIM_REQUESTS.filter(
    (r) => r.key !== SUPPLIER_CLAIM_REQUEST_REMAINING,
  );
}

/** Is `action` a legal ask for a claim of this type? Mirrored by
 *  `supplier_claim_request_allowed` in 0291 — client and server must not
 *  disagree about what the picker offered. */
export function isRequestedActionFor(
  claimType: string | null | undefined,
  action: string | null | undefined,
): boolean {
  if (!action || !claimType) return false;
  if (claimType === SUPPLIER_CLAIM_LATE)
    return action === SUPPLIER_CLAIM_REQUEST_REMAINING;
  return requestedActionsFor(claimType).some((r) => r.key === action);
}

/**
 * Which answers must carry a note.
 *
 * A refusal with no reason and an "other agreement" with no agreement are both
 * records that say nothing — R5 would count them and learn nothing, and the
 * next person to open the claim cannot tell what was settled. Every other
 * answer names itself.
 */
export function responseNeedsNote(response: string | null | undefined): boolean {
  return response === "reject" || response === "other_agreement";
}

// ── Customer Resolution · what are we doing for the CUSTOMER? ────────────────
//
// Loo's claim model, ruled 2026-08-05 (docs/purchasing/MASTER.md §6). The claim
// carries FOUR layers and they may never be collapsed:
//
//   Customer Problem → Supplier Response → Carres Resolution → Carres Execution
//
// This file already held two of them: the problem (`claim_type`) and the
// supplier's answer (`supplier_response`). What was missing is the one decision
// the CUSTOMER is waiting on, and it is a SECOND decision beside the item's
// outcome (`STOCK_HOLD_OUTCOMES` in stock-hold.ts), never a replacement for it.
//
// **The test that keeps them apart is Loo's own: can both be true at the same
// time?** The customer cancelled AND the mattress is destroyed. Under one list
// the operator has to choose which truth to record — has to LIE. Under two,
// both are recorded, which is why this is four options here and three there.
//
// ── What is deliberately NOT in this list, and why ──────────────────────────
//   · `Return to Supplier` — it LOOPS BACK ("send it back and wait for their
//     next word" resolves nothing for the customer). It is an EXECUTION move,
//     and it is an Item Outcome, where it already lives.
//   · `Write Off` — answers what happened to the ITEM. Item Outcome, likewise.
//   · `Cancel Outstanding` — replaced by `No Replacement Required`. The rename
//     changed what the option DOES: SC-1014 is 3 ordered / 3 received, so its
//     outstanding is 0 and `Cancel Outstanding` could not have been pressed at
//     all, while `No Replacement Required` is exactly the true answer there.
//   · `Reject` · `Deliver Remaining` · `Replacement` · `Return and Replace` —
//     every one of them is a SUPPLIER answer, not a Carres decision. They are
//     `SUPPLIER_CLAIM_RESPONSES` above and they stay there.
//   · `Refund` — **NOT built and NOT deleted.** Supplier credit note? cash?
//     offset against future purchases? The business meaning is not frozen and
//     nobody may guess it.
//
// ── And what this module must NOT do ────────────────────────────────────────
// **Consequences are `f(Resolution, Execution)`, never `f(Resolution)`** (Loo's
// law 5). Carres Execution — `Return to Supplier · Collect Defective Item ·
// Replace First · Collect First · Exchange on Collection` — is BUILT as of
// 2026-09-01 (`CARRES_EXECUTIONS` below, migration 0409), so both arguments now
// exist and the consequence is computable for the first time.
//
// **It is still not computed here, and that is not lag.** Which stock, finance
// and demand moves each (Resolution, Execution) pair produces has never been
// ruled — the freeze was on the missing argument, and lifting it does not
// license guessing the function. Nothing in this module derives a consequence
// until that ruling exists.

export type CustomerResolution =
  | "replace"
  | "repair"
  | "accept_as_is"
  | "no_replacement_required";

export const CUSTOMER_RESOLUTIONS = [
  { key: "replace", label: "Replace" },
  { key: "repair", label: "Repair" },
  { key: "accept_as_is", label: "Accept As-Is" },
  { key: "no_replacement_required", label: "No Replacement Required" },
] as const satisfies readonly CaseOption<CustomerResolution>[];

export const CUSTOMER_RESOLUTION_KEYS = CUSTOMER_RESOLUTIONS.map((r) => r.key) as [
  CustomerResolution,
  ...CustomerResolution[],
];

export function customerResolutionLabel(key: string | null | undefined): string {
  if (!key) return "—";
  return CUSTOMER_RESOLUTIONS.find((r) => r.key === key)?.label ?? key;
}

export function isCustomerResolution(key: string | null | undefined): boolean {
  return !!key && CUSTOMER_RESOLUTIONS.some((r) => r.key === key);
}

/**
 * One line under the selected option, so a new hire can tell the four apart.
 *
 * **A DEFINITION, never a consequence.** Each line says what the option MEANS
 * for the customer and stops there — it does not say what happens to stock, to
 * money or to the outstanding quantity, because with Execution unbuilt none of
 * those is known (law 5 above). The first two are Loo's own business laws 1 and
 * 2, written out; the second two restate the option's own words, which is all
 * they can honestly say until `Refund` and Execution are ruled.
 *
 * COPY-STANDARD, "The Claims decision words" — locked strings like any label.
 */
export const CUSTOMER_RESOLUTION_MEANING: Record<CustomerResolution, string> = {
  replace: "The customer gets a NEW item.",
  repair: "The SAME item is repaired and goes back to the SAME customer.",
  accept_as_is: "The customer keeps this item as it is.",
  no_replacement_required: "Nothing more goes to the customer for this item.",
};

export function customerResolutionMeaning(
  key: string | null | undefined,
): string | null {
  return isCustomerResolution(key)
    ? CUSTOMER_RESOLUTION_MEANING[key as CustomerResolution]
    : null;
}

// ── Carres Execution · in what ORDER do the goods actually move? ─────────────
//
// The fourth and last layer of Loo's claim model (ruled 2026-08-05, built
// 2026-09-01). Layer ③ above says what the customer GETS; this says how the
// goods get there — and the two are different questions with different answers:
// *replace* is a promise, `Replace First` and `Collect First` are two ways of
// keeping it that leave Carres holding a different number of units for a week.
//
// **The vocabulary is Loo's, transcribed, not invented.** It sat in this file's
// own header as prose from 0324 onward and in no dictionary, which is the exact
// failure COPY-STANDARD's "Claims decision words" section was written to stop:
// a word that has been ruled and is not written down is a word the next chat
// re-invents. It is now registered there like any other locked string.
//
// ── Why `Return to Supplier` is here AND an Item Outcome, and is not a bug ───
// It reads like a duplicate of `STOCK_HOLD_OUTCOMES`'s `returned_to_supplier`
// and it is not, for the same reason `Repair` sits on both the supplier's
// answer list and the customer's resolution list. The Item Outcome is a fact
// about the UNIT — where it physically ended up. This is a fact about the
// CHOREOGRAPHY — that there is no customer leg at all, which is what makes it
// the fifth option rather than four. They are allowed to disagree: a claim may
// execute `Collect First` and still end with the unit written off.
//
// ── What this layer STILL does not do ───────────────────────────────────────
// **It derives no consequence yet.** `f(Resolution, Execution)` is now
// computable for the first time — both arguments finally exist — but WHICH
// stock, finance and demand moves each pair produces is not ruled, and a screen
// that guessed would be wrong with a screen's authority. This layer makes the
// consequence card POSSIBLE; it does not pre-empt it. Purchase Returns (§9.6)
// and Repair Orders (§9.7) are the documents that consume it, and both were
// frozen on exactly this missing argument.
//
// ── And it is NOT cross-validated against layer ③ — RULED, YH 2026-09-01 ────
// `Replace First` with `no_replacement_required` is incoherent, and the
// database admits it on purpose. This was put to the owner as an open question
// and he ruled for the flexibility: **do not add the guard.** Two reasons he
// accepted, both of which a later chat must answer before reversing it:
//
//   1. A CHECK across the two would COLLAPSE two layers Loo's model exists to
//      keep apart. The moment answering one narrows the other, they are no
//      longer two questions.
//   2. It would refuse a real event. The van is already out collecting; the
//      office records `Collect First` because it is happening, while the
//      customer has not yet settled what they want. A matched-pair rule makes
//      an operator type a false answer to record a true one — the failure this
//      repo keeps finding whenever two things that move on different days are
//      tied together.
//
// 0324 set the same precedent for layer ③. A consequence engine may revisit
// this, because f(Resolution, Execution) only becomes computable once both are
// on file; until that function is ruled, nothing derives from either.

export type CarresExecution =
  | "return_to_supplier"
  | "collect_defective_item"
  | "replace_first"
  | "collect_first"
  | "exchange_on_collection";

export const CARRES_EXECUTIONS = [
  { key: "return_to_supplier", label: "Return to Supplier" },
  { key: "collect_defective_item", label: "Collect Defective Item" },
  { key: "replace_first", label: "Replace First" },
  { key: "collect_first", label: "Collect First" },
  { key: "exchange_on_collection", label: "Exchange on Collection" },
] as const satisfies readonly CaseOption<CarresExecution>[];

export const CARRES_EXECUTION_KEYS = CARRES_EXECUTIONS.map((e) => e.key) as [
  CarresExecution,
  ...CarresExecution[],
];

export function carresExecutionLabel(key: string | null | undefined): string {
  if (!key) return "—";
  return CARRES_EXECUTIONS.find((e) => e.key === key)?.label ?? key;
}

export function isCarresExecution(key: string | null | undefined): boolean {
  return !!key && CARRES_EXECUTIONS.some((e) => e.key === key);
}

/**
 * One line under each option, so a new hire can tell the five apart.
 *
 * **A DEFINITION, never a consequence** — the same law layer ③'s meanings
 * carry. Each line says which goods move and in what ORDER, and stops before
 * saying what that does to stock, to money or to the outstanding quantity.
 * Those are the consequence card's to rule, and naming one here would be a
 * guess wearing a screen's authority.
 *
 * The order words are capitalised (`BEFORE`, `one visit`) because the order IS
 * the decision: `Replace First` and `Collect First` differ in nothing else, and
 * an operator who misreads which is which sends a van to the wrong address.
 *
 * COPY-STANDARD, "The Claims decision words" — locked strings like any label.
 */
export const CARRES_EXECUTION_MEANING: Record<CarresExecution, string> = {
  return_to_supplier: "The item goes back to the supplier. Nothing goes to the customer.",
  collect_defective_item: "Carres collects the item from the customer. Nothing goes out.",
  replace_first: "The new item goes out BEFORE the old one is collected.",
  collect_first: "The old item comes back BEFORE the new one goes out.",
  exchange_on_collection: "Both change hands in one visit.",
};

export function carresExecutionMeaning(
  key: string | null | undefined,
): string | null {
  return isCarresExecution(key)
    ? CARRES_EXECUTION_MEANING[key as CarresExecution]
    : null;
}

// ── Who owes the next move ───────────────────────────────────────────────────
//
// The card's test: "every open claim shows who owes the next move". It is
// DERIVED, never stored — a stored owner is a second copy of the ask/answer
// pair and drifts from it the moment anything is recorded.

export type SupplierClaimMoveOwner = "carres" | "supplier";

export interface SupplierClaimMove {
  /** Which step of the lifecycle is open. `done` = the claim is closed. */
  key: "ask" | "answer" | "close" | "done";
  /** null only when the claim is closed — nobody owes anything. */
  owner: SupplierClaimMoveOwner | null;
  /** The action line: verb + named party + measurable object (COPY-STANDARD).
   *  Empty for a closed claim: a closed claim shows a FACT, not an action. */
  label: string;
}

export interface SupplierClaimMoveInput {
  claim_no: string;
  status: string;
  claim_type: string;
  requested_action: string | null;
  supplier_response: string | null;
  supplier_name?: string | null;
  /**
   * Does the PO line this claim came off still owe us units?
   *
   * Only consulted for a `late_delivery` claim, and only to answer one
   * question: did the goods turn up? A late claim whose goods have since
   * arrived must stop saying the supplier owes the next move — that is the
   * "crying wolf" failure, and it would hit the ONE claim type that is minted
   * automatically every night.
   *
   * `null` = we could not tell (the PO line was deleted — `po_line_id` is ON
   * DELETE SET NULL). Unknown counts as STILL PENDING: the safe answer keeps
   * chasing a supplier who may owe us goods, rather than inventing a delivery
   * that may not have happened.
   */
  line_pending?: boolean | null;
}

/** The supplier's name, or the role word when nothing is stored. COPY-STANDARD:
 *  name the party when the system knows it — the role word is the honest
 *  fallback, never a blank. */
function party(name: string | null | undefined): string {
  return name && name.trim() ? name.trim() : "supplier";
}

/**
 * Who owes the next move on this claim, and what that move is.
 *
 * ONE function, read by the queue column, the row's action button and the
 * tests — so the sentence on screen and the button underneath it can never
 * describe different steps.
 *
 * `Close` is the only verb here outside COPY-STANDARD's four-verb dictionary
 * (Assign · Call · Issue · Upload). The dictionary has no verb for ending a
 * case, and a claim needs one: the goods came back and the matter is settled.
 * FLAGGED for Jess rather than silently adopted.
 */
export function claimNextMove(c: SupplierClaimMoveInput): SupplierClaimMove {
  if (c.status === "closed") return { key: "done", owner: null, label: "" };

  const who = party(c.supplier_name);
  const late = c.claim_type === SUPPLIER_CLAIM_LATE;
  // Unknown counts as pending — see `line_pending` above.
  const stillPending = c.line_pending !== false;

  if (!c.requested_action) {
    // A late claim is born with its ask stamped, so this branch is the
    // arrived-goods case: somebody must decide what we want done about it.
    return {
      key: "ask",
      owner: "carres",
      label: `Call ${who} — agree the fix`,
    };
  }

  if (!c.supplier_response) {
    if (late && !stillPending) {
      // They never answered — they just delivered. Ours to record and close.
      return {
        key: "close",
        owner: "carres",
        label: `Close ${c.claim_no} — ${who} delivered the rest`,
      };
    }
    // R8 (2026-07-28) — this step, and ONLY this step, has a dictionary row.
    // COPY-STANDARD's PURCHASING table locks it as queue `Confirm what happens
    // next` / row `Call {supplier} — confirm what happens next`, and the Claims
    // tab has printed that tile since P2 while the row said two other things.
    // Loo's ruling that retired `Contact supplier` names this exact action, so
    // the line is taken from the mirror rather than spelt here.
    //
    // The `late` variant is gone deliberately: one action has ONE row line, and
    // "the new delivery date" was a second spelling of the same ask. Reported in
    // the PR — it is the one thing this rename makes less specific.
    return {
      key: "answer",
      owner: "supplier",
      label: purchasingActionLine("confirm_what_happens_next", {
        supplier: c.supplier_name,
      }),
    };
  }

  return {
    key: "close",
    owner: "carres",
    label:
      c.supplier_response === "reject"
        ? `Close ${c.claim_no} — ${who} refused`
        : `Close ${c.claim_no} — ${who} agreed: ${supplierClaimResponseLabel(
            c.supplier_response,
          )}`,
  };
}

/** The word on the owner chip. "Carres" is the company, never "us"/"me" — the
 *  reader may be any of nine roles. */
export function claimMoveOwnerLabel(
  owner: SupplierClaimMoveOwner | null,
  supplierName?: string | null,
): string {
  if (owner === null) return "—";
  return owner === "carres" ? "Carres" : party(supplierName);
}

/**
 * May this claim be closed?
 *
 * The card's done-when: "closed claims keep both sides." A claim closed with
 * one side blank is a claim nobody can learn from, so both the ask and the
 * answer must be on file first — enforced here, in the RPC and by a CHECK
 * constraint (0291).
 *
 * There is deliberately NO escape hatch for a supplier who never answers. That
 * claim stays open and keeps naming them, which is exactly what R5's
 * "avg claim-resolution days" needs to see.
 */
export type SupplierClaimCloseProblem =
  | "already_closed"
  | "request_required"
  | "response_required";

export function claimCloseProblems(c: {
  status: string;
  requested_action: string | null;
  supplier_response: string | null;
}): SupplierClaimCloseProblem[] {
  const out: SupplierClaimCloseProblem[] = [];
  if (c.status === "closed") out.push("already_closed");
  if (!c.requested_action) out.push("request_required");
  if (!c.supplier_response) out.push("response_required");
  return out;
}

/** Plain words for the operator — the copy law: an error gives the fix. */
export const SUPPLIER_CLAIM_CLOSE_PROBLEM_TEXT: Record<
  SupplierClaimCloseProblem,
  string
> = {
  already_closed: "This claim is already closed.",
  request_required: "Say what we asked the supplier to do.",
  response_required: "Record what the supplier answered.",
};

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
  // R3 — the two sides, kept apart.
  requested_action: SupplierClaimRequest | null;
  requested_at: string | null;
  supplier_response: SupplierClaimResponse | null;
  supplier_response_note: string | null;
  responded_at: string | null;
  closed_at: string | null;
  close_note: string | null;
  // Layer ③ — what we are doing for the CUSTOMER (0324). A SECOND decision
  // beside the item's outcome, never a replacement for it.
  customer_resolution: CustomerResolution | null;
  customer_resolution_note: string | null;
  customer_resolution_at: string | null;
  // Layer ④ — in what ORDER the goods move (0409). Independent of ③: the same
  // `replace` can be executed five ways, and two of them leave Carres holding a
  // different number of units.
  carres_execution: CarresExecution | null;
  carres_execution_note: string | null;
  carres_execution_at: string | null;
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
