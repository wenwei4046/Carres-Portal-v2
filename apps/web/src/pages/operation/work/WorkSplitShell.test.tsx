import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import WorkSplitShell from "./WorkSplitShell";

describe("WorkSplitShell", () => {
  it("uses the governed three-panel geometry without cards or gutters", () => {
    render(<WorkSplitShell layout="three" rail="Days" list="Actions" detail="Detail" />);
    expect(screen.getByTestId("work-split-shell")).toHaveAttribute("data-layout", "three");
    expect(screen.getByRole("complementary", { name: "Work filters" })).toHaveClass("w-60");
    expect(screen.getByRole("region", { name: "Work actions" })).toHaveClass("w-[360px]");
    expect(screen.getByRole("region", { name: "Selected work" })).toHaveClass("min-w-[500px]");
  });

  it("shows one active panel on mobile", () => {
    render(<WorkSplitShell layout="one" activePanel="detail" rail="Days" list="Actions" detail="Detail" />);
    expect(screen.queryByText("Days")).not.toBeInTheDocument();
    expect(screen.queryByText("Actions")).not.toBeInTheDocument();
    expect(screen.getByText("Detail")).toBeInTheDocument();
  });
});

describe("WorkSplitShell · 768–1103px", () => {
  it("keeps the rail beside one work column: the list, or the chosen job in its place", () => {
    const first = render(<WorkSplitShell layout="two" activePanel="list" rail="Days" list="Actions" detail="Detail" />);
    expect(screen.getByRole("complementary", { name: "Work filters" })).toHaveTextContent("Days");
    expect(screen.getByText("Actions")).toBeInTheDocument();
    expect(screen.queryByText("Detail")).not.toBeInTheDocument();
    first.unmount();
    render(<WorkSplitShell layout="two" activePanel="detail" rail="Days" list="Actions" detail="Detail" />);
    expect(screen.getByText("Days")).toBeInTheDocument();
    expect(screen.queryByText("Actions")).not.toBeInTheDocument();
    expect(screen.getByText("Detail")).toBeInTheDocument();
  });
});
