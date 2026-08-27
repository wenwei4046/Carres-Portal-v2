import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const MIGRATIONS = join(ROOT, "supabase", "migrations");

function migration(prefix: string): string {
  const file = readdirSync(MIGRATIONS).find((name) => name.startsWith(prefix));
  expect(file, `missing migration ${prefix}`).toBeTruthy();
  return readFileSync(join(MIGRATIONS, file!), "utf8");
}

const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

describe("Sales final submit is the Sales → Purchasing handoff", () => {
  it("uses one governed transition for automatic and recovery handoff", () => {
    const sql = migration("0391_");
    expect(sql).toMatch(/create or replace function public\._sales_order_proceed\(/i);
    expect(sql).toMatch(/create or replace function public\.proceed_order\([\s\S]*?_sales_order_proceed\(/i);
    expect(sql).toMatch(/create or replace function public\.create_order_from_sales_portal\([\s\S]*?create_order\([\s\S]*?_sales_order_proceed\(/i);
    expect(sql).toMatch(/revoke all on function public\._sales_order_proceed/i);
  });

  it("re-checks only final-submitted orders after governed writers reach their final transaction state", () => {
    const sql = migration("0391_");
    expect(sql).toMatch(/add column if not exists sales_final_submitted_at timestamptz/i);
    expect(sql).toMatch(/create constraint trigger orders_auto_handoff_deferred[\s\S]*?deferrable initially deferred/i);
    expect(sql).toMatch(/create constraint trigger order_lines_auto_handoff_deferred[\s\S]*?deferrable initially deferred/i);
    expect(sql).toMatch(/create constraint trigger order_addons_auto_handoff_deferred[\s\S]*?deferrable initially deferred/i);
    expect(sql).toMatch(/after insert or update of[\s\S]*?sales_final_submitted_at[\s\S]*?paid[\s\S]*?status[\s\S]*?on public\.orders/i);
    expect(sql).toMatch(/order_lines_auto_handoff_deferred[\s\S]*?update of order_id, qty, unit_price/i);
    expect(sql).toMatch(/order_addons_auto_handoff_deferred[\s\S]*?update of order_id, qty, unit_price/i);
    expect(sql).toMatch(/old\.status = 'proceed_order'[\s\S]*?new\.status = 'place'[\s\S]*?return/i);
    expect(sql).toMatch(/status = 'place'[\s\S]*?sales_final_submitted_at is not null[\s\S]*?for update/i);
    expect(sql).toMatch(/sales_final_submitted_at is not null[\s\S]*?perform public\._sales_order_proceed\(/i);
    expect(sql).toMatch(/alter function public\.add_order_lines\(uuid,jsonb,text,uuid,jsonb,jsonb\)[\s\S]*?rename to _add_order_lines_0391_locked_impl/i);
    expect(sql).toMatch(/create or replace function public\._sales_order_lock_for_edit\([\s\S]*?where id = p_order_id[\s\S]*?for update;[\s\S]*?cross-dealer order edit/i);
    expect(sql).toMatch(/create function public\.add_order_lines\([\s\S]*?_sales_order_lock_for_edit\(p_order_id\)[\s\S]*?_add_order_lines_0391_locked_impl\(/i);
    expect(sql).toMatch(/revoke all on function public\._add_order_lines_0391_locked_impl\([\s\S]*?authenticated, service_role/i);
    expect(sql).toMatch(/create function public\.update_order\([\s\S]*?_sales_order_lock_for_edit\(p_order_id\)[\s\S]*?_update_order_0391_locked_impl\(/i);
    expect(sql).toMatch(/create function public\.set_order_address\([\s\S]*?_sales_order_lock_for_edit\(p_order_id\)[\s\S]*?_set_order_address_0391_locked_impl\(/i);
    expect(sql).toMatch(/create function public\.set_order_date\([\s\S]*?_sales_order_lock_for_edit\(p_order_id\)[\s\S]*?_set_order_date_0391_locked_impl\(/i);
    expect(sql).toMatch(/create function public\.unproceed_order\([\s\S]*?_sales_order_lock_for_edit\(p_order_id\)[\s\S]*?_unproceed_order_0391_locked_impl\(/i);
    expect(sql).not.toMatch(/\bdrop\s+(trigger|function|table|view|type)\b/i);
    expect(sql).not.toMatch(/set constraints[\s\S]*?immediate/i);
    expect(sql).not.toMatch(/create trigger orders_auto_handoff_after_update\s+after update on/i);
  });

  it("records the actual handoff and gives legacy recovery one exact-ID authority", () => {
    const sql = migration("0391_");
    expect(sql).toMatch(/add column if not exists proceeded_at timestamptz/i);
    expect(sql).toMatch(/new\.proceeded_at := now\(\)/i);
    expect(sql).toMatch(/new\.proceeded_at := null/i);
    expect(sql).toMatch(/with current_handoff as \([\s\S]*?max\(h\.occurred_at\)[\s\S]*?metadata->>'kind' = 'proceed'[\s\S]*?set proceeded_at = coalesce\(o\.proceeded_at, h\.occurred_at\)/i);
    expect(sql).toMatch(/create or replace function public\.recover_legacy_sales_final_submits\([\s\S]*?p_order_ids uuid\[\][\s\S]*?p_reason text/i);
    expect(sql).toMatch(/v_role <> 'principal'[\s\S]*?reason_required[\s\S]*?for update of o/i);
    expect(sql).toMatch(/source_system is not null or v_order\.source_ref is not null[\s\S]*?rental_agreements[\s\S]*?created_office/i);
    expect(sql).toMatch(/sales_final_submit_recovered[\s\S]*?order\.sales_final_submit\.recovered[\s\S]*?_sales_order_proceed\(/i);
    expect(sql).not.toMatch(/do \$repair\$/i);
    expect(sql).not.toMatch(/portal_births/i);
    expect(sql).not.toMatch(/h\.by_role in \('dealer','salesperson','showroom','finance','bd'\)/i);
    const transition = sql.slice(
      sql.indexOf("create or replace function public._sales_order_proceed"),
      sql.indexOf("revoke all on function public._sales_order_proceed"),
    );
    expect(transition).not.toContain("sales_final_submitted_at");
  });

  it("keeps raw draft creation separate from final Sales Portal submission", () => {
    const sql = migration("0391_");
    const route = read("apps/api/src/routes/orders.ts");
    expect(route).toMatch(/rpc\("create_order_from_sales_portal", \{ payload \}\)/);
    const raw = route.slice(route.indexOf('ordersRouter.post("/raw"'));
    expect(raw).toMatch(/rpc\("create_raw_order", \{ payload \}\)/);
    expect(raw).not.toMatch(/create_order_from_sales_portal/);
    expect(sql).toMatch(/create or replace function public\.create_raw_order\([\s\S]*?v_role not in \('principal','operation'\)[\s\S]*?public\.create_order\(payload\)/i);
    expect(sql).toMatch(/keep its existing[\s\S]*?database-first compatibility window/i);
    expect(sql).not.toMatch(/revoke all on function public\.create_order\(jsonb\)[\s\S]*?authenticated/i);
    expect(route).not.toMatch(/rpc\("create_order", \{ payload \}\)/);
    const portal = sql.slice(sql.indexOf("create or replace function public.create_order_from_sales_portal"));
    const rawSql = sql.slice(sql.indexOf("create or replace function public.create_raw_order"));
    expect(portal).toMatch(/set sales_final_submitted_at = now\(\)/i);
    expect(rawSql.slice(0, rawSql.indexOf("$fn$;", 10))).not.toContain("sales_final_submitted_at");
  });

  it("retires the direct birth primitive after the new Worker is live", () => {
    const cutover = migration("0392_");
    const route = read("apps/api/src/routes/orders.ts");

    expect(cutover).toMatch(
      /apply only after[\s\S]*?Worker[\s\S]*?production SHA is verified/i,
    );
    expect(cutover).toMatch(
      /revoke execute on function public\.create_order\(jsonb\)[\s\S]*?public, anon, authenticated/i,
    );
    expect(cutover).toMatch(
      /alter function public\.recover_legacy_sales_final_submits\(uuid\[\],text\)[\s\S]*?rename to _recover_legacy_sales_final_submits_0391_impl/i,
    );
    expect(cutover).toMatch(
      /o\.status not in \('place', 'proceed_order'\)[\s\S]*?detail = 'wrong_status'/i,
    );
    expect(cutover).toMatch(
      /return public\._recover_legacy_sales_final_submits_0391_impl\(/i,
    );
    expect(route).not.toMatch(/rpc\("create_order", \{ payload \}\)/);
    expect(route).toMatch(/rpc\("create_order_from_sales_portal", \{ payload \}\)/);
    expect(route).toMatch(/rpc\("create_raw_order", \{ payload \}\)/);
  });

  it("fails closed for orphan authenticated callers and authorizes Proceed under the row lock", () => {
    const sql = migration("0391_");
    const portal = sql.slice(sql.indexOf("create or replace function public.create_order_from_sales_portal"));
    expect(portal).toMatch(/if v_role is null[\s\S]*?v_role not in \([\s\S]*?'dealer','salesperson','showroom',[\s\S]*?'principal','operation','finance','bd'[\s\S]*?public\.create_order\(payload\)/i);
    expect(sql).toMatch(/create or replace function public\.proceed_order\([\s\S]*?v_role not in \([\s\S]*?'dealer','salesperson','showroom'[\s\S]*?select \* into v_order[\s\S]*?where id = p_order_id[\s\S]*?dealer_id is not distinct from v_caller_dealer_id[\s\S]*?for update;[\s\S]*?cross-dealer proceed/i);
  });

  it("does not ask the Sales browser to press Proceed a second time", () => {
    const page = read("apps/web/src/pages/dealer/DealerPos.tsx");
    const payment = read("apps/web/src/pages/dealer/new-order/Step3SignaturePayment.tsx");
    const thankYou = read("apps/web/src/pages/dealer/new-order/ThankYou.tsx");
    expect(page).not.toContain("useProceedOrder");
    expect(page).not.toContain("auto-proceed failed");
    expect(page).not.toMatch(/if \(draft\.delivery\.asap\)[\s\S]*?proceed/i);
    expect(payment).toContain("Operations receives this order automatically");
    expect(payment).not.toContain("eligible for");
    expect(thankYou).toContain("Operations has received this order");
    expect(thankYou).not.toContain("until it's proceeded");
  });

  it("shows the actual handoff in SO Batch Purchase, not planned production start", () => {
    const contract = read("packages/shared/src/so-batch-purchase.ts");
    const demandRead = read("apps/api/src/lib/purchase-demand-read.ts");
    const register = read("apps/web/src/pages/operation/so-batch/SoBatchRegister.tsx");
    expect(contract).toContain("proceededAt");
    expect(demandRead).toContain("proceeded_at");
    expect(register).toContain("o.proceededAt");
    expect(contract).not.toMatch(/orders\.proceed_date[^\n]*Operations received/i);
  });
});
