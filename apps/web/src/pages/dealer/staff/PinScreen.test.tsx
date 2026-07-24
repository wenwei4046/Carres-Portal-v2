import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { StaffDto } from "@carres/shared";
import { ApiError } from "@/lib/api";
import { useStaffSession } from "@/lib/staff";
import PinScreen from "./PinScreen";

// One configurable verify mutation the tests drive per case.
const { verifyMock } = vi.hoisted(() => ({ verifyMock: vi.fn() }));
vi.mock("@/lib/queries", () => ({
  useVerifyPin: () => ({ mutate: verifyMock, isPending: false }),
}));

function staff(over: Partial<StaffDto> & { id: string; name: string }): StaffDto {
  return {
    dealerId: "d1",
    outletId: "o1",
    phone: null,
    userId: null,
    staffRole: "salesperson",
    color: "flame",
    active: true,
    hasPin: true,
    ...over,
  } as StaffDto;
}

const ROSTER: StaffDto[] = [
  staff({ id: "s1", name: "Aisha Rahman", staffRole: "manager", color: "ocean" }),
  staff({ id: "s2", name: "Ben Tan" }),
  staff({ id: "s3", name: "No Pin", hasPin: false }),
  staff({ id: "s4", name: "Other Outlet", outletId: "o2" }),
  staff({ id: "s5", name: "Inactive", active: false }),
];

function type(prefix: string, digits: string) {
  for (const d of digits) fireEvent.click(screen.getByTestId(`${prefix}-${d}`));
}

beforeEach(() => useStaffSession.getState().reset());
afterEach(() => {
  cleanup();
  verifyMock.mockReset();
});

