import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock("./api", async () => ({
  ...await vi.importActual<typeof import("./api")>("./api"), apiFetch,
}));
import { useOperationWork, useRecordHandoverEvent, useRecordOutboundPrep } from "./queries";

beforeEach(() => { apiFetch.mockReset(); });

describe("Warehouse writes refresh the authoritative Work read", () => {
  it.each(["scan", "handover"] as const)("rereads Work after successful %s", async (write) => {
    let recorded = false;
    const before = { items: [{ id: "do-site", owner: "site_queue" }], staff: [], generatedOn: "2026-09-14" };
    const after = { ...before, items: write === "handover" ? [] : [{ id: "do-site", owner: "operator" }] };
    apiFetch.mockImplementation(async (url: string) => {
      if (url === "/api/operation/work") return recorded ? after : before;
      recorded = true;
      return write === "handover" ? { event: {} } : { result: { recorded: 1, alreadyRecorded: 0 } };
    });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
    const { result, unmount } = renderHook(() => ({
      work: useOperationWork(), scan: useRecordOutboundPrep("do-site"), handover: useRecordHandoverEvent("do-site"),
    }), { wrapper });
    await waitFor(() => expect(result.current.work.data).toEqual(before));
    await act(async () => {
      if (write === "scan") await result.current.scan.mutateAsync({ fact: "scanned", unitCodes: ["UNIT-1"] });
      else await result.current.handover.mutateAsync({ kind: "handed_over", receiverName: "Test receiver", unitCodes: ["UNIT-1"], proofPath: "test-proof" });
    });
    await waitFor(() => expect(result.current.work.data).toEqual(after));
    expect(apiFetch.mock.calls.filter(([url]) => url === "/api/operation/work")).toHaveLength(2);
    unmount();
    qc.clear();
  });

  it("keeps the open obligation when the handover write fails", async () => {
    const before = { items: [{ id: "do-site" }], staff: [], generatedOn: "2026-09-14" };
    apiFetch.mockImplementation(async (url: string) => {
      if (url === "/api/operation/work") return before;
      throw new Error("handover refused");
    });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
    const { result, unmount } = renderHook(() => ({ work: useOperationWork(), handover: useRecordHandoverEvent("do-site") }), { wrapper });
    await waitFor(() => expect(result.current.work.data).toEqual(before));
    await act(async () => {
      await expect(result.current.handover.mutateAsync({ kind: "handed_over" })).rejects.toThrow("handover refused");
    });
    expect(result.current.work.data).toEqual(before);
    expect(apiFetch.mock.calls.filter(([url]) => url === "/api/operation/work")).toHaveLength(1);
    unmount();
    qc.clear();
  });
});
