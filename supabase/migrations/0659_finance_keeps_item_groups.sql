-- =============================================================================
-- 0659_finance_keeps_item_groups.sql
-- =============================================================================
-- THE RULING (Chew, Finance, 2026-10-07, 「1 可以 2 可以 3 开新的，cost of
--   service」; build 「可以，直接做」 2026-10-08; docs/finance/MASTER.md §0
--   "Item groups"): each catalog product is in an item group, and each group
--   binds a Purchase, Sales, Sales Return and Purchase Return account. Finance
--   changes the accounts, adds groups, turns a group off and moves a product
--   into another group; a change applies to postings from then on.
--   - A product starts in the group of its catalog category.
--   - A bill for a group with no purchase account is not confirmed until the
--     group has one. A sale is never held back: it posts to the goods account
--     (500-0000) and Finance Settings → Item groups lists it.
--
-- WHAT WAS MISSING (measured 2026-10-08)
--   - A sales invoice credited all of an order's goods, in one sum, to the
--     goods row of the income map (500-0000): the 15-year guarantee too, which
--     belongs in 500-5000.
--   - A supplier bill's goods line took the COST_OF_GOODS_SOLD role (610-0000)
--     unless a person picked another account; no line knew its product's group.
--   - Nothing posts a sales return, and a supplier credit note line names no
--     product, so the two return accounts are kept for when they do.
--
-- WHAT THIS ADDS
--   1. gl_item_groups, each with its four accounts (any may be empty: the group
--      is not bound yet) and Active.
--   2. gl_item_group_categories: the group each catalog category starts in.
--   3. gl_item_group_models: a product Finance moved into another group.
--   4. gl_item_group_changes: every change, kept and never altered.
--   5. gl_item_group_unbound_sales: the sales whose group had no sales account,
--      which went to the goods row instead.
--   6. The starting groups (MASTER §0) with their accounts, each category's
--      group, and the accessories placed: the protector, the three pillows.
--   7. Doors: gl_item_group_save (add, rename, accounts, Active),
--      gl_item_group_place (Finance moves a product), gl_item_group_start (the
--      catalog's new-product forms set a new product's group), and the reads
--      gl_item_groups_read (Finance) and gl_item_group_choices (the catalog).
--   8. Posting, by guarded rewrite of each live body (0500/0503 style: one
--      short piece of text, found exactly once, everything else unchanged):
--      - _sales_invoice_to_ledger: after the goods are credited to the goods
--        row, _gl_goods_split moves each item group's share to that group's
--        sales account. A rental-born order keeps its own goods row.
--      - supplier_bill_save_draft: a goods line's account is the one a person
--        chose, else its item group's purchase account, else the role; the
--        line keeps whether a person chose it (account_chosen, new).
--      - supplier_bill_confirm: a goods line whose item group has no purchase
--        account stops it; a goods line nobody chose an account for takes its
--        item group's purchase account now.
--      - supplier_bill_document: says whether each line's account was chosen.
--      - gl_account_set_active: an item group's account is not retired.
--
-- RLS: new tables read by Finance only (gl_may_read); written only by the
--   doors. DATA: configuration only (groups, category starts, four
--   accessories); no transaction is touched. DR/CR: none now; sales and bills
--   posted after this go to their item group's accounts.
-- =============================================================================

begin;

set local search_path = public, pg_temp;

-- ── 1 · the item groups ──────────────────────────────────────────────────────
create table if not exists public.gl_item_groups (
  id                      uuid primary key default gen_random_uuid(),
  name                    text not null check (name = btrim(name) and length(name) between 1 and 40),
  purchase_account        text references public.gl_accounts(code) on update cascade,
  sales_account           text references public.gl_accounts(code) on update cascade,
  sales_return_account    text references public.gl_accounts(code) on update cascade,
  purchase_return_account text references public.gl_accounts(code) on update cascade,
  is_active               boolean not null default true,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  updated_by              uuid references public.app_users(id)
);

create unique index if not exists gl_item_groups_name_key on public.gl_item_groups (upper(name));

comment on table public.gl_item_groups is
  '0659: an item group and the four accounts it binds (MASTER §0 "Item groups"). An empty account: the group is not bound for that posting yet. Written only by gl_item_group_save.';

-- ── 2 · the group each catalog category starts in ───────────────────────────
create table if not exists public.gl_item_group_categories (
  category public.product_category primary key,
  group_id uuid not null references public.gl_item_groups(id)
);

comment on table public.gl_item_group_categories is
  '0659: every product of a catalog category starts in this item group.';

-- ── 3 · a product Finance placed in another group ────────────────────────────
create table if not exists public.gl_item_group_models (
  model_id  uuid primary key references public.product_models(id) on delete cascade,
  group_id  uuid not null references public.gl_item_groups(id),
  placed_at timestamptz not null default now(),
  placed_by uuid references public.app_users(id)
);

comment on table public.gl_item_group_models is
  '0659: a product (product_models) in another item group than its category''s. No row: the category''s group.';

-- ── 4 · every change, kept ───────────────────────────────────────────────────
create table if not exists public.gl_item_group_changes (
  id          bigint generated always as identity primary key,
  group_id    uuid not null references public.gl_item_groups(id),
  what        text not null check (what in ('ADDED', 'NAME', 'ACTIVE', 'PURCHASE', 'SALES',
                                            'SALES_RETURN', 'PURCHASE_RETURN', 'PRODUCT')),
  model_id    uuid,
  model_name  text,
  from_group  uuid references public.gl_item_groups(id),
  from_code   text references public.gl_accounts(code) on update cascade,
  to_code     text references public.gl_accounts(code) on update cascade,
  from_text   text,
  to_text     text,
  changed_by  uuid references public.app_users(id),
  changed_at  timestamptz not null default now()
);

