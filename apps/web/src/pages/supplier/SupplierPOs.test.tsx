import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import SupplierPOs from "./SupplierPOs";

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
  return (
    <QueryClientProvider client={qc}>
      {ui}
      <Toaster />
    </QueryClientProvider>
  );
}

const PENDING_PO = {
  id: "PO-2050",
  sup_status: "pending",
  sku: "mattress:cloud:Queen",
  qty: 4,
  placed_at: "2026-05-08T00:00:00Z",
  eta_date: "2026-05-15",
  expected_ready_date: null,
  do_number: null,
  supplier_id: "e1",
};
const ACK_PO = {
  ...PENDING_PO,
  id: "PO-2051",
  sup_status: "acknowledged",
};
const PROD_PO = {
  ...PENDING_PO,
  id: "PO-2049",
  sup_status: "in_production",
};
const ACCEPTED_PO = {
  ...PENDING_PO,
  id: "PO-2048",
  sup_status: "pickup_accepted",
};

const ME_OWN = {
  id: "e1",
  name: "Cloud Mattress Sdn Bhd",
  kind: "own_logistics" as const,
  cat_covered: ["mattress"],
  lead_time: "10–14 days",
  contact: null,
  contact_email: null,
  slug: null,
  portal_enabled: true,
};
const ME_FACTORY = { ...ME_OWN, kind: "factory_pickup" as const };

/** Mock /api/supplier/me + /api/supplier/pos. Returns `me` for the me URL,
 *  `pos` for the pos URL, and forwards POST hits through `onPost` (default
 *  returns a 200-ish stub). */
function mockAll(opts: {
  me: typeof ME_OWN | typeof ME_FACTORY | null;
  pos: unknown[];
  onPost?: (url: string) => unknown;
}) {
  vi.mocked(apiFetch).mockImplementation(async (url: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      return opts.onPost ? opts.onPost(url) : { ok: true };
    }
    if (url.includes("/api/supplier/me")) {
      if (opts.me === null) {
        // Simulate hidden/missing me. queries.ts surfaces ApiError; tests
        // use this to assert legacy fallback.
        throw new Error("supplier me unavailable");
      }
      return opts.me;
    }
    // Task 10 (2026-05-15) — PODrawerThreadList fires GET
    // /api/supplier/pos/:poId/threads when the drawer opens. Tests that open
    // the drawer (DO upload field, Submit button gating) need an empty
    // thread list so the checklist renders the "no linked sales orders"
    // hint instead of crashing on missing thread fields. Sub-URL match
    // must come BEFORE the broader `/api/supplier/pos` branch.
    if (url.includes("/threads")) return [];
    if (url.includes("/api/supplier/pos")) return opts.pos;
    throw new Error(`unexpected fetch ${url}`);
  });
}

