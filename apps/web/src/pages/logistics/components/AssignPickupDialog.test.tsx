import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AssignPickupDialog from "./AssignPickupDialog";
import type {
  DeliveryPartnersListResponse,
  LogisticsPoListRow,
  SupplierRow,
  WarehouseListResponse,
} from "@/lib/queries";

/**
 * AssignPickupDialog — F1.A factory_pickup flow + v3-S2.4 destination
 * warehouse override.
 *
 * v3 spec §8.1 adds a "Destination warehouse *" picker after the partner
 * select. Default = current po.warehouse_id (so backward-compat is preserved
 * for callers that just want the original destination). The chosen id is
 * forwarded to the mutation; the RPC binding lands in v3-S4.
 */

let warehouseHookState: { data: WarehouseListResponse | undefined; isLoading: boolean; isError: boolean };
let partnersHookState: { data: DeliveryPartnersListResponse | undefined; isLoading: boolean; isError: boolean };
const assignMutateAsync = vi.fn().mockResolvedValue({});

vi.mock("@/lib/queries", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/queries")>("@/lib/queries");
  return {
    ...actual,
    useDeliveryPartners: () => partnersHookState,
    useLogisticsWarehouse: () => warehouseHookState,
    useAssignPickupPartnerMutation: () => ({
      mutateAsync: assignMutateAsync,
      isPending: false,
    }),
  };
});

function wrap(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{node}</QueryClientProvider>;
}

const WAREHOUSE_KL = {
  id: "22222222-2222-2222-2222-000000000001",
  name: "KL Warehouse",
  address: "Subang Jaya",
};
const WAREHOUSE_PG = {
  id: "22222222-2222-2222-2222-000000000002",
  name: "Penang Warehouse",
  address: "George Town",
};

const PARTNER_A = {
  id: "33333333-3333-3333-3333-000000000001",
  name: "GD Express",
  contact: "+60 3-9999 9999",
  zones: "Klang Valley",
};
const PARTNER_B = {
  id: "33333333-3333-3333-3333-000000000002",
  name: "JT Logistics",
  contact: "+60 3-7777 7777",
  zones: "Penang",
};

const SUPPLIER: SupplierRow = {
  id: "11111111-1111-1111-1111-000000000002",
  name: "Sofa Factory Co",
  kind: "factory_pickup",
  cat_covered: ["sofa"],
  lead_time: "10–14 days",
  contact: "+60 3-2222 2222",
};

function makePo(overrides: Partial<LogisticsPoListRow> = {}): LogisticsPoListRow {
  return {
    id: "PO-3001",
    supplier_id: SUPPLIER.id,
    warehouse_id: WAREHOUSE_KL.id,
    status: "open",
    sup_status: "ready_for_pickup",
    dl: 4321,
    dl_refs: null,
    eta_date: "2026-05-20",
    placed_at: "2026-05-04T00:00:00Z",
    purchase_order_lines: [{ sku: "sofa:nordic:3s", qty: 2, received_qty: 0 }],
    ...overrides,
  };
}

beforeEach(() => {
  assignMutateAsync.mockClear();
  warehouseHookState = {
    data: {
      warehouses: [WAREHOUSE_KL, WAREHOUSE_PG],
      byWarehouse: {},
      totalsBySku: {},
    },
    isLoading: false,
    isError: false,
  };
  partnersHookState = {
    data: { partners: [PARTNER_A, PARTNER_B] },
    isLoading: false,
    isError: false,
  };
});

