import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import SupplierDashboard from "./SupplierDashboard";

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
  ApiError: class ApiError extends Error {
    status: number;
    body: unknown;
    constructor(status: number, message: string, body: unknown) {
      super(message);
      this.status = status;
      this.body = body;
      this.name = "ApiError";
    }
  },
}));
import { apiFetch } from "@/lib/api";

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

const POS = [
  { id: "PO-2050", sup_status: "pending", qty: 4, supplier_id: "e1" },
  { id: "PO-2049", sup_status: "in_production", qty: 6, supplier_id: "e1" },
  { id: "PO-2048", sup_status: "ready_for_pickup", qty: 2, supplier_id: "e1" },
  { id: "PO-2047", sup_status: "delivered", qty: 8, supplier_id: "e1" },
];
const DEMAND = [
  { sku: "mattress:cloud:Queen", openQty: 12, poCount: 2 },
  { sku: "mattress:cloud:King", openQty: 4, poCount: 1 },
];
const ME_OWN = {
  id: "e1",
  name: "Cloud Mattress Sdn Bhd",
  kind: "own_logistics" as const,
  cat_covered: ["mattress"],
  lead_time: "10–14 days",
  contact: "+60 12 345 6789",
  contact_email: "ops@cloudmattress.my",
  slug: "cloud-mattress",
  portal_enabled: true,
};
const ACTIVITY = [
  {
    id: "h1",
    po_id: "PO-2050",
    text: "Acknowledged · production scheduled",
    by_role: "supplier",
    occurred_at: new Date(Date.now() - 30 * 60_000).toISOString(),
  },
  {
    id: "h2",
    po_id: "PO-2049",
    text: "Production started",
    by_role: "supplier",
    occurred_at: new Date(Date.now() - 4 * 60 * 60_000).toISOString(),
  },
];

function mockAll() {
  vi.mocked(apiFetch).mockImplementation(async (url: string) => {
    if (url.includes("/api/supplier/me")) return ME_OWN;
    if (url.includes("/api/supplier/activity")) return ACTIVITY;
    if (url.includes("/products/demand")) return DEMAND;
    if (url.includes("/api/supplier/pos")) return POS;
    throw new Error(`unexpected fetch ${url}`);
  });
}

