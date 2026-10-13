import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import type { WorkRow } from "../use-open-work";
import TaskFrame, { TaskOpenContext } from "./TaskFrame";
import { taskCard } from "./task-cards";
import type { TaskFile } from "./task-view";

/* The Route tab reads the Order Route's own sources; here it only has to be
   asked for the right Sales Order. */
vi.mock("../work/WorkOrderRoute", () => ({
  useMissionRoute: (orderId: string) => ({
    loading: false, failed: false,
    route: {
      header: { text: "3 days left", tone: "current" },
      points: [
        { key: "proceed", label: "Proceed", dateText: "1 Sep", status: "Done", tone: "done", final: false },
        { key: "po", label: "PO", dateText: "13 to 20 Oct", status: "2 of 3", tone: "attention", final: false },
        { key: "delivery", label: "Delivery", dateText: null, status: `Requested for ${orderId}`, tone: "future", final: true },
      ],
      paymentLine: { text: "Payment · RM 1,250.00 unpaid", tone: "attention", deadlineText: null },
    },
  }),
}));

/**
 * The task frame (owner's round 3 brief of 13 Oct 2026, point 2): how a
 * module's panel becomes the one task view. Every value below is TEST data.
 */
const TASK = {
  id: "t1", module: "purchasing", ruleKey: "purchasing.supplier_date_passed", dueIso: "2026-09-29", timingBucket: "overdue",
  line: "Ask TEST Supplier A when the goods will arrive", problem: "Supplier delivery date passed", recipient: "TEST Supplier A",
  destination: "/operation/procurement?po=PO-261001-9001", ownerState: "primary", normalOwner: null,
  source: {
    object: { kind: "purchase_order", id: "PO-261001-9001", label: "PO-261001-9001" },
    timing: { missedAge: { state: "counted", workingDays: 4 } },
    owner: { acting: { userId: "u1", name: "TEST · Staff A" } },
  },
} as unknown as WorkRow;
const ORDERS = [{ orderId: "o1", label: "SO-9101" }, { orderId: "o2", label: "SO-9102" }];
const file = (key: string, name: string, load = vi.fn(async () => new Blob(["pdf"]))): TaskFile => ({ key, name, detail: "Sales Order", load });

function Where() { return <p data-testid="where">{useLocation().pathname + useLocation().search}</p>; }
function mount(frame: ReactNode, inTasks = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}><MemoryRouter initialEntries={["/operation"]}>
      <Routes><Route path="*" element={<>
        <TaskOpenContext.Provider value={inTasks ? { row: TASK, card: taskCard(TASK) } : null}>{frame}</TaskOpenContext.Provider>
        <Where />
      </>} /></Routes>
    </MemoryRouter></QueryClientProvider>,
  );
}
const HEAD = { title: "TEST Supplier A", page: "Purchasing", record: "PO-261001-9001", moduleIcon: "shopping_cart" };

