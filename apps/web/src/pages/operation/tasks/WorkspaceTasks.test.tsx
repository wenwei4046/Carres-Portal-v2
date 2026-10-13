import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import type { OperationWorkCompleted } from "@carres/shared";
import type { WorkRow } from "../use-open-work";

/**
 * The Workspace page (owner's round 3 brief of 13 Oct 2026, points 3 and 4):
 * every task as one table, one task beside its list, one record with the
 * Tasks panel. Every party and number below is TEST data. 2026-10-05 is a Monday.
 */
const TODAY = "2026-10-05";
const ME = "00000000-0000-4000-8000-0000000000aa";
const OTHER = "00000000-0000-4000-8000-0000000000bb";
const feed = vi.hoisted(() => ({ items: [] as unknown[], completed: [] as unknown[], hasData: true }));
vi.mock("../use-open-work", () => ({
  useOpenWorkSet: () => ({
    items: feed.items, completed: feed.completed, myUserId: "00000000-0000-4000-8000-0000000000aa", hasData: feed.hasData, error: null, refreshFailed: false,
    lastUpdatedAt: null, unhealthySources: [], generatedOn: "2026-10-05", retry: () => {},
  }),
}));
vi.mock("./use-po-window-facts", () => ({ usePoWindowFacts: () => new Map() }));
/* The module's own panel is its own test; here it only proves WHICH task the
   page opens and that it is handed the shared desk's host. */
vi.mock("./work-panels", () => ({
  panelFor: (item: WorkRow, host: { result: (text: string) => void }) => (
    <div data-testid="panel">panel {item.id}<button type="button" onClick={() => host.result("Saved by the module")}>save</button></div>
  ),
}));
vi.mock("../work/WorkCommunication", () => ({ default: ({ orderId, supplierName, party }: { orderId: string | null; supplierName: string | null; party: string }) =>
  <div data-testid="communication">{orderId ?? supplierName} · {party}</div> }));
const notify = vi.hoisted(() => vi.fn());
vi.mock("@/components/kit/Toast", async () => ({ ...await vi.importActual<typeof import("@/components/kit/Toast")>("@/components/kit/Toast"), notifyTaskSaved: notify }));

import { useShellTasks } from "../components/ShellTasks";
import WorkspaceTasks from "./WorkspaceTasks";

const waiting = { state: "waiting", waitingSince: "2026-10-02T03:00:00.000Z", replyDueOn: "2026-10-06", replyMissed: false, channel: "whatsapp", contactKind: "supplier", contactId: null, lastReplyAt: null };
const row = (over: Partial<WorkRow> & { id: string }, source: Record<string, unknown> = {}): WorkRow => ({
  module: "purchasing", ruleKey: "purchasing.supplier_date_passed", dueIso: TODAY, timingBucket: "today",
  line: "Ask TEST Supplier A when the goods will arrive", problem: "Supplier delivery date passed", recipient: "TEST Supplier A",
  ownerId: ME, ownerState: "primary", normalOwner: null, destination: "/operation/procurement?po=PO-261001-9001",
  ...over,
  source: {
    object: { kind: "purchase_order", id: "PO-261001-9001", label: "PO-261001-9001" },
    timing: { missedAge: { state: "counted", workingDays: 0 } },
    owner: { acting: { userId: over.ownerId ?? ME, name: (over.ownerId ?? ME) === ME ? "TEST · Staff A" : "TEST · Staff B" } },
    ...source,
  },
} as unknown as WorkRow);
const done = (over: Partial<OperationWorkCompleted> & { occurrenceId: string }): OperationWorkCompleted => ({
  module: "purchasing", ruleKey: "purchasing.po_window", actionOn: TODAY, objectLabel: "PO-261005-9010",
  completedAt: `${TODAY}T02:15:00.000Z`, completedBy: { userId: ME, name: "TEST · Staff A" }, resultReference: "PO-261005-9010", ...over,
});
const LATE = row({ id: "late", dueIso: "2026-09-29", timingBucket: "overdue" }, { timing: { missedAge: { state: "counted", workingDays: 4 } } });
const NOW = row({ id: "now" });
const CALL = row({ id: "call", module: "orders", ruleKey: "ask_delivery_date", recipient: "TEST customer D", line: "Call TEST customer D", dueIso: null, timingBucket: "no_date" },
  { object: { kind: "sales_order", id: "o-9106", label: "SO-9106" } });
