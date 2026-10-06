import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * ⭐ UNIT ID BORN WITH OFFICIAL PO — TRACEABLE GOODS AND QUANTITY GOODS
 * (owner ruling 2026-09-07 · Purchasing CARD 10 · migrations 0442 · 0443 · 0444).
 *
 * The law lives in SQL because it must hold under concurrency and must be
 * unreachable from a browser. What this scan holds is the CONTRACT of the
 * committed files: the Catalog mode gate, the line binding, the closed
 * allocators, the destination trigger that no longer mints, and a Receiving
 * that verifies without ever creating. The functional proof is the rolled-back
 * production probe (`scripts/probe-unit-id-birth.sql`), recorded in the Card.
 *
 * Comments are stripped before the FORBIDDEN checks so a sentence explaining
 * the rule cannot fail its own test (the D0.5b lesson).
 */
const MIGRATIONS = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "supabase",
  "migrations",
);

const read = (prefix: string): string => {
  const name = readdirSync(MIGRATIONS).find((f) => f.startsWith(prefix));
  expect(name, `no migration starting ${prefix}`).toBeTruthy();
  return readFileSync(join(MIGRATIONS, name!), "utf8");
};
const strip = (sql: string) => sql.replace(/--[^\n]*/g, "");

const CATALOG = read("0442_");
const BIRTH = read("0443_");
const RECEIVING = read("0444_");
const CATALOG_CODE = strip(CATALOG);
const BIRTH_CODE = strip(BIRTH);
const RECEIVING_CODE = strip(RECEIVING);

/** The body of one `create [or replace] function public.<name>(` … `$…$;`. */
function fn(sql: string, name: string): string {
  const start = sql.search(new RegExp(`create (or replace )?function public\\.${name}\\(`));
  expect(start, `function ${name} not found`).toBeGreaterThanOrEqual(0);
  const rest = sql.slice(start);
  const end = rest.search(/\n\$(function|fn|)\$;/);
  expect(end, `function ${name} has no end marker`).toBeGreaterThan(0);
  return rest.slice(0, end);
}

describe("0442 · Catalog owns the stock identity mode", () => {
  it("stores the mode on the SKU as exactly two values, or NULL for 'Catalog has not said'", () => {
    expect(CATALOG).toMatch(/alter table public\.product_skus\s+add column if not exists stock_identity_mode text/);
    expect(CATALOG).toMatch(/check \(stock_identity_mode in \('exact_unit', 'quantity'\)\)/);
  });

  it("classifies ONCE from the category, with an audit basis, and never at runtime", () => {
    expect(CATALOG).toMatch(/one_time_classification_0442:category=%s/);
    expect(CATALOG).toMatch(/when pm\.category in \('mattress', 'bedframe', 'sofa'\) then 'exact_unit'/);
    expect(CATALOG).toMatch(/when pm\.category = 'accessory' then 'quantity'/);
    /* The trigger that follows only LEDGERS later edits; it never sets a mode. */
    const trg = fn(CATALOG, "trg_product_sku_identity_history");
    expect(trg).not.toMatch(/category/);
    expect(trg).toMatch(/'catalog_edit'/);
  });

  it("snapshots the mode onto the PO line and binds every Unit to its line", () => {
    expect(CATALOG).toMatch(/alter table public\.purchase_order_lines\s+add column if not exists identity_mode text/);
    expect(CATALOG).toMatch(/alter table public\.ops_stock_items\s+add column if not exists po_line_id uuid references public\.purchase_order_lines\(id\)/);
    expect(CATALOG).toMatch(/identity_scope text not null default 'unit'/);
    /* The binding backfill is a PREDICATE (exactly one line of that SKU), not a count. */
    expect(CATALOG).toMatch(/where x\.po_id = l\.po_id and x\.sku = l\.sku\) = 1/);
  });

  it("makes the binding and the scope permanent", () => {
    const perm = fn(CATALOG, "trg_stock_unit_identity_permanence");
    expect(perm).toMatch(/unit_line_immutable/);
    expect(perm).toMatch(/unit_scope_immutable/);
    expect(perm).toMatch(/unit_never_deleted/);
    expect(perm).toMatch(/unit_code_immutable/);
  });

  it("closes both allocators to every client role", () => {
    expect(CATALOG_CODE).toMatch(/revoke all on function public\.allocate_unit_id\(\) from public, anon, authenticated, service_role;/);
    expect(CATALOG_CODE).toMatch(/revoke all on function public\.gen_unit_code\(\) from public, anon, authenticated, service_role;/);
    expect(CATALOG_CODE).not.toMatch(/grant execute on function public\.allocate_unit_id/);
    expect(CATALOG_CODE).not.toMatch(/grant execute on function public\.gen_unit_code/);
  });

  it("asserts no production row count", () => {
    for (const sql of [CATALOG_CODE, BIRTH_CODE, RECEIVING_CODE]) {
      expect(sql).not.toMatch(/count\(\*\)\s*(=|<>|>|<)\s*\d+\s*then\s+raise/i);
    }
  });
});

