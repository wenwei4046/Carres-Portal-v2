import { readFileSync } from "node:fs";
import pg from "pg";
import { afterAll, beforeAll, expect, it, describe } from "vitest";

const url = process.env.CARRES_PO_EMAIL_TEST_DATABASE_URL ?? "";
const actor = "11111111-1111-4111-8111-111111111111";
const supplier = "22222222-2222-4222-8222-222222222222";
const attempt = "33333333-3333-4333-8333-333333333333";
const next = "44444444-4444-4444-8444-444444444444";
const digest = "a".repeat(64);

describe.skipIf(!url)("durable PO Email attempts — real PostgreSQL, isolated local database", () => {
  let db: pg.Client;
  beforeAll(async () => {
    const target = new URL(url);
    if (!["localhost", "127.0.0.1"].includes(target.hostname) || !target.pathname.startsWith("/carres_po_email_")) throw new Error("dedicated local PO email test database required");
    db = new pg.Client({ connectionString: url });
    await db.connect();
    await db.query("begin");
    await db.query(`create schema auth;
      create function auth.role() returns text language sql as $$ select current_setting('request.jwt.claim.role',true) $$;
      grant usage on schema auth to authenticated,anon,service_role;
      create table public.app_users(id uuid primary key, may_issue boolean not null);
      create table public.suppliers(id uuid primary key,contact_email text);
      create table public.purchase_orders(id text primary key,supplier_id uuid,version integer,status text);
      create function public.purchasing_actor_may_issue(p_user uuid) returns boolean language sql as $$ select coalesce((select may_issue from public.app_users where id=p_user),false) $$;
    `);
    const migration = readFileSync(new URL("../../../../supabase/migrations/0649_po_email_attempts_survive_reopening.sql", import.meta.url), "utf8").replace(/^begin;$/m, "").replace(/^commit;$/m, "");
    await db.query(migration);
    await db.query("insert into public.app_users values($1,true);", [actor]);
    await db.query("insert into public.suppliers values($1,'supplier@example.invalid')", [supplier]);
    await db.query("insert into public.purchase_orders values('PO-1',$1,1,'open'),('PO-2',$1,1,'open')", [supplier]);
    await db.query("select set_config('request.jwt.claim.role','service_role',true)");
  });
  afterAll(async () => { if (db) { await db.query("rollback"); await db.end(); } });
  const reserve = (id = attempt, resend = false, payloadDigest = digest) => db.query(
    "select public.purchasing_prepare_po_email($1,$2,$3,'supplier@example.invalid',$4,$5::jsonb,$6) as result",
    [id,actor,supplier,payloadDigest,JSON.stringify([{ id: "PO-1", version: 1 },{ id: "PO-2", version: 1 }]),resend]);
  const outcome = (status: string, provider: string | null = null) => db.query("select public.purchasing_record_po_email_outcome($1,$2,$3)", [attempt,status,provider]);
  async function isolated(work: () => Promise<void>) {
    await db.query("savepoint test_case");
    try { await work(); } finally { await db.query("rollback to savepoint test_case"); }
  }
  it("same attempt is reserved once, survives a reread and rejects changed contents", () => isolated(async () => {
    expect((await reserve()).rows[0].result).toMatchObject({ created: true, status: "prepared" });
    expect((await reserve()).rows[0].result).toMatchObject({ created: false, status: "prepared" });
    await expect(reserve(attempt,false,"b".repeat(64))).rejects.toThrow("email_attempt_changed");
  }));
  it("unknown provider outcome cannot be bypassed even with explicit resend", () => isolated(async () => {
    await reserve(); await outcome("unknown");
    await expect(reserve(next,true)).rejects.toThrow("email_attempt_pending");
  }));
  it("known failure releases the version for a new deliberate attempt", () => isolated(async () => {
    await reserve(); await outcome("failed");
    expect((await reserve(next)).rows[0].result.created).toBe(true);
  }));
  it("successful dispatch survives evidence failure and cannot be downgraded", () => isolated(async () => {
    await reserve(); await outcome("dispatched","provider-1");
    expect((await reserve()).rows[0].result).toMatchObject({ created: false, status: "dispatched", providerId: "provider-1" });
    await expect(outcome("unknown")).rejects.toThrow("email_outcome_already_recorded");
  }));
  it("a deliberate resend retains the original dispatch history", () => isolated(async () => {
    await reserve(); await outcome("dispatched","provider-1");
    expect((await reserve(next,true)).rows[0].result.created).toBe(true);
    expect((await db.query("select outcome,provider_id from public.po_email_attempts where id=$1",[attempt])).rows[0]).toEqual({ outcome:"dispatched", provider_id:"provider-1" });
  }));
  it("checks current version before reserving any selected PO", () => isolated(async () => {
    await db.query("update public.purchase_orders set version=2 where id='PO-2'");
    await expect(reserve()).rejects.toThrow("stale_po_version");
  }));
  it("a browser principal cannot forge provider dispatch through the integration RPC", () => isolated(async () => {
    await db.query("set local role authenticated");
    await expect(outcome("dispatched","forged")).rejects.toThrow("permission denied");
  }));
});
