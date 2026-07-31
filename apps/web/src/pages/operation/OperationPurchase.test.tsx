import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import OperationPurchase from "./OperationPurchase";

/**
 * To Order — the Review Grid.
 *
 * What these pin is the behaviour an operator relies on and a redesign could
 * silently break: the grid sorts, a row opens the sofas inside it, the button's
 * count is the sidebar's count, the destination the operator picked is the one
 * that gets posted, and the success panel names the real purchase orders and
 * leads to them.
 *
 * The business rules themselves are pinned in `packages/shared` — this file
 * asserts nothing about qty, summaries or dates beyond what reaches the screen.
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
          // ONE line, THREE units — the case the old row rendered as "1 item".
          builds: [build("l1", "Cody Queen", "1 Module", "CODY-Q", 3, "Queen")],
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
 * Open a row's ⋯ menu.
 *
 * By KEYBOARD, not by click: jsdom has no `PointerEvent`, so `fireEvent.click`
 * dispatches an event Radix's trigger never sees and the menu silently never
 * opens — the trap D0.5b hit and wrote down. Enter on the trigger is also the
 * assertion a keyboard operator needs to pass anyway.
 */
async function openMenu(buildKey: string) {
  fireEvent.keyDown(screen.getByTestId(`items-menu-${buildKey}`), { key: "Enter" });
  await screen.findByRole("menu");
}

function wrap() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <OperationPurchase />
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

describe("To Order — the sidebar", () => {
  it("lists every proposal by how many purchase orders it will create", async () => {
    render(wrap());
    await screen.findByTestId(`to-order-proposal-${OHANA}::sofa`);

    const sofa = screen.getByTestId(`to-order-proposal-${OHANA}::sofa`);
    expect(sofa).toHaveTextContent("Ohana · Sofa");
    expect(sofa).toHaveTextContent("3 Purchase Orders");

    const bed = screen.getByTestId(`to-order-proposal-${OHANA}::bedframe`);
    expect(bed).toHaveTextContent("1 Purchase Order");
    expect(bed).not.toHaveTextContent("1 Purchase Orders");
  });

  it("switches the preview when another proposal is picked", async () => {
    render(wrap());
    await screen.findByTestId("po-workspace");
    expect(screen.getAllByTestId(/^to-order-doc-d\d+$/)).toHaveLength(3);

    fireEvent.click(screen.getByTestId(`to-order-proposal-${OHANA}::bedframe`));
    // Bedframe merges every customer order into ONE document.
    await waitFor(() => expect(screen.getAllByTestId(/^to-order-doc-d\d+$/)).toHaveLength(1));
    expect(screen.getByTestId("po-workspace")).toHaveTextContent("wong");
  });
});