const WAIT = row({ id: "wait", recipient: "TEST Supplier B" }, { lifecycle: waiting });
const THEIRS = row({ id: "theirs", ownerId: OTHER, module: "delivery", ruleKey: "assign_logistics", line: "Call TEST Logistics A", recipient: "TEST Logistics A" },
  { object: { kind: "delivery_scope", id: "o-9104", label: "SO-9104" } });

function Where() { const l = useLocation(); return <p data-testid="where">{l.search}</p>; }
function mount(at = "/operation?tab=work") {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[at]}><Routes><Route path="*" element={<><WorkspaceTasks /><Where /></>} /></Routes></MemoryRouter>
    </QueryClientProvider>,
  );
}
const rows = () => screen.queryAllByTestId(/^workspace-row-/).map((tr) => tr.getAttribute("data-testid")!.replace("workspace-row-", ""));
const moduleCount = (key: string) => within(screen.getByTestId(`workspace-module-${key}`)).getByTestId("workspace-module-count").textContent;
const tabWords = () => within(screen.getAllByTestId("workspace-toolbar")[0]!).getAllByRole("tab").map((tab) => tab.textContent);

beforeEach(() => {
  feed.items = [LATE, NOW, CALL, WAIT, THEIRS];
  feed.completed = [done({ occurrenceId: "d1" }), done({ occurrenceId: "d2", module: "delivery", completedBy: { userId: OTHER, name: "TEST · Staff B" } })];
  feed.hasData = true;
  notify.mockClear();
});

describe("Workspace: the table", () => {
  it("opens on My Task and To do: late first, with the Tasks panel's own three numbers and one number per module", () => {
    mount();
    expect(tabWords()).toEqual(["My Task", "Team Work", "To do 3", "Waiting 1", "Done 1"]);
    expect(rows()).toEqual(["late", "now", "call"]);
    expect(screen.getAllByRole("columnheader").map((th) => th.textContent).filter(Boolean)).toEqual(["Due", "Task", "Contact", "Last contact", "Status"]);
    expect(screen.getByTestId("workspace-task-late")).toHaveTextContent("Ask TEST Supplier A when the goods will arrivePurchasing · PO-261001-9001");
    expect(screen.getByTestId("workspace-status-late")).toHaveTextContent("4 days late");
    expect(screen.getByTestId("workspace-due-now")).toHaveTextContent("Mon, 5 Oct");
    expect(screen.getByTestId("workspace-last-now")).toHaveTextContent("Not recorded");
    /* The Module rail counts the chosen tab and sums to it. */
    expect(moduleCount("all")).toBe("3");
    expect([moduleCount("purchasing"), moduleCount("orders"), moduleCount("delivery")]).toEqual(["2", "1", "0"]);
    expect(screen.getByTestId("workspace-footer")).toHaveTextContent("3 tasks");
  });

  it("a tab is in the address; the rail then counts that tab", () => {
    mount();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Waiting 1" }));
    expect(screen.getByTestId("where")).toHaveTextContent("status=waiting");
    expect(rows()).toEqual(["wait"]);
    expect(screen.getByTestId("workspace-last-wait")).toHaveTextContent("Asked Fri, 2 Oct");
    expect([moduleCount("all"), moduleCount("purchasing"), moduleCount("orders")]).toEqual(["1", "1", "0"]);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Done 1" }));
    expect(rows()).toEqual(["d1"]);
    expect(screen.getByTestId("workspace-status-d1")).toHaveTextContent("Done");
    /* On Done the first column is when the work was finished, and says so. */
    expect(screen.getAllByRole("columnheader").map((th) => th.textContent).filter(Boolean)[0]).toBe("Done");
  });

  it("a module narrows the rows and changes no number", () => {
    mount();
    fireEvent.click(screen.getByTestId("workspace-module-orders"));
    expect(screen.getByTestId("where")).toHaveTextContent("module=orders");
    expect(rows()).toEqual(["call"]);
    expect(tabWords().slice(2)).toEqual(["To do 3", "Waiting 1", "Done 1"]);
    expect(moduleCount("all")).toBe("3");
    expect(screen.getByTestId("workspace-module-orders")).toHaveAttribute("aria-pressed", "true");
  });

  it("Team Work lists everyone's work and says whose each is", () => {
    mount("/operation?tab=work&scope=team");
    expect(rows()).toEqual(["late", "now", "theirs", "call"]);
    expect(screen.getAllByRole("columnheader").map((th) => th.textContent).filter(Boolean)).toContain("Assigned to");
    expect(screen.getByTestId("workspace-owner-theirs")).toHaveTextContent("TEST · Staff B");
    expect(tabWords().slice(2)).toEqual(["To do 4", "Waiting 1", "Done 2"]);
  });

  it("loading prints no number, and an empty tab says so", () => {
    feed.items = []; feed.completed = [];
    mount();
    expect(screen.getByText("Nothing to do today")).toBeInTheDocument();
    expect(moduleCount("all")).toBe("0");
  });
});

