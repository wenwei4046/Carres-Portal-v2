import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { OutletDto } from "@carres/shared";
import { useStaffSession } from "@/lib/staff";

const { reauthMock, createMock, setPinMock } = vi.hoisted(() => ({
  reauthMock: vi.fn(),
  createMock: vi.fn(),
  setPinMock: vi.fn(),
}));
vi.mock("@/lib/queries", () => ({
  useStaffReauth: () => ({ mutate: reauthMock, isPending: false, isError: false, error: null }),
  useCreateStaff: () => ({ mutate: createMock, isPending: false, isError: false, error: null }),
  useSetStaffPin: () => ({ mutate: setPinMock, isPending: false, isError: false, error: null, isSuccess: false }),
}));

import SetupWizard from "./SetupWizard";

const OUTLETS: OutletDto[] = [{ id: "o1", dealerId: "d1", name: "Main", address: "1 Jln" }];

function type(prefix: string, digits: string) {
  for (const d of digits) fireEvent.click(screen.getByTestId(`${prefix}-${d}`));
}

beforeEach(() => {
  useStaffSession.getState().reset();
  reauthMock.mockReset();
  createMock.mockReset();
  setPinMock.mockReset();
});
afterEach(cleanup);

describe("SetupWizard happy path", () => {
  it("reauth → create owner identity with a PIN → finish", () => {
    reauthMock.mockImplementation((_v, opts) =>
      opts.onSuccess({ token: "owner-tok", staff: null, tier: "principal", outletId: null }),
    );
    createMock.mockImplementation((_v, opts) => opts.onSuccess({ id: "new" }));
    const onDone = vi.fn();

    render(
      <SetupWizard
        staff={[]}
        storeKind="dealer"
        dealerId="d1"
        outlets={OUTLETS}
        prefillName="Owner Lee"
        onDone={onDone}
      />,
    );

    // Step 1 — reauth.
    fireEvent.change(screen.getByTestId("staff-reauth-password"), { target: { value: "hunter2" } });
    fireEvent.click(screen.getByTestId("staff-reauth-submit"));
    expect(reauthMock).toHaveBeenCalledWith({ password: "hunter2" }, expect.any(Object));
    // Owner-mode token stored so the create is authorised.
    expect(useStaffSession.getState().token).toBe("owner-tok");

    // Step 2 — identity: name prefilled, choose a colour + PIN (twice).
    const name = screen.getByTestId("staff-setup-name") as HTMLInputElement;
    expect(name.value).toBe("Owner Lee");
    fireEvent.click(screen.getByTestId("staff-setup-color-ocean"));
    type("staff-choose-pin", "135790"); // choose
    type("staff-choose-pin", "135790"); // confirm
    expect(screen.getByTestId("staff-pinchooser-done")).toBeTruthy();

    fireEvent.click(screen.getByTestId("staff-setup-identity-submit"));
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Owner Lee", staffRole: "principal", color: "ocean", pin: "135790", outletId: null }),
      expect.any(Object),
    );

    // Step 3 — no existing staff → all set → finish.
    fireEvent.click(screen.getByTestId("staff-setup-finish"));
    expect(onDone).toHaveBeenCalled();
  });

  it("mismatched confirm PIN does not complete the chooser", () => {
    reauthMock.mockImplementation((_v, opts) =>
      opts.onSuccess({ token: "owner-tok", staff: null, tier: "principal", outletId: null }),
    );
    render(
      <SetupWizard staff={[]} storeKind="dealer" dealerId="d1" outlets={OUTLETS} prefillName="Owner" onDone={() => {}} />,
    );
    fireEvent.change(screen.getByTestId("staff-reauth-password"), { target: { value: "x" } });
    fireEvent.click(screen.getByTestId("staff-reauth-submit"));

    type("staff-choose-pin", "111111"); // choose
    type("staff-choose-pin", "222222"); // wrong confirm
    expect(screen.queryByTestId("staff-pinchooser-done")).toBeNull();
    const submit = screen.getByTestId("staff-setup-identity-submit") as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });

  it("showroom creates a manager identity (not principal)", () => {
    reauthMock.mockImplementation((_v, opts) =>
      opts.onSuccess({ token: "owner-tok", staff: null, tier: "manager", outletId: "o1" }),
    );
    createMock.mockImplementation((_v, opts) => opts.onSuccess({ id: "new" }));
    render(
      <SetupWizard staff={[]} storeKind="showroom" dealerId="d1" outlets={OUTLETS} prefillName="Mgr" onDone={() => {}} />,
    );
    fireEvent.change(screen.getByTestId("staff-reauth-password"), { target: { value: "x" } });
    fireEvent.click(screen.getByTestId("staff-reauth-submit"));
    type("staff-choose-pin", "246800");
    type("staff-choose-pin", "246800");
    fireEvent.click(screen.getByTestId("staff-setup-identity-submit"));
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({ staffRole: "manager", outletId: "o1" }),
      expect.any(Object),
    );
  });
});
