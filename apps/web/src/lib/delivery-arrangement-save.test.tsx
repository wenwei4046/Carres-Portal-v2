import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSaveDeliveryArrangement, type DeliveryArrangementsPayload } from "./queries";
import type { DeliveryArrangementRow } from "@carres/shared";
const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("./api", async () => ({ ...await vi.importActual<typeof import("./api")>("./api"), apiFetch: mocks.fetch }));
beforeEach(() => { mocks.fetch.mockReset(); });
function setup() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const original = { arrangements: [{ order_id: "order", leg: 0, confirmed_date: "2026-10-01" }, { order_id: "order", leg: 1, confirmed_date: "2026-10-02" }], contacts: [] } as unknown as DeliveryArrangementsPayload;
  client.setQueryData(["operation", "delivery-arrangements"], original);
  const hook = renderHook(() => useSaveDeliveryArrangement("order", 0), { wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> });
  return { client, original, ...hook };
}
describe("saved Delivery summary cache", () => {
  it("publishes the server-returned fact before the form closes and keeps sibling legs", async () => {
    const { client, result } = setup();
    const saved = { order_id: "order", leg: 0, confirmed_date: "2026-10-05", confirmed_time: null } as DeliveryArrangementRow;
    mocks.fetch.mockResolvedValue({ arrangement: saved });
    await act(async () => { await result.current.mutateAsync({ confirmedDate: "2026-10-04" }); });
    expect(client.getQueryData<DeliveryArrangementsPayload>(["operation", "delivery-arrangements"])?.arrangements).toEqual([{ order_id: "order", leg: 1, confirmed_date: "2026-10-02" }, saved]);
    expect(mocks.fetch).toHaveBeenCalledWith("/api/operation/delivery-arrangements/order?leg=0", expect.objectContaining({ method: "PUT" }));
  });
  it("a refused save leaves the existing summary untouched", async () => {
    const { client, original, result } = setup(); mocks.fetch.mockRejectedValue(new Error("refused"));
    await act(async () => { await expect(result.current.mutateAsync({ confirmedDate: "2026-10-04" })).rejects.toThrow("refused"); });
    expect(client.getQueryData(["operation", "delivery-arrangements"])).toEqual(original);
  });
});
