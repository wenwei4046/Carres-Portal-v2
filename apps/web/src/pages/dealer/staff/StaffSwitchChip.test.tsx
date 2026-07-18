import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { useStaffSession } from "@/lib/staff";
import StaffSwitchChip from "./StaffSwitchChip";

beforeEach(() => useStaffSession.getState().reset());
afterEach(cleanup);

describe("StaffSwitchChip", () => {
  it("renders nothing when there is no staff session", () => {
    const { container } = render(<StaffSwitchChip variant="pos" />);
    expect(container.firstChild).toBeNull();
  });

  it("shows the staff member and switches (clears token, keeps outlet) on click", () => {
    useStaffSession.getState().setSession(
      "tok",
      { sid: "s1", tier: "manager", name: "Aisha Rahman", color: "ocean", outletId: "o1" },
      "d1",
    );
    useStaffSession.getState().setSessionOutlet("o1");
    render(<StaffSwitchChip variant="pos" />);
    expect(screen.getByText("Aisha Rahman")).toBeTruthy();

    fireEvent.click(screen.getByTestId("staff-switch-chip"));
    const st = useStaffSession.getState();
    expect(st.token).toBeNull();
    expect(st.staff).toBeNull();
    // Switching keeps the working outlet so re-PIN lands on the same tiles.
    expect(st.sessionOutletId).toBe("o1");
  });
});
