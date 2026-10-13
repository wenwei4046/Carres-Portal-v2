import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { WorkRow } from "../use-open-work";
import TaskList from "./TaskList";
import { taskStrip, taskTabs, type TaskTab } from "./task-cards";

/**
 * The Tasks panel list as it is drawn (owner 12 Oct 2026, 03 §8; round 3
 * brief, point 2). TEST data; 2026-10-05 is a Monday.
 */
const TODAY = "2026-10-05";
const ME = "00000000-0000-4000-8000-0000000000aa";
const row = (over: Partial<WorkRow> & { id: string }, source: Record<string, unknown> = {}): WorkRow => ({
  module: "purchasing", ruleKey: "purchasing.supplier_date_passed", dueIso: TODAY, timingBucket: "today",
  line: "Ask TEST Supplier A when the goods will arrive", problem: "Supplier delivery date passed", recipient: "TEST Supplier A",
  ownerId: ME, ownerState: "primary", normalOwner: null, ...over,
  source: { object: { kind: "purchase_order", id: "p1", label: "PO-261001-9001" }, timing: { missedAge: { state: "counted", workingDays: 0 } }, ...source },
} as unknown as WorkRow);
const MINE = [
  row({ id: "late", dueIso: "2026-09-29", timingBucket: "overdue" }, { timing: { missedAge: { state: "counted", workingDays: 4 } } }),
  row({ id: "now" }),
  row({ id: "tue", dueIso: "2026-10-06", timingBucket: "later", recipient: "TEST Supplier B", line: "Ask TEST Supplier B when the goods will arrive" }),
];
const DONE = [{
  occurrenceId: "purchasing:d1:purchasing.po_window", module: "purchasing" as const, ruleKey: "purchasing.po_window", actionOn: TODAY,
  objectLabel: "PO-261005-9010", completedAt: `${TODAY}T02:15:00.000Z`, completedBy: { userId: ME, name: "TEST · Staff A" }, resultReference: "PO-261005-9010",
}];

function draw(over: { chosen?: string; tab?: TaskTab; lastTaskId?: string | null } = {}) {
  const chosen = over.chosen ?? TODAY;
  const handlers = { onChoose: vi.fn(), onWeek: vi.fn(), onTab: vi.fn(), onOpen: vi.fn() };
  render(<TaskList strip={taskStrip(MINE, TODAY, chosen)} tabs={taskTabs(MINE, DONE, ME, TODAY, chosen)} chosen={chosen} today={TODAY}
    tab={over.tab ?? "todo"} lastTaskId={over.lastTaskId ?? null} {...handlers} />);
  return handlers;
}

describe("the day strip", () => {
  it("draws Monday to Friday, with To do under each day and today marked", () => {
    draw();
    const days = within(screen.getByRole("tablist", { name: "Days" })).getAllByRole("tab");
    expect(days.map((day) => day.getAttribute("aria-label"))).toEqual(["Mon 5 · 2", "Tue 6 · 1", "Wed 7", "Thu 8", "Fri 9"]);
    expect(days[0]).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("today-circle")).toHaveTextContent("5");
    /* Today holds late work: its number is amber. */
    expect(within(days[0]!).getByTestId("task-day-count")).toHaveClass("text-c-warn-fg");
    expect(within(days[1]!).getByTestId("task-day-count")).not.toHaveClass("text-c-warn-fg");
  });
  it("a day chooses that day; the arrows ask for the week before and after", () => {
    const handlers = draw();
    fireEvent.click(screen.getByTestId("task-day-2026-10-06"));
    expect(handlers.onChoose).toHaveBeenCalledWith("2026-10-06");
    fireEvent.click(screen.getByRole("button", { name: "Next week" }));
    expect(handlers.onWeek).toHaveBeenCalledWith("2026-10-12");
    fireEvent.click(screen.getByRole("button", { name: "Previous week" }));
    expect(handlers.onWeek).toHaveBeenCalledWith("2026-09-28");
  });
});

describe("To do · Waiting · Done", () => {
  it("are one segmented control, each with its number", () => {
    const handlers = draw();
    const tabs = within(screen.getByRole("tablist", { name: "Show" })).getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual(["To do 2", "Waiting 0", "Done 1"]);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    fireEvent.mouseDown(tabs[2]!, { button: 0 });
    expect(handlers.onTab).toHaveBeenCalledWith("done");
  });
  it("an empty tab says which kind of nothing it is", () => {
    draw({ tab: "waiting" });
    expect(screen.getByTestId("task-list-empty")).toHaveTextContent("Nothing is waiting for an answer");
  });
  it("a day with nothing says so", () => {
    draw({ chosen: "2026-10-07" });
    expect(screen.getByTestId("task-list-empty")).toHaveTextContent("Nothing planned for this day");
  });
});

describe("the cards", () => {
  it("sit under their party, with the party's count", () => {
    draw();
    const group = screen.getByTestId("task-group-TEST Supplier A");
    expect(within(group).getByRole("button", { expanded: true })).toHaveTextContent("TEST Supplier A");
    expect(within(group).getByTestId("task-group-count")).toHaveTextContent("2");
    expect(within(group).getAllByTestId("task-card-title").map((el) => el.textContent)).toEqual([
      "Ask TEST Supplier A when the goods will arrive", "Ask TEST Supplier A when the goods will arrive",
    ]);
    /* Tuesday's work is not under today. */
    expect(screen.queryByTestId("task-group-TEST Supplier B")).toBeNull();
  });
  it("a card is its title, then label on the left and value on the right; amber only on the late row", () => {
    draw();
    const late = screen.getByTestId("task-card-late");
    const rows = [...late.querySelectorAll("span.flex.items-baseline")].map((el) => [el.children[0]!.textContent, el.children[1]!.textContent, el.getAttribute("data-warn")]);
    expect(rows).toEqual([["PO No", "PO-261001-9001", null], ["Deadline", "Tue, 29 Sep · 4 days late", "true"]]);
    const onTime = screen.getByTestId("task-card-now");
    expect(onTime.querySelector("[data-warn]")).toBeNull();
    /* No tag and no button on a card: the card itself is the one control. */
    expect(late.tagName).toBe("BUTTON");
    expect(late.querySelector("button")).toBeNull();
  });
  it("the whole card opens the task", () => {
    const handlers = draw();
    fireEvent.click(screen.getByTestId("task-card-late"));
    expect(handlers.onOpen).toHaveBeenCalledTimes(1);
    expect(handlers.onOpen.mock.calls[0]![0]).toMatchObject({ id: "late" });
  });
  it("the task last opened stays marked", () => {
    draw({ lastTaskId: "now" });
    expect(screen.getByTestId("task-card-now")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("task-card-late")).toHaveAttribute("aria-pressed", "false");
  });
  it("a party folds and opens again", () => {
    draw();
    const head = within(screen.getByTestId("task-group-TEST Supplier A")).getByRole("button", { expanded: true });
    fireEvent.click(head);
    expect(screen.queryByTestId("task-card-late")).toBeNull();
    fireEvent.click(head);
    expect(screen.getByTestId("task-card-late")).toBeInTheDocument();
  });
  it("a finished task is a card in the same shape that opens nothing", () => {
    const handlers = draw({ tab: "done" });
    const card = screen.getByTestId("task-card-purchasing:d1:purchasing.po_window");
    expect(card.tagName).toBe("DIV");
    expect(card).toHaveTextContent("PO-261005-9010");
    fireEvent.click(card);
    expect(handlers.onOpen).not.toHaveBeenCalled();
  });
});
