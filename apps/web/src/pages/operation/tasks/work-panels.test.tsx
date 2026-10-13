import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import type { WorkRow } from "../use-open-work";
import type { WorkPanelHost } from "./tasks-host";
import { panelFor } from "./work-panels";

vi.mock("../work/WorkOrderRoute", () => ({ useMissionRoute: () => ({ route: null, loading: true, failed: false }) }));

/**
 * What a task opens when its module has no panel of its own: the act, in the
 * one task view. Every value below is TEST data.
 */
const task = (over: Record<string, unknown> = {}, source: Record<string, unknown> = {}) => ({
  id: "t1", module: "payment", ruleKey: "payment.collect_customer_balance", dueIso: "2026-10-05", timingBucket: "today",
  line: "Ask TEST customer C to pay", problem: "Balance due before delivery", recipient: "TEST customer C",
  destination: "/operation/orders/so/o-9105", ownerState: "primary", normalOwner: null,
  ...over,
  source: {
    object: { kind: "sales_order", id: "o-9105", label: "SO-9105" },
    problem: "Balance due before delivery", requiredResult: "Balance received", completionStatement: "Balance received",
    nextConsequence: null, interaction: { mode: "open_module", fallbackDestination: "/operation/orders/so/o-9105" },
    timing: { missedAge: { state: "counted", workingDays: 0 } }, owner: { acting: null },
    ...source,
  },
}) as unknown as WorkRow;
const host = { close: vi.fn(), back: vi.fn(), result: vi.fn(), openReview: vi.fn(), simulated: true } as unknown as WorkPanelHost;
function Where() { return <p data-testid="where">{useLocation().pathname}</p>; }
function mount(row: WorkRow) {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter initialEntries={["/operation"]}><Routes><Route path="*" element={<>{panelFor(row, host)}<Where /></>} /></Routes></MemoryRouter>
  </QueryClientProvider>);
}

describe("the act panel, in the one task view", () => {
  it("says what is wrong and names the one step by its result; the same sentence is not said twice", () => {
    mount(task());
    expect(screen.getByTestId("task-view-title")).toHaveTextContent("Ask TEST customer C to pay");
    expect(screen.getByTestId("task-view-head")).toHaveTextContent("Payment/SO-9105");
    expect(screen.getByTestId("task-generic-problem")).toHaveTextContent("Balance due before delivery");
    expect(screen.getByRole("listitem")).toHaveTextContent(/^1Balance receivedOpen SO-9105$/);
    expect(screen.queryByTestId("task-generic-finish")).toBeNull();
    expect(screen.queryByTestId("task-generic-next")).toBeNull();
    fireEvent.click(screen.getByTestId("task-generic-open"));
    expect(screen.getByTestId("where")).toHaveTextContent("/operation/orders/so/o-9105");
  });

  it("prints the finish line when it adds to the step, and what happens next when the rule says", () => {
    mount(task({}, { requiredResult: "Scheduled delivery recorded", completionStatement: "The delivery has a confirmed date", nextConsequence: "Logistics is told the date" }));
    expect(screen.getByTestId("task-generic-finish")).toHaveTextContent("Finish when: The delivery has a confirmed date");
    expect(screen.getByTestId("task-generic-next")).toHaveTextContent("Then: Logistics is told the date");
  });

  it("a Sales Order task and a delivery task about an order have its Route and its document; the number is not repeated as a fact", () => {
    for (const kind of ["sales_order", "delivery_scope"]) {
      mount(task({ module: kind === "sales_order" ? "payment" : "delivery" }, { object: { kind, id: "o-9105", label: "SO-9105" } }));
    }
    expect(screen.getAllByRole("tab", { name: "Files 1" })).toHaveLength(2);
    expect(screen.queryByTestId("task-view-fact-sales-order")).toBeNull();
    fireEvent.mouseDown(screen.getAllByRole("tab", { name: "Route" })[0]!);
    expect(screen.getByTestId("task-route-state")).toHaveTextContent("Loading the Order Route");
  });

  it("a task about another kind of record has no Sales Order to route, and says so", () => {
    mount(task({ module: "delivery" }, { object: { kind: "delivery_order", id: "DO-2041", label: "DO-2041" } }));
    expect(screen.getByRole("tab", { name: "Files" })).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Route" }));
    expect(screen.getByTestId("task-route-none")).toBeInTheDocument();
  });
});
