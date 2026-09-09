import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { SoBatchOrderRow, SoBatchPurchaseResponse } from "@carres/shared";
import { soBatchAction } from "@carres/shared";

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
vi.mock("./components/GlobalTopBar", () => ({ TopBarIcons: () => null }));
/* The 50/50 renders the REAL PO template; @react-pdf is exercised in its own
   suite, and jsdom ships no object-URL implementation. */
vi.mock("@/lib/pdf/render", () => ({
  renderPoPdf: vi.fn(async () => new Blob(["%PDF-1.4"], { type: "application/pdf" })),
}));

import OperationToOrder from "./OperationToOrder";

/**
 * SO BATCH PURCHASE — the whole page, end to end
 * (CARD-2026-08-22-purchasing-02).
 *
 * Two jobs. First, that the buying journey actually works from a server
 * payload: rail → tick → arrange → issue → evidence. Second — and this is the
 * half a green suite usually misses — that the SUPERSEDED page is gone. A
 * retired surface that still renders is not retired; it is a second answer
 * waiting for somebody to find it.
 */

const KLANG = "11111111-1111-4111-8111-111111111111";
const HERE = dirname(fileURLToPath(import.meta.url));

/** The o1 order row — Card 02-B: the parent grain the Register draws. */
function orderRow(over: Partial<SoBatchOrderRow> = {}): SoBatchOrderRow {
  return {
    orderId: "o1",
    so: 1318,
    customer: "Kimmy",
    status: "blank",
    proceededAt: "2026-08-20T08:15:00+08:00",
    requestedDeliveryDate: "2026-08-28",
    deliveryCity: "Petaling Jaya",
    deliveryState: "Selangor",
    pos: [],
    lines: [
      { orderLineId: "l1", sku: "B1201S-K", qty: 2, stockTaken: 0,
        item: "Booqit", variant: "King", category: "mattress", pos: [] },
    ],
    outstandingSuppliers: ["Hooka"],
    ...over,
  };
}

function payload(over: Partial<SoBatchPurchaseResponse> = {}): SoBatchPurchaseResponse {
  const base = {
    id: "build::o1::b1",
    state: "can_order_early" as const,
    lineIds: ["l1"],
    orderId: "o1",
    so: 1318,
    customer: "Kimmy",
    customerDelivery: "2026-08-28",
    item: "Booqit",
    variant: "King",
    category: "mattress" as const,
    skus: ["B1201S-K"],
    supplierId: "s-hooka",
    supplier: "Hooka",
    qtyNeeded: 2,
    readyStock: 0,
    takenFromStock: 0,
    onPo: 0,
    poNumbers: [],
    toBuy: 2,
    goodsMustArrive: "2026-08-19",
    issueRef: { proposalKey: "s-hooka::mattress", buildKey: "b1" },
    parts: [{ sku: "B1201S-K", qty: 2, unitCost: 100 }],
    supplierKind: "own_logistics" as const,
    ownerName: null,
    ownerDuty: null,
  };
  return {
    today: "2026-08-22",
    rows: [
      {
        ...base,
        action: soBatchAction({
          state: base.state,
          item: base.item,
          supplier: base.supplier,
          category: base.category,
          ownerId: null,
          ownerName: null,
          orderId: base.orderId,
          so: base.so,
          dueDate: base.goodsMustArrive,
        }),
      },
    ],
    registerRows: [orderRow()],
    destinations: [{ id: KLANG, name: "Carres Klang", isDefault: true, active: true }],
    defaultDestinationId: KLANG,
    currentPoDuty: { userId: "u1", name: "Yee Jean" },
    /* 0379 — nobody is covering by default. */
    actingPoDuty: null,
    poDutyNameUnavailable: false,
    poDutyUnavailable: false,
    mayIssue: true,
    procurementPartners: [{ id: "p-nets", name: "NETS" }],
    safetyDays: 14,
    ...over,
  };
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/operation?tab=purchase"]}>
        <OperationToOrder />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  navigate.mockClear();
  apiFetch.mockReset();
  localStorage.clear();
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => "blob:so-batch-test"),
  });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
});

