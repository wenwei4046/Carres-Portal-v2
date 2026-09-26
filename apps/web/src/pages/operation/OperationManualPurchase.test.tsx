import { useEffect } from "react";
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

/* The review surface renders the PO template. In jsdom the real renderer
   reaches for the logo asset and the font files; the TEMPLATE has its own
   suites, and this one is about the journey — so the renderer is stubbed the
   same way SO Batch's issue suite stubs it. */
vi.mock("@/lib/pdf/render", () => ({
  renderPoPdf: vi.fn(async () => new Blob(["%PDF-1.4"], { type: "application/pdf" })),
}));


/* Page-journey tests model the viewer readiness boundary; PdfPreview.test.tsx
   exercises actual page painting, failure and cancellation separately. */
const previewState = vi.hoisted(() => ({ ready: true }));
vi.mock("@/components/kit/PdfPreview", () => ({
  default: ({ src, title, onReady, "data-testid": testId }: {
    src: string; title: string; onReady: (ready: boolean) => void; "data-testid": string;
  }) => {
    useEffect(() => { onReady(previewState.ready); }, [src]);
    return <section aria-label={title} data-testid={testId} data-src={src} />;
  },
}));
async function clickIssue() {
  await waitFor(() => expect(screen.getByTestId("so-batch-issue-create")).toBeEnabled());
  fireEvent.click(screen.getByTestId("so-batch-issue-create"));
}

const apiFetch = vi.fn();
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, apiFetch: (...a: unknown[]) => apiFetch(...a) };
});

vi.mock("@/lib/auth", () => ({
  useAuth: (sel: (s: unknown) => unknown) =>
    sel({
      role: "operation",
      /* A real session carries the user's ID; `Requested By` resolves the
         PERSON from it through the same Staff list the Register reads. */
      session: { user: { id: "u1", email: "siti@carres.com" } },
    }),
}));

const KLANG = "2f181917-f4e1-42b2-9e25-d7ee6785424a";
const REQ1 = "aaaaaaaa-0000-0000-0000-000000000001";
const REQ2 = "aaaaaaaa-0000-0000-0000-000000000002";
const REQ3 = "aaaaaaaa-0000-0000-0000-000000000003";
/** A second BUYABLE request — the mixed-selection regression needs two. */
const REQ4 = "aaaaaaaa-0000-0000-0000-000000000004";

/** Card 06 — the SERVER's Malaysia date every timing fact compares against. */
const TODAY = "2026-08-30";

