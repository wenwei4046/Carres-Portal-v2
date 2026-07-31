import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TO_ORDER_WORDS as W } from "@carres/shared";
import OperationToOrder from "./OperationToOrder";
import { fmtDate } from "@/lib/fmt-date";

/**
 * To Order — rebuilt from the Golden Template, 2026-07-31.
 *
 * What these pin is the page's ASSEMBLY, because the business rules are pinned
 * in `packages/shared` and the arrangement rules in `to-order-preview.test.ts`:
 * the queue counts match the button's count, the two blocked regions are ABSENT
 * rather than empty, the sofa menu cannot merge, the issue posts the
 * arrangement and nothing else, and the words on screen are `TO_ORDER_WORDS`'s.
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

const OHANA = "11111111-1111-1111-1111-111111111111";
const KLANG = "2f181917-f4e1-42b2-9e25-d7ee6785424a";
const AL = "818b420c-27f9-4707-a516-b91a6e03f343";

function build(key: string, title: string, spec: string, codes: string, qty = 1, size: string | null = null) {
  // `Sofa 2 — Booqit` is the shape the projection produces when two siblings
  // of one customer order would otherwise read identically.
  const parts = title.split(" — ");
  return {
    key, title, spec, codes, qty, size,
    model: parts.length > 1 ? parts[1] : title,
    ordinal: parts.length > 1 ? Number(parts[0].split(" ")[1]) : null,
    lines: [{ lineId: `${key}-l1`, sku: codes, qty, cost: null }],
  };
}

const TO_ORDER = {
  today: "2026-07-30",
  destinations: [
    { id: KLANG, name: "Carres Klang", isDefault: true },
    { id: AL, name: "AL Sungai Buloh", isDefault: false },
  ],
  proposals: [
    {
      key: `${OHANA}::sofa`,
      supplierId: OHANA,
      supplierName: "Ohana",
      category: "sofa",
      label: "Ohana · Sofa",
      orderBy: "2026-07-15",
      poCount: 3,
      blocked: null,
      rows: [
        {
          orderId: "o2", so: 1204, customer: "ella", qty: 1,
          summary: "Booqit · 1 Sofa · CG-004 Wood", stockReady: "2026-07-31",
          builds: [build("bk-e", "Sofa 1 — Booqit", '2 Modules · CG-004 Wood', "5539-1A(LHF)")],
        },
        {
          orderId: "o1", so: 1207, customer: "PETER", qty: 2,
          summary: "Booqit · 2 Sofas", stockReady: "2026-08-13",
          builds: [
            build("bk-a", "Sofa 1 — Booqit", '3 Modules · Leg 6"', "5539-1B(LHF) · 5539-CNR"),
            build("bk-b", "Sofa 2 — Booqit", '2 Modules · Leg 4"', "5539-1A(LHF)"),
          ],
        },
        {
          orderId: "o3", so: 1257, customer: "kee tong", qty: 2,
          summary: "Booqit · 2 Sofas · CG-010 Gold", stockReady: null,
          builds: [build("bk-k", "Sofa 1 — Booqit", "CG-010 Gold", "5539-2B(LHF)")],
        },
      ],
    },
    {
      key: `${OHANA}::bedframe`,
      supplierId: OHANA,
      supplierName: "Ohana",
      category: "bedframe",
      label: "Ohana · Bedframe",
      orderBy: "2026-07-21",
      poCount: 1,
      blocked: null,
      rows: [
        {
          orderId: "o9", so: 1300, customer: "wong", qty: 3,
          summary: "Cody · 3 Bedframes", stockReady: "2026-07-29",
          // ONE line, THREE units — the case the old preview read as "1 item".
          builds: [build("l1", "Cody Queen", "1 Module", "CODY-Q", 3, "Queen")],
        },
        {
          orderId: "o8", so: 1301, customer: "lim", qty: 1,
          summary: "Cody · 1 Bedframe", stockReady: "2026-07-30",
          builds: [build("l2", "Cody King", "1 Module", "CODY-K", 1, "King")],
        },
      ],
    },
  ],
};

function route(path: string, body?: unknown) {
  if (path.startsWith("/api/operation/purchase/to-order/issue")) {
    return Promise.resolve({
      supplier: "Ohana",
      destination: "Carres Klang",
      pos: [
        { id: "PO-2031", customer: "ella" },
        { id: "PO-2032", customer: "PETER" },
        { id: "PO-2033", customer: "kee tong" },
      ],
      _body: body,
    });
  }
  if (path.startsWith("/api/operation/purchase/to-order")) return Promise.resolve(TO_ORDER);
  if (path.startsWith("/api/operation/purchasing/settings")) {
    return Promise.resolve({ canEdit: false });
  }
  return Promise.resolve({});
}

/**
 * Open a row's ⋯ menu — by KEYBOARD, not by click: jsdom has no
 * `PointerEvent`, so a click on a Radix trigger dispatches an event the
 * trigger never sees and the menu silently never opens (the D0.5b trap).
 */
