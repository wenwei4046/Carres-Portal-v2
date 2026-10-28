-- =============================================================================
-- 0647_a_credit_note_follows_a_renumbered_account.sql
-- =============================================================================
-- WHAT WAS WRONG
--   0570 §1 made every foreign key that names gl_accounts(code) ON UPDATE
--   CASCADE, so renumbering an account on the chart carries every document
--   that uses it along. 0642 came after and created two such keys with no ON
--   UPDATE action:
--     supplier_credit_notes.ap_account_code
--     supplier_credit_note_lines.account_code
--   Renumbering an account a credit note uses was therefore refused with a
--   foreign-key error, and the whole renumber rolled back. Found 2026-10-03
--   while building the Forecast (0646) on the same law.
--
-- WHAT THIS DOES
--   Both keys become ON UPDATE CASCADE, rewritten the way 0570 §1 rewrote the
--   others: the printed definition plus `on update cascade`. Neither table has
--   an update trigger that could refuse the cascade (the sanity block checks),
--   so a renumber goes through and changes nothing but the account number.
--   The sanity block then refuses the file if ANY key onto gl_accounts(code)
--   still does not cascade, so the next table to miss it is caught.
--
-- RLS: unchanged. DATA: none read or written. DR/CR: none.
-- =============================================================================

begin;

set local search_path = public, pg_temp;

do $cascade$
declare
  r record;
begin
  for r in
    select c.conname, format('%I.%I', ns.nspname, rel.relname) as tbl, pg_get_constraintdef(c.oid) as def,
           array_length(c.conkey, 1) as cols
      from pg_constraint c
      join pg_class rel    on rel.oid = c.conrelid
      join pg_namespace ns on ns.oid = rel.relnamespace
     where c.contype = 'f'
       and c.confrelid = 'public.gl_accounts'::regclass
       and c.conrelid in ('public.supplier_credit_notes'::regclass, 'public.supplier_credit_note_lines'::regclass)
       and c.confupdtype <> 'c'
  loop
    -- As 0570: ON UPDATE is appended to the printed clause, which is only right
    -- for a one-column key that is not DEFERRABLE, not MATCH FULL, not NOT VALID.
    if r.def ~* '\mdeferrable\M|\mmatch\M|\mnot valid\M' or r.cols <> 1 then
      raise exception '0647: % is a shape this migration does not rewrite: %', r.conname, r.def;
    end if;
    execute format('alter table %s drop constraint %I, add constraint %I %s on update cascade',
                   r.tbl, r.conname, r.conname, r.def);
  end loop;
end $cascade$;

do $sanity$
declare
  v_left text;
begin
  select string_agg(c.conrelid::regclass::text || '.' || c.conname, ', ')
    into v_left
    from pg_constraint c
   where c.contype = 'f' and c.confrelid = 'public.gl_accounts'::regclass and c.confupdtype <> 'c';
  if v_left is not null then
    raise exception '0647 sanity: these keys do not follow a renumbered account: %', v_left;
  end if;
  if exists (select 1 from pg_trigger t
              where t.tgrelid in ('public.supplier_credit_notes'::regclass, 'public.supplier_credit_note_lines'::regclass)
                and not t.tgisinternal) then
    raise exception '0647 sanity: a credit note table has a trigger that could refuse a renumber; give it 0570''s allowance';
  end if;
end
$sanity$;

commit;
