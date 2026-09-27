import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import WorkSplitShell from "./WorkSplitShell";

describe("WorkSplitShell — inbox · this order · communication (Jess, 2026-09-27)", () => {
  it("lays three columns 280 · rest · 340 with no frame of its own; 260 · rest · 300 on a narrower canvas", () => {
    render(<WorkSplitShell layout="three" list="Inbox" detail="Order" comm="Messages" />);
    const shell = screen.getByTestId("work-split-shell");
    expect(shell.className).toContain("grid-cols-[280px_minmax(560px,1fr)_340px]");
    expect(shell.className).not.toContain("gap-4");
    expect(screen.getByRole("complementary", { name: "Communication" })).toHaveTextContent("Messages");
    render(<WorkSplitShell layout="three" wide={false} list="Inbox2" detail="Order2" comm="Messages2" />);
    expect(screen.getAllByTestId("work-split-shell")[1]!.className).toContain("grid-cols-[260px_minmax(420px,1fr)_300px]");
  });

  it("with nothing selected there is no communication column", () => {
    render(<WorkSplitShell layout="three" list="Inbox" detail="Order" />);
    expect(screen.getByTestId("work-split-shell").className).toContain("grid-cols-[280px_minmax(0,1fr)]");
    expect(screen.queryByRole("complementary", { name: "Communication" })).not.toBeInTheDocument();
  });

  it("at 760–1039px the communication pane slides over the order only when asked for", () => {
    const first = render(<WorkSplitShell layout="two" list="Inbox" detail="Order" comm="Messages" />);
    expect(screen.getByText("Inbox")).toBeInTheDocument();
    expect(screen.getByText("Order")).toBeInTheDocument();
    expect(screen.queryByText("Messages")).not.toBeInTheDocument();
    first.unmount();
    render(<WorkSplitShell layout="two" commOpen list="Inbox" detail="Order" comm="Messages" />);
    expect(screen.getByRole("complementary", { name: "Communication" })).toHaveTextContent("Messages");
  });

  it("below 768px one stage at a time: the inbox, or the order with its communication beneath", () => {
    const first = render(<WorkSplitShell layout="one" activePanel="list" list="Inbox" detail="Order" comm="Messages" />);
    expect(screen.getByText("Inbox")).toBeInTheDocument();
    expect(screen.queryByText("Order")).not.toBeInTheDocument();
    first.unmount();
    render(<WorkSplitShell layout="one" activePanel="detail" list="Inbox" detail="Order" comm="Messages" />);
    expect(screen.queryByText("Inbox")).not.toBeInTheDocument();
    const stage = screen.getByRole("region", { name: "Selected work" });
    expect(stage).toHaveTextContent("Order");
    expect(stage).toHaveTextContent("Messages");
    expect(stage.className).toContain("gap-2");
  });
});
