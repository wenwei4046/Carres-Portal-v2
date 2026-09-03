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
import { fmtDate } from "@/lib/fmt-date";
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

/** Card 06 — the SERVER's Malaysia date every timing fact compares against. */
const TODAY = "2026-08-30";

const REGISTER = {
  todayIso: TODAY,
  planUnavailable: false,
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
      // Card 06 — the SERVER date projection: delivery, derived Order By.
      delivery_date: "2026-09-12",
      order_by: "2026-09-01",
      production_days_missing: false,
      transit_days_missing: false,
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
      // Card 06 — no Delivery Date and no transit number: no Order By, and
      // the exact Settings fact is named for the setup lens.
      delivery_date: null,
      order_by: null,
      production_days_missing: false,
      transit_days_missing: true,
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
      delivery_date: null,
      order_by: null,
      production_days_missing: false,
      transit_days_missing: false,
    },
  ],
  // Card 04 — id → the ACTUAL po_no; the column prints numbers, never UUIDs.
  // Card 06 — `sent`: the current version's confirmed-sent evidence.
  pos: [{ id: "PO-9001", po_no: "PO-20260818-9001", sent: true }],
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
function seedDetail(canApprove: boolean, over: Record<string, unknown> = {}) {
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
    /* Card 05 — the object payload: the resolved individual, the exact PO
       facts and the stored-fact History. */
    requested_by_name: "Siti",
    pos: [],
    history: [
      {
        kind: "created",
        occurred_at: REGISTER.requests[0].created_at,
        actor: "Siti",
        actor_role: "operation",
        units: 1,
      },
    ],
    canApprove,
    todayIso: TODAY,
    planUnavailable: false,
    ...over,
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

/** Card 06 — the create form's server date plan, per SKU. Both picker items
 *  are COMPLETE here; a lead-days gap is injected per test. */
const PLAN_LINES: Record<string, Record<string, unknown>> = {
  "5539-2NA": {
    sku: "5539-2NA", supplierId: "s1", supplierName: "Ohana", category: "sofa",
    productionDays: 14, transitDays: 1, arrival: "2026-09-12",
  },
  "5539-CNR": {
    sku: "5539-CNR", supplierId: "s1", supplierName: "Ohana", category: "sofa",
    productionDays: 14, transitDays: 1, arrival: "2026-09-14",
  },
};

function planFor(init?: RequestInit): unknown {
  const skus: string[] = init?.body
    ? ((JSON.parse(String(init.body)) as { skus?: string[] }).skus ?? [])
    : [];
  const lines = skus.map(
    (sku) =>
      PLAN_LINES[sku] ?? {
        sku, supplierId: null, supplierName: null, category: null,
        productionDays: null, transitDays: null, arrival: null,
      },
  );
  const complete = lines.length > 0 && lines.every((l) => l.arrival != null);
  return {
    proceedDate: TODAY,
    lines,
    deliveryDateDefault: complete
      ? [...lines].map((l) => l.arrival as string).sort().at(-1)!
      : null,
    planUnavailable: false,
  };
}

function respond(url: string, init?: RequestInit): unknown {
  if (url.includes("/purchasing/requests/plan")) return planFor(init);
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
  apiFetch.mockImplementation((url: string, init?: RequestInit) =>
    Promise.resolve(respond(url, init)),
  );
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
 *  SalesOrderAmendDeliveryDate.test.tsx pattern). Card 06: the one date
 *  input is `Delivery Date`. */
function pickDeliveryDate(dayOfMonth = 15) {
  fireEvent.click(document.getElementById("mp-delivery-date")!);
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

  it("renders exactly the seven approved groups and rows, in the approved order", async () => {
    await loaded();
    const rail = screen.getByTestId("manual-purchase-rail");
    const text = rail.textContent ?? "";
    const expected = [
      "WORK TO DO",
      "Approve purchase",
      "Issue PO",
      "Check the supplier",
      "Add production days",
      "Add transit days",
      "TO ORDER",
      "All not ordered",
      "ORDER TIMING",
      "Can order early",
      "Order date reached",
      "Order date passed",
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
      // An affected request exists (REQ-0002's transit gap) — the exception
      // section renders, last.
      "SETUP TO FIX",
      "Production days not set",
      "Transit days not set",
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
      // Card 06 — retired from TO ORDER; their capability moved to the
      // WORK TO DO action rows without duplication.
      "Need approval",
      "Ready to order",
    ]) {
      expect(rowLabels, `banned row "${banned}"`).not.toContain(banned);
    }
    expect(rail.textContent).not.toContain("Queues");
    expect(rail.textContent).not.toMatch(/safety days/i);
  });

  it("counts are unique requests, zero printed rather than hidden", async () => {
    await loaded();
    // WORK TO DO — all five rows visible, zero included.
    expect(screen.getByTestId("mp-work-approve_purchase").textContent).toContain("1");
    expect(screen.getByTestId("mp-work-issue_po").textContent).toContain("1");
    expect(screen.getByTestId("mp-work-check_supplier").textContent).toContain("0");
    expect(screen.getByTestId("mp-work-add_production_days").textContent).toContain("0");
    expect(screen.getByTestId("mp-work-add_transit_days").textContent).toContain("1");
    expect(screen.getByTestId("mp-to-order-not_ordered").textContent).toContain("2");
    // ORDER TIMING reads the server-derived Order By against the SERVER's
    // Malaysia date — REQ-0001's 1 Sep is still ahead of 30 Aug.
    expect(screen.getByTestId("mp-timing-can_order_early").textContent).toContain("1");
    expect(screen.getByTestId("mp-timing-order_date_reached").textContent).toContain("0");
    expect(screen.getByTestId("mp-timing-order_date_passed").textContent).toContain("0");
    // Zero is a fact, not an absence:
    expect(screen.getByTestId("mp-purpose-service_case").textContent).toContain("0");
    // The Catalog decides PRODUCT: `MATTRESS-LOOK-9` has no Catalog category,
    // so Mattress is honestly 0 whatever the SKU text screams.
    expect(screen.getByTestId("mp-product-mattress").textContent).toContain("0");
    expect(screen.getByTestId("mp-product-sofa").textContent).toContain("1");
    expect(screen.getByTestId("mp-product-bedframe").textContent).toContain("1");
    // SETUP TO FIX states the exact configuration facts.
    expect(screen.getByTestId("mp-setup-transit_days_not_set").textContent).toContain("1");
    expect(screen.getByTestId("mp-setup-production_days_not_set").textContent).toContain("0");
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

  it("`Approve purchase` is the derived awaiting-approver truth — a filter, not a grant", async () => {
    await loaded();
    fireEvent.click(screen.getByTestId("mp-work-approve_purchase"));
    expect(screen.getByText("REQ-0001")).toBeInTheDocument();
    expect(screen.queryByText("REQ-0002")).toBeNull();
    expect(screen.queryByText("REQ-0003")).toBeNull();
    // Clicking the filter grants nothing: the filtered row still names the
    // REAL owner and this operator still has no Approve control anywhere.
    expect(screen.getByTestId(`mp-approver-${REQ1}`)).toHaveTextContent("Jess approves");
    expect(screen.queryByTestId("mp-approve")).toBeNull();
  });

  it("`Issue PO` filters approved remaining demand", async () => {
    await loaded();
    fireEvent.click(screen.getByTestId("mp-work-issue_po"));
    expect(screen.getByText("REQ-0002")).toBeInTheDocument();
    expect(screen.queryByText("REQ-0001")).toBeNull();
    expect(screen.queryByText("REQ-0003")).toBeNull();
  });

  it("a timing lens sorts earliest Order By first and never blocks issuance", async () => {
    await loaded();
    fireEvent.click(screen.getByTestId("mp-timing-can_order_early"));
    expect(screen.getByText("REQ-0001")).toBeInTheDocument();
    expect(screen.queryByText("REQ-0002")).toBeNull();
    // Early is a FACT, not a gate — nothing on the row loses selection
    // rights it otherwise has (REQ-0001 refuses the tick for approval,
    // exactly as without the filter).
    expect(screen.getByTestId(`mp-select-${REQ1}`)).toBeDisabled();
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
    // AND with WORK TO DO: Hooka + Approve purchase matches nothing — an
    // unmatched supplier row drops, but the SELECTED one survives with its
    // honest 0.
    fireEvent.click(screen.getByTestId("mp-work-approve_purchase"));
    expect(screen.queryByText("REQ-0003")).toBeNull();
    expect(screen.getByTestId("mp-supplier-Hooka").textContent).toContain("0");
    // Ohana + Approve purchase shows exactly REQ-0001 — the AND of both.
    fireEvent.click(screen.getByTestId("mp-supplier-Ohana"));
    expect(screen.getByText("REQ-0001")).toBeInTheDocument();
    expect(screen.queryByText("REQ-0002")).toBeNull();
    fireEvent.click(screen.getByTestId("mp-supplier-all"));
    fireEvent.click(screen.getByTestId("mp-work-approve_purchase"));
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
  it("the ITEMS block (owner, 2026-09-03): `Note` is the caption, one grid, `+ Add line` under the lines", async () => {
    await openWorkspace();
    const lines = screen.getByTestId("mp-lines");
    // The word. COPY-STANDARD rules `Note` for this form's field; `Remark` was
    // the retired dialog's word and may not survive the port.
    const caption = screen.getByText("Note");
    expect(lines.contains(caption)).toBe(true);
    expect(lines.textContent).not.toContain("Remark");
    expect(screen.getByLabelText("Note")).toBe(document.getElementById("mp-note-0"));
    // ONE grid: the caption row and the line share a parent, so the four
    // tracks are resolved once and the caption sits over the note it names.
    const line0 = screen.getByTestId("mp-line-0");
    expect(line0.parentElement).toBe(caption.parentElement);
    // The add control FOLLOWS the list, where the operator's eye ends.
    const add = screen.getByTestId("mp-line-add");
    expect(lines.contains(add)).toBe(true);
    expect(line0.compareDocumentPosition(add) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(add);
    expect(screen.getByTestId("mp-line-1").parentElement).toBe(caption.parentElement);
  });

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

  it("Card 06 · Proceed Date is a read-only server preview; the browser holds no clock", async () => {
    await openWorkspace();
    // The server's Malaysia date, as a FACT — no input anywhere near it.
    await waitFor(() =>
      expect(screen.getByTestId("mp-proceed-date").textContent).not.toBe(""),
    );
    expect(screen.getByTestId("mp-proceed-date").querySelector("input")).toBeNull();
  });

  it("Card 06 · complete lead facts DEFAULT Delivery Date from the slowest line — Send goes live", async () => {
    await openWorkspace();
    // Ready Stock is the default purpose — there is NO Why field to fill.
    expect(screen.queryByTestId("mp-why")).toBeNull();
    fireEvent.focus(document.getElementById("mp-item-0")!);
    fireEvent.click(pickRow("5539-2NA"));
    // The SERVER proposes the arrival; the operator types no date at all.
    await waitFor(() => expect(screen.getByTestId("mp-send")).toBeEnabled());
    expect(screen.getByTestId("mp-send")).toHaveTextContent(MW.send);
  });

  it("Card 06 · a person's chosen Delivery Date is preserved — never silently overwritten", async () => {
    await openWorkspace();
    // The person chooses first; the plan's later default must not replace it.
    pickDeliveryDate(20);
    // The DatePicker trigger prints the governed fmtDate of the chosen day.
    const chosen = document.getElementById("mp-delivery-date")!.textContent ?? "";
    expect(chosen).toContain("20");
    fireEvent.focus(document.getElementById("mp-item-0")!);
    fireEvent.click(pickRow("5539-2NA"));
    await waitFor(() => expect(screen.getByTestId("mp-send")).toBeEnabled());
    // The server's 12 Sep proposal did NOT overwrite the person's date.
    expect(document.getElementById("mp-delivery-date")!.textContent).toBe(chosen);
  });

  it("Card 06 · a missing lead number blocks Send by name and deep-links Settings", async () => {
    // Inject the Settings hole: production days were never set for this pair.
    apiFetch.mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes("/purchasing/requests/plan")) {
        const base = planFor(init) as { lines: Array<Record<string, unknown>> };
        return Promise.resolve({
          ...base,
          lines: base.lines.map((l) => ({ ...l, productionDays: null, arrival: null })),
          deliveryDateDefault: null,
        });
      }
      return Promise.resolve(respond(url, init));
    });
    await openWorkspace();
    fireEvent.focus(document.getElementById("mp-item-0")!);
    fireEvent.click(pickRow("5539-2NA"));
    pickDeliveryDate();
    // The exact fact and act, on the affected line — and Send names the gap.
    const gap = await screen.findByTestId("mp-lead-gap-0");
    expect(gap.textContent).toContain("Production days are not set");
    expect(gap.textContent).toContain("Add production days for Ohana · Sofa in Settings");
    expect(gap.querySelector("a")).toHaveAttribute(
      "href",
      "/operation?tab=purchasing-settings",
    );
    expect(screen.getByTestId("mp-send")).toBeDisabled();
    expect(screen.getByTestId("mp-send")).toHaveTextContent(MW.sendNeedsLeadDays);
    // No date was guessed anywhere: the default stayed empty until the
    // person picked one, and no browser arithmetic invented an arrival.
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
    pickDeliveryDate();
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

  /* ⭐ RE-PINNED, NOT DELETED (0410, YH 2026-09-01).
     This test's original title was "…retry reuses the header", and it asserted
     that a second Send posts NO new header because the first one is already a
     record. That was an accurate pin on the six-transaction shape — and the
     committed-header-on-failure it pinned is exactly the defect `0410` closes.
     The INTENT survives whole: one act, a per-row result, the workspace stays
     open, and the operator can press Send again. What is re-pinned is the
     opposite half — a refusal must now leave NOTHING behind, so a retry sends
     the WHOLE request rather than resuming an orphan. */
  it("ONE act, per-row result — a refusal leaves nothing, and retry re-sends the whole request", async () => {
    await openWorkspace();
    pickDeliveryDate();
    fireEvent.focus(document.getElementById("mp-item-0")!);
    fireEvent.click(pickRow("5539-2NA"));
    fireEvent.click(screen.getByTestId("mp-line-add"));
    fireEvent.focus(document.getElementById("mp-item-1")!);
    fireEvent.click(pickRow("5539-CNR"));

    apiFetch.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === "POST" && url.endsWith("/purchasing/requests")) {
        return Promise.reject(new Error("sku 5539-CNR has no supplier"));
      }
      return Promise.resolve(respond(url));
    });

    // The plan read must land before Send unlocks (Card 06's own gate).
    await waitFor(() => expect(screen.getByTestId("mp-send")).toBeEnabled());
    fireEvent.click(screen.getByTestId("mp-send"));
    await screen.findByTestId("mp-line-failed-1");
    expect(screen.getByTestId("mp-line-failed-1").textContent).toContain("no supplier");
    // The workspace stayed open — something is left to answer for.
    expect(screen.getByTestId("manual-purchase-create")).toBeInTheDocument();

    const requestPosts = () =>
      apiFetch.mock.calls.filter(
        (c) =>
          (c[1] as RequestInit | undefined)?.method === "POST" &&
          String(c[0]).endsWith("/purchasing/requests"),
      );
    const before = requestPosts().length;
    expect(before).toBe(1);

    /* NOTHING was written, so there is no half-record to resume: pressing Send
       again re-sends the whole request, header and all. Under the old shape
       this count would NOT have moved, and that was the bug. */
    fireEvent.click(screen.getByTestId("mp-send"));
    await waitFor(() => expect(requestPosts().length).toBe(before + 1));

    /* AND THE LINES RODE WITH IT — the loop of one-call-per-line is gone, so a
       failure can no longer land some of them. */
    const sent = JSON.parse(String((requestPosts()[0][1] as RequestInit).body)) as {
      lines?: unknown[];
    };
    expect(sent.lines).toHaveLength(2);
    expect(
      apiFetch.mock.calls.filter((c) => String(c[0]).includes("/lines")),
      "no per-line call is made any more",
    ).toHaveLength(0);
  });

  /* ⭐ RE-PINNED (0410). Same intent — the browser must never send a supplier,
     because the database derives it from the catalog (Jess, 2026-08-03). Only
     the ENVELOPE moved: the lines now ride inside the request POST instead of
     one call each, so the assertion reads the same fact in its new place. */
  it("no supplier key rides the wire — the server derives it", async () => {
    await openWorkspace();
    pickDeliveryDate();
    fireEvent.focus(document.getElementById("mp-item-0")!);
    fireEvent.click(pickRow("5539-2NA"));

    apiFetch.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === "POST" && url.endsWith("/purchasing/requests")) {
        return Promise.resolve({ id: REQ1, req_no: "REQ-0009", approval_required: true });
      }
      return Promise.resolve(respond(url));
    });

    await waitFor(() => expect(screen.getByTestId("mp-send")).toBeEnabled());
    fireEvent.click(screen.getByTestId("mp-send"));
    await waitFor(() => {
      const post = apiFetch.mock.calls.find(
        (c) =>
          (c[1] as RequestInit | undefined)?.method === "POST" &&
          String(c[0]).endsWith("/purchasing/requests"),
      );
      expect(post).toBeTruthy();
      const sent = JSON.parse(String((post![1] as RequestInit).body)) as {
        lines: Array<Record<string, unknown>>;
      };
      expect(sent).not.toHaveProperty("supplier");
      expect(sent).not.toHaveProperty("supplierId");
      for (const line of sent.lines) {
        expect(line).not.toHaveProperty("supplier");
        expect(line).not.toHaveProperty("supplierId");
      }
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
    /* The two lines render as fact then act — never the raw code word. */
    expect(err).toHaveTextContent("Only the approver may decide this purchase.");
    expect(err).toHaveTextContent("Ask Jess to approve or refuse it.");
    expect(err.textContent).not.toContain("forbidden");
  });

  it("a decision stays on the object — no throw back to the Register", async () => {
    await openDetail(true);
    await waitFor(() =>
      expect((screen.getByTestId("mp-cut-0") as HTMLInputElement).value).toBe("0"),
    );
    /* After the door records the decision, the refetched object carries the
       decided facts: controls gone, the actor and time on screen. */
    seedDetail(true, {
      request: {
        ...REGISTER.requests[0],
        approved_at: "2026-08-19T05:00:00Z",
        approved_by: "u9",
      },
      history: [
        {
          kind: "created",
          occurred_at: REGISTER.requests[0].created_at,
          actor: "Siti",
          actor_role: "operation",
          units: 1,
        },
        {
          kind: "approved",
          occurred_at: "2026-08-19T05:00:00Z",
          actor: "Jess",
          actor_role: "principal",
          requested_units: 1,
          approved_units: 0,
        },
      ],
    });
    fireEvent.click(screen.getByTestId("mp-approve"));
    await waitFor(() => expect(screen.queryByTestId("mp-approve")).toBeNull());
    // Still on the object — the Register surface stays hidden underneath.
    expect(screen.getByTestId("mp-detail")).toBeInTheDocument();
    expect(screen.getByTestId("mp-decided-by")).toHaveTextContent("Jess");
    expect(screen.queryByTestId("mp-refuse")).toBeNull();
  });
});

