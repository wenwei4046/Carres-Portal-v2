import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import IssueRelatedPartyReport from "./IssueRelatedPartyReport";

const apiFetch = vi.fn();
vi.mock("@/lib/api", () => ({ apiFetch: (path: string) => apiFetch(path) }));
vi.mock("@/lib/fmt-date", async (importOriginal) => ({ ...(await importOriginal<object>()), appTodayIso: () => "2026-09-17" }));
vi.mock("@/components/kit/Select", () => ({
  default: ({ id, label, value, onValueChange, options }: { id: string; label?: string; value?: string; onValueChange: (v: string) => void; options: readonly { value: string; label: string }[] }) => (
    <label>{label}<select data-testid={id} value={value ?? ""} onChange={(e) => onValueChange(e.target.value)}><option value="" />{options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
  ),
}));

const REPORT = {
  month: "2026-09",
  sections: { confirmed: [{ issueNo: "IS-2609-0001", observedOn: "2026-09-03", description: "Sofa was damaged.", actOrOmission: "Sent a damaged sofa", incurred: 1280, recoverable: 500, recovered: 0 }], waiting: [], disputed: [] },
  totals: { distinctIssues: 1, incurred: 1280, recoverable: 500, recovered: 0 },
};

beforeEach(() => {
  apiFetch.mockReset();
  apiFetch.mockImplementation((path: string) => Promise.resolve(path.includes("related-parties") ? { items: [{ id: "p1", name: "Hookka" }] } : REPORT));
});

function Where() { return <output data-testid="where">{useLocation().search}</output>; }
function mount(entry = "/operation/issues/reports") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter initialEntries={[entry]}><Routes><Route path="/operation/issues/reports" element={<><IssueRelatedPartyReport /><Where /></>} /></Routes></MemoryRouter></QueryClientProvider>);
}

it("keeps confirmed, waiting and disputed sections separate", () => {
  mount();
  expect(screen.getByText("Confirmed fault")).toBeInTheDocument();
  expect(screen.getByText("Waiting response")).toBeInTheDocument();
  expect(screen.getByText("Disputed")).toBeInTheDocument();
  expect(screen.getByText("Cost incurred")).toBeInTheDocument();
  expect(screen.getByText("Amount recoverable")).toBeInTheDocument();
  expect(screen.getByText("Amount recovered")).toBeInTheDocument();
});

it("changing the month asks for that month and keeps it in the URL", async () => {
  mount("/operation/issues/reports?month=2026-09");
  await waitFor(() => expect(screen.getByTestId("report-party").querySelectorAll("option").length).toBe(2));
  fireEvent.change(screen.getByTestId("report-party"), { target: { value: "p1" } });
  await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/api/ops/issues/reports/p1?month=2026-09"));
  fireEvent.change(screen.getByTestId("report-month"), { target: { value: "2026-08" } });
  await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/api/ops/issues/reports/p1?month=2026-08"));
  expect(screen.getByTestId("where")).toHaveTextContent("month=2026-08");
});

it("prints money as RM 1,280.00", async () => {
  mount("/operation/issues/reports?month=2026-09");
  await waitFor(() => expect(screen.getByTestId("report-party").querySelectorAll("option").length).toBe(2));
  fireEvent.change(screen.getByTestId("report-party"), { target: { value: "p1" } });
  expect((await screen.findAllByText(/RM 1,280\.00/)).length).toBeGreaterThan(0);
  expect(screen.queryByText(/RM1280/)).not.toBeInTheDocument();
});
