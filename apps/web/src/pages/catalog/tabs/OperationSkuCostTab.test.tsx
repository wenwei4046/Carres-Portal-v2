/**
 * OperationSkuCostTab (0226) — the Operation Catalog costing view of the
 * shared SKU list. Covers:
 *  - renders code/description/product/category/size + COST column; NO selling
 *    price, NO PWP, NO margin anywhere
 *  - "not set" placeholder when cost is null
 *  - Edit Costs toggle → inline cost input commits { cost } via
 *    usePatchCatalogSku; blank clears to null
 *  - category chip + search filtering
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { CatalogResponse, ProductModelDto, ProductSkuDto } from "@carres/shared";
import OperationSkuCostTab from "./OperationSkuCostTab";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const mockPatchMutate = vi.fn();
const mockUpsertOffer = vi.fn();
const mockRemoveOffer = vi.fn();
let mockRole: string | null = "principal";
let mockOffers: Array<{
  supplierId: string;
  supplierName: string | null;
  supplierCode: string | null;
  price: number | null;
  pwpPrice: number | null;
  pricesBySize?: Record<string, number> | null;
  updatedAt: string;
}> = [];
vi.mock("@/lib/auth", () => ({
  useAuth: (selector: (s: { role: string | null }) => unknown) => selector({ role: mockRole }),
}));
vi.mock("@/lib/queries", () => ({
  /* 0388 - the offers strip. A mutable roster so a test can seed what the
   * lazy fetch would have returned. */
  useSkuSupplierOffers: () => ({ data: { offers: mockOffers }, isLoading: false }),
  useUpsertSkuSupplierOffer: () => ({ mutate: mockUpsertOffer, isPending: false }),
  useDeleteSkuSupplierOffer: () => ({ mutate: mockRemoveOffer, isPending: false }),
  /* 2026-08-24 - the supplier picker/filter/column reads the roster through
   * this hook; one named supplier is enough to pin the render path. */
  useOperationSuppliers: () => ({
    data: { suppliers: [{ id: "00000000-0000-4000-8000-0000000000s1".replace("s","a"), name: "Hookka" }] },
    isLoading: false,
  }),
  usePatchCatalogSku: () => ({ mutate: mockPatchMutate, isPending: false }),
}));

const MODEL_MAT: ProductModelDto = {
  id: "m-mat",
  category: "mattress",
  modelKey: "cloud",
  name: "Carres Cloud",
  blurb: null,
  colors: null,
  gaps: null,
  sofaMode: null,
};

const MODEL_SOFA: ProductModelDto = {
  id: "m-sofa",
  category: "sofa",
  modelKey: "luna",
  name: "Luna Sofa",
  blurb: null,
  colors: null,
  gaps: null,
  sofaMode: "preset",
};

const SKU_COST_SET: ProductSkuDto = {
  id: "s1",
  modelId: "m-mat",
  sku: "CLOUD-KING",
  variant: "King",
  variantKind: "size",
  price: 3500,
  cost: 2100,
  supplierId: null,
};

const SKU_COST_NULL: ProductSkuDto = {
  id: "s2",
  modelId: "m-sofa",
  sku: "LUNA-3S",
  variant: "3-seater",
  variantKind: "preset",
  price: 4200,
  cost: null,
  supplierId: null,
};

function makeCatalog(skus: ProductSkuDto[]): CatalogResponse {
  return {
    models: [MODEL_MAT, MODEL_SOFA],
    skus,
    sofaFabrics: [],
    addons: [],
    floorConfig: { id: 1, freeUpToFloor: 1, perFloorPerItem: 50 },
  };
}

beforeEach(() => {
  mockPatchMutate.mockReset();
});

