-- 0285_service_case_guided_intake.sql
-- (Drafted as 0283; renumbered before apply — parallel lines applied
--  0283_partner_delivery_rules and 0284_receiving_pending_delivery to the
--  shared prod database while this was being built. Guardrail #8: check the
--  tracker tail immediately before numbering AND again before applying.)
--
-- Service Case execution queue S1 — the guided intake replaces the essay.
-- Locked with Jess 2026-07-27 (docs/service-case-execution-queue.md card S1):
-- staff cannot fill free-text forms, so the wizard asks five closed questions
-- and every answer is stored as a STABLE KEY, not prose.
--
-- Additive only. The existing free-text columns (what_happened, carres_action,
-- what_affected, incurred_charges) are UNTOUCHED and keep their live row:
-- the wizard COMPOSES what_happened from the answers (composeCaseSummary in
-- packages/shared/service-case-intake.ts) so the list column, the printable
-- Service Note and every other reader keep working with zero changes. Prose is
-- a render of the structured answers now, not a second source of truth.
--
-- Columns:
--   * reported_by      — who found it (customer/warehouse/logistic/supplier/staff)
--   * order_line_id    — WHICH product, as the real order line. ON DELETE SET
--                        NULL, not CASCADE: `replace_order_lines` (0255) deletes
--                        and re-inserts lines on an item edit, and losing the
--                        whole complaint because someone edited the order would
--                        be the worst possible cascade.
--   * product_sku      — snapshot of that line's SKU, for exactly the same
--                        reason: the case must still be able to say WHAT broke
--                        after the line is gone. (Also the only product a case
--                        with no linked order can name.)
--   * product_category — mattress | bedframe | sofa | other. Snapshotted rather
--                        than re-derived on read so S5's monthly counts cannot
--                        move under an old case when the SKU classifier is
--                        taught a new model keyword.
--   * issue_type       — ONE global key set (S5 counts "damaged" across every
--                        category from one column); which keys a category may
--                        offer is the UI's narrowing, mirrored below.
--   * usable           — yes | temporary | no
--   * priority         — GENERATED from `usable`. Not a plain column on
--                        purpose: the card says staff never pick a priority, so
--                        no write path is GIVEN the ability to. The rule lives
--                        twice (here + casePriorityFor in shared) because the
--                        DB cannot import TypeScript — both assert the same
--                        three-rung ladder.
--   * customer_wants   — text[] multi-pick, element-checked.
--
-- Every CHECK allows NULL: the 1 live case (SC2607-01, real data — never
-- delete) predates the wizard, and the edit modal still writes prose-only.
--
-- RLS: service_cases' single existing policy (sc_op_principal_all, operation +
-- principal, ALL) already covers the new columns. No policy change.

set search_path = public;

alter table public.service_cases
  add column if not exists reported_by      text,
  add column if not exists order_line_id    uuid references public.order_lines(id) on delete set null,
  add column if not exists product_sku      text,
  add column if not exists product_category text,
  add column if not exists issue_type       text,
  add column if not exists usable           text,
  add column if not exists customer_wants   text[] not null default '{}'::text[];

-- priority is DERIVED, never supplied. Adding it separately (and only when
-- absent) keeps this migration re-runnable.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'service_cases' and column_name = 'priority'
  ) then
    alter table public.service_cases
      add column priority text generated always as (
        case usable
          when 'no'        then 'high'
          when 'temporary' then 'normal'
          when 'yes'       then 'low'
          else null
        end
      ) stored;
  end if;
end $$;