async function openMenu(buildKey: string) {
  fireEvent.keyDown(screen.getByTestId(`items-menu-${buildKey}`), { key: "Enter" });
  await screen.findByRole("menu");
}

/** The workspace's include box — the only checkbox on the pane. */
function includeBox() {
  return screen.getByRole("checkbox", { name: W.include });
}

function wrap() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <OperationToOrder />
      </QueryClientProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  navigate.mockReset();
  apiFetch.mockReset();
  apiFetch.mockImplementation((path: string, init?: RequestInit) =>
    route(path, init?.body ? JSON.parse(String(init.body)) : undefined),
  );
});

describe("the queue", () => {
  it("lists every proposal by how many purchase orders it will create", async () => {
    render(wrap());
    const sofa = await screen.findByTestId(`to-order-proposal-${OHANA}::sofa`);
    expect(sofa).toHaveTextContent("Ohana · Sofa");
    expect(sofa).toHaveTextContent("3 Purchase Orders");
    expect(sofa).toHaveTextContent(`Order by ${fmtDate("2026-07-15")}`);

    const bed = screen.getByTestId(`to-order-proposal-${OHANA}::bedframe`);
    expect(bed).toHaveTextContent("1 Purchase Order");
    expect(bed).not.toHaveTextContent("1 Purchase Orders");
  });

  it("nests the current proposal's documents, each counted in lines and units", async () => {
    render(wrap());
    await screen.findByTestId("to-order-doc-d1");

    // Sofa: one document per customer order, in the grid's own row order.
    expect(screen.getByTestId("to-order-doc-d1")).toHaveTextContent("PO 1 of 3");
    expect(screen.getByTestId("to-order-doc-d1")).toHaveTextContent("ella");
    expect(screen.getByTestId("to-order-doc-d2")).toHaveTextContent("PETER");
    expect(screen.getByTestId("to-order-doc-d2")).toHaveTextContent("2 lines · 2 units");
    // The OTHER proposal's documents are not on screen.
    expect(screen.queryByTestId("to-order-doc-d4")).toBeNull();
  });
});

