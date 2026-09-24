import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { Bindings } from "../types";
import { runSupplierClaimSweepCron } from "./supplier-claim-sweep";

const { adminClient } = vi.hoisted(() => ({ adminClient: vi.fn(() => { throw new Error("retired sweep accessed the database"); }) }));
vi.mock("../lib/supabase", () => ({ adminClient }));

describe("overdue dates never create product Claims", () => {
  it("leaves stale callers harmless without accessing the database", async () => {
    expect(await runSupplierClaimSweepCron({} as Bindings)).toBe(0);
    expect(adminClient).not.toHaveBeenCalled();
  });

  it("preserves ordinary daily follow-up without scheduling the claim sweep", () => {
    const source = readFileSync(new URL("../index.ts", import.meta.url), "utf8");
    const scheduled = source.slice(source.indexOf("scheduled:"));
    expect(source).not.toContain("runSupplierClaimSweepCron");
    expect(scheduled).toContain("await runContactByCron(env)");
    expect(scheduled).toContain("await runFollowUpMaintenanceCron(env)");
  });
});
