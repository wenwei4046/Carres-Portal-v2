import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import WorkDayNav from "./WorkDayNav";

describe("WorkDayNav", () => {
  it("shows the governed working days, counts actions, and names a holiday", () => {
    const pick = vi.fn();
    render(<WorkDayNav value="thu" onChange={pick} days={[
      { key: "missed", label: "Missed", count: 3 },
      { key: "thu", label: "Thu, 17 Sep", count: 3 },
      { key: "sat", label: "Sat, 19 Sep", count: 1, note: "Working Saturday" },
    ]} />);
    expect(screen.getByRole("button", { name: "Thu, 17 Sep · 3 actions" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Working Saturday")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Missed · 3 actions" }));
    expect(pick).toHaveBeenCalledWith("missed");
  });
});