describe("OperationSkuCostTab — costing view", () => {
  /* ⭐ THIS TEST WAS INVERTED, NOT DELETED — owner ruling 2026-08-26 (Jess).
     It used to assert the opposite: "renders the COST column and NEVER the
     selling price / PWP / margin". That pinned a real ruling — the two catalog
     doors were deliberately different surfaces, structure on one, costing on
     the other. Jess ended that: *"the 2 catalogues should align"*, and on
     price specifically: *"it makes sense to let them see and not change it,
     cuz it avoids data pollution"*.

     So the assertion moves from "the number is absent" to "the number is
     there and the CELL DOES NOT OPEN", which is the thing that actually
     protects the price — and the thing the server enforces anyway. The
     read-only half is asserted in its own test below. */
  it("shows cost AND the selling price, PWP and margin on one row", () => {
    render(<OperationSkuCostTab catalog={makeCatalog([SKU_COST_SET, SKU_COST_NULL])} />);
    for (const header of ["Cost", "Price", "PWP Price", "Margin"]) {
      expect(screen.getByText(header)).toBeInTheDocument();
    }
    expect(screen.getByTestId("opcost-cost-CLOUD-KING").textContent).toContain("2,100.00");
    expect(screen.getByTestId("opcost-price-CLOUD-KING").textContent).toContain("3,500.00");
    // Null cost → muted "not set", and margin cannot be computed from it.
    expect(screen.getByTestId("opcost-cost-LUNA-3S").textContent).toContain("not set");
    expect(screen.getByTestId("opcost-margin-LUNA-3S").textContent).toContain("—");
    // 3500 − 2100 = 1400 → 40%. Derived, never stored (Law D).
    expect(screen.getByTestId("opcost-margin-CLOUD-KING").textContent).toContain("40%");
  });

  it("⭐ never opens the price cell for a non-principal, even in edit mode", () => {
    /* The whole of Jess's "see and not change it". The API refuses the write
       either way (`gateSkuPatchPriceCost`) and a DB trigger refuses it under
       that — this asserts the UI does not offer a door the server will slam. */
    mockRole = "operation";
    render(<OperationSkuCostTab catalog={makeCatalog([SKU_COST_SET])} />);
    fireEvent.click(screen.getByTestId("opcost-edit-costs"));
    /* COST still opens — 0226 gave operation that standing, and this ruling
       did not take it away. */
    expect(screen.getByLabelText("CLOUD-KING cost")).toBeInTheDocument();
    expect(screen.queryByLabelText("CLOUD-KING price")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("CLOUD-KING PWP price")).not.toBeInTheDocument();
    /* …and the number is still READ, which is the half Jess asked for. */
    expect(screen.getByTestId("opcost-price-CLOUD-KING").textContent).toContain("3,500.00");
    expect(screen.getByTestId("opcost-price-lock-hint")).toBeInTheDocument();
    mockRole = "principal";
  });

  it("opens the price and PWP cells for the principal", () => {
    render(<OperationSkuCostTab catalog={makeCatalog([SKU_COST_SET])} />);
    fireEvent.click(screen.getByTestId("opcost-edit-costs"));
    const price = screen.getByLabelText("CLOUD-KING price");
    fireEvent.change(price, { target: { value: "3600" } });
    fireEvent.blur(price);
    expect(mockPatchMutate.mock.calls[0][0]).toEqual({ id: "s1", patch: { price: 3600 } });
    const pwp = screen.getByLabelText("CLOUD-KING PWP price");
    fireEvent.change(pwp, { target: { value: "3150" } });
    fireEvent.blur(pwp);
    expect(mockPatchMutate.mock.calls[1][0]).toEqual({ id: "s1", patch: { pwpPrice: 3150 } });
    /* Blanking a PWP that is ALREADY unset writes nothing — ≤0 and null both
       mean NOT SET (0186), so there is no change to record. */
    fireEvent.change(pwp, { target: { value: "" } });
    fireEvent.blur(pwp);
    expect(mockPatchMutate).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId("opcost-price-lock-hint")).not.toBeInTheDocument();
  });

  /* ⭐ Jess's literal ask: "if it available [at the admin catalog] to add stuff
     into catalog then it should be doable from operations' side catalog as
     well". The doors are the same components, so a file exported here imports
     through the admin dialog and vice versa. */
  it("carries the same add / import / export doors as the admin catalog", () => {
    render(<OperationSkuCostTab catalog={makeCatalog([SKU_COST_SET])} />);
    expect(screen.getByTestId("opcost-new-sku").textContent).toContain("New SKU");
    expect(screen.getByTestId("opcost-import")).toBeInTheDocument();
    expect(screen.getByTestId("opcost-export")).toBeInTheDocument();
    expect(screen.getByTestId("opcost-supplier-filter")).toBeInTheDocument();
    /* 🟡 Bulk delete is the ONE gap left open on purpose — destroying catalog
       rows was never asked for by name, and "align" is not a yes to it. */
    expect(screen.queryByTestId("opcost-bulk-delete")).not.toBeInTheDocument();
  });

  it("Edit Costs → inline input commits { cost } via usePatchCatalogSku", () => {
    render(<OperationSkuCostTab catalog={makeCatalog([SKU_COST_SET])} />);
    fireEvent.click(screen.getByTestId("opcost-edit-costs"));
    const input = screen.getByLabelText("CLOUD-KING cost");
    fireEvent.change(input, { target: { value: "2250" } });
    fireEvent.blur(input);
    expect(mockPatchMutate).toHaveBeenCalledTimes(1);
    expect(mockPatchMutate.mock.calls[0][0]).toEqual({
      id: "s1",
      patch: { cost: 2250 },
    });
  });

  it("blank cost input clears to null", () => {
    render(<OperationSkuCostTab catalog={makeCatalog([SKU_COST_SET])} />);
    fireEvent.click(screen.getByTestId("opcost-edit-costs"));
    const input = screen.getByLabelText("CLOUD-KING cost");
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);
    expect(mockPatchMutate).toHaveBeenCalledTimes(1);
    expect(mockPatchMutate.mock.calls[0][0]).toEqual({
      id: "s1",
      patch: { cost: null },
    });
  });

  it("unchanged cost on blur → no PATCH", () => {
    render(<OperationSkuCostTab catalog={makeCatalog([SKU_COST_SET])} />);
    fireEvent.click(screen.getByTestId("opcost-edit-costs"));
    const input = screen.getByLabelText("CLOUD-KING cost");
    fireEvent.blur(input); // defaultValue 2100 untouched
    expect(mockPatchMutate).not.toHaveBeenCalled();
  });

  it("category chips + search filter the list", () => {
    render(<OperationSkuCostTab catalog={makeCatalog([SKU_COST_SET, SKU_COST_NULL])} />);
    expect(screen.getByTestId("opcost-row-CLOUD-KING")).toBeInTheDocument();
    expect(screen.getByTestId("opcost-row-LUNA-3S")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sofa" }));
    expect(screen.queryByTestId("opcost-row-CLOUD-KING")).not.toBeInTheDocument();
    expect(screen.getByTestId("opcost-row-LUNA-3S")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "All" }));
    fireEvent.change(screen.getByTestId("opcost-sku-search"), { target: { value: "cloud" } });
    expect(screen.getByTestId("opcost-row-CLOUD-KING")).toBeInTheDocument();
    expect(screen.queryByTestId("opcost-row-LUNA-3S")).not.toBeInTheDocument();
  });
});

