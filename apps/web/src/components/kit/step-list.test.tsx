import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import StepList, { Step } from "./StepList";

/**
 * StepList (02 "Task steps", owner's 12 Oct 2026 package): numbered round
 * marks that say where the person is. Done shows a tick, not its number.
 */
describe("StepList", () => {
  it("draws one ordered list with a round mark per step, in the three states", () => {
    render(
      <StepList aria-label="Send to supplier">
        <Step n={1} state="done" title="First" data-testid="one" />
        <Step n={2} state="current" title="Second" sub="Do this" data-testid="two" />
        <Step n={3} state="pending" data-testid="three"><button type="button">Act</button></Step>
      </StepList>,
    );
    const list = screen.getByRole("list", { name: "Send to supplier" });
    expect(list.tagName).toBe("OL");
    expect([...list.children].map((li) => li.getAttribute("data-state"))).toEqual(["done", "current", "pending"]);
    const mark = (id: string) => screen.getByTestId(id).firstElementChild as HTMLElement;
    expect(mark("one")).toHaveAccessibleName("Step 1, Done");
    expect(mark("one").textContent).toBe("");
    expect(mark("two").textContent).toBe("2");
    expect(mark("two").className).toContain("bg-c-main");
    expect(mark("three").className).toContain("border-c-chip-border");
    for (const id of ["one", "two", "three"]) expect(mark(id).className).toContain("rounded-full");
    expect(screen.getByTestId("two")).toHaveTextContent("Do this");
    expect(screen.getByRole("button", { name: "Act" })).toBeInTheDocument();
  });
});
