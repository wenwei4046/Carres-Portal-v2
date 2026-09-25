-- 0541 — card money settles to the bank Finance sets.
--
-- YH's notes, KL Gateway meeting, 18 Sep 2026: the card acquirers are PBB,
-- GHL, Hong Leong and Maybank. A GHL machine at a dealer settles to RHB. PBB,
-- Hong Leong, Maybank and a GHL machine at a showroom settle to Hong Leong.
-- The mapping must be adjustable, on Finance Settings.
--
-- WHAT THIS ADDS
--   1. card_settlement_routes: (holding account, showroom or dealer) -> the
--      bank that holding pays out to. Both sides are rows of the 0512 money
--      account list. Written only through card_settlement_route_set
--      (Finance or principal). The Money moves card payout form reads it to
--      default its Paid into bank; the person can still change it. No ledger
--      post reads it: how a card sale posts is not changed here.
--      Seeded only where the accounts exist in the repo seed: GHL (1131) at a
--      dealer -> RHB (1124), GHL at a showroom -> Hong Leong (1123). PBB,
--      Hong Leong and Maybank holding accounts are not seeded: Finance may
--      already have added them in production (1134-1139), so Finance adds
--      them and their routes on screen.
--   2. gl_map_payment_account (0476 body, the latest): now refuses an account
--      that is not an in-use money account (gl_money_account_ok), and waits on
--      the account row like payment_method_save (0518). Principal gate kept.
--   3. payment_system_account_save: moves one of the rows no screen showed
--      until now, POS card ('card') and Online payment ('online'), to another
--      money account. Same manager gate as every Payment settings door
--      (payment_settings_gate), same account check and wait as 0518, and the
--      change is kept in payment_setting_changes. It moves an existing row
--      only; it never adds one.
--
-- NOT HERE: the 0431 payment_bank_accounts rows stay. Payment Settings still
--   reads and edits them (the bank named in the customer's transfer message),
--   so they are not retired.
--
-- RLS: card_settlement_routes is new; read by finance and principal
--   (gl_may_read), written only through the definer door. No existing policy
--   changes. DR/CR: none.

begin;

-- ── 1 · the routes ───────────────────────────────────────────────────────────
create table public.card_settlement_routes (
  holding_code text not null references public.gl_money_accounts(account_code),
  channel      text not null check (channel in ('showroom','dealer')),
  bank_code    text not null references public.gl_money_accounts(account_code),
  updated_at   timestamptz not null default now(),
  updated_by   uuid references public.app_users(id),
  primary key (holding_code, channel)
);

comment on table public.card_settlement_routes is
  '0541: which bank a card holding account pays out to, per machine place (showroom or dealer). Finance sets it on Finance Settings; the card payout form defaults its bank from it.';

alter table public.card_settlement_routes enable row level security;
revoke all on public.card_settlement_routes from anon, authenticated;
grant select on public.card_settlement_routes to authenticated;
create policy card_settlement_routes_read_finance on public.card_settlement_routes
  for select using ((select public.gl_may_read()));

insert into public.card_settlement_routes (holding_code, channel, bank_code)
select v.h, v.ch, v.b
  from (values ('1131','dealer','1124'), ('1131','showroom','1123')) as v(h, ch, b)
  join public.gl_money_accounts h on h.account_code = v.h and h.money_kind = 'HOLDING'
  join public.gl_money_accounts b on b.account_code = v.b and b.money_kind = 'BANK'
on conflict do nothing;

create or replace function public.card_settlement_route_set(p_holding text, p_channel text, p_bank text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role text := public.app_role()::text;
begin
  if v_role is null or v_role not in ('finance','principal') then
    raise exception 'Only Finance changes the money accounts.'
      using errcode = '42501', detail = 'not_finance';
  end if;
  if p_channel is null or p_channel not in ('showroom','dealer') then
    raise exception 'Choose showroom or dealer.' using errcode = '22023', detail = 'bad_channel';
  end if;
  -- Wait on both rows, so a switch-off (gl_money_account_update, for update)
  -- cannot land between the check and the save.
  perform 1 from public.gl_money_accounts
    where account_code in (p_holding, p_bank) order by account_code for share;
  if not exists (select 1 from public.gl_money_accounts m
                  where m.account_code = p_holding and m.money_kind = 'HOLDING' and m.is_active) then
    raise exception 'Choose a card account that is in use.' using errcode = '22023', detail = 'not_holding';
  end if;
  if not exists (select 1 from public.gl_money_accounts m
                  where m.account_code = p_bank and m.money_kind = 'BANK')
     or not public.gl_money_account_ok(p_bank, 'out') then
    raise exception 'Choose a bank that is in use.' using errcode = '22023', detail = 'not_bank';
  end if;

  insert into public.card_settlement_routes (holding_code, channel, bank_code, updated_at, updated_by)
  values (p_holding, p_channel, p_bank, now(), auth.uid())
  on conflict (holding_code, channel) do update
    set bank_code = excluded.bank_code, updated_at = now(), updated_by = excluded.updated_by;
  return jsonb_build_object('holding_code', p_holding, 'channel', p_channel, 'bank_code', p_bank);
end;
$fn$;

comment on function public.card_settlement_route_set(text, text, text) is
  '0541: sets the bank a card holding account pays out to for showroom or dealer machines. Finance or principal.';
revoke all on function public.card_settlement_route_set(text, text, text) from public, anon;
grant execute on function public.card_settlement_route_set(text, text, text) to authenticated;


-- ── 2 · gl_map_payment_account refuses an account not in use ────────────────
-- 0476 body; added: the 0518 wait and the gl_money_account_ok check.
create or replace function public.gl_map_payment_account(
  p_method         text,
  p_account_code   text,
  p_source_channel text default '*',
  p_note           text default null
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_method text;
begin
  if not public.is_principal() then
    raise exception 'forbidden: only the principal can map a payment account'
      using errcode = '42501', detail = 'forbidden';
  end if;
  -- 0476: a method is a key — a system word or a method in Settings → Payment.
  v_method := public.payment_method_key(p_method);
  if v_method is null
     or not (v_method in ('cash','bank','card','cheque','online','other',
                          'duitnow_qr','credit_card','debit_card')
             or exists (select 1 from payment_manual_methods m where m.method = v_method)) then
    raise exception '% is not a payment method', coalesce(p_method,'null')
      using errcode = '22023', detail = 'bad_method';
  end if;
  if not exists (select 1 from gl_accounts a where a.code = p_account_code and a.is_active) then
    raise exception 'account % is not an active account in the chart', coalesce(p_account_code,'null')
      using errcode = '22023', detail = 'account_not_found';
  end if;
  if exists (select 1 from gl_accounts a where a.code = p_account_code and a.is_control) then
    raise exception 'account % is a control account — customer money never debits a control account',
      p_account_code using errcode = '22023', detail = 'account_is_control';
  end if;
  if exists (select 1 from gl_accounts c where c.parent_code = p_account_code) then
    raise exception 'account % is a header — post to one of its children', p_account_code
      using errcode = '22023', detail = 'account_is_header';
  end if;
  -- 0541: only an in-use money account, and wait on its row (0518).
  perform 1 from public.gl_money_accounts where account_code = p_account_code for share;
  if not public.gl_money_account_ok(p_account_code) then
    raise exception 'account % is not a money account — choose cash, a bank account or card and online settlement',
      p_account_code
      using errcode = '22023', detail = 'account_not_money';
  end if;

  insert into gl_payment_account_map (method, source_channel, account_code, note, updated_by)
  values (v_method, coalesce(nullif(btrim(p_source_channel), ''), '*'), p_account_code,
          nullif(btrim(coalesce(p_note,'')),''), auth.uid())
  on conflict (method, source_channel) do update
    set account_code = excluded.account_code,
        note         = excluded.note,
        updated_at   = now(),
        updated_by   = excluded.updated_by;
end;
$fn$;

revoke all on function public.gl_map_payment_account(text,text,text,text) from public, anon;
grant execute on function public.gl_map_payment_account(text,text,text,text) to authenticated;


-- ── 3 · move POS card or Online payment on Settings → Payment ────────────────
create or replace function public.payment_system_account_save(
  p_method         text,
  p_source_channel text,
  p_account_code   text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_old text;
begin
  perform public.payment_settings_gate();
  if p_method is null or p_method not in ('card','online') then
    raise exception 'unknown payment method' using errcode = '22023', detail = 'bad_method';
  end if;
  select g.account_code into v_old
    from gl_payment_account_map g
   where g.method = p_method and g.source_channel = p_source_channel
   for update;
  if not found then
    raise exception 'unknown payment method' using errcode = '22023', detail = 'bad_method';
  end if;
  perform 1 from public.gl_money_accounts where account_code = p_account_code for share;
  if not public.gl_money_account_ok(p_account_code) then
    raise exception 'account % is not a money account — choose cash, a bank account or card and online settlement',
      coalesce(p_account_code, 'null')
      using errcode = '22023', detail = 'account_not_money';
  end if;

  update gl_payment_account_map
     set account_code = p_account_code, updated_at = now(), updated_by = auth.uid()
   where method = p_method and source_channel = p_source_channel;

  insert into payment_setting_changes (what, old_value, new_value, actor_id)
  values ('system_method:' || p_method || ':' || p_source_channel,
          jsonb_build_object('account_code', v_old),
          jsonb_build_object('account_code', p_account_code),
          auth.uid());

  return jsonb_build_object('method', p_method, 'source_channel', p_source_channel,
                            'account_code', p_account_code);
end;
$fn$;

comment on function public.payment_system_account_save(text, text, text) is
  '0541: moves the POS card or Online payment row of gl_payment_account_map to another in-use money account. Manager gate (payment_settings_gate); kept in payment_setting_changes.';
revoke all on function public.payment_system_account_save(text, text, text) from public, anon;
grant execute on function public.payment_system_account_save(text, text, text) to authenticated;

commit;
