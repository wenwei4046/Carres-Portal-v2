import { describe, it, expect } from "vitest";
import {
  SUPPLIER_CLAIM_TYPES,
  SUPPLIER_CLAIM_TYPE_KEYS,
  SUPPLIER_CLAIM_LATE,
  supplierClaimTypeLabel,
  supplierClaimStatusLabel,
  wrongItemClaimTypesFor,
  isWrongItemClaimTypeFor,
  claimNeedsEvidence,
  receiveLineClaimProblems,
  RECEIVE_LINE_CLAIM_PROBLEM_TEXT,
  supplierClaimSummary,
  SUPPLIER_CLAIM_REQUEST_KEYS,
  SUPPLIER_CLAIM_REQUEST_REMAINING,
  SUPPLIER_CLAIM_RESPONSES,
  SUPPLIER_CLAIM_RESPONSE_KEYS,
  SUPPLIER_CLAIM_CLOSE_PROBLEM_TEXT,
  supplierClaimRequestLabel,
  supplierClaimResponseLabel,
  requestedActionsFor,
  isRequestedActionFor,
  responseNeedsNote,
  claimNextMove,
  claimMoveOwnerLabel,
  claimCloseProblems,
  CUSTOMER_RESOLUTIONS,
  CUSTOMER_RESOLUTION_KEYS,
  CUSTOMER_RESOLUTION_MEANING,
  customerResolutionLabel,
  customerResolutionMeaning,
  isCustomerResolution,
  CARRES_EXECUTIONS,
  CARRES_EXECUTION_KEYS,
  CARRES_EXECUTION_MEANING,
  carresExecutionLabel,
  carresExecutionMeaning,
  isCarresExecution,
  type CarresExecution,
  type CustomerResolution,
  type ReceiveLineClaimDraft,
  type SupplierClaimMoveInput,
} from "./supplier-claim";
import { STOCK_HOLD_OUTCOMES, STOCK_HOLD_OUTCOME_KEYS } from "./stock-hold";
import { CASE_ISSUE_KEYS, caseIssuesFor } from "./service-case-intake";

function draft(over: Partial<ReceiveLineClaimDraft> = {}): ReceiveLineClaimDraft {
  return {
    damagedQty: 0,
    damagedPhotos: [],
    wrongItemQty: 0,
    wrongItemClaimType: null,
    wrongItemPhotos: [],
    category: "mattress",
    ...over,
  };
}

describe("supplier claim vocabulary — S1's words plus exactly one", () => {
  it("carries every service-case issue key", () => {
    for (const k of CASE_ISSUE_KEYS) expect(SUPPLIER_CLAIM_TYPE_KEYS).toContain(k);
  });

  it("adds late_delivery and nothing else", () => {
    const extra = SUPPLIER_CLAIM_TYPE_KEYS.filter(
      (k) => !(CASE_ISSUE_KEYS as readonly string[]).includes(k),
    );
    expect(extra).toEqual([SUPPLIER_CLAIM_LATE]);
  });

  it("labels a key, and falls back to the key itself", () => {
    expect(supplierClaimTypeLabel("colour_uneven")).toBe("Colour uneven");
    expect(supplierClaimTypeLabel(SUPPLIER_CLAIM_LATE)).toBe("Late delivery");
    expect(supplierClaimTypeLabel(null)).toBe("—");
    expect(supplierClaimTypeLabel("something_new")).toBe("something_new");
  });

  it("has no duplicate keys", () => {
    expect(new Set(SUPPLIER_CLAIM_TYPE_KEYS).size).toBe(SUPPLIER_CLAIM_TYPES.length);
  });

  it("labels a status", () => {
    expect(supplierClaimStatusLabel("open")).toBe("Open");
    expect(supplierClaimStatusLabel("closed")).toBe("Closed");
    expect(supplierClaimStatusLabel(undefined)).toBe("—");
  });
});

