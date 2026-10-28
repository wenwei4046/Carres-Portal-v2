-- ═══════════════════════════════════════════════════════════════════════════
-- 0717 · PO AMENDMENTS AND PO CANCELLATIONS WAIT FOR APPROVAL
--
-- Weisiang's decision (Mr Lim, WhatsApp 2026-10-22, relayed by YH 2026-10-23;
-- Jess was not part of this decision): PO amendments and PO cancellations go
-- through approval queues, the Houzs way (Houzs scm-v2/PoAmendments.tsx and
-- scm-v2/CancelRequests.tsx). Overturns Purchasing MASTER "not commission a new
-- amendment register" and "§5.8.1 remains the sole outstanding-PO cancellation
-- journey" (no two-level chain).
--
-- 1 · po_change_requests: one row per request. The payload is the EXACT
--     command the existing engine takes, so approval changes nothing about
--     what the engine checks.
-- 2 · purchasing_request_po_change: Operation / Principal persons file one.
-- 3 · purchasing_decide_po_change:
--       amendment     one approval, Purchasing Approver, then the existing
--                     PO edit engine purchasing_revise_po runs.
--       cancellation  level 1 PO Duty (its cover or an Operations Superuser,
--                     never today's Purchasing Approver),
--                     level 2 Purchasing Approver, a different person, then
--                     the existing cancel engine operation_cancel_po runs.
--       "Purchasing Approver" here is any active Principal person — the role
--       the duty requires — so the duty holder's own request is decided by
--       another Principal (YH, chat 2026-10-26: "another person with
--       equivalent permissions ... or more permissions"; Houzs gates on the
--       approve permission, not one holder).
--     Nobody decides their own request. The engine runs in the SAME
--     transaction: if it refuses, the approval is not recorded either.
-- 4 · The engines are no longer executable by signed-in callers, so the
--     queue is the only way to change or cancel a PO. Recording supplier
--     facts and the commercial exception decision stay direct through
--     purchasing_record_po_cancellation, which refuses `complete`.
--     The engines' source is not touched (0703's release check reads its md5).
-- ═══════════════════════════════════════════════════════════════════════════

begin;

create table public.po_change_requests (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('amendment','cancellation')),
  po_id text not null references public.purchase_orders(id),
  reason text not null check (reason ~ '[^[:space:]]'),
  summary text not null,
  payload jsonb not null,
  status text not null default 'requested'
    check (status in ('requested','first_approved','approved','rejected','withdrawn')),
  requested_by uuid not null references public.app_users(id),
  requested_at timestamptz not null default now(),
  first_approved_by uuid references public.app_users(id),
  first_approved_at timestamptz,
  decided_by uuid references public.app_users(id),
  decided_at timestamptz,
  decision_note text,
  result jsonb
);
-- One open request per PO per kind: a second one would be approved against
-- a PO the first one already changed.
create unique index po_change_requests_one_open on public.po_change_requests(po_id, kind)
  where status in ('requested','first_approved');
alter table public.po_change_requests enable row level security;
create policy po_change_requests_read on public.po_change_requests for select to authenticated
  using (public.is_operation());
revoke all on public.po_change_requests from public, anon, authenticated;
grant select on public.po_change_requests to authenticated;

