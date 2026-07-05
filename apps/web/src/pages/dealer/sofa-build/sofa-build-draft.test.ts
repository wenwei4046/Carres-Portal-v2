import { describe, it, expect } from "vitest";
import type { ProductModelDto, ProductSkuDto } from "@carres/shared";
import { buildToDraftLine } from "./sofa-build-draft";
import type { SofaBuildAddPayload } from "./SofaBuildCanvas";

function sofaModel(id: string, name: string): ProductModelDto {
  return {
    id,
    category: "sofa",
    modelKey: name.toLowerCase(),
    name,
    blurb: null,
    colors: null,
    gaps: null,
    sofaMode: "custom",
  };
}

function sku(
  id: string,
  modelId: string,
  code: string,
  variant: string,
  variantKind: ProductSkuDto["variantKind"],
  price: number,
): ProductSkuDto {
  return { id, modelId, sku: code, variant, variantKind, price, cost: null, supplierId: null };
}

function payload(over: Partial<SofaBuildAddPayload> = {}): SofaBuildAddPayload {
  return {
    cells: [
      { moduleCode: "1A(LHF)", x: 0, y: 0, rot: 0 },
      { moduleCode: "1A(RHF)", x: 95, y: 0, rot: 0 },
    ],
    height: "28",
    fabricTier: "PRICE_2",
    fabricId: "fab-1",
    fabricName: "Velvet Teal",
    fabricSurcharge: 150,
    fabricDeferred: false,
    total: 4250,
    priceBasis: "a_la_carte",
    ...over,
  };
}

describe("buildToDraftLine", () => {
  const model = sofaModel("m-ohana", "Ohana");

  it("emits a contract-valid single DraftLine with the representative preset sku", () => {
    const skus = [
      sku("s-part", "m-ohana", "OH-PART-1A", "1-seat", "part", 1000),
      sku("s-preset", "m-ohana", "OH-PRESET", "3-seater", "preset", 3000),
    ];
    const line = buildToDraftLine(payload(), model, skus);
    expect(line).not.toBeNull();
    // Representative sku = the FIRST preset sku (not the first sku).
    expect(line!.sku).toBe("OH-PRESET");
    expect(line!.qty).toBe(1);
    expect(line!.unitPrice).toBe(4250); // == payload.total
    expect(typeof line!.localId).toBe("string");
    expect(line!.localId.length).toBeGreaterThan(0);
  });

  it("attrs carries sofa_build geometry + the 4 fabric keys + mode + sofa_build_key", () => {
    const skus = [sku("s-preset", "m-ohana", "OH-PRESET", "3-seater", "preset", 3000)];
    const line = buildToDraftLine(payload(), model, skus)!;
    const attrs = line.attrs as Record<string, unknown>;
    expect(attrs.mode).toBe("build");
    // Fabric cascade keys (operation CreatePOModal reads these).
    expect(attrs.fabric_id).toBe("fab-1");
    expect(attrs.fabric_name).toBe("Velvet Teal");
    expect(attrs.fabric_surcharge).toBe(150);
    expect(attrs.fabric_tier).toBe("PRICE_2");
    // Geometry descriptor.
    const build = attrs.sofa_build as { cells: unknown[]; height: string };
    expect(build.height).toBe("28");
    expect(build.cells).toHaveLength(2);
    // Regroup key present (mirrors combo_key).
    expect(typeof attrs.sofa_build_key).toBe("string");
    expect((attrs.sofa_build_key as string).length).toBeGreaterThan(0);
  });

  it("falls back to the first sku when the model has no preset sku", () => {
    const skus = [sku("s-part", "m-ohana", "OH-PART-1A", "1-seat", "part", 1000)];
    const line = buildToDraftLine(payload(), model, skus)!;
    expect(line.sku).toBe("OH-PART-1A");
  });

  it("returns null when the model has NO sku (Add stays disabled upstream)", () => {
    const line = buildToDraftLine(payload(), model, []);
    expect(line).toBeNull();
  });

  it("builds a human label: model · cells · height · fabric", () => {
    const skus = [sku("s-preset", "m-ohana", "OH-PRESET", "3-seater", "preset", 3000)];
    const line = buildToDraftLine(payload(), model, skus)!;
    expect(line.label).toBe('Ohana · 1A(LHF) + 1A(RHF) · 28″ · Velvet Teal');
  });

  it("omits the fabric segment from the label when no fabric is chosen", () => {
    const skus = [sku("s-preset", "m-ohana", "OH-PRESET", "3-seater", "preset", 3000)];
    const line = buildToDraftLine(
      payload({ fabricId: null, fabricName: null, fabricSurcharge: 0 }),
      model,
      skus,
    )!;
    expect(line.label).toBe("Ohana · 1A(LHF) + 1A(RHF) · 28″");
    const attrs = line.attrs as Record<string, unknown>;
    expect(attrs.fabric_id).toBeNull();
    expect(attrs.fabric_name).toBeNull();
    expect(attrs.fabric_deferred).toBe(false);
  });

  it("'Confirm later' defers fabric: flag set + 'Fabric to confirm' in the label", () => {
    const skus = [sku("s-preset", "m-ohana", "OH-PRESET", "3-seater", "preset", 3000)];
    const line = buildToDraftLine(
      payload({ fabricId: null, fabricName: null, fabricSurcharge: 0, fabricDeferred: true }),
      model,
      skus,
    )!;
    const attrs = line.attrs as Record<string, unknown>;
    expect(attrs.fabric_deferred).toBe(true);
    expect(attrs.fabric_name).toBeNull();
    expect(line.label).toBe("Ohana · 1A(LHF) + 1A(RHF) · 28″ · Fabric to confirm");
  });

  it("two builds get distinct sofa_build_key + localId values", () => {
    const skus = [sku("s-preset", "m-ohana", "OH-PRESET", "3-seater", "preset", 3000)];
    const a = buildToDraftLine(payload(), model, skus)!;
    const b = buildToDraftLine(payload(), model, skus)!;
    expect(a.localId).not.toBe(b.localId);
    expect((a.attrs as Record<string, unknown>).sofa_build_key).not.toBe(
      (b.attrs as Record<string, unknown>).sofa_build_key,
    );
  });
});
