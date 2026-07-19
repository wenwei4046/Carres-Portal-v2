import { describe, it, expect } from "vitest";
import { importOrderKey, importSourceRef } from "./orders";

/**
 * Jess's Ref law (2026-07-19): the LEAD token of a combined Ref names the order.
 * These pin the future grouping key BEFORE it is wired into the live import
 * (which stays on the sorted-set normalizeRefs until the RPC-dedup / re-key /
 * master-append coordination lands — see the wenwei spec).
 */
describe("importOrderKey — lead-token order identity", () => {
  it("takes the FIRST token as the order key", () => {
    expect(importOrderKey("CR1127 + TCF0477")).toBe("CR1127");
    expect(importOrderKey("TCF0477 + CR1127")).toBe("TCF0477");
  });

  it("SPLITS what the sorted-set key wrongly merges (the real bug)", () => {
    // Same token set, different lead → two DIFFERENT orders.
    expect(importOrderKey("CR1127 + TCF0477")).not.toBe(
      importOrderKey("TCF0477 + CR1127"),
    );
    expect(importOrderKey("CR0925 + TCF0394")).not.toBe(
      importOrderKey("TCF0394 + CR0925"),
    );
  });

  it("trims, upper-cases, and handles every separator", () => {
    expect(importOrderKey("  cr0925 + tcf0394 ")).toBe("CR0925");
    expect(importOrderKey("TCF0394 / CR0925")).toBe("TCF0394");
    expect(importOrderKey("A & B")).toBe("A");
    expect(importOrderKey("A, B")).toBe("A");
  });

  it("keeps a single invoice as its own key", () => {
    expect(importOrderKey("CR0973")).toBe("CR0973");
  });

  it("returns '' for an empty / separator-only Ref", () => {
    expect(importOrderKey("   ")).toBe("");
    expect(importOrderKey(" + / ")).toBe("");
  });
});

describe("importSourceRef — lead-first, deduped, NOT sorted", () => {
  it("keeps input order (lead first), unlike normalizeRefs' sort", () => {
    expect(importSourceRef("TCF0477 + CR1127")).toEqual(["TCF0477", "CR1127"]);
    expect(importSourceRef("CR1127 + TCF0477")).toEqual(["CR1127", "TCF0477"]);
  });

  it("dedups repeated tokens but preserves first-seen order", () => {
    expect(importSourceRef("CR1 + cr1 + CR2")).toEqual(["CR1", "CR2"]);
  });

  it("gives reordered spellings DISTINCT arrays (RPC array-eq → 2 orders)", () => {
    // Postgres `source_ref = v_src_ref` is order-sensitive, so these two
    // genuinely-different orders no longer collide.
    expect(importSourceRef("CR1127 + TCF0477")).not.toEqual(
      importSourceRef("TCF0477 + CR1127"),
    );
  });

  it("gives the SAME array for a genuine re-export (same lead order) → dedups", () => {
    expect(importSourceRef("CR1127+TCF0477")).toEqual(
      importSourceRef("CR1127 + TCF0477"),
    );
  });

  it("every token stays present as a searchable alias", () => {
    const refs = importSourceRef("TCF0538 + TCF0475 + TCF0539");
    expect(refs).toContain("TCF0475");
    expect(refs).toContain("TCF0539");
    expect(refs[0]).toBe("TCF0538"); // lead
  });
});
