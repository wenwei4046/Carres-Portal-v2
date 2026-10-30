import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import OperationServiceCases from "./OperationServiceCases";
import type { ServiceCase } from "@carres/shared";

/**
 * The Deadline column counts against TODAY IN MALAYSIA, not the browser's
 * zone. Worked example from service-case-sla.test.ts: reported Mon 6 Jul 2026,
 * due Wed 22 Jul 2026. At 07:30 KL on the due day (23:30Z the night before)
 * the row must read "Due today" — a UTC browser would still say tomorrow.
 */

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, apiFetch: vi.fn() };
});
import { apiFetch } from "@/lib/api";

const row = {
  id: "c1",
  caseNo: "SC-1",
  orderId: null,
  so: null,
  priority: null,
  caseTypeLabel: null,
  customerName: "Ali",
  supplierName: null,
  refNo: null,
  whatHappened: "Hinge broke",
  statusLabel: "Open",
  statusIsClosed: false,
  openedAt: "2026-07-06",
  slaEvents: [],
  customerWants: [],
  progress: [],
} as unknown as ServiceCase;

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><OperationServiceCases /></MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Deadline column — today is the Malaysian date", () => {
  const tz = process.env.TZ;
  beforeEach(() => {
    process.env.TZ = "UTC";
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-07-21T23:30:00Z")); // 22 Jul 07:30 KL
    vi.mocked(apiFetch).mockResolvedValue({ items: [row], total: 1 });
  });
  afterEach(() => {
    vi.useRealTimers();
    if (tz === undefined) delete process.env.TZ;
    else process.env.TZ = tz;
  });

  it("reads Due today at 07:30 KL on the due date, whatever zone the browser is in", async () => {
    mount();
    expect(await screen.findByText("Due today")).toBeInTheDocument();
    expect(screen.queryByText("1 working day left")).toBeNull();
  });
});

/**
 * 0711 — Weisiang's decision (Mr Lim, WhatsApp 2026-10-22), Houzs way: one card
 * per stage with its count (click to filter, click again to clear), a My cases
 * switch that asks the server for my team's cases, and the owner on each row.
 */
describe("Service Cases — stage cards, My cases and the owner", () => {
  afterEach(() => { document.title = "Carres Portal"; });
  const OWNER = "55555555-5555-5555-5555-555555555555";
  const cases = [
    { ...row, id: "a", caseNo: "SC-A", statusId: "s1", statusLabel: "Pending", ownerUserId: OWNER },
    { ...row, id: "b", caseNo: "SC-B", statusId: "s1", statusLabel: "Pending", ownerUserId: null },
    { ...row, id: "c", caseNo: "SC-C", statusId: "s2", statusLabel: "In Progress", ownerUserId: null },
  ];
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
    vi.mocked(apiFetch).mockImplementation(async (url: string) => {
      if (url.startsWith("/api/operation/staff")) return { staff: [{ user_id: OWNER, name: "Shasha" }], myDuties: [] };
      return { items: cases, total: cases.length };
    });
  });

  it("counts each stage on its card and filters the list when a card is pressed", async () => {
    mount();
    const pending = await screen.findByTestId("case-stage-card-s1");
    expect(pending).toHaveTextContent("Pending");
    expect(pending).toHaveTextContent("2");
    expect(screen.getByTestId("case-stage-card-s2")).toHaveTextContent("1");

    fireEvent.click(pending);
    expect(screen.getByText("SC-A")).toBeInTheDocument();
    expect(screen.queryByText("SC-C")).toBeNull();
    fireEvent.click(pending);
    expect(screen.getByText("SC-C")).toBeInTheDocument();
  });

  it("names the browser tab; phones get an sr-only h1 and the visible heading is an h2", async () => {
    mount();
    expect(document.title).toBe("Service Cases · Carres");
    // jsdom has no media queries: assert the class that hides it from md up.
    const h1 = screen.getByRole("heading", { level: 1, name: "Service Cases" });
    expect(h1).toHaveClass("sr-only", "md:hidden");
    expect(screen.getByRole("heading", { level: 2, name: "Service Cases" })).toBeInTheDocument();
    expect(await screen.findByText("SC-A")).toBeInTheDocument();
  });

  it("names the case owner on the row", async () => {
    mount();
    expect(await screen.findByText("Shasha")).toBeInTheDocument();
  });

  it("asks the server for my team's cases when My cases is ticked", async () => {
    mount();
    fireEvent.click(await screen.findByLabelText("My cases"));
    await waitFor(() =>
      expect(vi.mocked(apiFetch).mock.calls.some(([u]) => String(u).includes("mine=1"))).toBe(true),
    );
  });
});
