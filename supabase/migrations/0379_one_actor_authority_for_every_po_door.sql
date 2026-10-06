-- ============================================================================
-- 0379 — one actor authority for every PO door
--        (CARD-2026-08-22-purchasing-02 closure §2; purchasing/MASTER.md §5.3)
--
-- MEASURED 2026-08-24: `purchasing_issue_pos_batch` gated on `is_operation()`
-- and NOTHING ELSE. Any Operations login could create purchase orders by
-- calling the RPC directly, and the duty check lived only in the API route that
-- SO Batch Purchase happened to use. Manual Purchase called the same RPC
-- through its own route with no duty check at all.
--
-- A door only the caller guards is not guarded. MASTER §5.3 is explicit —
-- "Only Current PO Duty may complete PO issuance" — so the authority moves into
-- the database, where every caller meets it.
--
-- ── AND COVER IS A FACT, NOT AN EXCEPTION ───────────────────────────────────
--
-- §5.3 also says duty, roster and buddy cover resolve the owner automatically.
-- There was no cover store at all, so "the duty holder is on leave" had no
-- answer except handing over the month. `ops_po_duty_cover` is a DATED,
-- MANAGEMENT-SET record naming BOTH people: the normal holder keeps the duty,
-- and the acting holder may act during the window.
--
-- Both are kept because they are different facts. `Team Work` groups by normal
-- owner; the audit trail must say who actually pressed it. Collapsing them
-- would lose one of those permanently.
--
-- ── PRINCIPAL AUDIT ACCESS IS NOT ISSUANCE AUTHORITY ────────────────────────
--
-- A principal may READ everything. That must not silently become the right to
-- commit Carres to a supplier: the resolver answers about the DUTY, and a
-- principal who is not the holder or the acting cover is refused like anyone
-- else. Making the boss an implicit buyer is how an unowned order happens.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1 · the cover record
-- ---------------------------------------------------------------------------
create table if not exists public.ops_po_duty_cover (
  id uuid primary key default gen_random_uuid(),
  /** The month the cover sits inside, so it reads beside `ops_po_duty`. */
  month text not null,
  /** Who normally holds the duty — kept, never overwritten. */
  normal_user_id uuid not null references public.app_users(id),
  /** Who may act during the window. */
  acting_user_id uuid not null references public.app_users(id),
  starts_on date not null,
  ends_on date not null,
  reason text,
  assigned_by uuid references public.app_users(id),
  created_at timestamptz not null default now(),
  constraint po_duty_cover_window check (ends_on >= starts_on),
  constraint po_duty_cover_two_people check (acting_user_id <> normal_user_id)
);

comment on table public.ops_po_duty_cover is
  '0379: dated buddy cover for PO duty. Names BOTH the normal holder and the acting one, because Team Work groups by the normal owner while the audit trail must say who actually acted.';

create index if not exists ops_po_duty_cover_window_idx
  on public.ops_po_duty_cover (month, starts_on, ends_on);

alter table public.ops_po_duty_cover enable row level security;

drop policy if exists ops_po_duty_cover_read on public.ops_po_duty_cover;
create policy ops_po_duty_cover_read on public.ops_po_duty_cover
  for select to authenticated
  using (public.app_role() in ('operation', 'principal'));

-- No write policy. Cover is set through a governed door, never by a browser
-- (the same law 0367 taught: a new table inherits grants nobody asked for).
revoke all on public.ops_po_duty_cover from authenticated;
grant select on public.ops_po_duty_cover to authenticated;

-- ---------------------------------------------------------------------------
-- 2 · THE ONE RESOLVER
-- ---------------------------------------------------------------------------
create or replace function public.purchasing_po_actor()
returns jsonb
language plpgsql
stable security definer
set search_path = public
as $$
declare
  v_today date := (timezone('Asia/Kuala_Lumpur', now()))::date;
  v_month text := to_char(timezone('Asia/Kuala_Lumpur', now()), 'YYYY-MM');
  v_normal uuid;
  v_acting uuid;
  v_cover_id uuid;
