-- =============================================================================
-- 0464_an_invoice_is_where_revenue_is_recognised.sql
-- FINANCE LEDGER · CARD F — THE OTHER HALF OF EVERY RECEIPT
-- (build contract .claude/LEDGER-CONTRACT.md, CORRECTION 4)
--
-- 0461 walked customer money through the gate: Dr the bank, Cr trade
-- receivables. It is a correct entry and it is exactly half of an accounting
-- truth. Nothing in 0459-0463 ever DEBITS trade receivables, so the control
-- account only ever falls, the profit-and-loss report shows no revenue at all,
-- and the one number Jess would actually look at — what customers owe today —
-- comes out negative and stays there.
--
-- The missing event is not the payment. It is the INVOICE. A sale becomes
-- revenue on the day Carres tells the customer what they owe, not on the day
-- the money turns up; the gap between those two days is precisely what a
-- receivable IS. So this file wires the moment the invoice number is minted:
--
--     Dr  1210 trade receivables   (party = the customer)
--     Cr  4100 / 4200 / 4300 / 4400 income, split by what was actually sold
--
-- ── ① THE SPLIT IS A MAP, NOT A CASE STATEMENT ──────────────────────────────
-- 0459's income range names four things Carres sells — furniture, rental,
-- delivery, storage. An invoice total has to land on those four and nowhere
-- else. `gl_income_account_map` holds the routing as DATA, in the same spirit
-- as 0461's `gl_payment_account_map`, so a new add-on is a row a principal
-- writes with `gl_map_income_account` and not a migration.
--
-- Its three component types are the three things an invoice total is made of:
--
--   GOODS    keyed by `orders.source_system`. The '*' row is the ordinary
--            sale and credits furniture sales; the 'rental' row exists so a
--            rental-born order (0275) can never quietly book rent as
--            furniture. This wildcard is DELIBERATE and BOUNDED: a priced
--            goods line has exactly one home, and the one exception is named.
--   ADDON    keyed by `addons.key`. NO WILDCARD, EVER. An add-on key with no
--            row REFUSES, loudly, naming the key. Add-ons are where new
--            revenue kinds arrive, and a catch-all here is how delivery
--            income silently becomes furniture income and nobody ever finds
--            it. `gl_map_income_account` rejects an ADDON '*' row outright.
--   STORAGE  the storage fee. See ③.
--
-- ── ② WHAT AN INVOICE AMOUNT IS MADE OF, AND WHAT WE REFUSE TO GUESS ────────
-- `issue_order_invoice` (0229) takes a caller-supplied total, because the
-- Balance tab's invoice = goods + storage and AutoCount-imported orders carry
-- no per-line prices at all (0229:17-20). So the billed amount is authoritative
-- and the line tables are only PART of the explanation. This file decomposes:
--
--     explained  = sum(order_lines) + sum(order_addons, grouped by key)
--     residual   = invoice amount - explained
--
--   residual = 0   every sen is explained. Post the split.
--   residual > 0   the only documented component that is billed but not
--                  lined is the storage fee (0229:18). It is credited to
--                  storage income ONLY IF the order actually carries storage
--                  context — an `ops_order_control` row with a storage_from
--                  date or any of the three storage fee figures. NO context
--                  means the money is unexplained and the invoice REFUSES,
--                  naming the ringgit that could not be accounted for. The
--                  attribution is verified against evidence on the order; it
--                  is never assumed from the sign of the number.
--   residual < 0   the invoice bills LESS than the lines add up to. That is a
--                  discount, and 0459 defines no contra-revenue account, so it
--                  REFUSES rather than quietly shrinking furniture sales.
--
-- Note what is NOT here: no "miscellaneous income", no rounding bucket, no
-- balancing plug. Money posted to the wrong revenue line is worse than a
-- refusal, because a refusal is fixed in thirty seconds by the operator who
-- caused it, and a wrong revenue line is found by nobody.
--
-- ── ③ THE STORAGE FEE IS RECOGNISED HERE AND COLLECTED NOWHERE ─────────────
-- 🔴 STATED PLAINLY BECAUSE IT IS THE ONE KNOWN INCONSISTENCY THIS FILE SHIPS.
-- 0461 skips a `kind = 'storage'` receipt entirely, on the stated grounds that
-- "it needs a storage-income account the chart does not define yet". 0459 DOES
-- define one — 4400. So from here on: an invoice that bills a storage fee
-- debits receivables for it, and the cash that settles it never credits them
-- back. Receivables will overstate by exactly the storage fees collected.
--
-- Two options existed and both were bad in one direction:
--   (a) leave storage out of the invoice posting too. Receivables stay exactly
--       right; the profit-and-loss silently loses every storage fee Carres
--       earns, and a revenue line that is missing is invisible.
--   (b) recognise it, and make the resulting receivables gap LOUD.
-- (b) is taken, because `gl_receivables_reconcile()` below reports the storage
-- component as a named, quantified, non-comparable difference every time it is
-- run. A gap that names itself and its own size is a work item. A silently
-- absent revenue line is the failure this whole build exists to remove.
-- THE FIX BELONGS IN 0461, NOT HERE: delete its `kind = 'storage'` early
-- return and let a storage receipt post Dr bank / Cr receivables like any
-- other. This file does not reach into another card's writer to do it.
--
-- ── ④ COST OF SALES IS NOT POSTED, AND HERE IS THE EVIDENCE ────────────────
-- Deliberately absent. Carres has no reliable cost per sold line:
--   · `product_skus.cost` (0074:36) is real for some SKUs and a PLACEHOLDER
--     for the rest — 0074:42-46 backfilled every null with `round(price*0.55,2)`,
--     55% of retail, explicitly labelled a placeholder.
--   · `docs/stock/MASTER.md:24` assigns valuation to Finance and :238 forbids
--     Stock from writing it. Nothing in `stock_balances` / `stock_movements`
--     (0001_init.sql:213,221) carries a cost or a valuation at all.
--   · No sold line is tied to a received unit at a landed cost, so there is no
--     specific-identification path either.
-- Dr cost of goods sold / Cr stock on hand built on 55%-of-retail would produce
-- a gross margin that is arithmetically 45% on every order forever — a number
-- that looks like a fact and is a formula. 5100 and 1310 therefore stay empty
-- until a real per-unit landed cost exists, and the P&L reports revenue with no
-- cost line rather than profit with an invented one.
--
-- ── ⑤ FAILURE POLICY — IDENTICAL TO 0461, ON PURPOSE ───────────────────────
-- There is NO `exception when others` anywhere near a ledger call in this file.
-- If the posting raises, the invoice raises with it and the whole transaction
-- rolls back: no invoice row, no `orders.invoice_no`, no history line, no
-- journal entry. 0461 chose that and argued it at length; two money writers
-- that disagree about what happens when the ledger refuses is worse than
-- either policy on its own. The one place an exception handler DOES appear is
-- `gl_receivables_reconcile`, which must return a row even when the chart is
-- broken — that is a read, not a write, and its whole job is to report
-- breakage rather than raise on it.
--
-- A pre-go-live invoice records exactly as it does today and is quietly NOT
-- posted (ruling L), by the same mechanism 0461 uses for a pre-go-live payment.
-- A void calls `gl_reverse`. Nothing here deletes anything.
-- =============================================================================


