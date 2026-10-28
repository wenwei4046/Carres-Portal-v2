-- =============================================================================
-- 0657_finance_keeps_its_posting_accounts.sql
-- =============================================================================
-- WHAT WAS MISSING
--   Chew (Finance, 2026-10-07, docs/finance/MASTER.md §0 "Automatic posting
--   accounts"): every kind of posting the system makes, and the account it
--   goes to, on one Settings page where Chew can change the account. Today the
--   accounts live in gl_income_account_map (0466) and gl_account_roles (0554).
--   The income map's one door, gl_map_income_account, is the principal's and
--   has no screen; a role changes only through a migration; and neither keeps
--   who changed what, from which account to which.
--
--   One add-on has no income account: 'dispose-old-sofa-big-sofa' (measured
--   2026-10-07). An invoice that carries it refuses to post, by 0466's design.
--
-- WHAT THIS ADDS
--   1. gl_posting_account_changes: one row per change: which posting, from
--      which account to which, who and when. Finance reads it; only the doors
--      below write it; a chart renumber carries its numbers and nothing else
--      changes or removes a row.
--   2. _gl_posting_account_write: the one write path for the income map and
--      for the three roles Finance may change. The account must be in use, not
--      a heading, not a control or money account, and the kind the posting
--      needs. A change is recorded; saving the same account is not a change.
--   3. gl_posting_account_set(p_what, p_key, p_account_code, p_was): the
--      screen's door, for Finance and the principal. p_was is the account the
--      screen showed; when someone has changed it since, the save is refused.
--   4. gl_map_income_account keeps its name and arguments and now writes
--      through the same path, so the map has one way in and every change is
--      recorded. Finance may use it too.
--   5. gl_posting_accounts(): what the page reads: the income map with every
--      add-on (an add-on with no account says so), the roles, and the latest
--      100 changes.
--   6. 'dispose-old-sofa-big-sofa' credits 500-3000 SERVICE CHARGES, as the
--      other disposals do (Chew's mapping: service charges, disposal and
--      no-lift, are 500-3000).
--
-- WHICH ROLES FINANCE MAY CHANGE HERE
--   COST_OF_GOODS_SOLD (a supplier bill's goods, an expense account),
--   BANK_AND_PAYMENT_CHARGES (bank charges and card payout fees, an expense
--   account) and OTHER_INCOME (money the bank pays in, such as interest, an
--   income account). The page shows the others and does not change them: the
--   payables and customer deposits carry open documents and party balances,
--   stock and the equity accounts belong to the month and year end, and a
--   heading decides where new accounts go. Chart of accounts still renames and
--   renumbers every one of them. The money accounts customer payments go to
--   are changed in Payment settings, which keeps its own record (0431, 0541).
--
-- RLS: the new table reads for Finance (gl_may_read) and has no write policy.
-- DATA: one income map row (6). DR/CR: none. A change applies to postings made
--   after it; earlier postings keep their accounts.
-- =============================================================================

begin;

set local search_path = public, pg_temp;

-- ── 1 · the record of every change ───────────────────────────────────────────
create table if not exists public.gl_posting_account_changes (
  id          bigint generated always as identity primary key,
  what        text not null check (what in ('INCOME', 'ROLE')),
  key         text not null,
  from_code   text references public.gl_accounts(code) on update cascade,
  to_code     text not null references public.gl_accounts(code) on update cascade,
  changed_by  uuid references public.app_users(id),
  changed_at  timestamptz not null default now()
);

comment on table public.gl_posting_account_changes is
  '0657: each change to a posting account. what INCOME: key is component_type/component_key of gl_income_account_map; what ROLE: key is the gl_account_roles role. Written only by _gl_posting_account_write.';

create index if not exists gl_posting_account_changes_when
  on public.gl_posting_account_changes (changed_at desc);

alter table public.gl_posting_account_changes enable row level security;
revoke all on public.gl_posting_account_changes from anon, authenticated;
grant select on public.gl_posting_account_changes to authenticated;
drop policy if exists gl_posting_account_changes_read on public.gl_posting_account_changes;
create policy gl_posting_account_changes_read on public.gl_posting_account_changes
  for select using ((select public.gl_may_read()));

-- A change once recorded stays as it was. A chart renumber may carry the new
-- number (0570); nothing else edits or removes a row.
create or replace function public.gl_posting_account_changes_frozen()
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
  raise exception 'A recorded change to a posting account cannot be altered.'
    using errcode = '42501', detail = 'posting_change_frozen';
end;
$function$;

drop trigger if exists gl_posting_account_changes_frozen on public.gl_posting_account_changes;
create trigger gl_posting_account_changes_frozen
  before update or delete on public.gl_posting_account_changes
  for each row execute function public.gl_posting_account_changes_frozen();

-- ── 2 · the one write path ───────────────────────────────────────────────────
create or replace function public._gl_posting_account_write(
  p_what         text,
  p_key          text,
  p_account_code text,
  p_note         text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_code  text := upper(btrim(coalesce(p_account_code, '')));
  v_type  text;
  v_ckey  text;
  v_need  text;
  v_now   text;
  v_acc   public.gl_accounts%rowtype;
begin
  if p_what = 'ROLE' then
    if p_key not in ('COST_OF_GOODS_SOLD', 'BANK_AND_PAYMENT_CHARGES', 'OTHER_INCOME') then
      raise exception 'This posting account is kept by the system and is changed in Chart of accounts.'
        using errcode = '22023', detail = 'posting_not_changeable';
    end if;
    v_need := case when p_key = 'OTHER_INCOME' then 'INCOME' else 'EXPENSE' end;
    select r.account_code into v_now from public.gl_account_roles r where r.role = p_key for update;
    if not found then
      raise exception 'This posting has no account yet.' using errcode = 'P0002', detail = 'posting_missing';
    end if;
  elsif p_what = 'INCOME' then
    v_type := split_part(coalesce(p_key, ''), '/', 1);
    v_ckey := nullif(substr(coalesce(p_key, ''), length(v_type) + 2), '');
    if v_type not in ('GOODS', 'ADDON', 'STORAGE') or v_ckey is null then
      raise exception 'This is not a posting the system makes.' using errcode = '22023', detail = 'posting_unknown';
    end if;
    -- 0466: an add-on is mapped by its own key, never by a catch-all row.
    if v_type = 'ADDON' and v_ckey = '*' then
      raise exception 'Choose the account for each add-on.' using errcode = '22023', detail = 'addon_wildcard_refused';
    end if;
    v_need := 'INCOME';
    perform pg_advisory_xact_lock(hashtext('gl_income_account_map:' || v_type || '/' || v_ckey));
    select m.account_code into v_now from public.gl_income_account_map m
     where m.component_type = v_type and m.component_key = v_ckey for update;
  else
    raise exception 'This is not a posting the system makes.' using errcode = '22023', detail = 'posting_unknown';
  end if;

  select * into v_acc from public.gl_accounts a where a.code = v_code;
  if not found then
    raise exception 'Account % is not in the chart.', coalesce(nullif(v_code, ''), 'No account')
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
  if v_acc.kind <> v_need then
    raise exception 'Account % % is not an % account.', v_acc.code, v_acc.name,
        case v_need when 'INCOME' then 'income' else 'expense' end
      using errcode = '22023', detail = 'account_wrong_kind';
  end if;

  if v_now is not distinct from v_acc.code then
    return jsonb_build_object('what', p_what, 'key', p_key, 'accountCode', v_acc.code, 'changed', false);
  end if;

  if p_what = 'ROLE' then
    update public.gl_account_roles set account_code = v_acc.code where role = p_key;
  else
    insert into public.gl_income_account_map (component_type, component_key, account_code, note, updated_by)
    values (v_type, v_ckey, v_acc.code, nullif(btrim(coalesce(p_note, '')), ''), auth.uid())
    on conflict (component_type, component_key) do update
      set account_code = excluded.account_code,
          note         = coalesce(excluded.note, public.gl_income_account_map.note),
          updated_at   = now(),
          updated_by   = excluded.updated_by;
  end if;

  insert into public.gl_posting_account_changes (what, key, from_code, to_code, changed_by)
  values (p_what, case when p_what = 'INCOME' then v_type || '/' || v_ckey else p_key end,
          v_now, v_acc.code, auth.uid());

  return jsonb_build_object('what', p_what, 'key', p_key, 'accountCode', v_acc.code, 'changed', true);
end;
$function$;

revoke all on function public._gl_posting_account_write(text, text, text, text) from public, anon, authenticated;

-- ── 3 · the screen's door ────────────────────────────────────────────────────
create or replace function public.gl_posting_account_set(
  p_what         text,
  p_key          text,
  p_account_code text,
  p_was          text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_role text := public.app_role()::text;
  v_now  text;
begin
  if v_role is null or v_role not in ('finance', 'principal') then
    raise exception 'Only Finance changes the posting accounts.'
      using errcode = '42501', detail = 'not_finance';
  end if;

  -- What the screen showed must still be the account. The write path takes
  -- the row's lock, so two saves of one posting queue behind each other and
  -- the second one finds the first one's account here.
  if p_what = 'ROLE' then
    select r.account_code into v_now from public.gl_account_roles r where r.role = p_key for update;
  elsif p_what = 'INCOME' then
    perform pg_advisory_xact_lock(hashtext('gl_income_account_map:' || coalesce(p_key, '')));
    select m.account_code into v_now from public.gl_income_account_map m
     where m.component_type || '/' || m.component_key = p_key for update;
  end if;
  if v_now is distinct from nullif(upper(btrim(coalesce(p_was, ''))), '') then
    raise exception 'Someone else changed this posting after you opened it. Open it again to see their change.'
      using errcode = '40001', detail = 'posting_changed';
  end if;

  return public._gl_posting_account_write(p_what, p_key, p_account_code, null);
end;
$function$;

comment on function public.gl_posting_account_set(text, text, text, text) is
  '0657: Finance Settings → Posting accounts. Changes the account one posting goes to (an income map row, or COST_OF_GOODS_SOLD, BANK_AND_PAYMENT_CHARGES or OTHER_INCOME) and records the change. p_was is the account the screen showed. Finance or principal.';
revoke all on function public.gl_posting_account_set(text, text, text, text) from public, anon;
grant execute on function public.gl_posting_account_set(text, text, text, text) to authenticated;

-- ── 4 · the income map's older door writes through the same path ─────────────
create or replace function public.gl_map_income_account(
  p_component_type text,
  p_component_key  text,
  p_account_code   text,
  p_note           text default null
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_role text := public.app_role()::text;
begin
  if v_role is null or v_role not in ('finance', 'principal') then
    raise exception 'Only Finance changes the posting accounts.'
      using errcode = '42501', detail = 'not_finance';
  end if;
  perform public._gl_posting_account_write(
    'INCOME',
    coalesce(p_component_type, '') || '/' || coalesce(nullif(btrim(coalesce(p_component_key, '')), ''), '*'),
    p_account_code,
    p_note);
end;
$function$;

comment on function public.gl_map_income_account(text, text, text, text) is
  '0466, rewritten by 0657: maps an invoice component to its income account through _gl_posting_account_write, which records the change. Finance or principal.';
revoke all on function public.gl_map_income_account(text, text, text, text) from public, anon;
grant execute on function public.gl_map_income_account(text, text, text, text) to authenticated;

-- ── 5 · what the page reads ──────────────────────────────────────────────────
create or replace function public.gl_posting_accounts()
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
    -- Every income map row, and every add-on, mapped or not. An add-on's name
    -- is the add-on list's own; the other rows are named on the screen.
    'income', coalesce((
      select jsonb_agg(jsonb_build_object(
               'type', x.component_type,
               'key', x.component_key,
               'name', x.addon_name,
               'active', x.addon_active,
               'accountCode', a.code,
               'accountName', a.name,
               'changedAt', c.changed_at,
               'changedBy', u.name)
             order by case x.component_type when 'GOODS' then 0 when 'STORAGE' then 1 else 2 end,
                      x.addon_name nulls first, x.component_key)
        from (
          select m.component_type, m.component_key, m.account_code,
                 ad.name as addon_name, ad.active as addon_active
            from public.gl_income_account_map m
            left join public.addons ad on m.component_type = 'ADDON' and ad.key = m.component_key
          union all
          select 'ADDON', ad.key, null, ad.name, ad.active
            from public.addons ad
           where not exists (select 1 from public.gl_income_account_map m
                              where m.component_type = 'ADDON' and m.component_key = ad.key)
        ) x
        left join public.gl_accounts a on a.code = x.account_code
        left join lateral (
          select ch.changed_at, ch.changed_by from public.gl_posting_account_changes ch
           where ch.what = 'INCOME' and ch.key = x.component_type || '/' || x.component_key
           order by ch.changed_at desc, ch.id desc limit 1) c on true
        left join public.app_users u on u.id = c.changed_by
    ), '[]'::jsonb),

    -- The roles that are postings. Headings, the import's section headings and
    -- the three roles whose accounts are retired are not.
    'roles', coalesce((
      select jsonb_agg(jsonb_build_object(
               'role', r.role,
               'changeable', r.role in ('COST_OF_GOODS_SOLD', 'BANK_AND_PAYMENT_CHARGES', 'OTHER_INCOME'),
               'accountCode', a.code,
               'accountName', a.name,
               'changedAt', c.changed_at,
               'changedBy', u.name)
             order by r.role)
        from public.gl_account_roles r
        join public.gl_accounts a on a.code = r.account_code
        left join lateral (
          select ch.changed_at, ch.changed_by from public.gl_posting_account_changes ch
           where ch.what = 'ROLE' and ch.key = r.role
           order by ch.changed_at desc, ch.id desc limit 1) c on true
        left join public.app_users u on u.id = c.changed_by
       where r.role in ('COST_OF_GOODS_SOLD', 'BANK_AND_PAYMENT_CHARGES', 'OTHER_INCOME',
                        'TRADE_PAYABLE', 'OTHER_PAYABLE', 'CUSTOMER_DEPOSITS_HELD', 'STOCK',
                        'RETAINED_EARNINGS', 'OPENING_BALANCE_EQUITY')
    ), '[]'::jsonb),

    'changes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', ch.id,
               'what', ch.what,
               'key', ch.key,
               'name', ad.name,
               'fromCode', ch.from_code,
               'fromName', fa.name,
               'toCode', ch.to_code,
               'toName', ta.name,
               'changedAt', ch.changed_at,
               'changedBy', u.name)
             order by ch.changed_at desc, ch.id desc)
        from (select * from public.gl_posting_account_changes
               order by changed_at desc, id desc limit 100) ch
        left join public.addons ad on ch.what = 'INCOME' and ch.key = 'ADDON/' || ad.key
        left join public.gl_accounts fa on fa.code = ch.from_code
        left join public.gl_accounts ta on ta.code = ch.to_code
        left join public.app_users u on u.id = ch.changed_by
    ), '[]'::jsonb));
