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
  type ReceiveLineClaimDraft,
  type SupplierClaimMoveInput,
} from "./supplier-claim";
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
