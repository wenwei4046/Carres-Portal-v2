/**
 * PosConfigurePage — cart-line EDIT mode (Loo 2026-07-12). The ✎ pencil mounts
 * this page with `editLine`; every stored pick must come back prefilled (size /
 * qty / gap / divan / leg / fabric) and the CTA reads "Update item". The emit
 * itself is the caller's replace — the page just produces the same DraftLine
 * contract as the add flow.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type {
  CatalogFabricDto,
  CatalogOptionPoolDto,
  ProductModelDto,
  ProductSkuDto,
} from "@carres/shared";
import type { DraftLine } from "../new-order/draft";
import PosConfigurePage from "./PosConfigurePage";

function bedModel(over: Partial<ProductModelDto> = {}): ProductModelDto {
  return {
    id: "m-bed",
    category: "bedframe",
    modelKey: "kayu",
    name: "Kayu",
    blurb: null,
    colors: null,
    gaps: ['10"', '12"'],
    sofaMode: null,
    ...over,
  } as ProductModelDto;
}

const bedSkus: ProductSkuDto[] = [
  { id: "b1", modelId: "m-bed", sku: "KAYU-Q", variant: "Queen", variantKind: "size", price: 1590, cost: null, supplierId: null } as ProductSkuDto,
  { id: "b2", modelId: "m-bed", sku: "KAYU-K", variant: "King", variantKind: "size", price: 1990, cost: null, supplierId: null } as ProductSkuDto,
];

let poolSeq = 0;
function poolRow(
  pool: CatalogOptionPoolDto["pool"],
  value: string,
  surcharge: number | null,
): CatalogOptionPoolDto {
  poolSeq += 1;
  return {
    id: `00000000-0000-4000-8000-${String(poolSeq).padStart(12, "0")}`,
    pool,
    value,
    label: null,
    dimensions: null,
    surcharge,
    active: true,
    sortOrder: poolSeq,
  };
}

const POOLS: CatalogOptionPoolDto[] = [
  poolRow("divan_height", '8"', null),
  poolRow("divan_height", '10"', 125),
  poolRow("gap", '10"', null),
  poolRow("gap", '12"', null),
  poolRow("bedframe_leg_height", '4"', 60),
];

const FABRICS: CatalogFabricDto[] = [
  {
    id: "f1",
    fabricCode: "PC151-01",
    series: null,
    description: "Oat weave",
    supplierCode: null,
    sofaTier: "PRICE_1",
    bedframeTier: "PRICE_2",
    active: true,
    sortOrder: 1,
  },
];

/** A bed line as the add flow stores it — gap + attrs.options + qty 2. */
const BED_EDIT_LINE: DraftLine = {
  localId: "L-bed",
  sku: "KAYU-K",
  qty: 2,
  unitPrice: 1990 + 125 + 60,
  label: 'Kayu · King · gap 12"',
  attrs: {
    gap: '12"',
    options: [
      { kind: "divan_height", value: '10"', surcharge: 125 },
      { kind: "bedframe_leg_height", value: '4"', surcharge: 60 },
    ],
    options_total: 185,
  },
};

describe("PosConfigurePage — edit mode (bed frame)", () => {
  it("prefills size / gap / divan / leg / qty and reads Update item", () => {
    const onAdd = vi.fn();
    render(
      <PosConfigurePage
        model={bedModel()}
        meta={undefined}
        skus={bedSkus}
        optionPools={POOLS}
        editLine={BED_EDIT_LINE}
        onAdd={onAdd}
        onClose={() => {}}
      />,
    );

    // CTA flips to Update.
    expect(screen.getByTestId("cfg-add-to-cart").textContent).toContain("Update item");
    // Size restored → live total = (1990 + 125 + 60) × 2.
    expect(screen.getByTestId("cfg-live-total").textContent).toContain("4,350");
    expect((screen.getByTestId("cfg-gap") as HTMLSelectElement).value).toBe('12"');
    expect((screen.getByTestId("cfg-divan") as HTMLSelectElement).value).toBe('10"');
    expect((screen.getByTestId("cfg-leg") as HTMLSelectElement).value).toBe('4"');
    expect(screen.getByTestId("cfg-qty").textContent).toBe("2");

    // Change one pick, save — the emitted line carries the updated config.
    fireEvent.click(screen.getByTestId("cfg-size-b1"));
    fireEvent.click(screen.getByTestId("cfg-add-to-cart"));
    expect(onAdd).toHaveBeenCalledTimes(1);
    const line = onAdd.mock.calls[0][0] as DraftLine;
    expect(line.sku).toBe("KAYU-Q");
    expect(line.qty).toBe(2);
    expect(line.unitPrice).toBe(1590 + 125 + 60);
    expect(line.attrs).toMatchObject({ gap: '12"' });
  });

  it("restores a stored fabric pick (attrs.options kind=fabric → cf: key)", () => {
    const editLine: DraftLine = {
      localId: "L-fab",
      sku: "KAYU-K",
      qty: 1,
      unitPrice: 1990 + 150,
      label: "Kayu · King · PC151-01 · Oat weave",
      attrs: {
        gap: "KIV",
        options: [{ kind: "fabric", value: "PC151-01", label: "Oat weave", surcharge: 150 }],
        options_total: 150,
      },
    };
    render(
      <PosConfigurePage
        model={bedModel({ allowedOptions: { fabrics: ["PC151-01"] } } as Partial<ProductModelDto>)}
        meta={undefined}
        skus={bedSkus}
        optionPools={POOLS}
        fabrics={FABRICS}
        fabricTierConfig={{ sofaTier2Delta: 150, sofaTier3Delta: 300 }}
        editLine={editLine}
        onAdd={() => {}}
        onClose={() => {}}
      />,
    );
    // Sole series auto-collapses → the colour dropdown holds the restored key.
    expect((screen.getByTestId("cfg-fabric") as HTMLSelectElement).value).toBe("cf:PC151-01");
    // 1990 + bedframe PRICE_2 delta 150.
    expect(screen.getByTestId("cfg-live-total").textContent).toContain("2,140");
  });
});

describe("PosConfigurePage — edit mode (mattress)", () => {
  it("prefills the sku + qty; add flow untouched without editLine", () => {
    const mattModel = {
      id: "m-mat",
      category: "mattress",
      modelKey: "lumi",
      name: "Lumi",
      blurb: null,
      colors: null,
      gaps: null,
      sofaMode: null,
    } as ProductModelDto;
    const mattSkus = [
      { id: "s1", modelId: "m-mat", sku: "LUMI-Q", variant: "Queen", variantKind: "size", price: 1200, cost: null, supplierId: null } as ProductSkuDto,
    ];
    const onAdd = vi.fn();
    render(
      <PosConfigurePage
        model={mattModel}
        meta={undefined}
        skus={mattSkus}
        editLine={{ localId: "L-m", sku: "LUMI-Q", qty: 3, unitPrice: 1200, label: "Lumi · Queen", attrs: null }}
        onAdd={onAdd}
        onClose={() => {}}
      />,
    );
    expect(screen.getByTestId("cfg-live-total").textContent).toContain("3,600");
    fireEvent.click(screen.getByTestId("cfg-add-to-cart"));
    const line = onAdd.mock.calls[0][0] as DraftLine;
    expect(line.sku).toBe("LUMI-Q");
    expect(line.qty).toBe(3);
    expect(line.attrs).toBeNull();
  });
});