end;
$function$;

comment on function public.gl_posting_accounts() is
  '0657: Finance Settings → Posting accounts reads the income map with every add-on, the posting roles, and the latest 100 changes.';
revoke all on function public.gl_posting_accounts() from public, anon;
grant execute on function public.gl_posting_accounts() to authenticated;

-- ── 6 · the big sofa disposal credits service charges ────────────────────────
insert into public.gl_income_account_map (component_type, component_key, account_code, note)
select 'ADDON', ad.key, '500-3000', 'A disposal is a service charge (0657)'
  from public.addons ad
 where ad.key = 'dispose-old-sofa-big-sofa'
   and exists (select 1 from public.gl_accounts a
                where a.code = '500-3000' and a.kind = 'INCOME' and a.is_active and not a.is_heading)
on conflict (component_type, component_key) do nothing;

-- ── sanity ───────────────────────────────────────────────────────────────────
do $sanity$
begin
  if has_function_privilege('anon', 'public.gl_posting_account_set(text, text, text, text)', 'execute')
     or has_function_privilege('anon', 'public.gl_posting_accounts()', 'execute') then
    raise exception '0657: a posting account door is open to signed-out callers';
  end if;
  if has_function_privilege('authenticated', 'public._gl_posting_account_write(text, text, text, text)', 'execute') then
    raise exception '0657: the write path can be called without a door';
  end if;
  if not has_function_privilege('authenticated', 'public.gl_posting_account_set(text, text, text, text)', 'execute') then
    raise exception '0657: the posting account door is closed to signed-in callers';
  end if;
  -- Both doors refuse a caller with no Finance role before they change anything.
  begin
    perform public.gl_posting_account_set('ROLE', 'OTHER_INCOME', '580-0000', '580-0000');
    raise exception '0657: the posting account door ran for a caller with no role';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform public.gl_map_income_account('STORAGE', '*', '500-4000', null);
    raise exception '0657: gl_map_income_account ran for a caller with no role';
  exception when insufficient_privilege then
    null;
  end;
end $sanity$;

commit;