describe("TaskFrame, inside the Tasks area", () => {
  it("takes its title and facts from the task's own list card, and the record opens its page", () => {
    mount(<TaskFrame head={HEAD} steps={<p>the work</p>} facts={[{ key: "po-date", icon: "local_shipping", label: "PO Delivery Date", value: "Tue, 29 Sep" }]} />);
    expect(screen.getByTestId("task-view-title")).toHaveTextContent("Ask TEST Supplier A when the goods will arrive");
    expect(screen.getByTestId("task-view-owner")).toHaveAccessibleName("TEST · Staff A");
    expect(within(screen.getByTestId("task-view-facts")).getAllByRole("term").map((term) => term.textContent)).toEqual(["Deadline", "Contact", "PO Delivery Date"]);
    expect(screen.getByTestId("task-view-fact-Deadline")).toHaveTextContent("Tue, 29 Sep · 4 days late");
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Steps", "Route", "History", "Files"]);
    expect(screen.getByText("the work")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Open PO-261001-9001" }));
    expect(screen.getByTestId("where")).toHaveTextContent("/operation/procurement?po=PO-261001-9001");
  });

  it("Sales Order: the count opens the module's own Sales Orders, closed until asked for", () => {
    mount(<TaskFrame head={HEAD} steps={null} orders={ORDERS} salesOrders={<p>the two Sales Orders</p>} />);
    const toggle = screen.getByTestId("task-sales-orders-toggle");
    expect(toggle).toHaveTextContent("2 Sales Orders");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("the two Sales Orders")).toBeNull();
    fireEvent.click(toggle);
    expect(screen.getByTestId("task-view-fact-detail-sales-order")).toHaveTextContent("the two Sales Orders");
  });

  it("Route: one Sales Order at a time, each point as the Order Route's own model says it", () => {
    mount(<TaskFrame head={HEAD} steps={null} orders={ORDERS} />);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Route" }));
    const route = screen.getByTestId("task-route-o1");
    expect(screen.getByTestId("task-route-header")).toHaveTextContent("3 days left");
    expect(within(route).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["ProceedDone1 Sep", "PO2 of 313 to 20 Oct", "DeliveryRequested for o1"]);
    expect(screen.getByTestId("task-route-point-po")).toHaveAttribute("data-tone", "attention");
    expect(screen.getByTestId("task-route-payment")).toHaveTextContent("Payment · RM 1,250.00 unpaid");
    fireEvent.click(within(route).getByRole("button", { name: "Open SO-9101" }));
    expect(screen.getByTestId("where")).toHaveTextContent("/operation/orders/so/o1");
  });

  it("Route: a task with no Sales Order says so", () => {
    mount(<TaskFrame head={HEAD} steps={null} />);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Route" }));
    expect(screen.getByTestId("task-route-none")).toHaveTextContent("No Sales Order is linked to this task");
  });

  it("History: newest first, with who recorded it; nothing recorded says so", () => {
    mount(<TaskFrame head={HEAD} steps={null} history={[
      { key: "a", at: "2026-10-01T02:14:00.000Z", text: "PO sent to supplier", detail: "PO-261001-9001-V2 · WhatsApp", by: "TEST · Staff A" },
      { key: "b", at: "2026-10-08T03:00:00.000Z", text: "Supplier answer recorded" },
    ]} />);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "History" }));
    expect(within(screen.getByTestId("task-history")).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "Supplier answer recordedThu, 8 Oct 11:00",
      "PO sent to supplierPO-261001-9001-V2 · WhatsAppThu, 1 Oct 10:14 · TEST · Staff A",
    ]);
  });
  it("History: nothing recorded says so", () => {
    mount(<TaskFrame head={HEAD} steps={null} />);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "History" }));
    expect(screen.getByTestId("task-history-none")).toHaveTextContent("No history yet");
  });

  it("Files: the tab counts them; a file is read only when it is asked for, and a stage with none says so", async () => {
    const load = vi.fn(async () => new Blob(["pdf"]));
    mount(<TaskFrame head={HEAD} steps={null} files={[
      { key: "sales-order", title: "Sales Order", sub: "2 Sales Orders", files: [file("so-o1", "SO-9101.pdf", load), file("so-o2", "SO-9102.pdf")] },
      { key: "purchase-order", title: "Purchase Order", files: [] },
    ]} />);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Files 2" }));
    expect(screen.getByTestId("task-files-stage-sales-order")).toHaveTextContent("Sales Order2 Sales OrdersSO-9101.pdfSales OrderSO-9102.pdfSales Order");
    expect(screen.getByTestId("task-files-stage-purchase-order")).toHaveTextContent("Purchase OrderNo file yet");
    expect(load).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "View SO-9101.pdf" }));
    expect(await screen.findByRole("dialog", { name: "SO-9101.pdf" })).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(1);
  });
});

describe("TaskFrame, outside the Tasks area", () => {
  it("uses the module's own head and facts, and names no owner", () => {
    mount(<TaskFrame head={{ ...HEAD, facts: [{ key: "cut-off", icon: "schedule", label: "Cut-off", value: "11:00 AM · passed", warn: true }] }} steps={<p>the work</p>} />, false);
    expect(screen.getByTestId("task-view-title")).toHaveTextContent(/^TEST Supplier A$/);
    expect(screen.getByTestId("task-view-fact-cut-off")).toHaveAttribute("data-warn", "true");
    expect(screen.queryByTestId("task-view-owner")).toBeNull();
    /* No destination was given: the record is named, not a door. */
    expect(screen.queryByRole("button", { name: "Open PO-261001-9001" })).toBeNull();
  });

  it("a task about one Sales Order does not repeat its number as a fact", () => {
    mount(<TaskFrame head={{ ...HEAD, record: "SO-9101" }} steps={null} orders={[ORDERS[0]!]} />, false);
    expect(screen.queryByTestId("task-view-fact-sales-order")).toBeNull();
  });
});
