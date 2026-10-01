import { beforeEach, expect, it, vi } from "vitest";
import { earlyDeliveryRefusal } from "./early-delivery";
import { loadBookingContext } from "./booking-context";
vi.mock("./booking-context", () => ({ loadBookingContext: vi.fn() }));

let owing = 0;
beforeEach(() => { owing = 0; vi.mocked(loadBookingContext).mockImplementation(async () => ({
  ok: true, ctx: { gate: { goodsReady: true, outstanding: owing, notReadySkus: [] } },
}) as never); });
function client(ready = true, blocked = false, approved = false) {
  const rpc = vi.fn().mockResolvedValue({ data: ready, error: null });
  const from = vi.fn((table: string) => ({ select: () => ({ eq: async () => ({ error: null,
    data: table === "order_finance_exceptions" ? (blocked ? [{ status: "open", reason: "Check" }] : []) : (approved ? [{ status: "approved" }] : []),
  }) }) }));
  return { rpc, from };
}
it("refuses physically unready goods before any release or money action", async () => {
  const sb = client(false);
  expect(await earlyDeliveryRefusal(sb as never,"order","2026-10-20")).toBe("Goods not ready");
  expect(loadBookingContext).not.toHaveBeenCalled(); expect(sb.from).not.toHaveBeenCalled();
});
it("ready goods with the existing money conditions may be arranged early", async () => {
  expect(await earlyDeliveryRefusal(client() as never,"order","2026-10-20")).toBeNull();
});
it("does not bypass owing money or an open Finance exception", async () => {
  owing = 100;
  expect(await earlyDeliveryRefusal(client() as never,"order","2026-10-20")).toBe("Hold delivery");
  expect(await earlyDeliveryRefusal(client(true,false,true) as never,"order","2026-10-20")).toBeNull();
  expect(await earlyDeliveryRefusal(client(true,true,true) as never,"order","2026-10-20")).toBe("Hold delivery");
});
