import { describe, it, expect } from "vitest";
import { sofaBuildSpec, type SofaSpecLine } from "./sofa-spec";

/** An exploded per-compartment line (only the fields the spec reads). */
function line(sku: string, attrs: Record<string, unknown> | null): SofaSpecLine {
  return { sku, attrs };
}

const WHOLE_SOFA = {
  sofa_height: "24",
  fabric_name: "CG-011 Peach",
  leg_height: '4"',
};

describe("sofaBuildSpec", () => {
  it('composes the full cart-style copy: cells · height″ · fabric · leg', () => {
    const spec = sofaBuildSpec([
      line("5539-1B(LHF)", { ...WHOLE_SOFA, module_code: "1B(LHF)" }),
      line("5539-CNR", { ...WHOLE_SOFA, module_code: "CNR" }),
      line("5539-2A(RHF)", { ...WHOLE_SOFA, module_code: "2A(RHF)" }),
    ]);
    expect(spec).toBe('1B(LHF) + CNR + 2A(RHF) · 24″ · CG-011 Peach · leg 4"');
  });

  it("walks cells LEFT→RIGHT off the persisted geometry (not stored line order)", () => {
    // Stored order is right-piece first; x/y/rot + sofa_height allow the walk.
    const spec = sofaBuildSpec([
      line("S-2A(RHF)", { ...WHOLE_SOFA, module_code: "2A(RHF)", x: 200, y: 0, rot: 0 }),
      line("S-1B(LHF)", { ...WHOLE_SOFA, module_code: "1B(LHF)", x: 0, y: 0, rot: 0 }),
    ]);
    expect(spec.startsWith("1B(LHF) + 2A(RHF)")).toBe(true);
  });

  it("keeps stored order when ANY cell is missing geometry", () => {
    const spec = sofaBuildSpec([
      line("S-2A(RHF)", { ...WHOLE_SOFA, module_code: "2A(RHF)", x: 200, y: 0, rot: 0 }),
      line("S-1B(LHF)", { ...WHOLE_SOFA, module_code: "1B(LHF)", x: null, y: null, rot: null }),
    ]);
    expect(spec.startsWith("2A(RHF) + 1B(LHF)")).toBe(true);
  });

  it("pre-sofa_height orders (before 2026-07-19) just drop the height segment", () => {
    const spec = sofaBuildSpec([
      line("S-1B(LHF)", { module_code: "1B(LHF)", fabric_name: "Velvet Teal" }),
      line("S-CNR", { module_code: "CNR", fabric_name: "Velvet Teal" }),
    ]);
    expect(spec).toBe("1B(LHF) + CNR · Velvet Teal");
  });

  it("series-only fabric (colour KIV) renders like the cart label", () => {
    const spec = sofaBuildSpec([
      line("S-1NA", { module_code: "1NA", sofa_height: "28", fabric_series: "EZ" }),
    ]);
    expect(spec).toBe("1NA · 28″ · EZ · colour KIV");
  });

  it("falls back to the sku when module_code is absent; bare attrs still render cells", () => {
    expect(sofaBuildSpec([line("OHANA-2A", { sofa_build_key: "bk" })])).toBe("OHANA-2A");
    expect(sofaBuildSpec([line("OHANA-2A", null)])).toBe("OHANA-2A");
  });

  it("empty input → empty string", () => {
    expect(sofaBuildSpec([])).toBe("");
  });
});