-- ── 1 · the map — which income account does this component credit ────────────
create table if not exists public.gl_income_account_map (
  component_type text not null check (component_type in ('GOODS','ADDON','STORAGE')),
  component_key  text not null,
  account_code   text not null references public.gl_accounts(code),
  note           text,
  updated_at     timestamptz not null default now(),
  updated_by     uuid references public.app_users(id),
  primary key (component_type, component_key)
);

comment on table public.gl_income_account_map is
  'Invoice component -> the income account it credits (0464). GOODS is keyed by orders.source_system and permits a bounded ''*'' row; ADDON is keyed by addons.key and NEVER has one — an unmapped add-on makes the invoice refuse, by design.';
comment on column public.gl_income_account_map.component_key is
  'GOODS: orders.source_system, or ''*''. ADDON: addons.key, exact only. STORAGE: ''*''.';

alter table public.gl_income_account_map enable row level security;
revoke all on public.gl_income_account_map from anon, authenticated;
grant select on public.gl_income_account_map to authenticated;
drop policy if exists gl_income_account_map_read_internal on public.gl_income_account_map;
create policy gl_income_account_map_read_internal on public.gl_income_account_map
  for select using ((select public.is_internal()));
-- No insert/update/delete policy, for anyone. gl_map_income_account is the door.


-- ── 2 · the resolver ─────────────────────────────────────────────────────────
-- Returns null when unmapped; the CALLER raises, so the error can name the
-- invoice and the component as well as the missing key.
create or replace function public.gl_income_account_for(
  p_component_type text,
  p_component_key  text
) returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select m.account_code
    from public.gl_income_account_map m
   where m.component_type = p_component_type
     and m.component_key in (coalesce(nullif(btrim(p_component_key), ''), '*'), '*')
   order by case when m.component_key = '*' then 1 else 0 end
   limit 1;
$fn$;

comment on function public.gl_income_account_for(text,text) is
  'The income account this invoice component credits (0464). NULL means unmapped — the caller must refuse, never substitute a default income account.';

revoke all on function public.gl_income_account_for(text,text) from public, anon;
grant execute on function public.gl_income_account_for(text,text) to authenticated;


