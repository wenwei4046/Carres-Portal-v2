-- =============================================================================
-- 0583_purchasing_never_buys_from_an_other_creditor.sql
-- PURCHASING · a landlord or an advertiser is never the supplier on a purchase
--
-- WHAT WAS WRONG. 0477 lets Finance add a landlord, an advertiser or a lorry
-- company as a row in `suppliers` with kind = 'other_creditor', so its bills
-- can credit Other payables. The API keeps those rows out of every
-- Purchasing, Catalog and Operation picker (`purchasingSuppliersOnly` in
-- packages/shared/src/schemas/catalog.ts). The database did not: a caller
-- that skips the pickers could still make the landlord the supplier on a
-- purchase order, a catalog SKU, a manual purchase line or a supplier claim,
-- and the foreign key would accept it, because the landlord IS a supplier row.
--
-- WHAT THIS BUILDS.
--   A. One trigger function, `purchasing_supplier_is_not_an_other_creditor()`,
--      attached BEFORE INSERT OR UPDATE OF supplier_id to the four tables the
--      shared rule names ("no PO, no manual purchase, no catalog slot, no
--      supplier claim"):
--          product_skus      the catalog slot
--          purchase_orders   the PO
--          purchase_demands  the manual purchase line (and planner demand)
--          supplier_claims   the claim against the supplier
--      It refuses with SQLSTATE 23514 (check_violation — this is a CHECK that
--      has to read another table, which a CHECK constraint cannot), detail
--      `supplier_is_other_creditor`, and the table and column named on the
--      error. An UPDATE that leaves supplier_id as it was is not judged again.
--   B. The other direction. `suppliers.kind` may not CHANGE to other_creditor
--      while any of those four tables still names the supplier (23514, detail
--      `other_creditor_still_supplies`). Without this, one update to the
--      supplier row would undo A. The tables it checks are read from the
--      triggers in A, so a table that gains A's trigger later is covered here
--      with no change to this function.
--   C. A self-test at the end that writes, proves each refusal, and rolls back.
--
-- THE TRIGGER NAME SORTS FIRST ON PURPOSE. Postgres fires BEFORE triggers in
-- name order. `guard_…` sorts ahead of the triggers already on these tables
-- (`purchasing_keep_official_delivery_date`, `trg_enforce_sku_price_cost_…`),
-- so a caller naming a landlord gets this refusal, not a side effect first.
--
-- NOT GUARDED, AND WHY. Other tables carry a supplier_id too:
--   · supplier_bills, payment_vouchers (0464/0477) — Finance's own documents.
--     They MUST be able to name an other creditor; that is why it exists.
--   · sku_supplier_offers (0388), po_cost_approvals (0380) — a quoted or an
--     approved price. Neither buys anything without a catalog slot or a PO,
--     and both of those are guarded.
--   · purchasing_supplier_settings, purchasing_production_days,
--     purchasing_setting_changes (0303), purchase_snoozes (0243) — settings
--     keyed by supplier. Purchasing Settings already hides other creditors.
--   · ops_sofa_loans (0217), service_cases (0293), order_supplier_threads
--     (0033), app_users (0001) — a loan, a service case, a conversation and a
--     login; none of them is a purchase.
--
-- WHAT IT DELIBERATELY DOES NOT DO. Existing rows are not checked and not
-- changed: the triggers judge a supplier when it is chosen. No backfill, no
-- row deleted, no row-count assertion.
--
-- ACCESS. No RLS or policy changes. Both trigger functions are security
-- definer so the supplier lookup sees every supplier row whatever the
-- caller's own read policy, and execute on them is revoked from public, anon
-- and authenticated — nobody calls a trigger function over the API.
-- =============================================================================


-- ── 1 · the words for each guarded table ─────────────────────────────────────
-- What a person reads in the refusal: "a purchase order", not "purchase_orders".
create or replace function public.purchasing_supplier_place(p_table text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $fn$
  select case p_table
    when 'product_skus'     then 'a catalog SKU'
    when 'purchase_orders'  then 'a purchase order'
    when 'purchase_demands' then 'a manual purchase line'
    when 'supplier_claims'  then 'a supplier claim'
    else p_table
  end
$fn$;


-- ── 2 · the supplier on a purchase is never an other creditor ────────────────
-- `kind::text` rather than the enum literal: 0477 added the value, and this
-- keeps the function usable even in a transaction that has not committed it.
-- FOR SHARE holds the supplier row until this write commits, so a concurrent
-- change of its kind (section 3) waits and then sees this row.
create or replace function public.purchasing_supplier_is_not_an_other_creditor()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_name text;
  v_kind text;
begin
  if new.supplier_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.supplier_id is not distinct from old.supplier_id then
    return new;
  end if;

  select s.name, s.kind::text
    into v_name, v_kind
    from public.suppliers s
   where s.id = new.supplier_id
     for share;

  -- No such supplier: the foreign key refuses it, with its own error.
  if v_kind = 'other_creditor' then
    raise exception '% is an other creditor (Finance, Other payables), so it cannot be the supplier on %. Choose a supplier Purchasing buys from.',
      v_name, public.purchasing_supplier_place(tg_table_name)
      using errcode = '23514',
            detail  = 'supplier_is_other_creditor',
            schema  = tg_table_schema,
            table   = tg_table_name,
            column  = 'supplier_id';
  end if;
  return new;
end;
$fn$;

comment on function public.purchasing_supplier_is_not_an_other_creditor() is
  '0583: refuses a suppliers.kind = other_creditor row as the supplier_id on a purchasing table (catalog SKU, PO, manual purchase line, supplier claim). 23514, detail supplier_is_other_creditor. An UPDATE that keeps supplier_id unchanged is not re-judged.';

drop trigger if exists guard_supplier_not_other_creditor on public.product_skus;
create trigger guard_supplier_not_other_creditor
  before insert or update of supplier_id on public.product_skus
  for each row execute function public.purchasing_supplier_is_not_an_other_creditor();

drop trigger if exists guard_supplier_not_other_creditor on public.purchase_orders;
create trigger guard_supplier_not_other_creditor
  before insert or update of supplier_id on public.purchase_orders
  for each row execute function public.purchasing_supplier_is_not_an_other_creditor();

drop trigger if exists guard_supplier_not_other_creditor on public.purchase_demands;
create trigger guard_supplier_not_other_creditor
  before insert or update of supplier_id on public.purchase_demands
  for each row execute function public.purchasing_supplier_is_not_an_other_creditor();

drop trigger if exists guard_supplier_not_other_creditor on public.supplier_claims;
create trigger guard_supplier_not_other_creditor
  before insert or update of supplier_id on public.supplier_claims
  for each row execute function public.purchasing_supplier_is_not_an_other_creditor();


-- ── 3 · a supplier in use does not become an other creditor ──────────────────
-- Runs only when kind changes TO other_creditor (the WHEN clause). The tables
-- it checks are every table that carries section 2's trigger — read from
-- pg_trigger, so the list lives in one place. A temporary table of another
-- session is skipped: Postgres will not let one session read another's.
create or replace function public.supplier_in_use_is_not_an_other_creditor()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_rel    record;
  v_in_use boolean;
  v_places text[] := '{}';
begin
  for v_rel in
    select n.nspname, c.relname
      from pg_trigger t
      join pg_class c     on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
     where t.tgfoid = 'public.purchasing_supplier_is_not_an_other_creditor()'::regprocedure
       and not t.tgisinternal
       and (c.relpersistence <> 't' or c.relnamespace = pg_my_temp_schema())
     order by c.relname
  loop
    execute format('select exists (select 1 from %I.%I where supplier_id = $1)',
                   v_rel.nspname, v_rel.relname)
       into v_in_use
      using old.id;
    if v_in_use then
      v_places := v_places || public.purchasing_supplier_place(v_rel.relname);
    end if;
  end loop;

  if cardinality(v_places) > 0 then
    raise exception '% cannot become an other creditor: it is still the supplier on %.',
      old.name, array_to_string(v_places, ', ')
      using errcode = '23514',
            detail  = 'other_creditor_still_supplies',
            schema  = tg_table_schema,
            table   = tg_table_name,
            column  = 'kind';
  end if;
  return new;
end;
$fn$;

comment on function public.supplier_in_use_is_not_an_other_creditor() is
  '0583: refuses changing suppliers.kind to other_creditor while any table carrying purchasing_supplier_is_not_an_other_creditor() still names the supplier. 23514, detail other_creditor_still_supplies.';

drop trigger if exists guard_other_creditor_not_in_use on public.suppliers;
create trigger guard_other_creditor_not_in_use
  before update of kind on public.suppliers
  for each row
  when (new.kind::text = 'other_creditor' and old.kind::text is distinct from 'other_creditor')
  execute function public.supplier_in_use_is_not_an_other_creditor();


-- ── 4 · nobody calls these over the API ──────────────────────────────────────
revoke all on function public.purchasing_supplier_place(text)                  from public, anon, authenticated;
revoke all on function public.purchasing_supplier_is_not_an_other_creditor()   from public, anon, authenticated;
revoke all on function public.supplier_in_use_is_not_an_other_creditor()       from public, anon, authenticated;


-- ── 5 · self-test: writes, proves each refusal, rolls back ───────────────────
do $selftest$
declare
  v_guard   oid := 'public.purchasing_supplier_is_not_an_other_creditor()'::regprocedure;
  v_flip    oid := 'public.supplier_in_use_is_not_an_other_creditor()'::regprocedure;
  v_tables  text[] := array['product_skus', 'purchase_orders', 'purchase_demands', 'supplier_claims'];
  v_t       text;
  v_bad     text;
  v_creditor uuid;
  v_factory  uuid;
  v_spare    uuid;
  v_state   text;
  v_detail  text;
  v_msg     text;
  v_hit     boolean;
begin
  -- 1 · each of the four tables carries the guard: BEFORE, per row, on INSERT
  --     and on UPDATE OF supplier_id only. tgtype 23 = row 1 + before 2 +
  --     insert 4 + update 16.
  select string_agg(x.t, ', ') into v_bad
    from unnest(v_tables) as x(t)
   where not exists (
     select 1
       from pg_trigger tg
       join pg_attribute a on a.attrelid = tg.tgrelid and a.attname = 'supplier_id'
      where tg.tgrelid = ('public.' || x.t)::regclass
        and tg.tgname = 'guard_supplier_not_other_creditor'
        and tg.tgfoid = v_guard
        and tg.tgenabled = 'O'
        and tg.tgtype = 23
        and cardinality(tg.tgattr::int2[]) = 1
        and a.attnum = any (tg.tgattr::int2[]));
  if v_bad is not null then
    raise exception '0583 self-test: the guard is missing or mis-shaped on: %', v_bad;
  end if;

  -- 2 · and on nothing else. Finance's bills and vouchers must still be able
  --     to name an other creditor.
  select string_agg(n.nspname || '.' || c.relname, ', ') into v_bad
    from pg_trigger tg
    join pg_class c     on c.oid = tg.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
   where tg.tgfoid = v_guard
     and (n.nspname <> 'public' or c.relname <> all (v_tables));
  if v_bad is not null then
    raise exception '0583 self-test: the guard is on a table it should not be on: %', v_bad;
  end if;

  -- 3 · the kind guard on suppliers: BEFORE, per row, UPDATE OF kind only.
  --     tgtype 19 = row 1 + before 2 + update 16.
  if not exists (
    select 1
      from pg_trigger tg
      join pg_attribute a on a.attrelid = tg.tgrelid and a.attname = 'kind'
     where tg.tgrelid = 'public.suppliers'::regclass
       and tg.tgname = 'guard_other_creditor_not_in_use'
       and tg.tgfoid = v_flip
       and tg.tgenabled = 'O'
       and tg.tgtype = 19
       and cardinality(tg.tgattr::int2[]) = 1
       and a.attnum = any (tg.tgattr::int2[])) then
    raise exception '0583 self-test: the kind guard on suppliers is missing or mis-shaped';
  end if;

  -- 4 · not callable from outside
  if has_function_privilege('authenticated', 'public.purchasing_supplier_is_not_an_other_creditor()', 'execute')
     or has_function_privilege('anon', 'public.purchasing_supplier_is_not_an_other_creditor()', 'execute')
     or has_function_privilege('authenticated', 'public.supplier_in_use_is_not_an_other_creditor()', 'execute')
     or has_function_privilege('anon', 'public.supplier_in_use_is_not_an_other_creditor()', 'execute')
     or has_function_privilege('authenticated', 'public.purchasing_supplier_place(text)', 'execute') then
    raise exception '0583 self-test: a guard function is callable over the API';
  end if;

  -- 5 · behaviour. Everything below is rolled back.
  begin
    insert into public.suppliers (name, slug, kind, cat_covered)
    values ('0583 self-test creditor ' || md5(random()::text), '0583-self-test-creditor-' || md5(random()::text), 'other_creditor', '{}')
    returning id into v_creditor;
    insert into public.suppliers (name, slug, kind, cat_covered)
    values ('0583 self-test factory ' || md5(random()::text), '0583-self-test-factory-' || md5(random()::text), 'own_logistics', '{}')
    returning id into v_factory;
    insert into public.suppliers (name, slug, kind, cat_covered)
    values ('0583 self-test spare ' || md5(random()::text), '0583-self-test-spare-' || md5(random()::text), 'own_logistics', '{}')
    returning id into v_spare;

    -- 5a · each real table refuses the other creditor on INSERT, and this
    --      refusal is the first thing that fails. Only supplier_id is given,
    --      plus supplier_claims.claim_no, whose default would otherwise take
    --      a real SC number from its sequence (a rollback does not return it).
    foreach v_t in array v_tables loop
      v_hit := false;
      begin
        execute case v_t
          when 'supplier_claims' then
            'insert into public.supplier_claims (supplier_id, claim_no) values ($1, ''0583-SELF-TEST'')'
          else
            format('insert into public.%I (supplier_id) values ($1)', v_t)
        end
        using v_creditor;
      exception when others then
        get stacked diagnostics v_state = returned_sqlstate, v_detail = pg_exception_detail, v_msg = message_text;
        if v_state = '23514' and v_detail = 'supplier_is_other_creditor' then
          v_hit := true;
        else
          raise exception '0583 self-test: an insert on % naming an other creditor failed for another reason first: % %',
            v_t, v_state, v_msg;
        end if;
      end;
      if not v_hit then
        raise exception '0583 self-test: % accepted an other creditor as its supplier', v_t;
      end if;
    end loop;

    -- 5b · the function's own rules, on a scratch table carrying the same
    --      trigger (the real tables need a full parent chain for a valid row).
    create temp table _0583_probe (supplier_id uuid);
    create trigger guard_supplier_not_other_creditor
      before insert or update of supplier_id on pg_temp._0583_probe
      for each row execute function public.purchasing_supplier_is_not_an_other_creditor();

    insert into _0583_probe values (v_factory);   -- a supplier Purchasing buys from: allowed
    insert into _0583_probe values (null);        -- no supplier: allowed

    v_hit := false;
    begin
      update _0583_probe set supplier_id = v_creditor where supplier_id = v_factory;
    exception when check_violation then
      get stacked diagnostics v_detail = pg_exception_detail;
      v_hit := v_detail = 'supplier_is_other_creditor';
    end;
    if not v_hit then
      raise exception '0583 self-test: an UPDATE to an other creditor was accepted';
    end if;

    -- The factory is still on the scratch table, so it may not become an
    -- other creditor.
    v_hit := false;
    begin
      update public.suppliers set kind = 'other_creditor' where id = v_factory;
    exception when check_violation then
      get stacked diagnostics v_detail = pg_exception_detail;
      v_hit := v_detail = 'other_creditor_still_supplies';
    end;
    if not v_hit then
      raise exception '0583 self-test: a supplier in use was turned into an other creditor';
    end if;

    -- A supplier nothing names may become one.
    update public.suppliers set kind = 'other_creditor' where id = v_spare;

    -- A row already holding an other creditor (from before this file) can
    -- still be edited when the edit leaves supplier_id alone.
    alter table _0583_probe disable trigger guard_supplier_not_other_creditor;
    insert into _0583_probe values (v_creditor);
    alter table _0583_probe enable trigger guard_supplier_not_other_creditor;
    begin
      update _0583_probe set supplier_id = supplier_id where supplier_id = v_creditor;
    exception when check_violation then
      raise exception '0583 self-test: an edit that left supplier_id unchanged was refused';
    end;

    raise exception 'probe_rollback';
  exception when others then
    if sqlerrm <> 'probe_rollback' then
      raise;
    end if;
  end;
end;
$selftest$;
