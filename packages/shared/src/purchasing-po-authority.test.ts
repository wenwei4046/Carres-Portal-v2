import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * THE AUTHORITIES THAT LIVE IN SQL BECAUSE A DOOR ONLY THE CALLER GUARDS IS NOT
 * GUARDED (CARD-2026-08-22-purchasing-02 closure §1 · §2 · §6; migrations
 * 0379 · 0380 · 0383).
 *
 * The API asks these rules too, so the operator gets words instead of a
 * database error — but the API is not where they are enforced. This scan holds
 * the enforcement itself: a refactor that moves a gate back into a route, or
 * restores the comparison that agreed with itself, fails here.
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
const readNamed = (suffix: string): string => {
  const name = readdirSync(MIGRATIONS).find((f) => f.endsWith(suffix));
  expect(name, `no migration ending ${suffix}`).toBeTruthy();
  return readFileSync(join(MIGRATIONS, name!), "utf8");
};
const strip = (sql: string) => sql.replace(/--[^\n]*/g, "");

const ACTOR = read("0379_");
const MONEY = read("0380_");
const DOCUMENT = read("0383_");
const SUPERUSER = readNamed("operations_superuser_po_issue_authority.sql");
const SUPPLIER_ANSWER = readNamed("the_supplier_answer_never_rewrites_the_po.sql");

