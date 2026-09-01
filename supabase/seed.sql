-- =============================================================================
-- seed.sql — demo data ported from prototype's proto/store.jsx
-- Apply with: `supabase db reset` (re-runs migrations + this file).
-- Idempotent: every insert uses on conflict do nothing / merge.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- DEALERS (SEED_DEALERS)
-- -----------------------------------------------------------------------------
insert into dealers (id, name, region, contact, joined_date, status, credit_limit, payment_terms, deposit_balance, channel) values
  ('00000000-0000-0000-0000-000000000d01', 'BedHouse KL Sdn Bhd',  'Klang Valley', 'Lily Ong · 03-7723 8800',     '2021-03-12', 'active',    200000, 'NET 30', 0, 'dealer'),
  ('00000000-0000-0000-0000-000000000d02', 'SleepWell Penang',     'Penang',       'Ben Lim · 04-2298 1199',      '2022-08-04', 'active',    120000, 'NET 30', 0, 'dealer'),
  ('00000000-0000-0000-0000-000000000d03', 'Restful Living Ipoh',  'Perak',        'Suhana Idris · 05-2546 7700', '2023-01-20', 'active',     80000, 'NET 30', 0, 'dealer'),
  ('00000000-0000-0000-0000-000000000d04', 'Dreamline JB',         'Johor',        'Tan Chee Ming · 07-3357 4422','2023-11-03', 'active',    100000, 'NET 30', 0, 'dealer'),
  ('00000000-0000-0000-0000-000000000d05', 'CozyHome Kuching',     'Sarawak',      'Wong Ai Ling · 082-2266 991', '2024-06-15', 'suspended',  60000, 'NET 14', 0, 'dealer'),
  ('00000000-0000-0000-0000-000000000d06', 'Sleep Studio KK',      'Sabah',        'Mohd Faizal · 088-3344 555',  null,         'pending',         0, '—',     0, 'dealer'),
  ('00000000-0000-0000-0000-000000000d99', 'Showroom · Carres KL Bangsar', 'Klang Valley', 'Carres HQ', '2020-01-01', 'active', 0, '—', 0, 'showroom')
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- OUTLETS
-- -----------------------------------------------------------------------------
insert into outlets (id, dealer_id, name, address) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000d01', 'BedHouse KL — Bangsar',    '12 Jalan Maarof, Bangsar, KL 59000'),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000d01', 'BedHouse KL — Mont Kiara', 'Lot G-5, Plaza Mont Kiara, KL 50480'),
  ('00000000-0000-0000-0000-0000000000a9', '00000000-0000-0000-0000-000000000d99', 'Carres KL Bangsar Showroom', '88 Jalan Bangsar, KL 59000')
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- SALESPERSONS
-- -----------------------------------------------------------------------------
insert into salespersons (id, dealer_id, outlet_id, name, phone) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000d01', '00000000-0000-0000-0000-0000000000a1', 'Aisha Rahman', '012-3344556'),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-000000000d01', '00000000-0000-0000-0000-0000000000a1', 'Daniel Wong',  '016-7788991'),
  ('00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-000000000d01', '00000000-0000-0000-0000-0000000000a2', 'Priya Nair',   '019-2233445')
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- WAREHOUSES
-- -----------------------------------------------------------------------------
insert into warehouses (id, name, address) values
  ('00000000-0000-0000-0000-0000000000c1', 'KL Central Warehouse', 'Lot 12 Shah Alam Industrial Park, Selangor'),
  ('00000000-0000-0000-0000-0000000000c2', 'Penang Warehouse',     'Bayan Lepas FTZ, Penang')
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- SUPPLIERS
-- -----------------------------------------------------------------------------
insert into suppliers (id, name, contact, lead_time, kind, cat_covered) values
  ('00000000-0000-0000-0000-0000000000e1', 'HoOKkA',      'Alex Chong · 03-8899 1100',     '7–10 days', 'own_logistics',  array['bedframe','sofa']),
  ('00000000-0000-0000-0000-0000000000e2', 'Nice Future', 'Lim Siew Ling · 03-7711 2200',  '5–7 days',  'factory_pickup', array['mattress'])
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- DELIVERY PARTNERS + FLEET
-- -----------------------------------------------------------------------------
insert into delivery_partners (id, name, contact, zones, onboarded_date, rate_card) values
  ('00000000-0000-0000-0000-0000000000f1', 'JT Express',           '012-7788991', 'KL · Selangor',
   '2022-04-12',
   jsonb_build_object('00000000-0000-0000-0000-0000000000c1',
     jsonb_build_object('base',60,'per_floor_walk_up',25,'per_km',1.8))),
  ('00000000-0000-0000-0000-0000000000f2', 'Northern Haulier',     '016-3344556', 'Penang · Perak',
   '2023-01-08',
   jsonb_build_object('00000000-0000-0000-0000-0000000000c2',
     jsonb_build_object('base',70,'per_floor_walk_up',30,'per_km',2.0)))