begin
  select user_id into v_normal from public.ops_po_duty where month = v_month;

  -- The newest cover whose window contains today. A window is a fact about a
  -- date, so "today" is asked once and in Malaysia time.
  select id, acting_user_id into v_cover_id, v_acting
    from public.ops_po_duty_cover
   where month = v_month
     and v_today between starts_on and ends_on
     and (v_normal is null or normal_user_id = v_normal)
   order by created_at desc
   limit 1;

  return jsonb_build_object(
    'normal_user_id', v_normal,
    'acting_user_id', v_acting,
    -- WHO MAY ACT TODAY. Cover wins while its window is open; otherwise the
    -- holder. Null means nobody may issue, which is the honest answer when no
    -- duty has been set.
    'actor_user_id', coalesce(v_acting, v_normal),
    'is_cover', v_acting is not null,
    'cover_id', v_cover_id,
    'month', v_month
  );
end;
$$;

revoke all on function public.purchasing_po_actor() from public;
grant execute on function public.purchasing_po_actor() to authenticated;

comment on function public.purchasing_po_actor() is
  '0379: the ONE resolver for who may act on Purchase Orders today — Current PO Duty, or the dated buddy cover. Returns the normal holder and the acting one separately; both are evidence.';

/**
 * The gate every PO door asks. A principal who is not the holder or the
 * acting cover is refused: audit access is not issuance authority.
 */
create or replace function public.purchasing_actor_may_issue(p_user uuid)
returns boolean
language sql
stable security definer
set search_path = public
as $$
  select p_user is not null
     and (public.purchasing_po_actor()->>'actor_user_id')::uuid = p_user;
$$;

revoke all on function public.purchasing_actor_may_issue(uuid) from public;
grant execute on function public.purchasing_actor_may_issue(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3 · every door asks it
-- ---------------------------------------------------------------------------

-- The ONE creation authority gains this gate in 0380, where it is replaced
-- once in its final form with the commercial check beside it. Replacing a
-- 300-line function twice in two files would leave two versions of it in the
-- repository's history for a reader to choose between.

-- ---------------------------------------------------------------------------
-- 3b · the evidence door asks the same resolver
-- ---------------------------------------------------------------------------

-- The evidence row carries who held the duty and who acted, SEPARATELY. Added
-- before the function that writes them, so the file reads in the order it runs.
alter table public.po_sends
  add column if not exists duty_user_id uuid references public.app_users(id);
alter table public.po_sends
  add column if not exists acting_user_id uuid references public.app_users(id);

comment on column public.po_sends.duty_user_id is
  '0379: who normally holds PO duty for that month. Team Work groups by this.';
comment on column public.po_sends.acting_user_id is
  '0379: the authorised cover who actually acted, when one did. NULL when the duty holder acted themselves.';

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
  v_version integer;
  v_status text;
  v_recipient text := btrim(coalesce(p_recipient, ''));
  v_send_id uuid;
  v_who jsonb;
begin
  if v_actor is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  -- 0379 · the SAME resolver the issue door asks. Two doors with two duty
  -- reads is two answers waiting to disagree.
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
  if v_status = 'cancelled' then
    raise exception 'po_not_issuable' using errcode = 'P0001';
  end if;

  if coalesce(v_version, 1) <> p_expected_version then
    raise exception 'stale_po_version: saw %, current is %', p_expected_version, coalesce(v_version, 1)
      using errcode = 'P0001', detail = 'stale_po_version';
  end if;

  -- BOTH people are recorded. The normal holder owns the duty; the actor is
  -- who actually pressed it. Keeping only one loses the other for good.
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
$$;

revoke all on function public.purchasing_confirm_po_sent(text, integer, text, text, text) from public;
grant execute on function public.purchasing_confirm_po_sent(text, integer, text, text, text) to authenticated;
