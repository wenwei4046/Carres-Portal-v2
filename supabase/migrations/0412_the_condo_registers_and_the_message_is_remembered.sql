-- 0412_the_condo_registers_and_the_message_is_remembered.sql
-- Delivery Cards 05/06 — two small facts the arrangement was still missing
-- (docs/delivery/MASTER.md §5 Edit Delivery + §13; owner rulings 2026-09-01).
--
-- ① CONDOMINIUM REGISTRATION (Card 06). A condo building demands its own facts
--    before the truck may enter — driver name, plate, a permit/registration
--    reference, a registered window — and each building demands them in its own
--    shape. One free-text field on the arrangement records exactly what the
--    building asked for, beside the driver/vehicle facts it usually repeats.
--    It is a Delivery-owned arrangement fact, never a Sales fact.
--
-- ② THE PREPARED MESSAGE IS REMEMBERED (Card 05's deferred half). The portal
--    prepares WhatsApp content for a partner; preparation is an activity fact —
--    it NEVER confirms anything (§2: prepared, copied, opened or sent never
--    means confirmed). History writes live in SQL doors only, so this is a
--    door: it appends the arrangement event and the order_history line
--    together, and writes no arrangement field at all.

set search_path = public;

-- ── ① the condominium registration fact ─────────────────────────────────────
alter table public.ops_delivery_arrangements
  add column if not exists condo_registration text;

alter table public.ops_delivery_arrangements
  drop constraint if exists oda_condo_registration_bounded;
alter table public.ops_delivery_arrangements
  add constraint oda_condo_registration_bounded
    check (condo_registration is null or char_length(condo_registration) <= 2000);

comment on column public.ops_delivery_arrangements.condo_registration is
  'Delivery Card 06 (0412): what the condominium management requires before the truck may enter — driver, plate, permit reference, registered window, in the building''s own words. Delivery-owned arrangement fact.';

-- ── ② the message-prepared event ────────────────────────────────────────────
alter table public.ops_delivery_arrangement_events
  drop constraint if exists ops_delivery_arrangement_events_event_check;
alter table public.ops_delivery_arrangement_events
  add constraint ops_delivery_arrangement_events_event_check
    check (event in ('assigned', 'changed', 'cleared', 'message_prepared'));

create or replace function public.delivery_arrangement_message_prepared(
  p_order_id   uuid,
  p_leg        smallint,
  p_partner_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_partner text;
  v_so int;
begin
  if not (select public.is_operation()) then
    raise exception 'Only operation or principal may record a prepared message'
      using errcode = '42501';
  end if;

  select name into v_partner from public.delivery_partners where id = p_partner_id;
  if v_partner is null then
    raise exception 'Logistic partner not found' using errcode = 'P0002';
  end if;
  select so into v_so from public.orders where id = p_order_id;
  if v_so is null then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  insert into public.ops_delivery_arrangement_events
    (order_id, leg, event, to_partner_id, recorded_by)
  values
    (p_order_id, coalesce(p_leg, 0), 'message_prepared', p_partner_id, auth.uid());

  -- Preparation is an activity fact, spoken in business words. It confirms
  -- nothing: no arrangement column moves here.
  insert into order_history (order_id, text, by_role)
  values (p_order_id,
          format('WhatsApp message prepared for %s — confirm delivery date', v_partner),
          (select public.app_role()));
end;
$function$;

revoke all on function public.delivery_arrangement_message_prepared(uuid, smallint, uuid) from public;
grant execute on function public.delivery_arrangement_message_prepared(uuid, smallint, uuid) to authenticated;
