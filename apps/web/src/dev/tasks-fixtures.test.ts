import { describe, expect, it } from "vitest";
import { operationWorkResponseSchema } from "@carres/shared";
import { TODAY, workFeed } from "./tasks-fixtures";

/* The local walk's Work feed must be a real Work response (the list reads it
   through the same schema production does), and its default week must match
   the reviewed storyboard: 6 · 2 · 7 · 1 · 1 = 17, Missed 7. */
describe("tasks walk fixtures", () => {
  it("the simulated Work feed parses with the production schema", () => {
    const parsed = operationWorkResponseSchema.safeParse(workFeed());
    expect(parsed.success ? "ok" : JSON.stringify(parsed.error.issues.slice(0, 3))).toBe("ok");
  });

  it("matches the storyboard counts", () => {
    const items = workFeed().items;
    const byModule = (m: string) => items.filter((i) => i.module === m).length;
    expect([byModule("purchasing"), byModule("receiving"), byModule("delivery"), byModule("payment"), byModule("issue_tracker")])
      .toEqual([6, 2, 7, 1, 1]);
    expect(items).toHaveLength(17);
    expect(items.filter((i) => i.timing.placement === "missed")).toHaveLength(7);
    expect(items.filter((i) => i.timing.actionOn === TODAY && i.timing.placement !== "missed")).toHaveLength(2);
    expect(items.filter((i) => i.timing.actionOn === null)).toHaveLength(1);
  });
});
