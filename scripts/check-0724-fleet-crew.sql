-- 0724 local check (Weisiang's decision 2026-10-22: Fleet Day / Crew Leave /
-- Live Map / Lorry Capacity, Houzs way). LOCAL COPY ONLY — never production.
-- Pipe through psql stdin into a database with 0724 applied. Everything runs
-- in one transaction and is rolled back. Prints `0724 check: PASS` or stops
-- at the first failed expectation.
begin;
do $check$
declare
  v_op uuid := gen_random_uuid();
  v_carres uuid;
  v_lorry1 uuid; v_lorry2 uuid;
  v_d1 uuid; v_d2 uuid; v_h1 uuid;
  v_order uuid; v_n int; v_rev numeric;
  v_detail text;
  v_other uuid; v_res jsonb;
begin
  insert into auth.users (id, email) values (v_op, 'fleet-check@carres.test');
  insert into app_users (id, email, name, role, status) values (v_op, 'fleet-check@carres.test', 'Fleet check', 'operation', 'active');
  perform set_config('request.jwt.claim.sub', v_op::text, true);

  select id into v_carres from delivery_partners where own_fleet;
  if v_carres is null then raise exception 'FAIL: no own-fleet company seeded'; end if;

  insert into partner_fleet (partner_id, plate, vehicle_type) values (v_carres, 'VAB 1234', 'Lorry') returning id into v_lorry1;
  insert into partner_fleet (partner_id, plate, vehicle_type) values (v_carres, 'WXY 9', 'Lorry') returning id into v_lorry2;
  insert into partner_drivers (partner_id, name, role) values (v_carres, 'Ali', 'driver') returning id into v_d1;
  insert into partner_drivers (partner_id, name, role) values (v_carres, 'Bala', 'driver') returning id into v_d2;
  insert into partner_drivers (partner_id, name, role) values (v_carres, 'Chong', 'helper') returning id into v_h1;

  -- A stop: the arrangement's typed plate `vab-1234` still finds lorry 1.
  insert into orders (dealer_id, salesperson_id, customer_name, customer_phone)
    select s.dealer_id, s.id, 'Fleet check customer', '0123' from salespersons s limit 1
    returning id into v_order;
  insert into order_lines (order_id, sku, qty, unit_price) values (v_order, 'CHK', 2, 150);
  insert into ops_delivery_arrangements (order_id, leg, partner_id, confirmed_date, vehicle)
    values (v_order, 0, v_carres, date '2026-11-02', 'vab-1234');
  select count(*), sum(revenue) into v_n, v_rev from fleet_stops(date '2026-11-02', date '2026-11-02') where vehicle_id = v_lorry1;
  if v_n <> 1 or v_rev <> 300 then raise exception 'FAIL: fleet_stops % stops, revenue %', v_n, v_rev; end if;

  -- Confirm crew on lorry 1.
  perform fleet_confirm_crew(date '2026-11-02', v_lorry1, v_d1, v_h1);
  -- A helper may not drive.
  begin
    perform fleet_confirm_crew(date '2026-11-02', v_lorry2, v_h1, null);
    raise exception 'FAIL: a helper was saved as a driver';
  exception when sqlstate '22023' then get stacked diagnostics v_detail = pg_exception_detail;
    if v_detail <> 'not_a_driver' then raise exception 'FAIL: expected not_a_driver, got %', v_detail; end if;
  end;
  -- Nobody rides two lorries the same day.
  begin
    perform fleet_confirm_crew(date '2026-11-02', v_lorry2, v_d1, null);
    raise exception 'FAIL: a driver was put on two lorries';
  exception when sqlstate '22023' then get stacked diagnostics v_detail = pg_exception_detail;
    if v_detail <> 'already_crewed' then raise exception 'FAIL: expected already_crewed, got %', v_detail; end if;
  end;
  -- Nobody on leave.
  insert into fleet_crew_leave (crew_id, from_date, to_date, reason) values (v_d2, date '2026-11-01', date '2026-11-03', 'MC');
  begin
    perform fleet_confirm_crew(date '2026-11-02', v_lorry2, v_d2, null);
    raise exception 'FAIL: a driver on leave was crewed';
  exception when sqlstate '22023' then get stacked diagnostics v_detail = pg_exception_detail;
    if v_detail <> 'on_leave' then raise exception 'FAIL: expected on_leave, got %', v_detail; end if;
  end;
  -- The day after the leave he may drive.
  perform fleet_confirm_crew(date '2026-11-04', v_lorry2, v_d2, null);
  -- Re-confirming the same lorry replaces its crew.
  perform fleet_confirm_crew(date '2026-11-02', v_lorry1, v_d1, null);
  if (select helper_id from fleet_day_crew where day = date '2026-11-02' and vehicle_id = v_lorry1) is not null then
    raise exception 'FAIL: re-confirm kept the old helper';
  end if;

  -- Positions: the latest per lorry wins.
  insert into fleet_lorry_positions (vehicle_id, lat, lng, recorded_at) values
    (v_lorry1, 3.1, 101.6, now() - interval '1 hour'), (v_lorry1, 3.2, 101.7, now());
  if (select lat from fleet_last_positions() where vehicle_id = v_lorry1) <> 3.2 then
    raise exception 'FAIL: fleet_last_positions did not return the latest fix';
  end if;
  -- Radius Velocity (YH 2026-10-26): the service door maps device, then plate,
  -- to a Carres lorry; skips other companies' vehicles and future times; a
  -- repeat (lorry, recorded_at) is a no-op.
  update partner_fleet set velocity_device_id = 'DEV-7' where id = v_lorry2;
  insert into delivery_partners (name) values ('Fleet check other co') returning id into v_other;
  insert into partner_fleet (partner_id, plate, vehicle_type) values (v_other, 'OTH 1', 'Lorry');
  v_res := fleet_store_velocity_fixes(jsonb_build_array(
    jsonb_build_object('device_id', 'DEV-7', 'plate', 'NOT ITS PLATE', 'lat', 3.0, 'lng', 101.0, 'recorded_at', (now() - interval '3 hours')::text),
    jsonb_build_object('device_id', 'DEV-9', 'plate', 'vab1234', 'lat', 3.0, 'lng', 101.0, 'recorded_at', (now() - interval '3 hours')::text),
    jsonb_build_object('device_id', 'DEV-9', 'plate', 'VAB 1234', 'lat', 3.0, 'lng', 101.0, 'recorded_at', (now() - interval '3 hours')::text),
    jsonb_build_object('device_id', 'DEV-X', 'plate', 'OTH 1', 'lat', 3.0, 'lng', 101.0, 'recorded_at', (now() - interval '3 hours')::text),
    jsonb_build_object('device_id', 'DEV-9', 'plate', 'VAB 1234', 'lat', 3.0, 'lng', 101.0, 'recorded_at', (now() + interval '1 day')::text)));
  if (v_res->>'stored')::int <> 2 or v_res->'unmatched' <> '["OTH 1"]'::jsonb then
    raise exception 'FAIL: velocity store answered %', v_res;
  end if;
  if not exists (select 1 from fleet_lorry_positions where vehicle_id = v_lorry2 and device_id = 'DEV-7' and source = 'tracker')
     or not exists (select 1 from fleet_lorry_positions where vehicle_id = v_lorry1 and device_id = 'DEV-9') then
    raise exception 'FAIL: velocity fixes not matched by device then plate';
  end if;
  v_res := fleet_store_velocity_fixes(jsonb_build_array(
    jsonb_build_object('device_id', 'DEV-7', 'plate', null, 'lat', 3.0, 'lng', 101.0, 'recorded_at', (now() - interval '3 hours')::text)));
  if (v_res->>'stored')::int <> 0 then raise exception 'FAIL: a repeated fix was stored again'; end if;
  if has_function_privilege('authenticated', 'public.fleet_store_velocity_fixes(jsonb)', 'execute') then
    raise exception 'FAIL: a signed-in user may call the Velocity service door';
  end if;

  -- Row security on a caller's own insert (Phase 7 review 2026-10-23).
  perform set_config('role', 'authenticated', true);
  begin
    insert into fleet_lorry_positions (vehicle_id, lat, lng, recorded_at) values (v_lorry1, 3.3, 101.8, now() + interval '1 day');
    raise exception 'FAIL: a future fix was accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into fleet_lorry_positions (vehicle_id, lat, lng, received_by) values (v_lorry1, 3.3, 101.8, gen_random_uuid());
    raise exception 'FAIL: a fix named someone else as received_by';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into fleet_crew_leave (crew_id, from_date, to_date, reason, recorded_by)
    values (v_d1, date '2026-12-01', date '2026-12-01', 'AL', gen_random_uuid());
    raise exception 'FAIL: leave named someone else as recorded_by';
  exception when insufficient_privilege then null;
  end;
  insert into fleet_lorry_positions (vehicle_id, lat, lng, recorded_at) values (v_lorry1, 3.3, 101.8, now() - interval '1 minute');
  perform set_config('role', 'postgres', true);
  raise notice '0724 check: PASS';
end;
$check$;
rollback;