describe("the page reads the ONE projection and draws the Register", () => {
  it("asks the one demand endpoint, and nothing else, to draw itself", async () => {
    apiFetch.mockResolvedValue(payload());
    renderPage();
    await screen.findByTestId("so-batch-page");
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(apiFetch.mock.calls[0]![0]).toBe("/api/operation/purchase/demands");
  });

  it("opens straight onto the header, the order-timing rail and the Register", async () => {
    apiFetch.mockResolvedValue(payload());
    renderPage();
    await screen.findByTestId("so-batch-page");
    expect(screen.getByTestId("purchasing-tabs")).toHaveTextContent("SO Batch Purchase");
    const rail = screen.getByTestId("so-batch-rail");
    expect(rail).toBeInTheDocument();
    expect(rail.querySelector("[data-testid='so-batch-all-not-ordered']")).not.toBeNull();
    // The five timing rows; `SETUP TO FIX` hides while its count is zero.
    expect(rail.querySelectorAll("[data-testid^='so-batch-state-']")).toHaveLength(5);
    expect(rail.textContent).not.toContain("SETUP TO FIX");
    expect(await screen.findByTestId("so-batch-row-o1")).toBeInTheDocument();
  });

  it("a payload that is not an SO Batch read is an ERROR, never an empty list", async () => {
    // `Nothing needs buying.` is a business answer; a broken read may not borrow it.
    apiFetch.mockResolvedValue({ ok: true });
    renderPage();
    await screen.findByText("The buying list could not be loaded");
    expect(screen.queryByText("No proceeded Sales Orders.")).not.toBeInTheDocument();
  });

  it("a read that fails says so and offers the retry — it does not show an empty list", async () => {
    apiFetch.mockRejectedValue(new Error("boom"));
    renderPage();
    await screen.findByText("The buying list could not be loaded");
    expect(screen.queryByTestId("so-batch-page")).not.toBeInTheDocument();
  });
});