on conflict (id) do nothing;

-- Phase 4.5 Chunk 1: seed an LP test user for E2E
-- Note: this seed only runs on local dev / staging reset. Production LP accounts
-- are created via Principal UI (Task 19-22).
-- Schema reminder (from 0001:99): delivery_partners has columns
--   id, name, contact, zones text, onboarded_date, rate_card
-- No `address` column → store concatenated in contact (per Task 19 carry-forward).
-- `zones` is text (singular), not text[].
insert into delivery_partners (id, name, contact, zones)
values (
  '00000000-0000-0000-0000-0000000001f1'::uuid,
  'Test LP Alpha',
  '0123456789 · 1 Test St, KL',
  ''
)
on conflict (id) do nothing;

-- The auth.users row + app_users row are created via Principal flow at runtime.
-- For E2E, run `pnpm seed:lp-test-user` (script in scripts/) which calls
-- supabase.auth.admin.createUser + inserts app_users.

insert into partner_fleet (partner_id, plate, vehicle_type, capacity, driver_name, driver_phone) values
  ('00000000-0000-0000-0000-0000000000f1', 'WPK 8821', '1-tonne van',   '8m³',  'Lim Kok Wei', '012-1144 778'),
  ('00000000-0000-0000-0000-0000000000f1', 'WTM 4452', '3-tonne lorry', '20m³', 'Rajiv Singh', '016-3344 991'),
  ('00000000-0000-0000-0000-0000000000f1', 'WPK 9907', '1-tonne van',   '8m³',  'Ahmad Razif', '011-7723 884'),
  ('00000000-0000-0000-0000-0000000000f2', 'PKB 2231', '1-tonne van',   '8m³',  'Tan Ah Beng', '017-2244 556'),
  ('00000000-0000-0000-0000-0000000000f2', 'PHM 7780', '3-tonne lorry', '20m³', 'Hassan Ismail', '019-8866 442');

-- -----------------------------------------------------------------------------
-- CATALOG: product_models + product_skus + sofa_fabrics
-- -----------------------------------------------------------------------------
insert into product_models (id, category, model_key, name, blurb) values
  ('00000000-0000-0000-0000-0000000010a1', 'mattress', 'carres-cloud',    'Carres Cloud',    'Pocket spring · medium-firm'),
  ('00000000-0000-0000-0000-0000000010a2', 'mattress', 'carres-original', 'Carres Original', 'Hybrid foam · medium'),
  ('00000000-0000-0000-0000-0000000010a3', 'mattress', 'carres-air',      'Carres Air',      'Latex · firm'),
  ('00000000-0000-0000-0000-0000000010a4', 'mattress', 'premier-set',     'Premier Set',     'Top tier · pillow-top')
on conflict (id) do nothing;

insert into product_models (id, category, model_key, name, blurb, colors, gaps) values
  ('00000000-0000-0000-0000-0000000010b1', 'bedframe', 'l1202f',     'L1202F',     'Upholstered · velvet',
   array['Charcoal','Beige','Walnut Brown','Slate Blue'], array['10"','12"','14"','16"']),
  ('00000000-0000-0000-0000-0000000010b2', 'bedframe', 'elwood',     'Elwood',     'Solid oak · platform',
   array['Natural Oak','Walnut','Black'], array['10"','12"','14"']),
  ('00000000-0000-0000-0000-0000000010b3', 'bedframe', 'ridge-divan','Ridge Divan','Storage divan · 4 drawers',
   array['Charcoal','Cream','Forest Green'], array['12"','14"','16"'])
on conflict (id) do nothing;

insert into product_models (id, category, model_key, name, blurb, sofa_mode) values
  ('00000000-0000-0000-0000-0000000010c1', 'sofa', 'harbour', 'Harbour', 'Modular · linen / fabric',         'both'),
  ('00000000-0000-0000-0000-0000000010c2', 'sofa', 'kestrel', 'Kestrel', 'L-shape · leather',                 'preset'),
  ('00000000-0000-0000-0000-0000000010c3', 'sofa', 'atrium',  'Atrium',  'Custom modular · build your own',   'custom')
on conflict (id) do nothing;

