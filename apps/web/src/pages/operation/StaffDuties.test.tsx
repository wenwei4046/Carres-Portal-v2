import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WORKSPACE_DUTIES } from "@carres/shared";
import { appTodayIso, fmtDate } from "@/lib/fmt-date";
import type { WorkspaceAssignmentRecord, WorkspaceDutiesResponse } from "@/lib/queries";

/**
 * `Settings → Staff & Duties` — the ONE duty assignment surface
 * (workspace/MASTER.md §§4.1–4.7).
 *
 * The page answers three questions and no more: who normally holds each
 * governed duty, who acts during a dated absence, and what history proves it.
 * It is one CATALOGUE and one SELECTED duty — not the 720px document that
 * stacked two forms and a full history under all twelve duties.
 *
 * What these tests hold:
 *   · every catalogue duty appears exactly once, in the shared order, and the
 *     count comes from the CATALOGUE rather than a number typed here;
 *   · today's facts are the resolver's answer, printed under the governed
 *     labels, with the acting line absent when nobody covers;
 *   · search and `State` narrow the catalogue only — they never change who
 *     holds a duty;
 *   · the selected duty lives in the URL, so a Work configuration failure can
 *     deep-link to the duty it needs.
 */

// ── hook mocks ───────────────────────────────────────────────────────────────

const assignMutate = vi.fn();
const coverMutate = vi.fn();

const state: {
  duties?: WorkspaceDutiesResponse;
  loading: boolean;
  error: boolean;
  assignError: Error | null;
  coverError: Error | null;
  assignPending: boolean;
  coverPending: boolean;
} = {
  loading: false,
  error: false,
  assignError: null,
  coverError: null,
  assignPending: false,
  coverPending: false,
};

const refetch = vi.fn();
const historyRefetch = vi.fn();
const historyNext = vi.fn();
const historyState = { records: [] as WorkspaceAssignmentRecord[], error: false, loading: false, next: false };

vi.mock("@/lib/queries", () => ({
  useWorkspaceAssignmentHistory: () => ({ data: { pages: [{ records: historyState.records }] }, isLoading: historyState.loading, isError: historyState.error, hasNextPage: historyState.next, refetch: historyRefetch, fetchNextPage: historyNext }),
  useWorkspaceDuties: () => ({
    data: state.duties,
    isLoading: state.loading,
    isError: state.error,
    refetch,
  }),
  useWorkspaceAssignDutyMutation: () => ({
    mutate: assignMutate,
    isPending: state.assignPending,
    error: state.assignError,
  }),
  useWorkspaceCoverDutyMutation: () => ({
    mutate: coverMutate,
    isPending: state.coverPending,
    error: state.coverError,
  }),
  qk: { operation: { staff: ["operation", "staff"] } },
  useOperationStaff: (opts?: { queryKey?: readonly unknown[] }) => ({
    data: {
      staff: opts?.queryKey?.includes("finance_approver")
        ? [{ user_id: "u-fiona", email: "fiona@x", name: "Fiona", pooled: false, available: false, note: null, last_seen_at: null, duties: [] }]
        : [
            { user_id: "u-yu-jun", email: "yujun@x", name: "Yu Jun", pooled: true, available: true, note: null, last_seen_at: null, duties: [] },
            { user_id: "u-shasha", email: "shasha@x", name: "Shasha", pooled: true, available: true, note: null, last_seen_at: null, duties: [] },
          ],
      myDuties: [],
    },
  }),
}));

// The shell header pulls the whole GlobalTopBar (orders query, router) — not
// this page's subject. A stub keeps the word visible and the page isolated.
vi.mock("./components/ModuleHeader", () => ({
  default: ({ word }: { word: string }) => (
    <h1 data-testid="module-header">{word}</h1>
  ),
}));

import StaffDuties from "./StaffDuties";

// ── fixtures ─────────────────────────────────────────────────────────────────

type Duty = WorkspaceDutiesResponse["duties"][number];

/* The company date the page itself reads. Fixtures are built RELATIVE to it,
   so no test passes only because it was written on a convenient day. */
const TODAY = appTodayIso();

function plusDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const at = new Date(y!, m! - 1, d! + days);
  const mm = String(at.getMonth() + 1).padStart(2, "0");
  const dd = String(at.getDate()).padStart(2, "0");
  return `${at.getFullYear()}-${mm}-${dd}`;
}

const COVER_FROM = plusDays(TODAY, -1);
const COVER_UNTIL = plusDays(TODAY, 1);
const HELD_FROM = plusDays(TODAY, -15);

