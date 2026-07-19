import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import type { User } from "@supabase/supabase-js";
import type { EmailChangeRequestDto, StaffTierDto } from "@carres/shared";
import { useAuth } from "@/lib/auth";
import { useStaffSession } from "@/lib/staff";

const changeOwnPassword = vi.fn(async () => ({ ok: true as const }));
vi.mock("@/lib/password", () => ({
  changeOwnPassword: (...args: unknown[]) => changeOwnPassword(...(args as [])),
}));

let latestRequest: EmailChangeRequestDto | null = null;
const submitMutate = vi.fn();
const cancelMutate = vi.fn();
vi.mock("@/lib/queries", () => ({
  useMyEmailChange: () => ({ data: { request: latestRequest }, isPending: false, error: null }),
  useSubmitEmailChange: () => ({ mutate: submitMutate, isPending: false }),
  useCancelEmailChange: () => ({ mutate: cancelMutate, isPending: false }),
}));

import StoreAccountSection from "./StoreAccountSection";

function req(over: Partial<EmailChangeRequestDto>): EmailChangeRequestDto {
  return {
    id: "00000000-0000-0000-0000-00000000ac01",
    userId: "00000000-0000-0000-0000-00000000aa01",
    dealerId: "00000000-0000-0000-0000-000000000d01",
    currentEmail: "store@carres.com",
    requestedEmail: "new@carres.com",
    status: "pending",
    requestedByName: null,
    decisionNote: null,
    decidedAt: null,
    createdAt: "2026-07-19T00:00:00Z",
    dealerName: null,
    ...over,
  };
}

function asSession(role: "dealer" | "showroom", tier: StaffTierDto) {
  useAuth.setState({ role, user: { email: "store@carres.com" } as User });
  useStaffSession
    .getState()
    .setSession("t", { sid: null, tier, name: "Owner", color: null, outletId: null }, "d1");
}

beforeEach(() => {
  latestRequest = null;
  changeOwnPassword.mockClear();
  submitMutate.mockClear();
  cancelMutate.mockClear();
  useStaffSession.getState().reset();
  useAuth.setState({ role: null, user: null });
});
afterEach(cleanup);

describe("StoreAccountSection — dealer-principal store credential card", () => {
  it("renders for a dealer principal: email + both actions", () => {
    asSession("dealer", "principal");
    render(<StoreAccountSection />);
    expect(screen.getByTestId("store-account-section")).toBeTruthy();
    expect(screen.getByTestId("store-account-email").textContent).toContain("store@carres.com");
    expect(screen.getByTestId("store-account-changepw")).toBeTruthy();
    expect(screen.getByTestId("store-account-changeemail")).toBeTruthy();
  });

  it("hidden for lower tiers and for showroom stores", () => {
    asSession("dealer", "manager");
    render(<StoreAccountSection />);
    expect(screen.queryByTestId("store-account-section")).toBeNull();
    cleanup();

    asSession("showroom", "manager");
    render(<StoreAccountSection />);
    expect(screen.queryByTestId("store-account-section")).toBeNull();
  });

  it("pending request → badge + withdraw, Change-email disabled", () => {
    latestRequest = req({ status: "pending" });
    asSession("dealer", "principal");
    render(<StoreAccountSection />);
    expect(screen.getByTestId("email-change-pending").textContent).toContain("new@carres.com");
    expect((screen.getByTestId("store-account-changeemail") as HTMLButtonElement).disabled).toBe(true);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.click(screen.getByTestId("email-change-cancel"));
    expect(cancelMutate).toHaveBeenCalled();
  });

  it("rejected request → HQ note shown", () => {
    latestRequest = req({ status: "rejected", decisionNote: "use company domain" });
    asSession("dealer", "principal");
    render(<StoreAccountSection />);
    expect(screen.getByTestId("email-change-rejected").textContent).toContain("use company domain");
  });

  it("password modal calls the shared changeOwnPassword with (email, current, next)", async () => {
    asSession("dealer", "principal");
    render(<StoreAccountSection />);
    fireEvent.click(screen.getByTestId("store-account-changepw"));
    fireEvent.change(screen.getByTestId("storepw-current"), { target: { value: "old-pw-111" } });
    fireEvent.change(screen.getByTestId("storepw-new"), { target: { value: "new-pw-12345" } });
    fireEvent.change(screen.getByTestId("storepw-confirm"), { target: { value: "new-pw-12345" } });
    fireEvent.click(screen.getByTestId("storepw-save"));
    await waitFor(() =>
      expect(changeOwnPassword).toHaveBeenCalledWith("store@carres.com", "old-pw-111", "new-pw-12345"),
    );
  });

  it("email modal submits the trimmed lowercase email + store password", () => {
    asSession("dealer", "principal");
    render(<StoreAccountSection />);
    fireEvent.click(screen.getByTestId("store-account-changeemail"));
    fireEvent.change(screen.getByTestId("emailchange-email"), { target: { value: " New@Store.com " } });
    fireEvent.change(screen.getByTestId("emailchange-password"), { target: { value: "store-pw" } });
    fireEvent.click(screen.getByTestId("emailchange-submit"));
    expect(submitMutate).toHaveBeenCalledWith(
      { newEmail: "new@store.com", password: "store-pw" },
      expect.anything(),
    );
  });
});
