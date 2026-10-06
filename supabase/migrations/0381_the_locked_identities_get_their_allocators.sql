-- ============================================================================
-- 0381 — the locked identities get their allocators
--        (CARD-2026-08-22-purchasing-02 closure §6; purchasing/MASTER.md §§6.1, 6.2)
--
-- MASTER locked two human-readable identities. Neither was ever built:
--
--   §6.1  PREFIX-YYYYMMDD-RRRR     production mints `PO-2054`
--   §6.2  U1-000-001               production mints `id-fke850823`
--
-- Measured 2026-08-24 against live rows. `PO-2054` comes from
-- `max(seq) + 1`, which LEAKS VOLUME — a supplier reading two of our POs a
-- month apart can count everything Carres bought in between. `id-fke850823` is
-- random and unreadable down a phone line, which is the one thing a Unit ID on
-- a warehouse floor has to survive.
--
-- ── WHAT THIS FILE DOES, AND WHAT IT DELIBERATELY DOES NOT ──────────────────
--
-- It builds the two ALLOCATORS and nothing else. Existing identities are
-- PERMANENT and are not renumbered: `PO-2054` stays `PO-2054`, every existing
-- `id-…` Unit keeps its code. MASTER §6.2 is explicit that an identity is never
-- reset or reused, and a PO number is referenced by receiving, claims, stock
-- and history — renaming one would break real lineage to make a format tidy.
-- New objects get the locked format; old ones keep the identity they already
-- have. The two live side by side, exactly as a clean start intends.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1 · the daily formal-document code pool
-- ---------------------------------------------------------------------------

/**
 * ALL CARRES FORMAL DOCUMENTS SHARE ONE DAILY POOL (§6.1), so the uniqueness
 * is on (date, code) and NOT on (prefix, date, code): a `PO` and a `GRN` minted
 * on the same day may not both be `-4827`. Two documents whose visible tails
 * match invite exactly the reading §6.1 forbids — that they are related.
 *
 * The row is never deleted. A cancelled or void document keeps its claim on the
 * code forever, because §6.1 says a number is never reused and the only way to
 * guarantee that is to keep the evidence that it was taken.
 */
create table if not exists public.formal_document_codes (
  code_date date not null,
  code text not null check (code ~ '^\d{4}$'),
  prefix text not null check (prefix ~ '^[A-Z]{2,4}$'),
  document_id text,
  created_at timestamptz not null default now(),
  primary key (code_date, code)
);

comment on table public.formal_document_codes is
  '0381: the daily visible-code pool every Carres formal document draws from (MASTER §6.1). Unique on (date, code) ACROSS prefixes — one day, one 4827. Rows are never deleted: a cancelled number stays taken.';

alter table public.formal_document_codes enable row level security;
drop policy if exists formal_document_codes_read on public.formal_document_codes;
create policy formal_document_codes_read on public.formal_document_codes
  for select to authenticated
  using (public.app_role() in ('operation', 'principal', 'finance'));
revoke all on public.formal_document_codes from authenticated;
grant select on public.formal_document_codes to authenticated;

/**
 * Allocate one `PREFIX-YYYYMMDD-RRRR`.
 *
 * `RRRR` is DRAWN AT RANDOM from the day's unused codes, never counted up.
 * §6.1: "It is not a sequence, timestamp, customer, supplier or parent-document
 * number." Random draw plus a unique key is what makes that true under
 * concurrency — the loser of a race gets a unique violation and simply draws
 * again, so no lock is held across the attempt and no number is skipped.
 *
 * 10,000 codes a day is the pool. The guard fails loudly rather than looping
 * forever if a day is genuinely exhausted, because silently reusing one would
 * break the law this function exists to keep.
 */