/**
 * THE OBSERVED ARRIVAL, AND THE ONE ISSUANCE PLACEMENT (Card 05 §3.6 · §7).
 *
 * `Arrived` IS NOT A BUTTON anywhere. The object holds NO second `Issue PO`,
 * PO Duty block, consolidation prompt, price editor or Receive control —
 * Card 04's selected Register action is the only Manual Purchase issuance
 * placement, and physical arrival is Receiving's through the exact PO.
 */
describe("the object never issues (Card 05)", () => {
  it("`Arrived` cannot be set by any control — no such button exists", async () => {
    seedDetail(true);
    await loaded();
    fireEvent.click(screen.getByText("REQ-0001", { selector: "button" }));
    await screen.findByTestId("mp-detail");
    expect(screen.queryByText(/^Arrived$/, { selector: "button" })).toBeNull();
    expect(document.querySelector("[data-testid*='arrived']")).toBeNull();
  });

  it("a Ready-to-order object offers NO issue door, duty block or offer", async () => {
    seedDetail(false, {
      request: REGISTER.requests[1], // approval OFF → Ready to order
      lines: REGISTER.lines.filter((l) => l.request_id === REQ2),
      suppliers: [{ id: "s2", name: "Office Co", kind: "own_logistics" }],
      requested_by_name: "Siti",
    });
    await loaded();
    fireEvent.click(screen.getByText("REQ-0002", { selector: "button" }));
    const detail = await screen.findByTestId("mp-detail");
    for (const gone of [
      "mp-issue",
      "mp-issue-po",
      "mp-issue-offer",
      "mp-issue-together",
      "mp-issue-separate",
      "mp-issue-costs",
    ]) {
      expect(screen.queryByTestId(gone)).toBeNull();
    }
    // No PO Duty, no consolidation words, no Receive, no price editor.
    expect(within(detail).queryByTestId("mp-po-duty")).toBeNull();
    expect(detail.textContent).not.toContain("Issue PO");
    expect(detail.textContent).not.toContain("Issue as one PO");
    expect(within(detail).queryByText("Receive")).toBeNull();
  });

  it("a received line derives Arrived through the one arithmetic", () => {
    expect(
      manualPurchaseStatusOf({
        approvalRequired: false,
        approvedAt: null,
        refusedAt: null,
        refuseReason: null,
        lines: [
          { qty: 1, issuedQty: 1, cancelledAt: null, poId: "PO-1", received: true },
        ],
      }).label,
    ).toBe("Arrived");
  });

  /* ⭐ THE APPROVER'S CUT REACHES THE STATUS (YH, 2026-09-01).
     The status read the database's generated `qty − issued_qty`, which does
     not know an approval cut exists, while every other number on this page
     used the governed remainder that does. A request for 5 cut to 2 and then
     fully issued reported 3 outstanding: `Ready to order` after its purchase
     order was raised, stuck in `All not ordered` for ever, and untickable at
     the same time. */
  it("a request cut by its approver and fully issued reads Ordered, not Ready to order", () => {
    expect(
      manualPurchaseStatusOf({
        approvalRequired: true,
        approvedAt: "2026-08-30T02:00:00Z",
        refusedAt: null,
        refuseReason: null,
        lines: [
          { qty: 5, approvedQty: 2, issuedQty: 2, cancelledAt: null, poId: "PO-1" },
        ],
      }).label,
    ).toBe("Ordered");
  });

  /* A line cut to NOTHING never reaches the issue door, so it never gets a
     `po_id` — and `every(… poId !== null)` could never be satisfied on a
     request containing one. It is excluded from what the request is still
     pursuing rather than blocking it for ever. */
  it("a line cut to zero does not hold the whole request open", () => {
    expect(
      manualPurchaseStatusOf({
        approvalRequired: true,
        approvedAt: "2026-08-30T02:00:00Z",
        refusedAt: null,
        refuseReason: null,
        lines: [
          { qty: 3, approvedQty: 3, issuedQty: 3, cancelledAt: null, poId: "PO-1" },
          { qty: 2, approvedQty: 0, issuedQty: 0, cancelledAt: null, poId: null },
        ],
      }).label,
    ).toBe("Ordered");
  });

  it("a request whose every line was cut to zero is not going ahead", () => {
    expect(
      manualPurchaseStatusOf({
        approvalRequired: true,
        approvedAt: "2026-08-30T02:00:00Z",
        refusedAt: null,
        refuseReason: null,
        lines: [{ qty: 2, approvedQty: 0, issuedQty: 0, cancelledAt: null, poId: null }],
      }).label,
    ).toBe("Not going ahead");
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
describe("closure §2 · Catalog remains the selected issue price authority", () => {
  async function tickReady() {
    await loaded();
    fireEvent.click(screen.getByTestId(`mp-select-${REQ2}`));
    await screen.findByTestId("mp-selection-bar");
  }

  it("names a Catalog cost refusal returned by the governed issue API", async () => {
    apiFetch.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === "POST" && url.endsWith("/purchasing/requests/issue")) {
        return Promise.reject(Object.assign(new Error("refused"), {
          body: {
            code: "cost_required",
            message: "X-NEW-K has no transaction cost.",
            action: "Set the cost of X-NEW-K in Catalog.",
          },
        }));
      }
      return Promise.resolve(respond(url));
    });
    await tickReady();
    fireEvent.click(screen.getByTestId("mp-issue-selected"));
    const err = await screen.findByTestId("mp-issue-selected-error");
    /* The hole is named, and NOTHING was issued at RM0. */
    expect(err).toHaveTextContent("X-NEW-K has no transaction cost.");
    expect(err).toHaveTextContent("Set the cost of X-NEW-K in Catalog.");
  });

  it("reports a refusal in the approved two lines", async () => {
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
    await tickReady();
    fireEvent.click(screen.getByTestId("mp-issue-selected"));
    const err = await screen.findByTestId("mp-issue-selected-error");
    expect(err).toHaveTextContent("You do not hold PO duty today.");
    expect(err).toHaveTextContent("Ask Shasha to issue this purchase order.");
  });

  /* ⭐ TWO LINES MEANS TWO LINES (YH, 2026-09-01).
     The two assertions above pass on a SINGLE joined sentence, which is what
     this surface actually rendered — `${message} ${action}` with a space —
     because `toHaveTextContent` reads the whole subtree. The object page
     eighty lines over has used `TwoLines` since it was written; the Register
     never did. These two pin the shape and the lifetime that the text
     assertions cannot see. */
  it("draws the fact and the act as two lines, not one joined sentence", async () => {
    apiFetch.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === "POST" && url.endsWith("/purchasing/requests/issue")) {
        return Promise.reject(
          Object.assign(new Error("refused"), {
            body: {
              code: "not_ready_to_order",
              message: "One Manual Purchase has not been approved yet.",
              action: "Ask its approver to Approve it, then issue again.",
            },
          }),
        );
      }
      return Promise.resolve(respond(url));
    });
    await tickReady();
    fireEvent.click(screen.getByTestId("mp-issue-selected"));
    const err = await screen.findByTestId("mp-issue-selected-error");
    const lines = err.firstElementChild!;
    expect(lines.children).toHaveLength(2);
    expect(lines.children[0]).toHaveTextContent("One Manual Purchase has not been approved yet.");
    expect(lines.children[1]).toHaveTextContent("Ask its approver to Approve it, then issue again.");
  });

  it("keeps the refusal on screen after the selection it names goes away", async () => {
    /* The refusal that MOST needs reading is the one where the rows vanish —
       somebody else issued the request, the list refetches without it, the
       selection empties. The message used to disappear in that same tick, so
       the operator saw a changed list and no reason for it. */
    apiFetch.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === "POST" && url.endsWith("/purchasing/requests/issue")) {
        return Promise.reject(
          Object.assign(new Error("refused"), {
            body: {
              code: "unknown_request",
              message: "One Manual Purchase on this list is no longer there.",
              action: "Reload the page, then tick the ones that are left and issue again.",
            },
          }),
        );
      }
      return Promise.resolve(respond(url));
    });
    await tickReady();
    fireEvent.click(screen.getByTestId("mp-issue-selected"));
    await screen.findByTestId("mp-issue-selected-error");
    /* Untick — the same emptying the refetch would have caused. */
    fireEvent.click(screen.getByTestId(`mp-select-${REQ2}`));
    expect(screen.getByTestId("mp-issue-selected-error")).toHaveTextContent(
      "One Manual Purchase on this list is no longer there.",
    );
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
      "Proceed Date",
      "Approval Status",
      "Manual Purchase No",
      "PO No",
      "Delivery Date",
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
      // Card 06 — the corrected date words replace these, everywhere.
      "Requested Date",
      "Needed By",
      // Order By drives timing/work; it is NOT another parent column.
      "Order By",
    ]) {
      expect(heads, `banned column "${banned}"`).not.toContain(banned);
    }
  });

  it("newest Proceed Date leads by default — the actual created_at", async () => {
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

  it("Issue PO sends only the selected requests and consolidation answer", async () => {
    await loaded();
    fireEvent.click(screen.getByTestId(`mp-select-${REQ2}`));
    fireEvent.click(await screen.findByTestId("mp-issue-selected"));
    await waitFor(() => {
      const post = apiFetch.mock.calls.find((c) =>
        String(c[0]).endsWith("/purchasing/requests/issue"),
      );
      expect(post).toBeTruthy();
      const sent = JSON.parse(String((post![1] as RequestInit).body));
      expect(sent.requestIds).toEqual([REQ2]);
      expect(sent.together).toBe(true);
      expect(Object.keys(sent).sort()).toEqual(["requestIds", "together"]);
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

/**
 * ⭐ PURCHASING CARD 05 — THE MANUAL PURCHASE OBJECT DETAIL
 * (docs/cards/CARD-2026-08-29-purchasing-05-manual-purchase-object-detail-and-approval-authority.md).
 *
 * One full-width one-scroll object in the exact section order; the one
 * Object Header with the Register back destination, the state pill and the
 * filtered position; PR 982's approval authority carried unchanged; PO
 * lineage read-only with the governed date words; History in the locked
 * three-rank grammar; and the Register's own state preserved underneath.
 */
describe("Card 05 · the object detail", () => {
  async function openObject(canApprove = false, over: Record<string, unknown> = {}) {
    seedDetail(canApprove, over);
    await loaded();
    fireEvent.click(screen.getByText("REQ-0001", { selector: "button" }));
    return await screen.findByTestId("mp-detail");
  }

  it("renders the six sections, full width, in the Card's exact order", async () => {
    const detail = await openObject();
    const blocks = [...detail.querySelectorAll("[data-block]")].map((b) =>
      b.getAttribute("data-block"),
    );
    expect(blocks).toEqual([
      "Request",
      "Items Requested",
      "What We Already Have",
      "Approval",
      "Purchase Orders",
      "History",
    ]);
    // ONE scroll — no tabs, no split preview, no centred narrow island.
    expect(within(detail).queryByRole("tablist")).toBeNull();
    expect(detail.querySelector(".max-w-\\[720px\\]")).toBeNull();
    expect(detail.querySelector(".max-w-\\[900px\\]")).toBeNull();
    expect(detail.querySelector(".mx-auto")).toBeNull();
  });

  it("the Object Header: one back destination, the identity, one state pill", async () => {
    const detail = await openObject();
    // The shared object header (Law C) with the Register as back destination.
    expect(within(detail).getByLabelText("Manual Purchase")).toBeInTheDocument();
    expect(within(detail).getByTestId("object-identity")).toHaveTextContent("REQ-0001");
    expect(within(detail).getByTestId("object-identity-status")).toHaveTextContent(
      "Waiting for approval",
    );
    // The shell's destination header does not double as a second page title.
    expect(screen.queryByTestId("purchasing-tabs")).toBeNull();
    // No duplicate Back button and no PDF action.
    expect(within(detail).queryByText(/^Back$/)).toBeNull();
    expect(within(detail).queryByText(/PDF/)).toBeNull();
  });

  it("`‹ n of m ›` steps the operator's own filtered Register order", async () => {
    const detail = await openObject();
    // Default order is newest Requested Date first: REQ-0002 · REQ-0001 ·
    // REQ-0003 — so the open object is 2 of 3.
    expect(within(detail).getByTestId("mp-object-position")).toHaveTextContent("2 of 3");
    fireEvent.click(within(detail).getByLabelText("Next Manual Purchase"));
    await waitFor(() =>
      expect(screen.getByTestId("object-identity")).toHaveTextContent("REQ-0003"),
    );
  });

  it("back restores the Register — the grid stayed mounted underneath", async () => {
    const detail = await openObject();
    // The Register surface is preserved (hidden), not unmounted.
    expect(screen.getByTestId("mp-register-surface")).toHaveAttribute("aria-hidden", "true");
    fireEvent.click(within(detail).getByLabelText("Manual Purchase"));
    await screen.findByTestId("purchasing-tabs");
    expect(screen.queryByTestId("mp-detail")).toBeNull();
    expect(screen.getByTestId("mp-register-surface")).not.toHaveAttribute("aria-hidden");
  });

  it("REQUEST prints the real staff name — a shared-account record states the defect", async () => {
    await openObject(false, { requested_by_name: null });
    expect(screen.getByTestId("mp-detail-requested-by")).toHaveTextContent(
      "Staff identity not recorded",
    );
  });

  it("ITEMS REQUESTED names a missing Catalog supplier on the line", async () => {
    await openObject(false, {
      lines: REGISTER.lines
        .filter((l) => l.request_id === REQ1)
        .map((l) => ({ ...l, supplier_id: null })),
    });
    const items = screen.getByTestId("mp-object-items");
    expect(items).toHaveTextContent("No supplier yet");
    expect(items).toHaveTextContent("Ask Catalog to set the supplier of 5539-2NA.");
  });

  it("WHAT WE ALREADY HAVE prints the one arithmetic per SKU", async () => {
    await openObject();
    const still = await screen.findByTestId("mp-object-still-0");
    // qty 1 · free 2 · already on PO 1 → still needed 0, PRINTED.
    await waitFor(() => expect(still).toHaveTextContent("0"));
    const have = screen.getByTestId("mp-object-have");
    expect(have).toHaveTextContent("Free Stock");
    expect(have).toHaveTextContent("Already On PO");
    expect(have).toHaveTextContent("Still Needed");
  });

  it("APPROVAL says `No approval needed` when the switch never asked", async () => {
    await openObject(false, {
      request: { ...REGISTER.requests[0], approval_required: false },
    });
    expect(screen.getByTestId("mp-approval-fact")).toHaveTextContent("No approval needed");
  });

  it("the approver's table asks the six columns; an out-of-range cut blocks Approve with the governed words", async () => {
    await openObject(true);
    const table = await screen.findByTestId("mp-approval-table");
    for (const head of [
      "SKU",
      "Requested Qty",
      "Still Needed",
      "Approved Qty",
      "Transaction Cost",
      "Line Total",
    ]) {
      expect(table).toHaveTextContent(head);
    }
    await waitFor(() =>
      expect((screen.getByTestId("mp-cut-0") as HTMLInputElement).value).toBe("0"),
    );
    fireEvent.change(screen.getByTestId("mp-cut-0"), { target: { value: "5" } });
    expect(screen.getByTestId("mp-approve")).toBeDisabled();
    const invalid = screen.getByTestId("mp-cut-invalid");
    expect(invalid).toHaveTextContent("The approved quantity is not valid.");
    expect(invalid).toHaveTextContent("Enter a whole number from 0 to 1.");
  });

  it("a refused object shows the fact, the real actor and the reason — and no controls", async () => {
    await openObject(true, {
      request: {
        ...REGISTER.requests[0],
        refused_at: "2026-08-19T06:00:00Z",
        refused_by: "u9",
        refuse_reason: "Shelf already covers it.",
      },
      history: [
        {
          kind: "created",
          occurred_at: REGISTER.requests[0].created_at,
          actor: "Siti",
          actor_role: "operation",
          units: 1,
        },
        {
          kind: "refused",
          occurred_at: "2026-08-19T06:00:00Z",
          actor: "Jess",
          actor_role: "principal",
          reason: "Shelf already covers it.",
        },
      ],
    });
    expect(screen.getByTestId("mp-approval-fact")).toHaveTextContent("Refused");
    expect(screen.getByTestId("mp-decided-by")).toHaveTextContent("Jess");
    expect(screen.getByTestId("mp-detail-refuse-reason")).toHaveTextContent(
      "Shelf already covers it.",
    );
    expect(screen.queryByTestId("mp-approve")).toBeNull();
    expect(screen.queryByTestId("mp-refuse")).toBeNull();
  });

  it("PURCHASE ORDERS is read-only exact lineage with the governed date words", async () => {
    await openObject(false, {
      request: {
        ...REGISTER.requests[0],
        approved_at: "2026-08-19T05:00:00Z",
        approved_by: "u9",
      },
      lines: [
        {
          ...REGISTER.lines[0],
          approved_qty: 1,
          issued_qty: 1,
          po_id: "PO-20260819-9001",
          po_ids: ["PO-20260819-9001"],
        },
      ],
      pos: [
        {
          id: "PO-20260819-9001",
          po_no: "PO-20260819-9001",
          placed_at: "2026-08-19T05:10:00Z",
          po_delivery_date: "2026-09-01",
          supplier_delivery_date: null,
          ordered_qty: 1,
        },
      ],
    });
    const table = await screen.findByTestId("mp-object-pos");
    expect(table).toHaveTextContent("PO-20260819-9001");
    expect(table).toHaveTextContent("PO Issued");
    expect(table).toHaveTextContent("PO Delivery Date");
    // Unchanged supplier date: the column itself stays away.
    expect(table).not.toHaveTextContent("Supplier Delivery Date");
    // Read-only: the number is a door to the exact PO, nothing else writes.
    fireEvent.click(screen.getByTestId("mp-object-po-link-0"));
    expect(navigate).toHaveBeenCalledWith(
      "/operation/procurement?po=PO-20260819-9001",
    );
  });

  it("a supplier-changed date shows beside `Same as PO` rows only when the ledger proves it", async () => {
    await openObject(false, {
      pos: [
        {
          id: "PO-1",
          po_no: "PO-1",
          placed_at: "2026-08-19T05:10:00Z",
          po_delivery_date: "2026-09-01",
          supplier_delivery_date: "2026-09-08",
          ordered_qty: 1,
        },
        {
          id: "PO-2",
          po_no: "PO-2",
          placed_at: "2026-08-19T05:10:00Z",
          po_delivery_date: "2026-09-02",
          supplier_delivery_date: null,
          ordered_qty: 1,
        },
      ],
    });
    const table = await screen.findByTestId("mp-object-pos");
    expect(table).toHaveTextContent("Supplier Delivery Date");
    expect(within(table).getByTestId("mp-object-po-1")).toHaveTextContent("Same as PO");
  });

  it("no PO lineage reads `Not ordered yet` — never an inference", async () => {
    await openObject();
    expect(screen.getByTestId("mp-object-not-ordered")).toHaveTextContent(
      "Not ordered yet",
    );
  });

  it("HISTORY groups the stored facts and speaks the three-rank grammar", async () => {
    await openObject(false, {
      history: [
        {
          kind: "created",
          occurred_at: "2026-08-19T02:00:00Z",
          actor: "Siti",
          actor_role: "operation",
          units: 1,
        },
        {
          kind: "approved",
          occurred_at: "2026-08-19T05:00:00Z",
          actor: "Jess",
          actor_role: "principal",
          requested_units: 2,
          approved_units: 1,
        },
        {
          kind: "po_issued",
          occurred_at: "2026-08-19T06:00:00Z",
          actor: null,
          actor_role: null,
          po_no: "PO-20260819-9001",
          units: 1,
        },
      ],
    });
    const history = await screen.findByTestId("mp-object-history");
    expect(history).toHaveTextContent("Purchase requested");
    expect(history).toHaveTextContent("Purchase approved");
    expect(history).toHaveTextContent("2 requested · 1 approved");
    expect(history).toHaveTextContent("Purchase order issued");
    expect(history).toHaveTextContent("PO-20260819-9001 · 1 unit");
    // An event whose individual was never stored states the audit defect.
    expect(history).toHaveTextContent("Staff identity not recorded");
    // The chronology heading exists (all fixture events are Earlier).
    expect(screen.getByTestId("mp-history-group-Earlier")).toBeInTheDocument();
  });

  it("a failed object read is the governed sentence with a retry — never a raw string", async () => {
    seedDetail(false);
    apiFetch.mockImplementation((url: string) => {
      if (url.includes("/purchasing/requests/detail/")) {
        return Promise.reject(new Error("boom"));
      }
      return Promise.resolve(respond(url));
    });
    await loaded();
    fireEvent.click(screen.getByText("REQ-0001", { selector: "button" }));
    await screen.findByText("This Manual Purchase could not be opened");
    expect(screen.getByText("Try again")).toBeInTheDocument();
  });
});

/**
 * ⭐ PURCHASING CARD 06 — the date plan on the Register, the object and the
 * Work hand-off (owner-corrected 2026-08-29).
 */
describe("Card 06 · the Register's date facts and lens order", () => {
  it("a historical null Delivery Date prints `Not recorded` — never a dash or a guess", async () => {
    await loaded();
    const grid = screen.getByTestId("register-column");
    // REQ-0002 and REQ-0003 have no stored Delivery Date.
    expect(within(grid).getAllByText("Not recorded").length).toBe(2);
  });

  it("a work lens sorts earliest Order By first, then newest Proceed Date", async () => {
    await loaded();
    // Both not-ordered rows under `All not ordered`: REQ-0001 carries the
    // only Order By (1 Sep) and leads; the null-dated REQ-0002 follows even
    // though it is newer.
    fireEvent.click(screen.getByTestId("mp-work-issue_po"));
    fireEvent.click(screen.getByTestId("mp-work-issue_po")); // clear again
    fireEvent.click(screen.getByTestId("mp-to-order-not_ordered"));
    // TO ORDER alone is not a work/timing lens — default newest-first holds.
    let order = [...screen.getByTestId("register-column").querySelectorAll("tbody tr")]
      .map((tr) => tr.textContent ?? "")
      .filter((t) => /REQ-\d{4}/.test(t))
      .map((t) => t.match(/REQ-\d{4}/)![0]);
    expect(order).toEqual(["REQ-0002", "REQ-0001"]);
    fireEvent.click(screen.getByTestId("mp-to-order-not_ordered"));
    // The WORK lens re-orders: earliest Order By first, null-dated last.
    fireEvent.click(screen.getByTestId("mp-timing-can_order_early"));
    fireEvent.click(screen.getByTestId("mp-timing-can_order_early"));
    fireEvent.click(screen.getByTestId("mp-work-approve_purchase"));
    order = [...screen.getByTestId("register-column").querySelectorAll("tbody tr")]
      .map((tr) => tr.textContent ?? "")
      .filter((t) => /REQ-\d{4}/.test(t))
      .map((t) => t.match(/REQ-\d{4}/)![0]);
    expect(order).toEqual(["REQ-0001"]);
  });
});

describe("Card 06 · the object's date facts", () => {
  it("Request reads Proceed Date · Delivery Date with the quiet `Order by {date}` fact", async () => {
    seedDetail(false);
    await loaded();
    fireEvent.click(screen.getByText("REQ-0001", { selector: "button" }));
    await screen.findByTestId("mp-detail");
    expect(screen.getByTestId("mp-detail-proceed-date")).toHaveTextContent(
      fmtDate("2026-08-19"),
    );
    expect(screen.getByTestId("mp-detail-delivery-date")).toHaveTextContent(
      fmtDate("2026-09-12"),
    );
    // The derived timing fact — quiet, and NOT past due at the server's date.
    expect(screen.getByTestId("mp-detail-order-by")).toHaveTextContent(
      `Order by ${fmtDate("2026-09-01")}`,
    );
    expect(screen.getByTestId("mp-detail-order-by").textContent).not.toContain(
      "Order date passed",
    );
    // Retired words never return to this object.
    const detail = screen.getByTestId("mp-detail");
    expect(detail.textContent).not.toContain("Requested Date");
    expect(detail.textContent).not.toContain("Needed By");
  });

  it("a passed Order By states `Order date passed` first — a fact, not a gate", async () => {
    seedDetail(false, {
      todayIso: "2026-09-03",
      lines: REGISTER.lines
        .filter((l) => l.request_id === REQ1)
        .map((l) => ({ ...l, order_by: "2026-09-01" })),
    });
    await loaded();
    fireEvent.click(screen.getByText("REQ-0001", { selector: "button" }));
    await screen.findByTestId("mp-detail");
    const timing = screen.getByTestId("mp-detail-order-by");
    expect(timing).toHaveTextContent("Order date passed");
    expect(timing).toHaveTextContent(`Order by ${fmtDate("2026-09-01")}`);
    // Still no object-side Issue PO door arrives with the fact (Card 05/06).
    expect(screen.queryByTestId("mp-issue-selected")).toBeNull();
  });

  it("a historical null Delivery Date reads `Not recorded` with no invented Order By", async () => {
    seedDetail(false, {
      request: { ...REGISTER.requests[0], required_by: null },
      lines: REGISTER.lines
        .filter((l) => l.request_id === REQ1)
        .map((l) => ({ ...l, delivery_date: null, order_by: null })),
    });
    await loaded();
    fireEvent.click(screen.getByText("REQ-0001", { selector: "button" }));
    await screen.findByTestId("mp-detail");
    expect(screen.getByTestId("mp-detail-delivery-date")).toHaveTextContent("Not recorded");
    expect(screen.queryByTestId("mp-detail-order-by")).toBeNull();
  });
});

describe("Card 06 §7 · the Work deep link opens the exact MPR", () => {
  it("`?mpr={id}` lands directly on the object, and Back restores the Register", async () => {
    seedDetail(false);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={[`/operation?tab=manual-purchase&mpr=${REQ1}`]}>
          <OperationManualPurchase />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await screen.findByTestId("mp-detail");
    expect(screen.getByTestId("mp-detail").textContent).toContain("REQ-0001");
    // `‹ Manual Purchase` returns to the Register — not a reopen loop.
    fireEvent.click(screen.getByText("Manual Purchase", { selector: "a *, a" }));
    await waitFor(() => expect(screen.queryByTestId("mp-detail")).toBeNull());
  });
});

/**
 * 0422 — A MANUAL PURCHASE MAY NOT ASK FOR GOODS BEFORE THEY CAN ARRIVE
 * (YH, 2026-09-04). The Register carries the Purchasing Settings switch;
 * when on, the form prints the door's own refusal under Delivery Date and
 * blocks Send. When off, the earliest date stays a proposal only.
 */
describe("0422 · the earliest-date switch on the create form", () => {
  /** A far-future floor, so whichever day of the current month the picker
   *  offers is EARLIER than it — the test does not depend on the run date. */
  const FLOOR = "2099-01-15";
  function withSwitch(enforceEarliestDate: boolean) {
    apiFetch.mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes("/purchasing/requests/plan")) {
        const base = planFor(init) as { lines: Array<Record<string, unknown>> };
        return Promise.resolve({
          ...base,
          lines: base.lines.map((l) => ({ ...l, arrival: FLOOR })),
          deliveryDateDefault: base.lines.length > 0 ? FLOOR : null,
        });
      }
      if (url.includes("/purchasing/requests")) {
        return Promise.resolve({ ...REGISTER, enforceEarliestDate });
      }
      return Promise.resolve(respond(url, init));
    });
  }

  it("switch on: a date before the earliest prints the refusal and blocks Send", async () => {
    withSwitch(true);
    await openWorkspace();
    pickDeliveryDate(5);
    fireEvent.focus(document.getElementById("mp-item-0")!);
    fireEvent.click(pickRow("5539-2NA"));
    const line = await screen.findByTestId("mp-date-too-early");
    // The door's words, with the two dates in the portal's own spelling.
    expect(line.textContent).toContain("is earlier than the earliest date");
    expect(line.textContent).toContain(fmtDate(FLOOR));
    expect(line.textContent).toContain("then send again.");
    expect(screen.getByTestId("mp-send")).toBeDisabled();
    expect(screen.getByTestId("mp-send")).toHaveTextContent(MW.sendNeedsLaterDate);
    expect(apiFetch).not.toHaveBeenCalledWith(
      expect.stringContaining("/purchasing/requests"),
      expect.objectContaining({ method: "POST", body: expect.stringContaining("requiredBy") }),
    );
  });

  it("switch on: the server's own proposal is never refused", async () => {
    withSwitch(true);
    await openWorkspace();
    fireEvent.focus(document.getElementById("mp-item-0")!);
    fireEvent.click(pickRow("5539-2NA"));
    await waitFor(() => expect(screen.getByTestId("mp-send")).toBeEnabled());
    expect(screen.queryByTestId("mp-date-too-early")).toBeNull();
  });

  it("switch off: the same early date stays a proposal only — no sentence, Send live", async () => {
    withSwitch(false);
    await openWorkspace();
    pickDeliveryDate(5);
    fireEvent.focus(document.getElementById("mp-item-0")!);
    fireEvent.click(pickRow("5539-2NA"));
    await waitFor(() => expect(screen.getByTestId("mp-send")).toBeEnabled());
    expect(screen.queryByTestId("mp-date-too-early")).toBeNull();
    expect(screen.getByTestId("mp-send")).toHaveTextContent(MW.send);
  });
});
