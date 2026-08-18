import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  DEMAND_PURPOSES,
  MANUAL_PURCHASE_WORDS as MW,
  manualPurchaseStatusOf,
  stillNeededOf,
} from "@carres/shared";
import OperationManualPurchase from "./OperationManualPurchase";

/**
 * MANUAL PURCHASE — slice 1 (CARD-2026-08-18-manual-purchase §1 · §3 · §7).
 *
 * The register lists requests; `+ New request` opens the FULL-PAGE workspace
 * that retired the 600px dialog. The P15/P19 contracts the dialog proved
 * moved here with it: per-row result, header asked once, no supplier on the
 * wire. New here: `Why` gates Send, the five purposes, and WHAT WE ALREADY
 * HAVE with a PRINTED `still needed`.
 */

const navigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigate };
});

const apiFetch = vi.fn();
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, apiFetch: (...a: unknown[]) => apiFetch(...a) };
});

vi.mock("@/lib/auth", () => ({
  useAuth: (sel: (s: unknown) => unknown) =>
    sel({ role: "operation", session: { user: { email: "siti@carres.com" } } }),
}));

const KLANG = "2f181917-f4e1-42b2-9e25-d7ee6785424a";
const REQ1 = "aaaaaaaa-0000-0000-0000-000000000001";
const REQ2 = "aaaaaaaa-0000-0000-0000-000000000002";

const REGISTER = {
  requests: [
    {
      id: REQ1,
      req_no: "REQ-0001",
      purpose: "display",
      destination_id: KLANG,
      required_by: "2026-09-12",
      why: "Balakong floor sofa is 14 months old, fabric is marked.",
      approval_required: true,
      approved_at: null,
      approved_by: null,
      refused_at: null,
      refused_by: null,
      refuse_reason: null,
      created_by: "u1",
      created_at: "2026-08-19T02:00:00Z",
    },
    {
      id: REQ2,
      req_no: "REQ-0002",
      purpose: "office",
      destination_id: KLANG,
      required_by: null,
      why: "Office chairs collapsed.",
      approval_required: false,
      approved_at: null,
      approved_by: null,
      refused_at: null,
      refused_by: null,
      refuse_reason: null,
      created_by: "u1",
      created_at: "2026-08-19T03:00:00Z",
    },
  ],
  lines: [
    {
      id: "l1",
      request_id: REQ1,
      sku: "5539-2NA",
      supplier_id: "s1",
      qty: 1,
      approved_qty: null,
      issued_qty: 0,
      remaining_qty: 1,
      required_by: "2026-09-12",
      remark: "grey, not beige",
      po_id: null,
      cancelled_at: null,
      cancel_reason: null,
    },
    {
      id: "l2",
      request_id: REQ2,
      sku: "OFF-CHAIR",
      supplier_id: "s2",
      qty: 3,
      approved_qty: null,
      issued_qty: 0,
      remaining_qty: 3,
      required_by: null,
      remark: null,
      po_id: null,
      cancelled_at: null,
      cancel_reason: null,
    },
  ],
  destinations: [{ id: KLANG, name: "HOUZS Balakong" }],
  suppliers: [{ id: "s1", name: "Ohana" }],
  users: [{ id: "u1", name: "Siti" }],
  canApprove: false,
};

/** The detail payload — swapped per test to flip the approver gate. */
let DETAIL: Record<string, unknown> = {};
function seedDetail(canApprove: boolean) {
  DETAIL = {
    request: REGISTER.requests[0],
    lines: REGISTER.lines
      .filter((l) => l.request_id === REQ1)
      .map((l) => (canApprove ? { ...l, unit_cost: 850 } : l)),
    destinations: REGISTER.destinations,
    suppliers: REGISTER.suppliers,
    users: REGISTER.users,
    canApprove,
  };
}

const PICK = {
  items: [
    {
      sku: "5539-2NA",
      label: "Ohana 2 Seater",
      supplier: "Ohana",
      onHand: 3,
      reserved: 1,
      free: 2,
    },
    {
      sku: "5539-CNR",
      label: "Booqit Corner",
      supplier: "Ohana",
      onHand: 0,
      reserved: 0,
      free: 0,
    },
  ],
  stockWarehouse: "Carres Klang",
};

function respond(url: string): unknown {
  if (url.includes("/purchasing/requests/detail/")) return DETAIL;
  if (url.includes("/purchasing/requests/already-have")) {
    return { sku: "5539-2NA", alreadyOnPo: 1, firstPo: { id: "PO-2041", eta: "2026-08-22" } };
  }
  if (url.includes("/purchasing/requests")) return REGISTER;
  if (url.includes("pick-items")) return PICK;
  return {};
}

