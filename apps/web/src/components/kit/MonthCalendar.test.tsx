import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import MonthCalendar from "./MonthCalendar";

/**
 * MonthCalendar — the one rail calendar skin, in both of its uses:
 * the single-month FILTER (Receiving 2026-09-06, Delivery) and the two-month
 * DISPLAY (Receiving, owner instruction 2026-09-13).
 */

describe("MonthCalendar — the two-month display", () => {
  it("renders two complete months, moves one month per arrow, and keeps two on screen", () => {
    const onMonthChange = vi.fn();
    const { rerender } = render(
      <MonthCalendar testId="cal" month="2026-09" onMonthChange={onMonthChange} months={2} selectable={false} />,
    );
    const cal = screen.getByTestId("cal");
    expect(cal).toHaveAttribute("data-months", "2");
    expect(within(cal).getByText("SEPTEMBER 2026")).toBeInTheDocument();
    expect(within(cal).getByText("OCTOBER 2026")).toBeInTheDocument();
    fireEvent.click(within(cal).getByRole("button", { name: /next month/i }));
    expect(onMonthChange).toHaveBeenCalledWith("2026-10");
    rerender(<MonthCalendar testId="cal" month="2026-10" onMonthChange={onMonthChange} months={2} selectable={false} />);
    expect(within(cal).getByText("OCTOBER 2026")).toBeInTheDocument();
    expect(within(cal).getByText("NOVEMBER 2026")).toBeInTheDocument();
    expect(within(cal).queryByText("SEPTEMBER 2026")).not.toBeInTheDocument();
  });

  it("is display-only: a day click selects nothing and calls nobody", () => {
    const onSelect = vi.fn();
    render(
      <MonthCalendar testId="cal" month="2026-09" onMonthChange={() => {}} selected="2026-09-08" onSelect={onSelect} months={2} selectable={false} />,
    );
    const day = screen.getByTestId("month-day-2026-09-08");
    fireEvent.click(day);
    expect(onSelect).not.toHaveBeenCalled();
    expect(day.className).not.toContain("bg-kit-blue-9");
    expect(day).not.toHaveAttribute("aria-pressed", "true");
  });

  it("prints a COUNT under a marked day, says it in words, marks overdue in words and ink, and names an empty month", () => {
    render(
      <MonthCalendar
        testId="cal"
        month="2026-09"
        onMonthChange={() => {}}
        months={2}
        selectable={false}
        markers={{ "2026-09-01": 1, "2026-09-08": 2 }}
        overdue={{ "2026-09-01": true }}
        markerWord="expected supplier arrival"
        emptyWord={(m) => `No supplier arrivals expected in ${m}`}
      />,
    );
    const late = screen.getByTestId("month-day-2026-09-01");
    expect(late).toHaveAccessibleName("2026-09-01 — 1 expected supplier arrival, overdue");
    expect(late).toHaveAttribute("data-overdue", "true");
    expect(late.querySelector(".text-kit-red-11")).not.toBeNull();
    const onTime = screen.getByTestId("month-day-2026-09-08");
    expect(onTime).toHaveAccessibleName("2026-09-08 — 2 expected supplier arrivals");
    expect(onTime.textContent).toContain("2");
    expect(onTime).not.toHaveAttribute("data-overdue");
    expect(screen.getByTestId("cal-empty-2026-10")).toHaveTextContent("No supplier arrivals expected in October 2026");
    expect(screen.queryByTestId("cal-empty-2026-09")).not.toBeInTheDocument();
  });

  it("today wears a thin outline, never a fill", () => {
    vi.useFakeTimers({ now: new Date("2026-09-13T12:00:00+08:00"), toFake: ["Date"] });
    try {
      render(<MonthCalendar testId="cal" month="2026-09" onMonthChange={() => {}} months={2} selectable={false} />);
      const today = screen.getByTestId("month-day-2026-09-13");
      expect(today.closest("td")?.className ?? "").toContain("ring-1");
      expect(today.className).not.toContain("bg-kit-blue-9");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("MonthCalendar — the single-month filter is byte-identical", () => {
  it("still selects and clears on pick-again", () => {
    const onSelect = vi.fn();
    render(<MonthCalendar testId="cal" month="2026-09" onMonthChange={() => {}} selected={null} onSelect={onSelect} />);
    expect(screen.getByTestId("cal")).toHaveAttribute("data-months", "1");
    fireEvent.click(screen.getByTestId("month-day-2026-09-08"));
    expect(onSelect).toHaveBeenCalledWith("2026-09-08");
  });
});
