import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
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
      // A RETIRED purpose — pre-Card-03 history. It prints its own truthful
      // word (`Display`) and matches no approved rail row.
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
      for_service_case_id: null,
      for_staff_user_id: null,
      for_subsidiary_name: null,
      created_by: "u1",
      created_at: "2026-08-19T02:00:00Z",
    },
    {
      id: REQ2,
      req_no: "REQ-0002",
      purpose: "ready_stock",
      destination_id: KLANG,
      required_by: null,
      why: "Klang shelf is empty for the K mattress.",
      approval_required: false,
      approved_at: null,
      approved_by: null,
      refused_at: null,
      refused_by: null,
      refuse_reason: null,
      for_service_case_id: null,
      for_staff_user_id: null,
      for_subsidiary_name: null,
      created_by: "u1",
      created_at: "2026-08-19T03:00:00Z",
    },
    {
      // Fully issued HISTORY — `Ordered`. The permanent Register keeps it;
      // `All not ordered` drops it (Card 03 §4).
      id: REQ3,
      req_no: "REQ-0003",
      purpose: "subsidiary_purchase",
      destination_id: KLANG,
      required_by: null,
      why: "HOUZS subsidiary opening stock.",
      approval_required: false,
      approved_at: null,
      approved_by: null,
      refused_at: null,
      refused_by: null,
      refuse_reason: null,
      for_service_case_id: null,
      for_staff_user_id: null,
      // Card 04 — the structured For: the actual subsidiary company.
      for_subsidiary_name: "HOUZS Sdn Bhd",
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
      // The CATALOG's answer, stamped by the API (Card 03).
      category: "sofa",
      // Card 04 — the ONE item-label arithmetic's answer, and the lineage.
      item_label: "Ohana 2 Seater",
      po_ids: [],
      destination_id: KLANG,
    },
    {
      id: "l2",
      request_id: REQ2,
      // A SKU whose TEXT screams mattress — but the Catalog has no category
      // for it, so the PRODUCT rail must NOT count it (Catalog authority,
      // never SKU-text inference).
      sku: "MATTRESS-LOOK-9",
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
      item_label: "MATTRESS-LOOK-9",
      po_ids: [],
      destination_id: KLANG,
    },
    {
      id: "l3",
      request_id: REQ3,
      sku: "BED-K-01",
      supplier_id: "s3",
      qty: 2,
      approved_qty: null,
      issued_qty: 2,
      remaining_qty: 0,
      required_by: null,
      remark: null,
      po_id: "PO-9001",
      cancelled_at: null,
      cancel_reason: null,
      category: "bedframe",
      item_label: "Atlas K",
      po_ids: ["PO-9001"],
      destination_id: KLANG,
    },
  ],
  // Card 04 — id → the ACTUAL po_no; the column prints numbers, never UUIDs.
  pos: [{ id: "PO-9001", po_no: "PO-20260818-9001" }],
  serviceCases: [],
  destinations: [{ id: KLANG, name: "HOUZS Balakong" }],
  suppliers: [
    { id: "s1", name: "Ohana" },
    { id: "s2", name: "Office Co" },
    { id: "s3", name: "Hooka" },
  ],
  users: [{ id: "u1", name: "Siti" }],
  approvers: [{ id: "u9", name: "Jess" }],
  canApprove: false,
  // Card 04 — PO duty, shown ONLY beside a live selection.
  currentPoDuty: { userId: "u7", name: "Shasha" },
  actingPoDuty: null,
  poDutyUnavailable: false,
  mayIssue: true,
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
    serviceCaseNo: null,
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
  apiFetch.mockImplementation((url: string) => Promise.resolve(respond(url)));
  // The rail's remembered open/closed choice must not leak between tests.
  localStorage.clear();
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

  it("Approval Status is the approval FACT — Need approval / No approval needed", async () => {
    await loaded();
    const grid = screen.getByTestId("register-column");
    // REQ-0001's switch was ON and nobody decided; REQ-0002/3 never asked.
    expect(within(grid).getByText("Need approval")).toBeInTheDocument();
    expect(within(grid).getAllByText("No approval needed").length).toBe(2);
    // The second line names the REAL approver, only while approval is needed.
    expect(screen.getByTestId(`mp-approver-${REQ1}`)).toHaveTextContent("Jess approves");
  });

  it("no money renders anywhere — purchasing has no money", async () => {
    await loaded();
    expect(document.body.textContent).not.toContain("RM ");
  });

  it("`+ Manual Purchase` is the page's create door — COPY-STANDARD's own word", async () => {
    await loaded();
    const btn = screen.getByTestId("manual-purchase-new-request");
    expect(btn).toHaveTextContent("+ Manual Purchase");
    expect(btn).toHaveTextContent(MW.newRequest);
  });

  it("Purpose is NOT a parent column (Card 04); a retired word survives on the object", async () => {
    seedDetail(false);
    await loaded();
    const grid = screen.getByTestId("register-column");
    // The parent table carries no Purpose column and no relabelled word —
    // purpose lives in the rail, the expansion context and the object.
    expect(within(grid).queryByText("Purchase Purpose")).toBeNull();
    expect(within(grid).queryByText("Need for")).toBeNull();
    // The object still prints the RETIRED row's own truthful word.
    fireEvent.click(screen.getByText("REQ-0001", { selector: "button" }));
    await screen.findByTestId("mp-detail");
    expect(screen.getByTestId("mp-detail").textContent).toContain("Display");
    expect(screen.getByTestId("mp-detail").textContent).not.toContain("Showroom Display");
  });
});

