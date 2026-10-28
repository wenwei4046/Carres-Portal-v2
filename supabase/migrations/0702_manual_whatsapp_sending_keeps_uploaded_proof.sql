-- DRAFT ONLY. Exact Owner approval required before formal migration landing/apply.
-- No table, RLS, role, assignment or business-setting changes. Existing USER-JWT
-- delivery-orders storage, internal-only po-send prefix, same confirm-sent writer.
do $guard$ begin
 if (select md5(replace(prosrc,chr(13),'')) from pg_proc where oid='public.purchasing_confirm_po_sent(text,integer,text,text,text)'::regprocedure) <> 'b1e35c6b998a77e070a1c0809ae9b5f8' then
  raise exception 'PO send writer changed; review fresh source';
 end if;
end $guard$;

CREATE OR REPLACE FUNCTION public.purchasing_confirm_po_sent(p_po_id text, p_expected_version integer, p_channel text, p_recipient text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_version integer;
  v_status text;
  v_recipient text := btrim(coalesce(p_recipient, ''));
  v_send_id uuid;
  v_who jsonb;
  v_proof jsonb;
  v_path text;
  v_prefix text;
  v_required boolean;
  v_existing uuid;
begin
  if v_actor is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if not public.purchasing_actor_may_issue(v_actor) then
    raise exception 'not_po_duty' using errcode = 'P0001', detail = 'not_po_duty';
  end if;
  v_who := public.purchasing_po_actor();

  if p_channel not in ('whatsapp', 'email', 'print') then
    raise exception 'invalid_channel' using errcode = '22023';
  end if;
  if v_recipient = '' then
    raise exception 'recipient_required' using errcode = '22023';
  end if;
  if p_expected_version is null then
    raise exception 'expected_version_required' using errcode = '22023';
  end if;

  select version, status::text into v_version, v_status
  from public.purchase_orders
  where id = p_po_id
  for update;

  if not found then
    raise exception 'po_not_found' using errcode = 'P0002';
  end if;
  if v_status = 'cancelled' and not exists(select 1 from public.po_goods_cancellation_events where po_id=p_po_id and kind='effective' and applied_po_version=v_version) then
    raise exception 'po_not_issuable' using errcode = 'P0001';
  end if;

  if coalesce(v_version, 1) <> p_expected_version then
    raise exception 'stale_po_version: saw %, current is %', p_expected_version, coalesce(v_version, 1)
      using errcode = 'P0001', detail = 'stale_po_version';
  end if;

  -- PUR-16: the existing writer owns screenshot admission and retry identity.
  -- Lock Settings until the send commits; later toggles never rewrite evidence.
  if p_channel = 'whatsapp' then
    select po_manual_whatsapp_screenshot_required into v_required
      from public.purchasing_settings where id=1 for share;
    if not found then
      raise exception 'Settings could not be loaded' using errcode='55000', detail='po_send_settings_unavailable';
    end if;
    begin v_proof := p_note::jsonb; exception when invalid_text_representation then v_proof := null; end;
    if v_proof->>'type' = 'po_send_evidence' then v_path := nullif(v_proof->>'path',''); end if;
    if v_required and v_path is null then
      raise exception 'WhatsApp screenshot is missing' using errcode='22023', detail='po_send_screenshot_required';
    end if;
    if v_path is not null then
      v_prefix := 'po-send/' || p_po_id || '/V' || v_version::text || '/' || v_actor::text || '/';
      if left(v_path,length(v_prefix)) <> v_prefix
        or substring(v_path from length(v_prefix)+1) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg)$'
        or not exists (select 1 from storage.objects where bucket_id='delivery-orders' and name=v_path
          and owner_id=v_actor::text and metadata->>'mimetype' in ('image/png','image/jpeg')
          and case when metadata->>'size' ~ '^[0-9]+$' then (metadata->>'size')::numeric between 1 and 10485760 else false end) then
        raise exception 'WhatsApp screenshot could not be opened' using errcode='22023', detail='po_send_screenshot_invalid';
      end if;
      -- A lost response retries the same saved screenshot, without a second send/history.
      select id into v_existing from public.po_sends
        where po_id=p_po_id and po_version=v_version and channel=p_channel and kind='confirmed_sent'
          and recipient=v_recipient and note=p_note order by sent_at limit 1;
      if found then return jsonb_build_object('send_id',v_existing,'po_id',p_po_id,'po_version',v_version,'channel',p_channel,'recipient',v_recipient); end if;
    end if;
  end if;

  -- 0430 · WHAT the supplier received, not only THAT something left. The first
  -- confirmed send of a version keeps the document authority's own payload; a
  -- resend of the same version changes nothing, so the recorded facts of a
  -- version can never drift between two sends of it.
  insert into public.po_version_documents (po_id, po_version, document, created_by)
  values (p_po_id, coalesce(v_version, 1), public.purchasing_po_document(p_po_id), v_actor)
  on conflict (po_id, po_version) do nothing;

  insert into public.po_sends (
    po_id, channel, note, sent_by, kind, recipient, po_version,
    duty_user_id, acting_user_id
  )
  values (
    p_po_id, p_channel, nullif(btrim(coalesce(p_note, '')), ''), v_actor,
    'confirmed_sent', v_recipient, coalesce(v_version, 1),
    nullif(v_who->>'normal_user_id', '')::uuid,
    nullif(v_who->>'acting_user_id', '')::uuid
  )
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
$function$
;
revoke all on function public.purchasing_confirm_po_sent(text,integer,text,text,text) from public,anon;
grant execute on function public.purchasing_confirm_po_sent(text,integer,text,text,text) to authenticated;

create or replace function public.purchasing_po_send_evidence_policy()
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp
as $policy$
begin
 if auth.uid() is null or public.app_role() is null or public.app_role() not in ('operation','principal') then
  raise exception 'Forbidden' using errcode='42501';
 end if;
 return jsonb_build_object('required',(select po_manual_whatsapp_screenshot_required from public.purchasing_settings where id=1),
  'available',(select md5(replace(prosrc,chr(13),''))='ecc2b3fcc01d483b9a8869a1bcd51cb5' from pg_proc where oid='public.purchasing_confirm_po_sent(text,integer,text,text,text)'::regprocedure));
end $policy$;
revoke all on function public.purchasing_po_send_evidence_policy() from public,anon;
grant execute on function public.purchasing_po_send_evidence_policy() to authenticated;
