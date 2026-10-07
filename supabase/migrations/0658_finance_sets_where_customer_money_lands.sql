-- =============================================================================
-- 0658_finance_sets_where_customer_money_lands.sql
-- =============================================================================
-- THE RULING (Chew, Finance, 2026-10-07, 「1 可以」, docs/finance/MASTER.md §0
--   "Automatic posting accounts" and §1 exceptions): Finance sets which money
--   account each way of being paid lands in, from Finance Settings → Posting
--   accounts. Only that one setting: a method's name, whether it is Active, and
--   every other Payment setting stay with the manager (payment_settings_gate,
--   Payment MASTER §12).
--
-- WHAT WAS MISSING
--   The money account of a method is written by payment_method_save (a manual
--   method, with its name and Active) and payment_system_account_save (the POS
--   card and Online payment rows, 0541). Both pass payment_settings_gate: the
--   principal or a holder of the ops manager duty. Chew's Finance login could
--   neither open Payment settings nor change the account.
--
-- WHAT THIS ADDS
--   1. payment_method_account_set(p_method, p_source_channel, p_account_code,
--      p_was): changes the money account of one method row and nothing else.
--      Finance, or whoever payment_settings_gate admits. The account must be a
--      money account in use (gl_money_account_ok), as the two Payment doors
--      require. p_was is the account the screen showed; a change made since
--      is refused. The change is recorded in payment_setting_changes with the
--      same `what` and value shape the Payment doors write (0518, 0541), so
--      Payment settings' own Changes list shows it too, naming the method.
--   2. _gl_payment_account_changes(): the one reading of "a method's money
--      account changed" in payment_setting_changes. Private.
--   3. gl_posting_accounts() (0657) also lists those changes, as `PAYMENT`,
--      beside the income and role changes, and gives each method's last
--      change (`payments`) for the page's Changed column.
--
-- RLS: unchanged. DATA: none. DR/CR: none; a change applies to payments
--   recorded after it.
-- =============================================================================

begin;

set local search_path = public, pg_temp;

