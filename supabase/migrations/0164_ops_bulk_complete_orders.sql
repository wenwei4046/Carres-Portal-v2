-- =============================================================================
-- 0164_ops_bulk_complete_orders.sql
-- BACKFILL (2026-06-14): verbatim copy of the migration applied to staging=prod
-- on 2026-06-12 via Supabase MCP (recorded in schema_migrations as
-- "ops_bulk_complete_orders", version 20260612094941). NOT re-applied.
--
-- NOTE for Phase 11: this function reads/writes orders.operation_stage +
-- orders.status (sets both to 'delivered'). It is one of the 30 functions the
-- Phase 11.2 state-machine rewrite must update when the enum changes.
-- =============================================================================

create or replace function public.ops_bulk_complete_orders(p_order_ids uuid[])
  returns jsonb
  language plpgsql
  security definer
  set search_path to 'public'
as $function$
declare
  v_role text := (select auth.jwt()->'app_metadata'->>'role');
  v_uid uuid := auth.uid();
  v_ids uuid[];
  v_done int;
begin
  if v_role is null or v_role not in ('operation', 'principal') then
    raise exception 'Operation or principal only';
  end if;
  if p_order_ids is null or array_length(p_order_ids, 1) is null then
    return jsonb_build_object('completed', 0, 'skipped', 0);
  end if;

  with upd as (
    update orders o
       set status = 'delivered',
           operation_stage = 'delivered',
           delivered_at = coalesce(o.delivered_at, now())
     where o.id = any(p_order_ids)
       and o.source_system = 'autocount'
       and o.status not in ('delivered', 'cancelled')
     returning o.id
  )
  select array_agg(id), count(*) into v_ids, v_done from upd;

  insert into order_history (order_id, text, by_role, by_user_id)
  select id, 'Marked completed — bulk AutoCount legacy cleanup', 'operation', v_uid
    from unnest(coalesce(v_ids, '{}'::uuid[])) as t(id);

  return jsonb_build_object(
    'completed', coalesce(v_done, 0),
    'skipped', array_length(p_order_ids, 1) - coalesce(v_done, 0)
  );
end;
$function$;
