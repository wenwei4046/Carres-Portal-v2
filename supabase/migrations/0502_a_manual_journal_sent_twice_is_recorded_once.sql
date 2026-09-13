-- 0502 · A manual journal sent twice is recorded once.
--
-- `gl_manual_journal` (0462) had no request key. When the answer to a
-- principal's press did not come back (the API's 503 `outcome_unknown`), the
-- entry might already stand, and a second press posted a second entry. The
-- form could only say "check the Journal before you record it again".
--
-- This adds a four-argument overload that takes a request key:
--
--   gl_manual_journal(p_entry_date, p_narration, p_lines, p_request_key uuid)
--
--   * The same key with the same details returns the SAME entry id and posts
--     nothing new (the 0478 other_receipt_create / 0485 money-back pattern: an
--     advisory lock on the key queues a second call behind the first).
--   * The same key with a different date, narration, lines or principal is
--     refused with P0001, DETAIL `idempotency_mismatch` — never answered with
--     an entry that is not what the person typed.
--   * A null key behaves exactly as 0462 did: every call is a new entry.
--
-- The overload has NO default on the key, on purpose. A defaulted fourth
-- argument would make a three-argument call ambiguous between the two
-- functions. PostgREST picks a function by its argument names, so the API's
-- keyed call reaches only this overload, and its unkeyed call only the old one.
-- That is what lets the API ship before this file is applied: until then the
-- keyed call is answered PGRST202 (not found) and the API falls back to the
-- three-argument call.
--
-- The three-argument function keeps its signature and its grants and now hands
-- over to the four-argument one with a null key, so the principal-only gate,
-- the control-account refusal and the rest of the body live in ONE place.
--
-- Where the key lives: its own table, `gl_manual_journal_requests`, keyed by the
-- request key and pointing at the entry. `gl_entries` is not altered: the
-- ledger's own tables stay exactly as 0462 left them.
--
-- Safe to run twice: `if not exists`, `create or replace`, and revokes/grants
-- that repeat to the same state. No row is written, removed or counted.

-- ── 1 · the requests a manual journal has already answered ───────────────────
create table if not exists public.gl_manual_journal_requests (
  request_key uuid primary key,
  entry_id    uuid not null references public.gl_entries(id),
  entry_date  date not null,
  narration   text not null,
  lines       jsonb not null,
  created_by  uuid,
  created_at  timestamptz not null default now()
);

comment on table public.gl_manual_journal_requests is
  '0502: one row per keyed gl_manual_journal call that posted. A resend with the same key and details returns entry_id; different details are refused (idempotency_mismatch). Written only by gl_manual_journal; no direct door.';

-- Written and read only by the definer function. No policy, no grant.
alter table public.gl_manual_journal_requests enable row level security;
revoke all on public.gl_manual_journal_requests from public, anon, authenticated;

