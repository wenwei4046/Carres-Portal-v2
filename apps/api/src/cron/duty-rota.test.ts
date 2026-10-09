import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Bindings } from "../types";

vi.mock("../lib/supabase", () => ({ userClient: vi.fn(), adminClient: vi.fn() }));
import { adminClient } from "../lib/supabase";
import { runDutyRotaCron } from "./duty-rota";

/** 0671 — the daily run asks the one SQL planner for this month and, from the
 *  25th (company date), next month. The cycle itself is never computed here. */
const env = {} as Bindings;
const rpc = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(adminClient).mockReturnValue({ rpc } as any);
  rpc.mockResolvedValue({ data: { duties: [] }, error: null });
});

describe("monthly PO / GRN rota run", () => {
  it("checks only this month before the 25th", async () => {
    await runDutyRotaCron(env, new Date("2026-10-09T01:00:00Z"));
    expect(rpc.mock.calls).toEqual([["workspace_plan_duty_rota", { p_month: "2026-10-01" }]]);
  });
  it("plans next month from the 25th in Kuala Lumpur, not UTC", async () => {
    // 24 Oct 17:00 UTC is already 25 Oct 01:00 in Kuala Lumpur.
    await runDutyRotaCron(env, new Date("2026-10-24T17:00:00Z"));
    expect(rpc.mock.calls.map((c) => c[1])).toEqual([{ p_month: "2026-10-01" }, { p_month: "2026-11-01" }]);
  });
  it("surfaces a planner failure instead of reporting success", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(runDutyRotaCron(env, new Date("2026-10-09T01:00:00Z"))).rejects.toThrow(/2026-10-01/);
  });
});
