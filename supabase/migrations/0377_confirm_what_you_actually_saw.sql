-- ============================================================================
-- 0377 — confirm what you actually SAW
--        (CARD-2026-08-22-purchasing-02, release-blocker correction 2026-08-24)
--
-- THE RACE 0376 LEFT OPEN
--
--   0376 read the CURRENT version off the purchase order and recorded that,
--   reasoning that a caller able to name a version could lie about it. The
--   logic was backwards, and it created the exact defect it meant to prevent:
--
--     1 · the operator opens PO-2041 and sends Version 1 to the supplier;
--     2 · another session revises it to Version 2;
--     3 · the operator presses `Record the PDF sent`;
--     4 · the RPC reads `version = 2` and records Version 2 as sent.
--
--   The supplier holds Version 1. Carres now believes Version 2 is shared, so
--   the work to send the new document never appears, and the factory builds
--   from a document nobody chased. A silent wrong answer, from a guard.
--
--   THE FIX IS NOT TO TRUST THE CALLER — IT IS TO MAKE THE CALLER DECLARE.
--   The caller states the version it RENDERED; SQL locks the row, compares,
--   and refuses on a mismatch. It still STORES only its own read, so a caller
--   that lies about a version it did not see is refused rather than believed.
--   Declaring is not trusting.
--
-- WHAT THIS FILE DOES
--   1 · `purchasing_po_document` returns `version`, so the official PDF can
--       print its own identity and hand the same number back at confirmation.
--       One read, one document, one version — the operator confirms the thing
--       they rendered, not a second opinion about it.
--   2 · The unsafe four-argument `purchasing_confirm_po_sent` is DROPPED, not
--       left beside its replacement. A door with the old defect still open is
--       one curl away from being used.
--   3 · The governed signature takes `p_expected_version`, locks the PO row
--       FOR UPDATE, compares, and raises `stale_po_version` on a mismatch —
--       writing NO `po_sends` and NO `po_history` row.
--
-- 0376 IS NOT EDITED. It is committed, so it is immutable (Constitution §5.6);
-- this file supersedes its function and leaves its table shape alone.
-- No row count is asserted anywhere.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1 · the official document knows its own version
-- ---------------------------------------------------------------------------
create or replace function public.purchasing_po_document(p_po_id text)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_role     app_role;
  v_po       purchase_orders;
  v_dest     purchasing_destinations;
  v_address  text;
  v_lines    jsonb;
begin
  v_role := public.app_role();
  if v_role is null or v_role not in ('operation', 'principal') then
    raise exception 'forbidden: only operation or principal can export a PO document'
      using errcode = '42501', detail = 'forbidden';
  end if;

  select * into v_po from purchase_orders where id = p_po_id;
  if not found then
    raise exception 'PO % not found', p_po_id
      using errcode = '42P01', detail = 'po_not_found';
  end if;

  if v_po.status = 'cancelled' then
    raise exception 'PO % is cancelled and cannot be exported', p_po_id
      using errcode = 'P0001', detail = 'po_not_printable';
  end if;

  select * into v_dest from purchasing_destinations where id = v_po.destination_id;

  -- One address, one source: our own warehouse carries its own, an external
  -- destination carries the one a manager set. A PO bound for an address nobody
  -- has given may not be exported or sent.
  if v_dest.warehouse_id is not null then
    select address into v_address from warehouses where id = v_dest.warehouse_id;
  else
    v_address := v_dest.address;
  end if;

  if v_address is null or length(btrim(v_address)) = 0 then
    raise exception 'no address on file for %', v_dest.name
      using errcode = 'P0001', detail = 'destination_address_missing';
  end if;

  select coalesce(jsonb_agg(x order by x->>'sku'), '[]'::jsonb) into v_lines
    from (
      select jsonb_build_object(
               'sku',         l.sku,
               'description', coalesce(ps.variant, l.sku),
               'qty',         l.qty,
               'unit',        'pc',
               'attrs',       (
                 select coalesce(jsonb_object_agg(k, v), '{}'::jsonb)
                   from jsonb_each(coalesce(l.attrs, '{}'::jsonb)) as e(k, v)
                  where k in ('color', 'gap', 'fabric_name')
               )
             ) as x
        from purchase_order_lines l
        left join product_skus ps on ps.sku = l.sku
       where l.po_id = p_po_id
    ) s;

  return jsonb_build_object(
    'po_number',   v_po.id,
    'po_id',       v_po.id,
    -- 0377: the document's OWN version. The PDF prints it and hands it back at
    -- confirmation, so "the version we recorded" is by construction "the
    -- version the operator looked at".
    'version',     coalesce(v_po.version, 1),
    'issue_date',  to_char(coalesce(v_po.placed_at, now()), 'YYYY-MM-DD'),
    'supplier', jsonb_build_object(
      'name',    coalesce((select name from suppliers where id = v_po.supplier_id), 'Supplier'),
      'address', null,
      'contact', (select contact from suppliers where id = v_po.supplier_id)
    ),
    'destination', jsonb_build_object(
      'name',    v_dest.name,
      'address', v_address
    ),
    'delivery_instructions', nullif(btrim(coalesce(v_po.delivery_instructions, '')), ''),
    'eta_date',    v_po.eta_date,
    'lines',       v_lines,
    'terms',       null
  );
