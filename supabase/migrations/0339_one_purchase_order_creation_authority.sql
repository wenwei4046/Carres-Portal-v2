-- Card 4B · purchasing_issue_pos_batch(jsonb) becomes the ONLY externally
-- reachable authority that can create a Purchase Order.
--
-- Card 3 closed the order-level door (0338). The Card 4 audit then found FOUR
-- more reachable creation authorities, every one of them still granted to the
-- browser:
--
--   operation_create_po(...)           EXECUTE to PUBLIC · anon · authenticated
--   operation_create_pos_batch(jsonb)  EXECUTE to PUBLIC · anon · authenticated
--   _operation_create_po_inner(...)    EXECUTE to PUBLIC · anon · authenticated
--   purchase_orders / purchase_order_lines   direct INSERT through PostgREST
--
-- This migration closes all four. It deletes NO function, NO policy history and
-- NO row: the definitions stay readable, only the reach is removed.
--
-- WHY REVOKE RATHER THAN DROP the two legacy RPCs: they are the construction
-- history of every PO on file, and `purchasing_issue_pos_batch` delegates to the
-- same `_operation_create_po_inner` helper they call. Dropping would either take
-- the helper with them or force the governed RPC to duplicate PO construction —
-- and Card 4B forbids duplicating that logic.
--
-- WHY THE GOVERNED RPC STILL WORKS: `purchasing_issue_pos_batch` is SECURITY
-- DEFINER owned by `postgres`, so it executes as `postgres`, which keeps EXECUTE
-- on the helper. `purchase_orders` and `purchase_order_lines` are owned by
-- `postgres` with `relforcerowsecurity = false`, so the definer's writes bypass
-- RLS and never depended on the INSERT policies dropped below. Both facts are
-- asserted, not assumed, at the bottom of this file.
--
-- ALSO PRESERVED, DELIBERATELY: `purchasing_split_line_destination(uuid,int,uuid)`
-- keeps its `authenticated` grant. It inserts a purchase_order_LINE into an
-- ALREADY EXISTING document and cannot mint a `purchase_orders` row, so it is an
-- existing-PO workflow, not a creation authority.

set search_path = public, pg_temp;

-- ── 1 · the two legacy RPC authorities ──────────────────────────────────────
revoke execute on function public.operation_create_po(
  uuid, uuid, jsonb, integer, integer[], uuid, text, text
) from public, anon, authenticated;

revoke execute on function public.operation_create_pos_batch(jsonb)
  from public, anon, authenticated;

-- ── 2 · the helper is an implementation detail, never an authority ──────────
revoke execute on function public._operation_create_po_inner(
  uuid, uuid, jsonb, date, integer[], text, uuid
) from public, anon, authenticated;

-- ── 3 · the direct table doors ──────────────────────────────────────────────
-- The GRANT is the outer gate and is checked before RLS, so revoking it is what
-- actually closes the door. The policies are dropped too: a policy that permits
-- an INSERT nobody may attempt is a false statement about the system, and the
-- next reader would take it for the live rule.
revoke insert on table public.purchase_orders from anon, authenticated;
revoke insert on table public.purchase_order_lines from anon, authenticated;

drop policy if exists po_operation_insert on public.purchase_orders;
drop policy if exists po_lines_operation_insert on public.purchase_order_lines;

