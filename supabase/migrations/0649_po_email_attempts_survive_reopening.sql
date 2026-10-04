-- 0649 · Provider dispatch attempts persist independently of confirmation records.
-- Only the verified Worker integration may write/read this ledger via service-role RPC.
-- Authenticated callers retain the existing PO confirmation door; no new permission to
-- manufacture provider dispatch, no PDF bytes/credentials and no second po_sends writer.
begin;

create table public.po_email_attempts (
  id uuid primary key,
  supplier_id uuid not null references public.suppliers(id),
  actor_id uuid not null references public.app_users(id),
  recipient text not null,
  payload_digest text not null check (payload_digest ~ '^[a-f0-9]{64}$'),
  outcome text not null default 'prepared' check (outcome in ('prepared','unknown','failed','dispatched')),
  provider_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((outcome = 'dispatched') = (provider_id is not null))
);
create table public.po_email_attempt_documents (
  attempt_id uuid not null references public.po_email_attempts(id),
  po_id text not null references public.purchase_orders(id),
  po_version integer not null check (po_version > 0),
  blocks_replay boolean not null default true,
  primary key (attempt_id,po_id)
);
create unique index po_email_one_active_attempt_per_version
  on public.po_email_attempt_documents(po_id,po_version) where blocks_replay;
alter table public.po_email_attempts enable row level security;
alter table public.po_email_attempt_documents enable row level security;
revoke all on public.po_email_attempts, public.po_email_attempt_documents from public,anon,authenticated;

-- Integration-only: API must authenticate Operation and validate its visible PO set first.
-- Repeat those source/permission checks here before atomically reserving any version.
create function public.purchasing_prepare_po_email(
  p_attempt_id uuid, p_actor_id uuid, p_supplier_id uuid, p_recipient text,
  p_payload_digest text, p_documents jsonb, p_resend boolean default false
) returns jsonb language plpgsql security definer set search_path = public,pg_temp as $$
declare
  v_prior public.po_email_attempts%rowtype;
  v_document jsonb;
  v_po public.purchase_orders%rowtype;
  v_contact text;
  v_block public.po_email_attempts%rowtype;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'forbidden' using errcode='42501'; end if;
  if not public.purchasing_actor_may_issue(p_actor_id) then raise exception 'forbidden' using errcode='42501'; end if;
  if p_attempt_id is null or p_actor_id is null or p_supplier_id is null or p_recipient is null
     or p_payload_digest is null or p_payload_digest !~ '^[a-f0-9]{64}$'
     or jsonb_typeof(p_documents) is distinct from 'array'
     or jsonb_array_length(p_documents) not between 1 and 25 then
    raise exception 'invalid_email_attempt' using errcode='22023';
  end if;
  if (select count(distinct d->>'id') from jsonb_array_elements(p_documents) d) <> jsonb_array_length(p_documents) then
    raise exception 'duplicate_po' using errcode='22023';
  end if;
  -- Lock selected POs in one stable order, serialising overlapping attempts.
  for v_document in select value from jsonb_array_elements(p_documents) order by value->>'id' loop
    select * into v_po from public.purchase_orders where id=v_document->>'id' for update;
    if not found or v_po.supplier_id is distinct from p_supplier_id or v_po.status='cancelled'
       or coalesce(v_po.version,1) is distinct from (v_document->>'version')::integer then
      raise exception 'stale_po_version' using errcode='22023';
    end if;
  end loop;
  select * into v_prior from public.po_email_attempts where id=p_attempt_id for update;
  if found then
    if v_prior.payload_digest is distinct from p_payload_digest or v_prior.supplier_id is distinct from p_supplier_id
       or v_prior.recipient is distinct from p_recipient then
      raise exception 'email_attempt_changed' using errcode='22023';
    end if;
    return jsonb_build_object('created',false,'status',v_prior.outcome,'providerId',v_prior.provider_id);
  end if;
  select btrim(contact_email) into v_contact from public.suppliers where id=p_supplier_id;
  if v_contact is distinct from p_recipient then raise exception 'recipient_changed' using errcode='22023'; end if;
  for v_document in select value from jsonb_array_elements(p_documents) loop
    select a.* into v_block from public.po_email_attempt_documents d join public.po_email_attempts a on a.id=d.attempt_id
      where d.po_id=v_document->>'id' and d.po_version=(v_document->>'version')::integer and d.blocks_replay;
    if found then
      -- Unknown/prepared can NEVER be bypassed by explicit resend.
      if not p_resend or v_block.outcome <> 'dispatched' then
        raise exception 'email_attempt_pending' using errcode='22023';
      end if;
      update public.po_email_attempt_documents set blocks_replay=false
        where attempt_id=v_block.id and po_id=v_document->>'id';
    end if;
  end loop;
  insert into public.po_email_attempts(id,supplier_id,actor_id,recipient,payload_digest)
    values(p_attempt_id,p_supplier_id,p_actor_id,p_recipient,p_payload_digest);
  insert into public.po_email_attempt_documents(attempt_id,po_id,po_version)
    select p_attempt_id,value->>'id',(value->>'version')::integer from jsonb_array_elements(p_documents);
  return jsonb_build_object('created',true,'status','prepared');
end;
$$;

create function public.purchasing_record_po_email_outcome(p_attempt_id uuid,p_outcome text,p_provider_id text default null)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_prior public.po_email_attempts%rowtype;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'forbidden' using errcode='42501'; end if;
  if p_outcome is null or p_outcome not in ('unknown','failed','dispatched')
     or (p_outcome='dispatched') is distinct from (nullif(btrim(p_provider_id),'') is not null) then
    raise exception 'invalid_email_outcome' using errcode='22023';
  end if;
  select * into v_prior from public.po_email_attempts where id=p_attempt_id for update;
  if not found then raise exception 'unknown_email_attempt' using errcode='22023'; end if;
  if v_prior.outcome='dispatched' then
    if p_outcome='dispatched' and v_prior.provider_id=p_provider_id then return; end if;
    raise exception 'email_outcome_already_recorded' using errcode='22023';
  end if;
  if v_prior.outcome='failed' and p_outcome <> 'failed' then
    raise exception 'email_outcome_already_recorded' using errcode='22023';
  end if;
  update public.po_email_attempts set outcome=p_outcome,provider_id=p_provider_id,updated_at=now() where id=p_attempt_id;
  if p_outcome='failed' then
    update public.po_email_attempt_documents set blocks_replay=false where attempt_id=p_attempt_id;
  end if;
end;
$$;
revoke all on function public.purchasing_prepare_po_email(uuid,uuid,uuid,text,text,jsonb,boolean) from public,anon,authenticated;
revoke all on function public.purchasing_record_po_email_outcome(uuid,text,text) from public,anon,authenticated;
grant execute on function public.purchasing_prepare_po_email(uuid,uuid,uuid,text,text,jsonb,boolean) to service_role;
grant execute on function public.purchasing_record_po_email_outcome(uuid,text,text) to service_role;
grant select on public.po_email_attempts,public.po_email_attempt_documents to service_role;
commit;
