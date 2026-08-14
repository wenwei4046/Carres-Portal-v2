import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  addOrderLinesInputSchema,
  operationStageSchema,
  replaceOrderLinesInputSchema,
  submitOrderChangeRequestInputSchema,
  updateOrderInputSchema,
} from "./orders";

/**
 * `orderSchema.parse()` runs on live rows in four routes, so this enum must
 * equal the Postgres one exactly. It had drifted BOTH ways at once: `placed`
 * was listed here after 0167 removed it from the type, and `waiting` — live
 * since 0028 — was absent, so parsing a partner-rejected order threw.
 *
 * The migration file is the source of truth, so this test reads it rather than
 * repeating the list. A second hard-coded copy is how the drift happened.
 */
describe("operationStageSchema matches the database enum", () => {
  const migration = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../../../supabase/migrations/0167_clean_operation_stage_values.sql",
  );

  function dbValues(): string[] {
    const sql = readFileSync(migration, "utf8");
    const block = sql.match(/create type public\.operation_stage as enum \(([^)]*)\)/i);
    if (!block) throw new Error("0167 no longer declares the enum in the expected shape");
    return [...block[1]!.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]!);
  }

  it("declares exactly the values 0167 created", () => {
    expect([...operationStageSchema.options].sort()).toEqual(dbValues().sort());
  });

  it("rejects `placed` — 0167 remapped it to confirmed; it is a FILTER value only", () => {
    expect(operationStageSchema.safeParse("placed").success).toBe(false);
  });

  it("accepts `waiting` — the partner-rejection lane sets it", () => {
    expect(operationStageSchema.safeParse("waiting").success).toBe(true);
  });

  it("negative control — the migration really is being read", () => {
    expect(dbValues()).toContain("waiting");
    expect(dbValues()).not.toContain("placed");
  });
});

// 0220 — POS proceed-lane edits: customer.email joins the editable set.
describe("updateOrderInputSchema.customer.email (0220)", () => {
  it("accepts a valid email (trimmed)", () => {
    const parsed = updateOrderInputSchema.parse({
      customer: { email: "  loo@carres.com  " },
    });
    expect(parsed.customer?.email).toBe("loo@carres.com");
  });

  it("accepts null (clears the email)", () => {
    const parsed = updateOrderInputSchema.parse({ customer: { email: null } });
    expect(parsed.customer?.email).toBeNull();
  });

  it("coerces an empty / whitespace-only string to null", () => {
    for (const raw of ["", "   "]) {
      const parsed = updateOrderInputSchema.parse({ customer: { email: raw } });
      expect(parsed.customer?.email).toBeNull();
    }
  });

  it("stays optional — an email-less customer patch still parses", () => {
    const parsed = updateOrderInputSchema.parse({ customer: { name: "Customer X" } });
    expect(parsed.customer?.email).toBeUndefined();
  });

  it("rejects an invalid email", () => {
    const res = updateOrderInputSchema.safeParse({ customer: { email: "not-an-email" } });
    expect(res.success).toBe(false);
  });

  it("rejects an email longer than 320 chars", () => {
    const long = `${"a".repeat(315)}@x.com`; // 321 chars
    const res = updateOrderInputSchema.safeParse({ customer: { email: long } });
    expect(res.success).toBe(false);
  });
});

// 0255 — line EDIT: target row id(s) + ONE re-configured replacement line.
describe("replaceOrderLinesInputSchema (0255)", () => {
  it("parses a single-target flat edit and a sofa-group edit (multi target + preview price)", () => {
    const flat = replaceOrderLinesInputSchema.parse({
      targetLineIds: ["6a51f4a1-0000-4000-8000-000000000001"],
      line: { sku: "MAT-1", qty: 1, attrs: { gap: "None" } },
    });
    expect(flat.targetLineIds).toHaveLength(1);
    const build = replaceOrderLinesInputSchema.parse({
      targetLineIds: [
        "6a51f4a1-0000-4000-8000-000000000001",
        "6a51f4a1-0000-4000-8000-000000000002",
      ],
      line: { sku: "LOTTI-1A", qty: 1, attrs: { sofa_build: {} }, unitPrice: 4200 },
    });
    expect(build.line.unitPrice).toBe(4200);
  });

  it("rejects non-uuid targets, an empty target list, and a missing line", () => {
    expect(
      replaceOrderLinesInputSchema.safeParse({ targetLineIds: ["nope"], line: { sku: "S", qty: 1 } })
        .success,
    ).toBe(false);
    expect(
      replaceOrderLinesInputSchema.safeParse({ targetLineIds: [], line: { sku: "S", qty: 1 } })
        .success,
    ).toBe(false);
    expect(
      replaceOrderLinesInputSchema.safeParse({
        targetLineIds: ["6a51f4a1-0000-4000-8000-000000000001"],
      }).success,
    ).toBe(false);
  });
});

