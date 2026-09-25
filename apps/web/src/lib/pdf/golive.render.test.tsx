/** GO-LIVE RENDER PROOF — inert in CI, run with GOLIVE_RENDER=1.
 *  Renders the four goods documents to real A4 PDFs so the centred quantity
 *  can be LOOKED AT, not asserted about. Fonts are registered from local TTFs
 *  (the CDN registration in fonts/noto.ts needs a fetch the runner may not get,
 *  which is why so-preview.render.test.tsx has never actually rendered). */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ON = !!process.env.GOLIVE_RENDER;
const FONTS = process.env.NOTO_DIR ?? "";

async function write(name: string, el: unknown) {
  const { pdf } = await import("@react-pdf/renderer");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stream = await pdf(el as any).toBuffer();
  const chunks: Buffer[] = [];
  await new Promise<void>((res, rej) => {
    stream.on("data", (c: Buffer) => chunks.push(c));
    stream.on("end", () => res());
    stream.on("error", rej);
  });
  const out = path.resolve(__dirname, "../../../", name);
  fs.writeFileSync(out, Buffer.concat(chunks));
  expect(fs.statSync(out).size).toBeGreaterThan(1000);
}

describe.skipIf(!ON)("go-live render", () => {
  it("renders SO · PO · GRN · Invoice", async () => {
    const { Font } = await import("@react-pdf/renderer");
    Font.register({
      family: "Noto Sans SC",
      fonts: [400, 500, 600, 700].map((w) => ({
        src: path.join(FONTS, `noto${w}.ttf`),
        fontWeight: w as 400 | 500 | 600 | 700,
      })),
    });
    Font.registerHyphenationCallback((w) => [w]);
    (globalThis as Record<string, unknown>).__CARRES_LOGO_SRC__ =
      path.resolve(__dirname, "../../../public/carres-logo.png");

    const { SalesOrderTemplate } = await import("./sales-order-template");
    const { PoTemplate } = await import("./po-template");
    const { GrnTemplate } = await import("./grn-template");
    const { InvoiceTemplate } = await import("./invoice-template");

    const goods = [
      { sku: "BOAAT-1A(LHF)", description: "Sofa Boaat 1A (LHF)", qty: 1, unit: "pc", unit_price: 1495, line_total: 1495, category: "Sofa", discount: null, attrs: { fabric: "CG-004 (KN390-4)" } },
      { sku: "B1201F-K", description: "Forte Mattress — King", qty: 12, unit: "pc", unit_price: 2890, line_total: 34680, category: "Mattress", discount: null, attrs: null },
      { sku: "PIL-STD", description: "Pillow Standard", qty: 4, unit: "pc", unit_price: 89, line_total: 356, category: "Accessory", discount: null, attrs: null },
    ];
    const customer = { name: "Jaikrishen Singh", address: "No 23 Jalan SS 3/62, 47300 Petaling Jaya, Selangor", phone: "+60 16-215 7293", email: null, emergency: null };
    const KLANG = { name: "Carres Klang Warehouse", address: "Lot 6515, Batu 5 1/2, Jalan Kapar, 42100 Klang, Selangor" };

    await write("golive-so.pdf", SalesOrderTemplate({
      so_number: "SO-1256", issue_date: "2026-09-23", order_id: "o1", order_code: "SO-1256",
      status_label: "Placed", channel: "showroom", customer,
      dealer: { name: "Carres Klang", contact: null, address: null, outlet_name: "PJ Showroom", outlet_address: null, salesperson_name: "Bernard", salesperson_phone: null },
      delivery: { date: "2026-10-20", floor: null, has_lift: null }, proceed_date: "2026-09-23",
      issued_by: "Shasha", lines: goods, addons: [], payments: [], vouchers: [],
      subtotal: 36531, total: 36531, paid: 0, balance_due: 36531, expected_deposit: null,
      currency: "MYR", signed: false, signature_url: null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any));

    // The REAL production number shape, not the PO-2609-0042 fiction the older
    // fixtures carry — this render is what proves the 67.9mm hero still fits.
    await write("golive-po.pdf", PoTemplate({
      po_number: "PO-20260922-8987", po_id: "PO-20260922-8987", version: 2, issue_date: "2026-09-22",
      supplier: { name: "Nice Future Sdn Bhd", address: "Lot 12, Jalan Perusahaan 3, 81100 Johor Bahru, Johor", contact: "+60 7-236 8800" },
      destination: KLANG, delivery_instructions: null, eta_date: "2026-10-09",
      delivery_working_days: 14, delivery_method: "supplier_delivers", issued_by: "Shasha",
      so_refs: [1256, 1318], terms: null,
      lines: [
        { sku: "B1201F-K", description: "Forte Mattress — King", qty: 12, unit: "pc", destination: KLANG,
          identity_mode: "exact_unit", unit_codes: Array.from({ length: 12 }, (_, i) => `U1-000-${String(i + 1).padStart(3, "0")}`),
          sources: [{ so: 1256, qty: 8 }, { so: 1318, qty: 4 }] },
        { sku: "PIL-STD", description: "Pillow Standard", qty: 4, unit: "pc", destination: KLANG,
          identity_mode: "quantity", unit_codes: [], sources: [{ so: 1256, qty: 4 }] },
      ],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any));

    await write("golive-grn.pdf", GrnTemplate({
      grn_no: "GRN-20260923-0210", grn_doc_date: "2026-09-23T02:00:00Z", status_label: "Valid",
      source: { po_number: "PO-20260922-8987", is_consignment: false },
      supplier: { name: "Nice Future Sdn Bhd" }, supplier_do_no: "DO-77412",
      deliver_to: "Carres Klang Warehouse", goods_arrived_at: "Carres Klang Warehouse",
      goods_received_on: "2026-09-22",
      lines: [
        { sku: "B1201F-K", description: "Forte Mattress — King", category: "Mattress", order_qty: 12, received_qty: 11, damaged_qty: 1, wrong_item_qty: 0, pending_delivery_qty: 1 },
        { sku: "PIL-STD", description: "Pillow Standard", category: "Accessory", order_qty: 4, received_qty: 4, damaged_qty: 0, wrong_item_qty: 0, pending_delivery_qty: 0 },
      ],
      duty: { holder_name: "Li Ching", cover_name: null, actor_name: "Li Ching", authority_label: "GRN Duty", posted_on: "2026-09-23" },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any));

    await write("golive-invoice.pdf", InvoiceTemplate({
      doc_title: "TAX INVOICE", invoice_no: "INV-20260923-4471", issue_date: "2026-09-23",
      order_id: "o1", order_code: "SO-1256", customer,
      dealer: { name: "Carres Klang", contact: null }, lines: goods,
      subtotal: 33825, tax_amount: 2706, total: 36531, currency: "MYR", issued_by: "Shasha",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any));
  }, 180000);
});
