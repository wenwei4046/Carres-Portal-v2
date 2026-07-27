import { describe, it, expect } from "vitest";
import {
  CASE_ISSUES,
  CASE_ISSUES_BY_CATEGORY,
  CASE_ISSUE_KEYS,
  CASE_PRODUCT_CATEGORY_KEYS,
  CASE_REPORTER_KEYS,
  CASE_USABLE_OPTIONS,
  CASE_WANTS,
  caseIntakeComplete,
  caseIssuesFor,
  caseNeedsManager,
  casePriorityFor,
  caseProductCategory,
  composeCaseSummary,
  type CaseIntakeAnswers,
} from "./service-case-intake";

/**
 * S1 — the guided intake. These tests guard the three things a screen bug
 * cannot reveal:
 *   1. the priority LAW (staff never pick it; "No" must always mean High),
 *   2. the per-category issue lists (offering "Colour uneven" on a mattress
 *      invites an answer that means nothing),
 *   3. that the composed sentence still reads like the prose every existing
 *      reader (list column, printable Service Note) expects.
 */

describe("caseProductCategory", () => {
  it("routes core goods through the SAME classifier the orders grid uses", () => {
    expect(caseProductCategory("mattress:FIRMCARE/SIZE:K")).toBe("mattress");
    expect(caseProductCategory("bedframe:JAGER/SIZE:Q")).toBe("bedframe");
    expect(caseProductCategory("sofa:GLANO")).toBe("sofa");
    // AutoCount free-text SKUs, the shape most live lines carry.
    expect(caseProductCategory("MS1401F-K")).toBe("mattress");
    expect(caseProductCategory("SF2201 3 Seater")).toBe("sofa");
  });

  it("files accessories and service charges under 'other', never a core family", () => {
    expect(caseProductCategory("Mattress Protector")).toBe("other");
    expect(caseProductCategory("Transport Fee")).toBe("other");
  });

  it("falls back to 'other' when there is no product at all", () => {
    // Every service case on file today has no linked order — the wizard must
    // still reach step 3 rather than dead-end.
    expect(caseProductCategory(null)).toBe("other");
    expect(caseProductCategory("")).toBe("other");
  });
});

describe("issue lists per category", () => {
  it("offers Jess's lists verbatim", () => {
    expect(CASE_ISSUES_BY_CATEGORY.mattress).toEqual(["wrong_sku", "damaged", "other"]);
    expect(CASE_ISSUES_BY_CATEGORY.bedframe).toEqual([
      "missing_parts", "wrong_spec", "wrong_colour", "damaged", "other",
    ]);
    expect(CASE_ISSUES_BY_CATEGORY.sofa).toEqual([
      "missing_parts", "wrong_spec", "wrong_colour", "colour_uneven", "damaged", "other",
    ]);
  });

  it("never offers a mattress an issue that cannot happen to a mattress", () => {
    expect(CASE_ISSUES_BY_CATEGORY.mattress).not.toContain("missing_parts");
    expect(CASE_ISSUES_BY_CATEGORY.mattress).not.toContain("colour_uneven");
  });

  it("keeps 'Colour uneven' to the sofa, where it is a real complaint", () => {
    for (const cat of CASE_PRODUCT_CATEGORY_KEYS) {
      if (cat === "sofa") continue;
      expect(CASE_ISSUES_BY_CATEGORY[cat]).not.toContain("colour_uneven");
    }
  });

  it("every category offers 'Other' so no report is impossible to file", () => {
    for (const cat of CASE_PRODUCT_CATEGORY_KEYS) {
      expect(CASE_ISSUES_BY_CATEGORY[cat]).toContain("other");
    }
  });

  it("every listed key is a real issue — a typo would render a blank button", () => {
    for (const cat of CASE_PRODUCT_CATEGORY_KEYS) {
      for (const k of CASE_ISSUES_BY_CATEGORY[cat]) {
        expect(CASE_ISSUE_KEYS).toContain(k);
      }
      expect(caseIssuesFor(cat).every((o) => !!o?.label)).toBe(true);
    }
  });
});

