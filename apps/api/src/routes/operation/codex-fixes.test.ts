import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

// Phase 4.5 Chunk 1 — Codex outside-voice review F1-F12 fix verification.
// Each test asserts the FINAL committed source, not behavior.
// Reads migration / TS source from disk via fs.readFileSync.
//
// __dirname here resolves to apps/api/src/routes/operation/. Walk up 5 levels
// to repo root (operation → routes → src → api → apps → repo).

const repoRoot = path.resolve(__dirname, "../../../../..");
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), "utf-8");

const MIG_0042 = read("supabase/migrations/0042_storage_dos_bucket.sql");
const MIG_0044 = read("supabase/migrations/0044_po_dispatch_fields.sql");
const MIG_0045 = read("supabase/migrations/0045_logistics_rpcs_chunk1.sql");
const MIG_0046 = read("supabase/migrations/0046_partner_role_rls.sql");
const MIG_0047 = read("supabase/migrations/0047_orders_rollup_stage_amend.sql");
const STORAGE_DOS = read("apps/api/src/routes/storage/dos.ts");

// Strip `-- line comments` from SQL — the absence-checks need to look at SQL
// statements only, since explanatory comments often mention what was REJECTED
// (e.g. "partner_rejection_reason intentionally NOT added").
function stripSqlComments(sql: string): string {
  return sql
    .split("\n")
    .map((line) => {
      const idx = line.indexOf("--");
      return idx === -1 ? line : line.slice(0, idx);
    })
    .join("\n");
}