describe("To Order — the Purchase Order Workspace", () => {
  it("shows one block per future purchase order", async () => {
    render(wrap());
    await screen.findByTestId("po-workspace");
    const blocks = screen.getAllByTestId(/^to-order-doc-d\d+$/);
    expect(blocks).toHaveLength(3); // sofa: one document per customer order
    expect(blocks[0]).toHaveTextContent("PO 1 of 3");
    expect(blocks[0]).toHaveTextContent("ella");
  });

  /**
   * The block header counted LINES and called them `items`, while the Items
   * region below counted UNITS — on Nice Future that is `14 items` sitting
   * directly above `14 lines · 16 units`, with the wrong number on top.
   */
  /**
   * The count is stated by the region that OWNS it and by the queue row an
   * operator scans — never twice inside one block. The old accordion header
   * counted LINES and called them `items` directly above `14 lines · 16 units`.
   */
  it("states the count once inside the workspace, and the queue carries its own", async () => {
    render(wrap());
    await screen.findByTestId("po-workspace");
    fireEvent.click(screen.getByTestId(`to-order-proposal-${OHANA}::bedframe`));
    await waitFor(() => expect(screen.getAllByTestId(/^to-order-doc-d\d+$/)).toHaveLength(1));

    expect(screen.getByTestId("to-order-doc-d1")).toHaveTextContent("1 line · 3 units");
    expect(screen.getByTestId("po-items-count")).toHaveTextContent("1 line · 3 units");
    // and the document's identity bar says nothing about how many
    const bar = screen.getByTestId("po-workspace").firstElementChild!;
    expect(bar.textContent).not.toMatch(/line|unit|item/i);
  });

  /** The five regions, in the frozen order. STRUCTURE — two are empty by design. */
  it("shows five regions in the order who → reach → what → notes → issue", async () => {
    render(wrap());
    const ws = await screen.findByTestId("po-workspace");
    for (const id of ["po-region-header", "po-region-communication", "po-items", "po-region-notes"]) {
      expect(screen.getByTestId(id)).toBeInTheDocument();
    }
    const order = ["po-region-header", "po-region-communication", "po-items", "po-region-notes"].map(
      (id) => [...ws.querySelectorAll("[data-testid]")].indexOf(screen.getByTestId(id)),
    );
    expect(order).toEqual([...order].sort((a, b) => a - b));
    // Issue is outside the scrolling regions — it never leaves the screen.
    expect(screen.getByTestId("to-order-issue")).toBeInTheDocument();
  });

  it("Header and Supplier Communication collapse; Items does not", async () => {
    render(wrap());
    await screen.findByTestId("po-workspace");
    expect(screen.getByTestId("po-header-toggle")).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByTestId("po-comms-toggle")).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByTestId("po-notes-toggle")).toHaveAttribute("aria-expanded", "false");
    // Items has no toggle at all — SectionHeader draws none for a permanent region.
    expect(screen.queryByTestId("po-items-header-toggle")).toBeNull();

    fireEvent.click(screen.getByTestId("po-header-toggle"));
    expect(await screen.findByTestId("po-header-body")).toBeInTheDocument();
  });

  it("shows the picked document's sofas, and Items is never closed", async () => {
    render(wrap());
    await screen.findByTestId("po-workspace");
    // The first document fills the pane without anything being opened.
    expect(screen.getByTestId("po-items")).toHaveTextContent("Booqit");

    fireEvent.click(screen.getByTestId("to-order-doc-d2"));
    const items = await screen.findByTestId("po-items");
    // PETER's order holds TWO sofa builds — the table is the unit an operator
    // points at, so both are rows, not one summary line.
    expect(items).toHaveTextContent("Sofa 1 — Booqit");
    expect(items).toHaveTextContent("Sofa 2 — Booqit");
  });

  /**
   * The row printed a line count and let the operator read it as a quantity.
   * Live on 2026-07-31 that was 14 rows against 16 mattresses to build, and
   * two of the fourteen were the lines carrying the extra units. The number
   * has to be on the row a human looks at, not only in the projection.
   */
  it("prints how many units a line is, not just that a line exists", async () => {
    render(wrap());
    await screen.findByTestId("po-workspace");
    fireEvent.click(screen.getByTestId(`to-order-proposal-${OHANA}::bedframe`));
    await waitFor(() => expect(screen.getAllByTestId(/^to-order-doc-d\d+$/)).toHaveLength(1));

    fireEvent.click(screen.getByTestId("to-order-doc-d1"));
    const items = await screen.findByTestId("po-items");
    // Size and quantity are their OWN columns — neither is inside a sentence
    // an operator has to parse.
    expect(items).toHaveTextContent("Cody");
    expect(items).toHaveTextContent("Queen");
    expect(items).toHaveTextContent("3");
    // UNITS, the word Loo froze — the goods are named in every row's Item cell.
    expect(screen.getByTestId("po-items-count")).toHaveTextContent("1 line · 3 units");
  });

  it("has no Split or Move on sofa — a sofa PO carries one customer order", async () => {
    render(wrap());
    await screen.findByTestId("po-workspace");
    fireEvent.click(screen.getByTestId("to-order-doc-d2"));
    await screen.findByTestId("po-items");

    await openMenu("bk-b");
    expect(screen.queryByText("Create Another Purchase Order")).toBeNull();
    expect(screen.queryByText(/^Move to /)).toBeNull();
    // and what a sofa row DOES offer is still there
    expect(screen.getByText("Remove")).toBeInTheDocument();
    expect(screen.getByText("Open Customer Order")).toBeInTheDocument();
  });

  it("leaving a document out changes the count and says it changes nothing else", async () => {
    render(wrap());
    await screen.findByTestId("po-workspace");
    expect(screen.getByTestId("to-order-count")).toHaveTextContent("3 Purchase Orders");

    fireEvent.click(screen.getByTestId("to-order-doc-d2"));
    fireEvent.click(await screen.findByTestId("to-order-include-d2"));
    await waitFor(() =>
      expect(screen.getByTestId("to-order-count")).toHaveTextContent("2 Purchase Orders"),
    );
    expect(screen.getByTestId("po-workspace")).toHaveTextContent(
      "Not issued this time. Nothing about the order changes.",
    );
  });

  it("removing an item takes it off the document and keeps it visible", async () => {
    render(wrap());
    await screen.findByTestId("po-workspace");
    fireEvent.click(screen.getByTestId("to-order-doc-d2"));
    await screen.findByTestId("po-items");

    await openMenu("bk-b");
    fireEvent.click(screen.getByText("Remove"));
    const removed = await screen.findByTestId("to-order-removed");
    expect(removed).toHaveTextContent("Not on any purchase order");
    expect(removed).toHaveTextContent("Still waiting to be ordered.");
    expect(removed).toHaveTextContent("PETER");
  });

  it("puts a removed item back", async () => {
    render(wrap());
    await screen.findByTestId("po-workspace");
    fireEvent.click(screen.getByTestId("to-order-doc-d2"));
    await screen.findByTestId("po-items");
    await openMenu("bk-b");
    fireEvent.click(screen.getByText("Remove"));
    await screen.findByTestId("to-order-removed");

    fireEvent.click(screen.getByTestId("to-order-putback-bk-b"));
    await waitFor(() => expect(screen.queryByTestId("to-order-removed")).toBeNull());
  });

  it("refuses to issue when nothing is included, and says so", async () => {
    render(wrap());
    await screen.findByTestId("po-workspace");
    // The switch is on whichever document fills the pane, so each is picked
    // and turned off in turn.
    for (const k of ["d1", "d2", "d3"]) {
      fireEvent.click(screen.getByTestId(`to-order-doc-${k}`));
      fireEvent.click(await screen.findByTestId(`to-order-include-${k}`));
    }
    await waitFor(() =>
      expect(screen.getByTestId("to-order-plan-blocked")).toHaveTextContent(
        "Nothing is selected to issue.",
      ),
    );
    expect(screen.getByTestId("to-order-issue")).toBeDisabled();
  });

  it("splits and moves on a category whose purchase orders may merge", async () => {
    render(wrap());
    await screen.findByTestId("po-workspace");
    fireEvent.click(screen.getByTestId(`to-order-proposal-${OHANA}::bedframe`));
    await waitFor(() => expect(screen.getAllByTestId(/^to-order-doc-d\d+$/)).toHaveLength(1));

    fireEvent.click(screen.getByTestId("to-order-doc-d1"));
    await screen.findByTestId("po-items");
    await openMenu("l1");
    fireEvent.click(screen.getByText("Create Another Purchase Order"));
    // One build, split out of a one-build document, is still one document.
    await waitFor(() => expect(screen.getAllByTestId(/^to-order-doc-d\d+$/)).toHaveLength(1));
  });
});

