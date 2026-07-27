import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ServiceCaseNumbersPanel from "./ServiceCaseNumbersPanel";
import type { ServiceCaseNumbersResponse } from "@carres/shared";

/**
 * Service Case numbers — card S5.
 *
 * The behaviours worth locking down are the ones a screenshot cannot prove:
 *  1. A figure the records cannot back is WITHHELD with its reason, never
 *     printed as a zero or a 100%.
 *  2. A case filed before the guided questions reads "Filed before the
 *     questions" — not the "Other" a human picks.
 *  3. Clicking a month narrows the report, and the month strip stays whole so
 *     the control cannot empty itself.
 *  4. A browser talking to a Worker that predates the route degrades to a
 *     sentence instead of taking the Service Cases page down.
 */

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, apiFetch: vi.fn() };
});
import { apiFetch } from "@/lib/api";

function response(
  over: Partial<ServiceCaseNumbersResponse> = {},
): ServiceCaseNumbersResponse {
  return {
    months: ["2026-07", "2026-06", "2026-05", "2026-04", "2026-03", "2026-02"],
    period: null,
    totals: {
      opened: 1,
      finished: 0,
      closedWithoutFinishDate: 1,
      stillOpen: 0,
      stillOpenLate: 0,
    },
    byMonth: [
      { period: "2026-07", total: 0, byCategory: {} },
      { period: "2026-06", total: 1, byCategory: { unclassified: 1 } },
      { period: "2026-05", total: 0, byCategory: {} },
      { period: "2026-04", total: 0, byCategory: {} },
      { period: "2026-03", total: 0, byCategory: {} },
      { period: "2026-02", total: 0, byCategory: {} },
    ],
    byIssue: [
      {
        key: "unclassified",
        label: "Filed before the questions",
        count: 1,
        byCategory: { unclassified: 1 },
      },
    ],
    bySupplier: [{ name: "No factory on the case", count: 1, lateCount: 0 }],
    byResponsibility: { supplier: 0, carres: 0, customer: 0 },
    delayReasonsRecorded: 0,
    finish: {
      measured: 0,
      unmeasured: 1,
      avgWorkingDays: null,
      withheldReason:
        "1 case was closed before the portal recorded the day the customer confirmed, so how long they took cannot be counted.",
    },
    onTime: {
      measured: 0,
      unmeasured: 1,
      onTime: 0,
      late: 0,
      pct: null,
      withheldReason:
        "No case has both a report date and a confirmed finish date yet, so none can be measured against the 14 working days.",
    },
    headline:
      "1 case reported. None of them was filed with the questions, so nothing can be counted by problem or factory yet.",
    ...over,
  };
}

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ServiceCaseNumbersPanel />
    </QueryClientProvider>,
  );
}

// The braces matter: `mockReset()` returns the mock, and a hook that returns a
// FUNCTION has handed vitest a teardown — which would call apiFetch() after the
// test and leave its rejection unhandled.
beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
});

describe("the live state — one case, closed, filed before the questions", () => {
  it("withholds both figures and prints the reason instead of a number", async () => {
    vi.mocked(apiFetch).mockResolvedValue(response());
    renderPanel();

    const avg = await screen.findByTestId("numbers-avg-days");
    expect(avg.textContent).toContain("—");
    expect(avg.textContent).toContain("closed before the portal recorded");

    const onTime = screen.getByTestId("numbers-on-time");
    expect(onTime.textContent).toContain("—");
    expect(onTime.textContent).not.toContain("%");
  });

  it("names the pre-wizard case as such, never as a chosen Other", async () => {
    vi.mocked(apiFetch).mockResolvedValue(response());
    renderPanel();

    expect(await screen.findByTestId("numbers-issue-unclassified")).toHaveTextContent(
      "Filed before the questions",
    );
    expect(screen.queryByTestId("numbers-issue-other")).toBeNull();
  });

  it("says out loud which cases are left out of the figures", async () => {
    vi.mocked(apiFetch).mockResolvedValue(response());
    renderPanel();
    expect(await screen.findByTestId("numbers-unmeasured")).toHaveTextContent(
      "closed before the portal recorded a finish date",
    );
  });
});

describe("the rankings — the card's one glance", () => {
  const ranked = response({
    totals: {
      opened: 4,
      finished: 2,
      closedWithoutFinishDate: 0,
      stillOpen: 2,
      stillOpenLate: 1,
    },
    byIssue: [
      { key: "damaged", label: "Damaged", count: 3, byCategory: { sofa: 2, mattress: 1 } },
      { key: "missing_parts", label: "Missing parts", count: 1, byCategory: { bedframe: 1 } },
    ],
    bySupplier: [
      { name: "Ohana", count: 3, lateCount: 1 },
      { name: "Nice Future", count: 1, lateCount: 0 },
    ],
    finish: { measured: 2, unmeasured: 0, avgWorkingDays: 9.5, withheldReason: null },
    onTime: { measured: 2, unmeasured: 0, onTime: 1, late: 1, pct: 50, withheldReason: null },
    byResponsibility: { supplier: 2, carres: 1, customer: 0 },
    delayReasonsRecorded: 3,
    headline: "4 cases reported. Damaged is the most common problem — 3 of 4. Ohana carries the most: 3.",
  });

  it("shows the leading problem with its per-category split", async () => {
    vi.mocked(apiFetch).mockResolvedValue(ranked);
    renderPanel();
    const row = await screen.findByTestId("numbers-issue-damaged");
    expect(row).toHaveTextContent("Damaged");
    expect(row).toHaveTextContent("Sofa 2");
    expect(row).toHaveTextContent("Mattress 1");
  });

  it("shows the leading factory with its late count beside it", async () => {
    vi.mocked(apiFetch).mockResolvedValue(ranked);
    renderPanel();
    expect(await screen.findByTestId("numbers-supplier-Ohana")).toHaveTextContent("1 late");
  });

  it("prints both figures once the records can back them", async () => {
    vi.mocked(apiFetch).mockResolvedValue(ranked);
    renderPanel();
    expect(await screen.findByTestId("numbers-avg-days")).toHaveTextContent("9.5");
    expect(screen.getByTestId("numbers-on-time")).toHaveTextContent("50%");
  });

  it("files the recorded delays without a second tagging pass", async () => {
    vi.mocked(apiFetch).mockResolvedValue(ranked);
    renderPanel();
    expect(await screen.findByTestId("numbers-responsibility")).toHaveTextContent("factory");
  });

  it("stays silent about delays when none was recorded", async () => {
    vi.mocked(apiFetch).mockResolvedValue(response());
    renderPanel();
    await screen.findByTestId("numbers-time");
    expect(screen.queryByTestId("numbers-responsibility")).toBeNull();
  });
});

describe("narrowing to a month", () => {
  it("asks the server for that month and keeps the whole strip", async () => {
    vi.mocked(apiFetch).mockResolvedValue(response());
    renderPanel();

    fireEvent.click(await screen.findByTestId("numbers-month-2026-06"));

    await waitFor(() =>
      expect(vi.mocked(apiFetch)).toHaveBeenCalledWith(
        "/api/ops/service-cases/numbers?period=2026-06",
      ),
    );
    // The control used to narrow must not empty itself.
    expect(screen.getByTestId("numbers-month-2026-07")).toBeTruthy();
  });
});

describe("a Worker that predates the route", () => {
  it("degrades to a sentence rather than taking the page down", async () => {
    vi.mocked(apiFetch).mockImplementation(() => Promise.reject(new Error("404")));
    renderPanel();
    expect(
      await screen.findByText("The numbers are not available yet."),
    ).toBeTruthy();
  });
});
