-- 0325 · A ready date the factory gives MOVES the expected arrival — and never
--        overwrites the history (Slice 1, approved by Loo 2026-08-06).
--
-- The MASTER's §4 Approved Evolution, verbatim rule: "recording a ready date
-- writes a new expected arrival of `ready date + transit working days on the
-- OFFICE week` (Law 2A), and the new date becomes the one the register shows."
-- A supplier with no transit number gets NO new arrival rather than a guessed
-- one (P1).
--
-- THE ARITHMETIC IS NOT HERE, deliberately. `arrivalFromReadyDate`
-- (packages/shared/src/purchasing-settings.ts) is the ONE spelling of
-- `ready + transit`, shared with `expectedArrivalOf` — a plpgsql working-day
-- walk would be the second spelling Law D forbids. The API route computes the
-- new arrival with the shared function and hands it in as `p_new_eta`; this
-- RPC only RECORDS it, in the same transaction as the promise row.
--
-- `p_new_eta` is nullable: null = "no transit number, so no new arrival" —
-- the ready date still records, exactly as before this migration.
--
-- SIGNATURE NOTE. Adding a defaulted parameter via `create or replace` would
-- OVERLOAD the function (two live signatures, one of them ungoverned), so the
-- old 3-arg signature is dropped and the 4-arg one created and granted fresh.

drop function if exists public.purchasing_record_ready_date(text, date, text);

create function public.purchasing_record_ready_date(
  p_po_id    text,
  p_new_date date,
  p_reason   text default null,
  p_new_eta  date default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid      uuid;
  v_po       purchase_orders;
  v_prev     date;
  v_prev_eta date;
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

  v_prev     := v_po.expected_ready_date;
  v_prev_eta := v_po.eta_date;

  -- Append, never overwrite. §3's "every promise is kept" is STRUCTURAL here
  -- because this table has no date column anybody can update.
  insert into po_supplier_promises
    (po_id, kind, answer, about_date, previous_date, new_date, reason, recorded_by)
  values
    (p_po_id, 'ready_date', 'ready_date', v_prev, v_prev, p_new_date,
     nullif(btrim(coalesce(p_reason, '')), ''), v_uid);

  -- The columns carry the CURRENT answers, so a screen drawing one cell does
  -- not have to read a ledger. The ledger + po_history stay the history:
  -- the previous arrival is never destroyed, it is written into the sentence
  -- below (Loo's condition — "show original and new date").
  update purchase_orders
     set expected_ready_date = p_new_date,
         eta_date            = coalesce(p_new_eta, eta_date),
         updated_at          = now()
   where id = p_po_id;

  insert into po_history (po_id, text, by_role, by_user_id)
  values (p_po_id,
          format('Supplier ready date %s -> %s',
                 coalesce(v_prev::text, '-'), p_new_date::text)
          || case
               when p_new_eta is not null and p_new_eta is distinct from v_prev_eta
               then format(' · expected arrival %s -> %s (ready date + transit)',
                           coalesce(v_prev_eta::text, '-'), p_new_eta::text)
               else ''
             end,
          public.app_role(), v_uid);

  return jsonb_build_object(
    'po_id', p_po_id, 'previous_date', v_prev, 'new_date', p_new_date,
    'previous_eta', v_prev_eta, 'new_eta', coalesce(p_new_eta, v_prev_eta));
end;
$fn$;

revoke all on function public.purchasing_record_ready_date(text, date, text, date) from public;
revoke all on function public.purchasing_record_ready_date(text, date, text, date) from anon;
grant execute on function public.purchasing_record_ready_date(text, date, text, date) to authenticated;

-- ---------------------------------------------------------------------------
-- Sanity — ABORT rather than ship a lie
-- ---------------------------------------------------------------------------
do $$
declare
  v_n int;
begin
  -- the old 3-arg signature is GONE (no ungoverned overload survives)
  select count(*) into v_n
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'purchasing_record_ready_date';
  if v_n <> 1 then
    raise exception 'SANITY: expected exactly 1 purchasing_record_ready_date, found %', v_n;
  end if;

  -- still exactly ONE function writes expected_ready_date (0318's own guard)
  select count(*) into v_n
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosrc like '%expected_ready_date =%';
  if v_n <> 1 then
    raise exception 'SANITY: expected exactly 1 writer of expected_ready_date, found %', v_n;
  end if;
end $$;