/**
 * SUPPLIER EDITING ON THE COST TAB (2026-08-24) — the buyer keys a quotation
 * here, so the two supplier facts are editable here: WHO supplies it
 * (supplier_id via the roster picker — never a typed name, Law A/D) and THEIR
 * code for it (supplier_code). Neither is money, so neither is 0175-locked —
 * operation writes both, the same standing 0226 gave it over cost.
 */
describe("supplier editing (2026-08-24)", () => {
  const HOOKKA_ID = "00000000-0000-4000-8000-0000000000a1";

  it("view mode shows name · their-code; absent shows the muted dash", () => {
    render(
      <OperationSkuCostTab
        catalog={makeCatalog([
          { ...SKU_COST_SET, supplierId: HOOKKA_ID, supplierCode: "HK-KING" },
        ])}
      />,
    );
    const cell = screen.getByTestId("opcost-supplier-CLOUD-KING");
    expect(cell.textContent).toContain("Hookka");
    expect(cell.textContent).toContain("HK-KING");
  });

  it("edit mode: picking a supplier commits { supplierId } — the FK, never a name", () => {
    render(<OperationSkuCostTab catalog={makeCatalog([SKU_COST_SET])} />);
    fireEvent.click(screen.getByTestId("opcost-edit-costs"));
    fireEvent.change(screen.getByTestId("opcost-supplier-pick-CLOUD-KING"), {
      target: { value: HOOKKA_ID },
    });
    expect(mockPatchMutate).toHaveBeenCalledTimes(1);
    expect(mockPatchMutate.mock.calls[0][0]).toEqual({
      id: "s1",
      patch: { supplierId: HOOKKA_ID },
    });
  });

  it("edit mode: 'No supplier' commits { supplierId: null } — a real bucket (0171)", () => {
    render(
      <OperationSkuCostTab catalog={makeCatalog([{ ...SKU_COST_SET, supplierId: HOOKKA_ID }])} />,
    );
    fireEvent.click(screen.getByTestId("opcost-edit-costs"));
    fireEvent.change(screen.getByTestId("opcost-supplier-pick-CLOUD-KING"), {
      target: { value: "" },
    });
    expect(mockPatchMutate.mock.calls[0][0]).toEqual({
      id: "s1",
      patch: { supplierId: null },
    });
  });

  it("edit mode: typing their code commits { supplierCode } on blur; blank clears to null", () => {
    render(
      <OperationSkuCostTab
        catalog={makeCatalog([{ ...SKU_COST_SET, supplierCode: "OLD-1" }])}
      />,
    );
    fireEvent.click(screen.getByTestId("opcost-edit-costs"));
    const input = screen.getByTestId("opcost-supplier-code-CLOUD-KING");
    fireEvent.change(input, { target: { value: "HK-KING" } });
    fireEvent.blur(input);
    expect(mockPatchMutate.mock.calls[0][0]).toEqual({
      id: "s1",
      patch: { supplierCode: "HK-KING" },
    });
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.blur(input);
    expect(mockPatchMutate.mock.calls[1][0]).toEqual({
      id: "s1",
      patch: { supplierCode: null },
    });
  });

  it("NEGATIVE CONTROL: unchanged values commit nothing", () => {
    render(
      <OperationSkuCostTab
        catalog={makeCatalog([{ ...SKU_COST_SET, supplierId: HOOKKA_ID, supplierCode: "HK-KING" }])}
      />,
    );
    fireEvent.click(screen.getByTestId("opcost-edit-costs"));
    fireEvent.change(screen.getByTestId("opcost-supplier-pick-CLOUD-KING"), {
      target: { value: HOOKKA_ID },
    });
    const input = screen.getByTestId("opcost-supplier-code-CLOUD-KING");
    fireEvent.blur(input);
    expect(mockPatchMutate).not.toHaveBeenCalled();
  });
});

