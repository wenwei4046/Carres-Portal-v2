/**
 * SofaPlanView — the JOINED plan view: every cell drawn in ONE SVG at its seed
 * x/y so flush modules tile into one continuous sofa.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import SofaPlanView from "./SofaPlanView";

describe("SofaPlanView", () => {
  it("renders all cells inside a single SVG (joined, not separate boxes)", () => {
    render(
      <SofaPlanView
        cells={[
          { moduleCode: "1A(LHF)", x: 0, y: 0, rot: 0 },
          { moduleCode: "2A(RHF)", x: 95, y: 0, rot: 0 },
        ]}
        depth="24"
      />,
    );
    expect(screen.getAllByTestId("sofa-plan-svg")).toHaveLength(1); // ONE svg
    expect(screen.getAllByTestId("plan-cell-body")).toHaveLength(2); // both cells in it
  });

  it("renders nothing for an empty layout", () => {
    const { container } = render(<SofaPlanView cells={[]} depth="24" />);
    expect(container.firstChild).toBeNull();
  });
});
