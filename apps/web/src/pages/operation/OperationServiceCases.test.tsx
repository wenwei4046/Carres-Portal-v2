import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
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
