-- GENERATED from the exact committed b4eb234d Settings review blob.
-- Approval still required. Do not run on production before authorisation.
-- Only outer BEGIN/COMMIT are replaced by this atomic DO wrapper.
-- No synthetic users, no impersonated person, no setting value/audit writes.
-- Actual save/audit and parameter controls remain tested in the isolated local database.
do $probe$
declare before_settings jsonb; before_changes bigint; after_changes bigint; sig regprocedure;
  refused boolean; source_md5 text;
begin
  select to_jsonb(s) into strict before_settings from public.purchasing_settings s where id=1;
  select count(*) into before_changes from public.purchasing_setting_changes;
  execute $reviewed$-- REVIEW DRAFT. Not approved; not a migration; never applied to production.
-- Scope: one atomic audited editor for the three already-approved 0696 Settings.
-- No request/order/task writes, new role, RLS change, data backfill or form activation.
-- Uses the existing purchasing_settings_gate and purchasing_record_change authorities.
-- All three values required; calendar days are nonnegative integers. Identical save is a no-op.
-- Verification: isolated PostgreSQL, rolled-back owner save/audit/no-op,
-- negative-day atomicity and non-editor permission controls. Application/API tests also pass.
-- Recovery: retain the prior application; leave this unused additive function installed.
-- It does not replace any existing function or change historical settings values on apply.
-- DRAFT ONLY: audited editor for 0696's approved Settings inventory. The
-- matching application remains on the guarded context branch until reviewed.
create or replace function public.purchasing_set_request_settings(
  p_normal_days integer,
  p_service_days integer,
  p_manual_whatsapp_screenshot_required boolean
)
returns void language plpgsql security definer set search_path = public, pg_temp
as $fn$
declare
  v_role text := (select public.purchasing_settings_gate());
  v_old public.purchasing_settings%rowtype;
begin
  if p_normal_days is null or p_normal_days < 0 or p_service_days is null or p_service_days < 0
    or p_manual_whatsapp_screenshot_required is null then
    raise exception 'Enter whole calendar days of zero or more and choose Active or Inactive.' using errcode='22023';
  end if;
  select * into strict v_old from public.purchasing_settings where id=1 for update;
  if v_old.purchase_request_normal_days=p_normal_days
    and v_old.purchase_request_service_days=p_service_days
    and v_old.po_manual_whatsapp_screenshot_required=p_manual_whatsapp_screenshot_required then return; end if;
  update public.purchasing_settings set purchase_request_normal_days=p_normal_days,
    purchase_request_service_days=p_service_days,
    po_manual_whatsapp_screenshot_required=p_manual_whatsapp_screenshot_required,
    updated_by=auth.uid(), updated_at=now() where id=1;
  if v_old.purchase_request_normal_days is distinct from p_normal_days then
    perform public.purchasing_record_change(v_role,'purchase_request_normal_days',null,null,
      v_old.purchase_request_normal_days::text,p_normal_days::text,'Purchasing setting · Normal / Ready Stock recipient calendar days');
  end if;
  if v_old.purchase_request_service_days is distinct from p_service_days then
    perform public.purchasing_record_change(v_role,'purchase_request_service_days',null,null,
      v_old.purchase_request_service_days::text,p_service_days::text,'Purchasing setting · Service Case recipient calendar days');
  end if;
  if v_old.po_manual_whatsapp_screenshot_required is distinct from p_manual_whatsapp_screenshot_required then
    perform public.purchasing_record_change(v_role,'po_manual_whatsapp_screenshot_required',null,null,
      v_old.po_manual_whatsapp_screenshot_required::text,p_manual_whatsapp_screenshot_required::text,'Purchasing setting · Manual WhatsApp screenshot');
  end if;
end;
$fn$;
revoke all on function public.purchasing_set_request_settings(integer,integer,boolean) from public, anon;
grant execute on function public.purchasing_set_request_settings(integer,integer,boolean) to authenticated;
$reviewed$;
  sig:='public.purchasing_set_request_settings(integer,integer,boolean)'::regprocedure;
  select md5(replace(prosrc,chr(13),'')) into source_md5 from pg_proc where oid=sig;
  if source_md5<>'b5b2a944a9a531a6673f609fd76ca42d' then raise exception 'committed source mismatch'; end if;
  if not has_function_privilege('authenticated',sig,'execute') or has_function_privilege('anon',sig,'execute') then raise exception 'RPC grants differ'; end if;
  if exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.oid=sig and a.grantee=0 and a.privilege_type='EXECUTE') then raise exception 'public RPC execution remained'; end if;
  perform set_config('request.jwt.claims','{}',true);
  refused:=false;
  begin perform public.purchasing_set_request_settings(30,14,true); exception when insufficient_privilege then refused:=true; end;
  if not refused then raise exception 'no-account SQL gate did not fire'; end if;
  select count(*) into after_changes from public.purchasing_setting_changes;
  if before_changes<>after_changes or (select to_jsonb(s) from public.purchasing_settings s where id=1) is distinct from before_settings then raise exception 'probe changed values or audit rows'; end if;
  raise exception 'PROBE_ROLLBACK %', jsonb_build_object('source_md5',source_md5,'grants',true,'no_active_account',true,'values_and_audit_unchanged',true);
end;
$probe$;
