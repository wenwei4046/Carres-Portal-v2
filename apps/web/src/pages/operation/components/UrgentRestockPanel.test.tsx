import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import UrgentRestockPanel from "./UrgentRestockPanel";
import type {
  OpsStockEmergencyResponse,
  OpsStockEmergencyRow,
} from "@carres/shared";

/**
 * Urgent restock — card K3.
 *
 * The behaviours worth locking down are the ones a screenshot cannot prove:
 *  1. The COO answers in ONE act — cutting the number and approving it are the
 *     same click, because this lane skips consolidation by design.
 *  2. Turning an ask down is impossible without a reason.
 *  3. `Other` cannot be sent without words, and the screen says which word is
 *     missing rather than just going dark.
 *  4. "Already enough free" WARNS and never blocks — the register can be behind
 *     what the person on the floor knows.
 *  5. The urgent handover list carries the APPROVED number, and an ordered ask
 *     leaves it.
 */

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, apiFetch: vi.fn() };
});
import { apiFetch } from "@/lib/api";

const PILLOW = "Essential Memory Pillow(L)";
const REQ = "33333333-3333-3333-3333-333333333333";

function row(over: Partial<OpsStockEmergencyRow> = {}): OpsStockEmergencyRow {
  return {
    id: REQ,
    sku: PILLOW,
    qty: 40,
    reason: "weekend_low",
    reasonLabel: "Weekend stock low",
    note: null,
    requestedBy: "u1",
    requestedByName: "Shasha",
    requestedAt: "2026-07-26T01:00:00Z",
    status: "pending",
    approvedQty: null,
    decidedByName: null,
    decidedAt: null,
    decisionRemark: null,
    orderedByName: null,
    orderedAt: null,
    onHand: 12,
    reserved: 2,
    incoming: 0,
    coveredByFreeStock: false,
    waitingDays: 1,
    ...over,
  };
}

function response(
  over: Partial<OpsStockEmergencyResponse> = {},
): OpsStockEmergencyResponse {
  return {
    rows: [],
    pendingCount: 0,
    poList: [],
    skus: [PILLOW],
    canRaise: true,
    canDecide: false,
    canMarkOrdered: false,
    meId: "me",
    ...over,
  };
}

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <UrgentRestockPanel />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
});

function serve(res: OpsStockEmergencyResponse) {
  vi.mocked(apiFetch).mockResolvedValue(res as never);
}

// ---------------------------------------------------------------------------

describe("the empty lane", () => {
  it("says nothing is urgent rather than showing an empty box", async () => {
    serve(response());
    renderPanel();
    expect((await screen.findByTestId("urgent-empty")).textContent).toContain(
      "Nothing urgent right now",
    );
  });

  it("shows no waiting badge when nothing waits", async () => {
    serve(response());
    renderPanel();
    await screen.findByTestId("urgent-empty");
    expect(screen.queryByTestId("urgent-pending-count")).toBeNull();
  });
});

describe("raising an ask", () => {
  it("names the missing piece instead of just going dark", async () => {
    serve(response());
    renderPanel();
    fireEvent.click(await screen.findByTestId("urgent-new"));

    // Nothing filled in yet.
    expect(screen.getByTestId("urgent-submit")).toBeDisabled();
    expect(screen.getByTestId("urgent-problem").textContent).toContain("Pick the item");

    fireEvent.change(screen.getByTestId("urgent-sku"), { target: { value: PILLOW } });
    expect(screen.getByTestId("urgent-problem").textContent).toContain("How many");

    fireEvent.change(screen.getByTestId("urgent-qty"), { target: { value: "40" } });
    expect(screen.getByTestId("urgent-problem").textContent).toContain(
      "Why is this urgent",
    );
  });

  it("refuses Other with no words, and says so", async () => {
    serve(response());
    renderPanel();
    fireEvent.click(await screen.findByTestId("urgent-new"));
    fireEvent.change(screen.getByTestId("urgent-sku"), { target: { value: PILLOW } });
    fireEvent.change(screen.getByTestId("urgent-qty"), { target: { value: "5" } });
    fireEvent.change(screen.getByTestId("urgent-reason"), {
      target: { value: "other" },
    });

    expect(screen.getByTestId("urgent-submit")).toBeDisabled();
    expect(screen.getByTestId("urgent-problem").textContent).toContain(
      "Say what the reason is",
    );

    fireEvent.change(screen.getByTestId("urgent-note"), {
      target: { value: "influencer post" },
    });
    expect(screen.getByTestId("urgent-submit")).not.toBeDisabled();
  });

  it("sends the reason with the ask", async () => {
    serve(response());
    renderPanel();
    fireEvent.click(await screen.findByTestId("urgent-new"));
    fireEvent.change(screen.getByTestId("urgent-sku"), { target: { value: PILLOW } });
    fireEvent.change(screen.getByTestId("urgent-qty"), { target: { value: "40" } });
    fireEvent.change(screen.getByTestId("urgent-reason"), {
      target: { value: "promotion" },
    });
    fireEvent.click(screen.getByTestId("urgent-submit"));

    await waitFor(() => {
      const post = vi
        .mocked(apiFetch)
        .mock.calls.find(
          ([, init]) => (init as RequestInit | undefined)?.method === "POST",
        );
      expect(post).toBeTruthy();
      expect(JSON.parse(String((post![1] as RequestInit).body))).toMatchObject({
        sku: PILLOW,
        qty: 40,
        reason: "promotion",
      });
    });
  });
});

