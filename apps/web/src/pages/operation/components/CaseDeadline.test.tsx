import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CaseSlaEvent } from "@carres/shared";

import CaseDeadline from "./CaseDeadline";

/**
 * S4 — the deadline card. What matters on screen is the pair of decisions the
 * card makes: WHEN it asks for the call, and whether the deadline it prints is
 * the one in force.
 *
 * The clock is frozen on Fri 17 Jul 2026 — day 10 of a case reported Mon 6 Jul,
 * whose 14-working-day deadline is Wed 22 Jul. A test that read the real date
 * would silently start testing a different rung tomorrow.
 */

vi.mock("@/lib/api", () => ({ apiFetch: vi.fn(async () => ({ id: "c1" })) }));

const OPENED = "2026-07-06";

function draw(props: Partial<Parameters<typeof CaseDeadline>[0]> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <CaseDeadline
        caseId="c1"
        openedAt={OPENED}
        closed={false}
        customerName="Ryan Chong"
        events={[]}
        {...props}
      />
    </QueryClientProvider>,
  );
}

function told(over: Partial<CaseSlaEvent> = {}): CaseSlaEvent {
  return {
    kind: "customer_told",
    on: "2026-07-17",
    reason: "supplier_no_date",
    due: "2026-07-22",
    at: "2026-07-17T02:00:00Z",
    by: "u1",
    byRole: "operation",
    ...over,
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-07-17T02:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("CaseDeadline", () => {
  it("prints the deadline and how the clock stands against it", () => {
    draw();
    expect(screen.getByText("22 Jul 26, Wed")).toBeInTheDocument();
    expect(screen.getByText("4 working days left")).toBeInTheDocument();
  });

  it("asks for the call by name once the window is open", () => {
    draw();
    expect(
      screen.getByText("Call Ryan Chong — say why it is taking longer"),
    ).toBeInTheDocument();
  });

  it("stops asking once the customer has been told about this deadline", () => {
    draw({ events: [told()] });
    expect(
      screen.queryByText("Call Ryan Chong — say why it is taking longer"),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Ryan Chong was told why it is taking longer/)).toBeInTheDocument();
    expect(screen.getByText(/Factory has not given a date/)).toBeInTheDocument();
  });

  it("prints the moved deadline, not the one it replaced", () => {
    draw({
      events: [
        told({ kind: "extension", reason: "supplier_special_order", until: "2026-07-31" }),
      ],
    });
    expect(screen.getByText("31 Jul 26, Fri")).toBeInTheDocument();
    expect(screen.getByText(/Deadline moved once/)).toBeInTheDocument();
    // The one move is spent — the button is gone, not merely disabled.
    expect(screen.queryByText("Move the deadline")).not.toBeInTheDocument();
  });

  it("offers the one move while it is unused", () => {
    draw();
    expect(screen.getByText("Move the deadline")).toBeInTheDocument();
  });

  it("goes quiet on a closed case — nothing left to be late for", () => {
    draw({ closed: true, openedAt: "2026-06-16" });
    expect(screen.queryByText(/say why it is taking longer/)).not.toBeInTheDocument();
    expect(screen.queryByText("Move the deadline")).not.toBeInTheDocument();
    expect(screen.getByText(/This case is closed/)).toBeInTheDocument();
  });

  it("says what to fix when the case has no report date", () => {
    draw({ openedAt: null });
    expect(screen.getByText(/no report date/)).toBeInTheDocument();
  });

  it("says nothing about a case with time still on the clock", () => {
    vi.setSystemTime(new Date("2026-07-10T02:00:00Z"));
    draw();
    expect(screen.getByText("22 Jul 26, Wed")).toBeInTheDocument();
    expect(screen.queryByText(/say why it is taking longer/)).not.toBeInTheDocument();
  });
});
