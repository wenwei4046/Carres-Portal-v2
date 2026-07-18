import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { useStaffSession } from "@/lib/staff";

// ── Mutable mock state driven per test ──────────────────────────────────────
const { authState, staffListState, outletsState, selfTokenMock } = vi.hoisted(() => ({
  authState: { role: "dealer" as string | null, dealerId: "d1" as string | null, user: { email: "owner@store.my" } },
  staffListState: { data: undefined as unknown, isPending: true, error: null as unknown },
  outletsState: { data: undefined as unknown, isPending: true, error: null as unknown },
  selfTokenMock: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  useAuth: (sel: (s: typeof authState) => unknown) => sel(authState),
}));
vi.mock("@/lib/queries", () => ({
  useStaffList: () => staffListState,
  useOutlets: () => outletsState,
  useDealerSelf: () => ({ data: { name: "Store" } }),
  useStaffSelfToken: () => ({ mutate: selfTokenMock, isPending: false }),
  useStaffReauth: () => ({ mutate: vi.fn(), isPending: false, isError: false, error: null }),
  useVerifyPin: () => ({ mutate: vi.fn(), isPending: false }),
  useCreateStaff: () => ({ mutate: vi.fn(), isPending: false, isError: false, error: null }),
  useSetStaffPin: () => ({ mutate: vi.fn(), isPending: false, isError: false, error: null, isSuccess: false }),
}));

import StaffGate from "./StaffGate";

const CHILD = <div data-testid="app-children">APP</div>;
function mount() {
  return render(
    <MemoryRouter>
      <StaffGate>{CHILD}</StaffGate>
    </MemoryRouter>,
  );
}

const OUTLET = (id: string) => ({ id, dealerId: "d1", name: `Outlet ${id}`, address: "1 Jln" });

beforeEach(() => {
  useStaffSession.getState().reset();
  authState.role = "dealer";
  authState.dealerId = "d1";
  staffListState.data = undefined;
  staffListState.isPending = true;
  staffListState.error = null;
  outletsState.data = undefined;
  outletsState.isPending = true;
  selfTokenMock.mockReset();
});
afterEach(cleanup);

describe("StaffGate branching", () => {
  it("a valid token in the store renders the app", () => {
    useStaffSession.getState().setSession(
      "tok",
      { sid: "s1", tier: "manager", name: "Me", color: "flame", outletId: "o1" },
      "d1",
    );
    mount();
    expect(screen.getByTestId("app-children")).toBeTruthy();
  });

  it("dealer + not activated → forced setup wizard", () => {
    staffListState.data = { staff: [], activated: false, selfStaffId: null, storeKind: "dealer" };
    staffListState.isPending = false;
    outletsState.data = { outlets: [OUTLET("o1")] };
    outletsState.isPending = false;
    mount();
    expect(screen.getByTestId("staff-setup-wizard")).toBeTruthy();
    expect(screen.queryByTestId("app-children")).toBeNull();
  });

  it("dealer + activated + single outlet → PIN screen (outlet auto-selected)", async () => {
    staffListState.data = {
      staff: [{ id: "s1", dealerId: "d1", outletId: "o1", name: "Ben", phone: null, userId: null, staffRole: "salesperson", color: "flame", active: true, hasPin: true }],
      activated: true,
      selfStaffId: null,
      storeKind: "dealer",
    };
    staffListState.isPending = false;
    outletsState.data = { outlets: [OUTLET("o1")] };
    outletsState.isPending = false;
    mount();
    expect(await screen.findByTestId("staff-pin-screen")).toBeTruthy();
  });

  it("dealer + activated + multiple outlets → outlet picker first", () => {
    staffListState.data = { staff: [], activated: true, selfStaffId: null, storeKind: "dealer" };
    staffListState.isPending = false;
    outletsState.data = { outlets: [OUTLET("o1"), OUTLET("o2")] };
    outletsState.isPending = false;
    mount();
    expect(screen.getByTestId("staff-outlet-picker")).toBeTruthy();
  });

  it("salesperson self-token success → app (no PIN screen)", async () => {
    authState.role = "salesperson";
    selfTokenMock.mockImplementation((_v, opts) =>
      opts.onSuccess({ token: "tok", staff: { id: "s9", staffRole: "salesperson", name: "SP", color: null, outletId: "o1" }, tier: "salesperson", outletId: "o1" }),
    );
    mount();
    expect(await screen.findByTestId("app-children")).toBeTruthy();
    expect(useStaffSession.getState().token).toBe("tok");
  });

  it("salesperson self-token 409 (unlinked) → app anyway (today's behaviour)", async () => {
    authState.role = "salesperson";
    selfTokenMock.mockImplementation((_v, opts) => opts.onError(new Error("unlinked")));
    mount();
    expect(await screen.findByTestId("app-children")).toBeTruthy();
    expect(useStaffSession.getState().token).toBeNull();
  });

  it("a stale session from a DIFFERENT dealer is dropped (shared kiosk)", () => {
    useStaffSession.getState().setSession(
      "tok",
      { sid: "s1", tier: "manager", name: "Me", color: "flame", outletId: "o1" },
      "OTHER-DEALER",
    );
    staffListState.data = { staff: [], activated: true, selfStaffId: null, storeKind: "dealer" };
    staffListState.isPending = false;
    outletsState.data = { outlets: [OUTLET("o1"), OUTLET("o2")] };
    outletsState.isPending = false;
    mount();
    // authDealerId is d1 ≠ OTHER-DEALER → reset() fires → no token → gate shows.
    expect(useStaffSession.getState().token).toBeNull();
    expect(screen.queryByTestId("app-children")).toBeNull();
  });
});
