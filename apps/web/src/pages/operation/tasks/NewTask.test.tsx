import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const api = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", async () => ({ ...await vi.importActual<typeof import("@/lib/api")>("@/lib/api"), apiFetch: api }));
vi.mock("@/components/kit/Toast", async () => ({ ...await vi.importActual<typeof import("@/components/kit/Toast")>("@/components/kit/Toast"), notifyTaskSaved: toast }));
const ME = "00000000-0000-4000-8000-0000000000aa";
const B = "00000000-0000-4000-8000-0000000000b2";
vi.mock("../use-open-work", () => ({
  useOpenWorkSet: () => ({
    staff: [{ user_id: ME, name: "TEST · Staff A", email: "a@carres.local" }, { user_id: B, name: "TEST · Staff B", email: "b@carres.local" }],
    myUserId: ME, generatedOn: "2026-10-14",
  }),
}));

import { ApiError } from "@/lib/api";
import NewTask from "./NewTask";

/**
 * `+ Task` and the `New task` dialog (Workspace MASTER "Employee-created
 * internal tasks", Jess 2026-10-14). Every person below is TEST data.
 */
function mount(wide = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  render(<QueryClientProvider client={client}><NewTask wide={wide} /></QueryClientProvider>);
  return { invalidate };
}
const sent = (): Array<Record<string, unknown>> => api.mock.calls.map(([path, init]) => ({ path: path as string, ...(JSON.parse((init as { body: string }).body) as Record<string, unknown>) }));
const open = () => fireEvent.click(screen.getByTestId("new-task-open"));
const name = () => screen.getByLabelText(/Task name/) as HTMLInputElement;

beforeEach(() => { api.mockReset(); toast.mockReset(); });

describe("the button", () => {
  it("is `Task` in the Tasks panel and `New task` on the Workspace toolbar, and both are named New task", () => {
    mount();
    expect(screen.getByTestId("new-task-open")).toHaveTextContent(/^Task$/);
    expect(screen.getByRole("button", { name: "New task" })).toBe(screen.getByTestId("new-task-open"));
    expect(screen.getByTestId("new-task-open")).toHaveAttribute("title", "Add a task for you or a colleague");
  });
  it("wide", () => {
    mount(true);
    expect(screen.getByTestId("new-task-open")).toHaveTextContent("New task");
  });
});

describe("New task", () => {
  it("asks for the name, a description, who it is for and the due date, and nothing else", () => {
    mount(); open();
    expect(screen.getByRole("dialog", { name: "New task" })).toBeInTheDocument();
    expect(name()).toHaveValue("");
    expect(screen.getByLabelText(/Description \(optional\)/)).toBeInTheDocument();
    /* `For` starts on the signed-in person, the due date on today. */
    expect(screen.getByText("For")).toBeInTheDocument();
    expect(screen.getAllByText("Me").length).toBeGreaterThan(0);
    expect(screen.getByText("Due date")).toBeInTheDocument();
    expect(screen.getByText("Wed, 14 Oct")).toBeInTheDocument();
    /* No link to a Sales Order or a PO, no time: it cannot touch another module. */
    expect(screen.queryByText(/Linked to/)).toBeNull();
    expect(screen.queryByText(/Time/)).toBeNull();
    expect(api).not.toHaveBeenCalled();
  });

  it("without a name it saves nothing and says so under the field", async () => {
    mount(); open();
    fireEvent.click(screen.getByTestId("new-task-add"));
    expect(await screen.findByText("Task name is required.")).toBeInTheDocument();
    expect(api).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "New task" })).toBeInTheDocument();
  });

  it("adds the task for the chosen person on the chosen day, closes, and says who it is for", async () => {
    api.mockResolvedValue({ id: "00000000-0000-4000-8000-0000000000c9" });
    const { invalidate } = mount(); open();
    fireEvent.change(name(), { target: { value: "  TEST · Get the new product photographs  " } });
    fireEvent.change(screen.getByLabelText(/Description \(optional\)/), { target: { value: "TEST data. Ask TEST Supplier A." } });
    fireEvent.click(screen.getByTestId("new-task-add"));
    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(sent()).toEqual([expect.objectContaining({
      path: "/api/operation/internal-tasks", title: "TEST · Get the new product photographs", detail: "TEST data. Ask TEST Supplier A.", assignedTo: ME, dueOn: "2026-10-14",
    })]);
    expect(String(sent()[0]!.idempotencyKey).length).toBeGreaterThanOrEqual(8);
    /* Nothing but these five facts leaves the dialog. */
    expect(Object.keys(sent()[0]!).sort()).toEqual(["assignedTo", "detail", "dueOn", "idempotencyKey", "path", "title"]);
    expect(toast).toHaveBeenCalledWith("Task added · for you", expect.objectContaining({ closeLabel: "Close message" }));
    expect(screen.queryByRole("dialog", { name: "New task" })).toBeNull();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["operation", "work"] });
  });

  it("an empty description is sent as none", async () => {
    api.mockResolvedValue({ id: "x" });
    mount(); open();
    fireEvent.change(name(), { target: { value: "TEST · Print the price tags" } });
    fireEvent.click(screen.getByTestId("new-task-add"));
    await waitFor(() => expect(api).toHaveBeenCalled());
    expect(sent()[0]!.detail).toBeNull();
  });

  it("a refusal is said under the field it is about, the dialog stays, and what was typed is kept", async () => {
    api.mockRejectedValue(new ApiError(422, "due date is not an Office working day", { code: "due_not_working_day" }));
    mount(); open();
    fireEvent.change(name(), { target: { value: "TEST · Print the price tags" } });
    fireEvent.click(screen.getByTestId("new-task-add"));
    expect(await screen.findByText("This is not an Office working day. Choose a working day.")).toBeInTheDocument();
    expect(name()).toHaveValue("TEST · Print the price tags");
    expect(toast).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "New task" })).toBeInTheDocument();
  });

  it("a lost answer is tried again as the SAME task; after a refusal the next press is a new one", async () => {
    api.mockRejectedValueOnce(new TypeError("Failed to fetch")).mockRejectedValueOnce(new ApiError(422, "x", { code: "due_in_past" })).mockResolvedValue({ id: "x" });
    mount(); open();
    fireEvent.change(name(), { target: { value: "TEST · Print the price tags" } });
    fireEvent.click(screen.getByTestId("new-task-add"));
    expect(await screen.findByText("Not added · Try again")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("new-task-add"));
    expect(await screen.findByText("This date has passed. Choose today or a later day.")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("new-task-add"));
    await waitFor(() => expect(toast).toHaveBeenCalled());
    const keys = sent().map((call) => call.idempotencyKey);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[2]).not.toBe(keys[1]);
  });

  it("Cancel closes it and saves nothing; opening it again starts empty", () => {
    mount(); open();
    fireEvent.change(name(), { target: { value: "TEST · Half typed" } });
    fireEvent.click(screen.getByTestId("new-task-cancel"));
    expect(screen.queryByRole("dialog", { name: "New task" })).toBeNull();
    expect(api).not.toHaveBeenCalled();
    open();
    expect(name()).toHaveValue("");
  });
});
