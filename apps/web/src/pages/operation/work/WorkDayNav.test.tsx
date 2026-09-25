import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WorkDateSection } from "./WorkDayNav";
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

describe("WorkDateSection (rail column and the compact Date control)", () => {
  it("offers Missed, the week's days and the week arrows as one section", () => {
    const pick = vi.fn();
    const week = vi.fn();
    render(<WorkDateSection dates={DATES} selected="2026-09-16" onSelect={pick} onWeek={week} />);
    const section = screen.getByRole("region", { name: "Date" });
    // An icon never carries a meaning alone: Missed is written beside its glyph.
    expect(within(section).getByRole("button", { name: "Missed · 3 actions" })).toHaveTextContent("Missed3");
    expect(within(section).getByRole("button", { name: "Wed, 16 Sep · Malaysia Day · 4 actions" })).toHaveAttribute("aria-pressed", "true");
    expect(within(section).getByRole("button", { name: "Thu, 17 Sep · Today · 1 action" }).querySelector("[data-today]")).not.toBeNull();
    /* Owner review 2026-09-25 (items 19–22): a zero is printed, No working
       date is always listed, and today says `Today` in words. */
    expect(within(section).getByRole("button", { name: "Mon, 14 Sep" }).querySelector("[data-rail-count]")).toHaveTextContent("0");
    expect(within(section).getByRole("button", { name: /^No working date/ })).toHaveTextContent("0");
    expect(within(section).getByRole("button", { name: "Thu, 17 Sep · Today · 1 action" })).toHaveTextContent("Today");
    fireEvent.click(within(section).getByRole("button", { name: "Missed · 3 actions" }));
    expect(pick).toHaveBeenCalledWith("missed");
    fireEvent.click(within(section).getByRole("button", { name: "Next week" }));
    expect(week).toHaveBeenCalledWith("2026-09-21");
  });

  it("compact (below 768px): one horizontal strip of chips, the chosen one blue, never a full-width row (item 2)", () => {
    const pick = vi.fn();
    render(<WorkDateSection compact dates={DATES} selected="2026-09-16" onSelect={pick} onWeek={vi.fn()} />);
    const strip = screen.getByTestId("work-date-strip");
    expect(strip.className).toContain("flex-wrap");
    expect(screen.queryByRole("region", { name: "Date" })).toBeNull();
    const chosen = within(strip).getByRole("button", { name: "Wed, 16 Sep · Malaysia Day · 4 actions" });
    expect(chosen).toHaveAttribute("aria-pressed", "true");
    expect(chosen.className).toContain("bg-kit-blue-3");
    expect(chosen.className).not.toContain("w-full");
    expect(within(strip).getByRole("button", { name: "Missed · 3 actions" })).toHaveTextContent("Missed3");
    expect(within(strip).getByRole("button", { name: "Thu, 17 Sep · Today · 1 action" })).toHaveTextContent("Today");
    fireEvent.click(within(strip).getByRole("button", { name: "Mon, 14 Sep" }));
    expect(pick).toHaveBeenCalledWith("2026-09-14");
  });
});