create or replace function public.purchasing_request_po_change(p_kind text, p_po_id text, p_reason text, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $fn$
declare v_id uuid; v_summary text; v_status text;
begin
  if not public.is_operation() or not public.workspace_is_person(auth.uid()) then
    raise exception 'active authorised staff required' using errcode = '42501', detail = 'forbidden';
  end if;
  if coalesce(p_reason, '') !~ '[^[:space:]]' then
    raise exception 'Say why this purchase order is changing.' using errcode = '22023', detail = 'reason_required';
  end if;
  select status into v_status from public.purchase_orders where id = p_po_id;
  if v_status is distinct from 'open' then
    raise exception 'Only an open purchase order can change.' using errcode = '22023', detail = 'po_not_open';
  end if;
  if p_kind = 'amendment' then
    if jsonb_typeof(p_payload) is distinct from 'array' then
      raise exception 'lines must be a non-empty array' using errcode = '22023', detail = 'invalid_param';
    end if;
    select string_agg(format('%s: Qty %s to %s%s', l.sku, l.qty, x->>'qty',
             case when (x->>'destination_id') is distinct from l.destination_id::text then ', Deliver To changes' else '' end),
           '; ' order by l.sku)
      into v_summary
      from jsonb_array_elements(p_payload) x
      join public.purchase_order_lines l on l.po_id = p_po_id and l.id::text = x->>'line_id';
    if v_summary is null or (select count(*) from jsonb_array_elements(p_payload)) <>
       (select count(*) from jsonb_array_elements(p_payload) x join public.purchase_order_lines l on l.po_id = p_po_id and l.id::text = x->>'line_id') then
      raise exception 'A line is not on this purchase order.' using errcode = '22023', detail = 'invalid_param';
    end if;
  elsif p_kind = 'cancellation' then
    if p_payload = '{}'::jsonb then
      v_summary := 'Whole PO';
    elsif p_payload->>'action' is distinct from 'complete' then
      raise exception 'Only cancelling goods waits for approval.' using errcode = '22023', detail = 'invalid_param';
    else
      select string_agg(format('%s: cancel %s', l.sku, x->>'qty'), '; ' order by l.sku)
        into v_summary
        from jsonb_array_elements(p_payload->'lines') x
        join public.purchase_order_lines l on l.po_id = p_po_id and l.id::text = x->>'lineId';
      if v_summary is null then
        raise exception 'A line is not on this purchase order.' using errcode = '22023', detail = 'invalid_param';
      end if;
    end if;
  else
    raise exception 'unknown request kind' using errcode = '22023', detail = 'invalid_param';
  end if;
  begin
    insert into public.po_change_requests(kind, po_id, reason, summary, payload, requested_by)
    values (p_kind, p_po_id, btrim(p_reason), v_summary, p_payload, auth.uid())
    returning id into v_id;
  exception when unique_violation then
    raise exception 'This purchase order already has a request waiting for approval.'
      using errcode = '23505', detail = 'request_already_open';
  end;
  insert into public.po_history(po_id, text, by_role, by_user_id)
  values (p_po_id, format('%s sent for approval · %s', initcap(p_kind), btrim(p_reason)), public.app_role(), auth.uid());
  return jsonb_build_object('id', v_id, 'status', 'requested');
end;
$fn$;

create or replace function public.purchasing_decide_po_change(p_id uuid, p_approve boolean, p_note text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $fn$
declare r public.po_change_requests; v_uid uuid := auth.uid(); v_final boolean; v_result jsonb; v_status text;
begin
  select * into r from public.po_change_requests where id = p_id for update;
  if not found then
    raise exception 'Request not found' using errcode = '22023', detail = 'not_found';
  end if;
  if r.status not in ('requested','first_approved') then
    raise exception 'This request is already decided.' using errcode = '22023', detail = 'already_decided';
  end if;
  if v_uid is not distinct from r.requested_by then
    raise exception 'You cannot decide your own request.' using errcode = '42501', detail = 'own_request';
  end if;
  if r.kind = 'cancellation' and r.status = 'requested' then
    -- Level 1 · PO Duty, its dated cover, or an Operations Superuser — but not
    -- today's Purchasing Approver, who gives level 2 (a principal person is a
    -- superuser, and level 1 by the approver would leave level 2 nobody).
    if not public.is_operation() or not public.workspace_is_person(v_uid) or not public.purchasing_po_duty_may_act(v_uid)
       or v_uid is not distinct from nullif(public.workspace_resolve_duty('purchasing_approver')->>'actor_user_id', '')::uuid then
      raise exception 'Only PO Duty or its cover gives the first approval.' using errcode = '42501', detail = 'not_po_duty';
    end if;
    v_final := false;
  else
    -- Follows Houzs frontend/src/vendor/scm/lib/document-cancel-queries.ts:237-244 per Weisiang's ruling (2026-10-22): clear Carres rules, implement Houzs.
    -- Amendment, or cancellation level 2 · any active Principal person: today's
    -- Purchasing Approver or another one with the same permission (see header).
    if not public.is_operation() or not public.workspace_is_person(v_uid)
       or public.app_role()::text is distinct from 'principal' then
      raise exception 'Only the Purchasing Approver or another Principal gives this approval.'
        using errcode = '42501', detail = 'not_purchase_approver';
    end if;
    if v_uid is not distinct from r.first_approved_by then
      raise exception 'The second approval must be another person.' using errcode = '42501', detail = 'same_approver';
    end if;
    v_final := true;
  end if;

  if not p_approve then
    if coalesce(p_note, '') !~ '[^[:space:]]' then
      raise exception 'Say why this request is rejected.' using errcode = '22023', detail = 'reason_required';
    end if;
    v_status := 'rejected';
    update public.po_change_requests
       set status = v_status, decided_by = v_uid, decided_at = now(), decision_note = btrim(p_note)
     where id = r.id;
  elsif not v_final then
    v_status := 'first_approved';
    update public.po_change_requests
       set status = v_status, first_approved_by = v_uid, first_approved_at = now()
     where id = r.id;
  else
    -- The existing engines, unchanged. Their refusal rolls this approval back.
    if r.kind = 'amendment' then
      v_result := public.purchasing_revise_po(r.po_id, r.reason, r.payload);
    elsif r.payload = '{}'::jsonb then
      v_result := to_jsonb(public.operation_cancel_po(r.po_id, r.reason));
    else
      v_result := public.operation_cancel_po(r.po_id, r.reason, r.payload);
    end if;
    v_status := 'approved';
    update public.po_change_requests
       set status = v_status, decided_by = v_uid, decided_at = now(),
           decision_note = nullif(btrim(coalesce(p_note, '')), ''), result = v_result
     where id = r.id;
  end if;
  insert into public.po_history(po_id, text, by_role, by_user_id)
  values (r.po_id, format('%s %s', initcap(r.kind), case v_status when 'first_approved' then 'first approval given'
          when 'approved' then 'approved and applied' else 'rejected' end), public.app_role(), v_uid);
  return jsonb_build_object('id', r.id, 'status', v_status, 'result', v_result);
end;
$fn$;

-- 5 · purchasing_withdraw_po_change: the Houzs withdraw. The requester, or
--     anyone who could decide it, pulls an open request back; it closes as
--     `withdrawn`, which frees the one-open-request slot. An amendment only
--     before it is decided (Houzs backend/src/scm/routes/po-amendments.ts:699-727,
--     REQUESTED only); a cancellation at either level (Houzs
--     backend/src/scm/shared/document-cancel.ts:269-277). The reason is optional.
--     Follows Houzs (files above) per Weisiang's ruling (2026-10-22): clear Carres rules, implement Houzs.
create or replace function public.purchasing_withdraw_po_change(p_id uuid, p_note text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $fn$
declare r public.po_change_requests; v_uid uuid := auth.uid(); v_principal boolean;
begin
  if not public.is_operation() or not public.workspace_is_person(v_uid) then
    raise exception 'active authorised staff required' using errcode = '42501', detail = 'forbidden';
  end if;
  select * into r from public.po_change_requests where id = p_id for update;
  if not found then
    raise exception 'Request not found' using errcode = '22023', detail = 'not_found';
  end if;
  if r.status not in ('requested','first_approved') or (r.kind = 'amendment' and r.status <> 'requested') then
    raise exception 'This request is already decided.' using errcode = '22023', detail = 'already_decided';
  end if;
  v_principal := public.app_role()::text = 'principal';
  if v_uid is distinct from r.requested_by and not v_principal
     and not (r.kind = 'cancellation' and public.purchasing_po_duty_may_act(v_uid)) then
    raise exception 'Only the person who asked, or an approver, can withdraw this request.'
      using errcode = '42501', detail = 'withdraw_forbidden';
  end if;
  update public.po_change_requests
     set status = 'withdrawn', decided_by = v_uid, decided_at = now(),
         decision_note = nullif(btrim(coalesce(p_note, '')), '')
   where id = r.id;
  insert into public.po_history(po_id, text, by_role, by_user_id)
  values (r.po_id, format('%s withdrawn', initcap(r.kind)), public.app_role(), v_uid);
  return jsonb_build_object('id', r.id, 'status', 'withdrawn');
end;
$fn$;

-- Supplier facts and the commercial exception decision stay direct (§5.8.1);
-- only `complete` — the act that cancels — waits for the queue.
create or replace function public.purchasing_record_po_cancellation(p_po_id text, p_reason text, p_cancellation jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $fn$
begin
  if p_cancellation->>'action' = 'complete' then
    raise exception 'Cancelling goods needs two approvals. Send it for approval.' using errcode = '42501', detail = 'approval_required';
  end if;
  return public.operation_cancel_po(p_po_id, p_reason, p_cancellation);
end;
$fn$;

revoke all on function public.purchasing_request_po_change(text,text,text,jsonb) from public, anon;
revoke all on function public.purchasing_decide_po_change(uuid,boolean,text) from public, anon;
revoke all on function public.purchasing_record_po_cancellation(text,text,jsonb) from public, anon;
revoke all on function public.purchasing_withdraw_po_change(uuid,text) from public, anon;
grant execute on function public.purchasing_withdraw_po_change(uuid,text) to authenticated;
grant execute on function public.purchasing_request_po_change(text,text,text,jsonb) to authenticated;
grant execute on function public.purchasing_decide_po_change(uuid,boolean,text) to authenticated;
grant execute on function public.purchasing_record_po_cancellation(text,text,jsonb) to authenticated;

-- The queue is the only door: signed-in callers lose the engines themselves.
revoke execute on function public.purchasing_revise_po(text,text,jsonb) from public, anon, authenticated;
revoke execute on function public.operation_cancel_po(text,text,jsonb) from public, anon, authenticated;
revoke execute on function public.operation_cancel_po(text,text) from public, anon, authenticated;

do $verify$
begin
  if has_function_privilege('authenticated', 'public.purchasing_revise_po(text,text,jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.operation_cancel_po(text,text,jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.operation_cancel_po(text,text)', 'execute') then
    raise exception '0717: a PO engine is still executable by authenticated';
  end if;
end;
$verify$;

commit;