insert into product_skus (model_id, sku, variant, variant_kind, price) values
  ('00000000-0000-0000-0000-0000000010a1', 'mattress:carres-cloud:Single',       'Single',       'size', 2890),
  ('00000000-0000-0000-0000-0000000010a1', 'mattress:carres-cloud:Super Single', 'Super Single', 'size', 3290),
  ('00000000-0000-0000-0000-0000000010a1', 'mattress:carres-cloud:Queen',        'Queen',        'size', 4290),
  ('00000000-0000-0000-0000-0000000010a1', 'mattress:carres-cloud:King',         'King',         'size', 5890),
  ('00000000-0000-0000-0000-0000000010a2', 'mattress:carres-original:Single',    'Single',       'size', 1890),
  ('00000000-0000-0000-0000-0000000010a2', 'mattress:carres-original:Queen',     'Queen',        'size', 3290),
  ('00000000-0000-0000-0000-0000000010a2', 'mattress:carres-original:King',      'King',         'size', 4290),
  ('00000000-0000-0000-0000-0000000010a3', 'mattress:carres-air:Single',         'Single',       'size', 3290),
  ('00000000-0000-0000-0000-0000000010a3', 'mattress:carres-air:Super Single',   'Super Single', 'size', 3690),
  ('00000000-0000-0000-0000-0000000010a3', 'mattress:carres-air:Queen',          'Queen',        'size', 4880),
  ('00000000-0000-0000-0000-0000000010a3', 'mattress:carres-air:King',           'King',         'size', 5990),
  ('00000000-0000-0000-0000-0000000010a4', 'mattress:premier-set:Queen',         'Queen',        'size', 6890),
  ('00000000-0000-0000-0000-0000000010a4', 'mattress:premier-set:King',          'King',         'size', 8900)
on conflict (sku) do nothing;

insert into product_skus (model_id, sku, variant, variant_kind, price) values
  ('00000000-0000-0000-0000-0000000010b1', 'bedframe:l1202f:Single',       'Single',       'size',  980),
  ('00000000-0000-0000-0000-0000000010b1', 'bedframe:l1202f:Super Single', 'Super Single', 'size', 1180),
  ('00000000-0000-0000-0000-0000000010b1', 'bedframe:l1202f:Queen',        'Queen',        'size', 1480),
  ('00000000-0000-0000-0000-0000000010b1', 'bedframe:l1202f:King',         'King',         'size', 1780),
  ('00000000-0000-0000-0000-0000000010b2', 'bedframe:elwood:Single',       'Single',       'size', 1290),
  ('00000000-0000-0000-0000-0000000010b2', 'bedframe:elwood:Queen',        'Queen',        'size', 1890),
  ('00000000-0000-0000-0000-0000000010b2', 'bedframe:elwood:King',         'King',         'size', 2290),
  ('00000000-0000-0000-0000-0000000010b3', 'bedframe:ridge-divan:Queen',   'Queen',        'size', 2090),
  ('00000000-0000-0000-0000-0000000010b3', 'bedframe:ridge-divan:King',    'King',         'size', 2490)
on conflict (sku) do nothing;

insert into product_skus (model_id, sku, variant, variant_kind, price) values
  ('00000000-0000-0000-0000-0000000010c1', 'sofa:harbour:preset:2-seater',          '2-seater',          'preset', 2890),
  ('00000000-0000-0000-0000-0000000010c1', 'sofa:harbour:preset:3-seater',          '3-seater',          'preset', 3890),
  ('00000000-0000-0000-0000-0000000010c1', 'sofa:harbour:preset:L-shape',           'L-shape',           'preset', 5290),
  ('00000000-0000-0000-0000-0000000010c1', 'sofa:harbour:part:1-seater (no arm)',   '1-seater (no arm)', 'part',   1090),
  ('00000000-0000-0000-0000-0000000010c1', 'sofa:harbour:part:1-seater (left arm)', '1-seater (left arm)','part',  1290),
  ('00000000-0000-0000-0000-0000000010c1', 'sofa:harbour:part:1-seater (right arm)','1-seater (right arm)','part', 1290),
  ('00000000-0000-0000-0000-0000000010c1', 'sofa:harbour:part:Corner',              'Corner',            'part',   1690),
  ('00000000-0000-0000-0000-0000000010c1', 'sofa:harbour:part:L-piece',             'L-piece',           'part',   1890),
  ('00000000-0000-0000-0000-0000000010c2', 'sofa:kestrel:preset:2-seater',          '2-seater',          'preset', 4290),
  ('00000000-0000-0000-0000-0000000010c2', 'sofa:kestrel:preset:3-seater',          '3-seater',          'preset', 5490),
  ('00000000-0000-0000-0000-0000000010c2', 'sofa:kestrel:preset:L-shape',           'L-shape',           'preset', 7890),
  ('00000000-0000-0000-0000-0000000010c3', 'sofa:atrium:part:1-seater (no arm)',    '1-seater (no arm)', 'part',   1290),
  ('00000000-0000-0000-0000-0000000010c3', 'sofa:atrium:part:1-seater (left arm)',  '1-seater (left arm)','part',  1490),
  ('00000000-0000-0000-0000-0000000010c3', 'sofa:atrium:part:1-seater (right arm)', '1-seater (right arm)','part', 1490),
  ('00000000-0000-0000-0000-0000000010c3', 'sofa:atrium:part:Corner',               'Corner',            'part',   1890),
  ('00000000-0000-0000-0000-0000000010c3', 'sofa:atrium:part:L-piece',              'L-piece',           'part',   2090)
