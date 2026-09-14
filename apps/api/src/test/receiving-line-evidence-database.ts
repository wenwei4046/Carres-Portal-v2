import { PGlite } from "@electric-sql/pglite";
import { migration, statementOf } from "./stock-register-database";

/**
 * A REAL POSTGRES RUNNING THE COMMITTED 0493 SQL.
 *
 * The exception-evidence rules — the media path law, the extra-line identity,
 * the projection into rows, the append door and its gate — live in PL/pgSQL.
 * A mocked Supabase client can prove which arguments a route sent; it cannot
 * prove that a path outside the PO's prefix is refused, that a zero exception
 * takes no evidence, that two appends both survive, or that a re-projection
 * inserts nothing twice. Those are database behaviours, so the test runs the
 * database.
 *
 * Only the upstream base tables and the OLDER functions 0493 calls are
 * fixtures (`supplier_claim_photo_entries` and `supplier_claim_type_allowed`
 * are cut from their own committed migration, 0288). Everything 0493 defines
 * is executed from the committed migration file, so a test cannot pass
 * against SQL that is not the SQL production will run.
 *
 * Two knobs stand in for Supabase's auth and 0425's duty gate:
 *   `set_config('test.uid', …)`      → `auth.uid()`
 *   `set_config('test.grn_duty', …)` → `receiving_require_post_authority()`
 *                                       ('allow' | 'refuse')
 */
export const EVIDENCE_MIGRATION = "0493_exception_evidence_is_a_record_with_its_line";

export const OP = "00000000-0000-0000-0000-0000000000aa";
export const OP2 = "00000000-0000-0000-0000-0000000000ab";
export const PO = "PO-2054";
export const LINE = "f7fa0b0c-4020-4c11-9e07-4c145b0660cb";
export const LINE_QTY = "f7fa0b0c-4020-4c11-9e07-4c145b0660cc";
export const RECEIPT = "eab42aec-b53f-4cc2-bc99-d87fd0ce3db8";

export async function receivingEvidenceDatabase() {
  const db = new PGlite();
  await db.exec(`
    create role authenticated; create role anon;
    create schema auth;
    create schema storage;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('test.uid', true), '')::uuid $$;
    create table storage.objects (bucket_id text not null, name text not null, primary key (bucket_id, name));
    create table public.app_users (id uuid primary key, name text);
    create table public.product_models (id uuid primary key, name text, category text);
    create table public.product_skus (sku text primary key, model_id uuid, variant text);
    create table public.purchase_orders (id text primary key, status text, supplier_id uuid);
    create table public.purchase_order_lines (
      id uuid primary key, po_id text not null, sku text not null, qty int not null,
      received_qty int not null default 0, damaged_qty int not null default 0,
      wrong_item_qty int not null default 0, identity_mode text
    );
    create table public.ops_stock_items (
      id uuid primary key default gen_random_uuid(), unit_code text, sku text, po_no text,
      po_line_id uuid, status text, identity_scope text not null default 'unit'
    );
    create table public.warehouse_receipts (
      id uuid primary key default gen_random_uuid(),
      po_id text not null, warehouse_id uuid, do_number text, do_file_path text,
      status text not null, lines jsonb not null default '[]'::jsonb,
      extra_lines jsonb not null default '[]'::jsonb,
      arrival_evidence jsonb not null default '[]'::jsonb,
      grn_no text, submitted_by uuid, posted_by uuid,
      updated_at timestamptz not null default now()
    );
    create table public.receiving_events (
      id uuid primary key default gen_random_uuid(),
      receipt_id uuid not null references public.warehouse_receipts(id),
      event text not null check (event in ('submitted','returned','resubmitted','posted','voided','amended')),
      actor_id uuid, event_at timestamptz not null default now(),
      payload jsonb not null default '{}'::jsonb
    );
    create function public.is_internal() returns boolean language sql stable as $$ select true $$;
    create function public.is_operation() returns boolean language sql stable as $$ select true $$;
    create function public.normalise_unit_id(p text) returns text language sql immutable as $$ select lower(btrim(p)) $$;
    create function public.claim_product_category(p_sku text) returns text language sql immutable as $$ select 'bedframe' $$;
    create function public.receiving_require_post_authority() returns jsonb language plpgsql as $$
      begin
        if coalesce(current_setting('test.grn_duty', true), 'allow') <> 'allow' then
          raise exception 'only GRN duty may save a receiving' using errcode = '42501', detail = 'not_grn_duty';
        end if;
        return jsonb_build_object('allowed', true, 'source', 'grn_duty',
                                  'normal_user_id', auth.uid(), 'acting_user_id', auth.uid());
      end $$;

    insert into public.app_users values ('${OP}', 'Shasha'), ('${OP2}', 'Li Ching');
    insert into public.product_models values ('be7fc9a1-f236-4d9a-b087-00ab4e20d0e2', 'Jager', 'bedframe');
    insert into public.product_skus values ('JAGER-SS', 'be7fc9a1-f236-4d9a-b087-00ab4e20d0e2', 'Super Single');
    insert into public.product_skus values ('LOOSE-SKU', null, null);
    insert into public.purchase_orders values ('${PO}', 'open', null);
    insert into public.purchase_order_lines (id, po_id, sku, qty, received_qty, identity_mode)
      values ('${LINE}', '${PO}', 'JAGER-SS', 3, 0, 'quantity'),
             ('${LINE_QTY}', '${PO}', 'LOOSE-SKU', 2, 0, 'quantity');
    insert into storage.objects values
      ('delivery-orders', '${PO}/aaaa-claim-DO-1.jpg'),
      ('delivery-orders', '${PO}/bbbb-claim-DO-1.mp4'),
      ('delivery-orders', '${PO}/cccc-claim-DO-1.png'),
      ('delivery-orders', '${PO}/dddd-claim-DO-1.mov'),
      ('delivery-orders', '${PO}/eeee-claim-DO-1.jpg'),
      ('delivery-orders', '${PO}/ffff-claim-DO-1.webm'),
      ('delivery-orders', 'PO-9999/zzzz-claim-DO-9.jpg');
  `);
  const claims = migration("0288_supplier_claims");
  await db.exec(statementOf(claims, "create or replace function public.supplier_claim_type_allowed", "$$;"));
  await db.exec(statementOf(claims, "create or replace function public.supplier_claim_photo_entries", "$$;"));
  await db.exec(migration(EVIDENCE_MIGRATION));
  return db;
}

export async function actingAs(db: PGlite, uid: string | null, duty: "allow" | "refuse" = "allow") {
  await db.query(`select set_config('test.uid', $1, false)`, [uid ?? ""]);
  await db.query(`select set_config('test.grn_duty', $1, false)`, [duty]);
}
