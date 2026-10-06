import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const migration = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "supabase",
  "migrations",
  "0405_supplier_collection_is_governed.sql",
);

describe("supplier collection is one database authority", () => {
  it("enforces configured collector and destination on every PO writer", () => {
    const sql = readFileSync(migration, "utf8");
    expect(sql).toContain("before insert or update of supplier_id, destination_id, procurement_partner_id");
    expect(sql).toContain("collected_by_partner_id");
    expect(sql).toContain("fixed_destination_id");
    expect(sql).toContain("new.procurement_partner_id is distinct from v_partner_id");
    expect(sql).toContain("new.destination_id is distinct from v_destination_id");
  });

  it("refuses unconfigured factory pickup and a partner on own logistics", () => {
    const sql = readFileSync(migration, "utf8");
    expect(sql).toContain("supplier_collection_not_configured");
    expect(sql).toContain("pickup_partner_not_allowed");
  });
});