on conflict (sku) do nothing;

insert into sofa_fabrics (model_id, fabric_name, surcharge) values
  ('00000000-0000-0000-0000-0000000010c1', 'Linen', 0),
  ('00000000-0000-0000-0000-0000000010c1', 'Cotton Blend', 0),
  ('00000000-0000-0000-0000-0000000010c1', 'Velvet', 300),
  ('00000000-0000-0000-0000-0000000010c1', 'Leather', 800),
  ('00000000-0000-0000-0000-0000000010c2', 'Top-grain Leather', 0),
  ('00000000-0000-0000-0000-0000000010c2', 'Full-grain Leather', 600),
  ('00000000-0000-0000-0000-0000000010c3', 'Linen', 0),
  ('00000000-0000-0000-0000-0000000010c3', 'Velvet', 350),
  ('00000000-0000-0000-0000-0000000010c3', 'Bouclé', 500),
  ('00000000-0000-0000-0000-0000000010c3', 'Leather', 900)
on conflict (model_id, fabric_name) do nothing;

-- -----------------------------------------------------------------------------
-- ADDONS + FLOOR CONFIG
-- -----------------------------------------------------------------------------
insert into addons (key, name, price, active) values
  ('dispose-mattress', 'Dispose old mattress',  80, true),
  ('dispose-sofa',     'Dispose old sofa',     120, true),
  ('dispose-bedframe', 'Dispose old bed frame',100, true)
on conflict (key) do nothing;

insert into floor_config (id, free_up_to_floor, per_floor_per_item)
values (1, 2, 50)
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- STOCK BALANCES
-- -----------------------------------------------------------------------------
insert into stock_balances (sku, warehouse_id, qty)
select s.sku, '00000000-0000-0000-0000-0000000000c1'::uuid, 4 from product_skus s
on conflict do nothing;

insert into stock_balances (sku, warehouse_id, qty)
select s.sku, '00000000-0000-0000-0000-0000000000c2'::uuid, 2 from product_skus s
on conflict do nothing;

update stock_balances set qty = 0 where sku = 'mattress:carres-cloud:King' and warehouse_id = '00000000-0000-0000-0000-0000000000c1';
update stock_balances set qty = 1 where sku = 'mattress:premier-set:King'  and warehouse_id = '00000000-0000-0000-0000-0000000000c1';

-- -----------------------------------------------------------------------------
-- STOCK MOVEMENTS
-- -----------------------------------------------------------------------------
insert into stock_movements (sku, warehouse_id, qty, kind, ref, note, by_role, occurred_at) values
  ('mattress:carres-cloud:King',     '00000000-0000-0000-0000-0000000000c1', 2,  'out', 'SO #1244', 'delivered to BedHouse KL',     'operation',  now() - interval '5 hours'),
  ('bedframe:l1202f:Queen',          '00000000-0000-0000-0000-0000000000c1', 1,  'out', 'SO #1243', 'delivered to Showroom Setia',  'operation',  now() - interval '8 hours'),
  ('mattress:premier-set:Queen',     '00000000-0000-0000-0000-0000000000c1', 8,  'in',  'PO-3318',  'DO #DO-77321 from Nice Future','operation',  now() - interval '1 day'),
  ('mattress:carres-cloud:Queen',    '00000000-0000-0000-0000-0000000000c1', 12, 'in',  'PO-3317',  'DO #DO-77320 from Nice Future','operation',  now() - interval '1.4 days'),
  ('sofa:harbour:preset:3-seater',   '00000000-0000-0000-0000-0000000000c2', 1,  'out', 'SO #1240', 'delivered to Dreamline JB',    'operation',  now() - interval '2 days'),
  ('bedframe:l1202f:King',           '00000000-0000-0000-0000-0000000000c1', 4,  'in',  'PO-3315',  'DO #DO-77318 from HoOKkA',     'operation',  now() - interval '3 days'),
  ('mattress:carres-cloud:King',     '00000000-0000-0000-0000-0000000000c1', 6,  'in',  'PO-3310',  'DO #DO-77310 from Nice Future','operation',  now() - interval '7 days'),
  ('mattress:carres-cloud:Queen',    '00000000-0000-0000-0000-0000000000c2', 3,  'out', 'SO #1235', 'delivered to SleepWell Penang','operation',  now() - interval '14 days'),
  ('sofa:harbour:preset:2-seater',   '00000000-0000-0000-0000-0000000000c2', 2,  'in',  'PO-3305',  'DO #DO-77295 from HoOKkA',     'operation',  now() - interval '21 days'),
  ('mattress:premier-set:King',      '00000000-0000-0000-0000-0000000000c1', 6,  'in',  'PO-3298',  'DO #DO-77280 from Nice Future','operation',  now() - interval '35 days');

