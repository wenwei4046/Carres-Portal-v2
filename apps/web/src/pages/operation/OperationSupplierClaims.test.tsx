import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
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
    next_move: { key: "ask", owner: "carres", label: "" },
    ...over,
  };
  return { ...base, next_move: claimNextMove(base) };
}

const DAMAGED = row();
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
    expect(screen.getByTestId("claim-next-move-SC-1002")).toHaveTextContent(
      "Call Ohana — confirm the new delivery date",
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
