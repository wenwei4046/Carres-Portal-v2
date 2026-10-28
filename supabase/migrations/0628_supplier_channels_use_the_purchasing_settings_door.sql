-- Purchasing MASTER §11: authorised supplier channel editing with old/new audit.
-- Existing contact columns plus an optional PO-channel preference. No RLS changes.
alter table public.suppliers add column if not exists po_send_channel text
  check (po_send_channel in ('email', 'whatsapp'));
create or replace function public.purchasing_set_supplier_channel(
  p_supplier_id uuid, p_kind text, p_text text
) returns void
language plpgsql security definer set search_path = public, pg_temp
as $function$
declare
  v_role text := public.purchasing_settings_gate();
  v_new text := nullif(btrim(coalesce(p_text, '')), '');
  v_old text;
  v_name text;
begin
  if p_kind is null or p_kind not in ('contact_email', 'whatsapp_group_url', 'po_send_channel') then
    raise exception 'unknown_channel_kind' using errcode = '22023';
  end if;
  if v_new is not null and (length(v_new) > 500
      or (p_kind = 'po_send_channel' and v_new not in ('email', 'whatsapp'))
      or (p_kind = 'contact_email' and v_new !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
      or (p_kind = 'whatsapp_group_url' and v_new !~ '^https://chat\.whatsapp\.com/[A-Za-z0-9]+(\?[^[:space:]]*)?$')) then
    raise exception 'invalid_channel' using errcode = '22023';
  end if;
  select case p_kind when 'contact_email' then contact_email when 'po_send_channel' then po_send_channel else whatsapp_group_url end, name
    into v_old, v_name from public.suppliers where id = p_supplier_id for update;
  if not found then
    raise exception 'unknown_supplier' using errcode = '22023';
  end if;
  if v_new is not distinct from v_old then return; end if;
  if p_kind = 'contact_email' then
    update public.suppliers set contact_email = v_new where id = p_supplier_id;
  elsif p_kind = 'po_send_channel' then
    update public.suppliers set po_send_channel = v_new where id = p_supplier_id;
  else
    update public.suppliers set whatsapp_group_url = v_new where id = p_supplier_id;
  end if;
  perform public.purchasing_record_change(v_role, 'supplier_' || p_kind,
    p_supplier_id, null, v_old, coalesce(v_new, ''),
    format('Purchasing setting · %s %s changed', v_name,
      case p_kind when 'contact_email' then 'Email' when 'po_send_channel' then 'Channel' else 'WhatsApp group' end));
end;
$function$;
revoke all on function public.purchasing_set_supplier_channel(uuid,text,text) from public, anon;
grant execute on function public.purchasing_set_supplier_channel(uuid,text,text) to authenticated;