-- -----------------------------------------------------------------------------
-- INQUIRIES (BD pipeline)
-- -----------------------------------------------------------------------------
insert into inquiries (kind, company, region, contact, stage, note, linked_dealer_id, created_at) values
  ('new_dealer', 'Sleep Studio KK',     'Sabah',        'Mohd Faizal · 088-3344 555', 'qualified', 'Visited Carres KL HQ · genuine interest · 2 outlet plan', '00000000-0000-0000-0000-000000000d06', now() - interval '2 days'),
  ('expansion',  'BedHouse KL Sdn Bhd', 'Klang Valley', 'Lily Ong · 03-7723 8800',    'contacted', 'Wants to open 3rd outlet in Setia Alam',                  '00000000-0000-0000-0000-000000000d01', now() - interval '5 days'),
  ('new_dealer', 'Comfort Beds Melaka', 'Melaka',       'Lim · 06-2233 445',          'lost',      'Region overlaps Dreamline JB · rejected by Principal',    null,                                     now() - interval '7 days'),
  ('product',    'Dreamline JB',        'Johor',        'Tan Chee Ming · 07-3357 4422', 'converted', 'Asked for sofa range pricing → ordered 2 units',         '00000000-0000-0000-0000-000000000d04', now() - interval '7 days'),
  ('new_dealer', 'Rest & Co Kuantan',   'Pahang',       'Nurul · 09-5566 778',        'new',       'Walked in at KL showroom · followup scheduled',           null,                                     now() - interval '4 hours'),
  ('expansion',  'SleepWell Penang',    'Penang',       'Ben Lim · 04-2298 1199',     'new',       'Requesting marketing co-op for Q3 campaign',              '00000000-0000-0000-0000-000000000d02', now() - interval '3 days');

-- -----------------------------------------------------------------------------
-- APPROVALS (Principal queue)
-- -----------------------------------------------------------------------------
insert into approvals (kind, title, actor, refers_to, amount, dealer_id, reason, status, created_at) values
  ('refund',     'Refund · RM 2,400 · Damaged on delivery',          'Finance · Aisha',          'SO-1239',         2400, '00000000-0000-0000-0000-000000000d01', 'Mattress arrived with tear · customer rejected', 'pending',  now() - interval '2 hours'),
  ('new_dealer', 'New dealer application · Sleep Studio KK',         'Sales · Mohd Faizal',      'dlr-pendng-1',    null, null,                                     'Sabah expansion',                                'pending',  now() - interval '1 day'),
  ('discount',   'Discount 20% · SO-1248 · King set bundle',         'Dealer · BedHouse KL',     'SO-1248',         1180, '00000000-0000-0000-0000-000000000d01', 'Repeat customer · 3rd order this year',          'pending',  now() - interval '5 hours'),
  ('refund',     'Refund · RM 6,070 · Customer cancelled',           'Finance · Aisha',          'SO-1239',         6070, '00000000-0000-0000-0000-000000000d01', 'Customer cancelled after delivery',              'approved', now() - interval '1 day');

-- -----------------------------------------------------------------------------
-- AUDIT LOG (cross-role activity)
-- -----------------------------------------------------------------------------
insert into audit_log (role, actor_text, action, dealer_id, ref, occurred_at) values
  ('finance',   'Aisha · Finance',    'Recorded receipt RM 2,945 · INV-1245',          '00000000-0000-0000-0000-000000000d01', 'INV-1245', now() - interval '5 minutes'),
  ('operation', 'Daniel · Operations', 'Dispatched SO-1242 to JT Express',              '00000000-0000-0000-0000-000000000d01', 'SO-1242',  now() - interval '12 minutes'),
  ('supplier',  'CMS',                'Marked PO-2044 in production',                  null,                                     'PO-2044',  now() - interval '1 hour'),
  ('principal', 'Sara · Principal',   'Approved refund AP-1005 · RM 6,070',            '00000000-0000-0000-0000-000000000d01', 'AP-1005',  now() - interval '2 hours'),
  ('dealer',    'BedHouse KL',        'Created order SO-1247 · RM 5,970',              '00000000-0000-0000-0000-000000000d01', 'SO-1247',  now() - interval '3 hours'),
  ('operation', 'Procurement',        'Issued PO-2045 to CMS · 2 × Carres Cloud King', null,                                     'PO-2045',  now() - interval '5 hours'),
  ('principal', 'Sara · Principal',   'Updated price · Carres Cloud King → RM 5,890',  null,                                     null,       now() - interval '6 hours'),
  ('principal', 'Sara · Principal',   'Suspended dealer · CozyHome Kuching',           '00000000-0000-0000-0000-000000000d05', null,       now() - interval '1 day'),
  ('finance',   'Aisha · Finance',    'Issued credit note CN-7732 · RM 480',           '00000000-0000-0000-0000-000000000d02', 'CN-7732',  now() - interval '1 day');

