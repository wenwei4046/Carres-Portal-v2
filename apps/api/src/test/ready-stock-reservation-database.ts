import { PGlite } from "@electric-sql/pglite";
import { migration } from "./stock-register-database";

/**
 * A REAL POSTGRES RUNNING THE COMMITTED 0471 SQL.
 *
 * The reservation rules this file exercises live in PL/pgSQL, on locked rows,
 * inside one transaction. A mocked Supabase client can prove which arguments a
 * route sent; it cannot prove that two operators racing for one Unit end with
 * one reservation, that a released Unit gives the customer's requirement back,
 * or that a counted row is refused. Those are database behaviours, so the test
 * runs the database.
 *
 * Only the upstream base tables are fixtures. Every function and view under
 * test is executed from the committed migration file, so a test cannot pass
 * against SQL that is not the SQL production will run.
 */

/**
 * Cut one statement out of a migration by its first and last line.
 *
 * LINE ENDINGS ARE NORMALISED FIRST. Git hands the file back with CRLF on a
 * Windows checkout and LF on the Linux runner, so an anchor written with a
 * bare newline matches on one machine and silently misses on the other — and
 * it reads as `Missing migration statement`, not as a platform difference.
 * The SQL that reaches Postgres is identical either way.
 */
const CRLF = /\r\n/g;

function statement(rawSql: string, start: string, end: string) {
  const sql = rawSql.replace(CRLF, "\n");
  const from = sql.indexOf(start);
  const to = sql.indexOf(end, from);
  if (from < 0 || to < 0) throw new Error(`Missing migration statement: ${start}`);
  return sql.slice(from, to + end.length);
}

export const RESERVATION_MIGRATION = "0471_a_reserved_unit_names_the_sales_order_line";

export async function readyStockDatabase() {
  const db = new PGlite();

  /* ── the upstream shape, and only the columns these rules read ─────────── */
  await db.exec(`
    create schema if not exists auth;
    create table public.app_users (id uuid primary key, name text);
    create table public.warehouses (id uuid primary key, name text, kind text);
    create table public.orders (id uuid primary key, so int);
    create table public.order_lines (
      id uuid primary key, order_id uuid not null references public.orders(id),
      sku text not null, qty int not null
    );
    create table public.purchase_orders (id text primary key, status text not null);
    create table public.purchase_order_lines (id uuid primary key, po_id text, sku text, qty int);
    create table public.po_line_sources (
      id uuid primary key default gen_random_uuid(),
      po_id text not null references public.purchase_orders(id),
      po_line_id uuid, sku text, order_id uuid, so int,
      order_line_id uuid references public.order_lines(id), qty int not null
    );
    create table public.ops_stock_items (
      id uuid primary key default gen_random_uuid(),
      unit_code text, sku text not null, warehouse_id uuid,
      holder_party_id uuid, ownership text not null default 'carres_owned',
      supplier text, po_no text, po_line_id uuid,
      status text not null, condition text, needs_repair boolean not null default false,
      hold_reason text, reserved_ref text, sold_order_id uuid,
      ref_history text[] not null default '{}',
      qty int not null default 1, date_in date, sold_at timestamptz,
      last_verified_at timestamptz, created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      identity_scope text not null default 'unit'
    );
    create table public.ops_stock_pool_usage (
      id uuid primary key default gen_random_uuid(),
      item_id uuid, sku text, qty int, reason text, note text, ref text,
      taken_by uuid, created_at timestamptz not null default now()
    );
    create type public.app_role as enum ('operation','principal','sales','finance','warehouse');
    create table public.audit_log (
      id uuid primary key default gen_random_uuid(),
      role public.app_role, actor_text text, action text, ref text,
      at timestamptz not null default now()
    );
    create table public.ops_activity_log (
      id uuid primary key default gen_random_uuid(),
      order_id uuid, action text, actor_id uuid, detail jsonb,
      at timestamptz not null default now()
    );
    create table public.stock_operating_parties (id uuid primary key, name text);
    create table public.stock_unit_events (unit_id uuid, event text, event_at timestamptz, seq bigint);
  `);

  /* ── the two ambient facts every governed door reads ───────────────────── */
  await db.exec(`
    create table public._test_actor (role text, uid uuid);
    insert into public._test_actor values ('operation', '00000000-0000-0000-0000-0000000000aa');
    create function public.app_role() returns text
      language sql stable as $$ select role from public._test_actor limit 1 $$;
    create function auth.uid() returns uuid
      language sql stable as $$ select uid from public._test_actor limit 1 $$;
    create function public._activity_log_order_id_from_ref(p_ref text) returns uuid
      language sql stable as $$
        select o.id from public.orders o
         where o.so = nullif(substring(p_ref from '^SO-([0-9]+)$'), '')::int limit 1
      $$;
    insert into public.app_users values ('00000000-0000-0000-0000-0000000000aa', 'Test operator');
    insert into public.warehouses values ('00000000-0000-0000-0000-0000000000c3', 'Carres Klang Warehouse', 'own');
  `);

  /* ── the real availability arithmetic (0371), unchanged ────────────────── */
  const condition = migration("0371_a_damaged_unit_is_not_available");
  await db.exec(statement(condition, "create or replace function public.unit_availability", "$$;"));

  /* ── the file under test, executed as committed ────────────────────────── */
  const m = migration(RESERVATION_MIGRATION);
  for (const [start, end] of [
    ["alter table public.ops_stock_items\n  add column if not exists reserved_order_line_id", ";"],
    ["create index if not exists ops_stock_items_reserved_order_line_idx", ";"],
    ["create or replace function public.stock_match_key", "$function$;"],
    ["create or replace function public.so_line_remaining_requirement", "$function$;"],
    ["create or replace function public.ops_stock_pool_draw", "$function$;"],
    ["create or replace function public.so_batch_reserve_ready_units", "$function$;"],
    ["create or replace function public.ops_stock_release", "$$;"],
    ["create or replace function public.ops_stock_reassign", "$$;"],
  ] as const) {
    await db.exec(statement(m, start, end));
  }

  return db;
}

/** The one-time backfill, exactly as the migration runs it. */
export function backfillStatement(): string {
  const m = migration(RESERVATION_MIGRATION);
  return statement(m, "update public.ops_stock_items i\n   set reserved_order_line_id", "where i.id = m.item_id;");
}

/** Run `fn` as a different role/actor — the way RLS-adjacent guards are proved. */
export async function actingAs(db: PGlite, role: string, uid?: string) {
  await db.exec(
    `update public._test_actor set role = ${role === "null" ? "null" : `'${role}'`}` +
      (uid ? `, uid = '${uid}'` : ""),
  );
}
