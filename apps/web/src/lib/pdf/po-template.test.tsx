import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isValidElement, type ReactElement } from "react";
import { PoTemplate } from "./po-template";
import type { PoTemplateData } from "./types";

/**
 * P4 (migration 0307, Loo 2026-07-29) — the external purchase order document
 * carries NO purchase price and NO RM amount of any kind, for ANY external
 * recipient, and the template is not split to keep prices for one of them.
 *
 * Two different assertions, on purpose, because either alone is a false
 * comfort:
 *
 *   · the ELEMENT WALK proves nothing renders money for the data it was given
 *     — but it only sees the branches this fixture reaches;
 *   · the SOURCE SCAN proves the template does not ASK for money at all — a
 *     template that still reads `unit_price` would print it again the moment
 *     somebody widened the payload, and no fixture would have caught that.
 */

/** Every string this element tree would render, flattened. */
function renderedText(node: unknown, out: string[] = []): string[] {
  if (node == null || node === false || node === true) return out;
  if (typeof node === "string" || typeof node === "number") {
    out.push(String(node));
    return out;
  }
  if (Array.isArray(node)) {
    for (const n of node) renderedText(n, out);
    return out;
  }
  if (isValidElement(node)) {
    const el = node as ReactElement<{ children?: unknown }>;
    renderedText(el.props?.children, out);
    return out;
  }
  return out;
}

function doc(over: Partial<PoTemplateData> = {}): PoTemplateData {
  return {
    po_number: "PO-9801",
    issue_date: "2026-05-04",
    po_id: "PO-9801",
    supplier: { name: "Ohana", address: null, contact: "+60 3-1234 5678" },
    destination: { name: "AL Sungai Buloh", address: "12 Jalan Test, Sungai Buloh" },
    delivery_instructions: null,
    eta_date: "2026-06-01",
    lines: [
      { sku: "MAT-K-001", description: "King Mattress 200x200", qty: 5, unit: "pc", attrs: {} },
      {
        sku: "BED-K-002",
        description: "Oak Bedframe King",
        qty: 3,
        unit: "pc",
        // A sofa line as the DATABASE now hands it over: the allowlist keeps
        // `fabric_name` and strips `fabric_surcharge`. The extra key is passed
        // anyway to prove the template ignores it even if one ever arrives.
        attrs: { color: "Walnut", gap: "14", fabric_name: "Linen Beige", fabric_surcharge: 250 },
      },
    ],
    terms: null,
    ...over,
  };
}

// Resolved from the vitest root (`apps/web`) rather than from `import.meta.url`
// — under the jsdom environment that is not a `file:` URL.
const SOURCE = readFileSync(join(process.cwd(), "src/lib/pdf/po-template.tsx"), "utf8");

describe("PO template — the external document prints no money", () => {
  it("renders no RM, no MYR and no amount", () => {
    const text = renderedText(PoTemplate(doc())).join("\n");
    expect(text).not.toMatch(/\bRM\b/);
    expect(text).not.toMatch(/\bMYR\b/);
    expect(text).not.toMatch(/\bTotal\b/);
    expect(text).not.toMatch(/Unit Price/);
    expect(text).not.toMatch(/Line Total/);
    // 250 is the surcharge in the fixture. It rides inside `attrs`, which is
    // how a price survived every earlier removal of the named money fields.
    expect(text).not.toMatch(/250/);
  });

  it("still tells the supplier which version to make", () => {
    const text = renderedText(PoTemplate(doc())).join("\n");
    expect(text).toContain("Walnut · gap 14 · Linen Beige");
    expect(text).toContain("King Mattress 200x200");
    expect(text).toContain("5");
  });

  it("prints where the goods go, in the locked words", () => {
    const text = renderedText(PoTemplate(doc())).join("\n");
    expect(text).toContain("Where the goods go");
    expect(text).toContain("AL Sungai Buloh");
    expect(text).toContain("12 Jalan Test, Sungai Buloh");
    // The retired heading, and the three words COPY-STANDARD refuses.
    expect(text).not.toContain("Buyer");
    expect(text).not.toMatch(/Ship-to|Destination|Drop point/);
    // Settings' own word may never reach this document.
    expect(text).not.toContain("Address not set");
  });

  it("prints delivery instructions when there are any, and nothing when there are none", () => {
    const withText = renderedText(
      PoTemplate(doc({ delivery_instructions: "Call the guard house on arrival." })),
    ).join("\n");
    expect(withText).toContain("Delivery instructions");
    expect(withText).toContain("Call the guard house on arrival.");

    const without = renderedText(PoTemplate(doc())).join("\n");
    expect(without).not.toContain("Delivery instructions");
  });

  it("does not ASK for money — the source reads no price field", () => {
    // Comments are stripped first: this file's own notes name the very fields
    // they explain are gone, and a scan that read them would fail on the
    // explanation rather than on the code (the D0.5b `font-bold` lesson).
    const code = SOURCE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(code).not.toMatch(/unit_price/);
    expect(code).not.toMatch(/line_total/);
    expect(code).not.toMatch(/grand_total/);
    expect(code).not.toMatch(/fabric_surcharge/);
    expect(code).not.toMatch(/currency/);
    expect(code).not.toMatch(/formatMoney/);
    expect(code).not.toMatch(/\bbuyer\b/);
  });
});
