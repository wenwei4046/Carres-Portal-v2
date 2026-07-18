import { describe, it, expect } from "vitest";
import { addOrderLinesInputSchema, updateOrderInputSchema } from "./orders";

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
});