create or replace function public.allocate_formal_document_code(
  p_prefix text,
  p_document_id text default null,
  p_date date default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_date date := coalesce(p_date, (timezone('Asia/Kuala_Lumpur', now()))::date);
  v_code text;
  v_try int := 0;
begin
  if p_prefix !~ '^[A-Z]{2,4}$' then
    raise exception 'document prefix % is not governed', p_prefix
      using errcode = '22023', detail = 'unknown_prefix';
  end if;

  loop
    v_try := v_try + 1;
    if v_try > 200 then
      raise exception 'no free document code left for % on %', p_prefix, v_date
        using errcode = 'P0001', detail = 'document_code_pool_exhausted';
    end if;
    v_code := lpad((floor(random() * 10000))::int::text, 4, '0');
    begin
      insert into public.formal_document_codes (code_date, code, prefix, document_id)
      values (v_date, v_code, p_prefix, p_document_id);
      return format('%s-%s-%s', p_prefix, to_char(v_date, 'YYYYMMDD'), v_code);
    exception when unique_violation then
      -- Somebody else took it between the draw and the insert. Draw again.
      null;
    end;
  end loop;
end;
$$;

revoke all on function public.allocate_formal_document_code(text, text, date) from public;
grant execute on function public.allocate_formal_document_code(text, text, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 2 · the company-wide Unit ID series
-- ---------------------------------------------------------------------------

/**
 * ONE ALLOCATION AUTHORITY, NEVER RESET (§6.2).
 *
 * A single row holding the current series letter and the last six digits. It is
 * locked FOR UPDATE while allocating, so two receipts cannot mint one Unit ID —
 * and it is a TABLE rather than a sequence because a sequence cannot roll from
 * `U1-999-999` to `U2-000-001` and cannot be read back without consuming.
 */
create table if not exists public.unit_id_series (
  id boolean primary key default true check (id),
  series int not null default 1 check (series >= 1),
  last_number int not null default 0 check (last_number >= 0 and last_number <= 999999),
  updated_at timestamptz not null default now()
);
insert into public.unit_id_series (id) values (true) on conflict (id) do nothing;

comment on table public.unit_id_series is
  '0381: the ONE company-wide Unit ID allocator (MASTER §6.2). One row, locked while allocating. Never reset, never reused; rolls U1-999-999 → U2-000-001.';

alter table public.unit_id_series enable row level security;
revoke all on public.unit_id_series from authenticated;

/** `U1-000-001` — six system digits per series, displayed 3 + 3. */
create or replace function public.format_unit_id(p_series int, p_number int)
returns text language sql immutable as $$
  select format('U%s-%s-%s', p_series,
                lpad((p_number / 1000)::int::text, 3, '0'),
                lpad((p_number % 1000)::int::text, 3, '0'));
$$;

/**
 * Search and scan must find one Unit however it was typed (§6.2):
 * `U1-000-001`, `U1-000001` and `U1000001` are the same Unit.
 */
create or replace function public.normalise_unit_id(p text)
returns text language sql immutable as $$
  select upper(regexp_replace(coalesce(p, ''), '[^A-Za-z0-9]', '', 'g'));
$$;

create or replace function public.allocate_unit_id()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_series int;
  v_number int;
begin
  update public.unit_id_series
     set last_number = case when last_number >= 999999 then 1 else last_number + 1 end,
         series = case when last_number >= 999999 then series + 1 else series end,
         updated_at = now()
   where id
  returning series, last_number into v_series, v_number;

  if v_series is null then
    raise exception 'unit id series is missing' using errcode = 'P0001', detail = 'unit_series_missing';
  end if;
  return public.format_unit_id(v_series, v_number);
end;
$$;

revoke all on function public.allocate_unit_id() from public;
grant execute on function public.allocate_unit_id() to authenticated;

/**
 * THE EXISTING UNITS ARE NOT RENUMBERED, so the series must start ABOVE
 * anything already minted in the locked format. Today nothing is — every live
 * unit_code is `id-…` — but seeding from the data rather than from zero means
 * this file is correct whether it runs today or after a partial rollout.
 */
update public.unit_id_series s
   set last_number = greatest(
         s.last_number,
         coalesce((
           select max(((regexp_match(unit_code, '^U(\d)-(\d{3})-(\d{3})$'))[2] ||
                       (regexp_match(unit_code, '^U(\d)-(\d{3})-(\d{3})$'))[3])::int)
             from public.ops_stock_items
            where unit_code ~ '^U\d-\d{3}-\d{3}$'
         ), 0)
       )
 where s.id;
