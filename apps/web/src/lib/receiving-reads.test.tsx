import { describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useOfficeReceiveMutation, useReceivingAmendMutation, useReceivingVoidMutation, useWarehouseReceiptReviewMutation } from "./queries";

vi.mock("./api", () => ({ apiFetch: vi.fn(async () => ({ receipt_id: "receipt-1" })) }));

describe("saved Receiving results reach all owning readers", () => {
  const keys = [["operation", "work"], ["operation", "warehouse-inbound"], ["operation", "warehouse-schedule", "calendar"],
    ["operation", "warehouse"], ["operation", "warehouse-receipts", "session", "receipt-1"],
    ["operation", "pos", "PO-1", "receiving"], ["operation", "supplier-claims"]];
  it.each(["office", "check-in", "amend", "void"])("%s invalidates Tasks, Workspace and physical/source readers after a successful write", async kind => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    keys.forEach(key => client.setQueryData(key, { saved: "before" }));
    const { result } = renderHook(() => {
      const office = useOfficeReceiveMutation("PO-1");
      const checkIn = useWarehouseReceiptReviewMutation("check-in");
      const amend = useReceivingAmendMutation("receipt-1");
      const voidReceipt = useReceivingVoidMutation("receipt-1");
      return { office, "check-in": checkIn, amend, void: voidReceipt };
    }, { wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> });
    await act(async () => { await result.current[kind as keyof typeof result.current].mutateAsync({} as never); });
    keys.forEach(key => expect(client.getQueryState(key)?.isInvalidated, `${kind}: ${key.join("/")}`).toBe(true));
    client.clear();
  });
});
