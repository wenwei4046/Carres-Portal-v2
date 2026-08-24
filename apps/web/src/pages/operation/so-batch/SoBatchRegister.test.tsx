import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PurchaseDemandRow, SoBatchPurchaseResponse } from "@carres/shared";
import { soBatchAction } from "@carres/shared";

const navigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigate };
});
vi.mock("../components/GlobalTopBar", () => ({ TopBarIcons: () => null }));

import SoBatchRegister from "./SoBatchRegister";

/**
 * SO BATCH PURCHASE — THE REGISTER
 * (CARD-2026-08-22-purchasing-02 §3; `docs/purchasing/MASTER.md` §9.1).
 *
 * The page answers one question at a glance: *what must Carres buy, what is
 * stopping the rest, and where do the goods go?* These tests hold the shape
 * that answers it — the two rail headings, the eleven business columns in the
 * approved order, a tick-box that only a buyable line gets, and an inspector
 * that explains the arithmetic without offering to change it.
 */

const KLANG = "11111111-1111-4111-8111-111111111111";
const BULOH = "22222222-2222-4222-8222-222222222222";

function row(over: Partial<PurchaseDemandRow> = {}): PurchaseDemandRow {
  const base: PurchaseDemandRow = {
    id: "build::o1::b1",
    state: "ready_to_buy",
    lineIds: ["l1"],
    orderId: "o1",
    so: 1318,
    customer: "Kimmy",
    customerDelivery: "2026-08-28",
    item: "Booqit",
    variant: "Beige",
    category: "mattress",
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
    action: null,
    costs: [{ sku: "B1201S-K", unitCost: 100 }],
    supplierKind: "own_logistics",
    ownerName: null,
    ownerDuty: null,
    ...over,
  };
  return {
    ...base,
    action:
      over.action !== undefined
        ? over.action
        : soBatchAction({
            state: base.state,
            item: base.item,
            supplier: base.supplier,
            category: base.category,
            ownerId: null,
            ownerName: base.ownerName,
            orderId: base.orderId,
            so: base.so,
            dueDate: base.goodsMustArrive,
          }),
  };
}

const BLOCKED = row({
  id: "line::l9",
  state: "no_customer_date",
  so: 1321,
  customer: "Wong",
  customerDelivery: null,
  goodsMustArrive: null,
  issueRef: null,
  toBuy: null,
  readyStock: null,
  onPo: null,
  ownerName: "Siew Hong",
});

const COVERED = row({
  id: "build::o3::b3",
  state: "covered",
  so: 1330,
  toBuy: 0,
  onPo: 2,
  poNumbers: ["PO-20260820-4827"],
  action: null,
});

function data(over: Partial<SoBatchPurchaseResponse> = {}): SoBatchPurchaseResponse {
  return {
    today: "2026-08-22",
    rows: [row(), BLOCKED, COVERED],
    destinations: [
      { id: KLANG, name: "Carres Klang", isDefault: true, active: true },
      { id: BULOH, name: "AL Sungai Buloh", isDefault: false, active: true },
    ],
    defaultDestinationId: KLANG,
    currentPoDuty: { userId: "u1", name: "Yee Jean" },
    /* 0379 — a dated buddy cover, when one is open. Nobody is covering by
       default; the tests that care set it. */
    actingPoDuty: null,
    mayIssue: true,
    procurementPartners: [],
    ...over,
  };
}

const onIssue = vi.fn();

function renderRegister(over: Partial<SoBatchPurchaseResponse> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/operation?tab=purchase"]}>
        <SoBatchRegister data={data(over)} isLoading={false} onIssue={onIssue} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  navigate.mockClear();
  onIssue.mockClear();
  localStorage.clear();
});