describe("the priority law", () => {
  it("No = High — always, for every category and reporter", () => {
    expect(casePriorityFor("no")).toBe("high");
  });

  it("ladders down through Temporarily and Yes", () => {
    expect(casePriorityFor("temporary")).toBe("normal");
    expect(casePriorityFor("yes")).toBe("low");
  });

  it("has no priority before the question is answered", () => {
    expect(casePriorityFor(null)).toBeNull();
    expect(casePriorityFor(undefined)).toBeNull();
  });

  it("flags a manager on High and on nothing else", () => {
    expect(caseNeedsManager("high")).toBe(true);
    expect(caseNeedsManager("normal")).toBe(false);
    expect(caseNeedsManager("low")).toBe(false);
    expect(caseNeedsManager(null)).toBe(false);
  });

  it("every usable option resolves to a priority — no silent gap", () => {
    for (const o of CASE_USABLE_OPTIONS) {
      expect(casePriorityFor(o.key)).toBe(o.priority);
    }
  });
});

describe("composeCaseSummary", () => {
  const base: CaseIntakeAnswers = {
    reportedBy: "customer",
    productCategory: "sofa",
    productSku: "SF2201 3 Seater",
    productQty: 1,
    issueType: "colour_uneven",
    usable: "no",
    customerWants: ["repair", "replace"],
  };

  it("renders the five answers as one plain sentence", () => {
    expect(composeCaseSummary(base)).toBe(
      "Colour uneven — Sofa · SF2201 3 Seater. Found by Customer. Still usable: No. " +
        "Customer wants: Repair, Replace.",
    );
  });

  it("names the quantity only when there is more than one", () => {
    expect(composeCaseSummary({ ...base, productQty: 2 })).toContain("SF2201 3 Seater · x2");
    expect(composeCaseSummary(base)).not.toContain("x1");
  });

  it("still reads as a sentence when there is no product line", () => {
    const s = composeCaseSummary({
      ...base,
      productCategory: "other",
      productSku: null,
      productQty: null,
    });
    expect(s.startsWith("Colour uneven — Other.")).toBe(true);
    expect(s).toContain("Found by Customer.");
  });

  it("never emits an empty string — the list column always has something to show", () => {
    const s = composeCaseSummary({
      reportedBy: null,
      productCategory: null,
      productSku: null,
      issueType: null,
      usable: null,
      customerWants: [],
    });
    expect(s.length).toBeGreaterThan(0);
  });
});

describe("caseIntakeComplete", () => {
  const full: CaseIntakeAnswers = {
    reportedBy: "warehouse",
    productCategory: "bedframe",
    productSku: "BF1102-Q",
    issueType: "missing_parts",
    usable: "temporary",
    customerWants: ["missing_parts"],
  };

  it("accepts every question answered", () => {
    expect(caseIntakeComplete(full)).toBe(true);
  });

  it("does NOT require a product SKU — a case may have no order line", () => {
    expect(caseIntakeComplete({ ...full, productSku: null })).toBe(true);
  });

  it("refuses a missing answer to any of the five questions", () => {
    expect(caseIntakeComplete({ ...full, reportedBy: null })).toBe(false);
    expect(caseIntakeComplete({ ...full, productCategory: null })).toBe(false);
    expect(caseIntakeComplete({ ...full, issueType: null })).toBe(false);
    expect(caseIntakeComplete({ ...full, usable: null })).toBe(false);
    expect(caseIntakeComplete({ ...full, customerWants: [] })).toBe(false);
  });
});

describe("the key sets stay closed", () => {
  it("has no duplicate keys anywhere (a duplicate silently shadows an option)", () => {
    for (const keys of [
      CASE_REPORTER_KEYS,
      CASE_ISSUE_KEYS,
      CASE_PRODUCT_CATEGORY_KEYS,
      CASE_WANTS.map((w) => w.key),
      CASE_USABLE_OPTIONS.map((o) => o.key),
    ]) {
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it("every option carries a plain-words label (staff read labels, not keys)", () => {
    for (const o of [...CASE_ISSUES, ...CASE_WANTS, ...CASE_USABLE_OPTIONS]) {
      expect(o.label.trim().length).toBeGreaterThan(0);
      expect(o.label).not.toMatch(/_/);
    }
  });
});
