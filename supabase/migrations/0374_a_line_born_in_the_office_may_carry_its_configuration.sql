-- 0374_a_line_born_in_the_office_may_carry_its_configuration.sql
-- ===========================================================================
-- THE OFFICE CREATE DOOR MAY CARRY `attrs` (2026-08-21).
--
-- WHY. `sales_order_create` (0327, last replaced by 0354) inserts
--   insert into order_lines(order_id, sku, qty, unit_price)
-- and nothing else. `order_lines.attrs` has existed since 0001 and is where a
-- line's CONFIGURATION lives — sofa fabric, bedframe colour and gap, the
-- cascade payload the Create-PO modal reads (`configurators.tsx` says the
-- autofill depends on `fabric_id`). The POS writes it on every configured
-- line. This door could not, so an order BORN in the office was structurally
-- incapable of carrying configuration — not "the form does not ask yet", but
-- "the RPC has no slot for it".
--
-- WHAT CHANGES. Exactly one statement: the `order_lines` insert gains `attrs`.
-- The function body is otherwise BYTE-IDENTICAL to 0354's — same signature,
-- same `security definer`, same role gate ('operation','principal'), same
-- validation sentences, same Rev-1 mint, same history row. Nothing about who
-- may call it moves.
--
-- ABSENT STAYS NULL. `jsonb_typeof(...) = 'object'` means a line with no
-- configuration inserts NULL exactly as it does today, rather than `{}` —
-- which later code would read as "configured, with nothing in it". A non-object
-- `attrs` (a string, a number, an array) is ignored rather than refused: this
-- door already refuses missing SKUs, bad quantities and negative prices with
-- sentences, and a malformed attrs is a client bug, not an operator mistake to
-- put in front of them.
--
-- SECURITY: unchanged. RLS untouched. No new grant, no new table, no column
-- added or dropped. Red line 6 respected — 0354 is not edited; this is a new
-- file that CREATE OR REPLACEs the function.
--
-- ⚠️ NOT APPLIED BY THE AUTHOR. Number taken 2026-08-21 as MAX(repo tail,
-- every remote branch) = 0373, so this is 0374 — but the tracker is the
-- authority and it moves. RE-CHECK IT IN THE SAME MINUTE YOU APPLY:
--     select name, version from supabase_migrations.schema_migrations
--     order by version desc limit 5;
-- The SQL editor writes NO tracker row; insert it by hand after applying.
-- ===========================================================================

begin;

