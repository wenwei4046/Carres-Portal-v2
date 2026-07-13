import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import BirthdayWheelField from "./BirthdayWheelField";

afterEach(cleanup);

const TODAY = "2026-07-14";

describe("BirthdayWheelField — desktop drum picker", () => {
  it("renders the placeholder when empty, and the formatted date + age when set", () => {
    const { rerender } = render(
      <BirthdayWheelField value="" todayIso={TODAY} onChange={() => {}} testId="bday" />,
    );
    expect(screen.getByTestId("bday").textContent).toContain("Select birthday");

    rerender(
      <BirthdayWheelField value="1990-04-01" todayIso={TODAY} onChange={() => {}} testId="bday" />,
    );
    const trigger = screen.getByTestId("bday");
    expect(trigger.textContent).toContain("01 Apr 1990");
    expect(trigger.textContent).toContain("36 y/o");
  });

  it("click-to-select on all three drums, then Save commits ONE ISO value", () => {
    const onChange = vi.fn();
    render(<BirthdayWheelField value="" todayIso={TODAY} onChange={onChange} testId="bday" />);

    fireEvent.click(screen.getByTestId("bday"));
    expect(screen.getByRole("dialog")).toBeTruthy();

    fireEvent.click(within(screen.getByTestId("dki-wheel-d")).getByText("20"));
    fireEvent.click(within(screen.getByTestId("dki-wheel-m")).getByText("March"));
    fireEvent.click(within(screen.getByTestId("dki-wheel-y")).getByText("1988"));
    expect(onChange).not.toHaveBeenCalled(); // nothing commits before Save

    fireEvent.click(screen.getByText("Save"));
    expect(onChange).toHaveBeenCalledWith("1988-03-20");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("switching to a shorter month clamps the day (31 Jan → Feb)", () => {
    const onChange = vi.fn();
    render(<BirthdayWheelField value="1990-01-31" todayIso={TODAY} onChange={onChange} testId="bday" />);

    fireEvent.click(screen.getByTestId("bday"));
    fireEvent.click(within(screen.getByTestId("dki-wheel-m")).getByText("February"));
    fireEvent.click(screen.getByText("Save"));
    expect(onChange).toHaveBeenCalledWith("1990-02-28");
  });

  it("Clear wipes the value", () => {
    const onChange = vi.fn();
    render(
      <BirthdayWheelField value="1990-04-01" todayIso={TODAY} onChange={onChange} testId="bday" />,
    );
    fireEvent.click(screen.getByTestId("bday"));
    fireEvent.click(screen.getByText("Clear"));
    expect(onChange).toHaveBeenCalledWith("");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Escape cancels without committing", () => {
    const onChange = vi.fn();
    render(<BirthdayWheelField value="" todayIso={TODAY} onChange={onChange} testId="bday" />);
    fireEvent.click(screen.getByTestId("bday"));
    fireEvent.click(within(screen.getByTestId("dki-wheel-d")).getByText("20"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("arrow keys nudge the focused drum", () => {
    const onChange = vi.fn();
    render(
      <BirthdayWheelField value="1990-04-10" todayIso={TODAY} onChange={onChange} testId="bday" />,
    );
    fireEvent.click(screen.getByTestId("bday"));
    fireEvent.keyDown(screen.getByTestId("dki-wheel-d"), { key: "ArrowDown" });
    fireEvent.click(screen.getByText("Save"));
    expect(onChange).toHaveBeenCalledWith("1990-04-11");
  });
});