beforeEach(() => {
  apiFetch.mockReset();
  navigate.mockReset();
  apiFetch.mockImplementation((url: string) => Promise.resolve(respond(url)));
});

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/operation?tab=manual-purchase"]}>
        <OperationManualPurchase />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function loaded() {
  mount();
  await screen.findByText("REQ-0001");
}

async function openWorkspace() {
  await loaded();
  fireEvent.click(screen.getByTestId("manual-purchase-new-request"));
  await screen.findByTestId("manual-purchase-create");
  // The picker read lands before lines can be filled.
  await waitFor(() =>
    expect(screen.getByText("5539-2NA", { selector: ".font-mono" })).toBeTruthy(),
  );
}

const pickRow = (sku: string) =>
  screen.getByText(sku, { selector: ".font-mono" }).closest("tr")!;

describe("the register — one request per row (card §7)", () => {
  it("lists requests with the REQ- series and the ruled columns", async () => {
    await loaded();
    expect(screen.getByText("REQ-0001")).toBeInTheDocument();
    expect(screen.getByText("REQ-0002")).toBeInTheDocument();
    // `PR-` is refused: 2990s prints it for a purchase return.
    expect(document.body.textContent).not.toMatch(/\bPR-\d/);
  });

  it("status derives — approval ON waits, approval OFF is ready", async () => {
    await loaded();
    expect(screen.getByText("Waiting for approval")).toBeInTheDocument();
    expect(screen.getByText("Ready to order")).toBeInTheDocument();
  });

  it("no money renders anywhere — purchasing has no money", async () => {
    await loaded();
    expect(document.body.textContent).not.toContain("RM ");
  });

  it("`+ New request` is the page's create door", async () => {
    await loaded();
    expect(screen.getByTestId("manual-purchase-new-request")).toHaveTextContent(
      MW.newRequest,
    );
  });

  it("the rail's queue rows carry counts as work waiting, and zero prints nothing", async () => {
    await loaded();
    // One request waits for approval; one is ready to order; none waits on a SKU.
    expect(screen.getByTestId("mp-queue-waiting_approval").textContent).toContain("1");
    expect(screen.getByTestId("mp-queue-ready_to_order").textContent).toContain("1");
    expect(screen.getByTestId("mp-queue-waiting_sku").textContent).toBe("Check the SKU");
  });

  it("a Need for facet narrows the register", async () => {
    await loaded();
    fireEvent.click(screen.getByTestId("mp-facet-office"));
    expect(screen.queryByText("REQ-0001")).toBeNull();
    expect(screen.getByText("REQ-0002")).toBeInTheDocument();
  });
});

