-- ============================================================================
-- 0312 — what we sent the supplier  (Jess, 2026-08-02)
--
-- ⚠️ THIS FILE IS A RECOVERY, NOT A NEW MIGRATION. ⚠️
--
-- 0312 was APPLIED TO PRODUCTION on 2026-08-02 (tracker version
-- 20260802145712) and its .sql file was never committed to any branch —
-- verified 2026-08-03 with `git log --all --diff-filter=A`. The repo's chain
-- therefore ran 0307 → 0310 → 0311 → 0314, and a fresh clone doing
-- `supabase db reset` would come up WITHOUT `po_sends`, `po_revisions`,
-- `purchasing_record_send`, `purchasing_set_message_template` and
-- `purchasing_settings.supplier_message_template` — while every branch's code
-- calls them. Jess ruled this Priority 0 on 2026-08-03: it is not a Phase 3
-- feature, it is repo integrity, and it changes no behaviour, no production
-- row, no UI and no API.
--
-- This file is RECONSTRUCTED FROM PRODUCTION (information_schema, pg_policy,
-- pg_indexes, pg_description, pg_get_functiondef) so a fresh database comes up
-- byte-identical to what prod already holds. **Do NOT re-apply it to prod** —
-- the tracker already records it, and every statement here is written to be a
-- no-op on a database that has it (`if not exists` / `or replace`).
--
-- WHAT IT DOES
--   1 · `po_revisions` — a SNAPSHOT of what the supplier was handed: the date,
--       the destination, and every line. A new one is minted ONLY when the
--       snapshot differs from the last, so re-sending an unchanged PO stays
--       the same number: the supplier is not being asked to replace anything.
--   2 · `po_sends` — one row per hand-over: channel, who, when, and WHICH
--       snapshot it carried. "We sent it" is worthless without "which version".
--   3 · `purchasing_settings.supplier_message_template` — ONE company-wide
--       draft. Per-supplier templates were refused: eleven templates are
--       eleven places to edit, and a special instruction is a remark.
--   4 · Two audited SECURITY DEFINER doors, both behind the existing
--       `purchasing_supplier_call_gate()` — same person, same job, no new duty
--       key (0303's discipline).
--
-- BOTH TABLES CARRY A **SELECT POLICY AND NO WRITE POLICY AT ALL**, so the RPC
-- is the only door: PostgREST cannot walk around the gate. `anon` holds no
-- EXECUTE on either function.
--
-- ⚠️ TWO SENTENCES IN HERE ARE KNOWN TO BE UNTRUE AND ARE COPIED FAITHFULLY.
-- `purchasing_record_send` writes `sent to %s via %s (Revision %s)` into
-- `po_history` and `PO %s — sent via %s (rev %s)` into `audit_log`. The portal
-- only ever observed that WhatsApp or the mail client was OPENED — it cannot
-- know the supplier was sent anything. Worse, `po_history_read` (0002) lets
-- the SUPPLIER read their own rows and `SupplierDashboard.tsx` prints `.text`
-- raw, so today the claim is shown to the factory itself. Jess ruled the
-- wording out on 2026-08-03. **It is NOT fixed here**: a recovery file must
-- reproduce what prod holds, or it stops being a recovery. The fix lands in
-- its own migration under the Communication Truthfulness card, together with
-- the screen strings — and the word `Revision` goes with it (she ruled
-- 2026-08-03 that this is a SNAPSHOT, never a revision: `purchase_orders` is
-- never edited by this path, and every other tool on earth means "the document
-- changed" by that word).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1 · po_revisions — the snapshot of what was handed over
-- ---------------------------------------------------------------------------
create table if not exists public.po_revisions (
  id         uuid primary key default gen_random_uuid(),
  po_id      text        not null references public.purchase_orders(id) on delete cascade,
  rev_no     integer     not null,
  snapshot   jsonb       not null,
  created_by uuid        references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (po_id, rev_no)
);

comment on table public.po_revisions is
  '0312: the supplier''s own version history. A revision is minted only when the document CHANGED since the last send — re-sending an unchanged PO is the same revision, because nothing is being replaced.';

alter table public.po_revisions enable row level security;

-- Read = internal only. A supplier can read `po_history` (0002) but NOT this
-- table; the snapshot is our record of the hand-over, not their document.
-- ⚠️ NOT InitPlan-wrapped, and that is FAITHFUL, not an oversight. Production
-- holds `using (is_internal())` — verified 2026-08-03 by reading `pg_policy`.
-- CLAUDE.md §8 Fix 2 requires `( select is_internal() )` so PG runs it ONCE per
-- query instead of once per ROW; 0002's own `po_history_read` obeys that and
-- these two do not, so the original 0312 broke the rule. This recovery file
-- REPRODUCES the defect rather than curing it: a recovery that silently
-- improves is no longer a record of what production is, and the next chat
-- comparing file to database would find a difference nobody can explain.
-- Reported to Jess 2026-08-03; the one-line correction belongs in its own
-- migration, with her word on it. Harmless at today's volume (1 revision,
-- 2 sends) and worth fixing before the table has thousands of rows.
drop policy if exists po_revisions_read on public.po_revisions;
create policy po_revisions_read on public.po_revisions
  for select to authenticated
  using ( is_internal() );

-- ---------------------------------------------------------------------------
-- 2 · po_sends — one row per hand-over
-- ---------------------------------------------------------------------------
create table if not exists public.po_sends (
  id          uuid primary key default gen_random_uuid(),
  po_id       text        not null references public.purchase_orders(id) on delete cascade,
  revision_id uuid        references public.po_revisions(id) on delete set null,
  channel     text        not null check (channel in ('whatsapp', 'email', 'print')),
  note        text,
  sent_by     uuid        references public.app_users(id) on delete set null,
  sent_at     timestamptz not null default now()
);

comment on table public.po_sends is
  '0312: every time something left Carres for this supplier — channel, who, when, and WHICH revision it carried. "We sent it" is worthless without "which version".';

create index if not exists po_sends_po_idx on public.po_sends (po_id, sent_at desc);

alter table public.po_sends enable row level security;

-- Same faithful reproduction of the un-wrapped call — see po_revisions_read.
drop policy if exists po_sends_read on public.po_sends;
create policy po_sends_read on public.po_sends
  for select to authenticated
  using ( is_internal() );

-- ---------------------------------------------------------------------------
-- 3 · the ONE company-wide message draft
-- ---------------------------------------------------------------------------
alter table public.purchasing_settings
  add column if not exists supplier_message_template text;

comment on column public.purchasing_settings.supplier_message_template is
  'ONE company-wide draft for supplier messages (Jess 2026-08-02). Placeholders: {supplier} {po} {items} {date}. Per-supplier templates were refused: eleven templates are eleven places to edit, and a special instruction is a remark.';

-- ---------------------------------------------------------------------------
-- 3b · suppliers.email — THE MISTAKE, REPRODUCED ON PURPOSE
-- ---------------------------------------------------------------------------
-- This column was 0312's own defect: `contact_email` had existed on this table
-- since the supplier portal and TWO of ten suppliers had already filled it, so
-- this is a second column for one fact — `ops_order_control.balance`'s disease.
-- 0313 drops it a few minutes later.
--
-- IT IS REPRODUCED RATHER THAN OMITTED, on Jess's ruling (2026-08-03): *"复原
-- migration 必须忠实复原历史步骤 … 否则它不是恢复原 migration，而是重新设计了一条
-- 等价终态路径."* An earlier draft of this recovery skipped the column and let
-- 0313 become a no-op — same end state, fewer steps, and WRONG: a recovery that
-- reaches the right destination by a road history never took is a redesign
-- wearing a recovery's filename, and it makes the pair untestable as a pair.
-- Because it is created here, 0313's guard and its drop are now genuinely
-- exercised on every fresh `supabase db reset`, not skipped.
--
-- `text`, nullable, no default — matching `contact_email` (verified on prod
-- 2026-08-03). The column is gone from production, so its exact original
-- definition is unrecoverable; this is the honest reconstruction, and nothing
-- can depend on the difference because 0313 removes it before any code runs.
alter table public.suppliers add column if not exists email text;

-- ---------------------------------------------------------------------------
-- 4 · the two doors
-- ---------------------------------------------------------------------------
create or replace function public.purchasing_record_send(
  p_po_id   text,
  p_channel text,
  p_note    text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_role  app_role;
  v_uid   uuid;
  v_actor text;
  v_po    purchase_orders;
  v_snap  jsonb;
  v_last  po_revisions;
  v_rev   po_revisions;
  v_sup   text;
begin
  v_role := public.purchasing_supplier_call_gate();
  v_uid  := auth.uid();

  if p_channel is null or p_channel not in ('whatsapp','email','print') then
    raise exception 'channel must be whatsapp, email or print'
      using errcode = '22023', detail = 'invalid_channel';
  end if;

  select * into v_po from purchase_orders where id = p_po_id for update;
  if not found then
    raise exception 'PO % not found', p_po_id using errcode = '42P01', detail = 'po_not_found';
  end if;

  -- What the supplier is being given, right now: the facts that change what
  -- they must DO — the date, where it goes, and every line.
  select jsonb_build_object(
           'eta_date',       v_po.eta_date,
           'destination_id', v_po.destination_id,
           'lines', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'sku', l.sku, 'qty', l.qty, 'destination_id', l.destination_id
                    ) order by l.sku, l.id)
               from purchase_order_lines l where l.po_id = p_po_id), '[]'::jsonb)
         ) into v_snap;

  select * into v_last from po_revisions
   where po_id = p_po_id order by rev_no desc limit 1;

  if v_last.id is null or v_last.snapshot is distinct from v_snap then
    insert into po_revisions (po_id, rev_no, snapshot, created_by)
    values (p_po_id, coalesce(v_last.rev_no, 0) + 1, v_snap, v_uid)
    returning * into v_rev;
  else
    -- Unchanged since the last send: the supplier is not being asked to
    -- replace anything, so this is the SAME revision.
    v_rev := v_last;
  end if;

  insert into po_sends (po_id, revision_id, channel, note, sent_by)
  values (p_po_id, v_rev.id, p_channel, nullif(btrim(coalesce(p_note, '')), ''), v_uid);

  v_sup   := coalesce((select name from suppliers where id = v_po.supplier_id), 'supplier');
  v_actor := coalesce((select name from app_users where id = v_uid), initcap(v_role::text));

  insert into po_history (po_id, text, by_role)
  values (p_po_id, format('sent to %s via %s (Revision %s)', v_sup, p_channel, v_rev.rev_no), v_role);
  insert into audit_log (role, actor_text, action, ref)
  values (v_role, v_actor, format('PO %s — sent via %s (rev %s)', p_po_id, p_channel, v_rev.rev_no), p_po_id);

  return jsonb_build_object('po_id', p_po_id, 'channel', p_channel, 'revision', v_rev.rev_no);
