import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import type {
  CatalogOptionPoolDto,
  ProductModelDto,
  SofaComboDto,
  SofaCompartmentDto,
} from "@carres/shared";

import GuaranteeScopeFields, {
  EMPTY_GUARANTEE_SCOPE,
  type GuaranteeScopeValue,
} from "./GuaranteeScopeFields";

/**
 * The scope half of authoring a guarantee (Loo 2026-07-26). What is asserted
 * here is his spec, one rule per test:
 *   Mattress / Bed frame → model (or any) + sizes (or any)
 *   Sofa                 → any · model · combo · compartment
 *   Accessory            → model only, NO sizes
 */

const model = (over: Partial<ProductModelDto>): ProductModelDto => ({
  id: "m1",
  category: "mattress",
  modelKey: "lumi",
  name: "Lumi FirmCare",
  blurb: null,
  colors: null,
  gaps: null,
  sofaMode: null,
  ...over,
});

const MODELS: ProductModelDto[] = [
  model({}),
  model({ id: "m2", name: "Dream Soft" }),
  model({ id: "b1", category: "bedframe", name: "Kayu Platform", modelKey: "kayu" }),
  model({ id: "s1", category: "sofa", name: "Booqit", modelKey: "booqit", sofaMode: "custom" }),
  model({ id: "a1", category: "accessory", name: "Pillow", modelKey: "pillow" }),
];

const pool = (v: string, p: string): CatalogOptionPoolDto => ({
  id: `p-${p}-${v}`,
  pool: p as CatalogOptionPoolDto["pool"],
  value: v,
  label: v,
  dimensions: null,
  surcharge: null,
  active: true,
  sortOrder: 1,
});

const POOLS: CatalogOptionPoolDto[] = [
  pool("King", "mattress_size"),
  pool("Queen", "mattress_size"),
  pool("Single", "bedframe_size"),
];

const COMPARTMENTS: SofaCompartmentDto[] = [
  {
    id: "c1",
    code: "1A",
    description: "single arm",
    active: true,
    sortOrder: 1,
    seatCount: 1,
    armConfig: null,
    iconUrl: null,
    defaultPrice: 0,
  },
];

const COMBOS: SofaComboDto[] = [
  {
    id: "cb1",
    modelId: "s1",
    slots: [["1A"], ["2A"]],
    tier: null,
    pricesByHeight: {},
    costByHeight: null,
    pwpPricesByHeight: null,
    label: "L-shape 3str",
    effectiveFrom: "2026-01-01",
    active: true,
  },
];

/** Renders with real state so a pick actually flows back in. */
function Harness({ onValue }: { onValue?: (v: GuaranteeScopeValue) => void }) {
  const [v, setV] = useState<GuaranteeScopeValue>(EMPTY_GUARANTEE_SCOPE);
  return (
    <GuaranteeScopeFields
      value={v}
      onChange={(next) => {
        setV(next);
        onValue?.(next);
      }}
      models={MODELS}
      optionPools={POOLS}
      sofaCompartments={COMPARTMENTS}
      sofaCombos={COMBOS}
    />
  );
}

describe("GuaranteeScopeFields", () => {
  it("offers only categories a guarantee can actually cover", () => {
    render(<Harness />);
    const sel = screen.getByLabelText("Covered category") as HTMLSelectElement;
    const values = [...sel.options].map((o) => o.value);
    expect(values).toEqual(["mattress", "bedframe", "sofa", "accessory"]);
    // A guarantee on a service or on another guarantee could never match.
    expect(values).not.toContain("service");
    expect(values).not.toContain("guarantee");
  });

  it("mattress: lists that category's models, defaulting to ANY", () => {
    render(<Harness />);
    const sel = screen.getByLabelText("Covered product") as HTMLSelectElement;
    expect(sel.value).toBe(""); // any
    const names = [...sel.options].map((o) => o.textContent);
    expect(names).toContain("Lumi FirmCare");
    expect(names).toContain("Dream Soft");
    expect(names).not.toContain("Booqit"); // a sofa is not a mattress
  });

  it("mattress: sizes come from the pool and none-ticked means ANY size", () => {
    const seen: GuaranteeScopeValue[] = [];
    render(<Harness onValue={(v) => seen.push(v)} />);
    expect(screen.getByRole("button", { name: "Any size" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: "King" }));
    expect(seen.at(-1)!.coversVariants).toEqual(["King"]);
    fireEvent.click(screen.getByRole("button", { name: "King" }));
    expect(seen.at(-1)!.coversVariants).toEqual([]); // back to any
  });

  it("accessory: a model picker but NO sizes (Loo was explicit)", () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("Covered category"), {
      target: { value: "accessory" },
    });
    expect(screen.getByLabelText("Covered product")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Any size" })).not.toBeInTheDocument();
  });

  it("bedframe: behaves like mattress — model + sizes", () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("Covered category"), {
      target: { value: "bedframe" },
    });
    expect(screen.getByLabelText("Covered product")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Single" })).toBeInTheDocument();
    // …and it uses the BEDFRAME pool, not the mattress one
    expect(screen.queryByRole("button", { name: "King" })).not.toBeInTheDocument();
  });

  it("sofa: offers any / model / combo / compartment instead of sizes", () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("Covered category"), { target: { value: "sofa" } });
    const sel = screen.getByLabelText("Sofa scope") as HTMLSelectElement;
    expect([...sel.options].map((o) => o.value)).toEqual([
      "any",
      "model",
      "combo",
      "compartment",
    ]);
    expect(screen.queryByRole("button", { name: "Any size" })).not.toBeInTheDocument();
  });

  it("sofa: picking Combo surfaces the authored combos", () => {
    const seen: GuaranteeScopeValue[] = [];
    render(<Harness onValue={(v) => seen.push(v)} />);
    fireEvent.change(screen.getByLabelText("Covered category"), { target: { value: "sofa" } });
    fireEvent.change(screen.getByLabelText("Sofa scope"), { target: { value: "combo" } });
    fireEvent.change(screen.getByLabelText("Covered combo"), { target: { value: "cb1" } });
    expect(seen.at(-1)!.coversComboId).toBe("cb1");
    expect(seen.at(-1)!.coversCompartmentId).toBeNull(); // never both
  });

  it("sofa: picking Compartment surfaces the pool", () => {
    const seen: GuaranteeScopeValue[] = [];
    render(<Harness onValue={(v) => seen.push(v)} />);
    fireEvent.change(screen.getByLabelText("Covered category"), { target: { value: "sofa" } });
    fireEvent.change(screen.getByLabelText("Sofa scope"), { target: { value: "compartment" } });
    fireEvent.change(screen.getByLabelText("Covered compartment"), { target: { value: "c1" } });
    expect(seen.at(-1)!.coversCompartmentId).toBe("c1");
    expect(seen.at(-1)!.coversComboId).toBeNull();
  });

  it("switching category CLEARS the narrowing under it", () => {
    // Otherwise a mattress size could survive onto a sofa scope and the term
    // would be authored covering something that cannot exist.
    const seen: GuaranteeScopeValue[] = [];
    render(<Harness onValue={(v) => seen.push(v)} />);
    fireEvent.click(screen.getByRole("button", { name: "King" }));
    expect(seen.at(-1)!.coversVariants).toEqual(["King"]);
    fireEvent.change(screen.getByLabelText("Covered category"), { target: { value: "sofa" } });
    expect(seen.at(-1)!.coversVariants).toEqual([]);
    expect(seen.at(-1)!.coversModelId).toBeNull();
  });
});
