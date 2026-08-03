-- =====================================================================
-- 0316_po_lines_quantities_are_rpc_only
-- Card C1b (Jess, 2026-08-03) — DATA INTEGRITY.
--
-- C1 closed the last Office BUTTON that moved stock without opening a
-- Receiving Session. The audit that card required then found a wider hole,
-- and it was proven on prod in a rolled-back transaction rather than argued:
-- an Office login (`role=operation`) could PATCH `purchase_order_lines`
-- straight through PostgREST —
--
--     direct PATCH accepted?  true
--     received_qty  0 -> 1
--     Receiving Sessions = 0 · events = 0 · stock moved = no
--
-- which produces three facts that disagree with each other: the PO's
-- received quantity, the inventory, and the receiving record.
--
-- **Jess corrected the fix, and the correction is the reason this file exists
-- in this shape.** The first proposal was a column-level revoke:
--
--     revoke update (received_qty, damaged_qty, wrong_item_qty) ...
--
-- That does not work. In PostgreSQL a TABLE-level UPDATE privilege carries
-- update on every column; revoking a column subset does not subtract from it.
-- The table grant has to go first, and only columns with EVIDENCE of a
-- legitimate client writer may be granted back.
--
-- ── The audit, before touching anything ─────────────────────────────────
--   ① table-level : `authenticated` AND `anon` both hold full UPDATE.
--   ② column-level: NOTHING narrower exists — the 14 rows information_schema
--                   reports are just the table grant expanded per column.
--   ③ legitimate client writers: **ZERO**. Every `purchase_order_lines`
--                   reference in `apps/api` is a SELECT, and `apps/web` has no
--                   Supabase table client at all — it goes through Hono.
--   ④ every writer is a SECURITY DEFINER function owned by `postgres`
--                   (`operation_receive_po_with_do` · `office_receive_post`'s
--                   callee · `_operation_create_po_inner` ·
--                   `operation_issue_pos_for_order` · `operation_receive_po_line`
--                   · the three `purchasing_*_line_*` doors), so none of them
--                   reads the caller's table privileges and none is affected.
--
-- So there are no safe columns to grant back: nothing outside a DEFINER RPC
-- has ever needed to write this table. The rule this file makes structural:
--
--   **A PO line's quantities may only change inside an RPC that carries the
--   full business side-effects. No client may UPDATE this table at all.**
--
-- DELIBERATELY NOT TOUCHED (Jess's frozen scope): the partner pickup flow ·
-- the receiving UI · inventory architecture · the RLS policies (the UPDATE
-- policy simply becomes unreachable — it is a second lock, not a lie) · and
-- INSERT/DELETE, which are open in exactly the same way and are REPORTED
-- rather than swept in without her word.
-- =====================================================================

-- §1 · the table grant goes, for every client role -------------------------
--
-- `public` too, and not because it was measured to hold the privilege — it
-- was measured NOT to. It is here for the 0268 lesson: a later `grant ... to
-- public` would silently restore this hole to everyone, and a revoke that
-- names public makes the intent explicit to whoever writes that migration.
revoke update on public.purchase_order_lines from authenticated, anon, public;

-- §2 · nothing is granted back ---------------------------------------------
--
-- Not an omission. See ③ above: no client has ever written this table, so
-- there is no column with evidence behind it. When a future card needs one,
-- it grants that ONE column with the writer named in its comment.

-- §3 · sanity — the assertions Jess asked to be permanent ------------------
do $$
declare v int; c text;
begin
  -- table-level UPDATE must be gone for both client roles
  foreach c in array array['authenticated','anon'] loop
    if has_table_privilege(c, 'public.purchase_order_lines', 'UPDATE') then
      raise exception 'sanity: % still holds table-level UPDATE on purchase_order_lines', c;
    end if;
  end loop;

  -- the three business quantities, asserted by name
  foreach c in array array['received_qty','damaged_qty','wrong_item_qty'] loop
    if has_column_privilege('authenticated', 'public.purchase_order_lines', c, 'UPDATE') then
      raise exception 'sanity: authenticated can still UPDATE %', c;
    end if;
    if has_column_privilege('anon', 'public.purchase_order_lines', c, 'UPDATE') then
      raise exception 'sanity: anon can still UPDATE %', c;
    end if;
  end loop;

  -- no column survived the revoke by accident
  select count(*) into v from information_schema.column_privileges
   where table_schema = 'public' and table_name = 'purchase_order_lines'
     and privilege_type = 'UPDATE' and grantee in ('authenticated','anon');
  if v <> 0 then
    raise exception 'sanity: % column-level UPDATE grants survive for client roles', v;
  end if;

  -- the engine must be untouched: reads stay, and the DEFINER writers stay
  if not has_table_privilege('authenticated', 'public.purchase_order_lines', 'SELECT') then
    raise exception 'sanity: authenticated lost SELECT — the portal cannot read PO lines';
  end if;
  select count(*) into v from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef
     and p.proname in ('operation_receive_po_with_do','office_receive_post',
                       'warehouse_receipt_check_in','_operation_create_po_inner',
                       'operation_issue_pos_for_order','purchasing_set_line_destination',
                       'purchasing_split_line_destination','purchasing_set_line_ops_remark');
  if v <> 8 then
    raise exception 'sanity: expected 8 SECURITY DEFINER writers/doors, found %', v;
  end if;

  -- service_role is the server's own key and is deliberately left alone
  if not has_table_privilege('service_role', 'public.purchase_order_lines', 'UPDATE') then
    raise exception 'sanity: service_role must keep UPDATE — cron and admin routes use it';
  end if;
end $$;
