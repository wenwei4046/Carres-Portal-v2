/**
 * SofaConfigurePage — cart-line EDIT mode (Loo 2026-07-12). The ✎ pencil mounts
 * the page with a sofa-BUILD `editLine`: it must open straight in Customize
 * with the stored geometry on the canvas, the seat size / fabric / leg
 * restored, and the CTA reading "Update item". The emitted DraftLine keeps the
 * same `attrs.sofa_build` contract as the add flow.
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type {
  CatalogFabricDto,
  CatalogOptionPoolDto,
  ModelSofaCompartmentDto,
  ProductModelDto,
  ProductSkuDto,
  SofaCompartmentDto,
} from "@carres/shared";
import { findModule, moduleFootprint } from "@carres/shared";
import type { DraftLine } from "../new-order/draft";

// Same harness mocks as SofaConfigurePage.test.tsx — the page reads these
// hooks unconditionally.
const { pwpMock, roleMock, deleteMock } = vi.hoisted(() => ({
  pwpMock: { current: { data: { vouchers: [] as { code: string }[] }, isFetching: false } },
  roleMock: { current: null as string | null },
  deleteMock: { mutate: vi.fn(), isPending: false },
}));
vi.mock("@/lib/queries", () => ({
  usePwpAvailableForPhone: () => pwpMock.current,
  useDeleteSofaCombo: () => deleteMock,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/auth", () => ({
  useAuth: (selector: (s: { role: string | null }) => unknown) =>
    selector({ role: roleMock.current }),
}));

import SofaConfigurePage from "./SofaConfigurePage";

beforeAll(() => {
  if (typeof (globalThis as { ResizeObserver?: unknown }).ResizeObserver === "undefined") {
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

const MODEL: ProductModelDto = {
  id: "00000000-0000-0000-0000-000000000001",
  category: "sofa",
  modelKey: "booqit",
  name: "Booqit",
  blurb: null,
  colors: null,
  gaps: null,
  sofaMode: "custom",
} as ProductModelDto;

const POOL: SofaCompartmentDto[] = [
  { id: "c-1alhf", code: "1A(LHF)", description: null, seatCount: 1, armConfig: "LHF", iconUrl: null, defaultPrice: 1200, sortOrder: 0, active: true },
  { id: "c-2arhf", code: "2A(RHF)", description: null, seatCount: 2, armConfig: "RHF", iconUrl: null, defaultPrice: 1900, sortOrder: 1, active: true },
];

const OFFERED: ModelSofaCompartmentDto[] = POOL.map((p, i) => ({
  modelId: MODEL.id,
  compartmentId: p.id,
  priceOverride: null,
  sortOrder: i,
}));

const PRESET_SKU: ProductSkuDto = {
  id: "sku-preset",
  modelId: MODEL.id,
  sku: "BOOQIT-PRESET",
  variant: "3-seater",
  variantKind: "preset",
  price: 2990,
  cost: null,
  supplierId: null,
} as ProductSkuDto;

/** A closed 2-module sofa at 28″ — 1A(LHF) opens, 2A(RHF) flush-right closes. */
function storedCells(height: string) {
  const w1 = moduleFootprint(findModule("1A(LHF)")!, 0, height).w;
  return [
    { moduleCode: "1A(LHF)", x: 60, y: 60, rot: 0 },
    { moduleCode: "2A(RHF)", x: 60 + w1, y: 60, rot: 0 },
  ];
}

function buildEditLine(over: { attrs?: Record<string, unknown> } = {}): DraftLine {
  return {
    localId: "E1",
    sku: PRESET_SKU.sku,
    qty: 1,
    unitPrice: 3100,
    label: "Booqit · 1A(LHF) + 2A(RHF) · 28″",
    attrs: {
      mode: "build",
      fabric_id: null,
      fabric_name: null,
      fabric_surcharge: 0,
      fabric_tier: "PRICE_1",
      fabric_deferred: true,
      sofa_build: { cells: storedCells("28"), height: "28" },
      sofa_build_key: "k-1",
      ...over.attrs,
    },
  };
}

