-- =============================================================================
-- 0476_every_invoice_door_posts_and_a_method_is_a_setting.sql
-- FINANCE LEDGER · BUILD A — the customer flow SO → DO → SI → Received posts
-- the same whichever door the user takes, and a payment method is a setting.
--
-- ── WHAT WAS WRONG (measured on 0469) ───────────────────────────────────────
--  ① Only `issue_order_invoice` (0466) posted a Sales Invoice. The governed
--    issue door `payment_invoice_issue` (0429:157), the dispatch trigger
--    `orders_auto_issue_on_dispatched` (0429:301) and the storage charge door
--    `payment_storage_invoice` (0438:38, which issues through
--    payment_invoice_issue) minted numbers and asked for money, and the ledger
--    never heard of them. Receivables only ever fell.
--  ② A Storage / Additional Storage Invoice had no posting rule at all, and
--    nothing stopped one storage fee being recognised on two documents: a
--    Sales Invoice may carry a storage residual (0466 ③) while the same order's
--    storage case prints its own Storage Invoices (0438). 0445/0447 guard the
--    keyed legacy fee, not the date-walked accrual (`storage_from`).
--  ③ Two issue doors and two void doors for one invoice: the legacy
--    `invoice_issue` (0003:289, INV-YYYY-dl) was still executable, and a bare
--    PostgREST UPDATE of `voided_at` (the old POST /:id/void) was allowed by the
--    `invoices_write_finance` policy — which also let finance edit an ISSUED
--    invoice's amount in place.
--  ④ `issue_order_invoice` inserted INV-YYYY-{so}: a prepared draft made it
--    fail with 23505 on `invoices_live_sales_per_order_uidx`, and after a void
--    it re-inserted the SAME number the voided invoice wears.
--  ⑤ A payment method was a hard-coded word in three CHECKs. `bank_transfer`
--    (finance_record_receipt's enum) and `credit` / `installment` (POS keys
--    reaching top_up_order) coerced to 'other', which has no ledger account,
--    so after go-live those payments refuse. Nobody could add a method.
--  ⑥ A deposit taken with a new order was written into `orders.paid` by
--    `create_order` with no receipt row and no journal entry (the POS door),
--    or copied afterwards by a best-effort mirror whose failure the raw door
--    swallowed (apps/api orders.ts POST /raw).
--
-- ── WHAT THIS BUILDS ─────────────────────────────────────────────────────────
--  §1–§4  a method is a KEY: `payment_method_key` folds spelling and aliases;
--         `payment_manual_methods` gains a label and is the registry; the
--         three CHECKs become a key format; `payment_method_save` adds,
--         renames, deactivates a method and chooses its money account;
--         `gl_account_for_payment_method` (signature kept — Build D calls it)
--         reads the key through the normaliser.
--  §5–§6  the one customer-payment writer accepts registry keys and refuses,
--         before writing, a method with no money account; finance_record_receipt
--         takes text so bank_transfer lands in the bank.
--  §7–§10 every invoice door posts through `_sales_invoice_to_ledger`, which
--         now knows storage papers; `issue_order_invoice` picks up the draft and
--         issues it through the governed number.
--  §11    the legacy doors close.
--  §12    the sale-time deposit goes through `_customer_payment_post`: both
--         create wrappers hand `create_order` the payload WITHOUT `paid` (the
--         order is born at RM 0) and record the deposit as a counted payment
--         through the one writer, before the Sales handoff reads the 50% rule.
--         `orders.paid` still ends at the same figure; now a receipt row, an
--         allocation and a journal entry stand behind it. The raw door's
--         best-effort mirror in apps/api is removed in the same change — the
--         wrapper does the job inside the create transaction, so a refusal
--         fails the create loudly instead of being logged and swallowed.
--  §13    `gl_receivables_reconcile` stops calling storage receipts unposted
--         and counts every live receipt, as the ledger does.
--
-- ── THE LEDGER, PER ACTION ───────────────────────────────────────────────────
--   Issue a Sales Invoice (Finance → Invoices Issue · order drawer Generate
--   invoice · dispatch)          Dr 1210 (customer)  amount
--                                Cr 4100 goods (4200 on a rental-born order)
--                                Cr 4300 delivery add-ons (by add-on key)
--                                Cr 4400 a storage residual — legacy model only
--   Issue a Storage / Additional Storage Invoice
--                                Dr 1210 (customer)  Cr 4400   exactly the amount
--   Void and replace             contra of the original entry, on its date
--                                (SALES_INVOICE_REVERSAL, 0466 trigger); the
--                                replacement posts fresh when it is issued
--   Record a payment (any door, any method, storage cash included)
--                                Dr the method's money account (1110/1120/1130)
--                                Cr 1210 (customer)
--   Deposit taken with a new order   the same as a payment
-- All through gl_post: idempotent per (source_type, document number), nothing
-- dated before go-live, no exception handler — a refusal rolls the document
-- back with it. A Storage Invoice keeps source_type 'SALES_INVOICE': one table,
-- one number series, and the 0466 void trigger, the reconcile and the ledger
-- drill-downs already follow it.
--
-- ── ③ THE STORAGE RULE — ONE ORDER, ONE STORAGE MODEL ────────────────────────
-- A storage fee is recognised once, on one kind of document, and collected
-- once:
--   · An order with a storage case, or any Storage Invoice ever (voided ones
--     included — the 2026-09-08 precedence law in docs/payment/MASTER.md), is
--     in the INVOICE model. Its storage revenue comes only from Storage
--     Invoices. A Sales Invoice on it that bills more than its lines and
--     add-ons REFUSES (detail storage_fee_on_two_documents).
--   · A Storage Invoice REFUSES while the order's live Sales Invoice has an
--     active entry that already credits the storage account (same detail).
--     Fix: void and replace that Sales Invoice without the storage fee.
--   · An order with neither is in the LEGACY model: the storage residual on
--     its Sales Invoice is credited to 4400 against ops_order_control evidence,
--     exactly as 0466 ③.
--   · Collected once: every receipt credits 1210 exactly once (0463). Legacy
--     storage cash is kind 'storage' (stamps storage_collected_at, not in
--     orders.paid); Storage Invoice cash is recorded against the invoice as an
--     ordinary payment. Either way one receipt, one credit.
-- 0463 already posts kind = 'storage' (its skip was removed); what was stale
-- is 0466/0469's reconcile, which still reported every storage receipt as
-- never credited. §13 fixes that reading.
--
-- ── RLS AND GRANTS CHANGED (Constitution red line 2) ─────────────────────────
--   · invoices: policy `invoices_write_finance` (UPDATE by finance/principal)
--     is dropped and INSERT/UPDATE/DELETE/TRUNCATE are revoked from anon and
--     authenticated. Why: an issued invoice is never edited (payment MASTER
--     §4), and that policy was a second void door and an in-place edit door.
--     Every writer of `invoices` is a security-definer function (measured:
--     invoice_issue, issue_order_invoice, orders_auto_issue_on_dispatched,
--     payment_invoice_prepare/issue/void_replace, payment_storage_invoice), so
--     no door changes behaviour. The read policy is untouched.
--   · `invoice_issue(uuid,numeric,numeric)`: execute revoked from public, anon,
--     authenticated. The function stays (no drop); nothing can call it.
--   · New read functions `payment_method_registry()` and
--     `payment_method_money_accounts()` are security definer for is_internal()
--     callers: Operation must see a method's money account and cannot read
--     gl_payment_account_map or gl_accounts under their gl_may_read() RLS.
--
-- ── DEPENDENT OBJECTS OF THE TYPE CHANGES ────────────────────────────────────
--   finance_record_receipt: p_method payment_method → text (drop + create; the
--     enum type itself stays — payments.method, order_record_payment,
--     dealer_topup, finance_po_pay, finance_topup_approve and refund_pay still
--     use it). Callers: apps/api/src/routes/finance/payments.ts POST
--     /order-receipt; packages/shared financeRecordReceiptInput. No SQL caller.
--   The three method CHECKs (order_payments, gl_payment_account_map,
--     payment_manual_methods) become `^[a-z][a-z0-9_]{1,39}$`. Every stored
--     word already satisfies it. Readers: _customer_payment_post,
--     _customer_payment_to_ledger, gl_account_for_payment_method,
--     gl_map_payment_account, payment_set_method_active, and the API/web label
--     maps (which now fall back to the registry label).
--
-- ── COPIED FROM (create or replace replaces the whole body) ──────────────────
--   _customer_payment_post, gl_account_for_payment_method,
--   gl_map_payment_account ........................ 0463 (latest)
--   _sales_invoice_to_ledger, issue_order_invoice .. 0466 (latest)
--   payment_invoice_issue, orders_auto_issue_on_dispatched .. 0429 (latest)
--   finance_record_receipt ......................... 0351 (latest)
--   create_order_from_sales_portal, create_raw_order  0396 (latest)
--   gl_receivables_reconcile ....................... 0469 (latest)
--
-- ── WHO MANAGES A METHOD ─────────────────────────────────────────────────────
--   payment/MASTER.md §12 locks the payment methods to Settings → Payment and
--   its manager gate (principal, or the ops_manager duty — 0431). The registry
--   door keeps that gate; the method's money account is chosen in the same act
--   so there is one door, not a Settings door plus a Finance door. Whether
--   Finance should also pass this gate is an owner question, not decided here.
--   Every account a method may choose is a money account (gl_money_account_ok),
--   so the manager can never point customer money at revenue or a control.
--
-- ── A DISPATCH CAN NOW REFUSE ────────────────────────────────────────────────
--   The dispatch trigger posts with no exception handler, like every other
--   door (0463/0466 policy): an order whose invoice cannot be attributed (an
--   unmapped add-on key, tax on the invoice, an unexplained residual) now
--   refuses to dispatch with the ledger's own message, instead of minting an
--   invoice the ledger never hears of.
--
-- ── DELIBERATELY NOT HERE ────────────────────────────────────────────────────
--   COGS at delivery, deposits moved to a 2210 liability, supplier bills,
--   other debtors, rental posting — other builds. No backfill: every row in the
--   database is test data; an invoice issued before this file stays unposted
--   and the reconcile says so. `create_order` itself is not touched. The POS
--   method list (order_entry_config, SO Maintenance) stays its own setting —
--   its keys reach the writer through payment_method_key, and a POS key with
--   no money account refuses at create exactly as a top-up with it already
--   does since 0463.
-- =============================================================================