end;
$function$;

create or replace function public.purchasing_set_message_template(p_text text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_role  app_role;
  v_uid   uuid;
  v_actor text;
begin
  v_role := public.purchasing_supplier_call_gate();
  v_uid  := auth.uid();
  update purchasing_settings
     set supplier_message_template = nullif(btrim(coalesce(p_text, '')), ''),
         updated_by = v_uid, updated_at = now()
   where id = 1;
  v_actor := coalesce((select name from app_users where id = v_uid), initcap(v_role::text));
  insert into audit_log (role, actor_text, action, ref)
  values (v_role, v_actor, 'Purchasing — supplier message template updated', 'purchasing_settings');
  return jsonb_build_object('ok', true);
end;
$function$;

-- `anon` holds no EXECUTE on either door (0303's discipline). REVOKE ... FROM
-- public does NOT drop `anon` on Supabase — it is named explicitly.
revoke all on function public.purchasing_record_send(text, text, text) from public, anon;
revoke all on function public.purchasing_set_message_template(text)     from public, anon;
grant execute on function public.purchasing_record_send(text, text, text) to authenticated, service_role;
grant execute on function public.purchasing_set_message_template(text)    to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5 · sanity — this file must reproduce prod, not approximate it
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.po_sends') is null or to_regclass('public.po_revisions') is null then
    raise exception '0312 recovery: a table is missing after the run';
  end if;
  -- Exactly one signature each — a defaulted param can mint a second one.
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'purchasing_record_send') <> 1 then
    raise exception '0312 recovery: purchasing_record_send must have exactly ONE signature';
  end if;
  -- No write policy anywhere: the RPC is the only door.
  if exists (
    select 1 from pg_policy p join pg_class c on c.oid = p.polrelid
     where c.relname in ('po_sends', 'po_revisions') and p.polcmd <> 'r'
  ) then
    raise exception '0312 recovery: po_sends/po_revisions must carry SELECT policies only';
  end if;
end $$;
