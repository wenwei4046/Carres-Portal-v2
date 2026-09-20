-- 0548 · THE CREATE DOOR ASKS WHETHER STOCK CAN ANSWER THE PURCHASE
--
-- ⛔ THE DEFECT THIS CLOSES, MEASURED ON PRODUCTION 2026-09-20, MINUTES AFTER
--    0546 AND 0547 WERE APPLIED.
--
-- 0546 built the whole Ready Stock allocation: the binding column, its
-- constraint, the remaining-requirement arithmetic, the draw door's Manual
-- Purchase branch, the atomic save and the issue ceiling that stops a Unit
-- being bought twice. Every one of them reads `purchase_requests.
-- fulfilment_intent`. And NOTHING WROTE IT.
--
--   · `purchasing_create_request` did gain `p_fulfilment_intent` in 0546 — but
--     adding a parameter created a SECOND overload beside 0522's seven-argument
--     one, and PostgREST resolves by the argument NAMES a request sends, so an
--     existing seven-name caller still binds to the old door.
--   · The route Carres actually raises a Manual Purchase through is
--     `purchasing_create_request_with_lines` (0410), which 0546 never touched
--     at all. It takes eight arguments, none of them the intent, and calls the
--     header door positionally with seven.
--
-- So every request raised since 0546 stored NULL, every goods line read
-- `This purchase did not record whether stock can answer it, so stock cannot
-- be chosen.`, and the entire feature was correct, verified and unreachable.
-- Owner ruling 2026-09-20: the create form asks the question.
--
-- ── WHY A PARAMETER AND NOT A DROP ──────────────────────────────────────────
-- The eight-argument `purchasing_create_request_with_lines` stays where it is.
-- Removing it is a DROP, and red line 1 admits no DROP without the owner's
-- confirmation in the conversation that runs it — this file has confirmation
-- for a create, not for a removal. The nine-argument form below is what the
-- API binds to (it sends the ninth NAME), the eight-argument form keeps every
-- other caller working unchanged, and neither can write a wrong intent: the
-- old one writes none, exactly as it does today.
--
-- ⚠️ THE TWO STALE OVERLOADS ARE RECORDED DEBT, NOT TIDINESS. `purchase.
-- create_request` (7 + 8) and `purchasing_create_request_with_lines` (8 + 9)
-- each keep a pre-intent twin. They are unreachable from the app once this
-- file lands, and dropping the four of them is a single owner-confirmed
-- housekeeping migration whenever one is wanted.
--
-- ── WHAT IS NOT DECIDED HERE ────────────────────────────────────────────────
-- NULL stays legal and stays its own state. A request raised before this file
-- recorded no intent, and CLAUDE.md §6 forbids a backfill — every row today is
-- test data. Those rows keep printing the governed absence; they are never
-- guessed into an answer.
--
-- NON-DESTRUCTIVE. Creates one function overload. No column, constraint,
-- index, view or row is added, altered or removed. Asserts no row count.

begin;

