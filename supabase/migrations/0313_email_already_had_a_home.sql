-- ============================================================================
-- 0313 — email already had a home  (Jess, 2026-08-02)
--
-- ⚠️ THIS FILE IS A RECOVERY, NOT A NEW MIGRATION. ⚠️
--
-- Applied to production 2026-08-02 (tracker version 20260802145803); the .sql
-- was never committed to any branch — verified 2026-08-03 with
-- `git log --all --diff-filter=A`. Reconstructed from production and from the
-- record in `docs/CHECKPOINT-purchase-orders.md` §2. **Do NOT re-apply.**
--
-- WHAT HAPPENED. 0312 added `suppliers.email` for the mailto door. It should
-- never have: `contact_email` had existed on that table since the supplier
-- portal, and TWO of ten suppliers had already filled it. Two columns for one
-- fact is `ops_order_control.balance`'s disease — the column nobody writes
-- that a lock reads for months. 0313 dropped the new one; the mailto reads
-- `contact_email`. Measured on prod 2026-08-03: `suppliers` holds
-- `contact_email` and no `email`.
--
-- ONE DEPARTURE FROM THE ORIGINAL, AND IT IS DELIBERATE — recorded, not hidden.
-- The original 0312 CREATED `suppliers.email` and this file DROPPED it. The
-- 0312 recovery file does NOT create it, so on a fresh `supabase db reset` the
-- statement below is a no-op. The end state is identical to production either
-- way; creating a column purely to drop it one file later adds a window in
-- which a fresh database holds a column prod does not, and a second way for
-- the reset to fail. Faithfulness to the END STATE beats faithfulness to the
-- keystrokes. If that trade is ever unwanted, the fix is one `add column` back
-- in 0312 — nothing else depends on it.
--
-- THE GUARD IS THE POINT AND IT IS KEPT. A drop that silently discards rows is
-- how a fact disappears; this one refuses rather than destroys.
-- ============================================================================

do $$
declare
  v_rows bigint;
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'suppliers' and column_name = 'email'
  ) then
    execute 'select count(*) from public.suppliers where email is not null' into v_rows;
    if v_rows > 0 then
      raise exception
        '0313: refusing to drop suppliers.email — % row(s) hold a value. Move them to contact_email first.', v_rows;
    end if;
    execute 'alter table public.suppliers drop column email';
    raise notice '0313: suppliers.email dropped (0 rows held a value). contact_email is the one home.';
  else
    raise notice '0313: suppliers.email is absent — nothing to drop (expected on a fresh database).';
  end if;
end $$;

-- Verbatim from production (`col_description`, read 2026-08-03) — NOT re-worded
-- by this recovery. A recovery file that improves the prose is a file that no
-- longer matches the database it claims to reproduce.
comment on column public.suppliers.contact_email is
  'The supplier''s email — the ONE column, read by the workspace''s mailto: door (Jess 2026-08-02). 0312 briefly added a second `email` column; 0313 dropped it before anything wrote to it.';

-- ---------------------------------------------------------------------------
-- sanity — one home, and it is the one the code reads
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'suppliers' and column_name = 'email'
  ) then
    raise exception '0313: suppliers.email still exists after the run';
  end if;
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'suppliers' and column_name = 'contact_email'
  ) then
    raise exception '0313: suppliers.contact_email is missing — the mailto door has no address to read';
  end if;
end $$;
