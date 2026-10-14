import { describe, expect, it } from "vitest";
import { inRequestedNarrowing, requestedNarrowingOf, requestedNarrowingWord } from "./requested-narrowing";

/* The door Purchasing's Monthly demand opens into the Sales Order list. */
describe("requested-date narrowing", () => {
  it("reads one month, before and after a window edge, and refuses anything else", () => {
    expect(requestedNarrowingOf("2026-10")).toEqual({ kind: "month", month: "2026-10" });
    expect(requestedNarrowingOf("before:2026-10")).toEqual({ kind: "before", month: "2026-10" });
    expect(requestedNarrowingOf("after:2027-03")).toEqual({ kind: "after", month: "2027-03" });
    expect(requestedNarrowingOf("2026-13")).toBeNull();
    expect(requestedNarrowingOf("range:2026-12-31:2026-11-01")).toBeNull();
    expect(requestedNarrowingOf(null)).toBeNull();
  });

  it("matches the preserved request by its month; an order with none is outside every month", () => {
    const oct = requestedNarrowingOf("2026-10")!;
    expect(inRequestedNarrowing("2026-10-19", oct)).toBe(true);
    expect(inRequestedNarrowing("2026-11-01", oct)).toBe(false);
    expect(inRequestedNarrowing(null, oct)).toBe(false);
    expect(inRequestedNarrowing("2026-09-30", requestedNarrowingOf("before:2026-10")!)).toBe(true);
    expect(inRequestedNarrowing("2027-04-01", requestedNarrowingOf("after:2027-03")!)).toBe(true);
  });

  it("says the condition in words, with no dash on a range", () => {
    expect(requestedNarrowingWord(requestedNarrowingOf("2026-10")!)).toBe("Oct 2026");
    expect(requestedNarrowingWord(requestedNarrowingOf("before:2026-10")!)).toBe("Before Oct 2026");
    expect(requestedNarrowingWord(requestedNarrowingOf("range:2026-11-01:2026-12-31")!)).not.toMatch(/[–—-]\s|\s[–—-]/);
  });
});
