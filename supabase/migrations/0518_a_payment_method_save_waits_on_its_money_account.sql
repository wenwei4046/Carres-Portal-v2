-- 0518 — a payment method save waits on its money account row.
--
-- 0515 made two checks face each other: Finance Settings refuses taking a
-- money account out of use while a payment method still lands money in it,
-- and Settings → Payment refuses pointing an active method at an account
-- that is out of use. 0523 makes payment_set_method_active wait on the
-- gl_money_accounts row (for share) so the two checks cannot both pass in
-- the same instant. payment_method_save (0476) has the same check
-- (gl_money_account_ok) and no wait: a manager saving a new method at 1133
-- and Finance taking 1133 out of use in the same second could both succeed,
-- leaving an active method on an out-of-use account.
--
-- This is the 0476 body with one line added before the account check: a
-- `for share` on the gl_money_accounts row. gl_money_account_update takes
-- that row `for update` (0512), so whichever save arrives second waits for
-- the first to commit, then re-reads. Lock order is the same as
-- payment_set_method_active after 0523 (payment_manual_methods, then gl_money_accounts),
-- and gl_money_account_update never waits on payment_manual_methods, so no
-- cycle. A null account matches no row and falls to the existing refusal.
-- Nothing else changes: same sentences, errcodes, details and grants.

create or replace function public.payment_method_save(
  p_method       text,
  p_label        text,
  p_account_code text,
  p_active       boolean default true
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_key         text;
  v_label       text;
  v_creating    boolean;
  v_old         payment_manual_methods;
  v_new         payment_manual_methods;
  v_old_account text;
  v_sort        integer;
begin
  perform public.payment_settings_gate();

  v_label := btrim(coalesce(p_label, ''));
  if v_label = '' then
    raise exception 'a payment method needs a name' using errcode = '22023', detail = 'label_required';
  end if;
  if length(v_label) > 40 then
    raise exception 'keep the name to 40 characters' using errcode = '22023', detail = 'label_too_long';
  end if;
  if p_active is null then
    raise exception 'say Active yes or no' using errcode = '22023', detail = 'bad_active';
  end if;
  -- 0518: wait for a Finance Settings save on this account, so this check and
  -- gl_money_account_update's switch-off check cannot pass side by side
  -- (0523 gives payment_set_method_active the same wait).
  perform 1 from public.gl_money_accounts where account_code = p_account_code for share;
  if not public.gl_money_account_ok(p_account_code) then
    raise exception 'account % is not a money account — choose cash, a bank account or card and online settlement',
      coalesce(p_account_code, 'null')
      using errcode = '22023', detail = 'account_not_money';
  end if;

  v_creating := nullif(btrim(coalesce(p_method, '')), '') is null;
  if v_creating then
    v_key := btrim(regexp_replace(lower(v_label), '[^a-z0-9]+', '_', 'g'), '_');
    if v_key = '' then
      raise exception 'the name needs at least one letter or number'
        using errcode = '22023', detail = 'label_required';
    end if;
    if v_key ~ '^[0-9]' then
      v_key := 'm_' || v_key;
    end if;
    v_key := rtrim(left(v_key, 40), '_');
    -- System words and aliases are not a manager's to redefine: 'online' is
    -- provider money, 'card' and 'other' are system buckets, 'stripe' is the
    -- POS's Pay online key (STRIPE_METHOD_KEY), 'dealer_deposit' is the
    -- dealer wallet's word, and an alias would silently fold into another
    -- method.
    if v_key in ('online','card','other','stripe','dealer_deposit')
       or public.payment_method_key(v_key) is distinct from v_key then
      raise exception 'the name "%" is kept for payments the system records itself — choose another name', v_label
        using errcode = '22023', detail = 'method_reserved';
    end if;
    if exists (select 1 from payment_manual_methods m where m.method = v_key) then
      raise exception 'a payment method called "%" already exists', v_label
        using errcode = '22023', detail = 'method_exists';
    end if;
  else
    v_key := btrim(p_method);
    select * into v_old from payment_manual_methods m where m.method = v_key for update;
    if not found then
      raise exception 'unknown payment method' using errcode = '22023', detail = 'bad_method';
    end if;
  end if;

  if exists (select 1 from payment_manual_methods m
              where lower(btrim(m.label)) = lower(v_label) and m.method <> v_key) then
    raise exception 'another payment method is already called "%"', v_label
      using errcode = '22023', detail = 'label_taken';
  end if;
  -- 0431's rule: at least one manual method stays Active.
  if not v_creating and v_old.active and not p_active
     and (select count(*) from payment_manual_methods where active) <= 1 then
    raise exception 'at least one manual method must stay Active'
      using errcode = '22023', detail = 'last_method';
  end if;

  select g.account_code into v_old_account
    from gl_payment_account_map g
   where g.method = v_key and g.source_channel = '*';

  if v_creating then
    select coalesce(max(m.sort), 0) + 1 into v_sort from payment_manual_methods m;
    insert into payment_manual_methods (method, label, active, sort, updated_by, updated_at)
    values (v_key, v_label, p_active, v_sort, auth.uid(), now())
    returning * into v_new;
  else
    update payment_manual_methods
       set label = v_label, active = p_active, updated_by = auth.uid(), updated_at = now()
     where method = v_key
     returning * into v_new;
  end if;

  insert into gl_payment_account_map (method, source_channel, account_code, note, updated_by)
  values (v_key, '*', p_account_code, 'Settings → Payment (0476)', auth.uid())
  on conflict (method, source_channel) do update
    set account_code = excluded.account_code,
        note         = excluded.note,
        updated_at   = now(),
        updated_by   = excluded.updated_by;

  insert into payment_setting_changes (what, old_value, new_value, actor_id)
  values ('manual_method:' || v_key,
          case when v_creating then null
               else to_jsonb(v_old) || jsonb_build_object('account_code', v_old_account) end,
          to_jsonb(v_new) || jsonb_build_object('account_code', p_account_code),
          auth.uid());

  return to_jsonb(v_new) || jsonb_build_object(
    'account_code', p_account_code,
    'account_name', (select a.name from gl_accounts a where a.code = p_account_code));
end;
$fn$;

comment on function public.payment_method_save(text, text, text, boolean) is
  '0476, 0518: add (p_method null), rename, (de)activate a payment method and choose its money account. Manager gate (payment_settings_gate); every change kept in payment_setting_changes. 0518: waits on the money account row so a Finance Settings switch-off cannot land between the check and the save.';
revoke all on function public.payment_method_save(text, text, text, boolean) from public, anon;
grant execute on function public.payment_method_save(text, text, text, boolean) to authenticated;
