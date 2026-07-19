import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { EmailChangeRequestDto } from "@carres/shared";

let requests: EmailChangeRequestDto[] = [];
const decideMutate = vi.fn();
vi.mock("@/lib/queries", () => ({
  usePrincipalAccounts: () => ({ data: { users: [] }, isLoading: false }),
  useCreateAccount: () => ({ mutate: vi.fn(), isPending: false }),
  useCreateStaff: () => ({ mutate: vi.fn(), isPending: false }),
  usePrincipalDealers: () => ({ data: { dealers: [] } }),
  usePrincipalEmailChanges: () => ({ data: { requests }, isPending: false }),
  useDecideEmailChange: () => ({ mutate: decideMutate, isPending: false }),
  useSetAccountStatus: () => ({ mutate: vi.fn(), isPending: false }),
  useResetAccountPassword: () => ({ mutate: vi.fn(), isPending: false }),
  useStaffList: () => ({ data: undefined, isPending: false, error: null }),
}));

import { EmailChangeRequestsPanel } from "./PrincipalAccounts";

function req(over: Partial<EmailChangeRequestDto>): EmailChangeRequestDto {
  return {
    id: "00000000-0000-0000-0000-00000000ac01",
    userId: "00000000-0000-0000-0000-00000000aa01",
    dealerId: "00000000-0000-0000-0000-000000000d01",
    currentEmail: "store@carres.com",
    requestedEmail: "new@carres.com",
    status: "pending",
    requestedByName: "Tan Qu Qu",
    decisionNote: null,
    decidedAt: null,
    createdAt: "2026-07-19T00:00:00Z",
    dealerName: "Litte Mattress",
    ...over,
  };
}

beforeEach(() => {
  requests = [];
  decideMutate.mockClear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("EmailChangeRequestsPanel — HQ approval queue", () => {
  it("renders nothing when no request is pending", () => {
    requests = [req({ status: "approved" })];
    render(<EmailChangeRequestsPanel />);
    expect(screen.queryByTestId("email-change-panel")).toBeNull();
  });

  it("lists pending rows with store + emails + filer", () => {
    requests = [req({})];
    render(<EmailChangeRequestsPanel />);
    const row = screen.getByTestId(`email-change-row-${requests[0].id}`);
    expect(row.textContent).toContain("Litte Mattress");
    expect(row.textContent).toContain("store@carres.com");
    expect(row.textContent).toContain("new@carres.com");
    expect(row.textContent).toContain("Tan Qu Qu");
  });

  it("approve confirms then mutates; reject prompts for a note", () => {
    requests = [req({})];
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.spyOn(window, "prompt").mockReturnValue("use company domain");
    render(<EmailChangeRequestsPanel />);

    fireEvent.click(screen.getByTestId(`email-change-approve-${requests[0].id}`));
    expect(decideMutate).toHaveBeenCalledWith(
      { id: requests[0].id, action: "approve" },
      expect.anything(),
    );

    fireEvent.click(screen.getByTestId(`email-change-reject-${requests[0].id}`));
    expect(decideMutate).toHaveBeenCalledWith(
      { id: requests[0].id, action: "reject", note: "use company domain" },
      expect.anything(),
    );
  });

  it("cancelling the reject prompt aborts (no mutation)", () => {
    requests = [req({})];
    vi.spyOn(window, "prompt").mockReturnValue(null);
    render(<EmailChangeRequestsPanel />);
    fireEvent.click(screen.getByTestId(`email-change-reject-${requests[0].id}`));
    expect(decideMutate).not.toHaveBeenCalled();
  });
});
