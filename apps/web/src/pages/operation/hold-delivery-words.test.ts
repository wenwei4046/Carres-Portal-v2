/**
 * `Hold delivery` ON DELIVERY'S OWN SURFACES — the retired words stay retired.
 *
 * Owner rulings 2026-09-25 (`docs/delivery/MASTER.md` §3, COPY "Hold
 * delivery") and 2026-09-26 (§5.4, COPY "NETS arrange page"). A source scan,
 * because a word that comes back in a constant, a header comment or an inline
 * string all reach a reader the same way — and the 2026-09-25 measurement was
 * exactly that: the ruling was written, the words stayed on screen.
 *
 * Scoped to the surfaces this item owns. The Payment desk, the Warehouse
 * Schedule and the Work Logistics card are their own lanes and are guarded
 * there.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

/** The link page's words live in `LINK_COPY`; the rest of that file is the
 *  Work Logistics card (Workspace lane), so only the object is scanned. */
function linkCopySource(): string {
  const text = read("packages/shared/src/logistics-card.ts");
  const start = text.indexOf("export const LINK_COPY = {");
  const end = text.indexOf("} as const;", start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return text.slice(start, end);
}

const PAYMENT_WORDS = ["Do not deliver", "still to collect", "Finance is holding this delivery"] as const;
const NETS_WORDS = ["Confirmed date", "Time window", "Save Delivery Arrangement"] as const;

const PAYMENT_SURFACES = [
  "apps/web/src/pages/operation/delivery-monitor.ts",
  "apps/web/src/pages/operation/OperationDelivery.tsx",
  "apps/web/src/pages/operation/components/MonitorTwoLines.tsx",
  "apps/web/src/pages/operation/DeliveryOrderPage.tsx",
  "apps/web/src/pages/partner/PartnerArrangePage.tsx",
  "apps/web/src/pages/public/DeliveryLinkPage.tsx",
  "apps/api/src/routes/partner/deliveries.ts",
  "apps/api/src/routes/public/delivery-link.ts",
  "apps/api/src/lib/delivery-hold.ts",
];

const NETS_SURFACES = [
  "apps/web/src/pages/partner/PartnerArrangePage.tsx",
  "apps/web/src/pages/public/DeliveryLinkPage.tsx",
  "apps/api/src/routes/partner/deliveries.ts",
  "apps/api/src/routes/public/delivery-link.ts",
];

describe("Hold delivery — the retired words never return to Delivery's own surfaces", () => {
  it("no retired payment word on Monitor, the DO object, the NETS page or the external link", () => {
    const offenders = [
      ...PAYMENT_SURFACES.map((path) => ({ path, text: read(path) })),
      { path: "LINK_COPY", text: linkCopySource() },
    ].flatMap(({ path, text }) => PAYMENT_WORDS.filter((w) => text.includes(w)).map((w) => `${path}: ${w}`));
    expect(offenders).toEqual([]);
  });

  it("no retired NETS field or act word on the partner page or the link", () => {
    const offenders = [
      ...NETS_SURFACES.map((path) => ({ path, text: read(path) })),
      { path: "LINK_COPY", text: linkCopySource() },
    ].flatMap(({ path, text }) => NETS_WORDS.filter((w) => text.includes(w)).map((w) => `${path}: ${w}`));
    expect(offenders).toEqual([]);
  });

  it("the governed words are present where they are owed (non-vacuity)", () => {
    expect(read("apps/web/src/pages/operation/delivery-monitor.ts")).toContain("unpaid");
    const partner = read("apps/web/src/pages/partner/PartnerArrangePage.tsx");
    for (const w of ["Scheduled date", "Scheduled time (optional)", "ETA (optional)", "Save delivery date", "Hold delivery"]) {
      expect(partner).toContain(w);
    }
    expect(linkCopySource()).toContain('"Hold delivery"');
  });

  it("the partner and link surfaces print no money and no Finance reason", () => {
    for (const path of [
      "apps/web/src/pages/partner/PartnerArrangePage.tsx",
      "apps/web/src/pages/public/DeliveryLinkPage.tsx",
    ]) {
      const text = read(path);
      expect(text, path).not.toMatch(/fmtMoney|financeHoldLineOf|Finance hold|unpaid|outstanding/);
    }
  });
});
