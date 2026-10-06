-- ═══════════════════════════════════════════════════════════════════════════
-- 0563 · ONE CREATE DOOR PER NAME AGAIN
-- PURCHASING CARD 13, second half. It drops the overloads `0562` deliberately
-- left standing, and it is applied ONLY after all three production surfaces
-- report the merge SHA of that card.
--
-- ⭐ WHY THE DROP IS A SEPARATE FILE.
-- A migration lands before its bundle does. While the old bundle is still
-- live it sends nine argument names, so dropping the nine-name door inside
-- 0562 would have refused every Manual Purchase raised in that window.
-- `0471`/`0472` used the same two-step: create the door, converge the deploy,
-- then remove what nothing calls any more.
--
-- ⭐ WHY THE DROP HAPPENS AT ALL.
-- 0549's defect was TWO doors of one name: PostgREST resolves an RPC by the
-- argument NAMES the request carries, so the caller that omitted one name kept
-- binding to the older twin and the new column was written nowhere. Two doors
-- of one name is a trap with a timer on it — the next lane to add an argument
-- inherits it. Only FUNCTIONS are dropped here; no table, column or row is
-- touched, and nothing in the database calls them (checked: no other
-- `pg_proc` body names them).
-- ═══════════════════════════════════════════════════════════════════════════
begin;

drop function if exists public.purchasing_create_request(
  text, uuid, text, date, uuid, uuid, text, text);
drop function if exists public.purchasing_create_request(
  text, uuid, text, date, uuid, uuid, text);

drop function if exists public.purchasing_create_request_with_lines(
  text, uuid, text, date, uuid, uuid, text, jsonb, text);
drop function if exists public.purchasing_create_request_with_lines(
  text, uuid, text, date, uuid, uuid, text, jsonb);

drop function if exists public.purchasing_resubmit_request(
  uuid, uuid, date, text, uuid, uuid, text, jsonb);

-- ⭐ AND THE COMMENT IS CORRECTED WHERE IT STANDS.
-- 0562's own comment on the header door still says "the superseded 8- and
-- 7-argument overloads are dropped here". They were not — that file
-- deliberately left them for the deploy window, as its header explains, and a
-- committed migration is never edited (CLAUDE.md red line 6). The sentence is
-- true of THIS file, so this file is where it is rewritten.
comment on function public.purchasing_create_request(
  text, uuid, text, date, uuid, uuid, text, text, text) is
  '0562 — 0546''s header door plus the optional Purchase requirement (owner ruling Jess, 2026-09-22). Every purpose may carry it; `why` stays Other Purchase''s required reason, checked where it always was, in _purchasing_check_request_facts. Approval stays required for every request (0522; owner selection A, 2026-09-22). 0563 dropped the superseded 8- and 7-argument overloads once the bundle that calls this one was live, so exactly one door of this name exists.';

-- ───────────────────────────────────────────────────────────────────────────
-- SANITY — exactly one door per name, and it is the one that carries the fact
-- ───────────────────────────────────────────────────────────────────────────
do $sanity$
declare
  v_bad text;
begin
  select string_agg(t.fn, ', ') into v_bad
    from (values
      ('purchasing_create_request'),
      ('purchasing_create_request_with_lines'),
      ('purchasing_resubmit_request')
    ) as t(fn)
   where (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = t.fn) <> 1;
  if v_bad is not null then
    raise exception '0563 sanity: these doors do not have exactly one overload: %', v_bad;
  end if;

  -- And the survivor is the requirement-carrying shape, not an older twin that
  -- happened to be the last one standing.
  if to_regprocedure(
       'public.purchasing_create_request(text, uuid, text, date, uuid, uuid, text, text, text)'
     ) is null
     or to_regprocedure(
       'public.purchasing_create_request_with_lines(text, uuid, text, date, uuid, uuid, text, jsonb, text, text)'
     ) is null
     or to_regprocedure(
       'public.purchasing_resubmit_request(uuid, uuid, date, text, uuid, uuid, text, jsonb, text)'
     ) is null then
    raise exception '0563 sanity: the surviving door is not the requirement-carrying one';
  end if;
end
$sanity$;

commit;
