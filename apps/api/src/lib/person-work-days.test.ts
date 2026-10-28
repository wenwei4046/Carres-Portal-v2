/** `readPersonWorkDays` — the narrow People/HR read; fails safe to empty. */
import { describe, expect, it, vi } from "vitest";
import { readPersonWorkDays } from "./person-work-days";

describe("readPersonWorkDays", () => {
  it("returns only valid recorded weeks, keyed by user id, from the one narrow read", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        { user_id: "a", work_days: [6, 1, 2, 3, 4, 5] },
        { user_id: "b", work_days: [] },
        { user_id: "c", work_days: [9] },
      ],
      error: null,
    });
    const map = await readPersonWorkDays({ rpc } as never, ["a", "b", "c", null, "a"]);
    expect(rpc).toHaveBeenCalledWith("workspace_person_work_days", { p_user_ids: ["a", "b", "c"] });
    expect([...map.entries()]).toEqual([["a", [1, 2, 3, 4, 5, 6]]]);
  });

  it("a refused or thrown read, or nobody to ask, answers an empty map", async () => {
    expect((await readPersonWorkDays({ rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "x" } }) } as never, ["a"])).size).toBe(0);
    expect((await readPersonWorkDays({ rpc: vi.fn().mockRejectedValue(new Error("down")) } as never, ["a"])).size).toBe(0);
    const rpc = vi.fn();
    expect((await readPersonWorkDays({ rpc } as never, [])).size).toBe(0);
    expect(rpc).not.toHaveBeenCalled();
  });
});
