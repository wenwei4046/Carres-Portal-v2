/**
 * SO PREVIEW HARNESS — renders a real A4 PDF from sample data so a layout
 * change can be MEASURED instead of argued about (owner round 24 gave the
 * measurement sheet; this is how we check the render still obeys it).
 *
 * Inert in CI. Run it on purpose:
 *   SO_PREVIEW=1 pnpm --filter web vitest run src/lib/pdf/so-preview.render.test.tsx
 * Output: apps/web/so-preview.pdf
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ON = !!process.env.SO_PREVIEW;

describe.skipIf(!ON)("SO preview", () => {
  it("renders", async () => {
    const logo = path.resolve(__dirname, "../../../public/carres-logo.png");
    (globalThis as Record<string, unknown>).__CARRES_LOGO_SRC__ = logo;
    const { pdf } = await import("@react-pdf/renderer");
    const { SalesOrderTemplate } = await import("./sales-order-template");
    const data = {
      so_number: "SO-1256",
      issue_date: "2026-09-21",
      order_id: "o1",
      order_code: "SO-1256",
      status_label: "Placed",
      channel: "showroom" as const,
      customer: {
        name: "Jaikrishen Singh",
        address: "No 23 Jalan SS 3/62, Taman Universiti, 47300 Petaling Jaya, Selangor",
        phone: "+60 16-215 7293",
        email: "jaikrishen@gmail.com",
        emergency: "Mona Doal · +60 17-339 8639 (Spouse)",
      },
      dealer: {
        name: "Carres Klang",
        contact: null,
        address: null,
        outlet_name: "PJ Showroom",
        outlet_address: null,
        salesperson_name: "Bernard",
        salesperson_phone: null,
      },
      delivery: { date: "2026-10-20", floor: 3, has_lift: false },
      proceed_date: "2026-09-21",
      issued_by: "Shasha",
      lines: [
        { sku: "BOAAT-1A(LHF)", description: "Sofa Boaat 1A (LHF)", qty: 1, unit_price: 1495, line_total: 1495, category: "Sofa", discount: null, attrs: { fabric: "CG-004 (KN390-4)", leg: '2"' } },
        { sku: "BOAAT-1A(RHF)", description: "Sofa Boaat 1A (RHF)", qty: 1, unit_price: 1495, line_total: 1395, category: "Sofa", discount: 100, attrs: null },
        { sku: "B1201F-K", description: "Forte Mattress — King", qty: 1, unit_price: 2890, line_total: 2890, category: "Mattress", discount: null, attrs: null },
      ],
      addons: [{ label: "Delivery fee", sku: "SVC-DELIVERY", qty: 1, unit_price: 250, line_total: 250, attrs: null }],
      payments: [
        { label: "Instalment · 12 months", reference: "819884", approval_code: "819884", collected_by: "Bernard", date: "2026-09-21", amount: 3240 },
        { label: "Bank transfer", reference: null, approval_code: null, collected_by: "Shasha", date: "2026-09-21", amount: 500 },
      ],
      vouchers: [],
      subtotal: 6030,
      total: 6030,
      paid: 3740,
      balance_due: 2290,
      expected_deposit: 3240,
      currency: "MYR",
      signed: false,
      signature_url: null,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buf = await pdf(SalesOrderTemplate(data as any) as any).toBuffer();
    const chunks: Buffer[] = [];
    await new Promise<void>((res, rej) => {
      buf.on("data", (c: Buffer) => chunks.push(c));
      buf.on("end", () => res());
      buf.on("error", rej);
    });
    const out = path.resolve(__dirname, "../../../so-preview.pdf");
    fs.writeFileSync(out, Buffer.concat(chunks));
    expect(fs.statSync(out).size).toBeGreaterThan(1000);
  }, 120000);
});
