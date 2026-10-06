import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { OperationWorkItem } from "@carres/shared";

const apiFetch = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));

const { default: WorkIssueCard } = await import("./WorkIssueCard");

const item = {
  id: "issue_tracker:issue-5:current_action",
  object: { kind: "issue", id: "issue-5", label: "IS-2609-0005" },
  problem: "U1-000-282 was reported damaged",
  action: "Check the damage on U1-000-282 and record the result",
  timing: { placement: "missed" },
} as unknown as OperationWorkItem;

const issue = {
  id: "issue-5", issue_no: "IS-2609-0005", observed_on: "2026-09-26", status: "open",
  official_english: "Unit U1-000-282 was damaged when Warehouse checked it.",
  issue_actions: [{ id: "act-1", status: "open", trigger: "U1-000-282 was reported damaged", owner_rule: "issue_triage_duty", action: "Check the damage", recipient: "Carres Klang", required_result: "The inspection result is recorded", due_on: "2026-09-28" }],
  issue_links: [], issue_fault_owners: [], issue_money_links: [],
};

function mount() {
  const assign = vi.fn();
  Object.defineProperty(window, "location", { value: { ...window.location, assign }, writable: true });
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><WorkIssueCard item={item} /></QueryClientProvider>);
  return { assign };
}

describe("WorkIssueCard — an Issue Tracker act is finished in Workspace (§5.10; Jess 2026-09-28 'why jump to others page?')", () => {
  beforeEach(() => {
    apiFetch.mockReset();
    apiFetch.mockImplementation(async (path: string) => (path === "/api/ops/issues/issue-5" ? issue : {}));
  });

  it("titles the card with the act, red why when missed, and opens the Issue Tracker's own form IN PLACE", async () => {
    const { assign } = mount();
    expect(screen.getByRole("heading", { name: item.action })).toBeInTheDocument();
    expect(screen.getByText("U1-000-282 was reported damaged").className).toContain("text-kit-red-11");
    fireEvent.click(screen.getByTestId(`work-act-${item.id}`));
    expect(await screen.findByText("What was the result?")).toBeInTheDocument();
    expect(screen.getByText(issue.official_english)).toBeInTheDocument();
    expect(assign).not.toHaveBeenCalled();
  });

  it("saves through the Issue Tracker's one result door and closes the form", async () => {
    mount();
    fireEvent.click(screen.getByTestId(`work-act-${item.id}`));
    fireEvent.click(await screen.findByRole("button", { name: "Repair confirmed" }));
    fireEvent.change(screen.getByLabelText("Result evidence"), { target: { value: "Photo of the repaired leg" } });
    fireEvent.click(screen.getByRole("button", { name: "Record result" }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith(
      "/api/ops/issues/issue-5/actions/act-1/result",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ resultCode: "repair_confirmed", result: "Photo of the repaired leg" }) }),
    ));
    await waitFor(() => expect(screen.queryByText("What was the result?")).toBeNull());
  });
});