describe("the row states facts, and warns without blocking", () => {
  it("shows free / spoken for / on the way beside the ask", async () => {
    serve(
      response({
        rows: [row({ onHand: 12, reserved: 2, incoming: 100 })],
        pendingCount: 1,
      }),
    );
    renderPanel();
    const el = await screen.findByTestId(`urgent-row-${REQ}`);
    expect(el.textContent).toContain("Free now");
    expect(el.textContent).toContain("On the way");
    expect(el.textContent).toContain("100");
  });

  it("never prints a suggested quantity — an emergency has no history", async () => {
    serve(response({ rows: [row()], pendingCount: 1 }));
    renderPanel();
    const el = await screen.findByTestId(`urgent-row-${REQ}`);
    expect(el.textContent).not.toMatch(/suggest/i);
  });

  it("warns when the warehouse already has enough — and still lets the COO act", async () => {
    serve(
      response({
        rows: [row({ onHand: 555, coveredByFreeStock: true })],
        pendingCount: 1,
        canDecide: true,
      }),
    );
    renderPanel();
    expect((await screen.findByTestId(`urgent-covered-${REQ}`)).textContent).toContain(
      "already has enough free",
    );
    // The decision controls are still there — a warning, not a refusal.
    expect(screen.getByTestId(`urgent-approve-${REQ}`)).not.toBeDisabled();
  });

  it("speaks the plain-word state, never the database word", async () => {
    serve(response({ rows: [row({ status: "rejected", decisionRemark: "we have 300" })] }));
    renderPanel();
    expect((await screen.findByTestId(`urgent-status-${REQ}`)).textContent).toBe(
      "Turned down",
    );
  });

  it("says how long an ask has been waiting", async () => {
    serve(response({ rows: [row({ waitingDays: 3 })], pendingCount: 1 }));
    renderPanel();
    expect((await screen.findByTestId(`urgent-row-${REQ}`)).textContent).toContain(
      "3 days ago",
    );
  });
});

describe("who may answer", () => {
  it("shows a plain wait line to somebody without the COO's seat", async () => {
    serve(response({ rows: [row()], pendingCount: 1, canDecide: false }));
    renderPanel();
    expect((await screen.findByTestId(`urgent-awaiting-${REQ}`)).textContent).toContain(
      "Waiting for the COO",
    );
    expect(screen.queryByTestId(`urgent-decide-${REQ}`)).toBeNull();
  });

  it("cuts and approves in ONE act — the lane skips consolidation", async () => {
    serve(response({ rows: [row({ qty: 40 })], pendingCount: 1, canDecide: true }));
    renderPanel();
    await screen.findByTestId(`urgent-decide-${REQ}`);

    // The box opens pre-filled with what was asked; changing it and pressing
    // Approve is a single call, not save-then-approve.
    fireEvent.change(screen.getByTestId(`urgent-approve-qty-${REQ}`), {
      target: { value: "25" },
    });
    fireEvent.click(screen.getByTestId(`urgent-approve-${REQ}`));

    await waitFor(() => {
      const post = vi
        .mocked(apiFetch)
        .mock.calls.find(([p]) => String(p).endsWith("/decide"));
      expect(post).toBeTruthy();
      expect(JSON.parse(String((post![1] as RequestInit).body))).toMatchObject({
        decision: "approve",
        qty: 25,
      });
    });
  });

  it("will not turn an ask down without a reason", async () => {
    serve(response({ rows: [row()], pendingCount: 1, canDecide: true }));
    renderPanel();
    const reject = await screen.findByTestId(`urgent-reject-${REQ}`);
    expect(reject).toBeDisabled();

    fireEvent.change(screen.getByTestId(`urgent-remark-${REQ}`), {
      target: { value: "we have 300 already" },
    });
    expect(reject).not.toBeDisabled();
  });

  it("offers the ordered tick only to the person who raises purchase orders", async () => {
    const approved = row({ status: "approved", approvedQty: 25, waitingDays: null });
    serve(response({ rows: [approved], canMarkOrdered: false }));
    const { unmount } = renderPanel();
    await screen.findByTestId(`urgent-row-${REQ}`);
    expect(screen.queryByTestId(`urgent-ordered-${REQ}`)).toBeNull();
    unmount();

    serve(response({ rows: [approved], canMarkOrdered: true }));
    renderPanel();
    expect(await screen.findByTestId(`urgent-ordered-${REQ}`)).toBeTruthy();
  });
});

describe("the urgent handover", () => {
  it("lists the approved number, not what was asked for", async () => {
    serve(
      response({
        rows: [row({ qty: 100, status: "approved", approvedQty: 25, waitingDays: null })],
        poList: [{ sku: PILLOW, qty: 25, requestCount: 1 }],
      }),
    );
    renderPanel();
    const line = await screen.findByTestId(`urgent-po-${PILLOW}`);
    expect(line.textContent).toContain("25");
    expect(line.textContent).not.toContain("100");
  });

  it("says when one purchase line answers several panics", async () => {
    serve(
      response({
        rows: [],
        poList: [{ sku: PILLOW, qty: 42, requestCount: 2 }],
      }),
    );
    renderPanel();
    expect((await screen.findByTestId(`urgent-po-${PILLOW}`)).textContent).toContain(
      "2 asks",
    );
  });

  it("shows no handover list when nothing is waiting to be ordered", async () => {
    serve(response({ rows: [row({ status: "ordered", approvedQty: 25 })], poList: [] }));
    renderPanel();
    await screen.findByTestId(`urgent-row-${REQ}`);
    expect(screen.queryByTestId("urgent-po-list")).toBeNull();
  });
});