describe("AssignPickupDialog (v3-S2.4 warehouse picker)", () => {
  it("renders warehouse picker with current po.warehouse_id selected by default", () => {
    render(
      wrap(
        <AssignPickupDialog
          po={makePo()}
          supplier={SUPPLIER}
          warehouse={WAREHOUSE_KL}
          onClose={() => {}}
        />,
      ),
    );
    const select = screen.getByLabelText(
      /Destination warehouse/i,
    ) as HTMLSelectElement;
    expect(select).toBeInTheDocument();
    expect(select.value).toBe(WAREHOUSE_KL.id);
    // Both warehouses are options (override is allowed)
    expect(
      screen.getByRole("option", { name: /KL Warehouse/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: /Penang Warehouse/ }),
    ).toBeInTheDocument();
  });

  it("falls back to first warehouse when po.warehouse_id is not in the list", () => {
    render(
      wrap(
        <AssignPickupDialog
          po={makePo({ warehouse_id: "ffffffff-ffff-ffff-ffff-ffffffffffff" })}
          supplier={SUPPLIER}
          warehouse={undefined}
          onClose={() => {}}
        />,
      ),
    );
    const select = screen.getByLabelText(
      /Destination warehouse/i,
    ) as HTMLSelectElement;
    expect(select.value).toBe(WAREHOUSE_KL.id);
  });

  it("allows changing warehouse selection", () => {
    render(
      wrap(
        <AssignPickupDialog
          po={makePo()}
          supplier={SUPPLIER}
          warehouse={WAREHOUSE_KL}
          onClose={() => {}}
        />,
      ),
    );
    const select = screen.getByLabelText(
      /Destination warehouse/i,
    ) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: WAREHOUSE_PG.id } });
    expect(select.value).toBe(WAREHOUSE_PG.id);
  });

  it("shows warehouse preview card when a warehouse is selected", () => {
    render(
      wrap(
        <AssignPickupDialog
          po={makePo()}
          supplier={SUPPLIER}
          warehouse={WAREHOUSE_KL}
          onClose={() => {}}
        />,
      ),
    );
    // Default = KL — preview shows KL name + address
    const preview = screen.getByTestId("assign-pickup-warehouse-preview");
    expect(preview).toHaveTextContent(WAREHOUSE_KL.name);
    expect(preview).toHaveTextContent(WAREHOUSE_KL.address!);

    // Switch to PG — preview swaps
    const select = screen.getByLabelText(
      /Destination warehouse/i,
    ) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: WAREHOUSE_PG.id } });
    expect(preview).toHaveTextContent(WAREHOUSE_PG.name);
    expect(preview).toHaveTextContent(WAREHOUSE_PG.address!);
  });

  it("shows loading text when warehouses query is loading", () => {
    warehouseHookState = {
      data: undefined,
      isLoading: true,
      isError: false,
    };
    render(
      wrap(
        <AssignPickupDialog
          po={makePo()}
          supplier={SUPPLIER}
          warehouse={WAREHOUSE_KL}
          onClose={() => {}}
        />,
      ),
    );
    expect(screen.getByText(/Loading warehouses/i)).toBeInTheDocument();
    // Submit disabled (no warehouse selected)
    expect(
      screen.getByRole("button", { name: /Assign partner/ }),
    ).toBeDisabled();
  });

  it("shows error message when warehouses query errors", () => {
    warehouseHookState = {
      data: undefined,
      isLoading: false,
      isError: true,
    };
    render(
      wrap(
        <AssignPickupDialog
          po={makePo()}
          supplier={SUPPLIER}
          warehouse={WAREHOUSE_KL}
          onClose={() => {}}
        />,
      ),
    );
    expect(
      screen.getByText(/Couldn.t load warehouses/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Assign partner/ }),
    ).toBeDisabled();
  });

  it("submit button is disabled until both partner AND warehouse are selected", () => {
    // No partners → button disabled
    partnersHookState = {
      data: { partners: [] },
      isLoading: false,
      isError: false,
    };
    render(
      wrap(
        <AssignPickupDialog
          po={makePo()}
          supplier={SUPPLIER}
          warehouse={WAREHOUSE_KL}
          onClose={() => {}}
        />,
      ),
    );
    expect(
      screen.getByRole("button", { name: /Assign partner/ }),
    ).toBeDisabled();
  });

  it("submit calls mutation with both partnerId and warehouseId", async () => {
    render(
      wrap(
        <AssignPickupDialog
          po={makePo()}
          supplier={SUPPLIER}
          warehouse={WAREHOUSE_KL}
          onClose={() => {}}
        />,
      ),
    );
    // Override the warehouse to PG
    fireEvent.change(screen.getByLabelText(/Destination warehouse/i), {
      target: { value: WAREHOUSE_PG.id },
    });
    // Click the modal's primary button (the only "Assign partner" in this render)
    fireEvent.click(
      screen.getByRole("button", { name: /Assign partner/ }),
    );
    await waitFor(() => {
      expect(assignMutateAsync).toHaveBeenCalledTimes(1);
    });
    expect(assignMutateAsync.mock.calls[0][0]).toEqual({
      partnerId: PARTNER_A.id,
      warehouseId: WAREHOUSE_PG.id,
    });
  });

  it("submit sends po.warehouse_id when user did not change selection (default-case)", async () => {
    render(
      wrap(
        <AssignPickupDialog
          po={makePo()}
          supplier={SUPPLIER}
          warehouse={WAREHOUSE_KL}
          onClose={() => {}}
        />,
      ),
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Assign partner/ }),
    );
    await waitFor(() => {
      expect(assignMutateAsync).toHaveBeenCalledTimes(1);
    });
    // FE always sends the chosen warehouseId, even if it's the same as po.warehouse_id.
    expect(assignMutateAsync.mock.calls[0][0]).toEqual({
      partnerId: PARTNER_A.id,
      warehouseId: WAREHOUSE_KL.id,
    });
  });
});

