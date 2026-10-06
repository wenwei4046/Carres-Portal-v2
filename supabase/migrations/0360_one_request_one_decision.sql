-- ---------------------------------------------------------------------------
-- 0360 · One request, one decision
-- (CARD-2026-08-18-manual-purchase §4, Jess 2026-08-18)
--
-- The approval door for the Manual Purchase request header 0359 built.
-- ONE door decides — approve or refuse — and the same gate that guards the
-- Settings numbers guards it (`purchasing_settings_gate`: `ops_manager` duty
-- or `principal`), because the card names them one and the same: *"Money
-- appears on this surface, for the approver only — server-gated, the same
-- gate Settings already uses."*
--
--   · APPROVE may CUT quantities, per line. Cutting is not refusing: the
--     request goes forward at the cut number and the original ask stays in
--     `qty` (0359's `approved_qty`). A cut to 0 means "do not buy this line"
--     and the line's own record still says what was asked.
--   · REFUSE carries a reason and the reason is REQUIRED — without it a
--     refused request is simply never touched again, and three months later
--     nobody can say why (card §4).
--   · One decision, forever: a decided request is not re-decided. Taking a
--     decision back is not ruled by the card and is not invented here.
-- ---------------------------------------------------------------------------

set search_path = public, pg_temp;

create or replace function public.purchasing_decide_request(
  p_id       uuid,
  p_decision text,
  p_reason   text default null,
  -- [{"id": "<demand uuid>", "qty": 2}, …] — the approver's cuts. Only lines
  -- of THIS request; each 0 ≤ qty ≤ the line's own ask.
  p_cuts     jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role text := (select public.purchasing_settings_gate());
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

    insert into audit_log (role, actor_text, action, ref)
    values (v_role::public.app_role,
            (select name from app_users where id = auth.uid()),
            format('refused %s: %s', v_req.req_no, btrim(p_reason)),
            v_req.req_no);

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
          format('approved %s', v_req.req_no),
          v_req.req_no);

  return jsonb_build_object('id', p_id, 'req_no', v_req.req_no,
                            'decision', 'approved');
end;
$fn$;

revoke execute on function public.purchasing_decide_request(uuid, text, text, jsonb)
  from public, anon;
grant execute on function public.purchasing_decide_request(uuid, text, text, jsonb)
  to authenticated;

-- ---------------------------------------------------------------------
-- VERIFY (read-only)
-- ---------------------------------------------------------------------
--   -- NEGATIVE CONTROL — a refusal without a reason must fire:
--   --   select purchasing_decide_request('<id>', 'refuse');
--   --   EXPECT: ERROR a refusal needs a reason (reason_required)
--   -- NEGATIVE CONTROL — a non-manager operation caller must be refused:
--   --   EXPECT: ERROR forbidden (42501, purchasing settings are set by the manager)
--   -- A decided request cannot be re-decided:
--   --   EXPECT: ERROR already_decided