describe("0443 · the PO number and the Unit IDs are born together, or not at all", () => {
  const inner = fn(BIRTH, "_operation_create_po_inner");
  const batch = fn(BIRTH, "purchasing_issue_pos_batch");

  it("refuses a missing Deliver To by name — the PO now writes it in the same insert", () => {
    /* `purchase_orders.destination_id` is NOT NULL and 0443 writes it with the
       number, so the helper must name the rule rather than let a raw
       constraint speak (measured on production, 2026-09-07). */
    expect(inner).toMatch(/if p_destination_id is null or not exists/);
    expect(inner).toMatch(/active purchasing destination required/);
  });

  it("refuses an unclassified SKU by name BEFORE drawing a PO number", () => {
    const gate = inner.indexOf("catalog_identity_mode_missing");
    const number = inner.indexOf("allocate_formal_document_code('PO')");
    expect(gate).toBeGreaterThan(0);
    expect(number).toBeGreaterThan(gate);
    expect(inner).toMatch(/Set the stock identity \(Unit ID or Quantity\) for % in Catalog before issuing a PO/);
  });

  it("writes every line fact on the line row by its own id — never by (po_id, sku)", () => {
    expect(inner).toMatch(/identity_mode, destination_id,\s+commercial_treatment, commercial_reason, demand_id\)/);
    expect(strip(batch)).not.toMatch(/where po_id = v_po_id and sku = v_line->>'sku'/);
  });

  it("mints exactly one line-bound Unit per piece for an exact-unit line and none for a quantity line", () => {
    expect(inner).toMatch(/if v_mode = 'exact_unit' then/);
    expect(inner).toMatch(/select public\.allocate_unit_id\(\), v_sku, p_warehouse_id, 'incoming',\s+v_supplier_name, v_po_id, v_line_id, 'unit', 'po_mint', current_date\s+from generate_series\(1, v_qty\)/);
    expect(inner).toMatch(/get diagnostics v_minted = row_count/);
    expect(inner).toMatch(/unit_allocation_failed/);
    /* No unconditional mint survives. */
    expect(strip(inner)).not.toMatch(/if v_qty > 0 then\s+insert into ops_stock_items/);
  });

  it("verifies the ledger against the lines inside the same transaction", () => {
    expect(batch).toMatch(/unit_ledger_mismatch/);
    expect(batch).toMatch(/<> case when l\.identity_mode = 'exact_unit' then l\.qty else 0 end/);
  });

  it("units follow the PO — the destination trigger neither voids nor mints", () => {
    const trg = fn(BIRTH, "trg_po_units_follow_destination");
    expect(strip(trg)).not.toMatch(/gen_unit_code|allocate_unit_id|'voided'/);
    expect(trg).toMatch(/set warehouse_id = new\.warehouse_id/);
    expect(BIRTH).toMatch(/create constraint trigger trg_po_units_follow_destination/);
  });

  it("a revision allocates only the additional Units and retires surplus without deleting", () => {
    const rev = fn(BIRTH, "purchasing_revise_po");
    expect(rev).toMatch(/'unit', 'po_revision', current_date\s+from generate_series\(1, v_delta\)/);
    expect(rev).toMatch(/set status = 'voided', updated_at = now\(\)\s+where id in \(\s+select id from ops_stock_items\s+where po_line_id = v_line\.id and status = 'incoming'/);
    expect(strip(rev)).not.toMatch(/delete from ops_stock_items/);
  });

  it("the document prints each line's OWN Units, never voided ones", () => {
    const doc = fn(BIRTH, "purchasing_po_document");
    expect(doc).toMatch(/where si\.po_line_id = l\.id\s+and si\.identity_scope = 'unit'\s+and si\.status <> 'voided'/);
    expect(doc).toMatch(/'identity_mode', l\.identity_mode/);
    expect(strip(doc)).not.toMatch(/where si\.po_no = l\.po_id and si\.sku = l\.sku/);
  });

  it("repairs by predicate — restores the printed IDs the trigger voided, stops if it cannot", () => {
    expect(BIRTH).toMatch(/and status = 'voided'\s+and source_ref = 'po_mint'/);
    expect(BIRTH).toMatch(/preflight_open_traceable_lines_short/);
    /* No CALL to the id- generator anywhere in the birth file (the sanity
       block only names it as a string to prove the trigger no longer does). */
    expect(strip(BIRTH)).not.toMatch(/gen_unit_code\(\)/);
  });
});

