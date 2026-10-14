import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { WorkRow } from "../use-open-work";
import type { WorkPanelHost } from "./tasks-host";

const api = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", async () => ({ ...await vi.importActual<typeof import("@/lib/api")>("@/lib/api"), apiFetch: api }));

import { ApiError } from "@/lib/api";
import InternalTaskPanel from "./InternalTaskPanel";
import { panelFor } from "./work-panels";

/**
 * An internal task, opened (Workspace MASTER "Employee-created internal
 * tasks", Jess 2026-10-14). Every person and task below is TEST data.
 */
const TASK = "00000000-0000-4000-8000-0000000000c1";
const person = (userId: string, name: string) => ({ userId, name });
const record = {
  id: TASK, title: "TEST · Get the new product photographs", detail: "TEST data. Ask TEST Supplier A for the photographs.", dueOn: "2026-10-14", createdAt: "2026-10-14T01:20:00.000Z",
  createdBy: person("00000000-0000-4000-8000-0000000000b2", "TEST · Staff B"), assignedTo: person("00000000-0000-4000-8000-0000000000aa", "TEST · Staff A"),
  doneAt: null, doneBy: null, events: [{ event: "added", at: "2026-10-14T01:20:00.000Z", actor: person("00000000-0000-4000-8000-0000000000b2", "TEST · Staff B") }],
};
const item = {
  id: `workspace:${TASK}:internal_task`, module: "workspace", ruleKey: "internal_task", line: "Do this task", problem: "Added by TEST · Staff B", recipient: null, destination: "/operation?tab=work",
  source: { module: "workspace", ruleKey: "internal_task", object: { kind: "internal_task", id: TASK, label: "TEST · Get the new product photographs" } },
} as unknown as WorkRow;

function mount(simulated = false, viaRegistry = false) {
  const host: WorkPanelHost = { close: vi.fn(), back: vi.fn(), result: vi.fn(), openReview: vi.fn(), simulated };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<MemoryRouter><QueryClientProvider client={client}>{viaRegistry ? panelFor(item, host) : <InternalTaskPanel item={item} host={host} />}</QueryClientProvider></MemoryRouter>);
  return host;
}
const paths = () => api.mock.calls.map(([path, init]) => `${(init as { method?: string } | undefined)?.method ?? "GET"} ${path as string}`);

beforeEach(() => {
  api.mockReset();
  api.mockImplementation(async (path: string, init?: { method?: string }) => (init?.method === "POST" ? { id: TASK, completionRecorded: true } : record));
});

describe("an internal task, opened", () => {
  it("is the panel the task registry gives its kind", async () => {
    mount(false, true);
    expect(await screen.findByTestId("task-panel-internal")).toBeInTheDocument();
  });

  it("shows what its creator wrote and one act, Mark done; no Route, no Files, no door to another module", async () => {
    mount();
    expect(await screen.findByTestId("task-internal-detail")).toHaveTextContent("TEST data. Ask TEST Supplier A for the photographs.");
    expect(screen.getByRole("button", { name: "Mark done" })).toBeInTheDocument();
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Steps", "History"]);
    expect(screen.queryByRole("button", { name: /^Open / })).toBeNull();
    expect(screen.queryByTestId("task-request")).toBeNull();
  });

  it("History says who added it for whom", async () => {
    mount();
    await screen.findByTestId("task-internal-detail");
    fireEvent.mouseDown(screen.getByRole("tab", { name: "History" }));
    fireEvent.click(screen.getByRole("tab", { name: "History" }));
    expect(await screen.findByText("Added by TEST · Staff B · for TEST · Staff A")).toBeInTheDocument();
  });

  it("Mark done writes this task's own door only, then tells the desk in the task's name", async () => {
    const host = mount();
    await screen.findByTestId("task-internal-detail");
    fireEvent.click(screen.getByTestId("task-internal-done"));
    await waitFor(() => expect(host.result).toHaveBeenCalledWith("Done · TEST · Get the new product photographs"));
    /* One write, to this task's own door; every call it makes is about this task. */
    expect(paths().filter((path) => path.startsWith("POST"))).toEqual([`POST /api/operation/internal-tasks/${TASK}/done`]);
    expect(paths().every((path) => path.includes(`/api/operation/internal-tasks/${TASK}`))).toBe(true);
  });

  it("a refusal keeps the task open and says the door's sentence; a lost answer says to try again", async () => {
    const host = mount();
    await screen.findByTestId("task-internal-detail");
    api.mockRejectedValueOnce(new ApiError(422, "task not found", { code: "task_not_found" }));
    fireEvent.click(screen.getByTestId("task-internal-done"));
    expect(await screen.findByText("task not found")).toBeInTheDocument();
    api.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    fireEvent.click(screen.getByTestId("task-internal-done"));
    expect(await screen.findByText("Not saved · Try again")).toBeInTheDocument();
    expect(host.result).not.toHaveBeenCalled();
  });

  it("the local walk writes nothing", async () => {
    const host = mount(true);
    await screen.findByTestId("task-internal-detail");
    fireEvent.click(screen.getByTestId("task-internal-done"));
    await waitFor(() => expect(host.result).toHaveBeenCalled());
    expect(paths().some((path) => path.startsWith("POST"))).toBe(false);
  });
});
