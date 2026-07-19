import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { StaffDto, StaffTierDto } from "@carres/shared";
import { useStaffSession } from "@/lib/staff";

function staff(over: Partial<StaffDto> & { id: string; name: string }): StaffDto {
  return {
    dealerId: "d1", outletId: "o1", phone: null, userId: null,
    staffRole: "salesperson", color: "flame", active: true, hasPin: true, ...over,
  } as StaffDto;
}

const ROSTER: StaffDto[] = [
  staff({ id: "owner", name: "Owner", staffRole: "principal", outletId: null }),
  staff({ id: "mgr1", name: "Mgr One", staffRole: "manager", outletId: "o1" }),
  staff({ id: "sp1", name: "SP In O1", outletId: "o1" }),
  staff({ id: "sp2", name: "SP In O2", outletId: "o2" }),
];

vi.mock("@/lib/queries", () => ({
  useDealerSelf: () => ({ data: { name: "Store", region: "KV", status: "active", depositBalance: 0 } }),
  useOutlets: () => ({ data: { outlets: [{ id: "o1", dealerId: "d1", name: "O1", address: "1 Jln" }, { id: "o2", dealerId: "d1", name: "O2", address: "2 Jln" }] }, isPending: false, error: null }),
  useStaffList: () => ({ data: { staff: ROSTER, activated: true, selfStaffId: null, storeKind: "dealer" }, isPending: false, error: null }),
  usePatchStaff: () => ({ mutate: vi.fn(), isPending: false }),
  useCreateOutlet: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useCreateStaff: () => ({ mutate: vi.fn(), isPending: false, isError: false, error: null }),
  useSetStaffPin: () => ({ mutate: vi.fn(), isPending: false, isError: false, error: null }),
  // StoreAccountSection (0240) — inert here (no dealer-role auth in these tests).
  useMyEmailChange: () => ({ data: { request: null }, isPending: false, error: null }),
  useSubmitEmailChange: () => ({ mutate: vi.fn(), isPending: false }),
  useCancelEmailChange: () => ({ mutate: vi.fn(), isPending: false }),
}));

import DealerSettings from "./DealerSettings";

function asTier(tier: StaffTierDto, outletId: string | null) {
  useStaffSession.getState().setSession("t", { sid: "me", tier, name: "Me", color: "flame", outletId }, "d1");
}

beforeEach(() => useStaffSession.getState().reset());
afterEach(cleanup);

describe("DealerSettings — staff section tier gating", () => {
  it("salesperson tier: staff section AND outlets section are hidden", () => {
    asTier("salesperson", "o1");
    render(<DealerSettings />);
    expect(screen.queryByTestId("staff-section")).toBeNull();
    expect(screen.queryByTestId("add-outlet")).toBeNull();
  });

  it("manager tier: staff section shown (own-outlet salespersons only); no outlets section", () => {
    asTier("manager", "o1");
    render(<DealerSettings />);
    expect(screen.getByTestId("staff-section")).toBeTruthy();
    // Own outlet salesperson + the outlet-less owner show; the O2 salesperson does not.
    expect(screen.getByTestId("staff-row-sp1")).toBeTruthy();
    expect(screen.queryByTestId("staff-row-sp2")).toBeNull();
    // Outlets management is principal-only.
    expect(screen.queryByTestId("add-outlet")).toBeNull();
    // A manager may add staff (salespersons).
    expect(screen.getByTestId("add-staff")).toBeTruthy();
  });

  it("principal tier: staff section + outlets section both shown; full roster", () => {
    asTier("principal", null);
    render(<DealerSettings />);
    expect(screen.getByTestId("staff-section")).toBeTruthy();
    expect(screen.getByTestId("add-outlet")).toBeTruthy();
    expect(screen.getByTestId("staff-row-sp1")).toBeTruthy();
    expect(screen.getByTestId("staff-row-sp2")).toBeTruthy();
    expect(screen.getByTestId("staff-row-owner")).toBeTruthy();
  });

  it("manager can edit a salesperson row but not the owner (principal) row", () => {
    asTier("manager", "o1");
    render(<DealerSettings />);
    // salesperson row has the Set/Reset PIN affordance …
    expect(screen.getByTestId("staff-setpin-sp1")).toBeTruthy();
    // … the owner (principal) row does not (manager may only touch salespersons).
    expect(screen.queryByTestId("staff-setpin-owner")).toBeNull();
  });
});
