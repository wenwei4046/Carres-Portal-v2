import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ReceivingDateRailRow } from "@carres/shared";
import ReceivingDateRail from "./ReceivingDateRail";

const rows: ReceivingDateRailRow[] = [
  { key: "late", label: "Late", count: 2 },
  { key: "2026-08-31", label: "2026-08-31", count: 0 },
  { key: "2026-09-01", label: "2026-09-01", count: 1 },
  { key: "2026-09-02", label: "2026-09-02", count: 0 },
  { key: "2026-09-03", label: "2026-09-03", count: 0 },
  { key: "2026-09-04", label: "2026-09-04", count: 0 },
  { key: "2026-09-05", label: "2026-09-05", count: 0 },
  { key: "later", label: "Later", count: 3 },
  { key: "none", label: "No delivery date", count: 0 },
];

describe("ReceivingDateRail", () => {
  it("uses the shared 240px rail and shows every governed row including zero", () => {
    render(<ReceivingDateRail rows={rows} selected={null} onSelect={vi.fn()} />);

    expect(screen.getByTestId("receiving-date-rail")).toHaveClass("w-[240px]");
    expect(screen.getByText("RECEIVING DATE")).toBeInTheDocument();
    expect(screen.getByTestId("receiving-date-2026-08-31")).toHaveTextContent("0");
    expect(screen.getByTestId("receiving-date-2026-09-05")).toHaveTextContent("0");
    expect(screen.getByTestId("receiving-date-none")).toHaveTextContent("0");
    expect(screen.getAllByRole("button")).toHaveLength(9);
  });

  it("formats actual dates without changing their filter key", () => {
    const onSelect = vi.fn();
    render(<ReceivingDateRail rows={rows} selected="2026-09-01" onSelect={onSelect} />);

    const date = screen.getByTestId("receiving-date-2026-09-01");
    expect(date).toHaveTextContent("Tue, 1 Sep");
    expect(date).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(date);
    expect(onSelect).toHaveBeenCalledWith("2026-09-01");
  });
});
