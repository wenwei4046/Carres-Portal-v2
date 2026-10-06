-- =============================================================================
-- 0462_one_gate_writes_the_ledger.sql
-- FINANCE · GENERAL LEDGER — THE POSTING GATE
-- (build contract .claude/LEDGER-CONTRACT.md; rulings J/K/L/M/N)
--
-- 0461 gave the ledger a chart of accounts and a start line. This file gives it
-- the only door. From here on there is exactly ONE way a row reaches
-- `gl_entries` / `gl_entry_lines`: `gl_post(...)`. Not a route, not a trigger,
-- not a well-meaning UPDATE from a console. The tables themselves hold NO
-- insert/update/delete policy for any role, and INSERT/UPDATE/DELETE is revoked
-- from `authenticated`, so the gate is not a convention anybody can forget —
-- it is the only privilege that exists.
--
-- WHY A GATE AND NOT A TABLE WITH CONSTRAINTS:
--   A CHECK constraint can say "debit = credit". It cannot say "this account is
--   a header and headers are not postable", "this account is a control account
--   so name the customer", or "this date is before the day the ledger began".
--   Those are business refusals, and a refusal that lives in one function is a
--   refusal every document inherits for free.
--
-- THE GATE REFUSES; IT DOES NOT REPAIR.
--   Every raise below names the value that tripped it — the account code, the
--   date, the two totals. A guard whose error does not say what tripped it is a
--   guard nobody can debug at 9pm with a customer waiting.
--
--   In particular: **a null entry date RAISES. It is never replaced with
--   current_date.** The system being replaced substitutes today's date for a
--   blank one, which silently drops posted money into the wrong month and makes
--   every subsequent reconciliation a manual hunt. That is the bug we are
--   deliberately not copying. See step 2 of `gl_post`.
--
--   There is also NO escape hatch. No `p_allow_missing_chart`, no "the chart is
--   empty so skip validation" branch. An empty chart means nothing may post,
--   which is the correct answer on day zero.
--
-- RETRIES ARE SAFE BY DESIGN.
--   Step 1 of the gate is idempotency, before any validation at all: if a
--   posted, unreversed entry already exists for (source_type, source_doc_no),
--   its id comes back and nothing is written. A double-clicked Post button, a
--   retried Worker request and a replayed webhook all land on the same entry.
--
-- MONEY IS NEVER DELETED.
--   `gl_reverse` writes a contra entry with the sides swapped and stamps the
--   original. No DELETE is issued against a ledger table by anything in this
--   file, or by anything that ever will be.
-- =============================================================================

-- ── 1 · the ledger ───────────────────────────────────────────────────────────
create table if not exists public.gl_entries (
  id             uuid primary key default gen_random_uuid(),
  entry_no       text not null unique,
  entry_date     date not null,
  source_type    text not null,
  source_doc_no  text not null,
  narration      text,
  total_debit    numeric(12,2) not null,
  total_credit   numeric(12,2) not null,
  posted         boolean not null default true,
  reversed       boolean not null default false,
  reversed_by    uuid references public.gl_entries(id),
  reverses       uuid references public.gl_entries(id),
  created_at     timestamptz not null default now(),
  created_by     uuid references public.app_users(id),
  constraint gl_entries_totals_agree check (total_debit = total_credit),
  constraint gl_entries_totals_positive check (total_debit > 0),
  constraint gl_entries_source_type_present check (btrim(source_type) <> ''),
  constraint gl_entries_source_doc_no_present check (btrim(source_doc_no) <> '')
);

comment on table public.gl_entries is
  'General ledger header. Written ONLY by gl_post(); reversed ONLY by gl_reverse(). Never deleted.';
comment on column public.gl_entries.posted is
  'There are no drafts in the ledger. A row exists because it posted.';
comment on column public.gl_entries.reverses is
  'Set on a contra entry, pointing at the entry it cancels.';
comment on column public.gl_entries.reversed_by is
  'Set on the original, pointing at the contra that cancelled it.';

