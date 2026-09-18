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
      /* D2 — the ONE server-resolved requester identity. */
      requested_by_name: "Siti",
      requested_by_user_id: "u1",
      created_at: "2026-08-19T02:00:00Z",
    },
    {
      id: REQ2,
      req_no: "REQ-0002",
      purpose: "ready_stock",
      destination_id: KLANG,
      required_by: null,
      why: "Klang shelf is empty for the K mattress.",
      /* R1 (2026-09-16): `approval_required = false` is history, never an
         exemption — this row is buyable because it WAS approved. */
      approval_required: false,
      approved_at: "2026-08-19T04:00:00Z",
      approved_by: "u9",
      refused_at: null,
      refused_by: null,
      refuse_reason: null,
      for_service_case_id: null,
      for_staff_user_id: null,
      for_subsidiary_name: null,
      created_by: "u1",
      /* D2 — the ONE server-resolved requester identity. */
      requested_by_name: "Siti",
      requested_by_user_id: "u1",
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
      approved_at: "2026-08-18T04:00:00Z",
      approved_by: "u9",
      refused_at: null,
      refused_by: null,
      refuse_reason: null,
      for_service_case_id: null,
      for_staff_user_id: null,
      // Card 04 — the structured For: the actual subsidiary company.
      for_subsidiary_name: "HOUZS Sdn Bhd",
      created_by: "u1",
      /* D2 — the ONE server-resolved requester identity. */
      requested_by_name: "Siti",
      requested_by_user_id: "u1",
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
      /* Settled design (2026-09-11) — the exact per-document allocation, not
         just the set of documents. Both units went onto PO-9001. */
      allocations: [{ poId: "PO-9001", qty: 2, destinationId: KLANG }],
      destination_id: KLANG,
      delivery_date: null,
      order_by: null,
      production_days_missing: false,
      transit_days_missing: false,
    },
  ],
  // Card 04 — id → the ACTUAL po_no; the column prints numbers, never UUIDs.
  // Card 06 — `sent`: the current version's confirmed-sent evidence.
  pos: [
    {
      id: "PO-9001",
      po_no: "PO-20260818-9001",
      sent: true,
      /* 0428/0430 — the ORIGINAL supplier-facing date, never `eta_date`. */
      official_delivery_date: "2026-09-20",
      supplier_id: "s3",
    },
  ],
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

async function loaded(options: { openHistory?: boolean } = {}) {
  mount();
  /* The always-open `Need approval` heading exists once any row loaded, even
     when every row sits in a collapsed group. */
  await screen.findByTestId("grid-group-need-approval");
  /* R2 — `No purchase needed` starts collapsed. Most tests read every row, so
     the fixture opens it; the group tests themselves pass `openHistory:false`. */
  if (options.openHistory !== false) {
    const toggle = screen.queryByTestId("grid-group-toggle-no-purchase-needed");
    if (toggle?.getAttribute("aria-expanded") === "false") fireEvent.click(toggle);
  }
}

/**
 * The three FACT rail sections are compact dropdowns (owner ruling
 * 2026-09-11). `""` is the section's `All …` option — the clear.
 */
function pick(testId: string, value: string) {
  fireEvent.change(screen.getByTestId(testId), { target: { value } });
}

/** The count did not disappear when the rows became options — it moved into
 *  the option text (`Ohana · 4`), so it is still asserted. */
