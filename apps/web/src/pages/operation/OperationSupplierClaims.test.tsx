import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { claimNextMove } from "@carres/shared";
import OperationSupplierClaims from "./OperationSupplierClaims";
import type { SupplierClaimListRow, SupplierClaimsResponse } from "@/lib/queries";

/**
 * R2 + R3 — the Claims queue.
 *
 * R2's tests pin the facts: the row says who, what, how many and off which PO,
 * and the empty state is a real answer rather than a shrug.
 *
 * R3's pin the lifecycle: every open claim names WHO OWES THE NEXT MOVE, the
 * two sides are recorded separately and cannot be rewritten once answered, a
 * claim will not close half-told, and a closed claim still shows both sides.
 */
const claimsQuery = vi.fn();
const photosQuery = vi.fn();
const suppliersQuery = vi.fn();
const requestMutate = vi.fn();
const responseMutate = vi.fn();
const closeMutate = vi.fn();
const holdMutate = vi.fn();

function mutation(mutateAsync: ReturnType<typeof vi.fn>) {
  return { mutateAsync, isPending: false, isError: false, error: null };
}

vi.mock("@/lib/queries", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/queries")>("@/lib/queries");
  return {
    ...actual,
    useOperationSupplierClaims: (status: string) => claimsQuery(status),
    useOperationSupplierClaimPhotos: (id: string | null) => photosQuery(id),
    useOperationSuppliers: () => suppliersQuery(),
    useSupplierClaimRequestMutation: () => mutation(requestMutate),
    useSupplierClaimResponseMutation: () => mutation(responseMutate),
    useSupplierClaimCloseMutation: () => mutation(closeMutate),
    useSupplierClaimHoldResolveMutation: () => mutation(holdMutate),
  };
});

function wrap(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <MemoryRouter>
      <QueryClientProvider client={qc}>{node}</QueryClientProvider>
    </MemoryRouter>
  );
}

/** Build a row the way the API does — `next_move` is computed server-side by
 *  the SAME shared function, so the fixture cannot drift from production. */
function row(over: Partial<SupplierClaimListRow> = {}): SupplierClaimListRow {
  const base: SupplierClaimListRow = {
    id: "c1",
    claim_no: "SC-1001",
    po_id: "PO-2050",
    po_line_id: "l1",
    supplier_id: "s1",
    supplier_name: "Ohana",
    sku: "mattress:carres-cloud:King",
    product_category: "mattress",
    claim_type: "damaged",
    qty: 2,
    status: "open",
    do_number: "DO-5231",
    note: null,
    reported_by_name: "Shasha",
    reported_at: "2026-07-27T02:00:00Z",
    photo_count: 2,
    requested_action: null,
    requested_at: null,
    supplier_response: null,
    supplier_response_note: null,
    responded_at: null,
    closed_at: null,
    close_note: null,
    line_pending: null,
    held_units: 0,
    hold_reason: null,
    next_move: { key: "ask", owner: "carres", label: "" },
    ...over,
  };
  return { ...base, next_move: claimNextMove(base) };
}

const DAMAGED = row();
const WRONG = row({
  id: "c3",
  claim_no: "SC-1003",
  supplier_id: "s2",
  supplier_name: "Nice Future",
  claim_type: "wrong_sku",
  qty: 1,
  photo_count: 1,
});
const LATE = row({
  id: "c2",
  claim_no: "SC-1002",
  claim_type: "late_delivery",
  qty: 3,
  note: "Promised 20 Jul 26 — still pending delivery.",
  reported_by_name: null,
  photo_count: 0,
  requested_action: "deliver_remaining",
  requested_at: "2026-07-27T02:00:00Z",
  line_pending: true,
});

function ok(data: SupplierClaimsResponse) {
  return { data, isLoading: false, isError: false, error: null, refetch: vi.fn() };
}

