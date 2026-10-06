-- ---------------------------------------------------------------------------
-- 0309 · Purchase requests proof — ⚠️ RECOVERED FILE, ALREADY LIVE
--
-- **Reconstruction, not the original** — see 0308's header for the full P0
-- record (applied 2026-08-01, tracker version 20260801103844; file lost with
-- closed PR #522; read back from production 2026-08-19). The 0308/0309
-- content split is INFERENCE from the names: this one carries the PROOF that
-- an ordered request left — the `purchase_order_lines.purchase_request_id`
-- link its cancel door reads ("Ordered state is derived from
-- purchase_order_lines.purchase_request_id", the live table's own comment) —
-- and the cancel door itself.
--
-- 0359 retired the prototype (table renamed to
-- `purchase_requests_checkpoint_a`, doors revoked). The column stays where
-- it is; the issue slice records the demand link's fate. Idempotent; a
-- re-application is a no-op.
-- ---------------------------------------------------------------------------

set search_path = public, pg_temp;

alter table public.purchase_order_lines
  add column if not exists purchase_request_id uuid references public.purchase_requests(id);

create or replace function public.purchase_request_cancel(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_role text := public.app_role();
  v_reason text := nullif(trim(p_reason), '');
  v_cancelled timestamptz;
begin
  if v_uid is null or v_role is null or v_role not in ('operation', 'principal') then
    raise exception 'purchase_request_cancel: not allowed' using errcode = '42501';
  end if;

  if v_reason is null then
    raise exception 'a cancellation needs a reason'
      using errcode = '22023', detail = 'reason_required';
  end if;

  select cancelled_at into v_cancelled
    from purchase_requests where id = p_id for update;
  if not found then
    raise exception 'request not found' using errcode = '22023', detail = 'request_not_found';
  end if;
  if v_cancelled is not null then
    raise exception 'request is already cancelled'
      using errcode = '22023', detail = 'request_already_cancelled';
  end if;

  -- Ordered state is DERIVED from the line-level link; an issued request is
  -- permanent evidence and cannot be cancelled from this flow.
  if exists (select 1 from purchase_order_lines where purchase_request_id = p_id) then
    raise exception 'request is already on a purchase order'
      using errcode = '22023', detail = 'request_already_ordered';
  end if;

  update purchase_requests
     set cancelled_at = now(), cancelled_reason = v_reason
   where id = p_id;

  insert into audit_log (role, actor_text, action, ref)
  values (v_role::public.app_role,
          (select name from app_users where id = v_uid),
          format('cancelled purchase request: %s', v_reason),
          p_id::text);
end;
$function$;
