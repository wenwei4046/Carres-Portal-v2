import { describe, it, expect, beforeEach } from "vitest";
import { http, passthrough } from "msw";
import { server } from "../../test/server";
import { renderDoPdf, renderPoPdf } from "./render";
import type { DoTemplateData, PoTemplateData } from "./types";

// @react-pdf/renderer fetches Noto Sans SC TTFs from jsdelivr at first render.
// Pass these requests through to the real CDN — the fetch is the same in
// production. The global setup.ts uses `onUnhandledRequest: "error"`, so
// without this passthrough MSW would refuse the network call.
//
// Re-registered per test because the global setup.ts resetHandlers() in
// afterEach wipes server.use() handlers between tests.
beforeEach(() => {
  server.use(
    http.get("https://cdn.jsdelivr.net/fontsource/fonts/noto-sans-sc@latest/*", () => passthrough()),
  );
});

const minimalDo: DoTemplateData = {
  do_number: "DO-2026-00001",
  issue_date: "2026-05-04",
  order_id: "11111111-1111-1111-1111-111111111111",
  order_code: "ORD-202605-0001",
  customer: {
    name: "Lim Ah Kau Family Sdn Bhd",
    address: "12, Jalan Test 3/4, 47800 Petaling Jaya, Selangor",
    phone: "+60 12-345 6789",
  },
  dealer: {
    name: "Carres KL Dealer",
    contact: "Sarah Tan / +60 13-111 2222",
  },
  partner: { name: "GD Express" },
  lines: [
    {
      sku: "SOFA-001",
      description: "3-seater Linen Sofa, Warm Beige",
      qty: 1,
      unit: "pc",
      line_total: 4_500.0,
    },
    {
      sku: "TBL-014",
      description: "Solid Oak Coffee Table",
      qty: 2,
      unit: "pc",
      line_total: 1_800.0,
    },
  ],
  currency: "MYR",
};

const minimalPo: PoTemplateData = {
  po_number: "PO-2026-00007",
  issue_date: "2026-05-04",
  po_id: "22222222-2222-2222-2222-222222222222",
  supplier: {
    name: "Furniture Source Co. Ltd.",
    address: "Block A, Industrial Park, Foshan",
    contact: "Mr. Wang / +86 139 0000 0000",
  },
  buyer: { name: "Carres HQ", contact: "procurement@carres.my" },
  lines: [
    {
      sku: "SOFA-001",
      description: "3-seater Linen Sofa frame",
      qty: 10,
      unit: "pc",
      unit_price: 2_200.0,
      line_total: 22_000.0,
    },
  ],
  grand_total: 22_000.0,
  currency: "MYR",
  terms: "Payment 30% deposit + 70% on shipment. FOB Foshan.",
};

// Magic header for PDFs — every conforming file starts with "%PDF-".
function isPdfHeader(bytes: Uint8Array): boolean {
  return (
    bytes.length > 5 &&
    bytes[0] === 0x25 && // %
    bytes[1] === 0x50 && // P
    bytes[2] === 0x44 && // D
    bytes[3] === 0x46 && // F
    bytes[4] === 0x2d //   -
  );
}

describe("renderDoPdf", () => {
  it("returns a non-empty Uint8Array starting with the %PDF- header", async () => {
    const bytes = await renderDoPdf(minimalDo);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.byteLength).toBeGreaterThan(1024);
    expect(isPdfHeader(bytes)).toBe(true);
  }, 30_000);

  it("handles a single-line DO without a partner", async () => {
    const bytes = await renderDoPdf({
      ...minimalDo,
      partner: null,
      lines: [minimalDo.lines[0]],
    });
    expect(isPdfHeader(bytes)).toBe(true);
    expect(bytes.byteLength).toBeGreaterThan(1024);
  }, 30_000);
});

describe("renderPoPdf", () => {
  it("returns a non-empty Uint8Array starting with the %PDF- header", async () => {
    const bytes = await renderPoPdf(minimalPo);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.byteLength).toBeGreaterThan(1024);
    expect(isPdfHeader(bytes)).toBe(true);
  }, 30_000);

  it("handles a PO without optional terms / supplier address", async () => {
    const bytes = await renderPoPdf({
      ...minimalPo,
      supplier: { ...minimalPo.supplier, address: null, contact: null },
      terms: null,
    });
    expect(isPdfHeader(bytes)).toBe(true);
    expect(bytes.byteLength).toBeGreaterThan(1024);
  }, 30_000);
});