-- ── 3 · Finance fills a gap in the map without a deploy ──────────────────────
create or replace function public.gl_map_income_account(
  p_component_type text,
  p_component_key  text,
  p_account_code   text,
  p_note           text default null
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_key text;
begin
  if not public.is_principal() then
    raise exception 'forbidden: only the principal can map an income account'
      using errcode = '42501', detail = 'forbidden';
  end if;
  if p_component_type not in ('GOODS','ADDON','STORAGE') then
    raise exception '% is not an invoice component type', coalesce(p_component_type,'null')
      using errcode = '22023', detail = 'bad_component_type';
  end if;

  v_key := coalesce(nullif(btrim(coalesce(p_component_key, '')), ''), '*');

  -- The one rule that makes an unmapped add-on a refusal instead of a silent
  -- misposting. Do not relax it.
  if p_component_type = 'ADDON' and v_key = '*' then
    raise exception 'an ADDON catch-all row is refused — map each add-on key explicitly, or let it refuse'
      using errcode = '22023', detail = 'addon_wildcard_refused';
  end if;

  if not exists (select 1 from gl_accounts a where a.code = p_account_code and a.is_active) then
    raise exception 'account % is not an active account in the chart', coalesce(p_account_code,'null')
      using errcode = '22023', detail = 'account_not_found';
  end if;
  if not exists (select 1 from gl_accounts a where a.code = p_account_code and a.kind = 'INCOME') then
    raise exception 'account % is not an income account — an invoice credits income', p_account_code
      using errcode = '22023', detail = 'account_not_income';
  end if;
  if exists (select 1 from gl_accounts c where c.parent_code = p_account_code) then
    raise exception 'account % is a header — post to one of its children', p_account_code
      using errcode = '22023', detail = 'account_is_header';
  end if;

  insert into gl_income_account_map (component_type, component_key, account_code, note, updated_by)
  values (p_component_type, v_key, p_account_code,
          nullif(btrim(coalesce(p_note,'')),''), auth.uid())
  on conflict (component_type, component_key) do update
    set account_code = excluded.account_code,
        note         = excluded.note,
        updated_at   = now(),
        updated_by   = excluded.updated_by;
end;
$fn$;

revoke all on function public.gl_map_income_account(text,text,text,text) from public, anon;
grant execute on function public.gl_map_income_account(text,text,text,text) to authenticated;


-- ── 4 · seed the map against the chart 0459 actually created ─────────────────
-- Matched by NAME inside the active, income, non-header leaves rather than by
-- hard-coded code, for the same reason 0461 does it: agent A owns the chart and
-- the ledger must not carry a second copy of its numbering. Unlike 0461's bank
-- seeds, a missing account here RAISES — all four income streams are named in
-- 0459, so their absence means the chart is not the chart this file was built
-- against, and a half-seeded income map is worse than no migration.
do $seed$
declare
  v_furniture text;
  v_rental    text;
  v_delivery  text;
  v_storage   text;
begin
  select a.code into v_furniture from gl_accounts a
   where a.is_active and a.kind = 'INCOME'
     and not exists (select 1 from gl_accounts c where c.parent_code = a.code)
     and a.name ilike '%furniture%' order by a.code limit 1;

  select a.code into v_rental from gl_accounts a
   where a.is_active and a.kind = 'INCOME'
     and not exists (select 1 from gl_accounts c where c.parent_code = a.code)
     and a.name ilike '%rental%' order by a.code limit 1;

  select a.code into v_delivery from gl_accounts a
   where a.is_active and a.kind = 'INCOME'
     and not exists (select 1 from gl_accounts c where c.parent_code = a.code)
     and a.name ilike '%delivery%' order by a.code limit 1;

  select a.code into v_storage from gl_accounts a
   where a.is_active and a.kind = 'INCOME'
     and not exists (select 1 from gl_accounts c where c.parent_code = a.code)
     and a.name ilike '%storage%' order by a.code limit 1;

  if v_furniture is null or v_rental is null or v_delivery is null or v_storage is null then
    raise exception '0464: the chart is missing an income account this file needs (furniture %, rental %, delivery %, storage %)',
      coalesce(v_furniture,'MISSING'), coalesce(v_rental,'MISSING'),
      coalesce(v_delivery,'MISSING'), coalesce(v_storage,'MISSING')
      using errcode = '22023', detail = 'income_chart_incomplete';
  end if;

  insert into gl_income_account_map (component_type, component_key, account_code, note) values
    -- The ordinary sale. Bounded wildcard: see the header, ①.
    ('GOODS',   '*',               v_furniture,
     'Any priced goods line on an ordinary order (0464 seed)'),
    -- A rental-born order (0275 stamps orders.source_system = ''rental'').
    ('GOODS',   'rental',          v_rental,
     'A rental-born order never books rent as furniture (0464 seed)'),

    -- Delivery money. 0184 seeded the three trip-fee keys, 0393 the stair carry.
    ('ADDON',   'DELIVERY',        v_delivery, 'Delivery trip fee (0464 seed)'),
    ('ADDON',   'DELIVERY_CROSS',  v_delivery, 'Cross-category delivery surcharge (0464 seed)'),
    ('ADDON',   'DELIVERY_ADD',    v_delivery, 'Additional delivery fee (0464 seed)'),
    ('ADDON',   'STAIR_CARRY',     v_delivery, 'Stair carry, charged on the delivery trip (0464 seed)'),

    -- Disposal is crew work sold on the delivery trip and is booked with the
    -- rest of that trip''s money. It is a JUDGEMENT, written down so it can be
    -- argued with: if Carres ever wants disposal reported separately, add a
    -- disposal income account to the chart and remap these three rows — no
    -- migration needed, gl_map_income_account is the door.
    ('ADDON',   'dispose-mattress', v_delivery, 'Old-mattress disposal, sold on the delivery trip (0464 seed)'),
    ('ADDON',   'dispose-sofa',     v_delivery, 'Old-sofa disposal, sold on the delivery trip (0464 seed)'),
    ('ADDON',   'dispose-bedframe', v_delivery, 'Old-bed-frame disposal, sold on the delivery trip (0464 seed)'),

    -- The storage fee, which is billed on the invoice and carried on no line.
    ('STORAGE', '*',               v_storage,
     'Storage fee billed on the invoice; verified against ops_order_control before it is credited (0464 seed)')
  on conflict (component_type, component_key) do nothing;

  -- Every add-on key that exists but has no row will make its order's invoice
  -- refuse. Naming them at migration time is cheaper than finding them at the
  -- counter.
  if exists (
    select 1 from addons a
     where a.active
       and not exists (select 1 from gl_income_account_map m
                        where m.component_type = 'ADDON' and m.component_key = a.key)
  ) then
    raise warning '0464: these active add-on keys are UNMAPPED and will make an invoice refuse until gl_map_income_account names an account: %',
      (select string_agg(a.key, ', ' order by a.key) from addons a
        where a.active
          and not exists (select 1 from gl_income_account_map m
                           where m.component_type = 'ADDON' and m.component_key = a.key));
  end if;
end $seed$;


-- ── 5 · one invoice becomes one journal entry ────────────────────────────────
-- Called with the `invoices` row already written. Returns the gl_entries.id, or
-- null when this invoice is deliberately not a ledger event.
--
-- The three quiet skips, and only these three:
--   · issued_at < gl_config.go_live_on  — ruling L. The clean start line.
--   · voided_at is already set          — nothing to recognise.
--   · amount + tax = 0                  — a rental-born order carries one line
--     priced ZERO on purpose (0275:228) and an unpriced AutoCount import sums
--     to nothing. There is no revenue to recognise and gl_post refuses a
--     zero-total entry anyway.
create or replace function public._sales_invoice_to_ledger(p_invoice_no text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_inv          invoices;
  v_order        orders;
  v_go_live      date;
  v_amount       numeric(12,2);
  v_goods        numeric(12,2);
  v_addons       numeric(12,2);
  v_residual     numeric(12,2);
  v_ar           text;
  v_party        uuid;
  v_account      text;
  v_lines        jsonb := '[]'::jsonb;
  v_credits      jsonb := '{}'::jsonb;
  v_rec          record;
  v_code         text;
  v_has_storage  boolean;
begin
  select * into v_inv from invoices where invoice_no = p_invoice_no;
  if not found then
    raise exception 'invoice % not found', coalesce(p_invoice_no, 'null')
      using errcode = '42P01', detail = 'invoice_not_found';
  end if;
  if v_inv.voided_at is not null then
    return null;
  end if;

  select go_live_on into v_go_live from gl_config where id;
  if v_go_live is null then
    raise exception 'the ledger has no go-live date — gl_config is not configured'
      using errcode = '22023', detail = 'gl_not_configured';
  end if;
  if v_inv.issued_at < v_go_live then
    return null;                       -- ruling L. Quietly. Not an error.
  end if;

  select * into v_order from orders where id = v_inv.order_id;
  if not found then
    raise exception 'invoice % points at an order that does not exist', p_invoice_no
      using errcode = '42P01', detail = 'order_not_found';
  end if;

  -- 2310 SST payable ships INACTIVE (0459:258): Carres is not SST-registered,
  -- so there is no account a tax amount could credit. A non-zero tax refuses
  -- rather than being folded into revenue.
  if round(coalesce(v_inv.tax_amount, 0), 2) <> 0 then
    raise exception 'invoice % carries tax of % and the chart has no active tax account — activate the tax account and map it before invoicing with tax',
      p_invoice_no, v_inv.tax_amount
      using errcode = '22023', detail = 'invoice_tax_unmapped';
  end if;

  v_amount := round(coalesce(v_inv.amount, 0), 2);
  if v_amount < 0 then
    raise exception 'invoice % is for %, and a negative invoice is a credit note, not a sale',
      p_invoice_no, v_inv.amount
      using errcode = '22023', detail = 'invoice_negative';
  end if;
  if v_amount = 0 then
    return null;                       -- nothing to recognise.
  end if;

  -- ── the explained components ───────────────────────────────────────────────
  -- Goods: every priced line on the order, credited to the account its ORDER's
  -- source decides — ordinary sale to furniture, rental-born order to rental.
  select round(coalesce(sum(ol.qty * ol.unit_price), 0), 2)
    into v_goods
    from order_lines ol
   where ol.order_id = v_inv.order_id;

  if v_goods <> 0 then
    v_account := public.gl_income_account_for('GOODS', coalesce(v_order.source_system, '*'));
    if v_account is null then
      raise exception 'invoice %: goods on a ''%'' order have no income account — map it with gl_map_income_account',
        p_invoice_no, coalesce(v_order.source_system, '*')
        using errcode = '22023', detail = 'income_account_unmapped';
    end if;
    v_credits := jsonb_set(v_credits, array[v_account],
                   to_jsonb(round(coalesce((v_credits->>v_account)::numeric, 0) + v_goods, 2)));
  end if;

  -- Add-ons: one bucket per key, each key resolved on its own. An unmapped key
  -- stops the invoice and says which key.
  v_addons := 0;
  for v_rec in
    select oa.addon_key as k, round(sum(oa.qty * oa.unit_price), 2) as amt
      from order_addons oa
     where oa.order_id = v_inv.order_id
     group by oa.addon_key
     having round(sum(oa.qty * oa.unit_price), 2) <> 0
  loop
    v_account := public.gl_income_account_for('ADDON', v_rec.k);
    if v_account is null then
      raise exception 'invoice %: add-on ''%'' has no income account — map it with gl_map_income_account before issuing this invoice',
        p_invoice_no, v_rec.k
        using errcode = '22023', detail = 'income_account_unmapped';
    end if;
    v_addons  := round(v_addons + v_rec.amt, 2);
    v_credits := jsonb_set(v_credits, array[v_account],
                   to_jsonb(round(coalesce((v_credits->>v_account)::numeric, 0) + v_rec.amt, 2)));
  end loop;

  -- ── the residual ──────────────────────────────────────────────────────────
  v_residual := round(v_amount - v_goods - v_addons, 2);

  if v_residual < 0 then
    raise exception 'invoice % bills RM % but its lines and add-ons come to RM % — the RM % difference is a discount, and the chart has no contra-revenue account for one',
      p_invoice_no, v_amount, round(v_goods + v_addons, 2), abs(v_residual)
      using errcode = '22023', detail = 'invoice_under_billed';
  end if;

  if v_residual > 0 then
    -- The residual is attributed only against evidence the order actually
    -- carries a storage charge. No evidence, no attribution, no posting.
    select (c.storage_from is not null
            or c.storage_fee_override is not null
            or c.storage_fee_msbf is not null
            or c.storage_fee_sof is not null)
      into v_has_storage
      from ops_order_control c
     where c.order_id = v_inv.order_id;

    if not coalesce(v_has_storage, false) then
      raise exception 'invoice % bills RM % but only RM % is explained by its lines and add-ons, and the order carries no storage charge — RM % cannot be attributed to a revenue account',
        p_invoice_no, v_amount, round(v_goods + v_addons, 2), v_residual
        using errcode = '22023', detail = 'invoice_amount_unexplained';
    end if;

    v_account := public.gl_income_account_for('STORAGE', '*');
    if v_account is null then
      raise exception 'invoice %: the storage fee has no income account — map STORAGE with gl_map_income_account',
        p_invoice_no
        using errcode = '22023', detail = 'income_account_unmapped';
    end if;
    v_credits := jsonb_set(v_credits, array[v_account],
                   to_jsonb(round(coalesce((v_credits->>v_account)::numeric, 0) + v_residual, 2)));
  end if;

  -- ── the entry ─────────────────────────────────────────────────────────────
  v_ar    := public.gl_ar_control_account();
  v_party := public.gl_customer_party_for_order(v_inv.order_id);

  v_lines := jsonb_build_array(
    jsonb_build_object(
      'account_code', v_ar,
      'debit',        v_amount,
      'credit',       0,
      'party_type',   'CUSTOMER',
      'party_id',     v_party,
      'memo',         format('Invoice %s · order #%s', p_invoice_no, v_order.so)
    )
  );

  for v_code in select key from jsonb_each(v_credits) order by key loop
    if round((v_credits->>v_code)::numeric, 2) <> 0 then
      v_lines := v_lines || jsonb_build_array(jsonb_build_object(
        'account_code', v_code,
        'debit',        0,
        'credit',       round((v_credits->>v_code)::numeric, 2),
        'memo',         format('Revenue on invoice %s', p_invoice_no)
      ));
    end if;
  end loop;

  return public.gl_post(
    'SALES_INVOICE',
    p_invoice_no,
    v_inv.issued_at,
    format('Sales invoice %s · order #%s', p_invoice_no, v_order.so),
    v_lines
  );
end;
$fn$;

comment on function public._sales_invoice_to_ledger(text) is
  'Turns one issued invoice into Dr receivables / Cr income, split by what was sold (0464). Returns null for a pre-go-live, voided or zero invoice; raises on anything it cannot attribute.';

revoke all on function public._sales_invoice_to_ledger(text) from public, anon, authenticated;


-- ── 6 · the canonical issuer, unchanged, plus the ledger step ────────────────
-- Every behaviour below is 0229's, unchanged (the keywords are lower-cased to
-- match this series; nothing else moved): same signature
-- `(uuid, numeric)`, same role gate, same `FOR UPDATE` lock, same idempotent
-- early return, same amount fallback, same INV-YYYY-{so} formula, same
-- `invoices` / `orders` / `order_history` / `audit_log` writes, same returned
-- keys. The ONLY addition is the `_sales_invoice_to_ledger` call after the
-- audit row and the `gl_entry_id` key it adds to the returned object —
-- additive, so every existing caller that reads 'invoice_no' / 'issued_at' /
-- 'amount' / 'already_issued' (apps/api/src/routes/orders.ts:4534-4539) is
-- untouched.
--
-- Note the placement: the ledger call comes AFTER `orders.invoice_no` is
-- stamped, so a refusal rolls back the invoice number as well as the entry and
-- the order is left un-invoiced rather than invoiced-but-unposted. There is no
-- half state.
create or replace function public.issue_order_invoice(
  p_order_id uuid,
  p_amount   numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role       text;
  v_actor_uid  uuid;
  v_so         bigint;
  v_existing   text;
  v_invoice_no text;
  v_amount     numeric(12,2);
  v_entry      uuid;
begin
  v_actor_uid := (select auth.uid());
  v_role := (select role from app_users where id = v_actor_uid);
  if not (public.is_operation() or v_role = 'finance') then
    raise exception 'Not allowed to issue invoices' using errcode = '42501';
  end if;

  -- Lock the order row so two concurrent issues can't race the number.
  select so, invoice_no into v_so, v_existing
  from orders where id = p_order_id for update;
  if v_so is null then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  -- Already issued -> return it untouched (idempotent).
  if v_existing is not null then
    return jsonb_build_object(
      'invoice_no', v_existing,
      'issued_at', (select issued_at from invoices where invoice_no = v_existing),
      'amount', (select amount from invoices where invoice_no = v_existing),
      'already_issued', true
    );
  end if;

  -- Amount: caller figure (Balance tab total = goods + storage) else the
  -- 0098 line+addon sum (native orders).
  if p_amount is not null and p_amount >= 0 then
    v_amount := p_amount;
  else
    select
      coalesce(sum(ol.qty * ol.unit_price), 0) +
      coalesce((select sum(oa.qty * oa.unit_price) from order_addons oa
                where oa.order_id = p_order_id), 0)
    into v_amount
    from order_lines ol
    where ol.order_id = p_order_id;
  end if;

  v_invoice_no := 'INV-' || to_char(now(), 'YYYY') || '-' || lpad(v_so::text, 6, '0');

  insert into invoices (invoice_no, order_id, amount, tax_amount, issued_at)
  values (v_invoice_no, p_order_id, v_amount, 0, current_date)
  on conflict (invoice_no) do nothing;

  update orders
  set invoice_no = v_invoice_no, invoiced_at = current_date
  where id = p_order_id;

  insert into order_history (order_id, text, by_role, by_user_id)
  values (
    p_order_id,
    format('Sales Invoice issued from Balance tab · %s (RM %s)', v_invoice_no, v_amount),
    'operation',
    v_actor_uid
  );

  insert into audit_log (role, actor_text, action, ref)
  values (
    'operation',
    coalesce((select name from app_users where id = v_actor_uid), 'System'),
    format('Issued invoice %s on demand for order #%s (RM %s)', v_invoice_no, v_so, v_amount),
    p_order_id::text
  );

  -- ── 0464 · revenue is recognised here. No exception handler, by design.
  -- If this raises, everything above rolls back with it. See the header, ⑤.
  v_entry := public._sales_invoice_to_ledger(v_invoice_no);

  return jsonb_build_object(
    'invoice_no', v_invoice_no,
    'issued_at', current_date,
    'amount', v_amount,
    'already_issued', false,
    'gl_entry_id', v_entry
  );
end;
$fn$;

-- Grants restated exactly as 0229 left them: anon stripped, authenticated
-- callable, the in-function role check is the gate.
revoke execute on function public.issue_order_invoice(uuid, numeric) from public, anon;
grant execute on function public.issue_order_invoice(uuid, numeric) to authenticated;


-- ── 7 · a void contra-reverses the entry; it never deletes it ────────────────
-- There is no `void_order_invoice` function to append a step to: the Finance
-- void writes `invoices.voided_at` straight through PostgREST
-- (apps/api/src/routes/finance/invoices.ts:126-133, on the UPDATE-only policy
-- 0461 left it). A trigger is therefore the only thing that can catch it, and
-- it catches EVERY void, including invoices minted by the two other issue
-- doors — those simply have no entry and the trigger no-ops.
--
-- Un-voiding is refused rather than silently re-posting: an invoice that was
-- voided and is wanted again is re-issued, which mints a new number and a new
-- entry. `gl_post`'s partial unique index is over posted, unreversed rows, so
-- the reversal frees the pair and a corrected re-post is admitted.
create or replace function public.invoices_reverse_ledger_on_void()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_entry uuid;
begin
  select e.id into v_entry
    from public.gl_entries e
   where e.source_type = 'SALES_INVOICE'
     and e.source_doc_no = new.invoice_no
     and e.posted
     and not e.reversed;

  if v_entry is not null then
    perform public.gl_reverse(v_entry, 'Invoice ' || new.invoice_no || ' voided');
  end if;

  return null;                          -- AFTER trigger; the return is ignored.
end;
$fn$;

comment on function public.invoices_reverse_ledger_on_void() is
  'Voiding an invoice contra-reverses its journal entry (0464). Never a delete. A pre-go-live or never-posted invoice has no entry and this is a no-op.';

drop trigger if exists invoices_reverse_ledger_on_void_trg on public.invoices;
create trigger invoices_reverse_ledger_on_void_trg
  after update of voided_at on public.invoices
  for each row
  when (old.voided_at is null and new.voided_at is not null)
  execute function public.invoices_reverse_ledger_on_void();


-- ── 8 · the reconciliation ───────────────────────────────────────────────────
-- What the LEDGER says customers owe, against what the OPERATIONAL tables say,
-- and the difference — and, FIRST, everything that could not be read, because a
-- reconciliation that quietly omits what it could not see is worse than none.
--
-- ALWAYS EXACTLY ONE ROW. Including when the two agree, when the ledger is
-- empty, and when the chart is broken badly enough that the receivables account
-- cannot even be identified. "No rows" must never be readable as "all good".
--
-- COMPARABILITY. The ledger starts at go-live and the operational tables do
-- not, so both sides are computed on the SAME window — invoices issued on or
-- after go-live, receipts taken on or after go-live — and everything outside
-- that window is reported as a named exclusion rather than folded in. The two
-- figures are `comparable` only when nothing is unreadable:
--   · an invoice issued after go-live with no journal entry (it refused, or it
--     was minted by a door this file does not wire — see §9);
--   · a storage fee recognised here whose receipt 0461 never credits back
--     (the header, ③);
--   · a receivables control account the chart cannot name unambiguously.
-- `pre_go_live_open_*` is NOT a comparability break — both sides exclude those
-- invoices identically — but it IS the reason the ledger balance is not the
-- total debt Carres is owed, so it is reported every time.
create or replace function public.gl_receivables_reconcile()
returns table (
  checked_at                     timestamptz,
  go_live_on                     date,
  ar_account_code                text,
  missing_first                  text,
  comparable                     boolean,
  ledger_ar_balance              numeric(12,2),
  operational_ar_balance         numeric(12,2),
  difference                     numeric(12,2),
  unposted_invoice_count         bigint,
  unposted_invoice_amount        numeric(12,2),
  storage_recognised_uncollected numeric(12,2),
  pre_go_live_open_count         bigint,
  pre_go_live_open_amount        numeric(12,2)
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_go_live   date;
  v_ar        text;
  v_ar_error  text;
  v_ledger    numeric(12,2) := 0;
  v_inv       numeric(12,2) := 0;
  v_pay       numeric(12,2) := 0;
  v_unp_n     bigint := 0;
  v_unp_amt   numeric(12,2) := 0;
  v_stor      numeric(12,2) := 0;
  v_pre_n     bigint := 0;
  v_pre_amt   numeric(12,2) := 0;
  v_missing   text[] := array[]::text[];
begin
  if not public.is_internal() then
    raise exception 'gl_receivables_reconcile refused: internal roles only'
      using errcode = '42501', detail = 'gl_receivables_reconcile_forbidden';
  end if;

  select c.go_live_on into v_go_live from gl_config c where c.id;

  -- The chart may be unable to name the receivables account at all. That is a
  -- thing to REPORT, not a thing to raise on: the whole point of this function
  -- is to still return a row when something is wrong. This is the one
  -- exception handler in the file, and it wraps a read.
  begin
    v_ar := public.gl_ar_control_account();
  exception when others then
    v_ar_error := sqlerrm;
    v_ar := null;
  end;

  if v_go_live is null then
    v_missing := v_missing || 'the ledger has no go-live date (gl_config is empty), so neither side can be windowed';
  end if;
  if v_ar is null then
    v_missing := v_missing ||
      ('the chart cannot name one trade-receivables control account, so the ledger side could not be read — ' ||
       coalesce(v_ar_error, 'unknown reason'));
  end if;

  if v_ar is not null then
    select round(coalesce(sum(l.debit - l.credit), 0), 2)
      into v_ledger
      from gl_entry_lines l
      join gl_entries e on e.id = l.entry_id
     where l.account_code = v_ar
       and e.posted and not e.reversed;
  end if;

  if v_go_live is not null then
    -- The operational side, on the ledger's own window.
    select round(coalesce(sum(i.amount + coalesce(i.tax_amount, 0)), 0), 2)
      into v_inv
      from invoices i
     where i.voided_at is null
       and i.issued_at >= v_go_live;

    -- Every receipt that reduces what a customer owes, storage included. 0461
    -- does not post the storage ones; that is exactly what makes `difference`
    -- non-zero and why the storage figure is reported beside it.
    select round(coalesce(sum(p.amount), 0), 2)
      into v_pay
      from order_payments p
     where p.voided_at is null
       and p.paid_on >= v_go_live
       and (p.counted_in_paid or p.kind = 'storage');

    -- Invoices this window should have posted and did not.
    select count(*)::bigint, round(coalesce(sum(i.amount + coalesce(i.tax_amount, 0)), 0), 2)
      into v_unp_n, v_unp_amt
      from invoices i
     where i.voided_at is null
       and i.issued_at >= v_go_live
       and round(i.amount + coalesce(i.tax_amount, 0), 2) <> 0
       and not exists (
         select 1 from gl_entries e
          where e.source_type = 'SALES_INVOICE'
            and e.source_doc_no = i.invoice_no
            and e.posted and not e.reversed);

    -- Storage money recognised on an invoice and collected without ever
    -- crediting receivables back (0461's kind = 'storage' skip).
    select round(coalesce(sum(p.amount), 0), 2)
      into v_stor
      from order_payments p
     where p.voided_at is null
       and p.kind = 'storage'
       and p.paid_on >= v_go_live;

    -- Not a comparability break, but the reason this balance is not total debt.
    select count(*)::bigint, round(coalesce(sum(i.amount + coalesce(i.tax_amount, 0)), 0), 2)
      into v_pre_n, v_pre_amt
      from invoices i
     where i.voided_at is null
       and i.issued_at < v_go_live;

    if v_unp_n > 0 then
      v_missing := v_missing || format(
        '%s invoice(s) issued on or after go-live carry no journal entry (RM %s of revenue never reached the ledger)',
        v_unp_n, v_unp_amt);
    end if;
    if v_stor <> 0 then
      v_missing := v_missing || format(
        'RM %s of storage receipts are recognised as revenue on an invoice but never credited back to receivables (0461 skips kind = ''storage''), so the ledger overstates what customers owe by that amount',
        v_stor);
    end if;
    if v_pre_n > 0 then
      v_missing := v_missing || format(
        '%s invoice(s) worth RM %s were issued before go-live and the ledger deliberately never saw them — this balance is post-go-live receivables, not total customer debt',
        v_pre_n, v_pre_amt);
    end if;
  end if;

  return query
  select now(),
         v_go_live,
         v_ar,
         case when array_length(v_missing, 1) is null
              then 'nothing — both sides were read in full'
              else array_to_string(v_missing, ' · ')
         end,
         (v_go_live is not null and v_ar is not null and v_unp_n = 0 and v_stor = 0),
         v_ledger,
         round(v_inv - v_pay, 2),
         round(v_ledger - (v_inv - v_pay), 2),
         v_unp_n,
         v_unp_amt,
         v_stor,
         v_pre_n,
         v_pre_amt;
end;
$fn$;

comment on function public.gl_receivables_reconcile() is
  'Ledger receivables against operational receivables (0464). Always exactly one row. `missing_first` names everything that could not be read BEFORE the numbers, and `comparable` is false whenever anything is missing.';

revoke all on function public.gl_receivables_reconcile() from public, anon;
grant execute on function public.gl_receivables_reconcile() to authenticated;


-- ── 9 · what this file knowingly does NOT wire, and why ──────────────────────
-- 🔴 THREE DOORS MINT AN INVOICE. Law C of docs/ERP-ARCHITECTURE.md — "a door,
-- never a duplicate" — is already broken here, and this file wires exactly one
-- of the three because wiring the other two would do harm:
--
--   1. `issue_order_invoice` (0229, called from apps/api/src/routes/orders.ts
--      :4519). The canonical door. WIRED above.
--
--   2. `orders_auto_issue_on_dispatched` (0098, re-attached by 0167:114). A
--      BEFORE UPDATE trigger on `orders` that mints INV-YYYY-{so, 6-digit} at
--      dispatch. NOT WIRED: it runs as whoever moved the order to dispatched,
--      which is the LOGISTICS role, and `gl_post`'s role gate admits only
--      finance / operation / principal (0460:164). Appending a posting call
--      would make every logistics dispatch fail. The fix is a decision, not a
--      patch: either admit 'logistics' to gl_post, or retire the auto-issue
--      half of that trigger so 0229 is the one door. RECOMMENDED: retire it —
--      the trigger and 0229 already share a number formula precisely so they
--      cannot both mint, which is an admission that one of them is redundant.
--
--   3. `invoice_issue` (0003_rpcs.sql:289, rewritten by 0126, called from
--      apps/api/src/routes/finance/invoices.ts:103). NOT WIRED, and this one is
--      worse than unposted: its number formula is
--      `to_char(dl, 'FM0000')` — FOUR digits — against the six-digit `lpad` the
--      other two use. Order 123 gets 'INV-2026-0123' here and 'INV-2026-000123'
--      there, so the two doors can mint TWO invoices for ONE order. Wiring it
--      would post that revenue TWICE. It must be reconciled with the other two
--      before it may post anything.
--
-- Until 2 and 3 are settled, `gl_receivables_reconcile().unposted_invoice_count`
-- counts everything they mint, and `comparable` is false the moment they do.


-- ── 10 · sanity — schema shape only, never a production row count ────────────
do $sanity$
declare
  v int;
begin
  select count(*) into v from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('gl_income_account_for','gl_map_income_account',
                       '_sales_invoice_to_ledger','invoices_reverse_ledger_on_void',
                       'gl_receivables_reconcile');
  if v < 5 then
    raise exception '0464 sanity: expected the five functions, got %', v;
  end if;

  -- 0229's signature is preserved exactly. A changed signature would leave the
  -- old two-argument function standing beside the new one and the route would
  -- keep calling whichever Postgres resolved first.
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'issue_order_invoice'
       and pg_get_function_identity_arguments(p.oid) = 'uuid, numeric'
  ) then
    raise exception '0464 sanity: issue_order_invoice lost its (uuid, numeric) signature';
  end if;
  select count(*) into v from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'issue_order_invoice';
  if v <> 1 then
    raise exception '0464 sanity: % overloads of issue_order_invoice exist, expected exactly 1', v;
  end if;

  if not exists (
    select 1 from pg_trigger t
     where t.tgrelid = 'public.invoices'::regclass
       and t.tgname = 'invoices_reverse_ledger_on_void_trg'
       and not t.tgisinternal
  ) then
    raise exception '0464 sanity: the invoice void reversal trigger is not attached';
  end if;

  -- The map must be seeded, and must NOT carry an add-on catch-all.
  select count(*) into v from public.gl_income_account_map;
  if v < 6 then
    raise exception '0464 sanity: the income map seeded only % row(s)', v;
  end if;
  if exists (select 1 from public.gl_income_account_map
              where component_type = 'ADDON' and component_key = '*') then
    raise exception '0464 sanity: an ADDON catch-all row exists — an unmapped add-on must refuse, not default';
  end if;
  if exists (
    select 1 from public.gl_income_account_map m
      join public.gl_accounts a on a.code = m.account_code
     where a.kind <> 'INCOME' or not a.is_active
  ) then
    raise exception '0464 sanity: the income map points at a non-income or retired account';
  end if;
  if exists (
    select 1 from public.gl_income_account_map m
     where exists (select 1 from public.gl_accounts c where c.parent_code = m.account_code)
  ) then
    raise exception '0464 sanity: the income map points at a header account';
  end if;

  -- Reads are internal; writes are nobody's.
  if has_table_privilege('authenticated', 'public.gl_income_account_map', 'insert')
     or has_table_privilege('authenticated', 'public.gl_income_account_map', 'update')
     or has_table_privilege('authenticated', 'public.gl_income_account_map', 'delete') then
    raise exception '0464 sanity: the income account map is directly writable';
  end if;
  if has_table_privilege('anon', 'public.gl_income_account_map', 'select') then
    raise exception '0464 sanity: anon can read the income account map';
  end if;
  if exists (select 1 from pg_policy
              where polrelid = 'public.gl_income_account_map'::regclass
                and polcmd <> 'r') then
    raise exception '0464 sanity: a write policy exists on the income account map';
  end if;
  if has_function_privilege('anon', 'public.gl_receivables_reconcile()', 'execute') then
    raise exception '0464 sanity: gl_receivables_reconcile is callable by anon';
  end if;
  if has_function_privilege('authenticated', 'public._sales_invoice_to_ledger(text)', 'execute') then
    raise exception '0464 sanity: the posting helper is callable directly';
  end if;

  -- NOT exercised here: gl_receivables_reconcile guards on is_internal(), and a
  -- migration runs with no auth.uid(), so calling it would refuse and roll the
  -- whole file back. Its one-row-always property is a property of its body —
  -- every return path goes through the single `return query` at the end.

  raise notice '0464 OK: an invoice recognises revenue, a void reverses it, and receivables can be reconciled';
end $sanity$;
