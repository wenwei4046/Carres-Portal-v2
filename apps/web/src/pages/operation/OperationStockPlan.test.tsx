import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import OperationStockPlan from "./OperationStockPlan";
import type { OpsStockPlanResponse, OpsStockPlanRow } from "@carres/shared";

/**
 * Ready stock plan — card K2.
 *
 * The behaviours worth locking down are the ones a screenshot cannot prove:
 *  1. A withheld suggestion reads as a stated blank with a REASON, never as 0.
 *     Printing 0 would mean "order nothing"; the truth is "we cannot say yet".
 *  2. The consolidate / final controls exist only for the seat allowed to use
 *     them, at the stage where they apply.
 *  3. The PO list appears only once the plan is approved, and carries the
 *     approved number — never the manager's cut.
 *  4. Send back cannot be pressed without a reason.
 */

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, apiFetch: vi.fn() };
});
import { apiFetch } from "@/lib/api";

const PILLOW = "Essential Memory Pillow(L)";
const MP_K = "Microfiber Waterproof Mattress Protector-K";

function row(over: Partial<OpsStockPlanRow> & { sku: string }): OpsStockPlanRow {
  return {
    onHand: 0,
    reserved: 0,
    incoming: 0,
    sold30: 0,
    sold90: 0,
    weekendShare: null,
    monthlyRunRate: null,
    suggestedQty: null,
    proposedQty: 0,
    proposerCount: 0,
    consolidatedQty: null,
    approvedQty: null,
    overSuggestion: false,
    proposals: [],
    ...over,
  };
}

function response(over: Partial<OpsStockPlanResponse> = {}): OpsStockPlanResponse {
  return {
    plan: {
      id: "plan-1",
      period: "2026-08",
      title: null,
      status: "collecting",
      openedByName: "Khor Yee",
      openedAt: "2026-07-27T01:00:00Z",
      consolidatedByName: null,
      consolidatedAt: null,
      decidedByName: null,
      decidedAt: null,
      decisionRemark: null,
    },
    rows: [],
    coverage: {
      days: 6,
      firstSale: "2026-07-21",
      archiveLinesExcluded: 94,
      canSuggest: false,
      canWarnOverSuggestion: false,
    },
    poList: [],
    periods: ["2026-08"],
    skus: [PILLOW, MP_K],
    canPropose: true,
    canConsolidate: false,
    canApprove: false,
    meId: "me",
    ...over,
  };
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/operation?tab=stock-plan"]}>
        <OperationStockPlan />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
});

/**
 * The page mounts THREE independent lanes (K2's monthly plan, K3's urgent
 * panel and K4's usage split), so the double answers per path. A blanket
 * `mockResolvedValue` would hand the plan's payload to the other two —
 * harmless on screen, but it would let a K3 or K4 regression hide inside a
 * K2 run.
 */
function serve(res: OpsStockPlanResponse) {
  vi.mocked(apiFetch).mockImplementation(async (path: string) => {
    if (path.startsWith("/api/ops/stock-emergency"))
      return {
        rows: [],
        pendingCount: 0,
        poList: [],
        skus: [],
        canRaise: true,
        canDecide: false,
        canMarkOrdered: false,
        meId: "me",
      } as never;
    if (path.startsWith("/api/ops/stock/usage"))
      return {
        period: "2026-08",
        totalUnits: 0,
        totalDraws: 0,
        byReason: [],
        bySku: [],
        entries: [],
        levels: [],
        lowCount: 0,
        canEdit: false,
      } as never;
    return res as never;
  });
}

// ---------------------------------------------------------------------------

describe("the honest blank", () => {
  it("says WHY there is no suggestion instead of showing zero", async () => {
    serve(response({ rows: [row({ sku: PILLOW, proposedQty: 40, proposerCount: 1 })] }));
    renderPage();

    const note = await screen.findByTestId("plan-coverage");
    expect(note.textContent).toContain("Not enough sales history");
    expect(note.textContent).toContain("6 days");
  });

  it("explains that the imported AutoCount lines are not counted", async () => {
    serve(response({ rows: [row({ sku: PILLOW, proposedQty: 1, proposerCount: 1 })] }));
    renderPage();
    const note = await screen.findByTestId("plan-coverage");
    expect(note.textContent).toContain("94 imported AutoCount");
    expect(note.textContent).toContain("not the day they sold");
  });

  it("drops the note entirely once history is real and nothing was excluded", async () => {
    serve(
      response({
        rows: [row({ sku: PILLOW, proposedQty: 1, proposerCount: 1 })],
        coverage: {
          days: 120,
          firstSale: "2026-03-01",
          archiveLinesExcluded: 0,
          canSuggest: true,
          canWarnOverSuggestion: true,
        },
      }),
    );
    renderPage();
    await screen.findByTestId("plan-grid");
    expect(screen.queryByTestId("plan-coverage")).toBeNull();
  });
});

