import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import {
  computeSupplierScorecard,
  type ScorecardLine,
  type ScorecardPo,
} from "@carres/shared";
import OperationSuppliers from "./OperationSuppliers";

/**
 * R5 · the supplier scorecard on the Suppliers page.
 *
 * The behaviours worth locking down are the ones the arithmetic tests cannot
 * see, and they are all about what the screen does NOT say:
 *
 *  1. A supplier with no deliveries shows a sentence, never a row of 0%.
 *     This is the whole card on live data — prod has ten suppliers and zero
 *     purchase orders.
 *  2. A withheld figure carries the reason it is withheld, so "—" can never be
 *     misread as "perfect".
 *  3. The fraction is always spelt out beside the percentage.
 *  4. The drawer states what was excluded from the score and why.
 */

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, apiFetch: vi.fn() };
});
import { apiFetch } from "@/lib/api";
import { fmtDate } from "@/lib/fmt-date";

const ASOF = "2026-07-27";

function po(over: Partial<ScorecardPo> & { id: string }): ScorecardPo {
  return {
    supplier_id: "sup-1",
    eta_date: "2026-07-20",
    placed_at: "2026-07-01",
    received_on: "2026-07-19",
    ...over,
  };
}

function line(over: Partial<ScorecardLine> & { po_id: string }): ScorecardLine {
  return { qty: 10, received_qty: 10, damaged_qty: 0, wrong_item_qty: 0, ...over };
}

function supplier(
  name: string,
  pos: ScorecardPo[],
  lines: ScorecardLine[],
  claims: Parameters<typeof computeSupplierScorecard>[0]["claims"] = [],
) {
  return {
    id: "sup-1",
    name,
    contact: null,
    contactEmail: "sales@ohana.test",
    leadTime: "14 days",
    kind: "factory_pickup" as const,
    catCovered: ["sofa"],
    portalEnabled: true,
    slug: "ohana",
    openPos: pos.length,
    receivedPos: 0,
    totalPos: pos.length,
    scorecard: computeSupplierScorecard({
      supplier_id: "sup-1",
      pos,
      lines,
      claims,
      asOf: ASOF,
    }),
  };
}

function mount(suppliers: ReturnType<typeof supplier>[]) {
  vi.mocked(apiFetch).mockImplementation(async (path: string) => {
    if (path.endsWith("/pos")) return { pos: [] };
    return {
      suppliers,
      scorecardWindow: { days: 365, asOf: ASOF, truncated: false },
    };
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <OperationSuppliers />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => vi.clearAllMocks());

describe("OperationSuppliers · the scorecard", () => {
  it("shows a sentence and NO percentage for a supplier with no PO", async () => {
    mount([supplier("Ohana", [], [])]);
    expect(await screen.findByText("No PO on file yet.")).toBeInTheDocument();
    expect(screen.queryByText("0%")).not.toBeInTheDocument();
    expect(screen.queryByText("On time")).not.toBeInTheDocument();
  });

  it("names how many deliveries are still needed before a score", async () => {
    const pos = [po({ id: "PO-1" })];
    mount([supplier("Ohana", pos, [line({ po_id: "PO-1" })])]);
    expect(
      await screen.findByText("1 delivery on file · 3 needed before a score."),
    ).toBeInTheDocument();
  });

  it("prints the figures with the fraction spelt out once the floor is reached", async () => {
    const pos = [
      po({ id: "A", received_on: "2026-07-18" }),
      po({ id: "B", received_on: "2026-07-20" }),
      po({ id: "C", received_on: "2026-07-25" }),
    ];
    const lines = [line({ po_id: "A" }), line({ po_id: "B" }), line({ po_id: "C" })];
    mount([supplier("Ohana", pos, lines)]);

    expect(await screen.findByText("67% on time · 100% in full.")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Ohana"));
    await waitFor(() => expect(screen.getByText("Scorecard")).toBeInTheDocument());
    expect(screen.getByText("2 of 3 deliveries")).toBeInTheDocument();
  });

  it("a withheld figure carries its reason, so a dash never reads as perfect", async () => {
    // Three judged deliveries, none of which ever arrived — quality is
    // unmeasurable, and the dash must say so.
    const pos = ["A", "B", "C"].map((id) => po({ id, received_on: null }));
    const lines = ["A", "B", "C"].map((id) => line({ po_id: id, received_qty: 0 }));
    mount([supplier("Ohana", pos, lines)]);

    fireEvent.click(await screen.findByText("Ohana"));
    await waitFor(() => expect(screen.getByText("Scorecard")).toBeInTheDocument());
    expect(screen.getByText("No delivery on file yet")).toBeInTheDocument();
  });

  it("says what was left out of the score and why", async () => {
    const pos = [
      po({ id: "A" }),
      po({ id: "B" }),
      po({ id: "C" }),
      po({ id: "D", eta_date: null }),
      po({ id: "E", eta_date: "2026-09-01", received_on: null }),
    ];
    const lines = [
      line({ po_id: "A" }),
      line({ po_id: "B" }),
      line({ po_id: "C" }),
      line({ po_id: "D" }),
      line({ po_id: "E", received_qty: 0 }),
    ];
    mount([supplier("Ohana", pos, lines)]);

    fireEvent.click(await screen.findByText("Ohana"));
    await waitFor(() => expect(screen.getByText("Scorecard")).toBeInTheDocument());
    expect(
      screen.getByText("1 PO carries no promised date and cannot be scored."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("1 PO has not reached its promised date."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        new RegExp(`5 POs on file since ${fmtDate("2026-07-01")} · 3 scored\\.`),
      ),
    ).toBeInTheDocument();
  });

  it("shows no settle-time average when nothing has settled, and says so", async () => {
    const pos = ["A", "B", "C"].map((id) => po({ id }));
    const lines = ["A", "B", "C"].map((id) => line({ po_id: id }));
    mount([
      supplier("Ohana", pos, lines, [
        {
          po_id: "A",
          claim_type: "damaged",
          status: "open",
          reported_on: "2026-07-10",
          closed_on: null,
        },
      ]),
    ]);

    fireEvent.click(await screen.findByText("Ohana"));
    await waitFor(() => expect(screen.getByText("Scorecard")).toBeInTheDocument());
    expect(screen.getByText("1 open · 0 settled")).toBeInTheDocument();
    expect(
      screen.getByText("Nothing settled yet, so there is no average to show."),
    ).toBeInTheDocument();
    expect(screen.getByText("Oldest open claim: 17 days.")).toBeInTheDocument();
  });

  it("states the window it looked at", async () => {
    mount([supplier("Ohana", [], [])]);
    expect(
      await screen.findByText(/Delivery record covers the last 365 days/),
    ).toBeInTheDocument();
  });
});