describe("0379 · one actor authority for every PO door", () => {
  it("has ONE resolver, and it answers about the DUTY", () => {
    expect(ACTOR).toMatch(/create or replace function public\.purchasing_po_actor\(\)/);
    expect(ACTOR).toMatch(/'actor_user_id', coalesce\(v_acting, v_normal\)/);
    /* BOTH people, separately: Team Work groups by the normal holder, the audit
       must say who acted. Collapsing them loses one permanently. */
    expect(ACTOR).toMatch(/'normal_user_id', v_normal/);
    expect(ACTOR).toMatch(/'acting_user_id', v_acting/);
  });

  it("gates the CREATION authority itself, not only a route", () => {
    /* ⭐ THE DEFECT. `purchasing_issue_pos_batch` gated on `is_operation()` and
       nothing else, so any Operations login could create purchase orders by
       calling the RPC directly — and Manual Purchase called it with no duty
       check at all. */
    expect(MONEY).toMatch(
      /create or replace function public\.purchasing_issue_pos_batch\(p_pos jsonb\)/,
    );
    expect(MONEY).toMatch(/if not public\.purchasing_actor_may_issue\(auth\.uid\(\)\) then/);
    expect(MONEY).toMatch(/detail = 'not_po_duty'/);
    /* Once. A gate written twice is a gate somebody will delete once. */
    expect(strip(MONEY).match(/purchasing_actor_may_issue\(auth\.uid\(\)\)/g)).toHaveLength(1);
  });

  it("gates the EVIDENCE door with the same resolver", () => {
    /* Two doors with two duty reads is two answers waiting to disagree. */
    expect(ACTOR).toMatch(/create or replace function public\.purchasing_confirm_po_sent\(/);
    expect(ACTOR).toMatch(/if not public\.purchasing_actor_may_issue\(v_actor\) then/);
  });

  it("stores cover as a DATED record naming both people, written by no browser", () => {
    expect(ACTOR).toMatch(/create table if not exists public\.ops_po_duty_cover/);
    expect(ACTOR).toMatch(/normal_user_id uuid not null/);
    expect(ACTOR).toMatch(/acting_user_id uuid not null/);
    expect(ACTOR).toMatch(/constraint po_duty_cover_two_people check \(acting_user_id <> normal_user_id\)/);
    /* The 0367 lesson: a new table inherits every grant to `authenticated`. */
    expect(ACTOR).toMatch(/revoke all on public\.ops_po_duty_cover from authenticated/);
    expect(strip(ACTOR)).not.toMatch(/for insert to authenticated/);
  });

  it("records WHO on every piece of outbound evidence", () => {
    expect(ACTOR).toMatch(/add column if not exists duty_user_id uuid/);
    expect(ACTOR).toMatch(/add column if not exists acting_user_id uuid/);
    expect(ACTOR).toMatch(/kind, recipient, po_version,\s*\n\s*duty_user_id, acting_user_id/);
  });
});

describe("Operations Superuser uses the same PO authority", () => {
  it("stores one governed capability instead of checking operation@ in application code", () => {
    expect(SUPERUSER).toMatch(
      /alter table public\.app_users\s+add column if not exists operations_superuser boolean not null default false/,
    );
    expect(SUPERUSER).toMatch(
      /create or replace function public\.is_operations_superuser\(p_user uuid\)/,
    );
    expect(SUPERUSER).toMatch(/u\.operations_superuser/);
    expect(SUPERUSER).toMatch(/u\.role = 'principal'/);
  });

  it("governs the shared Operations account once in data, never in every caller", () => {
    expect(SUPERUSER).toMatch(/where lower\(email\) = 'operation@carres\.com'/);
    expect(SUPERUSER).toMatch(/set operations_superuser = true/);
  });

  it("accepts duty, cover or Operations Superuser through the existing single gate", () => {
    expect(SUPERUSER).toMatch(
      /create or replace function public\.purchasing_actor_may_issue\(p_user uuid\)/,
    );
    expect(SUPERUSER).toMatch(/public\.is_operations_superuser\(p_user\)/);
    expect(SUPERUSER).toMatch(
      /\(public\.purchasing_po_actor\(\)->>'actor_user_id'\)::uuid = p_user/,
    );
  });

  it("does not turn every ordinary Operations login into a superuser", () => {
    const code = strip(SUPERUSER);
    expect(code).not.toMatch(/app_role\(\)\s*=\s*'operation'/);
    expect(code).not.toMatch(/role\s*=\s*'operation'/);
  });

  it("records the actual issuer and normal duty or dated cover as distinct audit facts", () => {
    expect(SUPERUSER).toMatch(/add column if not exists issue_duty_user_id uuid/);
    expect(SUPERUSER).toMatch(/add column if not exists issue_cover_user_id uuid/);
    expect(SUPERUSER).toMatch(/add column if not exists issue_authority text/);
    expect(SUPERUSER).toMatch(/by_user_id,\s*issue_duty_user_id,\s*issue_cover_user_id/);
    expect(SUPERUSER).toMatch(/v_actor,\s*v_normal,\s*v_cover/);
    expect(SUPERUSER).toMatch(/'operations_superuser'/);
  });
});

describe("0406 · supplier evidence reuses the same PO authority", () => {
  it("checks the shared duty, cover or Operations Superuser gate", () => {
    expect(SUPPLIER_ANSWER).toMatch(/public\.purchasing_actor_may_issue\(v_actor\)/);
    expect(SUPPLIER_ANSWER).not.toMatch(/purchasing_is_operations_superuser/);
  });

  it("keeps normal duty, dated cover and actual actor as separate send facts", () => {
    expect(SUPPLIER_ANSWER).toMatch(/public\.purchasing_po_actor\(\)/);
    expect(SUPPLIER_ANSWER).toMatch(/'normal_user_id'/);
    expect(SUPPLIER_ANSWER).toMatch(/'acting_user_id'/);
    expect(SUPPLIER_ANSWER).toMatch(/p_po_id, p_channel[^;]+v_actor/s);
  });
});

describe("0380 · a price nobody approved stops the order", () => {
  it("compares the REVIEWED price with the live one, never the live one with itself", () => {
    /* ⭐ THE SILENT DEFECT. The API re-read Catalog and sent the value back as
       `cost_source: catalog`, so the check agreed every time and a supplier
       price that moved between review and Issue was adopted silently. */
    expect(MONEY).toMatch(/p_expected_catalog_cost numeric/);
    expect(MONEY).toMatch(/v_live is distinct from p_expected_catalog_cost/);
    expect(MONEY).toMatch(/detail = 'supplier_price_changed'/);
    /* And an absent expectation is a REFUSAL, not a pass — without it there is
       nothing to compare. */
    expect(MONEY).toMatch(/detail = 'expected_cost_required'/);
  });

  it("makes the issue authority ask the commercial gate for every line", () => {
    expect(MONEY).toMatch(/v_approval := public\.purchasing_check_line_commercials\(/);
    expect(MONEY).toMatch(/nullif\(v_line->>'expected_catalog_cost', ''\)::numeric\(14,2\)/);
  });

  it("requires somebody else's approval for a hand-entered price or a Free of Charge", () => {
    expect(MONEY).toMatch(/detail = 'commercial_approval_required'/);
    expect(MONEY).toMatch(/from public\.po_cost_approvals/);
    expect(MONEY).toMatch(/where sku = p_sku/);
    expect(MONEY).toMatch(/and used_by_po is null/);
  });

  it("refuses PO Duty its own approval, and refuses Operations entirely", () => {
    /* Operations executes the buy; it does not decide what Carres pays. */
    expect(MONEY).toMatch(/not in \('principal', 'finance'\)/);
    expect(MONEY).toMatch(/detail = 'not_commercial_approver'/);
    /* …and not even a manager may approve the exception they will use. */
    expect(MONEY).toMatch(/if public\.purchasing_actor_may_issue\(v_actor\) then/);
    expect(MONEY).toMatch(/detail = 'self_approval_refused'/);
  });

  it("spends an approval when it is used", () => {
    /* Leaving it open would let one decision price every future order. */
    expect(MONEY).toMatch(/update po_cost_approvals\s*\n\s*set used_by_po = v_po_id/);
  });

  it("expires an approval, because it is for a decision and not for ever", () => {
    expect(MONEY).toMatch(/expires_on is null or expires_on >= \(timezone\('Asia\/Kuala_Lumpur', now\(\)\)\)::date/);
  });

  it("still keeps Free of Charge to cost 0 with a reason", () => {
    expect(MONEY).toMatch(/detail = 'free_of_charge_reason_required'/);
  });

  it("creates every purchase order or none — one transaction, one advisory lock", () => {
    expect(MONEY).toMatch(/perform pg_advisory_xact_lock\(hashtext\('purchasing_issue_pos_batch'\)\)/);
  });

  it("has no write policy on the approvals table", () => {
    expect(MONEY).toMatch(/revoke all on public\.po_cost_approvals from authenticated/);
    expect(MONEY).toMatch(/grant select on public\.po_cost_approvals to authenticated/);
  });
});

describe("0383 · the document carries the facts it claims", () => {
  it("returns the per-line source SO, so a bulk PO stops printing a blank column", () => {
    expect(DOCUMENT).toMatch(/'sources', \(/);
    expect(DOCUMENT).toMatch(/from po_line_sources s/);
    expect(DOCUMENT).toMatch(/where s\.po_line_id = l\.id/);
  });

  it("returns the Unit IDs the issue actually minted", () => {
    expect(DOCUMENT).toMatch(/'unit_codes', \(/);
    expect(DOCUMENT).toMatch(/from ops_stock_items si/);
    expect(DOCUMENT).toMatch(/where si\.po_no = l\.po_id and si\.sku = l\.sku/);
  });

  it("names the real issuer, and never the reader", () => {
    expect(DOCUMENT).toMatch(/select actor_text into v_issuer/);
    expect(DOCUMENT).toMatch(/'issued_by',\s+v_issuer/);
    expect(strip(DOCUMENT)).not.toMatch(/'issued_by',\s*null/);
  });

  it("names both parties: the supplier's own address is read, not hard-coded null", () => {
    expect(DOCUMENT).toMatch(/alter table public\.suppliers add column if not exists address text/);
    expect(DOCUMENT).toMatch(/v_sup_addr := nullif\(btrim\(coalesce\(v_sup\.address, ''\)\), ''\)/);
    expect(DOCUMENT).toMatch(/'address', v_sup_addr/);
  });

  it("prints its own version, and carries the document-level so_refs", () => {
    expect(DOCUMENT).toMatch(/'version',\s+coalesce\(v_po\.version, 1\)/);
    expect(DOCUMENT).toMatch(/'so_refs',\s+to_jsonb\(coalesce\(v_po\.so_refs, array\[\]::int\[\]\)\)/);
  });

  it("stays money-free — the supplier document carries no figure at all", () => {
    const code = strip(DOCUMENT);
    expect(code).not.toMatch(/\bl\.cost\b/);
    expect(code).not.toMatch(/unit_price|line_total|grand_total/);
  });

  it("refuses a cancelled document and a destination with no address", () => {
    expect(DOCUMENT).toMatch(/detail = 'po_not_printable'/);
    expect(DOCUMENT).toMatch(/detail = 'destination_address_missing'/);
  });
});
