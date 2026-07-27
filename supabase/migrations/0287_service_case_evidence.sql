-- 0287_service_case_evidence.sql
--
-- Service Case execution queue S2 — the evidence checklist. Locked with Jess
-- 2026-07-27 (docs/service-case-execution-queue.md card S2):
-- **no evidence, no service case.**
--
-- S1 (0285) made "what's wrong" a stable key. S2 makes that key decide which
-- uploads the case cannot be filed without, and stamps every file with who
-- uploaded it and when.
--
-- Additive only. One column, one helper, one CHECK, one bucket:
--
--   * service_cases.evidence — jsonb array of
--       {slot, path, kind, at, by, by_role}
--     `slot` is the checklist line the file answers (CASE_EVIDENCE_SLOTS in
--     packages/shared/service-case-evidence.ts — ONE shared constant, NOT a
--     config table, same law as T4's delivery reasons and S1's intake lists).
--     `path` is the object key in the private `service-case-evidence` bucket.
--     Appended only by the case create + the dedicated evidence endpoints; the
--     generic PATCH cannot touch it (updateServiceCaseInputSchema omits it), so
--     the ledger is append-only by construction.
--
-- ── Where the RULE lives, and why it is not in here ─────────────────────────
--
-- The CHECKLIST itself (which slots, how many, which are required, which apply
-- only when the customer reported it) stays in the shared TypeScript constant
-- and is enforced by the API on create. It is deliberately NOT mirrored in SQL:
-- unlike 0285's flat key lists, the checklist is a FUNCTION of two answers plus
-- per-slot counts, so a SQL copy would not be a mirror — it would be a second,
-- differently-shaped rule that drifts. (0285's own notes call the two-copy cost
-- out for the priority ladder; there it was worth paying because the rule is
-- three rungs and the database had to be able to reach the answer alone.)
--
-- What the database DOES enforce is the part it can hold alone:
--
--   1. THE STAMP. `service_case_evidence_wellformed` refuses any entry missing
--      slot / path / kind / at / by / by_role. "Every file is stamped
--      who-uploaded + when" is then structurally true, not a promise the write
--      path is trusted to keep — no route can append an anonymous file.
--   2. THE FLOOR. A case that NAMES an issue type must carry at least one file.
--      This is strictly WEAKER than the API's checklist (every issue type's
--      required list has at least one entry for every reporter — asserted in
--      service-case-evidence.test.ts), so it can never refuse something the API
--      would have allowed. It is the backstop for a future write path that
--      forgets the gate, in the same spirit as making `priority` generated
--      rather than merely un-offered.
--
-- Cases filed BEFORE S2 keep an empty ledger and stay valid: the floor only
-- applies where issue_type is set, and the one live case (SC2607-01 — real
-- data, never delete) predates the wizard entirely.
--
-- RLS: service_cases' single existing policy (sc_op_principal_all, operation +
-- principal, ALL) already covers the new column. No policy change.

set search_path = public;

alter table public.service_cases
  add column if not exists evidence jsonb not null default '[]'::jsonb;

-- A CHECK cannot contain a set-returning function, so the per-element walk
-- lives in an IMMUTABLE helper. jsonb_typeof(NULL) is NULL and NULL is
-- DISTINCT FROM 'string', so a MISSING key fails the same way a wrong-typed one
-- does — which is the point: the stamp cannot be omitted.
create or replace function public.service_case_evidence_wellformed(v jsonb)
returns boolean
language sql
immutable
as $$
  select jsonb_typeof(v) = 'array'
     and not exists (
       select 1
       from jsonb_array_elements(v) e
       where jsonb_typeof(e.value)              <> 'object'
          or jsonb_typeof(e.value -> 'slot')    is distinct from 'string'
          or jsonb_typeof(e.value -> 'path')    is distinct from 'string'
          or jsonb_typeof(e.value -> 'kind')    is distinct from 'string'
          or jsonb_typeof(e.value -> 'at')      is distinct from 'string'
          or jsonb_typeof(e.value -> 'by')      is distinct from 'string'
          or jsonb_typeof(e.value -> 'by_role') is distinct from 'string'
          or e.value ->> 'path' = ''
     );
