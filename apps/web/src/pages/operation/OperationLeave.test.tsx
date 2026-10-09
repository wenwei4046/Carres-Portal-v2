import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MyLeaveResponse, StaffLeaveRow } from "@carres/shared/workspace-leave";
import { appTodayIso } from "@/lib/fmt-date";

/**
 * Workspace → Leave (0670): one entry for MC, Emergency leave and Planned
 * leave; a person records their own; no approval; MC proof, Emergency reason.
 * The page guides early with the COPY sentences and the door decides.
 */

const submitMutate = vi.fn();
const cancelMutate = vi.fn();
const state: {
  data?: MyLeaveResponse;
  submitError: unknown;
  cancelError: unknown;
} = { submitError: null, cancelError: null };

vi.mock("@/lib/leave-queries", async () => {
  const real = await vi.importActual<typeof import("@/lib/leave-queries")>("@/lib/leave-queries");
  return {
    leaveRefusalSentence: real.leaveRefusalSentence,
    signLeaveProof: vi.fn(),
    openLeaveProof: vi.fn(),
    useMyLeave: () => ({ data: state.data, isPending: false, isError: false, refetch: vi.fn() }),
    useSubmitLeave: () => ({ mutate: submitMutate, isPending: false, error: state.submitError }),
    useCancelLeave: () => ({ mutate: cancelMutate, isPending: false, error: state.cancelError, reset: vi.fn() }),
  };
});
vi.mock("./components/ModuleHeader", () => ({
  default: ({ word }: { word: string }) => <h1 data-testid="module-header">{word}</h1>,
}));
vi.mock("@/components/EvidenceUploadField", () => ({
  default: ({ onChange, ariaLabel }: { onChange: (e: unknown[]) => void; ariaLabel: string }) => (
    <button type="button" aria-label={ariaLabel}
      onClick={() => onChange([{ path: "eeeeeeee-0000-4000-8000-000000000001/eeeeeeee-0000-4000-8000-000000000002.jpg", kind: "photo" }])}>
      Add proof
    </button>
  ),
}));

import OperationLeave from "./OperationLeave";

const TODAY = appTodayIso();
function plusDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function row(over: Partial<StaffLeaveRow>): StaffLeaveRow {
  return {
    id: "eeeeeeee-0000-4000-8000-0000000000aa", leave_type: "planned", starts_on: plusDays(TODAY, 3),
    ends_on: plusDays(TODAY, 4), reason: null, note: null, proof_paths: [], approval_required: false,
    submitted_at: "2026-10-01T01:00:00Z", cancelled_from: null, cancelled_at: null, ...over,
  };
}
const POLICIES = [
  { leave_type: "emergency", approval_required: false, proof_required: false, reason_required: true },
  { leave_type: "mc", approval_required: false, proof_required: true, reason_required: false },
  { leave_type: "planned", approval_required: false, proof_required: false, reason_required: false },
] as MyLeaveResponse["policies"];

function choose(triggerId: string, optionName: string) {
  fireEvent.click(document.getElementById(triggerId)!);
  fireEvent.click(screen.getByRole("option", { name: optionName }));
}
function pickDay(triggerId: string, day: number): string {
  fireEvent.click(document.getElementById(triggerId)!);
  const cell = screen.getAllByRole("gridcell").find((c) => c.textContent?.trim() === String(day));
  fireEvent.click(cell!.querySelector("button") ?? cell!);
  const [y, m] = TODAY.split("-");
  return `${y}-${m}-${String(day).padStart(2, "0")}`;
}
const submitButton = () => screen.getByRole("button", { name: "Submit leave" });

beforeEach(() => {
  vi.clearAllMocks();
  state.submitError = null;
  state.cancelError = null;
  state.data = { today: TODAY, canSubmit: true, policies: POLICIES, leave: [] };
});

