import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import WorkSplitShell from "./WorkSplitShell";

describe("WorkSplitShell", () => {
  it("uses the governed three-panel geometry with 16px separation", () => {
    render(<WorkSplitShell layout="three" rail={<aside aria-label="Work filters">Days</aside>} list="Actions" detail="Detail" />);
    expect(screen.getByTestId("work-split-shell")).toHaveAttribute("data-layout", "three");
    expect(screen.getByTestId("work-split-shell")).toHaveClass("gap-4");
    expect(screen.getByRole("complementary", { name: "Work filters" }).parentElement).toHaveClass("w-60");
    expect(screen.getByRole("complementary", { name: "Work filters" }).parentElement).toHaveClass("gap-4");
    expect(screen.getByRole("region", { name: "Work actions" })).toHaveClass("w-[360px]");
    expect(screen.getByRole("region", { name: "Selected work" })).toHaveClass("min-w-[500px]");
  });

  it("keeps the filter rail while the second panel replaces list with detail", () => {
    const { rerender } = render(
      <WorkSplitShell layout="two" activePanel="list" rail="Days" list="Actions" detail="Detail" />,
    );
    expect(screen.getByText("Days")).toBeInTheDocument();
    expect(screen.getByText("Actions")).toBeInTheDocument();
    expect(screen.queryByText("Detail")).not.toBeInTheDocument();

    rerender(<WorkSplitShell layout="two" activePanel="detail" rail="Days" list="Actions" detail="Detail" />);
    expect(screen.getByText("Days")).toBeInTheDocument();
    expect(screen.queryByText("Actions")).not.toBeInTheDocument();
    expect(screen.getByText("Detail")).toBeInTheDocument();
  });

  it("shows one active panel on mobile", () => {
    render(<WorkSplitShell layout="one" activePanel="detail" rail="Days" list="Actions" detail="Detail" />);
    expect(screen.queryByText("Days")).not.toBeInTheDocument();
    expect(screen.queryByText("Actions")).not.toBeInTheDocument();
    expect(screen.getByText("Detail")).toBeInTheDocument();
  });
});
