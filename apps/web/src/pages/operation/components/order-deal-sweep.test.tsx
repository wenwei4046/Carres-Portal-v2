import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ apiFetch }));

import { useAuth } from "@/lib/auth";
import { useOrderDealSweep } from "./order-deal-sweep";

const signIn = (id: string, role: string) => useAuth.setState({ user: { id } as never, role: role as never });

beforeEach(() => {
  apiFetch.mockReset();
  apiFetch.mockResolvedValue({ assigned: 0 });
  sessionStorage.clear();
});

describe("useOrderDealSweep — the system deals every order (0504), from the shell", () => {
  it("runs the one server sweep once per session for Operations", async () => {
    signIn("u1", "operation");
    const first = renderHook(() => useOrderDealSweep(true));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/api/operation/staff/auto-assign", { method: "POST" }));
    first.unmount();
    renderHook(() => useOrderDealSweep(true));
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  it("runs for the principal too", async () => {
    signIn("p1", "principal");
    renderHook(() => useOrderDealSweep(true));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1));
  });

  it("never runs for another role, nor when disabled (a local build on the shared database)", () => {
    signIn("d1", "dealer");
    renderHook(() => useOrderDealSweep(true)).unmount();
    signIn("u2", "operation");
    renderHook(() => useOrderDealSweep(false));
    expect(apiFetch).not.toHaveBeenCalled();
  });
});