describe("wrong-item claim types follow the category (Jess's own lists)", () => {
  it("mattress offers Wrong SKU + Other — no missing parts, no uneven colour", () => {
    expect(wrongItemClaimTypesFor("mattress").map((o) => o.key)).toEqual([
      "wrong_sku",
      "other",
    ]);
  });

  it("bed frame adds parts / spec / colour", () => {
    expect(wrongItemClaimTypesFor("bedframe").map((o) => o.key)).toEqual([
      "missing_parts",
      "wrong_spec",
      "wrong_colour",
      "other",
    ]);
  });

  it("sofa adds colour uneven on top of the bed-frame list", () => {
    expect(wrongItemClaimTypesFor("sofa").map((o) => o.key)).toEqual([
      "missing_parts",
      "wrong_spec",
      "wrong_colour",
      "colour_uneven",
      "other",
    ]);
  });

  it("never offers `damaged` — damage has its own box, and the two counters must stay disjoint", () => {
    for (const cat of ["mattress", "bedframe", "sofa", "other"] as const) {
      expect(wrongItemClaimTypesFor(cat).map((o) => o.key)).not.toContain("damaged");
      // …but the underlying S1 list DOES carry it, i.e. we filtered rather
      // than forked the vocabulary.
      expect(caseIssuesFor(cat).map((o) => o.key)).toContain("damaged");
    }
  });
});

describe("isWrongItemClaimTypeFor", () => {
  it("accepts a type on its own category", () => {
    expect(isWrongItemClaimTypeFor("sofa", "colour_uneven")).toBe(true);
  });

  it("refuses a type that belongs to another category", () => {
    expect(isWrongItemClaimTypeFor("mattress", "colour_uneven")).toBe(false);
    expect(isWrongItemClaimTypeFor("bedframe", "colour_uneven")).toBe(false);
  });

  it("refuses damaged and late_delivery in every category", () => {
    for (const cat of ["mattress", "bedframe", "sofa", "other"] as const) {
      expect(isWrongItemClaimTypeFor(cat, "damaged")).toBe(false);
      expect(isWrongItemClaimTypeFor(cat, SUPPLIER_CLAIM_LATE)).toBe(false);
    }
  });

  it("refuses nothing-at-all and an unknown word", () => {
    expect(isWrongItemClaimTypeFor("sofa", null)).toBe(false);
    expect(isWrongItemClaimTypeFor("sofa", "")).toBe(false);
    expect(isWrongItemClaimTypeFor("sofa", "smells_funny")).toBe(false);
  });

  it("an unnamed category accepts any issue key rather than blocking a receiving", () => {
    expect(isWrongItemClaimTypeFor("other", "colour_uneven")).toBe(true);
    expect(isWrongItemClaimTypeFor("other", "wrong_spec")).toBe(true);
    // still not the two reserved words
    expect(isWrongItemClaimTypeFor("other", "damaged")).toBe(false);
    expect(isWrongItemClaimTypeFor("other", "not_a_key")).toBe(false);
  });
});