function heldBy(key: string, label: string, name: string, id: string): Duty {
  return {
    key,
    label,
    resolution: {
      duty_key: key,
      normal_user_id: id,
      normal_user_name: name,
      acting_user_id: id,
      acting_user_name: name,
      actor_user_id: id,
      is_cover: false,
      is_superuser: false,
      allowed: true,
      source: "assignment",
    },
    assignments: [
      {
        id: `as-${key}`,
        duty_key: key,
        holder_id: id,
        holder_name: name,
        effective_from: HELD_FROM,
        effective_until: null,
        assigned_by_name: "Jess",
        note: null,
        created_at: "2026-09-01T02:00:00Z",
      },
    ],
    covers: [],
  };
}

function notAssigned(key: string, label: string): Duty {
  return {
    key,
    label,
    resolution: {
      duty_key: key,
      normal_user_id: null,
      normal_user_name: null,
      acting_user_id: null,
      acting_user_name: null,
      actor_user_id: null,
      is_cover: false,
      is_superuser: false,
      allowed: false,
      source: "not_assigned",
    },
    assignments: [],
    covers: [],
  };
}

/** GRN Duty: Yu Jun normally holds it, Shasha is acting today on annual
 *  leave cover — the §4.2 picture, so the detail must separate the two. */
function coveredGrn(): Duty {
  const base = heldBy("grn_duty", "GRN Duty", "Yu Jun", "u-yu-jun");
  return {
    ...base,
    resolution: {
      ...base.resolution,
      acting_user_id: "u-shasha",
      acting_user_name: "Shasha",
      actor_user_id: "u-shasha",
      is_cover: true,
      cover_id: "cv-grn",
    },
    covers: [
      {
        id: "cv-grn",
        duty_key: "grn_duty",
        normal_user_id: "u-yu-jun",
        normal_user_name: "Yu Jun",
        acting_user_id: "u-shasha",
        acting_user_name: "Shasha",
        starts_on: COVER_FROM,
        ends_on: COVER_UNTIL,
        reason: "Annual leave",
        assigned_by_name: "Jess",
        created_at: `${COVER_FROM}T02:00:00Z`,
      },
    ],
  };
}

/** The whole shared catalogue, so a row count is the CATALOGUE's truth. */
function wholeCatalogue(canAssign = true): WorkspaceDutiesResponse {
  return {
    can_assign: canAssign,
    duties: WORKSPACE_DUTIES.map((d) => {
      if (d.key === "grn_duty") return coveredGrn();
      if (d.key === "delivery_duty") return notAssigned(d.key, d.label);
      if (d.key === "po_duty") return heldBy(d.key, d.label, "Yu Jun", "u-yu-jun");
      return heldBy(d.key, d.label, "Shasha", "u-shasha");
    }),
  };
}

// ── render ───────────────────────────────────────────────────────────────────

let lastSearch = "";
let lastState: unknown;

function Probe() {
  const location = useLocation();
  lastSearch = location.search;
  lastState = location.state;
  return null;
}

function draw(url = "/operation?tab=staff-duties", routerState?: unknown) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: url.split("?")[0], search: url.includes("?") ? `?${url.split("?")[1]}` : "", state: routerState }]}>
      <Routes>
        <Route
          path="/operation/*"
          element={
            <>
              <StaffDuties />
              <Probe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  state.loading = false;
  state.error = false;
  state.assignError = null;
  state.coverError = null;
  state.assignPending = false;
  state.coverPending = false;
  state.duties = wholeCatalogue();
  lastSearch = "";
  historyState.records = []; historyState.error = false; historyState.loading = false; historyState.next = false;
});

function pickDay(triggerId: string, dayOfMonth: number): string {
  fireEvent.click(document.getElementById(triggerId)!);
  const cell = screen
    .getAllByRole("gridcell")
    .find((c) => c.textContent?.trim() === String(dayOfMonth));
  if (!cell) throw new Error(`no day cell for ${dayOfMonth}`);
  fireEvent.click(cell.querySelector("button") ?? cell);
  const [y, m] = TODAY.split("-");
  return `${y}-${m}-${String(dayOfMonth).padStart(2, "0")}`;
}

/** The kit's Select is a Radix listbox, opened then chosen by its option name. */
function choose(triggerId: string, optionName: string) {
  fireEvent.click(document.getElementById(triggerId)!);
  fireEvent.click(screen.getByRole("option", { name: optionName }));
}