-- ── 1 · Finance's door to the one setting ────────────────────────────────────
create or replace function public.payment_method_account_set(
  p_method         text,
  p_source_channel text,
  p_account_code   text,
  p_was            text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_method  text := btrim(coalesce(p_method, ''));
  v_channel text := coalesce(nullif(btrim(coalesce(p_source_channel, '')), ''), '*');
  v_code    text := upper(btrim(coalesce(p_account_code, '')));
  v_what    text;
  v_row     jsonb := '{}'::jsonb;
  v_old     text;
  v_found   boolean;
begin
  -- Finance sets this one setting; the manager still sets every Payment setting.
  if public.app_role()::text is distinct from 'finance' then
    perform public.payment_settings_gate();
  end if;

  -- A row Payment settings shows: a manual method, or the POS card and Online
  -- payment rows (0541).
  if v_channel = '*' and exists (select 1 from public.payment_manual_methods m where m.method = v_method) then
    v_what := 'manual_method:' || v_method;
    -- Recorded as payment_method_save records it (0518): the method's row with
    -- its account, so Payment settings' Changes list names the method.
    select to_jsonb(m) into v_row from public.payment_manual_methods m where m.method = v_method;
  elsif v_method in ('card', 'online') then
    v_what := 'system_method:' || v_method || ':' || v_channel;
  else
    raise exception 'This is not a way of being paid that Payment settings knows.'
      using errcode = '22023', detail = 'bad_method';
  end if;

  select g.account_code into v_old from public.gl_payment_account_map g
   where g.method = v_method and g.source_channel = v_channel
   for update;
  v_found := found;
  if not v_found and v_what like 'system_method:%' then
    raise exception 'This is not a way of being paid that Payment settings knows.'
      using errcode = '22023', detail = 'bad_method';
  end if;
  if v_old is distinct from nullif(upper(btrim(coalesce(p_was, ''))), '') then
    raise exception 'Someone else changed this posting after you opened it. Open it again to see their change.'
      using errcode = '40001', detail = 'posting_changed';
  end if;

  -- As the Payment doors: wait on the money account's row (0518), and only a
  -- money account in use.
  perform 1 from public.gl_money_accounts where account_code = v_code for share;
  if not public.gl_money_account_ok(v_code) then
    raise exception 'Account % is not a bank, cash or card account in use. Choose one from Money accounts.',
        coalesce(nullif(v_code, ''), 'No account')
      using errcode = '22023', detail = 'account_not_money';
  end if;

  if v_old is not distinct from v_code then
    return jsonb_build_object('method', v_method, 'sourceChannel', v_channel, 'accountCode', v_code, 'changed', false);
  end if;

  insert into public.gl_payment_account_map (method, source_channel, account_code, note, updated_by)
  values (v_method, v_channel, v_code, 'Finance Settings → Posting accounts (0658)', auth.uid())
  on conflict (method, source_channel) do update
    set account_code = excluded.account_code,
        note         = excluded.note,
        updated_at   = now(),
        updated_by   = excluded.updated_by;

  -- The same `what` and value shape as payment_method_save (0518) and
  -- payment_system_account_save (0541) write.
  insert into public.payment_setting_changes (what, old_value, new_value, actor_id)
  values (v_what,
          v_row || jsonb_build_object('account_code', v_old),
          v_row || jsonb_build_object('account_code', v_code),
          auth.uid());

  return jsonb_build_object('method', v_method, 'sourceChannel', v_channel, 'accountCode', v_code, 'changed', true);
end;
$function$;

comment on function public.payment_method_account_set(text, text, text, text) is
  '0658: Finance Settings → Posting accounts. The money account one way of being paid lands in, and nothing else of the method. Finance, or whoever payment_settings_gate admits. Recorded in payment_setting_changes.';
revoke all on function public.payment_method_account_set(text, text, text, text) from public, anon;
grant execute on function public.payment_method_account_set(text, text, text, text) to authenticated;

-- ── 2 · one reading of "a method's money account changed" ───────────────────
-- payment_setting_changes keeps every Payment setting. A method's money account
-- changed where the account_code it records differs. The key is the page's:
-- `method/*` for a manual method, `method/channel` for POS card and Online.
create or replace function public._gl_payment_account_changes()
returns table (id uuid, key text, from_code text, to_code text, actor_id uuid, changed_at timestamptz)
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select sc.id,
         case when sc.what like 'manual_method:%'
              then substr(sc.what, length('manual_method:') + 1) || '/*'
              else regexp_replace(substr(sc.what, length('system_method:') + 1), ':', '/') end,
         sc.old_value ->> 'account_code',
         sc.new_value ->> 'account_code',
         sc.actor_id,
         sc.changed_at
    from public.payment_setting_changes sc
   where (sc.what like 'manual_method:%' or sc.what like 'system_method:%')
     and sc.new_value ? 'account_code'
     and (sc.old_value ->> 'account_code') is distinct from (sc.new_value ->> 'account_code');
$function$;

comment on function public._gl_payment_account_changes() is
  '0658: every change of a payment method''s money account in payment_setting_changes, keyed as Finance Settings → Posting accounts keys it. Read by gl_posting_accounts only.';
revoke all on function public._gl_payment_account_changes() from public, anon, authenticated;

-- ── 3 · the page's read lists those changes too ──────────────────────────────
-- 0657's body. What changes is marked 0658: `changes` also carries every
-- change of a method's money account from payment_setting_changes, as PAYMENT.
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
               'name', ch.name,
               'fromCode', ch.from_code,
               'fromName', fa.name,
               'toCode', ch.to_code,
               'toName', ta.name,
               'changedAt', ch.changed_at,
               'changedBy', u.name)
             order by ch.changed_at desc, ch.id desc)
        from (
          select * from (
            select pc.id::text as id, pc.what, pc.key, ad.name, pc.from_code, pc.to_code,
                   pc.changed_by, pc.changed_at
              from public.gl_posting_account_changes pc
              left join public.addons ad on pc.what = 'INCOME' and pc.key = 'ADDON/' || ad.key
            union all
            -- 0658: a method's money account, as Payment settings recorded it.
            select 'P' || pm.id::text, 'PAYMENT', pm.key, mm.label,
                   pm.from_code, pm.to_code, pm.actor_id, pm.changed_at
              from public._gl_payment_account_changes() pm
              left join public.payment_manual_methods mm
                     on pm.key = mm.method || '/*'
          ) every_change
          order by changed_at desc, id desc
          limit 100
        ) ch
        left join public.gl_accounts fa on fa.code = ch.from_code
        left join public.gl_accounts ta on ta.code = ch.to_code
        left join public.app_users u on u.id = ch.changed_by
    ), '[]'::jsonb),

    -- 0658: when each method's money account last changed, and who changed it.
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object(
               'key', x.key,
               'changedAt', x.changed_at,
               'changedBy', u.name)
             order by x.key)
        from (
          select distinct on (pm.key) pm.key, pm.changed_at, pm.actor_id
            from public._gl_payment_account_changes() pm
           order by pm.key, pm.changed_at desc, pm.id desc
        ) x
        left join public.app_users u on u.id = x.actor_id
    ), '[]'::jsonb));
end;
$function$;

comment on function public.gl_posting_accounts() is
  '0657, 0658: Finance Settings → Posting accounts reads the income map with every add-on, the posting roles, the latest 100 changes (a method''s money account included), and when each method''s money account last changed.';
revoke all on function public.gl_posting_accounts() from public, anon;
grant execute on function public.gl_posting_accounts() to authenticated;

-- ── sanity ───────────────────────────────────────────────────────────────────
do $sanity$
begin
  if has_function_privilege('anon', 'public.payment_method_account_set(text, text, text, text)', 'execute') then
    raise exception '0658: the door is open to signed-out callers';
  end if;
  if not has_function_privilege('authenticated', 'public.payment_method_account_set(text, text, text, text)', 'execute') then
    raise exception '0658: the door is closed to signed-in callers';
  end if;
  if has_function_privilege('authenticated', 'public._gl_payment_account_changes()', 'execute')
     or has_function_privilege('anon', 'public._gl_payment_account_changes()', 'execute') then
    raise exception '0658: the private change reading is open to callers';
  end if;
  -- A caller with no role is refused before anything is read or written.
  begin
    perform public.payment_method_account_set('cash', '*', '320-0000', '320-0000');
    raise exception '0658: the door ran for a caller with no role';
  exception when insufficient_privilege then
    null;
  end;
end $sanity$;

commit;
