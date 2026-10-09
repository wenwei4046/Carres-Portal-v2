import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DcSource } from "@carres/shared/dealer-commission";
import type { Bindings } from "../types";

vi.mock("../lib/supabase", () => ({ userClient: vi.fn(), adminClient: vi.fn() }));
import { adminClient } from "../lib/supabase";
import { runDealerCommissionCloseCron } from "./dealer-commission-close";

/**
 * 0666 — the month before closes by itself: the cron asks which month is due,
 * works it out with the shared arithmetic and hands the figures to the door.
 */
const env = {} as Bindings;

// Chew's example: RM 1,650 of a RM 3,300 order paid in September earns RM 337.50.
const SOURCE: DcSource = {
  settings: { defaultRate: 0 }, rates: [], models: [], outlets: [], quotas: [], kpi: [], closes: [],
  dealers: [{ id: "d1", name: "Dealer" }],
  orders: [{
    orderId: "o1", so: 1, dealerId: "d1", outletId: null, addons: 0, orderedOn: "2026-09-02",
    lines: [
      { modelId: null, category: "mattress", value: 3000, rate: 25, qty: 1 },
      { modelId: null, category: "service", value: 300, rate: 0, qty: 1 },
    ],
    payments: [{ paidOn: "2026-09-05", amount: 1650 }],
  }],
};

function stub(dues: (string | null)[]) {
  const queue = [...dues];
  const rpc = vi.fn(async (fn: string) => {
    if (fn === "dealer_commission_close_due") return { data: queue.shift() ?? null, error: null };
    if (fn === "dealer_commission_close_read") return { data: SOURCE, error: null };
    return { data: { already: false }, error: null };
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(adminClient).mockReturnValue({ rpc } as any);
  return rpc;
}

beforeEach(() => vi.mocked(adminClient).mockReset());

describe("the dealer commission close cron (0666)", () => {
  it("closes each month due, in order, with the shared arithmetic's figures", async () => {
    const rpc = stub(["2026-09-01", null]);
    await expect(runDealerCommissionCloseCron(env)).resolves.toEqual(["2026-09"]);
    expect(rpc).toHaveBeenCalledWith("dealer_commission_close_read", { p_month: "2026-09-01" });
    expect(rpc).toHaveBeenCalledWith("dealer_commission_close", {
      p_month: "2026-09-01",
      p_dealers: [{ dealerId: "d1", commission: 337.5, rebate: 0, kpi: 0, kpiUnits: 0 }],
      p_orders: [{ orderId: "o1", dealerId: "d1", earnedThrough: 337.5 }],
    });
  });

  it("does nothing on a day no month is due", async () => {
    const rpc = stub([null]);
    await expect(runDealerCommissionCloseCron(env)).resolves.toEqual([]);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("stops and says so when the database refuses", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { message: "no access" } }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(adminClient).mockReturnValue({ rpc } as any);
    await expect(runDealerCommissionCloseCron(env)).rejects.toThrow("no access");
  });
});