$$;

comment on function public.service_case_evidence_wellformed(jsonb) is
  'S2 (0287): every evidence entry must carry slot/path/kind/at/by/by_role. Makes "who uploaded it and when" structurally non-optional rather than trusted to the write path.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sc_evidence_wellformed') then
    alter table public.service_cases add constraint sc_evidence_wellformed
      check (public.service_case_evidence_wellformed(evidence));
  end if;

  -- The floor. Strictly weaker than the API checklist by construction.
  --
  -- The jsonb_typeof guard is load-bearing, not belt-and-braces: CHECK
  -- constraints on one row are evaluated in an unspecified order, and
  -- jsonb_array_length() on a non-array raises 22023 (a hard error) rather than
  -- failing the check. Without the guard, writing an object instead of an array
  -- crashes here BEFORE sc_evidence_wellformed can refuse it — which is exactly
  -- what this migration's own dry run hit against live prod.
  if not exists (select 1 from pg_constraint where conname = 'sc_evidence_required_with_issue') then
    alter table public.service_cases add constraint sc_evidence_required_with_issue
      check (
        issue_type is null
        or (jsonb_typeof(evidence) = 'array' and jsonb_array_length(evidence) > 0)
      );
  end if;
end $$;

comment on column public.service_cases.evidence is
  'S2 (0287): evidence ledger — jsonb array of {slot, path, kind, at, by, by_role}. slot = the checklist line answered (CASE_EVIDENCE_SLOTS, packages/shared/service-case-evidence.ts); path = object key in the private service-case-evidence bucket. Append-only: written by the case create + the evidence endpoints, never by the generic PATCH.';

-- ── the private evidence bucket ──────────────────────────────────────────────
-- PRIVATE, like rental-agreements (0267) and unlike product photos (0173): a
-- complaint photo shows a customer's home, and the video may carry their voice.
-- Reads go through short-lived signed URLs from the Worker.
--
-- 25 MB, not 2 MB: the checklist asks for a 10-20 second video (Jess's own
-- example), and a phone clip cannot be re-encoded in the browser the way a photo
-- can. CASE_EVIDENCE_MAX_BYTES mirrors this so the browser can refuse in plain
-- words instead of surfacing a storage error.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('service-case-evidence', 'service-case-evidence', false, 26214400,
        array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists service_case_evidence_internal_select on storage.objects;
drop policy if exists service_case_evidence_internal_insert on storage.objects;

create policy service_case_evidence_internal_select on storage.objects
  for select to authenticated
  using (bucket_id = 'service-case-evidence' and (select public.is_internal()));

create policy service_case_evidence_internal_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'service-case-evidence' and (select public.is_internal()));

-- Deliberately NO update and NO delete policy: evidence is evidence. A wrong
-- photo is answered by uploading the right one, not by editing the record — the
-- same rule 0267 applies to a signed agreement.

-- ── sanity ──────────────────────────────────────────────────────────────────
do $$
declare
  refused boolean;
  case_id uuid;
  stamped jsonb := jsonb_build_array(jsonb_build_object(
    'slot', 'overall_photo', 'path', 'draft/x/1.jpg', 'kind', 'photo',
    'at', '2026-07-27T00:00:00Z', 'by', '00000000-0000-0000-0000-000000000001',
    'by_role', 'operation'));