describe("the 200px rail — two headings over the six governed states", () => {
  it("prints BUYING RECORDS and WORK TO DO, in that order", () => {
    renderRegister();
    const rail = screen.getByTestId("so-batch-rail");
    const headings = Array.from(rail.querySelectorAll("span")).
      map((e) => e.textContent?.trim()).
      filter((t) => t === "BUYING RECORDS" || t === "WORK TO DO");
    expect(headings).toEqual(["BUYING RECORDS", "WORK TO DO"]);
  });

  it("shows exactly the six states, with the approved short words", () => {
    renderRegister();
    const rail = screen.getByTestId("so-batch-rail");
    for (const [key, word] of [
      ["ready_to_buy", "Ready to buy"],
      ["covered", "Covered"],
      ["no_customer_date", "No customer date"],
      ["no_sku", "No SKU"],
      ["no_supplier", "No supplier"],
      ["no_production_days", "No production days"],
    ] as const) {
      expect(within(rail).getByTestId(`so-batch-state-${key}`)).toHaveTextContent(word);
    }
    expect(rail.querySelectorAll("[data-testid^='so-batch-state-']")).toHaveLength(6);
  });

  it("counts BUYING LINES, and a zero prints nothing at all", () => {
    renderRegister();
    const rail = screen.getByTestId("so-batch-rail");
    expect(within(rail).getByTestId("so-batch-state-ready_to_buy")).toHaveTextContent("1");
    // Nothing in the fixture has a missing SKU, so that row carries no number.
    expect(
      within(rail).getByTestId("so-batch-state-no_sku").textContent?.replace("No SKU", "").trim(),
    ).toBe("");
  });

  it("never says a banned Purchasing word", () => {
    renderRegister();
    const rail = screen.getByTestId("so-batch-rail").textContent ?? "";
    for (const banned of [
      "Today", "Tomorrow", "Needs attention", "Follow up", "Pending",
      "Waiting", "Priority", "Next Action", "PO SCHEDULE", "CATEGORY",
    ]) {
      expect(rail, banned).not.toContain(banned);
    }
  });

  it("a rail choice narrows the listing", () => {
    renderRegister();
    expect(screen.getByTestId("so-batch-row-line::l9")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("so-batch-state-ready_to_buy"));
    expect(screen.queryByTestId("so-batch-row-line::l9")).not.toBeInTheDocument();
    expect(screen.getByTestId("so-batch-row-build::o1::b1")).toBeInTheDocument();
  });
});

describe("the default columns, in the approved order", () => {
  it("prints the eleven business columns after Select", () => {
    renderRegister();
    const heads = Array.from(
      screen.getByTestId("so-batch-grid").querySelectorAll("th"),
    )
      .map((th) => th.textContent?.trim())
      .filter((t): t is string => !!t && t.length > 0);
    expect(heads).toEqual([
      "Source SO",
      "Required For",
      "SKU / configuration",
      "Required",
      "Stock",
      "Open PO",
      "Buy",
      "Supplier",
      "Deliver To",
      "Goods Must Arrive",
      "Work",
    ]);
  });

  it("prints the customer as the quiet second line under the Sales Order", () => {
    renderRegister();
    const cell = screen.getByTestId("so-batch-source-build::o1::b1");
    expect(cell).toHaveTextContent("SO-1318");
    expect(cell).toHaveTextContent("Kimmy");
  });

  it("prints an actual weekday and date, never a relative word", () => {
    renderRegister();
    const required = screen.getByTestId("so-batch-required-for-build::o1::b1");
    expect(required.textContent).toMatch(/\w{3},\s+\d{1,2}\s+\w{3}/);
    const arrive = screen.getByTestId("so-batch-arrive-build::o1::b1");
    expect(arrive.textContent).toMatch(/\w{3},\s+\d{1,2}\s+\w{3}/);
  });

  it("Buy is PRINTED and has no input anywhere near it", () => {
    renderRegister();
    const buy = screen.getByTestId("so-batch-buy-build::o1::b1");
    expect(buy).toHaveTextContent("2");
    expect(buy.querySelector("input")).toBeNull();
    expect(buy.querySelector("[contenteditable]")).toBeNull();
  });

  it("a blocked line says its fact and its fix on two lines, owner as metadata", () => {
    renderRegister();
    const work = screen.getByTestId("so-batch-work-line::l9");
    expect(work).toHaveTextContent("Customer delivery date is missing");
    expect(work).toHaveTextContent("Ask customer for a delivery date");
    // The name is an avatar chip, not part of the sentence.
    const act = within(work).getByTestId("so-batch-act-line::l9");
    expect(act.textContent).not.toContain("Siew Hong");
    expect(within(work).getByTestId("so-batch-owner-line::l9")).toHaveTextContent("SH");
  });

  it("a ready line's act names the supplier and the document it owes", () => {
    renderRegister();
    expect(screen.getByTestId("so-batch-act-build::o1::b1")).toHaveTextContent(
      "Issue PO to Hooka",
    );
  });
});

