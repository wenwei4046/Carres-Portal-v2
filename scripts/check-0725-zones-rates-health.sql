-- 0725 local check (Weisiang's decision 2026-10-22: Fleet Health, Delivery
-- Zones and Rate Cards, Houzs way; Jess was not part of this decision).
-- LOCAL COPY ONLY — never production. Pipe through psql stdin into a database
-- with 0724 and 0725 applied. One transaction, rolled back. Prints
-- `0725 check: PASS` or stops at the first failed expectation.
begin;
do $check$
declare
  v_op uuid := gen_random_uuid();
  v_carres uuid;
  v_lorry uuid;
  v_zone uuid;
  v_n int;
  v_ok boolean;
begin
  insert into auth.users (id, email) values (v_op, 'fleet-0725@carres.test');
  insert into app_users (id, email, name, role, status) values (v_op, 'fleet-0725@carres.test', 'Fleet 0725', 'operation', 'active');
  select id into v_carres from delivery_partners where own_fleet;
  insert into partner_fleet (partner_id, plate, vehicle_type) values (v_carres, 'VCH 25', 'Lorry') returning id into v_lorry;

  -- Fleet Health: someone who is not operation is refused.
  perform set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
  v_ok := false;
  begin
    perform fleet_save_lorry_health(v_lorry, '2026-11-01', null, null, null);
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL: a non-operation caller saved lorry dates'; end if;

  -- Operation saves the four dates, and the change is recorded.
  perform set_config('request.jwt.claim.sub', v_op::text, true);
  perform fleet_save_lorry_health(v_lorry, '2026-11-01', '2027-01-31', '2026-10-01', null);
  if (select road_tax_due from partner_fleet where id = v_lorry) <> '2027-01-31' then
    raise exception 'FAIL: road tax date not saved';
  end if;
  if not exists (select 1 from delivery_setting_changes where what = 'lorry_health' and new_value->>'id' = v_lorry::text) then
    raise exception 'FAIL: lorry dates change not recorded';
  end if;
  -- Another Logistics company's lorry is refused (review #2131).
  insert into delivery_partners (name) values ('Other Co 0725') returning id into v_zone;
  insert into partner_fleet (partner_id, plate, vehicle_type) values (v_zone, 'OTH 25', 'Lorry') returning id into v_zone;
  v_ok := false;
  begin
    perform fleet_save_lorry_health(v_zone, '2026-11-01', null, null, null);
  exception when invalid_parameter_value then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL: dates saved on another company''s lorry'; end if;

  -- Zones: a malformed postcode range is refused.
  v_ok := false;
  begin
    insert into delivery_zones (name, postcodes) values ('Bad', '{4700}');
  exception when check_violation then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL: postcode "4700" accepted'; end if;
  insert into delivery_zones (name, postcodes) values ('Puchong', '{47100-47199,58200}') returning id into v_zone;
  v_ok := false;
  begin
    insert into delivery_zones (name, postcodes) values (' puchong ', '{}');
  exception when unique_violation then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL: two zones share a name'; end if;

  -- Rate cards: one per company per zone, one "every other zone" row.
  insert into delivery_rate_cards (partner_id, zone_id, basis, first_unit, second_unit, further_unit)
  values (v_carres, v_zone, 'item', 60, 40, 30), (v_carres, null, 'order', 100, 100, 100);
  v_ok := false;
  begin
    insert into delivery_rate_cards (partner_id, zone_id, first_unit, second_unit, further_unit) values (v_carres, null, 1, 1, 1);
  exception when unique_violation then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL: two "every other zone" rate cards for one company'; end if;
  select count(*) into v_n from delivery_setting_changes where what = 'delivery_rate_cards' and partner_id = v_carres;
  if v_n < 2 then raise exception 'FAIL: rate card changes not recorded (%)', v_n; end if;

  -- A zone with a rate card is refused; the card is never removed with it (Houzs; review #2131).
  v_ok := false;
  begin
    delete from delivery_zones where id = v_zone;
  exception when restrict_violation then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL: a zone with a rate card was removed'; end if;
  select count(*) into v_n from delivery_rate_cards where partner_id = v_carres;
  if v_n <> 2 then raise exception 'FAIL: expected 2 rate cards kept, got %', v_n; end if;
  -- Once its cards are removed, the zone goes.
  delete from delivery_rate_cards where zone_id = v_zone;
  delete from delivery_zones where id = v_zone;
  if exists (select 1 from delivery_zones where id = v_zone) then raise exception 'FAIL: empty zone not removed'; end if;

  -- Houzs charge rules on a card: a sofa band list must be a list; reconciliation is refused to
  -- an operation user who is neither Finance nor named for Delivery settings.
  v_ok := false;
  begin
    insert into delivery_rate_cards (partner_id, zone_id, first_unit, second_unit, further_unit, sofa_brackets)
    values (v_carres, gen_random_uuid(), 1, 1, 1, '{"min": 1}');
  exception when check_violation then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL: sofa bands that are not a list were accepted'; end if;
  v_ok := false;
  begin
    perform delivery_rate_reconcile(null, null);
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL: reconciliation read by an operation user with no Finance or Delivery settings role'; end if;

  raise notice '0725 check: PASS';
end;
$check$;
rollback;
