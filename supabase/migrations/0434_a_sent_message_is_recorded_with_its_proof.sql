-- ============================================================================
-- 0434 — a sent message is recorded with its proof
--        (docs/payment/MASTER.md §11 · §16, owner instruction 2026-09-06)
--
-- The MASTER's communication law: actual sent messages are immutable history;
-- the sending sequence ends with `Upload sent screenshot → Record message
-- sent`, and opening WhatsApp alone is neither sent nor read. Communication
-- History on the Invoice preserves the complete message that was sent.
--
-- Measured before this migration: no payment communication record exists.
-- `last_chased_at` on ops_order_control is a bare timestamp — it keeps no
-- message text, no evidence and no actor.
--
--   §1  payment_communications — the append-only sent-message ledger
--   §2  payment_record_message_sent — the one recording door; the sent
--       screenshot is REQUIRED, because a record without proof is the
--       trust-based `Sent` checkbox COPY-STANDARD bans
-- ============================================================================

begin;

set search_path = public, pg_temp;

create table if not exists public.payment_communications (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  invoice_id uuid references public.invoices(id),
  kind text not null check (kind in
    ('payment_request', 'reminder', 'receipt', 'storage', 'other')),
  message_text text not null,
  template_key text,
  sent_screenshot_url text not null,
  recorded_by uuid references public.app_users(id),
  recorded_at timestamptz not null default now()
);

comment on table public.payment_communications is
  '0434: the append-only sent-message ledger (payment/MASTER.md §16). Each row is a message a person actually sent, with its sent-screenshot proof. Rows are never edited or deleted; a wrong record is explained by the next record.';

create index if not exists payment_communications_order_idx
  on public.payment_communications (order_id, recorded_at desc);

alter table public.payment_communications enable row level security;
drop policy if exists payment_communications_read on public.payment_communications;
create policy payment_communications_read on public.payment_communications
  for select using ((select public.is_internal()));
revoke insert, update, delete on public.payment_communications from authenticated, anon;

create or replace function public.payment_record_message_sent(
  p_order_id uuid,
  p_invoice_id uuid,
  p_kind text,
  p_message_text text,
  p_template_key text,
  p_screenshot_url text
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_row payment_communications;
begin
  if public.app_role() not in ('operation', 'finance', 'principal') then
    raise exception 'forbidden' using errcode = '42501', detail = 'not_payment_staff';
  end if;
  if p_order_id is null then
    raise exception 'the order is required' using errcode = '22023', detail = 'order_required';
  end if;
  if p_kind not in ('payment_request', 'reminder', 'receipt', 'storage', 'other') then
    raise exception 'unknown message kind' using errcode = '22023', detail = 'bad_kind';
  end if;
  if nullif(btrim(coalesce(p_message_text, '')), '') is null then
    raise exception 'the sent message text is required'
      using errcode = '22023', detail = 'message_required';
  end if;
  -- Opening WhatsApp is neither sent nor read: the record needs the proof.
  if nullif(btrim(coalesce(p_screenshot_url, '')), '') is null then
    raise exception 'the sent screenshot is required'
      using errcode = '22023', detail = 'screenshot_required';
  end if;
  perform 1 from orders where id = p_order_id;
  if not found then
    raise exception 'order not found' using errcode = '22023', detail = 'order_not_found';
  end if;
  if p_invoice_id is not null then
    perform 1 from invoices where id = p_invoice_id and order_id = p_order_id;
    if not found then
      raise exception 'the invoice does not belong to this order'
        using errcode = '22023', detail = 'invoice_mismatch';
    end if;
  end if;

  insert into payment_communications
    (order_id, invoice_id, kind, message_text, template_key,
     sent_screenshot_url, recorded_by)
  values
    (p_order_id, p_invoice_id, p_kind, p_message_text,
     nullif(btrim(coalesce(p_template_key, '')), ''),
     btrim(p_screenshot_url), auth.uid())
  returning * into v_row;

  insert into order_history (order_id, text, by_role, by_user_id)
  values (p_order_id,
          format('Payment message sent · %s', p_kind),
          public.app_role(), auth.uid());

  update ops_order_control set last_chased_at = now(), updated_by = auth.uid(), updated_at = now()
   where order_id = p_order_id;

  return to_jsonb(v_row);
end;
$fn$;

comment on function public.payment_record_message_sent(uuid, uuid, text, text, text, text) is
  '0434: the ONE door that records a customer payment message as sent. Requires the sent-screenshot proof; appends the immutable ledger row, the order history fact and the shared chase stamp.';

revoke all on function public.payment_record_message_sent(uuid, uuid, text, text, text, text) from public, anon;
grant execute on function public.payment_record_message_sent(uuid, uuid, text, text, text, text) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'payment_record_message_sent'
  ) then
    raise exception 'sanity: the message-sent door is missing';
  end if;
end $$;

commit;
