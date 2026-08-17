-- Issue Tracker: accountability + memory + learning. Modules remain truth; Work remains action.
create sequence if not exists public.issue_no_seq;

create table public.issue_related_parties (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null check (kind in ('supplier','logistics','warehouse','customer','other')),
  source_table text, source_id uuid, report_contact text, report_recipient text,
  active boolean not null default true, created_at timestamptz not null default now(),
  unique (kind, name), unique nulls not distinct (source_table, source_id)
);

create table public.issues (
  id uuid primary key default gen_random_uuid(),
  issue_no text not null unique default ('IS-' || to_char(current_date,'YYMM') || '-' || lpad(nextval('public.issue_no_seq')::text,4,'0')),
  status text not null default 'needs_triage' check (status in ('needs_triage','open','waiting_response','waiting_review','ready_to_close','closed','voided')),
  problem_object text not null check (problem_object in ('item','delivery','document','payment','customer_information','staff_work','other')),
  observed_problem text not null check (observed_problem in ('wrong_item','damaged','missing','wrong_quantity','late','no_reply','wrong_information','work_not_done','not_sure')),
  source_module text not null, issue_type text, business_impact text not null,
  materiality text not null default 'routine' check (materiality in ('routine','significant','critical')),
  observed_on date not null, affected_object text not null, official_english text not null,
  optional_detail text, recorded_by uuid not null references public.app_users(id),
  found_by_kind text not null, found_by_name text not null,
  current_action_owner uuid references public.app_users(id), current_action_owner_name text,
  current_action_object text, current_action_recipient text, current_action_do text,
  current_action_result text, current_action_due_on date, work_task_id uuid references public.ops_tasks(id),
  review_requirement text not null default 'standard' check (review_requirement in ('standard','full')),
  discussed_on date, training_result text, sop_result text, closure_summary text,
  closed_at timestamptz, closed_by uuid references public.app_users(id),
  void_reason text, voided_at timestamptz, voided_by uuid references public.app_users(id),
  merged_into_issue_id uuid references public.issues(id), legacy_service_note_id uuid references public.service_notes(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint issue_action_complete check ((current_action_do is null and current_action_result is null and current_action_due_on is null) or (coalesce(current_action_owner_name,'') <> '' and coalesce(current_action_object,'') <> '' and coalesce(current_action_recipient,'') <> '' and coalesce(current_action_do,'') <> '' and coalesce(current_action_result,'') <> '' and current_action_due_on is not null))
);

create table public.issue_links (
  id uuid primary key default gen_random_uuid(), issue_id uuid not null references public.issues(id),
  object_kind text not null, object_id text not null, object_label text not null,
  created_by uuid not null references public.app_users(id), created_at timestamptz not null default now(),
  unique(issue_id, object_kind, object_id)
);
create table public.issue_evidence (
  id uuid primary key default gen_random_uuid(), issue_id uuid not null references public.issues(id),
  kind text not null, label text not null, storage_path text, source_url text,
  added_by uuid not null references public.app_users(id), added_at timestamptz not null default now()
);
create table public.issue_staff_involvement (
  id uuid primary key default gen_random_uuid(), issue_id uuid not null references public.issues(id),
  staff_id uuid references public.app_users(id), staff_name text not null, exact_work text not null,
  response text not null default 'no_response' check (response in ('admit','disagree','no_response','explanation_given')),
  response_detail text, responded_at timestamptz, created_at timestamptz not null default now()
);
create table public.issue_fault_owners (
  id uuid primary key default gen_random_uuid(), issue_id uuid not null references public.issues(id),
  owner_kind text not null check (owner_kind in ('related_party','internal_staff','internal_team','other')),
  related_party_id uuid references public.issue_related_parties(id), staff_id uuid references public.app_users(id), owner_name text not null,
  finding text not null check (finding in ('confirmed_fault','contributing_fault','not_yet_confirmed','not_at_fault','not_enough_evidence')),
  act_or_omission text not null, response text not null default 'no_response', response_detail text,
  reviewer_id uuid references public.app_users(id), reviewed_at timestamptz,
  liability_percent numeric(5,2) check (liability_percent between 0 and 100), superseded_by uuid references public.issue_fault_owners(id),
  created_by uuid not null references public.app_users(id), created_at timestamptz not null default now()
);
create table public.issue_money_links (
  id uuid primary key default gen_random_uuid(), issue_id uuid not null references public.issues(id),
  track text not null check (track in ('incurred','recoverable','recovered')),
  amount numeric(12,2) not null check (amount >= 0), currency text not null default 'MYR', event_date date not null,
  counterparty_name text not null, cost_bearer_id uuid references public.issue_related_parties(id), reason text not null,
  evidence_id uuid references public.issue_evidence(id), finance_record_kind text not null, finance_record_id text not null,
  recorded_by uuid not null references public.app_users(id), created_at timestamptz not null default now()
);
create table public.issue_reviews (
  id uuid primary key default gen_random_uuid(), issue_id uuid not null references public.issues(id),
  reviewer_id uuid not null references public.app_users(id), finding text not null,
  training_needed boolean not null, sop_change_needed boolean not null, reviewed_at timestamptz not null default now()
);
create table public.issue_timeline (
  id bigint generated always as identity primary key, issue_id uuid not null references public.issues(id),
  event_kind text not null, summary text not null, payload jsonb not null default '{}'::jsonb,
  actor_id uuid references public.app_users(id), occurred_at timestamptz not null default now()
);
create table public.issue_report_runs (
  id uuid primary key default gen_random_uuid(), related_party_id uuid not null references public.issue_related_parties(id),
  report_month date not null, version integer not null, state text not null default 'draft' check (state in ('draft','approved','sent')),
  snapshot jsonb not null, approved_by uuid references public.app_users(id), approved_at timestamptz,
  sent_to text, sent_channel text, sent_at timestamptz, sent_by uuid references public.app_users(id),
  created_by uuid not null references public.app_users(id), created_at timestamptz not null default now(),
  unique(related_party_id, report_month, version)
);

create index issues_register_idx on public.issues(status, observed_on desc);
create index issues_wednesday_idx on public.issues(discussed_on, status, observed_on);
create index issue_fault_party_idx on public.issue_fault_owners(related_party_id, finding) where superseded_by is null;
create index issue_money_issue_idx on public.issue_money_links(issue_id, track);
create index issue_timeline_issue_idx on public.issue_timeline(issue_id, occurred_at);

alter table public.issue_related_parties enable row level security;
alter table public.issues enable row level security;
alter table public.issue_links enable row level security;
alter table public.issue_evidence enable row level security;
alter table public.issue_staff_involvement enable row level security;
alter table public.issue_fault_owners enable row level security;
alter table public.issue_money_links enable row level security;
alter table public.issue_reviews enable row level security;
alter table public.issue_timeline enable row level security;
alter table public.issue_report_runs enable row level security;

do $$ declare t text; begin foreach t in array array['issue_related_parties','issues','issue_links','issue_evidence','issue_staff_involvement','issue_fault_owners','issue_money_links','issue_reviews','issue_timeline','issue_report_runs'] loop
  execute format('create policy %I_internal_read on public.%I for select using ((select public.app_role()) in (''operation'',''finance'',''principal''))', t, t);
  execute format('create policy %I_ops_insert on public.%I for insert with check ((select public.app_role()) in (''operation'',''principal''))', t, t);
  if t <> 'issue_timeline' then execute format('create policy %I_ops_update on public.%I for update using ((select public.app_role()) in (''operation'',''principal'')) with check ((select public.app_role()) in (''operation'',''principal''))', t, t); end if;
end loop; end $$;
-- Finance may add money truth, but not rewrite accountability records.
create policy issue_money_finance_write on public.issue_money_links for all using ((select public.app_role()) in ('finance','principal')) with check ((select public.app_role()) in ('finance','principal'));

grant select on public.issue_related_parties, public.issues, public.issue_links, public.issue_evidence, public.issue_staff_involvement, public.issue_fault_owners, public.issue_money_links, public.issue_reviews, public.issue_timeline, public.issue_report_runs to authenticated;
grant insert, update on public.issue_related_parties, public.issues, public.issue_links, public.issue_evidence, public.issue_staff_involvement, public.issue_fault_owners, public.issue_reviews, public.issue_report_runs to authenticated;
grant insert on public.issue_timeline to authenticated;
grant insert, update on public.issue_money_links to authenticated;
grant usage, select on sequence public.issue_no_seq to authenticated;

create or replace function public.issue_timeline_on_insert() returns trigger language plpgsql security definer set search_path=public as $$ begin insert into public.issue_timeline(issue_id,event_kind,summary,actor_id,payload) values(new.id,'issue_recorded','Issue recorded',new.recorded_by,jsonb_build_object('issue_no',new.issue_no,'official_english',new.official_english)); return new; end $$;
create trigger issue_recorded_timeline after insert on public.issues for each row execute function public.issue_timeline_on_insert();
