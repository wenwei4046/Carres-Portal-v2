import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import WorkSplitShell from "./WorkSplitShell";

describe("WorkSplitShell — the unframed workspace (owner correction 2026-09-24)", () => {
  it("lays three columns 240 · 420 · rest with 16px gaps and no frame of its own", () => {
    render(<WorkSplitShell layout="three" rail="Days" list="Actions" detail="Detail" />);
    const shell = screen.getByTestId("work-split-shell");
    expect(shell.className).toContain("grid-cols-[240px_420px_minmax(480px,1fr)]");
    expect(shell.className).toContain("gap-4");
    expect(shell.className).not.toMatch(/\b(border|bg-white|rounded|shadow)/);
  });

  it("collapses only the rail at 960–1279px; the list can never be collapsed", () => {
    const first = render(<WorkSplitShell layout="two" rail="Days" list="Actions" detail="Detail" />);
    expect(screen.queryByText("Days")).not.toBeInTheDocument();
    expect(screen.getByText("Actions")).toBeInTheDocument();
    expect(screen.getByText("Detail")).toBeInTheDocument();
    first.unmount();
    render(<WorkSplitShell layout="two" railOpen rail="Days" list="Actions" detail="Detail" />);
    expect(screen.getByRole("complementary", { name: "Work filters" })).toHaveTextContent("Days");
    expect(screen.getByText("Actions")).toBeInTheDocument();
  });

  it("below 960px the list and the detail share one stage", () => {
    const first = render(<WorkSplitShell layout="one" activePanel="list" rail="Days" list="Actions" detail="Detail" />);
    expect(screen.getByText("Actions")).toBeInTheDocument();
    expect(screen.queryByText("Detail")).not.toBeInTheDocument();
    expect(screen.queryByText("Days")).not.toBeInTheDocument();
    first.unmount();
    render(<WorkSplitShell layout="one" activePanel="detail" rail="Days" list="Actions" detail="Detail" />);
    expect(screen.queryByText("Actions")).not.toBeInTheDocument();
    expect(screen.getByText("Detail")).toBeInTheDocument();
  });

  it("below 960px the detail stage stacks its sections 8px apart", () => {
    render(<WorkSplitShell layout="one" activePanel="detail" rail="Days" list="Actions" detail="Detail" />);
    expect(screen.getByRole("region", { name: "Selected work" }).className).toContain("gap-2");
  });
});