-- -----------------------------------------------------------------------------
-- ORDERS — small representative set
-- -----------------------------------------------------------------------------
insert into orders (
  id, so, status, dealer_id, outlet_id, salesperson_id,
  customer_name, customer_phone, customer_address, customer_billing,
  customer_emergency, delivery_date, delivery_floor, delivery_has_lift,
  paid, terms_accepted, placed_at
) values (
  '00000000-0000-0000-0000-000000001247', 1247, 'place',
  '00000000-0000-0000-0000-000000000d01', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1',
  'Tan Mei Ling', '012-3456789', '23 Jalan Bukit Bintang, KL 55100', '23 Jalan Bukit Bintang, KL 55100',
  'Tan Wei Ming · 012-9988776', '2026-05-02', 1, false,
  0, false, now() - interval '2 hours'
) on conflict (id) do nothing;

insert into order_lines (order_id, sku, qty, unit_price) values
  ('00000000-0000-0000-0000-000000001247', 'bedframe:l1202f:Queen',         1, 1480),
  ('00000000-0000-0000-0000-000000001247', 'mattress:carres-original:Queen',1, 3290);

insert into order_history (order_id, text, by_role, occurred_at) values
  ('00000000-0000-0000-0000-000000001247', 'Order created · awaiting deposit', 'dealer', now() - interval '2 hours');

insert into orders (
  id, so, status, dealer_id, outlet_id, salesperson_id,
  customer_name, customer_phone, customer_address, customer_billing,
  customer_emergency, delivery_date, delivery_floor, delivery_has_lift,
  paid, terms_accepted, signature_url,
  operation_stage, warehouse_id, delivery_partner_id,
  do_number, do_note, invoice_no, invoiced_at,
  placed_at
) values (
  '00000000-0000-0000-0000-000000001240', 1240, 'delivered',
  '00000000-0000-0000-0000-000000000d01', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1',
  'Nor Azira', '013-9988776', '8 Jalan SS2/24, Petaling Jaya 47300', '8 Jalan SS2/24, Petaling Jaya 47300',
  'Hassan Azira · 012-1122334', '2026-04-22', 1, false,
  3290, true, 'sig://placeholder',
  'delivered', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000f1',
  'DO-9821', 'Delivered at lobby · customer signed', 'INV-2026-1240', '2026-04-27',
  now() - interval '5 days'
) on conflict (id) do nothing;

insert into order_lines (order_id, sku, qty, unit_price) values
  ('00000000-0000-0000-0000-000000001240', 'mattress:carres-original:Queen', 1, 3290);

insert into order_history (order_id, text, by_role, occurred_at) values
  ('00000000-0000-0000-0000-000000001240', 'Order placed', 'dealer', now() - interval '5 days'),
  ('00000000-0000-0000-0000-000000001240', 'Proceeded · delivery scheduled', 'dealer', now() - interval '3 days'),
  ('00000000-0000-0000-0000-000000001240', 'DO submitted · delivered', 'operation', now() - interval '2 days'),
  ('00000000-0000-0000-0000-000000001240', 'Tax invoice issued · INV-2026-1240', 'finance', now() - interval '2 days');

insert into invoices (invoice_no, order_id, amount, issued_at) values
  ('INV-2026-1240', '00000000-0000-0000-0000-000000001240', 3290, '2026-04-27')
on conflict (invoice_no) do nothing;

