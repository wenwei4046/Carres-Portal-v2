import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SaturdayOnCallResponse } from "@carres/shared/workspace-saturday-on-call";
import type { MyLeaveResponse, TeamLeaveResponse } from "@carres/shared/workspace-leave";

/**
 * Staff & Duties: On leave · Saturday on-call · Leave approval (0670/0671).
 * Closed until clicked, each header says its answer; Saturday on-call is
 * contact coverage, never a Duty, and only an editor sees its controls.
 */

const A = "eeeeeeee-0000-4000-8000-00000000000a";
const B = "eeeeeeee-0000-4000-8000-00000000000b";
const saveWindow = vi.fn();
const setDay = vi.fn();
const state: { team?: TeamLeaveResponse; mine?: MyLeaveResponse; sat?: SaturdayOnCallResponse } = {};

vi.mock("@/lib/leave-queries", () => ({
  useTeamLeave: () => ({ data: state.team, isPending: false, refetch: vi.fn() }),
  useMyLeave: () => ({ data: state.mine, isPending: false, refetch: vi.fn() }),
}));
vi.mock("@/lib/saturday-on-call-queries", async () => {
  const real = await vi.importActual<typeof import("@/lib/saturday-on-call-queries")>("@/lib/saturday-on-call-queries");
  return {
    saturdayOnCallRefusalSentence: real.saturdayOnCallRefusalSentence,
    useSaturdayOnCall: () => ({ data: state.sat, isPending: false, refetch: vi.fn() }),
    useSaveSaturdayOnCallWindow: () => ({ mutate: saveWindow, isPending: false, error: null }),
    useSetSaturdayOnCall: () => ({ mutate: setDay, isPending: false, error: null }),
  };
});

import LeaveAndOnCall from "./LeaveAndOnCall";

