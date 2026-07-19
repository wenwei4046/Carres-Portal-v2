import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
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

const patchMutate = vi.fn();

vi.mock("@/lib/queries", () => ({
  useOutlets: () => ({ data: { outlets: [{ id: "o1", dealerId: "d1", name: "O1", address: "1 Jln" }, { id: "o2", dealerId: "d1", name: "O2", address: "2 Jln" }] }, isPending: false, error: null }),
  useStaffList: () => ({ data: { staff: ROSTER, activated: true, selfStaffId: null, storeKind: "dealer" }, isPending: false, error: null }),
  usePatchStaff: () => ({ mutate: patchMutate, isPending: false, isError: false, error: null }),
  useCreateOutlet: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useCreateStaff: () => ({ mutate: vi.fn(), isPending: false, isError: false, error: null }),
  useSetStaffPin: () => ({ mutate: vi.fn(), isPending: false, isError: false, error: null }),
  // StoreAccountSection (0240) — inert here (no dealer-role auth in these tests).
  useMyEmailChange: () => ({ data: { request: null }, isPending: false, error: null }),
  useSubmitEmailChange: () => ({ mutate: vi.fn(), isPending: false }),
  useCancelEmailChange: () => ({ mutate: vi.fn(), isPending: false }),
}));

import StaffManagePage from "./StaffManagePage";

function asTier(tier: StaffTierDto, outletId: string | null) {
  useStaffSession.getState().setSession("t", { sid: "me", tier, name: "Me", color: "flame", outletId }, "d1");
}

beforeEach(() => {
  useStaffSession.getState().reset();
  patchMutate.mockClear();
});
afterEach(cleanup);

describe("StaffManagePage — in-POS staff management overlay", () => {
  it("principal tier: full roster + Add staff + outlets, back fires onClose", () => {
    asTier("principal", null);
    const onClose = vi.fn();
    render(<StaffManagePage onClose={onClose} />);
    expect(screen.getByTestId("pos-staff-manage")).toBeTruthy();
    expect(screen.getByTestId("staff-section")).toBeTruthy();
    expect(screen.getByTestId("add-staff")).toBeTruthy();
    expect(screen.getByTestId("staff-row-sp1")).toBeTruthy();
    expect(screen.getByTestId("staff-row-sp2")).toBeTruthy();
    expect(screen.getByTestId("staff-row-owner")).toBeTruthy();
    // Outlets management (moved from the deleted Settings page) — principal only.
    expect(screen.getByTestId("add-outlet")).toBeTruthy();
    expect(screen.getByTestId("outlet-row-o1")).toBeTruthy();
    fireEvent.click(screen.getByTestId("staff-manage-back"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("manager tier: own-outlet salespersons only, may still add; no outlets section", () => {
    asTier("manager", "o1");
    render(<StaffManagePage onClose={() => {}} />);
    expect(screen.getByTestId("staff-row-sp1")).toBeTruthy();
    expect(screen.queryByTestId("staff-row-sp2")).toBeNull();
    expect(screen.getByTestId("add-staff")).toBeTruthy();
    expect(screen.queryByTestId("add-outlet")).toBeNull();
  });

  it("manager can edit a salesperson row but not the owner (principal) row", () => {
    asTier("manager", "o1");
    render(<StaffManagePage onClose={() => {}} />);
    // salesperson row has the Set/Reset PIN affordance …
    expect(screen.getByTestId("staff-setpin-sp1")).toBeTruthy();
    // … the owner (principal) row does not (manager may only touch salespersons).
    expect(screen.queryByTestId("staff-setpin-owner")).toBeNull();
  });

  it("salesperson tier: the sections render nothing (defence-in-depth — the POS pill is hidden too)", () => {
    asTier("salesperson", "o1");
    render(<StaffManagePage onClose={() => {}} />);
    expect(screen.queryByTestId("staff-section")).toBeNull();
    expect(screen.queryByTestId("add-outlet")).toBeNull();
  });

  it("Edit opens a prefilled profile form and PATCHes the row", () => {
    asTier("principal", null);
    render(<StaffManagePage onClose={() => {}} />);
    fireEvent.click(screen.getByTestId("staff-edit-sp1"));
    // Name prefilled from the row.
    expect((screen.getByTestId("staff-edit-name") as HTMLInputElement).value).toBe("SP In O1");
    // Profile fields are required before save enables.
    expect((screen.getByTestId("staff-edit-save") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByTestId("staff-edit-email"), { target: { value: "SP1@Store.com" } });
    fireEvent.change(screen.getByTestId("staff-edit-birthday"), { target: { value: "1990-01-02" } });
    fireEvent.change(screen.getByTestId("staff-edit-gender"), { target: { value: "female" } });
    fireEvent.click(screen.getByTestId("staff-edit-save"));
    expect(patchMutate).toHaveBeenCalledWith(
      {
        id: "sp1",
        patch: {
          name: "SP In O1",
          email: "sp1@store.com",
          birthday: "1990-01-02",
          gender: "female",
          phone: null,
          color: "flame",
        },
      },
      expect.anything(),
    );
  });
});