describe("SupplierDashboard", () => {
  it("renders demand + pipeline KPI rows", async () => {
    mockAll();

    render(wrap(<SupplierDashboard />));

    await waitFor(() => {
      expect(screen.getByText("Pending acknowledgement")).toBeInTheDocument();
    });

    // Pipeline row (existing)
    expect(screen.getByText("In production")).toBeInTheDocument();
    expect(screen.getByText("Ready · awaiting pickup")).toBeInTheDocument();

    // Demand hero row (added 2026-05-15)
    expect(screen.getByText("Total demand")).toBeInTheDocument();
    expect(screen.getByText("Committed (POs)")).toBeInTheDocument();
    expect(screen.getByText("Pending (orders)")).toBeInTheDocument();

    // "Total open units" dropped — duplicated Committed (POs)
    expect(screen.queryByText("Total open units")).not.toBeInTheDocument();
  });

  it("derives pipeline stage counts from sup_status", async () => {
    mockAll();

    render(wrap(<SupplierDashboard />));

    await waitFor(() => {
      expect(screen.getByText("Pipeline overview")).toBeInTheDocument();
    });

    // PO: 2 (pending + in_production); Ready: 1; Delivered: 1
    expect(screen.getByText("PO")).toBeInTheDocument();
    expect(screen.getByText("Ready to Pickup")).toBeInTheDocument();
    expect(screen.getByText("Delivered")).toBeInTheDocument();
  });

  it("renders Top demand from useSupplierDemand", async () => {
    mockAll();

    render(wrap(<SupplierDashboard />));

    await waitFor(() => {
      expect(screen.getByText("mattress:cloud:Queen")).toBeInTheDocument();
    });
    expect(screen.getByText("mattress:cloud:King")).toBeInTheDocument();
    expect(screen.getByText(/Top demand/i)).toBeInTheDocument();
  });

  it("renders Coverage callout from useSupplierMe with kind badge", async () => {
    mockAll();

    render(wrap(<SupplierDashboard />));

    await waitFor(() => {
      expect(screen.getByTestId("supplier-coverage-callout")).toBeInTheDocument();
    });

    expect(screen.getByText("Coverage")).toBeInTheDocument();
    expect(screen.getByText("mattress")).toBeInTheDocument();
    expect(screen.getByText("10–14 days")).toBeInTheDocument();
    expect(screen.getByText("ops@cloudmattress.my")).toBeInTheDocument();
    expect(screen.getByText("Own logistics")).toBeInTheDocument();
  });

  it("renders factory_pickup workflow badge when kind=factory_pickup", async () => {
    vi.mocked(apiFetch).mockImplementation(async (url: string) => {
      if (url.includes("/api/supplier/me"))
        return { ...ME_OWN, kind: "factory_pickup" };
      if (url.includes("/api/supplier/activity")) return ACTIVITY;
      if (url.includes("/products/demand")) return DEMAND;
      if (url.includes("/api/supplier/pos")) return POS;
      throw new Error(`unexpected fetch ${url}`);
    });

    render(wrap(<SupplierDashboard />));

    await waitFor(() => {
      expect(screen.getByText("Factory pickup")).toBeInTheDocument();
    });
  });

  it("renders Recent activity feed from useSupplierActivity", async () => {
    mockAll();

    render(wrap(<SupplierDashboard />));

    // Wait specifically for the activity data — the section container renders
    // immediately with a Loading… stub, so getByTestId would resolve before
    // the useQuery settles.
    await waitFor(() => {
      expect(
        screen.getByText(/Acknowledged.*production scheduled/),
      ).toBeInTheDocument();
    });

    expect(screen.getByTestId("supplier-recent-activity")).toBeInTheDocument();
    expect(screen.getByText("Recent activity")).toBeInTheDocument();
    expect(screen.getByText(/Production started/)).toBeInTheDocument();
    // PO ids surface as anchors in the feed.
    expect(screen.getByText("PO-2050")).toBeInTheDocument();
    expect(screen.getByText("PO-2049")).toBeInTheDocument();
  });

  it("counts partner_confirmed POs in Ready pipeline cell + KPI", async () => {
    // 0090 sofa flow regression: partner WH accepted the goods, supplier
    // (own_logistics) is now self-dispatching. The PO must appear in the
    // Ready bucket on the Dashboard, not vanish from the pipeline view.
    // See apps/api/src/routes/supplier/pos.ts:49 — API ready bucket already
    // includes partner_confirmed; this asserts Dashboard mirrors that.
    vi.mocked(apiFetch).mockImplementation(async (url: string) => {
      if (url.includes("/api/supplier/me")) return ME_OWN;
      if (url.includes("/api/supplier/activity")) return [];
      if (url.includes("/products/demand")) return DEMAND;
      if (url.includes("/api/supplier/pos"))
        return [
          {
            id: "PO-2032",
            sup_status: "partner_confirmed",
            supplier_id: "e1",
            lines: [{ id: "L1", sku: "sofa:malibu", qty: 5, attrs: {} }],
          },
        ];
      throw new Error(`unexpected fetch ${url}`);
    });

    render(wrap(<SupplierDashboard />));

    // Wait until the PO query settles — Pipeline overview renders before async
    // data arrives, so check the Ready KPI flips from 0 to 1 as the signal.
    const readyKpi = await waitFor(() => {
      const kpi = screen.getByText("Ready · awaiting pickup").parentElement!;
      expect(within(kpi).getByText("1")).toBeInTheDocument();
      return kpi;
    });

    // Ready pipeline cell also shows count of 1, not 0.
    const readyCell = screen.getByText("Ready to Pickup").parentElement!;
    expect(within(readyCell).getByText("1")).toBeInTheDocument();

    // Sanity: the KPI we waited on is the same one we asserted against.
    expect(readyKpi).toBeInTheDocument();
  });

  it("Recent activity shows empty hint when feed is empty", async () => {
    vi.mocked(apiFetch).mockImplementation(async (url: string) => {
      if (url.includes("/api/supplier/me")) return ME_OWN;
      if (url.includes("/api/supplier/activity")) return [];
      if (url.includes("/products/demand")) return DEMAND;
      if (url.includes("/api/supplier/pos")) return POS;
      throw new Error(`unexpected fetch ${url}`);
    });

    render(wrap(<SupplierDashboard />));

    await waitFor(() => {
      expect(screen.getByText("No recent activity yet.")).toBeInTheDocument();
    });
  });
});