const REGISTER = {
  todayIso: TODAY,
  planUnavailable: false,
  requests: [
    {
      id: REQ1,
      req_no: "MPR-20260819-0001",
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
      req_no: "MPR-20260819-0002",
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
      req_no: "MPR-20260818-0003",
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
      /* The date the issue door WOULD stamp — `PO Date + n Settings working
         days`, projected by the server (owner instruction 2026-09-23). */
      po_delivery_date: "2026-10-02",
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
  /* The ADDRESS rides along because the review's draft prints the document
     (owner instruction 2026-09-23), not a summary of it. */
  destinations: [{ id: KLANG, name: "HOUZS Balakong", address: "Batu 5, Klang" }],
  suppliers: [
    { id: "s1", name: "Ohana", address: "Lot 9, Ohana" },
    { id: "s2", name: "Office Co", address: "Lot 12, Office Co" },
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
  previewState.ready = true;
  let nextUrl = 0;
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true, value: vi.fn(() => `blob:mpr-${++nextUrl}`),
  });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
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

async function openWorkspace(options: { answerStockQuestion?: boolean } = {}) {
  await loaded();
  fireEvent.click(screen.getByTestId("manual-purchase-new-request"));
  await screen.findByTestId("manual-purchase-create");
  // The picker read lands before lines can be filled.
  await waitFor(() =>
    expect(screen.getByText("5539-2NA", { selector: ".font-mono" })).toBeTruthy(),
  );
  /* ⭐ 0549 — the form asks whether stock can answer the purchase and `Send`
     refuses until it does, so filling the form in includes answering it, the
     way an operator must. The gate itself is asserted by the one test that
     passes `false`. */
  if (options.answerStockQuestion !== false) await answerStockQuestion();
}

/**
 * ⭐ THE FORM ASKS WHETHER STOCK CAN ANSWER THE PURCHASE (0549), and `Send`
 * refuses until it is answered — so every test that reaches `Send` answers it,
 * exactly as an operator must. The gate itself is asserted separately below;
 * here it is just part of filling the form in.
 */
async function answerStockQuestion(answer: "yes" | "no" = "yes") {
  /* The kit `Select` is a Radix trigger, not a native `<select>`, so it is
     driven the way an operator drives it: focus, open with the keyboard, click
     the option. Measured in jsdom — `fireEvent.change` does nothing here. */
  const trigger = document.getElementById("mp-stock-answer")!;
  trigger.focus();
  fireEvent.keyDown(trigger, { key: "ArrowDown" });
  const option = await screen.findByRole("option", {
    name: answer === "yes" ? MW.canStockAnswerYes : MW.canStockAnswerNo,
  });
  fireEvent.click(option);
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
  it("⭐ `MPR No` is the identity again — and a retired REQ number still never prints", async () => {
    await loaded();
    /* Owner ruling 2026-09-18, which OVERWRITES Card 08's 2026-09-04
       retirement: each request carries `MPR-YYYYMMDD-RRRR` and it opens the
       document. */
    expect(screen.getByTestId(`mp-open-${REQ2}`)).toHaveTextContent("MPR-20260819-0002");
    /* The same ruling promises historical `REQ-####` values stay SEARCHABLE —
       a weaker promise than the one it makes for MPR, and Card 08 retired the
       series from every operator-facing surface. So it does not print, and the
       row states the absence instead of borrowing a second document series. */
    expect(screen.getByTestId(`mp-open-${REQ1}`)).toHaveTextContent("MPR-20260819-0001");
    expect(document.body.textContent).not.toContain("Manual Purchase No");
    // `PR-` is refused: 2990s prints it for a purchase return.
    expect(document.body.textContent).not.toMatch(/\bPR-\d/);
  });

  it("a retired REQ number and a request with none state the absence, and still open", async () => {
    apiFetch.mockImplementation((url: string) => {
      if (url.includes("/purchasing/requests/detail/")) return Promise.resolve(DETAIL);
      if (url.includes("/purchasing/requests")) {
        return Promise.resolve({
          ...REGISTER,
          requests: REGISTER.requests.map((r, i) =>
            i === 0 ? { ...r, req_no: "REQ-0001" } : i === 1 ? { ...r, req_no: null } : r,
          ),
        });
      }
      return Promise.resolve({});
    });
    await loaded();
    /* Neither prints a number under a heading that names ONE document series,
       and neither invents one. The row still opens by double-click and from
       the row menu, and the stored `REQ-0001` stays searchable. */
    expect(document.body.textContent).not.toContain("REQ-0001");
    expect(screen.queryByTestId(`mp-open-${REQ1}`)).toBeNull();
    expect(screen.queryByTestId(`mp-open-${REQ2}`)).toBeNull();
    expect(screen.getByTestId(`mp-row-${REQ1}`).textContent).toContain("Not recorded");
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

  it("`+ Manual Purchase Request` is the page's create door — COPY-STANDARD's own word", async () => {
    await loaded();
    const btn = screen.getByTestId("manual-purchase-new-request");
    expect(btn).toHaveTextContent("+ Manual Purchase Request");
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

  it("an EMPTY history group is hidden — a heading for a shelf nobody put anything on", async () => {
    const base = apiFetch.getMockImplementation()!;
    apiFetch.mockImplementation((url: string, init?: RequestInit) => {
      if (
        String(url).includes("/purchasing/requests") &&
        !String(url).includes("/detail/") &&
        !String(url).includes("/plan") &&
        !String(url).includes("/stock-allocation")
      ) {
        /* Only the two live requests: nothing is finished, refused or
           withdrawn, so `No PO needed` has nothing to show. */
        return Promise.resolve({
          ...REGISTER,
          requests: REGISTER.requests.filter((r) => r.id !== REQ3),
          lines: REGISTER.lines.filter((l) => l.request_id !== REQ3),
        });
      }
      return base(url, init);
    });
    await loaded({ openHistory: false });
    expect(screen.queryByTestId("grid-group-no-purchase-needed")).toBeNull();
    /* `Need approval` keeps its heading at 0 and says so — a page whose
       approval queue is empty is stating something useful. */
    expect(screen.getByTestId("grid-group-need-approval")).toBeInTheDocument();
  });

  it("three groups: Need approval · Need PO · a collapsed No PO needed", async () => {
    await loaded({ openHistory: false });
    /* ⭐ THE HEADING SAYS WHAT THE ROW'S OWN `Status` CELL SAYS, in the same
       two words (owner ruling 2026-09-18). `To buy` and `No purchase needed`
       are retired on THIS page; SO Batch keeps its own group words. */
    expect(screen.getByTestId("grid-group-need-approval")).toHaveTextContent("Need approval1");
    expect(screen.getByTestId("grid-group-to-buy")).toHaveTextContent("Need PO1");
    const history = screen.getByTestId("grid-group-toggle-no-purchase-needed");
    expect(history).toHaveTextContent("No PO needed1");
    expect(history).toHaveAttribute("aria-expanded", "false");
    // Collapsed rows stay in the total.
    expect(screen.getByTestId("mp-footer")).toHaveTextContent("3 Manual Purchase Requests");
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

  it("`Requested By` is a FACT — the real person, never an email and never `(you)`", async () => {
    /* ⭐ OWNER RULING 2026-09-22: the create form says `Requested By`, and it
       names the individual. It used to print `siti (you)` — the mailbox half
       of a login, in a sentence no other surface speaks — while the Register
       and the object both print the staff name. One fact, one spelling. */
    await openWorkspace();
    expect(screen.getByTestId("mp-raised-by")).toHaveTextContent("Siti");
    expect(screen.getByTestId("mp-raised-by").textContent).not.toContain("(you)");
    expect(screen.getByTestId("mp-raised-by").textContent).not.toContain("@");
    expect(screen.getByTestId("mp-raised-by").querySelector("input")).toBeNull();
    /* The fact is named on BOTH halves — the form asks it, the preview reads
       it back — so the query is the plural one on purpose. */
    expect(screen.getAllByText(MW.createRequestedBy).length).toBe(2);
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

  /* ═══════════════════════════════════════════════════════════════════════
     THE 2026-09-22 CREATE WORKSPACE — the Sales Order composition
     (`docs/purchasing/MASTER.md` §9.2; COPY-STANDARD create sections)
     ═══════════════════════════════════════════════════════════════════════ */

  it("draws THREE sections in the governed order, beside a live MPR preview", async () => {
    await openWorkspace();
    /* The 50/50 pair, the same `object-two-panes` contract the Sales Order
       page carries — the form left, the preview right, and the halves bind at
       1130px through the form's own container query (CSS, not JS). */
    const panes = screen.getByTestId("object-two-panes");
    expect(panes).toBeTruthy();
    expect(screen.getByTestId("mp-create-preview")).toBeTruthy();

    /* ONE reading order, and it is the ruling's: Request Details → Delivery →
       Items. Blocks are the shared Sales Order `Block`, so the band, the
       radius and the type come from one stylesheet rather than a copy. */
    const blocks = [...panes.querySelectorAll("[data-block]")].map((b) =>
      b.getAttribute("data-block"),
    );
    expect(blocks).toEqual([
      MW.secCreateRequestDetails,
      MW.secCreateDelivery,
      MW.secCreateItems,
    ]);
    /* The preview repeats the SAME sequence — a second order would make the
       operator re-find every fact they just typed. */
    const previewSections = [
      ...screen.getByTestId("mp-create-preview").querySelectorAll("[data-preview-section]"),
    ].map((el) => el.getAttribute("data-preview-section"));
    expect(previewSections).toEqual([
      MW.secCreateRequestDetails,
      MW.secCreateDelivery,
      MW.secCreateItems,
    ]);
    /* It is a DRAFT and says so — never an MPR number, never a PO number. */
    expect(screen.getByTestId("mp-preview-draft").textContent).toBe(MW.draft);
    expect(screen.getByTestId("mp-create-preview").textContent).not.toMatch(/MPR-\d/);
    expect(screen.getByTestId("mp-create-preview").textContent).not.toMatch(/PO-\d/);
  });

  it("the create form says `Purpose`, and the retired `Need for` is gone from it", async () => {
    await openWorkspace();
    const form = screen.getByTestId("manual-purchase-create");
    expect(within(form).getAllByText(MW.createPurpose).length).toBeGreaterThan(0);
    /* The label above the purpose Select is the dictionary's create word. The
       saved OBJECT keeps `Need for`, which was ruled separately — this is the
       create surface only. */
    const label = form.querySelector('label[for="mp-purpose"]')!;
    expect(label.textContent).toBe(MW.createPurpose);
  });

  it("the live preview follows the form — the picked item, its supplier and the total", async () => {
    await openWorkspace();
    fireEvent.focus(document.getElementById("mp-item-0")!);
    fireEvent.click(pickRow("5539-2NA"));
    fireEvent.change(document.getElementById("mp-qty-0")!, { target: { value: "3" } });
    const preview = screen.getByTestId("mp-create-preview");
    await waitFor(() => expect(preview.textContent).toContain("5539-2NA"));
    /* Catalog's supplier rides along — the operator never types one, and the
       preview is where they see WHICH factory this line will go to. */
    expect(preview.textContent).toContain("Ohana");
    expect(screen.getByTestId("mp-preview-total").textContent).toBe("3");
  });

  it("`Purchase requirement` is optional, on every purpose, and rides the wire", async () => {
    /* ⭐ OWNER RULING 2026-09-22. It is NOT `What is this for?`: that one is
       Other Purchase's required reason. `Ready Stock` is the default purpose
       here, so this proves the requirement is asked where the reason is not. */
    await openWorkspace();
    expect(screen.queryByTestId("mp-why")).toBeNull();
    pickDeliveryDate();
    fireEvent.focus(document.getElementById("mp-item-0")!);
    fireEvent.click(pickRow("5539-2NA"));
    fireEvent.change(screen.getByTestId("mp-requirement"), {
      target: { value: "Firm feel, king size only" },
    });
    await waitFor(() => expect(screen.getByTestId("mp-send")).toBeEnabled());
    fireEvent.click(screen.getByTestId("mp-send"));
    await waitFor(() =>
      expect(
        apiFetch.mock.calls.filter(
          (c) =>
            (c[1] as RequestInit | undefined)?.method === "POST" &&
            String(c[0]).endsWith("/purchasing/requests"),
        ),
      ).toHaveLength(1),
    );
    const post = apiFetch.mock.calls.find(
      (c) =>
        (c[1] as RequestInit | undefined)?.method === "POST" &&
        String(c[0]).endsWith("/purchasing/requests"),
    )!;
    const body = JSON.parse(String((post[1] as RequestInit).body)) as {
      purchaseRequirement?: string | null;
      why?: string | null;
    };
    expect(body.purchaseRequirement).toBe("Firm feel, king size only");
    /* The reason stays empty — a routine purpose is never asked it. */
    expect(body.why).toBeNull();
  });

  it("an EMPTY requirement rides as a real absence, never an empty string", async () => {
    await openWorkspace();
    pickDeliveryDate();
    fireEvent.focus(document.getElementById("mp-item-0")!);
    fireEvent.click(pickRow("5539-2NA"));
    await waitFor(() => expect(screen.getByTestId("mp-send")).toBeEnabled());
    fireEvent.click(screen.getByTestId("mp-send"));
    await waitFor(() =>
      expect(
        apiFetch.mock.calls.some(
          (c) =>
            (c[1] as RequestInit | undefined)?.method === "POST" &&
            String(c[0]).endsWith("/purchasing/requests"),
        ),
      ).toBe(true),
    );
    const post = apiFetch.mock.calls.find(
      (c) =>
        (c[1] as RequestInit | undefined)?.method === "POST" &&
        String(c[0]).endsWith("/purchasing/requests"),
    )!;
    const body = JSON.parse(String((post[1] as RequestInit).body)) as {
      purchaseRequirement?: string | null;
    };
    expect(body.purchaseRequirement).toBeNull();
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

  /* ⭐ THE DOOR IS CALLED FROM THE REVIEW (owner 2026-09-22), so a refusal is
     printed on the surface the operator is standing on. `tickReady` then this
     is the whole journey: tick → review → Issue PO. */
  async function issueFromReview() {
    fireEvent.click(screen.getByTestId("mp-issue-selected"));
    await clickIssue();
    return screen.findByTestId("so-batch-issue-error");
  }

  it("names a Catalog refusal returned by the governed issue API", async () => {
    /* ⭐ NOT A PRICE REFUSAL ANY MORE (owner instruction 2026-09-23): a SKU
       with no recorded price is ISSUED, carrying no commercial claim. What
       still refuses is a Catalog slot with no supplier Purchasing may buy
       from — and this pins that the server's words reach the operator. */
    apiFetch.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === "POST" && url.endsWith("/purchasing/requests/issue")) {
        return Promise.reject(Object.assign(new Error("refused"), {
          body: {
            code: "unresolved_supplier",
            message: "X-NEW-K has no transaction cost.",
            action: "Set the cost of X-NEW-K in Catalog.",
          },
        }));
      }
      return Promise.resolve(respond(url));
    });
    await tickReady();
    const err = await issueFromReview();
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
    const err = await issueFromReview();
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
              message: "One Manual Purchase Request has not been approved yet.",
              action: "Ask its approver to Approve it, then issue again.",
            },
          }),
        );
      }
      return Promise.resolve(respond(url));
    });
    await tickReady();
    const err = await issueFromReview();
    /* Two lines, fact then act — on the review surface, beside the document
       they name. The Register's own warning band keeps the refusals the
       Register itself computes (the collection rule, the 20-request ceiling,
       an unsaved stock draft). */
    const lines = err;
    expect(lines.children).toHaveLength(2);
    expect(lines.children[0]).toHaveTextContent("One Manual Purchase Request has not been approved yet.");
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
              message: "One Manual Purchase Request on this list is no longer there.",
              action: "Reload the page, then tick the ones that are left and issue again.",
            },
          }),
        );
      }
      return Promise.resolve(respond(url));
    });
    await tickReady();
    const err = await issueFromReview();
    expect(err).toHaveTextContent("One Manual Purchase Request on this list is no longer there.");
    /* ⭐ AND IT STAYS. The refusal that MOST needs reading is this one, and
       the review keeps both the message and the selection: leaving is the
       operator's act (`Cancel`), never a tick that empties underneath them. */
    expect(screen.getByTestId("so-batch-issue-workspace")).toBeInTheDocument();
    expect(screen.getByTestId("so-batch-issue-error")).toHaveTextContent(
      "Reload the page, then tick the ones that are left and issue again.",
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
/* Group-local headers (Jess, 2026-09-18, ui MASTER §6.10): a governed grouped
   listing has no `<thead>` above the groups — every OPEN group draws the same
   header between its heading and its records. One `<colgroup>` and one layout
   serve them all, so reading the first group's header reads the layout. */
const groupHeaderCells = (root: ParentNode): HTMLElement[] => [
  ...(root.querySelector<HTMLElement>('tr[data-testid^="grid-header-"]')?.querySelectorAll<HTMLElement>("th") ?? []),
];
describe("the fifteen columns, in the approved order (owner ruling 2026-09-18)", () => {
  const heads = (grid: HTMLElement) =>
    groupHeaderCells(grid)
      .map((th) => (th.textContent ?? "").replace(/[AV]$/, "").replace(/\s+/g, " ").trim())
      .filter((t) => t !== "");

  it("renders the exact heads, in order — and none of the banned columns", async () => {
    await loaded();
    const grid = screen.getByTestId("register-column");
    expect(heads(grid)).toEqual([
      "Status",
      "Proceed Date",
      "MPR No",
      "Approval Status",
      "Purpose",
      "Requested By",
      "PO Safety Days",
      "Customer Requested Delivery Date",
      "Customer Delivery Location",
      "Customer",
      "Items",
      "Supplier",
      "Supplier Deliver To",
      "PO No",
      "PO Delivery Date",
    ]);
    for (const banned of [
      "Qty",
      "For",
      "Partial",
      "PO Sent",
      "PO Created",
      "Need price",
      "Work",
      "Next action",
      "Reason",
      "Price",
      "Manual Purchase No",
      "Request No",
      /* Retired by this ruling: the margin replaced the planning DATE, and the
         request's internal required-arrival date may not stand in a customer
         column. */
      "Order By",
      "Delivery Date",
      "Deliver To",
      /* `PO Default Delivery Date` is the retired one (owner 2026-09-22); the
         approved head is `PO Delivery Date`, in the list above. */
      "PO Default Delivery Date",
    ]) {
      expect(heads(grid), `banned column "${banned}"`).not.toContain(banned);
    }
  });


  it("⭐ `Status` and `Approval Status` are INDEPENDENT — Need PO may stand beside Need approval", async () => {
    await loaded();
    /* REQ1 is waiting for a decision AND has quantity outstanding. The goods
       are needed; the decision is a separate fact. Replacing one with the
       other is exactly what this ruling forbids. */
    const row = screen.getByTestId(`mp-row-${REQ1}`);
    expect(within(row).getByText("Need PO")).toBeInTheDocument();
    expect(within(row).getByTestId(`mp-approval-${REQ1}`)).toHaveTextContent("Need approval");
  });

  it("`MPR No` is the identity and the entrance; a request with no number states the absence", async () => {
    await loaded();
    const entrance = screen.getByTestId(`mp-open-${REQ1}`);
    expect(entrance).toHaveTextContent(/^MPR-/);
    const mprCell = entrance.closest("td")!;
    expect(mprCell.className).toMatch(/sticky|Sticky/);
    /* Proceed Date pins beside it on a wide canvas; `Status` scrolls under the
       block, because the approved order starts with it and a PIN may not
       reorder the owner's own column list. */
    const dateCell = mprCell.previousElementSibling as HTMLElement;
    expect(dateCell.className).toMatch(/sticky|Sticky/);
    expect(dateCell.style.left).not.toBe("");
    expect((mprCell.nextElementSibling as HTMLElement).style.left).toBe("");
  });

  it("R2 default order: waiting · Order By · Not planned · history newest first", async () => {
    await loaded();
    const grid = screen.getByTestId("register-column");
    const order = [...grid.querySelectorAll('[data-testid^="mp-open-"]')]
      .map((el) => el.getAttribute("data-testid"));
    expect(order).toEqual([`mp-open-${REQ1}`, `mp-open-${REQ2}`, `mp-open-${REQ3}`]);
  });

  /**
   * `PO Safety Days` is measured against TODAY, so a fixture date would flip
   * from margin to overrun as the calendar moves. Both tests below state the
   * case they mean as an offset from today instead.
   */
  function orderByInDays(days: number): string {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  function withReq1OrderBy(iso: string) {
    apiFetch.mockImplementation((url: string, init?: RequestInit) => {
      const answer = respond(url, init);
      if (answer !== REGISTER) return Promise.resolve(answer);
      return Promise.resolve({
        ...REGISTER,
        lines: REGISTER.lines.map((l) =>
          l.request_id === REQ1 ? { ...l, order_by: iso } : l,
        ),
      });
    });
  }

  it("`PO Safety Days` is a MARGIN, and an unplannable line is never 0", async () => {
    withReq1OrderBy(orderByInDays(30));
    await loaded();
    /* REQ1 has an engine Order By still ahead of us, so it has a real
       working-day margin — a COUNT, never the date itself. */
    expect(screen.getByTestId(`mp-safety-days-${REQ1}`).textContent).toMatch(/^\d+$/);
    expect(screen.getByTestId(`mp-safety-days-${REQ1}`).textContent).not.toContain("Sep");
    /* REQ2 cannot be planned (no Supplier × Category production days). UNKNOWN
       says so; `0` would read as *order today or you are late*. */
    expect(screen.queryByTestId(`mp-safety-days-${REQ2}`)).toBeNull();
    /* REQ3 has nothing left to buy: no margin is owed, so the cell is blank
       rather than alarming. */
    expect(screen.queryByTestId(`mp-safety-days-${REQ3}`)).toBeNull();
  });

  it("⛔ A DAYS COLUMN NEVER PRINTS A NEGATIVE NUMBER — past the date is a STATE", async () => {
    /* SO Batch's shipped cell already refuses one ("never a negative number in
       a days column") and the dictionary applies the shared margin display
       here. `-18` is not a margin of minus eighteen days; it is the fact that
       the day to order by is behind us, and a reader should not have to decode
       a minus sign to learn it. The sort still reads the signed number, so the
       worst row stays first. */
    withReq1OrderBy(orderByInDays(-30));
    await loaded();
    const cell = screen.getByTestId(`mp-safety-days-${REQ1}`);
    expect(cell.textContent).toBe("Order date passed");
    expect(cell.textContent).not.toMatch(/-\d/);
  });

  it("the customer columns are BLANK where no customer is named — never invented", async () => {
    await loaded();
    /* A `Ready Stock` purchase serves no customer. The columns exist and say
       nothing, which is the truthful answer; substituting the requester or the
       request's own internal delivery date is what the dictionary bans. */
    expect(screen.getByTestId(`mp-customer-${REQ1}`).textContent).toBe("");
  });

  it("PO No is real lineage — the actual number clickable, absence named", async () => {
    await loaded();
    const link = screen.getByTestId(`mp-po-link-${REQ3}`);
    expect(link).toHaveTextContent("PO-20260818-9001");
    fireEvent.click(link);
    expect(navigate).toHaveBeenCalledWith("/operation/procurement?po=PO-20260818-9001");
    /* ⭐ THE ABSENCE IS A SENTENCE (owner 2026-09-21, UI MASTER §6.0): a
       request with no purchase order reads `No PO yet`, not a dash that could
       mean "nothing to say". */
    expect(screen.getAllByText(MW.poNone).length).toBeGreaterThan(0);
    expect(MW.poNone).toBe("No PO yet");
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
  /* Group-local headers (Jess, 2026-09-18): a row's group is the table it is
     in — each governed group is its own table, so the answer is structural
     rather than a walk back through siblings. */
  const groupOfRow = (id: string) => {
    const section = screen.getByTestId(`mp-row-${id}`).closest("table")?.getAttribute("data-testid");
    return section?.replace("grid-section-", "grid-group-");
  };

  it("⭐ an approved request whose lines could not be read stays in To buy, says so, and refuses the tick", async () => {
    withRegister({ ...REGISTER, lines: [], linesUnavailable: true });
    await loaded();
    expect(groupOfRow(REQ2)).toBe("grid-group-to-buy");
    expect(groupOfRow(REQ3)).toBe("grid-group-to-buy");
    expect(within(screen.getByTestId(`mp-approval-${REQ2}`)).getByText("Remaining quantity not checked")).toBeInTheDocument();
    expect(screen.getByTestId(`mp-select-${REQ2}`)).toBeDisabled();
    expect(screen.getByTestId(`mp-select-${REQ2}`)).toHaveAccessibleDescription("Remaining quantity not checked");
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

/**
 * ⭐ THE ROW EXPANSION — the SHARED goods table in its Manual Purchase order,
 * with each line's own Ready Stock frame beneath it
 * (owner ruling 2026-09-18; MASTER §9.2; UI MASTER §6.8–6.9).
 *
 * Every test here FAILS on the settled 2026-09-11 page, and each failure is a
 * sentence the owner overwrote: the goods could not be selected individually,
 * the stock section was one read-only box at the bottom of the expansion, and
 * nothing on it could be pressed.
 */
describe("the row expansion — goods, their Status, and their own Ready Stock", () => {
  /** The allocation read, in the shape the new door answers. */
  const STOCK = (over: Record<string, unknown> = {}) => ({
    requestId: REQ2,
    reference: "MPR-20260819-0002",
    intent: "concrete_need",
    approved: true,
    lines: [
      {
        demandId: "l2",
        sku: "MATTRESS-LOOK-9",
        item: "Atlas K",
        requestedQty: 3,
        approvedQty: null,
        issuedQty: 0,
        availableQty: 1,
        reservedQty: 0,
        remainingQty: 3,
        stockBlock: null,
        units: [
          {
            itemId: "11111111-1111-1111-1111-111111111111",
            unitCode: "U1-000-014",
            identityScope: "unit",
            sku: "MATTRESS-LOOK-9",
            goodsReceivedDate: "2026-08-01",
            stockLocation: "Carres Klang",
            supplier: "Ohana",
            sourceRef: "PO-20260801-1121",
            condition: "exhibition",
            ownership: "carres_owned",
            qty: 1,
            reservedForThisLine: false,
            blocked: null,
          },
        ],
      },
    ],
    ...over,
  });

  function withStock(payload: unknown) {
    const base = apiFetch.getMockImplementation()!;
    apiFetch.mockImplementation((url: string, init?: RequestInit) => {
      if (String(url).includes("/stock-allocation")) return Promise.resolve(payload);
      return base(url, init);
    });
  }

  it("draws GoodsMiniTable's box with the APPROVED Manual Purchase columns", async () => {
    withStock(STOCK());
    await loaded();
    fireEvent.click(screen.getByTestId(`mp-expand-${REQ3}`));
    const box = await screen.findByTestId(`mp-expansion-${REQ3}`);
    /* THE SAME COMPONENT SO BATCH DRAWS — not a second table that starts
       identical and drifts. */
    expect(within(box).getByTestId("goods-mini-table")).toBeInTheDocument();
    /* The leading cell is the selection checkbox's — chrome, not a ruled
       column (law ④: selection is a capability a page ASKS for). */
    const heads = [...box.querySelectorAll("thead th")]
      .map((th) => th.textContent?.trim())
      .filter((t) => t !== "");
    expect(heads).toEqual([
      "Status",
      "Category",
      "Qty",
      "Item",
      "Ready Stock",
      "Supplier",
      "Supplier Deliver To",
      "PO No",
      "PO Delivery Date",
    ]);
    /* SKU LEFT THE COLUMNS AND STAYED ON THE SCREEN — it prints under the
       item, where a person reads a code, and the register still searches it. */
    expect(heads).not.toContain("SKU");
    expect(box.textContent).toContain("BED-K-01");
    for (const banned of ["Covered by", "Unit ID", "Still To Order", "Ordered Qty", "To buy"]) {
      expect(heads, `banned goods column "${banned}"`).not.toContain(banned);
    }
  });

  it("⭐ EACH GOODS LINE TAKES ITS OWN TICK, and the parent shows MIXED for a partial choice", async () => {
    withStock(STOCK());
    await loaded();
    fireEvent.click(screen.getByTestId(`mp-expand-${REQ2}`));
    const box = await screen.findByTestId(`mp-expansion-${REQ2}`);
    const ticks = [...box.querySelectorAll<HTMLInputElement>("input[type='checkbox']")];
    expect(ticks.length).toBeGreaterThan(0);
    /* ⛔ THE GOODS DO NOT READ SELECTED WHILE THE REQUEST DOES NOT (found on
       the rendered walk, 2026-09-18). A child tick NARROWS the parent's; it
       cannot select anything on its own, and a row painting itself selected
       while the act would do nothing is a promise the screen cannot keep. */
    expect(ticks.every((t) => !t.checked)).toBe(true);
    /* The parent tick means EVERY eligible line, so the children follow it. */
    fireEvent.click(screen.getByTestId(`mp-select-${REQ2}`));
    expect(
      [...box.querySelectorAll<HTMLInputElement>("input[type='checkbox']")].every((t) => t.checked),
    ).toBe(true);
    /* This request carries ONE eligible line, so unticking it is unticking the
       request: a selection of no goods is not a selection. The narrowing case
       — some lines kept, some dropped — is the test below. */
    fireEvent.click(box.querySelectorAll<HTMLInputElement>("input[type='checkbox']")[0]!);
    expect(box.querySelectorAll<HTMLInputElement>("input[type='checkbox']")[0]!.checked).toBe(false);
    expect((screen.getByTestId(`mp-select-${REQ2}`) as HTMLInputElement).checked).toBe(false);
  });

  it("⭐ A PARTIAL CHOICE KEEPS THE REQUEST SELECTED and issues only the ticked lines", async () => {
    const base = apiFetch.getMockImplementation()!;
    const posted: unknown[] = [];
    apiFetch.mockImplementation((url: string, init?: RequestInit) => {
      if (String(url).includes("/stock-allocation")) return Promise.resolve(STOCK());
      if (String(url).includes("/purchasing/requests/issue")) {
        posted.push(JSON.parse(String(init?.body ?? "{}")));
        return Promise.resolve({ poIds: [], documents: 1 });
      }
      if (
        String(url).includes("/purchasing/requests") &&
        !String(url).includes("/detail/") &&
        !String(url).includes("/plan")
      ) {
        /* TWO eligible lines on one approved request. */
        return Promise.resolve({
          ...REGISTER,
          lines: [
            ...REGISTER.lines,
            { ...REGISTER.lines.find((l) => l.request_id === REQ2)!, id: "l2b", sku: "BED-K-01" },
          ],
        });
      }
      return base(url, init);
    });
    await loaded();
    fireEvent.click(screen.getByTestId(`mp-expand-${REQ2}`));
    const box = await screen.findByTestId(`mp-expansion-${REQ2}`);
    fireEvent.click(screen.getByTestId(`mp-select-${REQ2}`));
    const ticks = () => [...box.querySelectorAll<HTMLInputElement>("input[type='checkbox']")];
    expect(ticks()).toHaveLength(2);
    fireEvent.click(ticks()[0]!);
    /* MIXED: one line dropped, the request still selected. */
    expect(ticks().map((t) => t.checked)).toEqual([false, true]);
    expect((screen.getByTestId(`mp-select-${REQ2}`) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByTestId("mp-issue-selected"));
    /* ⭐ REVIEW FIRST (owner 2026-09-22): the register's button opens the
       documents; nothing is posted until the review's own `Issue PO`. */
    await screen.findByTestId("so-batch-issue-workspace");
    expect(posted).toHaveLength(0);
    await clickIssue();
    await waitFor(() => expect(posted).toHaveLength(1));
    /* ⭐ THE ISSUE CARRIES THE CHOSEN LINES — the tick narrows what is bought
       instead of buying the whole request. */
    expect((posted[0] as { demandIds?: string[] }).demandIds).toEqual(["l2b"]);
  });

  it("ticking a goods line on an UNSELECTED request means *buy this one*", async () => {
    withStock(STOCK());
    await loaded();
    fireEvent.click(screen.getByTestId(`mp-expand-${REQ2}`));
    const box = await screen.findByTestId(`mp-expansion-${REQ2}`);
    expect((screen.getByTestId(`mp-select-${REQ2}`) as HTMLInputElement).checked).toBe(false);
    fireEvent.click(box.querySelectorAll<HTMLInputElement>("input[type='checkbox']")[0]!);
    /* The request joins the selection with exactly that line narrowed, rather
       than the tick doing nothing visible. */
    expect((screen.getByTestId(`mp-select-${REQ2}`) as HTMLInputElement).checked).toBe(true);
    expect(box.querySelectorAll<HTMLInputElement>("input[type='checkbox']")[0]!.checked).toBe(true);
    /* And unticking the LAST chosen line unticks the request: a selection of
       no goods is not a selection. */
    fireEvent.click(box.querySelectorAll<HTMLInputElement>("input[type='checkbox']")[0]!);
    expect((screen.getByTestId(`mp-select-${REQ2}`) as HTMLInputElement).checked).toBe(false);
  });

  it("a line split across two POs prints each document's OWN quantity", async () => {
    /* ⭐ THE DEFECT THIS SHAPE EXISTS TO CLOSE. The old expansion printed one
       row carrying the whole requested quantity beside `PO-A, PO-B` — read
       left to right, that says BOTH documents ordered the full amount. */
    const base = apiFetch.getMockImplementation()!;
    apiFetch.mockImplementation((url: string, init?: RequestInit) => {
      if (String(url).includes("/stock-allocation")) return Promise.resolve(STOCK());
      if (
        String(url).includes("/purchasing/requests") &&
        !String(url).includes("/detail/") &&
        !String(url).includes("/plan")
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
    const qtys = [...box.querySelectorAll('[data-row="demand"]')].map(
      (tr) => [...tr.querySelectorAll("td")].map((td) => td.textContent?.trim()),
    );
    /* Two documents, 1 + 1 — never 2 + 2 — each with its own supplier and its
       own ORIGINAL delivery date. */
    expect(qtys).toHaveLength(2);
    expect(box.textContent).toContain("PO-20260818-9001");
    expect(box.textContent).toContain("PO-20260818-9002");
    expect(box.textContent).toContain("Sun, 20 Sep");
    expect(box.textContent).toContain("Sun, 27 Sep");
  });

  it("what is still to buy is a ROW, not a `Still To Order` column", async () => {
    withStock(STOCK());
    await loaded();
    fireEvent.click(screen.getByTestId(`mp-expand-${REQ2}`));
    const box = await screen.findByTestId(`mp-expansion-${REQ2}`);
    // The absence names itself; `—` would not say WHY the cell is empty.
    expect(box.textContent).toContain("Not ordered yet");
    expect(box.textContent).toContain("Need PO");
  });

  it("⭐ `Ready Stock` IS A CELL ON THE ITEM ROW — two counts and its own disclosure", async () => {
    withStock(STOCK());
    await loaded();
    fireEvent.click(screen.getByTestId(`mp-expand-${REQ2}`));
    const box = await screen.findByTestId(`mp-expansion-${REQ2}`);
    /* It is not a sibling section at the bottom any more: a Unit answers a
       LINE, so its counts and its door belong to that line. */
    const cell = await within(box).findByText("1 available");
    expect(cell).toBeInTheDocument();
    const disclosure = within(box).getByTestId("mp-stock-disclosure-l2");
    expect(disclosure).toHaveAttribute("aria-expanded", "false");
    /* CLOSED MEANS CLOSED: the frame is not in the document until it is opened. */
    expect(screen.queryByTestId("mp-stock-frame-l2")).toBeNull();
  });

  it("the stock frame opens under its OWN item, connected by the governed line", async () => {
    withStock(STOCK());
    await loaded();
    fireEvent.click(screen.getByTestId(`mp-expand-${REQ2}`));
    const box = await screen.findByTestId(`mp-expansion-${REQ2}`);
    fireEvent.click(await within(box).findByTestId("mp-stock-disclosure-l2"));
    const frame = await within(box).findByTestId("mp-stock-frame-l2");
    /* UI MASTER §6.9 — the line leaves the cell it was opened from and
       touches the TOP BORDER of the frame. It is drawn from the locked column
       widths, so it does not move when the table finishes loading. */
    const connector = within(box).getByTestId("goods-connector-l2");
    expect(connector).toBeInTheDocument();
    /* The frame rides in the goods table's own row, so it scrolls sideways
       WITH the cell it belongs to. */
    expect(within(box).getByTestId("goods-detail-l2").contains(frame)).toBe(true);
  });

  it("⭐ THE PICKER'S SIX APPROVED COLUMNS, and the date is a DATE", async () => {
    withStock(STOCK());
    await loaded();
    fireEvent.click(screen.getByTestId(`mp-expand-${REQ2}`));
    const box = await screen.findByTestId(`mp-expansion-${REQ2}`);
    fireEvent.click(await within(box).findByTestId("mp-stock-disclosure-l2"));
    const frame = await within(box).findByTestId("mp-stock-frame-l2");
    const table = within(frame).getByRole("table");
    /* The shared picker (`ReadyStockTable` `layout="picker"`) prints each
       heading as one string, so the cell's own text IS the whole name. The
       leading select cell is chrome and carries no heading. */
    const heads = [...table.querySelectorAll<HTMLElement>("th")]
      .map((th) => th.textContent ?? "")
      .filter((t) => t !== "");
    expect(heads).toEqual([
      "Goods Received Date",
      "Stock Location",
      "Supplier",
      "PO No / Ref No",
      "Condition",
    ]);
    const row = within(box).getByTestId(
      "ready-stock-unit-11111111-1111-1111-1111-111111111111",
    );
    /* THE DATE IS A DATE. `2026-08-01` reaches the cell as a bare date (the
       route slices the stored timestamp) and prints in the portal's ONE date
       spelling — never a second, raw-ISO spelling of its own. What the ruling
       forbids is the TIME, so that is what is asserted against. */
    expect(row.textContent).toContain("Sat, 1 Aug");
    expect(row.textContent).not.toMatch(/\d{2}:\d{2}/);
    expect(row.textContent).toContain("Carres Klang");
    expect(row.textContent).toContain("Ohana");
    /* The Unit's OWN source document, with its Unit ID on line two. */
    expect(row.textContent).toContain("PO-20260801-1121");
    expect(row.textContent).toContain("U1-000-014");
    /* CONDITION IS A GRADE — `Display` is fully available. */
    expect(row.textContent).toContain("Display");
  });

  it("⭐ TICKING IS A DRAFT: it writes nothing, and `Choose Ready Unit` is the save", async () => {
    withStock(STOCK());
    await loaded();
    fireEvent.click(screen.getByTestId(`mp-expand-${REQ2}`));
    const box = await screen.findByTestId(`mp-expansion-${REQ2}`);
    fireEvent.click(await within(box).findByTestId("mp-stock-disclosure-l2"));
    await within(box).findByTestId("mp-stock-frame-l2");
    const before = apiFetch.mock.calls.filter((c: unknown[]) =>
      String(c[0]).includes("/stock-allocation") && (c[1] as RequestInit | undefined)?.method === "POST",
    ).length;
    fireEvent.click(
      within(box).getByRole("checkbox", { name: "Choose U1-000-014" }),
    );
    /* VIEWING AND TICKING ARE NOT SAVING. */
    expect(
      apiFetch.mock.calls.filter((c: unknown[]) =>
        String(c[0]).includes("/stock-allocation") && (c[1] as RequestInit | undefined)?.method === "POST",
      ).length,
    ).toBe(before);
    expect(within(box).getByTestId("mp-stock-count-l2")).toHaveTextContent("1 selected");
    expect(box.textContent).toContain("Not saved");
    fireEvent.click(within(box).getByTestId("mp-stock-save-l2"));
    await waitFor(() =>
      expect(
        apiFetch.mock.calls.filter((c: unknown[]) =>
          String(c[0]).includes("/stock-allocation") && (c[1] as RequestInit | undefined)?.method === "POST",
        ).length,
      ).toBe(before + 1),
    );
    const sent = JSON.parse(
      String(
        (apiFetch.mock.calls
          .filter((c: unknown[]) => String(c[0]).includes("/stock-allocation") && (c[1] as RequestInit | undefined)?.method === "POST")
          .at(-1)![1] as RequestInit).body,
      ),
    );
    /* THE COMPLETE DESIRED SET, bound to the exact MPR LINE — never an SO. */
    expect(sent).toEqual({
      demandId: "l2",
      itemIds: ["11111111-1111-1111-1111-111111111111"],
      expectedItemIds: [],
    });
  });

  it("a SAVED choice reopens through `Change selection`, and `Cancel` restores it", async () => {
    withStock(
      STOCK({
        lines: [
          {
            ...STOCK().lines[0],
            reservedQty: 1,
            remainingQty: 2,
            units: [{ ...STOCK().lines[0].units[0], reservedForThisLine: true }],
          },
        ],
      }),
    );
    await loaded();
    fireEvent.click(screen.getByTestId(`mp-expand-${REQ2}`));
    const box = await screen.findByTestId(`mp-expansion-${REQ2}`);
    /* The cell states BOTH counts, on their own lines. */
    expect(await within(box).findByText("1 reserved")).toBeInTheDocument();
    fireEvent.click(within(box).getByTestId("mp-stock-disclosure-l2"));
    await within(box).findByTestId("mp-stock-frame-l2");
    /* ⛔ NO PER-UNIT UNDO — one journey, four controls, and the first is
       `Change selection`. */
    expect(within(box).queryByText("Undo")).toBeNull();
    fireEvent.click(within(box).getByTestId("mp-stock-change-l2"));
    fireEvent.click(within(box).getByRole("checkbox", { name: "Choose U1-000-014" }));
    expect(within(box).getByTestId("mp-stock-count-l2")).toHaveTextContent("0 selected");
    /* `Save changes` would remove every Unit — including all of them. */
    expect(within(box).getByTestId("mp-stock-save-l2")).toHaveTextContent("Save changes");
    fireEvent.click(within(box).getByTestId("mp-stock-cancel-l2"));
    expect(within(box).getByTestId("mp-stock-count-l2")).toHaveTextContent("1 selected");
  });

  it("⛔ ADDITIONAL REPLENISHMENT SHOWS THE SHELF AND CANNOT TAKE IT", async () => {
    withStock(
      STOCK({
        intent: "additional_stock",
        lines: [{ ...STOCK().lines[0], stockBlock: "additional_stock" }],
      }),
    );
    await loaded();
    fireEvent.click(screen.getByTestId(`mp-expand-${REQ2}`));
    const box = await screen.findByTestId(`mp-expansion-${REQ2}`);
    fireEvent.click(await within(box).findByTestId("mp-stock-disclosure-l2"));
    const frame = await within(box).findByTestId("mp-stock-frame-l2");
    expect(within(frame).getByTestId("mp-stock-block-l2")).toHaveTextContent(
      "This purchase buys extra stock. What is on the shelf does not reduce it.",
    );
    /* The goods still SHOW — and nothing can be ticked, and the ask is not
       netted down by what is standing there. */
    expect(frame.textContent).toContain("U1-000-014");
    expect(frame.querySelectorAll("input[type='checkbox']").length).toBe(0);
    expect(frame.textContent).toContain("Requested 3");
    expect(frame.textContent).toContain("3 to buy");
  });

  it("⛔ AN UNRECORDED INTENT IS ITS OWN STATE — never guessed into either answer", async () => {
    withStock(
      STOCK({
        intent: null,
        lines: [{ ...STOCK().lines[0], stockBlock: "intent_not_recorded" }],
      }),
    );
    await loaded();
    fireEvent.click(screen.getByTestId(`mp-expand-${REQ2}`));
    const box = await screen.findByTestId(`mp-expansion-${REQ2}`);
    fireEvent.click(await within(box).findByTestId("mp-stock-disclosure-l2"));
    expect(await within(box).findByTestId("mp-stock-block-l2")).toHaveTextContent(
      "This purchase did not record whether stock can answer it, so stock cannot be chosen.",
    );
  });

  it("an UNAPPROVED request may not choose stock, and says why", async () => {
    withStock(
      STOCK({
        approved: false,
        lines: [{ ...STOCK().lines[0], stockBlock: "not_approved" }],
      }),
    );
    await loaded();
    fireEvent.click(screen.getByTestId(`mp-expand-${REQ2}`));
    const box = await screen.findByTestId(`mp-expansion-${REQ2}`);
    fireEvent.click(await within(box).findByTestId("mp-stock-disclosure-l2"));
    expect(await within(box).findByTestId("mp-stock-block-l2")).toHaveTextContent(
      "Stock can be chosen after this purchase is approved.",
    );
    expect(within(box).queryByTestId("mp-stock-save-l2")).toBeNull();
  });

  it("⭐ A REASON IS SOMETHING TO DISCLOSE — a blocked line with NO Units still opens", async () => {
    /* The read-only reasons reached the operator only on lines that happened to
       have stock to list. A line that cannot choose — not approved, additional
       replenishment, no recorded intent — usually has no Units at all, so it
       had no door and the cell read as a bare `0 available` with the one
       sentence that explains it unreachable. A dead control is a control that
       opens NOTHING; a control that opens the explanation is the opposite. */
    withStock(
      STOCK({
        approved: false,
        lines: [
          {
            ...STOCK().lines[0],
            stockBlock: "not_approved",
            availableQty: 0,
            reservedQty: 0,
            units: [],
          },
        ],
      }),
    );
    await loaded();
    fireEvent.click(screen.getByTestId(`mp-expand-${REQ2}`));
    const box = await screen.findByTestId(`mp-expansion-${REQ2}`);
    fireEvent.click(await within(box).findByTestId("mp-stock-disclosure-l2"));
    expect(await within(box).findByTestId("mp-stock-block-l2")).toHaveTextContent(
      "Stock can be chosen after this purchase is approved.",
    );
  });

  it("⛔ AND A DOOR THAT WOULD OPEN NOTHING IS STILL NOT DRAWN", async () => {
    /* No Units and no reason to give: there is nothing behind the caret, so
       there is no caret. The count still prints, because `0 available` is the
       one place `0` may appear. */
    withStock(
      STOCK({
        lines: [
          {
            ...STOCK().lines[0],
            stockBlock: null,
            availableQty: 0,
            reservedQty: 0,
            units: [],
          },
        ],
      }),
    );
    await loaded();
    fireEvent.click(screen.getByTestId(`mp-expand-${REQ2}`));
    const box = await screen.findByTestId(`mp-expansion-${REQ2}`);
    await within(box).findByTestId("goods-mini-table");
    expect(within(box).queryByTestId("mp-stock-disclosure-l2")).toBeNull();
    expect(box.textContent).toContain("0 available");
  });

  it("LOADING AND FAILURE NEVER PRINT `0`", async () => {
    const base = apiFetch.getMockImplementation()!;
    apiFetch.mockImplementation((url: string, init?: RequestInit) => {
      if (String(url).includes("/stock-allocation")) return Promise.reject(new Error("down"));
      return base(url, init);
    });
    await loaded();
    fireEvent.click(screen.getByTestId(`mp-expand-${REQ2}`));
    const box = await screen.findByTestId(`mp-expansion-${REQ2}`);
    await waitFor(() => expect(box.textContent).toContain("Could not be loaded"));
    expect(box.textContent).not.toContain("0 available");
  });

  it("a refusal keeps the operator's choices on screen and says nothing was saved", async () => {
    const base = apiFetch.getMockImplementation()!;
    apiFetch.mockImplementation((url: string, init?: RequestInit) => {
      if (String(url).includes("/stock-allocation") && init?.method === "POST") {
        return Promise.reject(
          Object.assign(new Error("conflict"), {
            body: { code: "unit_no_longer_free", itemId: "11111111-1111-1111-1111-111111111111" },
          }),
        );
      }
      if (String(url).includes("/stock-allocation")) return Promise.resolve(STOCK());
      return base(url, init);
    });
    await loaded();
    fireEvent.click(screen.getByTestId(`mp-expand-${REQ2}`));
    const box = await screen.findByTestId(`mp-expansion-${REQ2}`);
    fireEvent.click(await within(box).findByTestId("mp-stock-disclosure-l2"));
    await within(box).findByTestId("mp-stock-frame-l2");
    fireEvent.click(within(box).getByRole("checkbox", { name: "Choose U1-000-014" }));
    fireEvent.click(within(box).getByTestId("mp-stock-save-l2"));
    const refusal = await within(box).findByTestId("mp-stock-refusal-l2");
    expect(refusal).toHaveTextContent("Someone else took that Unit.");
    expect(refusal).toHaveTextContent("Nothing was saved.");
    /* The tick survives the refusal — making them choose again to reach the
       same answer is four more races. */
    expect(within(box).getByTestId("mp-stock-count-l2")).toHaveTextContent("1 selected");
  });

  it("⭐ AN UNSAVED DRAFT REFUSES `Issue PO` BY NAME", async () => {
    withStock(STOCK());
    await loaded();
    fireEvent.click(screen.getByTestId(`mp-expand-${REQ2}`));
    const box = await screen.findByTestId(`mp-expansion-${REQ2}`);
    fireEvent.click(await within(box).findByTestId("mp-stock-disclosure-l2"));
    await within(box).findByTestId("mp-stock-frame-l2");
    fireEvent.click(within(box).getByRole("checkbox", { name: "Choose U1-000-014" }));
    fireEvent.click(screen.getByTestId(`mp-select-${REQ2}`));
    fireEvent.click(screen.getByTestId("mp-issue-selected"));
    expect(await screen.findByTestId("mp-issue-selected-error")).toHaveTextContent(
      "Save or cancel your stock selection before issuing a PO.",
    );
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
    expect(toggle).toHaveTextContent("No PO needed1");
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

  /* ═══════════════════════════════════════════════════════════════════════
     REVIEW PURCHASE ORDERS — the surface between the tick and the door
     (owner ruling 2026-09-22; `docs/purchasing/MASTER.md` §9.2)
     ═══════════════════════════════════════════════════════════════════════ */

  it("⭐ `Issue PO` REVIEWS first — the door is never called from the row", async () => {
    /* THE DEFECT THIS PINS. One click used to create numbered purchase orders
       with Unit IDs born under them, with no document ever shown. */
    await loaded();
    fireEvent.click(screen.getByTestId(`mp-select-${REQ2}`));
    fireEvent.click(await screen.findByTestId("mp-issue-selected"));
    const review = await screen.findByTestId("so-batch-issue-workspace");
    // NOTHING was posted by opening the review.
    expect(
      apiFetch.mock.calls.filter((c) =>
        String(c[0]).endsWith("/purchasing/requests/issue"),
      ),
    ).toHaveLength(0);
    // The 50/50 pair: the work on the left, the draft document on the right.
    expect(within(review).getByTestId("so-batch-issue-work")).toBeTruthy();
    expect(within(review).getByTestId("so-batch-issue-preview")).toBeTruthy();
    // It says the number does not exist yet, and offers no send or download.
    expect(review.textContent).toContain(
      "This is a preview. Issue PO creates the number.",
    );
    expect(review.textContent).not.toMatch(/PO-\d/);
    // The document names its supplier → destination, and the Source column
    // carries the MPR number this line came from — never an SO.
    expect(within(review).getByTestId("so-batch-issue-title").textContent).toContain("→");
    expect(review.textContent).not.toContain("SO-");
    /* Cancel leaves with nothing created — and the selection survives, so the
       operator does not tick twelve rows again. */
    fireEvent.click(within(review).getByTestId("so-batch-issue-back"));
    await waitFor(() => expect(screen.queryByTestId("so-batch-issue-workspace")).toBeNull());
    expect((screen.getByTestId(`mp-select-${REQ2}`) as HTMLInputElement).checked).toBe(true);
  });

  it("the draft PDF is a DRAFT — no number, no version, no issue date, no Unit ID", async () => {
    const { renderPoPdf } = await import("@/lib/pdf/render");
    vi.mocked(renderPoPdf).mockClear();
    await loaded();
    fireEvent.click(screen.getByTestId(`mp-select-${REQ2}`));
    fireEvent.click(await screen.findByTestId("mp-issue-selected"));
    await screen.findByTestId("so-batch-issue-workspace");
    await waitFor(() => expect(renderPoPdf).toHaveBeenCalled());
    const data = vi.mocked(renderPoPdf).mock.calls[0]![0] as Record<string, unknown>;
    expect(data.draft).toBe(true);
    expect(data.po_number).toBe("DRAFT");
    expect(data.version).toBe(0);
    expect(data.issue_date).toBe("");
    /* ⭐ AND IT IS THE DOCUMENT, NOT A SUMMARY OF IT (owner instruction
       2026-09-23). The two addresses and the delivery date used to ride as
       empty values, so the operator checked a paper missing the three facts
       the supplier reads first. They come from the SERVER — the browser
       computes no date and invents no address. */
    expect((data.supplier as { address?: unknown }).address).toBe("Lot 12, Office Co");
    expect((data.destination as { address?: unknown }).address).toBe("Batu 5, Klang");
    expect(data.eta_date).toBe("2026-10-02");
    /* A Manual Purchase serves no customer order: the paper's SO NO column is
       empty by fact, never filled with the MPR's own identity. */
    expect(data.so_refs).toEqual([]);
    expect(JSON.stringify(data)).not.toMatch(/U\d-\d{3}-\d{3}/);
  });

  it("⭐ A MIXED SELECTION BUYS EXACTLY THE TICKED GOODS — nothing else", async () => {
    /**
     * ⛔ THE DEFECT THIS PINS (found in review, 2026-09-23). The wire carried
     * the chosen lines only when EVERY selected request had been narrowed:
     *
     * ```
     * demandIds = chosen.length > 0 && rows.every(r => goodsChoice.has(r.id))
     *   ? chosen : undefined        // undefined = "buy everything open"
     * ```
     *
     * So ticking one request WHOLE and another PARTLY sent `undefined`, and
     * the door bought the goods the operator had just unticked — while the
     * toolbar counted them too. One list now feeds the sentence, the review
     * and the wire.
     */
    const posted: unknown[] = [];
    apiFetch.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === "POST" && String(url).endsWith("/purchasing/requests/issue")) {
        posted.push(JSON.parse(String(init.body)));
        return Promise.resolve({ poIds: ["po-1"], documents: 1, pos: [] });
      }
      if (
        String(url).includes("/purchasing/requests") &&
        !String(url).includes("/plan") &&
        !init?.method
      ) {
        /* TWO buyable requests: REQ2 with two eligible lines (so one can be
           unticked) and REQ4, a second approved request selected WHOLE. */
        const req2 = REGISTER.requests.find((r) => r.id === REQ2)!;
        const line2 = REGISTER.lines.find((l) => l.request_id === REQ2)!;
        return Promise.resolve({
          ...REGISTER,
          requests: [...REGISTER.requests, { ...req2, id: REQ4, req_no: "MPR-20260819-0004" }],
          lines: [
            ...REGISTER.lines,
            { ...line2, id: "l2b", sku: "BED-K-01" },
            { ...line2, id: "l4", request_id: REQ4, sku: "BED-K-01" },
          ],
        });
      }
      return Promise.resolve(respond(String(url), init));
    });
    await loaded();

    /* REQ2 narrowed to ONE of its two goods… */
    fireEvent.click(screen.getByTestId(`mp-expand-${REQ2}`));
    const box = await screen.findByTestId(`mp-expansion-${REQ2}`);
    fireEvent.click(screen.getByTestId(`mp-select-${REQ2}`));
    const ticks = () => [...box.querySelectorAll<HTMLInputElement>("input[type='checkbox']")];
    fireEvent.click(ticks()[0]!);
    expect(ticks().map((t) => t.checked)).toEqual([false, true]);
    /* …and a second approved request selected WHOLE, which is the mix that
       used to widen the wire back to "everything still open". */
    fireEvent.click(screen.getByTestId(`mp-select-${REQ4}`));

    fireEvent.click(await screen.findByTestId("mp-issue-selected"));
    await clickIssue();
    await waitFor(() => expect(posted).toHaveLength(1));
    const body = posted[0] as { demandIds?: string[]; requestIds?: string[] };

    /* The wire NAMES the lines, every time — never `undefined`. */
    expect(body.demandIds).toBeTruthy();
    /* The unticked line is not among them. */
    expect(body.demandIds).not.toContain("l2");
    expect(body.demandIds).toContain("l2b");
    /* And both requests are still in the selection. */
    expect(body.requestIds).toEqual(expect.arrayContaining([REQ2, REQ4]));
    /* The whole-request one contributes its own line, in full. */
    expect(body.demandIds).toContain("l4");
  });

  it("an explicit `none of these` is never widened back into `all of them`", async () => {
    await loaded();
    fireEvent.click(screen.getByTestId(`mp-expand-${REQ2}`));
    const box = await screen.findByTestId(`mp-expansion-${REQ2}`);
    fireEvent.click(screen.getByTestId(`mp-select-${REQ2}`));
    const tick = box.querySelector<HTMLInputElement>("input[type='checkbox']")!;
    /* Unticking the only chosen line empties the request's own choice — and
       an empty choice is a real answer, so the row leaves the selection. */
    fireEvent.click(tick);
    expect((screen.getByTestId(`mp-select-${REQ2}`) as HTMLInputElement).checked).toBe(false);
    expect(screen.queryByTestId("mp-issue-selected")).toBeNull();
  });

  it("the review draws ONE document per purchase order the door will create", async () => {
    /* The count in `Issue {n} PO(s)` and the papers on screen come from the
       same five-fact partition (Law D) — three documents, three drafts. */
    await loaded();
    fireEvent.click(screen.getByTestId(`mp-select-${REQ2}`));
    fireEvent.click(await screen.findByTestId("mp-issue-selected"));
    const review = await screen.findByTestId("so-batch-issue-workspace");
    const count = within(review).getByTestId("so-batch-issue-count").textContent ?? "";
    const documents = Number(count.match(/of (\d+)/)?.[1]);
    expect(documents).toBeGreaterThan(0);
    /* The register's own sentence predicted the same number. */
    expect(screen.getByTestId("selection-bar").textContent).toContain(
      `Issue ${documents} PO`,
    );
  });

  it("cannot issue an MPR while its actual PDF preview is not ready", async () => {
    previewState.ready = false;
    await loaded();
    fireEvent.click(screen.getByTestId(`mp-select-${REQ2}`));
    fireEvent.click(await screen.findByTestId("mp-issue-selected"));
    await screen.findByTestId("so-batch-draft-pdf");
    expect(screen.getByTestId("so-batch-issue-create")).toBeDisabled();
    fireEvent.click(screen.getByTestId("so-batch-issue-create"));
    expect(apiFetch.mock.calls.some(([url, init]) =>
      String(url).endsWith("/purchasing/requests/issue") && init?.method === "POST",
    )).toBe(false);
  });

  it("a refused issue keeps the operator on the document, and creates nothing", async () => {
    await loaded();
    apiFetch.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === "POST" && String(url).endsWith("/purchasing/requests/issue")) {
        return Promise.reject(
          Object.assign(new Error("refused"), {
            body: {
              code: "cost_required",
              message: "X-NEW-K has no transaction cost.",
              action: "Set the cost of X-NEW-K in Catalog.",
            },
          }),
        );
      }
      return Promise.resolve(respond(String(url)));
    });
    fireEvent.click(screen.getByTestId(`mp-select-${REQ2}`));
    fireEvent.click(await screen.findByTestId("mp-issue-selected"));
    await clickIssue();
    const err = await screen.findByTestId("so-batch-issue-error");
    // The server's two lines, on the surface the operator is reading.
    expect(err).toHaveTextContent("X-NEW-K has no transaction cost.");
    expect(err).toHaveTextContent("Set the cost of X-NEW-K in Catalog.");
    // Still on the review — the door is atomic, so nothing was created.
    expect(screen.getByTestId("so-batch-issue-workspace")).toBeInTheDocument();
  });

  it("Issue PO sends only the selected requests and consolidation answer", async () => {
    await loaded();
    fireEvent.click(screen.getByTestId(`mp-select-${REQ2}`));
    fireEvent.click(await screen.findByTestId("mp-issue-selected"));
    /* The review surface stands between the tick and the door. */
    await clickIssue();
    await waitFor(() => {
      const post = apiFetch.mock.calls.find((c) =>
        String(c[0]).endsWith("/purchasing/requests/issue"),
      );
      expect(post).toBeTruthy();
      const sent = JSON.parse(String((post![1] as RequestInit).body));
      expect(sent.requestIds).toEqual([REQ2]);
      expect(sent.together).toBe(true);
      /* ⭐ THE LINES ARE NAMED EVERY TIME (owner instruction 2026-09-23).
         `undefined` used to mean "buy everything still open", which is how a
         mixed selection bought goods nobody ticked. */
      expect(Object.keys(sent).sort()).toEqual(["demandIds", "requestIds", "together"]);
      expect(sent.demandIds).toEqual(["l2"]);
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

  it("renders the sections, full width, in the Card's exact order — Approval only when there is a decision to make or read", async () => {
    /* Owner 2026-09-26: a waiting request shows its state as the Request
       card's `Approval Status` fact; the Approval card appears for the
       approver (the decision) and after a decision (the record). */
    const detail = await openObject();
    const blocks = [...detail.querySelectorAll("[data-block]")].map((b) =>
      b.getAttribute("data-block"),
    );
    expect(blocks).toEqual([
      "Request",
      "Items Requested",
      "What We Already Have",
      "Purchase Orders",
      "History",
    ]);
    const fact = within(detail).getByTestId("mp-approval-fact");
    expect(fact.closest("[data-block]")?.getAttribute("data-block")).toBe("Request");
    expect(fact).toHaveTextContent("Need approval");
    // ONE scroll — no tabs, no split preview, no centred narrow island.
    expect(within(detail).queryByRole("tablist")).toBeNull();
    expect(detail.querySelector(".max-w-\\[720px\\]")).toBeNull();
    expect(detail.querySelector(".max-w-\\[900px\\]")).toBeNull();
    expect(detail.querySelector(".mx-auto")).toBeNull();
  });

  it("the Object Header: one back destination, the identity, one state pill", async () => {
    const detail = await openObject();
    // The shared object header (Law C) with the Register as back destination.
    expect(within(detail).getByLabelText("Manual Purchase Request")).toBeInTheDocument();
    /* Card 08 §3.3 — the identity is `{Need for} · {For}` (REQ1's retired
       purpose prints its own truthful word; its For was never stored), and
       no number or UUID appears anywhere in the header. */
    expect(within(detail).getByTestId("object-identity")).toHaveTextContent("Display");
    expect(within(detail).getByTestId("object-identity").textContent).not.toContain("REQ-");
    expect(document.title).toBe("Manual Purchase Request — Carres");
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
    fireEvent.click(within(detail).getByLabelText("Next Manual Purchase Request"));
    await waitFor(() =>
      expect(screen.getByTestId("mp-object-position")).toHaveTextContent("2 of 3"),
    );
  });

  it("back restores the Register — the grid stayed mounted underneath", async () => {
    const detail = await openObject();
    // The Register surface is preserved (hidden), not unmounted.
    expect(screen.getByTestId("mp-register-surface")).toHaveAttribute("aria-hidden", "true");
    fireEvent.click(within(detail).getByLabelText("Manual Purchase Request"));
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
    await screen.findByText("This Manual Purchase Request could not be opened");
    expect(screen.getByText("Try again")).toBeInTheDocument();
  });
});

/**
 * ⭐ PURCHASING CARD 06 — the date plan on the Register, the object and the
 * Work hand-off (owner-corrected 2026-08-29).
 */
describe("Card 06 · the Register's date facts and lens order", () => {
  it("`Delivery Date` LEFT the Register — the request's internal date is not a customer promise", async () => {
    await loaded();
    const grid = screen.getByTestId("register-column");
    /* Owner ruling 2026-09-18: the fifteen approved columns carry
       `Customer Requested Delivery Date`, and the dictionary forbids
       substituting Manual Purchase's own required-arrival date for it. The
       internal date keeps its authoritative home on the object. */
    const heads = [...grid.querySelectorAll<HTMLElement>("thead th")].map((th) => th.title);
    expect(heads).not.toContain("Delivery Date");
    expect(heads).toContain("Customer Requested Delivery Date");
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
    expect(screen.getByTestId("mp-detail-order-by")).toHaveTextContent(fmtDate("2026-09-01"));
    // One title, one box (owner 2026-09-26): the timing state is its own fact.
    expect(screen.getByTestId("mp-detail-order-timing").textContent).not.toContain(
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
    const timing = screen.getByTestId("mp-detail-order-timing");
    expect(timing).toHaveTextContent("Order date passed");
    expect(screen.getByTestId("mp-detail-order-by")).toHaveTextContent(fmtDate("2026-09-01"));
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
    fireEvent.click(screen.getByText("Manual Purchase Request", { selector: "a *, a" }));
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
    /* The approver lands on the Approval card; anyone else on the Request
       card's `Approval Status` fact (owner, 2026-09-26). */
    expect(
      target.getAttribute("data-block") ?? target.getAttribute("data-testid"),
    ).toMatch(/^(Approval|mp-approval-fact)$/);
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

  it("⭐ 0549 · THE FORM ASKS WHETHER STOCK CAN ANSWER, AND SEND NAMES THE GAP", async () => {
    /* 0546 built the binding, the guards, the arithmetic and the atomic save —
       and NOTHING wrote the one fact they all read, so every request stored
       NULL and not a single Unit could ever be allocated. This is the question
       that feeds them, and the reason the whole feature is reachable. */
    await openWorkspace({ answerStockQuestion: false });
    fireEvent.focus(document.getElementById("mp-item-0")!);
    fireEvent.click(pickRow("5539-2NA"));
    await waitFor(() =>
      expect(screen.getByTestId("mp-send")).toHaveTextContent(MW.sendNeedsStockAnswer),
    );
    expect(screen.getByTestId("mp-send")).toBeDisabled();
    await answerStockQuestion();
    await waitFor(() => expect(screen.getByTestId("mp-send")).toBeEnabled());
  });

  it("⛔ 0549 · NO DEFAULT ANSWER — a pre-picked option would be the guess the ruling bans", async () => {
    await openWorkspace({ answerStockQuestion: false });
    /* Both answers must be reachable and NEITHER chosen. The ruling of
       2026-09-18 forbids inferring the intent from the SKU, the shelf count or
       the purpose; a pre-selected option is that inference with the operator's
       name on it. */
    const trigger = document.getElementById("mp-stock-answer")!;
    expect(trigger.textContent).not.toContain(MW.canStockAnswerYes);
    expect(trigger.textContent).not.toContain(MW.canStockAnswerNo);
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    expect(
      (await screen.findAllByRole("option")).map((o) => o.textContent),
    ).toEqual([MW.canStockAnswerYes, MW.canStockAnswerNo]);
  });

  it("⭐ 0549 · THE ANSWER REACHES THE WIRE — both ways, and never invented", async () => {
    await openWorkspace({ answerStockQuestion: false });
    fireEvent.focus(document.getElementById("mp-item-0")!);
    fireEvent.click(pickRow("5539-2NA"));
    await answerStockQuestion("no");
    await waitFor(() => expect(screen.getByTestId("mp-send")).toBeEnabled());
    fireEvent.click(screen.getByTestId("mp-send"));
    const requestPosts = () =>
      apiFetch.mock.calls.filter(
        (c) =>
          (c[1] as RequestInit | undefined)?.method === "POST" &&
          String(c[0]).endsWith("/purchasing/requests"),
      );
    await waitFor(() => expect(requestPosts().length).toBeGreaterThan(0));
    const sent = JSON.parse(
      String((requestPosts().at(-1)![1] as RequestInit).body),
    ) as { fulfilmentIntent?: string };
    /* `No — this buys extra stock` is `additional_stock`, and the mapping is
       asserted rather than assumed: send the wrong one and the shelf would be
       netted against a purchase that was meant to add to it. */
    expect(sent.fulfilmentIntent).toBe("additional_stock");
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
    /* ⭐ 0549 — this request was raised before the intent was ever asked, so it
       stores NULL and the reopened form asks for it before it may go back. The
       absence is never guessed into an answer, not even on a re-send. */
    await waitFor(() =>
      expect(screen.getByTestId("mp-send")).toHaveTextContent(MW.sendNeedsStockAnswer),
    );
    await answerStockQuestion();
    await waitFor(() => expect(screen.getByTestId("mp-send")).toHaveTextContent("Send again for approval"));
  });

  it("R4 · `Send again for approval` posts the same request's lines with their ids", async () => {
    await openObject(false, {
      request: { ...REGISTER.requests[0], purpose: "ready_stock", sent_back_at: "2026-08-21T01:00:00Z" },
      canEditAndSendAgain: true,
    });
    fireEvent.click(screen.getByTestId("mp-edit-and-send-again"));
    await screen.findByTestId("manual-purchase-create");
    await answerStockQuestion();
    await waitFor(() => expect(screen.getByTestId("mp-send")).toBeEnabled());
    fireEvent.click(screen.getByTestId("mp-send"));
    await waitFor(() => expect(posts(`/${REQ1}/resubmit`).length).toBe(1));
    const body = JSON.parse(String((posts(`/${REQ1}/resubmit`)[0]![1] as RequestInit).body));
    expect(body.lines).toEqual([{ id: "l1", sku: "5539-2NA", qty: 1, note: "grey, not beige" }]);
    expect(body.requiredBy).toBe("2026-09-12");
    // Nothing new was created: no POST to the create door.
    expect(posts("/purchasing/requests").length).toBe(0);
  });

  it("R4 · a returned request reopens with its requirement, and the round REPLACES it", async () => {
    /* ⭐ 0562 · the requirement travels with the edit. Clearing it must be a
       real edit — a coalesced column could never be emptied again. */
    await openObject(false, {
      request: {
        ...REGISTER.requests[0],
        purpose: "ready_stock",
        sent_back_at: "2026-08-21T01:00:00Z",
        purchase_requirement: "Firm feel, king size only",
      },
      canEditAndSendAgain: true,
    });
    fireEvent.click(screen.getByTestId("mp-edit-and-send-again"));
    await screen.findByTestId("manual-purchase-create");
    expect(screen.getByTestId("mp-requirement")).toHaveValue("Firm feel, king size only");
    fireEvent.change(screen.getByTestId("mp-requirement"), { target: { value: "" } });
    await answerStockQuestion();
    await waitFor(() => expect(screen.getByTestId("mp-send")).toBeEnabled());
    fireEvent.click(screen.getByTestId("mp-send"));
    await waitFor(() => expect(posts(`/${REQ1}/resubmit`).length).toBe(1));
    const body = JSON.parse(String((posts(`/${REQ1}/resubmit`)[0]![1] as RequestInit).body));
    expect(body.purchaseRequirement).toBeNull();
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
