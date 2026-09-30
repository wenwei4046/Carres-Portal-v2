import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
vi.mock("@/lib/queries", () => ({ useWorkActivitySettings: vi.fn(), useSaveWorkActivitySettings: vi.fn() }));
import { useWorkActivitySettings, useSaveWorkActivitySettings } from "@/lib/queries";
import ActivitySettings from "./ActivitySettings";
const mutate = vi.fn();
const refetch = vi.fn();
const value = { morning: "10:30", afternoon: "15:00", revision: 1, canEdit: true };
function query(data: typeof value | undefined = value, extras = {}) {
  vi.mocked(useWorkActivitySettings).mockReturnValue({ data, isPending: false, isError: false, refetch, ...extras } as never);
}
beforeEach(() => {
  vi.clearAllMocks(); query();
  vi.mocked(useSaveWorkActivitySettings).mockReturnValue({ mutate, reset: vi.fn(), isPending: false, isError: false } as never);
});
afterEach(cleanup);
describe("check time settings", () => {
  it("shows stored times and sends both with their revision", () => {
    render(<ActivitySettings />);
    expect(screen.getByLabelText("Afternoon check time", { exact: false, selector: "input" })).toHaveValue("15:00");
    fireEvent.change(screen.getByLabelText("Morning check time", { exact: false, selector: "input" }), { target: { value: "11:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(mutate).toHaveBeenCalledWith({ morning: "11:00", afternoon: "15:00", revision: 1 }, expect.any(Object));
  });
  it("does not allow a cutoff during lunch", () => {
    render(<ActivitySettings />);
    fireEvent.change(screen.getByLabelText("Afternoon check time", { exact: false, selector: "input" }), { target: { value: "13:30" } });
    fireEvent.submit(screen.getByLabelText("Afternoon check time", { exact: false, selector: "input" }).closest("form")!);
    expect(mutate).not.toHaveBeenCalled();
  });
  it("read-only staff see the times without a save control", () => {
    query({ ...value, canEdit: false }); render(<ActivitySettings />);
    expect(screen.getByLabelText("Morning check time", { exact: false, selector: "input" })).toHaveAttribute("readonly");
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  });
  it("shows a failed read rather than invented defaults", () => {
    query(undefined, { data: undefined, isError: true }); render(<ActivitySettings />);
    expect(screen.getByRole("alert")).toHaveTextContent("could not be loaded");
    expect(screen.queryByLabelText("Morning check time", { exact: false, selector: "input" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" })); expect(refetch).toHaveBeenCalled();
  });
  it("preserves a draft across a background refresh and submits its original revision", () => {
    const view = render(<ActivitySettings />);
    fireEvent.change(screen.getByLabelText("Morning check time", { exact: false, selector: "input" }), { target: { value: "11:00" } });
    query({ ...value, morning: "10:45", revision: 2 }); view.rerender(<ActivitySettings />);
    expect(screen.getByLabelText("Morning check time", { exact: false, selector: "input" })).toHaveValue("11:00");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ revision: 1 }), expect.any(Object));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByLabelText("Morning check time", { exact: false, selector: "input" })).toHaveValue("10:45");
  });
  it("keeps the last known settings during a failed refresh", () => {
    query(value, { isError: true }); render(<ActivitySettings />);
    expect(screen.getByLabelText("Morning check time", { exact: false, selector: "input" })).toHaveValue("10:30");
    expect(screen.getByRole("alert")).toHaveTextContent("could not be refreshed");
  });
});