function openAssign(key = "po_duty") {
  draw(`/operation?tab=staff-duties&duty=${key}`);
  const door = screen.getByRole("button", { name: "More actions" });
  fireEvent.keyDown(door, { key: "ArrowDown" });
  fireEvent.click(screen.getByRole("menuitem", { name: "Assign" }));
  return screen.getByRole("dialog", { name: "Assign" });
}

describe("Staff & Duties current assignment", () => {
  it("shows the destination and approved purpose", () => {
    draw();
    expect(screen.getByTestId("module-header")).toHaveTextContent("Staff & Duties");
    expect(screen.getByText("Who is assigned to each duty.")).toBeVisible();
  });
  it("keeps the shared catalogue once and one selected detail", () => {
    draw();
    expect(screen.getAllByTestId(/^duty-catalogue-/).map(r => r.getAttribute("data-testid"))).toEqual(WORKSPACE_DUTIES.map(d => `duty-catalogue-${d.key}`));
    expect(screen.getAllByTestId(/^selected-duty-/)).toHaveLength(1);
  });
  it("shows the resolved person instead of two competing owners", () => {
    draw("/operation?tab=staff-duties&duty=grn_duty");
    const detail = screen.getByTestId("selected-duty-grn_duty");
    expect(within(detail).getByText("Assigned to")).toBeVisible();
    expect(within(detail).getByText("Shasha")).toBeVisible();
    expect(within(detail).queryByText("Yu Jun")).toBeNull();
    expect(screen.queryByText("Normal owner")).toBeNull();
    expect(screen.queryByText("Acting today")).toBeNull();
    expect(screen.getByTestId("duty-catalogue-grn_duty")).toHaveTextContent("Assigned to Shasha");
  });
  it("uses a system assignment even when no dated manual cover exists", () => {
    const duty = state.duties!.duties.find(d => d.key === "po_duty")!;
    duty.resolution = { ...duty.resolution, source: "system_assignment", actor_user_id: "u-shasha", acting_user_id: "u-shasha", acting_user_name: "Shasha", is_cover: true };
    draw();
    expect(screen.getByTestId("duty-catalogue-po_duty")).toHaveTextContent("Assigned to Shasha");
    expect(screen.getByTestId("duty-avatar-current")).toHaveTextContent("SH");
  });
  it("does not fall back to the original person for a null system assignment", () => {
    const duty = state.duties!.duties.find(d => d.key === "po_duty")!;
    duty.resolution = { ...duty.resolution, source: "system_assignment", actor_user_id: null, acting_user_id: null, acting_user_name: null };
    draw();
    expect(screen.getByTestId("duty-catalogue-po_duty")).toHaveTextContent("Not assigned");
    expect(screen.getByTestId("selected-duty-po_duty")).not.toHaveTextContent("Yu Jun");
  });
  it("does not invent a name when identity projection is missing", () => {
    const duty = state.duties!.duties.find(d => d.key === "po_duty")!;
    duty.resolution.normal_user_name = null;
    draw();
    expect(screen.getByTestId("duty-catalogue-po_duty")).toHaveTextContent("Name not recorded");
    expect(screen.getByTestId("selected-duty-po_duty")).not.toHaveTextContent("u-yu-jun");
  });
  it("retains the current assignment when nobody can take an automatic reassignment", () => {
    state.duties!.duties[0].resolution.assignment_outcome = "no_candidate";
    draw();
    expect(screen.getByTestId("selected-duty-po_duty")).toHaveTextContent("Yu Jun");
    expect(screen.getByRole("alert")).toHaveTextContent("PO Duty could not be updated. Try again.");
  });
  it("keeps future assignments out of the current person", () => {
    const duty = state.duties!.duties.find(d => d.key === "po_duty")!;
    duty.next_assignment_id = "future";
    duty.assignments.unshift({ ...duty.assignments[0], id: "future", holder_name: "Shasha", holder_id: "u-shasha", effective_from: "2099-01-01" });
    draw();
    expect(screen.getByTestId("duty-catalogue-po_duty")).toHaveTextContent("Assigned to Yu Jun");
    expect(screen.getByText("Next")).toBeVisible();
    expect(screen.getByTestId("selected-duty-po_duty")).toHaveTextContent("Assigned to Shasha");
  });
  it("keeps history collapsed until requested", () => {
    draw();
    expect(screen.queryByTestId("assignment-as-po_duty")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "History" }));
    expect(screen.getByTestId("assignment-as-po_duty")).toHaveTextContent("Assigned to Yu Jun");
    fireEvent.click(screen.getByRole("button", { name: "History" }));
    expect(screen.queryByTestId("assignment-as-po_duty")).toBeNull();
  });
  it("shows dated movements without cover terminology", () => {
    draw("/operation?tab=staff-duties&duty=grn_duty");
    fireEvent.click(screen.getByRole("button", { name: "History" }));
    expect(screen.getByTestId("cover-cv-grn")).toHaveTextContent("Assigned to Shasha");
    expect(screen.getByTestId("cover-cv-grn")).not.toHaveTextContent("covering");
  });
  it("closes history when selecting a different duty", () => {
    draw();
    fireEvent.click(screen.getByRole("button", { name: "History" }));
    fireEvent.click(screen.getByTestId("duty-catalogue-grn_duty"));
    expect(screen.queryByTestId("cover-cv-grn")).toBeNull();
    expect(lastSearch).toContain("duty=grn_duty");
  });
  it("preserves the Work return context while selecting and returning", () => {
    const origin = { returnTo: "/operation?tab=work&view=team" };
    draw("/operation?tab=staff-duties&duty=po_duty", origin);
    fireEvent.click(screen.getByTestId("duty-catalogue-grn_duty"));
    expect(lastState).toEqual(origin);
    fireEvent.click(screen.getByRole("button", { name: "Back to duties" }));
    expect(lastSearch).not.toContain("duty=");
    expect(lastState).toEqual(origin);
  });
  it("corrects an unknown duty without losing return context", async () => {
    draw("/operation?tab=staff-duties&duty=unknown");
    await waitFor(() => expect(lastSearch).toContain("duty=po_duty"));
  });
  it("keeps the recorded effective date in history", () => {
    draw(); fireEvent.click(screen.getByRole("button", { name: "History" }));
    expect(screen.getByTestId("assignment-as-po_duty")).toHaveTextContent(fmtDate(HELD_FROM));
  });
  it("gives non-managers a read view without management controls", () => {
    state.duties!.can_assign = false;
    draw();
    expect(screen.queryByRole("button", { name: "More actions" })).toBeNull();
    expect(screen.queryByText("Duty assignments are set by the manager.")).toBeNull();
  });
  it("shows a loading state rather than an empty catalogue", () => {
    state.loading = true; state.duties = undefined; draw();
    expect(screen.queryByTestId("duty-catalogue-po_duty")).toBeNull();
    expect(screen.queryByText("No duties match this search")).toBeNull();
  });
  it("shows a repair action when the source fails", () => {
    state.error = true; state.duties = undefined; draw();
    expect(screen.getByText("Staff & Duties could not be opened")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(refetch).toHaveBeenCalled();
  });
});