/**
 * ⭐ 0388 — EVERY SUPPLIER'S PAPER FOR ONE SKU (YH, 2026-08-26).
 *
 * The measured case: both Hookkas supply some of the same bedframes, and the
 * single supplier slot meant the second company's code and prices had nowhere
 * to be written. The strip records offers; the slot stays the routing truth.
 */
describe("supplier offers strip (0388)", () => {
  beforeEach(() => {
    mockRole = "principal";
    mockOffers = [];
    mockUpsertOffer.mockReset();
    mockRemoveOffer.mockReset();
  });

  function open() {
    render(<OperationSkuCostTab catalog={makeCatalog([SKU_COST_SET])} />);
    fireEvent.click(screen.getByTestId("opcost-offers-toggle-CLOUD-KING"));
  }

  it("opens per row and says plainly when nothing is recorded", () => {
    open();
    expect(screen.getByTestId("opcost-offers-CLOUD-KING")).toBeInTheDocument();
    expect(screen.getByText("No offers recorded")).toBeInTheDocument();
  });

  it("lists each supplier's own code and prices", () => {
    mockOffers = [
      {
        supplierId: "sup-hki",
        supplierName: "Hookka Industries",
        supplierCode: "1007-(K)",
        price: 550,
        pwpPrice: 495,
        updatedAt: "2026-08-26T00:00:00Z",
      },
    ];
    open();
    const strip = screen.getByTestId("opcost-offers-CLOUD-KING");
    expect(strip.textContent).toContain("Hookka Industries");
    expect(strip.textContent).toContain("1007-(K)");
    expect(strip.textContent).toContain("RM 550.00");
    expect(strip.textContent).toContain("PWP RM 495.00");
  });

  it("⭐ saves an offer with the supplier's code and prices", () => {
    open();
    fireEvent.change(screen.getByTestId("opcost-offer-supplier-CLOUD-KING"), {
      target: { value: "00000000-0000-4000-8000-0000000000a1" },
    });
    fireEvent.change(screen.getByTestId("opcost-offer-code-CLOUD-KING"), {
      target: { value: "  1007-(K)  " },
    });
    fireEvent.change(screen.getByTestId("opcost-offer-price-CLOUD-KING"), {
      target: { value: "550" },
    });
    fireEvent.click(screen.getByTestId("opcost-offer-save-CLOUD-KING"));
    expect(mockUpsertOffer).toHaveBeenCalledWith(
      expect.objectContaining({
        skuId: "s1",
        supplierId: "00000000-0000-4000-8000-0000000000a1",
        supplierCode: "1007-(K)",
        price: 550,
        // Blank PWP is NOT QUOTED — null, never zero half-reading as a price.
        pwpPrice: null,
      }),
      expect.anything(),
    );
  });

  it("⭐ shows no write controls to a role the price lock would refuse", () => {
    mockRole = "operation";
    mockOffers = [
      {
        supplierId: "sup-hki",
        supplierName: "Hookka Industries",
        supplierCode: "1007-(K)",
        price: 550,
        pwpPrice: null,
        updatedAt: "2026-08-26T00:00:00Z",
      },
    ];
    open();
    // Operation READS the offers — that is the point of recording them —
    // but the save row and the remove control are principal-only (0175/0186).
    expect(screen.getByText("Hookka Industries")).toBeInTheDocument();
    expect(screen.queryByTestId("opcost-offer-save-CLOUD-KING")).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("opcost-offer-remove-CLOUD-KING-sup-hki"),
    ).not.toBeInTheDocument();
  });

  it("removes one supplier's offer without touching the slot", () => {
    mockOffers = [
      {
        supplierId: "sup-hki",
        supplierName: "Hookka Industries",
        supplierCode: null,
        price: null,
        pwpPrice: null,
        updatedAt: "2026-08-26T00:00:00Z",
      },
    ];
    open();
    fireEvent.click(screen.getByTestId("opcost-offer-remove-CLOUD-KING-sup-hki"));
    expect(mockRemoveOffer).toHaveBeenCalledWith(
      expect.objectContaining({ skuId: "s1", supplierId: "sup-hki" }),
      expect.anything(),
    );
    // The slot writer was never called — an offer is not the routing truth.
    expect(mockPatchMutate).not.toHaveBeenCalled();
  });
});