function optionText(testId: string, value: string): string {
  const select = screen.getByTestId(testId) as HTMLSelectElement;
  const option = [...select.options].find((o) => o.value === value);
  if (!option) throw new Error(`no option "${value}" in ${testId}`);
  return option.textContent ?? "";
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
  it("lists requests with NO visible number — Card 08: business facts only", async () => {
    await loaded();
    expect(screen.getByTestId(`mp-open-${REQ1}`)).toBeInTheDocument();
    expect(screen.getByTestId(`mp-open-${REQ2}`)).toBeInTheDocument();
    // The stored legacy identities exist in the payload and never render.
    expect(document.body.textContent).not.toContain("REQ-0001");
    expect(document.body.textContent).not.toContain("MPR");
    expect(document.body.textContent).not.toContain("Manual Purchase No");
    // `PR-` is refused: 2990s prints it for a purchase return.
    expect(document.body.textContent).not.toMatch(/\bPR-\d/);
  });

  it("Approval Status is the approval FACT — R1: no request is exempt", async () => {
    await loaded();
    const grid = screen.getByTestId("register-column");
    // REQ-0001 waits; REQ-0002 and REQ-0003 were approved (a stored
    // `approval_required = false` is history, never `No approval needed`).
    expect(within(screen.getByTestId(`mp-approval-${REQ1}`)).getByText("Need approval")).toBeInTheDocument();
    expect(within(screen.getByTestId(`mp-approval-${REQ2}`)).getByText("Approved")).toBeInTheDocument();
    expect(within(grid).queryByText("No approval needed")).toBeNull();
    // The register shows only the badge; owner details remain in the object.
    expect(screen.queryByTestId(`mp-approver-${REQ1}`)).toBeNull();
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
    fireEvent.click(screen.getByTestId(`mp-open-${REQ1}`));
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

  it("renders exactly the five approved sections and rows, in the approved order", async () => {
    await loaded();
    const rail = screen.getByTestId("manual-purchase-rail");
    const text = rail.textContent ?? "";
    const expected = [
      "Order timing",
      "Can order early",
      "Order date reached",
      "Order date passed",
      "Purpose",
      "All purposes",
      "Ready Stock",
      "Showroom Display",
      "Service Case",
      "Internal Staff Purchase",
      "Subsidiary Purchase",
      "Other Purchase",
      "Product",
      "All products",
      "Mattress",
      "Bedframe",
      "Sofa",
      "Supplier",
      "All suppliers",
      "Hooka",
      "Office Co",
      "Ohana",
      // Only the setup row with an affected request (REQ-0002's transit gap).
      "Setup to fix",
      "Transit days not set",
    ];
    let cursor = -1;
    for (const word of expected) {
      const at = text.indexOf(word, cursor + 1);
      expect(at, `"${word}" in order`).toBeGreaterThan(cursor);
      cursor = at;
    }
    // R2 — retired from this page.
    for (const retired of ["WORK TO DO", "TO ORDER", "All not ordered", "Approve purchase", "Production days not set"]) {
      expect(text.toLowerCase(), retired).not.toContain(retired.toLowerCase());
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
    // ORDER TIMING counts only requests with quantity still to buy, against
    // the SERVER's Malaysia date — REQ-0001's 1 Sep is still ahead of 30 Aug.
    expect(screen.getByTestId("mp-timing-can_order_early").textContent).toContain("1");
    expect(screen.getByTestId("mp-timing-order_date_reached").textContent).toContain("0");
    expect(screen.getByTestId("mp-timing-order_date_passed").textContent).toContain("0");
    expect(optionText("mp-purpose-select", "service_case")).toContain("0");
    expect(optionText("mp-product-select", "mattress")).toContain("0");
    expect(optionText("mp-product-select", "sofa")).toContain("1");
    expect(optionText("mp-product-select", "bedframe")).toContain("1");
    expect(screen.getByTestId("mp-setup-transit_days_not_set").textContent).toContain("1");
    expect(screen.queryByTestId("mp-setup-production_days_not_set")).toBeNull();
  });

  it("R2 — three groups: waiting, to buy, and a collapsed history", async () => {
    await loaded({ openHistory: false });
    expect(screen.getByTestId("grid-group-need-approval")).toHaveTextContent("Need approval1");
    expect(screen.getByTestId("grid-group-to-buy")).toHaveTextContent("To buy1");
    const history = screen.getByTestId("grid-group-toggle-no-purchase-needed");
    expect(history).toHaveTextContent("No purchase needed1");
    expect(history).toHaveAttribute("aria-expanded", "false");
    // Collapsed rows stay in the total.
    expect(screen.getByTestId("mp-footer")).toHaveTextContent("3 Manual Purchases");
    expect(screen.queryByTestId(`mp-open-${REQ3}`)).toBeNull();
    fireEvent.click(history);
    expect(screen.getByTestId(`mp-open-${REQ3}`)).toBeInTheDocument();
  });

  it("a timing lens sorts earliest Order By first and never blocks issuance", async () => {
    await loaded();
    fireEvent.click(screen.getByTestId("mp-timing-can_order_early"));
    expect(screen.getByTestId(`mp-open-${REQ1}`)).toBeInTheDocument();
    expect(screen.queryByTestId(`mp-open-${REQ2}`)).toBeNull();
    // Early is a FACT, not a gate — nothing on the row loses selection
    // rights it otherwise has (REQ-0001 refuses the tick for approval,
    // exactly as without the filter).
    expect(screen.getByTestId(`mp-select-${REQ1}`)).toBeDisabled();
  });

  it("the PURPOSE dropdown narrows; `All purposes` clears only its own section", async () => {
    await loaded();
    pick("mp-purpose-select", "subsidiary_purchase");
    expect(screen.getByTestId(`mp-open-${REQ3}`)).toBeInTheDocument();
    expect(screen.queryByTestId(`mp-open-${REQ1}`)).toBeNull();
    // ANDs with the timing section: nothing subsidiary can be ordered early.
    fireEvent.click(screen.getByTestId("mp-timing-can_order_early"));
    expect(screen.queryByTestId(`mp-open-${REQ3}`)).toBeNull();
    fireEvent.click(screen.getByTestId("mp-timing-can_order_early"));
    pick("mp-purpose-select", "");
    expect(screen.getByTestId(`mp-open-${REQ1}`)).toBeInTheDocument();
    expect(screen.getByTestId(`mp-open-${REQ2}`)).toBeInTheDocument();
    expect(screen.getByTestId(`mp-open-${REQ3}`)).toBeInTheDocument();
  });

  it("a retired-purpose request lives under `All purposes` and matches no approved option", async () => {
    await loaded();
    for (const value of [
      "ready_stock",
      "showroom_display",
      "service_case",
      "internal_staff_purchase",
      "subsidiary_purchase",
    ]) {
      pick("mp-purpose-select", value);
      // REQ-0001 (`display`, retired) never answers an approved purpose.
      expect(screen.queryByTestId(`mp-open-${REQ1}`), value).toBeNull();
      pick("mp-purpose-select", "");
    }
    expect(screen.getByTestId(`mp-open-${REQ1}`)).toBeInTheDocument();
  });

  it("PRODUCT filters by the Catalog's category, never SKU text", async () => {
    await loaded();
    pick("mp-product-select", "mattress");
    // `MATTRESS-LOOK-9`'s request does NOT match — Catalog said nothing.
    expect(screen.queryByTestId(`mp-open-${REQ2}`)).toBeNull();
    expect(screen.queryByTestId(`mp-open-${REQ1}`)).toBeNull();
    pick("mp-product-select", "sofa");
    expect(screen.getByTestId(`mp-open-${REQ1}`)).toBeInTheDocument();
    expect(screen.queryByTestId(`mp-open-${REQ3}`)).toBeNull();
  });

  it("SUPPLIER options are actual names that filter; sections combine with AND", async () => {
    await loaded();
    pick("mp-supplier-select", "Hooka");
    expect(screen.getByTestId(`mp-open-${REQ3}`)).toBeInTheDocument();
    expect(screen.queryByTestId(`mp-open-${REQ1}`)).toBeNull();
    // AND with timing: Hooka + Can order early matches nothing, and the
    // SELECTED supplier survives with its honest 0.
    fireEvent.click(screen.getByTestId("mp-timing-can_order_early"));
    expect(screen.queryByTestId(`mp-open-${REQ3}`)).toBeNull();
    expect(optionText("mp-supplier-select", "Hooka")).toContain("0");
    pick("mp-supplier-select", "Ohana");
    expect(screen.getByTestId(`mp-open-${REQ1}`)).toBeInTheDocument();
    expect(screen.queryByTestId(`mp-open-${REQ2}`)).toBeNull();
  });

  it("a rail narrowing is listed with the search and cleared by the one `Clear filters`", async () => {
    await loaded();
    pick("mp-supplier-select", "Hooka");
    const conditions = screen.getByTestId("active-conditions");
    expect(conditions).toHaveTextContent("Hooka");
    fireEvent.click(within(conditions).getByTestId("clear-filters"));
    expect(screen.getByTestId(`mp-open-${REQ1}`)).toBeInTheDocument();
    expect((screen.getByTestId("mp-supplier-select") as HTMLSelectElement).value).toBe("");
  });

  it("a narrowed dropdown wears the rail's own active treatment", async () => {
    await loaded();
    const supplier = screen.getByTestId("mp-supplier-select");
    expect(supplier.className).not.toContain("bg-kit-blue-3");
    pick("mp-supplier-select", "Hooka");
    // Same blue field the selected ROW carried, plus the left-edge marker —
    // a narrowed section must not be quieter than a selected row was.
    expect(screen.getByTestId("mp-supplier-select").className).toContain("bg-kit-blue-3");
    expect(
      screen.getByTestId("mp-supplier-select").parentElement!.querySelector(".bg-kit-blue-9"),
    ).not.toBeNull();
  });

  it("the rail is navigation, not batch selection — a dropdown grows no checkbox", async () => {
    await loaded();
    const rail = screen.getByTestId("manual-purchase-rail");
    expect(rail.querySelectorAll("input[type='checkbox']").length).toBe(0);
    expect(rail.querySelectorAll("select[multiple]").length).toBe(0);
  });

  it("`Hide filters` collapses the whole rail; the toolbar then shows it back", async () => {
    await loaded();
    fireEvent.click(
      within(screen.getByTestId("manual-purchase-rail")).getByLabelText("Hide filters"),
    );
    // The whole rail leaves — no 60px icon strip — and the Register keeps
    // the width; the choice is remembered for this staff browser.
    expect(screen.queryByTestId("manual-purchase-rail")).toBeNull();
    expect(localStorage.getItem("carres.manualPurchase.filterRail.v2")).toBe("0");
    fireEvent.click(screen.getByTestId("manual-purchase-show-filters"));
    expect(screen.getByTestId("manual-purchase-rail")).toBeInTheDocument();
  });

  it("a Catalog hole never becomes a rail facet — the request stays visible", async () => {
    await loaded();
    // REQ-0002's line has no Catalog category; no `Not in catalog` row grew,
    // and the request is simply in the permanent Register.
    expect(screen.getByTestId(`mp-open-${REQ2}`)).toBeInTheDocument();
    const rail = screen.getByTestId("manual-purchase-rail");
    expect(rail.textContent).not.toContain("Not in catalog");
  });
});

/* ⭐ DELIVER TO FOLLOWS THE COLLECTION RULE (owner, 2026-09-03). The owner
   raised MPR-20260903-3381 for Ohana to Carres Klang and was refused at issue
   with `Ohana must be collected to Ohana.` — and the request's Deliver To has
   no door to move it. So the form may not offer the dead end, and the Register
   must say the same sentence BEFORE the round trip. */
describe("Deliver To is the supplier's governed place (2026-09-03)", () => {
  const OHANA = "2f181917-f4e1-42b2-9e25-d7ee6785424b";
  const GOVERNED = {
    ...REGISTER,
    destinations: [
      { id: KLANG, name: "Carres Klang" },
      { id: OHANA, name: "Ohana" },
    ],
    supplierCollections: [
      { supplierId: "s1", supplierName: "Ohana", destinationId: OHANA, partnerId: "p1" },
    ],
  };
  function withRegister(register: unknown) {
    apiFetch.mockImplementation((url: string, init?: RequestInit) => {
      if (
        url.includes("/purchasing/requests") &&
        !url.includes("/plan") &&
        !url.includes("/detail/") &&
        !url.includes("/issue") &&
        !url.includes("/already-have")
      ) {
        return Promise.resolve(register);
      }
      return Promise.resolve(respond(url, init));
    });
  }

  it("locks the create form's Deliver To to the rule once a collected item is picked, and says why", async () => {
    withRegister(GOVERNED);
    await openWorkspace();
    /* Free until a governed supplier is on the form. */
    expect(screen.queryByTestId("mp-dest-governed")).toBeNull();
    fireEvent.focus(document.getElementById("mp-item-0")!);
    fireEvent.click(pickRow("5539-2NA"));
    /* 5539-2NA's plan names supplier s1, collected to Ohana. */
    const why = await screen.findByTestId("mp-dest-governed");
    expect(why).toHaveTextContent("Ohana must be collected to Ohana.");
    const select = document.getElementById("mp-dest")!;
    expect(select).toHaveTextContent("Ohana");
    expect(select).toBeDisabled();
    /* Remove the item — the choice returns. */
    fireEvent.click(screen.getByTestId("mp-line-remove-0"));
    await waitFor(() => expect(screen.queryByTestId("mp-dest-governed")).toBeNull());
  });

  it("starts the create form on the governed default when no rule binds", async () => {
    withRegister({ ...GOVERNED, defaultDestinationId: OHANA });
    await openWorkspace();
    expect(document.getElementById("mp-dest")).toHaveTextContent("Ohana");
    expect(document.getElementById("mp-dest")).not.toBeDisabled();
  });

  it("the Register refuses an issue that disagrees with the rule before sending it", async () => {
    /* REQ2's line is supplier s2 to Carres Klang; govern s2 to Ohana. */
    withRegister({
      ...GOVERNED,
      supplierCollections: [
        { supplierId: "s2", supplierName: "Office Co", destinationId: OHANA, partnerId: "p1" },
      ],
    });
    await loaded();
    fireEvent.click(screen.getByTestId(`mp-select-${REQ2}`));
    await screen.findByTestId("mp-selection-actions");
    fireEvent.click(screen.getByTestId("mp-issue-selected"));
    const err = await screen.findByTestId("mp-issue-selected-error");
    expect(err).toHaveTextContent("Office Co must be collected to Ohana.");
    expect(err).toHaveTextContent("Set Deliver To to Ohana, then issue again.");
    expect(
      apiFetch.mock.calls.some(
        ([url, init]) =>
          String(url).endsWith("/purchasing/requests/issue") &&
          (init as RequestInit | undefined)?.method === "POST",
      ),
      "nothing was sent",
    ).toBe(false);
  });

  /* ⭐ THE DOOR ON AN EXISTING REQUEST (0421). The refusal above told the
     operator to "Set Deliver To to Ohana" — and a request's Deliver To had no
     door. `Change` beside the fact is that door, until a line is on a PO. */
  describe("the object's Deliver To may move until a line is ordered", () => {
    const READY = {
      ...REGISTER.requests[0],
      approval_required: false,
    };
    async function openObject(over: Record<string, unknown>) {
      withRegister(GOVERNED);
      seedDetail(false, {
        destinations: GOVERNED.destinations,
        ...over,
      });
      await loaded();
      fireEvent.click(screen.getByTestId(`mp-open-${REQ1}`));
      await screen.findByTestId("mp-detail");
    }

    it("a Ready-to-order request offers Change beside Deliver To", async () => {
      await openObject({ request: READY });
      expect(screen.getByTestId("mp-detail-deliver-to")).toHaveTextContent("Carres Klang");
      expect(screen.getByTestId("mp-detail-deliver-to-change")).toHaveTextContent("Change");
    });

    it("an Ordered request offers no door", async () => {
      await openObject({
        request: READY,
        lines: REGISTER.lines
          .filter((l) => l.request_id === REQ1)
          .map((l) => ({ ...l, po_id: "PO-2041", po_ids: ["PO-2041"], issued_qty: 1 })),
      });
      expect(screen.getByTestId("mp-detail-deliver-to")).toHaveTextContent("Carres Klang");
      expect(screen.queryByTestId("mp-detail-deliver-to-change")).toBeNull();
    });

    it("Save PUTs the chosen place — locked to the supplier's governed place, with the sentence", async () => {
      /* REQ1's line is supplier s1, collected to Ohana. */
      await openObject({
        request: READY,
        supplierCollections: GOVERNED.supplierCollections,
      });
      fireEvent.click(screen.getByTestId("mp-detail-deliver-to-change"));
      const why = await screen.findByTestId("mp-detail-deliver-to-governed");
      expect(why).toHaveTextContent("Ohana must be collected to Ohana.");
      const select = document.getElementById("mp-detail-deliver-to-select")!;
      expect(select).toHaveTextContent("Ohana");
      expect(select).toBeDisabled();
      fireEvent.click(screen.getByTestId("mp-detail-deliver-to-save"));
      await waitFor(() => {
        const put = apiFetch.mock.calls.find(
          ([url, init]) =>
            String(url).endsWith(`/purchasing/requests/${REQ1}/deliver-to`) &&
            (init as RequestInit | undefined)?.method === "PUT",
        );
        expect(put, "the move was sent").toBeTruthy();
        expect(JSON.parse(String((put![1] as RequestInit).body))).toEqual({
          destinationId: OHANA,
        });
      });
      /* Saved: the choice closes back into the fact. */
      await waitFor(() =>
        expect(document.getElementById("mp-detail-deliver-to-select")).toBeNull(),
      );
    });

    it("a refusal from the door prints the two lines and keeps the choice open", async () => {
      await openObject({ request: READY });
      apiFetch.mockImplementation((url: string, init?: RequestInit) => {
        if (String(url).endsWith("/deliver-to") && init?.method === "PUT") {
          return Promise.reject(
            Object.assign(new Error("422"), {
              body: {
                code: "request_ordered",
                message: "This request is already ordered. Deliver To cannot move.",
                action: "Revise the purchase order instead.",
              },
            }),
          );
        }
        if (
          url.includes("/purchasing/requests") &&
          !url.includes("/plan") &&
          !url.includes("/detail/") &&
          !url.includes("/issue") &&
          !url.includes("/already-have")
        ) {
          return Promise.resolve(GOVERNED);
        }
        return Promise.resolve(respond(url, init));
      });
      fireEvent.click(screen.getByTestId("mp-detail-deliver-to-change"));
      fireEvent.click(screen.getByTestId("mp-detail-deliver-to-save"));
      const err = await screen.findByTestId("mp-detail-deliver-to-error");
      expect(err).toHaveTextContent("This request is already ordered. Deliver To cannot move.");
      expect(err).toHaveTextContent("Revise the purchase order instead.");
      expect(document.getElementById("mp-detail-deliver-to-select")).not.toBeNull();
    });
  });
});

describe("the create workspace — full page, never a dialog (card §3)", () => {
  it("the ITEMS block (owner, 2026-09-03): `Note` is the caption, one grid, `+ Add line` under the lines", async () => {
    await openWorkspace();
    const lines = screen.getByTestId("mp-lines");
    // The word. COPY-STANDARD rules `Note` for this form's field; `Remark` was
    // the retired dialog's word and may not survive the port.
    /* D1 — each cell also carries its own caption for the narrow reflow
       (hidden on a wide form); the caption ROW is the one that sits over it. */
    const caption = within(lines)
      .getAllByText("Note")
      .find((el) => el.classList.contains("mp-line-head"))!;
    expect(lines.contains(caption)).toBe(true);
    expect(lines.textContent).not.toContain("Remark");
    expect(screen.getByLabelText("Note")).toBe(document.getElementById("mp-note-0"));
    // ONE grid: the caption row and the line share a parent, so the four
    // tracks are resolved once and the caption sits over the note it names.
    const line0 = screen.getByTestId("mp-line-0");
    expect(line0.parentElement).toBe(caption.parentElement);
    expect(line0.className).toContain("contents");
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
        return Promise.resolve({ id: REQ1, req_no: null, approval_required: true });
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

  it("R1 — a stored `approval_required = false` still waits; only an approval makes it Ready", () => {
    expect(
      manualPurchaseStatusOf({ ...base, approvalRequired: false } as typeof base).label,
    ).toBe("Waiting for approval");
    expect(
      manualPurchaseStatusOf({ ...base, approvedAt: "2026-08-19T00:00:00Z" } as never).label,
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
      approvedAt: "2026-08-19T00:00:00Z",
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
 * Approve control opens at the REQUESTED quantity (field-guide defect 23:
 * a `Still Needed` seed raced two reads and could open at 0), and `Refuse`
 * cannot be submitted without a reason.
 */
describe("the object detail and the decision (slice 2)", () => {
  async function openDetail(canApprove: boolean) {
    seedDetail(canApprove);
    await loaded();
    fireEvent.click(screen.getByTestId(`mp-open-${REQ1}`));
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

  it("the Approve control opens at the REQUESTED quantity, never a half-read `Still Needed`", async () => {
    await openDetail(true);
    // qty 1 · free 2 · already on PO 1 → Still Needed 0 is PRINTED for the
    // approver to read; the field itself opens at the ask (1), because a
    // seed built from two reads opened at 0 and was saved as 0 (defect 23).
    await waitFor(() =>
      expect((screen.getByTestId("mp-cut-0") as HTMLInputElement).value).toBe("1"),
    );
    expect(screen.getByTestId("mp-approve")).toBeEnabled();
    expect(screen.queryByTestId("mp-approve-zero")).toBeNull();
  });

  it("every line at 0 refuses Approve and says to refuse the request instead", async () => {
    await openDetail(true);
    await waitFor(() =>
      expect((screen.getByTestId("mp-cut-0") as HTMLInputElement).value).toBe("1"),
    );
    fireEvent.change(screen.getByTestId("mp-cut-0"), { target: { value: "0" } });
    expect(screen.getByTestId("mp-approve")).toBeDisabled();
    const zero = screen.getByTestId("mp-approve-zero");
    expect(zero).toHaveTextContent("Every line is approved at 0.");
    expect(zero).toHaveTextContent("Refuse the request instead.");
  });

  it("one line at 0 among others is a partial cut — Approve stays live", async () => {
    seedDetail(true, {
      lines: REGISTER.lines
        .filter((l) => l.request_id === REQ1)
        .flatMap((l) => [
          { ...l, unit_cost: 850 },
          { ...l, id: "l1b", sku: "5539-CNR", item_label: "Booqit Corner", qty: 2, unit_cost: 900 },
        ]),
    });
    await loaded();
    fireEvent.click(screen.getByTestId(`mp-open-${REQ1}`));
    await screen.findByTestId("mp-detail");
    await waitFor(() =>
      expect((screen.getByTestId("mp-cut-1") as HTMLInputElement).value).toBe("2"),
    );
    fireEvent.change(screen.getByTestId("mp-cut-0"), { target: { value: "0" } });
    expect(screen.getByTestId("mp-approve")).toBeEnabled();
    expect(screen.queryByTestId("mp-approve-zero")).toBeNull();
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
      expect((screen.getByTestId("mp-cut-0") as HTMLInputElement).value).toBe("1"),
    );
    fireEvent.click(screen.getByTestId("mp-approve"));
    await waitFor(() => {
      const post = apiFetch.mock.calls.find((c) => String(c[0]).includes("/decide"));
      expect(post).toBeTruthy();
      const sent = JSON.parse(String((post![1] as RequestInit).body));
      expect(sent.decision).toBe("approve");
      expect(sent.cuts).toEqual([{ id: "l1", qty: 1 }]);
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
      expect((screen.getByTestId("mp-cut-0") as HTMLInputElement).value).toBe("1"),
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
    // Defect 23's other half: the failure does not leave Approve greyed.
    await waitFor(() => expect(screen.getByTestId("mp-approve")).toBeEnabled());
  });

  it("a decision stays on the object — no throw back to the Register", async () => {
    await openDetail(true);
    await waitFor(() =>
      expect((screen.getByTestId("mp-cut-0") as HTMLInputElement).value).toBe("1"),
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
    fireEvent.click(screen.getByTestId(`mp-open-${REQ1}`));
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
    fireEvent.click(screen.getByTestId(`mp-open-${REQ2}`));
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
        approvedAt: "2026-08-19T00:00:00Z",
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
    await screen.findByTestId("mp-selection-actions");
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
    /* Message kind ② (UI MASTER §6.7): the refusal lives in the warning band
       between the toolbar and the table. */
    expect(screen.getByTestId("grid-warning").contains(err)).toBe(true);
    const lines = err;
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
  it("waiting and decided rows omit the approver subtitle", async () => {
    await loaded();
    expect(screen.queryByTestId(`mp-approver-${REQ1}`)).toBeNull();
    expect(screen.queryByTestId(`mp-approver-${REQ2}`)).toBeNull();
  });

  it("the object detail names the owner while the request waits", async () => {
    seedDetail(false);
    await loaded();
    fireEvent.click(screen.getByTestId(`mp-open-${REQ1}`));
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
 * ⭐ THE PERMANENT REGISTER — THE SETTLED DESIGN, owner ruling 2026-09-11.
 *
 * Nine columns in the settled order · newest Proceed Date first · PO No from
 * real lineage only (`—` before issue) · Items in Catalog human words ·
 * `Purpose` as the single-click entrance and sticky business column · the
 * shared read-only goods table · selection admitting only Ready-to-order
 * remainder · PO Duty existing ONLY beside a selection.
 */
/* Group-local headers (Jess, 2026-09-18): a governed grouped listing has no
   `<thead>` — every OPEN group draws the same header between its heading and
   its records. One `<colgroup>` and one layout serve them all, so reading the
   first group's header reads the layout. */
const groupHeaderCells = (root: ParentNode): HTMLElement[] => [
  ...(root.querySelector<HTMLElement>('tr[data-testid^="grid-header-"]')?.querySelectorAll<HTMLElement>("th") ?? []),
];
describe("R2 · the ten columns, in the approved order", () => {
  it("renders the exact heads, in order — and none of the banned columns", async () => {
    await loaded();
    const grid = screen.getByTestId("register-column");
    const heads = groupHeaderCells(grid)
      .map((th) => (th.textContent ?? "").replace(/[AV]$/, "").replace(/\s+/g, " ").trim())
      .filter((t) => t !== "");
    expect(heads).toEqual([
      "Proceed Date",
      "Items",
      "Order By",
      "Purpose",
      "Supplier",
      "Approval Status",
      "Requested By",
      "Delivery Date",
      "Deliver To",
      "PO No",
    ]);
    for (const banned of [
      "Qty",
      "For",
      "Status",
      "Partial",
      "PO Sent",
      "PO Created",
      "MPR",
      "Need price",
      "Work",
      "Next action",
      "Reason",
      "Price",
      "Manual Purchase No",
      "Request No",
    ]) {
      expect(heads, `banned column "${banned}"`).not.toContain(banned);
    }
  });

  it("Proceed Date · Items lead and BOTH pin on a wide canvas — the entrance lives on Items", async () => {
    await loaded();
    const entrance = screen.getByTestId(`mp-open-${REQ1}`);
    expect(entrance).toHaveTextContent("Ohana 2 Seater");
    const itemsCell = entrance.closest("td")!;
    expect(itemsCell.className).toMatch(/sticky|Sticky/);
    const dateCell = itemsCell.previousElementSibling as HTMLElement;
    expect(dateCell.className).toMatch(/sticky|Sticky/);
    expect(dateCell.style.left).not.toBe("");
    expect((itemsCell.nextElementSibling as HTMLElement).style.left).toBe("");
  });

  it("R2 default order: waiting · Order By · Not planned · history newest first", async () => {
    await loaded();
    const grid = screen.getByTestId("register-column");
    const order = [...grid.querySelectorAll('[data-testid^="mp-open-"]')]
      .map((el) => el.getAttribute("data-testid"));
    expect(order).toEqual([`mp-open-${REQ1}`, `mp-open-${REQ2}`, `mp-open-${REQ3}`]);
  });

  it("Order By prints the engine date, `Not planned` without setup, blank when nothing remains", async () => {
    await loaded();
    expect(screen.getByTestId(`mp-order-by-${REQ1}`)).toHaveTextContent(fmtDate("2026-09-01"));
    expect(screen.getByTestId(`mp-order-by-${REQ2}`)).toHaveTextContent("Not planned");
    expect(screen.getByTestId(`mp-order-by-${REQ3}`).textContent).toBe("");
  });

  it("PO No is real lineage — the actual number clickable, absence named", async () => {
    await loaded();
    const link = screen.getByTestId(`mp-po-link-${REQ3}`);
    expect(link).toHaveTextContent("PO-20260818-9001");
    fireEvent.click(link);
    expect(navigate).toHaveBeenCalledWith("/operation/procurement?po=PO-20260818-9001");
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    expect(screen.getByTestId("register-column").textContent).not.toContain("Not ordered yet");
  });

  it("several POs read `{n} POs` and open the object's exact linked PO list (Card 08)", async () => {
    apiFetch.mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes("/purchasing/requests/detail/")) return Promise.resolve(DETAIL);
      if (url.includes("/purchasing/requests")) {
        return Promise.resolve({
          ...REGISTER,
          lines: REGISTER.lines.map((l) =>
            l.request_id === REQ3 ? { ...l, po_ids: ["PO-9001", "PO-9002"] } : l,
          ),
          pos: [
            { id: "PO-9001", po_no: "PO-20260818-9001", sent: true },
            { id: "PO-9002", po_no: "PO-20260818-9002", sent: true },
          ],
        });
      }
      return Promise.resolve(respond(url, init));
    });
    await loaded();
    const many = screen.getByTestId(`mp-po-list-${REQ3}`);
    expect(many).toHaveTextContent("2 POs");
    fireEvent.click(many);
    await screen.findByTestId("mp-detail");
  });

  it("Items speak the Catalog's human words; the SKU stays searchable off-screen", async () => {
    await loaded();
    const grid = screen.getByTestId("register-column");
    expect(within(grid).getByText("Ohana 2 Seater")).toBeInTheDocument();
    expect(within(grid).getByText("Atlas K")).toBeInTheDocument();
    expect(within(grid).queryByText("BED-K-01")).toBeNull();
  });

  it("Purpose prints the governed word; the structured For stays on the object", async () => {
    await loaded();
    const grid = screen.getByTestId("register-column");
    expect(screen.getByTestId(`mp-purpose-${REQ3}`)).toHaveTextContent("Subsidiary Purchase");
    expect(within(grid).queryByText("HOUZS Sdn Bhd")).toBeNull();
    expect(within(grid).queryByText(/Balakong floor sofa/)).toBeNull();
  });

  it("search keeps the accurate source values the cell no longer prints", async () => {
    await loaded();
    const box = screen.queryByPlaceholderText(MW.search) ??
      (fireEvent.click(screen.getAllByLabelText("Search")[0]!), await screen.findByPlaceholderText(MW.search));
    fireEvent.change(box, { target: { value: "HOUZS Sdn Bhd" } });
    await waitFor(() => expect(screen.queryByTestId(`mp-open-${REQ1}`)).toBeNull());
    expect(screen.getByTestId(`mp-open-${REQ3}`)).toBeInTheDocument();
  });

  it("D2 — a shared login or an unnamed creator says so; the server's identity is the only one", async () => {
    const base = apiFetch.getMockImplementation()!;
    apiFetch.mockImplementation((url: string, init?: RequestInit) => {
      if (
        String(url).includes("/purchasing/requests") &&
        !String(url).includes("/detail/") &&
        !String(url).includes("/plan") &&
        !String(url).includes("/ready-stock")
      ) {
        return Promise.resolve({
          ...REGISTER,
          /* The client's user list still knows "Operations" — the Register
             must NOT print it: the server said this creator is nobody. */
          users: [{ id: "u1", name: "Operations" }],
          requests: REGISTER.requests.map((r) =>
            r.id === REQ1 ? { ...r, requested_by_name: null, requested_by_user_id: null } : r,
          ),
        });
      }
      return base(url, init);
    });
    await loaded();
    const cell = screen.getByTestId(`mp-requested-by-${REQ1}`);
    expect(cell).toHaveTextContent("Staff identity not recorded");
    expect(within(cell).getByText("Staff identity not recorded").className).toContain("text-kit-slate-11");
    expect(screen.getByTestId("register-column").textContent).not.toContain("Operations");
  });

  it("Requested By is the real staff name — never an email, role or (you)", async () => {
    await loaded();
    const grid = screen.getByTestId("register-column");
    expect(within(grid).getAllByText("Siti").length).toBeGreaterThan(0);
    expect(grid.textContent).not.toContain("(you)");
    expect(grid.textContent).not.toContain("@carres.com");
  });
});

/**
 * ⭐ R2 GROUP MEMBERSHIP — each test FAILS on the pre-round-2 page, which had
 * no groups at all: an approved request with an unreadable remainder, a
 * pending request and a confirmed-zero request all sat in one flat list.
 */
describe("R2 · group membership", () => {
  function withRegister(payload: Record<string, unknown>) {
    const base = apiFetch.getMockImplementation()!;
    apiFetch.mockImplementation((url: string, init?: RequestInit) => {
      if (
        String(url).includes("/purchasing/requests") &&
        !String(url).includes("/detail/") &&
        !String(url).includes("/plan") &&
        !String(url).includes("/ready-stock")
      ) {
        return Promise.resolve(payload);
      }
      return base(url, init);
    });
  }
  const groupOfRow = (id: string) => {
    let el = screen.getByTestId(`mp-row-${id}`).previousElementSibling;
    while (el && !(el.getAttribute("data-testid") ?? "").startsWith("grid-group-")) {
      el = el.previousElementSibling;
    }
    return el?.getAttribute("data-testid");
  };

  it("⭐ an approved request whose lines could not be read stays in To buy, says so, and refuses the tick", async () => {
    withRegister({ ...REGISTER, lines: [], linesUnavailable: true });
    await loaded();
    expect(groupOfRow(REQ2)).toBe("grid-group-to-buy");
    expect(groupOfRow(REQ3)).toBe("grid-group-to-buy");
    expect(within(screen.getByTestId(`mp-approval-${REQ2}`)).getByText("Remaining quantity not checked")).toBeInTheDocument();
    expect(screen.getByTestId(`mp-select-${REQ2}`)).toBeDisabled();
    // A request that is NOT approved never reaches To buy, known or not.
    expect(groupOfRow(REQ1)).toBe("grid-group-need-approval");
  });

  it("a request not yet approved is never in To buy, however much it asks for", async () => {
    await loaded();
    expect(groupOfRow(REQ1)).toBe("grid-group-need-approval");
    expect(screen.getByTestId(`mp-select-${REQ1}`)).toBeDisabled();
  });

  it("a sent-back request waits in Need approval with its REAL requester as owner", async () => {
    withRegister({
      ...REGISTER,
      requests: REGISTER.requests.map((r) =>
        r.id === REQ1 ? { ...r, sent_back_at: "2026-08-20T00:00:00Z" } : r,
      ),
    });
    await loaded();
    expect(groupOfRow(REQ1)).toBe("grid-group-need-approval");
    const cell = screen.getByTestId(`mp-approval-${REQ1}`);
    expect(cell).toHaveTextContent("Sent back for changes");
    expect(within(cell).getByTestId("mp-row-owner")).toHaveAttribute("aria-label", "Siti · Edit and send again");
  });

  it("a sent-back request whose requester is unknown says so — never a shared account", async () => {
    withRegister({
      ...REGISTER,
      requests: REGISTER.requests.map((r) =>
        r.id === REQ1
          ? { ...r, sent_back_at: "2026-08-20T00:00:00Z", requested_by_name: null, requested_by_user_id: null }
          : r,
      ),
    });
    await loaded();
    const cell = screen.getByTestId(`mp-approval-${REQ1}`);
    expect(within(cell).getByTestId("mp-row-owner-missing")).toHaveTextContent("Staff identity not recorded");
    expect(within(cell).queryByTestId("mp-row-owner")).toBeNull();
  });

  it("a confirmed zero remainder needs no purchase; refused and withdrawn too", async () => {
    withRegister({
      ...REGISTER,
      requests: REGISTER.requests.map((r) =>
        r.id === REQ1 ? { ...r, withdrawn_at: "2026-08-20T00:00:00Z" } : r,
      ),
      lines: REGISTER.lines.map((l) => (l.request_id === REQ2 ? { ...l, approved_qty: 0 } : l)),
    });
    await loaded();
    expect(groupOfRow(REQ1)).toBe("grid-group-no-purchase-needed");
    expect(groupOfRow(REQ2)).toBe("grid-group-no-purchase-needed");
    expect(groupOfRow(REQ3)).toBe("grid-group-no-purchase-needed");
    // `Need approval` keeps its heading and says it is empty.
    expect(screen.getByTestId("grid-group-empty-need-approval")).toHaveTextContent("Nothing waiting for approval");
  });
});

describe("the row expansion is the SHARED goods table (settled design)", () => {
  it("draws GoodsMiniTable's own box with Manual Purchase's columns, and offers no action", async () => {
    await loaded();
    fireEvent.click(screen.getByTestId(`mp-expand-${REQ3}`));
    const box = await screen.findByTestId(`mp-expansion-${REQ3}`);
    /* THE SAME COMPONENT SO BATCH DRAWS — not a second table that starts
       identical and drifts. */
    expect(within(box).getByTestId("goods-mini-table")).toBeInTheDocument();
    const expansionCell = box.closest("td")!;
    expect(expansionCell).toHaveStyle({ padding: "0px" });
    expect(expansionCell.parentElement!.children).toHaveLength(3);
    expect(expansionCell.colSpan).toBe(
      expansionCell.parentElement!.previousElementSibling!.children.length - 2,
    );
    const heads = [...box.querySelectorAll("th")].map((th) => th.textContent?.trim());
    /* The owner's target — SKU · Qty · Supplier · Deliver To · PO No ·
       PO Delivery Date · Item — reconciled with GoodsMiniTable's ruled
       positions (Category first, Deliver To before SKU, Item always last).
       `Covered by`, `Unit ID` and `Still To Order` are deliberately absent. */
    expect(heads).toEqual([
      "Category",
      "Deliver To",
      "SKU",
      "Qty",
      "Supplier",
      "PO No",
      "PO Delivery Date",
      "Item",
    ]);
    for (const banned of ["Covered by", "Unit ID", "Still To Order", "Ordered Qty"]) {
      expect(heads, `banned goods column "${banned}"`).not.toContain(banned);
    }
    const cells = [...box.querySelectorAll("td")].map((td) => td.textContent?.trim());
    /* ONE ROW = ONE ALLOCATION. Both units went onto PO-9001, so the row
       carries 2 — the document's own quantity — with that document's
       supplier, destination and ORIGINAL delivery date. */
    expect(cells).toEqual([
      "Bedframe",
      "HOUZS Balakong",
      "BED-K-01",
      "2",
      "Hooka",
      "PO-20260818-9001",
      "Sun, 20 Sep",
      "Atlas K",
    ]);
    /* Read-only goods: the only controls in the expansion are the PO door
       and the Ready Stock handle — no Approve/Refuse/Receive, no price
       editor, no PO creation, and no goods-line checkbox (this register
       buys from its PARENT row). */
    expect(box.querySelectorAll("input, textarea").length).toBe(0);
    expect(box.querySelectorAll("select").length).toBe(0);
    expect(box.textContent).not.toContain("Issue");
  });

  it("a line split across two POs prints each document's OWN quantity", async () => {
    /* ⭐ THE DEFECT THIS SHAPE EXISTS TO CLOSE. The old expansion printed one
       row carrying the whole requested quantity beside `PO-A, PO-B` — read
       left to right, that says BOTH documents ordered the full amount. */
    const base = apiFetch.getMockImplementation()!;
    apiFetch.mockImplementation((url: string, init?: RequestInit) => {
      if (
        String(url).includes("/purchasing/requests") &&
        !String(url).includes("/detail/") &&
        !String(url).includes("/plan") &&
        !String(url).includes("/ready-stock")
      ) {
        return Promise.resolve({
          ...REGISTER,
          lines: REGISTER.lines.map((l) =>
            l.request_id === REQ3
              ? {
                  ...l,
                  po_ids: ["PO-9001", "PO-9002"],
                  allocations: [
                    { poId: "PO-9001", qty: 1, destinationId: KLANG },
                    { poId: "PO-9002", qty: 1, destinationId: KLANG },
                  ],
                }
              : l,
          ),
          pos: [
            {
              id: "PO-9001",
              po_no: "PO-20260818-9001",
              sent: true,
              official_delivery_date: "2026-09-20",
              supplier_id: "s3",
            },
            {
              id: "PO-9002",
              po_no: "PO-20260818-9002",
              sent: true,
              official_delivery_date: "2026-09-27",
              supplier_id: "s1",
            },
          ],
        });
      }
      return base(url, init);
    });
    await loaded();
    fireEvent.click(screen.getByTestId(`mp-expand-${REQ3}`));
    const box = await screen.findByTestId(`mp-expansion-${REQ3}`);
    /* `box.querySelectorAll("tbody tr")` also matches MY thead's tr — the
       whole expansion lives inside the parent grid's tbody, so the selector
       lets the `tbody` part match that outer ancestor. Keep only real rows. */
    const rows = [...box.querySelectorAll("tr")]
      .map((tr) => [...tr.querySelectorAll("td")].map((td) => td.textContent?.trim()))
      .filter((cells) => cells.length > 0);
    expect(rows).toEqual([
      ["Bedframe", "HOUZS Balakong", "BED-K-01", "1", "Hooka", "PO-20260818-9001", "Sun, 20 Sep", "Atlas K"],
      /* The SECOND document's own supplier and its own original date — the
         parent row can only summarise, so this is where the exact mapping
         lives. */
      ["Bedframe", "HOUZS Balakong", "BED-K-01", "1", "Ohana", "PO-20260818-9002", "Sun, 27 Sep", "Atlas K"],
    ]);
    // 1 + 1, never 2 + 2.
    expect(rows.reduce((n, r) => n + Number(r[3]), 0)).toBe(2);
  });

  it("what is still to buy is a ROW, not a `Still To Order` column", async () => {
    await loaded();
    // REQ-0002: 3 asked, nothing issued — one `To purchase` row, no document.
    fireEvent.click(screen.getByTestId(`mp-expand-${REQ2}`));
    const box = await screen.findByTestId(`mp-expansion-${REQ2}`);
    const cells = [...box.querySelectorAll("tbody td")].map((td) => td.textContent?.trim());
    expect(cells[3]).toBe("3");
    // The absence names itself; `—` would not say WHY the cell is empty.
    expect(box.textContent).toContain("Not ordered yet");
  });

  it("Ready Stock is a separately collapsible sibling that reads nothing until opened", async () => {
    await loaded();
    fireEvent.click(screen.getByTestId(`mp-expand-${REQ2}`));
    const panel = await screen.findByTestId(`mp-ready-stock-${REQ2}`);
    const handle = within(panel).getByRole("button", { name: /Ready Stock/ });
    // CLOSED BY DEFAULT, and closed means NOT READ: opening a register row
    // must not count the whole warehouse.
    expect(handle).toHaveAttribute("aria-expanded", "false");
    expect(
      apiFetch.mock.calls.filter((call) => String(call[0]).includes("/ready-stock")).length,
    ).toBe(0);
    // It is BELOW the goods, not inside them — a sibling section, never a
    // column and never a second goods table.
    const goods = within(screen.getByTestId(`mp-expansion-${REQ2}`)).getByTestId(
      "goods-mini-table",
    );
    expect(
      goods.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(goods.contains(panel)).toBe(false);
  });

  it("VIEWING IS NOT RESERVING — the section carries no act and nets nothing", async () => {
    const base = apiFetch.getMockImplementation()!;
    apiFetch.mockImplementation((url: string, init?: RequestInit) => {
      if (String(url).includes("/ready-stock")) {
        return Promise.resolve({
          requestId: REQ2,
          groups: [
            {
              matchKey: "mattress-look-9",
              item: "MATTRESS-LOOK-9",
              skus: ["MATTRESS-LOOK-9"],
              requestedQty: 3,
              freeQty: 1,
              units: [
                {
                  itemId: "11111111-1111-1111-1111-111111111111",
                  unitCode: "U1-000-014",
                  identityScope: "unit",
                  sku: "MATTRESS-LOOK-9",
                  condition: "exhibition",
                  siteName: "Carres Klang",
                  holderName: null,
                  ownership: "carres_owned",
                  supplier: null,
                  qty: 1,
                  dateIn: "2026-08-01",
                },
              ],
            },
          ],
        });
      }
      return base(url, init);
    });
    await loaded();
    fireEvent.click(screen.getByTestId(`mp-expand-${REQ2}`));
    const panel = await screen.findByTestId(`mp-ready-stock-${REQ2}`);
    fireEvent.click(within(panel).getByRole("button", { name: /Ready Stock/ }));
    await within(panel).findByTestId("ready-stock-unit-11111111-1111-1111-1111-111111111111");
    // The real Unit ID, its location, and CONDITION AS A GRADE — `Display`
    // is a grade, not an availability: everything listed is already free.
    expect(panel.textContent).toContain("U1-000-014");
    expect(panel.textContent).toContain("Carres Klang");
    expect(panel.textContent).toContain("Display");
    // ⛔ NO RESERVATION ACT IS COPIED FROM SO BATCH, and nothing is tickable:
    // viewing inventory is neither purchasing selection nor reservation.
    expect(panel.querySelectorAll("input[type='checkbox']").length).toBe(0);
    expect(panel.textContent).not.toContain("Choose Ready Unit");
    // ⛔ AND THE ASK IS NOT NETTED DOWN BY THE SHELF: both numbers, side by
    // side, and the requested 3 stays 3.
    expect(panel.textContent).toContain("Asked for 3");
    expect(panel.textContent).toContain("1 on the shelf");
    expect(panel.textContent).not.toContain("Asked for 2");
  });

  it("two configurations of one model are told apart (walk, 2026-09-11)", async () => {
    /* ⭐ Found on the production walk. A live request carries
       `5539-1A(LHF)` and `5539-1A(RHF)` — the left- and right-hand halves of
       one sofa. Grouping by configuration correctly makes them TWO groups,
       and the Catalog model name for both is `Booqit`, so the screen showed
       the identical heading twice on exactly the pair that must never be
       confused. The SKU joins the heading only where the name fails. */
    const unit = (itemId: string, sku: string) => ({
      itemId,
      unitCode: `U1-000-${itemId.slice(-3)}`,
      identityScope: "unit" as const,
      sku,
      condition: "new",
      siteName: "Carres Klang",
      holderName: null,
      ownership: "carres_owned" as const,
      supplier: null,
      qty: 1,
      dateIn: "2026-08-01",
    });
    const base = apiFetch.getMockImplementation()!;
    apiFetch.mockImplementation((url: string, init?: RequestInit) => {
      if (String(url).includes("/ready-stock")) {
        return Promise.resolve({
          requestId: REQ2,
          groups: [
            {
              matchKey: "55391alhf",
              item: "Booqit",
              skus: ["5539-1A(LHF)"],
              requestedQty: 1,
              freeQty: 1,
              units: [unit("11111111-1111-1111-1111-111111111101", "5539-1A(LHF)")],
            },
            {
              matchKey: "55391arhf",
              item: "Booqit",
              skus: ["5539-1A(RHF)"],
              requestedQty: 1,
              freeQty: 1,
              units: [unit("11111111-1111-1111-1111-111111111102", "5539-1A(RHF)")],
            },
          ],
        });
      }
      return base(url, init);
    });
    await loaded();
    fireEvent.click(screen.getByTestId(`mp-expand-${REQ2}`));
    const panel = await screen.findByTestId(`mp-ready-stock-${REQ2}`);
    fireEvent.click(within(panel).getByRole("button", { name: /Ready Stock/ }));
    const left = await within(panel).findByTestId("mp-ready-stock-group-55391alhf");
    const right = within(panel).getByTestId("mp-ready-stock-group-55391arhf");
    expect(left.textContent).toContain("5539-1A(LHF)");
    expect(right.textContent).toContain("5539-1A(RHF)");
  });

  it("the ordinary one-name case stays quiet — no SKU beside a heading that works", async () => {
    const base = apiFetch.getMockImplementation()!;
    apiFetch.mockImplementation((url: string, init?: RequestInit) => {
      if (String(url).includes("/ready-stock")) {
        return Promise.resolve({
          requestId: REQ2,
          groups: [
            {
              matchKey: "only",
              item: "Atlas K",
              skus: ["BED-K-01"],
              requestedQty: 2,
              freeQty: 1,
              units: [
                {
                  itemId: "11111111-1111-1111-1111-111111111103",
                  unitCode: "U1-000-103",
                  identityScope: "unit",
                  sku: "BED-K-01",
                  condition: "new",
                  siteName: "Carres Klang",
                  holderName: null,
                  ownership: "carres_owned",
                  supplier: null,
                  qty: 1,
                  dateIn: "2026-08-01",
                },
              ],
            },
          ],
        });
      }
      return base(url, init);
    });
    await loaded();
    fireEvent.click(screen.getByTestId(`mp-expand-${REQ2}`));
    const panel = await screen.findByTestId(`mp-ready-stock-${REQ2}`);
    fireEvent.click(within(panel).getByRole("button", { name: /Ready Stock/ }));
    const group = await within(panel).findByTestId("mp-ready-stock-group-only");
    /* The heading names the product and stops; the SKU still shows on the
       Unit row below, where it belongs. */
    const heading = group.firstElementChild!;
    expect(heading.textContent).toContain("Atlas K");
    expect(heading.textContent).not.toContain("BED-K-01");
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

  it("the Approval cell never says the same thing twice", async () => {
    await loaded();
    const reasons = screen.queryAllByTestId("mp-row-dead-reason").map((el) => el.textContent);
    // REQ-0003 is ordered. REQ-0002 may be ticked, so no sentence. REQ-0001
    // waits, and its cell already says `Need approval`: no second line.
    expect(reasons).toEqual([]);
    expect(
      screen.getByTestId(`mp-select-${REQ1}`).closest("tr")!.textContent,
    ).not.toContain("Waiting for approval.");
  });

  it("a REFUSED row does not repeat itself as `Not going ahead.` (walk, 2026-09-11)", async () => {
    /* Found on the production-shaped walk: the pill said `Refused` and a
       second line underneath said `Not going ahead.` — two ways of saying one
       fact, stacked, which is exactly the redundancy the owner removed from
       `{name} approves` and `Ordered.`. */
    const base = apiFetch.getMockImplementation()!;
    apiFetch.mockImplementation((url: string, init?: RequestInit) => {
      if (
        String(url).includes("/purchasing/requests") &&
        !String(url).includes("/detail/") &&
        !String(url).includes("/plan") &&
        !String(url).includes("/ready-stock")
      ) {
        return Promise.resolve({
          ...REGISTER,
          requests: REGISTER.requests.map((r) =>
            r.id === REQ1
              ? {
                  ...r,
                  refused_at: "2026-09-01T00:00:00Z",
                  refuse_reason: "a unit in Klang can move instead",
                }
              : r,
          ),
        });
      }
      return base(url, init);
    });
    await loaded();
    const row = screen.getByTestId(`mp-select-${REQ1}`).closest("tr")!;
    expect(row.textContent).toContain("Refused");
    expect(row.textContent).not.toContain("Not going ahead.");
  });

  it("MPR-20260904-8935: approved at 0 prints the cause, and no tick is live", async () => {
    /* One request, approved, every line cut to 0: `Approved` in the column,
       Approved Qty 0, Still To Order 0 — and a greyed checkbox that said
       nothing. The register must name the cause on that row. */
    const base = apiFetch.getMockImplementation()!;
    apiFetch.mockImplementation((url: string, init?: RequestInit) => {
      if (
        String(url).includes("/purchasing/requests") &&
        !String(url).includes("/detail/") &&
        !String(url).includes("/plan")
      ) {
        return Promise.resolve({
          ...REGISTER,
          requests: [
            {
              ...REGISTER.requests[0],
              approved_at: "2026-09-04T01:00:00Z",
              approved_by: "u9",
            },
          ],
          lines: REGISTER.lines
            .filter((l) => l.request_id === REQ1)
            .map((l) => ({ ...l, approved_qty: 0, remaining_qty: 1 })),
        });
      }
      return base(url, init);
    });
    await loaded({ openHistory: false });
    /* R2 — a CONFIRMED zero remainder needs no purchase: the group heading is
       the cause the greyed checkbox used to leave unsaid. */
    const toggle = screen.getByTestId("grid-group-toggle-no-purchase-needed");
    expect(toggle).toHaveTextContent("No purchase needed1");
    fireEvent.click(toggle);
    expect(screen.getByTestId(`mp-select-${REQ1}`)).toBeDisabled();
    const grid = screen.getByTestId("register-column");
    expect(within(grid).getByText("Approved")).toBeInTheDocument();
    const rowBoxes = grid.querySelectorAll("input[aria-label='Select row']");
    expect(rowBoxes.length).toBe(1);
    for (const box of rowBoxes) expect(box).toBeDisabled();
  });

  it("PO Duty exists NOWHERE until a selection; then once, beside Issue PO", async () => {
    await loaded();
    expect(screen.queryByTestId("mp-po-duty")).toBeNull();
    expect(screen.queryByTestId("mp-selection-bar")).toBeNull();
    expect(document.body.textContent).not.toContain("PO duty");

    fireEvent.click(screen.getByTestId(`mp-select-${REQ2}`));
    const bar = await screen.findByTestId("mp-selection-actions");
    /* Selection REPLACES the toolbar in place (UI MASTER §6.7) — the truthful
       sentence, pluralised from facts, and no bar below the table. */
    expect(screen.getByTestId("selection-bar")).toHaveTextContent(
      "1 selected · 3 units · Issue 1 PO",
    );
    expect(screen.getByTestId("selection-bar").contains(bar)).toBe(true);
    // The resolved person, once, beside the one issue action (SO Batch's chip).
    expect(within(bar).getByTestId("mp-po-duty")).toHaveAttribute(
      "aria-label",
      "Shasha · PO Duty",
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
    const bar = await screen.findByTestId("mp-selection-actions");
    expect(within(bar).getByTestId("mp-po-duty")).toHaveAttribute(
      "aria-label",
      "Shasha · PO Duty",
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
    fireEvent.click(screen.getByTestId(`mp-open-${REQ1}`));
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
    /* Card 08 §3.3 — the identity is `{Need for} · {For}` (REQ1's retired
       purpose prints its own truthful word; its For was never stored), and
       no number or UUID appears anywhere in the header. */
    expect(within(detail).getByTestId("object-identity")).toHaveTextContent("Display");
    expect(within(detail).getByTestId("object-identity").textContent).not.toContain("REQ-");
    expect(document.title).toBe("Manual Purchase — Carres");
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
    // R2 default order: REQ-0001 (Need approval) · REQ-0002 (To buy) ·
    // REQ-0003 (No purchase needed) — the open object is 1 of 3.
    expect(within(detail).getByTestId("mp-object-position")).toHaveTextContent("1 of 3");
    fireEvent.click(within(detail).getByLabelText("Next Manual Purchase"));
    await waitFor(() =>
      expect(screen.getByTestId("mp-object-position")).toHaveTextContent("2 of 3"),
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

  it("R1 — APPROVAL never says `No approval needed`; a stored switch-off request still waits", async () => {
    await openObject(false, {
      request: { ...REGISTER.requests[0], approval_required: false },
    });
    expect(screen.getByTestId("mp-approval-fact")).toHaveTextContent("Need approval");
    expect(screen.getByTestId("mp-approval-fact")).not.toHaveTextContent("No approval needed");
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
      expect((screen.getByTestId("mp-cut-0") as HTMLInputElement).value).toBe("1"),
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
    fireEvent.click(screen.getByTestId(`mp-open-${REQ1}`));
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

  it("a timing filter keeps the R2 order and counts only what is still to buy", async () => {
    await loaded();
    fireEvent.click(screen.getByTestId("mp-timing-can_order_early"));
    const order = [...screen.getByTestId("register-column")
      .querySelectorAll('[data-testid^="mp-open-"]')]
      .map((el) => el.getAttribute("data-testid"));
    expect(order).toEqual([`mp-open-${REQ1}`]);
  });
});

describe("Card 06 · the object's date facts", () => {
  it("Request reads Proceed Date · Delivery Date with the quiet `Order by {date}` fact", async () => {
    seedDetail(false);
    await loaded();
    fireEvent.click(screen.getByTestId(`mp-open-${REQ1}`));
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
    fireEvent.click(screen.getByTestId(`mp-open-${REQ1}`));
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
    fireEvent.click(screen.getByTestId(`mp-open-${REQ1}`));
    await screen.findByTestId("mp-detail");
    expect(screen.getByTestId("mp-detail-delivery-date")).toHaveTextContent("Not recorded");
    expect(screen.queryByTestId("mp-detail-order-by")).toBeNull();
  });
});

describe("Card 06 §7 / Card 08 · the Work deep link opens the exact request by UUID", () => {
  function mountAt(param: string) {
    seedDetail(false);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={[`/operation?tab=manual-purchase&${param}=${REQ1}`]}>
          <OperationManualPurchase />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it("`?mp={id}` lands directly on the object, and Back restores the Register", async () => {
    mountAt("mp");
    await screen.findByTestId("mp-detail");
    // The object speaks business facts — never the stored legacy number.
    expect(screen.getByTestId("object-identity")).toHaveTextContent("Display");
    expect(screen.getByTestId("mp-detail").textContent).not.toContain("REQ-0001");
    // `‹ Manual Purchase` returns to the Register — not a reopen loop.
    fireEvent.click(screen.getByText("Manual Purchase", { selector: "a *, a" }));
    await waitFor(() => expect(screen.queryByTestId("mp-detail")).toBeNull());
  });

  it("`?mpr={id}` survives as a read-only alias for pre-Card-08 bookmarks", async () => {
    mountAt("mpr");
    await screen.findByTestId("mp-detail");
    expect(screen.getByTestId("object-identity")).toHaveTextContent("Display");
  });

  it("`Approve purchase` opens the exact request's APPROVAL section", async () => {
    /* ⭐ Owner ruling 2026-09-11. The object is one six-section scroll;
       landing an approver at the top of it and letting them hunt for the
       decision is the step the Work row exists to remove. */
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    seedDetail(true);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter
          initialEntries={[
            `/operation?tab=manual-purchase&mp=${REQ1}&section=approval`,
          ]}
        >
          <OperationManualPurchase />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await screen.findByTestId("mp-detail");
    /* The governed section NAME is the address — `Block` already stamps it,
       so no anchor vocabulary was invented for this. */
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
    const target = scrollIntoView.mock.instances[0] as Element;
    expect(target.getAttribute("data-block")).toBe("Approval");
  });
});

/**
 * 0422 — THE EARLIEST DELIVERY DATE A MANUAL PURCHASE MAY ASK FOR
 * (YH, 2026-09-04; owner ruling: a number, not a switch). The Register
 * carries Purchasing Settings' `minDeliveryDays` (calendar days). The form
 * computes floor = Proceed Date (the one `/plan` shows) + that number; a
 * chosen date before it prints the door's own refusal under Delivery Date
 * and blocks Send. 0 days: no floor, nothing printed.
 */
describe("0422 · the earliest Delivery Date a Manual Purchase may ask for, on the create form", () => {
  /** A far-future Proceed Date, so whichever day of the current month the
   *  picker offers is EARLIER than Proceed Date + 30 — the test does not
   *  depend on the run date. */
  const PROCEED = "2099-01-01";
  const FLOOR = "2099-01-31";
  function withMinDays(minDeliveryDays: number, proceedDate = PROCEED) {
    apiFetch.mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes("/purchasing/requests/plan")) {
        return Promise.resolve({ ...(planFor(init) as object), proceedDate });
      }
      if (url.includes("/purchasing/requests")) {
        return Promise.resolve({ ...REGISTER, minDeliveryDays });
      }
      return Promise.resolve(respond(url, init));
    });
  }

  it("30 days: a date before Proceed Date + 30 prints the refusal and blocks Send", async () => {
    withMinDays(30);
    await openWorkspace();
    pickDeliveryDate(5);
    fireEvent.focus(document.getElementById("mp-item-0")!);
    fireEvent.click(pickRow("5539-2NA"));
    /* The floor is Proceed Date + 30 — the Proceed Date `/plan` answers
       with, so wait for that answer rather than the Register's fallback. */
    await waitFor(() =>
      expect(screen.getByTestId("mp-date-too-early").textContent).toContain(fmtDate(FLOOR)),
    );
    const line = screen.getByTestId("mp-date-too-early");
    // The door's words, with the two dates in the portal's own spelling.
    expect(line.textContent).toContain("is earlier than the earliest date");
    expect(line.textContent).toContain("then send again.");
    expect(screen.getByTestId("mp-send")).toBeDisabled();
    expect(screen.getByTestId("mp-send")).toHaveTextContent(MW.sendNeedsLaterDate);
    expect(apiFetch).not.toHaveBeenCalledWith(
      expect.stringContaining("/purchasing/requests"),
      expect.objectContaining({ method: "POST", body: expect.stringContaining("requiredBy") }),
    );
  });

  it("the floor is calendar days from the Proceed Date the form shows — not from the plan's proposal", async () => {
    /* Proceed Date 2020-01-01 + 30 = 2020-01-31: every date the picker
       offers is later, so a date the plan never proposed is still fine. */
    withMinDays(30, "2020-01-01");
    await openWorkspace();
    pickDeliveryDate(5);
    fireEvent.focus(document.getElementById("mp-item-0")!);
    fireEvent.click(pickRow("5539-2NA"));
    await waitFor(() => expect(screen.getByTestId("mp-send")).toBeEnabled());
    expect(screen.queryByTestId("mp-date-too-early")).toBeNull();
  });

  it("0 days: the same early date is fine — no sentence, Send live", async () => {
    withMinDays(0);
    await openWorkspace();
    pickDeliveryDate(5);
    fireEvent.focus(document.getElementById("mp-item-0")!);
    fireEvent.click(pickRow("5539-2NA"));
    await waitFor(() => expect(screen.getByTestId("mp-send")).toBeEnabled());
    expect(screen.queryByTestId("mp-date-too-early")).toBeNull();
    expect(screen.getByTestId("mp-send")).toHaveTextContent(MW.send);
  });
});

/**
 * ⭐ MANUAL PURCHASE ROUND 2 — the object's rounds (R3/R4) and D1/D3/D5.
 * Every test below fails on the pre-round-2 page: it had no Send back, no
 * Withdraw request, no Edit and send again, printed `placed_at` as
 * `PO Issued`, and had no SKU-reference sentence or narrow-form action bar.
 */
describe("Round 2 · the object's rounds", () => {
  async function openObject(canApprove = false, over: Record<string, unknown> = {}) {
    seedDetail(canApprove, over);
    await loaded();
    fireEvent.click(screen.getByTestId(`mp-open-${REQ1}`));
    return await screen.findByTestId("mp-detail");
  }
  const posts = (suffix: string) =>
    apiFetch.mock.calls.filter(
      ([url, init]) =>
        String(url).endsWith(suffix) && (init as RequestInit | undefined)?.method === "POST",
    );

  it("R4 · the approver sends back with a REQUIRED reason, through the one decision door", async () => {
    await openObject(true);
    fireEvent.click(screen.getByTestId("mp-send-back"));
    const submit = screen.getByTestId("mp-send-back-submit");
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByTestId("mp-refuse-reason"), { target: { value: "Wrong size" } });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);
    await waitFor(() => expect(posts("/decide").length).toBe(1));
    expect(JSON.parse(String((posts("/decide")[0]![1] as RequestInit).body))).toEqual({
      decision: "send_back",
      reason: "Wrong size",
      cuts: null,
    });
  });

  it("R4 · a sent-back request shows the reason and, for its requester, `Edit and send again`", async () => {
    await openObject(false, {
      request: { ...REGISTER.requests[0], sent_back_at: "2026-08-21T01:00:00Z", sent_back_reason: "Wrong size" },
      canEditAndSendAgain: true,
    });
    const fact = screen.getByTestId("mp-approval-fact");
    expect(fact).toHaveTextContent("Sent back for changes");
    expect(screen.getByTestId("mp-detail-sent-back-reason")).toHaveTextContent("Wrong size");
    // Nobody may approve a request that is back with its requester.
    expect(screen.queryByTestId("mp-approve")).toBeNull();
    fireEvent.click(screen.getByTestId("mp-edit-and-send-again"));
    // The SAME request opens in the form, prefilled, its purpose locked.
    await screen.findByTestId("manual-purchase-create");
    expect(screen.getByText("Edit and send again", { selector: "h2" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("mp-send")).toHaveTextContent("Send again for approval"));
  });

  it("R4 · `Send again for approval` posts the same request's lines with their ids", async () => {
    await openObject(false, {
      request: { ...REGISTER.requests[0], purpose: "ready_stock", sent_back_at: "2026-08-21T01:00:00Z" },
      canEditAndSendAgain: true,
    });
    fireEvent.click(screen.getByTestId("mp-edit-and-send-again"));
    await screen.findByTestId("manual-purchase-create");
    await waitFor(() => expect(screen.getByTestId("mp-send")).toBeEnabled());
    fireEvent.click(screen.getByTestId("mp-send"));
    await waitFor(() => expect(posts(`/${REQ1}/resubmit`).length).toBe(1));
    const body = JSON.parse(String((posts(`/${REQ1}/resubmit`)[0]![1] as RequestInit).body));
    expect(body.lines).toEqual([{ id: "l1", sku: "5539-2NA", qty: 1, note: "grey, not beige" }]);
    expect(body.requiredBy).toBe("2026-09-12");
    // Nothing new was created: no POST to the create door.
    expect(posts("/purchasing/requests").length).toBe(0);
  });

  it("R3 · the requester withdraws after one confirmation; others never see the door", async () => {
    await openObject(false, { canWithdraw: true });
    fireEvent.click(screen.getByTestId("mp-withdraw-request"));
    fireEvent.click(screen.getByTestId("mp-withdraw-confirm"));
    await waitFor(() => expect(posts(`/${REQ1}/withdraw`).length).toBe(1));
  });

  it("R3 · no Withdraw request for a caller the server did not allow", async () => {
    await openObject(false, { canWithdraw: false });
    expect(screen.queryByTestId("mp-withdraw-request")).toBeNull();
  });

  it("R3 · a withdrawn request reads `Withdrawn` with who and when, and offers nothing", async () => {
    await openObject(true, {
      request: { ...REGISTER.requests[0], withdrawn_at: "2026-08-21T01:00:00Z" },
      history: [
        { kind: "withdrawn", occurred_at: "2026-08-21T01:00:00Z", actor: "Siti", actor_role: "operation", round: 1, changes: [] },
      ],
    });
    expect(screen.getByTestId("mp-approval-fact")).toHaveTextContent("Withdrawn");
    expect(screen.getByTestId("mp-decided-by")).toHaveTextContent("Siti");
    expect(screen.queryByTestId("mp-approve")).toBeNull();
    expect(screen.queryByTestId("mp-send-back")).toBeNull();
  });

  it("R4 · History keeps every round and says what changed in plain words", async () => {
    await openObject(false, {
      history: [
        { kind: "sent_back", occurred_at: "2026-08-20T01:00:00Z", actor: "Jess", actor_role: "principal", reason: "Wrong size", round: 1, changes: [] },
        {
          kind: "resubmitted",
          occurred_at: "2026-08-20T02:00:00Z",
          actor: "Siti",
          actor_role: "operation",
          round: 2,
          changes: [
            { field: "line", sku: "5539-2NA", from: 1, to: 2 },
            { field: "required_by", from: "2026-09-12", to: "2026-09-19" },
          ],
        },
      ],
    });
    const history = screen.getByTestId("mp-object-history");
    expect(history).toHaveTextContent("Sent back for changes");
    expect(history).toHaveTextContent("Wrong size");
    expect(history).toHaveTextContent("Sent again for approval");
    expect(history).toHaveTextContent("Round 2");
    expect(history).toHaveTextContent("5539-2NA · Qty 1 → 2");
    expect(history).toHaveTextContent(`Delivery Date: ${fmtDate("2026-09-12")} → ${fmtDate("2026-09-19")}`);
  });

  it("D3 · What We Already Have is labelled a SKU reference, apart from this request's POs", async () => {
    await openObject();
    expect(screen.getByTestId("mp-object-have-note")).toHaveTextContent(
      "Stock shown here does not reduce what this request asks for.",
    );
  });

  it("D5 · PO Issued is the marked-sent time; an unmarked version says so", async () => {
    await openObject(false, {
      pos: [
        { id: "PO-1", po_no: "PO-20260901-0001", placed_at: "2026-09-01T01:00:00Z", marked_sent_at: "2026-09-02T03:00:00Z", po_delivery_date: "2026-09-20", supplier_delivery_date: null, ordered_qty: 1 },
        { id: "PO-2", po_no: "PO-20260901-0002", placed_at: "2026-09-01T01:00:00Z", marked_sent_at: null, po_delivery_date: "2026-09-20", supplier_delivery_date: null, ordered_qty: 1 },
      ],
    });
    expect(screen.getByTestId("mp-object-po-issued-0")).toHaveTextContent(
      fmtDate("2026-09-02T03:00:00Z", { time: true }),
    );
    expect(screen.getByTestId("mp-object-po-issued-0")).not.toHaveTextContent(fmtDate("2026-09-01"));
    expect(screen.getByTestId("mp-object-po-issued-1")).toHaveTextContent("Sending not confirmed");
  });
});

describe("Round 2 · D1 · the create form keeps Send reachable when narrow", () => {
  it("draws the action pair once in the header and once in a footer bar CSS shows below 640px", async () => {
    await openWorkspace();
    expect(screen.getByTestId("mp-send")).toBeInTheDocument();
    const footer = screen.getByTestId("mp-create-footer");
    expect(within(footer).getByTestId("mp-send-footer").textContent).toBe(screen.getByTestId("mp-send").textContent);
    // Each line cell carries its own caption for the narrow reflow.
    const line0 = screen.getByTestId("mp-line-0");
    expect(line0.querySelector(".mp-line-item .mp-line-caption")).not.toBeNull();
    expect(line0.querySelector(".mp-line-qty .mp-line-caption")).not.toBeNull();
  });
});