-- One ACTIVE entry per source document. The index is partial, over posted and
-- unreversed rows only — which is exactly what lets a reversal and a later
-- corrected re-post of the same source document coexist. Reverse the wrong
-- CUSTOMER_PAYMENT for SO-123 and the pair (CUSTOMER_PAYMENT, SO-123) leaves
-- the index, so the corrected posting is admitted rather than rejected as a
-- duplicate. A full unique index would have made every correction impossible.
create unique index if not exists gl_entries_one_active_per_source
  on public.gl_entries (source_type, source_doc_no)
  where posted and not reversed;

create index if not exists gl_entries_entry_date_idx
  on public.gl_entries (entry_date);
create index if not exists gl_entries_source_idx
  on public.gl_entries (source_type, source_doc_no);

create table if not exists public.gl_entry_lines (
  id           uuid primary key default gen_random_uuid(),
  entry_id     uuid not null references public.gl_entries(id) on delete restrict,
  line_no      integer not null,
  account_code text not null references public.gl_accounts(code),
  debit        numeric(12,2) not null default 0,
  credit       numeric(12,2) not null default 0,
  party_type   text check (party_type in ('CUSTOMER','SUPPLIER')),
  party_id     uuid,
  memo         text,
  constraint gl_entry_lines_line_no_unique unique (entry_id, line_no),
  constraint gl_entry_lines_sides_non_negative check (debit >= 0 and credit >= 0),
  constraint gl_entry_lines_one_side_only check ((debit = 0) <> (credit = 0)),
  constraint gl_entry_lines_party_paired check ((party_type is null) = (party_id is null))
);

comment on table public.gl_entry_lines is
  'General ledger detail. Exactly one side per line. A party, when present, is an id — never a name.';

create index if not exists gl_entry_lines_entry_idx
  on public.gl_entry_lines (entry_id);
create index if not exists gl_entry_lines_account_idx
  on public.gl_entry_lines (account_code);
create index if not exists gl_entry_lines_party_idx
  on public.gl_entry_lines (party_type, party_id)
  where party_id is not null;

