-- 0228_orders_partner_column_whitelist.sql
--
-- NETS pre-golive RLS audit, fix 2/3.
-- The orders_dealer_update RLS policy row-scopes partner updates (own assigned
-- orders only) but Postgres RLS has no column granularity — so a partner JWT
-- could edit customer, money, and status fields on its own orders. This adds a
-- column-whitelist BEFORE UPDATE trigger for the partner role, modeled on
-- enforce_partner_po_column_whitelist (0067), but as an ALLOW-list: any column
-- not explicitly allowed (including future columns) is blocked for partner.
--
-- Allowed for partner (its own delivery-leg state only):
--   partner_stage, partner_picked_at, partner_eta,
--   partner_accepted_at, partner_rejected_at, partner_rejected_reason,
--   pod_signature_url, pod_signed_by, pod_signed_at,
--   updated_at (echoed by clients; overwritten by set_updated_at anyway)
--
-- Exemptions:
--   * non-partner roles (app_role() null = service_role/migrations) — untouched
--   * pg_trigger_depth() > 1 — updates issued by OTHER triggers (the
--     thread→orders rollup cascades that legitimately flip status/delivered_at
--     when a partner RPC advances a thread). Those cascades are the sanctioned
--     path for status changes; a direct partner UPDATE of status stays blocked.
--
-- Trigger name starts with "enforce_" so it fires BEFORE the orders_auto_*
-- triggers (alphabetical order): it sees the partner's raw NEW row, before
-- auto-cascade triggers legitimately mutate status/delivered_at.

create or replace function public.enforce_partner_orders_column_whitelist()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  masked public.orders;
begin
  if (select public.app_role()) is distinct from 'partner' then
    return new;
  end if;

  -- Cascade exemption: updates issued from inside another trigger (thread
  -- rollups) are the sanctioned status path.
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  -- Whitelist check: copy OLD, graft on the allowed columns from NEW; if the
  -- result still differs from NEW, a non-whitelisted column was changed.
  masked := old;
  masked.partner_stage           := new.partner_stage;
  masked.partner_picked_at       := new.partner_picked_at;
  masked.partner_eta             := new.partner_eta;
  masked.partner_accepted_at     := new.partner_accepted_at;
  masked.partner_rejected_at     := new.partner_rejected_at;
  masked.partner_rejected_reason := new.partner_rejected_reason;
  masked.pod_signature_url       := new.pod_signature_url;
  masked.pod_signed_by           := new.pod_signed_by;
  masked.pod_signed_at           := new.pod_signed_at;
  masked.updated_at              := new.updated_at;

  if new is distinct from masked then
    raise exception 'Logistic partner may only update its own delivery-leg fields (partner_stage / pickup + ETA / rejection / POD); money, customer, status and all other order fields are read-only for partners'
      using errcode = '42501', detail = 'partner_orders_column_whitelist_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_partner_orders_whitelist_trg on public.orders;

create trigger enforce_partner_orders_whitelist_trg
before update on public.orders
for each row
execute function public.enforce_partner_orders_column_whitelist();