comment on table public.gl_item_group_changes is
  '0659: one row per change. ADDED: a new group. NAME, ACTIVE: from_text/to_text. PURCHASE, SALES, SALES_RETURN, PURCHASE_RETURN: from_code/to_code. PRODUCT: model_id moved from from_group into group_id. model_id has no foreign key: the record outlives a product.';

create index if not exists gl_item_group_changes_when on public.gl_item_group_changes (changed_at desc);

create or replace function public.gl_item_group_changes_frozen()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if tg_op = 'UPDATE'
     and public.gl_renumber_only(to_jsonb(old), to_jsonb(new), array['from_code', 'to_code']) then
    return new;
  end if;
  raise exception 'A recorded change to an item group cannot be altered.'
    using errcode = '42501', detail = 'item_group_change_frozen';
end;
$function$;

drop trigger if exists gl_item_group_changes_frozen on public.gl_item_group_changes;
create trigger gl_item_group_changes_frozen
  before update or delete on public.gl_item_group_changes
  for each row execute function public.gl_item_group_changes_frozen();

-- ── 5 · sales that went to the goods row ─────────────────────────────────────
create table if not exists public.gl_item_group_unbound_sales (
  id           bigint generated always as identity primary key,
  invoice_no   text not null,
  group_id     uuid references public.gl_item_groups(id),
  skus         text[] not null,
  amount       numeric(12,2) not null,
  account_code text not null references public.gl_accounts(code) on update cascade,
  posted_at    timestamptz not null default now()
);

create unique index if not exists gl_item_group_unbound_sales_once
  on public.gl_item_group_unbound_sales (invoice_no, coalesce(group_id, '00000000-0000-0000-0000-000000000000'::uuid));

comment on table public.gl_item_group_unbound_sales is
  '0659: an invoice''s goods whose item group had no sales account (group_id) or whose SKU is not in the catalog (group_id null), credited to account_code, the goods row. Written by _gl_goods_split.';

-- ── read rules: Finance reads, nobody writes but the doors ───────────────────
alter table public.gl_item_groups enable row level security;
alter table public.gl_item_group_categories enable row level security;
alter table public.gl_item_group_models enable row level security;
alter table public.gl_item_group_changes enable row level security;
alter table public.gl_item_group_unbound_sales enable row level security;

revoke all on public.gl_item_groups, public.gl_item_group_categories, public.gl_item_group_models,
              public.gl_item_group_changes, public.gl_item_group_unbound_sales
  from anon, authenticated;
grant select on public.gl_item_groups, public.gl_item_group_categories, public.gl_item_group_models,
                public.gl_item_group_changes, public.gl_item_group_unbound_sales
  to authenticated;

drop policy if exists gl_item_groups_read on public.gl_item_groups;
create policy gl_item_groups_read on public.gl_item_groups
  for select using ((select public.gl_may_read()));
drop policy if exists gl_item_group_categories_read on public.gl_item_group_categories;
create policy gl_item_group_categories_read on public.gl_item_group_categories
  for select using ((select public.gl_may_read()));
drop policy if exists gl_item_group_models_read on public.gl_item_group_models;
create policy gl_item_group_models_read on public.gl_item_group_models
  for select using ((select public.gl_may_read()));
drop policy if exists gl_item_group_changes_read on public.gl_item_group_changes;
create policy gl_item_group_changes_read on public.gl_item_group_changes
  for select using ((select public.gl_may_read()));
drop policy if exists gl_item_group_unbound_sales_read on public.gl_item_group_unbound_sales;
create policy gl_item_group_unbound_sales_read on public.gl_item_group_unbound_sales
  for select using ((select public.gl_may_read()));

-- ── 6 · the starting groups (configuration, MASTER §0) ───────────────────────
-- An account binds only where it is in the chart, in use and of the right
-- kind; otherwise that posting starts unbound and the page says so.
insert into public.gl_item_groups (name, purchase_account, sales_account, sales_return_account, purchase_return_account)
select g.name,
       (select a.code from public.gl_accounts a where a.code = g.p  and a.is_active and not a.is_heading and not a.is_control and a.kind = 'EXPENSE'),
       (select a.code from public.gl_accounts a where a.code = g.s  and a.is_active and not a.is_heading and not a.is_control and a.kind = 'INCOME'),
       (select a.code from public.gl_accounts a where a.code = g.sr and a.is_active and not a.is_heading and not a.is_control and a.kind = 'INCOME'),
       (select a.code from public.gl_accounts a where a.code = g.pr and a.is_active and not a.is_heading and not a.is_control and a.kind = 'EXPENSE')
  from (values
          ('MATTRESS',           '610-0020', '500-0000', '510-0000', '612-0000'),
          ('SOFA',               '610-0030', '500-0000', '510-0000', '612-0000'),
          ('BEDFRAME',           '610-0040', '500-0000', '510-0000', '612-0000'),
          ('MATTRESS PROTECTOR', '610-0050', '500-0000', '510-0000', '612-0000'),
          ('PILLOW',             '610-0070', '500-0000', '510-0000', '612-0000'),
          ('OTHERS',             '610-0000', '500-0000', '510-0000', '612-0000'),
          ('SERVICE',            '604-0000', '500-3000', '510-0000', '612-0000'),
          ('GUARANTEE',          '604-0000', '500-5000', '510-0000', '612-0000')
       ) g(name, p, s, sr, pr)
on conflict do nothing;