-- ── SANITY — schema and reach only. No row count is asserted (red line 8). ──
do $sanity$
begin
  -- The governed authority survives, and so does the helper it delegates to.
  if to_regprocedure('public.purchasing_issue_pos_batch(jsonb)') is null then
    raise exception '0339 sanity: the governed Issue authority is missing';
  end if;
  if not has_function_privilege(
    'authenticated', 'public.purchasing_issue_pos_batch(jsonb)', 'execute'
  ) then
    raise exception '0339 sanity: the governed Issue authority is unreachable';
  end if;
  if to_regprocedure(
    'public._operation_create_po_inner(uuid,uuid,jsonb,date,integer[],text,uuid)'
  ) is null then
    raise exception '0339 sanity: the PO construction helper is missing';
  end if;

  -- The governed RPC reaches the helper as its DEFINER, not as the caller.
  if not (
    select p.prosecdef and pg_get_userbyid(p.proowner) = 'postgres'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.oid = 'public.purchasing_issue_pos_batch(jsonb)'::regprocedure
  ) then
    raise exception '0339 sanity: the governed Issue authority is not a postgres-owned SECURITY DEFINER, so revoking the helper would break it';
  end if;
  if not has_function_privilege(
    'postgres',
    'public._operation_create_po_inner(uuid,uuid,jsonb,date,integer[],text,uuid)',
    'execute'
  ) then
    raise exception '0339 sanity: the definer cannot reach the PO construction helper';
  end if;

  -- The definer writes bypass RLS, so dropping the INSERT policies is safe.
  if (
    select bool_or(c.relforcerowsecurity)
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('purchase_orders', 'purchase_order_lines')
  ) then
    raise exception '0339 sanity: FORCE ROW LEVEL SECURITY is on, so the governed writer needs an INSERT policy that this migration just dropped';
  end if;

  -- Every legacy authority is out of the browser's reach.
  if has_function_privilege(
    'authenticated',
    'public.operation_create_po(uuid,uuid,jsonb,integer,integer[],uuid,text,text)',
    'execute'
  ) then
    raise exception '0339 sanity: operation_create_po remains executable';
  end if;
  if has_function_privilege(
    'authenticated', 'public.operation_create_pos_batch(jsonb)', 'execute'
  ) then
    raise exception '0339 sanity: operation_create_pos_batch remains executable';
  end if;
  if has_function_privilege(
    'authenticated',
    'public._operation_create_po_inner(uuid,uuid,jsonb,date,integer[],text,uuid)',
    'execute'
  ) then
    raise exception '0339 sanity: _operation_create_po_inner remains directly executable';
  end if;
  if has_function_privilege(
    'anon',
    'public.operation_create_po(uuid,uuid,jsonb,integer,integer[],uuid,text,text)',
    'execute'
  ) then
    raise exception '0339 sanity: operation_create_po remains executable by anon';
  end if;

  -- The direct table doors are shut for the browser roles and open for nobody
  -- else that PostgREST can authenticate as.
  if has_table_privilege('authenticated', 'public.purchase_orders', 'insert') then
    raise exception '0339 sanity: purchase_orders still accepts a direct INSERT';
  end if;
  if has_table_privilege('authenticated', 'public.purchase_order_lines', 'insert') then
    raise exception '0339 sanity: purchase_order_lines still accepts a direct INSERT';
  end if;
  if has_table_privilege('anon', 'public.purchase_orders', 'insert') then
    raise exception '0339 sanity: purchase_orders still accepts a direct INSERT from anon';
  end if;
  if has_table_privilege('anon', 'public.purchase_order_lines', 'insert') then
    raise exception '0339 sanity: purchase_order_lines still accepts a direct INSERT from anon';
  end if;

  -- What must NOT have been broken on the way past.
  if not has_table_privilege('authenticated', 'public.purchase_orders', 'select') then
    raise exception '0339 sanity: Purchase Orders can no longer be read';
  end if;
  if not has_table_privilege('authenticated', 'public.purchase_order_lines', 'select') then
    raise exception '0339 sanity: Purchase Order lines can no longer be read';
  end if;
  if not has_table_privilege('authenticated', 'public.purchase_orders', 'update') then
    raise exception '0339 sanity: existing Purchase Orders can no longer be updated';
  end if;
  if not has_function_privilege(
    'authenticated', 'public.purchasing_split_line_destination(uuid,integer,uuid)', 'execute'
  ) then
    raise exception '0339 sanity: the existing-PO destination split was collateral damage';
  end if;
end;
$sanity$;