describe("the evidence law — no evidence, no claim", () => {
  it("damage and wrong item need a photo; a late delivery does not", () => {
    expect(claimNeedsEvidence("damaged")).toBe(true);
    expect(claimNeedsEvidence("wrong_colour")).toBe(true);
    expect(claimNeedsEvidence(SUPPLIER_CLAIM_LATE)).toBe(false);
  });

  it("a clean line has nothing to prove", () => {
    expect(receiveLineClaimProblems(draft())).toEqual([]);
  });

  it("damage without a photo cannot be filed", () => {
    expect(receiveLineClaimProblems(draft({ damagedQty: 2 }))).toEqual([
      "damaged_photo_required",
    ]);
    expect(
      receiveLineClaimProblems(draft({ damagedQty: 2, damagedPhotos: ["a.jpg"] })),
    ).toEqual([]);
  });

  it("a wrong item needs BOTH a kind and a photo", () => {
    expect(receiveLineClaimProblems(draft({ wrongItemQty: 1 }))).toEqual([
      "wrong_item_type_required",
      "wrong_item_photo_required",
    ]);
    expect(
      receiveLineClaimProblems(
        draft({ wrongItemQty: 1, wrongItemClaimType: "wrong_sku" }),
      ),
    ).toEqual(["wrong_item_photo_required"]);
    expect(
      receiveLineClaimProblems(
        draft({
          wrongItemQty: 1,
          wrongItemClaimType: "wrong_sku",
          wrongItemPhotos: ["a.jpg"],
        }),
      ),
    ).toEqual([]);
  });

  it("names an off-category kind as invalid, not merely missing", () => {
    expect(
      receiveLineClaimProblems(
        draft({
          wrongItemQty: 1,
          wrongItemClaimType: "colour_uneven",
          wrongItemPhotos: ["a.jpg"],
        }),
      ),
    ).toEqual(["wrong_item_type_invalid"]);
  });

  it("reports both problems when one line is damaged AND wrong", () => {
    expect(
      receiveLineClaimProblems(draft({ damagedQty: 1, wrongItemQty: 1 })),
    ).toEqual([
      "damaged_photo_required",
      "wrong_item_type_required",
      "wrong_item_photo_required",
    ]);
  });

  it("every problem has plain-words text for the operator", () => {
    const all = receiveLineClaimProblems(
      draft({ damagedQty: 1, wrongItemQty: 1, wrongItemClaimType: "nope" }),
    );
    expect(all.length).toBeGreaterThan(0);
    for (const p of all) {
      expect(RECEIVE_LINE_CLAIM_PROBLEM_TEXT[p]).toBeTruthy();
      // plain words — no snake_case codes leaking to the operator
      expect(RECEIVE_LINE_CLAIM_PROBLEM_TEXT[p]).not.toMatch(/_/);
    }
  });
});