/**
 * ⭐ A CODE-TYPO FIX MUST NOT WIPE THE PRICE (YH, 2026-08-26).
 *
 * A re-save writes the WHOLE offer, so correcting a supplier code with blank
 * price boxes silently erased the recorded price — blank meant "erase" while
 * reading as "keep". Picking a supplier who already has an offer now loads
 * that offer into the boxes, and the save writes back exactly what is shown.
 */
describe("offers strip — editing an existing offer starts from what is on file", () => {
  beforeEach(() => {
    mockRole = "principal";
    mockUpsertOffer.mockReset();
    mockOffers = [
      {
        supplierId: "00000000-0000-4000-8000-0000000000a1",
        supplierName: "Hookka",
        supplierCode: "1007-(K)",
        price: 550,
        pwpPrice: 495,
        updatedAt: "2026-08-26T00:00:00Z",
      },
    ];
  });

  it("⭐ prefills code, price and PWP when that supplier is picked", () => {
    render(<OperationSkuCostTab catalog={makeCatalog([SKU_COST_SET])} />);
    fireEvent.click(screen.getByTestId("opcost-offers-toggle-CLOUD-KING"));
    fireEvent.change(screen.getByTestId("opcost-offer-supplier-CLOUD-KING"), {
      target: { value: "00000000-0000-4000-8000-0000000000a1" },
    });
    expect((screen.getByTestId("opcost-offer-code-CLOUD-KING") as HTMLInputElement).value).toBe(
      "1007-(K)",
    );
    expect((screen.getByTestId("opcost-offer-price-CLOUD-KING") as HTMLInputElement).value).toBe(
      "550",
    );
    expect((screen.getByTestId("opcost-offer-pwp-CLOUD-KING") as HTMLInputElement).value).toBe(
      "495",
    );
  });

  it("⭐ fixing only the code keeps the recorded prices", () => {
    render(<OperationSkuCostTab catalog={makeCatalog([SKU_COST_SET])} />);
    fireEvent.click(screen.getByTestId("opcost-offers-toggle-CLOUD-KING"));
    fireEvent.change(screen.getByTestId("opcost-offer-supplier-CLOUD-KING"), {
      target: { value: "00000000-0000-4000-8000-0000000000a1" },
    });
    fireEvent.change(screen.getByTestId("opcost-offer-code-CLOUD-KING"), {
      target: { value: "1007-(Q)" },
    });
    fireEvent.click(screen.getByTestId("opcost-offer-save-CLOUD-KING"));
    expect(mockUpsertOffer).toHaveBeenCalledWith(
      expect.objectContaining({ supplierCode: "1007-(Q)", price: 550, pwpPrice: 495 }),
      expect.anything(),
    );
  });

  it("clears the boxes when switching to a supplier with no offer yet", () => {
    render(<OperationSkuCostTab catalog={makeCatalog([SKU_COST_SET])} />);
    fireEvent.click(screen.getByTestId("opcost-offers-toggle-CLOUD-KING"));
    const pick = screen.getByTestId("opcost-offer-supplier-CLOUD-KING");
    fireEvent.change(pick, { target: { value: "00000000-0000-4000-8000-0000000000a1" } });
    fireEvent.change(pick, { target: { value: "" } });
    // A stale prefill travelling to a DIFFERENT supplier would write Hookka's
    // numbers onto someone else's offer.
    expect((screen.getByTestId("opcost-offer-price-CLOUD-KING") as HTMLInputElement).value).toBe(
      "",
    );
  });
});