describe("only a buyable line may be ticked", () => {
  it("offers a tick-box on the ready line", () => {
    renderRegister();
    expect(screen.getByTestId("so-batch-select-build::o1::b1")).toBeEnabled();
  });

  it("refuses the tick on a blocked line and on a covered line", () => {
    renderRegister();
    for (const id of ["line::l9", "build::o3::b3"]) {
      const box = screen.queryByTestId(`so-batch-select-${id}`);
      if (box) expect(box, id).toBeDisabled();
    }
  });

  it("ticking a line opens the selection bar with lines, units and documents", () => {
    renderRegister();
    fireEvent.click(screen.getByTestId("so-batch-select-build::o1::b1"));
    expect(screen.getByTestId("so-batch-selection-bar")).toHaveTextContent(
      "1 selected · 2 units · Issue 1 PO",
    );
  });

  it("no selection means no selection bar at all", () => {
    renderRegister();
    expect(screen.queryByTestId("so-batch-selection-bar")).not.toBeInTheDocument();
  });

  it("Issue PO hands the whole arrangement out, and creates nothing itself", () => {
    renderRegister();
    fireEvent.click(screen.getByTestId("so-batch-select-build::o1::b1"));
    fireEvent.click(screen.getByTestId("so-batch-issue"));
    expect(onIssue).toHaveBeenCalledTimes(1);
    const [selections] = onIssue.mock.calls[0]!;
    expect(selections).toEqual([
      { demandId: "build::o1::b1", allocations: [{ destinationId: KLANG, qty: 2 }] },
    ]);
  });

  it("a reader who does not hold PO Duty is not offered the act", () => {
    renderRegister({ mayIssue: false });
    fireEvent.click(screen.getByTestId("so-batch-select-build::o1::b1"));
    expect(screen.queryByTestId("so-batch-issue")).not.toBeInTheDocument();
    expect(screen.getByTestId("so-batch-selection-bar")).toHaveTextContent("Yee Jean");
  });
});

describe("Deliver To defaults to Carres Klang and may be changed before issue", () => {
  it("every ready row shows the standing default", () => {
    renderRegister();
    expect(screen.getByTestId("so-batch-deliver-to-build::o1::b1")).toHaveTextContent(
      "Carres Klang",
    );
  });

  it("changing the whole row needs no revision and no dialog", () => {
    renderRegister();
    fireEvent.click(screen.getByTestId("so-batch-select-build::o1::b1"));
    fireEvent.change(screen.getByTestId("so-batch-deliver-to-select-build::o1::b1"), {
      target: { value: BULOH },
    });
    fireEvent.click(screen.getByTestId("so-batch-issue"));
    const [selections] = onIssue.mock.calls[0]!;
    expect(selections[0].allocations).toEqual([{ destinationId: BULOH, qty: 2 }]);
  });

  it("a blocked row is offered no destination editor", () => {
    renderRegister();
    expect(
      screen.queryByTestId("so-batch-deliver-to-select-line::l9"),
    ).not.toBeInTheDocument();
  });
});