describe("supplierClaimSummary", () => {
  it("says units, kind and SKU in one line", () => {
    expect(
      supplierClaimSummary({ qty: 3, claim_type: "damaged", sku: "MS01-K" }),
    ).toBe("3 units · Damaged · MS01-K");
  });

  it("says `1 unit`, not `1 units`", () => {
    expect(
      supplierClaimSummary({ qty: 1, claim_type: SUPPLIER_CLAIM_LATE, sku: "BF02-Q" }),
    ).toBe("1 unit · Late delivery · BF02-Q");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// R3 · the lifecycle — what we asked, what they answered, who moves next
// ═══════════════════════════════════════════════════════════════════════════

function move(over: Partial<SupplierClaimMoveInput> = {}): SupplierClaimMoveInput {
  return {
    claim_no: "SC-1001",
    status: "open",
    claim_type: "damaged",
    requested_action: null,
    supplier_response: null,
    supplier_name: "Ohana",
    ...over,
  };
}

describe("the ask and the answer are two separate closed lists", () => {
  it("offers Jess's five asks for goods that arrived", () => {
    expect(requestedActionsFor("damaged").map((r) => r.label)).toEqual([
      "Replace",
      "Deliver missing parts",
      "Deliver correct item",
      "Repair",
      "Return for inspection",
    ]);
  });

  it("offers NOTHING to pick on a late claim — its ask is stamped at birth", () => {
    expect(requestedActionsFor(SUPPLIER_CLAIM_LATE)).toEqual([]);
    expect(
      isRequestedActionFor(SUPPLIER_CLAIM_LATE, SUPPLIER_CLAIM_REQUEST_REMAINING),
    ).toBe(true);
  });

  it("never offers `Deliver remaining` for goods that are already here", () => {
    for (const t of SUPPLIER_CLAIM_TYPE_KEYS.filter((k) => k !== SUPPLIER_CLAIM_LATE)) {
      expect(requestedActionsFor(t).map((r) => r.key)).not.toContain(
        SUPPLIER_CLAIM_REQUEST_REMAINING,
      );
      expect(isRequestedActionFor(t, SUPPLIER_CLAIM_REQUEST_REMAINING)).toBe(false);
    }
  });

  it("refuses an arrived-goods ask on a late claim — nothing arrived to repair", () => {
    for (const a of ["replace", "repair", "return_for_inspection"]) {
      expect(isRequestedActionFor(SUPPLIER_CLAIM_LATE, a)).toBe(false);
    }
  });

  it("refuses junk and blanks on both sides", () => {
    expect(isRequestedActionFor("damaged", "please_fix_it")).toBe(false);
    expect(isRequestedActionFor("damaged", null)).toBe(false);
    expect(isRequestedActionFor(null, "replace")).toBe(false);
    expect(supplierClaimRequestLabel(null)).toBe("—");
    expect(supplierClaimResponseLabel(null)).toBe("—");
  });

  it("keeps the supplier's answer list wide — they may offer anything, or refuse", () => {
    expect(SUPPLIER_CLAIM_RESPONSES.map((r) => r.label)).toEqual([
      "Replacement",
      "Deliver remaining",
      "Repair",
      "Return & replace",
      "Reject",
      "Other agreement",
    ]);
  });

  it("demands a note for the two answers that say nothing by themselves", () => {
    expect(responseNeedsNote("reject")).toBe(true);
    expect(responseNeedsNote("other_agreement")).toBe(true);
    for (const r of ["replacement", "deliver_remaining", "repair", "return_and_replace"]) {
      expect(responseNeedsNote(r)).toBe(false);
    }
  });

  it("labels every key — no raw snake_case ever reaches the screen", () => {
    for (const k of SUPPLIER_CLAIM_REQUEST_KEYS)
      expect(supplierClaimRequestLabel(k)).not.toMatch(/_/);
    for (const k of SUPPLIER_CLAIM_RESPONSE_KEYS)
      expect(supplierClaimResponseLabel(k)).not.toMatch(/_/);
  });
});

describe("claimNextMove — who owes the next move", () => {
  it("a fresh damage claim is OURS: nobody has said what we want", () => {
    expect(claimNextMove(move())).toEqual({
      key: "ask",
      owner: "carres",
      label: "Call Ohana — agree the fix",
    });
  });

  it("once we have asked, the SUPPLIER owes the answer", () => {
    // R8 — the ONE step of this lifecycle with a dictionary row, so its line is
    // COPY-STANDARD's verbatim (PURCHASING: `Confirm what happens next`).
    expect(claimNextMove(move({ requested_action: "replace" }))).toEqual({
      key: "answer",
      owner: "supplier",
      label: "Call Ohana — confirm what happens next",
    });
  });

  it("a late claim reads the SAME line — one action has one row line", () => {
    expect(
      claimNextMove(
        move({
          claim_type: SUPPLIER_CLAIM_LATE,
          requested_action: SUPPLIER_CLAIM_REQUEST_REMAINING,
        }),
      ),
    ).toEqual({
      key: "answer",
      owner: "supplier",
      // R8 — this branch used to read `confirm the new delivery date`. One
      // action has ONE row line; the specificity loss is reported in the PR.
      label: "Call Ohana — confirm what happens next",
    });
  });

  it("a late claim whose goods HAVE arrived stops blaming the supplier", () => {
    // The crying-wolf trap: late claims are minted every night by the sweep,
    // and the sweep never closes one.
    expect(
      claimNextMove(
        move({
          claim_type: SUPPLIER_CLAIM_LATE,
          requested_action: SUPPLIER_CLAIM_REQUEST_REMAINING,
          line_pending: false,
        }),
      ),
    ).toEqual({
      key: "close",
      owner: "carres",
      label: "Close SC-1001 — Ohana delivered the rest",
    });
  });

  it("treats an unknown line as STILL pending — never invents a delivery", () => {
    for (const p of [null, undefined, true]) {
      expect(
        claimNextMove(
          move({
            claim_type: SUPPLIER_CLAIM_LATE,
            requested_action: SUPPLIER_CLAIM_REQUEST_REMAINING,
            line_pending: p,
          }),
        ).owner,
      ).toBe("supplier");
    }
  });

  it("only a LATE claim reads the line — arrived goods are already here", () => {
    expect(
      claimNextMove(move({ requested_action: "replace", line_pending: false })).owner,
    ).toBe("supplier");
  });

  it("an answered claim comes back to us to close, and names what they agreed", () => {
    expect(
      claimNextMove(
        move({ requested_action: "replace", supplier_response: "replacement" }),
      ),
    ).toEqual({
      key: "close",
      owner: "carres",
      label: "Close SC-1001 — Ohana agreed: Replacement",
    });
  });

  it("says `refused`, never `agreed: Reject`", () => {
    expect(
      claimNextMove(
        move({ requested_action: "replace", supplier_response: "reject" }),
      ).label,
    ).toBe("Close SC-1001 — Ohana refused");
  });

  it("a closed claim owes nobody anything and shows no action", () => {
    expect(
      claimNextMove(
        move({
          status: "closed",
          requested_action: "replace",
          supplier_response: "replacement",
        }),
      ),
    ).toEqual({ key: "done", owner: null, label: "" });
  });

  it("falls back to the role word when the supplier has no name on file", () => {
    for (const n of [null, "", "   "]) {
      expect(claimNextMove(move({ supplier_name: n })).label).toBe(
        "Call supplier — agree the fix",
      );
    }
  });

  it("every open action names a party and stays under 10 words", () => {
    const states: Partial<SupplierClaimMoveInput>[] = [
      {},
      { requested_action: "replace" },
      { requested_action: "replace", supplier_response: "repair" },
      { requested_action: "replace", supplier_response: "reject" },
      {
        claim_type: SUPPLIER_CLAIM_LATE,
        requested_action: SUPPLIER_CLAIM_REQUEST_REMAINING,
      },
      {
        claim_type: SUPPLIER_CLAIM_LATE,
        requested_action: SUPPLIER_CLAIM_REQUEST_REMAINING,
        line_pending: false,
      },
    ];
    for (const s of states) {
      const m = claimNextMove(move(s));
      expect(m.owner).not.toBeNull();
      expect(m.label).toContain("Ohana");
      expect(m.label.split(/\s+/).length).toBeLessThanOrEqual(10);
      // COPY-STANDARD banned words must never reach a label.
      expect(m.label.toLowerCase()).not.toMatch(
        /chase|pending|waiting|at risk|attention|processing/,
      );
    }
  });

  it("names the owner in words a reader of any role understands", () => {
    expect(claimMoveOwnerLabel("carres")).toBe("Carres");
    expect(claimMoveOwnerLabel("supplier", "Ohana")).toBe("Ohana");
    expect(claimMoveOwnerLabel("supplier", null)).toBe("supplier");
    expect(claimMoveOwnerLabel(null)).toBe("—");
  });
});

describe("claimCloseProblems — a closed claim keeps both sides", () => {
  it("lets a fully-recorded open claim close", () => {
    expect(
      claimCloseProblems({
        status: "open",
        requested_action: "replace",
        supplier_response: "replacement",
      }),
    ).toEqual([]);
  });

  it("refuses to close with either side blank", () => {
    expect(
      claimCloseProblems({
        status: "open",
        requested_action: null,
        supplier_response: "replacement",
      }),
    ).toEqual(["request_required"]);
    expect(
      claimCloseProblems({
        status: "open",
        requested_action: "replace",
        supplier_response: null,
      }),
    ).toEqual(["response_required"]);
    expect(
      claimCloseProblems({
        status: "open",
        requested_action: null,
        supplier_response: null,
      }),
    ).toEqual(["request_required", "response_required"]);
  });

  it("refuses to close a claim twice", () => {
    expect(
      claimCloseProblems({
        status: "closed",
        requested_action: "replace",
        supplier_response: "replacement",
      }),
    ).toEqual(["already_closed"]);
  });

  it("gives the operator the fix in plain words", () => {
    const all = claimCloseProblems({
      status: "closed",
      requested_action: null,
      supplier_response: null,
    });
    for (const p of all) {
      expect(SUPPLIER_CLAIM_CLOSE_PROBLEM_TEXT[p]).toBeTruthy();
      expect(SUPPLIER_CLAIM_CLOSE_PROBLEM_TEXT[p]).not.toMatch(/_/);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Layer ③ · Customer Resolution (Loo, 2026-08-05 · migration 0324)
// ═══════════════════════════════════════════════════════════════════════════
//
// The claim carries four layers and they may never be collapsed. What these
// tests pin is mostly what the list must NOT contain: every option §6 names and
// removes is asserted BY NAME, because the failure this card exists to prevent
// is a future chat folding the two decisions back into one longer list.

describe("Customer Resolution — what are we doing for the CUSTOMER?", () => {
  it("offers Loo's four, in his order and with his spelling", () => {
    expect(CUSTOMER_RESOLUTIONS.map((r) => r.label)).toEqual([
      "Replace",
      "Repair",
      "Accept As-Is",
      "No Replacement Required",
    ]);
    expect(CUSTOMER_RESOLUTION_KEYS).toEqual([
      "replace",
      "repair",
      "accept_as_is",
      "no_replacement_required",
    ]);
  });

  it("holds NONE of the options §6 removed, each refused by name", () => {
    // `Return to Supplier` and `Write Off` answer what happened to the ITEM;
    // `Cancel Outstanding` was renamed; the rest are SUPPLIER answers; and
    // `Refund` has no frozen business meaning, so nobody may guess it.
    for (const removed of [
      "return_to_supplier",
      "returned",
      "write_off",
      "written_off",
      "cancel_outstanding",
      "reject",
      "deliver_remaining",
      "replacement",
      "return_and_replace",
      "refund",
    ]) {
      expect(isCustomerResolution(removed), removed).toBe(false);
    }
  });

  it("is a SECOND decision, not a longer list — the two share no key", () => {
    // Loo's test: can both be true at once? The customer cancelled AND the
    // mattress is destroyed. If the two lists ever shared a key, one screen
    // would eventually offer it once and the operator would have to choose
    // which truth to record.
    for (const key of CUSTOMER_RESOLUTION_KEYS) {
      expect(STOCK_HOLD_OUTCOME_KEYS as readonly string[]).not.toContain(key);
    }
    for (const key of STOCK_HOLD_OUTCOME_KEYS) {
      expect(isCustomerResolution(key), key).toBe(false);
    }
  });

  it("holds none of the four SUPPLIER answers §6 removed by name", () => {
    // `repair` deliberately appears on BOTH lists and that is not a collision:
    // the supplier saying "we will repair it" is their answer, and Carres
    // deciding the customer gets a repair is our decision. They are different
    // columns, they can disagree, and §6 removed only the four below —
    // `Reject` · `Deliver Remaining` · `Replacement` · `Return and Replace` —
    // because each is a thing only the supplier can say.
    for (const key of ["reject", "deliver_remaining", "replacement", "return_and_replace"]) {
      expect(SUPPLIER_CLAIM_RESPONSE_KEYS as readonly string[]).toContain(key);
      expect(CUSTOMER_RESOLUTION_KEYS as readonly string[]).not.toContain(key);
    }
  });

  it("labels every key, and never prints a raw column value", () => {
    for (const r of CUSTOMER_RESOLUTIONS) {
      expect(customerResolutionLabel(r.key)).toBe(r.label);
      expect(r.label).not.toMatch(/_/);
    }
    expect(customerResolutionLabel(null)).toBe("—");
    expect(customerResolutionLabel(undefined)).toBe("—");
  });

  it("explains each option in one plain line — a DEFINITION, never a consequence", () => {
    // Consequences are f(Resolution, Execution). Execution was unbuilt when
    // this was first pinned; layer ④ (0409) built it, so both arguments now
    // exist — and the invariant is UNCHANGED, for a different reason. The pair
    // is computable; WHICH stock, finance and demand moves it produces has
    // never been ruled, so a guide line naming one is still wrong by law 5.
    for (const key of CUSTOMER_RESOLUTION_KEYS) {
      const line = CUSTOMER_RESOLUTION_MEANING[key as CustomerResolution];
      expect(line).toBeTruthy();
      expect(line).not.toMatch(/_/);
      expect(line).not.toMatch(/stock|refund|credit|invoice|outstanding|write.?off/i);
    }
    // Loo's business laws 1 and 2, said out loud rather than left to be learnt.
    expect(CUSTOMER_RESOLUTION_MEANING.replace).toContain("NEW item");
    expect(CUSTOMER_RESOLUTION_MEANING.repair).toContain("SAME customer");
    expect(customerResolutionMeaning("no_such_option")).toBeNull();
    expect(customerResolutionMeaning(null)).toBeNull();
  });

  it("changes nothing about who owes the next move", () => {
    // The Next Action region belongs to the unbuilt Workspace layer. Recording
    // a resolution must not silently re-word the queue, the row or the button.
    const base: SupplierClaimMoveInput = {
      claim_no: "SC-1001",
      status: "open",
      claim_type: "damaged",
      requested_action: "replace",
      supplier_response: "reject",
      supplier_name: "Ohana",
    };
    expect(claimNextMove(base)).toEqual(claimNextMove({ ...base }));
    expect(claimNextMove(base).key).toBe("close");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Layer ④ · Carres Execution (Loo, 2026-08-05 · migration 0409)
// ═══════════════════════════════════════════════════════════════════════════
//
// The last of the four layers, ruled the same day as layer ③ and unbuilt for
// four weeks. What these tests pin is the SEPARATION: this is a third axis, not
// a longer version of an existing list, and the failure they exist to prevent
// is a future chat folding it back into the resolution or the item outcome.

describe("Carres Execution — in what ORDER do the goods move?", () => {
  it("offers Loo's five, in his order and with his spelling", () => {
    expect(CARRES_EXECUTIONS.map((e) => e.label)).toEqual([
      "Return to Supplier",
      "Collect Defective Item",
      "Replace First",
      "Collect First",
      "Exchange on Collection",
    ]);
    expect(CARRES_EXECUTION_KEYS).toEqual([
      "return_to_supplier",
      "collect_defective_item",
      "replace_first",
      "collect_first",
      "exchange_on_collection",
    ]);
  });

  it("admits no word belonging to another layer, each refused by name", () => {
    // The four customer resolutions answer what the customer GETS; the supplier
    // answers are theirs to say; `write_off` / `put_back_in_stock` are ITEM
    // outcomes. Folding any of them in here is the collapse Loo's model forbids.
    for (const foreign of [
      "replace",
      "repair",
      "accept_as_is",
      "no_replacement_required",
      "write_off",
      "written_off",
      "put_back_in_stock",
      "reject",
      "deliver_remaining",
      "replacement",
      "return_and_replace",
      "refund",
    ]) {
      expect(isCarresExecution(foreign), foreign).toBe(false);
    }
    expect(isCarresExecution(null)).toBe(false);
    expect(isCarresExecution("")).toBe(false);
  });

  it("shares NO key with the customer resolution — a third axis, not a longer list", () => {
    // Loo's test again: can both be true at once? `Replace` is the promise and
    // `Replace First` is one way of keeping it, so both are recorded and the
    // two lists must never offer the same key on one screen.
    for (const key of CARRES_EXECUTION_KEYS) {
      expect(CUSTOMER_RESOLUTION_KEYS as readonly string[]).not.toContain(key);
      expect(isCustomerResolution(key), key).toBe(false);
    }
    for (const key of CUSTOMER_RESOLUTION_KEYS) {
      expect(isCarresExecution(key), key).toBe(false);
    }
  });

  it("SHARES `return_to_supplier` with the item outcome, and that is the ruling", () => {
    // The one deliberate overlap in the whole model, settled the same way
    // COPY-STANDARD settles `Repair` on two lists. The Item Outcome is where
    // the UNIT ended up; this is the CHOREOGRAPHY — specifically that there is
    // no customer leg at all, which is what makes it the fifth option rather
    // than four. A chat that "de-duplicates" this breaks the count above.
    expect(isCarresExecution("return_to_supplier")).toBe(true);
    expect(STOCK_HOLD_OUTCOME_KEYS as readonly string[]).toContain("returned");

    // …and they are DIFFERENT keys — `returned` there, `return_to_supplier`
    // here — so neither list can be read as the other by a join or a careless
    // `includes`, and a claim can execute one while the unit ends the other way.
    expect(CARRES_EXECUTION_KEYS as readonly string[]).not.toContain("returned");
    expect(STOCK_HOLD_OUTCOME_KEYS as readonly string[]).not.toContain(
      "return_to_supplier",
    );

    // 🟡 THE LABELS ARE ONE TENSE APART, and both are Loo's ruled spellings:
    // `Return to Supplier` (this list) and `Returned to supplier` (the item
    // outcome) render about seven lines apart on the same panel. Pinned rather
    // than renamed — neither is ours to change — so that if either is ever
    // re-ruled, this test names the other one that has to move with it.
    expect(carresExecutionLabel("return_to_supplier")).toBe("Return to Supplier");
    expect(
      STOCK_HOLD_OUTCOMES.find((o) => o.key === "returned")?.label,
    ).toBe("Returned to supplier");
  });

  it("labels every key, and never prints a raw column value", () => {
    for (const e of CARRES_EXECUTIONS) {
      expect(carresExecutionLabel(e.key)).toBe(e.label);
      expect(e.label).not.toMatch(/_/);
    }
    expect(carresExecutionLabel(null)).toBe("—");
    expect(carresExecutionLabel(undefined)).toBe("—");
  });

  it("explains each option in one plain line — a DEFINITION, never a consequence", () => {
    // Both arguments of f(Resolution, Execution) exist now. The function does
    // not: which stock, finance and demand moves each pair produces has never
    // been ruled, so a line naming one would be a guess wearing a screen's
    // authority — the same law layer ③'s meanings carry.
    for (const key of CARRES_EXECUTION_KEYS) {
      const line = CARRES_EXECUTION_MEANING[key as CarresExecution];
      expect(line).toBeTruthy();
      expect(line).not.toMatch(/_/);
      expect(line).not.toMatch(/stock|refund|credit|invoice|outstanding|write.?off/i);
    }
    // The ORDER is the decision, and the two that differ in nothing else say so
    // in words an operator cannot skim past. Getting these backwards sends a
    // van to the wrong address.
    expect(CARRES_EXECUTION_MEANING.replace_first).toContain("BEFORE");
    expect(CARRES_EXECUTION_MEANING.collect_first).toContain("BEFORE");
    expect(CARRES_EXECUTION_MEANING.replace_first).not.toEqual(
      CARRES_EXECUTION_MEANING.collect_first,
    );
    expect(carresExecutionMeaning("no_such_option")).toBeNull();
    expect(carresExecutionMeaning(null)).toBeNull();
  });

  it("changes nothing about who owes the next move", () => {
    // The Next Action region belongs to the unbuilt Workspace layer. Recording
    // an execution must not silently re-word the queue, the row or the button —
    // the same guard layer ③ carries, for the same reason.
    const base: SupplierClaimMoveInput = {
      claim_no: "SC-1001",
      status: "open",
      claim_type: "damaged",
      requested_action: "replace",
      supplier_response: "reject",
      supplier_name: "Ohana",
    };
    expect(claimNextMove(base)).toEqual(claimNextMove({ ...base }));
    expect(claimNextMove(base).key).toBe("close");
  });
});