// 0231/0232 — add-product: sku/qty/attrs (+ optional PREVIEW unitPrice, which
// the route only reads for the sofa-build drift gate — flat lines stay
// server-priced regardless of what the client sends).
describe("addOrderLinesInputSchema (0231/0232)", () => {
  it("parses a minimal line; unitPrice is optional and carried as a preview", () => {
    const bare = addOrderLinesInputSchema.parse({
      lines: [{ sku: "MEMORY-PILLOW", qty: 2, attrs: null }],
    });
    expect(bare.lines[0]).toEqual({ sku: "MEMORY-PILLOW", qty: 2, attrs: null });
    expect(bare.lines[0].unitPrice).toBeUndefined();
    const withPreview = addOrderLinesInputSchema.parse({
      lines: [{ sku: "SOFA-1", qty: 1, attrs: { sofa_build: {} }, unitPrice: 3200 }],
    });
    expect(withPreview.lines[0].unitPrice).toBe(3200);
    expect(
      addOrderLinesInputSchema.safeParse({ lines: [{ sku: "S", qty: 1, unitPrice: -1 }] })
        .success,
    ).toBe(false);
  });

  it("attrs is optional and may carry configurator selections", () => {
    const parsed = addOrderLinesInputSchema.parse({
      lines: [{ sku: "SKU-1", qty: 1, attrs: { specials: [{ code: "X" }], specials_total: 20 } }],
    });
    expect(parsed.lines[0].attrs).toEqual({ specials: [{ code: "X" }], specials_total: 20 });
  });

  it("rejects an empty list, >10 lines, qty out of 1..99, and a blank sku", () => {
    expect(addOrderLinesInputSchema.safeParse({ lines: [] }).success).toBe(false);
    expect(
      addOrderLinesInputSchema.safeParse({
        lines: Array.from({ length: 11 }, (_, i) => ({ sku: `S-${i}`, qty: 1 })),
      }).success,
    ).toBe(false);
    expect(
      addOrderLinesInputSchema.safeParse({ lines: [{ sku: "S", qty: 0 }] }).success,
    ).toBe(false);
    expect(
      addOrderLinesInputSchema.safeParse({ lines: [{ sku: "S", qty: 100 }] }).success,
    ).toBe(false);
    expect(
      addOrderLinesInputSchema.safeParse({ lines: [{ sku: "  ", qty: 1 }] }).success,
    ).toBe(false);
  });

  // 0257 — service add-ons ride the same body; lines become optional.
  it("parses an addons-only body; rejects when BOTH lines and addons are empty", () => {
    const svcOnly = addOrderLinesInputSchema.parse({
      addons: [{ addonKey: "dispose-mattress", qty: 2, attrs: { sizes: ["Queen", "King"] } }],
    });
    expect(svcOnly.lines).toEqual([]);
    expect(svcOnly.addons[0].addonKey).toBe("dispose-mattress");
    expect(addOrderLinesInputSchema.safeParse({ lines: [], addons: [] }).success).toBe(false);
    expect(addOrderLinesInputSchema.safeParse({}).success).toBe(false);
    expect(
      addOrderLinesInputSchema.safeParse({ addons: [{ addonKey: "x", qty: 0 }] }).success,
    ).toBe(false);
  });
});

// 0257 — kind-aware change-request submissions.
describe("submitOrderChangeRequestInputSchema (0257)", () => {
  it("a body without kind parses as the add variant (pre-0257 web compat)", () => {
    const parsed = submitOrderChangeRequestInputSchema.parse({
      lines: [{ sku: "PILLOW-1", qty: 1 }],
    });
    expect(parsed.kind === "replace_lines").toBe(false);
    // 0258 added a third variant (`edit_addon`), so excluding only the replace
    // variant no longer narrows to the add variant — `lines`/`addons` exist on
    // the add variant alone. Both other kinds must be excluded to narrow.
    if (parsed.kind !== "replace_lines" && parsed.kind !== "edit_addon") {
      expect(parsed.lines).toHaveLength(1);
      expect(parsed.addons).toEqual([]);
    }
  });

  it("parses the replace variant (targets + snapshot + replacement line)", () => {
    const parsed = submitOrderChangeRequestInputSchema.parse({
      kind: "replace_lines",
      targetLineIds: ["6a51f4a1-0000-4000-8000-000000000001"],
      targetLines: [{ sku: "FENRIR-K", qty: 1, unitPrice: 1999, label: "Fenrir · King" }],
      line: { sku: "FENRIR-Q", qty: 1, unitPrice: 2499, label: "Fenrir · Queen" },
    });
    expect(parsed.kind).toBe("replace_lines");
    if (parsed.kind === "replace_lines") {
      expect(parsed.targetLineIds).toHaveLength(1);
      expect(parsed.line.sku).toBe("FENRIR-Q");
    }
  });

  it("rejects a replace variant without targets and an add variant with nothing to add", () => {
    expect(
      submitOrderChangeRequestInputSchema.safeParse({
        kind: "replace_lines",
        targetLineIds: [],
        line: { sku: "S", qty: 1 },
      }).success,
    ).toBe(false);
    expect(
      submitOrderChangeRequestInputSchema.safeParse({ kind: "add_lines", lines: [], addons: [] })
        .success,
    ).toBe(false);
  });

  // 0258 — service add-on qty/size edit.
  it("parses the edit_addon variant; rejects a missing target / bad qty", () => {
    const parsed = submitOrderChangeRequestInputSchema.parse({
      kind: "edit_addon",
      targetAddonId: "6a51f4a1-0000-4000-8000-000000000009",
      qty: 2,
      attrs: { sizes: ["King", "Queen"], size: "King + Queen" },
      label: "Dispose old mattress",
      oldQty: 1,
      oldSize: "King",
    });
    expect(parsed.kind).toBe("edit_addon");
    if (parsed.kind === "edit_addon") {
      expect(parsed.qty).toBe(2);
      expect(parsed.targetAddonId).toBe("6a51f4a1-0000-4000-8000-000000000009");
    }
    expect(
      submitOrderChangeRequestInputSchema.safeParse({ kind: "edit_addon", qty: 1 }).success,
    ).toBe(false);
    expect(
      submitOrderChangeRequestInputSchema.safeParse({
        kind: "edit_addon",
        targetAddonId: "6a51f4a1-0000-4000-8000-000000000009",
        qty: 0,
      }).success,
    ).toBe(false);
  });
});
