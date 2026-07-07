/**
 * CompartmentSilhouette — Phase-3 Task-2 silhouette SVG tests.
 *
 * The SVG is REDRAWN from T1 geometry (cellEdges → arm/back placement;
 * findModule → cushions; parseCompartmentStructure → mechanism). These tests
 * assert the right rects appear per code:
 *   · '1A(LHF)' → a LEFT arm, no right arm
 *   · '1A(RHF)' → a RIGHT arm, no left arm
 *   · '1NA'     → NO arms
 *   · '2A(RHF)' → a right arm + ONE cushion seam (2 cushions)
 *   · iconUrl   → the photoreal <img> path (SVG suppressed)
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import CompartmentSilhouette from "./CompartmentSilhouette";

describe("CompartmentSilhouette", () => {
  it("renders a left arm for 1A(LHF) and no right arm", () => {
    render(<CompartmentSilhouette code="1A(LHF)" />);
    expect(screen.getByTestId("silhouette-arm-left")).toBeInTheDocument();
    expect(screen.queryByTestId("silhouette-arm-right")).not.toBeInTheDocument();
    expect(screen.getByTestId("compartment-silhouette")).toHaveAttribute("data-code", "1A(LHF)");
  });

  it("renders a right arm for 1A(RHF) and no left arm", () => {
    render(<CompartmentSilhouette code="1A(RHF)" />);
    expect(screen.getByTestId("silhouette-arm-right")).toBeInTheDocument();
    expect(screen.queryByTestId("silhouette-arm-left")).not.toBeInTheDocument();
  });

  it("renders no arms for 1NA", () => {
    render(<CompartmentSilhouette code="1NA" />);
    expect(screen.queryByTestId("silhouette-arm-left")).not.toBeInTheDocument();
    expect(screen.queryByTestId("silhouette-arm-right")).not.toBeInTheDocument();
    // still draws a backrest strip
    expect(screen.getByTestId("silhouette-back")).toBeInTheDocument();
  });

  it("renders a right arm + one cushion seam for 2A(RHF)", () => {
    render(<CompartmentSilhouette code="2A(RHF)" />);
    expect(screen.getByTestId("silhouette-arm-right")).toBeInTheDocument();
    // 2 cushions → 1 dividing seam
    expect(screen.getAllByTestId("silhouette-seam")).toHaveLength(1);
  });

  it("renders a mechanism glyph for a power compartment", () => {
    render(<CompartmentSilhouette code="1A(P)(RHF)" />);
    const mech = screen.getByTestId("silhouette-mechanism");
    expect(mech).toHaveTextContent("P");
    // no emoji — plain letter
    expect(mech.textContent).toBe("P");
  });

  it("prefers the iconUrl <img> path over the SVG", () => {
    render(<CompartmentSilhouette code="1A(LHF)" iconUrl="https://cdn/x.png" />);
    const img = screen.getByTestId("compartment-silhouette-img");
    expect(img).toHaveAttribute("src", "https://cdn/x.png");
    expect(screen.queryByTestId("compartment-silhouette")).not.toBeInTheDocument();
  });

  it("flush + iconUrl: bbox-fitted art in an overflow-hidden box (build canvas)", () => {
    render(<CompartmentSilhouette code="1A(LHF)" iconUrl="https://cdn/x.png" flush />);
    const box = screen.getByTestId("compartment-silhouette-img-flush");
    expect(box.className).toContain("overflow-hidden");
    const img = screen.getByTestId("compartment-silhouette-img");
    expect(img).toHaveAttribute("src", "https://cdn/x.png");
    expect(img).toHaveAttribute("draggable", "false");
    // unmeasured (jsdom never loads) → fallback stretch fills the cell exactly
    expect(img).toHaveStyle({ width: "100%", height: "100%" });
  });

  it("flush SVG: no viewBox inset — joined modules tile with no seam", () => {
    render(<CompartmentSilhouette code="1NA" flush />);
    // 1NA at 24″ is 75×95cm; flush viewBox = the exact footprint (no +8 pad)
    expect(screen.getByTestId("compartment-silhouette")).toHaveAttribute("viewBox", "0 0 75 95");
  });

  it("applies a flame ring when selected and a red outline on violation", () => {
    const { rerender } = render(<CompartmentSilhouette code="1NA" selected />);
    expect(screen.getByTestId("compartment-silhouette")).toHaveStyle({
      boxShadow: "0 0 0 3px hsl(var(--primary) / 0.4)",
    });
    rerender(<CompartmentSilhouette code="1NA" violation />);
    expect(screen.getByTestId("compartment-silhouette")).toHaveStyle({
      boxShadow: "0 0 0 2px hsl(var(--danger))",
    });
  });
});