describe("the row inspector explains the arithmetic and edits nothing", () => {
  it("prints Required − Stock − Open PO = Buy, with the source facts", () => {
    renderRegister();
    fireEvent.click(screen.getByTestId("so-batch-expand-build::o3::b3"));
    const panel = screen.getByTestId("so-batch-inspector-build::o3::b3");
    expect(panel).toHaveTextContent("REQUIRED");
    expect(panel).toHaveTextContent("FROM STOCK");
    expect(panel).toHaveTextContent("ON OPEN PO");
    expect(panel).toHaveTextContent("BUY");
    expect(panel).toHaveTextContent("PO-20260820-4827");
    expect(panel).toHaveTextContent("Carres Klang");
  });

  it("holds no input, no save and no second Buy", () => {
    renderRegister();
    fireEvent.click(screen.getByTestId("so-batch-expand-build::o1::b1"));
    const panel = screen.getByTestId("so-batch-inspector-build::o1::b1");
    expect(panel.querySelector("input")).toBeNull();
    expect(panel.querySelector("select")).toBeNull();
    expect(within(panel).queryByRole("button", { name: /save/i })).not.toBeInTheDocument();
  });

  it("links to the Sales Order it came from", () => {
    renderRegister();
    fireEvent.click(screen.getByTestId("so-batch-expand-build::o1::b1"));
    fireEvent.click(screen.getByTestId("so-batch-inspector-so-build::o1::b1"));
    expect(navigate).toHaveBeenCalledWith("/operation/orders/so/o1");
  });
});

describe("what this page refuses to be", () => {
  it("has no + New, no Create Purchase and no manual demand picker", () => {
    renderRegister();
    const page = screen.getByTestId("so-batch-page").textContent ?? "";
    for (const gone of ["+ New", "Create Purchase", "Manual Purchase", "New Purchase"]) {
      expect(page, gone).not.toContain(gone);
    }
  });

  it("has no PO Schedule, no category rail and no recent-order receipt list", () => {
    renderRegister();
    const page = screen.getByTestId("so-batch-page").textContent ?? "";
    for (const gone of ["PO SCHEDULE", "PO Schedule", "Overdue", "Recently ordered"]) {
      expect(page, gone).not.toContain(gone);
    }
  });

  it("says the governed empty sentence when nothing needs buying", () => {
    renderRegister({ rows: [] });
    expect(screen.getByText("Nothing needs buying.")).toBeInTheDocument();
  });

  it("the footer counts buying lines, units needed and units to buy", () => {
    renderRegister();
    expect(screen.getByTestId("so-batch-footer")).toHaveTextContent(
      "3 buying lines · 6 units needed · 2 units to buy",
    );
  });
});


/**
 * CARD-2026-08-22-purchasing-02 §4 — the split.
 *
 * One Buy across two or three destinations, inline, with the total printed and
 * the act refused until it balances. Every number the editor checks against is
 * the server's; the editor cannot compute `Buy` and never tries.
 */