describe("the create workspace — full page, never a dialog (card §3)", () => {
  it("offers all five purposes, Spare Parts and Warranty included", () => {
    // The list a control may render IS the shared constant (0322's law); the
    // Select renders from it verbatim.
    expect(DEMAND_PURPOSES.map((p) => p.label)).toEqual([
      "Ready Stock",
      "Display",
      "Warranty",
      "Office",
      "Spare Parts",
    ]);
  });

  it("Send stays off until Why is filled — whitespace does not pass", async () => {
    await openWorkspace();
    fireEvent.focus(document.getElementById("mp-item-0")!);
    fireEvent.click(pickRow("5539-2NA"));
    expect(screen.getByTestId("mp-send")).toBeDisabled();

    fireEvent.change(screen.getByTestId("mp-why"), { target: { value: "   " } });
    expect(screen.getByTestId("mp-send")).toBeDisabled();

    fireEvent.change(screen.getByTestId("mp-why"), {
      target: { value: "Balakong floor sofa is worn." },
    });
    expect(screen.getByTestId("mp-send")).toBeEnabled();
  });

  it("Send stays off until an item is picked, even with a Why", async () => {
    await openWorkspace();
    fireEvent.change(screen.getByTestId("mp-why"), { target: { value: "reason" } });
    expect(screen.getByTestId("mp-send")).toBeDisabled();
  });

  it("`Raised by` is a FACT — the current user, never a control", async () => {
    await openWorkspace();
    expect(screen.getByTestId("mp-raised-by")).toHaveTextContent("siti (you)");
    expect(screen.getByTestId("mp-raised-by").querySelector("input")).toBeNull();
  });

  it("WHAT WE ALREADY HAVE renders per line, and `still needed` is PRINTED", async () => {
    await openWorkspace();
    fireEvent.focus(document.getElementById("mp-item-0")!);
    fireEvent.click(pickRow("5539-2NA"));
    fireEvent.change(document.getElementById("mp-qty-0")!, { target: { value: "3" } });

    const block = await screen.findByTestId("mp-already-have-0");
    await waitFor(() => expect(block.textContent).toContain(MW.alreadyOnPo));
    // free 2 (the picker's own number) · already on PO 1 (the endpoint's) →
    // still needed 0 — the arithmetic the screen prints, never the reader's.
    expect(block.textContent).toContain(MW.freeStock);
    expect(screen.getByTestId("mp-still-needed-0").textContent).toContain("0");
    expect(block.textContent).toContain("PO-2041");
    expect(block.textContent).toContain("may not be needed");
  });

  it("ONE act, per-row result — a failed line keeps its row, retry reuses the header", async () => {
    await openWorkspace();
    fireEvent.change(screen.getByTestId("mp-why"), { target: { value: "two items" } });
    fireEvent.focus(document.getElementById("mp-item-0")!);
    fireEvent.click(pickRow("5539-2NA"));
    fireEvent.click(screen.getByTestId("mp-line-add"));
    fireEvent.focus(document.getElementById("mp-item-1")!);
    fireEvent.click(pickRow("5539-CNR"));

    // Header lands; line 1 lands; line 2 is refused with the server's words.
    apiFetch.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === "POST" && url.endsWith("/purchasing/requests")) {
        return Promise.resolve({ id: REQ1, req_no: "REQ-0009", approval_required: true });
      }
      if (init?.method === "POST" && url.includes("/lines")) {
        const body = JSON.parse(String(init.body)) as { sku: string };
        return body.sku === "5539-CNR"
          ? Promise.reject(new Error("sku 5539-CNR has no supplier"))
          : Promise.resolve({ id: "d1", supplier_id: "s1" });
      }
      return Promise.resolve(respond(url));
    });

    fireEvent.click(screen.getByTestId("mp-send"));
    await screen.findByTestId("mp-line-failed-1");
    expect(screen.getByTestId("mp-line-failed-1").textContent).toContain("no supplier");
    // The workspace stayed open — something is left to answer for.
    expect(screen.getByTestId("manual-purchase-create")).toBeInTheDocument();

    const headerPosts = () =>
      apiFetch.mock.calls.filter(
        (c) =>
          (c[1] as RequestInit | undefined)?.method === "POST" &&
          String(c[0]).endsWith("/purchasing/requests"),
      );
    const before = headerPosts().length;

    // Retry posts ONLY the failed line — the header is a record now.
    fireEvent.click(screen.getByTestId("mp-send"));
    await waitFor(() => expect(screen.queryByTestId("mp-line-failed-1")).toBeTruthy());
    expect(headerPosts().length).toBe(before);
  });

  it("no supplier key rides the wire — the server derives it", async () => {
    await openWorkspace();
    fireEvent.change(screen.getByTestId("mp-why"), { target: { value: "one item" } });
    fireEvent.focus(document.getElementById("mp-item-0")!);
    fireEvent.click(pickRow("5539-2NA"));

    apiFetch.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === "POST" && url.endsWith("/purchasing/requests")) {
        return Promise.resolve({ id: REQ1, req_no: "REQ-0009", approval_required: true });
      }
      if (init?.method === "POST" && url.includes("/lines")) {
        return Promise.resolve({ id: "d1", supplier_id: "s1" });
      }
      return Promise.resolve(respond(url));
    });

    fireEvent.click(screen.getByTestId("mp-send"));
    await waitFor(() => {
      const linePost = apiFetch.mock.calls.find((c) => String(c[0]).includes("/lines"));
      expect(linePost).toBeTruthy();
      const sent = JSON.parse(String((linePost![1] as RequestInit).body));
      expect(sent).not.toHaveProperty("supplier");
      expect(sent).not.toHaveProperty("supplierId");
    });
  });
});

