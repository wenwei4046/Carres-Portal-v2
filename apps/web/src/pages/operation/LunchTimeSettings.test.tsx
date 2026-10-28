import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
vi.mock("@/lib/staff-lunch-queries", () => ({ useStaffLunch: vi.fn(), useSaveStaffLunch: vi.fn() }));
import { useSaveStaffLunch, useStaffLunch } from "@/lib/staff-lunch-queries";
import LunchTimeSettings, { lunchChoices } from "./LunchTimeSettings";

const mutate = vi.fn();
const refetch = vi.fn();
/* The database's answer at the owner defaults: Office lunch 1:00 to 2:00 PM,
   may move one hour, afternoon check 2:01 PM. */
const view = {
  userId: "11111111-1111-4111-8111-111111111111", saved: null as string | null, savedFits: true,
  lunchStart: "13:00", lunchEnd: "14:00", earliest: "12:00", latest: "14:00",
  officeLunchStart: "13:00", officeLunchEnd: "14:00", morningCheck: "10:00", afternoonCheck: "14:01", canEdit: true,
};
function query(data: typeof view | undefined = view, extras = {}) {
  vi.mocked(useStaffLunch).mockReturnValue({ data, isPending: false, isError: false, refetch, ...extras } as never);
}
beforeEach(() => {
  vi.clearAllMocks(); query();
  vi.mocked(useSaveStaffLunch).mockReturnValue({ mutate, isPending: false } as never);
});
afterEach(cleanup);
const save = () => screen.getByRole("button", { name: "Save changes" });

describe("Settings → Personal → Lunch time", () => {
  it("offers every quarter hour in the allowed range and marks the Office lunch", () => {
    expect(lunchChoices(view)).toEqual(["12:00", "12:15", "12:30", "12:45", "13:00", "13:15", "13:30", "13:45", "14:00"]);
    render(<LunchTimeSettings />);
    expect(screen.getByTestId("lunch-13:00")).toHaveTextContent("1:00 PM · Office lunch");
    expect(screen.getByTestId("lunch-13:00")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("You can start lunch from 12:00 PM to 2:00 PM.")).toBeInTheDocument();
    expect(screen.getByTestId("lunch-effective")).toHaveTextContent("1:00 PM to 2:00 PM");
    expect(screen.getByTestId("lunch-afternoon-check")).toHaveTextContent("2:01 PM");
    expect(screen.getByText("Your work stays with you during lunch. The afternoon check waits until after your lunch.")).toBeInTheDocument();
  });
  it("picks a time, then saves it with one Save changes", () => {
    render(<LunchTimeSettings />);
    expect(save()).toBeDisabled();
    fireEvent.click(screen.getByTestId("lunch-12:00"));
    expect(screen.getByTestId("lunch-12:00")).toHaveAttribute("aria-checked", "true");
    fireEvent.click(save());
    expect(mutate).toHaveBeenCalledWith({ lunchStart: "12:00" }, expect.any(Object));
  });
  it("choosing the Office lunch saves 'follow the Office lunch'", () => {
    query({ ...view, saved: "12:00", lunchStart: "12:00", lunchEnd: "13:00", afternoonCheck: "13:01" });
    render(<LunchTimeSettings />);
    expect(screen.getByTestId("lunch-12:00")).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByTestId("lunch-13:00"));
    fireEvent.click(save());
    expect(mutate).toHaveBeenCalledWith({ lunchStart: null }, expect.any(Object));
  });
  it("picking the saved time again is not a change", () => {
    query({ ...view, saved: "12:30", lunchStart: "12:30", lunchEnd: "13:30" });
    render(<LunchTimeSettings />);
    fireEvent.click(screen.getByTestId("lunch-14:00"));
    fireEvent.click(screen.getByTestId("lunch-12:30"));
    expect(save()).toBeDisabled();
  });
  it("says so when an Office change left the saved time outside the range", () => {
    query({ ...view, saved: "14:00", savedFits: false, earliest: "11:00", latest: "13:00",
      officeLunchStart: "12:00", officeLunchEnd: "13:00", lunchStart: "12:00", lunchEnd: "13:00" });
    render(<LunchTimeSettings />);
    expect(screen.getByTestId("lunch-saved-outside")).toHaveTextContent("The Office lunch applies until you choose again.");
    expect(screen.getByTestId("lunch-12:00")).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByTestId("lunch-14:00")).not.toBeInTheDocument();
  });
  it("a refused time names the allowed range; any other failure asks to try again", () => {
    render(<LunchTimeSettings />);
    fireEvent.click(screen.getByTestId("lunch-12:15"));
    fireEvent.click(save());
    const options = mutate.mock.calls[0][1] as { onError: (e: unknown) => void };
    act(() => options.onError({ status: 422, body: { code: "lunch_outside_range" } }));
    expect(screen.getByRole("alert")).toHaveTextContent("Choose a time from 12:00 PM to 2:00 PM.");
    act(() => options.onError({ status: 500, body: { code: "rpc_failed" } }));
    expect(screen.getByRole("alert")).toHaveTextContent("Could not save. Try again.");
  });
  it("an account that is not a staff member reads it without a save control", () => {
    query({ ...view, canEdit: false });
    render(<LunchTimeSettings />);
    expect(screen.queryByRole("button", { name: "Save changes" })).not.toBeInTheDocument();
    expect(screen.getByTestId("lunch-12:00")).toBeDisabled();
    expect(screen.getByText("Only a staff member can set a lunch time.")).toBeInTheDocument();
  });
  it("shows a failed read rather than an invented lunch", () => {
    query(undefined, { data: undefined, isError: true });
    render(<LunchTimeSettings />);
    expect(screen.getByRole("alert")).toHaveTextContent("Lunch time could not be loaded.");
    expect(screen.queryByTestId("lunch-effective")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(refetch).toHaveBeenCalled();
  });
  it("no word on screen uses a dash", () => {
    render(<LunchTimeSettings />);
    expect(screen.getByTestId("lunch-time-settings").textContent).not.toMatch(/[-–—]/);
  });
});
