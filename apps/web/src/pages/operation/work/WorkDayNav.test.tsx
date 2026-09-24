import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WorkDayStrip } from "./WorkDayNav";
import type { WorkRailDates } from "./work-model";

const DATES: WorkRailDates = {
  month: "Sep 2026",
  previousWeek: "2026-09-07",
  nextWeek: "2026-09-21",
  missed: 3,
  noDate: 0,
  days: [
    { iso: "2026-09-14", label: "Mon, 14 Sep", dayNumber: "14", weekday: "MON", holiday: null, count: 0, today: false },
    { iso: "2026-09-16", label: "Wed, 16 Sep", dayNumber: "16", weekday: "WED", holiday: "Malaysia Day", count: 4, today: false },
    { iso: "2026-09-17", label: "Thu, 17 Sep", dayNumber: "17", weekday: "THU", holiday: null, count: 1, today: true },
  ],
};

describe("WorkDayStrip (below 768px)", () => {
  it("offers the same Date options in one wrapping row, never a sideways scroller", () => {
    const pick = vi.fn();
    const week = vi.fn();
    render(<WorkDayStrip dates={DATES} selected="2026-09-16" onSelect={pick} onWeek={week} />);
    const nav = screen.getByRole("navigation", { name: "Date" });
    const row = within(nav).getByRole("button", { name: /^Missed/ }).parentElement as HTMLElement;
    expect(row.className).toMatch(/flex-wrap/);
    expect(nav.innerHTML).not.toMatch(/overflow-x/);
    expect(within(nav).getByRole("button", { name: "Wed, 16 Sep · Malaysia Day · 4 actions" })).toHaveAttribute("aria-pressed", "true");
    expect(within(nav).getByRole("button", { name: "Thu, 17 Sep · Today · 1 action" }).querySelector("[data-today]")).not.toBeNull();
    expect(within(nav).getByRole("button", { name: "Mon, 14 Sep" }).querySelector("[data-rail-count]")).toBeNull();
    expect(within(nav).queryByRole("button", { name: /^No working date/ })).toBeNull();
    expect(nav).toHaveTextContent("Wed, 16 Sep · Malaysia Day");
    expect(nav).not.toHaveTextContent("Today");
    fireEvent.click(within(nav).getByRole("button", { name: "Missed · 3 actions" }));
    expect(pick).toHaveBeenCalledWith("missed");
    fireEvent.click(within(nav).getByRole("button", { name: "Next week" }));
    expect(week).toHaveBeenCalledWith("2026-09-21");
  });
});