describe("To Order — issuing", () => {
  it("shows the same count the sidebar does", async () => {
    render(wrap());
    await screen.findByTestId("to-order-action");
    expect(screen.getByTestId("to-order-count")).toHaveTextContent("3 Purchase Orders");
  });

  it("defaults the destination to Carres Klang", async () => {
    render(wrap());
    const sel = (await screen.findByTestId("to-order-destination")) as HTMLSelectElement;
    expect(sel.value).toBe(KLANG);
  });

  it("posts the supplier, the category and the destination the operator picked", async () => {
    render(wrap());
    const sel = (await screen.findByTestId("to-order-destination")) as HTMLSelectElement;
    fireEvent.change(sel, { target: { value: AL } });
    fireEvent.click(screen.getByTestId("to-order-issue"));

    await waitFor(() => {
      const call = apiFetch.mock.calls.find((c) => String(c[0]).endsWith("/issue"));
      expect(call).toBeTruthy();
      const sent = JSON.parse(String((call![1] as RequestInit).body));
      expect(sent.supplierId).toBe(OHANA);
      expect(sent.category).toBe("sofa");
      expect(sent.destinationId).toBe(AL);
      // The ARRANGEMENT only — never a SKU, a quantity or a price.
      expect(sent.purchaseOrders).toHaveLength(3);
      expect(sent.purchaseOrders[0]).toEqual({
        key: "d1",
        include: true,
        buildKeys: ["bk-e"],
      });
      expect(JSON.stringify(sent)).not.toContain("qty");
      expect(JSON.stringify(sent)).not.toContain("cost");
    });
  });

  it("names the real purchase orders and their customers, then leads to them", async () => {
    render(wrap());
    await screen.findByTestId("to-order-issue");
    fireEvent.click(screen.getByTestId("to-order-issue"));

    const panel = await screen.findByTestId("to-order-issued");
    expect(panel).toHaveTextContent("3 purchase orders issued to Ohana");
    expect(panel).toHaveTextContent("PO-2031");
    expect(panel).toHaveTextContent("PO-2033");
    expect(panel).toHaveTextContent("kee tong");
    expect(panel).toHaveTextContent("Next: confirm the ready date in Purchase Orders");

    fireEvent.click(screen.getByTestId("to-order-open-pos"));
    expect(navigate).toHaveBeenCalledWith("/operation/procurement");
  });

  it("refuses to issue a pair with no production days, and says why", async () => {
    apiFetch.mockImplementation((path: string) => {
      if (path.startsWith("/api/operation/purchase/to-order")) {
        return Promise.resolve({
          ...TO_ORDER,
          proposals: [{ ...TO_ORDER.proposals[0], blocked: "production_days" }],
        });
      }
      return route(path);
    });

    render(wrap());
    const action = await screen.findByTestId("to-order-action");
    expect(action).toHaveTextContent("Production Days Required");
    expect(action).toHaveTextContent("Set production days in Settings.");
    expect(screen.getByTestId("to-order-issue")).toBeDisabled();
  });
});

