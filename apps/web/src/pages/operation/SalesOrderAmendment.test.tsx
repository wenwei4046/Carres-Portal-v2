/**
 * STAGE 3 · card 3.5 — the amendment lane, RENDERED, and the WALL held.
 *
 * The card's negative controls are mostly about what must NOT exist. A render
 * test is the only place that can hold "this screen has no ISSUE button and no
 * ACCEPT button", because typecheck is perfectly happy with a button that
 * should never have been drawn.
 *
 *   ✗ no ISSUE control, no ACCEPT control, no working APPLY — anywhere
 *   ✗ an open amendment must not lock the fields beside it
 *   · STALE must READ as "propose again", not as an error the operator caused
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { SalesOrderAmendment as Amendment } from "@/lib/queries";
import SalesOrderAmendmentLane from "./SalesOrderAmendment";

const submitMutate = vi.fn();
let live: Amendment | null = null;

vi.mock("@/lib/queries", async () => {
  const actual = await vi.importActual<typeof import("@/lib/queries")>("@/lib/queries");
  return {
    ...actual,
    useSalesOrderAmendment: () => ({ data: { amendment: live } }),
    useSubmitSalesOrderAmendment: () => ({ mutate: submitMutate, isPending: false }),
  };
});

const ORDER_ID = "00000000-0000-0000-0000-0000000000d1";

function draw() {
  return render(
    <SalesOrderAmendmentLane
      orderId={ORDER_ID}
      currentLines={[{ sku: "B1201S-K", qty: 2, unit_price: 2499 }]}
    />,
  );
}

const fresh: Amendment = {
  id: "amd-1",
  status: "submitted",
  reason: "Customer wants one more",
  base_revision: 4,
  base_contractual_hash: "347fc81f",
  current_contractual_hash: "347fc81f",
  stale: false,
  proposed_snapshot: { lines: [{ sku: "B1201S-K", qty: 3, unit_price: 2499 }] },
  submitted_at: "2026-08-10T03:36:33.000Z",
};

beforeEach(() => {
  live = null;
  submitMutate.mockReset();
});

/** Every word a signing or issuing control would carry, in one place. */
const FORBIDDEN = [/\bissue\b/i, /\bsign\b/i, /signature/i, /\baccept\b/i, /\bapply\b/i];

describe("the owner's wall — this screen cannot issue, sign or apply", () => {
  it("draws none of those controls when no amendment is open", () => {
    draw();
    for (const word of FORBIDDEN) {
      expect(screen.queryAllByRole("button", { name: word })).toEqual([]);
    }
  });

  it("draws none of them while one waits, and says the sending is not built", () => {
    live = fresh;
    draw();
    for (const word of FORBIDDEN) {
      expect(screen.queryAllByRole("button", { name: word })).toEqual([]);
    }
    /* Said on the SCREEN, not only in a comment: an operator who cannot find
     * the send button must learn it does not exist yet, not hunt for it. */
    expect(screen.getByTestId("amendment-wall").textContent).toMatch(/not built yet/i);
  });
});

describe("a waiting amendment", () => {
  beforeEach(() => {
    live = fresh;
  });

  it("says the sales order has NOT changed, and that corrections stay free", () => {
    draw();
    expect(screen.getByText(/has not agreed yet/i)).toBeTruthy();
    /* The `LOCK THE CONSEQUENCE` promise, made visible: a phone fix is not
     * hostage to a customer who has not replied. */
    expect(screen.getByText(/corrections are still free to save/i)).toBeTruthy();
  });

  it("shows which revision it was computed from, and why", () => {
    draw();
    expect(screen.getByText(/From Rev 4/)).toBeTruthy();
    expect(screen.getByText(/Customer wants one more/)).toBeTruthy();
  });

  it("offers no second proposal while one is open", () => {
    draw();
    expect(screen.queryByTestId("amendment-open-form")).toBeNull();
  });
});

describe("a STALE amendment", () => {
  beforeEach(() => {
    live = { ...fresh, stale: true, current_contractual_hash: "c15d566c" };
  });

  it("reads as 'propose again', naming what went out of date", () => {
    draw();
    expect(screen.getByText(/Out of date — propose again/)).toBeTruthy();
    expect(screen.getByText(/no longer true/i)).toBeTruthy();
  });

  it("still draws no issue, sign or apply control", () => {
    draw();
    for (const word of FORBIDDEN) {
      expect(screen.queryAllByRole("button", { name: word })).toEqual([]);
    }
  });
});

describe("no amendment open", () => {
  it("offers ONE way in, and it is a proposal rather than an edit", () => {
    draw();
    expect(screen.getByTestId("amendment-open-form")).toBeTruthy();
    expect(screen.getByText(/change by proposal, not by editing/i)).toBeTruthy();
  });
});