-- ── §1 · a method is a KEY ───────────────────────────────────────────────────
-- One spelling for every door. Lower-case, trimmed, spaces and hyphens become
-- underscores, and the aliases the older doors send fold into the word the
-- ledger maps:
--   bank_transfer → bank     (finance_record_receipt's enum, rental)
--   credit        → card     (POS "Credit / Debit")
--   installment   → card     (POS instalment — settled by the card acquirer)
-- Everything else passes through unchanged, so a registered key is itself.
create or replace function public.payment_method_key(p_method text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $fn$
  select case k
           when 'bank_transfer' then 'bank'
           when 'credit'        then 'card'
           when 'installment'   then 'card'
           else k
         end
    from (select nullif(regexp_replace(lower(btrim(coalesce(p_method, ''))), '[[:space:]-]+', '_', 'g'), '') as k) s;
$fn$;

comment on function public.payment_method_key(text) is
  '0476: the one spelling of a payment method. Folds case, spaces and hyphens, and the aliases bank_transfer→bank, credit→card, installment→card.';

revoke all on function public.payment_method_key(text) from public, anon;
grant execute on function public.payment_method_key(text) to authenticated;


-- ── §2 · the registry: payment_manual_methods gains a name ───────────────────
-- 0431 made `payment_manual_methods` the list of manual methods with an Active
-- flag. It becomes THE registry: key, label, active, sort — and the money
-- account lives in gl_payment_account_map's '*' row for that key, written by
-- the same door, so the resolver keeps ONE account truth.
alter table public.payment_manual_methods add column if not exists label text;

-- The six 0431 rows get their names. Configuration, not transactions.
update public.payment_manual_methods
   set label = coalesce(case method
                          when 'bank'        then 'Bank transfer'
                          when 'duitnow_qr'  then 'DuitNow QR'
                          when 'cheque'      then 'Cheque'
                          when 'cash'        then 'Cash'
                          when 'credit_card' then 'Credit card'
                          when 'debit_card'  then 'Debit card'
                        end,
                        initcap(replace(method, '_', ' ')))
 where label is null;

alter table public.payment_manual_methods alter column label set not null;
alter table public.payment_manual_methods drop constraint if exists payment_manual_methods_label_check;
alter table public.payment_manual_methods
  add constraint payment_manual_methods_label_check check (length(btrim(label)) between 1 and 40);
create unique index if not exists payment_manual_methods_label_uidx
  on public.payment_manual_methods (lower(btrim(label)));

comment on column public.payment_manual_methods.label is
  '0476: the method''s name on every screen and receipt. Unique, case-insensitive.';
comment on table public.payment_manual_methods is
  '0431 + 0476: the payment method registry — key, name, Active, order. Its money account is the gl_payment_account_map ''*'' row for the key; payment_method_save writes both. Online payment is provider-recorded and never a manual method.';

-- The three dictionaries become a key FORMAT. Which keys are real is decided
-- by the writer (§5): the nine system words plus the registry.
alter table public.payment_manual_methods drop constraint if exists payment_manual_methods_method_check;
alter table public.payment_manual_methods
  add constraint payment_manual_methods_method_check check (method ~ '^[a-z][a-z0-9_]{1,39}$');

alter table public.gl_payment_account_map drop constraint if exists gl_payment_account_map_method_check;
alter table public.gl_payment_account_map
  add constraint gl_payment_account_map_method_check check (method ~ '^[a-z][a-z0-9_]{1,39}$');

alter table public.order_payments drop constraint if exists order_payments_method_check;
alter table public.order_payments
  add constraint order_payments_method_check check (method ~ '^[a-z][a-z0-9_]{1,39}$');


-- ── §3 · which accounts a method may land in, and the resolver ───────────────
-- A money account: an active, posting (no children), non-control ASSET account
-- under 1100 Cash and bank. Today that is 1110, 1120, 1130.
create or replace function public.gl_money_account_ok(p_account_code text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  with recursive up(code, parent_code, depth) as (
    select a.code, a.parent_code, 0 from public.gl_accounts a where a.code = p_account_code
    union all
    select a.code, a.parent_code, up.depth + 1
      from public.gl_accounts a join up on a.code = up.parent_code
     where up.depth < 12
  )
  select coalesce((
    select a.is_active and a.kind = 'ASSET' and not a.is_control
           and not exists (select 1 from public.gl_accounts c where c.parent_code = a.code)
           and exists (select 1 from up where up.parent_code = '1100')
      from public.gl_accounts a
     where a.code = p_account_code), false);
$fn$;

comment on function public.gl_money_account_ok(text) is
  '0476: true for an account customer money may land in — active, posting, non-control ASSET under 1100 Cash and bank.';
revoke all on function public.gl_money_account_ok(text) from public, anon, authenticated;

-- Seed the three manual methods 0463 left unmapped. Only where the account
-- really is a money account; an existing row is never overwritten.
insert into public.gl_payment_account_map (method, source_channel, account_code, note)
select v.method, '*', v.code, v.note
  from (values
    ('duitnow_qr',  '1130', 'DuitNow QR settles with card and online money (0476 seed)'),
    ('credit_card', '1130', 'Card terminal settlement (0476 seed)'),
    ('debit_card',  '1130', 'Card terminal settlement (0476 seed)')
  ) as v(method, code, note)
 where public.gl_money_account_ok(v.code)
on conflict (method, source_channel) do nothing;

-- The debit side (0463:172). SIGNATURE KEPT — Build D resolves rental money
-- through it. The only change: the method is read through payment_method_key,
-- so 'bank_transfer' finds the bank row and a registered key finds its own.
create or replace function public.gl_account_for_payment_method(
  p_method         text,
  p_source_channel text default null
) returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select m.account_code
    from public.gl_payment_account_map m
   where m.method = public.payment_method_key(p_method)
     and m.source_channel in (coalesce(p_source_channel, '*'), '*')
   order by case when m.source_channel = '*' then 1 else 0 end
   limit 1;
$fn$;

comment on function public.gl_account_for_payment_method(text,text) is
  'The account customer money of this method/channel debits (0463; 0476 reads the method through payment_method_key). NULL means unmapped — the caller must refuse, never substitute.';
revoke all on function public.gl_account_for_payment_method(text,text) from public, anon;
grant execute on function public.gl_account_for_payment_method(text,text) to authenticated;

-- The principal's map door (0463:635). The nine-word whitelist becomes "a
-- system word or a registered method"; every other check is 0463's.
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


-- ── §4 · the registry doors ──────────────────────────────────────────────────
-- Read: every method with its money account. Internal staff only.
create or replace function public.payment_method_registry()
returns table (
  method       text,
  label        text,
  account_code text,
  account_name text,
  active       boolean,
  sort         integer
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
begin
  if not coalesce(public.is_internal(), false) then
    raise exception 'forbidden' using errcode = '42501', detail = 'not_internal';
  end if;
  return query
  select m.method, m.label, a.code, a.name, m.active, m.sort
    from payment_manual_methods m
    left join gl_payment_account_map g on g.method = m.method and g.source_channel = '*'
    left join gl_accounts a on a.code = g.account_code
   order by m.sort, m.method;
end;
$fn$;

comment on function public.payment_method_registry() is
  '0476: the payment method registry with each method''s money account. Internal staff; forms offer the Active rows.';
revoke all on function public.payment_method_registry() from public, anon;
grant execute on function public.payment_method_registry() to authenticated;

-- Read: the accounts a method may choose.
create or replace function public.payment_method_money_accounts()
returns table (code text, name text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
begin
  if not coalesce(public.is_internal(), false) then
    raise exception 'forbidden' using errcode = '42501', detail = 'not_internal';
  end if;
  return query
  select a.code, a.name
    from gl_accounts a
   where public.gl_money_account_ok(a.code)
   order by a.code;
end;
$fn$;

comment on function public.payment_method_money_accounts() is
  '0476: the money accounts a payment method may land in (gl_money_account_ok).';
revoke all on function public.payment_method_money_accounts() from public, anon;
grant execute on function public.payment_method_money_accounts() to authenticated;

-- Write: add (p_method null — the key is made from the name), rename,
-- (de)activate and choose the money account, in one act. The manager gate
-- Payment Settings already uses (0431: principal or the ops_manager duty);
-- old and new values, actor and time land in payment_setting_changes.
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
  '0476: add (p_method null), rename, (de)activate a payment method and choose its money account. Manager gate (payment_settings_gate); every change kept in payment_setting_changes.';
revoke all on function public.payment_method_save(text, text, text, boolean) from public, anon;
grant execute on function public.payment_method_save(text, text, text, boolean) to authenticated;


-- ── §5 · the one customer-payment writer accepts a registered method ─────────
-- **0463's** body verbatim (which is 0449's writer + 0430's widened dictionary
-- + 0449's receipt snapshot + 0463's ledger step — see 0463's header for the
-- chain; do NOT copy this out of 0351). Signature, idempotency, lock, receipt
-- number, snapshot, allocation, orders.paid arithmetic, logs, ledger call and
-- return shape are unchanged. 0476 changes three things only:
--   · the method is read through payment_method_key and accepted when it is a
--     system word OR a method in the registry; anything else still coerces to
--     'other' with the original kept in source_metadata.original_method;
--   · on or after go-live, a method whose money account cannot be resolved is
--     refused BEFORE the row is written, naming what the caller typed — not
--     the 'other' it would have been coerced to;
--   · the receipt snapshot also freezes the method's name (`method_label`).
create or replace function public._customer_payment_post(
  p_order_id uuid,
  p_amount numeric,
  p_paid_on date,
  p_method text,
  p_kind text,
  p_source_channel text,
  p_idempotency_key text,
  p_source_reference text default null,
  p_reference text default null,
  p_note text default null,
  p_receipt_url text default null,
  p_receipt_no text default null,
  p_source_metadata jsonb default '{}'::jsonb,
  p_counts_toward_paid boolean default true
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $fn$
declare
  v_order orders;
  v_existing order_payments;
  v_row order_payments;
  v_paid numeric;
  v_receipt text;
  v_seq integer;
  v_method text;
  v_snapshot jsonb;   -- 0449
  v_entry uuid;       -- 0463
  v_go_live date;     -- 0476
begin
  if p_order_id is null or p_amount is null or p_amount <= 0 or p_paid_on is null then
    raise exception 'order, positive amount and paid-on date are required'
      using errcode = '22023', detail = 'invalid_input';
  end if;
  if nullif(btrim(coalesce(p_source_channel, '')), '') is null
     or nullif(btrim(coalesce(p_idempotency_key, '')), '') is null then
    raise exception 'source channel and idempotency key are required'
      using errcode = '22023', detail = 'idempotency_required';
  end if;
  if p_kind not in ('payment','deposit','storage') then
    raise exception 'invalid payment kind' using errcode = '22023', detail = 'bad_kind';
  end if;

  select * into v_existing from order_payments
   where source_channel = p_source_channel and idempotency_key = p_idempotency_key;
  if found then
    if v_existing.order_id is distinct from p_order_id
       or v_existing.amount is distinct from p_amount
       or v_existing.kind is distinct from p_kind then
      raise exception 'idempotency key was already used for a different payment'
        using errcode = '22023', detail = 'idempotency_conflict';
    end if;
    select paid into v_paid from orders where id = v_existing.order_id;
    return jsonb_build_object('already', true, 'payment', to_jsonb(v_existing),
                              'payment_id', v_existing.id, 'orders_paid', v_paid);
  end if;

  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'order not found' using errcode = '42P01', detail = 'order_not_found';
  end if;

  -- Re-check after the order lock serialises two different entrances.
  select * into v_existing from order_payments
   where source_channel = p_source_channel and idempotency_key = p_idempotency_key;
  if found then
    if v_existing.order_id is distinct from p_order_id
       or v_existing.amount is distinct from p_amount
       or v_existing.kind is distinct from p_kind then
      raise exception 'idempotency key was already used for a different payment'
        using errcode = '22023', detail = 'idempotency_conflict';
    end if;
    return jsonb_build_object('already', true, 'payment', to_jsonb(v_existing),
                              'payment_id', v_existing.id, 'orders_paid', v_order.paid);
  end if;

  -- 0430: the governed manual methods (payment/MASTER.md §16) join the
  -- dictionary; an unknown word still coerces to 'other' and the original
  -- stays in source_metadata.original_method, exactly as before.
  -- 0476: the method is a KEY. payment_method_key folds spelling and the
  -- aliases (bank_transfer → bank, credit / installment → card); a method
  -- registered in Settings → Payment is accepted as itself.
  v_method := public.payment_method_key(p_method);
  if v_method is null
     or not (v_method in ('cash','bank','card','cheque','online','other',
                          'duitnow_qr','credit_card','debit_card')
             or exists (select 1 from payment_manual_methods m where m.method = v_method)) then
    v_method := 'other';
  end if;

  -- 0476: money with nowhere to land is refused before anything is written,
  -- and the refusal names the method the caller actually sent.
  select go_live_on into v_go_live from gl_config where id;
  if v_go_live is not null and p_paid_on >= v_go_live
     and public.gl_account_for_payment_method(v_method, p_source_channel) is null then
    raise exception 'payment method "%" has no money account — add it in Settings → Payment → Payment methods, then record this payment',
      coalesce(nullif(btrim(coalesce(p_method, '')), ''), 'none')
      using errcode = '22023', detail = 'payment_account_unmapped';
  end if;

  v_receipt := nullif(btrim(coalesce(p_receipt_no, '')), '');
  if v_receipt is null then
    select count(*)::integer + 1 into v_seq from order_payments where order_id = p_order_id;
    loop
      v_receipt := 'RC-' || to_char(p_paid_on, 'DDMMYY') || '-' ||
                   lpad(mod(abs(hashtext(p_order_id::text || ':' || v_seq::text)), 10000)::text, 4, '0');
      exit when not exists (select 1 from order_payments where receipt_no = v_receipt);
      v_seq := v_seq + 1;
    end loop;
  end if;

  -- 0449 — the receipt's own content, frozen here. The customer name and the
  -- SO are read ONCE, at the moment the money was recorded, so a later rename
  -- or correction can never rewrite a receipt that is already in a customer's
  -- hands. The governed method WORD is stored, not the raw input.
  -- 0476 — and the method's NAME as it read that day, so a renamed method
  -- never rewrites a printed receipt.
  v_snapshot := jsonb_build_object(
    'receipt_no', v_receipt,
    'paid_on', p_paid_on,
    'recorded_at', now(),
    'order_id', p_order_id,
    'so', v_order.so,
    'customer', jsonb_build_object('name', coalesce(v_order.customer_name, '')),
    'amount', p_amount,
    'method', v_method,
    'method_label', (select m.label from payment_manual_methods m where m.method = v_method),
    'kind', p_kind,
    'reference', nullif(btrim(coalesce(p_reference, '')), ''),
    'note', nullif(btrim(coalesce(p_note, '')), ''),
    'currency', 'MYR');

  insert into order_payments
    (order_id, amount, paid_on, method, kind, reference, note, receipt_url,
     receipt_no, recorded_by, counted_in_paid, source_channel, source_reference,
     idempotency_key, source_metadata, snapshot)
  values
    (p_order_id, p_amount, p_paid_on, v_method, p_kind, nullif(btrim(coalesce(p_reference,'')),''),
     nullif(btrim(coalesce(p_note,'')),''), nullif(btrim(coalesce(p_receipt_url,'')),''),
     v_receipt, auth.uid(), (p_kind <> 'storage' and p_counts_toward_paid),
     p_source_channel, nullif(btrim(coalesce(p_source_reference,'')),''), p_idempotency_key,
     coalesce(p_source_metadata, '{}'::jsonb) || jsonb_build_object('original_method', p_method),
     v_snapshot)
  returning * into v_row;

  if p_kind = 'storage' then
    insert into ops_order_control (order_id, storage_collected_at, storage_paid, updated_by)
    values (p_order_id, now(), 'Paid', auth.uid())
    on conflict (order_id) do update set storage_collected_at = now(), storage_paid = 'Paid',
      updated_by = auth.uid(), updated_at = now();
    v_paid := v_order.paid;
  elsif p_counts_toward_paid then
    insert into payment_allocations(payment_id, order_id, amount, allocated_by)
    values (v_row.id, p_order_id, p_amount, auth.uid());
    update orders set paid = coalesce(paid, 0) + p_amount, updated_at = now()
     where id = p_order_id returning paid into v_paid;
  else
    v_paid := v_order.paid;
  end if;

  insert into ops_activity_log(order_id, action, actor_id, detail)
  values (p_order_id, 'payment.received', auth.uid(), jsonb_build_object(
    'amount', p_amount, 'kind', p_kind, 'method', p_method, 'receipt_no', v_receipt,
    'counted_in_paid', v_row.counted_in_paid, 'payment_id', v_row.id,
    'source_channel', p_source_channel, 'source_reference', p_source_reference));

  insert into audit_log(role, actor_text, action, ref)
  values (public.app_role(), coalesce((select name from app_users where id = auth.uid()), p_source_channel),
          format('Payment recorded · RM %s · %s · %s', p_amount, p_kind, p_method), v_receipt);

  -- ── 0463 · the ledger. No exception handler, by design. ────────────────────
  -- If this raises, the payment above rolls back with it. See the header.
  v_entry := public._customer_payment_to_ledger(v_row.id);

  return jsonb_build_object('already', false, 'payment', to_jsonb(v_row),
                            'payment_id', v_row.id, 'orders_paid', v_paid,
                            'gl_entry_id', v_entry);
end;
$fn$;

comment on function public._customer_payment_post(uuid,numeric,date,text,text,text,text,text,text,text,text,text,jsonb,boolean) is
  'The ONE canonical customer-payment writer (0351; 0430 widened the method dictionary; 0449 captures the immutable receipt snapshot; 0463 posts the journal entry; 0476 accepts registered methods and refuses an unmapped one before writing). Ledger row, allocation, orders.paid, the receipt number, the snapshot and the GL entry are one transaction — if the ledger refuses, the payment rolls back with it, by design.';

revoke all on function public._customer_payment_post(uuid,numeric,date,text,text,text,text,text,text,text,text,text,jsonb,boolean) from public, anon, authenticated;


-- ── §6 · Finance's receipt door takes a method KEY ───────────────────────────
-- 0351's body; p_method's type changes (payment_method → text) and the role
-- test is coalesced so a NULL role refuses.
-- The enum sent 'bank_transfer', which the writer coerced to 'other' and the
-- ledger could not map. As text it reaches payment_method_key and lands in
-- the bank; a method registered in Settings → Payment also works here.
-- A type change needs a drop: create or replace would add an overload, and two
-- same-named functions make PostgREST refuse to choose (PGRST203).
drop function if exists public.finance_record_receipt(uuid, numeric, payment_method, text, text);

create function public.finance_record_receipt(
  p_order_id uuid, p_amount numeric, p_method text, p_reference text,
  p_idempotency_key text default null
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $fn$
begin
  -- 0476: coalesced — an unknown caller's NULL role is refused, not waved through (0448's lesson).
  if coalesce(public.app_role() not in ('finance','principal'), true) then raise exception 'forbidden' using errcode='42501'; end if;
  return public._customer_payment_post(p_order_id, p_amount, current_date, p_method, 'payment',
    'finance_ar', coalesce(nullif(p_idempotency_key,''), gen_random_uuid()::text), p_reference,
    p_reference, null, null, null, '{}'::jsonb, true);
end;
$fn$;

comment on function public.finance_record_receipt(uuid, numeric, text, text, text) is
  'Finance AR receipt door (0351; 0476 takes the method as a key, so bank_transfer lands in the bank). Writes through _customer_payment_post.';
revoke all on function public.finance_record_receipt(uuid, numeric, text, text, text) from public, anon;
grant execute on function public.finance_record_receipt(uuid, numeric, text, text, text) to authenticated;


-- ── §7 · one invoice becomes one journal entry — storage papers included ─────
-- **0466's** body. Lookups, the three quiet skips (voided · before go-live ·
-- zero), the tax and negative refusals, the goods / add-on / residual split,
-- the AR line, memos, narration and the gl_post call are unchanged for a
-- Sales Invoice. 0476 adds:
--   · a Storage / Additional Storage Invoice (kind 'storage' /
--     'additional_storage') credits the STORAGE income account with its whole
--     amount — no goods, no add-ons, no residual arithmetic;
--   · the header ③ rule, both ways: a Sales Invoice residual refuses on an
--     order in the invoice model, and a storage paper refuses while the live
--     Sales Invoice has already recognised storage.
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
  v_doc_word     text;   -- 0476
  v_credit_memo  text;   -- 0476
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

  -- 2310 SST payable ships INACTIVE (0465:258): Carres is not SST-registered,
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

  if v_inv.kind in ('storage', 'additional_storage') then
    -- ── 0476 · a storage paper is storage revenue, all of it ────────────────
    v_account := public.gl_income_account_for('STORAGE', '*');
    if v_account is null then
      raise exception 'invoice %: the storage fee has no income account — map STORAGE with gl_map_income_account',
        p_invoice_no
        using errcode = '22023', detail = 'income_account_unmapped';
    end if;

    -- ONE ORDER, ONE STORAGE MODEL (header ③). The ACTIVE entry of the
    -- order's live Sales Invoice must not already credit storage.
    if exists (
      select 1
        from invoices si
        join gl_entries e
          on e.source_type = 'SALES_INVOICE'
         and e.source_doc_no = si.invoice_no
         and e.posted and not e.reversed
        join gl_entry_lines l
          on l.entry_id = e.id
         and l.account_code = v_account
         and l.credit > 0
       where si.order_id = v_inv.order_id
         and si.kind = 'sales'
         and si.voided_at is null
    ) then
      raise exception 'storage invoice % cannot be recognised: the Sales Invoice on order #% already charges a storage fee — void and replace that Sales Invoice without the storage fee, then issue this one',
        p_invoice_no, v_order.so
        using errcode = '22023', detail = 'storage_fee_on_two_documents';
    end if;

    v_credits     := jsonb_build_object(v_account, v_amount);
    v_doc_word    := case v_inv.kind when 'storage' then 'Storage invoice'
                                     else 'Additional storage invoice' end;
    v_credit_memo := format('Storage fee on invoice %s', p_invoice_no);
  else
    -- ── the explained components ─────────────────────────────────────────────
    -- Goods: every priced line on the order, credited to the account its
    -- ORDER's source decides — ordinary sale to furniture, rental-born order to
    -- rental.
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

    -- Add-ons: one bucket per key, each key resolved on its own. An unmapped
    -- key stops the invoice and says which key.
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

    -- ── the residual ────────────────────────────────────────────────────────
    v_residual := round(v_amount - v_goods - v_addons, 2);

    if v_residual < 0 then
      raise exception 'invoice % bills RM % but its lines and add-ons come to RM % — the RM % difference is a discount, and the chart has no contra-revenue account for one',
        p_invoice_no, v_amount, round(v_goods + v_addons, 2), abs(v_residual)
        using errcode = '22023', detail = 'invoice_under_billed';
    end if;

    if v_residual > 0 then
      -- 0476 · ONE ORDER, ONE STORAGE MODEL (header ③). An order with a
      -- storage case or any storage paper ever charges storage on Storage
      -- Invoices only; its Sales Invoice may not carry a storage residual.
      if exists (select 1 from payment_storage_cases s where s.order_id = v_inv.order_id)
         or exists (select 1 from invoices x
                     where x.order_id = v_inv.order_id
                       and x.kind in ('storage', 'additional_storage')) then
        raise exception 'invoice % bills RM % more than its lines and add-ons, and order #% charges storage on Storage Invoices — issue this Sales Invoice for RM % (goods and add-ons only)',
          p_invoice_no, v_residual, v_order.so, round(v_goods + v_addons, 2)
          using errcode = '22023', detail = 'storage_fee_on_two_documents';
      end if;

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

    v_doc_word    := 'Sales invoice';
    v_credit_memo := format('Revenue on invoice %s', p_invoice_no);
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
      'memo',         case when v_inv.kind = 'sales'
                           then format('Invoice %s · order #%s', p_invoice_no, v_order.so)
                           else format('%s %s · order #%s', v_doc_word, p_invoice_no, v_order.so)
                      end
    )
  );

  for v_code in select key from jsonb_each(v_credits) order by key loop
    if round((v_credits->>v_code)::numeric, 2) <> 0 then
      v_lines := v_lines || jsonb_build_array(jsonb_build_object(
        'account_code', v_code,
        'debit',        0,
        'credit',       round((v_credits->>v_code)::numeric, 2),
        'memo',         v_credit_memo
      ));
    end if;
  end loop;

  return public.gl_post(
    'SALES_INVOICE',
    p_invoice_no,
    v_inv.issued_at,
    format('%s %s · order #%s', v_doc_word, p_invoice_no, v_order.so),
    v_lines
  );
end;
$fn$;

comment on function public._sales_invoice_to_ledger(text) is
  'Turns one issued invoice into Dr receivables / Cr income (0466). A Sales Invoice splits by what was sold; a Storage / Additional Storage Invoice credits storage income with its whole amount (0476). One order, one storage model: a storage fee is never recognised on two documents (0476). Returns null for a pre-go-live, voided or zero invoice; raises on anything it cannot attribute.';

revoke all on function public._sales_invoice_to_ledger(text) from public, anon, authenticated;


-- ── §8 · the governed issue door posts ───────────────────────────────────────
-- **0429's** body verbatim (role gate, snapshot required, draft only, the
-- INV-DDMMYY-NNNN hashed number with collision retry, the snapshot stamp, the
-- order stamp for a Sales Invoice, the history line). 0476 adds the ledger
-- call after the history line and `gl_entry_id` to the returned object —
-- additive: payment_storage_invoice reads `->'invoice'` and the API returns
-- the object as it comes. Storage papers issue here too (0438), so this one
-- call is what makes a Storage Invoice post. The role test is coalesced: a
-- caller with no account has a NULL role, and `NULL not in (…)` is NULL, which
-- an IF reads as false and waved through (0448's lesson; 0438 already does it).
create or replace function public.payment_invoice_issue(
  p_invoice_id uuid,
  p_snapshot jsonb
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_inv invoices;
  v_no text;
  v_seq integer := 1;
  v_today date := (timezone('Asia/Kuala_Lumpur', now()))::date;
  v_entry uuid;   -- 0476
begin
  if coalesce(public.app_role() not in ('operation', 'finance', 'principal'), true) then   -- 0476: coalesced
    raise exception 'forbidden' using errcode = '42501', detail = 'not_payment_staff';
  end if;
  if p_snapshot is null or p_snapshot = '{}'::jsonb then
    raise exception 'the document snapshot is required'
      using errcode = '22023', detail = 'snapshot_required';
  end if;

  select * into v_inv from invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'invoice not found' using errcode = '22023', detail = 'invoice_not_found';
  end if;
  if v_inv.status <> 'draft' then
    raise exception 'only a draft invoice can be issued'
      using errcode = '22023', detail = 'not_a_draft';
  end if;

  -- The governed document scheme: PREFIX-DDMMYY-NNNN, hashed tail, collision
  -- retry — the same arithmetic the receipt number uses (0351).
  loop
    v_no := 'INV-' || to_char(v_today, 'DDMMYY') || '-' ||
            lpad(mod(abs(hashtext(v_inv.id::text || ':' || v_seq::text)), 10000)::text, 4, '0');
    exit when not exists (select 1 from invoices where invoice_no = v_no);
    v_seq := v_seq + 1;
  end loop;

  update invoices
     set status = 'issued', invoice_no = v_no, issued_at = v_today,
         issued_by = auth.uid(),
         snapshot = p_snapshot || jsonb_build_object('invoice_no', v_no, 'issued_at', v_today)
   where id = v_inv.id
   returning * into v_inv;

  -- The order wears its live Sales Invoice number.
  if v_inv.kind = 'sales' then
    update orders set invoice_no = v_no, invoiced_at = v_today
     where id = v_inv.order_id;
  end if;

  insert into order_history (order_id, text, by_role, by_user_id)
  values (v_inv.order_id,
          format('Invoice issued · %s (RM %s)', v_no, v_inv.amount),
          public.app_role(), auth.uid());

  -- ── 0476 · every issue door posts. No exception handler: if the ledger
  -- refuses, the number, the snapshot and the order stamp roll back with it.
  v_entry := public._sales_invoice_to_ledger(v_no);

  return jsonb_build_object('invoice', to_jsonb(v_inv), 'gl_entry_id', v_entry);
end;
$fn$;

comment on function public.payment_invoice_issue(uuid, jsonb) is
  '0429: draft -> issued, once. Mints the governed INV-DDMMYY-NNNN number, stores the immutable snapshot, stamps the order. An issued invoice never changes again. 0476: posts the journal entry (Sales, Storage and Additional Storage Invoices) in the same transaction.';

revoke all on function public.payment_invoice_issue(uuid, jsonb) from public, anon;
grant execute on function public.payment_invoice_issue(uuid, jsonb) to authenticated;


-- ── §9 · the dispatch trigger posts what it issues ───────────────────────────
-- **0429's** body verbatim (DO number, adopt a live issued invoice, issue the
-- prepared draft, else insert an issued Sales Invoice with the hashed
-- DDMMYY number, history + audit). 0476 adds one ledger call on each path:
--   · adopt   — a catch-up; gl_post is idempotent, so an invoice the issue door
--               already posted returns its existing entry;
--   · issue / insert — after the audit row, like every other door.
-- It stays inline rather than calling payment_invoice_issue: this is a BEFORE
-- UPDATE trigger on `orders`, and that door updates the same order row (and
-- gates on roles a dispatcher may not hold).
create or replace function public.orders_auto_issue_on_dispatched()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_amount     numeric(12,2);
  v_invoice_no text;
  v_actor_uid  uuid;
  v_live       invoices;
  v_has_live   boolean := false;
  v_seq        integer := 1;
  v_today      date := (timezone('Asia/Kuala_Lumpur', now()))::date;
begin
  if new.operation_stage is not distinct from old.operation_stage then
    return new;
  end if;
  if new.operation_stage is distinct from 'dispatched' then
    return new;
  end if;

  v_actor_uid := (select auth.uid());

  if new.do_number is null then
    new.do_number := 'DO-' || lpad(new.so::text, 6, '0');
  end if;

  if new.invoice_no is null then
    select * into v_live from invoices
     where order_id = new.id and kind = 'sales' and status <> 'voided'
     limit 1;
    v_has_live := found;

    if v_has_live and v_live.status = 'issued' then
      -- 0429: a prepared, issued invoice already asks for this money — the
      -- order adopts its number instead of minting a duplicate document.
      new.invoice_no  := v_live.invoice_no;
      new.invoiced_at := v_live.issued_at;
      -- 0476: idempotent catch-up — returns the existing entry when the
      -- issue door already posted it.
      perform public._sales_invoice_to_ledger(v_live.invoice_no);
      return new;
    end if;

    select
      coalesce(sum(ol.qty * ol.unit_price), 0) +
      coalesce((select sum(oa.qty * oa.unit_price) from order_addons oa where oa.order_id = new.id), 0)
    into v_amount
    from order_lines ol
    where ol.order_id = new.id;

    loop
      v_invoice_no := 'INV-' || to_char(v_today, 'DDMMYY') || '-' ||
                      lpad(mod(abs(hashtext(new.id::text || ':' || v_seq::text)), 10000)::text, 4, '0');
      exit when not exists (select 1 from invoices where invoice_no = v_invoice_no);
      v_seq := v_seq + 1;
    end loop;

    if v_has_live then
      -- Issue the prepared draft at dispatch rather than inserting a twin.
      update invoices
         set status = 'issued', invoice_no = v_invoice_no, issued_at = v_today,
             issued_by = v_actor_uid,
             snapshot = coalesce(snapshot, '{}'::jsonb)
               || jsonb_build_object('invoice_no', v_invoice_no, 'issued_at', v_today,
                                     'issued_on_dispatch', true)
       where id = v_live.id;
      v_amount := v_live.amount;
    else
      insert into invoices (invoice_no, order_id, amount, tax_amount, issued_at,
                            kind, status, issued_by)
      values (v_invoice_no, new.id, v_amount, 0, v_today, 'sales', 'issued', v_actor_uid)
      on conflict (invoice_no) do nothing;
    end if;

    new.invoice_no  := v_invoice_no;
    new.invoiced_at := v_today;

    insert into order_history (order_id, text, by_role, by_user_id)
    values (new.id,
            format('Sales Invoice auto-issued on dispatch · %s (RM %s)', v_invoice_no, v_amount),
            'operation', v_actor_uid);

    insert into audit_log (role, actor_text, action, ref)
    values ('operation',
            coalesce((select name from app_users where id = v_actor_uid), 'System'),
            format('Auto-issued invoice %s on dispatch of order #%s (RM %s)',
                   v_invoice_no, new.so, v_amount),
            new.id::text);

    -- ── 0476 · revenue is recognised at dispatch too. No exception handler:
    -- if the ledger refuses, the dispatch rolls back with its invoice.
    perform public._sales_invoice_to_ledger(v_invoice_no);
  end if;

  if new.do_number is distinct from old.do_number then
    insert into order_history (order_id, text, by_role, by_user_id)
    values (new.id,
            format('Carres DO number assigned on dispatch · %s', new.do_number),
            'operation', v_actor_uid);
  end if;

  return new;
end;
$$;

comment on function public.orders_auto_issue_on_dispatched() is
  '0098 + 0429 + 0476: on dispatch, assign the DO number and make sure the order wears a live Sales Invoice — adopt an issued one, issue the prepared draft, or mint one — and post it to the ledger.';


-- ── §10 · the order drawer's Generate invoice picks up the draft ─────────────
-- Built on **0466's** body (0229's, plus the ledger step). Same signature
-- `(uuid, numeric)`, same role gate, same `for update` lock, same idempotent
-- early return, same amount rule, same audit row, same returned keys. What
-- changes, and why:
--   · the number no longer comes from INV-YYYY-{so}. That formula made a
--     prepared draft fail with 23505 on invoices_live_sales_per_order_uidx and,
--     after a void, re-inserted the very number the voided invoice wears.
--     Now: the live draft (or a new draft) is issued through
--     payment_invoice_issue — the ONE numbering authority, the hashed
--     INV-DDMMYY-NNNN that never reuses a number — which also stamps the
--     order, writes the history line and posts the entry;
--   · a live Sales Invoice the order does not wear yet is returned as already
--     issued (the same act done by another door), posted if it was not;
--   · with no caller figure and a prepared draft, the draft's amount stands.
-- The 0466 'Sales Invoice issued from Balance tab' history line is dropped:
-- payment_invoice_issue writes the one 'Invoice issued · …' line.
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
  v_order      orders;
  v_live       invoices;
  v_amount     numeric(12,2);
  v_issued     jsonb;
  v_inv        invoices;
  v_entry      uuid;
begin
  v_actor_uid := (select auth.uid());
  v_role := (select role from app_users where id = v_actor_uid);
  if not (public.is_operation() or v_role = 'finance') then
    raise exception 'Not allowed to issue invoices' using errcode = '42501';
  end if;

  -- Lock the order row so two concurrent issues can't race.
  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  -- Already issued -> return it untouched (idempotent).
  if v_order.invoice_no is not null then
    return jsonb_build_object(
      'invoice_no', v_order.invoice_no,
      'issued_at', (select issued_at from invoices where invoice_no = v_order.invoice_no),
      'amount', (select amount from invoices where invoice_no = v_order.invoice_no),
      'already_issued', true
    );
  end if;

  select * into v_live from invoices
   where order_id = p_order_id and kind = 'sales' and status <> 'voided'
   for update;

  -- 0476: another door already issued it; the order just does not wear it.
  if v_live.id is not null and v_live.status = 'issued' then
    update orders set invoice_no = v_live.invoice_no, invoiced_at = v_live.issued_at
     where id = p_order_id;
    v_entry := public._sales_invoice_to_ledger(v_live.invoice_no);
    return jsonb_build_object(
      'invoice_no', v_live.invoice_no,
      'issued_at', v_live.issued_at,
      'amount', v_live.amount,
      'already_issued', true,
      'gl_entry_id', v_entry
    );
  end if;

  -- Amount: caller figure (Balance tab total = goods + storage), else the
  -- prepared draft's (0476), else the 0098 line+addon sum (native orders).
  if p_amount is not null and p_amount >= 0 then
    v_amount := p_amount;
  elsif v_live.id is not null then
    v_amount := v_live.amount;
  else
    select
      coalesce(sum(ol.qty * ol.unit_price), 0) +
      coalesce((select sum(oa.qty * oa.unit_price) from order_addons oa
                where oa.order_id = p_order_id), 0)
    into v_amount
    from order_lines ol
    where ol.order_id = p_order_id;
  end if;

  -- The draft this act issues: the prepared one, or a new one.
  if v_live.id is not null then
    update invoices set amount = v_amount, tax_amount = 0
     where id = v_live.id
     returning * into v_live;
  else
    insert into invoices (order_id, amount, tax_amount, kind, status, created_by)
    values (p_order_id, v_amount, 0, 'sales', 'draft', v_actor_uid)
    returning * into v_live;
  end if;

  -- The ONE numbering authority. It stamps the order, writes the history line
  -- and posts the entry; no exception handler — a refusal rolls all of it back.
  v_issued := public.payment_invoice_issue(v_live.id, jsonb_build_object(
    'kind', 'sales',
    'amount', v_amount,
    'tax_amount', 0,
    'order_id', p_order_id,
    'so', 'SO-' || v_order.so,
    'customer', jsonb_build_object(
      'name', coalesce(v_order.customer_name, ''),
      'phone', v_order.customer_phone,
      'address', v_order.customer_address),
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
               'sku', ol.sku, 'qty', ol.qty, 'unit_price', coalesce(ol.unit_price, 0))
             order by ol.created_at, ol.id)
        from order_lines ol
       where ol.order_id = p_order_id), '[]'::jsonb),
    'issued_from', 'order'));
  v_inv := jsonb_populate_record(null::invoices, v_issued->'invoice');

  insert into audit_log (role, actor_text, action, ref)
  values (
    'operation',
    coalesce((select name from app_users where id = v_actor_uid), 'System'),
    format('Issued invoice %s on demand for order #%s (RM %s)', v_inv.invoice_no, v_order.so, v_amount),
    p_order_id::text
  );

  return jsonb_build_object(
    'invoice_no', v_inv.invoice_no,
    'issued_at', v_inv.issued_at,
    'amount', v_amount,
    'already_issued', false,
    'gl_entry_id', v_issued->'gl_entry_id'
  );
