-- ============================================================================
-- 0376 — an app that opened is not a PDF that arrived
--        (CARD-2026-08-22-purchasing-02 §7.4; purchasing/MASTER.md §5.6)
--
-- THE DEFECT THIS CLOSES
--
--   Pressing `Open WhatsApp` wrote a `po_sends` row. The Portal therefore
--   recorded a DOOR OPENING and read it back as *the supplier has the PDF*.
--   Those are not the same fact, and the gap is where a purchase order goes
--   missing: the operator opens the group, gets interrupted, never pastes the
--   file, and the system says the order was sent.
--
--   MASTER §5.6 is explicit — "Opening WhatsApp, email or a PDF is not issue…
--   completion requires the actual outbound fact: document version, recipient,
--   channel, sent by and sent time."
--
-- WHAT THIS FILE DOES
--   1 · `po_sends.kind` — `external_open` | `confirmed_sent`. EVERY EXISTING
--       ROW BECOMES `external_open`. They are not deleted and not reread as
--       evidence: history may still show that WhatsApp was opened on a
--       Tuesday, but it may never again mean the supplier received anything.
--   2 · `po_sends.recipient` — WHO it went to, in the operator's own words
--       ("Hooka Purchasing Group"). Required on confirmed evidence.
--   3 · `po_sends.po_version` — the EXACT version that left. A PO revised to
--       Version 2 is not shared because Version 1 once was.
--   4 · `purchasing_confirm_po_sent(...)` — the ONE door that writes confirmed
--       evidence. Current PO Duty only, recipient required, PO must exist and
--       be live, and the version is read from the row rather than accepted
--       from the caller.
--
-- WHAT IT DELIBERATELY DOES NOT DO
--   · It does not drop or rewrite `purchasing_record_send`. That function is
--     the OPEN recorder now; its rows are labelled, not deleted (red line 8 —
--     schema is what a migration owns, data is what it walks past).
--   · It asserts no row count. What is here today is test data (Constitution
--     §6); the labelling is correct whether there are three rows or none.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1 · the two kinds of outbound fact
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'po_send_kind') then
    create type public.po_send_kind as enum ('external_open', 'confirmed_sent');
  end if;
end $$;

alter table public.po_sends
  add column if not exists kind public.po_send_kind not null default 'external_open';
comment on column public.po_sends.kind is
  '0376: external_open = an app was opened. confirmed_sent = the operator states the PDF actually reached the supplier. Only confirmed_sent closes Issue PO. Every pre-0376 row is external_open, because that is all any of them ever proved.';

alter table public.po_sends
  add column if not exists recipient text;
comment on column public.po_sends.recipient is
  '0376: who received it, in the operator''s own words — a WhatsApp group name, an email address. Required on confirmed_sent, NULL on an open.';

alter table public.po_sends
  add column if not exists po_version integer;
comment on column public.po_sends.po_version is
  '0376: the exact purchase_orders.version that left. A PO revised to Version 2 is NOT shared merely because Version 1 once was.';

-- Existing rows are opens. They were written by a click on `Open WhatsApp`,
-- and that is the only thing any of them can honestly claim.
update public.po_sends set kind = 'external_open' where kind is null;

-- Confirmed evidence is worthless without its two facts, so the table refuses
-- an incomplete one rather than letting a screen decide later.
alter table public.po_sends drop constraint if exists po_sends_confirmed_needs_facts;
alter table public.po_sends
  add constraint po_sends_confirmed_needs_facts check (
    kind <> 'confirmed_sent'
    or (recipient is not null and btrim(recipient) <> '' and po_version is not null)
  );

create index if not exists po_sends_confirmed_idx
  on public.po_sends (po_id, po_version)
  where kind = 'confirmed_sent';

-- ---------------------------------------------------------------------------
-- 2 · the ONE door that writes confirmed evidence
-- ---------------------------------------------------------------------------
create or replace function public.purchasing_confirm_po_sent(
  p_po_id text,
  p_channel text,
  p_recipient text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_month text := to_char(timezone('Asia/Kuala_Lumpur', now()), 'YYYY-MM');
  v_duty uuid;
  v_version integer;
  v_status text;
  v_recipient text := btrim(coalesce(p_recipient, ''));
  v_send_id uuid;
begin
  if v_actor is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  -- ONLY CURRENT PO DUTY (MASTER §5.3). The API asks this too; the SQL is the
  -- authority, because a door that only the UI guards is not guarded.
  select user_id into v_duty from public.ops_po_duty where month = v_month;
  if v_duty is null or v_duty <> v_actor then
    raise exception 'not_po_duty' using errcode = 'P0001';
  end if;

  if p_channel not in ('whatsapp', 'email', 'print') then
    raise exception 'invalid_channel' using errcode = '22023';
  end if;

  -- A recipient is not decoration. "Sent" that cannot say TO WHOM is a claim
  -- nobody can check against the supplier later.
  if v_recipient = '' then
    raise exception 'recipient_required' using errcode = '22023';
  end if;

  select version, status::text into v_version, v_status
  from public.purchase_orders
  where id = p_po_id
  for update;

  if not found then
    raise exception 'po_not_found' using errcode = 'P0002';
  end if;
  -- A cancelled document has no supplier to reach.
  if v_status = 'cancelled' then
    raise exception 'po_not_issuable' using errcode = 'P0001';
  end if;

  -- THE VERSION IS READ, NEVER ACCEPTED. A caller that could name the version
  -- could claim Version 1 was shared while the factory holds Version 2.
  insert into public.po_sends (po_id, channel, note, sent_by, kind, recipient, po_version)
  values (p_po_id, p_channel, nullif(btrim(coalesce(p_note, '')), ''), v_actor,
          'confirmed_sent', v_recipient, v_version)
  returning id into v_send_id;

  insert into public.po_history (po_id, text, by_user_id)
  values (
    p_po_id,
    format('Version %s sent to %s by %s', v_version, v_recipient, p_channel),
    v_actor
  );

  return jsonb_build_object(
    'send_id', v_send_id,
    'po_id', p_po_id,
    'po_version', v_version,
    'channel', p_channel,
    'recipient', v_recipient
  );
end;
$$;

revoke all on function public.purchasing_confirm_po_sent(text, text, text, text) from public;
grant execute on function public.purchasing_confirm_po_sent(text, text, text, text) to authenticated;

comment on function public.purchasing_confirm_po_sent(text, text, text, text) is
  '0376: the ONE door that records that a purchase order PDF actually reached its supplier. Current PO Duty only; recipient required; the version is read from the PO, never accepted from the caller. Opening WhatsApp or email writes nothing here.';