-- ── the shared constants, mirrored ──────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sc_reported_by_known') then
    alter table public.service_cases add constraint sc_reported_by_known
      check (reported_by is null or reported_by in
        ('customer','warehouse','logistic','supplier','staff'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'sc_product_category_known') then
    alter table public.service_cases add constraint sc_product_category_known
      check (product_category is null or product_category in
        ('mattress','bedframe','sofa','other'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'sc_issue_type_known') then
    alter table public.service_cases add constraint sc_issue_type_known
      check (issue_type is null or issue_type in
        ('wrong_sku','missing_parts','wrong_spec','wrong_colour','colour_uneven','damaged','other'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'sc_usable_known') then
    alter table public.service_cases add constraint sc_usable_known
      check (usable is null or usable in ('yes','temporary','no'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'sc_customer_wants_known') then
    alter table public.service_cases add constraint sc_customer_wants_known
      check (customer_wants <@ array['repair','replace','missing_parts','inspection','refund']::text[]);
  end if;
end $$;

-- An unindexed FK makes every order-line delete seq-scan this table, and
-- `replace_order_lines` deletes lines on ordinary item edits.
create index if not exists service_cases_order_line_id_idx
  on public.service_cases (order_line_id)
  where order_line_id is not null;

comment on column public.service_cases.reported_by is
  'S1 (0285): who found the issue. Key from CASE_REPORTERS (packages/shared/service-case-intake.ts).';
comment on column public.service_cases.order_line_id is
  'S1 (0285): the order line the complaint is about. ON DELETE SET NULL — an item edit (replace_order_lines) must never delete the complaint; product_sku holds the snapshot.';
comment on column public.service_cases.product_category is
  'S1 (0285): mattress|bedframe|sofa|other, snapshotted at intake. Decides which issue_type options the wizard offered.';
comment on column public.service_cases.issue_type is
  'S1 (0285): what is wrong. ONE global key set across every category so S5 can count an issue type in one pass.';
comment on column public.service_cases.priority is
  'S1 (0285): GENERATED from usable (no=high, temporary=normal, yes=low). Staff never pick a priority — no write path can set this column.';
comment on column public.service_cases.customer_wants is
  'S1 (0285): multi-pick of what the customer asked for. Keys from CASE_WANTS.';

-- ── sanity ──────────────────────────────────────────────────────────────────
do $$
declare
  refused boolean := false;
  got     text;
  case_id uuid;
begin
  -- The priority ladder, all three rungs + the unanswered case.
  insert into public.service_cases (case_no, customer_name, usable)
  values ('SC-SANITY-0285', 'sanity', 'no') returning id into case_id;
  select priority into got from public.service_cases where id = case_id;
  if got is distinct from 'high' then
    raise exception 'S1 sanity: usable=no must generate priority=high, got %', got;
  end if;

  update public.service_cases set usable = 'temporary' where id = case_id;
  select priority into got from public.service_cases where id = case_id;
  if got is distinct from 'normal' then
    raise exception 'S1 sanity: usable=temporary must generate priority=normal, got %', got;
  end if;

  update public.service_cases set usable = 'yes' where id = case_id;
  select priority into got from public.service_cases where id = case_id;
  if got is distinct from 'low' then
    raise exception 'S1 sanity: usable=yes must generate priority=low, got %', got;
  end if;

  update public.service_cases set usable = null where id = case_id;
  select priority into got from public.service_cases where id = case_id;
  if got is not null then
    raise exception 'S1 sanity: an unanswered case must have no priority, got %', got;
  end if;

  -- A junk want must be refused. The flag is set INSIDE the handler and checked
  -- OUTSIDE it — a RAISE inside its own EXCEPTION block catches itself and
  -- proves nothing (the 0279 lesson).
  begin
    update public.service_cases set customer_wants = array['repair','free_sofa'] where id = case_id;
  exception when check_violation then
    refused := true;
  end;
  if not refused then
    raise exception 'S1 sanity: customer_wants accepted an unknown key';
  end if;

  -- A junk issue type must be refused, same shape.
  refused := false;
  begin
    update public.service_cases set issue_type = 'smells_funny' where id = case_id;
  exception when check_violation then
    refused := true;
  end;
  if not refused then
    raise exception 'S1 sanity: issue_type accepted an unknown key';
  end if;

  -- The real keys must all be ACCEPTED (a too-tight CHECK is as bad as none).
  update public.service_cases
     set issue_type     = 'colour_uneven',
         reported_by    = 'logistic',
         product_category = 'sofa',
         customer_wants = array['repair','replace','missing_parts','inspection','refund']
   where id = case_id;

  delete from public.service_cases where id = case_id;

  -- The one real case must be untouched and still readable.
  if not exists (select 1 from public.service_cases where case_no = 'SC2607-01') then
    raise exception 'S1 sanity: the live case is missing';
  end if;

  raise notice 'S1 sanity: OK';
end $$;
