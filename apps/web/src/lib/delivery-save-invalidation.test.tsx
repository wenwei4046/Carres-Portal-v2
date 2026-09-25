import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SaveDeliveryArrangementInput } from "@carres/shared";
import { useSaveDeliveryArrangement } from "./queries";

vi.mock("./api", () => ({
  apiFetch: vi.fn().mockResolvedValue({ arrangement: {} }),
  ApiError: class extends Error {},
}));

/**
 * Saving a Journey leg's delivery date can issue that leg's DO on the server.
 * The Delivery monitor and the Work Logistics card read DOs from the register
 * and detail keys, so the save must mark both stale.
 */
describe("saving a delivery refreshes the delivery orders", () => {
  const ORDER = "00000000-0000-0000-0000-0000000000aa";
  const REGISTER = ["operation", "delivery-orders", "all"] as const;
  const DETAIL = ["operation", "delivery-orders", "detail", "DO-1"] as const;

  it("marks the DO register and DO detail stale after a leg save", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(REGISTER, { rows: [] });
    qc.setQueryData(DETAIL, { id: "DO-1" });
    const { result } = renderHook(() => useSaveDeliveryArrangement(ORDER, 1), {
      wrapper: ({ children }: { children: ReactNode }) =>
        <QueryClientProvider client={qc}>{children}</QueryClientProvider>,
    });

    result.current.mutate({ confirmedDate: "2026-09-30" } as SaveDeliveryArrangementInput);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(qc.getQueryState(REGISTER)?.isInvalidated, "DO register").toBe(true);
    expect(qc.getQueryState(DETAIL)?.isInvalidated, "DO detail").toBe(true);
  });
});