describe("the whole journey — tick, arrange, issue, prove it arrived", () => {
  it("walks from a ticked line to confirmed supplier evidence", async () => {
    apiFetch.mockResolvedValue(payload());
    renderPage();
    await screen.findByTestId("so-batch-row-o1");

    fireEvent.click(screen.getByTestId("so-batch-select-o1"));
    expect(screen.getByTestId("selection-bar")).toHaveTextContent(
      "1 selected · 2 units · Issue 1 PO",
    );

    apiFetch.mockClear();
    fireEvent.click(screen.getByTestId("so-batch-issue"));
    await screen.findByTestId("so-batch-issue-workspace");
    expect(screen.getByTestId("so-batch-issue-count")).toHaveTextContent("1 of 1");
    expect(screen.getByTestId("so-batch-issue-preview")).toHaveTextContent(
      "Issue PO creates the number",
    );

    apiFetch.mockImplementation((path: string) =>
      path.includes("issue-batch")
        ? Promise.resolve({
            ok: true,
            pos: [
              {
                id: "PO-2041",
                supplierId: "s-hooka",
                supplierName: "Hooka",
                destinationId: KLANG,
                destination: "Carres Klang",
              },
            ],
          })
        : Promise.resolve({ po_number: "PO-2041", po_id: "PO-2041", version: 1, lines: [] }),
    );
    fireEvent.click(screen.getByTestId("so-batch-issue-create"));
    await screen.findByTestId("so-batch-evidence-PO-2041");
    expect(screen.getByTestId("so-batch-evidence-PO-2041")).toHaveTextContent(
      "PO-2041 · Version 1 has not reached Hooka",
    );

    /* The confirm answers `ok`, and the REFETCH that follows answers a real
       payload — the buy is now covered, so the line is gone. */
    apiFetch.mockImplementation((path: string) =>
      path.includes("confirm-sent")
        ? Promise.resolve({ ok: true })
        : path.includes("print-data")
          ? Promise.resolve({ po_number: "PO-2041", po_id: "PO-2041", version: 1, lines: [] })
          : /* Card 02-B — the buy leaves the LEAF listing, but the Sales
               Order's row is PERMANENT: it comes back Ordered, with its PO. */
            Promise.resolve(
              payload({
                rows: [],
                registerRows: [
                  orderRow({
                    status: "ordered",
                    pos: [
                      { poId: "PO-2041", status: "open", supplierId: "s-hooka",
                        supplierName: "Hooka", destinationId: KLANG,
                        officialDeliveryDate: "2026-09-18", sentCurrentVersion: true },
                    ],
                    lines: [
                      { orderLineId: "l1", sku: "B1201S-K", qty: 2, stockTaken: 0,
                        item: "Booqit", variant: "King", category: "mattress",
                        pos: [{ poId: "PO-2041", qty: 2 }] },
                    ],
                    outstandingSuppliers: [],
                  }),
                ],
              }),
            ),
    );
    fireEvent.change(screen.getByTestId("so-batch-evidence-recipient"), {
      target: { value: "Hooka Purchasing Group" },
    });
    fireEvent.click(screen.getByTestId("so-batch-evidence-confirm"));
    // Confirmed → back to buying, and the Register re-reads the server. The
    // ordered Sales Order REMAINS — one permanent row, now reading `Ordered`.
    await waitFor(() => expect(screen.getByTestId("so-batch-page")).toBeInTheDocument());
    await waitFor(() =>
      expect(screen.getByTestId("so-batch-status-o1")).toHaveTextContent("Ordered"),
    );
    expect(screen.getByTestId("so-batch-po-link-o1")).toHaveTextContent("PO-2041");
  });

  it("the confirmation declares the version the RENDERED document reported", async () => {
    apiFetch.mockImplementation((path: string) =>
      path.includes("issue-batch")
        ? Promise.resolve({
            ok: true,
            pos: [
              {
                id: "PO-2041", supplierId: "s-hooka", supplierName: "Hooka",
                destinationId: KLANG, destination: "Carres Klang",
              },
            ],
          })
        : path.includes("print-data")
          ? /* A REVISED purchase order — Version 3 is what the operator sees. */
            Promise.resolve({ po_number: "PO-2041", po_id: "PO-2041", version: 3, lines: [] })
          : Promise.resolve(payload()),
    );
    renderPage();
    await screen.findByTestId("so-batch-row-o1");
    fireEvent.click(screen.getByTestId("so-batch-select-o1"));
    fireEvent.click(screen.getByTestId("so-batch-issue"));
    await screen.findByTestId("so-batch-issue-workspace");
    fireEvent.click(screen.getByTestId("so-batch-issue-create"));
    await screen.findByTestId("so-batch-evidence-PO-2041");
    expect(screen.getByTestId("so-batch-evidence-PO-2041")).toHaveTextContent("Version 3");

    apiFetch.mockClear();
    fireEvent.change(screen.getByTestId("so-batch-evidence-recipient"), {
      target: { value: "Hooka Purchasing Group" },
    });
    fireEvent.click(screen.getByTestId("so-batch-evidence-confirm"));
    await waitFor(() =>
      expect(
        apiFetch.mock.calls.some((c) => String(c[0]).includes("confirm-sent")),
      ).toBe(true),
    );
    const call = apiFetch.mock.calls.find((c) => String(c[0]).includes("confirm-sent"))!;
    expect(JSON.parse((call[1] as { body: string }).body).poVersion).toBe(3);
  });

  it("Back to buying keeps the selection and creates nothing", async () => {
    apiFetch.mockResolvedValue(payload());
    renderPage();
    await screen.findByTestId("so-batch-row-o1");
    fireEvent.click(screen.getByTestId("so-batch-select-o1"));
    fireEvent.click(screen.getByTestId("so-batch-issue"));
    await screen.findByTestId("so-batch-issue-workspace");
    apiFetch.mockClear();
    fireEvent.click(screen.getByTestId("so-batch-issue-back"));
    await screen.findByTestId("so-batch-page");
    expect(apiFetch).not.toHaveBeenCalledWith(
      expect.stringContaining("issue-batch"),
      expect.anything(),
    );
  });
});