describe("0444 · Receiving verifies the identities Purchasing issued", () => {
  const validate = fn(RECEIVING, "warehouse_receipt_validate_lines");
  const engine = fn(RECEIVING, "operation_receive_po_with_do");
  const amend = fn(RECEIVING, "receiving_amend");

  it("refuses to apply while an open exact-unit line is short of its Units", () => {
    expect(RECEIVING).toMatch(/0444 preflight: % open exact-unit line\(s\) are short/);
  });

  it("the validator decides by the line's snapshotted mode, not by the shape of the submission", () => {
    expect(validate).toMatch(/if v_pol\.identity_mode = 'quantity' then/);
    expect(validate).toMatch(/quantity_line_takes_no_units/);
    expect(validate).toMatch(/exact_unit_line_needs_units/);
    expect(validate).toMatch(/line_identity_mode_missing/);
  });

  it("looks a Unit up by its LINE binding and refuses foreign, wrong-line, duplicate and received Units", () => {
    expect(validate).toMatch(/if v_uitem\.po_line_id is distinct from v_line_id then/);
    for (const code of ["unit_unknown", "unit_not_on_this_po", "unit_not_on_this_line", "unit_scanned_twice", "unit_already_received"]) {
      expect(validate, code).toContain(code);
    }
    expect(strip(validate)).not.toMatch(/where public\.normalise_unit_id\(unit_code\) = v_ucode\s+and po_no = p_po_id/);
  });

  it("the engine enforces both modes itself, so a direct caller cannot impersonate one", () => {
    expect(engine).toMatch(/quantity_line_takes_no_units/);
    expect(engine).toMatch(/exact_unit_line_needs_units/);
    expect(engine).toMatch(/unit_outcomes_mismatch/);
    expect(engine).toMatch(/cardinality\(v_recv_ids\) <> v_delta/);
  });

  it("never mints an identity — the shortfall mint is gone from every receiving door", () => {
    for (const [name, body] of [["engine", engine], ["amend", amend], ["validate", validate]] as const) {
      expect(strip(body), name).not.toMatch(/generate_series/);
      expect(strip(body), name).not.toMatch(/allocate_unit_id/);
    }
    /* The only `gen_unit_code()` left is the technical key of a QUANTITY
       register row — never a Unit ID. Every such insert says so. */
    const keyed = (strip(engine) + strip(amend)).match(/gen_unit_code\(\)/g) ?? [];
    const scoped = (strip(engine) + strip(amend)).match(/'quantity', v_rest/g) ?? [];
    expect(keyed.length).toBeGreaterThan(0);
    expect(scoped.length).toBe(keyed.length);
  });

  it("a quantity line becomes a bulk register row, never a Unit, and flips only its own legacy Units", () => {
    expect(engine).toMatch(/where po_line_id = v_line_id and identity_scope = 'unit' and status = 'incoming'/);
    expect(engine).toMatch(/identity_scope, qty, source_ref, date_in\)\s+values\s+\(public\.gen_unit_code\(\), v_sku, v_site, 'free'/);
    expect(strip(engine)).not.toMatch(/where po_no = p_po_id and sku = v_sku and status = 'incoming'/);
  });

  it("the count form learns the line mode and the line binding", () => {
    const incoming = fn(RECEIVING, "warehouse_incoming_pos");
    expect(incoming).toMatch(/'identity_mode',\s+pol\.identity_mode/);
    expect(incoming).toMatch(/'po_line_id', i\.po_line_id/);
    expect(incoming).toMatch(/and i\.identity_scope = 'unit'/);
  });

  it("the bulk-row guard asks the STORED mode, not the category", () => {
    const trg = fn(RECEIVING, "trg_stock_unit_traceable_is_one");
    expect(trg).toMatch(/select s\.stock_identity_mode into v_mode/);
    expect(strip(trg)).not.toMatch(/stock_sku_category|category/);
  });
});