describe("PinScreen", () => {
  it("shows active, outlet-matching tiles; PIN-less tile disabled with badge; hides other-outlet/inactive", () => {
    render(
      <PinScreen staff={ROSTER} sessionOutletId="o1" dealerId="d1" onForgotPin={() => {}} />,
    );
    expect(screen.getByTestId("staff-tile-s1")).toBeTruthy();
    expect(screen.getByTestId("staff-tile-s2")).toBeTruthy();
    // No-PIN tile is present but disabled + carries the badge.
    const noPin = screen.getByTestId("staff-tile-s3") as HTMLButtonElement;
    expect(noPin.disabled).toBe(true);
    expect(screen.getByText("No PIN")).toBeTruthy();
    // Other outlet + inactive are filtered out.
    expect(screen.queryByTestId("staff-tile-s4")).toBeNull();
    expect(screen.queryByTestId("staff-tile-s5")).toBeNull();
  });

  it("a principal (store owner) tile shows in every outlet; a manager stays outlet-bound", () => {
    const ownerElsewhere = staff({ id: "p9", name: "Owner", staffRole: "principal", outletId: "o2" });
    const mgrElsewhere = staff({ id: "m9", name: "Roaming Mgr", staffRole: "manager", outletId: "o2" });
    render(
      <PinScreen staff={[ownerElsewhere, mgrElsewhere]} sessionOutletId="o1" dealerId="d1" onForgotPin={() => {}} />,
    );
    // Principal crosses outlets; the manager bound to o2 doesn't show at o1.
    expect(screen.getByTestId("staff-tile-p9")).toBeTruthy();
    expect(screen.queryByTestId("staff-tile-m9")).toBeNull();
  });

  it("verifying the PIN stores the token + staff identity", () => {
    verifyMock.mockImplementation((_vars, opts) =>
      opts.onSuccess({
        token: "tok-123",
        staff: ROSTER[1],
        tier: "salesperson",
        outletId: "o1",
      }),
    );
    render(
      <PinScreen staff={ROSTER} sessionOutletId="o1" dealerId="d1" onForgotPin={() => {}} />,
    );
    fireEvent.click(screen.getByTestId("staff-tile-s2"));
    expect(screen.getByTestId("staff-pin-keypad")).toBeTruthy();
    type("staff-pin", "246810");
    expect(verifyMock).toHaveBeenCalledWith(
      { salespersonId: "s2", pin: "246810" },
      expect.any(Object),
    );
    const st = useStaffSession.getState();
    expect(st.token).toBe("tok-123");
    expect(st.staff?.sid).toBe("s2");
    expect(st.staff?.tier).toBe("salesperson");
  });

  it("bad_pin surfaces the remaining-tries message", () => {
    verifyMock.mockImplementation((_vars, opts) =>
      opts.onError(new ApiError(401, "bad_pin", { error: "bad_pin", remaining: 3 })),
    );
    render(<PinScreen staff={ROSTER} sessionOutletId="o1" dealerId="d1" onForgotPin={() => {}} />);
    fireEvent.click(screen.getByTestId("staff-tile-s2"));
    type("staff-pin", "000000");
    expect(screen.getByTestId("staff-pin-message").textContent).toMatch(/3 tries left/);
    expect(useStaffSession.getState().token).toBeNull();
  });

  it("pin_locked shows the lock countdown and disables the pad", () => {
    const until = new Date(Date.now() + 60_000).toISOString();
    verifyMock.mockImplementation((_vars, opts) =>
      opts.onError(new ApiError(423, "pin_locked", { error: "pin_locked", lockedUntil: until })),
    );
    render(<PinScreen staff={ROSTER} sessionOutletId="o1" dealerId="d1" onForgotPin={() => {}} />);
    fireEvent.click(screen.getByTestId("staff-tile-s2"));
    type("staff-pin", "000000");
    expect(screen.getByText(/Locked · try again in/)).toBeTruthy();
    const key = screen.getByTestId("staff-pin-1") as HTMLButtonElement;
    expect(key.disabled).toBe(true);
  });

  it("Forgot PIN fires the callback", () => {
    const onForgot = vi.fn();
    render(<PinScreen staff={ROSTER} sessionOutletId="o1" dealerId="d1" onForgotPin={onForgot} />);
    fireEvent.click(screen.getByTestId("staff-forgot-pin"));
    expect(onForgot).toHaveBeenCalled();
  });

  it("multi-outlet: the outlet pill shows the outlet name and fires onSwitchOutlet", () => {
    const onSwitch = vi.fn();
    render(
      <PinScreen
        staff={ROSTER}
        sessionOutletId="o1"
        dealerId="d1"
        outletLabel="Kota Damansara"
        onForgotPin={() => {}}
        onSwitchOutlet={onSwitch}
      />,
    );
    const pill = screen.getByTestId("staff-outlet-switch");
    expect(pill.textContent).toMatch(/Kota Damansara/);
    fireEvent.click(pill);
    expect(onSwitch).toHaveBeenCalled();
  });

  it("single-outlet (no onSwitchOutlet): the eyebrow stays static — no pill", () => {
    render(
      <PinScreen
        staff={ROSTER}
        sessionOutletId="o1"
        dealerId="d1"
        outletLabel="Kota Damansara"
        onForgotPin={() => {}}
      />,
    );
    expect(screen.queryByTestId("staff-outlet-switch")).toBeNull();
    expect(screen.getByText("Kota Damansara")).toBeTruthy();
  });
});

// Guards the keypad extraction: the shared PinPad still emits os-pin-* testids
// for OrderStatusPage while the staff screen uses its own namespace.
describe("PinPad namespace isolation", () => {
  it("staff keypad uses staff-pin-* ids, not os-pin-*", () => {
    render(<PinScreen staff={ROSTER} sessionOutletId="o1" dealerId="d1" onForgotPin={() => {}} />);
    fireEvent.click(screen.getByTestId("staff-tile-s2"));
    expect(screen.getByTestId("staff-pin-5")).toBeTruthy();
    expect(screen.queryByTestId("os-pin-5")).toBeNull();
  });
});
