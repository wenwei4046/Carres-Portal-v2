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

function build(key: string, title: string, spec: string, codes: string) {
  return { key, title, spec, codes, lines: [{ lineId: `${key}-l1`, sku: codes, qty: 1, cost: null }] };
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
          builds: [build("l1", "Bedframe 1 — Cody", "1 Module", "CODY-Q")],
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
    await screen.findByTestId("to-order-preview");
    expect(screen.getAllByTestId(/^to-order-po-d\d+$/)).toHaveLength(3);

    fireEvent.click(screen.getByTestId(`to-order-proposal-${OHANA}::bedframe`));
    // Bedframe merges every customer order into ONE document.
    await waitFor(() => expect(screen.getAllByTestId(/^to-order-po-d\d+$/)).toHaveLength(1));
    expect(screen.getByTestId("to-order-preview")).toHaveTextContent("wong");
  });
});

describe("To Order — the Purchase Order Preview", () => {
  it("shows one block per future purchase order", async () => {
    render(wrap());
    await screen.findByTestId("to-order-preview");
    const blocks = screen.getAllByTestId(/^to-order-po-d\d+$/);
    expect(blocks).toHaveLength(3); // sofa: one document per customer order
    expect(blocks[0]).toHaveTextContent("PO 1 of 3");
    expect(blocks[0]).toHaveTextContent("ella");
  });

  it("opens a document to its sofas", async () => {
    render(wrap());
    await screen.findByTestId("to-order-preview");
    expect(screen.queryByText("Sofa 2 — Booqit")).toBeNull();

    fireEvent.click(screen.getByTestId("to-order-po-toggle-d2"));
    await screen.findByText(/Sofa 2 — Booqit/);
  });

  it("has no Split or Move on sofa — a sofa PO carries one customer order", async () => {
    render(wrap());
    await screen.findByTestId("to-order-preview");
    fireEvent.click(screen.getByTestId("to-order-po-toggle-d2"));
    await screen.findByText(/Sofa 2 — Booqit/);
    expect(screen.queryByTestId(/^to-order-split-/)).toBeNull();
    expect(screen.queryByTestId(/^to-order-move-/)).toBeNull();
  });

  it("leaving a document out changes the count and says it changes nothing else", async () => {
    render(wrap());
    await screen.findByTestId("to-order-preview");
    expect(screen.getByTestId("to-order-count")).toHaveTextContent("3 Purchase Orders");

    fireEvent.click(screen.getByTestId("to-order-include-d2"));
    await waitFor(() =>
      expect(screen.getByTestId("to-order-count")).toHaveTextContent("2 Purchase Orders"),
    );
    expect(screen.getByTestId("to-order-po-d2")).toHaveTextContent(
      "Not issued this time. Nothing about the order changes.",
    );
  });

  it("removing an item takes it off the document and keeps it visible", async () => {
    render(wrap());
    await screen.findByTestId("to-order-preview");
    fireEvent.click(screen.getByTestId("to-order-po-toggle-d2"));
    await screen.findByText(/Sofa 2 — Booqit/);

    fireEvent.click(screen.getByTestId("to-order-remove-bk-b"));
    const removed = await screen.findByTestId("to-order-removed");
    expect(removed).toHaveTextContent("Not on any purchase order");
    expect(removed).toHaveTextContent("Still waiting to be ordered.");
    expect(removed).toHaveTextContent("PETER");
  });

  it("puts a removed item back", async () => {
    render(wrap());
    await screen.findByTestId("to-order-preview");
    fireEvent.click(screen.getByTestId("to-order-po-toggle-d2"));
    await screen.findByText(/Sofa 2 — Booqit/);
    fireEvent.click(screen.getByTestId("to-order-remove-bk-b"));
    await screen.findByTestId("to-order-removed");

    fireEvent.click(screen.getByTestId("to-order-putback-bk-b"));
    await waitFor(() => expect(screen.queryByTestId("to-order-removed")).toBeNull());
  });

  it("refuses to issue when nothing is included, and says so", async () => {
    render(wrap());
    await screen.findByTestId("to-order-preview");
    for (const k of ["d1", "d2", "d3"]) fireEvent.click(screen.getByTestId(`to-order-include-${k}`));
    await waitFor(() =>
      expect(screen.getByTestId("to-order-plan-blocked")).toHaveTextContent(
        "Nothing is selected to issue.",
      ),
    );
    expect(screen.getByTestId("to-order-issue")).toBeDisabled();
  });

  it("splits and moves on a category whose purchase orders may merge", async () => {
    render(wrap());
    await screen.findByTestId("to-order-preview");
    fireEvent.click(screen.getByTestId(`to-order-proposal-${OHANA}::bedframe`));
    await waitFor(() => expect(screen.getAllByTestId(/^to-order-po-d\d+$/)).toHaveLength(1));

    fireEvent.click(screen.getByTestId("to-order-po-toggle-d1"));
    await screen.findByTestId("to-order-split-l1");
    fireEvent.click(screen.getByTestId("to-order-split-l1"));
    // One build, split out of a one-build document, is still one document.
    await waitFor(() => expect(screen.getAllByTestId(/^to-order-po-d\d+$/)).toHaveLength(1));
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

