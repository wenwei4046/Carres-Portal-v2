-- ═══════════════════════════════════════════════════════════════════════════
-- 0474 · THE PURCHASING APPROVER DUTY ACTUALLY EXISTS
--
-- Owner instruction 2026-09-11: "Verify Jess's Purchasing Approver route
-- through the shared duty authority." Verified — and the route does not
-- exist.
--
-- ── WHAT WAS MEASURED (production, 2026-09-11) ─────────────────────────────
--
--   · `org_duties` holds seven keys. `purchasing_approver` is NOT one of
--     them, so `org_position_duties` can never carry it and no position can
--     ever hold it.
--   · The application catalogue OFFERS it —
--     `apps/api/src/routes/operation/workspace-duties.ts` lists
--     `{ key: "purchasing_approver", label: "Purchasing Approver" }` — so
--     Staff & Duties shows a duty the database cannot store.
--   · The Work Engine already NAMES it: `manual_purchase.approve` carries
--     `ownerRule` / `ownerDutyKey` = `purchasing_approver`
--     (`packages/shared/src/manual-purchase.ts`). It therefore resolves to
--     NOBODY, and `Approve purchase` has been an ownerless Work row.
--   · `Approve` / `Refuse` work today only through the LEGACY path: the
--     browser and `purchasing_decide_request` both ask for the `ops_manager`
--     duty, which Jess holds (the one active holder).
--
-- `docs/purchasing/MASTER.md` §9.2 already rules the target: "The approved
-- target is the resolved `Purchasing Approver` Duty… legacy implementation
-- that must converge behind the Shared Duty Resolver." This migration makes
-- that target REACHABLE. It does not assign anybody: who holds the duty is
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
-- `ops_manager` still passes, but ONLY while `purchasing_approver` has no
-- active holder. So:
--   · today, with nobody assigned, the gate admits exactly who it admitted
--     before this migration — Jess. Nothing changes and nothing breaks.
--   · the moment Jess assigns the duty, the approver is the assigned holder
--     and the legacy rung disappears without another migration.
-- No email list is honoured here: `LEGACY_OPS_MANAGER_EMAILS` never reached
-- this door and does not start now.
--
-- SCHEMA ONLY. No row of business data is written, moved or deleted.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ── 1 · The duty joins the catalogue, so a position can hold it ────────────
insert into public.org_duties (key, name, description, sort) values
  ('purchasing_approver', 'Purchasing approver',
   'Decide a Manual Purchase: approve (with the approved quantity per line) or refuse it. Approving a purchase is NOT configuring Purchasing — the Settings numbers stay behind ops_manager. While nobody holds this duty the ops_manager holder decides, and that fallback ends the moment this duty is assigned.',
   62)
on conflict (key) do nothing;

-- ── 2 · The approval gate, separate from the Settings gate ─────────────────
create or replace function public.purchasing_approver_gate()
returns text
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_role         text := (select public.app_role());
  v_duties       text[];
  v_duty_claimed boolean;
begin
  if v_role is null then
    raise exception 'forbidden' using errcode = '42501',
      detail = 'no active account';
  end if;

  -- The owner decides anything; every other seat decides by duty.
  if v_role = 'principal' then
    return v_role;
  end if;

  select coalesce(array_agg(pd.duty_key), '{}'::text[])
    into v_duties
    from app_users u
    join org_position_duties pd on pd.position_id = u.position_id
   where u.id = auth.uid()
     and u.role <> 'dealer'
     and u.status = 'active';

  if 'purchasing_approver' = any(coalesce(v_duties, '{}'::text[])) then
    return v_role;
  end if;

  -- Has ANYBODY active been given the duty? Until somebody has, the
  -- operations manager keeps deciding exactly as they did before 0474.
  select exists (
    select 1
      from org_position_duties pd
      join app_users u on u.position_id = pd.position_id
     where pd.duty_key = 'purchasing_approver'
       and u.role <> 'dealer'
       and u.status = 'active'
  ) into v_duty_claimed;

  if not v_duty_claimed
     and 'ops_manager' = any(coalesce(v_duties, '{}'::text[])) then
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
  'Who may decide a Manual Purchase (0474). principal, or an active position holding the purchasing_approver duty; while that duty has no active holder the ops_manager holder decides. Deliberately NOT purchasing_settings_gate: deciding a purchase does not grant the Purchasing Settings numbers.';

-- ── 3 · The decide door asks the approval gate ─────────────────────────────
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
