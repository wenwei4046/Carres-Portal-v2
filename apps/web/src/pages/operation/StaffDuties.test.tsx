import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceDutiesResponse } from "@/lib/queries";
import { fmtDate } from "@/lib/fmt-date";

/**
 * `Workspace → Staff & Duties` — the ONE duty assignment surface
 * (workspace/MASTER.md, LOCKED 2026-09-03).
 *
 * What matters: today's resolution is honest (holder, cover-acting, or the
 * explicit Not-assigned exception — never a fallback person, never "—"); the
 * forms exist only when the SERVER says `can_assign` (a non-manager gets the
 * quiet sentence, never a disabled control); mutations carry the exact
 * camelCase contract the API validates; and history is immutable — names and
 * ruled dates, no edit or delete anywhere.
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
} = { loading: false, error: false, assignError: null, coverError: null };

const refetch = vi.fn();

vi.mock("@/lib/queries", () => ({
  useWorkspaceDuties: () => ({
    data: state.duties,
    isLoading: state.loading,
    isError: state.error,
    refetch,
  }),
  useWorkspaceAssignDutyMutation: () => ({
    mutate: assignMutate,
    isPending: false,
    error: state.assignError,
  }),
  useWorkspaceCoverDutyMutation: () => ({
    mutate: coverMutate,
    isPending: false,
    error: state.coverError,
  }),
  useOperationStaff: () => ({
    data: {
      staff: [
        { user_id: "u-aina", email: "aina@x", name: "Aina", pooled: true, available: true, note: null, last_seen_at: null, duties: [] },
        { user_id: "u-ben", email: "ben@x", name: "Ben", pooled: true, available: true, note: null, last_seen_at: null, duties: [] },
      ],
      myDuties: [],
    },
  }),
}));

// The shell header pulls the whole GlobalTopBar (orders query, router) — not
// this page's subject. A stub keeps the word visible and the page isolated.
vi.mock("./components/ModuleHeader", () => ({
  default: ({ word }: { word: string }) => (
    <div data-testid="module-header">{word}</div>
  ),
}));

import StaffDuties from "./StaffDuties";

// ── fixtures ─────────────────────────────────────────────────────────────────

function resolution(
  over: Partial<WorkspaceDutiesResponse["duties"][number]["resolution"]> = {},
): WorkspaceDutiesResponse["duties"][number]["resolution"] {
  return {
    duty_key: "grn_duty",
    normal_user_id: "u-aina",
    normal_user_name: "Aina",
    acting_user_id: null,
    acting_user_name: null,
    actor_user_id: "u-aina",
    is_cover: false,
    is_superuser: false,
    allowed: true,
    source: "assignment",
    ...over,
  };
}

function duties(
  over: Partial<WorkspaceDutiesResponse["duties"][number]> = {},
  canAssign = true,
): WorkspaceDutiesResponse {
  return {
    can_assign: canAssign,
    duties: [
      {
        key: "grn_duty",
        label: "GRN Duty",
        resolution: resolution(),
        assignments: [],
        covers: [],
        ...over,
      },
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  state.loading = false;
  state.error = false;
  state.assignError = null;
  state.coverError = null;
  state.duties = duties();
});

// ── resolution ───────────────────────────────────────────────────────────────

describe("today's resolution", () => {
  it("names the primary holder", () => {
    render(<StaffDuties />);
    expect(screen.getByText("GRN Duty")).toBeInTheDocument();
    const line = screen.getByTestId("duty-resolution-grn_duty");
    expect(line).toHaveTextContent("Aina");
    expect(line).not.toHaveTextContent("covering for");
  });

  it("says who is covering for whom when a cover acts today", () => {
    state.duties = duties({
      resolution: resolution({
        acting_user_id: "u-ben",
        acting_user_name: "Ben",
        is_cover: true,
      }),
    });
    render(<StaffDuties />);
    expect(screen.getByTestId("duty-resolution-grn_duty")).toHaveTextContent(
      "Ben covering for Aina",
    );
  });

  it("shows the honest Not-assigned exception — never a fallback person, never a dash", () => {
    state.duties = duties({
      resolution: resolution({
        normal_user_id: null,
        normal_user_name: null,
        actor_user_id: null,
        allowed: false,
        source: "not_assigned",
      }),
    });
    render(<StaffDuties />);
    expect(screen.getByText("Not assigned")).toBeInTheDocument();
    expect(
      screen.getByText("Nobody holds GRN Duty. Assign a holder below."),
    ).toBeInTheDocument();
    expect(screen.getByTestId("duty-resolution-grn_duty")).not.toHaveTextContent("—");
  });
});

// ── permission gate ──────────────────────────────────────────────────────────

describe("the can_assign gate", () => {
  it("hides both forms for a non-manager and says who sets assignments — no disabled controls", () => {
    state.duties = duties({}, false);
    render(<StaffDuties />);
    expect(
      screen.getByText("Duty assignments are set by the manager."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Assign holder")).toBeNull();
    expect(screen.queryByText("Add cover")).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();
  });
});

// ── mutations ────────────────────────────────────────────────────────────────

describe("assigning a holder", () => {
  it("sends the exact camelCase contract, omitting the fields left empty", () => {
    render(<StaffDuties />);
    fireEvent.change(screen.getByTestId("assign-holder-grn_duty"), {
      target: { value: "u-ben" },
    });
    fireEvent.change(screen.getByTestId("assign-from-grn_duty"), {
      target: { value: "2026-09-04" },
    });
    fireEvent.click(screen.getByTestId("assign-submit-grn_duty"));
    expect(assignMutate).toHaveBeenCalledTimes(1);
    expect(assignMutate.mock.calls[0][0]).toEqual({
      dutyKey: "grn_duty",
      holderId: "u-ben",
      effectiveFrom: "2026-09-04",
    });
  });

  it("carries Until and the note when the manager fills them", () => {
    render(<StaffDuties />);
    fireEvent.change(screen.getByTestId("assign-holder-grn_duty"), {
      target: { value: "u-aina" },
    });
    fireEvent.change(screen.getByTestId("assign-from-grn_duty"), {
      target: { value: "2026-09-04" },
    });
    fireEvent.change(screen.getByTestId("assign-until-grn_duty"), {
      target: { value: "2026-09-30" },
    });
    fireEvent.change(screen.getByTestId("assign-note-grn_duty"), {
      target: { value: "while Ben is on site" },
    });
    fireEvent.click(screen.getByTestId("assign-submit-grn_duty"));
    expect(assignMutate.mock.calls[0][0]).toEqual({
      dutyKey: "grn_duty",
      holderId: "u-aina",
      effectiveFrom: "2026-09-04",
      effectiveUntil: "2026-09-30",
      note: "while Ben is on site",
    });
  });

  it("shows the API's governed refusal inline", () => {
    state.assignError = new Error("only a manager can assign duties");
    render(<StaffDuties />);
    expect(screen.getByTestId("assign-error")).toHaveTextContent(
      "only a manager can assign duties",
    );
  });
});

describe("adding a cover", () => {
  it("sends the cover contract with both dates", () => {
    render(<StaffDuties />);
    fireEvent.change(screen.getByTestId("cover-acting-grn_duty"), {
      target: { value: "u-ben" },
    });
    fireEvent.change(screen.getByTestId("cover-from-grn_duty"), {
      target: { value: "2026-09-08" },
    });
    fireEvent.change(screen.getByTestId("cover-until-grn_duty"), {
      target: { value: "2026-09-10" },
    });
    fireEvent.change(screen.getByTestId("cover-reason-grn_duty"), {
      target: { value: "Aina on leave" },
    });
    fireEvent.click(screen.getByTestId("cover-submit-grn_duty"));
    expect(coverMutate).toHaveBeenCalledTimes(1);
    expect(coverMutate.mock.calls[0][0]).toEqual({
      dutyKey: "grn_duty",
      actingUserId: "u-ben",
      startsOn: "2026-09-08",
      endsOn: "2026-09-10",
      reason: "Aina on leave",
    });
  });
});

// ── history ──────────────────────────────────────────────────────────────────

describe("history", () => {
  it("lists assignments and covers with names and ruled dates — never a raw ISO string", () => {
    state.duties = duties({
      assignments: [
        {
          id: "a1",
          duty_key: "grn_duty",
          holder_id: "u-aina",
          holder_name: "Aina",
          effective_from: "2026-09-01",
          effective_until: null,
          assigned_by_name: "Jess",
          note: "first holder",
          created_at: "2026-09-01T02:00:00Z",
        },
      ],
      covers: [
        {
          id: "c1",
          duty_key: "grn_duty",
          normal_user_id: "u-aina",
          normal_user_name: "Aina",
          acting_user_id: "u-ben",
          acting_user_name: "Ben",
          starts_on: "2026-09-08",
          ends_on: "2026-09-10",
          reason: "annual leave",
          assigned_by_name: "Jess",
          created_at: "2026-09-02T02:00:00Z",
        },
      ],
    });
    render(<StaffDuties />);

    const a = screen.getByTestId("assignment-a1");
    expect(a).toHaveTextContent("Aina");
    expect(a).toHaveTextContent(`from ${fmtDate("2026-09-01")}`);
    expect(a).toHaveTextContent("assigned by Jess");
    expect(a).toHaveTextContent("first holder");

    const c = screen.getByTestId("cover-c1");
    expect(c).toHaveTextContent("Ben covering for Aina");
    expect(c).toHaveTextContent(fmtDate("2026-09-08"));
    expect(c).toHaveTextContent(fmtDate("2026-09-10"));
    expect(c).toHaveTextContent("annual leave");

    // Dates come through fmtDate — a bare ISO string never reaches the screen.
    expect(screen.queryByText(/2026-09-0\d/)).toBeNull();
  });

  it("carries no edit or delete controls — history is append-only", () => {
    state.duties = duties(
      {
        assignments: [
          {
            id: "a1",
            duty_key: "grn_duty",
            holder_id: "u-aina",
            holder_name: "Aina",
            effective_from: "2026-09-01",
            effective_until: "2026-09-30",
            assigned_by_name: "Jess",
            note: null,
            created_at: "2026-09-01T02:00:00Z",
          },
        ],
      },
      false, // even hidden forms leave zero buttons inside history
    );
    render(<StaffDuties />);
    const history = screen.getByTestId("assignment-a1");
    expect(within(history).queryAllByRole("button")).toHaveLength(0);
    expect(history).toHaveTextContent(
      `${fmtDate("2026-09-01")} → ${fmtDate("2026-09-30")}`,
    );
  });
});

// ── loading and failure ──────────────────────────────────────────────────────

describe("loading and failure", () => {
  it("says it is opening while the read runs", () => {
    state.loading = true;
    state.duties = undefined;
    render(<StaffDuties />);
    expect(screen.getByText("Opening Staff & Duties…")).toBeInTheDocument();
  });

  it("a failed read says what broke and Try again refetches", () => {
    state.error = true;
    state.duties = undefined;
    render(<StaffDuties />);
    expect(
      screen.getByText("Staff & Duties could not be opened"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
