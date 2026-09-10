import { describe, expect, it, vi } from "vitest";
import { purchasingActorMayIssue } from "./purchasing-po-authority";

describe("purchasingActorMayIssue", () => {
  it("asks the one database authority and does not inspect a local roster", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    const from = vi.fn();
    const result = await purchasingActorMayIssue({ rpc, from } as never, "user-1");
    expect(result).toEqual({ mayIssue: true, error: null });
    expect(rpc).toHaveBeenCalledWith("purchasing_actor_may_issue", { p_user: "user-1" });
    expect(from).not.toHaveBeenCalled();
  });

  it("fails closed when authority cannot be resolved", async () => {
    const error = { message: "resolver unavailable" };
    const rpc = vi.fn().mockResolvedValue({ data: null, error });
    expect(await purchasingActorMayIssue({ rpc } as never, "user-1")).toEqual({
      mayIssue: false,
      error,
    });
  });
});