describe("one assignment form", () => {
  it("opens from the accessible menu and uses the governed fields", () => {
    const dialog = openAssign();
    for (const label of ["Duty", "Assigned to", "From", "Until", "Reason"]) expect(within(dialog).getAllByText(label, { exact: false })[0]).toBeVisible();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });
  it("uses the server's role-scoped staff list", () => {
    openAssign("finance_approver");
    fireEvent.click(document.getElementById("assign-holder")!);
    expect(screen.getAllByRole("option").map(o => o.textContent)).toEqual(["Fiona"]);
  });
  it("requires a person", () => {
    openAssign(); fireEvent.click(screen.getByTestId("assign-submit"));
    expect(screen.getByTestId("assign-submit-error")).toHaveTextContent("Choose a person.");
    expect(assignMutate).not.toHaveBeenCalled(); expect(coverMutate).not.toHaveBeenCalled();
  });
  it("requires a start", () => {
    openAssign(); choose("assign-holder", "Shasha"); fireEvent.click(screen.getByTestId("assign-submit"));
    expect(screen.getByText("Choose when this assignment starts.")).toBeVisible();
  });
  it("refuses reversed dates", () => {
    openAssign(); choose("assign-holder", "Shasha"); pickDay("assign-effective-from", 20); pickDay("assign-effective-until", 15);
    fireEvent.click(screen.getByTestId("assign-submit"));
    expect(screen.getByText("Until must be on or after From.")).toBeVisible();
  });
  it("requires an end for a routine PO adjustment", () => {
    openAssign(); choose("assign-holder", "Shasha"); pickDay("assign-effective-from", 10);
    fireEvent.click(screen.getByTestId("assign-submit"));
    expect(screen.getByText("Choose valid assignment dates.")).toBeVisible();
  });
  it("requires a reason for a routine PO adjustment", () => {
    openAssign(); choose("assign-holder", "Shasha"); pickDay("assign-effective-from", 10); pickDay("assign-effective-until", 20);
    fireEvent.click(screen.getByTestId("assign-submit"));
    expect(screen.getByText("Write the reason.")).toBeVisible();
  });
  it("sends a bounded adjustment through the existing dated assignment door", () => {
    openAssign(); choose("assign-holder", "Shasha"); const from = pickDay("assign-effective-from", 10); const until = pickDay("assign-effective-until", 20);
    fireEvent.change(document.getElementById("assign-note")!, { target: { value: "Planned leave" } });
    fireEvent.click(screen.getByTestId("assign-submit"));
    expect(coverMutate).toHaveBeenCalledWith({ dutyKey: "po_duty", actingUserId: "u-shasha", startsOn: from, endsOn: until, reason: "Planned leave" }, expect.any(Object));
    expect(assignMutate).not.toHaveBeenCalled();
  });
  it("keeps an approver's unbounded appointment on the existing holder door", () => {
    openAssign("finance_approver"); choose("assign-holder", "Fiona"); const from = pickDay("assign-effective-from", 10);
    fireEvent.click(screen.getByTestId("assign-submit"));
    expect(assignMutate).toHaveBeenCalledWith({ dutyKey: "finance_approver", holderId: "u-fiona", effectiveFrom: from }, expect.any(Object));
  });
  it("does not optimistically change the displayed assignment after submitting", () => {
    openAssign(); choose("assign-holder", "Shasha"); pickDay("assign-effective-from", 10); pickDay("assign-effective-until", 20);
    fireEvent.change(document.getElementById("assign-note")!, { target: { value: "Leave" } });
    fireEvent.click(screen.getByTestId("assign-submit"));
    expect(screen.getByRole("dialog", { name: "Assign" })).toBeVisible();
  });
  it("cancels without a write", () => {
    openAssign(); fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull(); expect(assignMutate).not.toHaveBeenCalled(); expect(coverMutate).not.toHaveBeenCalled();
  });
});


