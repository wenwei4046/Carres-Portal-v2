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
const REQ3 = "aaaaaaaa-0000-0000-0000-000000000003";

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
      // A LEGACY purpose (Card 03 §2): readable with its truthful old label,
      // matching NO purpose filter — never falsely mapped onto the five.
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
    {
      // Fully ordered — the permanent listing's HISTORY row: visible by
      // default, gone under `All not ordered`.
      id: REQ3,
      req_no: "REQ-0003",
      purpose: "ready_stock",
      destination_id: KLANG,
      required_by: null,
      why: "Klang floor stock ran out.",
      approval_required: false,
      approved_at: null,
      approved_by: null,
      refused_at: null,
      refused_by: null,
      refuse_reason: null,
      created_by: "u1",
      created_at: "2026-08-18T03:00:00Z",
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
      category: "sofa",
      po_supplier_id: null,
    },
    {
      // A SKU the Catalog does not hold: category null — it joins NO product
      // facet and names its gap inside the request, never on the rail.
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
      category: null,
      po_supplier_id: null,
    },
    {
      id: "l3",
      request_id: REQ3,
      sku: "M-KING",
      supplier_id: "s1",
      qty: 2,
      approved_qty: null,
      issued_qty: 2,
      remaining_qty: 0,
      required_by: null,
      remark: null,
      po_id: "PO-2050",
      cancelled_at: null,
      cancel_reason: null,
      category: "mattress",
      po_supplier_id: "s1",
    },
  ],
  destinations: [{ id: KLANG, name: "HOUZS Balakong" }],
  suppliers: [
    { id: "s1", name: "Ohana" },
    { id: "s2", name: "Office Co" },
  ],
  users: [{ id: "u1", name: "Siti" }],
  approvers: [{ id: "u9", name: "Jess" }],
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
    approvers: REGISTER.approvers,
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
  /* ⭐ THE PRICES THIS ISSUE WILL COMMIT TO (0380; Card 02 closure §2). The
     surface reads them, shows them and declares them, because the API compares
     the DECLARED price against Catalog — it no longer compares its own live
     value with itself. */
  if (url.includes("/purchasing/requests/issue-costs")) {
    return { costs: [{ sku: "5539-2NA", unitCost: 850 }] };
  }
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
  // The rail's Hide choice is per-browser memory — one test's hide may not
  // leak into the next test's default.
  localStorage.clear();
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

/** The DatePicker opens on the current month — pick a day there (the
 *  SalesOrderAmendDeliveryDate.test.tsx pattern). */
function pickNeededBy(dayOfMonth = 15) {
  fireEvent.click(document.getElementById("mp-needed")!);
  const cell = screen
    .getAllByRole("gridcell")
    .find((c) => c.textContent?.trim() === String(dayOfMonth));
  if (!cell) throw new Error(`no day cell for ${dayOfMonth}`);
  /* react-day-picker puts the clickable button INSIDE the gridcell. */
  fireEvent.click(cell.querySelector("button") ?? cell);
}

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
    // `Ready to order` also names a rail row now — scope to the register.
    const grid = screen.getByTestId("register-column");
    expect(grid.textContent).toContain("Ready to order");
    expect(grid.textContent).toContain("Ordered");
  });

  it("names the real action owner beside Waiting for approval (Card 03 §3)", async () => {
    await loaded();
    expect(screen.getByTestId(`mp-approver-${REQ1}`)).toHaveTextContent("Jess approves");
    // The decided/ready rows carry no approver line.
    expect(screen.queryByTestId(`mp-approver-${REQ2}`)).toBeNull();
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

});

/**
 * ⭐ CARD 03 — THE LEFT FILTER RAIL (owner-approved 2026-08-28).
 *
 * The shared 240px `FilterRail` shell (Card 02-C's grammar, imported), four
 * groups in the approved order, unique-request counts, AND across sections,
 * the banned rows absent by name — and the default Register stays the
 * PERMANENT listing, ordered history included.
 */