/**
 * ⭐ CARD 03 — THE LEFT FILTER RAIL (owner ruling 2026-08-28).
 *
 * The shared 240px `FilterRail` shell Card 02-C built, carrying exactly four
 * sections: TO ORDER (three derived request states) · PURCHASE PURPOSE (the
 * approved five) · PRODUCT (the Catalog's categories) · SUPPLIER (actual
 * names, dynamic, alphabetical). Navigation, not selection: no checkboxes,
 * one filter per section, sections AND together, each `All …` clears only
 * its own section, and the empty filter is the permanent Register — ordered
 * history included.
 */
describe("Card 03 · the left filter rail", () => {
  it("draws the shared 240px FilterRail shell — not the legacy 200px rail", async () => {
    await loaded();
    const rail = screen.getByTestId("manual-purchase-rail");
    expect(rail.className).toContain("w-[240px]");
    expect(rail.className).not.toContain("w-[200px]");
    // Document order: the rail comes BEFORE the register column.
    const grid = screen.getByTestId("register-column");
    expect(
      rail.compareDocumentPosition(grid) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("renders exactly the approved groups and rows, in the approved order", async () => {
    await loaded();
    const rail = screen.getByTestId("manual-purchase-rail");
    const text = rail.textContent ?? "";
    const expected = [
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
      "Other Purchase",
      "PRODUCT",
      "All products",
      "Mattress",
      "Bedframe",
      "Sofa",
      "SUPPLIER",
      "All suppliers",
      // Actual names, alphabetical — from the payload, never hardcoded.
      "Hooka",
      "Office Co",
      "Ohana",
    ];
    let cursor = -1;
    for (const word of expected) {
      const at = text.indexOf(word, cursor + 1);
      expect(at, `"${word}" in order`).toBeGreaterThan(cursor);
      cursor = at;
    }
  });

  it("carries no checkbox and none of the banned rows", async () => {
    await loaded();
    const rail = screen.getByTestId("manual-purchase-rail");
    expect(rail.querySelectorAll("input[type='checkbox']").length).toBe(0);
    const rowLabels = [...rail.querySelectorAll("button")].map((b) =>
      (b.textContent ?? "").replace(/\d+$/, "").trim(),
    );
    for (const banned of [
      "Supplier not selected",
      "No supplier",
      "Not in catalog",
      "Need price",
      "Ordered",
      "Part received",
      "Received",
      "Arrived",
      "Cancelled",
      "My drafts",
      "Need correction",
      "Display",
      "Warranty",
      "Office",
      "Spare Parts",
      "Management Purchase",
    ]) {
      expect(rowLabels, `banned row "${banned}"`).not.toContain(banned);
    }
    expect(rail.textContent).not.toContain("ORDER TIMING");
    expect(rail.textContent).not.toContain("Queues");
    expect(rail.textContent).not.toMatch(/safety days/i);
  });

  it("counts are unique requests, zero printed rather than hidden", async () => {
    await loaded();
    expect(screen.getByTestId("mp-to-order-not_ordered").textContent).toContain("2");
    expect(screen.getByTestId("mp-to-order-need_approval").textContent).toContain("1");
    expect(screen.getByTestId("mp-to-order-ready_to_order").textContent).toContain("1");
    // Zero is a fact, not an absence:
    expect(screen.getByTestId("mp-purpose-service_case").textContent).toContain("0");
    // The Catalog decides PRODUCT: `MATTRESS-LOOK-9` has no Catalog category,
    // so Mattress is honestly 0 whatever the SKU text screams.
    expect(screen.getByTestId("mp-product-mattress").textContent).toContain("0");
    expect(screen.getByTestId("mp-product-sofa").textContent).toContain("1");
    expect(screen.getByTestId("mp-product-bedframe").textContent).toContain("1");
  });

  it("the default Register keeps ordered history; `All not ordered` drops it", async () => {
    await loaded();
    expect(screen.getByText("REQ-0003")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("mp-to-order-not_ordered"));
    expect(screen.queryByText("REQ-0003")).toBeNull();
    expect(screen.getByText("REQ-0001")).toBeInTheDocument();
    expect(screen.getByText("REQ-0002")).toBeInTheDocument();
    // A second click clears the row — the permanent Register returns whole.
    fireEvent.click(screen.getByTestId("mp-to-order-not_ordered"));
    expect(screen.getByText("REQ-0003")).toBeInTheDocument();
  });

  it("`Need approval` is the derived awaiting-approver truth", async () => {
    await loaded();
    fireEvent.click(screen.getByTestId("mp-to-order-need_approval"));
    expect(screen.getByText("REQ-0001")).toBeInTheDocument();
    expect(screen.queryByText("REQ-0002")).toBeNull();
    expect(screen.queryByText("REQ-0003")).toBeNull();
  });

  it("a purpose row narrows; `All purposes` clears only its own section", async () => {
    await loaded();
    fireEvent.click(screen.getByTestId("mp-purpose-subsidiary_purchase"));
    expect(screen.getByText("REQ-0003")).toBeInTheDocument();
    expect(screen.queryByText("REQ-0001")).toBeNull();
    fireEvent.click(screen.getByTestId("mp-purpose-all"));
    expect(screen.getByText("REQ-0001")).toBeInTheDocument();
    expect(screen.getByText("REQ-0002")).toBeInTheDocument();
    expect(screen.getByText("REQ-0003")).toBeInTheDocument();
  });

  it("a retired-purpose request lives under `All purposes` and matches no approved row", async () => {
    await loaded();
    for (const value of [
      "ready_stock",
      "showroom_display",
      "service_case",
      "internal_staff_purchase",
      "subsidiary_purchase",
    ]) {
      fireEvent.click(screen.getByTestId(`mp-purpose-${value}`));
      // REQ-0001 (`display`, retired) never answers an approved purpose row.
      expect(screen.queryByText("REQ-0001"), value).toBeNull();
      fireEvent.click(screen.getByTestId(`mp-purpose-${value}`));
    }
    expect(screen.getByText("REQ-0001")).toBeInTheDocument();
  });

  it("PRODUCT filters by the Catalog's category, never SKU text", async () => {
    await loaded();
    fireEvent.click(screen.getByTestId("mp-product-mattress"));
    // `MATTRESS-LOOK-9`'s request does NOT match — Catalog said nothing.
    expect(screen.queryByText("REQ-0002")).toBeNull();
    expect(screen.queryByText("REQ-0001")).toBeNull();
    fireEvent.click(screen.getByTestId("mp-product-sofa"));
    expect(screen.getByText("REQ-0001")).toBeInTheDocument();
    expect(screen.queryByText("REQ-0003")).toBeNull();
  });

  it("SUPPLIER rows are actual names that filter; sections combine with AND", async () => {
    await loaded();
    // Hooka is only REQ-0003's supplier.
    fireEvent.click(screen.getByTestId("mp-supplier-Hooka"));
    expect(screen.getByText("REQ-0003")).toBeInTheDocument();
    expect(screen.queryByText("REQ-0001")).toBeNull();
    // AND with TO ORDER: Hooka + Need approval matches nothing — an unmatched
    // supplier row drops, but the SELECTED one survives with its honest 0.
    fireEvent.click(screen.getByTestId("mp-to-order-need_approval"));
    expect(screen.queryByText("REQ-0003")).toBeNull();
    expect(screen.getByTestId("mp-supplier-Hooka").textContent).toContain("0");
    // Ohana + Need approval shows exactly REQ-0001 — the AND of both.
    fireEvent.click(screen.getByTestId("mp-supplier-Ohana"));
    expect(screen.getByText("REQ-0001")).toBeInTheDocument();
    expect(screen.queryByText("REQ-0002")).toBeNull();
    fireEvent.click(screen.getByTestId("mp-supplier-all"));
    fireEvent.click(screen.getByTestId("mp-to-order-need_approval"));
    expect(screen.getByText("REQ-0003")).toBeInTheDocument();
  });

  it("`Hide filters` collapses the whole rail; the toolbar then shows it back", async () => {
    await loaded();
    fireEvent.click(
      within(screen.getByTestId("manual-purchase-rail")).getByLabelText("Hide filters"),
    );
    // The whole rail leaves — no 60px icon strip — and the Register keeps
    // the width; the choice is remembered for this staff browser.
    expect(screen.queryByTestId("manual-purchase-rail")).toBeNull();
    expect(localStorage.getItem("carres.manualPurchase.filterRail.v1")).toBe("0");
    fireEvent.click(screen.getByTestId("manual-purchase-show-filters"));
    expect(screen.getByTestId("manual-purchase-rail")).toBeInTheDocument();
  });

  it("a Catalog hole never becomes a rail facet — the request stays visible", async () => {
    await loaded();
    // REQ-0002's line has no Catalog category; no `Not in catalog` row grew,
    // and the request is simply in the permanent Register.
    expect(screen.getByText("REQ-0002")).toBeInTheDocument();
    const rail = screen.getByTestId("manual-purchase-rail");
    expect(rail.textContent).not.toContain("Not in catalog");
  });
});

describe("the create workspace — full page, never a dialog (card §3)", () => {
  it("offers exactly the approved six purposes (Cards 03/04)", () => {
    // The list a control may render IS the shared constant (0322's law); the
    // Select renders from it verbatim. Management folds under Internal Staff
    // Purchase; the retired four are not offerable.
    expect(DEMAND_PURPOSES.map((p) => p.label)).toEqual([
      "Ready Stock",
      "Showroom Display",
      "Service Case",
      "Internal Staff Purchase",
      "Subsidiary Purchase",
      "Other Purchase",
    ]);
  });

  it("Send NAMES its gap — the date; a routine purpose asks no duplicate Why (Card 04)", async () => {
    await openWorkspace();
    // Ready Stock is the default purpose — there is NO Why field to fill.
    expect(screen.queryByTestId("mp-why")).toBeNull();
    fireEvent.focus(document.getElementById("mp-item-0")!);
    fireEvent.click(pickRow("5539-2NA"));
    // No date yet — the disabled button says which fact is missing.
    expect(screen.getByTestId("mp-send")).toBeDisabled();
    expect(screen.getByTestId("mp-send")).toHaveTextContent(MW.sendNeedsDate);

    pickNeededBy();
    // Date + item is ALL a routine purpose asks — Send goes live.
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

  it("Send stays off until an item is picked, even with a date", async () => {
    await openWorkspace();
    pickNeededBy();
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

  it("a refused decide prints the approved two lines, never the raw code word", async () => {
    await openDetail(true);
    await waitFor(() =>
      expect((screen.getByTestId("mp-cut-0") as HTMLInputElement).value).toBe("0"),
    );
    const base = apiFetch.getMockImplementation()!;
    apiFetch.mockImplementation((url: string, init?: RequestInit) => {
      if (String(url).includes("/decide")) {
        // The door's 42501, already translated by the API into the fact
        // and the act (2026-08-29 — `forbidden` alone reached production).
        return Promise.reject(
          Object.assign(new Error("forbidden"), {
            body: {
              code: "not_purchase_approver",
              message: "Only the approver may decide this purchase.",
              action: "Ask Jess to approve or refuse it.",
            },
          }),
        );
      }
      return base(url, init);
    });
    fireEvent.click(screen.getByTestId("mp-approve"));
    const err = await screen.findByTestId("mp-decide-error");
    expect(err.textContent).toBe(
      "Only the approver may decide this purchase. Ask Jess to approve or refuse it.",
    );
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
 * THE CONTROL BAND (CARD-2026-08-19-purchasing-rail-corrections §4):
 * `+ New request` lives in the register's control band — no empty band above
 * the grid. (The §3 200px rail itself was superseded by Card 03's shared
 * 240px `FilterRail`, proven above.)
 */
describe("the control band (2026-08-19)", () => {
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


/**
 * ⭐ CARD 03 §3 — THE ROW AND THE OBJECT NAME THE REAL APPROVAL OWNER.
 * The rail says `Need approval`; beside `Waiting for approval` the resolved
 * `ops_manager` holder's name prints as the governed sentence.
 */
describe("Card 03 §3 · the approval owner's name", () => {
  it("the waiting row prints `Jess approves`; decided rows print nothing", async () => {
    await loaded();
    expect(screen.getByTestId(`mp-approver-${REQ1}`)).toHaveTextContent("Jess approves");
    expect(screen.queryByTestId(`mp-approver-${REQ2}`)).toBeNull();
  });

  it("the object detail names the owner while the request waits", async () => {
    seedDetail(false);
    await loaded();
    fireEvent.click(screen.getByText("REQ-0001", { selector: "button" }));
    await screen.findByTestId("mp-detail");
    expect(screen.getByTestId("mp-detail-approver")).toHaveTextContent("Jess approves");
  });

  it("no approver resolved prints nothing — an absent name is honest", async () => {
    apiFetch.mockImplementation((url: string) => {
      if (url.includes("/purchasing/requests/detail/")) return Promise.resolve(DETAIL);
      if (url.includes("/purchasing/requests")) {
        return Promise.resolve({ ...REGISTER, approvers: [] });
      }
      return Promise.resolve(respond(url));
    });
    await loaded();
    expect(screen.queryByTestId(`mp-approver-${REQ1}`)).toBeNull();
  });
});

/**
 * ⭐ PURCHASING CARD 04 — THE PERMANENT REGISTER
 * (docs/cards/CARD-2026-08-29-purchasing-04-manual-purchase-permanent-register.md).
 *
 * Eleven columns in the Card's exact order · newest Requested Date first ·
 * PO No from real lineage only · Items in Catalog human words · the
 * structured For · a read-only expansion · selection admitting only
 * Ready-to-order remainder · PO Duty existing ONLY beside a selection.
 */
describe("Card 04 · the eleven columns, in the Card's exact order", () => {
  it("renders the exact heads, in order — and none of the banned columns", async () => {
    await loaded();
    const grid = screen.getByTestId("register-column");
    const heads = [...grid.querySelectorAll("thead th")]
      .map((th) => (th.textContent ?? "").replace(/[AV]$/, "").trim())
      .filter((t) => t !== "");
    expect(heads).toEqual([
      "Requested Date",
      "Approval Status",
      "Manual Purchase No",
      "PO No",
      "Needed By",
      "For",
      "Items",
      "Qty",
      "Supplier",
      "Deliver To",
      "Requested By",
    ]);
    for (const banned of [
      "Purchase Purpose",
      "Order late",
      "Need price",
      "Part received",
      "Received",
      "Arrived",
      "Work",
      "Next action",
      "Reason",
      "Remark",
      "Price",
    ]) {
      expect(heads, `banned column "${banned}"`).not.toContain(banned);
    }
  });

  it("newest Requested Date leads by default — the actual created_at", async () => {
    await loaded();
    const grid = screen.getByTestId("register-column");
    const order = [...grid.querySelectorAll("tbody tr")]
      .map((tr) => tr.textContent ?? "")
      .filter((t) => /REQ-\d{4}/.test(t))
      .map((t) => t.match(/REQ-\d{4}/)![0]);
    // REQ-0002 (19 Aug 03:00) · REQ-0001 (19 Aug 02:00) · REQ-0003 (18 Aug).
    expect(order).toEqual(["REQ-0002", "REQ-0001", "REQ-0003"]);
  });

  it("PO No is real lineage — the actual number clickable, absence named", async () => {
    await loaded();
    // REQ-0003's line was issued onto PO-9001 → the ACTUAL po_no prints and
    // opens the Purchase Orders page; never a UUID.
    const link = screen.getByTestId(`mp-po-link-${REQ3}`);
    expect(link).toHaveTextContent("PO-20260818-9001");
    fireEvent.click(link);
    expect(navigate).toHaveBeenCalledWith(
      "/operation/procurement?po=PO-20260818-9001",
    );
    expect(document.body.textContent).not.toContain("PO-9001,");
    // A request with no lineage says so in the governed sentence.
    expect(screen.getAllByText("Not ordered yet").length).toBeGreaterThan(0);
  });

  it("Items speak the Catalog's human words; the SKU stays searchable off-screen", async () => {
    await loaded();
    const grid = screen.getByTestId("register-column");
    expect(within(grid).getByText("Ohana 2 Seater")).toBeInTheDocument();
    expect(within(grid).getByText("Atlas K")).toBeInTheDocument();
    // The parent cell does NOT print the SKU — it lives in the expansion.
    expect(within(grid).queryByText("BED-K-01")).toBeNull();
  });

  it("For is the structured object — subsidiary name, destination context, honest blank", async () => {
    await loaded();
    const grid = screen.getByTestId("register-column");
    // Subsidiary Purchase names the actual company.
    expect(within(grid).getByText("HOUZS Sdn Bhd")).toBeInTheDocument();
    // Ready Stock shows the governed destination context.
    expect(within(grid).getAllByText("HOUZS Balakong").length).toBeGreaterThan(0);
    // The retired `display` request has no structured For — nothing prints,
    // and its old free-text why is NOT borrowed into the column.
    expect(within(grid).queryByText(/Balakong floor sofa/)).toBeNull();
  });

  it("Requested By is the real staff name — never an email, role or (you)", async () => {
    await loaded();
    const grid = screen.getByTestId("register-column");
    expect(within(grid).getAllByText("Siti").length).toBeGreaterThan(0);
    expect(grid.textContent).not.toContain("(you)");
    expect(grid.textContent).not.toContain("@carres.com");
  });
});

describe("Card 04 · the read-only expansion", () => {
  it("shows exact per-line quantities and lineage, and offers no action", async () => {
    await loaded();
    fireEvent.click(screen.getByTestId(`mp-expand-${REQ3}`));
    const box = await screen.findByTestId(`mp-expansion-${REQ3}`);
    const heads = [...box.querySelectorAll("th")].map((th) => th.textContent?.trim());
    expect(heads).toEqual([
      "SKU",
      "Item",
      "Requested Qty",
      "Approved Qty",
      "Ordered Qty",
      "Still To Order",
      "Supplier",
      "Deliver To",
      "PO No",
    ]);
    /* `box.querySelector("tbody tr")` would match MY thead's tr — the whole
       expansion lives inside the parent grid's tbody, and querySelector lets
       the `tbody` part match that outer ancestor. Query the tds directly. */
    const cells = [...box.querySelectorAll("td")].map((td) => td.textContent?.trim());
    // SKU · Item · asked 2 · approved (blank — nobody cut) · ordered 2 ·
    // still 0 · the Catalog-derived supplier · the governed destination ·
    // the ACTUAL PO number.
    expect(cells).toEqual([
      "BED-K-01",
      "Atlas K",
      "2",
      "",
      "2",
      "0",
      "Hooka",
      "HOUZS Balakong",
      "PO-20260818-9001",
    ]);
    // Read-only: no control of any kind lives inside the expansion — no
    // Approve/Refuse/Receive button, no price editor, no PO creation.
    expect(box.querySelectorAll("button, input, select, textarea").length).toBe(0);
    expect(box.textContent).not.toContain("Issue");
  });
});

describe("Card 04 · selection and PO Duty", () => {
  it("only Ready-to-order remainder takes the tick", async () => {
    await loaded();
    // REQ-0002: ready, 3 remaining → selectable.
    expect(screen.getByTestId(`mp-select-${REQ2}`)).toBeEnabled();
    // REQ-0001 needs approval; REQ-0003 is fully ordered — both refuse.
    expect(screen.getByTestId(`mp-select-${REQ1}`)).toBeDisabled();
    expect(screen.getByTestId(`mp-select-${REQ3}`)).toBeDisabled();
  });

  it("PO Duty exists NOWHERE until a selection; then once, beside Issue PO", async () => {
    await loaded();
    expect(screen.queryByTestId("mp-po-duty")).toBeNull();
    expect(screen.queryByTestId("mp-selection-bar")).toBeNull();
    expect(document.body.textContent).not.toContain("PO duty");

    fireEvent.click(screen.getByTestId(`mp-select-${REQ2}`));
    const bar = await screen.findByTestId("mp-selection-bar");
    // The truthful sentence, pluralised from facts.
    expect(screen.getByTestId("mp-selection-sentence")).toHaveTextContent(
      "1 selected · 3 units · Issue 1 PO",
    );
    // The resolved person, once, beside the one issue action.
    expect(within(bar).getByTestId("mp-po-duty")).toHaveTextContent(
      "Shasha holds PO duty",
    );
    expect(within(bar).getByTestId("mp-issue-selected")).toBeInTheDocument();
    expect(screen.getAllByTestId("mp-po-duty").length).toBe(1);

    // Unticking removes the bar — and the duty with it.
    fireEvent.click(screen.getByTestId(`mp-select-${REQ2}`));
    expect(screen.queryByTestId("mp-selection-bar")).toBeNull();
    expect(screen.queryByTestId("mp-po-duty")).toBeNull();
  });

  it("Issue PO declares the reviewed prices and issues the selection together", async () => {
    await loaded();
    fireEvent.click(screen.getByTestId(`mp-select-${REQ2}`));
    fireEvent.click(await screen.findByTestId("mp-issue-selected"));
    await waitFor(() => {
      const costsRead = apiFetch.mock.calls.find((c) =>
        String(c[0]).includes("/issue-costs"),
      );
      expect(costsRead).toBeTruthy();
      const post = apiFetch.mock.calls.find((c) =>
        String(c[0]).endsWith("/purchasing/requests/issue"),
      );
      expect(post).toBeTruthy();
      const sent = JSON.parse(String((post![1] as RequestInit).body));
      expect(sent.requestIds).toEqual([REQ2]);
      expect(sent.together).toBe(true);
      expect(sent.expectedCosts).toEqual({ "5539-2NA": 850 });
    });
  });

  it("an operator who is not the actor sees the duty's name, not the button", async () => {
    apiFetch.mockImplementation((url: string) => {
      if (url.includes("/purchasing/requests/detail/")) return Promise.resolve(DETAIL);
      if (url.includes("/purchasing/requests/issue-costs")) {
        return Promise.resolve({ costs: [] });
      }
      if (url.includes("/purchasing/requests")) {
        return Promise.resolve({ ...REGISTER, mayIssue: false });
      }
      if (url.includes("pick-items")) return Promise.resolve(PICK);
      return Promise.resolve({});
    });
    await loaded();
    fireEvent.click(screen.getByTestId(`mp-select-${REQ2}`));
    const bar = await screen.findByTestId("mp-selection-bar");
    expect(within(bar).getByTestId("mp-po-duty")).toHaveTextContent(
      "Shasha holds PO duty",
    );
    expect(within(bar).queryByTestId("mp-issue-selected")).toBeNull();
  });
});

describe("Card 04 · the export derives the cell's own truth", () => {
  it("Items / Supplier / PO No export what the cell shows — never the search tokens", async () => {
    await loaded();
    // The columns are read from the live component via the DataGrid contract:
    // exportValue must equal the displayed summary, not the searchValue that
    // bundles SKUs and per-line names for the search box.
    const grid = screen.getByTestId("register-column");
    // Displayed truths from the fixture:
    expect(within(grid).getByText("Atlas K")).toBeInTheDocument(); // not "Atlas K BED-K-01"
    expect(within(grid).getByText("Hooka")).toBeInTheDocument();
    // The search box still finds by SKU (the token rides searchValue only).
    expect(within(grid).queryByText("BED-K-01")).toBeNull();
  });
});
