import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import WarehouseUnitDetail from "./WarehouseUnitDetail";

/**
 * THE UNIT — Object Detail in the Sales Order page's grammar (owner ruling
 * 2026-09-26): `← Inventory | {Unit ID} · {Item} | ⋮`, four blue-titled
 * blocks (Stock Details · Documents · Current work · History) and exactly
 * three fact-permitted acts behind `⋮`.
 */
vi.mock("@/lib/queries", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/queries")>()),
  useStockUnit: vi.fn(),
  useStockMovementEvidence: vi.fn(),
}));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(),
}));

import { useStockMovementEvidence, useStockUnit } from "@/lib/queries";
import { apiFetch } from "@/lib/api";

function renderAt(code: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/operation/stock/unit/${code}`]}>
        <Routes>
          <Route path="/operation/stock/unit/:unitCode" element={<WarehouseUnitDetail />} />
          <Route path="/operation" element={<div>Inventory destination</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function unit(over: Record<string, unknown> = {}) {
  return {
    id: "u1", unitCode: "U1-000-082", sku: "JAGER-SS", productName: "Jager · Super Single", category: "bedframe",
    availability: "available", status: "free", condition: "new", needsRepair: false, holdReason: null,
    siteName: "Carres Klang", holderName: null, ownership: "carres_owned", supplier: "Hookka Industries",
    poNo: "PO260924-4827", poDate: "2026-09-24", reservedRef: null, soldOrderId: null, soDate: null,
    qty: 1, dateIn: "2026-09-25", goodsReceivedDate: "2026-09-25", lifecycleOutcome: "active",
    ...over,
  };
}

function loaded(u = unit(), events: unknown[] = []) {
  vi.mocked(useStockUnit).mockReturnValue({ data: { unit: u, events }, isLoading: false, isError: false, error: null } as never);
}

function issues(list: unknown[]) {
  vi.mocked(apiFetch).mockImplementation((path: string) => {
    if (typeof path === "string" && path.endsWith("/issues")) return Promise.resolve({ issues: list });
    return Promise.resolve({});
  });
}

const notFoundIssue = {
  id: "issue-1", issueNo: "IS-0007", status: "open", observedProblem: "missing", observedOn: "2026-09-25",
  officialEnglish: "Unit U1-000-082 · Jager · Super Single · JAGER-SS was missing when Warehouse checked U1-000-082 on 25 Sept 2026. 1 photo were added by Shasha. This Unit cannot be sold until it is checked.",
  currentAction: { id: "act-1", trigger: "U1-000-082 was not found", ownerRule: "grn_duty", action: "Look for U1-000-082 at Carres Klang and scan it again", recipient: "Carres Klang", requiredResult: "U1-000-082 is scanned again or reported as not found", dueOn: "2026-09-28" },
};

beforeEach(() => {
  vi.mocked(useStockUnit).mockReset();
  vi.mocked(apiFetch).mockReset();
  vi.mocked(useStockMovementEvidence).mockReturnValue({ data: { evidence: [] }, isLoading: false, isError: false } as never);
  issues([]);
});

describe("the scan door never leaves the operator on a blank page", () => {
  it("says so plainly when the read settled with no Unit", () => {
    vi.mocked(useStockUnit).mockReturnValue({ data: undefined, isLoading: false, isError: false, error: null } as never);
    renderAt("id-nope000000");
    expect(screen.getByTestId("stock-unit-not-found")).toBeInTheDocument();
    expect(screen.getByText("No Unit carries that ID.")).toBeInTheDocument();
  });

  it("says so for a counted row's technical key, which is not addressable", () => {
    vi.mocked(useStockUnit).mockReturnValue({ data: undefined, isLoading: false, isError: false, error: null } as never);
    renderAt("QTY-000000001");
    expect(screen.getByText("No Unit carries that ID.")).toBeInTheDocument();
  });

  it("still shows the loading state rather than the empty answer", () => {
    vi.mocked(useStockUnit).mockReturnValue({ data: undefined, isLoading: true, isError: false, error: null } as never);
    renderAt("U1-000-082");
    expect(screen.queryByTestId("stock-unit-not-found")).toBeNull();
  });
});

describe("the header is the Sales Order page's — owner ruling 2026-09-26", () => {
  it("prints ← Inventory, the Unit ID as identity and the Item beside it", () => {
    loaded();
    renderAt("u1000082");
    expect(screen.getByRole("link", { name: "Inventory" })).toHaveAttribute("href", "/operation?tab=stock-onhand");
    expect(screen.getByTestId("object-identity")).toHaveTextContent("U1-000-082");
    expect(screen.getByTestId("object-identity-customer")).toHaveTextContent("Jager · Super Single");
  });

  it("returns a directly opened Unit to the real Inventory destination", () => {
    loaded();
    renderAt("U1-000-082");
    fireEvent.click(screen.getByRole("link", { name: "Inventory" }));
    expect(screen.getByText("Inventory destination")).toBeInTheDocument();
  });

  it("titles the four blocks with the owner's words and nothing retired", () => {
    loaded();
    renderAt("U1-000-082");
    for (const title of ["Stock Details", "Documents", "Current work", "History"]) {
      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    }
    for (const retired of [/Where it is now/, /Connected records/, /Who has it/, /Last verified/, /Last counted/]) {
      expect(screen.queryByText(retired)).toBeNull();
    }
    expect(screen.queryByRole("button", { name: /^(Edit|Delete)$/ })).toBeNull();
  });
});

describe("the ⋮ holds exactly the fact-permitted acts", () => {
  it("an Available Unit offers Report a problem only", async () => {
    loaded();
    renderAt("U1-000-082");
    await screen.findByTestId("unit-no-work");
    const menu = screen.getByTestId("unit-more-actions");
    expect(within(menu).getByTitle("More actions")).toBeInTheDocument();
    expect(within(menu).getByTestId("unit-report-problem")).toBeInTheDocument();
    expect(within(menu).queryByTestId("unit-make-available")).toBeNull();
    expect(within(menu).queryByTestId("unit-count-again")).toBeNull();
  });

  it("a Cannot sell Unit offers Make available for sale, and the dialog names the failing check", async () => {
    loaded(unit({ availability: "not_available", status: "on_hold", holdReason: "inspection", condition: "damaged" }));
    issues([{ ...notFoundIssue, observedProblem: "damaged", currentAction: { ...notFoundIssue.currentAction, action: "Check the damage on U1-000-082 and record the result" } }]);
    renderAt("U1-000-082");
    await screen.findByTestId("unit-current-work");
    fireEvent.click(screen.getByTestId("unit-make-available"));
    const checks = await screen.findByTestId("unit-make-available-checks");
    expect(within(checks).getByText("1 reported problem is still open", { exact: false })).toBeInTheDocument();
    expect(screen.getByTestId("unit-make-available-confirm")).toBeDisabled();
  });

  it("Count again appears only after a Not found report, and asks the Site to look again", async () => {
    loaded(unit({ availability: "not_available", status: "on_hold", holdReason: "inspection" }));
    issues([notFoundIssue]);
    renderAt("U1-000-082");
    await screen.findByTestId("unit-current-work");
    fireEvent.click(screen.getByTestId("unit-count-again"));
    await screen.findByTestId("unit-count-again-confirm");
    // Current work prints the standing action; the dialog repeats it as the next look.
    expect(screen.getAllByText(/Look for U1-000-082 at Carres Klang and scan it again/)).toHaveLength(2);
  });

  it("Current work prints the one shared action with its owner and due date", async () => {
    loaded();
    issues([notFoundIssue]);
    renderAt("U1-000-082");
    const work = await screen.findByTestId("unit-current-work");
    expect(within(work).getByText("Look for U1-000-082 at Carres Klang and scan it again")).toBeInTheDocument();
    expect(within(work).getByText(/GRN Duty/)).toBeInTheDocument();
    expect(within(work).getByRole("link", { name: "IS-0007" })).toHaveAttribute("href", "/operation/issues?issue=issue-1");
  });
});

describe("Report a problem — the observer chooses only what they saw", () => {
  it("explains the consequence before submit and cannot submit without a photo and a sentence", async () => {
    loaded();
    renderAt("U1-000-082");
    await screen.findByTestId("unit-no-work");
    fireEvent.click(screen.getByTestId("unit-report-problem"));
    const form = await screen.findByTestId("unit-problem-report");
    fireEvent.click(within(form).getByRole("button", { name: "Damaged" }));
    expect(screen.getByTestId("unit-problem-consequence")).toHaveTextContent(
      "After you submit, U1-000-082 reads Cannot sell · Waiting inspection until Carres Klang checks it and records the result.",
    );
    for (const never of [/Hold/, /Quarantine/, /Claim/, /write-off/i]) {
      expect(within(form).queryByRole("button", { name: never })).toBeNull();
    }
    fireEvent.change(screen.getByLabelText("What happened, in one sentence"), { target: { value: "Corner of the headboard is cracked" } });
    // No photo yet — the door stays shut.
    expect(screen.getByTestId("unit-problem-submit")).toBeDisabled();
  });

  it("a reserved Unit keeps its Sales Order and says so", async () => {
    loaded(unit({ availability: "reserved", status: "reserved", reservedRef: "SO2609-4827", soldOrderId: "order-1" }));
    renderAt("U1-000-082");
    await screen.findByTestId("unit-no-work");
    fireEvent.click(screen.getByTestId("unit-report-problem"));
    const form = await screen.findByTestId("unit-problem-report");
    fireEvent.click(within(form).getByRole("button", { name: "Not found" }));
    expect(screen.getByTestId("unit-problem-consequence")).toHaveTextContent(
      "U1-000-082 stays reserved for SO2609-4827. Sales sees this problem on the order until it is checked.",
    );
  });
});

describe("Documents say what they know", () => {
  it("an old reference names an order this portal never held", () => {
    loaded(unit({ availability: "reserved", status: "reserved", reservedRef: "TCF0516", soldOrderId: null }));
    renderAt("U1-000-082");
    expect(screen.getByText("TCF0516")).toBeInTheDocument();
    expect(screen.getByText("· not in this portal")).toBeInTheDocument();
    expect(screen.queryByText("No SO")).toBeNull();
  });

  it("prints No SO only when there is no reservation at all", () => {
    loaded();
    renderAt("U1-000-082");
    expect(screen.getAllByText("No SO")).toHaveLength(2);
  });
});

describe("physical receipt dates", () => {
  function currentUnit() {
    loaded(unit({ sku: "SOFA", productName: "Complete product name", dateIn: "1999-01-01", goodsReceivedDate: null, poDate: "2026-08-01" }));
  }
  it("does not print the legacy PO date as a physical receipt", () => {
    currentUnit(); renderAt("U1-000-082");
    expect(screen.queryByText(/1999/)).toBeNull();
    expect(screen.getByText("No physical receipt recorded. PO issue dates are not receipt dates.")).toBeInTheDocument();
    expect(screen.getByText("Complete product name")).toBeInTheDocument();
    // Held goods without a date: the fact was never captured — it WAS received.
    expect(screen.getByText("Not recorded")).toBeInTheDocument();
    expect(screen.queryByText("Not received")).toBeNull();
  });
  it("keeps the Unit visible when movement evidence fails and offers retry", async () => {
    currentUnit(); const retry = vi.fn();
    vi.mocked(useStockMovementEvidence).mockReturnValue({ isError: true, isLoading: false, refetch: retry } as never);
    renderAt("U1-000-082");
    expect(screen.getByText("Complete product name")).toBeInTheDocument();
    expect(screen.queryByText(/No physical receipt recorded/)).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: "Try again" })[0]!);
    await waitFor(() => expect(retry).toHaveBeenCalledOnce());
  });
});