describe("the ONE status arithmetic (Law D)", () => {
  const base = {
    approvalRequired: true,
    approvedAt: null,
    refusedAt: null,
    refuseReason: null,
    lines: [
      { qty: 2, issuedQty: 0, remainingQty: 2, cancelledAt: null, poId: null },
    ],
  };

  it("waits for approval while the switch was on and nobody decided", () => {
    expect(manualPurchaseStatusOf(base).label).toBe("Waiting for approval");
  });

  it("a purpose with approval OFF starts at Ready to order", () => {
    expect(
      manualPurchaseStatusOf({ ...base, approvalRequired: false }).label,
    ).toBe("Ready to order");
  });

  it("a refusal is Not going ahead and carries its reason on the row", () => {
    const s = manualPurchaseStatusOf({
      ...base,
      refusedAt: "2026-08-19T00:00:00Z",
      refuseReason: "unit in Klang can move instead",
    });
    expect(s.label).toBe("Not going ahead");
    expect(s.reasonLabel).toContain("Klang");
  });

  it("every line cancelled is Not going ahead", () => {
    expect(
      manualPurchaseStatusOf({
        ...base,
        lines: [{ ...base.lines[0], cancelledAt: "2026-08-19T00:00:00Z" }],
      }).label,
    ).toBe("Not going ahead");
  });

  it("fully issued lines are Ordered; a posted receipt is Arrived — never a button", () => {
    const issued = {
      ...base,
      approvalRequired: false,
      lines: [{ qty: 2, issuedQty: 2, remainingQty: 0, cancelledAt: null, poId: "PO-1" }],
    };
    expect(manualPurchaseStatusOf(issued).label).toBe("Ordered");
    expect(
      manualPurchaseStatusOf({
        ...issued,
        lines: [{ ...issued.lines[0], received: true }],
      }).label,
    ).toBe("Arrived");
  });

  it("`still needed` is printed arithmetic and never negative", () => {
    expect(stillNeededOf(3, 2, 1)).toBe(0);
    expect(stillNeededOf(5, 1, 1)).toBe(3);
    expect(stillNeededOf(1, 9, 9)).toBe(0);
  });
});

/**
 * SLICE 2 — the approval (card §4 · §8; ui/MASTER §4.1).
 *
 * One scroll, no tabs. Money for the APPROVER only — the server omits the
 * key for everyone else, and the same screen renders minus the money. The
 * Approve control pre-fills `still needed`, never the asked quantity, and
 * `Refuse` cannot be submitted without a reason.
 */
describe("the object detail and the decision (slice 2)", () => {
  async function openDetail(canApprove: boolean) {
    seedDetail(canApprove);
    await loaded();
    fireEvent.click(screen.getByText("REQ-0001", { selector: "button" }));
    await screen.findByTestId("mp-detail");
  }

  it("opens from the Ref door and reads top to bottom — the why is on screen", async () => {
    await openDetail(false);
    expect(screen.getByTestId("mp-detail-why").textContent).toContain(
      "Balakong floor sofa",
    );
    // ONE SCROLL — no tab strip inside the detail.
    expect(screen.queryByRole("tablist")).toBeNull();
  });

  it("money renders for the approver only — same screen, minus the money", async () => {
    await openDetail(false);
    expect(screen.queryByTestId("mp-detail-cost-0")).toBeNull();
    expect(screen.getByTestId("mp-detail").textContent).not.toContain("RM ");
  });

  it("the approver sees the money and the decision", async () => {
    await openDetail(true);
    expect(screen.getByTestId("mp-detail-cost-0").textContent).toContain("RM 850");
    expect(screen.getByTestId("mp-approve")).toBeInTheDocument();
  });

  it("the Approve control pre-fills `still needed`, not the asked quantity", async () => {
    await openDetail(true);
    // qty 1 · free 2 · already on PO 1 → still needed 0 — the pre-fill the
    // card demands, because an approver who must subtract will not.
    await waitFor(() =>
      expect((screen.getByTestId("mp-cut-0") as HTMLInputElement).value).toBe("0"),
    );
  });

  it("Refuse cannot be submitted without a reason", async () => {
    await openDetail(true);
    fireEvent.click(screen.getByTestId("mp-refuse"));
    expect(screen.getByTestId("mp-refuse-submit")).toBeDisabled();
    fireEvent.change(screen.getByTestId("mp-refuse-reason"), {
      target: { value: "a unit in Klang can move instead" },
    });
    expect(screen.getByTestId("mp-refuse-submit")).toBeEnabled();
  });

  it("approving posts the cuts through the one decide door", async () => {
    await openDetail(true);
    await waitFor(() =>
      expect((screen.getByTestId("mp-cut-0") as HTMLInputElement).value).toBe("0"),
    );
    fireEvent.click(screen.getByTestId("mp-approve"));
    await waitFor(() => {
      const post = apiFetch.mock.calls.find((c) => String(c[0]).includes("/decide"));
      expect(post).toBeTruthy();
      const sent = JSON.parse(String((post![1] as RequestInit).body));
      expect(sent.decision).toBe("approve");
      expect(sent.cuts).toEqual([{ id: "l1", qty: 0 }]);
    });
  });

  it("an operator without the gate sees no decision controls at all", async () => {
    await openDetail(false);
    expect(screen.queryByTestId("mp-decision")).toBeNull();
    expect(screen.queryByTestId("mp-approve")).toBeNull();
  });
});
