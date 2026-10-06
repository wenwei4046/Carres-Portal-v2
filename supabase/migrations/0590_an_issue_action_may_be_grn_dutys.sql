-- =============================================================================
-- 0590_an_issue_action_may_be_grn_dutys.sql
-- Stock MASTER §6 · Unit Detail `⋮` (0589) — a Unit problem's check routes to
-- GRN Duty.
--
-- FOUND ON THE PRODUCTION WALK 2026-09-26: `stock_unit_report_problem`
-- rolled back with "new row for relation issue_actions violates check
-- constraint issue_actions_owner_rule_check" — the constraint (0454) admits
-- only the two Issue Tracker rules. The shared contract already carries
-- `grn_duty` (packages/shared/src/issue-tracker.ts); the database now admits
-- the same three rules. The Work feed resolves `grn_duty` through the one
-- shared Duty resolver like the other two.
-- NO ROW COUNT IS ASSERTED (CLAUDE.md §5.8). No RLS change.
-- =============================================================================

begin;
set search_path = public, pg_temp;

alter table public.issue_actions
  drop constraint if exists issue_actions_owner_rule_check;

alter table public.issue_actions
  add constraint issue_actions_owner_rule_check
  check (owner_rule in ('issue_triage_duty', 'issue_review_approver', 'grn_duty'));

comment on constraint issue_actions_owner_rule_check on public.issue_actions is
  '0590: the Issue Tracker''s two rules plus grn_duty, the owner of a Unit problem''s check (Stock MASTER §6).';

commit;
