import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { validateDeliveryLeadTime } from "./lead-time";

function fakeClient(): SupabaseClient {
  return {
    from(table: string) {
      const data =
        table === "purchasing_settings"
          ? [{ order_by_buffer_days: 7, earliest_sell_days: 14, logistics_call_working_days: 1, po_days: [1, 3, 5] }]
          : [{ sku: "MS1001", product_models: { category: "mattress" } }];
      const result = { data, error: null };
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: () => builder,
        in: () => builder,
        maybeSingle: async () => ({ data: data[0] ?? null, error: null }),
        then: (resolve: (v: typeof result) => unknown, reject?: (e: unknown) => unknown) =>
          Promise.resolve(result).then(resolve, reject),
      };
      return builder;
    },
  } as unknown as SupabaseClient;
}

describe("validateDeliveryLeadTime — floor is anchored to the Klang calendar day", () => {
  afterEach(() => vi.useRealTimers());

  it("rejects a date one day short of the floor at 02:00 MYT (UTC still yesterday)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-16T18:00:00Z")); // 02:00 on the 17th in Malaysia
    // KL today = 2026-09-17, +14 = 2026-10-01. Before the fix minDate = 2026-09-30 and 09-30 passes.
    const v = await validateDeliveryLeadTime(fakeClient(), ["MS1001"], "2026-09-30");
    expect(v?.code).toBe("lead_time_violation");
    expect(v?.minDate).toBe("2026-10-01");
    expect(await validateDeliveryLeadTime(fakeClient(), ["MS1001"], "2026-10-01")).toBeNull();
  });
});