insert into public.gl_item_group_categories (category, group_id)
select c.category::public.product_category, g.id
  from (values ('mattress', 'MATTRESS'), ('bedframe', 'BEDFRAME'), ('sofa', 'SOFA'),
               ('accessory', 'OTHERS'), ('service', 'SERVICE'), ('guarantee', 'GUARANTEE')) c(category, grp)
  join public.gl_item_groups g on upper(g.name) = c.grp
on conflict (category) do nothing;

-- The accessories already in the catalog, placed for Chew to check (MASTER §0).
insert into public.gl_item_group_models (model_id, group_id)
select m.id, g.id
  from (values ('mattress-protector', 'MATTRESS PROTECTOR'), ('memory-foam-pillow', 'PILLOW'),
               ('sofa-long-pillow', 'PILLOW'), ('sofa-square-pillow', 'PILLOW')) p(model_key, grp)
  join public.product_models m on m.model_key = p.model_key and m.category = 'accessory'
  join public.gl_item_groups g on upper(g.name) = p.grp
on conflict (model_id) do nothing;

-- ── 7 · which group a product is in ──────────────────────────────────────────
create or replace function public.gl_item_group_of_model(p_model_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select coalesce(
    (select p.group_id from public.gl_item_group_models p where p.model_id = p_model_id),
    (select c.group_id
       from public.product_models m
       join public.gl_item_group_categories c on c.category = m.category
      where m.id = p_model_id));
$function$;

create or replace function public.gl_item_group_of_sku(p_sku text)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select public.gl_item_group_of_model(s.model_id) from public.product_skus s where s.sku = p_sku;
$function$;

create or replace function public.gl_item_group_purchase_account(p_sku text)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select g.purchase_account from public.gl_item_groups g where g.id = public.gl_item_group_of_sku(p_sku);
$function$;

comment on function public.gl_item_group_of_model(uuid) is
  '0659: the item group a product is in: where Finance placed it, else its category''s.';
comment on function public.gl_item_group_of_sku(text) is
  '0659: the item group of a SKU''s product; null when the SKU is not in the catalog.';
comment on function public.gl_item_group_purchase_account(text) is
  '0659: the purchase account of a SKU''s item group; null when the group has none or the SKU is not in the catalog.';
revoke all on function public.gl_item_group_of_model(uuid) from public, anon, authenticated;
revoke all on function public.gl_item_group_of_sku(text) from public, anon, authenticated;
revoke all on function public.gl_item_group_purchase_account(text) from public, anon, authenticated;

-- ── 8 · a sale's goods, by item group ────────────────────────────────────────
-- Called by _sales_invoice_to_ledger right after it credits ALL of an order's
-- goods to the goods row (p_goods_account). It moves each item group's share
-- to the group's sales account. What stays on the goods row: a group with no
-- sales account, and a SKU not in the catalog; each is listed. A source with
-- its own goods row (a rental-born order: subscription income) moves nothing.
-- If any account would end below zero, nothing moves (a guard: no order line
-- is negative today).
create or replace function public._gl_goods_split(
  p_credits       jsonb,
  p_goods_account text,
  p_goods         numeric,
  p_order_id      uuid,
  p_invoice_no    text,
  p_source        text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_credits jsonb := p_credits;
  v_rec     record;
  v_unbound jsonb := '[]'::jsonb;
  v_u       jsonb;
begin
  if coalesce(p_goods, 0) = 0 or p_goods_account is null then
    return p_credits;
  end if;
  if exists (select 1 from public.gl_income_account_map m
              where m.component_type = 'GOODS'
                and m.component_key = coalesce(p_source, '*')
                and m.component_key <> '*') then
    return p_credits;
  end if;

  for v_rec in
    select x.group_id, g.sales_account,
           round(sum(x.amt), 2) as amt,
           array_agg(distinct x.sku order by x.sku) filter (where x.sku is not null) as skus
      from (select ol.sku, ol.qty * ol.unit_price as amt,
                   public.gl_item_group_of_sku(ol.sku) as group_id
              from public.order_lines ol
             where ol.order_id = p_order_id) x
      left join public.gl_item_groups g on g.id = x.group_id
     group by x.group_id, g.sales_account
  loop
    if v_rec.amt = 0 then
      continue;
    end if;
    if v_rec.sales_account is null then
      v_unbound := v_unbound || jsonb_build_array(jsonb_build_object(
        'group_id', v_rec.group_id, 'skus', to_jsonb(coalesce(v_rec.skus, '{}'::text[])), 'amount', v_rec.amt));
    elsif v_rec.sales_account <> p_goods_account then
      v_credits := jsonb_set(v_credits, array[p_goods_account],
                     to_jsonb(round(coalesce((v_credits->>p_goods_account)::numeric, 0) - v_rec.amt, 2)));
      v_credits := jsonb_set(v_credits, array[v_rec.sales_account],
                     to_jsonb(round(coalesce((v_credits->>v_rec.sales_account)::numeric, 0) + v_rec.amt, 2)));
    end if;
  end loop;

  if exists (select 1 from jsonb_each_text(v_credits) e where e.value::numeric < 0) then
    return p_credits;
  end if;

  for v_u in select value from jsonb_array_elements(v_unbound) loop
    insert into public.gl_item_group_unbound_sales (invoice_no, group_id, skus, amount, account_code)
    values (p_invoice_no,
            nullif(v_u ->> 'group_id', '')::uuid,
            array(select jsonb_array_elements_text(v_u -> 'skus')),
            (v_u ->> 'amount')::numeric,
            p_goods_account)
    on conflict do nothing;
  end loop;

  return v_credits;
end;
$function$;

comment on function public._gl_goods_split(jsonb, text, numeric, uuid, text, text) is
  '0659: moves each item group''s share of an order''s goods from the goods row to the group''s sales account; lists what stays. Called by _sales_invoice_to_ledger only.';
revoke all on function public._gl_goods_split(jsonb, text, numeric, uuid, text, text) from public, anon, authenticated;

-- ── 9 · the doors ────────────────────────────────────────────────────────────
-- The account an item group binds: in the chart, in use, not a heading, not
-- kept by its own documents, and of the kind the posting takes (0657's checks
-- and sentences). Empty is allowed: that posting is not bound yet.
create or replace function public._gl_item_group_account(p_code text, p_kind text)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_code text := nullif(upper(btrim(coalesce(p_code, ''))), '');
  v_acc  public.gl_accounts%rowtype;
begin
  if v_code is null then
    return null;
  end if;
  select * into v_acc from public.gl_accounts a where a.code = v_code;
  if not found then
    raise exception 'Account % is not in the chart.', v_code
      using errcode = '22023', detail = 'account_not_found';
  end if;
  if not v_acc.is_active then
    raise exception 'Account % % is retired.', v_acc.code, v_acc.name
      using errcode = '22023', detail = 'account_retired';
  end if;
  if v_acc.is_heading then
    raise exception 'Account % % is a group heading. Pick an account under it.', v_acc.code, v_acc.name
      using errcode = '22023', detail = 'account_is_header';
  end if;
  if v_acc.is_control or exists (select 1 from public.gl_money_accounts m where m.account_code = v_acc.code) then
    raise exception 'Account % % is kept by its own documents and cannot be picked here.', v_acc.code, v_acc.name
      using errcode = '22023', detail = 'account_is_control';
  end if;
  if v_acc.kind <> p_kind then
    raise exception 'Account % % is not an % account.', v_acc.code, v_acc.name,
        case p_kind when 'INCOME' then 'income' else 'expense' end
      using errcode = '22023', detail = 'account_wrong_kind';
  end if;
  return v_acc.code;
end;
$function$;

revoke all on function public._gl_item_group_account(text, text) from public, anon, authenticated;

-- Add a group (p_id null) or change one. p_was is the group as the screen
-- showed it; a change made since is refused, never overwritten.
create or replace function public.gl_item_group_save(
  p_id                      uuid,
  p_name                    text,
  p_purchase_account        text,
  p_sales_account           text,
  p_sales_return_account    text,
  p_purchase_return_account text,
  p_active                  boolean,
  p_was                     jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_role text := public.app_role()::text;
  v_name text := btrim(coalesce(p_name, ''));
  v_p    text;
  v_s    text;
  v_sr   text;
  v_pr   text;
  v_old  public.gl_item_groups%rowtype;
  v_new  public.gl_item_groups%rowtype;
begin
  if v_role is null or v_role not in ('finance', 'principal') then
    raise exception 'Only Finance changes the item groups.'
      using errcode = '42501', detail = 'not_finance';
  end if;
  if v_name = '' then
    raise exception 'Give the item group a name.'
      using errcode = '22023', detail = 'item_group_name_missing';
  end if;
  if length(v_name) > 40 then
    raise exception 'Keep the name to 40 characters.'
      using errcode = '22023', detail = 'item_group_name_long';
  end if;
  v_p  := public._gl_item_group_account(p_purchase_account, 'EXPENSE');
  v_s  := public._gl_item_group_account(p_sales_account, 'INCOME');
  v_sr := public._gl_item_group_account(p_sales_return_account, 'INCOME');
  v_pr := public._gl_item_group_account(p_purchase_return_account, 'EXPENSE');

  perform pg_advisory_xact_lock(hashtext('gl_item_groups'));
  if exists (select 1 from public.gl_item_groups g
              where upper(g.name) = upper(v_name) and g.id is distinct from p_id) then
    raise exception 'Another item group is already called %.', v_name
      using errcode = '22023', detail = 'item_group_name_taken';
  end if;

  if p_id is null then
    insert into public.gl_item_groups (name, purchase_account, sales_account, sales_return_account,
                                       purchase_return_account, is_active, updated_by)
    values (v_name, v_p, v_s, v_sr, v_pr, true, auth.uid())
    returning * into v_new;
    insert into public.gl_item_group_changes (group_id, what, to_text, changed_by)
    values (v_new.id, 'ADDED', v_new.name, auth.uid());
    insert into public.gl_item_group_changes (group_id, what, to_code, changed_by)
    select v_new.id, x.what, x.code, auth.uid()
      from (values ('PURCHASE', v_p), ('SALES', v_s), ('SALES_RETURN', v_sr), ('PURCHASE_RETURN', v_pr)) x(what, code)
     where x.code is not null;
    return jsonb_build_object('id', v_new.id, 'changed', true);
  end if;

  select * into v_old from public.gl_item_groups g where g.id = p_id for update;
  if not found then
    raise exception 'That item group is not in the list.'
      using errcode = 'P0002', detail = 'item_group_missing';
  end if;
  if (p_was ->> 'name') is distinct from v_old.name
     or nullif(p_was ->> 'purchaseAccount', '') is distinct from v_old.purchase_account
     or nullif(p_was ->> 'salesAccount', '') is distinct from v_old.sales_account
     or nullif(p_was ->> 'salesReturnAccount', '') is distinct from v_old.sales_return_account
     or nullif(p_was ->> 'purchaseReturnAccount', '') is distinct from v_old.purchase_return_account
     or (p_was ->> 'active')::boolean is distinct from v_old.is_active then
    raise exception 'Someone else changed this item group after you opened it. Open it again to see their change.'
      using errcode = '40001', detail = 'item_group_changed';
  end if;

  -- A bound posting stays bound: the bills and sales of its products need it.
  if (v_old.purchase_account is not null and v_p is null)
     or (v_old.sales_account is not null and v_s is null)
     or (v_old.sales_return_account is not null and v_sr is null)
     or (v_old.purchase_return_account is not null and v_pr is null) then
    raise exception 'An item group keeps an account once it has one. Pick another account instead.'
      using errcode = '22023', detail = 'item_group_account_cleared';
  end if;

  if v_old.is_active and not coalesce(p_active, true) then
    if exists (select 1 from public.gl_item_group_categories c where c.group_id = v_old.id) then
      raise exception 'New products of a catalog category start in %, so it stays in use.', v_old.name
        using errcode = '22023', detail = 'item_group_category_start';
    end if;
    if exists (select 1 from public.product_models m
                where m.discontinued_at is null and public.gl_item_group_of_model(m.id) = v_old.id) then
      raise exception '% still has products. Move them to another item group first.', v_old.name
        using errcode = '22023', detail = 'item_group_has_products';
    end if;
  end if;

  update public.gl_item_groups
     set name                    = v_name,
         purchase_account        = v_p,
         sales_account           = v_s,
         sales_return_account    = v_sr,
         purchase_return_account = v_pr,
         is_active               = coalesce(p_active, v_old.is_active),
         updated_at              = now(),
         updated_by              = auth.uid()
   where id = v_old.id
   returning * into v_new;

  insert into public.gl_item_group_changes (group_id, what, from_text, to_text, changed_by)
  select v_new.id, x.what, x.f, x.t, auth.uid()
    from (values ('NAME', v_old.name, v_new.name),
                 ('ACTIVE', v_old.is_active::text, v_new.is_active::text)) x(what, f, t)
   where x.f is distinct from x.t;
  insert into public.gl_item_group_changes (group_id, what, from_code, to_code, changed_by)
  select v_new.id, x.what, x.f, x.t, auth.uid()
    from (values ('PURCHASE', v_old.purchase_account, v_new.purchase_account),
                 ('SALES', v_old.sales_account, v_new.sales_account),
                 ('SALES_RETURN', v_old.sales_return_account, v_new.sales_return_account),
                 ('PURCHASE_RETURN', v_old.purchase_return_account, v_new.purchase_return_account)) x(what, f, t)
   where x.f is distinct from x.t;

  return jsonb_build_object('id', v_new.id,
                            'changed', (to_jsonb(v_old) - 'updated_at' - 'updated_by')
                                       is distinct from (to_jsonb(v_new) - 'updated_at' - 'updated_by'));
end;
$function$;

comment on function public.gl_item_group_save(uuid, text, text, text, text, text, boolean, jsonb) is
  '0659: Finance Settings → Item groups. Add a group, or change its name, its four accounts or Active. Finance or principal. Every change is kept in gl_item_group_changes.';
revoke all on function public.gl_item_group_save(uuid, text, text, text, text, text, boolean, jsonb) from public, anon;
grant execute on function public.gl_item_group_save(uuid, text, text, text, text, text, boolean, jsonb) to authenticated;

-- The one write path of a product's group. Back into its category's group
-- removes the placement.
create or replace function public._gl_item_group_put(p_model_id uuid, p_group_id uuid, p_was uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_model   public.product_models%rowtype;
  v_group   public.gl_item_groups%rowtype;
  v_now     uuid;
  v_start   uuid;
begin
  select * into v_model from public.product_models m where m.id = p_model_id;
  if not found then
    raise exception 'That product is not in the catalog.'
      using errcode = 'P0002', detail = 'product_missing';
  end if;
  select * into v_group from public.gl_item_groups g where g.id = p_group_id;
  if not found then
    raise exception 'That item group is not in the list.'
      using errcode = 'P0002', detail = 'item_group_missing';
  end if;
  if not v_group.is_active then
    raise exception '% is not in use. Choose an item group in use.', v_group.name
      using errcode = '22023', detail = 'item_group_off';
  end if;

  perform pg_advisory_xact_lock(hashtext('gl_item_group_models:' || p_model_id::text));
  v_now := public.gl_item_group_of_model(p_model_id);
  if v_now is distinct from p_was then
    raise exception 'Someone else moved this product after you opened it. Open it again to see their change.'
      using errcode = '40001', detail = 'item_group_changed';
  end if;
  if v_now is not distinct from p_group_id then
    return jsonb_build_object('modelId', p_model_id, 'groupId', p_group_id, 'changed', false);
  end if;

  select c.group_id into v_start from public.gl_item_group_categories c where c.category = v_model.category;
  if v_start is not distinct from p_group_id then
    delete from public.gl_item_group_models where model_id = p_model_id;
  else
    insert into public.gl_item_group_models (model_id, group_id, placed_by)
    values (p_model_id, p_group_id, auth.uid())
    on conflict (model_id) do update
      set group_id  = excluded.group_id,
          placed_at = now(),
          placed_by = excluded.placed_by;
  end if;

  insert into public.gl_item_group_changes (group_id, what, model_id, model_name, from_group, changed_by)
  values (p_group_id, 'PRODUCT', p_model_id, v_model.name, v_now, auth.uid());

  return jsonb_build_object('modelId', p_model_id, 'groupId', p_group_id, 'changed', true);
end;
$function$;

revoke all on function public._gl_item_group_put(uuid, uuid, uuid) from public, anon, authenticated;

-- Finance moves a product into another group.
create or replace function public.gl_item_group_place(p_model_id uuid, p_group_id uuid, p_was uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_role text := public.app_role()::text;
begin
  if v_role is null or v_role not in ('finance', 'principal') then
    raise exception 'Only Finance changes the item groups.'
      using errcode = '42501', detail = 'not_finance';
  end if;
  return public._gl_item_group_put(p_model_id, p_group_id, p_was);
end;
$function$;

comment on function public.gl_item_group_place(uuid, uuid, uuid) is
  '0659: Finance Settings → Item groups. Move a product into another item group. Finance or principal.';
revoke all on function public.gl_item_group_place(uuid, uuid, uuid) from public, anon;
grant execute on function public.gl_item_group_place(uuid, uuid, uuid) to authenticated;

-- The catalog's new model and SKU forms (Chew 2026-10-07, MASTER §1): the
-- group a NEW product starts in. Whoever may add to the catalog; only in the
-- product's first hour and before it was ever placed. After that, Finance.
create or replace function public.gl_item_group_start(p_model_id uuid, p_group_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_created timestamptz;
begin
  if not coalesce(public.is_internal(), false) then
    raise exception 'forbidden' using errcode = '42501', detail = 'not_internal';
  end if;
  select m.created_at into v_created from public.product_models m where m.id = p_model_id;
  if not found then
    raise exception 'That product is not in the catalog.'
      using errcode = 'P0002', detail = 'product_missing';
  end if;
  if v_created < now() - interval '1 hour'
     or exists (select 1 from public.gl_item_group_models p where p.model_id = p_model_id)
     or exists (select 1 from public.gl_item_group_changes ch where ch.model_id = p_model_id) then
    raise exception 'The item group of a product already in the catalog is changed by Finance.'
      using errcode = '42501', detail = 'item_group_finance_moves';
  end if;
  return public._gl_item_group_put(p_model_id, p_group_id, public.gl_item_group_of_model(p_model_id));
end;
$function$;

comment on function public.gl_item_group_start(uuid, uuid) is
  '0659: the catalog''s new-product forms set the item group a new product starts in. Internal users, in the product''s first hour, before it was ever placed.';
revoke all on function public.gl_item_group_start(uuid, uuid) from public, anon;
grant execute on function public.gl_item_group_start(uuid, uuid) to authenticated;

-- The catalog's choices: the groups in use, and each category's start.
create or replace function public.gl_item_group_choices()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
begin
  if not coalesce(public.is_internal(), false) then
    raise exception 'forbidden' using errcode = '42501', detail = 'not_internal';
  end if;
  return jsonb_build_object(
    'groups', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name) order by g.name)
                          from public.gl_item_groups g where g.is_active), '[]'::jsonb),
    'starts', coalesce((select jsonb_object_agg(c.category::text, c.group_id)
                          from public.gl_item_group_categories c), '{}'::jsonb));
end;
$function$;

comment on function public.gl_item_group_choices() is
  '0659: the item groups in use and the group each catalog category starts in, for the catalog''s new-product forms. Internal users.';
revoke all on function public.gl_item_group_choices() from public, anon;
grant execute on function public.gl_item_group_choices() to authenticated;

-- ── 10 · Finance's read ──────────────────────────────────────────────────────
create or replace function public.gl_item_groups_read()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
begin
  if not public.gl_may_read() then
    raise exception 'The chart is for Finance.'
      using errcode = '42501', detail = 'not_finance';
  end if;

  return jsonb_build_object(
    'groups', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', g.id,
               'name', g.name,
               'active', g.is_active,
               'purchaseAccount', g.purchase_account, 'purchaseName', pa.name,
               'salesAccount', g.sales_account, 'salesName', sa.name,
               'salesReturnAccount', g.sales_return_account, 'salesReturnName', sra.name,
               'purchaseReturnAccount', g.purchase_return_account, 'purchaseReturnName', pra.name,
               'categories', coalesce((select jsonb_agg(c.category::text order by c.category)
                                         from public.gl_item_group_categories c where c.group_id = g.id), '[]'::jsonb),
               'products', (select count(*) from public.product_models m
                             where m.discontinued_at is null and public.gl_item_group_of_model(m.id) = g.id))
             order by g.name)
        from public.gl_item_groups g
        left join public.gl_accounts pa  on pa.code  = g.purchase_account
        left join public.gl_accounts sa  on sa.code  = g.sales_account
        left join public.gl_accounts sra on sra.code = g.sales_return_account
        left join public.gl_accounts pra on pra.code = g.purchase_return_account
    ), '[]'::jsonb),

    'products', coalesce((
      select jsonb_agg(jsonb_build_object(
               'modelId', m.id,
               'name', m.name,
               'category', m.category::text,
               'skus', (select count(*) from public.product_skus s where s.model_id = m.id),
               'groupId', public.gl_item_group_of_model(m.id),
               'placed', exists (select 1 from public.gl_item_group_models p where p.model_id = m.id),
               'discontinued', m.discontinued_at is not null)
             order by m.category, m.name)
        from public.product_models m
    ), '[]'::jsonb),

    -- Sales whose goods went to the goods row, on invoices still in force.
    'unbound', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', u.id,
               'invoiceNo', u.invoice_no,
               'so', o.so,
               'issuedAt', i.issued_at,
               'groupId', u.group_id,
               'skus', to_jsonb(u.skus),
               'amount', u.amount,
               'accountCode', u.account_code,
               'accountName', a.name)
             order by u.posted_at desc, u.id desc)
        from public.gl_item_group_unbound_sales u
        join public.invoices i on i.invoice_no = u.invoice_no and i.voided_at is null
        left join public.orders o on o.id = i.order_id
        left join public.gl_accounts a on a.code = u.account_code
    ), '[]'::jsonb),

    'changes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', ch.id::text,
               'what', ch.what,
               'groupId', ch.group_id,
               'groupName', g.name,
               'modelName', ch.model_name,
               'fromGroupName', fg.name,
               'fromCode', ch.from_code, 'fromName', fa.name,
               'toCode', ch.to_code, 'toName', ta.name,
               'fromText', ch.from_text,
               'toText', ch.to_text,
               'changedAt', ch.changed_at,
               'changedBy', u.name)
             order by ch.changed_at desc, ch.id desc)
        from (select * from public.gl_item_group_changes
               order by changed_at desc, id desc limit 100) ch
        join public.gl_item_groups g on g.id = ch.group_id
        left join public.gl_item_groups fg on fg.id = ch.from_group
        left join public.gl_accounts fa on fa.code = ch.from_code
        left join public.gl_accounts ta on ta.code = ch.to_code
        left join public.app_users u on u.id = ch.changed_by
    ), '[]'::jsonb));
