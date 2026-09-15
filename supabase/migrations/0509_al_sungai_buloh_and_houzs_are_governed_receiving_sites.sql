-- 0509_al_sungai_buloh_and_houzs_are_governed_receiving_sites.sql
--
-- ⭐ OWNER RULING, Jess 2026-09-15 — asked and answered during the Inbound
--    receiving-workspace card.
--
-- ---- WHAT WAS MEASURED ----------------------------------------------------
--
-- `AL Sungai Buloh` and `HOUZS` existed ONLY as `purchasing_destinations` with
-- `warehouse_id IS NULL`. They were therefore not Sites, had no receiving
-- access, and — until this card — produced no Inbound row at all, because the
-- projection dropped any arrangement whose destination resolved to no Site.
--
-- Both are real places that physically take Carres goods in: HOUZS stages
-- mattresses at its Balakong warehouse, and AL receives at Sungai Buloh before
-- running the delivery. Their later handover to the customer is a SEPARATE
-- outbound/delivery event for the same goods — this file does not touch it.
--
-- ---- WHAT THIS DOES -------------------------------------------------------
--
-- One organisation, TWO roles — the pattern NETS already follows in this
-- database (`nets_delivery` + `nets_warehouse`). AL and HOUZS each hold a
-- `delivery_operator` party today; each gains a `warehouse_operator` party,
-- because 0458 rules that only a `warehouse_operator` may operate a Site and
-- a delivery partner is a real organisation performing a different role.
--
--   1 · a `warehouse_operator` party for each
--   2 · a Site of kind `operation_partner`, owned by that partner
--   3 · its Site profile, active, in the Carres business timezone
--   4 · the existing purchasing destination linked to its Site
--
-- ---- WHAT THIS DELIBERATELY DOES NOT DO -----------------------------------
--
-- · NO ADDRESS IS INVENTED. `warehouses.address` stays NULL at both Sites, and
--   the destinations' placeholder `testAddress…` strings are cleared because
--   `purchasing_destinations_one_address` holds that a destination is EITHER a
--   governed Site or a free-text address, never both. Every row in this
--   database today is test data (CLAUDE.md §6); no real address is lost.
-- · NO WORKING HOURS AND NO DUTY GRANT. Nobody can record a receipt at either
--   Site until `Confirm inbound receipt` is granted and the hours are set
--   through the governed Warehouse Settings door. Until then the Schedule
--   falls back exactly as it does for an unconfigured Site — which is the
--   honest answer, not a guess.
-- · `Ohana` and `Hookka Industries` are NOT linked. Ohana delivers straight to
--   the final customer; goods that never reach a Carres Site must not mint a
--   warehouse receipt. Those arrangements stay visible under Inbound's
--   `Destinations without a Site` tab, which is what makes the distinction
--   readable instead of invisible.
--
-- Every statement is guarded, so this file is safe on the clean go-live
-- database where the destinations do not yet exist. It asserts no row count.
-- ============================================================================

begin;

set search_path = public, pg_temp;

-- 1 · The operating organisations, in their WAREHOUSE role.
insert into public.stock_operating_parties (code, name, kind, active)
select v.code, v.name, 'warehouse_operator', true
  from (values
         ('al_warehouse',    'AL Warehouse'),
         ('houzs_warehouse', 'HOUZS Warehouse')
       ) as v(code, name)
 where not exists (
   select 1 from public.stock_operating_parties p where p.code = v.code
 );

-- 2 · The Sites themselves. `operation_partner` REQUIRES an owning partner
--     (`warehouses_partner_kind_check`), and both already exist as delivery
--     partners — the same organisation, named once.
insert into public.warehouses (id, name, kind, owning_partner_id, address)
select v.id::uuid, v.name, 'operation_partner'::warehouse_kind, dp.id, null
  from (values
         ('00000000-0000-0000-0000-000000000c04', 'AL Sungai Buloh', 'AL'),
         ('00000000-0000-0000-0000-000000000c05', 'HOUZS Balakong',  'HOUZS')
       ) as v(id, name, partner)
  join public.delivery_partners dp on dp.name = v.partner
 where not exists (
   select 1 from public.warehouses w where w.id = v.id::uuid
 );

-- 3 · Each Site's profile: active, Carres business timezone, no key contact
--     yet (0458 requires a real individual, and none has been named).
insert into public.warehouse_site_profiles (site_id, status, operating_party_id, time_zone)
select w.id, 'active', p.id, 'Asia/Kuala_Lumpur'
  from public.warehouses w
  join (values
         ('00000000-0000-0000-0000-000000000c04', 'al_warehouse'),
         ('00000000-0000-0000-0000-000000000c05', 'houzs_warehouse')
       ) as v(site, code) on v.site::uuid = w.id
  join public.stock_operating_parties p on p.code = v.code
 where not exists (
   select 1 from public.warehouse_site_profiles sp where sp.site_id = w.id
 );

-- 4 · The purchasing destinations now resolve to a Site. The placeholder
--     address is cleared because a linked destination carries none.
update public.purchasing_destinations d
   set warehouse_id = v.site::uuid,
       address      = null,
       updated_at   = now()
  from (values
         ('AL Sungai Buloh', '00000000-0000-0000-0000-000000000c04'),
         ('HOUZS',           '00000000-0000-0000-0000-000000000c05')
       ) as v(name, site)
 where d.name = v.name
   and d.warehouse_id is null
   and exists (select 1 from public.warehouses w where w.id = v.site::uuid);

commit;
