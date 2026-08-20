/**
 * TeamPanel — the Quick Rail corrections of 2026-08-15 (owner).
 *
 *  · GRN DUTY names a holder, auto-assigned through the SAME rota as PO duty.
 *    It printed `Not assigned` every month since it shipped, because it was
 *    derived on the client by reaching backwards through a roster the API only
 *    fills forwards.
 *  · An authorised user gets an edit door; nobody else does.
 *  · Each staff member's `{n} open · {n} overdue` comes from the ONE work
 *    engine and the row deep-links into that person's Team Work.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const h = vi.hoisted(() => ({
  duty: {} as Record<string, unknown>,
  staff: [] as unknown[],
  myDuties: [] as string[],
  role: "operation" as string,
  email: "shasha@carres.com" as string | null,
  work: [] as unknown[],
  updated: [] as unknown[],
}));

vi.mock("@/lib/queries", () => ({
  useOperationPoDuty: () => ({ data: h.duty }),
  useOperationStaff: () => ({ data: { staff: h.staff, myDuties: h.myDuties } }),
  useUpdatePoDuty: () => ({
    isPending: false,
    mutate: (input: unknown) => h.updated.push(input),
  }),
}));

vi.mock("@/lib/auth", () => ({
  useAuth: (sel: (s: unknown) => unknown) =>
    sel({ role: h.role, user: { email: h.email } }),
}));

vi.mock("../../use-open-work", async () => {
  const actual = await vi.importActual<typeof import("../../use-open-work")>(
    "../../use-open-work",
  );
  return { ...actual, useOpenWorkSet: () => ({ items: h.work, staff: h.staff, staffById: new Map(), loading: false }) };
});

import TeamPanel from "./TeamPanel";

const SHASHA = "00000000-0000-0000-0000-0000000000aa";
const YUJUN = "00000000-0000-0000-0000-0000000000bb";

function member(user_id: string, name: string, over: Record<string, unknown> = {}) {
  return {
    user_id,
    name,
    email: `${name.toLowerCase().replace(/\s+/g, "")}@carres.com`,
    pooled: true,
    available: true,
    note: null,
    last_seen_at: null,
    duties: [],
    ...over,
  };
}

function workItem(ownerId: string, workingDaysLate = 0) {
  return { ownerId, workingDaysLate };
}

function view() {
  return render(
    <MemoryRouter>
      <TeamPanel />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  h.duty = {
    month: "2026-08",
    holder: { userId: SHASHA, name: "Shasha", email: "shasha@carres.com", assignedBy: null },
    grnMonth: "2026-09",
    grnHolder: { userId: YUJUN, name: "Yu Jun", email: "yujun@carres.com", assignedBy: null },
  };
  h.staff = [member(SHASHA, "Shasha"), member(YUJUN, "Yu Jun")];
  h.myDuties = [];
  h.role = "operation";
  h.email = "shasha@carres.com";
  h.work = [];
  h.updated = [];
});

describe("TeamPanel — GRN duty always names its holder", () => {
  it("states the receiver, and never leaves the row empty", () => {
    view();
    const row = screen.getByTestId("duty-row-grn-duty");
    expect(within(row).getByText("GRN Duty")).toBeTruthy();
    expect(within(row).getByText("Yu Jun")).toBeTruthy();
    expect(within(row).queryByText("Not assigned")).toBeNull();
  });

  it("the two duties are never one person", () => {
    view();
    expect(within(screen.getByTestId("duty-row-po-duty")).getByText("Shasha")).toBeTruthy();
    expect(within(screen.getByTestId("duty-row-grn-duty")).getByText("Yu Jun")).toBeTruthy();
  });

  it("`Not assigned` says where to fix it when nobody can hold the duty", () => {
    h.duty = { month: "2026-08", holder: null, grnMonth: "2026-09", grnHolder: null };
    h.staff = [];
    view();
    const panel = screen.getByTestId("team-panel");
    expect(within(panel).getAllByText("Not assigned").length).toBe(2);
    expect(
      within(panel).getAllByText("Add someone to the assignment pool in Settings.").length,
    ).toBe(2);
  });
});

describe("TeamPanel — the duty edit door", () => {
  it("is not drawn for staff who may not rewrite the rota", () => {
    view();
    expect(screen.queryByTestId("duty-edit-grn-duty")).toBeNull();
  });

  it("opens for the roster editor and writes the GRN month, not this month", () => {
    h.myDuties = ["po_duty_editor"];
    view();
    fireEvent.click(screen.getByTestId("duty-edit-grn-duty"));
    // The door names the month it writes — GRN duty is the NEXT month's row.
    expect(screen.getByTestId("duty-editor").textContent).toContain("Sep 2026");
    fireEvent.click(screen.getByTestId(`duty-pick-${SHASHA}`));
    expect(h.updated).toEqual([{ userId: SHASHA, month: "2026-09" }]);
  });

  it("the PO door writes the CURRENT month", () => {
    h.myDuties = ["po_duty_editor"];
    view();
    fireEvent.click(screen.getByTestId("duty-edit-po-duty"));
    fireEvent.click(screen.getByTestId(`duty-pick-${YUJUN}`));
    expect(h.updated).toEqual([{ userId: YUJUN, month: "2026-08" }]);
  });
});

describe("TeamPanel — per-person workload preview", () => {
  it("prints each person's open and overdue counts", () => {
    h.work = [
      workItem(SHASHA),
      workItem(SHASHA, 3),
      workItem(YUJUN),
    ];
    view();
    expect(screen.getByTestId(`team-workload-${SHASHA}`).textContent).toContain("2 actions to do");
    expect(screen.getByTestId(`team-workload-${SHASHA}`).textContent).toContain("1 late");
    expect(screen.getByTestId(`team-workload-${YUJUN}`).textContent).toContain("1 action to do");
  });

  it("shows a person with a clear desk rather than hiding them", () => {
    h.work = [workItem(SHASHA)];
    view();
    const row = screen.getByTestId(`team-workload-${YUJUN}`);
    expect(row.textContent).toContain("0 actions to do");
    expect(row.textContent).not.toContain("overdue");
  });

  it("deep-links into that person's Team Work", () => {
    h.work = [workItem(SHASHA)];
    view();
    expect(screen.getByTestId(`team-workload-${SHASHA}`).getAttribute("href")).toBe(
      `/operation?tab=work&scope=team&owner=${SHASHA}`,
    );
  });

  it("writes nothing — no action control sits on a workload row", () => {
    h.work = [workItem(SHASHA)];
    view();
    const row = screen.getByTestId(`team-workload-${SHASHA}`);
    expect(row.querySelector("button")).toBeNull();
  });
});
