-- =============================================================================
-- 0155_add_logistic_partners.sql — Add 4 new logistic partners
-- 2026-06-05 (Loo authorised in conversation per CLAUDE.md §7 + §14 #2).
--
-- Real-world coverage gap: current portal only has NETS / TSDD / HOUZS / AL
-- (all Klang Valley focused). Loo's Carres_Master.xlsx workbook already had
-- Teow + TT (KL→JB lanes) but the portal never caught up. EU + SSY (JB→SG)
-- are genuinely new — Carres is starting to take cross-border orders.
--
-- Phase 1 (this migration): partners exist as DROPDOWN OPTIONS only.
-- Operation can assign them in Inbox; orders flow through the normal
-- pipeline. POD upload by Carres ops on partners' behalf.
--
-- Phase 2 (later, when Loo decides to onboard for self-service):
-- Create app_users / partner accounts via PrincipalAccounts UI.
-- Partners login + see their own assigned orders + upload POD themselves.
--
-- `zones` is informational only here; the planned smart-suggest layer in
-- Inbox (auto-recommend partner from customer's delivery state) will read
-- from a richer state-mapping table — not from this free-text `zones`.
-- =============================================================================

do $apply$
begin
  -- Idempotency guard: if Loo runs this twice by hand, bail rather than dupe.
  if exists (
    select 1 from delivery_partners
    where name in ('Teow','TT','EU','SSY')
  ) then
    raise notice '0155: one of Teow/TT/EU/SSY already exists — skipping insert';
    return;
  end if;

  insert into delivery_partners (name, zones, onboarded_date) values
    ('Teow', 'KL → Johor Bahru',        current_date),
    ('TT',   'KL → Johor Bahru',        current_date),
    ('EU',   'Johor Bahru → Singapore', current_date),
    ('SSY',  'Johor Bahru → Singapore', current_date);
end $apply$;

-- =============================================================================
-- Sanity
-- =============================================================================
do $sanity$
declare
  n_total int;
begin
  select count(*) into n_total
    from delivery_partners
   where name in ('Teow','TT','EU','SSY');
  if n_total <> 4 then
    raise exception '0155 sanity: expected 4 new partners present, got %', n_total;
  end if;
  raise notice '0155 OK: Teow/TT/EU/SSY added to delivery_partners (Inbox dropdown gets them automatically)';
end $sanity$;