describe("the workspace", () => {
  it("fills the pane with the first document and names it", async () => {
    render(wrap());
    const bar = await screen.findByTestId("to-order-workspace");
    expect(bar).toHaveTextContent("PO 1 of 3");
    expect(bar).toHaveTextContent("ella");
    expect(bar).toHaveTextContent("SO-1204");
    // The header line: supplier · category, with the order-by date as meta.
    expect(screen.getByTestId("to-order-header")).toHaveTextContent("Ohana · Sofa");
    expect(screen.getByTestId("to-order-header")).toHaveTextContent(
      `Order by ${fmtDate("2026-07-15")}`,
    );
  });

  it("does not render the blocked regions as empty placeholders", async () => {
    // `po_sends` does not exist and Notes has no ruled word — an unbuilt
    // region is ABSENT, never an empty collapsed strip (Loo, 2026-07-31).
    render(wrap());
    await screen.findByTestId("to-order-workspace");
    expect(screen.queryByText("Supplier Communication")).toBeNull();
    expect(screen.queryByText("Notes to Supplier")).toBeNull();
  });

  it("shows Size and Qty — the two facts the table exists to stop hiding", async () => {
    render(wrap());
    await screen.findByTestId("to-order-workspace");
    fireEvent.click(screen.getByTestId(`to-order-proposal-${OHANA}::bedframe`));

    const items = await screen.findByTestId("to-order-items");
    expect(within(items).getByText("Queen")).toBeInTheDocument();
    expect(within(items).getByText("3")).toBeInTheDocument();
    expect(screen.getByTestId("to-order-items-count")).toHaveTextContent("2 lines · 4 units");
  });

  it("tells identical siblings apart with an earned ordinal, and a sofa's Size is a dash", async () => {
    render(wrap());
    await screen.findByTestId("to-order-workspace");
    fireEvent.click(screen.getByTestId("to-order-doc-d2"));

    const items = await screen.findByTestId("to-order-items");
    expect(within(items).getByText("Sofa 1 — Booqit")).toBeInTheDocument();
    expect(within(items).getByText("Sofa 2 — Booqit")).toBeInTheDocument();
    // Sofa has no size AS A CATEGORY — the dash is that fact, not missing data.
    expect(within(items).getAllByText("—").length).toBeGreaterThan(0);
  });

  it("leaving a document out of this issue drops the count and says what it means", async () => {
    render(wrap());
    await screen.findByTestId("to-order-workspace");
    expect(screen.getByTestId("to-order-count")).toHaveTextContent("3 Purchase Orders");

    fireEvent.click(includeBox());
    expect(screen.getByText(W.includeOffHelp)).toBeInTheDocument();
    expect(screen.getByTestId("to-order-count")).toHaveTextContent("2 Purchase Orders");
  });

  it("refuses an issue with nothing selected, in the operator's words", async () => {
    render(wrap());
    await screen.findByTestId("to-order-workspace");

    for (const k of ["d1", "d2", "d3"]) {
      fireEvent.click(screen.getByTestId(`to-order-doc-${k}`));
      fireEvent.click(includeBox());
    }
    expect(screen.getByTestId("to-order-plan-blocked")).toHaveTextContent(
      "Nothing is selected to issue.",
    );
    expect(screen.getByTestId("to-order-issue")).toBeDisabled();
  });
});

describe("the row menu", () => {
  it("a sofa document can never split and never merge", async () => {
    render(wrap());
    await screen.findByTestId("to-order-workspace");
    await openMenu("bk-e");

    // Three documents exist beside this one, and still no Move: a sofa
    // purchase order carries ONE customer order, so moving would be the merge
    // the boundary forbids and splitting has nothing to separate.
    expect(screen.queryByText(/^Move to /)).toBeNull();
    expect(screen.queryByText(W.itemsSplit)).toBeNull();
    expect(screen.getByText(W.itemsRemove)).toBeInTheDocument();
    expect(screen.getByText(W.itemsOpenOrder)).toBeInTheDocument();
  });

  it("Move only exists after a split has made somewhere to move to", async () => {
    render(wrap());
    await screen.findByTestId("to-order-workspace");
    fireEvent.click(screen.getByTestId(`to-order-proposal-${OHANA}::bedframe`));
    await screen.findByTestId("to-order-doc-d1");

    await openMenu("l1");
    expect(screen.queryByText(/^Move to /)).toBeNull();
    fireEvent.click(screen.getByText(W.itemsSplit));

    // The split created Purchase Order 2 in the queue, and Move names it.
    await screen.findByTestId("to-order-doc-d2");
    expect(screen.getByTestId("to-order-count")).toHaveTextContent("2 Purchase Orders");
    await openMenu("l2");
    expect(screen.getByText("Move to Purchase Order 2")).toBeInTheDocument();
  });

  it("a removed item is not lost — it waits outside and can be put back", async () => {
    render(wrap());
    await screen.findByTestId("to-order-workspace");
    fireEvent.click(screen.getByTestId("to-order-doc-d2"));

    await openMenu("bk-b");
    fireEvent.click(screen.getByText(W.itemsRemove));

    const strip = await screen.findByTestId("to-order-removed");
    expect(strip).toHaveTextContent(W.removedHeading);
    expect(strip).toHaveTextContent("SO-1207 · PETER");
    expect(screen.getByTestId("to-order-count")).toHaveTextContent("3 Purchase Orders");

    fireEvent.click(screen.getByTestId("to-order-putback-bk-b"));
    expect(screen.queryByTestId("to-order-removed")).toBeNull();
  });

  it("Open Customer Order leaves for the order, and says which document it is", async () => {
    render(wrap());
    await screen.findByTestId("to-order-workspace");
    await openMenu("bk-e");
    fireEvent.click(screen.getByText(W.itemsOpenOrder));
    expect(navigate).toHaveBeenCalledWith("/operation/orders?order=o2");
  });
});