end;
$function$;

comment on function public.purchasing_po_document(text) is
  '0377: the money-free supplier-facing PO payload, now carrying its own `version`. The PDF prints it and the confirmation hands it back, so the recorded version is the rendered one.';

-- ---------------------------------------------------------------------------
-- 2 · the unsafe signature is REMOVED, not left beside its replacement
-- ---------------------------------------------------------------------------
drop function if exists public.purchasing_confirm_po_sent(text, text, text, text);

-- ---------------------------------------------------------------------------
-- 3 · the governed door — declare the version you saw
-- ---------------------------------------------------------------------------
create or replace function public.purchasing_confirm_po_sent(
  p_po_id text,
  p_expected_version integer,
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

  -- ONLY CURRENT PO DUTY (MASTER §5.3). A door that only the UI guards is not
  -- guarded.
  select user_id into v_duty from public.ops_po_duty where month = v_month;
  if v_duty is null or v_duty <> v_actor then
    raise exception 'not_po_duty' using errcode = 'P0001';
  end if;

  if p_channel not in ('whatsapp', 'email', 'print') then
    raise exception 'invalid_channel' using errcode = '22023';
  end if;

  -- "Sent" that cannot say TO WHOM is a claim nobody can check later.
  if v_recipient = '' then
    raise exception 'recipient_required' using errcode = '22023';
  end if;

  if p_expected_version is null then
    raise exception 'expected_version_required' using errcode = '22023';
  end if;

  -- LOCK, then compare. The lock is what makes the comparison mean anything:
  -- without it a revise could land between the read and the insert and the
  -- race would simply move.
  select version, status::text into v_version, v_status
  from public.purchase_orders
  where id = p_po_id
  for update;

  if not found then
    raise exception 'po_not_found' using errcode = 'P0002';
  end if;
  if v_status = 'cancelled' then
    raise exception 'po_not_issuable' using errcode = 'P0001';
  end if;

  -- ⭐ THE VERSION THE OPERATOR SAW MUST BE THE VERSION THAT EXISTS.
  --
  -- Nothing is written on a mismatch — not the send, not the history line. A
  -- half-recorded confirmation is worse than none: it would put a date against
  -- a document the supplier never received.
  if coalesce(v_version, 1) <> p_expected_version then
    raise exception 'stale_po_version: saw %, current is %', p_expected_version, coalesce(v_version, 1)
      using errcode = 'P0001', detail = 'stale_po_version';
  end if;

  -- Stored from the SERVER's read, never from the argument. The argument says
  -- which document was looked at; this says which document exists. They are
  -- equal by the check above, and only one of them is authoritative.
  insert into public.po_sends (po_id, channel, note, sent_by, kind, recipient, po_version)
  values (p_po_id, p_channel, nullif(btrim(coalesce(p_note, '')), ''), v_actor,
          'confirmed_sent', v_recipient, coalesce(v_version, 1))
  returning id into v_send_id;

  insert into public.po_history (po_id, text, by_user_id)
  values (
    p_po_id,
    format('Version %s sent to %s by %s', coalesce(v_version, 1), v_recipient, p_channel),
    v_actor
  );

  return jsonb_build_object(
    'send_id', v_send_id,
    'po_id', p_po_id,
    'po_version', coalesce(v_version, 1),
    'channel', p_channel,
    'recipient', v_recipient
  );
end;
$$;

revoke all on function public.purchasing_confirm_po_sent(text, integer, text, text, text) from public;
grant execute on function public.purchasing_confirm_po_sent(text, integer, text, text, text) to authenticated;

comment on function public.purchasing_confirm_po_sent(text, integer, text, text, text) is
  '0377: records that a PO PDF actually reached its supplier. The caller DECLARES the version it rendered; this locks the row, compares, and refuses `stale_po_version` on a mismatch without writing anything. Current PO Duty only; recipient required; the stored version is the server''s own read.';
