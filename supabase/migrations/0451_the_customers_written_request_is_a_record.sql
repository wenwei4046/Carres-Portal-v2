-- ============================================================================
-- 0451 — the customer's written request to delay is a RECORD, not a note
-- (docs/payment/MASTER.md §6)
--
-- §6, verbatim: "During the delivery-window call, Operation sends the prepared
-- `Request a later delivery date` form. Customer supplies new date, structured
-- reason, acknowledgement of shown storage terms and, where eligible, a
-- free-storage request. Submitted form is default evidence; uploaded WhatsApp
-- written confirmation is the fallback. Telephone alone cannot formally change
-- the date or obtain free storage."
--
-- WHAT WAS MISSING. A storage case could only be opened from a TYPED witness
-- note — prose, unfilterable, and silent about the three facts §6 actually
-- asks the customer for. The structured submission did not exist anywhere, so
-- "the customer acknowledged the storage terms" and "the customer asked for
-- free storage" were things an operator remembered, not things the system
-- held.
--
-- ⛔ THIS RECORD DOES NOT MOVE THE DELIVERY DATE. §6 is explicit: "Original
-- delivery date remains until written confirmation", and the delivery date is
-- Orders/Delivery's to write, never Payment's (ERP-ARCHITECTURE Law A). This
-- is the customer's REQUEST and its evidence — the fact the owner of the date
-- acts on, and the fact a storage case and a free-storage decision rest on.
--
-- WHAT THE DOOR REFUSES, and why §6 says so:
--   · no evidence file — "Telephone alone cannot formally change the date or
--     obtain free storage". A request nobody can show is not a written request.
--   · terms not acknowledged — §6 names the acknowledgement as part of what the
--     customer supplies; without it the form is incomplete, not merely thin.
--   · a date already past — a request to deliver yesterday is not a request.
--   · no reason — §6 asks for a STRUCTURED reason. The words come from the one
--     governed Delivery Reason Library (0196/T4); this door refuses an empty
--     key and the API refuses a key that is not in that library, so no second
--     word list can grow here.
-- ============================================================================
begin;

create table if not exists public.payment_delivery_date_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),

  -- What the customer supplied (§6).
  requested_date date not null,
  reason_key text not null check (btrim(reason_key) <> ''),
  reason_detail text,
  terms_acknowledged boolean not null check (terms_acknowledged),
  free_storage_requested boolean not null default false,

  -- The evidence that makes it WRITTEN. Never null — that is the rule.
  evidence_url text not null check (btrim(evidence_url) <> ''),

  recorded_by uuid not null references public.app_users(id),
  recorded_at timestamptz not null default now()
);

create index if not exists payment_delivery_date_requests_order_idx
  on public.payment_delivery_date_requests (order_id, recorded_at desc);

comment on table public.payment_delivery_date_requests is
  '0451: the §6 `Request a later delivery date` submission — new date, structured reason (governed Delivery Reason Library key), storage-terms acknowledgement, optional free-storage request, and the written evidence that makes it a request at all. Append-only. It records what the customer asked for; it never moves the delivery date, which Orders/Delivery owns.';

alter table public.payment_delivery_date_requests enable row level security;

-- 0367's lesson: a new table inherits a blanket write grant nobody asked for.
revoke all on public.payment_delivery_date_requests from public, anon, authenticated;
grant select on public.payment_delivery_date_requests to authenticated;

drop policy if exists payment_delivery_date_requests_internal_read
  on public.payment_delivery_date_requests;
create policy payment_delivery_date_requests_internal_read
  on public.payment_delivery_date_requests for select to authenticated
  using (public.app_role() in ('operation', 'finance', 'principal', 'warehouse'));
-- No insert/update/delete policy: the door below is the only writer.

create or replace function public.payment_record_delivery_date_request(
  p_order_id uuid,
  p_requested_date date,
  p_reason_key text,
  p_reason_detail text,
  p_terms_acknowledged boolean,
  p_free_storage_requested boolean,
  p_evidence_url text
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid uuid := auth.uid();
  v_today date := (timezone('Asia/Kuala_Lumpur', now()))::date;
  v_row payment_delivery_date_requests;
  v_so integer;
begin
  -- Operation records it at the delivery-window call (§6); principal keeps the
  -- owner override. coalesce — NULL must refuse (the 0429 lesson).
  if not coalesce(public.app_role() in ('operation', 'principal'), false) then
    raise exception 'forbidden' using errcode = '42501', detail = 'not_storage_recorder';
  end if;

  select so into v_so from orders where id = p_order_id;
  if v_so is null then
    raise exception 'order not found' using errcode = '22023', detail = 'order_not_found';
  end if;

  if p_requested_date is null or p_requested_date < v_today then
    raise exception 'The date the customer asked for has already passed.'
      using errcode = '22023', detail = 'date_in_the_past';
  end if;
  if nullif(btrim(coalesce(p_reason_key, '')), '') is null then
    raise exception 'The reason is required.'
      using errcode = '22023', detail = 'reason_required';
  end if;
  if not coalesce(p_terms_acknowledged, false) then
    raise exception 'The customer must acknowledge the storage terms.'
      using errcode = '22023', detail = 'terms_not_acknowledged';
  end if;
  if nullif(btrim(coalesce(p_evidence_url, '')), '') is null then
    raise exception 'Attach what the customer sent. A telephone call cannot change the date or obtain free storage.'
      using errcode = '22023', detail = 'evidence_required';
  end if;

  insert into payment_delivery_date_requests
    (order_id, requested_date, reason_key, reason_detail, terms_acknowledged,
     free_storage_requested, evidence_url, recorded_by)
  values
    (p_order_id, p_requested_date, btrim(p_reason_key),
     nullif(btrim(coalesce(p_reason_detail, '')), ''), true,
     coalesce(p_free_storage_requested, false), btrim(p_evidence_url), v_uid)
  returning * into v_row;

  insert into ops_activity_log(order_id, action, actor_id, detail)
  values (p_order_id, 'storage.later_delivery_requested', v_uid,
          jsonb_build_object('request_id', v_row.id, 'requested_date', p_requested_date,
                             'reason_key', v_row.reason_key,
                             'free_storage_requested', v_row.free_storage_requested));

  return to_jsonb(v_row);
end;
$fn$;

comment on function public.payment_record_delivery_date_request(uuid, date, text, text, boolean, boolean, text) is
  '0451: the one writer for the §6 `Request a later delivery date` submission. Operation or principal. Refuses a past date, a missing reason, an unacknowledged storage-terms notice and — above all — a request with no written evidence, because a telephone call cannot change the date or obtain free storage. It never writes the delivery date.';

revoke all on function public.payment_record_delivery_date_request(uuid, date, text, text, boolean, boolean, text) from public, anon;
grant execute on function public.payment_record_delivery_date_request(uuid, date, text, text, boolean, boolean, text) to authenticated;

commit;