function renderEdit(
  editLine: DraftLine,
  extra: {
    masterFabrics?: CatalogFabricDto[];
    optionPools?: CatalogOptionPoolDto[];
    model?: ProductModelDto;
    onAdd?: (l: DraftLine) => void;
  } = {},
) {
  render(
    <SofaConfigurePage
      model={extra.model ?? MODEL}
      meta={undefined}
      skus={[PRESET_SKU]}
      fabrics={[]}
      masterFabrics={extra.masterFabrics}
      optionPools={extra.optionPools}
      sofaCompartments={POOL}
      modelCompartments={OFFERED}
      sofaCombos={[]}
      editLine={editLine}
      onAdd={extra.onAdd ?? (() => {})}
      onClose={() => {}}
    />,
  );
}

describe("SofaConfigurePage — edit mode", () => {
  it("opens straight in Customize with the stored size + geometry; CTA reads Update item", () => {
    const onAdd = vi.fn();
    renderEdit(buildEditLine(), { onAdd });

    // Straight into Customize (no quick picks authored anyway, but the mode
    // must be custom even when picks exist — editBuild wins the initializer).
    expect(screen.getByTestId("sofa-mode-custom").getAttribute("aria-pressed")).toBe("true");
    // Stored seat size restored on the header chips (canonical axis fallback).
    expect(screen.getByTestId("sofa-cust-size-28").getAttribute("aria-pressed")).toBe("true");
    // The canvas CTA flips to Update item.
    expect(screen.getByTestId("sofa-build-add").textContent).toContain("Update item");

    // Saving re-emits the SAME build contract (2 cells @ 28″).
    fireEvent.click(screen.getByTestId("sofa-build-add"));
    expect(onAdd).toHaveBeenCalledTimes(1);
    const line = onAdd.mock.calls[0][0] as DraftLine;
    const attrs = line.attrs as { sofa_build: { cells: unknown[]; height: string } };
    expect(attrs.sofa_build.height).toBe("28");
    expect(attrs.sofa_build.cells).toHaveLength(2);
    expect(line.sku).toBe(PRESET_SKU.sku);
  });

  it("restores the stored master fabric + leg height into the canvas picks", () => {
    const MASTER: CatalogFabricDto[] = [
      { id: "mf-1", fabricCode: "EZ-001", series: "EZ", description: "Pearl", supplierCode: null, sofaTier: "PRICE_2", bedframeTier: "PRICE_1", active: true, sortOrder: 0 },
    ];
    const POOLS = [
      { id: "op-1", pool: "sofa_size", value: "24", label: null, dimensions: null, surcharge: null, active: true, sortOrder: 0 },
      { id: "op-2", pool: "sofa_size", value: "28", label: null, dimensions: null, surcharge: null, active: true, sortOrder: 1 },
      { id: "op-3", pool: "sofa_leg_height", value: '4"', label: null, dimensions: null, surcharge: 50, active: true, sortOrder: 2 },
    ] as CatalogOptionPoolDto[];
    const model = { ...MODEL, allowedOptions: { fabrics: ["EZ-001"] } } as ProductModelDto;

    const onAdd = vi.fn();
    renderEdit(
      buildEditLine({
        attrs: {
          fabric_code: "EZ-001",
          fabric_name: "EZ-001 · Pearl",
          fabric_series: "EZ",
          fabric_deferred: false,
          leg_height: '4"',
          leg_surcharge: 50,
        },
      }),
      { masterFabrics: MASTER, optionPools: POOLS, model, onAdd },
    );

    fireEvent.click(screen.getByTestId("sofa-build-add"));
    const line = onAdd.mock.calls[0][0] as DraftLine;
    const attrs = line.attrs as Record<string, unknown>;
    // The canvas re-emitted the restored picks — proof the initial fabric/leg
    // landed in its state, not just in the display.
    expect(attrs.fabric_code).toBe("EZ-001");
    expect(attrs.fabric_series).toBe("EZ");
    expect(attrs.fabric_deferred).toBe(false);
    expect(attrs.leg_height).toBe('4"');
  });
});