describe("assignment evidence and refresh", () => {
  it("retains readable assignments when a background refresh fails", () => {
    state.error = true; draw();
    expect(screen.getByTestId("duty-catalogue-po_duty")).toHaveTextContent("Assigned to Yu Jun");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(refetch).toHaveBeenCalled();
  });
  it("shows the system's actual recording time and the checkpoint reason", () => {
    historyState.records = [{ id: 71, office_day: TODAY, period: "morning", cutoff_at: `${TODAY}T02:30:00Z`,
      recorded_at: `${TODAY}T02:31:00Z`, from_user_id: "u-yu-jun", to_user_id: "u-shasha", from_name: "Yu Jun", to_name: "Shasha", outcome: "reassigned", reason: "missing_period_activity" }];
    draw(); fireEvent.click(screen.getByRole("button", { name: "History" }));
    const record = screen.getByTestId("system-assignment-71");
    expect(record).toHaveTextContent("Assigned to Shasha by system");
    expect(record).toHaveTextContent(fmtDate(`${TODAY}T02:31:00Z`, { time: true }));
    expect(record).toHaveTextContent("Assignment reason: Yu Jun was not online by");
  });
  it("does not label recorded leave as missing portal activity", () => {
    historyState.records = [{ id: 72, office_day: TODAY, period: null, cutoff_at: `${TODAY}T03:00:00Z`,
      recorded_at: `${TODAY}T03:00:00Z`, from_user_id: "u-yu-jun", to_user_id: "u-shasha", from_name: "Yu Jun", to_name: "Shasha", outcome: "reassigned", reason: "recorded_unavailability" }];
    draw(); fireEvent.click(screen.getByRole("button", { name: "History" }));
    expect(screen.getByTestId("system-assignment-72")).not.toHaveTextContent("was not online");
  });
  it("retains source history and offers retry when movements cannot be read", () => {
    historyState.error = true; draw(); fireEvent.click(screen.getByRole("button", { name: "History" }));
    expect(screen.getByTestId("assignment-as-po_duty")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Try again" })); expect(historyRefetch).toHaveBeenCalled();
  });
  it("loads older movement evidence only when requested", () => {
    historyState.next = true; draw(); fireEvent.click(screen.getByRole("button", { name: "History" }));
    expect(historyNext).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Next" })); expect(historyNext).toHaveBeenCalledTimes(1);
  });
});