describe("splitting one Buy across destinations", () => {
  function openSplit(id = "build::o1::b1") {
    renderRegister();
    fireEvent.click(screen.getByTestId(`so-batch-select-${id}`));
    fireEvent.click(screen.getByTestId(`so-batch-split-${id}`));
    return screen.getByTestId(`so-batch-split-editor-${id}`);
  }

  it("opens inline — it is not a modal and not a second page", () => {
    const editor = openSplit();
    expect(editor.getAttribute("role")).not.toBe("dialog");
    expect(document.querySelector("[role='dialog']")).toBeNull();
    // The row it belongs to is still on screen behind it.
    expect(screen.getByTestId("so-batch-row-build::o1::b1")).toBeInTheDocument();
  });

  it("prints the running total against the server's Buy", () => {
    openSplit();
    expect(screen.getByTestId("so-batch-split-total-build::o1::b1")).toHaveTextContent("2 / 2");
  });

  it("refuses to apply a total that does not balance, and says the gap", () => {
    openSplit();
    fireEvent.change(screen.getByTestId(`so-batch-split-qty-build::o1::b1-${KLANG}`), {
      target: { value: "1" },
    });
    expect(screen.getByTestId("so-batch-split-error-build::o1::b1")).toHaveTextContent("1 of 2");
    expect(screen.getByTestId("so-batch-split-apply-build::o1::b1")).toBeDisabled();
  });

  it("accepts a two-way split that balances, and carries it into the issue", () => {
    openSplit();
    fireEvent.change(screen.getByTestId(`so-batch-split-qty-build::o1::b1-${KLANG}`), {
      target: { value: "1" },
    });
    fireEvent.change(screen.getByTestId(`so-batch-split-qty-build::o1::b1-${BULOH}`), {
      target: { value: "1" },
    });
    expect(screen.getByTestId("so-batch-split-apply-build::o1::b1")).toBeEnabled();
    fireEvent.click(screen.getByTestId("so-batch-split-apply-build::o1::b1"));
    fireEvent.click(screen.getByTestId("so-batch-issue"));
    const [selections] = onIssue.mock.calls[0]!;
    expect(selections[0].allocations).toEqual([
      { destinationId: KLANG, qty: 1 },
      { destinationId: BULOH, qty: 1 },
    ]);
  });

  it("a split row becomes TWO documents in the selection bar", () => {
    openSplit();
    fireEvent.change(screen.getByTestId(`so-batch-split-qty-build::o1::b1-${KLANG}`), {
      target: { value: "1" },
    });
    fireEvent.change(screen.getByTestId(`so-batch-split-qty-build::o1::b1-${BULOH}`), {
      target: { value: "1" },
    });
    fireEvent.click(screen.getByTestId("so-batch-split-apply-build::o1::b1"));
    expect(screen.getByTestId("so-batch-selection-bar")).toHaveTextContent(
      "1 selected · 2 units · Issue 2 POs",
    );
  });

  it("refuses a fraction and a negative", () => {
    openSplit();
    for (const bad of ["1.5", "-1"]) {
      fireEvent.change(screen.getByTestId(`so-batch-split-qty-build::o1::b1-${KLANG}`), {
        target: { value: bad },
      });
      expect(screen.getByTestId("so-batch-split-apply-build::o1::b1"), bad).toBeDisabled();
    }
  });

  it("a closed destination is listed but cannot be chosen", () => {
    const CLOSED = "33333333-3333-4333-8333-333333333333";
    renderRegister({
      destinations: [
        { id: KLANG, name: "Carres Klang", isDefault: true, active: true },
        { id: BULOH, name: "AL Sungai Buloh", isDefault: false, active: true },
        { id: CLOSED, name: "Old Yard", isDefault: false, active: false },
      ],
    });
    const select = screen.getByTestId("so-batch-deliver-to-select-build::o1::b1");
    const closed = within(select).getByRole("option", { name: "Old Yard" });
    expect(closed).toBeDisabled();
    // ...and it is offered no quantity box in the split editor either.
    fireEvent.click(screen.getByTestId("so-batch-select-build::o1::b1"));
    fireEvent.click(screen.getByTestId("so-batch-split-build::o1::b1"));
    expect(
      screen.queryByTestId(`so-batch-split-qty-build::o1::b1-${CLOSED}`),
    ).not.toBeInTheDocument();
  });

  it("with only one destination there is nothing to split, so no Split control", () => {
    renderRegister({
      destinations: [{ id: KLANG, name: "Carres Klang", isDefault: true, active: true }],
    });
    expect(screen.queryByTestId("so-batch-split-build::o1::b1")).not.toBeInTheDocument();
  });

  it("selection survives a rail filter, and the arrangement with it", () => {
    renderRegister();
    fireEvent.click(screen.getByTestId("so-batch-select-build::o1::b1"));
    fireEvent.change(screen.getByTestId("so-batch-deliver-to-select-build::o1::b1"), {
      target: { value: BULOH },
    });
    fireEvent.click(screen.getByTestId("so-batch-state-ready_to_buy"));
    fireEvent.click(screen.getByTestId("so-batch-state-ready_to_buy"));
    fireEvent.click(screen.getByTestId("so-batch-issue"));
    const [selections] = onIssue.mock.calls[0]!;
    expect(selections[0].allocations).toEqual([{ destinationId: BULOH, qty: 2 }]);
  });
});
