-- ---------------------------------------------------------------------------
-- 0308 · Manual purchase states its reason — ⚠️ RECOVERED FILE, ALREADY LIVE
--
-- **This file is a reconstruction, not the original.** The migration was
-- APPLIED to production on 2026-07-29 (tracker version 20260729152052) but
-- its file never reached `main` — its PR (#522, `claude/to-order-audit-916c44`)
-- was closed unmerged and the file went with it. That is the exact P0 red
-- line #7 names: an applied migration missing from the repository. Found
-- 2026-08-19 while 0359 measured production before building the approved
-- Manual Purchase model; the schema below was read back FROM production that
-- day (`pg_get_functiondef` + information_schema), so a fresh environment
-- converges and the history stops lying by omission.
--
-- What it built (with 0309): the "Checkpoint A" PROTOTYPE requisition lane —
-- a line-level, display-only `purchase_requests` store with a create door.
-- Its own table comment said "WORKING NAME — prototype store … Business name
-- / document prefix deliberately not frozen." No application code ever
-- referenced it. **0359 renamed the table to
-- `purchase_requests_checkpoint_a` and revoked the doors**; the approved
-- request model (header + approval + `purchase_demands` lines) replaced it.
--
-- Everything here is idempotent (`if not exists` / `or replace`), so
-- re-application on an environment that already carries it is a no-op. The
-- split of content between 0308 and 0309 is INFERENCE from the two names;
-- production holds the merged end state either way.
-- ---------------------------------------------------------------------------

set search_path = public, pg_temp;

create table if not exists public.purchase_requests (
  id               uuid primary key default gen_random_uuid(),
  source           text not null default 'display',
  product_sku_id   uuid not null references public.product_skus(id),
  qty              int  not null,
  attrs            jsonb not null default '{}'::jsonb,
  required_by      date,
  remark           text,
  created_by       uuid not null references public.app_users(id),
  created_at       timestamptz not null default now(),
  cancelled_at     timestamptz,
  cancelled_reason text
);

create or replace function public.purchase_request_create(
  p_sku_id      uuid,
  p_qty         integer,
  p_attrs       jsonb default '{}'::jsonb,
  p_required_by date default null,
  p_remark      text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_role text := public.app_role();
  v_sku text;
  v_discontinued timestamptz;
  v_sofa_mode text;
  v_build jsonb;
  v_id uuid;
begin
  -- Fail-closed caller gate (0266 shape): a missing caller, or a role outside
  -- operation|principal, is refused before anything is read. created_by is
  -- stamped from auth.uid() only — the contract has no user-id parameter.
  if v_uid is null or v_role is null or v_role not in ('operation', 'principal') then
    raise exception 'purchase_request_create: not allowed' using errcode = '42501';
  end if;

  if p_qty is null or p_qty <= 0 then
    raise exception 'qty must be a positive whole number'
      using errcode = '22023', detail = 'qty_invalid';
  end if;

  select s.sku, s.discontinued_at, m.sofa_mode
    into v_sku, v_discontinued, v_sofa_mode
    from product_skus s
    join product_models m on m.id = s.model_id
   where s.id = p_sku_id;
  if not found then
    raise exception 'sku not found' using errcode = '22023', detail = 'sku_not_found';
  end if;
  if v_discontinued is not null then
    raise exception 'sku is discontinued' using errcode = '22023', detail = 'sku_discontinued';
  end if;

  -- The configurable-product contract, off METADATA (sofa_mode) — never a
  -- name or category string (Jess's correction #3).
  v_build := coalesce(p_attrs, '{}'::jsonb) -> 'sofa_build';
  if v_sofa_mode is not null then
    if v_build is null
       or jsonb_typeof(v_build -> 'cells') is distinct from 'array'
       or jsonb_array_length(v_build -> 'cells') = 0
       or (v_build ->> 'height') is null then
      raise exception 'a configurable sofa request requires a valid attrs.sofa_build'
        using errcode = '22023', detail = 'sofa_build_required';
    end if;
  elsif v_build is not null then
    raise exception 'a standard product request must not carry attrs.sofa_build'
      using errcode = '22023', detail = 'sofa_build_not_allowed';
  end if;

  insert into purchase_requests
    (source, product_sku_id, qty, attrs, required_by, remark, created_by)
  values
    ('display', p_sku_id, p_qty, coalesce(p_attrs, '{}'::jsonb),
     p_required_by, nullif(trim(p_remark), ''), v_uid)
  returning id into v_id;

  insert into audit_log (role, actor_text, action, ref)
  values (v_role::public.app_role,
          (select name from app_users where id = v_uid),
          format('created purchase request (display): %s × %s', v_sku, p_qty),
          v_id::text);

  return v_id;
end;
$function$;
