import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const migration = readFileSync(
  join(here, "../../../../supabase/migrations/0425_one_workspace_owner_duty_resolver.sql"),
  "utf8",
);

describe("0425 one Workspace owner-Duty resolver", () => {
  it("keeps owner assignments separate from permission duties", () => {
    expect(migration).toMatch(/create table (?:if not exists )?public\.workspace_owner_duties/i);
    expect(migration).toMatch(/create table (?:if not exists )?public\.workspace_duty_assignments/i);
    expect(migration).not.toMatch(/insert into public\.org_(?:position_)?duties/i);
  });

  it("stores effective Primary and optional distinct Buddy without overlap", () => {
    expect(migration).toMatch(/primary_user_id uuid not null references public\.app_users/i);
    expect(migration).toMatch(/buddy_user_id uuid references public\.app_users/i);
    expect(migration).toMatch(/buddy_user_id is null or buddy_user_id <> primary_user_id/i);
    expect(migration).toMatch(/exclude using gist[\s\S]*duty_key with =[\s\S]*daterange[\s\S]*with &&/i);
  });

  it("owns leave facts in People and audits both governed write doors", () => {
    expect(migration).toMatch(/create table (?:if not exists )?public\.hr_staff_unavailability/i);
    expect(migration).toMatch(/create table (?:if not exists )?public\.workspace_duty_assignment_audit/i);
    expect(migration).toMatch(/create table (?:if not exists )?public\.hr_staff_unavailability_audit/i);
    expect(migration).toMatch(/create or replace function public\.workspace_set_duty_assignment\(/i);
    expect(migration).toMatch(/create or replace function public\.hr_set_staff_unavailability\(/i);
  });

  it("fails closed and preserves normal owner, cover, acting person and date", () => {
    expect(migration).toMatch(/create or replace function public\.workspace_resolve_duty\(p_duty_key text, p_on date\)/i);
    expect(migration).toMatch(/'normal_user_id', v_primary/i);
    expect(migration).toMatch(/'buddy_user_id', v_buddy/i);
    expect(migration).toMatch(/'active_cover_user_id', v_cover/i);
    expect(migration).toMatch(/'acting_user_id', coalesce\(v_cover, v_primary\)/i);
    expect(migration).toMatch(/'state', v_state/i);
    expect(migration).toMatch(/'on_date', p_on/i);
    expect(migration).toMatch(/status = 'active'/i);
    expect(migration).toMatch(/exit_date is not null and e\.exit_date < p_on/i);
  });

  it("seeds only approved Duty names and never resolves a person by email", () => {
    for (const name of [
      "PO Duty",
      "GRN Duty",
      "Payment Duty",
      "Storage Waiver Approver",
      "Purchasing Approver",
      "Delivery Charge Approver",
      "Payment Approver",
      "Stock Adjustment Approver",
      "Service Case Approver",
    ]) {
      expect(migration).toContain(`'${name}'`);
    }
    expect(migration).not.toMatch(/join public\.app_users[^;]*email/i);
  });

  it("makes legacy PO authority delegate to the shared resolver", () => {
    expect(migration).toMatch(
      /create or replace function public\.purchasing_po_actor\(\)[\s\S]*workspace_resolve_duty\('purchasing\.po',/i,
    );
    expect(migration).toMatch(/'actor_user_id', v_resolution->'acting_user_id'/i);
  });

  it("enables fail-closed RLS and grants writes only through RPCs", () => {
    for (const table of [
      "workspace_owner_duties",
      "workspace_duty_assignments",
      "workspace_duty_assignment_audit",
      "hr_staff_unavailability",
      "hr_staff_unavailability_audit",
    ]) {
      expect(migration).toMatch(new RegExp(`alter table public\\.${table} enable row level security`, "i"));
      expect(migration).toMatch(new RegExp(`revoke all on public\\.${table} from authenticated`, "i"));
    }
  });
});