begin
  -- A case with no issue type may hold an empty ledger (every case filed before
  -- S2, including the one real row).
  insert into public.service_cases (case_no, customer_name)
  values ('SC-SANITY-0287', 'sanity') returning id into case_id;
  if (select jsonb_array_length(evidence) from public.service_cases where id = case_id) <> 0 then
    raise exception 'S2 sanity: evidence must default to an empty array';
  end if;

  -- THE FLOOR: naming an issue type with an empty ledger must be refused.
  -- The flag is set INSIDE the handler and checked OUTSIDE it — a RAISE inside
  -- its own EXCEPTION block catches itself and proves nothing (the 0279 lesson).
  refused := false;
  begin
    update public.service_cases set issue_type = 'damaged' where id = case_id;
  exception when check_violation then
    refused := true;
  end;
  if not refused then
    raise exception 'S2 sanity: a case named an issue type with no evidence';
  end if;

  -- ...and the same case WITH a stamped file is accepted (a too-tight CHECK is
  -- as bad as none).
  update public.service_cases
     set issue_type = 'damaged', evidence = stamped
   where id = case_id;
  if (select jsonb_array_length(evidence) from public.service_cases where id = case_id) <> 1 then
    raise exception 'S2 sanity: a stamped evidence entry was not stored';
  end if;

  -- THE STAMP: an entry missing `by` must be refused...
  refused := false;
  begin
    update public.service_cases
       set evidence = jsonb_build_array(jsonb_build_object(
             'slot', 'overall_photo', 'path', 'draft/x/1.jpg', 'kind', 'photo',
             'at', '2026-07-27T00:00:00Z', 'by_role', 'operation'))
     where id = case_id;
  exception when check_violation then
    refused := true;
  end;
  if not refused then
    raise exception 'S2 sanity: an evidence entry with no uploader was accepted';
  end if;

  -- ...and so must one missing `at`.
  refused := false;
  begin
    update public.service_cases
       set evidence = jsonb_build_array(jsonb_build_object(
             'slot', 'overall_photo', 'path', 'draft/x/1.jpg', 'kind', 'photo',
             'by', '00000000-0000-0000-0000-000000000001', 'by_role', 'operation'))
     where id = case_id;
  exception when check_violation then
    refused := true;
  end;
  if not refused then
    raise exception 'S2 sanity: an evidence entry with no timestamp was accepted';
  end if;

  -- ...and a blank path (a "file" pointing at nothing).
  refused := false;
  begin
    update public.service_cases
       set evidence = jsonb_build_array(jsonb_build_object(
             'slot', 'overall_photo', 'path', '', 'kind', 'photo',
             'at', '2026-07-27T00:00:00Z', 'by', '00000000-0000-0000-0000-000000000001',
             'by_role', 'operation'))
     where id = case_id;
  exception when check_violation then
    refused := true;
  end;
  if not refused then
    raise exception 'S2 sanity: an evidence entry with a blank path was accepted';
  end if;

  -- A bare object instead of an array must be refused too.
  refused := false;
  begin
    update public.service_cases set evidence = '{"slot":"overall_photo"}'::jsonb where id = case_id;
  exception when check_violation then
    refused := true;
  end;
  if not refused then
    raise exception 'S2 sanity: evidence accepted a non-array';
  end if;

  -- Clearing the issue type must let the ledger go back to empty (the case is
  -- no longer claiming an issue).
  update public.service_cases set issue_type = null, evidence = '[]'::jsonb where id = case_id;

  delete from public.service_cases where id = case_id;

  -- The bucket must exist and be PRIVATE — a complaint photo shows a home.
  if not exists (
    select 1 from storage.buckets where id = 'service-case-evidence' and public = false
  ) then
    raise exception 'S2 sanity: the evidence bucket is missing or public';
  end if;

  -- The video the checklist asks for must be an allowed type.
  if not exists (
    select 1 from storage.buckets
    where id = 'service-case-evidence' and 'video/mp4' = any(allowed_mime_types)
  ) then
    raise exception 'S2 sanity: the evidence bucket refuses the video the checklist asks for';
  end if;

  -- The one real case must be untouched and still readable.
  if not exists (select 1 from public.service_cases where case_no = 'SC2607-01') then
    raise exception 'S2 sanity: the live case is missing';
  end if;

  raise notice 'S2 sanity: OK';
end $$;