function sat(canEdit: boolean): SaturdayOnCallResponse {
  return {
    window: { startsAt: "09:00", endsAt: "18:00", revision: 3 },
    canEdit,
    people: canEdit ? [{ id: A, name: "Shasha" }, { id: B, name: "Yu Jun" }] : [],
    saturdays: [
      { saturday: "2026-10-10", personId: A, personName: "Shasha", personOnLeave: true,
        coverPersonId: B, coverName: "Yu Jun", coverOnLeave: false, note: null },
      { saturday: "2026-10-17", personId: null, personName: null, personOnLeave: false,
        coverPersonId: null, coverName: null, coverOnLeave: false, note: null },
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  state.team = { today: "2026-10-09", people: [{ userId: A, name: "Shasha", startsOn: "2026-10-09", endsOn: "2026-10-10" }] };
  state.mine = {
    today: "2026-10-09", canSubmit: true, leave: [],
    policies: [
      { leave_type: "emergency", approval_required: false, proof_required: false, reason_required: true },
      { leave_type: "mc", approval_required: false, proof_required: false, reason_required: false },
      { leave_type: "planned", approval_required: false, proof_required: false, reason_required: false },
    ],
  };
  state.sat = sat(false);
});

const open = (testId: string) => {
  const section = screen.getByTestId(testId);
  fireEvent.click(within(section).getByRole("button", { expanded: false }));
  return section;
};

describe("On leave · Saturday on-call · Leave approval", () => {
  it("keeps each section closed with its answer on the header", () => {
    render(<LeaveAndOnCall />);
    expect(within(screen.getByTestId("team-leave")).getByText("1 person")).toBeVisible();
    expect(within(screen.getByTestId("saturday-on-call")).getByText("Shasha · 9:00 AM to 6:00 PM")).toBeVisible();
    expect(within(screen.getByTestId("leave-policy")).getByText("No approval needed")).toBeVisible();
    expect(screen.queryByText("Nobody is on leave in the next 7 days.")).toBeNull();
  });

  it("names who is away and when, never the type", () => {
    render(<LeaveAndOnCall />);
    const section = open("team-leave");
    expect(within(section).getByText("Shasha")).toBeVisible();
    expect(within(section).queryByText(/MC|Emergency/)).toBeNull();
  });

  it("says plainly when nobody is away", () => {
    state.team = { today: "2026-10-09", people: [] };
    render(<LeaveAndOnCall />);
    expect(within(screen.getByTestId("team-leave")).getByText("Nobody")).toBeVisible();
    open("team-leave");
    expect(screen.getByText("Nobody is on leave in the next 7 days.")).toBeVisible();
  });

  it("shows the read-only leave policy: no approval for any type", () => {
    render(<LeaveAndOnCall />);
    const section = open("leave-policy");
    expect(within(section).getAllByText("No approval needed").length).toBeGreaterThan(0);
    expect(within(section).queryByText(/Proof needed/)).toBeNull();
    expect(within(section).getByText("No approval needed · Reason needed")).toBeVisible();
    expect(within(section).queryByRole("button", { name: /Save|Edit/ })).toBeNull();
  });

  it("Saturday on-call: a reader sees the time, the people and the leave flag, and no controls", () => {
    render(<LeaveAndOnCall />);
    const section = open("saturday-on-call");
    expect(within(section).getByTestId("on-call-time")).toHaveTextContent("9:00 AM to 6:00 PM");
    expect(within(section).getByText("Answers customer, driver and warehouse calls and WhatsApp. Not an Office workday. Routine work does not move.")).toBeVisible();
    const first = within(section).getByTestId("on-call-2026-10-10");
    expect(within(first).getByText("On leave")).toBeVisible();
    expect(within(first).getByText("Cover Yu Jun")).toBeVisible();
    expect(within(within(section).getByTestId("on-call-2026-10-17")).getByText("Not assigned")).toBeVisible();
    expect(within(section).queryByRole("button", { name: "Edit time" })).toBeNull();
    expect(within(section).queryByRole("button", { name: "Assign" })).toBeNull();
  });

  it("Saturday on-call: an editor changes the time with the governed check first", () => {
    state.sat = sat(true);
    render(<LeaveAndOnCall />);
    const section = open("saturday-on-call");
    fireEvent.click(within(section).getByRole("button", { name: "Edit time" }));
    fireEvent.change(screen.getByLabelText(/Starts/), { target: { value: "18:00" } });
    fireEvent.change(screen.getByLabelText(/Ends/), { target: { value: "09:00" } });
    fireEvent.click(within(section).getByRole("button", { name: "Save" }));
    expect(screen.getByText("Ends must be after Starts.")).toBeVisible();
    expect(saveWindow).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/Starts/), { target: { value: "10:00" } });
    fireEvent.change(screen.getByLabelText(/Ends/), { target: { value: "17:00" } });
    fireEvent.click(within(section).getByRole("button", { name: "Save" }));
    expect(saveWindow).toHaveBeenCalledWith({ startsAt: "10:00", endsAt: "17:00", revision: 3 }, expect.anything());
  });

  it("Saturday on-call: an editor names a person and a different cover for one Saturday", () => {
    state.sat = sat(true);
    render(<LeaveAndOnCall />);
    const section = open("saturday-on-call");
    const day = within(section).getByTestId("on-call-2026-10-17");
    fireEvent.click(within(day).getByRole("button", { name: "Assign" }));
    fireEvent.click(document.getElementById("on-call-person-2026-10-17")!);
    fireEvent.click(screen.getByRole("option", { name: "Yu Jun" }));
    fireEvent.click(document.getElementById("on-call-cover-2026-10-17")!);
    fireEvent.click(screen.getByRole("option", { name: "Yu Jun" }));
    fireEvent.click(within(day).getByRole("button", { name: "Save" }));
    expect(screen.getByText("Choose another person for Cover.")).toBeVisible();
    expect(setDay).not.toHaveBeenCalled();
    fireEvent.click(document.getElementById("on-call-cover-2026-10-17")!);
    fireEvent.click(screen.getByRole("option", { name: "Shasha" }));
    fireEvent.click(within(day).getByRole("button", { name: "Save" }));
    expect(setDay).toHaveBeenCalledWith({ saturday: "2026-10-17", personId: B, coverPersonId: A }, expect.anything());
  });
});