describe("Issue Purchase Order", () => {
  it("posts the ARRANGEMENT and nothing else — no SKU, no quantity, no price", async () => {
    render(wrap());
    await screen.findByTestId("to-order-workspace");
    fireEvent.click(screen.getByTestId("to-order-issue"));

    await waitFor(() => {
      const call = apiFetch.mock.calls.find(([p]) =>
        String(p).endsWith("/to-order/issue"),
      );
      expect(call).toBeTruthy();
      const body = JSON.parse(String((call![1] as RequestInit).body));
      expect(Object.keys(body).sort()).toEqual([
        "category",
        "destinationId",
        "purchaseOrders",
        "supplierId",
      ]);
      expect(body.destinationId).toBe(KLANG);
      for (const po of body.purchaseOrders) {
        expect(Object.keys(po).sort()).toEqual(["buildKeys", "include", "key"]);
      }
      expect(JSON.stringify(body)).not.toMatch(/sku|qty|cost|price/);
    });
  });

  it("success names the real purchase orders and leads to them", async () => {
    render(wrap());
    await screen.findByTestId("to-order-workspace");
    fireEvent.click(screen.getByTestId("to-order-issue"));

    const done = await screen.findByTestId("to-order-issued");
    expect(done).toHaveTextContent("3 purchase orders issued to Ohana");
    expect(done).toHaveTextContent("PO-2031");
    expect(done).toHaveTextContent(W.nextStep);

    fireEvent.click(screen.getByTestId("to-order-open-pos"));
    expect(navigate).toHaveBeenCalledWith("/operation/procurement");
  });

  it("demand the catalog could not read stops EVERY issue, by name", async () => {
    apiFetch.mockImplementation((path: string) =>
      path.endsWith("/to-order")
        ? Promise.resolve({
            ...TO_ORDER,
            unresolved: [{ sku: "M1401F-K", orderId: "ox", so: 1290 }],
          })
        : route(path),
    );
    render(wrap());
    await screen.findByTestId("to-order-workspace");

    const block = screen.getByTestId("to-order-unresolved");
    expect(block).toHaveTextContent("1 item could not be read");
    expect(block).toHaveTextContent("SO-1290 · M1401F-K");
    expect(screen.getByTestId("to-order-issue")).toBeDisabled();
  });

  it("an empty To Order is an answer, not a blank pane", async () => {
    apiFetch.mockImplementation((path: string) =>
      path.endsWith("/to-order")
        ? Promise.resolve({ ...TO_ORDER, proposals: [] })
        : route(path),
    );
    render(wrap());
    // findByTEXT, not the testid — the pane carries the testid while it is
    // still loading, and the skeleton is not the answer being asserted.
    await screen.findByText(W.empty);
    expect(screen.getByTestId("to-order-empty")).toHaveTextContent(W.empty);
  });
});