-- ── 2 · the gate ─────────────────────────────────────────────────────────────
-- gl_post is the only writer. Its checks run in the contract's order, and the
-- order is deliberate: idempotency FIRST, so a retry of a call that already
-- succeeded never has to survive validation a second time (the chart may have
-- moved underneath it since), then date, then shape, then per-line, then
-- balance, then allocate the number and write.
create or replace function public.gl_post(
  p_source_type   text,
  p_source_doc_no text,
  p_entry_date    date,
  p_narration     text,
  p_lines         jsonb
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role        app_role;
  v_uid         uuid;
  v_existing    uuid;
  v_go_live     date;
  v_count       int;
  v_elem        jsonb;
  v_idx         int := 0;
  v_code        text;
  v_active      boolean;
  v_control     boolean;
  v_control_for text;
  v_debit       numeric(12,2);
  v_credit      numeric(12,2);
  v_party_type  text;
  v_party_id    uuid;
  v_sum_debit   numeric(12,2) := 0;
  v_sum_credit  numeric(12,2) := 0;
  v_norm        jsonb := '[]'::jsonb;
  v_source_type text;
  v_doc_no      text;
  v_entry_no    text;
  v_entry_id    uuid;
begin
  -- The in-body role check IS the gate; security definer only supplies the
  -- table privilege the caller does not have. Posting roles are the ones that
  -- operate documents: finance owns bills and journals, operation records
  -- customer money (0343), principal may do either.
  v_role := public.app_role();
  if v_role is null or v_role::text not in ('finance','operation','principal') then
    raise exception 'gl_post refused: role % may not write the ledger', coalesce(v_role::text, 'none')
      using errcode = '42501', detail = 'gl_post_forbidden';
  end if;
  v_uid := auth.uid();

  -- Step 0 · the source identity must exist before step 1 can look it up.
  -- (Not in the contract's numbered list, but step 1 is undefined without it.)
  v_source_type := btrim(coalesce(p_source_type, ''));
  v_doc_no      := btrim(coalesce(p_source_doc_no, ''));
  if v_source_type = '' then
    raise exception 'gl_post refused: source_type is required'
      using errcode = '22023', detail = 'gl_post_source_type_blank';
  end if;
  if v_doc_no = '' then
    raise exception 'gl_post refused: source_doc_no is required for source_type %', v_source_type
      using errcode = '22023', detail = 'gl_post_source_doc_no_blank';
  end if;

  -- ── Step 1 · idempotency. A retry, a double-click and a replayed webhook
  -- all find the entry that already stands and get its id back. No raise.
  select e.id into v_existing
    from public.gl_entries e
   where e.source_type = v_source_type
     and e.source_doc_no = v_doc_no
     and e.posted
     and not e.reversed
   limit 1;
  if v_existing is not null then
    return v_existing;
  end if;

  -- ── Step 2 · the date.
  -- A NULL date RAISES. It is NEVER silently replaced with current_date. The
  -- system being replaced substitutes today, which quietly posts money into the
  -- wrong month; that is the one bug this whole file exists to refuse to copy.
  if p_entry_date is null then
    raise exception 'gl_post refused: entry_date is required for %/% — a blank date is never replaced with today', v_source_type, v_doc_no
      using errcode = '22023', detail = 'gl_post_entry_date_null';
  end if;

  select c.go_live_on into v_go_live from public.gl_config c where c.id;
  if v_go_live is null then
    raise exception 'gl_post refused: the ledger has no go-live date configured (gl_config is empty)'
      using errcode = '22023', detail = 'gl_post_no_go_live';
  end if;
  if p_entry_date < v_go_live then
    raise exception 'gl_post refused: entry_date % is before the ledger go-live date %', p_entry_date, v_go_live
      using errcode = '22023', detail = 'gl_post_entry_date_before_go_live';
  end if;

  -- ── Step 3 · the shape of the line list.
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'gl_post refused: p_lines must be a JSON array, got % for %/%',
      coalesce(jsonb_typeof(p_lines), 'null'), v_source_type, v_doc_no
      using errcode = '22023', detail = 'gl_post_lines_not_array';
  end if;
  v_count := jsonb_array_length(p_lines);
  if v_count < 2 then
    raise exception 'gl_post refused: an entry needs at least two lines, got % for %/%', v_count, v_source_type, v_doc_no
      using errcode = '22023', detail = 'gl_post_too_few_lines';
  end if;

  -- ── Step 4 · every line, one at a time. Each refusal names the line number
  -- AND the offending value, because "invalid line" is not a debuggable error.
  for v_elem in select value from jsonb_array_elements(p_lines) loop
    v_idx := v_idx + 1;

    if jsonb_typeof(v_elem) <> 'object' then
      raise exception 'gl_post refused: line % is a %, expected an object', v_idx, jsonb_typeof(v_elem)
        using errcode = '22023', detail = 'gl_post_line_not_object';
    end if;

    v_code := btrim(coalesce(v_elem->>'account_code', ''));
    if v_code = '' then
      raise exception 'gl_post refused: line % has no account_code', v_idx
        using errcode = '22023', detail = 'gl_post_line_account_code_blank';
    end if;

    select a.is_active, a.is_control, a.control_for into v_active, v_control, v_control_for
      from public.gl_accounts a where a.code = v_code;
    if not found then
      raise exception 'gl_post refused: line % names account %, which is not in the chart', v_idx, v_code
        using errcode = '23503', detail = 'gl_post_account_unknown';
    end if;
    if not v_active then
      raise exception 'gl_post refused: line % names account %, which is retired', v_idx, v_code
        using errcode = '22023', detail = 'gl_post_account_inactive';
    end if;
    -- A HEADER is derived, never declared: any account that ANY row names as
    -- its parent_code, active or retired. Retiring the last child must not
    -- silently turn a header into a postable leaf, so `is_active` is not part
    -- of this test.
    if exists (select 1 from public.gl_accounts c where c.parent_code = v_code) then
      raise exception 'gl_post refused: line % names account %, which is a header account and cannot be posted to', v_idx, v_code
        using errcode = '22023', detail = 'gl_post_account_is_header';
    end if;

    -- Amounts. A non-numeric amount is refused by name rather than by an
    -- unreadable cast error, and both sides are rounded to the storage scale
    -- BEFORE the balance test, so a set of lines that balances on input can
    -- never become unbalanced on write.
    if v_elem ? 'debit' and jsonb_typeof(v_elem->'debit') not in ('number','null') then
      raise exception 'gl_post refused: line % debit is a %, expected a number', v_idx, jsonb_typeof(v_elem->'debit')
        using errcode = '22023', detail = 'gl_post_line_debit_not_number';
    end if;
    if v_elem ? 'credit' and jsonb_typeof(v_elem->'credit') not in ('number','null') then
      raise exception 'gl_post refused: line % credit is a %, expected a number', v_idx, jsonb_typeof(v_elem->'credit')
        using errcode = '22023', detail = 'gl_post_line_credit_not_number';
    end if;
    v_debit  := round(coalesce((v_elem->>'debit')::numeric, 0), 2);
    v_credit := round(coalesce((v_elem->>'credit')::numeric, 0), 2);

    if v_debit < 0 or v_credit < 0 then
      raise exception 'gl_post refused: line % on account % has a negative amount (debit %, credit %) — reverse the sides instead', v_idx, v_code, v_debit, v_credit
        using errcode = '22023', detail = 'gl_post_line_negative';
    end if;
    if v_debit <> 0 and v_credit <> 0 then
      raise exception 'gl_post refused: line % on account % has both a debit (%) and a credit (%)', v_idx, v_code, v_debit, v_credit
        using errcode = '22023', detail = 'gl_post_line_two_sided';
    end if;
    if v_debit = 0 and v_credit = 0 then
      raise exception 'gl_post refused: line % on account % has neither a debit nor a credit', v_idx, v_code
        using errcode = '22023', detail = 'gl_post_line_empty';
    end if;

    -- The party.
    v_party_type := nullif(btrim(coalesce(v_elem->>'party_type','')), '');
    begin
      v_party_id := nullif(btrim(coalesce(v_elem->>'party_id','')), '')::uuid;
    exception when invalid_text_representation then
      raise exception 'gl_post refused: line % party_id % is not a uuid', v_idx, v_elem->>'party_id'
        using errcode = '22023', detail = 'gl_post_line_party_id_not_uuid';
    end;

    if v_party_type is not null and v_party_type not in ('CUSTOMER','SUPPLIER') then
      raise exception 'gl_post refused: line % party_type % is neither CUSTOMER nor SUPPLIER', v_idx, v_party_type
        using errcode = '22023', detail = 'gl_post_line_party_type_unknown';
    end if;
    if (v_party_type is null) <> (v_party_id is null) then
      raise exception 'gl_post refused: line % names a party by only half — party_type %, party_id %',
        v_idx, coalesce(v_party_type,'null'), coalesce(v_party_id::text,'null')
        using errcode = '22023', detail = 'gl_post_line_party_half_named';
    end if;
    -- A control account (AR / AP) is a subsidiary ledger in disguise: without a
    -- party the balance can never be broken back down to who owes it.
    if v_control and (v_party_type is null or v_party_id is null) then
      raise exception 'gl_post refused: line % posts to control account % without a party — both party_type and party_id are required', v_idx, v_code
        using errcode = '22023', detail = 'gl_post_control_account_needs_party';
    end if;
    -- And it must be the right KIND of party. Trade receivables is a customer
    -- ledger; booking a supplier into it produces a balance that looks correct
    -- in total and cannot be broken back down to anybody. Checking that a party
    -- exists is not the same as checking it belongs here.
    if v_control and v_party_type is distinct from v_control_for then
      raise exception 'gl_post refused: line % posts a % to account %, which is a % control account',
        v_idx, v_party_type, v_code, v_control_for
        using errcode = '22023', detail = 'gl_post_party_type_wrong_side';
    end if;

    v_sum_debit  := v_sum_debit + v_debit;
    v_sum_credit := v_sum_credit + v_credit;

    v_norm := v_norm || jsonb_build_object(
      'line_no',      v_idx,
      'account_code', v_code,
      'debit',        v_debit,
      'credit',       v_credit,
      'party_type',   v_party_type,
      'party_id',     v_party_id,
      'memo',         nullif(btrim(coalesce(v_elem->>'memo','')), '')
    );
  end loop;

  -- ── Step 5 · the balance.
  if v_sum_debit <> v_sum_credit then
    raise exception 'gl_post refused: %/% is out of balance — debit % vs credit % (difference %)',
      v_source_type, v_doc_no, v_sum_debit, v_sum_credit, (v_sum_debit - v_sum_credit)
      using errcode = '23514', detail = 'gl_post_out_of_balance';
  end if;
  if v_sum_debit = 0 then
    raise exception 'gl_post refused: %/% totals zero on both sides — an entry that moves nothing is not an entry',
      v_source_type, v_doc_no
      using errcode = '22023', detail = 'gl_post_zero_total';
  end if;

  -- ── Step 6 · allocate the number and write.
  v_entry_no := public.gl_next_doc_no('JE', p_entry_date);

  insert into public.gl_entries
    (entry_no, entry_date, source_type, source_doc_no, narration,
     total_debit, total_credit, posted, created_by)
  values
    (v_entry_no, p_entry_date, v_source_type, v_doc_no,
     nullif(btrim(coalesce(p_narration,'')), ''),
     v_sum_debit, v_sum_credit, true,
     (select u.id from public.app_users u where u.id = v_uid))
  returning id into v_entry_id;

  insert into public.gl_entry_lines
    (entry_id, line_no, account_code, debit, credit, party_type, party_id, memo)
  select v_entry_id,
         (l->>'line_no')::int,
         l->>'account_code',
         (l->>'debit')::numeric,
         (l->>'credit')::numeric,
         l->>'party_type',
         (l->>'party_id')::uuid,
         l->>'memo'
    from jsonb_array_elements(v_norm) l;

  return v_entry_id;
end;
$fn$;

revoke all on function public.gl_post(text,text,date,text,jsonb) from public;
revoke all on function public.gl_post(text,text,date,text,jsonb) from anon;
grant execute on function public.gl_post(text,text,date,text,jsonb) to authenticated;

comment on function public.gl_post(text,text,date,text,jsonb) is
  'The ONE ledger writer. Idempotent per (source_type, source_doc_no). Refuses; never repairs. A null entry_date raises and is never replaced with today.';

-- ── 3 · reversal is a contra entry, never a delete ───────────────────────────
create or replace function public.gl_reverse(
  p_entry_id uuid,
  p_reason   text
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role     app_role;
  v_uid      uuid;
  v_orig     public.gl_entries;
  v_lines    jsonb;
  v_new_id   uuid;
  v_reason   text;
begin
  v_role := public.app_role();
  if v_role is null or v_role::text not in ('finance','principal') then
    raise exception 'gl_reverse refused: role % may not reverse a ledger entry', coalesce(v_role::text,'none')
      using errcode = '42501', detail = 'gl_reverse_forbidden';
  end if;
  v_uid := auth.uid();

  if p_entry_id is null then
    raise exception 'gl_reverse refused: entry id is required'
      using errcode = '22023', detail = 'gl_reverse_entry_id_null';
  end if;

  select * into v_orig from public.gl_entries where id = p_entry_id for update;
  if not found then
    raise exception 'gl_reverse refused: entry % does not exist', p_entry_id
      using errcode = '42P01', detail = 'gl_reverse_entry_not_found';
  end if;
  if v_orig.reversed then
    raise exception 'gl_reverse refused: entry % (%) is already reversed by %',
      v_orig.entry_no, v_orig.source_doc_no, coalesce(v_orig.reversed_by::text, 'unknown')
      using errcode = '22023', detail = 'gl_reverse_already_reversed';
  end if;
  if v_orig.reverses is not null then
    raise exception 'gl_reverse refused: entry % is itself a contra entry — post a corrected entry instead of reversing a reversal', v_orig.entry_no
      using errcode = '22023', detail = 'gl_reverse_of_a_reversal';
  end if;

  v_reason := nullif(btrim(coalesce(p_reason,'')), '');
  if v_reason is null then
    raise exception 'gl_reverse refused: a reason is required to reverse entry %', v_orig.entry_no
      using errcode = '22023', detail = 'gl_reverse_reason_blank';
  end if;

  -- The sides swap. Everything else — account, party, memo — is copied, so the
  -- contra nets the original to zero line for line.
  select jsonb_agg(
           jsonb_build_object(
             'account_code', l.account_code,
             'debit',        l.credit,
             'credit',       l.debit,
             'party_type',   l.party_type,
             'party_id',     l.party_id,
             'memo',         l.memo
           ) order by l.line_no)
    into v_lines
    from public.gl_entry_lines l
   where l.entry_id = v_orig.id;

  -- Stamp the original BEFORE posting the contra. Two reasons: the partial
  -- unique index gl_entries_one_active_per_source only covers posted AND
  -- unreversed rows, so marking the original reversed here is what frees
  -- (source_type, source_doc_no) for a later corrected re-post of the same
  -- document; and it makes the reversal and the re-post able to coexist rather
  -- than the second one being rejected as a duplicate.
  update public.gl_entries
     set reversed = true
   where id = v_orig.id;

  -- The contra goes through the SAME gate as everything else (law 1: gl_post is
  -- the only writer). It carries the original's entry_date so the pair nets to
  -- zero inside the period it belongs to, not the period it was noticed in.
  v_new_id := public.gl_post(
    v_orig.source_type || '_REVERSAL',
    v_orig.source_doc_no,
    v_orig.entry_date,
    format('Reversal of %s — %s', v_orig.entry_no, v_reason),
    v_lines
  );

  update public.gl_entries set reverses    = v_orig.id where id = v_new_id;
  update public.gl_entries set reversed_by = v_new_id  where id = v_orig.id;

  insert into audit_log (role, actor_text, action, ref)
  values (v_role,
          (select name from app_users where id = v_uid),
          format('Ledger entry reversed · %s · %s', v_orig.entry_no, v_reason),
          v_orig.source_doc_no);

  return v_new_id;
end;
$fn$;

revoke all on function public.gl_reverse(uuid,text) from public;
revoke all on function public.gl_reverse(uuid,text) from anon;
grant execute on function public.gl_reverse(uuid,text) to authenticated;

comment on function public.gl_reverse(uuid,text) is
  'Writes a contra entry with the sides swapped and stamps the original. Never deletes. Raises if already reversed.';

-- ── 4 · the manual journal — principal only (ruling M) ───────────────────────
-- The one entry with no upstream document. It gets its own source_doc_no from
-- the MJ series so it is traceable like anything else, and it is refused on any
-- control account: AR and AP move only when a customer or supplier document
-- moves them, never because somebody typed a correction.
insert into public.gl_doc_series (prefix, description)
values ('MJ', 'Manual journal source document')
on conflict (prefix) do nothing;

create or replace function public.gl_manual_journal(
  p_entry_date date,
  p_narration  text,
  p_lines      jsonb
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
begin
  v_role := public.app_role();
  if not public.is_principal() then
    raise exception 'gl_manual_journal refused: role % may not raise a manual journal — principal only', coalesce(v_role::text,'none')
      using errcode = '42501', detail = 'gl_manual_journal_forbidden';
  end if;
  v_uid := auth.uid();

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

  return v_id;
end;
$fn$;

revoke all on function public.gl_manual_journal(date,text,jsonb) from public;
revoke all on function public.gl_manual_journal(date,text,jsonb) from anon;
grant execute on function public.gl_manual_journal(date,text,jsonb) to authenticated;

comment on function public.gl_manual_journal(date,text,jsonb) is
  'Principal-only journal with no upstream document (ruling M). Refuses any line on a control account. Delegates to gl_post as MANUAL.';

-- ── 5 · the falsifiable self-check ───────────────────────────────────────────
-- Returns EXACTLY ONE ROW, always — including when the ledger is empty and when
-- everything is fine. "No rows" must never be readable as "all good"; a report
-- that goes silent when it breaks is worse than no report.
create or replace function public.gl_trial_balance_check()
returns table (
  checked_at             timestamptz,
  go_live_on             date,
  entry_count            bigint,
  line_count             bigint,
  total_debit            numeric(12,2),
  total_credit           numeric(12,2),
  difference             numeric(12,2),
  header_mismatch_count  bigint,
  balanced               boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
begin
  if not public.gl_may_read() then
    raise exception 'gl_trial_balance_check refused: internal roles only'
      using errcode = '42501', detail = 'gl_trial_balance_check_forbidden';
  end if;

  return query
  with live as (
    select e.id, e.total_debit, e.total_credit
      from public.gl_entries e
     where e.posted and not e.reversed
  ),
  sums as (
    select coalesce(sum(l.debit), 0)::numeric(12,2)  as d,
           coalesce(sum(l.credit), 0)::numeric(12,2) as c,
           count(*)::bigint                          as n
      from public.gl_entry_lines l
      join live on live.id = l.entry_id
  ),
  mismatch as (
    -- An entry whose HEADER totals disagree with the sum of its OWN lines.
    -- Only gl_post writes both, so a non-zero count here means something wrote
    -- around the gate.
    select count(*)::bigint as n
      from live
      left join lateral (
        select coalesce(sum(l.debit), 0) as d, coalesce(sum(l.credit), 0) as c
          from public.gl_entry_lines l where l.entry_id = live.id
      ) s on true
     where live.total_debit is distinct from s.d
        or live.total_credit is distinct from s.c
  )
  select now(),
         (select c.go_live_on from public.gl_config c where c.id),
         (select count(*)::bigint from live),
         sums.n,
         sums.d,
         sums.c,
         (sums.d - sums.c)::numeric(12,2),
         mismatch.n,
         (sums.d = sums.c and mismatch.n = 0)
    from sums, mismatch;
end;
$fn$;

revoke all on function public.gl_trial_balance_check() from public;
revoke all on function public.gl_trial_balance_check() from anon;
grant execute on function public.gl_trial_balance_check() to authenticated;

comment on function public.gl_trial_balance_check() is
  'Ledger self-check. Always returns exactly one row so silence can never be mistaken for health.';

-- ── 6 · the tables have no write door at all ─────────────────────────────────
-- Read-only for internal roles through RLS; INSERT/UPDATE/DELETE is not granted
-- to anybody and no write policy exists, for anybody. The only privilege that
-- can touch these tables is the definer's, inside the three functions above.
alter table public.gl_entries      enable row level security;
alter table public.gl_entry_lines  enable row level security;

revoke all on public.gl_entries     from anon, authenticated;
revoke all on public.gl_entry_lines from anon, authenticated;
grant select on public.gl_entries     to authenticated;
grant select on public.gl_entry_lines to authenticated;

drop policy if exists gl_entries_read_internal on public.gl_entries;
create policy gl_entries_read_internal on public.gl_entries
  for select using ((select public.gl_may_read()));

drop policy if exists gl_entry_lines_read_internal on public.gl_entry_lines;
create policy gl_entry_lines_read_internal on public.gl_entry_lines
  for select using ((select public.gl_may_read()));

-- ── 7 · sanity ───────────────────────────────────────────────────────────────
do $sanity$
declare
  v int;
begin
  select count(*) into v from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('gl_post','gl_reverse','gl_manual_journal','gl_trial_balance_check');
  if v <> 4 then
    raise exception '0462 sanity: expected the four ledger functions, got %', v;
  end if;

  if not exists (select 1 from pg_indexes
                  where schemaname = 'public' and indexname = 'gl_entries_one_active_per_source') then
    raise exception '0462 sanity: the one-active-per-source index is missing';
  end if;

  if has_table_privilege('authenticated', 'public.gl_entries', 'insert')
     or has_table_privilege('authenticated', 'public.gl_entries', 'update')
     or has_table_privilege('authenticated', 'public.gl_entries', 'delete')
     or has_table_privilege('authenticated', 'public.gl_entry_lines', 'insert')
     or has_table_privilege('authenticated', 'public.gl_entry_lines', 'update')
     or has_table_privilege('authenticated', 'public.gl_entry_lines', 'delete') then
    raise exception '0462 sanity: a direct write door to the ledger survived';
  end if;

  if exists (select 1 from pg_policy
              where polrelid in ('public.gl_entries'::regclass, 'public.gl_entry_lines'::regclass)
                and polcmd <> 'r') then
    raise exception '0462 sanity: a non-SELECT policy exists on a ledger table';
  end if;

  if has_function_privilege('anon', 'public.gl_post(text,text,date,text,jsonb)', 'execute') then
    raise exception '0462 sanity: gl_post is callable by anon';
  end if;

  raise notice '0462 OK: one gate writes the ledger, and nothing else can';
end $sanity$;

-- ── the chart stops being editable in the one way that could strand history ──
--
-- gl_reverse writes its contra through gl_post, because law 1 says gl_post is
-- the only writer. gl_post refuses retired accounts and header accounts. Put
-- those two together and an ordinary chart edit — retiring an account, or
-- hanging a new child off it — silently makes every historical entry touching
-- it UNREVERSIBLE. The mistake becomes permanent, months later, for a reason
-- nobody would connect to it.
--
-- So: once an account carries a posted line, it cannot be retired and cannot
-- become a header. Rename it, yes. Retire it, no. This costs nothing at all in
-- practice, because an account that has never been used is still free to go.
create or replace function public.gl_accounts_protect_posted()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_lines bigint;
begin
  if tg_op = 'UPDATE' and new.is_active and old.is_active
     and new.parent_code is not distinct from old.parent_code then
    return new;                                   -- nothing dangerous changed
  end if;

  if tg_op = 'UPDATE' and (old.is_active and not new.is_active) then
    select count(*) into v_lines
      from public.gl_entry_lines l where l.account_code = old.code;
    if v_lines > 0 then
      raise exception 'account % has % posted line(s) and cannot be retired — entries touching it would become unreversible', old.code, v_lines
        using errcode = '22023', detail = 'gl_account_has_posted_history',
              hint = 'Rename it, or stop using it. A used account stays in the chart.';
    end if;
  end if;

  -- Making an account into a header: catch it from the CHILD side, because
  -- that is where the change actually happens.
  if tg_op in ('INSERT','UPDATE') and new.parent_code is not null then
    select count(*) into v_lines
      from public.gl_entry_lines l where l.account_code = new.parent_code;
    if v_lines > 0 then
      raise exception 'account % has % posted line(s) and cannot become a header by gaining child %', new.parent_code, v_lines, new.code
        using errcode = '22023', detail = 'gl_parent_has_posted_history',
              hint = 'Hang the new account off a parent that has never been posted to.';
    end if;
  end if;

  return new;
end;
$fn$;

drop trigger if exists gl_accounts_protect_posted_trg on public.gl_accounts;
create trigger gl_accounts_protect_posted_trg
  before insert or update on public.gl_accounts
  for each row execute function public.gl_accounts_protect_posted();

revoke all on function public.gl_accounts_protect_posted() from public, anon, authenticated;