/**
 * ⭐ THE RETIREMENT, PROVED AS ABSENCE.
 *
 * These are source-level assertions on purpose. A rendering test can only show
 * that a thing is not on the screen it happened to render; reading the file
 * shows the code is not there to render.
 */
describe("the superseded buying surfaces are gone, not hidden", () => {
  const page = () => readFileSync(join(HERE, "OperationToOrder.tsx"), "utf8");

  it("the orchestrator is thin — it owns data and mode, not a workspace", () => {
    const src = page();
    expect(src.split("\n").length).toBeLessThan(200);
    expect(src).toContain("SoBatchRegister");
    expect(src).toContain("SoBatchIssueWorkspace");
  });

  it("no PO Schedule, no category walk, no Excel workspace", () => {
    const src = page();
    for (const gone of [
      "poScheduleDays",
      "poScheduleBucket",
      "PO SCHEDULE",
      "categoryLabel",
      "CATEGORY",
      "Overdue",
    ]) {
      expect(src, gone).not.toContain(gone);
    }
  });

  it("no legacy DataTable, no Create Purchase, no manual demand picker", () => {
    const src = page();
    for (const gone of [
      "kit/DataTable",
      "Create Purchase",
      "DemandPickItem",
      "CancelPurchaseDialog",
      "demand/pick-items",
    ]) {
      expect(src, gone).not.toContain(gone);
    }
  });

  it("the page issues through the ONE batch door, never the per-supplier one", () => {
    const src = readFileSync(
      join(HERE, "so-batch", "SoBatchIssueWorkspace.tsx"),
      "utf8",
    );
    expect(src).toContain("/api/operation/purchase/to-order/issue-batch");
    expect(src).not.toMatch(/to-order\/issue["'`]/);
  });

  it("the separate Purchase Demands page and its test are DELETED", () => {
    expect(existsSync(join(HERE, "OperationPurchaseDemands.tsx"))).toBe(false);
    expect(existsSync(join(HERE, "OperationPurchaseDemands.test.tsx"))).toBe(false);
  });

  it("the legacy preview helper is DELETED", () => {
    expect(existsSync(join(HERE, "to-order-preview.ts"))).toBe(false);
    expect(existsSync(join(HERE, "to-order-preview.test.ts"))).toBe(false);
  });

  it("the old address redirects rather than 404s — a saved bookmark still lands", () => {
    const app = readFileSync(join(HERE, "OperationApp.tsx"), "utf8");
    expect(app).not.toContain("OperationPurchaseDemands");
    expect(app).toContain('tab === "purchase-demands"');
    expect(app).toContain('<Navigate to="/operation?tab=purchase" replace />');
  });

  it("both live aliases still reach the page", () => {
    const app = readFileSync(join(HERE, "OperationApp.tsx"), "utf8");
    expect(app).toContain('path="to-order"');
    expect(app).toContain('tab === "purchase" && <OperationToOrder />');
  });

  it("Manual Purchase is still its own route and never appears inside this page", async () => {
    const app = readFileSync(join(HERE, "OperationApp.tsx"), "utf8");
    expect(app).toContain('tab === "manual-purchase" && <OperationManualPurchase />');
    apiFetch.mockResolvedValue(payload());
    renderPage();
    await screen.findByTestId("so-batch-page");
    expect(screen.getByTestId("so-batch-page").textContent).not.toContain("Manual Purchase");
  });

  it("Goods Receipts, Purchase Returns and Claims are untouched by this Card", () => {
    const app = readFileSync(join(HERE, "OperationApp.tsx"), "utf8");
    expect(app).toContain('tab === "receiving"');
    expect(app).toContain('tab === "claims"');
  });
});
