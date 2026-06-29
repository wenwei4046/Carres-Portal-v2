import { describe, it, expect } from "vitest";
import {
  sofaBuildLineAttrsSchema,
  isSofaBuildLine,
} from "./sofa-build";

const validAttrs = () => ({
  mode: "build",
  fabric_id: "fab-1",
  fabric_name: "Velvet Teal",
  fabric_surcharge: 200,
  fabric_tier: "PRICE_2",
  sofa_build: {
    cells: [
      { moduleCode: "2A", x: 0, y: 0, rot: 0 },
      { moduleCode: "1A(LHF)", x: 200, y: 0, rot: 0 },
    ],
    height: "28",
  },
  sofa_build_key: "sc_abc123",
});

describe("isSofaBuildLine", () => {
  it("true when attrs carry a sofa_build object", () => {
    expect(isSofaBuildLine(validAttrs())).toBe(true);
  });

  it("false for null / non-build / missing sofa_build", () => {
    expect(isSofaBuildLine(null)).toBe(false);
    expect(isSofaBuildLine({})).toBe(false);
    expect(isSofaBuildLine({ mode: "configure", fabric_id: "x" })).toBe(false);
    expect(isSofaBuildLine({ sofa_build: null })).toBe(false);
  });
});

describe("sofaBuildLineAttrsSchema", () => {
  it("accepts a well-formed build (and preserves passthrough keys)", () => {
    const parsed = sofaBuildLineAttrsSchema.parse(validAttrs());
    expect(parsed.sofa_build.cells).toHaveLength(2);
    expect(parsed.sofa_build.height).toBe("28");
    expect(parsed.fabric_tier).toBe("PRICE_2");
  });

  it("accepts a build with no fabric_tier (defaults handled downstream)", () => {
    const a = validAttrs();
    delete (a as Record<string, unknown>).fabric_tier;
    expect(sofaBuildLineAttrsSchema.safeParse(a).success).toBe(true);
  });

  it("accepts null fabric_tier", () => {
    expect(
      sofaBuildLineAttrsSchema.safeParse({ ...validAttrs(), fabric_tier: null }).success,
    ).toBe(true);
  });

  it("accepts cells without geometry (moduleCode is the only required field)", () => {
    const parsed = sofaBuildLineAttrsSchema.parse({
      sofa_build: { cells: [{ moduleCode: "3A" }], height: "32" },
    });
    expect(parsed.sofa_build.cells[0]!.moduleCode).toBe("3A");
  });

  it("rejects empty cells array", () => {
    expect(
      sofaBuildLineAttrsSchema.safeParse({
        sofa_build: { cells: [], height: "28" },
      }).success,
    ).toBe(false);
  });

  it("rejects a cell with empty moduleCode", () => {
    expect(
      sofaBuildLineAttrsSchema.safeParse({
        sofa_build: { cells: [{ moduleCode: "" }], height: "28" },
      }).success,
    ).toBe(false);
  });

  it("rejects a missing / empty height", () => {
    expect(
      sofaBuildLineAttrsSchema.safeParse({
        sofa_build: { cells: [{ moduleCode: "2A" }], height: "" },
      }).success,
    ).toBe(false);
    expect(
      sofaBuildLineAttrsSchema.safeParse({
        sofa_build: { cells: [{ moduleCode: "2A" }] },
      }).success,
    ).toBe(false);
  });

  it("rejects an invalid fabric_tier value", () => {
    expect(
      sofaBuildLineAttrsSchema.safeParse({ ...validAttrs(), fabric_tier: "PRICE_9" }).success,
    ).toBe(false);
  });

  it("rejects a missing sofa_build", () => {
    expect(sofaBuildLineAttrsSchema.safeParse({ mode: "build" }).success).toBe(false);
  });
});
