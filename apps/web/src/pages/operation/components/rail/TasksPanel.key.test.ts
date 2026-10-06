import { describe, expect, it } from "vitest";
import { TASKS_KEY } from "./TasksPanel";
import { qk } from "@/lib/queries";

/**
 * ONE KEY PER READ (production, 2026-09-13). The legacy `ops_tasks` read and
 * the shared Work feed once cached under the same `["operation", "work"]`
 * key, so whichever answered first poisoned the other: the Work page, the
 * Quick Rail counts and the Payment Monitor's owner cells read `{ tasks }`
 * and showed nothing while the feed carried 215 items. A revert fails here.
 */
describe("the legacy tasks read never shares the shared Work feed's cache key", () => {
  it("keys differ", () => {
    expect([...TASKS_KEY]).not.toEqual([...qk.operation.work()]);
    expect(qk.operation.work()).toEqual(["operation", "work"]);
  });
});