end;
$function$;

comment on function public.gl_item_groups_read() is
  '0659: Finance Settings → Item groups: the groups and their accounts, every product and its group, the sales that went to the goods row, and the latest 100 changes.';
revoke all on function public.gl_item_groups_read() from public, anon;
grant execute on function public.gl_item_groups_read() to authenticated;

-- ── 11 · a bill line keeps whether a person chose its account ────────────────
alter table public.supplier_bill_lines
  add column if not exists account_chosen boolean not null default false;

comment on column public.supplier_bill_lines.account_chosen is
  '0659: a person chose this line''s account. A goods line nobody chose an account for takes its item group''s purchase account when the bill is confirmed.';

-- ── 12 · the guarded rewrites ────────────────────────────────────────────────
-- Each changes one short piece of the LIVE body, which must hold it exactly
-- once (line ends read as LF); everything else in the body stays as it is.
create or replace function pg_temp.mig0659_rewrite(p_fn regprocedure, p_old text, p_new text)
returns void
language plpgsql
as $rw$
declare
  v_def text := replace(pg_get_functiondef(p_fn), E'\r\n', E'\n');
  v_n   integer;
begin
  v_n := (length(v_def) - length(replace(v_def, p_old, ''))) / greatest(length(p_old), 1);
  if v_n <> 1 then
    raise exception '0659: % holds the text to change % times, not once: %', p_fn, v_n, left(p_old, 90);
  end if;
  execute replace(v_def, p_old, p_new);
