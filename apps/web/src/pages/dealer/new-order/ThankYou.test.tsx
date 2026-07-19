/**
 * ThankYou receipt panel — Loo 2026-07-14: the ITEMS list must show the MODEL
 * PHOTO + product name (was a bare beige tile + the raw sku code), and
 * add-on rows the human addon name. Unknown skus keep the pre-photo
 * fallback (sku code + placeholder tile).
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { CatalogResponse, Order } from "@carres/shared";
import ThankYou from "./ThankYou";

vi.mock("@/lib/auth", () => ({
  useAuth: (sel: (s: { role: string }) => unknown) => sel({ role: "dealer" }),
}));
vi.mock("@/lib/queries", () => ({
  usePwpCodesByOrder: () => ({ data: { codes: [] } }),
}));
// The download button drags in @react-pdf/renderer — irrelevant here.
vi.mock("@/components/DownloadSalesOrderButton", () => ({ default: () => null }));

const MATT = "22222222-2222-2222-2222-222222222222";
const ACC = "44444444-4444-4444-4444-444444444444";

function catalog(): CatalogResponse {
  return {
    models: [
      {
        id: MATT,
        category: "mattress",
        modelKey: "matt-x",
        name: "Matt X",
        blurb: null,
        colors: null,
        gaps: null,
        sofaMode: null,
        photoUrl: "https://cdn.test/matt-x.jpg",
      },
      {
        id: ACC,
        category: "accessory",
        modelKey: "acc-x",
        name: "Memory Foam Pillow",
        blurb: null,
        colors: null,
        gaps: null,
        sofaMode: null,
        photoUrl: null,
      },
    ],
    skus: [
      {
        id: "id-1",
        modelId: MATT,
        sku: "MATT-A",
        variant: "Queen",
        variantKind: "size",
        price: 1200,
        cost: null,
        supplierId: null,
        description: null,
      },
      {
        id: "id-2",
        modelId: ACC,
        sku: "PILLOW",
        variant: "",
        variantKind: "size",
        price: 100,
        cost: null,
        supplierId: null,
        description: "a mommm foam pillow",
      },
    ],
    sofaFabrics: [],
    addons: [{ key: "dispose-mattress", name: "Dispose old mattress", price: 80, active: true }],
    floorConfig: { id: 1, freeUpToFloor: 1, perFloorPerItem: 50 },
  };
}

function order(over: Partial<Record<string, unknown>> = {}): Order {
  return {
    id: "ord-1",
    so: 1173,
    status: "place",
    channel: "dealer",
    customer: { name: "Tang Kan Chin" },
    delivery: { date: "2026-12-04", dateTbd: false },
    paid: 720,
    lines: [
      { id: "l1", orderId: "ord-1", sku: "MATT-A", qty: 1, attrs: null, unitPrice: 1200 },
    ],
    addons: [],
    ...over,
  } as unknown as Order;
}

function renderThankYou(o: Order, cat: CatalogResponse | null) {
  return render(
    <ThankYou order={o} catalog={cat} onNewOrder={() => {}} />,
  );
}

describe("ThankYou receipt items", () => {
  it("shows the MODEL PHOTO + product name + variant (not the sku code)", () => {
    const { container } = renderThankYou(order(), catalog());
    expect(screen.getByText("Matt X")).toBeInTheDocument();
    expect(screen.queryByText("MATT-A")).not.toBeInTheDocument();
    expect(screen.getByText("Queen · qty 1")).toBeInTheDocument();
    const photo = container.querySelector(
      ".summary__item .summary__item-photo",
    ) as HTMLElement;
    expect(photo).toBeTruthy();
    expect(photo.style.backgroundImage).toContain("https://cdn.test/matt-x.jpg");
  });

  it("falls back to the sku code + placeholder tile for a sku the catalog doesn't carry", () => {
    const { container } = renderThankYou(
      order({
        lines: [
          { id: "l1", orderId: "ord-1", sku: "BOOQIT-1A", qty: 2, attrs: null, unitPrice: 500 },
        ],
      }),
      catalog(),
    );
    expect(screen.getByText("BOOQIT-1A")).toBeInTheDocument();
    const photo = container.querySelector(
      ".summary__item .summary__item-photo",
    ) as HTMLElement;
    expect(photo.style.backgroundImage).toBe("");
  });

  it("survives a missing catalog entirely (sku fallback, no crash)", () => {
    renderThankYou(order(), null);
    expect(screen.getByText("MATT-A")).toBeInTheDocument();
  });

  it("marks a server-appended free gift line FREE · GWP instead of RM0", () => {
    renderThankYou(
      order({
        lines: [
          { id: "l1", orderId: "ord-1", sku: "MATT-A", qty: 1, attrs: null, unitPrice: 1200 },
          {
            id: "l2",
            orderId: "ord-1",
            sku: "PILLOW",
            qty: 1,
            attrs: { free_gift: { giftSku: "PILLOW" } },
            unitPrice: 0,
          },
        ],
      }),
      catalog(),
    );
    expect(screen.getByText("Memory Foam Pillow")).toBeInTheDocument();
    expect(screen.getByText("qty 1 · GWP")).toBeInTheDocument();
    expect(screen.getByText("FREE")).toBeInTheDocument();
  });

  it("regroups exploded sofa-build lines into ONE model row with the spec copy (Loo 2026-07-19)", () => {
    const BOOQIT = "55555555-5555-5555-5555-555555555555";
    const cat = catalog();
    cat.models.push({
      id: BOOQIT,
      category: "sofa",
      modelKey: "5539",
      name: "Booqit",
      blurb: null,
      colors: null,
      gaps: null,
      sofaMode: null,
      photoUrl: "https://cdn.test/booqit.jpg",
    } as (typeof cat.models)[number]);
    for (const code of ["1B(LHF)", "CNR", "2A(RHF)"]) {
      cat.skus.push({
        id: `id-${code}`,
        modelId: BOOQIT,
        sku: `5539-${code}`,
        variant: code,
        variantKind: "size",
        price: 0,
        cost: null,
        supplierId: null,
        description: null,
      } as (typeof cat.skus)[number]);
    }
    const whole = { sofa_height: "24", fabric_name: "CG-011 Peach", leg_height: '4"' };
    const { container } = renderThankYou(
      order({
        lines: [
          { id: "c1", orderId: "ord-1", sku: "5539-1B(LHF)", qty: 1, unitPrice: 996.66, attrs: { ...whole, sofa_build_key: "bk", module_code: "1B(LHF)" } },
          { id: "c2", orderId: "ord-1", sku: "5539-CNR", qty: 1, unitPrice: 996.66, attrs: { ...whole, sofa_build_key: "bk", module_code: "CNR" } },
          { id: "c3", orderId: "ord-1", sku: "5539-2A(RHF)", qty: 1, unitPrice: 996.68, attrs: { ...whole, sofa_build_key: "bk", module_code: "2A(RHF)" } },
        ],
      }),
      cat,
    );
    // ONE item row named after the model, carrying the cart-style spec + build total…
    const items = container.querySelectorAll(".summary__item");
    expect(items).toHaveLength(1);
    const item = items[0] as HTMLElement;
    expect(item.textContent).toContain("Booqit");
    expect(item.textContent).toContain('1B(LHF) + CNR + 2A(RHF) · 24″ · CG-011 Peach · leg 4" · qty 1');
    expect(item.textContent).toContain("2,990");
    // …and the per-compartment split stays off the customer receipt.
    expect(screen.queryByText(/996\.6/)).not.toBeInTheDocument();
    // The hero counts the sofa as ONE piece.
    expect(screen.getByText(/Your 1 piece will arrive/)).toBeInTheDocument();
  });

  it("shows the human add-on name off the catalog (raw key as fallback)", () => {
    renderThankYou(
      order({
        addons: [
          { id: "a1", orderId: "ord-1", addonKey: "dispose-mattress", qty: 3, unitPrice: 80 },
          { id: "a2", orderId: "ord-1", addonKey: "mystery-addon", qty: 1, unitPrice: 10 },
        ],
      }),
      catalog(),
    );
    expect(screen.getByText(/Dispose old mattress\s*× 3/)).toBeInTheDocument();
    expect(screen.getByText("mystery-addon")).toBeInTheDocument();
  });
});