describe("SupplierPOs", () => {
  it("renders the 3 stage tabs", async () => {
    mockAll({ me: ME_OWN, pos: [] });

    render(wrap(<SupplierPOs />));

    expect(screen.getByText("PO")).toBeInTheDocument();
    expect(screen.getByText("Ready to Pickup")).toBeInTheDocument();
    expect(screen.getByText("Delivered")).toBeInTheDocument();
  });

  it("own_logistics + pending: shows Acknowledge only (no Mark-in-production)", async () => {
    mockAll({ me: ME_OWN, pos: [PENDING_PO] });

    render(wrap(<SupplierPOs />));

    await waitFor(() => {
      expect(screen.getByTestId("po-card-PO-2050")).toBeInTheDocument();
    });

    // me.data is loaded → kind is own_logistics → Mark-in-production hidden.
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Acknowledge PO/i })).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: /Mark in production/i })).not.toBeInTheDocument();
  });

  it("factory_pickup + pending: shows Mark-in-production only (no Acknowledge)", async () => {
    mockAll({ me: ME_FACTORY, pos: [PENDING_PO] });

    render(wrap(<SupplierPOs />));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Mark in production/i })).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: /Acknowledge PO/i })).not.toBeInTheDocument();
  });

  it("own_logistics + acknowledged: shows Start production", async () => {
    mockAll({ me: ME_OWN, pos: [ACK_PO] });

    render(wrap(<SupplierPOs />));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Start production/i })).toBeInTheDocument();
    });
  });

  it("opens drawer with DO upload CTA when sup_status=pickup_accepted", async () => {
    mockAll({ me: ME_OWN, pos: [ACCEPTED_PO] });

    render(wrap(<SupplierPOs />));

    await waitFor(() => {
      expect(screen.getByTestId("po-card-PO-2048")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("po-card-PO-2048"));

    await waitFor(() => {
      expect(screen.getByTestId("po-drawer")).toBeInTheDocument();
    });

    expect(
      screen.getByRole("button", { name: /Upload Delivery Order/i }),
    ).toBeInTheDocument();
  });

  it("calls acknowledge mutation when Acknowledge clicked", async () => {
    mockAll({
      me: ME_OWN,
      pos: [PENDING_PO],
      onPost: () => ({ po_id: "PO-2050", sup_status: "acknowledged" }),
    });

    render(wrap(<SupplierPOs />));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Acknowledge PO/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Acknowledge PO/i }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        "/api/supplier/pos/PO-2050/acknowledge",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  it("renders Mark-Ready-for-Pickup button on in_production PO", async () => {
    mockAll({ me: ME_OWN, pos: [PROD_PO] });

    render(wrap(<SupplierPOs />));

    await waitFor(() => {
      expect(screen.getByTestId("po-card-PO-2049")).toBeInTheDocument();
    });

    expect(
      screen.getByRole("button", { name: /Mark Ready for Pickup/i }),
    ).toBeInTheDocument();
  });

  // Loo 2026-05-11 (phase-6-storage-do-upload close): supplier_mark_delivered
  // (migration 0094) now requires the signed DO file path. The modal gates the
  // upload widget on doNumber ≥ 3 (matching the storage sign-upload server
  // check) and disables Submit until the upload completes.
  it("DO upload field is gated behind a 3-char DO number", async () => {
    mockAll({ me: ME_OWN, pos: [ACCEPTED_PO] });

    render(wrap(<SupplierPOs />));

    await waitFor(() => {
      expect(screen.getByTestId("po-card-PO-2048")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("po-card-PO-2048"));

    await waitFor(() => {
      expect(screen.getByTestId("po-drawer")).toBeInTheDocument();
    });

    // Open the DO form
    fireEvent.click(
      screen.getByRole("button", { name: /Upload Delivery Order/i }),
    );

    // doNumber is empty → file picker rendered but disabled (so the
    // supplier sees the widget exists and is locked, not missing).
    expect(
      screen.getByText(/Enter the DO number above first/i),
    ).toBeInTheDocument();
    const lockedInput = screen.getByTestId("do-file-locked") as HTMLInputElement;
    expect(lockedInput).toBeInTheDocument();
    expect(lockedInput.disabled).toBe(true);

    // Typing a ≥ 3-char DO# swaps the locked stub for the real
    // DOFileUploadField (which renders an enabled <input type="file">).
    fireEvent.change(screen.getByTestId("do-number-input"), {
      target: { value: "DO-7" },
    });

    await waitFor(() => {
      expect(screen.queryByTestId("do-file-locked")).not.toBeInTheDocument();
    });
    const liveInput = screen.getByLabelText(/DO file/i) as HTMLInputElement;
    expect(liveInput.disabled).toBe(false);
    expect(
      screen.queryByText(/Enter the DO number above first/i),
    ).not.toBeInTheDocument();
  });

  // Task 9 — server enrichment fields (apps/api/src/routes/supplier/pos.ts:120).
  // The list page surfaces urgency / customer ETA / behind-schedule warning /
  // dedupe sku summary on each card + offers a sort dropdown to reorder.
  it("renders urgency badge + customer ETA + sku summary on each PO card", async () => {
    vi.mocked(apiFetch).mockImplementation(async (url: string) => {
      if (url.includes("/api/supplier/pos")) {
        return [
          {
            id: "PO-9999",
            sup_status: "in_production",
            eta_date: "2026-05-22",
            placed_at: "2026-05-08T00:00:00Z",
            expected_ready_date: null,
            do_number: null,
            supplier_id: "e1",
            sku_summary: [{ sku: "mattress:carres-original:King", qty: 5 }],
            customer_eta_min: "2026-05-20",
            urgency: "critical",
            behind_schedule: true,
            lines: [
              {
                id: "l1",
                sku: "mattress:carres-original:King",
                qty: 5,
                received_qty: 0,
              },
            ],
          },
        ];
      }
      if (url.includes("/api/supplier/me")) return ME_OWN;
      if (url.includes("/api/supplier/activity")) return [];
      if (url.includes("/api/supplier/products/demand")) return [];
      throw new Error(`unexpected fetch ${url}`);
    });

    render(wrap(<SupplierPOs />));
    await waitFor(() => {
      expect(screen.getByText(/Customer ETA/i)).toBeInTheDocument();
    });
    expect(screen.getByText("2026-05-20")).toBeInTheDocument();
    expect(screen.getByText(/Behind schedule/i)).toBeInTheDocument();
    expect(screen.getByText(/Critical/)).toBeInTheDocument();
    // sku_summary line rolls up [{sku, qty}] into "<sku> × <qty>" joined by " · ".
    expect(
      screen.getByTestId("sku-summary-PO-9999"),
    ).toHaveTextContent("mattress:carres-original:King × 5");
  });

  it("sort dropdown reorders POs by urgency vs PO ID", async () => {
    // Three POs with mixed urgency. API order is intentionally NOT
    // urgency-sorted so we can assert the client re-sorts.
    const POS = [
      {
        id: "PO-A",
        sup_status: "in_production",
        eta_date: "2026-06-01",
        placed_at: "2026-05-08T00:00:00Z",
        expected_ready_date: null,
        do_number: null,
        supplier_id: "e1",
        urgency: "normal",
        customer_eta_min: "2026-06-10",
        behind_schedule: false,
        sku_summary: [{ sku: "sofa:halo:3-seat", qty: 1 }],
        lines: [{ id: "la", sku: "sofa:halo:3-seat", qty: 1, received_qty: 0 }],
      },
      {
        id: "PO-B",
        sup_status: "in_production",
        eta_date: "2026-05-22",
        placed_at: "2026-05-08T00:00:00Z",
        expected_ready_date: null,
        do_number: null,
        supplier_id: "e1",
        urgency: "critical",
        customer_eta_min: "2026-05-20",
        behind_schedule: true,
        sku_summary: [{ sku: "mattress:carres-original:King", qty: 5 }],
        lines: [{ id: "lb", sku: "mattress:carres-original:King", qty: 5, received_qty: 0 }],
      },
      {
        id: "PO-C",
        sup_status: "in_production",
        eta_date: "2026-05-28",
        placed_at: "2026-05-08T00:00:00Z",
        expected_ready_date: null,
        do_number: null,
        supplier_id: "e1",
        urgency: "urgent",
        customer_eta_min: "2026-05-25",
        behind_schedule: false,
        sku_summary: [{ sku: "bedframe:oak:Queen", qty: 2 }],
        lines: [{ id: "lc", sku: "bedframe:oak:Queen", qty: 2, received_qty: 0 }],
      },
    ];
    mockAll({ me: ME_OWN, pos: POS });

    render(wrap(<SupplierPOs />));

    await waitFor(() => {
      expect(screen.getByTestId("po-card-PO-A")).toBeInTheDocument();
    });

    // Default sort = urgency → critical first (PO-B), then urgent (PO-C),
    // then normal (PO-A).
    let cards = screen.getAllByTestId(/^po-card-/);
    expect(cards.map((c) => c.getAttribute("data-testid"))).toEqual([
      "po-card-PO-B",
      "po-card-PO-C",
      "po-card-PO-A",
    ]);

    // Switch to PO ID sort → alphabetical (PO-A, PO-B, PO-C).
    fireEvent.change(screen.getByTestId("supplier-pos-sort"), {
      target: { value: "po_id" },
    });
    cards = screen.getAllByTestId(/^po-card-/);
    expect(cards.map((c) => c.getAttribute("data-testid"))).toEqual([
      "po-card-PO-A",
      "po-card-PO-B",
      "po-card-PO-C",
    ]);
  });

  it("Submit button disabled until DO file is uploaded", async () => {
    mockAll({ me: ME_OWN, pos: [ACCEPTED_PO] });

    render(wrap(<SupplierPOs />));

    await waitFor(() => {
      expect(screen.getByTestId("po-card-PO-2048")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("po-card-PO-2048"));

    await waitFor(() => expect(screen.getByTestId("po-drawer")).toBeInTheDocument());

    fireEvent.click(
      screen.getByRole("button", { name: /Upload Delivery Order/i }),
    );

    // Fill DO# + tick signed — but skip file upload. Submit must stay
    // disabled because doFilePath is null.
    fireEvent.change(screen.getByTestId("do-number-input"), {
      target: { value: "DO-7" },
    });
    fireEvent.click(
      screen.getByRole("checkbox", { name: /confirm goods have been handed over/i }),
    );

    expect(
      screen.getByRole("button", { name: /Submit DO · Mark Delivered/i }),
    ).toBeDisabled();
  });
});
