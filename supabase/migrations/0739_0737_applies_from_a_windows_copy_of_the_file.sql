-- =============================================================================
-- 0739_0737_applies_from_a_windows_copy_of_the_file.sql
-- =============================================================================
-- WHAT WAS WRONG
--   0737 never applied on production. Run from a Windows copy of the file
--   (CRLF line endings), its one two-line search text carried "\r\n" while the
--   function body it searched had been normalised to "\n", so the text was
--   found 0 times, its own guard raised P0001 and the whole run rolled back.
--
-- WHAT THIS DOES
--   Carries 0737's four rewrites unchanged, with the search and replacement
--   text normalised to "\n" too. Each rewrite skips itself when its change is
--   already in the body, so this is a no-op where 0737 did apply, and it
--   applies 0737's change where 0737 did not. 0737 can be skipped.
--   0737 is not edited: merged migrations are immutable (check-migrations).
-- =============================================================================

set search_path = public;

create or replace function pg_temp.mig0739_rewrite(p_fn regprocedure, p_old text, p_new text)
returns void
language plpgsql
as $rw$
declare
  v_def text := replace(pg_get_functiondef(p_fn), E'\r\n', E'\n');
  v_n   integer;
begin
  -- A file checked out on Windows (autocrlf) carries CRLF inside a multi-line
  -- needle; the body was normalised above, so the needle must be too.
  p_old := replace(p_old, E'\r\n', E'\n');
  p_new := replace(p_new, E'\r\n', E'\n');
  if position(p_new in v_def) > 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_old, ''))) / greatest(length(p_old), 1);
  if v_n <> 1 then
    raise exception '0739: % holds the text to change % times, not 1: %', p_fn, v_n, left(p_old, 90);
  end if;
  execute replace(v_def, p_old, p_new);
end;
$rw$;

-- ── 1 · an accessories-only DO hands over without Unit IDs ───────────────────
select pg_temp.mig0739_rewrite('public.delivery_handover_record(uuid,text,text,text,jsonb,text,text,text[],jsonb)'::regprocedure,
$old$    if v_required = 0 then$old$,
$new$    -- 0737 · no Unit list is refused unless every line is counted goods.
    if v_required = 0 and (
         v_do.trip_groups is not null
         or not exists (select 1 from order_lines l where l.order_id = v_do.order_id)
         or exists (select 1 from order_lines l
                      left join product_skus ps on ps.sku = l.sku
                     where l.order_id = v_do.order_id
                       and (ps.sku is null or ps.stock_identity_mode = 'exact_unit'))) then$new$);

select pg_temp.mig0739_rewrite('public.delivery_handover_record(uuid,text,text,text,jsonb,text,text,text[],jsonb)'::regprocedure,
$old$    if p_unit_codes is null or array_length(p_unit_codes, 1) is null then$old$,
$new$    if v_required > 0 and (p_unit_codes is null or array_length(p_unit_codes, 1) is null) then   -- 0737$new$);

select pg_temp.mig0739_rewrite('public.delivery_handover_record(uuid,text,text,text,jsonb,text,text,text[],jsonb)'::regprocedure,
$old$      'Handed over ' || array_length(v_items, 1) || ' of ' || v_required
        || ' Units to '$old$,
$new$      case when v_required = 0 then 'Handed over the accessories'   -- 0737
           else 'Handed over ' || array_length(v_items, 1) || ' of ' || v_required || ' Units' end
        || ' to '$new$);

-- ── 2 · the no-Unit-list pick never sells a counted bulk row ─────────────────
select pg_temp.mig0739_rewrite('public._delivery_mark_delivered(uuid,text,text,text,text,text,text)'::regprocedure,
$old$            WHERE s.sku = v_line.sku$old$,
$new$            WHERE s.sku = v_line.sku
              AND s.qty = 1 AND s.identity_scope = 'unit'   -- 0737$new$);
