/**
 * RETIRED COMPONENTS — a one-way ratchet (ONE KIT LAW, Jess 2026-09-27; owner
 * instruction 2026-10-04: "add a check so old components are never referenced again").
 *
 * Each retired recipe lists the files that still import it TODAY. A new importer
 * fails. A listed file that no longer imports it also fails, so the list can only
 * shrink and is kept honest. When a list reaches zero, the component file must be
 * deleted in the same change — the last test asserts that.
 *
 * Do not add a file to a list to make this pass. Use the kit replacement named
 * beside it; if the replacement changes what the operator sees, show the owner a
 * preview first (UI MASTER · Current kit index).
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");

const RETIRED: Record<string, { file: string; replacement: string; allow: string[] }> = {
  Btn: {
    file: "components/Btn.tsx",
    replacement: "components/kit/Button",
    allow: [
      "pages/hr/HrCommissionRunPanel.tsx",
      "pages/hr/HrPeopleCostTab.tsx",
      "pages/hr/HrPerformanceTab.tsx",
      "pages/hr/HrPersonDrawer.tsx",
      "pages/hr/HrSetupTab.tsx",
      "pages/hr/HrTeamTab.tsx",
      "pages/operation/components/GenerateInvoiceOverlay.tsx",
      "pages/operation/components/LoanPanel.tsx",
      "pages/operation/components/OrderDetailDrawer.tsx",
      "pages/operation/components/StockPickerGrid.tsx",
    ],
  },
  Field: {
    file: "components/Field.tsx",
    replacement: "components/kit/Input · Select · Textarea · field-recipe",
    allow: [
      "pages/finance/ARDrawer.tsx",
      "pages/finance/department.tsx",
      "pages/finance/payables/PayablesParts.tsx",
      "pages/finance/payables/PaymentVouchers.tsx",
      "pages/finance/payables/SupplierBills.tsx",
      "pages/finance/payables/VoucherAdvance.tsx",
      "pages/hr/HrCommissionRunPanel.tsx",
      "pages/hr/HrPeopleCostTab.tsx",
      "pages/hr/HrPerformanceTab.tsx",
      "pages/hr/HrPersonDrawer.tsx",
      "pages/hr/HrSetupTab.tsx",
      "pages/hr/HrTeamTab.tsx",
      "pages/operation/ArrivalSourceWorkspace.tsx",
      "pages/operation/components/OrderDetailDrawer.tsx",
    ],
  },
  PageHeader: {
    file: "components/PageHeader.tsx",
    replacement: "components/kit/PageShell",
    allow: [
      "pages/hr/HrApp.tsx",
      "pages/warehouse/WarehouseIncoming.tsx",
      "pages/warehouse/WarehouseMyReceipts.tsx",
      "pages/warehouse/WarehouseOutboundDoor.tsx",
    ],
  },
};

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) sourceFiles(p, out);
    else if (/\.(tsx?|jsx?)$/.test(name) && !/\.test\./.test(name)) out.push(p);
  }
  return out;
}

const FILES = sourceFiles(SRC).map((p) => ({ rel: relative(SRC, p).split("\\").join("/"), text: readFileSync(p, "utf8") }));

function importers(name: string): string[] {
  const re = new RegExp(`from\\s*["'](?:@/components/|(?:\\.\\.?/)+(?:components/)?)${name}["']`);
  return FILES.filter((f) => f.rel !== RETIRED[name].file && re.test(f.text)).map((f) => f.rel).sort();
}

describe("retired components never gain a new importer", () => {
  it("scans the source tree", () => {
    expect(FILES.length).toBeGreaterThan(300);
  });

  for (const [name, r] of Object.entries(RETIRED)) {
    it(`${name}: no file outside the shrinking list imports it (use ${r.replacement})`, () => {
      const extra = importers(name).filter((f) => !r.allow.includes(f));
      expect(extra, `New import of retired ${name}. Use ${r.replacement}.`).toEqual([]);
    });

    it(`${name}: every listed file still imports it (remove migrated files from the list)`, () => {
      const now = importers(name);
      const stale = r.allow.filter((f) => !now.includes(f));
      expect(stale, `Migrated off ${name}; delete these lines from the list.`).toEqual([]);
    });

    it(`${name}: deleted once nothing imports it`, () => {
      if (r.allow.length === 0) expect(existsSync(join(SRC, r.file)), `${r.file} has no importers; delete it.`).toBe(false);
    });
  }
});
