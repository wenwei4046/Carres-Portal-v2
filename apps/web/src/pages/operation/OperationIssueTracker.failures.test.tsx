import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import OperationIssueTracker from "./OperationIssueTracker";

/**
 * HF-2 · A save never fails silently (owner ruling 2026-09-17).
 * Every outcome maps to exactly one governed sentence, inside the open dialog,
 * with the values kept and focus on the sentence.
 */

const { ApiError, apiFetch } = vi.hoisted(() => ({
  ApiError: class ApiError extends Error {
    constructor(public status: number, message: string, public body: unknown) { super(message); this.name = "ApiError"; }
  },
  apiFetch: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ ApiError, apiFetch: (...args: unknown[]) => apiFetch(...args) }));

const ROW = {
  id: "i1", issue_no: "IS-2609-0001", observed_on: "2026-09-14", official_english: "Sofa was damaged.", status: "open",
  issue_actions: [{ id: "a1", status: "open", trigger: "Supplier has not answered", owner_rule: "issue_triage_duty", action: "Ask supplier for an answer", recipient: "Hookka", required_result: "Supplier answer recorded", due_on: "2026-09-18" }],
  issue_links: [{ object_label: "PO-2041" }], issue_fault_owners: [], issue_money_links: [] as Array<{ track: string; amount: number }>,
};

let saveOutcome: () => Promise<unknown>;
beforeEach(() => {
  apiFetch.mockReset();
  saveOutcome = () => Promise.resolve({ id: "new" });
  apiFetch.mockImplementation((_path: string, init?: RequestInit) => {
    if (init?.method === "POST") return saveOutcome();
    return Promise.resolve({ items: [ROW], total: 1 });
  });
});

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter><OperationIssueTracker /></MemoryRouter></QueryClientProvider>);
}
const posts = () => apiFetch.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === "POST");
const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const click = (name: string) => fireEvent.click(screen.getByRole("button", { name }));

function fillIntake(observedOn = "2026-09-16") {
  click("Record issue");
  click("Item"); click("Damaged");
  type("Who found it?", "Yu Jun"); type("When did you see it? YYYY-MM-DD", observedOn);
  type("Which item, delivery, document or staff work?", "Sofa"); type("Linked number, for example SO-1319", "SO-1319");
  click("Delivery"); click("Next");
  click("Photo");
  click("Send proof and ask"); type("Who must receive it?", "Hookka"); click("Acceptance or rejection"); type("When must it be ready? YYYY-MM-DD", "2026-09-18");
}
const recordIssue = () => within(screen.getByRole("dialog")).getByRole("button", { name: "Record issue" });

async function openResult() {
  mount();
  fireEvent.click(await screen.findByText("IS-2609-0001"));
  click("Record result");
  click("Accepted");
  type("Result evidence", "Supplier accepted by WhatsApp");
}
const recordResult = () => within(screen.getByRole("dialog")).getByRole("button", { name: "Record result" });

