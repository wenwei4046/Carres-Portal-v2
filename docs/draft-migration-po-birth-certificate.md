# DRAFT migration — the PO's birth certificate

> **DRAFT. Not in `supabase/migrations/` on purpose** (guardrail #8: a draft
> lives in chat or `docs/` until it is approved). **Number it from the TRACKER
> at apply time, never from `ls supabase/migrations`** — the live tail has been
> ahead of the repo before (0301/0302). The name below assumes 0308; change it
> to whatever the tracker says.
>
> **Order of operations: apply and verify FIRST, then merge, then deploy.**
> Shipping code whose column does not exist 500s the whole Purchasing page.

## What it is for

Approved 2026-08-03: a purchase order must be born carrying what the rest of
the module needs to read. Three effects, one migration:

| | Effect | Why the module needs it |
|---|---|---|
| ① | `transit_days`, per supplier | so the engine can compute an expected arrival at all |
| ② | the promise ledger accepts `ready_date` | so `Confirm ready date` has somewhere to be recorded |
| ③ | a write door for the supplier's promised ready date | the action has had **no** button since it was written |

**The measured fact that makes ② and ③ urgent.** `purchasing_record_tomorrow_delivery`
(0306, already shipped) raises `no_expected_arrival` when `purchase_orders.eta_date`
is NULL — and nothing in the portal has ever written `eta_date` on a purchase order
created from To Order. So P3's call, which is *built and deployed*, can never open.
① is what turns it on.

## The design decision this migration encodes

`purchase_orders` carries two date columns and they mean opposite things. They
are never merged and the engine may never write the second one:

```
eta_date             OUR prediction   — engine, stamped at Issue, then frozen
expected_ready_date  THEIR promise    — a human, only after the supplier answers
```