/**
 * ⭐ 0389 — A SOFA OFFER PRICES EACH SEAT HEIGHT (YH, 2026-08-26).
 *
 * Xammar modules come from BOTH Hookkas at 24"/28"/30". The slot supplier's
 * heights live on the SKU (0204 grid); the OTHER supplier's offer carried one
 * flat price — their per-height quote had nowhere to go. Sofa offers now key
 * one box per active height; everything else keeps the flat box.
 */
describe("offers strip — per-seat-height sofa offers (0389)", () => {
  beforeEach(() => {
    mockRole = "principal";
    mockOffers = [];
    mockUpsertOffer.mockReset();
  });

  function openSofaStrip() {
    render(<OperationSkuCostTab catalog={makeCatalog([SKU_COST_NULL])} />);
    fireEvent.click(screen.getByTestId("opcost-offers-toggle-LUNA-3S"));
  }

  it("⭐ shows one box per height for a sofa SKU, and no flat price box", () => {
    openSofaStrip();
    expect(screen.getByTestId("opcost-offer-height-LUNA-3S-24")).toBeInTheDocument();
    expect(screen.getByTestId("opcost-offer-height-LUNA-3S-28")).toBeInTheDocument();
    expect(screen.queryByTestId("opcost-offer-price-LUNA-3S")).not.toBeInTheDocument();
  });

  it("keeps the flat price box for a non-sofa SKU", () => {
    render(<OperationSkuCostTab catalog={makeCatalog([SKU_COST_SET])} />);
    fireEvent.click(screen.getByTestId("opcost-offers-toggle-CLOUD-KING"));
    expect(screen.getByTestId("opcost-offer-price-CLOUD-KING")).toBeInTheDocument();
    expect(screen.queryByTestId("opcost-offer-height-CLOUD-KING-24")).not.toBeInTheDocument();
  });

  it("⭐ saves the typed heights as a {height → RM} map, blanks not quoted", () => {
    openSofaStrip();
    fireEvent.change(screen.getByTestId("opcost-offer-supplier-LUNA-3S"), {
      target: { value: "00000000-0000-4000-8000-0000000000a1" },
    });
    fireEvent.change(screen.getByTestId("opcost-offer-height-LUNA-3S-24"), {
      target: { value: "992.25" },
    });
    fireEvent.change(screen.getByTestId("opcost-offer-height-LUNA-3S-28"), {
      target: { value: "1039.5" },
    });
    fireEvent.click(screen.getByTestId("opcost-offer-save-LUNA-3S"));
    expect(mockUpsertOffer).toHaveBeenCalledWith(
      expect.objectContaining({
        pricesBySize: { "24": 992.25, "28": 1039.5 },
      }),
      expect.anything(),
    );
  });

  it("prefills the height boxes from an existing offer's map", () => {
    mockOffers = [
      {
        supplierId: "00000000-0000-4000-8000-0000000000a1",
        supplierName: "Hookka",
        supplierCode: "XAM-3S",
        price: null,
        pwpPrice: null,
        pricesBySize: { "24": 992.25, "30": 1086.75 },
        updatedAt: "2026-08-26T00:00:00Z",
      },
    ];
    openSofaStrip();
    fireEvent.change(screen.getByTestId("opcost-offer-supplier-LUNA-3S"), {
      target: { value: "00000000-0000-4000-8000-0000000000a1" },
    });
    expect((screen.getByTestId("opcost-offer-height-LUNA-3S-24") as HTMLInputElement).value).toBe(
      "992.25",
    );
    expect((screen.getByTestId("opcost-offer-height-LUNA-3S-30") as HTMLInputElement).value).toBe(
      "1086.75",
    );
    expect((screen.getByTestId("opcost-offer-height-LUNA-3S-28") as HTMLInputElement).value).toBe(
      "",
    );
  });

  it("lists a per-height offer height by height, not as a flat dash", () => {
    mockOffers = [
      {
        supplierId: "sup-hki",
        supplierName: "Hookka Industries",
        supplierCode: null,
        price: null,
        pwpPrice: null,
        pricesBySize: { "24": 992.25, "28": 1039.5 },
        updatedAt: "2026-08-26T00:00:00Z",
      },
    ];
    openSofaStrip();
    const strip = screen.getByTestId("opcost-offers-LUNA-3S");
    expect(strip.textContent).toContain("24″ RM 992.25");
    expect(strip.textContent).toContain("28″ RM 1039.50");
  });
});