end;
$rw$;

-- (a) a sale: each item group's share goes to its sales account.
select pg_temp.mig0659_rewrite('public._sales_invoice_to_ledger(text)'::regprocedure,
$old$+ v_goods, 2)));$old$,
$new$+ v_goods, 2)));
      -- 0659: each item group's share to its own sales account.
      v_credits := public._gl_goods_split(v_credits, v_account, v_goods, v_inv.order_id,
                                          p_invoice_no, v_order.source_system);$new$);

-- (b) a bill draft: a goods line's account is the one chosen, else its item
--     group's purchase account, else the role; the line keeps which.
select pg_temp.mig0659_rewrite(
  'public.supplier_bill_save_draft(uuid, uuid, text, date, jsonb, date, text, text)'::regprocedure,
$old$coalesce(v_account, public.gl_account_for('COST_OF_GOODS_SOLD'))$old$,
$new$coalesce(v_account, public.gl_item_group_purchase_account(v_pol.sku), public.gl_account_for('COST_OF_GOODS_SOLD'))$new$);

select pg_temp.mig0659_rewrite(
  'public.supplier_bill_save_draft(uuid, uuid, text, date, jsonb, date, text, text)'::regprocedure,
$old$po_line_id, department_type, department_id)$old$,
$new$po_line_id, department_type, department_id, account_chosen)$new$);