-- ───────────────────────────────────────────────────────────────────────────
-- THE WHOLE-REQUEST DOOR, CARRYING THE INTENT TO THE HEADER
-- ───────────────────────────────────────────────────────────────────────────
--
-- 0410's body, unchanged except that it takes the intent and names it when it
-- calls the header door — which is what makes the call bind to 0546's
-- eight-argument `purchasing_create_request` instead of 0522's seven. Every
-- purpose rule, `why` rule, structured-For rule and line rule still runs in
-- its own inner door, and the whole thing is still one transaction: a refusal
-- on line three still takes the header with it.
create or replace function public.purchasing_create_request_with_lines(
  p_purpose             text,
  p_destination_id      uuid,
  p_why                 text default null,
  p_required_by         date default null,
  p_for_service_case_id uuid default null,
  p_for_staff_user_id   uuid default null,
  p_for_subsidiary_name text default null,
  p_lines               jsonb default '[]'::jsonb,
  p_fulfilment_intent   text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_header   jsonb;
  v_id       uuid;
  v_line     jsonb;
  v_one      jsonb;
  v_line_ids jsonb := '[]'::jsonb;
begin
  -- A request with no lines is the half-record this door exists to prevent.
  if p_lines is null
     or jsonb_typeof(p_lines) <> 'array'
     or jsonb_array_length(p_lines) = 0 then
    raise exception 'a manual purchase needs at least one line'
      using errcode = '22023', detail = 'lines_required';
  end if;

  -- THE HEADER, through its own door. Every purpose rule, the `why` rule and
  -- the three structured-For rules run inside `purchasing_create_request`.
  -- 0548: the arguments are NAMED, so this binds to the eight-argument form
  -- 0546 created and the intent actually reaches the row. Called positionally
  -- it would bind to 0522's seven-argument twin and silently store NULL —
  -- which is the defect this file exists to close.
  v_header := public.purchasing_create_request(
    p_purpose             => p_purpose,
    p_destination_id      => p_destination_id,
    p_why                 => p_why,
    p_required_by         => p_required_by,
    p_for_service_case_id => p_for_service_case_id,
    p_for_staff_user_id   => p_for_staff_user_id,
    p_for_subsidiary_name => p_for_subsidiary_name,
    p_fulfilment_intent   => p_fulfilment_intent
  );
  v_id := (v_header ->> 'id')::uuid;

  -- THE LINES, through their own door, in the order they were typed. Any
  -- refusal raised in here aborts this function, and the header inserted above
  -- goes with it — that is the whole point of this file.
  --
  -- The destination and the purpose come from the HEADER, never from the line
  -- payload. `purchasing_create_demand` refuses a line that contradicts its
  -- request (`destination_mismatch` / `purpose_mismatch`), so passing the
  -- header's own values removes a way to be refused for a fact nobody was
  -- asked about twice.
  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_one := public.purchasing_create_demand(
      v_line ->> 'sku',
      (v_line ->> 'qty')::int,
      p_destination_id,
      nullif(v_line ->> 'required_by', '')::date,
      v_line ->> 'remark',
      p_purpose,
      v_id
    );
    v_line_ids := v_line_ids || jsonb_build_array(v_one ->> 'id');
  end loop;

  -- The header door's own answer, plus what was written under it. The browser
  -- reads `id` and `req_no` exactly as it did from the header-only call.
  return v_header || jsonb_build_object('line_ids', v_line_ids);
end;
$fn$;

revoke execute on function
  public.purchasing_create_request_with_lines(text, uuid, text, date, uuid, uuid, text, jsonb, text)
  from public, anon;
grant execute on function
  public.purchasing_create_request_with_lines(text, uuid, text, date, uuid, uuid, text, jsonb, text)
  to authenticated;

comment on function
  public.purchasing_create_request_with_lines(text, uuid, text, date, uuid, uuid, text, jsonb, text) is
  '0548 — 0410''s whole-request door plus the RECORDED INTENT (owner rulings 2026-09-18 / 2026-09-20). It calls purchasing_create_request with NAMED arguments so the call binds to 0546''s eight-argument form and the intent reaches the row; called positionally it bound to 0522''s seven-argument twin and stored NULL, which left every Ready Stock line reading `This purchase did not record whether stock can answer it`. Still one transaction, still every inner gate in its own body, still refuses a request with no lines. NULL intent stays legal and stays its own state — it is never guessed.';

-- ───────────────────────────────────────────────────────────────────────────
-- SANITY — the SHAPE, and the thing that was actually broken
-- ───────────────────────────────────────────────────────────────────────────
do $sanity$
declare
  v_n int;
begin
  -- The nine-argument door exists.
  if to_regprocedure(
       'public.purchasing_create_request_with_lines(text, uuid, text, date, uuid, uuid, text, jsonb, text)'
     ) is null then
    raise exception '0548 sanity: the intent-carrying create door is missing';
  end if;

  -- The header door it names must be the EIGHT-argument one, or the named
  -- call above would not resolve and the intent would go nowhere.
  if to_regprocedure(
       'public.purchasing_create_request(text, uuid, text, date, uuid, uuid, text, text)'
     ) is null then
    raise exception '0548 sanity: the intent-carrying header door is missing';
  end if;

  -- ⭐ THE DEFECT ITSELF: the new body must name its arguments. A positional
  -- call is what bound to the seven-argument twin and lost the intent.
  select count(*) into v_n
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'purchasing_create_request_with_lines'
     and p.prosrc like '%p_fulfilment_intent   => p_fulfilment_intent%';
  if v_n <> 1 then
    raise exception '0548 sanity: exactly one create door must pass the intent by name, found %', v_n;
  end if;

  -- The column the whole chain reads is still there and still nullable: a row
  -- that recorded no intent keeps saying so.
  select count(*) into v_n
    from information_schema.columns
   where table_schema = 'public' and table_name = 'purchase_requests'
     and column_name = 'fulfilment_intent' and is_nullable = 'YES';
  if v_n <> 1 then
    raise exception '0548 sanity: fulfilment_intent must exist and stay nullable';
  end if;
end
$sanity$;

commit;
