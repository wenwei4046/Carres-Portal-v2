-- ═══════════════════════════════════════════════════════════════════════════
-- 0474 · THE PURCHASING APPROVER DUTY ACTUALLY RESOLVES
--
-- Owner instruction 2026-09-11: "Verify Jess's Purchasing Approver route
-- through the shared duty authority." Verified — and the route does not
-- reach the door.
--
-- ── WHAT WAS MEASURED (production, 2026-09-11) ─────────────────────────────
--
--   · Staff & Duties ALREADY offers `Purchasing Approver`
--     (`apps/api/src/routes/operation/workspace-duties.ts`) and writes every
--     assignment to `workspace_duty_assignments`, resolved by
--     `workspace_resolve_duty(duty_key, on_date)` — the Shared Duty Resolver
--     the Constitution's GLOBAL DUTY LAW names. Today that table holds 13
--     `po_duty` rows and 13 `grn_duty` rows, and none for
--     `purchasing_approver`.
--   · The Work Engine already NAMES the key: `manual_purchase.approve`
--     carries `ownerRule` / `ownerDutyKey` = `purchasing_approver`.
--   · The DOOR asks a different system entirely. `purchasing_decide_request`
--     gates on `purchasing_settings_gate`, which reads the HR POSITION duty
--     table `org_position_duties` for `ops_manager`. So an assignment made in
--     Staff & Duties could never reach the decision, and Approve/Refuse
--     worked only because Jess holds the legacy `ops_manager` position duty.
--
-- ⚠️ THE FIRST DRAFT OF THIS MIGRATION GOT THAT WRONG and inserted the duty
-- into `org_duties` — the HR position catalogue, which Staff & Duties never
-- writes. It would have added a row nobody could reach from the screen that
-- assigns duties. The two systems are:
--
--     org_duties / org_position_duties     POSITION duties (ops_manager,
--                                          stock_planner). Written by
--                                          `hr_set_position_duty`.
--     workspace_duty_assignments/_covers   the SHARED DUTY RESOLVER (0425).
--                                          Written by Staff & Duties, read by
--                                          `workspace_resolve_duty`.
--
-- `docs/purchasing/MASTER.md` §9.2 rules the target: "The approved target is
-- the resolved `Purchasing Approver` Duty… legacy implementation that must
-- converge behind the Shared Duty Resolver." This migration performs that
-- convergence for the decide door. It assigns nobody: who holds the duty is
-- configuration Jess sets in Workspace → Staff & Duties, and this file has no
-- business writing it.
--
-- ── WHY NOT SIMPLY WIDEN `purchasing_settings_gate` ────────────────────────
--
-- Because that gate is not the approval gate. Ten doors call it — the
-- Purchasing Settings writers among them (0303 · 0307 · 0318 · 0359 · 0398 ·
-- 0399 · 0401 · 0423 · 0424) — so admitting the Purchasing Approver there
-- would hand whoever approves a purchase the power to rewrite production
-- days, transit days and Deliver To. Approving a purchase and configuring
-- Purchasing are two duties, and this file keeps them two.
--
-- ── THE FALLBACK RETIRES ITSELF ────────────────────────────────────────────
--
-- The `ops_manager` position duty still passes, but ONLY while
-- `purchasing_approver` resolves to nobody today. So:
--   · today, with nobody assigned, the gate admits exactly who it admitted
--     before this migration — Jess. Nothing changes and nothing breaks.
--   · the moment Jess assigns the duty in Staff & Duties, the approver is the
--     resolved holder (or today's cover) and the legacy rung disappears
--     without another migration.
-- No email list is honoured here: `LEGACY_OPS_MANAGER_EMAILS` never reached
-- this door and does not start now.
--
-- SCHEMA ONLY. No row of business data is written, moved or deleted.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ── 1 · The approval gate, on the SHARED DUTY RESOLVER ────────────────────
-- Separate from `purchasing_settings_gate` on purpose: see the header.
create or replace function public.purchasing_approver_gate()
returns text
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_role   text := (select public.app_role());
  v_actor  uuid;
  v_duties text[];
begin
  if v_role is null then
    raise exception 'forbidden' using errcode = '42501',
      detail = 'no active account';
  end if;

  -- The owner decides anything; every other seat decides by duty.
  if v_role = 'principal' then
    return v_role;
  end if;

  -- ⭐ THE ONE SHARED RESOLVER (0425): today's assignment, and today's cover
  -- if there is one. `actor_user_id` is already `coalesce(cover, normal)`, so
  -- a buddy covering the approver decides while they cover and not after.
  v_actor := nullif(
    public.workspace_resolve_duty('purchasing_approver')->>'actor_user_id', ''
  )::uuid;

  if v_actor is not null then
    if v_actor = auth.uid() then
      return v_role;
    end if;
    -- SOMEBODY holds it and it is not this account. The legacy rung is over
    -- the moment the duty is assigned — that is the convergence, and it
    -- happens without another migration.
    raise exception 'forbidden' using errcode = '42501',
      detail = 'not_purchase_approver';
  end if;

  -- Nobody holds it yet. The operations manager keeps deciding exactly as
  -- they did before 0474, so applying this changes nothing on the day.
  select coalesce(array_agg(pd.duty_key), '{}'::text[])
    into v_duties
    from app_users u
    join org_position_duties pd on pd.position_id = u.position_id
   where u.id = auth.uid()
     and u.role <> 'dealer'
     and u.status = 'active';

  if 'ops_manager' = any(coalesce(v_duties, '{}'::text[])) then
    return v_role;
  end if;

  raise exception 'forbidden' using errcode = '42501',
    detail = 'not_purchase_approver';
end;
$function$;

revoke all on function public.purchasing_approver_gate() from public;
revoke all on function public.purchasing_approver_gate() from anon;
grant execute on function public.purchasing_approver_gate() to authenticated;

comment on function public.purchasing_approver_gate() is
  'Who may decide a Manual Purchase (0474). principal, or whoever workspace_resolve_duty(''purchasing_approver'') names as today''s actor (assignment, or today''s cover); while that duty has no holder the ops_manager position duty decides, and that rung ends the moment the duty is assigned in Staff & Duties. Deliberately NOT purchasing_settings_gate: deciding a purchase does not grant the Purchasing Settings numbers.';

-- ── 2 · The decide door asks the approval gate ─────────────────────────────
-- Byte-identical to the live body except for the gate on its first line.
create or replace function public.purchasing_decide_request(
  p_id uuid,
  p_decision text,
  p_reason text default null::text,
  p_cuts jsonb default null::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_role text := (select public.purchasing_approver_gate());
  v_req  purchase_requests%rowtype;
  v_cut  jsonb;
  v_line purchase_demands%rowtype;
  v_qty  int;
begin
  if p_decision is null or p_decision not in ('approve', 'refuse') then
    raise exception 'decision must be approve or refuse'
      using errcode = '22023', detail = 'invalid_decision';
  end if;

  select * into v_req from purchase_requests where id = p_id for update;
  if not found then
    raise exception 'unknown request' using errcode = '22023', detail = 'unknown_request';
  end if;
  if v_req.approved_at is not null or v_req.refused_at is not null then
    raise exception 'request is already decided'
      using errcode = '22023', detail = 'already_decided';
  end if;

  if p_decision = 'refuse' then
    if nullif(btrim(coalesce(p_reason, '')), '') is null then
      raise exception 'a refusal needs a reason'
        using errcode = '22023', detail = 'reason_required';
    end if;
    if p_cuts is not null then
      -- Cutting is deciding what goes FORWARD; a refusal forwards nothing.
      raise exception 'a refusal carries no cuts'
        using errcode = '22023', detail = 'cuts_on_refusal';
    end if;

    update purchase_requests
       set refused_at = now(), refused_by = auth.uid(),
           refuse_reason = btrim(p_reason)
     where id = p_id;

    -- Card 08 §3.7 — plain business wording; the internal reference is the
    -- request UUID, never a request number, and it is never printed.
    insert into audit_log (role, actor_text, action, ref)
    values (v_role::public.app_role,
            (select name from app_users where id = auth.uid()),
            format('Purchase refused: %s', btrim(p_reason)),
            p_id::text);

    return jsonb_build_object('id', p_id, 'req_no', v_req.req_no,
                              'decision', 'refused');
  end if;

  -- APPROVE. Cuts first, so a bad cut refuses the whole act atomically.
  if p_cuts is not null then
    if jsonb_typeof(p_cuts) <> 'array' then
      raise exception 'cuts must be an array'
        using errcode = '22023', detail = 'invalid_cuts';
    end if;
    for v_cut in select * from jsonb_array_elements(p_cuts) loop
      select * into v_line from purchase_demands
       where id = (v_cut ->> 'id')::uuid and request_id = p_id
       for update;
      if not found then
        raise exception 'cut names a line this request does not have'
          using errcode = '22023', detail = 'unknown_line';
      end if;
      v_qty := (v_cut ->> 'qty')::int;
      if v_qty is null or v_qty < 0 or v_qty > v_line.qty then
        raise exception 'cut for % must be between 0 and %', v_line.sku, v_line.qty
          using errcode = '22023', detail = 'invalid_cut_qty';
      end if;
      update purchase_demands set approved_qty = v_qty where id = v_line.id;
    end loop;
  end if;

  update purchase_requests
     set approved_at = now(), approved_by = auth.uid()
   where id = p_id;

  insert into audit_log (role, actor_text, action, ref)
  values (v_role::public.app_role,
          (select name from app_users where id = auth.uid()),
          'Purchase approved',
          p_id::text);

  return jsonb_build_object('id', p_id, 'req_no', v_req.req_no,
                            'decision', 'approved');
end;
$function$;

commit;
