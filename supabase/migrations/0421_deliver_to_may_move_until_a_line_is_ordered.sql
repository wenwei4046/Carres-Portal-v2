-- 0421_deliver_to_may_move_until_a_line_is_ordered
--
-- A Manual Purchase request's Deliver To can be changed until one of its
-- lines is on a purchase order.
--
-- On production, MPR-20260903-3381 (Ohana, Deliver To Carres Klang) was
-- refused at Issue with "Ohana must be collected to Ohana. Set Deliver To to
-- Ohana, then issue again." The sentence was correct and the operator could
-- not follow it: nothing in the schema lets a request's destination move
-- after creation. 1083 only fixed the create form. This is the door for a
-- request that already exists.
--
-- Rules:
--   · Same callers as the other Manual Purchase writers: operation or
--     principal (0359's create door).
--   · Refused when any line is already on a PO (`request_ordered`). A PO
--     names its own destination; moving the request under it would make the
--     two disagree, and a PO changes through Revise.
--   · Refused when the request is refused (`request_refused`) or every line
--     is cancelled (`request_closed`): there is nothing left to deliver.
--   · The destination must exist and be active (`unknown_destination` /
--     `inactive_destination`, the codes the API already knows).
--   · Header and every non-cancelled line move together, in one transaction.
--     0401's line door refuses a line whose destination differs from its
--     header, so the two must never drift apart here either. Cancelled lines
--     keep the place they were cancelled at; they are history.
--   · One audit_log row, the same shape 0360's decision writes.
--
-- Refusals raise 22023 with `detail` = the code, the way the neighbouring
-- purchasing RPCs do; the API maps the detail to the two-line sentence.

set search_path = public, pg_temp;

create or replace function public.purchasing_move_request_destination(
  p_id             uuid,
  p_destination_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role     app_role;
  v_req      purchase_requests%rowtype;
  v_old_name text;
  v_new_name text;
  v_live     int;
begin
  v_role := public.app_role();
  if v_role is null or v_role not in ('operation', 'principal') then
    raise exception 'not permitted' using errcode = '42501';
  end if;

  if p_destination_id is null then
    raise exception 'unknown destination' using errcode = '22023', detail = 'unknown_destination';
  end if;

  select * into v_req from purchase_requests where id = p_id for update;
  if not found then
    raise exception 'unknown request' using errcode = '22023', detail = 'unknown_request';
  end if;
  if v_req.refused_at is not null then
    raise exception 'request is refused' using errcode = '22023', detail = 'request_refused';
  end if;

  -- Lock the lines too: an issue running at the same moment must see either
  -- the old destination on every row or the new one on every row.
  perform 1 from purchase_demands where request_id = p_id for update;

  if exists (
    select 1 from purchase_demands where request_id = p_id and po_id is not null
  ) then
    raise exception 'request is already ordered' using errcode = '22023', detail = 'request_ordered';
  end if;

  select count(*) into v_live
    from purchase_demands where request_id = p_id and cancelled_at is null;
  if v_live = 0 and exists (select 1 from purchase_demands where request_id = p_id) then
    raise exception 'request is not going ahead' using errcode = '22023', detail = 'request_closed';
  end if;

  select name into v_new_name
    from purchasing_destinations where id = p_destination_id and active;
  if not found then
    if exists (select 1 from purchasing_destinations where id = p_destination_id) then
      raise exception 'destination is closed' using errcode = '22023', detail = 'inactive_destination';
    end if;
    raise exception 'unknown destination' using errcode = '22023', detail = 'unknown_destination';
  end if;

  if v_req.destination_id = p_destination_id then
    -- Nothing moves; nothing is written. Not a refusal.
    return jsonb_build_object('id', p_id, 'req_no', v_req.req_no,
                              'destination_id', p_destination_id, 'moved', false);
  end if;

  select name into v_old_name from purchasing_destinations where id = v_req.destination_id;

  update purchase_requests set destination_id = p_destination_id where id = p_id;
  update purchase_demands
     set destination_id = p_destination_id
   where request_id = p_id and cancelled_at is null;

  insert into audit_log (role, actor_text, action, ref)
  values (v_role,
          (select name from app_users where id = auth.uid()),
          format('moved %s Deliver To from %s to %s',
                 v_req.req_no, coalesce(v_old_name, v_req.destination_id::text), v_new_name),
          v_req.req_no);

  return jsonb_build_object('id', p_id, 'req_no', v_req.req_no,
                            'destination_id', p_destination_id, 'moved', true,
                            'previous_destination_id', v_req.destination_id);
end;
$fn$;

revoke execute on function public.purchasing_move_request_destination(uuid, uuid)
  from public, anon;
grant execute on function public.purchasing_move_request_destination(uuid, uuid)
  to authenticated;

comment on function public.purchasing_move_request_destination(uuid, uuid) is
  'Moves a Manual Purchase request''s Deliver To (header and every non-cancelled line, one transaction) while no line is on a PO. Refuses request_ordered / request_refused / request_closed / unknown_destination / inactive_destination as 22023 detail codes. Writes one audit_log row. 0421.';

-- ---------------------------------------------------------------------
-- VERIFY (read-only; a migration never asserts a production row count)
-- ---------------------------------------------------------------------
--   select proname from pg_proc
--    where proname = 'purchasing_move_request_destination';
--   -- EXPECT: one row
--
--   -- NEGATIVE CONTROL — a request with a PO line must refuse:
--   --   select purchasing_move_request_destination('<ordered id>', '<dest>');
--   --   EXPECT: ERROR request is already ordered (request_ordered)
