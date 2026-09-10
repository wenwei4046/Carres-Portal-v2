import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import OperationIssueTracker from "./OperationIssueTracker";

const apiFetch = vi.fn();
vi.mock("@/lib/api", () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter><OperationIssueTracker /></MemoryRouter></QueryClientProvider>);
}

beforeEach(() => { apiFetch.mockReset(); apiFetch.mockResolvedValue({ items: [{ id: "i1", issue_no: "IS-2608-0001", observed_on: "2026-08-14", official_english: "Unit CU-000128 was damaged.", status: "open", issue_actions: [{ id: "a1", status: "open", trigger: "Supplier has not answered", owner_rule: "issue_triage_duty", action: "Ask supplier for an answer", recipient: "Hookka", required_result: "Supplier answer recorded", due_on: "2026-09-07" }], issue_links: [{ object_label: "PO-2041" }], issue_fault_owners: [{ owner_name: "Hookka" }], issue_money_links: [] }], total: 1 }); });

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

  it("opens the authoritative result door from the Issue action", async () => {
    mount();
    fireEvent.click(await screen.findByText("IS-2608-0001"));
    expect(screen.getByRole("button", { name: "Record result" })).toBeInTheDocument();
  });
});