// ---------------------------------------------------------------------------
// v3-S3.4 — Outsource toggle (spec §8.2 + §8.3 Print DO toast).
// ---------------------------------------------------------------------------
describe("AssignPickupDialog (v3-S3.4 outsource toggle)", () => {
  it("partner select includes a synthetic '+ Outsource (one-time)' option", () => {
    render(
      wrap(
        <AssignPickupDialog
          po={makePo()}
          supplier={SUPPLIER}
          warehouse={WAREHOUSE_KL}
          onClose={() => {}}
        />,
      ),
    );
    // The synthetic option appears at the end of the partner select.
    expect(
      screen.getByRole("option", { name: /\+ Outsource \(one-time\)/i }),
    ).toBeInTheDocument();
  });

  it("selecting Outsource hides partner preview and shows outsource form fields", () => {
    render(
      wrap(
        <AssignPickupDialog
          po={makePo()}
          supplier={SUPPLIER}
          warehouse={WAREHOUSE_KL}
          onClose={() => {}}
        />,
      ),
    );
    // Default = partner — preview card visible
    expect(screen.getByText(PARTNER_A.name)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Delivery partner/i), {
      target: { value: "__OUTSOURCE__" },
    });

    // Partner preview card is gone.
    expect(screen.queryByText(PARTNER_A.contact)).not.toBeInTheDocument();
    // Outsource form fields appear.
    expect(
      screen.getByLabelText(/Outsource partner name/i),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(/Contact \(phone\/email\)/i),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Zones/i)).toBeInTheDocument();
  });

  it("Submit disabled until outsource name + contact are both filled", () => {
    render(
      wrap(
        <AssignPickupDialog
          po={makePo()}
          supplier={SUPPLIER}
          warehouse={WAREHOUSE_KL}
          onClose={() => {}}
        />,
      ),
    );
    fireEvent.change(screen.getByLabelText(/Delivery partner/i), {
      target: { value: "__OUTSOURCE__" },
    });
    const submit = screen.getByRole("button", { name: /Assign partner/ });
    expect(submit).toBeDisabled();

    // Fill name only — still disabled.
    fireEvent.change(screen.getByLabelText(/Outsource partner name/i), {
      target: { value: "Ah Beng Lorry" },
    });
    expect(submit).toBeDisabled();

    // Fill contact too — now enabled.
    fireEvent.change(screen.getByLabelText(/Contact \(phone\/email\)/i), {
      target: { value: "+60 12-345 6789" },
    });
    expect(submit).not.toBeDisabled();
  });

  it("submit on outsource path sends correct payload (no partnerId)", async () => {
    render(
      wrap(
        <AssignPickupDialog
          po={makePo()}
          supplier={SUPPLIER}
          warehouse={WAREHOUSE_KL}
          onClose={() => {}}
        />,
      ),
    );
    fireEvent.change(screen.getByLabelText(/Delivery partner/i), {
      target: { value: "__OUTSOURCE__" },
    });
    fireEvent.change(screen.getByLabelText(/Outsource partner name/i), {
      target: { value: "Ah Beng Lorry" },
    });
    fireEvent.change(screen.getByLabelText(/Contact \(phone\/email\)/i), {
      target: { value: "+60 12-345 6789" },
    });
    fireEvent.change(screen.getByLabelText(/Zones/i), {
      target: { value: "Klang Valley" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Assign partner/ }));
    await waitFor(() => {
      expect(assignMutateAsync).toHaveBeenCalledTimes(1);
    });
    expect(assignMutateAsync.mock.calls[0][0]).toEqual({
      outsourcePartnerName: "Ah Beng Lorry",
      outsourcePartnerContact: "+60 12-345 6789",
      outsourcePartnerZones: "Klang Valley",
      warehouseId: WAREHOUSE_KL.id,
    });
  });

  it("submit on outsource path with empty zones sends payload without zones", async () => {
    render(
      wrap(
        <AssignPickupDialog
          po={makePo()}
          supplier={SUPPLIER}
          warehouse={WAREHOUSE_KL}
          onClose={() => {}}
        />,
      ),
    );
    fireEvent.change(screen.getByLabelText(/Delivery partner/i), {
      target: { value: "__OUTSOURCE__" },
    });
    fireEvent.change(screen.getByLabelText(/Outsource partner name/i), {
      target: { value: "Ah Beng Lorry" },
    });
    fireEvent.change(screen.getByLabelText(/Contact \(phone\/email\)/i), {
      target: { value: "+60 12-345 6789" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Assign partner/ }));
    await waitFor(() => {
      expect(assignMutateAsync).toHaveBeenCalledTimes(1);
    });
    // Zones omitted entirely (empty string would fail zod's `.min(1)` for the
    // outsource trio refine; the FE sends only the 3 required fields).
    expect(assignMutateAsync.mock.calls[0][0]).toEqual({
      outsourcePartnerName: "Ah Beng Lorry",
      outsourcePartnerContact: "+60 12-345 6789",
      warehouseId: WAREHOUSE_KL.id,
    });
  });

  it("switching back from Outsource to a partner hides the outsource form", () => {
    render(
      wrap(
        <AssignPickupDialog
          po={makePo()}
          supplier={SUPPLIER}
          warehouse={WAREHOUSE_KL}
          onClose={() => {}}
        />,
      ),
    );
    fireEvent.change(screen.getByLabelText(/Delivery partner/i), {
      target: { value: "__OUTSOURCE__" },
    });
    expect(
      screen.getByLabelText(/Outsource partner name/i),
    ).toBeInTheDocument();

    // Switch back to a real partner.
    fireEvent.change(screen.getByLabelText(/Delivery partner/i), {
      target: { value: PARTNER_B.id },
    });
    expect(
      screen.queryByLabelText(/Outsource partner name/i),
    ).not.toBeInTheDocument();
    // Partner preview reappears.
    expect(screen.getByText(PARTNER_B.name)).toBeInTheDocument();
  });
});
