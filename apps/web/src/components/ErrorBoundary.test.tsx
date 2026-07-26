import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ErrorBoundary from "./ErrorBoundary";

/**
 * The crash net. The bar these tests hold: after ANY render error the operator
 * must still see words on the screen — never the blank page the app used to
 * show — and must have a way out that actually works.
 */

function Bomb({ boom }: { boom: boolean }) {
  if (boom) throw new Error("kaboom from a child");
  return <p>all good</p>;
}

let spy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  // React logs the caught error itself; silence it so the suite output stays
  // readable, but assert we do our OWN logging below.
  spy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => spy.mockRestore());

describe("ErrorBoundary", () => {
  it("renders children untouched when nothing throws", () => {
    render(
      <ErrorBoundary>
        <Bomb boom={false} />
      </ErrorBoundary>,
    );
    expect(screen.getByText("all good")).toBeInTheDocument();
    expect(screen.queryByTestId("error-boundary")).not.toBeInTheDocument();
  });

  it("shows a readable screen instead of a blank page when a child throws", () => {
    render(
      <ErrorBoundary>
        <Bomb boom />
      </ErrorBoundary>,
    );
    const box = screen.getByTestId("error-boundary");
    expect(box).toBeInTheDocument();
    // the words that matter to someone standing at a counter
    expect(screen.getByText(/This page hit a problem/i)).toBeInTheDocument();
    expect(screen.getByText(/Nothing you just did was lost/i)).toBeInTheDocument();
    expect(box.textContent?.trim().length ?? 0).toBeGreaterThan(20);
  });

  it("keeps the error message available for a screenshot", () => {
    render(
      <ErrorBoundary>
        <Bomb boom />
      </ErrorBoundary>,
    );
    expect(screen.getByText(/kaboom from a child/)).toBeInTheDocument();
  });

  it("logs the crash with its area so a screenshot is actionable", () => {
    render(
      <ErrorBoundary area="POS">
        <Bomb boom />
      </ErrorBoundary>,
    );
    const ours = spy.mock.calls.filter((c) => c[0] === "[carres] render crash");
    expect(ours.length).toBeGreaterThan(0);
    expect(ours[0][1]).toBe("POS");
  });

  it("Try again really re-mounts the subtree, not just clears the flag", () => {
    // Flipped by the test between renders — a self-healing child would heal
    // during React's own re-render and the boundary would never be seen.
    let shouldThrow = true;
    function Flaky() {
      if (shouldThrow) throw new Error("still broken");
      return <p>recovered</p>;
    }

    render(
      <ErrorBoundary>
        <Flaky />
      </ErrorBoundary>,
    );
    expect(screen.getByTestId("error-boundary")).toBeInTheDocument();

    // Retrying while STILL broken must land back on the failure screen, not a
    // blank page — the second crash has to be caught as cleanly as the first.
    fireEvent.click(screen.getByTestId("error-boundary-retry"));
    expect(screen.getByTestId("error-boundary")).toBeInTheDocument();

    // …and once the cause is gone, the same button genuinely recovers.
    shouldThrow = false;
    fireEvent.click(screen.getByTestId("error-boundary-retry"));
    expect(screen.getByText("recovered")).toBeInTheDocument();
    expect(screen.queryByTestId("error-boundary")).not.toBeInTheDocument();
  });

  it("offers a way back to the start", () => {
    render(
      <ErrorBoundary>
        <Bomb boom />
      </ErrorBoundary>,
    );
    expect(screen.getByTestId("error-boundary-home")).toBeInTheDocument();
  });

  it("names the area it is guarding", () => {
    render(
      <ErrorBoundary area="Rent-to-Own">
        <Bomb boom />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Rent-to-Own")).toBeInTheDocument();
  });
});
