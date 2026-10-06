-- Fake rows the migration replay loads just before certain migrations.
--
-- Some older migrations check for rows that only production has: a named warehouse,
-- a delivery partner, a real service case, named staff. On a blank database those
-- checks fail, and every later file that needs their tables fails too. These rows
-- stand in for production's, so the rest of the chain can be tested.
--
-- Each chunk starts with `-- @before <migration file prefix>` and runs in its own
-- transaction right before that file. It must fit the schema AS IT IS at that point.
-- Why each row is needed: docs/audits/2026-09-10-MIGRATION-REPLAY.md.
-- These are NOT seed data for any real environment.

-- @before 0032_suppliers_slug
-- 0032 adds UNIQUE (slug) only when suppliers already has rows; 0134 relies on it.
-- HoOKkA keeps production's id, which 0149 and 0150 look up.
insert into suppliers (id, name, kind) values ('00000000-0000-0000-0000-0000000000e1', 'HoOKkA', 'own_logistics');
insert into suppliers (name, kind) values ('Nice Future', 'factory_pickup');

-- @before 0136_orders_ops_assigned_logistic
-- 0136 and 0157 expect a Nets partner (production-master-data.sql inserts it, not a migration).
-- 0137 and 0307 expect the own warehouse, named 'Carres Klang' as it is in production by 0307.
insert into delivery_partners (name, zones) values ('Nets Sdn Bhd', 'Klang Valley');
insert into warehouses (name) values ('Carres Klang');

-- @before 0276_hr_kpi_targets
-- 0276 needs one showroom whose salesperson has a staff code (only the app assigns them).
insert into dealers (name, channel) values ('Fixture Showroom', 'showroom');
insert into salespersons (dealer_id, name, staff_code)
select id, 'Fixture Salesperson', 'CR9001' from dealers where name = 'Fixture Showroom';

-- @before 0285_service_case_guided_intake
-- 0285, 0293 and 0298 check that the real case SC2607-01 is still there.
insert into service_cases (case_no, customer_name) values ('SC2607-01', 'Fixture Customer');

-- @before 0286_stock_reorder_points
-- 0286 grants a duty to seats that have an active person; production's is the COO seat (Jess).
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000f001', 'coo@fixture.invalid');
insert into app_users (id, email, name, role, status, position_id)
select '00000000-0000-0000-0000-00000000f001', 'coo@fixture.invalid', 'Fixture COO', 'principal', 'active',
       (select position_id from org_position_duties where duty_key = 'po_duty_editor' limit 1);

-- @before 0437_offboard_khor_yee
-- 0437 is a staffing change about three named people.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000f002', 'khoryee@carres.com'),
  ('00000000-0000-0000-0000-00000000f003', 'yujun@carres.com'),
  ('00000000-0000-0000-0000-00000000f004', 'shasha@carres.com');
insert into app_users (id, email, name, role, status) values
  ('00000000-0000-0000-0000-00000000f002', 'khoryee@carres.com', 'Khor Yee', 'principal', 'active'),
  ('00000000-0000-0000-0000-00000000f003', 'yujun@carres.com', 'Yu Jun', 'principal', 'active'),
  ('00000000-0000-0000-0000-00000000f004', 'shasha@carres.com', 'Shasha', 'principal', 'active');

-- @before 0366_the_unit_register
-- 0366 cannot handle a SKU whose units at a site are ALL reserved: `available` comes
-- out NULL, its cache rebuild zeroes the row, and its own check then fails. 0369 fixed
-- that NULL later. Production had no such SKU at the time; the replayed 0137 seed has
-- six. Freeing one unit per such SKU gives the replay production's shape.
update ops_stock_items i set status = 'free', reserved_ref = null
 where i.id in (
   select distinct on (sku, warehouse_id) id from ops_stock_items
    where (sku, warehouse_id) in (
      select sku, warehouse_id from ops_stock_items group by 1, 2
      having bool_and(status = 'reserved'))
    order by sku, warehouse_id, id);

-- @before 0458_a_warehouse_is_operated
-- 0458 checks that some active person has a CRnnn staff code (only the app assigns them).
update app_users set staff_code = 'CR9002' where id = '00000000-0000-0000-0000-00000000f003';
