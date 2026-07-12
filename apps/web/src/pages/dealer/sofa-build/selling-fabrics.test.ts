/**
 * selling-fabrics — the unified POS fabric list (legacy per-model rows +
 * opted-in master fabrics) and its display-name convention.
 *
 * fabricDisplayName (Loo 2026-07-12): the Fabrics tab often authors the
 * description WITH the code already in it ("CG-007 Deep Grey") — the cart
 * label must not double it ("CG-007 · CG-007 Deep Grey").
 */
import { describe, it, expect } from "vitest";
import type { CatalogFabricDto, ProductModelDto } from "@carres/shared";
import { fabricDisplayName, sellingFabricsFor } from "./selling-fabrics";

describe("fabricDisplayName", () => {
  it("prefixes the code when the description doesn't carry it", () => {
    expect(fabricDisplayName("EZ-001", "Pearl")).toBe("EZ-001 · Pearl");
  });
  it("uses the description as-is when it already leads with the code", () => {
    expect(fabricDisplayName("CG-007", "CG-007 Deep Grey")).toBe("CG-007 Deep Grey");
  });
  it("matches the code case-insensitively", () => {
    expect(fabricDisplayName("cg-007", "CG-007 Deep Grey")).toBe("CG-007 Deep Grey");
  });
  it("falls back to the bare code without a description", () => {
    expect(fabricDisplayName("CG-007", null)).toBe("CG-007");
    expect(fabricDisplayName("CG-007", "  ")).toBe("CG-007");
  });
});

describe("sellingFabricsFor — master rows use the deduped display name", () => {
  const MODEL = {
    id: "m1",
    category: "sofa",
    name: "Booqit",
    allowedOptions: { fabrics: ["CG-007", "EZ-001"] },
  } as unknown as ProductModelDto;
  const MASTER: CatalogFabricDto[] = [
    { id: "f1", fabricCode: "CG-007", series: "CG", description: "CG-007 Deep Grey", supplierCode: null, sofaTier: "PRICE_1", bedframeTier: "PRICE_1", active: true, sortOrder: 0 },
    { id: "f2", fabricCode: "EZ-001", series: "EZ", description: "Pearl", supplierCode: null, sofaTier: "PRICE_2", bedframeTier: "PRICE_1", active: true, sortOrder: 1 },
  ];

  it("no doubled code; plain descriptions keep the CODE · description shape", () => {
    const out = sellingFabricsFor(MODEL, [], MASTER);
    expect(out.map((f) => f.name)).toEqual(["CG-007 Deep Grey", "EZ-001 · Pearl"]);
  });
});