beforeEach(() => {
  claimsQuery.mockReset();
  photosQuery.mockReset();
  suppliersQuery.mockReset();
  requestMutate.mockReset();
  responseMutate.mockReset();
  closeMutate.mockReset();
  holdMutate.mockReset();
  photosQuery.mockReturnValue({ data: { photos: [] }, isLoading: false, isError: false });
  suppliersQuery.mockReturnValue({
    data: {
      suppliers: [
        { id: "s1", name: "Ohana", whatsapp_group_url: "https://chat.whatsapp.com/x" },
      ],
    },
  });
  requestMutate.mockResolvedValue({});
  responseMutate.mockResolvedValue({});
  closeMutate.mockResolvedValue({});
  holdMutate.mockResolvedValue({});
  Object.assign(navigator, {
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
  vi.spyOn(window, "open").mockImplementation(() => null);
});

describe("OperationSupplierClaims — the facts (R2)", () => {
  it("states the facts of each claim — supplier, item, problem, PO, reporter", () => {
    claimsQuery.mockReturnValue(
      ok({ claims: [DAMAGED], counts: { open: 1, closed: 0, all: 1 } }),
    );
    render(wrap(<OperationSupplierClaims />));
    expect(screen.getByText("SC-1001")).toBeInTheDocument();
    expect(screen.getAllByText("Ohana").length).toBeGreaterThan(0);
    expect(screen.getByText("2 units")).toBeInTheDocument();
    expect(screen.getByTestId("claim-type-SC-1001")).toHaveTextContent("Damaged");
    expect(screen.getByText("PO-2050")).toBeInTheDocument();
    expect(screen.getByText("DO DO-5231")).toBeInTheDocument();
    expect(screen.getByText("Shasha")).toBeInTheDocument();
  });

  it("names the nightly sweep as the reporter of a late delivery instead of printing a blank", () => {
    claimsQuery.mockReturnValue(
      ok({ claims: [LATE], counts: { open: 1, closed: 0, all: 1 } }),
    );
    render(wrap(<OperationSupplierClaims />));
    expect(screen.getByTestId("claim-type-SC-1002")).toHaveTextContent(
      "Late delivery",
    );
    expect(screen.getByText("System")).toBeInTheDocument();
    expect(
      screen.getByText(/Promised 20 Jul 26 — still pending delivery\./),
    ).toBeInTheDocument();
  });

  it("opens on the OPEN queue and switches status on the tabs", () => {
    claimsQuery.mockReturnValue(
      ok({ claims: [], counts: { open: 4, closed: 9, all: 13 } }),
    );
    render(wrap(<OperationSupplierClaims />));
    expect(claimsQuery).toHaveBeenCalledWith("open");
    fireEvent.click(screen.getByRole("tab", { name: /Closed/ }));
    expect(claimsQuery).toHaveBeenLastCalledWith("closed");
  });

  it("an empty open queue answers the question instead of shrugging", () => {
    claimsQuery.mockReturnValue(
      ok({ claims: [], counts: { open: 0, closed: 0, all: 0 } }),
    );
    render(wrap(<OperationSupplierClaims />));
    expect(
      screen.getByText(/every delivery so far arrived complete and on time/i),
    ).toBeInTheDocument();
  });

  it("fetches the evidence only when the row is opened", async () => {
    claimsQuery.mockReturnValue(
      ok({ claims: [DAMAGED], counts: { open: 1, closed: 0, all: 1 } }),
    );
    photosQuery.mockImplementation((id: string | null) => ({
      data: id
        ? { photos: [{ path: "PO-2050/a.jpg", url: "https://x/a.jpg" }] }
        : { photos: [] },
      isLoading: false,
      isError: false,
    }));
    render(wrap(<OperationSupplierClaims />));
    // The panel is what asks for photos, and the panel does not exist until the
    // row is opened — so a closed queue mints no signed URLs at all.
    expect(photosQuery).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("claim-open-SC-1001"));
    await waitFor(() => expect(photosQuery).toHaveBeenLastCalledWith("c1"));
    expect(screen.getByAltText(/Claim evidence/)).toBeInTheDocument();
  });

  it("never says credit note — claim resolutions are goods actions", () => {
    claimsQuery.mockReturnValue(
      ok({ claims: [DAMAGED, LATE], counts: { open: 2, closed: 0, all: 2 } }),
    );
    const { container } = render(wrap(<OperationSupplierClaims />));
    expect(container.textContent).not.toMatch(/credit note/i);
  });
});

describe("R3 — who owes the next move", () => {
  it("a fresh claim is OURS, and the row says what to do about it", () => {
    claimsQuery.mockReturnValue(
      ok({ claims: [DAMAGED], counts: { open: 1, closed: 0, all: 1 } }),
    );
    render(wrap(<OperationSupplierClaims />));
    expect(screen.getByTestId("claim-owner-SC-1001")).toHaveTextContent("Carres");
    expect(screen.getByTestId("claim-next-move-SC-1001")).toHaveTextContent(
      "Call Ohana — agree the fix",
    );
  });

  it("a late claim already asked for the rest, so the SUPPLIER owes the move", () => {
    claimsQuery.mockReturnValue(
      ok({ claims: [LATE], counts: { open: 1, closed: 0, all: 1 } }),
    );
    render(wrap(<OperationSupplierClaims />));
    expect(screen.getByTestId("claim-owner-SC-1002")).toHaveTextContent("Ohana");
    // R8 — the row now prints the dictionary's own line, which is the SAME
    // string the queue tile above it prints the action-less form of.
    expect(screen.getByTestId("claim-next-move-SC-1002")).toHaveTextContent(
      "Call Ohana — confirm what happens next",
    );
  });

  it("a late claim whose goods arrived comes back to US", () => {
    claimsQuery.mockReturnValue(
      ok({
        claims: [row({ ...LATE, line_pending: false })],
        counts: { open: 1, closed: 0, all: 1 },
      }),
    );
    render(wrap(<OperationSupplierClaims />));
    expect(screen.getByTestId("claim-owner-SC-1002")).toHaveTextContent("Carres");
    expect(screen.getByTestId("claim-next-move-SC-1002")).toHaveTextContent(
      "delivered the rest",
    );
  });

  it("a closed claim keeps BOTH sides on the row", () => {
    claimsQuery.mockReturnValue(
      ok({
        claims: [
          row({
            status: "closed",
            requested_action: "replace",
            requested_at: "2026-07-27T03:00:00Z",
            supplier_response: "repair",
            responded_at: "2026-07-27T04:00:00Z",
            closed_at: "2026-07-27T05:00:00Z",
          }),
        ],
        counts: { open: 0, closed: 1, all: 1 },
      }),
    );
    render(wrap(<OperationSupplierClaims />));
    // What we wanted vs what we got — the whole point of two fields.
    expect(screen.getByText(/Asked Replace → got Repair/)).toBeInTheDocument();
    expect(screen.queryByTestId("claim-owner-SC-1001")).not.toBeInTheDocument();
  });
});

describe("R3 — recording the two sides", () => {
  function openPanel(claim: SupplierClaimListRow) {
    claimsQuery.mockReturnValue(
      ok({ claims: [claim], counts: { open: 1, closed: 0, all: 1 } }),
    );
    render(wrap(<OperationSupplierClaims />));
    fireEvent.click(screen.getByTestId(`claim-open-${claim.claim_no}`));
  }

  it("offers Jess's five asks, sends the message and stamps what we asked", async () => {
    openPanel(DAMAGED);
    for (const label of [
      "Replace",
      "Deliver missing parts",
      "Deliver correct item",
      "Repair",
      "Return for inspection",
    ]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
    // Never the machine word for a late claim's ask.
    expect(
      screen.queryByRole("button", { name: "Deliver remaining" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Replace" }));
    fireEvent.click(screen.getByTestId("claim-send-ask"));
    await waitFor(() =>
      expect(requestMutate).toHaveBeenCalledWith({
        claimId: "c1",
        requested_action: "replace",
      }),
    );
    // One act: recorded, copied, group opened.
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalled());
    expect(window.open).toHaveBeenCalledWith(
      "https://chat.whatsapp.com/x",
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("the WhatsApp message leads with the supplier's OWN delivery note", () => {
    openPanel(DAMAGED);
    fireEvent.click(screen.getByRole("button", { name: "Replace" }));
    expect(screen.getByText(/DO DO-5231 \(PO PO-2050\)/)).toBeInTheDocument();
    expect(screen.getByText(/Please \*replace\* for the 2 units\./)).toBeInTheDocument();
  });

  it("still records the ask when the supplier has no group link, and says how to fix it", () => {
    suppliersQuery.mockReturnValue({
      data: { suppliers: [{ id: "s1", name: "Ohana", whatsapp_group_url: null }] },
    });
    openPanel(DAMAGED);
    fireEvent.click(screen.getByRole("button", { name: "Replace" }));
    expect(
      screen.getByText(/WhatsApp group is not saved\. Ask a manager to add it/),
    ).toBeInTheDocument();
    expect(screen.getByTestId("claim-send-ask")).toHaveTextContent(
      "Save what we asked",
    );
  });

  it("a late claim has nothing to pick and says why", () => {
    openPanel(LATE);
    expect(screen.getByTestId("claim-request-recorded")).toHaveTextContent(
      "Deliver remaining",
    );
    expect(
      screen.getByText(/a late delivery can only be asked to deliver the rest/i),
    ).toBeInTheDocument();
  });

  it("refuses to take an answer before a question has been asked", () => {
    openPanel(DAMAGED);
    expect(
      screen.getByText(/Ask Ohana first — an answer needs a question\./),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("claim-save-answer")).not.toBeInTheDocument();
  });

  it("records the supplier's answer, and does NOT narrow it to what we asked", async () => {
    openPanel(row({ requested_action: "replace", requested_at: "2026-07-27T03:00:00Z" }));
    // They may answer anything — including something other than Replace.
    fireEvent.click(screen.getByRole("button", { name: "Repair" }));
    fireEvent.click(screen.getByTestId("claim-save-answer"));
    await waitFor(() =>
      expect(responseMutate).toHaveBeenCalledWith({
        claimId: "c1",
        supplier_response: "repair",
        note: undefined,
      }),
    );
  });

  it("a refusal cannot be saved without a reason", async () => {
    openPanel(row({ requested_action: "replace", requested_at: "2026-07-27T03:00:00Z" }));
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    expect(screen.getByTestId("claim-save-answer")).toBeDisabled();
    expect(
      screen.getByText(/must say what was agreed, or why/i),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByTestId("claim-answer-note"), {
      target: { value: "Out of warranty, 8 months old" },
    });
    fireEvent.click(screen.getByTestId("claim-save-answer"));
    await waitFor(() =>
      expect(responseMutate).toHaveBeenCalledWith({
        claimId: "c1",
        supplier_response: "reject",
        note: "Out of warranty, 8 months old",
      }),
    );
  });

  it("freezes the ask once the supplier has answered — history is not rewritten", () => {
    openPanel(
      row({
        requested_action: "replace",
        requested_at: "2026-07-27T03:00:00Z",
        supplier_response: "repair",
        responded_at: "2026-07-27T04:00:00Z",
      }),
    );
    expect(screen.getByTestId("claim-request-recorded")).toHaveTextContent("Replace");
    expect(screen.getByTestId("claim-response-recorded")).toHaveTextContent("Repair");
    expect(
      screen.queryByRole("button", { name: "Deliver correct item" }),
    ).not.toBeInTheDocument();
  });
});

describe("R3 — the close keeps both sides", () => {
  function openPanel(claim: SupplierClaimListRow) {
    claimsQuery.mockReturnValue(
      ok({ claims: [claim], counts: { open: 1, closed: 0, all: 1 } }),
    );
    render(wrap(<OperationSupplierClaims />));
    fireEvent.click(screen.getByTestId(`claim-open-${claim.claim_no}`));
  }

  it("will not close a claim with either side blank, and says which", () => {
    openPanel(DAMAGED);
    expect(screen.getByTestId("claim-close-blocked")).toHaveTextContent(
      "Say what we asked the supplier to do.",
    );
    expect(screen.getByTestId("claim-close-blocked")).toHaveTextContent(
      "Record what the supplier answered.",
    );
    expect(screen.queryByTestId("claim-close")).not.toBeInTheDocument();
  });

  it("closes once both sides are on file", async () => {
    openPanel(
      row({
        requested_action: "replace",
        requested_at: "2026-07-27T03:00:00Z",
        supplier_response: "replacement",
        responded_at: "2026-07-27T04:00:00Z",
      }),
    );
    fireEvent.click(screen.getByTestId("claim-close"));
    await waitFor(() =>
      expect(closeMutate).toHaveBeenCalledWith({ claimId: "c1", note: undefined }),
    );
  });

  it("offers nothing to change on a claim that is already closed", () => {
    openPanel(
      row({
        status: "closed",
        requested_action: "replace",
        requested_at: "2026-07-27T03:00:00Z",
        supplier_response: "replacement",
        responded_at: "2026-07-27T04:00:00Z",
        closed_at: "2026-07-27T05:00:00Z",
        close_note: "New unit delivered 30 Jul",
      }),
    );
    expect(screen.queryByTestId("claim-close")).not.toBeInTheDocument();
    expect(screen.queryByTestId("claim-send-ask")).not.toBeInTheDocument();
    expect(screen.queryByTestId("claim-save-answer")).not.toBeInTheDocument();
    expect(screen.getByText("New unit delivered 30 Jul")).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// P2 — the click behaviour (docs/UI-KIT.md §8.2)
// ═══════════════════════════════════════════════════════════════════════════
//
// Before this card the page had NO facet rail and NO filter state, so not one
// line of the interaction law could be true here. Every test below locks a
// behaviour a screenshot cannot prove.

describe("Claims · §8.2 the queue tile (card P2)", () => {
  function renderAll() {
    claimsQuery.mockReturnValue(
      ok({
        claims: [DAMAGED, LATE, WRONG],
        counts: { open: 3, closed: 0, all: 3 },
      }),
    );
    return render(wrap(<OperationSupplierClaims />));
  }

  it("takes the tile's name and its empty state VERBATIM from the dictionary", () => {
    // A tile's name IS its action, and `Claims` is the TAB — a place and an
    // action may not share one word (COPY-STANDARD).
    renderAll();
    expect(screen.getByTestId("facet-queue-answer")).toHaveTextContent(
      "Confirm what happens next",
    );
    expect(screen.queryByTestId("facet-queue-claims")).toBeNull();
  });

  // ── R8 · the tile and the row stop spelling one action two ways ────────────
  it("the row line is the tile's own action, party named", () => {
    renderAll();
    // P2 shipped the tile from the dictionary and left the row on R3's own
    // sentence, so this ONE screen said `Confirm what happens next` at the top
    // and `confirm what they will do` in the column. Both now come out of
    // `order-action-words.ts`.
    const tile = screen.getByTestId("facet-queue-answer").textContent ?? "";
    const row = screen.getByTestId("claim-next-move-SC-1002").textContent ?? "";
    expect(tile).toContain("Confirm what happens next");
    expect(row).toBe("Call Ohana — confirm what happens next");
    // The queue word carries no party (a queue holds many); the row does.
    expect(tile).not.toContain("Ohana");
  });

  it("renders no explanatory paragraph above the list (Loo, 2026-07-28)", () => {
    const { container } = renderAll();
    // UI-KIT §1.1 question 3 — if it were removed, could today's work still be
    // finished? YES, so the gate does not admit it, and §1.3's budget is 200px.
    expect(container.textContent).not.toMatch(/What the supplier still owes us/);
    expect(container.textContent).not.toMatch(/Opened by receiving/);
  });

  it("filters to the claims the supplier still owes an answer on", () => {
    renderAll();
    expect(screen.getAllByTestId("supplier-claim-row")).toHaveLength(3);

    fireEvent.click(screen.getByTestId("facet-queue-answer"));

    // Only the late claim has been asked and not answered.
    expect(screen.getAllByTestId("supplier-claim-row")).toHaveLength(1);
    expect(screen.getByText("SC-1002")).toBeInTheDocument();
    expect(screen.queryByText("SC-1001")).toBeNull();
  });

  it("clicking it again clears it, and so does its ✕ chip", () => {
    renderAll();
    fireEvent.click(screen.getByTestId("facet-queue-answer"));
    expect(screen.getAllByTestId("supplier-claim-row")).toHaveLength(1);

    fireEvent.click(screen.getByTestId("facet-queue-answer"));
    expect(screen.getAllByTestId("supplier-claim-row")).toHaveLength(3);

    // …and the chip does the same job.
    fireEvent.click(screen.getByTestId("facet-queue-answer"));
    const chips = screen.getByTestId("listshell-active-chips");
    expect(chips).toHaveTextContent("Confirm what happens next");
    // Scoped to the chip row: the tile in the rail carries the same word, which
    // is the point — a queue and its chip may not spell one action two ways.
    fireEvent.click(
      within(chips).getByRole("button", { name: /Confirm what happens next/ }),
    );
    expect(screen.getAllByTestId("supplier-claim-row")).toHaveLength(3);
  });

  it("an empty queue says the dictionary's sentence, not a shrug", () => {
    claimsQuery.mockReturnValue(
      ok({ claims: [DAMAGED], counts: { open: 1, closed: 0, all: 1 } }),
    );
    render(wrap(<OperationSupplierClaims />));
    // Nobody is waiting on a supplier — the tile still renders (a quiet screen
    // must mean watched and fine, never nobody looked).
    expect(screen.getByTestId("facet-queue-answer")).toHaveTextContent("0");
    fireEvent.click(screen.getByTestId("facet-queue-answer"));
    expect(
      screen.getByText("No claim is waiting for a supplier answer."),
    ).toBeInTheDocument();
  });
});

describe("Claims · §8.2 two picks, two ✕-able chips (card P2)", () => {
  function renderAll() {
    claimsQuery.mockReturnValue(
      ok({
        claims: [DAMAGED, LATE, WRONG],
        counts: { open: 3, closed: 0, all: 3 },
      }),
    );
    return render(wrap(<OperationSupplierClaims />));
  }

  it("clicking the same supplier again clears it", () => {
    renderAll();
    const cell = screen.getByTestId("facet-supplier-s2");

    fireEvent.click(cell);
    expect(screen.getAllByTestId("supplier-claim-row")).toHaveLength(1);
    expect(screen.getByTestId("listshell-active-chips")).toHaveTextContent(
      "Supplier: Nice Future",
    );

    fireEvent.click(cell);
    expect(screen.getAllByTestId("supplier-claim-row")).toHaveLength(3);
    expect(screen.queryByTestId("listshell-active-chips")).toBeNull();
  });

  it("two picks show two chips, and each ✕ clears only its own", () => {
    renderAll();
    fireEvent.click(screen.getByTestId("facet-supplier-s1"));
    fireEvent.click(screen.getByTestId("facet-problem-damaged"));

    const chips = screen.getByTestId("listshell-active-chips");
    expect(chips).toHaveTextContent("Supplier: Ohana");
    expect(chips).toHaveTextContent("Problem: Damaged");
    expect(screen.getAllByTestId("supplier-claim-row")).toHaveLength(1);
    expect(screen.getByText("SC-1001")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Problem: Damaged/ }));
    expect(screen.getByTestId("listshell-active-chips")).toHaveTextContent(
      "Supplier: Ohana",
    );
    expect(
      screen.queryByRole("button", { name: /Problem: Damaged/ }),
    ).toBeNull();
    // Ohana's two claims are back; Nice Future's is still filtered out.
    expect(screen.getAllByTestId("supplier-claim-row")).toHaveLength(2);
  });

  it("never offers a pick that would empty the table", () => {
    renderAll();
    // Every group is counted with every filter EXCEPT its own, and a zero row
    // is not rendered — so a visible cell always returns rows.
    expect(screen.getByTestId("facet-problem-wrong_sku")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("facet-supplier-s1"));
    // Ohana has no wrong-SKU claim, so the cell that would blank the table is
    // gone rather than sitting there reading 0.
    expect(screen.queryByTestId("facet-problem-wrong_sku")).toBeNull();
    expect(screen.getByTestId("facet-problem-damaged")).toBeInTheDocument();
    expect(screen.getByTestId("facet-problem-late_delivery")).toBeInTheDocument();
  });

  it("Reset filters clears every pick at once", () => {
    renderAll();
    fireEvent.click(screen.getByTestId("facet-queue-answer"));
    fireEvent.click(screen.getByTestId("facet-supplier-s1"));
    expect(screen.getByTestId("listshell-active-chips")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reset filters" }));
    expect(screen.queryByTestId("listshell-active-chips")).toBeNull();
    expect(screen.getAllByTestId("supplier-claim-row")).toHaveLength(3);
  });
});

describe("Claims · §8.2 the status tabs are a STAGE picker (card P2)", () => {
  function renderAll() {
    claimsQuery.mockReturnValue(
      ok({
        claims: [DAMAGED, LATE, WRONG],
        counts: { open: 3, closed: 0, all: 3 },
      }),
    );
    return render(wrap(<OperationSupplierClaims />));
  }

  it("re-clicking the tab you are already on is a NO-OP, filters included", () => {
    renderAll();
    fireEvent.click(screen.getByTestId("facet-supplier-s1"));
    expect(screen.getByTestId("listshell-active-chips")).toHaveTextContent(
      "Supplier: Ohana",
    );

    // One of the three is always on and there is nothing to clear into, so a
    // second click must not run a reset (UI-KIT §8.2's no-empty-state shape).
    fireEvent.click(screen.getByRole("tab", { name: /Open/ }));

    expect(screen.getByTestId("listshell-active-chips")).toHaveTextContent(
      "Supplier: Ohana",
    );
    expect(claimsQuery).toHaveBeenLastCalledWith("open");
  });

  it("a DIFFERENT tab is a different list, so it clears the picks", () => {
    renderAll();
    fireEvent.click(screen.getByTestId("facet-supplier-s1"));
    expect(screen.getByTestId("listshell-active-chips")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /Closed/ }));

    expect(screen.queryByTestId("listshell-active-chips")).toBeNull();
    expect(claimsQuery).toHaveBeenLastCalledWith("closed");
  });
});

describe("Claims · §8.2 the row opens it, and closing gives the list back (card P2)", () => {
  function renderAll() {
    claimsQuery.mockReturnValue(
      ok({
        claims: [DAMAGED, LATE, WRONG],
        counts: { open: 3, closed: 0, all: 3 },
      }),
    );
    return render(wrap(<OperationSupplierClaims />));
  }

  it("clicking the ROW opens the claim — not only the button", () => {
    renderAll();
    expect(screen.queryByTestId("claim-panel-SC-1001")).toBeNull();

    fireEvent.click(screen.getAllByTestId("supplier-claim-row")[0]);
    expect(screen.getByTestId("claim-panel-SC-1001")).toBeInTheDocument();

    fireEvent.click(screen.getAllByTestId("supplier-claim-row")[0]);
    expect(screen.queryByTestId("claim-panel-SC-1001")).toBeNull();
  });

  it("the Open/Hide button fires ONCE — the row click underneath must not fire too", () => {
    // The whole row became a click target, so the button now sits inside one.
    // Two handlers for one click is invisible on the panel (both toggles read
    // the same render's state and agree) and NOT invisible on the scroll: the
    // second close reads a snapshot the first one has already spent, and the
    // position is silently lost.
    renderAll();
    const box = screen.getByTestId("claims-table-scroll");
    Object.defineProperty(box, "scrollHeight", { value: 900, configurable: true });
    Object.defineProperty(box, "clientHeight", { value: 400, configurable: true });
    box.scrollTop = 310;

    fireEvent.click(screen.getByTestId("claim-open-SC-1001"));
    expect(screen.getByTestId("claim-panel-SC-1001")).toBeInTheDocument();
    box.scrollTop = 0;

    fireEvent.click(screen.getByTestId("claim-open-SC-1001"));
    expect(screen.queryByTestId("claim-panel-SC-1001")).toBeNull();
    expect(box.scrollTop).toBe(310);
  });

  it("closing keeps the filter AND the table's scroll position", () => {
    renderAll();
    fireEvent.click(screen.getByTestId("facet-supplier-s1"));
    expect(screen.getAllByTestId("supplier-claim-row")).toHaveLength(2);

    // jsdom has no layout, so give the box a real scrollable geometry first —
    // otherwise scrollTop can only ever be 0 and the assertion proves nothing.
    const box = screen.getByTestId("claims-table-scroll");
    Object.defineProperty(box, "scrollHeight", { value: 900, configurable: true });
    Object.defineProperty(box, "clientHeight", { value: 400, configurable: true });
    box.scrollTop = 240;

    fireEvent.click(screen.getAllByTestId("supplier-claim-row")[0]);
    expect(screen.getByTestId("claim-panel-SC-1001")).toBeInTheDocument();
    box.scrollTop = 0; // what losing the panel's height does to it

    fireEvent.click(screen.getAllByTestId("supplier-claim-row")[0]);

    expect(screen.queryByTestId("claim-panel-SC-1001")).toBeNull();
    expect(screen.getByTestId("listshell-active-chips")).toHaveTextContent(
      "Supplier: Ohana",
    );
    expect(box.scrollTop).toBe(240);
  });

  it("gives the scroll back when a filter takes the open claim off the list", () => {
    renderAll();
    const box = screen.getByTestId("claims-table-scroll");
    Object.defineProperty(box, "scrollHeight", { value: 900, configurable: true });
    Object.defineProperty(box, "clientHeight", { value: 400, configurable: true });
    box.scrollTop = 120;

    fireEvent.click(screen.getAllByTestId("supplier-claim-row")[0]);
    expect(screen.getByTestId("claim-panel-SC-1001")).toBeInTheDocument();
    box.scrollTop = 0;

    // Nobody clicked the panel shut — the filter took it away.
    fireEvent.click(screen.getByTestId("facet-supplier-s2"));

    expect(screen.queryByTestId("claim-panel-SC-1001")).toBeNull();
    expect(box.scrollTop).toBe(120);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// R4 — the goods (migration 0299)
// ═══════════════════════════════════════════════════════════════════════════
//
// The quarantine itself is the database's (a trigger refuses `on_hold →
// reserved|sold|transferred` whichever door tries it). What the panel owes is
// that a human can SEE the units are held and SAY what happened to them —
// without that, the hold is a black hole and the units are lost on purpose.

describe("OperationSupplierClaims — the goods (R4)", () => {
  function openClaim(claim: SupplierClaimListRow) {
    claimsQuery.mockReturnValue(
      ok({ claims: [claim], counts: { open: 1, closed: 0, all: 1 } }),
    );
    render(wrap(<OperationSupplierClaims />));
    fireEvent.click(screen.getByTestId(`claim-open-${claim.claim_no}`));
  }

  it("says the units are held AND that they cannot be sold", () => {
    openClaim(row({ held_units: 2, hold_reason: "damaged" }));
    const panel = screen.getByTestId("claim-held-stock");
    expect(panel).toHaveTextContent("2 units on hold");
    expect(panel).toHaveTextContent("Arrived damaged");
    // The whole point of the card, said out loud rather than left to a status
    // word nobody scrolls to.
    expect(panel).toHaveTextContent("cannot be sold, reserved or delivered");
  });

  it("offers the card's three outcomes and nothing else", () => {
    openClaim(row({ held_units: 1, hold_reason: "wrong_item" }));
    expect(screen.getByTestId("hold-outcome-back_to_stock")).toBeInTheDocument();
    expect(screen.getByTestId("hold-outcome-returned")).toBeInTheDocument();
    expect(screen.getByTestId("hold-outcome-written_off")).toBeInTheDocument();
  });

  it("records what happened, and the browser never names the status", async () => {
    openClaim(row({ held_units: 2, hold_reason: "damaged" }));
    fireEvent.click(screen.getByTestId("hold-outcome-returned"));
    fireEvent.click(screen.getByTestId("hold-resolve"));
    await waitFor(() => expect(holdMutate).toHaveBeenCalled());
    // `outcome`, never `status`: which status each outcome means is the
    // database's answer, mirrored once in the shared module.
    expect(holdMutate).toHaveBeenCalledWith({
      claimId: "c1",
      outcome: "returned",
      note: undefined,
    });
  });

  it("will not write off units without saying why", async () => {
    openClaim(row({ held_units: 1, hold_reason: "damaged" }));
    fireEvent.click(screen.getByTestId("hold-outcome-written_off"));
    expect(screen.getByTestId("hold-resolve")).toBeDisabled();
    expect(screen.getByTestId("claim-held-stock")).toHaveTextContent(
      "Say why the units were written off.",
    );

    fireEvent.change(screen.getByTestId("hold-outcome-note"), {
      target: { value: "Frame cracked through" },
    });
    expect(screen.getByTestId("hold-resolve")).not.toBeDisabled();
    fireEvent.click(screen.getByTestId("hold-resolve"));
    await waitFor(() => expect(holdMutate).toHaveBeenCalled());
    expect(holdMutate).toHaveBeenCalledWith({
      claimId: "c1",
      outcome: "written_off",
      note: "Frame cracked through",
    });
  });

  it("a late-delivery claim holds nothing, and says so instead of showing buttons", () => {
    // Nothing arrived, so there is nothing to quarantine. 0 is an answer.
    openClaim(LATE);
    const panel = screen.getByTestId("claim-held-stock");
    expect(panel).toHaveTextContent("Nothing on hold");
    expect(screen.queryByTestId("hold-resolve")).not.toBeInTheDocument();
  });

  it("a resolved claim stops offering the buttons — the units already moved", () => {
    openClaim(
      row({
        held_units: 0,
        hold_reason: null,
        requested_action: "replace",
        requested_at: "2026-07-27T03:00:00Z",
        supplier_response: "replacement",
        responded_at: "2026-07-27T04:00:00Z",
      }),
    );
    expect(screen.queryByTestId("hold-outcome-returned")).not.toBeInTheDocument();
  });
});
