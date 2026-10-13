import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import TaskView, { ownerInitials } from "./TaskView";
import { TaskToast } from "./Toast";

/**
 * TaskView (02 "Task view"; owner's round 3 brief of 13 Oct 2026, point 2):
 * the one shape every opened task has. Every value below is TEST data.
 */
function mount(onOpenRecord = vi.fn()) {
  render(
    <TaskView
      title="Ask TEST Supplier A when the goods will arrive"
      moduleIcon="shopping_cart" page="Purchasing" record="PO-261001-9001"
      openRecordLabel="Open PO-261001-9001" onOpenRecord={onOpenRecord}
      owner="TEST · Staff A"
      tabsLabel="Task sections"
      facts={[
        { key: "deadline", icon: "event", label: "Deadline", value: "Wed, 7 Oct · 4 days late", warn: true },
        { key: "contact", icon: "forum", label: "Contact", value: "TEST Supplier A" },
        { key: "orders", icon: "receipt_long", label: "Sales Order", value: "2 Sales Orders", detail: <p>the two orders</p> },
      ]}
      tabs={[
        { key: "steps", label: "Steps", content: <input aria-label="Answer" /> },
        { key: "route", label: "Route", content: <p>the route</p> },
        { key: "files", label: "Files 3", content: <p>the files</p> },
      ]}
    />,
  );
  return onOpenRecord;
}

describe("TaskView", () => {
  it("says the task, then its page and record, with the owner's initials", () => {
    const open = mount();
    expect(screen.getByRole("article", { name: "Ask TEST Supplier A when the goods will arrive" })).toBeInTheDocument();
    expect(screen.getByTestId("task-view-title").tagName).toBe("H3");
    expect(screen.getByTestId("task-view-head")).toHaveTextContent("Purchasing/PO-261001-9001");
    fireEvent.click(screen.getByRole("button", { name: "Open PO-261001-9001" }));
    expect(open).toHaveBeenCalledTimes(1);
    /* `·` is not a word: `TEST · Staff A` is TS. */
    expect(screen.getByTestId("task-view-owner")).toHaveTextContent(/^TS$/);
    expect(screen.getByTestId("task-view-owner")).toHaveAccessibleName("TEST · Staff A");
  });

  it("draws one row per fact, amber only on the one that has gone by, and a fact's own detail under it", () => {
    mount();
    const facts = screen.getByTestId("task-view-facts");
    expect(within(facts).getAllByRole("term").map((term) => term.textContent)).toEqual(["Deadline", "Contact", "Sales Order"]);
    expect(screen.getByTestId("task-view-fact-deadline")).toHaveAttribute("data-warn", "true");
    expect(screen.getByTestId("task-view-fact-contact")).not.toHaveAttribute("data-warn");
    expect(screen.getByTestId("task-view-fact-detail-orders")).toHaveTextContent("the two orders");
  });

  it("opens on the first tab, keeps what was typed there, and draws another tab only when it is opened", () => {
    mount();
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Steps", "Route", "Files 3"]);
    expect(screen.getByRole("tab", { name: "Steps" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByText("the route")).toBeNull();
    fireEvent.change(screen.getByLabelText("Answer"), { target: { value: "20 Oct" } });
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Route" }));
    expect(screen.getByText("the route")).toBeVisible();
    expect(screen.getByTestId("task-view-panel-steps")).not.toBeVisible();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Steps" }));
    expect(screen.getByLabelText("Answer")).toHaveValue("20 Oct");
  });

  it("a task with no record or owner prints neither, and a record with no door is plain text", () => {
    render(<TaskView title="Send 2 POs to TEST Supplier A" moduleIcon="shopping_cart" page="SO Batch Purchase" record={null} owner={null}
      tabsLabel="Task sections" facts={[]} tabs={[{ key: "steps", label: "Steps", content: <p>work</p> }]} />);
    expect(screen.getByTestId("task-view-head")).toHaveTextContent(/^SO Batch Purchase$/);
    expect(screen.queryByTestId("task-view-owner")).toBeNull();
    expect(screen.queryByTestId("task-view-facts")).toBeNull();
    /* One tab is no choice: no tab bar. */
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.getByText("work")).toBeVisible();
  });

  it("initials come from the first two words", () => {
    expect(ownerInitials("Staff A")).toBe("SA");
    expect(ownerInitials("  test  ")).toBe("T");
    expect(ownerInitials("TEST · Staff A")).toBe("TS");
  });
});

describe("TaskToast, after a task closes (01 §3)", () => {
  it("says what was saved, offers the next task and closes; it never offers Undo", () => {
    const next = vi.fn(), close = vi.fn();
    render(<TaskToast message="Supplier answer recorded · PO-261001-9001" nextLabel="Next: TEST Supplier B" onNext={next} closeLabel="Close message" onClose={close} />);
    const toast = screen.getByRole("status");
    expect(toast).toHaveTextContent("Supplier answer recorded · PO-261001-9001");
    fireEvent.click(within(toast).getByRole("button", { name: "Next: TEST Supplier B" }));
    fireEvent.click(within(toast).getByRole("button", { name: "Close message" }));
    expect(next).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
    expect(within(toast).queryByRole("button", { name: /undo/i })).toBeNull();
  });
  it("carries no Next when no other task waits", () => {
    render(<TaskToast message="PO sent to supplier" closeLabel="Close message" onClose={() => {}} />);
    expect(screen.getAllByRole("button").map((button) => button.getAttribute("aria-label"))).toEqual(["Close message"]);
  });
});
