import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
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
  return { key, title, spec, codes, lines: [] };
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

const grid = () => screen.getByTestId("to-order-grid");
const dataRows = () =>
  within(grid())
    .getAllByRole("row")
    .filter((r) => r.getAttribute("data-testid")?.startsWith("to-order-row-"));

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

  it("switches the grid when another proposal is picked", async () => {
    render(wrap());
    await screen.findByTestId("to-order-grid");
    expect(dataRows()).toHaveLength(3);

    fireEvent.click(screen.getByTestId(`to-order-proposal-${OHANA}::bedframe`));
    await waitFor(() => expect(dataRows()).toHaveLength(1));
    expect(grid()).toHaveTextContent("wong");
  });
});

describe("To Order — the grid", () => {
  it("opens on Stock ready, earliest first, with the dateless row last", async () => {
    render(wrap());
    await screen.findByTestId("to-order-grid");
    expect(dataRows().map((r) => r.getAttribute("data-testid"))).toEqual([
      "to-order-row-1204",
      "to-order-row-1207",
      "to-order-row-1257",
    ]);
  });

  it("keeps the dateless row last when the sort is reversed", async () => {
    render(wrap());
    await screen.findByTestId("to-order-grid");
    fireEvent.click(screen.getByTestId("to-order-col-stockReady"));
    await waitFor(() =>
      expect(dataRows().map((r) => r.getAttribute("data-testid"))).toEqual([
        "to-order-row-1207",
        "to-order-row-1204",
        "to-order-row-1257",
      ]),
    );
  });

  it("sorts by any column the operator clicks — and the dateless row still sinks", async () => {
    render(wrap());
    await screen.findByTestId("to-order-grid");
    fireEvent.click(screen.getByTestId("to-order-col-cust"));
    await waitFor(() =>
      expect(dataRows().map((r) => r.getAttribute("data-testid"))).toEqual([
        "to-order-row-1204", // ella
        "to-order-row-1207", // PETER
        "to-order-row-1257", // kee tong — alphabetically second, but has no date
      ]),
    );
  });

  it("says No delivery date in the cell instead of lighting a status column", async () => {
    render(wrap());
    await screen.findByTestId("to-order-grid");
    expect(screen.getByTestId("to-order-row-1257")).toHaveTextContent("No delivery date");
    // There is no status column at all.
    expect(screen.queryByTestId("to-order-col-status")).toBeNull();
    expect(grid()).not.toHaveTextContent("⚠");
  });

  it("shows a customer's sofas only when the row is opened", async () => {
    render(wrap());
    await screen.findByTestId("to-order-grid");
    expect(grid()).not.toHaveTextContent("Sofa 2 — Booqit");

    fireEvent.click(screen.getByTestId("to-order-row-1207"));
    await waitFor(() => expect(grid()).toHaveTextContent("Sofa 2 — Booqit"));
    expect(grid()).toHaveTextContent("Sofa 1 — Booqit");
    expect(grid()).toHaveTextContent("5539-1B(LHF) · 5539-CNR");

    fireEvent.click(screen.getByTestId("to-order-row-1207"));
    await waitFor(() => expect(grid()).not.toHaveTextContent("Sofa 2 — Booqit"));
  });

  it("keeps price and address off the page", async () => {
    render(wrap());
    await screen.findByTestId("to-order-grid");
    fireEvent.click(screen.getByTestId("to-order-row-1207"));
    await waitFor(() => expect(grid()).toHaveTextContent("Sofa 2 — Booqit"));
    expect(grid()).not.toHaveTextContent("RM");
    expect(grid()).not.toHaveTextContent("Address");
  });
});

describe("To Order — issuing", () => {
  it("shows the same count the sidebar does", async () => {
    render(wrap());
    await screen.findByTestId("to-order-action");
    expect(screen.getByTestId("to-order-action")).toHaveTextContent("3 Purchase Orders");
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
      expect(JSON.parse(String((call![1] as RequestInit).body))).toEqual({
        supplierId: OHANA,
        category: "sofa",
        destinationId: AL,
      });
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
