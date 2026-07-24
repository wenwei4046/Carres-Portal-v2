import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
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

  it("a persisted outlet doesn't trap staff of a later-added outlet — the PIN screen's pill reopens the picker", () => {
    // The store activated single-outlet: o1 was auto-selected + persisted for
    // the tab. A second outlet o2 (with its own salesperson) was added later —
    // without the pill, the picker's sessionOutletId===null condition never
    // fires again and that salesperson has nowhere to sign in.
    useStaffSession.getState().setSessionOutlet("o1");
    const member = (over: Record<string, unknown>) => ({
      dealerId: "d1", phone: null, userId: null, color: "flame", active: true, hasPin: true, ...over,
    });
    staffListState.data = {
      staff: [
        member({ id: "own", outletId: null, name: "Owner", staffRole: "principal" }),
        member({ id: "mgr", outletId: "o1", name: "Alvin", staffRole: "manager" }),
        member({ id: "sp2", outletId: "o2", name: "Ahsihas", staffRole: "salesperson" }),
      ],
      activated: true,
      selfStaffId: null,
      storeKind: "dealer",
    };
    staffListState.isPending = false;
    outletsState.data = { outlets: [OUTLET("o1"), OUTLET("o2")] };
    outletsState.isPending = false;
    mount();

    // PIN screen scoped to o1 — the o2 salesperson has no tile yet.
    expect(screen.getByTestId("staff-pin-screen")).toBeTruthy();
    expect(screen.queryByTestId("staff-tile-sp2")).toBeNull();

    // The pill reopens the picker; picking o2 surfaces them (owner crosses,
    // the o1 manager drops out).
    fireEvent.click(screen.getByTestId("staff-outlet-switch"));
    expect(screen.getByTestId("staff-outlet-picker")).toBeTruthy();
    fireEvent.click(screen.getByTestId("staff-outlet-o2"));
    expect(screen.getByTestId("staff-tile-sp2")).toBeTruthy();
    expect(screen.getByTestId("staff-tile-own")).toBeTruthy();
    expect(screen.queryByTestId("staff-tile-mgr")).toBeNull();
  });

  it("single-outlet store: no switch pill on the PIN screen", async () => {
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
    expect(screen.queryByTestId("staff-outlet-switch")).toBeNull();
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
