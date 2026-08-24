import { describe, expect, it } from "vitest";
import {
  PURCHASING_REFUSAL_CODES,
  purchasingRefusal,
  purchasingRefusalLine,
} from "./purchasing-refusals";

/**
 * THE COPY LAW, PROVED RATHER THAN REVIEWED (`docs/COPY-STANDARD.md`;
 * CARD-2026-08-22-purchasing-02 closure §9).
 *
 * A banned word is easy to write and hard to notice in a 300-line switch, so
 * every code is walked and every line is checked.
 */
const BANNED = [
  "needs attention",
  "next action",
  "something went wrong",
  "pending",
  "waiting",
  "priority",
  "follow up",
  "please try again",
  "an error occurred",
  "unexpected",
  "failed to",
  "invalid",
  "unknown error",
];

describe("purchasing refusals", () => {
  it("answers every governed code by name", () => {
    for (const code of PURCHASING_REFUSAL_CODES) {
      const r = purchasingRefusal(code);
      const fallback = purchasingRefusal("__not_a_code__");
      expect(r.wrong, code).not.toEqual(fallback.wrong);
    }
  });

  it("gives an unknown code an honest fallback that still names an act", () => {
    const r = purchasingRefusal("brand_new_refusal");
    expect(r.wrong).toBe("The Portal refused this purchase order.");
    expect(r.todo).toMatch(/Tell IT/);
  });

  it("never uses a banned word, on any code, in either line", () => {
    for (const code of [...PURCHASING_REFUSAL_CODES, "__unknown__"]) {
      const r = purchasingRefusal(code, {
        sku: "B1201S-K",
        supplier: "Hooka",
        destination: "Carres Klang",
        po: "PO-20260824-4827",
        actor: "Shasha",
        arranged: 10,
        toBuy: 11,
      });
      for (const line of [r.wrong, r.todo]) {
        const lower = line.toLowerCase();
        for (const bad of BANNED) {
          expect(lower.includes(bad), `${code} · "${line}" contains "${bad}"`).toBe(false);
        }
      }
    }
  });

  it("keeps every line short enough for primary school English", () => {
    for (const code of [...PURCHASING_REFUSAL_CODES, "__unknown__"]) {
      const r = purchasingRefusal(code, { sku: "B1201S-K", supplier: "Hooka" });
      for (const line of [r.wrong, r.todo]) {
        expect(line.trim().length, `${code} · "${line}"`).toBeGreaterThan(0);
        expect(line.split(/\s+/).length, `${code} · "${line}"`).toBeLessThanOrEqual(14);
        /* Line 1 is a fact and line 2 is an act; both end as sentences. */
        expect(line.endsWith("."), `${code} · "${line}"`).toBe(true);
      }
    }
  });

  it("names the document, the supplier and the SKU when it is given them", () => {
    expect(purchasingRefusal("stale_po_version", { po: "PO-20260824-4827" }).wrong).toBe(
      "PO-20260824-4827 changed after you opened it.",
    );
    expect(
      purchasingRefusal("commercial_approval_required", { sku: "B1201S-K", supplier: "Hooka" }),
    ).toEqual({
      wrong: "Nobody approved this price for B1201S-K.",
      todo: "Ask a manager to approve the price of B1201S-K for Hooka.",
    });
    expect(purchasingRefusal("inactive_destination", { destination: "AL Sungai Buloh" }).wrong).toBe(
      "AL Sungai Buloh is closed.",
    );
  });

  it("falls back to a plain noun rather than printing an empty gap", () => {
    expect(purchasingRefusal("cost_required", { sku: "  " }).wrong).toBe(
      "This item has no transaction cost.",
    );
    expect(purchasingRefusal("pickup_partner_required", { supplier: null }).wrong).toBe(
      "the supplier does not deliver. Nobody is collecting.",
    );
  });

  it("prints the arranged and required quantities when the split does not add up", () => {
    expect(purchasingRefusal("allocation_mismatch", { arranged: 10, toBuy: 11 }).wrong).toBe(
      "You arranged 10 units and must buy 11.",
    );
    expect(purchasingRefusal("allocation_mismatch", {}).wrong).toBe(
      "The arranged quantity does not match the quantity to buy.",
    );
  });

  it("joins the two lines for a surface with room for one", () => {
    expect(purchasingRefusalLine("no_warehouse")).toBe(
      "No Carres warehouse is set up. Ask Purchasing to add the Klang warehouse in Settings.",
    );
  });
});
