import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { useStaffSession } from "@/lib/staff";
import StaffSwitchChip from "./StaffSwitchChip";

const { verifyMock, setPinMock } = vi.hoisted(() => ({
  verifyMock: vi.fn(),
  setPinMock: vi.fn(),
}));
vi.mock("@/lib/queries", () => ({
  useVerifyPin: () => ({ mutate: verifyMock, isPending: false }),
  useSetStaffPin: () => ({ mutate: setPinMock, isPending: false }),
  useCreateStaff: () => ({ mutate: vi.fn(), isPending: false }),
}));

beforeEach(() => {
  useStaffSession.getState().reset();
  verifyMock.mockReset();
  setPinMock.mockReset();
});
afterEach(cleanup);

describe("StaffSwitchChip", () => {
  it("renders nothing when there is no staff session", () => {
    const { container } = render(<StaffSwitchChip />);
    expect(container.firstChild).toBeNull();
  });

  it("shows the staff member and switches (clears token, keeps outlet) on click", () => {
    useStaffSession.getState().setSession(
      "tok",
      { sid: "s1", tier: "manager", name: "Aisha Rahman", color: "ocean", outletId: "o1" },
      "d1",
    );
    useStaffSession.getState().setSessionOutlet("o1");
    render(<StaffSwitchChip />);
    expect(screen.getByText("Aisha Rahman")).toBeTruthy();

    fireEvent.click(screen.getByTestId("staff-switch-chip"));
    const st = useStaffSession.getState();
    expect(st.token).toBeNull();
    expect(st.staff).toBeNull();
    // Switching keeps the working outlet so re-PIN lands on the same tiles.
    expect(st.sessionOutletId).toBe("o1");
  });

  // Loo 2026-07-18 — self-service PIN change from the chip, every tier.
  it("改 PIN opens the modal; save verifies the OLD pin then sets the new one", () => {
    useStaffSession.getState().setSession(
      "tok",
      { sid: "s1", tier: "salesperson", name: "Aisha Rahman", color: "ocean", outletId: "o1" },
      "d1",
    );
    verifyMock.mockImplementation((_v, opts) => opts?.onSuccess?.({}));
    render(<StaffSwitchChip />);

    fireEvent.click(screen.getByTestId("staff-changepin-chip"));
    fireEvent.change(screen.getByTestId("changepin-current"), { target: { value: "222222" } });
    fireEvent.change(screen.getByTestId("changepin-new"), { target: { value: "889977" } });
    fireEvent.change(screen.getByTestId("changepin-confirm"), { target: { value: "889977" } });
    fireEvent.click(screen.getByTestId("changepin-save"));

    expect(verifyMock).toHaveBeenCalledWith(
      { salespersonId: "s1", pin: "222222" },
      expect.any(Object),
    );
    expect(setPinMock).toHaveBeenCalledWith({ id: "s1", pin: "889977" }, expect.any(Object));
  });

  it("save is gated until old + new PINs are valid and different", () => {
    useStaffSession.getState().setSession(
      "tok",
      { sid: "s1", tier: "salesperson", name: "Aisha", color: null, outletId: null },
      "d1",
    );
    render(<StaffSwitchChip />);
    fireEvent.click(screen.getByTestId("staff-changepin-chip"));
    // same-as-current new PIN → still disabled
    fireEvent.change(screen.getByTestId("changepin-current"), { target: { value: "222222" } });
    fireEvent.change(screen.getByTestId("changepin-new"), { target: { value: "222222" } });
    fireEvent.change(screen.getByTestId("changepin-confirm"), { target: { value: "222222" } });
    fireEvent.click(screen.getByTestId("changepin-save"));
    expect(verifyMock).not.toHaveBeenCalled();
  });

  it("owner-mode (sid null) hides the 改 PIN button", () => {
    useStaffSession.getState().setSession(
      "tok",
      { sid: null, tier: "principal", name: "Owner", color: null, outletId: null },
      "d1",
    );
    render(<StaffSwitchChip />);
    expect(screen.queryByTestId("staff-changepin-chip")).toBeNull();
  });
});