Reason: `expected_ready_date` is what R5's supplier scorecard measures a factory
by. If the engine seeds it with our own estimate, the scorecard grades the
factory on a number the factory never gave — and nothing on screen would say so.
An empty `expected_ready_date` is not missing data; it is the trigger of
`Confirm ready date` (`PURCHASING-WORKING-FLOW.md` §3: *"Trigger — the ready
date is missing"*).

**A sent PO is never re-computed** (§2). `eta_date` is stamped once, at Issue,
and a later Settings edit does not move it.

## ① Transit days — the eighth number

It goes on `purchasing_supplier_settings` (0303), which is already the
per-supplier table. **No new table.**

```sql
alter table public.purchasing_supplier_settings
  add column if not exists transit_days int not null default 1
    check (transit_days between 0 and 60);

comment on column public.purchasing_supplier_settings.transit_days is
  'WORKING days between the supplier finishing production and the goods reaching the destination. Seeded 1 for every supplier (both factories are local — Nice Future is collected by NETS, Ohana delivers). It is a SETTING because P1 proved a hard-coded purchasing number is how a setting silently stops mattering.';
```

Every existing row takes 1 from the default, so nothing has to be seeded and
nothing moves on apply.

### The setter — a copy of `purchasing_set_supplier_work_week`

Same gate, same audit, same shape. Nothing new is invented.

```sql
create or replace function public.purchasing_set_supplier_transit_days(
  p_supplier_id uuid,
  p_days        int
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role text := (select public.purchasing_settings_gate());
  v_old  int;
  v_name text;
begin
  if p_supplier_id is null then
    raise exception 'supplier_required' using errcode = '22023';
  end if;
  if p_days is null or p_days < 0 or p_days > 60 then
    raise exception 'transit_days_out_of_range' using errcode = '22023';
  end if;
  if not exists (select 1 from suppliers where id = p_supplier_id) then
    raise exception 'unknown_supplier' using errcode = '22023';
  end if;

  select transit_days into v_old
    from purchasing_supplier_settings where supplier_id = p_supplier_id;
  select name into v_name from suppliers where id = p_supplier_id;

  insert into purchasing_supplier_settings (supplier_id, transit_days, updated_by, updated_at)
  values (p_supplier_id, p_days, auth.uid(), now())
  on conflict (supplier_id) do update
    set transit_days = excluded.transit_days,
        updated_by   = excluded.updated_by,
        updated_at   = now();

  perform purchasing_record_change(
    v_role, 'supplier_transit_days', p_supplier_id, null,
    v_old::text, p_days::text,
    format('Purchasing setting · %s transit days %s -> %s',
           v_name, coalesce(v_old::text, '-'), p_days::text));
end;
$function$;
```

## ② The promise ledger takes a third kind

0306 froze two kinds. The third was predicted by the P5 card itself: *"the
`kind` takes a third value and the RPC is a copy of
`purchasing_record_tomorrow_delivery`."*

The two column checks are inline and therefore auto-named
`po_supplier_promises_kind_check` / `_answer_check`. They are dropped by name
and replaced by NAMED constraints, so the next chat can find them.

```sql
alter table public.po_supplier_promises
  drop constraint if exists po_supplier_promises_kind_check,
  drop constraint if exists po_supplier_promises_answer_check,
  drop constraint if exists po_promise_kind_answer,
  drop constraint if exists po_promise_scope;

alter table public.po_supplier_promises
  add constraint po_promise_kind_allowed check (
    kind in ('tomorrow_delivery','balance_delivery','ready_date')),
  add constraint po_promise_answer_allowed check (
    answer in ('shipping','delayed','balance_date','ready_date')),
  -- Each kind may only carry its own answers (0306's rule, extended).
  add constraint po_promise_kind_answer check (
    (kind = 'tomorrow_delivery' and answer in ('shipping','delayed')) or
    (kind = 'balance_delivery'  and answer = 'balance_date') or
    (kind = 'ready_date'        and answer = 'ready_date')),
  -- A PO-level answer names no line; a line answer names the line and the
  -- quantity it was about. `ready_date` is PO-level, and its about_date may be
  -- NULL because the FIRST answer is about no previous date at all — that is
  -- the state the action exists to end.
  add constraint po_promise_scope check (
    (kind = 'tomorrow_delivery' and po_line_id is null
       and about_date is not null and about_qty is null) or
    (kind = 'balance_delivery'  and po_line_id is not null
       and about_qty  is not null) or
    (kind = 'ready_date'        and po_line_id is null
       and about_qty  is null));
```

`po_promise_new_date_required` is untouched and already covers `ready_date`:
the answer is not `shipping`, so `new_date` must be present.

## ③ The write door

```sql
create or replace function public.purchasing_record_ready_date(
  p_po_id    text,
  p_new_date date,
  p_reason   text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid  uuid;
  v_po   purchase_orders;
  v_prev date;
begin
  perform public.purchasing_supplier_call_gate();
  v_uid := auth.uid();

  if p_po_id is null or p_new_date is null then
    raise exception 'p_po_id and p_new_date are required'
      using errcode = '22023', detail = 'invalid_input';
  end if;

  select * into v_po from purchase_orders where id = p_po_id for update;
  if not found then
    raise exception 'PO % not found', p_po_id
      using errcode = '42P01', detail = 'po_not_found';
  end if;
  if v_po.status <> 'open' then
    raise exception 'PO % is %', p_po_id, v_po.status
      using errcode = 'P0001', detail = 'po_not_open';
  end if;

  v_prev := v_po.expected_ready_date;

  -- Append, never overwrite: §3's "every promise is kept" is structural
  -- because there is no date column in this table anybody can update.
  insert into po_supplier_promises
    (po_id, kind, answer, about_date, previous_date, new_date, reason, recorded_by)
  values
    (p_po_id, 'ready_date', 'ready_date', v_prev, v_prev, p_new_date,
     nullif(btrim(coalesce(p_reason, '')), ''), v_uid);

  -- The column is the CURRENT answer, for a screen that must not read a
  -- ledger to draw one cell. The ledger stays the history.
  update purchase_orders
     set expected_ready_date = p_new_date, updated_at = now()
   where id = p_po_id;

  insert into po_history (po_id, text, by_role, by_user_id)
  values (p_po_id,
          format('Supplier ready date %s -> %s',
                 coalesce(v_prev::text, '-'), p_new_date::text),
          public.app_role(), v_uid);

  return jsonb_build_object(
    'po_id', p_po_id, 'previous_date', v_prev, 'new_date', p_new_date);
end;
$fn$;
```

## Grants — both directions, or they prove nothing

```sql
revoke all on function public.purchasing_set_supplier_transit_days(uuid, int) from public;
revoke all on function public.purchasing_set_supplier_transit_days(uuid, int) from anon;
revoke all on function public.purchasing_record_ready_date(text, date, text) from public;
revoke all on function public.purchasing_record_ready_date(text, date, text) from anon;

grant execute on function public.purchasing_set_supplier_transit_days(uuid, int) to authenticated;
grant execute on function public.purchasing_record_ready_date(text, date, text) to authenticated;
```

## Sanity block — fails the migration rather than shipping a lie

```sql
do $$
declare v_n int;
begin
  -- the column exists on every supplier row, defaulted, nothing NULL
  select count(*) into v_n from purchasing_supplier_settings where transit_days is null;
  if v_n > 0 then raise exception 'transit_days left % NULL rows', v_n; end if;

  -- exactly ONE function may write expected_ready_date
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosrc like '%expected_ready_date =%';
  if v_n <> 1 then
    raise exception 'expected exactly 1 writer of expected_ready_date, found %', v_n;
  end if;

  -- the third kind is accepted and a fourth is not
  begin
    insert into po_supplier_promises (po_id, kind, answer, new_date)
    values ('__sanity__', 'ready_date', 'ready_date', current_date);
    raise exception 'sanity: the FK should have refused an unknown po_id';
  exception when foreign_key_violation then
    null;  -- correct: the kind/answer/scope checks passed, the FK stopped it
  end;
end $$;
```

## Verify after apply (before merging any code)

```
1 column · defaulted 1 · 0 NULL
4 named constraints on po_supplier_promises, 0 auto-named leftovers
2 new functions, md5(prosrc) + length reconciled BYTE-IDENTICAL to this file
anon EXECUTE = false on both; authenticated = true
0 purchase_orders touched (no backfill — every row is test data)
```

**No backfill, on purpose.** Nothing can be stamped for a purchase order nobody
issued through the new path, and an `eta_date` invented for an old PO would be a
guess presented as a measurement.

## What the application code does after this lands (no migration)

- `to-order.ts` `POST /issue` stamps `eta_date` in the same UPDATE that already
  sets `destination_id`:
  `eta = addWorkingDays(today, productionDays, {offDays: supplierWeek, holidays})`
  then `addWorkingDays(that, transitDays, {offDays: [0,6], holidays})` — the make
  leg counts on the FACTORY's week, the transit leg on the OFFICE week (Law 2A).
- the same route writes one `po_history` line naming who issued it and how many
  builds.
- `Confirm ready date` gets its button, calling `purchasing_record_ready_date`.
