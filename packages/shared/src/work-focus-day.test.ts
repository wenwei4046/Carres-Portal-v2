import { describe, expect, it } from "vitest";
import { workFocusDay } from "./operation-work";

/** Workspace MASTER §5.1 — the focus day My Work and the Right Rail share. */
describe("workFocusDay", () => {
  it("keeps a working day", () => {
    expect(workFocusDay("2026-09-17")).toBe("2026-09-17");
    expect(workFocusDay("2026-09-19")).toBe("2026-09-19"); // Saturday is a working day
  });
  it("moves a public holiday to the next working day (Malaysia Day → Thu 17 Sep)", () => {
    expect(workFocusDay("2026-09-16")).toBe("2026-09-17");
  });
  it("moves Sunday to Monday", () => {
    expect(workFocusDay("2026-09-20")).toBe("2026-09-21");
  });
  it("skips consecutive closed days across a month end", () => {
    expect(workFocusDay("2026-08-30", new Set(["2026-08-31"]))).toBe("2026-09-01");
  });
});