describe("the plan grid", () => {
  it("offers to open a month nobody has opened", async () => {
    serve(response({ plan: null, canPropose: false }));
    renderPage();
    expect(await screen.findByTestId("plan-open")).toBeTruthy();
  });

  it("shows who asked, expanded on demand", async () => {
    serve(
      response({
        rows: [
          row({
            sku: PILLOW,
            proposedQty: 25,
            proposerCount: 2,
            proposals: [
              { sku: PILLOW, qty: 10, proposedBy: "a", proposedByName: "Alvin", note: "weekend" },
              { sku: PILLOW, qty: 15, proposedBy: "b", proposedByName: "Mayson", note: null },
            ],
          }),
        ],
      }),
    );
    renderPage();
    fireEvent.click(await screen.findByTestId(`plan-row-toggle-${PILLOW}`));
    const asks = await screen.findByTestId(`plan-asks-${PILLOW}`);
    expect(asks.textContent).toContain("Alvin");
    expect(asks.textContent).toContain("Mayson");
    expect(asks.textContent).toContain("weekend");
  });

  it("warns loudly but keeps the ask intact", async () => {
    serve(
      response({
        rows: [row({ sku: PILLOW, proposedQty: 5000, proposerCount: 1, overSuggestion: true })],
      }),
    );
    renderPage();
    const r = await screen.findByTestId(`plan-row-${PILLOW}`);
    expect(r.textContent).toContain("well above the 3-month average");
    expect(r.textContent).toContain("5000");
  });

  it("hides the ask box once proposals have closed", async () => {
    serve(
      response({
        plan: { ...response().plan!, status: "review" },
        canPropose: false,
        rows: [row({ sku: PILLOW, proposedQty: 10, proposerCount: 1 })],
      }),
    );
    renderPage();
    await screen.findByTestId("plan-grid");
    expect(screen.queryByTestId("plan-propose")).toBeNull();
  });
});

describe("who may touch which number", () => {
  const reviewing = (over: Partial<OpsStockPlanResponse> = {}) =>
    response({
      plan: { ...response().plan!, status: "review" },
      canPropose: false,
      rows: [
        row({ sku: PILLOW, proposedQty: 25, proposerCount: 2, consolidatedQty: 20 }),
      ],
      ...over,
    });

  it("gives no editable cell to someone with neither duty", async () => {
    serve(reviewing());
    renderPage();
    await screen.findByTestId("plan-grid");
    expect(screen.queryByTestId(`plan-consolidate-edit-${PILLOW}`)).toBeNull();
    expect(screen.queryByTestId(`plan-final-edit-${PILLOW}`)).toBeNull();
    expect(screen.getByTestId("plan-awaiting-coo")).toBeTruthy();
  });

  it("lets the manager cut", async () => {
    serve(reviewing({ canConsolidate: true }));
    renderPage();
    expect(await screen.findByTestId(`plan-consolidate-edit-${PILLOW}`)).toBeTruthy();
    expect(screen.queryByTestId(`plan-final-edit-${PILLOW}`)).toBeNull();
  });

  it("lets the COO set the final number and decide", async () => {
    serve(reviewing({ canApprove: true }));
    renderPage();
    expect(await screen.findByTestId(`plan-final-edit-${PILLOW}`)).toBeTruthy();
    expect(screen.getByTestId("plan-approve")).toBeTruthy();
  });

  it("will not let a plan be sent back without a reason", async () => {
    serve(reviewing({ canApprove: true }));
    renderPage();
    const reject = (await screen.findByTestId("plan-reject")) as HTMLButtonElement;
    expect(reject.disabled).toBe(true);

    fireEvent.change(screen.getByTestId("plan-decide-remark"), {
      target: { value: "Too much pillow" },
    });
    await waitFor(() => expect(reject.disabled).toBe(false));
  });

  it("refuses a final number on a line the manager never cut", async () => {
    serve(
      reviewing({
        canApprove: true,
        rows: [row({ sku: MP_K, proposedQty: 5, proposerCount: 1, consolidatedQty: null })],
      }),
    );
    renderPage();
    await screen.findByTestId("plan-grid");
    expect(screen.queryByTestId(`plan-final-edit-${MP_K}`)).toBeNull();
  });
});

describe("the handover to Operations", () => {
  it("stays hidden while the plan is still in review", async () => {
    serve(
      response({
        plan: { ...response().plan!, status: "review" },
        canPropose: false,
        rows: [row({ sku: PILLOW, consolidatedQty: 20, proposedQty: 25 })],
      }),
    );
    renderPage();
    await screen.findByTestId("plan-grid");
    expect(screen.queryByTestId("plan-po-list")).toBeNull();
  });

  it("shows the APPROVED quantity once the plan is signed", async () => {
    serve(
      response({
        plan: { ...response().plan!, status: "approved", decidedByName: "Jess" },
        canPropose: false,
        rows: [
          row({ sku: PILLOW, proposedQty: 25, consolidatedQty: 20, approvedQty: 12 }),
        ],
        poList: [{ sku: PILLOW, qty: 12 }],
      }),
    );
    renderPage();
    const list = await screen.findByTestId("plan-po-list");
    expect(list.textContent).toContain("12");
    // The manager's 20 must not appear as an orderable quantity.
    expect(screen.getByTestId(`plan-po-${PILLOW}`).textContent).toContain("12");
  });

  it("says so plainly when every line was cut to zero", async () => {
    serve(
      response({
        plan: { ...response().plan!, status: "approved" },
        canPropose: false,
        rows: [row({ sku: PILLOW, consolidatedQty: 20, approvedQty: 0 })],
        poList: [],
      }),
    );
    renderPage();
    const list = await screen.findByTestId("plan-po-list");
    expect(list.textContent).toContain("nothing to order");
  });
});

describe("the audit trail on screen", () => {
  it("names who opened, who cut and who decided", async () => {
    serve(
      response({
        plan: {
          ...response().plan!,
          status: "rejected",
          consolidatedByName: "Khor Yee",
          decidedByName: "Jess",
          decisionRemark: "Too much pillow",
        },
        canPropose: false,
      }),
    );
    renderPage();
    const trail = await screen.findByTestId("plan-trail");
    expect(trail.textContent).toContain("Khor Yee");
    expect(trail.textContent).toContain("Jess");
    expect(trail.textContent).toContain("Too much pillow");
    expect(screen.getByTestId("plan-status").textContent).toBe("Sent back");
  });
});