select pg_temp.mig0659_rewrite(
  'public.supplier_bill_save_draft(uuid, uuid, text, date, jsonb, date, text, text)'::regprocedure,
$old$v_dept.department_type, v_dept.department_id);$old$,
$new$v_dept.department_type, v_dept.department_id,
       -- 0659: a non-goods line's account is always chosen.
       v_rcpt is null or nullif(btrim(coalesce(v_line ->> 'account_code', '')), '') is not null);$new$);

-- (c) a bill confirm: a goods line whose item group has no purchase account
--     stops the bill (MASTER §0); goods lines nobody chose an account for take
--     their item group's purchase account as it stands now.
select pg_temp.mig0659_rewrite('public.supplier_bill_confirm(uuid)'::regprocedure,
$old$-- Dr each line, Cr the AP control for the whole, party = the supplier.$old$,
$new$-- 0659: a goods line whose item group has no purchase account stops the
  -- bill; a goods line nobody chose an account for takes the group's, as it
  -- stands now.
  select string_agg(distinct g.name, ', ' order by g.name) into v_bad
    from public.supplier_bill_lines l
    join public.purchase_order_lines pol on pol.id = l.po_line_id
    join public.gl_item_groups g on g.id = public.gl_item_group_of_sku(pol.sku)
   where l.bill_id = p_bill_id and g.purchase_account is null;
  if v_bad is not null then
    raise exception 'These item groups have no purchase account yet: %. Give them one in Finance Settings → Item groups, then confirm this bill.', v_bad
      using errcode = 'P0001', detail = 'item_group_unbound';
  end if;
  for r in
    select l.id, l.line_no, g.purchase_account
      from public.supplier_bill_lines l
      join public.purchase_order_lines pol on pol.id = l.po_line_id
      join public.gl_item_groups g on g.id = public.gl_item_group_of_sku(pol.sku)
     where l.bill_id = p_bill_id and not l.account_chosen
       and l.account_code is distinct from g.purchase_account
  loop
    perform public._ap_require_account(r.purchase_account, 'bill_line', format('Line %s', r.line_no));
    update public.supplier_bill_lines set account_code = r.purchase_account where id = r.id;
  end loop;

  -- Dr each line, Cr the AP control for the whole, party = the supplier.$new$);

