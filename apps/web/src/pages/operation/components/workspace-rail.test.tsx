/**
 * S3 · the filter rail starts hidden on a narrow canvas unless this browser
 * opened it before (owner follow-up 2026-09-16 — SO Batch + Manual Purchase).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { useRef } from "react";
import { useFilterRailOpen } from "./workspace-rail";

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