describe("Workspace → Leave", () => {
  it("is one entry: the three types, no approval, and an empty list that says so", () => {
    render(<OperationLeave />);
    expect(screen.getByTestId("module-header")).toHaveTextContent("Leave");
    expect(screen.getByText("No approval needed.")).toBeVisible();
    expect(screen.getByText("No leave recorded.")).toBeVisible();
    fireEvent.click(document.getElementById("leave-type")!);
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["MC", "Emergency leave", "Planned leave"]);
  });

  it("guides with the governed sentences before anything is sent", () => {
    render(<OperationLeave />);
    fireEvent.click(submitButton());
    expect(screen.getByTestId("leave-form-error")).toHaveTextContent("Choose a type.");
    choose("leave-type", "MC");
    fireEvent.click(submitButton());
    expect(screen.getByTestId("leave-form-error")).toHaveTextContent("Choose the dates.");
    pickDay("leave-from", 15);
    pickDay("leave-until", 15);
    fireEvent.click(submitButton());
    expect(screen.getByTestId("leave-form-error")).toHaveTextContent("Upload the MC proof.");
    choose("leave-type", "Emergency leave");
    fireEvent.click(submitButton());
    expect(screen.getByTestId("leave-form-error")).toHaveTextContent("Write the reason.");
    expect(submitMutate).not.toHaveBeenCalled();
  });

  it("sends an MC with its proof to the one door", () => {
    render(<OperationLeave />);
    choose("leave-type", "MC");
    const from = pickDay("leave-from", 15);
    const until = pickDay("leave-until", 16);
    fireEvent.click(screen.getByRole("button", { name: "MC proof" }));
    fireEvent.click(submitButton());
    expect(submitMutate).toHaveBeenCalledWith(
      { type: "mc", startsOn: from, endsOn: until, proofPaths: ["eeeeeeee-0000-4000-8000-000000000001/eeeeeeee-0000-4000-8000-000000000002.jpg"] },
      expect.anything(),
    );
  });

  it("prints the door's refusal in plain words", () => {
    state.submitError = { body: { code: "leave_overlap" } };
    render(<OperationLeave />);
    expect(screen.getByTestId("leave-form-error")).toHaveTextContent("You already have leave on these dates.");
  });

  it("lists upcoming and past leave, and cancels only after a second click", () => {
    state.data = {
      today: TODAY, canSubmit: true, policies: POLICIES,
      leave: [
        row({ id: "eeeeeeee-0000-4000-8000-0000000000ab" }),
        row({ id: "eeeeeeee-0000-4000-8000-0000000000ac", leave_type: "emergency", reason: "Fever",
          starts_on: plusDays(TODAY, -5), ends_on: plusDays(TODAY, -5) }),
      ],
    };
    render(<OperationLeave />);
    const upcoming = screen.getByRole("region", { name: "Upcoming" });
    const past = screen.getByRole("region", { name: "Past" });
    expect(within(upcoming).getByText("Planned leave")).toBeVisible();
    expect(within(past).getByText("Fever")).toBeVisible();
    expect(within(past).queryByRole("button", { name: "Cancel leave" })).toBeNull();
    fireEvent.click(within(upcoming).getByRole("button", { name: "Cancel leave" }));
    expect(cancelMutate).not.toHaveBeenCalled();
    expect(within(upcoming).getByText("Cancel this leave?")).toBeVisible();
    fireEvent.click(within(upcoming).getByRole("button", { name: "Cancel leave" }));
    expect(cancelMutate).toHaveBeenCalledWith("eeeeeeee-0000-4000-8000-0000000000ab", expect.anything());
  });

  it("offers only the days after today while a leave runs", () => {
    state.data = { today: TODAY, canSubmit: true, policies: POLICIES,
      leave: [row({ starts_on: TODAY, ends_on: plusDays(TODAY, 2) })] };
    render(<OperationLeave />);
    expect(screen.getByRole("button", { name: "Cancel remaining days" })).toBeVisible();
  });

  it("a shared login sees the reason instead of a form", () => {
    state.data = { today: TODAY, canSubmit: false, policies: POLICIES, leave: [] };
    render(<OperationLeave />);
    expect(screen.getByText("Only active staff can record leave.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Submit leave" })).toBeNull();
  });
});
