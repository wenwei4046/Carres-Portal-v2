-- =============================================================================
-- 0030_po_sup_status_v3.sql — Phase 4 v3-S3
-- =============================================================================
-- Source spec: docs/superpowers/specs/2026-05-04-phase-4-v3-spec.md §3.5 + §3.6
-- Sprint:      v3-S3 (schema migrations 0026-0031, data layer only)
-- Bug fixes:   Codex review 2026-05-04
--                - ADD VALUE wrapped per Postgres 15+ IF NOT EXISTS (matches 0023)
--                - destination_warehouse_id DROPPED from original draft;
--                  relocate now mutates warehouse_id directly (safe in v3
--                  because reserve-at-receive semantic means no stock allocation
--                  references warehouse_id before the relocate point)
--
-- Why this migration (combined §3.5 + §3.6 because both touch purchase_orders):
--
--   §3.5 -- 6 new sup_status enum values for the HoOKkA Sofa flow:
--     ready_confirm_sent  : supplier pressed "Ready Confirm to Delivery"
--     partner_confirmed   : partner confirmed after customer check
--     customer_rejected   : partner reject -> triggers relocate flow
--     relocated           : logistics picked new WH after rejection
--     at_partner_wh       : delivered to partner's WH
--     at_own_wh_waiting   : delivered to own WH (post-relocate path)
--
--   §3.5 -- 6 new columns for confirm/DO-upload audit trail:
--     ready_confirm_at      timestamptz
--     partner_confirmed_at  timestamptz
--     customer_rejection    jsonb       (already exists since 0001_init.sql:335;
--                                        IF NOT EXISTS makes this idempotent)
--     do_file_path          text        (Supabase Storage object path)
--     do_uploaded_at        timestamptz
--     do_uploaded_by        uuid -> app_users(id)
--
--   §3.6 -- 3 outsource columns (Q7B: outsource = one-shot, don't pollute the
--          delivery_partners master table; live on the PO row instead):
--     outsource_partner_name    text
--     outsource_partner_contact text
--     outsource_partner_zones   text
--
--   §3.6 -- CHECK constraint po_outsource_xor_partner: a PO is either
--          outsourced (outsource_partner_name set) or assigned to a registered
--          delivery partner (delivery_partner_id set) -- never both. NULL on
--          both is allowed (PO not yet assigned).
--
-- Idempotency:
--   - ADD VALUE IF NOT EXISTS (Postgres 15+; matches 0023 precedent)
--   - ADD COLUMN IF NOT EXISTS for every column
--   - CHECK constraint guarded by pg_constraint lookup
-- =============================================================================

-- 1. Add 6 new po_sup_status enum values (additive; legacy values unchanged).
alter type public.po_sup_status add value if not exists 'ready_confirm_sent';
alter type public.po_sup_status add value if not exists 'partner_confirmed';
alter type public.po_sup_status add value if not exists 'customer_rejected';
alter type public.po_sup_status add value if not exists 'relocated';
alter type public.po_sup_status add value if not exists 'at_partner_wh';
alter type public.po_sup_status add value if not exists 'at_own_wh_waiting';

-- 2. Add 9 new columns on purchase_orders (6 audit/file + 3 outsource).
--    Note: customer_rejection already exists since 0001_init.sql:335 (jsonb
--    already there). IF NOT EXISTS makes the re-add a no-op. The column
--    semantic is now formalised in spec §3.5 as { reason, at, original_warehouse_id }.
alter table purchase_orders
  add column if not exists ready_confirm_at          timestamptz,
  add column if not exists partner_confirmed_at      timestamptz,
  add column if not exists customer_rejection        jsonb,
  add column if not exists do_file_path              text,
  add column if not exists do_uploaded_at            timestamptz,
  add column if not exists do_uploaded_by            uuid references app_users(id),
  add column if not exists outsource_partner_name    text,
  add column if not exists outsource_partner_contact text,
  add column if not exists outsource_partner_zones   text;

-- 3. Sanity constraint: outsource and registered partner are mutually exclusive
--    when set (NULL on both still allowed -- PO not yet assigned).
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'po_outsource_xor_partner') then
    alter table purchase_orders add constraint po_outsource_xor_partner
      check ((outsource_partner_name is null) or (delivery_partner_id is null));
  end if;
end $$;
