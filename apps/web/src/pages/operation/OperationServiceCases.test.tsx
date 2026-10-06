import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import OperationServiceCases from "./OperationServiceCases";
import type { ServiceCase } from "@carres/shared";

/**
 * Service Cases on the shared template (owner directive 2026-10-06, LINE 1):
 * one Destination Header, the shared DataGrid, facts-only cells, COPY words,
 * the record in the kit Drawer (Escape closes it), the wizard in the kit Modal.
 *
 * The Deadline column counts against TODAY IN MALAYSIA, not the browser's
 * zone. Worked example from service-case-sla.test.ts: reported Mon 6 Jul 2026,
 * due Wed 22 Jul 2026. At 07:30 KL on the due day (23:30Z the night before)
 * the row must read "Due today" — a UTC browser would still say tomorrow.
 */

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, apiFetch: vi.fn() };
});
vi.mock("./components/GlobalTopBar", () => ({ TopBarIcons: () => null }));
import { apiFetch } from "@/lib/api";

const stamp = { at: "2026-07-07T02:00:00Z", by: "u1", byRole: "operation" };
const open = {
  id: "c1",
  caseNo: "SC2607-01",
  orderId: null,
  so: null,
  priority: "high",
  caseTypeLabel: null,
  customerName: "Ali",
  supplierName: "Hooka",
  refNo: "CR0418",
  whatHappened: "Hinge broke",
  statusLabel: "Pending",
  statusIsClosed: false,
  openedAt: "2026-07-06",
  slaEvents: [],
  customerWants: ["repair"],
  progress: [{ step: "supplier_date", on: "2026-07-07", ...stamp }],
  productCategory: "sofa",
  productSku: "LYYAR-1A",
  issueType: "damaged",
  evidence: [],
} as unknown as ServiceCase;
const closed = {
  ...open,
  id: "c2",
  caseNo: "SC2606-03",
  customerName: "Mei",
  statusLabel: "Resolved",
  statusIsClosed: true,
  openedAt: "2026-06-10",
  progress: [{ step: "customer_confirmed", on: "2026-06-20", ...stamp }],
} as unknown as ServiceCase;

const config = {
  types: [],
  statuses: [
    { id: "st-p", code: "pending", label: "Pending", sortOrder: 10, active: true, isClosed: false },
    { id: "st-r", code: "resolved", label: "Resolved", sortOrder: 40, active: true, isClosed: true },
  ],
};

function route(url: string): unknown {
  if (url.includes("/service-cases/config")) return config;
  if (url.includes("/evidence")) return { evidence: [] };
  if (/service-cases\/c1$/.test(url)) return open;
  if (/service-cases\/c2$/.test(url)) return closed;
  return { items: [open, closed], total: 2 };
}

function mount(at = "/operation?tab=service-notes") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[at]}><OperationServiceCases /></MemoryRouter>
    </QueryClientProvider>,
  );
}

const tz = process.env.TZ;
beforeEach(() => {
  process.env.TZ = "UTC";
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-07-21T23:30:00Z")); // 22 Jul 07:30 KL
  localStorage.clear();
  vi.mocked(apiFetch).mockImplementation((url: string) => Promise.resolve(route(url)) as never);
});
afterEach(() => {
  vi.useRealTimers();
  if (tz === undefined) delete process.env.TZ;
  else process.env.TZ = tz;
});

describe("Deadline column — today is the Malaysian date", () => {
  it("reads Due today at 07:30 KL on the due date, whatever zone the browser is in", async () => {
    mount();
    expect(await screen.findByText("Due today")).toBeInTheDocument();
    expect(screen.queryByText("1 working day left")).toBeNull();
  });
});

describe("the shared template", () => {
  it("draws ONE Destination Header with the word alone and the shared register", async () => {
    mount();
    expect(screen.getByTestId("service-cases-header-module-word")).toHaveTextContent("Service Cases");
    expect(await screen.findByText("SC2607-01")).toBeInTheDocument();
    expect(screen.getAllByLabelText("Search").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /New Case/ })).toBeInTheDocument();
    // No tab row and no scope pills: a register has neither (UI MASTER §6.5).
    expect(screen.queryByRole("button", { name: "Ongoing" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Numbers" })).toBeNull();
  });

  it("prints facts only, in COPY words — never the retired dropdown words or an action clause", async () => {
    mount();
    await screen.findByText("SC2607-01");
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/Pending|Follow-up|Resolved|Collect the item|tell manager|Everything done/);
    expect(screen.getAllByText("In progress").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Closed").length).toBeGreaterThan(0);
    // The last RECORDED fact, not the next act.
    expect(screen.getByText("Hooka gave a date")).toBeInTheDocument();
    expect(screen.getByText("Customer says it is solved")).toBeInTheDocument();
    expect(screen.queryByText(/Call Ali to say why/)).toBeNull();
  });

  it("opens the record in the kit Drawer from the Case No, and Escape closes it", async () => {
    mount();
    fireEvent.click(await screen.findByTestId("case-open-SC2607-01"));
    const dialog = await screen.findByRole("dialog", { name: "SC2607-01" });
    expect(within(dialog).getByText("Pick up the item from Ali")).toBeInTheDocument();
    // The status is a fact and the one transition is a named button, disabled with its reason while steps are open.
    const close = within(dialog).getByTestId("case-close");
    expect(close).toBeDisabled();
    expect(within(dialog).getByText(/^Close case: /)).toBeInTheDocument();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("opens the guided wizard in the kit Modal from New Case", async () => {
    mount();
    await screen.findByText("SC2607-01");
    fireEvent.click(screen.getByRole("button", { name: /New Case/ }));
    const dialog = await screen.findByRole("dialog", { name: "New Case" });
    expect(within(dialog).getByText("Who found it?")).toBeInTheDocument();
    expect(within(dialog).getByText("Step 1 of 6")).toBeInTheDocument();
  });

  it("?case= deep-links straight into the record", async () => {
    mount("/operation?tab=service-notes&case=c2");
    expect(await screen.findByRole("dialog", { name: "SC2606-03" })).toBeInTheDocument();
  });
});
