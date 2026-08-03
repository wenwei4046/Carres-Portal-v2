-- ============================================================================
-- DRAFT 0310 — the supplier-date door  (Jess, 2026-08-02)
--
-- GUARDRAIL 8: this file lives in docs/ and is NOT a migration until Jess
-- approves it. Tracker tail read 2026-08-02 = 0309_purchase_requests_proof,
-- so the applied number is 0310. (The repo's supabase/migrations tail is
-- 0307 — prod is AHEAD by two files a parallel lane holds; that is the
-- harmless direction and why the number comes off the TRACKER, never `ls`.)
--
-- WHY. Jess's supplier-date cycle (2026-08-02) needs ONE door for two
-- situations that are the same act:
--   A · the supplier tells us early  → key the new date + reason
--   B · nobody told us, the date passed → phone, then key the new date
-- 0306 already serves B. It refuses A's FIRST confirmation, because it reads
-- the date the call was ABOUT off `purchase_orders.eta_date` and raises
-- `no_expected_arrival` when that is null — which is every one of today's 19
-- live POs. Without this, `Waiting for Goods` can never stop being 0.
--
-- WHAT. Two things, both additive:
--   1 · `remarks` on the ledger — Reason is the countable CATEGORY, Remarks
--       is the free-text story. Two fields, never folded: a category that
--       swallows prose cannot be counted, and prose squeezed into a category
--       stops being true.
--   2 · the RPC gains `p_remarks` and a FIRST-CONFIRM branch: when the PO
--       holds no date yet, `shipping` may carry `p_new_date` and that date
--       becomes what the answer is ABOUT.
--
-- RULE 8 (guardrails): adding a DEFAULTED parameter to a live RPC mints a
-- SECOND signature. The old 4-arg form is DROPPED first and the sanity block
-- asserts exactly one survives.
-- ============================================================================

-- ── 1 · the free-text half of an answer ─────────────────────────────────────
alter table public.po_supplier_promises
  add column if not exists remarks text;

comment on column public.po_supplier_promises.remarks is
  'Free-text story beside the countable `reason` category (Jess 2026-08-02). Reason is picked from a locked list so a year can be counted; remarks is what actually happened. Never folded into one field.';

-- ── 2 · one door, two situations ────────────────────────────────────────────
drop function if exists public.purchasing_record_tomorrow_delivery(text, text, date, text);

create function public.purchasing_record_tomorrow_delivery(
  p_po_id    text,
  p_answer   text,
  p_new_date date default null,
  p_reason   text default null,
  p_remarks  text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role    app_role;
  v_uid     uuid;
  v_actor   text;
  v_po      purchase_orders;
  v_answer  text;
  v_about   date;
  v_first   boolean := false;
  v_touched int := 0;
  v_sup     text;
begin
  v_role := public.purchasing_supplier_call_gate();
  v_uid  := auth.uid();

  v_answer := nullif(btrim(coalesce(p_answer, '')), '');
  if p_po_id is null or v_answer is null or v_answer not in ('shipping','delayed') then
    raise exception 'p_po_id and p_answer (shipping|delayed) are required'
      using errcode = '22023', detail = 'invalid_input';
  end if;
  if v_answer = 'delayed' and p_new_date is null then
    raise exception 'a delayed answer must carry the new date'
      using errcode = '22023', detail = 'new_date_required';
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

  -- The date this answer is ABOUT. A PO that holds no date yet is situation A:
  -- the supplier is naming its FIRST date, so the date given IS the subject.
  -- A `delayed` answer cannot be first — there is nothing it could delay.
  v_about := v_po.eta_date;
  if v_about is null then
    if v_answer <> 'shipping' or p_new_date is null then
      raise exception 'PO % has no date yet — the first answer must be a date the supplier gave', p_po_id
        using errcode = 'P0001', detail = 'first_date_required';
    end if;
    v_first := true;
    v_about := p_new_date;
  end if;

  insert into po_supplier_promises
    (po_id, kind, answer, about_date, previous_date, new_date, reason, remarks, recorded_by)
  values
    (p_po_id, 'tomorrow_delivery', v_answer, v_about,
     -- Nothing was held before a FIRST date, so there is no previous date to
     -- name. Inventing one would read as a change that never happened.
     case when v_first then null else v_about end,
     case when v_answer = 'delayed' then p_new_date else null end,
     nullif(btrim(coalesce(p_reason, '')), ''),
     nullif(btrim(coalesce(p_remarks, '')), ''), v_uid);

  if v_answer = 'delayed' or v_first then
    -- The expected arrival is the thing that moved (or was set for the first
    -- time). Writing it re-opens the call under the new date by itself, which
    -- is the loop §3 describes; the push is what reaches Delay planning.
    update purchase_orders
       set eta_date = case when v_first then p_new_date else p_new_date end,
           updated_at = now()
     where id = p_po_id;
    v_touched := public.purchasing_push_supplier_date(p_po_id, p_new_date, null);
  end if;

  v_sup   := coalesce((select name from suppliers where id = v_po.supplier_id), 'supplier');
  v_actor := coalesce((select name from app_users where id = v_uid), initcap(v_role::text));

  insert into po_history (po_id, text, by_role)
  values (p_po_id,
          case
            when v_first then format('%s gave the delivery date %s%s', v_sup, v_about,
                           coalesce(' — ' || nullif(btrim(coalesce(p_remarks,'')),''), ''))
            when v_answer = 'shipping'
               then format('%s confirmed the delivery for %s', v_sup, v_about)
               else format('%s moved the delivery from %s to %s%s',
                           v_sup, v_about, p_new_date,
                           coalesce(' — ' || nullif(btrim(coalesce(p_reason,'')),''), ''))
          end,
          v_role);

  insert into audit_log (role, actor_text, action, ref)
  values (v_role, v_actor,
          format('PO %s — tomorrow''s delivery: %s', p_po_id,
                 case when v_first then 'first date' else v_answer end), p_po_id);

  return jsonb_build_object(
    'po_id',          p_po_id,
    'answer',         v_answer,
    'first',          v_first,
    'about_date',     v_about,
    'new_date',       p_new_date,
    'orders_touched', v_touched
  );
end;
$fn$;

-- Both directions, per the guardrail: `revoke … from public` alone does NOT
-- drop `anon` on Supabase, and neither implies the grant back.
revoke execute on function public.purchasing_record_tomorrow_delivery(text, text, date, text, text) from public;
revoke execute on function public.purchasing_record_tomorrow_delivery(text, text, date, text, text) from anon;
grant  execute on function public.purchasing_record_tomorrow_delivery(text, text, date, text, text) to authenticated;

-- ── 3 · sanity — exactly ONE signature survives ─────────────────────────────
do $sanity$
declare
  v_n int;
begin
  select count(*) into v_n
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'purchasing_record_tomorrow_delivery';
  if v_n <> 1 then
    raise exception '0310: expected exactly 1 purchasing_record_tomorrow_delivery, found %', v_n;
  end if;
end;
$sanity$;
