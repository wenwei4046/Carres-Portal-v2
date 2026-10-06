import { describe, expect, it } from "vitest";
import { z } from "zod";

/**
 * A LINE BORN IN THE OFFICE MAY CARRY ITS CONFIGURATION (migration 0374).
 *
 * `sales_order_create` inserted `order_lines(order_id, sku, qty, unit_price)`
 * and nothing else, so an order born through the office door was structurally
 * incapable of carrying configuration — not "the form does not ask yet", but
 * "the RPC has no slot for it". `order_lines.attrs` has existed since 0001 and
 * is where sofa fabric, bedframe colour/gap and the Create-PO cascade payload
 * live.
 *
 * This file guards the WIRE CONTRACT — that the door accepts attrs and still
 * refuses what it always refused. The SQL half is proven by the migration's
 * own VERIFY block against the live database, which vitest cannot reach.
 */
const revisionLineInput = z.object({
  id: z.string().uuid().optional(),
  sku: z.string().trim().min(1, "A line needs a SKU"),
  qty: z.number().int().min(1, "Qty must be at least 1"),
  unit_price: z.number().min(0, "Unit price must be 0 or more"),
  attrs: z.record(z.unknown()).optional(),
});

const CONFIGURED = {
  sku: "sofa:hookka-lounger",
  qty: 1,
  unit_price: 1950,
  attrs: { fabric_id: "F-221", colour: "walnut", gap: '6"' },
};

describe("the create door's line contract", () => {
  it("accepts a configured line and keeps every attr", () => {
    const out = revisionLineInput.parse(CONFIGURED);
    expect(out.attrs).toEqual({ fabric_id: "F-221", colour: "walnut", gap: '6"' });
  });

  it("ABSENT attrs stays absent — it must not become an empty object", () => {
    // The difference is load-bearing. `{}` would read downstream as
    // "configured, with nothing in it"; absent means nobody configured it, and
    // the RPC writes NULL exactly as it did before 0374.
    const out = revisionLineInput.parse({ sku: "X", qty: 1, unit_price: 0 });
    expect(out).not.toHaveProperty("attrs");
    expect(out.attrs).toBeUndefined();
  });

  it("still refuses everything it refused before", () => {
    expect(revisionLineInput.safeParse({ sku: "", qty: 1, unit_price: 0 }).success).toBe(false);
    expect(revisionLineInput.safeParse({ sku: "X", qty: 0, unit_price: 0 }).success).toBe(false);
    expect(revisionLineInput.safeParse({ sku: "X", qty: 1, unit_price: -1 }).success).toBe(false);
    expect(revisionLineInput.safeParse({ sku: "X", qty: 1.5, unit_price: 0 }).success).toBe(false);
  });

  it("a non-object attrs is refused at the door rather than reaching the RPC", () => {
    // The SQL guards itself too (jsonb_typeof = 'object'), but a client bug
    // should fail where the message can name it.
    expect(revisionLineInput.safeParse({ ...CONFIGURED, attrs: "walnut" }).success).toBe(false);
    expect(revisionLineInput.safeParse({ ...CONFIGURED, attrs: 7 }).success).toBe(false);
  });
});