// Strip TS `// line` and `/* block */` comments — same reason: dos.ts has a
// JSDoc that says "NEVER `adminClient`", which would false-positive on the
// raw text check.
function stripTsComments(ts: string): string {
  // Remove block comments (non-greedy, multiline).
  const noBlocks = ts.replace(/\/\*[\s\S]*?\*\//g, "");
  // Remove single-line comments.
  return noBlocks
    .split("\n")
    .map((line) => {
      const idx = line.indexOf("//");
      return idx === -1 ? line : line.slice(0, idx);
    })
    .join("\n");
}

const MIG_0044_CODE = stripSqlComments(MIG_0044);
const STORAGE_DOS_CODE = stripTsComments(STORAGE_DOS);

// Helper: extract a single RPC body by name from 0045. Slices from the
// `CREATE OR REPLACE FUNCTION public.<name>(` opener to its matching
// `REVOKE ALL ON FUNCTION public.<name>(` line. Each RPC in 0045 has
// a REVOKE/GRANT pair right after $$; that's our reliable terminator.
function extractRpc(name: string): string {
  const start = MIG_0045.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  if (start < 0) throw new Error(`RPC ${name} not found in 0045`);
  const revokeMarker = `REVOKE ALL ON FUNCTION public.${name}(`;
  const end = MIG_0045.indexOf(revokeMarker, start);
  if (end < 0) throw new Error(`REVOKE marker for ${name} not found`);
  return MIG_0045.slice(start, end);
}

describe("Codex F1-F12 fix verification (Phase 4.5 Chunk 1 v3)", () => {
  it("F1: lp_accept_inbound_delivery body does NOT advance threads", () => {
    const body = extractRpc("lp_accept_inbound_delivery");
    expect(body).not.toMatch(/UPDATE\s+order_supplier_threads/i);
    // Sanity: body DOES update purchase_orders and stamp partner_confirmed.
    expect(body).toMatch(/UPDATE\s+purchase_orders/i);
    expect(body).toMatch(/sup_status\s*=\s*'partner_confirmed'/);
  });

  it("F2: orders_rollup_stage drops 'waiting' from dispatched-rollup set", () => {
    // The dispatched-rollup CASE must NOT include 'waiting' in its IN-list.
    // The CASE pattern is: WHEN (SELECT bool_and(logistics_stage IN (...)) FROM t) THEN 'dispatched'
    // (migration 0047 was written pre-rename; the file still says logistics_stage.)
    const dispatchedLine = MIG_0047.match(
      /bool_and\(logistics_stage\s+IN\s*\(([^)]+)\)\)\s+FROM\s+t\)[\s\S]*?THEN\s*'dispatched'::logistics_stage/i,
    );
    expect(dispatchedLine).not.toBeNull();
    const set = dispatchedLine![1];
    expect(set).not.toMatch(/'waiting'/);
    // And the ready_to_dispatch CASE DOES include 'waiting' (4-element IN-list).
    expect(MIG_0047).toMatch(
      /'ready_to_dispatch'[^,)]*,\s*'dispatched'[^,)]*,\s*'delivered'[^,)]*,\s*'waiting'/,
    );
  });

  it("F3: receive RPC uses 'delivered' or 'at_warehouse_waiting' (NEVER sup_status='received')", () => {
    const body = extractRpc("logistics_receive_po_with_do");
    // Body assigns via v_target_sup_status variable, so we check the literal
    // strings appear in assignment positions, and that sup_status='received'
    // never appears anywhere (would be the bug Codex F3 caught).
    expect(body).toMatch(/v_target_sup_status\s*:=\s*'delivered'/);
    expect(body).toMatch(/v_target_sup_status\s*:=\s*'at_warehouse_waiting'/);
    // 'received' must only appear as po_status (status='received'), NEVER as
    // sup_status='received' (po_sup_status enum has no 'received' value).
    expect(body).not.toMatch(/sup_status\s*=\s*'received'/);
    expect(body).not.toMatch(/v_target_sup_status\s*:=\s*'received'/);
    // Sanity: the status='received' line IS present (not the bug).
    expect(body).toMatch(/status\s*=\s*'received'/);
  });

  it("F4: storage policies use public.app_role() (InitPlan-wrap), NOT auth.app_role()", () => {
    expect(MIG_0042).toMatch(/\(\s*select\s+public\.app_role\(\)\s*\)/);
    expect(MIG_0042).not.toMatch(/auth\.app_role\(\)/);
    // Sanity: also uses public.app_partner_id() with InitPlan wrap.
    expect(MIG_0042).toMatch(/\(\s*select\s+public\.app_partner_id\(\)\s*\)/);
  });

  it("F5: partner_sees_own_stock_movements joins via stock_movements.ref text (NOT po_id)", () => {
    // Match the policy block (CREATE POLICY ... ;), then assert join column.
    const policyMatch = MIG_0046.match(
      /CREATE POLICY\s+partner_sees_own_stock_movements[\s\S]*?\);/,
    );
    expect(policyMatch).not.toBeNull();
    const policy = policyMatch![0];
    expect(policy).toMatch(/po\.id\s*=\s*stock_movements\.ref/);
    expect(policy).not.toMatch(/stock_movements\.po_id/);
  });

  it("F6: enforce_partner_po_column_whitelist references NEW.dl (NOT NEW.order_id)", () => {
    expect(MIG_0046).toMatch(/NEW\.dl\s+IS DISTINCT FROM\s+OLD\.dl/);
    // The whole migration must NEVER reference NEW.order_id (purchase_orders
    // has no order_id column — Codex F6 caught a phantom column).
    expect(MIG_0046).not.toMatch(/NEW\.order_id/);
  });

  it("F7: enforce_partner_po_column_whitelist is VOLATILE (not STABLE)", () => {
    // The function declaration must include `LANGUAGE plpgsql VOLATILE` (not STABLE).
    expect(MIG_0046).toMatch(
      /CREATE OR REPLACE FUNCTION public\.enforce_partner_po_column_whitelist\(\)[\s\S]*?LANGUAGE plpgsql\s+VOLATILE/i,
    );
    // Capture the whole fn body and double-check it doesn't say STABLE.
    const fnBlock = MIG_0046.match(
      /CREATE OR REPLACE FUNCTION public\.enforce_partner_po_column_whitelist\(\)[\s\S]*?\$\$;/,
    );
    expect(fnBlock).not.toBeNull();
    expect(fnBlock![0]).not.toMatch(/LANGUAGE\s+plpgsql\s+STABLE/);
  });

  it("F8: 0046 does NOT add partner_sees_own_threads (lives in 0033 as ost_partner_read)", () => {
    // Codex F8 caught a duplicate policy — already exists in 0033:96.
    expect(MIG_0046).not.toMatch(/CREATE POLICY\s+partner_sees_own_threads/);
  });

  it("F9: partner_reject_dispatch UPDATE does NOT touch delivery_partner_id", () => {
    const body = extractRpc("partner_reject_dispatch");
    // Find the UPDATE purchase_orders block. It should clear request_for_delivery_at
    // and stamp partner_rejected_at, but NOT modify delivery_partner_id (LP
    // stays assigned so re-RFD works).
    const updateMatch = body.match(
      /UPDATE\s+purchase_orders[\s\S]*?WHERE\s+id\s*=\s*p_po_id/i,
    );
    expect(updateMatch).not.toBeNull();
    const updateBlock = updateMatch![0];
    expect(updateBlock).not.toMatch(/delivery_partner_id\s*=/);
    // Sanity: it DOES set partner_rejected_at = now() and clears request_for_delivery_at.
    expect(updateBlock).toMatch(/partner_rejected_at\s*=\s*now\(\)/);
    expect(updateBlock).toMatch(/request_for_delivery_at\s*=\s*NULL/);
  });

  it("F10: 0044 does NOT add partner_rejection_reason column", () => {
    // Codex F10: reason is captured in audit_log text only, not as a column.
    // Use comment-stripped SQL because the file's preamble explicitly mentions
    // the rejected column name in a comment ("intentionally NOT added").
    expect(MIG_0044_CODE).not.toMatch(/partner_rejection_reason/);
    // Sanity: the 4 expected new columns ARE present in actual DDL.
    expect(MIG_0044_CODE).toMatch(/confirm_delivery_date/);
    expect(MIG_0044_CODE).toMatch(/request_for_delivery_at/);
    expect(MIG_0044_CODE).toMatch(/partner_accepted_at/);
    expect(MIG_0044_CODE).toMatch(/partner_rejected_at/);
  });

  it("F11: storage signed-upload uses userClient (NEVER adminClient/serviceRoleClient)", () => {
    // Codex F11 RED LINE: signing must use USER JWT, never service_role.
    // Sanity (whole file): import + call site present.
    expect(STORAGE_DOS).toMatch(/import\s*\{\s*userClient\s*\}\s*from/);
    expect(STORAGE_DOS).toMatch(/userClient\(c\.env,\s*auth\.jwt\)/);
    // Absence checks against comment-stripped code (the JSDoc legitimately
    // says "NEVER `adminClient`" — a false positive on the raw text).
    expect(STORAGE_DOS_CODE).not.toMatch(/adminClient/);
    expect(STORAGE_DOS_CODE).not.toMatch(/serviceRoleClient/);
    expect(STORAGE_DOS_CODE).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it("F12: 0045 has 8 CREATE OR REPLACE FUNCTION statements (5 NEW + 2 EXTENDED + 1 MODIFIED)", () => {
    const matches = MIG_0045.match(/CREATE OR REPLACE FUNCTION public\.\w+\(/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBe(8);
    // Sanity: all 8 expected RPC names present.
    const expectedRpcs = [
      "partner_accept_dispatch",
      "partner_reject_dispatch",
      "lp_accept_inbound_delivery",
      "partner_reject_customer",
      "logistics_relocate_warehouse",
      "logistics_resume_from_waiting",
      "logistics_dispatch_customer_leg",
      "logistics_receive_po_with_do",
    ];
    for (const name of expectedRpcs) {
      expect(MIG_0045).toMatch(
        new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\(`),
      );
    }
  });
});