describe("Card 03 · the left filter rail", () => {
  const rail = () => screen.getByTestId("manual-purchase-rail");

  it("is the shared 240px FilterRail shell, left of the register, with no checkboxes", async () => {
    await loaded();
    expect(rail().className).toContain("w-[240px]");
    const grid = screen.getByTestId("register-column");
    expect(
      rail().compareDocumentPosition(grid) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // Navigation, not selection: no rail row ever grows a checkbox.
    expect(rail().querySelectorAll("input[type='checkbox']").length).toBe(0);
    // The shell's own Hide control rides along (Card 02-C's grammar).
    expect(rail().querySelector("[aria-label='Hide filters']")).toBeTruthy();
  });

  it("renders the four groups and their rows in the approved order", async () => {
    await loaded();
    const text = rail().textContent ?? "";
    const order = [
      "TO ORDER",
      "All not ordered",
      "Need approval",
      "Ready to order",
      "PURCHASE PURPOSE",
      "All purposes",
      "Ready Stock",
      "Showroom Display",
      "Service Case",
      "Internal Staff Purchase",
      "Subsidiary Purchase",
      "PRODUCT",
      "All products",
      "Mattress",
      "Bedframe",
      "Sofa",
      "SUPPLIER",
      "All suppliers",
    ];
    let at = -1;
    for (const word of order) {
      const next = text.indexOf(word, at + 1);
      expect(next, `${word} out of order`).toBeGreaterThan(at);
      at = next;
    }
  });

  it("renders none of the banned rows or groups", async () => {
    await loaded();
    const text = rail().textContent ?? "";
    for (const banned of [
      "Supplier not selected",
      "No supplier",
      "Not in catalog",
      "Need price",
      "Part received",
      "Received",
      "Arrived",
      "Cancelled",
      "My drafts",
      "Need correction",
      "Queues",
      "ORDER TIMING",
      "safety days",
      "Safety days",
    ]) {
      expect(text).not.toContain(banned);
    }
    // `Ordered` survives only inside `All not ordered` — never as its own row.
    expect(text.replace(/All not ordered/g, "")).not.toContain("Ordered");
  });

  it("the default Register keeps ordered history; All not ordered excludes it", async () => {
    await loaded();
    expect(screen.getByText("REQ-0003")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("mp-to-order-not_ordered"));
    expect(screen.queryByText("REQ-0003")).toBeNull();
    expect(screen.getByText("REQ-0001")).toBeInTheDocument();
    expect(screen.getByText("REQ-0002")).toBeInTheDocument();
    // A second click clears the section.
    fireEvent.click(screen.getByTestId("mp-to-order-not_ordered"));
    expect(screen.getByText("REQ-0003")).toBeInTheDocument();
  });

  it("Need approval and Ready to order ride the derived request truth, counts as unique requests", async () => {
    await loaded();
    expect(screen.getByTestId("mp-to-order-not_ordered").textContent).toContain("2");
    expect(screen.getByTestId("mp-to-order-need_approval").textContent).toContain("1");
    expect(screen.getByTestId("mp-to-order-ready_to_order").textContent).toContain("1");
    fireEvent.click(screen.getByTestId("mp-to-order-need_approval"));
    expect(screen.getByText("REQ-0001")).toBeInTheDocument();
    expect(screen.queryByText("REQ-0002")).toBeNull();
    expect(screen.queryByText("REQ-0003")).toBeNull();
  });

  it("a purpose filter narrows; a LEGACY purpose matches no row and All purposes clears", async () => {
    await loaded();
    // REQ-0002 (`office`) counts under none of the five…
    expect(screen.getByTestId("mp-purpose-display").textContent).toContain("1");
    expect(screen.getByTestId("mp-purpose-ready_stock").textContent).toContain("1");
    expect(screen.getByTestId("mp-purpose-internal_staff").textContent).toContain("0");
    fireEvent.click(screen.getByTestId("mp-purpose-display"));
    expect(screen.getByText("REQ-0001")).toBeInTheDocument();
    expect(screen.queryByText("REQ-0002")).toBeNull();
    // …but stays in the Register the moment its own section clears.
    fireEvent.click(screen.getByTestId("mp-purpose-all"));
    expect(screen.getByText("REQ-0002")).toBeInTheDocument();
    // The row prints its truthful old label, not a false new one.
    expect(screen.getByTestId("register-column").textContent).toContain("Office");
  });

  it("PRODUCT rides the Catalog category; an uncatalogued SKU joins no facet", async () => {
    await loaded();
    expect(screen.getByTestId("mp-product-sofa").textContent).toContain("1");
    expect(screen.getByTestId("mp-product-mattress").textContent).toContain("1");
    expect(screen.getByTestId("mp-product-bedframe").textContent).toContain("0");
    fireEvent.click(screen.getByTestId("mp-product-sofa"));
    expect(screen.getByText("REQ-0001")).toBeInTheDocument();
    // REQ-0002's SKU has no Catalog category — visible under All products only.
    expect(screen.queryByText("REQ-0002")).toBeNull();
  });

  it("SUPPLIER rows are actual derived names, alphabetical, counted per request", async () => {
    await loaded();
    // Office Co < Ohana; Ohana serves REQ-0001 (line) and REQ-0003 (line + PO).
    expect(screen.getByTestId("mp-supplier-Office Co").textContent).toContain("1");
    expect(screen.getByTestId("mp-supplier-Ohana").textContent).toContain("2");
    const text = rail().textContent ?? "";
    expect(text.indexOf("Office Co")).toBeLessThan(text.indexOf("Ohana"));
  });

  it("sections combine with AND", async () => {
    await loaded();
    fireEvent.click(screen.getByTestId("mp-to-order-not_ordered"));
    fireEvent.click(screen.getByTestId("mp-supplier-Ohana"));
    expect(screen.getByText("REQ-0001")).toBeInTheDocument();
    expect(screen.queryByText("REQ-0002")).toBeNull();
    expect(screen.queryByText("REQ-0003")).toBeNull();
    // The supplier counts updated against the TO ORDER selection.
    expect(screen.getByTestId("mp-supplier-Ohana").textContent).toContain("1");
  });

  it("Hide filters collapses the rail; Show filters brings it back", async () => {
    await loaded();
    fireEvent.click(rail().querySelector("[aria-label='Hide filters']")!);
    expect(screen.queryByTestId("manual-purchase-rail")).toBeNull();
    const show = screen.getByTestId("mp-show-filters");
    fireEvent.click(show);
    expect(screen.getByTestId("manual-purchase-rail")).toBeInTheDocument();
  });
});

describe("the create workspace — full page, never a dialog (card §3)", () => {
  it("offers exactly the approved five purposes (Card 03 §2)", () => {
    // The list a control may render IS the shared constant (0322's law); the
    // Select renders from it verbatim. `Office` and `Spare Parts` are LEGACY —
    // readable on old rows, never offered for a new request.
    expect(DEMAND_PURPOSES.map((p) => p.label)).toEqual([
      "Ready Stock",
      "Showroom Display",
      "Service Case",
      "Internal Staff Purchase",
      "Subsidiary Purchase",
    ]);
  });

  it("Send NAMES its gap — the date first, then Why, then it is live (2026-08-19 walk)", async () => {
    await openWorkspace();
    fireEvent.focus(document.getElementById("mp-item-0")!);
    fireEvent.click(pickRow("5539-2NA"));
    // No date yet — the disabled button says which fact is missing.
    expect(screen.getByTestId("mp-send")).toBeDisabled();
    expect(screen.getByTestId("mp-send")).toHaveTextContent(MW.sendNeedsDate);

    pickNeededBy();
    expect(screen.getByTestId("mp-send")).toBeDisabled();
    expect(screen.getByTestId("mp-send")).toHaveTextContent(MW.sendNeedsWhy);

    // Whitespace does not pass for Why.
    fireEvent.change(screen.getByTestId("mp-why"), { target: { value: "   " } });
    expect(screen.getByTestId("mp-send")).toBeDisabled();

    fireEvent.change(screen.getByTestId("mp-why"), {
      target: { value: "Balakong floor sofa is worn." },
    });
    expect(screen.getByTestId("mp-send")).toBeEnabled();
    expect(screen.getByTestId("mp-send")).toHaveTextContent(MW.send);
  });

  it("a picked line shows SKU + Model, never the model word alone (P15's defect, returned)", async () => {
    await openWorkspace();
    fireEvent.focus(document.getElementById("mp-item-0")!);
    fireEvent.click(pickRow("5539-2NA"));
    expect((document.getElementById("mp-item-0") as HTMLInputElement).value).toContain(
      "5539-2NA",
    );
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
    pickNeededBy();
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
    pickNeededBy();
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

/**
 * SLICE 3 — the issue (card §5 · §6).
 *
 * `Arrived` IS NOT A BUTTON anywhere. The consolidation offer is declinable
 * on the same screen. Issue goes to the one door, same day — the page never
 * consults a PO day.
 */
describe("issue and the observed arrival (slice 3)", () => {
  function seedReadyDetail() {
    DETAIL = {
      request: REGISTER.requests[1], // approval OFF → Ready to order
      lines: REGISTER.lines.filter((l) => l.request_id === REQ2),
      destinations: REGISTER.destinations,
      suppliers: [{ id: "s2", name: "Office Co", kind: "own_logistics" }],
      users: REGISTER.users,
      canApprove: false,
    };
  }

  it("`Arrived` cannot be set by any control — no such button exists", async () => {
    seedDetail(true);
    await loaded();
    fireEvent.click(screen.getByText("REQ-0001", { selector: "button" }));
    await screen.findByTestId("mp-detail");
    expect(screen.queryByText(/^Arrived$/, { selector: "button" })).toBeNull();
    expect(document.querySelector("[data-testid*='arrived']")).toBeNull();
  });

  it("a ready request issues through the one door, and no PO-day is consulted", async () => {
    seedReadyDetail();
    await loaded();
    fireEvent.click(screen.getByText("REQ-0002", { selector: "button" }));
    await screen.findByTestId("mp-issue");
    fireEvent.click(screen.getByTestId("mp-issue-po"));
    await waitFor(() => {
      const post = apiFetch.mock.calls.find((c) =>
        String(c[0]).endsWith("/purchasing/requests/issue"),
      );
      expect(post).toBeTruthy();
      const sent = JSON.parse(String((post![1] as RequestInit).body));
      expect(sent.requestIds).toEqual([REQ2]);
      expect(sent.together).toBe(false);
    });
  });

  it("the consolidation offer is declinable on the same screen", async () => {
    // Make REQ-0001 ready too (approved) and share the supplier with REQ-0002.
    const approved = {
      ...REGISTER.requests[0],
      approved_at: "2026-08-19T05:00:00Z",
      approved_by: "u1",
    };
    const shared = REGISTER.lines.map((l) =>
      l.request_id === REQ1 ? { ...l, supplier_id: "s2" } : l,
    );
    apiFetch.mockImplementation((url: string) => {
      if (url.includes("/purchasing/requests/detail/")) return Promise.resolve(DETAIL);
      if (url.includes("/purchasing/requests/issue-costs")) {
        return Promise.resolve({ costs: [{ sku: "5539-2NA", unitCost: 850 }] });
      }
      if (url.includes("/purchasing/requests/already-have")) {
        return Promise.resolve({ sku: "x", alreadyOnPo: 0, firstPo: null });
      }
      if (url.includes("/purchasing/requests")) {
        return Promise.resolve({ ...REGISTER, requests: [approved, REGISTER.requests[1]], lines: shared });
      }
      if (url.includes("pick-items")) return Promise.resolve(PICK);
      return Promise.resolve({});
    });
    DETAIL = {
      request: approved,
      lines: shared.filter((l) => l.request_id === REQ1),
      destinations: REGISTER.destinations,
      suppliers: [{ id: "s2", name: "Office Co", kind: "own_logistics" }],
      users: REGISTER.users,
      canApprove: false,
    };

    await loaded();
    fireEvent.click(screen.getByText("REQ-0001", { selector: "button" }));
    await screen.findByTestId("mp-issue-offer");
    // BOTH doors live on the same screen — the offer can be declined.
    expect(screen.getByTestId("mp-issue-together")).toBeInTheDocument();
    expect(screen.getByTestId("mp-issue-separate")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("mp-issue-separate"));
    await waitFor(() => {
      const post = apiFetch.mock.calls.find((c) =>
        String(c[0]).endsWith("/purchasing/requests/issue"),
      );
      expect(post).toBeTruthy();
      const sent = JSON.parse(String((post![1] as RequestInit).body));
      expect(sent.together).toBe(false);
      expect(sent.requestIds).toEqual([REQ1]);
    });
  });

  it("a received line derives Arrived through the one arithmetic", () => {
    expect(
      manualPurchaseStatusOf({
        approvalRequired: false,
        approvedAt: null,
        refusedAt: null,
        refuseReason: null,
        lines: [
          { qty: 1, issuedQty: 1, remainingQty: 0, cancelledAt: null, poId: "PO-1", received: true },
        ],
      }).label,
    ).toBe("Arrived");
  });
});

/**
 * `+ New request` keeps its control-band home (CARD-2026-08-19 corrections §4)
 * — the Card 03 rail rebuild moved the FILTERS, not the create door.
 */
describe("the register's control band", () => {
  it("`+ New request` sits inside the register column's control band — no empty band", async () => {
    await loaded();
    const btn = screen.getByTestId("manual-purchase-new-request");
    const grid = screen.getByTestId("register-column");
    // The button lives INSIDE the register column (the DataGrid toolbar), not
    // in a standalone row above it.
    expect(grid.contains(btn)).toBe(true);
    // The register column's first child is the grid surface itself — no
    // dedicated button row precedes it.
    expect(grid.firstElementChild?.contains(btn)).toBe(true);
  });
});

/**
 * ⭐ CLOSURE §2 — THE MANUAL LANE DECLARES THE PRICE IT REVIEWED (0380).
 *
 * This lane buys at the Catalog price, and the API used to read that price
 * itself and send it back to the creation authority as `cost_source: catalog` —
 * so the database compared its own live value against itself and agreed every
 * time. A price nobody was shown is a price nobody reviewed, so the surface
 * shows them and the request carries them.
 */
describe("closure §2 · the issue declares the transaction cost it showed", () => {
  it("shows the cost of every SKU it is about to buy", async () => {
    DETAIL = {
      request: REGISTER.requests[1],
      lines: REGISTER.lines.filter((l) => l.request_id === REQ2),
      destinations: REGISTER.destinations,
      suppliers: [{ id: "s2", name: "Office Co", kind: "own_logistics" }],
      users: REGISTER.users,
      canApprove: false,
    };
    await loaded();
    fireEvent.click(screen.getByText("REQ-0002", { selector: "button" }));
    const costs = await screen.findByTestId("mp-issue-costs");
    expect(costs).toHaveTextContent("Transaction cost");
    expect(screen.getByTestId("mp-issue-cost-5539-2NA")).toHaveTextContent("RM 850");
  });

  it("sends those exact numbers with the issue request", async () => {
    DETAIL = {
      request: REGISTER.requests[1],
      lines: REGISTER.lines.filter((l) => l.request_id === REQ2),
      destinations: REGISTER.destinations,
      suppliers: [{ id: "s2", name: "Office Co", kind: "own_logistics" }],
      users: REGISTER.users,
      canApprove: false,
    };
    await loaded();
    fireEvent.click(screen.getByText("REQ-0002", { selector: "button" }));
    await screen.findByTestId("mp-issue-costs");
    fireEvent.click(screen.getByTestId("mp-issue-po"));
    await waitFor(() => {
      const post = apiFetch.mock.calls.find((c) =>
        String(c[0]).endsWith("/purchasing/requests/issue"),
      );
      expect(post).toBeTruthy();
      const sent = JSON.parse(String((post![1] as RequestInit).body));
      expect(sent.expectedCosts).toEqual({ "5539-2NA": 850 });
    });
  });

  it("names a SKU Catalog has no price for, and never declares it as zero", async () => {
    DETAIL = {
      request: REGISTER.requests[1],
      lines: REGISTER.lines.filter((l) => l.request_id === REQ2),
      destinations: REGISTER.destinations,
      suppliers: [{ id: "s2", name: "Office Co", kind: "own_logistics" }],
      users: REGISTER.users,
      canApprove: false,
    };
    apiFetch.mockImplementation((url: string) => {
      if (url.includes("/purchasing/requests/issue-costs")) {
        return Promise.resolve({
          costs: [
            { sku: "5539-2NA", unitCost: 850 },
            { sku: "X-NEW-K", unitCost: null },
          ],
        });
      }
      return Promise.resolve(respond(url));
    });
    await loaded();
    fireEvent.click(screen.getByText("REQ-0002", { selector: "button" }));
    const row = await screen.findByTestId("mp-issue-cost-X-NEW-K");
    /* The two lines: the fact, then the act. */
    expect(row).toHaveTextContent("Catalog has no price.");
    expect(row).toHaveTextContent("Ask Catalog to set the cost of X-NEW-K.");
    fireEvent.click(screen.getByTestId("mp-issue-po"));
    await waitFor(() => {
      const post = apiFetch.mock.calls.find((c) =>
        String(c[0]).endsWith("/purchasing/requests/issue"),
      );
      expect(post).toBeTruthy();
      const sent = JSON.parse(String((post![1] as RequestInit).body));
      /* A hole is NOT declared as RM0 — the server refuses the line by name. */
      expect(sent.expectedCosts).toEqual({ "5539-2NA": 850 });
    });
  });

  it("reports a refusal in the approved two lines", async () => {
    DETAIL = {
      request: REGISTER.requests[1],
      lines: REGISTER.lines.filter((l) => l.request_id === REQ2),
      destinations: REGISTER.destinations,
      suppliers: [{ id: "s2", name: "Office Co", kind: "own_logistics" }],
      users: REGISTER.users,
      canApprove: false,
    };
    apiFetch.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === "POST" && url.endsWith("/purchasing/requests/issue")) {
        return Promise.reject(
          Object.assign(new Error("refused"), {
            body: {
              code: "not_po_duty",
              message: "You do not hold PO duty today.",
              action: "Ask Shasha to issue this purchase order.",
            },
          }),
        );
      }
      if (url.includes("/purchasing/requests/issue-costs")) {
        return Promise.resolve({ costs: [{ sku: "5539-2NA", unitCost: 850 }] });
      }
      return Promise.resolve(respond(url));
    });
    await loaded();
    fireEvent.click(screen.getByText("REQ-0002", { selector: "button" }));
    await screen.findByTestId("mp-issue-costs");
    fireEvent.click(screen.getByTestId("mp-issue-po"));
    const err = await screen.findByTestId("mp-issue-error");
    expect(err).toHaveTextContent("You do not hold PO duty today.");
    expect(err).toHaveTextContent("Ask Shasha to issue this purchase order.");
  });
});