create or replace function public.sales_order_create(
  p_header jsonb,
  p_lines  jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role     text := public.app_role();
  v_order_id uuid;
  v_so       int;
  v_line     jsonb;
  v_fields   jsonb := '{}'::jsonb;
begin
  if v_role not in ('operation','principal') then
    raise exception 'Operation/Principal only' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_header->>'customer_name',''))) = 0 then
    raise exception 'Customer name is required' using errcode = '22023';
  end if;
  if nullif(p_header->>'dealer_id','') is null then
    raise exception 'A dealer is required' using errcode = '22023';
  end if;
  -- orders_salesperson_required (0296): every order the portal writes names
  -- who sold it. Refused here with a sentence, before the constraint speaks.
  if nullif(p_header->>'salesperson_id','') is null then
    raise exception 'A salesperson is required' using errcode = '22023';
  end if;

  if p_header ? 'entry_fields' then
    if jsonb_typeof(p_header->'entry_fields') <> 'object' then
      raise exception 'entry_fields must be an object' using errcode = '22023';
    end if;
    v_fields := coalesce((
      select jsonb_object_agg(k, val)
        from jsonb_each(p_header->'entry_fields') e(k, val)
       where jsonb_typeof(val) <> 'null' and nullif(trim(val #>> '{}'),'') is not null
    ), '{}'::jsonb);
  end if;

  insert into orders (
    status, channel, dealer_id, outlet_id, salesperson_id,
    customer_name, customer_phone, customer_email, customer_address,
    customer_address_line1, customer_address_line2, customer_address_city,
    customer_address_state, customer_address_postcode,
    customer_emergency, customer_billing,
    delivery_date, delivery_date_tbd, proceed_date,
    delivery_floor, delivery_has_lift,
    customer_race, customer_gender, customer_birthday,
    customer_address_unknown, customer_billing_same, delivery_stair_items,
    entry_data
  ) values (
    'place',
    case when nullif(p_header->>'outlet_id','') is not null then 'showroom' else 'dealer' end,
    (p_header->>'dealer_id')::uuid,
    nullif(p_header->>'outlet_id','')::uuid,
    nullif(p_header->>'salesperson_id','')::uuid,
    trim(p_header->>'customer_name'),
    nullif(p_header->>'customer_phone',''),
    nullif(p_header->>'customer_email',''),
    nullif(p_header->>'customer_address',''),
    nullif(p_header->>'customer_address_line1',''),
    nullif(p_header->>'customer_address_line2',''),
    nullif(p_header->>'customer_address_city',''),
    nullif(p_header->>'customer_address_state',''),
    nullif(p_header->>'customer_address_postcode',''),
    nullif(p_header->>'customer_emergency',''),
    nullif(p_header->>'customer_billing',''),
    nullif(p_header->>'delivery_date','')::date,
    coalesce((p_header->>'delivery_date_tbd')::boolean, false),
    nullif(p_header->>'proceed_date','')::date,
    coalesce((p_header->>'delivery_floor')::int, 1),
    coalesce((p_header->>'delivery_has_lift')::boolean, false),
    nullif(p_header->>'customer_race',''),
    nullif(p_header->>'customer_gender',''),
    nullif(p_header->>'customer_birthday','')::date,
    coalesce((p_header->>'customer_address_unknown')::boolean, false),
    coalesce((p_header->>'customer_billing_same')::boolean, true),
    nullif(p_header->>'delivery_stair_items','')::int,
    case when v_fields = '{}'::jsonb then null
         else jsonb_build_object('fields', v_fields) end
  )
  returning id, so into v_order_id, v_so;

  if p_lines is not null and jsonb_typeof(p_lines) = 'array' then
    for v_line in select * from jsonb_array_elements(p_lines) loop
      if length(trim(coalesce(v_line->>'sku',''))) = 0 then
        raise exception 'A line needs a SKU' using errcode = '22023';
      end if;
      if coalesce((v_line->>'qty')::int, 0) < 1 then
        raise exception 'Line % qty must be at least 1', v_line->>'sku' using errcode = '22023';
      end if;
      if coalesce((v_line->>'unit_price')::numeric, -1) < 0 then
        raise exception 'Line % needs a unit price of 0 or more', v_line->>'sku' using errcode = '22023';
      end if;
      -- 0374 — `attrs` rides the birth. ABSENT stays NULL: a line with no
      -- configuration must look exactly as it did before this migration, not
      -- gain an empty object that later code would read as "configured, with
      -- nothing in it".
      insert into order_lines(order_id, sku, qty, unit_price, attrs)
      values (
        v_order_id,
        trim(v_line->>'sku'),
        (v_line->>'qty')::int,
        (v_line->>'unit_price')::numeric,
        case when jsonb_typeof(v_line->'attrs') = 'object' then v_line->'attrs' else null end
      );
    end loop;
  end if;

  -- Rev 1 = the created state. The order is BORN with its original on file.
  insert into sales_order_revisions(order_id, revision, snapshot, created_by)
  values (v_order_id, 1, public.sales_order_snapshot(v_order_id), auth.uid());

  insert into order_history(order_id, text, by_role, by_user_id, metadata)
  values (
    v_order_id,
    'Order created (office) · Rev 1',
    v_role::app_role,
    auth.uid(),
    jsonb_build_object('kind','created_office','revision',1)
  );

  return jsonb_build_object('id', v_order_id, 'so', v_so, 'revision', 1);
end $$;

commit;

-- ===========================================================================
-- VERIFY — run these AFTER applying. Each one fails loudly if the change is
-- wrong, and the last two are NEGATIVE controls: a check that cannot fail is
-- not a check.
-- ===========================================================================
--
-- 1 · the function still exists exactly once, and is still DEFINER
--     select proname, prosecdef from pg_proc
--     where proname = 'sales_order_create';
--     -- expect ONE row, prosecdef = true
--
-- 2 · a configured line keeps its attrs
--     begin;
--       set local request.jwt.claims = '{"sub":"<an operation app_users.id>"}';
--       set local role authenticated;
--       select public.sales_order_create(
--         jsonb_build_object(
--           'customer_name','ATTRS VERIFY',
--           'dealer_id','<a dealers.id>',
--           'salesperson_id','<a salespersons.id>'),
--         jsonb_build_array(jsonb_build_object(
--           'sku','VERIFY-1','qty',1,'unit_price',0,
--           'attrs', jsonb_build_object('fabric_id','abc','colour','walnut')))
--       );
--       select sku, attrs from order_lines
--       where order_id = (select id from orders where customer_name = 'ATTRS VERIFY');
--       -- expect attrs = {"colour": "walnut", "fabric_id": "abc"}
--     rollback;
--
-- 3 · NEGATIVE CONTROL — a line with NO attrs still inserts NULL, not '{}'
--     (same transaction shape, omit the 'attrs' key)
--     -- expect attrs IS NULL
--
-- 4 · NEGATIVE CONTROL — the role gate still bites
--     set local request.jwt.claims = '{"sub":"<a DEALER app_users.id>"}';
--     -- expect ERROR 42501 Operation/Principal only
-- ===========================================================================