-- -----------------------------------------------------------------------------
-- PURCHASE ORDERS
-- -----------------------------------------------------------------------------
-- Schema notes: PO header lives in `purchase_orders` (no sku/qty columns since
-- the per-line refactor in 0049+; lines now live in `purchase_order_lines`).
-- Procurement-leg LP column renamed in migration 0052 from
-- `delivery_partner_id` to `procurement_partner_id` (customer-leg LP lives on
-- `order_supplier_threads.delivery_partner_id`).
insert into purchase_orders (
  id, so, supplier_id, warehouse_id, status, sup_status,
  procurement_partner_id, expected_ready_date, placed_at
) values
  ('PO-2045', null, '00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000c1',
   'open', 'pending',
   '00000000-0000-0000-0000-0000000000f1', '2026-05-08', now() - interval '2 hours'),
  ('PO-2044', null, '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000c1',
   'open', 'in_production',
   null,                                      '2026-05-04', now() - interval '1 day'),
  ('PO-2041', null, '00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000c1',
   'open', 'ready_for_pickup',
   '00000000-0000-0000-0000-0000000000f1', '2026-04-29', now() - interval '5 days')
on conflict (id) do nothing;

-- Companion PO lines (split out from the pre-0049 single-line PO shape).
-- Unique index is `(po_id, sku, coalesce(attrs::text, ''))` — a partial
-- expression that ON CONFLICT can't target cleanly, so WHERE NOT EXISTS
-- preserves idempotency on re-seed.
insert into purchase_order_lines (po_id, sku, qty)
select v.po_id, v.sku, v.qty
  from (values
    ('PO-2045', 'mattress:carres-cloud:King',  2),
    ('PO-2044', 'bedframe:elwood:Queen',       1),
    ('PO-2041', 'mattress:carres-cloud:Queen', 1)
  ) as v(po_id, sku, qty)
 where not exists (
   select 1 from purchase_order_lines pol
    where pol.po_id = v.po_id and pol.sku = v.sku and pol.attrs is null
 );

insert into po_history (po_id, text, by_role, occurred_at) values
  ('PO-2045', 'Issued by Operations · partner pre-assigned: JT Express',                 'operation', now() - interval '2 hours'),
  ('PO-2044', 'Issued by Operations',                                                    'operation', now() - interval '1 day'),
  ('PO-2044', 'Acknowledged · production scheduled',                                    'supplier',  now() - interval '22 hours'),
  ('PO-2044', 'Production started',                                                     'supplier',  now() - interval '4 hours'),
  ('PO-2041', 'Issued by Operations · partner pre-assigned: JT Express',                 'operation', now() - interval '5 days'),
  ('PO-2041', 'Marked in production',                                                   'supplier',  now() - interval '3 days'),
  ('PO-2041', 'Ready for pickup · partner notified',                                    'supplier',  now() - interval '6 hours');

-- =============================================================================
-- DEMO AUTH USERS — one per role for testing (Phase 1 decision: auto-confirm)
-- =============================================================================
-- Email pattern: <role>@carres.com
-- Password: 'carres-demo-pass' (bcrypt-hashed via pgcrypto crypt() at insert)
-- email_confirmed_at = now() — bypasses Supabase Auth's email confirmation flow
-- =============================================================================

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_user_meta_data, raw_app_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-000000000001', 'authenticated', 'authenticated',
   'principal@carres.com',  crypt('111', gen_salt('bf')), now(),
   jsonb_build_object('name','Sara · Principal'),  '{"provider":"email","providers":["email"]}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-000000000002', 'authenticated', 'authenticated',
   'dealer@carres.com',     crypt('111', gen_salt('bf')), now(),
   jsonb_build_object('name','Lily · BedHouse KL'),'{"provider":"email","providers":["email"]}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-000000000003', 'authenticated', 'authenticated',
   'salesperson@carres.com',crypt('111', gen_salt('bf')), now(),
   jsonb_build_object('name','Aisha · BedHouse KL Bangsar'),'{"provider":"email","providers":["email"]}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-000000000004', 'authenticated', 'authenticated',
   'operation@carres.com',  crypt('111', gen_salt('bf')), now(),
   jsonb_build_object('name','Daniel · Operations'),'{"provider":"email","providers":["email"]}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-000000000005', 'authenticated', 'authenticated',
   'finance@carres.com',    crypt('111', gen_salt('bf')), now(),
   jsonb_build_object('name','Aisha · Finance'),'{"provider":"email","providers":["email"]}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-000000000006', 'authenticated', 'authenticated',
   'supplier@carres.com',   crypt('111', gen_salt('bf')), now(),
   jsonb_build_object('name','Alex · HoOKkA'),'{"provider":"email","providers":["email"]}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-000000000007', 'authenticated', 'authenticated',
   'partner@carres.com',    crypt('111', gen_salt('bf')), now(),
   jsonb_build_object('name','JT Express dispatcher'),'{"provider":"email","providers":["email"]}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-000000000008', 'authenticated', 'authenticated',
   'bd@carres.com',         crypt('111', gen_salt('bf')), now(),
   jsonb_build_object('name','Hannah · BD'),'{"provider":"email","providers":["email"]}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-000000000009', 'authenticated', 'authenticated',
   'showroom@carres.com',   crypt('111', gen_salt('bf')), now(),
   jsonb_build_object('name','Carres KL Bangsar'),'{"provider":"email","providers":["email"]}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-00000000000a', 'authenticated', 'authenticated',
   'supplier-nf@carres.com',crypt('111', gen_salt('bf')), now(),
   jsonb_build_object('name','Lim · Nice Future'),'{"provider":"email","providers":["email"]}'::jsonb, now(), now())