describe("Record issue — failure sentences", () => {
  it("a refused field shows its intake sentence on that step, values kept", async () => {
    saveOutcome = () => Promise.reject(new ApiError(400, "Invalid date", { path: "intake.observedOn" }));
    mount(); fillIntake("yesterday");
    fireEvent.click(recordIssue());
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Choose when the issue was found.");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText("When did you see it? YYYY-MM-DD")).toHaveValue("yesterday");
    expect(document.activeElement).toBe(alert);
  });

  it("a 422 without a field falls back to the first wrong step or the definite sentence", async () => {
    saveOutcome = () => Promise.reject(new ApiError(422, "a linked record is required", { code: "invalid_param" }));
    mount(); fillIntake();
    fireEvent.click(recordIssue());
    expect(await screen.findByRole("alert")).toHaveTextContent("Issue not recorded · Try again");
  });

  it("a server error says the Issue was not recorded", async () => {
    saveOutcome = () => Promise.reject(new ApiError(500, "boom", { code: "rpc_failed" }));
    mount(); fillIntake();
    fireEvent.click(recordIssue());
    expect(await screen.findByRole("alert")).toHaveTextContent("Issue not recorded · Try again");
    expect(screen.getByLabelText("Who must receive it?")).toHaveValue("Hookka");
  });

  it.each([
    ["network failure", () => Promise.reject(new TypeError("Failed to fetch"))],
    ["timeout", () => Promise.reject(new DOMException("The operation timed out.", "TimeoutError"))],
  ])("a %s is not confirmed, never 'not recorded'", async (_name, outcome) => {
    saveOutcome = outcome;
    mount(); fillIntake();
    fireEvent.click(recordIssue());
    expect(await screen.findByRole("alert")).toHaveTextContent("Not confirmed · Try again");
    expect(screen.queryByText(/not recorded/)).not.toBeInTheDocument();
  });

  it("a 403 without an acting person says access is missing", async () => {
    saveOutcome = () => Promise.reject(new ApiError(403, "forbidden", { code: "forbidden", actingPerson: null }));
    mount(); fillIntake();
    fireEvent.click(recordIssue());
    expect(await screen.findByRole("alert")).toHaveTextContent("You do not have access to record this result.");
  });

  it("the same form retried keeps its request id; a changed form gets a new one", async () => {
    saveOutcome = () => Promise.reject(new TypeError("Failed to fetch"));
    mount(); fillIntake();
    fireEvent.click(recordIssue()); await screen.findByRole("alert");
    fireEvent.click(recordIssue()); await waitFor(() => expect(posts()).toHaveLength(2));
    type("Who must receive it?", "Nice Future");
    fireEvent.click(recordIssue()); await waitFor(() => expect(posts()).toHaveLength(3));
    const ids = posts().map(([, init]) => JSON.parse(String((init as RequestInit).body)).requestId);
    expect(ids[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(ids[1]).toBe(ids[0]);
    expect(ids[2]).not.toBe(ids[0]);
  });

  it("a double click sends one request", async () => {
    let finish!: (v: unknown) => void;
    saveOutcome = () => new Promise((resolve) => { finish = resolve; });
    mount(); fillIntake();
    const button = recordIssue();
    fireEvent.click(button); fireEvent.click(button);
    await act(async () => {});
    expect(posts()).toHaveLength(1);
    await act(async () => { finish({ id: "new" }); });
  });

  it("cannot submit an incomplete last step", () => {
    mount(); fillIntake();
    type("Who must receive it?", "");
    expect(recordIssue()).toBeDisabled();
  });
});

describe("Record result — failure sentences", () => {
  it("a changed action says so and keeps the values", async () => {
    saveOutcome = () => Promise.reject(new ApiError(404, "current action not found", { code: "action_changed" }));
    await openResult();
    fireEvent.click(recordResult());
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Action changed · Review again");
    expect(screen.getByLabelText("Result evidence")).toHaveValue("Supplier accepted by WhatsApp");
    expect(document.activeElement).toBe(alert);
  });

  it("a server error says the result was not recorded", async () => {
    saveOutcome = () => Promise.reject(new ApiError(500, "boom", { code: "rpc_failed" }));
    await openResult();
    fireEvent.click(recordResult());
    expect(await screen.findByRole("alert")).toHaveTextContent("Result not recorded · Try again");
  });

  it.each([
    ["network failure", () => Promise.reject(new TypeError("Failed to fetch"))],
    ["timeout", () => Promise.reject(new DOMException("The operation timed out.", "TimeoutError"))],
  ])("a %s is not confirmed", async (_name, outcome) => {
    saveOutcome = outcome;
    await openResult();
    fireEvent.click(recordResult());
    expect(await screen.findByRole("alert")).toHaveTextContent("Not confirmed · Try again");
    expect(screen.queryByText(/not recorded/)).not.toBeInTheDocument();
  });

  it("a 403 names the acting person", async () => {
    saveOutcome = () => Promise.reject(new ApiError(403, "forbidden", { code: "forbidden", actingPerson: "Shasha" }));
    await openResult();
    fireEvent.click(recordResult());
    expect(await screen.findByRole("alert")).toHaveTextContent("Only Shasha can record this.");
  });

  it("a 403 without an acting person says access is missing", async () => {
    saveOutcome = () => Promise.reject(new ApiError(403, "forbidden", { code: "forbidden", actingPerson: null }));
    await openResult();
    fireEvent.click(recordResult());
    expect(await screen.findByRole("alert")).toHaveTextContent("You do not have access to record this result.");
  });

  it("a double click sends one request", async () => {
    let finish!: (v: unknown) => void;
    saveOutcome = () => new Promise((resolve) => { finish = resolve; });
    await openResult();
    const button = recordResult();
    fireEvent.click(button); fireEvent.click(button);
    await act(async () => {});
    expect(posts()).toHaveLength(1);
    await act(async () => { finish({}); });
  });
});

describe("Issue detail — no placeholder shown as fact", () => {
  it("renders no Money text without money rows and never `Set next action`", async () => {
    apiFetch.mockImplementation(() => Promise.resolve({ items: [{ ...ROW, issue_actions: [] }], total: 1 }));
    mount();
    fireEvent.click(await screen.findByText("IS-2609-0001"));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).queryByText("Money")).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/Cost incurred/)).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/Wednesday review/)).not.toBeInTheDocument();
    expect(screen.queryByText("Set next action")).not.toBeInTheDocument();
    expect(screen.getAllByText("No current action").length).toBeGreaterThan(0);
  });

  it("shows real money sums when money rows exist, and dates through fmtDate", async () => {
    apiFetch.mockImplementation(() => Promise.resolve({ items: [{ ...ROW, issue_money_links: [{ track: "incurred", amount: 1280 }, { track: "recoverable", amount: 500 }] }], total: 1 }));
    mount();
    expect(await screen.findByText("Mon, 14 Sep")).toBeInTheDocument();
    fireEvent.click(screen.getByText("IS-2609-0001"));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Money")).toBeInTheDocument();
    expect(within(dialog).getByText("RM 1,280.00")).toBeInTheDocument();
    expect(within(dialog).getByText("RM 500.00")).toBeInTheDocument();
    expect(within(dialog).getByText(/Fri, 18 Sep/)).toBeInTheDocument();
    expect(screen.queryByText("2026-09-14")).not.toBeInTheDocument();
  });
});
