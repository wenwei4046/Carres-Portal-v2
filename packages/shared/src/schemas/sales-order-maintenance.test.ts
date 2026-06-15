import { describe, it, expect } from "vitest";
import {
  SO_GRID_COLUMNS,
  SO_GRID_COLUMN_KEYS,
  SO_GRID_OPTION_KEYS,
  soGridColumnDef,
  soGridConfigSchema,
  defaultSoGridConfig,
  mergeSoGridConfig,
} from "./sales-order-maintenance";

describe("SO_GRID_COLUMNS catalog", () => {
  it("has unique keys", () => {
    const keys = SO_GRID_COLUMNS.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("SO_GRID_COLUMN_KEYS mirrors the catalog order", () => {
    expect(SO_GRID_COLUMN_KEYS).toEqual(SO_GRID_COLUMNS.map((c) => c.key));
  });

  it("option keys are a subset whose columns are flagged option", () => {
    for (const k of SO_GRID_OPTION_KEYS) {
      expect(soGridColumnDef(k)?.option).toBe(true);
    }
    const flagged = SO_GRID_COLUMNS.filter((c) => c.option).map((c) => c.key);
    expect(SO_GRID_OPTION_KEYS.sort()).toEqual(flagged.sort());
  });

  it("every column has a positive default width + a label", () => {
    for (const c of SO_GRID_COLUMNS) {
      expect(c.defaultWidth).toBeGreaterThan(0);
      expect(c.label.length).toBeGreaterThan(0);
    }
  });

  it("has at least the AutoCount line-level columns", () => {
    for (const k of ["so", "customer_name", "sku", "qty", "unit_price", "item_group"]) {
      expect(soGridColumnDef(k)).toBeTruthy();
    }
  });
});

describe("defaultSoGridConfig", () => {
  it("includes every catalog column with sequential order", () => {
    const cfg = defaultSoGridConfig();
    expect(cfg.columns).toHaveLength(SO_GRID_COLUMNS.length);
    cfg.columns.forEach((c, i) => expect(c.order).toBe(i));
    expect(cfg.options).toEqual({});
  });

  it("passes its own zod schema", () => {
    expect(soGridConfigSchema.safeParse(defaultSoGridConfig()).success).toBe(true);
  });
});

describe("mergeSoGridConfig", () => {
  it("null → catalog defaults", () => {
    expect(mergeSoGridConfig(null)).toEqual(defaultSoGridConfig());
  });

  it("stored overrides win; unknown keys dropped; new catalog keys appear", () => {
    const merged = mergeSoGridConfig({
      columns: [
        { key: "so", visible: false, order: 0, width: 90, label: "SO #" },
        { key: "ghost_removed_col", visible: true, order: 1, width: 100 },
      ],
      options: { status: ["place"] },
    });
    // every catalog key present, no extras
    expect(merged.columns).toHaveLength(SO_GRID_COLUMNS.length);
    expect(merged.columns.find((c) => c.key === "ghost_removed_col")).toBeUndefined();
    const so = merged.columns.find((c) => c.key === "so");
    expect(so?.visible).toBe(false);
    expect(so?.width).toBe(90);
    expect(so?.label).toBe("SO #");
    // order re-normalized 0..n-1
    expect(merged.columns.map((c) => c.order)).toEqual(
      merged.columns.map((_, i) => i),
    );
    expect(merged.options).toEqual({ status: ["place"] });
  });

  it("empty stored columns → defaults but keeps stored options", () => {
    const merged = mergeSoGridConfig({ columns: [], options: { status: ["x"] } });
    expect(merged.columns).toHaveLength(SO_GRID_COLUMNS.length);
    expect(merged.options).toEqual({ status: ["x"] });
  });
});

describe("soGridConfigSchema", () => {
  it("rejects a non-array columns", () => {
    expect(
      soGridConfigSchema.safeParse({ columns: "nope", options: {} }).success,
    ).toBe(false);
  });

  it("rejects an unknown top-level key (strict)", () => {
    expect(
      soGridConfigSchema.safeParse({ columns: [], options: {}, extra: 1 }).success,
    ).toBe(false);
  });

  it("rejects a width out of bounds", () => {
    expect(
      soGridConfigSchema.safeParse({
        columns: [{ key: "so", visible: true, order: 0, width: 9000 }],
        options: {},
      }).success,
    ).toBe(false);
  });
});