on conflict (id) do nothing;

-- GoTrue (Supabase Auth, written in Go) cannot scan NULL into a Go string —
-- signInWithPassword fails with "Database error querying schema" if any of
-- these 4 token columns is NULL. The columns default to NULL (not ''), so
-- direct INSERT into auth.users leaves seed users unloginable. Force them
-- to '' explicitly. (The other 4 token columns — email_change_token_current,
-- phone_change, phone_change_token, reauthentication_token — already default
-- to '' so they're fine.)
update auth.users
set
  confirmation_token     = coalesce(confirmation_token,     ''),
  recovery_token         = coalesce(recovery_token,         ''),
  email_change_token_new = coalesce(email_change_token_new, ''),
  email_change           = coalesce(email_change,           '')
where email like '%@carres.com';

-- The handle_new_auth_user trigger from 0002 inserts a default app_users row
-- (role='dealer'). Override with the right role + scope ids.
insert into app_users (id, email, name, role, status, dealer_id, supplier_id, partner_id, outlet_id) values
  ('11111111-1111-1111-1111-000000000001','principal@carres.com', 'Sara · Principal',                'principal',   'active', null,                                     null,                                     null,                                     null),
  ('11111111-1111-1111-1111-000000000002','dealer@carres.com',    'Lily · BedHouse KL',              'dealer',      'active', '00000000-0000-0000-0000-000000000d01',   null,                                     null,                                     null),
  ('11111111-1111-1111-1111-000000000003','salesperson@carres.com','Aisha · BedHouse KL Bangsar',     'salesperson', 'active', '00000000-0000-0000-0000-000000000d01',   null,                                     null,                                     '00000000-0000-0000-0000-0000000000a1'),
  ('11111111-1111-1111-1111-000000000004','operation@carres.com', 'Daniel · Operations',              'operation',   'active', null,                                     null,                                     null,                                     null),
  ('11111111-1111-1111-1111-000000000005','finance@carres.com',   'Aisha · Finance',                 'finance',     'active', null,                                     null,                                     null,                                     null),
  ('11111111-1111-1111-1111-000000000006','supplier@carres.com',  'Alex · HoOKkA',                   'supplier',    'active', null,                                     '00000000-0000-0000-0000-0000000000e1',   null,                                     null),
  ('11111111-1111-1111-1111-000000000007','partner@carres.com',   'JT Express dispatcher',           'partner',     'active', null,                                     null,                                     '00000000-0000-0000-0000-0000000000f1',   null),
  ('11111111-1111-1111-1111-000000000008','bd@carres.com',        'Hannah · BD',                     'bd',          'active', null,                                     null,                                     null,                                     null),
  ('11111111-1111-1111-1111-000000000009','showroom@carres.com',  'Carres KL Bangsar',               'showroom',    'active', '00000000-0000-0000-0000-000000000d99',   null,                                     null,                                     '00000000-0000-0000-0000-0000000000a9'),
  ('11111111-1111-1111-1111-00000000000a','supplier-nf@carres.com','Lim · Nice Future',               'supplier',    'active', null,                                     '00000000-0000-0000-0000-0000000000e2',   null,                                     null)
on conflict (id) do update
  set role        = excluded.role,
      status      = excluded.status,
      dealer_id   = excluded.dealer_id,
      supplier_id = excluded.supplier_id,
      partner_id  = excluded.partner_id,
      outlet_id   = excluded.outlet_id,
      name        = excluded.name;

-- Mirrors the governed production capability from 0403 for local resets.
update app_users
   set operations_superuser = true
 where lower(email) = 'operation@carres.com';

-- Also wire the salesperson seed row to its auth user
update salespersons
   set user_id = '11111111-1111-1111-1111-000000000003'
 where id = '00000000-0000-0000-0000-0000000000b1';

-- Phase 6 supplier portal: enable both suppliers + bind contact_email
update suppliers
   set portal_enabled = true,
       contact_email  = 'supplier@carres.com'
 where id = '00000000-0000-0000-0000-0000000000e1';
update suppliers
   set portal_enabled = true,
       contact_email  = 'supplier-nf@carres.com'
 where id = '00000000-0000-0000-0000-0000000000e2';
