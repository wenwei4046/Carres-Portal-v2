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
  type ReceiveLineClaimDraft,
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
