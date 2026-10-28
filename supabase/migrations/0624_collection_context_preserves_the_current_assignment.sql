-- Preserve the authoritative current actor without changing history or access.
create or replace function public.payment_collection_owner_context(
  p_order_ids uuid[],
  p_on date default null
) returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $fn$
declare
  v_on date := coalesce(p_on, (timezone('Asia/Kuala_Lumpur', now()))::date);
  v_out jsonb := '[]'::jsonb;
  v_order uuid;
  v_r jsonb;
  v_normal uuid;
begin
  if not coalesce((select public.is_internal()), false) then
    raise exception 'forbidden' using errcode = '42501', detail = 'not_internal';
  end if;

  for v_order in select distinct x from unnest(coalesce(p_order_ids, '{}'::uuid[])) x loop
    v_r := public.delivery_responsible_operation(v_order, v_on);
    v_normal := nullif(v_r->>'normal_user_id', '')::uuid;
    -- Current assignment can survive departure of the original person.
    -- Keep explicit null actors too: consumers must not resurrect an old PIC.
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'order_id', v_order,
      'normal_user_id', v_normal,
      'normal_user_name', v_r->>'normal_user_name',
      'cover_user_id', case when (v_r->>'is_cover')::boolean then nullif(v_r->>'acting_user_id', '')::uuid else null end,
      'cover_user_name', case when (v_r->>'is_cover')::boolean then v_r->>'acting_user_name' else null end,
      'acting_user_id', nullif(v_r->>'acting_user_id', '')::uuid,
      'acting_user_name', v_r->>'acting_user_name',
      'is_cover', (v_r->>'is_cover')::boolean,
      'cover_ends_on', nullif(v_r->>'cover_ends_on', '')::date,
      'source', v_r->>'source',
      'effective_from', nullif(v_r->>'effective_from', '')::date,
      'established_on', (select min(e.effective_from) from public.payment_collection_owners e
                          where e.order_id = v_order and e.source = 'established'),
      'history', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', h.id, 'source', h.source,
          'owner_user_id', h.owner_user_id, 'owner_user_name', ho.name,
          'previous_owner_user_id', h.previous_owner_user_id, 'previous_owner_user_name', hp.name,
          'reason', h.reason,
          'changed_by', h.changed_by, 'changed_by_name', hb.name,
          'changed_at', h.changed_at, 'effective_from', h.effective_from
        ) order by h.effective_from asc, h.changed_at asc)
          from public.payment_collection_owners h
          left join public.app_users ho on ho.id = h.owner_user_id
          left join public.app_users hp on hp.id = h.previous_owner_user_id
          left join public.app_users hb on hb.id = h.changed_by
         where h.order_id = v_order
      ), '[]'::jsonb)
    ));
  end loop;

  return v_out;
end;
$fn$;