describe("To Order — nothing to do", () => {
  it("says so plainly", async () => {
    apiFetch.mockImplementation((path: string) => {
      if (path.startsWith("/api/operation/purchase/to-order")) {
        return Promise.resolve({ ...TO_ORDER, proposals: [] });
      }
      return route(path);
    });

    render(wrap());
    // Wait for the SENTENCE, not the panel — the panel is on screen while the
    // read is still in flight, and an empty answer must be a settled one.
    await screen.findByText("No purchase orders to issue.");
    expect(screen.getByTestId("to-order-empty")).toBeInTheDocument();
  });
});

describe("To Order — a requirement the catalog could not read", () => {
  function withUnresolved() {
    apiFetch.mockImplementation((path: string, init?: RequestInit) => {
      if (path.startsWith("/api/operation/purchase/to-order/issue")) return route(path, init);
      if (path.startsWith("/api/operation/purchase/to-order")) {
        return Promise.resolve({
          ...TO_ORDER,
          unresolved: [
            { sku: "5539-CNR", orderId: "o1", so: 1207 },
            { sku: "TELLUC-1S", orderId: "o4", so: 1282 },
          ],
        });
      }
      return route(path);
    });
  }

  it("names what could not be read and refuses to issue", async () => {
    withUnresolved();
    render(wrap());
    const panel = await screen.findByTestId("to-order-unresolved");
    expect(panel).toHaveTextContent("2 items could not be read");
    expect(panel).toHaveTextContent("Nothing can be issued until every item resolves.");
    expect(panel).toHaveTextContent("SO-1207 · 5539-CNR");
    expect(panel).toHaveTextContent("SO-1282 · TELLUC-1S");
    expect(screen.getByTestId("to-order-issue")).toBeDisabled();
  });

  it("does not post even if the button is reached", async () => {
    withUnresolved();
    render(wrap());
    await screen.findByTestId("to-order-unresolved");
    fireEvent.click(screen.getByTestId("to-order-issue"));
    await waitFor(() =>
      expect(apiFetch.mock.calls.filter((c) => String(c[0]).endsWith("/issue"))).toHaveLength(0),
    );
  });

  it("says nothing at all when every requirement resolves", async () => {
    render(wrap());
    await screen.findByTestId("to-order-action");
    expect(screen.queryByTestId("to-order-unresolved")).toBeNull();
    expect(screen.getByTestId("to-order-issue")).not.toBeDisabled();
  });
});

