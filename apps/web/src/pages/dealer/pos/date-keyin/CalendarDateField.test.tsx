import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import CalendarDateField from "./CalendarDateField";

afterEach(cleanup);

const TODAY = "2026-07-14";
const MIN = "2026-07-28"; // 14-day lead off 2026-07-14

function renderField(over: Partial<React.ComponentProps<typeof CalendarDateField>> = {}) {
  const onChange = vi.fn();
  render(
    <CalendarDateField
      value=""
      onChange={onChange}
      minIso={MIN}
      todayIso={TODAY}
      ariaLabel="Pick delivery date"
      testId="dlv"
      {...over}
    />,
  );
  return onChange;
}

describe("CalendarDateField — calendar popover", () => {
  it("shows the formatted value on the trigger, placeholder when empty", () => {
    renderField({ value: "2026-08-04" });
    expect(screen.getByTestId("dlv").textContent).toContain("Tue, 04 Aug 2026");
    cleanup();
    renderField();
    expect(screen.getByTestId("dlv").textContent).toContain("dd/mm/yyyy");
  });

  it("days before the lead-time floor are disabled; picking a valid day commits and closes", () => {
    const onChange = renderField();
    fireEvent.click(screen.getByTestId("dlv"));
    expect(screen.getByText("July 2026")).toBeTruthy();

    const before = screen.getByRole("button", { name: "27" }) as HTMLButtonElement;
    const first = screen.getByRole("button", { name: "28" }) as HTMLButtonElement;
    expect(before.disabled).toBe(true);
    expect(first.disabled).toBe(false);

    fireEvent.click(first);
    expect(onChange).toHaveBeenCalledWith("2026-07-28");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("month nav can't go below the floor month", () => {
    renderField();
    fireEvent.click(screen.getByTestId("dlv"));
    const prev = screen.getByRole("button", { name: "Previous month" }) as HTMLButtonElement;
    const next = screen.getByRole("button", { name: "Next month" }) as HTMLButtonElement;
    expect(prev.disabled).toBe(true); // June has no selectable day
    expect(next.disabled).toBe(false);
  });

  it("maxIso caps the selectable range (proceed date ≤ delivery date)", () => {
    const onChange = vi.fn();
    render(
      <CalendarDateField
        value=""
        onChange={onChange}
        minIso={TODAY}
        maxIso="2026-07-20"
        todayIso={TODAY}
        ariaLabel="Pick proceed date"
        testId="prc"
      />,
    );
    fireEvent.click(screen.getByTestId("prc"));
    expect((screen.getByRole("button", { name: "21" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "20" }) as HTMLButtonElement).disabled).toBe(false);
    expect(
      (screen.getByRole("button", { name: "Next month" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("TBD-style disabled state locks the trigger", () => {
    renderField({ disabled: true });
    expect((screen.getByTestId("dlv") as HTMLButtonElement).disabled).toBe(true);
  });

  it("Escape closes without committing", () => {
    const onChange = renderField();
    fireEvent.click(screen.getByTestId("dlv"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });
});
