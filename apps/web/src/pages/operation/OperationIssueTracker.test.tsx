import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import OperationIssueTracker from "./OperationIssueTracker";

const apiFetch = vi.fn();
vi.mock("@/lib/api", () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));

function mount(qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  return render(<QueryClientProvider client={qc}><MemoryRouter><OperationIssueTracker /></MemoryRouter></QueryClientProvider>);
}

beforeEach(() => { apiFetch.mockReset(); apiFetch.mockResolvedValue({ items: [{ id: "i1", issue_no: "IS-2608-0001", observed_on: "2026-08-14", official_english: "Unit CU-000128 was damaged.", status: "open", issue_actions: [{ id: "a1", status: "open", trigger: "Supplier has not answered", owner_rule: "issue_triage_duty", action: "Ask supplier for an answer", recipient: "Hookka", required_result: "Supplier answer recorded", due_on: "2026-09-07" }], issue_links: [{ object_label: "PO-2041" }], issue_fault_owners: [{ owner_name: "Hookka" }], issue_money_links: [] }], total: 1 }); });

afterEach(() => { document.title = "Carres Portal"; });

describe("Issue Tracker workspace", () => {
  it("shows the governed register and complete action columns", async () => {
    mount();
    expect(await screen.findByText("IS-2608-0001")).toBeInTheDocument();
    expect(screen.getByText("Fault Owners")).toBeInTheDocument();
    expect(screen.getByText("Current Action")).toBeInTheDocument();
    expect(screen.queryByText("Service Notes")).not.toBeInTheDocument();
  });

  it("starts with simple factual choices and no blank English story box", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mount(); fireEvent.click(screen.getByRole("button", { name: "Record issue" }));
    expect(screen.getByText("What has a problem?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Item" })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/what happened/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(consoleError.mock.calls.flat().join(" ")).not.toContain("cannot be given refs");
    consoleError.mockRestore();
  });

  it("shows the two-line Current Action without turning the owner into sentence prose", async () => {
    mount();
    expect(await screen.findByText("Supplier has not answered")).toBeInTheDocument();
    expect(screen.getByText("Ask supplier for an answer")).toBeInTheDocument();
    expect(screen.queryByText(/Issue Triage Duty · Ask supplier/)).not.toBeInTheDocument();
  });

  it("names the browser tab", () => {
    mount();
    expect(document.title).toBe("Issue Tracker · Carres");
  });

  it("a failed background refetch keeps the rows already on screen", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    mount(qc);
    expect(await screen.findByText("IS-2608-0001")).toBeInTheDocument();
    apiFetch.mockRejectedValue(new Error("offline"));
    await qc.invalidateQueries({ queryKey: ["issues"] });
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("Could not be loaded")).toBeNull();
    expect(screen.getByText("IS-2608-0001")).toBeInTheDocument();
  });

  it("a failed read says so, shows no count, and Try again reads again", async () => {
    apiFetch.mockReset();
    apiFetch.mockRejectedValueOnce(new Error("offline"));
    mount();
    expect(await screen.findByText("Could not be loaded")).toBeInTheDocument();
    expect(screen.queryByText("0 issues")).toBeNull();
    apiFetch.mockResolvedValueOnce({ items: [], total: 0 });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("0 issues")).toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledTimes(2);
  });

  it("opens the authoritative result door from the Issue action", async () => {
    mount();
    fireEvent.click(await screen.findByText("IS-2608-0001"));
    expect(screen.getByRole("button", { name: "Record result" })).toBeInTheDocument();
  });
});