end;
$fn$;

comment on function public.issue_order_invoice(uuid, numeric) is
  '0229 + 0466 + 0476: the order drawer''s Generate invoice. Issues the order''s live draft (or a new one) through payment_invoice_issue — one number series, never a reused number — and returns an existing live Sales Invoice unchanged.';

revoke execute on function public.issue_order_invoice(uuid, numeric) from public, anon;
grant execute on function public.issue_order_invoice(uuid, numeric) to authenticated;



-- ── §11 · one door per act: the legacy invoice doors close ───────────────────
-- (RLS and grants — see the header.) An issued invoice is never edited; it is
-- voided and replaced through payment_invoice_void_replace, whose void fires
-- the 0466 reversal trigger. The old POST /:id/void wrote `voided_at` through
-- this policy and left the invoice `issued` and the order wearing its number.
drop policy if exists invoices_write_finance on public.invoices;
revoke insert, update, delete, truncate on public.invoices from anon, authenticated;

-- The legacy issue door (0003: INV-YYYY-dl, no snapshot, no ledger). The
-- function stays so history reads the same; nobody can call it.
revoke execute on function public.invoice_issue(uuid, numeric, numeric) from public, anon, authenticated;


-- ── §12 · the deposit taken with a new order is a payment ────────────────────
-- One helper both create wrappers call, inside their own transaction. It reads
-- the same payload keys the create RPC always read — `paid`, `payment_method`,
-- `approval_code`, `payment_slip_url` — and records the deposit through the ONE
-- writer, counted into orders.paid, on today's Kuala Lumpur date, idempotent
-- per order. RM 0 (Pay online sends 0; Stripe records its own payment later)
-- records nothing. Money with no method refuses: the ledger cannot say where
-- it landed.
create or replace function public._order_create_deposit(p_order_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_amount numeric(12,2);
  v_method text;
  v_ref    text;
begin
  v_amount := round(coalesce(nullif(btrim(coalesce(p_payload->>'paid', '')), '')::numeric, 0), 2);
  if v_amount < 0 then
    raise exception 'the amount paid cannot be negative'
      using errcode = '22023', detail = 'invalid_amount';
  end if;
  if v_amount = 0 then
    return null;
  end if;

  v_method := nullif(btrim(coalesce(p_payload->>'payment_method', '')), '');
  if v_method is null then
    raise exception 'RM % was paid with this order but no payment method was chosen — choose how the customer paid',
      v_amount
      using errcode = '22023', detail = 'deposit_method_required';
  end if;
  v_ref := nullif(btrim(coalesce(p_payload->>'approval_code', '')), '');

  return public._customer_payment_post(
    p_order_id,
    v_amount,
    (timezone('Asia/Kuala_Lumpur', now()))::date,
    v_method,
    'deposit',
    'order_create',
    'order_create:' || p_order_id::text,
    v_ref,
    v_ref,
    'Paid with the new order',
    null,
    null,
    jsonb_strip_nulls(jsonb_build_object(
      'payment_slip_url', nullif(btrim(coalesce(p_payload->>'payment_slip_url', '')), ''))),
    true);
end;
$fn$;

comment on function public._order_create_deposit(uuid, jsonb) is
  '0476: the money a customer paid when the order was created, recorded through _customer_payment_post (counted, receipt, allocation, journal entry). Called only by the two create wrappers.';
revoke all on function public._order_create_deposit(uuid, jsonb) from public, anon, authenticated;

-- The Sales Portal's final submit (0396's body). The order is born at RM 0 and
-- the deposit is recorded BEFORE the handoff, so `_sales_order_proceed` reads
-- the same orders.paid it always did.
create or replace function public.create_order_from_sales_portal(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_created jsonb;
  v_result jsonb;
  v_role app_role;
begin
  v_role := public.app_role();
  if v_role is null
     or v_role not in (
       'dealer','salesperson','showroom',
       'principal','operation','finance','bd'
     ) then
    raise exception 'forbidden: role cannot final-submit a Sales Order'
      using errcode = '42501', detail = 'forbidden';
  end if;

  -- 0476: `paid` is not written by the create; the one writer records it.
  v_created := public.create_order(payload - 'paid');
  update public.orders
     set sales_final_submitted_at = now()
   where id = (v_created->>'id')::uuid;

  -- 0476: no exception handler — a refused deposit fails the create.
  perform public._order_create_deposit((v_created->>'id')::uuid, payload);

  v_result := public._sales_order_proceed(
    (v_created->>'id')::uuid,
    false,
    v_role,
    null
  );
  return v_created || jsonb_build_object(
    'status', v_result->>'status',
    'proceeded', coalesce((v_result->>'proceeded')::boolean, false),
    'proceed_blocker', v_result->>'blocker'
  );
end;
$fn$;

revoke all on function public.create_order_from_sales_portal(jsonb)
  from public, anon;
grant execute on function public.create_order_from_sales_portal(jsonb)
  to authenticated;

-- The raw/internal door (0396's body), the same deposit rule.
create or replace function public.create_raw_order(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role app_role;
  v_created jsonb;
begin
  v_role := public.app_role();
  if v_role is null or v_role not in ('principal','operation') then
    raise exception 'forbidden: raw order creation is internal only'
      using errcode = '42501', detail = 'forbidden';
  end if;
  -- 0476: born at RM 0; the deposit is a payment, recorded by the one writer.
  v_created := public.create_order(payload - 'paid');
  perform public._order_create_deposit((v_created->>'id')::uuid, payload);
  return v_created;
end;
$fn$;

revoke all on function public.create_raw_order(jsonb)
  from public, anon;
grant execute on function public.create_raw_order(jsonb)
  to authenticated;


-- ── §13 · the reconcile reads receipts the way the ledger posts them ─────────
-- 0469's body. Two readings were stale:
--   · every live receipt credits receivables — 0463 posts each order_payments
--     row whatever its kind or `counted_in_paid` — so the operational side now
--     subtracts every live receipt on the window, not only the counted and
--     storage ones (a raw-create MIRROR row, which the API wrote before this
--     file, is a posted receipt too);
--   · `storage_recognised_uncollected` claimed 0465 skips storage receipts.
--     0463 removed that skip. The column (kept, so the shape does not change)
--     now reports storage cash on the window that has NO active journal entry
--     — zero when the writer did its job — and only that breaks comparability.
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
  if not public.gl_may_read() then
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
       and e.posted;
  end if;

  if v_go_live is not null then
    -- The operational side, on the ledger's own window.
    select round(coalesce(sum(i.amount + coalesce(i.tax_amount, 0)), 0), 2)
      into v_inv
      from invoices i
     where i.voided_at is null
       and i.issued_at >= v_go_live;

    -- 0476: every live receipt on the window — the ledger credits each one.
    select round(coalesce(sum(p.amount), 0), 2)
      into v_pay
      from order_payments p
     where p.voided_at is null
       and p.paid_on >= v_go_live;

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

    -- 0476: storage cash on the window that never reached the ledger (0463
    -- posts storage receipts like any other; this should read zero).
    select round(coalesce(sum(p.amount), 0), 2)
      into v_stor
      from order_payments p
     where p.voided_at is null
       and p.kind = 'storage'
       and p.paid_on >= v_go_live
       and not exists (
         select 1 from gl_entries e
          where e.source_type = 'CUSTOMER_PAYMENT'
            and e.source_doc_no = coalesce(nullif(btrim(coalesce(p.receipt_no, '')), ''), p.id::text)
            and e.posted and not e.reversed);

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
        'RM %s of storage receipts on or after go-live carry no journal entry, so the ledger overstates what customers owe by that amount',
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
  'Receivables: the ledger balance against invoices minus receipts on the same window (0466; 0469 counts a reversal and its contra; 0476 subtracts every live receipt and reports storage cash with no journal entry). Always one row.';


-- ── Sanity ───────────────────────────────────────────────────────────────────
-- Signatures by argument TYPES (oidvectortypes), never names. Behaviour by
-- body markers. No row counts: the resolver checks ask that each method lands
-- in SOME money account, not which one — the exact accounts are the probe's.
do $sanity$
declare
  v_src  text;
  v_m    text;
  v_acct text;
  v_ch   text;
begin
  -- the resolver keeps its signature (Build D calls it)
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'gl_account_for_payment_method'
     and oidvectortypes(p.proargtypes) = 'text, text';
  if v_src is null or v_src !~ 'payment_method_key' then
    raise exception '0476 sanity: gl_account_for_payment_method(text, text) is missing or does not read the key';
  end if;

  -- every seeded method, and the aliases, land in a money account
  foreach v_m in array array['bank','bank_transfer','cash','cheque','card','credit','installment',
                             'duitnow_qr','credit_card','debit_card','online'] loop
    v_acct := public.gl_account_for_payment_method(v_m, null);
    if v_acct is null or not public.gl_money_account_ok(v_acct) then
      raise exception '0476 sanity: method % resolves to %, not a money account', v_m, coalesce(v_acct, 'nothing');
    end if;
  end loop;
  v_ch := public.gl_account_for_payment_method('online', 'stripe_checkout');
  if v_ch is null or not public.gl_money_account_ok(v_ch) then
    raise exception '0476 sanity: online/stripe_checkout resolves to %, not a money account', coalesce(v_ch, 'nothing');
  end if;

  -- every registry row has a money account
  if exists (select 1 from payment_manual_methods m
              where not public.gl_money_account_ok(public.gl_account_for_payment_method(m.method, null))) then
    raise exception '0476 sanity: a registered payment method has no money account';
  end if;

  -- the writer accepts registry keys and refuses an unmapped method before writing
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = '_customer_payment_post'
     and oidvectortypes(p.proargtypes) =
         'uuid, numeric, date, text, text, text, text, text, text, text, text, text, jsonb, boolean';
  if v_src is null or v_src !~ 'payment_manual_methods' or v_src !~ 'payment_account_unmapped'
     or v_src !~ '_customer_payment_to_ledger' then
    raise exception '0476 sanity: _customer_payment_post is missing its registry read, its refusal or its ledger step';
  end if;

  -- finance_record_receipt takes text, and the enum overload is gone
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'finance_record_receipt'
                    and oidvectortypes(p.proargtypes) = 'uuid, numeric, text, text, text') then
    raise exception '0476 sanity: finance_record_receipt(uuid, numeric, text, text, text) is missing';
  end if;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'finance_record_receipt') <> 1 then
    raise exception '0476 sanity: finance_record_receipt has more than one overload';
  end if;

  -- every invoice door posts
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = '_sales_invoice_to_ledger'
     and oidvectortypes(p.proargtypes) = 'text';
  if v_src is null or v_src !~ 'additional_storage' or v_src !~ 'storage_fee_on_two_documents' then
    raise exception '0476 sanity: _sales_invoice_to_ledger does not know storage papers';
  end if;
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'payment_invoice_issue'
     and oidvectortypes(p.proargtypes) = 'uuid, jsonb';
  if v_src is null or v_src !~ '_sales_invoice_to_ledger' then
    raise exception '0476 sanity: payment_invoice_issue does not post';
  end if;
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'orders_auto_issue_on_dispatched';
  if v_src is null or (length(v_src) - length(replace(v_src, '_sales_invoice_to_ledger', '')))
                       / length('_sales_invoice_to_ledger') < 2 then
    raise exception '0476 sanity: the dispatch trigger does not post on both of its paths';
  end if;
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'issue_order_invoice'
     and oidvectortypes(p.proargtypes) = 'uuid, numeric';
  if v_src is null or v_src !~ 'payment_invoice_issue' or v_src ~ 'INV-' then
    raise exception '0476 sanity: issue_order_invoice still mints its own number';
  end if;

  -- the legacy doors are closed
  if exists (select 1 from pg_policy where polrelid = 'public.invoices'::regclass
                                       and polname = 'invoices_write_finance') then
    raise exception '0476 sanity: invoices_write_finance still exists';
  end if;
  if has_table_privilege('authenticated', 'public.invoices', 'UPDATE')
     or has_table_privilege('authenticated', 'public.invoices', 'INSERT') then
    raise exception '0476 sanity: authenticated can still write invoices';
  end if;
  if has_function_privilege('authenticated', 'public.invoice_issue(uuid, numeric, numeric)', 'EXECUTE')
     or has_function_privilege('anon', 'public.invoice_issue(uuid, numeric, numeric)', 'EXECUTE') then
    raise exception '0476 sanity: the legacy invoice_issue is still callable';
  end if;

  -- the deposit rides the writer on both create doors
  foreach v_m in array array['create_order_from_sales_portal', 'create_raw_order'] loop
    select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = v_m and oidvectortypes(p.proargtypes) = 'jsonb';
    if v_src is null or v_src !~ '_order_create_deposit' or v_src !~ 'payload - ''paid''' then
      raise exception '0476 sanity: % does not record its deposit through the writer', v_m;
    end if;
  end loop;
  if has_function_privilege('authenticated', 'public._order_create_deposit(uuid, jsonb)', 'EXECUTE') then
    raise exception '0476 sanity: _order_create_deposit is callable from the API';
  end if;

  -- the reconcile no longer reads the 0465 skip
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'gl_receivables_reconcile';
  if v_src is null or v_src ~ '0465 skips' or v_src !~ 'CUSTOMER_PAYMENT' then
    raise exception '0476 sanity: gl_receivables_reconcile still reports the 0465 storage skip';
  end if;

  -- the registry has names, and the engine is still closed to the API (0468)
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'payment_manual_methods'
                and column_name = 'label' and is_nullable = 'YES') then
    raise exception '0476 sanity: payment_manual_methods.label may be null';
  end if;
  if has_function_privilege('authenticated', 'public.gl_money_account_ok(text)', 'EXECUTE') then
    raise exception '0476 sanity: gl_money_account_ok is callable from the API';
  end if;
end;
$sanity$;
