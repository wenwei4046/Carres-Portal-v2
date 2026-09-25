/**
 * S3 · the filter rail starts hidden on a narrow canvas unless this browser
 * opened it before (owner follow-up 2026-09-16 — SO Batch + Manual Purchase).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { useRef, useState } from "react";
import {
  FilterRail,
  FilterRailGroup,
  FilterRailRow,
  FilterRailSelect,
  useFilterRailOpen,
} from "./workspace-rail";

const KEY = "carres.test.rail";

function Probe() {
  const ref = useRef<HTMLDivElement>(null);
  const [open] = useFilterRailOpen(KEY, ref);
  return <div ref={ref} data-testid="canvas">{open ? "open" : "hidden"}</div>;
}

function atWidth(px: number) {
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(px);
}

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("useFilterRailOpen (S3)", () => {
  it("never chosen + a narrow canvas → hidden", () => {
    atWidth(390);
    render(<Probe />);
    expect(screen.getByTestId("canvas")).toHaveTextContent("hidden");
  });

  it("never chosen + a wide canvas → open", () => {
    atWidth(1200);
    render(<Probe />);
    expect(screen.getByTestId("canvas")).toHaveTextContent("open");
  });

  it("opened before → open, even narrow", () => {
    localStorage.setItem(KEY, "1");
    atWidth(390);
    render(<Probe />);
    expect(screen.getByTestId("canvas")).toHaveTextContent("open");
  });

  it("hidden before → hidden, even wide", () => {
    localStorage.setItem(KEY, "0");
    atWidth(1200);
    render(<Probe />);
    expect(screen.getByTestId("canvas")).toHaveTextContent("hidden");
  });
});

/* ── Style C — the Portal-wide rail default (UI MASTER §6.7, Jess 2026-09-17) ── */
function StatusRail() {
  const [pick, setPick] = useState<string>("all");
  const [supplier, setSupplier] = useState<string | null>(null);
  return (
    <FilterRail testId="probe-rail">
      <FilterRailGroup title="Pickup status" icon="waiting">
        {[["all", "All pickups"], ["late", "Late pickups"]].map(([key, label]) => (
          <FilterRailRow key={key} label={label} count={3} active={pick === key} resets={key === "all"}
            onClick={() => setPick(key)} testId={`row-${key}`} />
        ))}
      </FilterRailGroup>
      <FilterRailGroup title="Supplier" icon="supplier">
        <FilterRailSelect label="Supplier" allLabel="All suppliers" testId="supplier-select" value={supplier}
          options={[{ value: "hk", label: "Hooka" }]} onChange={setSupplier} />
      </FilterRailGroup>
    </FilterRail>
  );
}

const heading = (name: RegExp) => screen.getByRole("button", { name, expanded: undefined as never });

describe("FilterRail style C", () => {
  it("normal-case title with an icon, and NO chosen value while the group is not filtered", () => {
    render(<StatusRail />);
    const group = heading(/Pickup status/);
    expect(group).toHaveAttribute("aria-expanded", "true");
    expect(group.querySelector("[data-icon=waiting]")).not.toBeNull();
    expect(within(group).queryByTestId("rail-group-chosen")).toBeNull();
  });

  it("shows the chosen value in the heading only once filtered; the All row clears it", () => {
    render(<StatusRail />);
    fireEvent.click(screen.getByTestId("row-late"));
    expect(within(heading(/Pickup status/)).getByTestId("rail-group-chosen")).toHaveTextContent("Late pickups");
    fireEvent.click(screen.getByTestId("row-all"));
    expect(within(heading(/Pickup status/)).queryByTestId("rail-group-chosen")).toBeNull();
  });

  it("a dropdown group keeps its control type and reports its chosen option", () => {
    render(<StatusRail />);
    fireEvent.change(screen.getByTestId("supplier-select"), { target: { value: "hk" } });
    expect(within(heading(/Supplier/)).getByTestId("rail-group-chosen")).toHaveTextContent("Hooka");
  });

  it("collapsing hides the controls but never clears the filter, and is remembered", () => {
    const first = render(<StatusRail />);
    fireEvent.click(screen.getByTestId("row-late"));
    fireEvent.click(heading(/Pickup status/));
    expect(heading(/Pickup status/)).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByTestId("row-late")).not.toBeVisible();
    expect(screen.getByTestId("row-late")).toHaveAttribute("aria-pressed", "true");
    expect(within(heading(/Pickup status/)).getByTestId("rail-group-chosen")).toHaveTextContent("Late pickups");
    expect(localStorage.getItem("carres.filterRail.probe-rail.Pickup status")).toBe("0");
    first.unmount();
    render(<StatusRail />);
    expect(heading(/Pickup status/)).toHaveAttribute("aria-expanded", "false");
    expect(heading(/Supplier/)).toHaveAttribute("aria-expanded", "true");
  });

  it("keyboard: the heading is a real button (Enter/Space toggle natively)", () => {
    render(<StatusRail />);
    const group = heading(/Pickup status/);
    expect(group.tagName).toBe("BUTTON");
    group.focus();
    expect(document.activeElement).toBe(group);
  });
});
