import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import type { WorkRow } from "../use-open-work";
import type { WorkPanelHost } from "./tasks-host";
const refreshWork = vi.hoisted(() => vi.fn());
import { panelFor } from "./work-panels";

vi.mock("../work/WorkOrderRoute", () => ({ useMissionRoute: () => ({ route: null, loading: true, failed: false }) }));
/* Delivery's own forms are their own doors; here they only prove which one a
   task opens, for which order, and that closing them returns to the task. */
vi.mock("../work/WorkActForms", () => ({
  useRefreshWork: () => refreshWork,
  SupplierAnswerForm: () => null,
  AssignLogisticsForm: ({ orderId, onDone }: { orderId: string; onDone: () => void }) => <button type="button" onClick={onDone}>assign form {orderId}</button>,
  DeliveryDateForm: ({ orderId, onDone }: { orderId: string; onDone: () => void }) => <button type="button" onClick={onDone}>date form {orderId}</button>,
}));

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

  it("a PO send task opens its owning PO instead of the supplier-answer form", () => {
    const destination = "/operation/procurement?po=PO-260910-3301";
    mount(task({ module: "purchasing", ruleKey: "purchasing.cancellation_send", destination, line: "Send PO-260910-3301-V2 to TEST supplier" }, {
      object: { kind: "purchase_order", id: "PO-260910-3301", label: "PO-260910-3301-V2" },
      requiredResult: "Current PO version marked as sent",
      interaction: { mode: "embedded", actionKey: "purchasing.confirm_po_sent", fallbackDestination: destination },
    }));
    expect(screen.getByTestId("task-generic-open")).toBeInTheDocument();
    expect(screen.queryByTestId("task-record-supplier-answer")).not.toBeInTheDocument();
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

  it.each([
    ["assign_logistics", "Assign logistics", "assign form o-9105"],
    ["confirm_delivery_date", "Update date and time", "date form o-9105"],
  ])("Delivery's %s is done in place: the one button opens Delivery's own form on the full surface", (ruleKey, button, form) => {
    (host.openReview as ReturnType<typeof vi.fn>).mockClear(); refreshWork.mockClear();
    mount(task({ module: "delivery", ruleKey }, { object: { kind: "delivery_scope", id: "o-9105", label: "SO-9105" }, requiredResult: "Scheduled delivery recorded" }));
    expect(screen.queryByTestId("task-generic-open")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: button }));
    expect(host.openReview).toHaveBeenCalledTimes(1);
    const close = vi.fn();
    render((host.openReview as ReturnType<typeof vi.fn>).mock.calls[0]![0](close) as ReactNode);
    expect(screen.getByRole("heading", { name: button })).toBeInTheDocument();
    expect(screen.getByTestId("task-wide-surface")).toHaveTextContent("SO-9105");
    /* Saved or cancelled, the form closes back to the task and the Work reads
       are asked again; the form says its own result, the host adds none. */
    fireEvent.click(screen.getByRole("button", { name: form }));
    expect(close).toHaveBeenCalledTimes(1);
    expect(refreshWork).toHaveBeenCalledTimes(1);
    expect(host.result).not.toHaveBeenCalled();
  });

  it("the same rule about a Delivery Order, which names no order id, keeps the record's own page", () => {
    mount(task({ module: "delivery", ruleKey: "confirm_delivery_date" }, { object: { kind: "delivery_order", id: "DO-2041", label: "DO-2041" } }));
    expect(screen.getByTestId("task-generic-open")).toHaveTextContent("Open DO-2041");
    expect(screen.queryByTestId("task-generic-act")).toBeNull();
  });
});
