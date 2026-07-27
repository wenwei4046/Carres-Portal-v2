import { describe, expect, it } from "vitest";

import {
  CASE_EVIDENCE_BY_ISSUE,
  CASE_EVIDENCE_SLOTS,
  caseEvidenceAccept,
  caseEvidenceChecklist,
  caseEvidenceComplete,
  caseEvidenceGapMessage,
  caseEvidenceGaps,
  caseEvidenceMimeFits,
  caseEvidenceSlotLabel,
  type CaseEvidenceFile,
} from "./service-case-evidence";
import { CASE_ISSUE_KEYS, CASE_ISSUES_BY_CATEGORY } from "./service-case-intake";

/**
 * S2's acceptance: "submitting without required evidence is impossible."
 *
 * The rule that matters most here is not "the list has the right items" — it is
 * that EVERY issue type a staff member can pick has a satisfiable required list.
 * A checklist that can never be completed is worse than no checklist: it teaches
 * staff to upload a junk photo to get past the gate.
 */

function files(...slots: string[]): CaseEvidenceFile[] {
  return slots.map((slot) => ({ slot }));
}

describe("caseEvidenceChecklist", () => {
  it("implements the card's Colour uneven checklist verbatim", () => {
    const list = caseEvidenceChecklist("colour_uneven", "customer");
    expect(list.map((r) => r.slot)).toEqual([
      "customer_message",
      "overall_photo",
      "closeup_photo",
      "sku_label_photo",
      "pan_video",
    ]);
    // "close-up x2" is a COUNT, not two list lines.
    expect(list.find((r) => r.slot === "closeup_photo")?.minCount).toBe(2);
    // "10-20s video" is a video, so the picker must not offer a photo.
    expect(list.find((r) => r.slot === "pan_video")?.kind).toBe("video");
    expect(list.every((r) => r.required)).toBe(true);
  });

  it("drops the customer's screenshot when the customer is not who found it", () => {
    // The warehouse finding a fault before dispatch has no chat to screenshot;
    // demanding one would make the gate impossible to pass honestly.
    const warehouse = caseEvidenceChecklist("colour_uneven", "warehouse");
    expect(warehouse.map((r) => r.slot)).not.toContain("customer_message");
    // Everything else still stands.
    expect(warehouse.map((r) => r.slot)).toEqual([
      "overall_photo",
      "closeup_photo",
      "sku_label_photo",
      "pan_video",
    ]);
  });

  it("still asks for evidence when nobody said who found it", () => {
    // A reporter-less case loses only the reporter-specific line.
    const list = caseEvidenceChecklist("damaged", null);
    expect(list.length).toBeGreaterThan(0);
    expect(list.map((r) => r.slot)).not.toContain("customer_message");
    expect(list.filter((r) => r.required).length).toBeGreaterThan(0);
  });

  it("asks for nothing when no issue type was answered", () => {
    // A case filed before S2 (or through the edit modal, which asks no issue
    // question) must stay readable and savable, not become impossible.
    expect(caseEvidenceChecklist(null, "customer")).toEqual([]);
    expect(caseEvidenceChecklist(undefined, undefined)).toEqual([]);
  });

  it("overrides the instruction where the reason to take the photo differs", () => {
    const missing = caseEvidenceChecklist("missing_parts", "customer");
    const damaged = caseEvidenceChecklist("damaged", "customer");
    const missingCloseup = missing.find((r) => r.slot === "closeup_photo")!;
    const damagedCloseup = damaged.find((r) => r.slot === "closeup_photo")!;

    expect(missingCloseup.instruction).toMatch(/missing part belongs/);
    expect(damagedCloseup.instruction).toMatch(/two different angles/i);
    expect(missingCloseup.instruction).not.toBe(damagedCloseup.instruction);
  });

  it("gives every line a label and an instruction — the instruction IS the training", () => {
    for (const issue of CASE_ISSUE_KEYS) {
      for (const r of caseEvidenceChecklist(issue, "customer")) {
        expect(r.label.length).toBeGreaterThan(0);
        expect(r.instruction.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("every pickable issue type has a satisfiable required list", () => {
  it("requires at least one file for every issue type, on every reporter", () => {
    // "No evidence, no case" has to be true on every path a wizard can walk,
    // including the "Other" escape hatch.
    for (const issue of CASE_ISSUE_KEYS) {
      for (const reporter of ["customer", "warehouse", "logistic", "supplier", "staff"] as const) {
        const required = caseEvidenceChecklist(issue, reporter).filter((r) => r.required);
        expect(
          required.length,
          `${issue} / ${reporter} has no required evidence`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it("can be completed by uploading exactly what it asks for", () => {
    for (const issue of CASE_ISSUE_KEYS) {
      for (const reporter of ["customer", "warehouse"] as const) {
        const list = caseEvidenceChecklist(issue, reporter);
        const uploaded = list
          .filter((r) => r.required)
          .flatMap((r) => Array.from({ length: r.minCount }, () => ({ slot: r.slot })));
        expect(
          caseEvidenceComplete(issue, reporter, uploaded),
          `${issue} / ${reporter} cannot be completed`,
        ).toBe(true);
      }
    }
  });

  it("covers every issue type the intake can offer — no category dead-ends", () => {
    // If S1 taught a category a new issue key and S2 never learned it, the
    // wizard would offer a button whose evidence step asks for nothing.
    for (const keys of Object.values(CASE_ISSUES_BY_CATEGORY)) {
      for (const key of keys) {
        expect(CASE_EVIDENCE_BY_ISSUE[key], `no checklist for ${key}`).toBeTruthy();
      }
    }
  });

  it("names only slots that exist in the registry", () => {
    const known = new Set(CASE_EVIDENCE_SLOTS.map((s) => s.key));
    for (const [issue, rules] of Object.entries(CASE_EVIDENCE_BY_ISSUE)) {
      for (const r of rules) {
        expect(known.has(r.slot), `${issue} names unknown slot ${r.slot}`).toBe(true);
      }
    }
  });

  it("never lists the same slot twice for one issue type", () => {
    // Two lines for the same slot would double-count: uploading one file would
    // silently tick both.
    for (const [issue, rules] of Object.entries(CASE_EVIDENCE_BY_ISSUE)) {
      const slots = rules.map((r) => r.slot);
      expect(new Set(slots).size, `${issue} lists a slot twice`).toBe(slots.length);
    }
  });
});

describe("caseEvidenceGaps", () => {
  it("reports the missing lines with what is needed and what is there", () => {
    const gaps = caseEvidenceGaps("colour_uneven", "customer", files("overall_photo", "closeup_photo"));
    expect(gaps.map((g) => g.slot)).toEqual([
      "customer_message",
      "closeup_photo",
      "sku_label_photo",
      "pan_video",
    ]);
    // The half-done count is stated, not rounded to "missing".
    expect(gaps.find((g) => g.slot === "closeup_photo")).toMatchObject({ need: 2, have: 1 });
  });

  it("ignores optional lines", () => {
    // The carton photo is optional everywhere it appears — a complaint raised
    // weeks later has no box left to photograph.
    const gaps = caseEvidenceGaps(
      "damaged",
      "warehouse",
      files("overall_photo", "closeup_photo", "closeup_photo", "sku_label_photo"),
    );
    expect(gaps).toEqual([]);
    expect(caseEvidenceChecklist("damaged", "warehouse").map((r) => r.slot)).toContain(
      "packaging_photo",
    );
  });

  it("ignores files uploaded against a slot the checklist never asked for", () => {
    const gaps = caseEvidenceGaps("wrong_sku", "warehouse", files("pan_video", "pan_video"));
    expect(gaps.map((g) => g.slot)).toEqual(["sku_label_photo", "overall_photo"]);
  });

  it("reports no gaps for a case with no issue type", () => {
    expect(caseEvidenceGaps(null, null, [])).toEqual([]);
    expect(caseEvidenceComplete(null, null, [])).toBe(true);
  });
});

describe("caseEvidenceComplete", () => {
  it("refuses an empty upload list for every issue type", () => {
    for (const issue of CASE_ISSUE_KEYS) {
      expect(caseEvidenceComplete(issue, "customer", []), issue).toBe(false);
    }
  });

  it("refuses one close-up when two were asked for", () => {
    const one = files("customer_message", "overall_photo", "closeup_photo", "sku_label_photo", "pan_video");
    expect(caseEvidenceComplete("colour_uneven", "customer", one)).toBe(false);
    expect(caseEvidenceComplete("colour_uneven", "customer", [...one, { slot: "closeup_photo" }])).toBe(
      true,
    );
  });
});

describe("caseEvidenceGapMessage", () => {
  it("says what is missing in plain words, with the count when it matters", () => {
    const gaps = caseEvidenceGaps("colour_uneven", "warehouse", files("overall_photo", "closeup_photo"));
    const msg = caseEvidenceGapMessage(gaps);
    expect(msg).toContain("Close-up of the problem (1 of 2)");
    expect(msg).toContain("Photo of the label on the item");
    expect(msg).toContain("Video of the whole item");
  });

  it("is empty when nothing is missing", () => {
    expect(caseEvidenceGapMessage([])).toBe("");
  });
});

describe("file kinds", () => {
  it("refuses a photo where a video was asked for, and the reverse", () => {
    expect(caseEvidenceMimeFits("video", "image/jpeg")).toBe(false);
    expect(caseEvidenceMimeFits("video", "video/mp4")).toBe(true);
    expect(caseEvidenceMimeFits("photo", "video/quicktime")).toBe(false);
    expect(caseEvidenceMimeFits("photo", "image/png")).toBe(true);
  });

  it("offers the picker only the types that slot accepts", () => {
    expect(caseEvidenceAccept("photo")).toBe("image/jpeg,image/png,image/webp");
    expect(caseEvidenceAccept("video")).toBe("video/mp4,video/quicktime");
  });
});

describe("caseEvidenceSlotLabel", () => {
  it("shows an unknown stored slot as itself rather than hiding the file", () => {
    expect(caseEvidenceSlotLabel("retired_slot")).toBe("retired_slot");
    expect(caseEvidenceSlotLabel("overall_photo")).toBe("Photo of the whole item");
    expect(caseEvidenceSlotLabel(null)).toBe("—");
  });
});
