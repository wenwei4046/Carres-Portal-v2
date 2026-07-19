/**
 * BdAccountsPage — the BD POS Accounts overlay (2026-07-19): dealer roster
 * with all-time stats, the create-dealer door, per-store staff panel, and the
 * audit-log activity feed.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import BdAccountsPage from "./BdAccountsPage";

const DEALER_A = "00000000-0000-0000-0000-00000000d001";

vi.mock("@/lib/queries", () => ({
  useBdDealers: () => ({
    data: {
      dealers: [
        {
          id: DEALER_A,
          name: "Kelana Jaya",
          region: "KV",
          contact: "kaan · 0123456789",
          status: "active",
          joinedDate: null,
          orderCount: 2,
          gmv: 7185,
          outstanding: 3592,
        },
      ],
    },
    isLoading: false,
    error: null,
  }),
  useBdActivity: () => ({
    data: {
      rows: [
        {
          id: "a-1",
          role: "bd",
          actor: "hugo@carresofficial.com",
          action: "Created dealer account · Owner Ong (owner@newdealer.com) · Dream Living Sdn Bhd",
          dealerId: DEALER_A,
          dealerName: "Dream Living Sdn Bhd",
          occurredAt: "2026-07-19T04:00:00Z",
        },
      ],
    },
  }),
  useBdCreateAccount: () => ({ mutate: vi.fn(), isPending: false, isError: false, error: null }),
  useStaffList: () => ({
    data: {
      staff: [
        {
          id: "00000000-0000-0000-0000-00000000ff01",
          dealerId: DEALER_A,
          outletId: null,
          name: "Aisha Rahman",
          phone: null,
          userId: null,
          createdAt: "2026-01-01T00:00:00Z",
          staffRole: "principal",
          color: "flame",
          active: true,
          email: "aisha@store.com",
          birthday: null,
          gender: null,
          hasPin: true,
        },
      ],
      activated: true,
      selfStaffId: null,
      storeKind: "dealer",
    },
    isPending: false,
    error: null,
  }),
  useOutlets: () => ({ data: { outlets: [{ id: "o-1", dealerId: DEALER_A, name: "KJ Outlet" }] } }),
  // staff-ui imports (unused paths in this smoke, but the partial module mock
  // must cover every hook the tree pulls in).
  useCreateStaff: () => ({ mutate: vi.fn(), isPending: false, isError: false, error: null }),
  usePatchStaff: () => ({ mutate: vi.fn(), isPending: false, isError: false, error: null }),
  useSetStaffPin: () => ({ mutate: vi.fn(), isPending: false, isError: false, error: null }),
  useVerifyPin: () => ({ mutate: vi.fn(), isPending: false }),
}));

describe("BdAccountsPage", () => {
  it("lists every store with all-time numbers + the activity feed", () => {
    render(<BdAccountsPage onClose={() => {}} />);
    const row = screen.getByTestId(`bd-account-row-${DEALER_A}`);
    expect(within(row).getByText("Kelana Jaya")).toBeTruthy();
    expect(row.textContent).toContain("RM 7,185");
    expect(row.textContent).toContain("2 orders");
    expect(screen.getByText(/Created dealer account/)).toBeTruthy();
  });

  it("opens the create-dealer modal (submit disabled until the form is complete)", () => {
    render(<BdAccountsPage onClose={() => {}} />);
    fireEvent.click(screen.getByTestId("bd-accounts-new"));
    const save = screen.getByTestId("bd-create-dealer-save") as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    expect(screen.getByTestId("bd-cd-company")).toBeTruthy();
    expect(screen.getByTestId("bd-cd-password")).toBeTruthy();
    expect(screen.getByTestId("bd-cd-staff-pin")).toBeTruthy();
  });

  it("opens the per-store staff panel with the shared Add-staff door", () => {
    render(<BdAccountsPage onClose={() => {}} />);
    fireEvent.click(screen.getByTestId(`bd-account-staff-${DEALER_A}`));
    const panel = screen.getByTestId("bd-staff-panel");
    expect(within(panel).getByText("Aisha Rahman")).toBeTruthy();
    expect(within(panel).getByTestId("bd-staff-add")).toBeTruthy();
    // Set/Reset PIN + Edit actions per row.
    expect(within(panel).getByText("Reset PIN")).toBeTruthy();
    expect(within(panel).getByText("Edit")).toBeTruthy();
  });
});