-- (d) the bill read says whether each line's account was chosen.
select pg_temp.mig0659_rewrite('public.supplier_bill_document(uuid)'::regprocedure,
$old$a.name as account_name, bl.description, bl.sku,$old$,
$new$a.name as account_name, bl.account_chosen, bl.description, bl.sku,$new$);

-- (e) an item group's account is an account the system posts to: not retired.
select pg_temp.mig0659_rewrite('public.gl_account_set_active(text, boolean)'::regprocedure,
$old$gl_payment_account_map m where m.account_code = v_acc.code)$old$,
$new$gl_payment_account_map m where m.account_code = v_acc.code)
     or exists (select 1 from public.gl_item_groups g
                 where v_acc.code in (g.purchase_account, g.sales_account,
                                      g.sales_return_account, g.purchase_return_account))$new$);

-- ── sanity ───────────────────────────────────────────────────────────────────
do $sanity$
declare
  v_src text;
  v_bad text;
begin
  select string_agg(e::text, ', ') into v_bad
    from unnest(enum_range(null::public.product_category)) e
   where not exists (select 1 from public.gl_item_group_categories c where c.category = e);
  if v_bad is not null then
    raise exception '0659: catalog categories with no item group to start in: %', v_bad;
  end if;
  if exists (select 1 from public.gl_item_groups g
              join public.gl_accounts a
                on a.code in (g.purchase_account, g.sales_account, g.sales_return_account, g.purchase_return_account)
             where not a.is_active or a.is_heading or a.is_control) then
    raise exception '0659: an item group binds an account not in use';
  end if;

  select pg_get_functiondef('public._sales_invoice_to_ledger(text)'::regprocedure) into v_src;
  if position('_gl_goods_split(' in v_src) = 0 or position('gl_income_account_for(''GOODS''' in v_src) = 0 then
    raise exception '0659: _sales_invoice_to_ledger lost its goods row or does not split by item group';
  end if;
  select pg_get_functiondef('public.supplier_bill_save_draft(uuid, uuid, text, date, jsonb, date, text, text)'::regprocedure) into v_src;
  if position('gl_item_group_purchase_account(' in v_src) = 0 or position('account_chosen' in v_src) = 0
     or position('fin_line_department(' in v_src) = 0 then
    raise exception '0659: supplier_bill_save_draft lost 0540 or does not keep the item group account';
  end if;
  select pg_get_functiondef('public.supplier_bill_confirm(uuid)'::regprocedure) into v_src;
  if position('item_group_unbound' in v_src) = 0 or position('grn_changed_since_draft' in v_src) = 0 then
    raise exception '0659: supplier_bill_confirm lost its GRN check or does not take the item group account';
  end if;
  select pg_get_functiondef('public.supplier_bill_document(uuid)'::regprocedure) into v_src;
  if position('bl.account_chosen' in v_src) = 0 or position('credit_note' in v_src) = 0 then
    raise exception '0659: supplier_bill_document lost 0642 or does not say which accounts were chosen';
  end if;
  select pg_get_functiondef('public.gl_account_set_active(text, boolean)'::regprocedure) into v_src;
  if position('gl_item_groups' in v_src) = 0 or position('retire_system_account' in v_src) = 0 then
    raise exception '0659: gl_account_set_active does not keep an item group''s account';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public'
                and p.proname in ('_sales_invoice_to_ledger', 'supplier_bill_save_draft', 'supplier_bill_confirm',
                                  'supplier_bill_document', 'gl_account_set_active')
                and not (p.prosecdef and p.proconfig @> array['search_path=public, pg_temp'])) then
    raise exception '0659: a rewritten function lost security definer or its search_path';
  end if;

  if has_function_privilege('anon', 'public.gl_item_group_save(uuid, text, text, text, text, text, boolean, jsonb)', 'execute')
     or has_function_privilege('anon', 'public.gl_item_group_place(uuid, uuid, uuid)', 'execute')
     or has_function_privilege('anon', 'public.gl_item_group_start(uuid, uuid)', 'execute')
     or has_function_privilege('anon', 'public.gl_item_groups_read()', 'execute')
     or has_function_privilege('anon', 'public.gl_item_group_choices()', 'execute') then
    raise exception '0659: an item group door is open to signed-out callers';
  end if;
  if not has_function_privilege('authenticated', 'public.gl_item_group_save(uuid, text, text, text, text, text, boolean, jsonb)', 'execute')
     or not has_function_privilege('authenticated', 'public.gl_item_groups_read()', 'execute') then
    raise exception '0659: an item group door is closed to signed-in callers';
  end if;
  if has_function_privilege('authenticated', 'public._gl_goods_split(jsonb, text, numeric, uuid, text, text)', 'execute')
     or has_function_privilege('authenticated', 'public._gl_item_group_put(uuid, uuid, uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.gl_item_group_of_sku(text)', 'execute') then
    raise exception '0659: a private item group helper is open to callers';
  end if;
  -- A caller with no role is refused before anything is read or written.
  begin
    perform public.gl_item_group_save(null, 'X', null, null, null, null, true, null);
    raise exception '0659: the save door ran for a caller with no role';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform public.gl_item_group_choices();
    raise exception '0659: the choices read ran for a caller with no role';
  exception when insufficient_privilege then
    null;
  end;
end $sanity$;

commit;