describe("Workspace: one task beside its list", () => {
  it("a row opens the task through the shared desk, puts it in the address, and ✕ returns to the table", () => {
    mount();
    fireEvent.click(screen.getByTestId("workspace-row-now"));
    expect(screen.getByTestId("panel")).toHaveTextContent("panel now");
    expect(screen.getByTestId("where")).toHaveTextContent("task=now");
    expect(screen.queryByTestId("workspace-table")).toBeNull();
    /* The same rows as a pick list, the chosen one marked. */
    expect(within(screen.getByTestId("workspace-pick-list")).getAllByRole("button").map((b) => b.getAttribute("data-testid"))).toEqual(["workspace-pick-late", "workspace-pick-now", "workspace-pick-call"]);
    expect(screen.getByTestId("workspace-pick-now")).toHaveAttribute("aria-current", "true");
    fireEvent.click(screen.getByTestId("workspace-pick-call"));
    expect(screen.getByTestId("panel")).toHaveTextContent("panel call");
    fireEvent.click(screen.getByRole("button", { name: "Back to all tasks" }));
    expect(screen.queryByTestId("panel")).toBeNull();
    expect(screen.getByTestId("workspace-table")).toBeInTheDocument();
    expect(screen.getByTestId("where")).not.toHaveTextContent("task=");
  });

  it("a link with a task in it opens that task", () => {
    mount("/operation?tab=work&task=call");
    expect(screen.getByTestId("panel")).toHaveTextContent("panel call");
  });

  it("the module's own success words go to the dark toast, with the next task of the same kind", () => {
    mount();
    fireEvent.click(screen.getByTestId("workspace-row-late"));
    fireEvent.click(screen.getByRole("button", { name: "save" }));
    expect(notify).toHaveBeenCalledWith("Saved by the module", expect.objectContaining({ next: expect.objectContaining({ label: "Next: TEST Supplier A" }) }));
  });

  it("the governed messages are beside the task: the order's for an order task, the supplier's for a PO task", () => {
    mount("/operation?tab=work&task=call");
    expect(screen.getByTestId("communication")).toHaveTextContent("o-9106 · customer");
    fireEvent.click(screen.getByTestId("workspace-pick-now"));
    expect(screen.getByTestId("communication")).toHaveTextContent("TEST Supplier A · supplier");
  });
});

describe("Workspace and the shell", () => {
  it("the shell's Tasks panel steps aside while this page is shown", () => {
    const view = mount();
    expect(useShellTasks.getState().pageHosts).toBe(1);
    view.unmount();
    expect(useShellTasks.getState().pageHosts).toBe(0);
  });
});