-- ── 2 · the keyed manual journal — principal only (ruling M) ─────────────────
-- The body is 0462's, with the key check in front and the key written after.
create or replace function public.gl_manual_journal(
  p_entry_date  date,
  p_narration   text,
  p_lines       jsonb,
  p_request_key uuid
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role    app_role;
  v_uid     uuid;
  v_elem    jsonb;
  v_idx     int := 0;
  v_code    text;
  v_control boolean;
  v_doc_no  text;
  v_id      uuid;
  v_seen    public.gl_manual_journal_requests%rowtype;
  v_seen_no text;
begin
  v_role := public.app_role();
  if not coalesce(public.is_principal(), false) then
    raise exception 'gl_manual_journal refused: role % may not raise a manual journal — principal only', coalesce(v_role::text,'none')
      using errcode = '42501', detail = 'gl_manual_journal_forbidden';
  end if;
  v_uid := auth.uid();

  -- A resend carries the same key. The lock queues it behind the first call,
  -- and it then finds what the first call recorded.
  if p_request_key is not null then
    perform pg_advisory_xact_lock(hashtextextended('gl_manual_journal:' || p_request_key::text, 0));
    select r.* into v_seen from public.gl_manual_journal_requests r
     where r.request_key = p_request_key;
    if found then
      -- The same key must carry the same entry. A key sent again with another
      -- date, narration or lines is not a resend: say so, and never hand back
      -- an entry that is not what the person typed.
      if v_seen.entry_date is distinct from p_entry_date
         or v_seen.narration is distinct from btrim(coalesce(p_narration, ''))
         or v_seen.lines is distinct from p_lines
         or v_seen.created_by is distinct from v_uid then
        select e.entry_no into v_seen_no from public.gl_entries e where e.id = v_seen.entry_id;
        raise exception 'gl_manual_journal refused: this request was already recorded as % with different details', coalesce(v_seen_no, v_seen.entry_id::text)
          using errcode = 'P0001', detail = 'idempotency_mismatch';
      end if;
      return v_seen.entry_id;
    end if;
  end if;

  if p_entry_date is null then
    raise exception 'gl_manual_journal refused: entry_date is required — a blank date is never replaced with today'
      using errcode = '22023', detail = 'gl_manual_journal_entry_date_null';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'gl_manual_journal refused: p_lines must be a JSON array, got %', coalesce(jsonb_typeof(p_lines),'null')
      using errcode = '22023', detail = 'gl_manual_journal_lines_not_array';
  end if;
  if nullif(btrim(coalesce(p_narration,'')), '') is null then
    raise exception 'gl_manual_journal refused: a narration is required — a manual journal with no explanation is unauditable'
      using errcode = '22023', detail = 'gl_manual_journal_narration_blank';
  end if;

  -- Control accounts belong to their subsidiary documents, not to a keyboard.
  for v_elem in select value from jsonb_array_elements(p_lines) loop
    v_idx := v_idx + 1;
    if jsonb_typeof(v_elem) <> 'object' then
      raise exception 'gl_manual_journal refused: line % is a %, expected an object', v_idx, jsonb_typeof(v_elem)
        using errcode = '22023', detail = 'gl_manual_journal_line_not_object';
    end if;
    v_code := btrim(coalesce(v_elem->>'account_code',''));
    select a.is_control into v_control from public.gl_accounts a where a.code = v_code;
    if found and v_control then
      raise exception 'gl_manual_journal refused: line % names control account % — AR and AP move only through their own documents', v_idx, v_code
        using errcode = '22023', detail = 'gl_manual_journal_control_account';
    end if;
  end loop;

  v_doc_no := public.gl_next_doc_no('MJ', p_entry_date);

  v_id := public.gl_post('MANUAL', v_doc_no, p_entry_date, p_narration, p_lines);

  insert into audit_log (role, actor_text, action, ref)
  values (v_role,
          (select name from app_users where id = v_uid),
          format('Manual journal posted · %s · %s', v_doc_no, btrim(p_narration)),
          v_doc_no);

  if p_request_key is not null then
    insert into public.gl_manual_journal_requests
      (request_key, entry_id, entry_date, narration, lines, created_by)
    values
      (p_request_key, v_id, p_entry_date, btrim(p_narration), p_lines, v_uid);
  end if;

  return v_id;
end;
$fn$;

revoke all on function public.gl_manual_journal(date,text,jsonb,uuid) from public;
revoke all on function public.gl_manual_journal(date,text,jsonb,uuid) from anon;
grant execute on function public.gl_manual_journal(date,text,jsonb,uuid) to authenticated;

comment on function public.gl_manual_journal(date,text,jsonb,uuid) is
  '0502: principal-only journal with no upstream document (ruling M), keyed. The same p_request_key with the same details returns the first entry id and posts nothing; different details raise P0001 idempotency_mismatch. A null key posts every time. Refuses any line on a control account. Delegates to gl_post as MANUAL.';

-- ── 3 · the three-argument call — unchanged for its callers ──────────────────
create or replace function public.gl_manual_journal(
  p_entry_date date,
  p_narration  text,
  p_lines      jsonb
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  return public.gl_manual_journal(p_entry_date, p_narration, p_lines, null::uuid);
end;
$fn$;

revoke all on function public.gl_manual_journal(date,text,jsonb) from public;
revoke all on function public.gl_manual_journal(date,text,jsonb) from anon;
grant execute on function public.gl_manual_journal(date,text,jsonb) to authenticated;

comment on function public.gl_manual_journal(date,text,jsonb) is
  'Principal-only journal with no upstream document (ruling M). Since 0502 it calls gl_manual_journal(date,text,jsonb,uuid) with no request key: every call is a new entry.';

-- ── 4 · sanity ───────────────────────────────────────────────────────────────
do $sanity$
begin
  if to_regprocedure('public.gl_manual_journal(date,text,jsonb,uuid)') is null
     or to_regprocedure('public.gl_manual_journal(date,text,jsonb)') is null then
    raise exception '0502 sanity: both gl_manual_journal signatures must exist';
  end if;
  if has_function_privilege('anon', 'public.gl_manual_journal(date,text,jsonb,uuid)', 'execute')
     or has_function_privilege('anon', 'public.gl_manual_journal(date,text,jsonb)', 'execute') then
    raise exception '0502 sanity: anon may execute gl_manual_journal';
  end if;
  if not has_function_privilege('authenticated', 'public.gl_manual_journal(date,text,jsonb,uuid)', 'execute') then
    raise exception '0502 sanity: authenticated cannot reach the keyed gl_manual_journal';
  end if;
  if has_table_privilege('authenticated', 'public.gl_manual_journal_requests', 'select')
     or has_table_privilege('authenticated', 'public.gl_manual_journal_requests', 'insert')
     or has_table_privilege('anon', 'public.gl_manual_journal_requests', 'select') then
    raise exception '0502 sanity: a direct door to gl_manual_journal_requests survived';
  end if;
end;
$sanity$;
