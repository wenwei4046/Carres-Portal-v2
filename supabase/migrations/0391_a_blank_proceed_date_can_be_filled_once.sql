-- 0391_a_blank_proceed_date_can_be_filled_once.sql
--
-- A DATE THAT WAS NEVER RECORDED IS NOT A DATE THAT IS LOCKED
-- Owner ruling — YH, 2026-08-28. `docs/orders/MASTER.md` § THE MERGED ORDER TAB.
--
--   CREATE      every door REQUIRES a proceed date — the POS already did; the
--               OFFICE door did not, and now does.
--   BLANK       an existing order with NO proceed date may be filled in ONCE.
--   RECORDED    an order that HAS one stays read-only — Jess's 2026-08-26
--               ruling, unchanged.
--
-- The lock is on the ANSWER, never on the emptiness. Filling a blank is
-- completion; moving a recorded date moves when the factory starts, and that
-- stays shut.
--
-- WHY THE OFFICE DOOR NEEDED THIS AT ALL. The MASTER read "`createOrderInput`
-- refuses an order without one". Measured 2026-08-28: TWO different objects
-- carry that name. The POS door's `createOrderInputSchema`
-- (packages/shared/src/schemas/orders.ts:325-327) does refuse. The OFFICE
-- door's local `createOrderInput` (apps/api/src/routes/operation/orders.ts)
-- does not, and neither did this RPC — 0374:115 inserted
-- `nullif(p_header->>'proceed_date','')::date` with no NULL check. So the
-- office could mint an order the object page then rendered read-only as
-- `Not recorded` forever: the door created the orphan only it could have
-- prevented.
--
-- ⭐ WRAPPER, NOT A REWRITE — the 0385 pattern. Both bodies are large and
-- neither business rule below belongs inside them. `sales_order_create`'s
-- 0374 body is renamed and kept BYTE-FOR-BYTE behind a validating wrapper, and
-- `sales_order_save_revision`'s 0385 wrapper is replaced by one carrying BOTH
-- its promo guard (unchanged, reproduced verbatim) and the new proceed lock.
-- Nothing about lines, floors, revisions or headers changes.
--
-- ⛔ NOT A SECOND POLICY. `update_order` (0222/0230) already refuses
-- proceed_date once `status = 'proceed_order'`. That gate is about the
-- PRODUCTION LANE and is untouched. This one is about whether an answer was
-- ever given. An order can be refused by either; they never disagree, because
-- they test different things.
--
-- Schema only. No row is read, rewritten, backfilled or deleted — existing
-- orders carrying a NULL proceed date keep it until a human fills it in.

begin;

-- ---------------------------------------------------------------------------
-- 1 · CREATE — the office door names the production start, like the POS does
-- ---------------------------------------------------------------------------

alter function public.sales_order_create(jsonb, jsonb)
  rename to sales_order_create_unchecked_0374;

create function public.sales_order_create(
  p_header jsonb,
  p_lines  jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- The sentence matches the POS's own refusal so an operator moving between
  -- the two surfaces reads one rule, not two spellings of it.
  if nullif(trim(coalesce(p_header->>'proceed_date','')), '') is null then
    raise exception 'Proceed date — pick the day production should start'
      using errcode = '22023', detail = 'proceed_date_required';
  end if;

  return public.sales_order_create_unchecked_0374(p_header, p_lines);
end;
$$;

revoke all on function public.sales_order_create(jsonb, jsonb) from public;
grant execute on function public.sales_order_create(jsonb, jsonb) to authenticated;

comment on function public.sales_order_create(jsonb, jsonb) is
  '0391: the office birth door requires a proceed date, as the POS door already did. The 0374 implementation remains behind this guard.';

-- ---------------------------------------------------------------------------
-- 2 · SAVE — a blank may be filled once; a recorded date may not be moved
-- ---------------------------------------------------------------------------
--
-- Replaces the 0385 wrapper in place, keeping its promo guard verbatim and
-- adding the proceed lock ahead of it. Both still delegate to
-- `sales_order_save_revision_unchecked_0354`.
--
-- The lock allows exactly three things and refuses one:
--   · payload omits proceed_date            → allowed (every ordinary save)
--   · order's proceed_date IS NULL          → allowed (this is the fill)
--   · payload repeats the recorded value    → allowed (a no-op resend; the
--                                             form posts the whole header, so
--                                             refusing this would break every
--                                             unrelated correction)
--   · payload CHANGES or CLEARS a recorded  → REFUSED
--     value                                   (`is distinct from` catches the
--                                             clear-to-null case too)

create or replace function public.sales_order_save_revision(
  p_order_id uuid,
  p_header   jsonb default '{}'::jsonb,
  p_lines    jsonb default null,
  p_change   jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old        record;
  v_line       jsonb;
  v_attrs      jsonb;
  v_new_price  numeric;
  v_proceed    date;
begin
  -- 0391 · THE PROCEED LOCK. Runs before anything is written, so a refused
  -- save changes nothing.
  if p_header ? 'proceed_date' then
    select proceed_date into v_proceed
      from public.orders
     where id = p_order_id;

    if v_proceed is not null
       and nullif(p_header->>'proceed_date','')::date is distinct from v_proceed then
      raise exception 'The proceed date is already recorded and cannot be changed here'
        using errcode = '22023', detail = 'proceed_date_recorded';
    end if;
  end if;

  -- 0385 · PROMO PARITY, reproduced verbatim. A header-only correction does
  -- not touch goods. When the complete line payload is supplied, every
  -- protected line must survive unchanged.
  if p_lines is not null then
    for v_old in
      select id, sku, qty, unit_price, attrs
        from public.order_lines
       where order_id = p_order_id
    loop
      v_attrs := coalesce(v_old.attrs, '{}'::jsonb);
      if v_attrs ?| array['free_gift', 'free_item', 'pwp', 'bundle_group', 'combo_key'] then
        v_line := null;
        select l into v_line
          from jsonb_array_elements(p_lines) as e(l)
         where nullif(l->>'id', '') is not null
           and (l->>'id')::uuid = v_old.id;

        if v_line is null then
          raise exception 'line % is not editable', v_old.id
            using errcode = '22023', detail = 'line_not_editable';
        end if;

        v_new_price := nullif(v_line->>'unit_price', '')::numeric;
        if trim(coalesce(v_line->>'sku', '')) is distinct from v_old.sku
           or nullif(v_line->>'qty', '')::int is distinct from v_old.qty
           or v_new_price is distinct from v_old.unit_price then
          raise exception 'line % is not editable', v_old.id
            using errcode = '22023', detail = 'line_not_editable';
        end if;
      end if;
    end loop;
  end if;

  return public.sales_order_save_revision_unchecked_0354(
    p_order_id, p_header, p_lines, p_change
  );
end;
$$;

revoke all on function public.sales_order_save_revision(uuid, jsonb, jsonb, jsonb) from public;
grant execute on function public.sales_order_save_revision(uuid, jsonb, jsonb, jsonb) to authenticated;

comment on function public.sales_order_save_revision(uuid, jsonb, jsonb, jsonb) is
  '0391: a blank proceed date may be filled once; a recorded one cannot be changed here. Also carries 0385''s promo guard. The 0354 implementation remains behind both.';

commit;

-- ===========================================================================
-- VERIFICATION — run against a scratch order, never production.
--
-- 1 · CREATE refuses a missing proceed date
--     select public.sales_order_create('{"customer_name":"T","dealer_id":"<uuid>",
--       "salesperson_id":"<uuid>"}'::jsonb, '[{"sku":"X","qty":1,"unit_price":1}]');
--     -- expect ERROR 22023 detail proceed_date_required
--
-- 2 · CREATE still succeeds WITH one (0374 body unchanged behind the wrapper)
--     -- same call plus "proceed_date":"2026-09-01"  -- expect {id, so, revision}
--
-- 3 · SAVE fills a BLANK proceed date
--     update orders set proceed_date = null where id = '<order>';
--     select public.sales_order_save_revision('<order>', '{"proceed_date":"2026-09-01"}');
--     -- expect a new revision; orders.proceed_date = 2026-09-01
--
-- 4 · SAVE refuses MOVING a recorded one
--     select public.sales_order_save_revision('<order>', '{"proceed_date":"2026-09-09"}');
--     -- expect ERROR 22023 detail proceed_date_recorded
--
-- 5 · SAVE refuses CLEARING a recorded one
--     select public.sales_order_save_revision('<order>', '{"proceed_date":null}');
--     -- expect ERROR 22023 detail proceed_date_recorded
--
-- 6 · NEGATIVE CONTROL — a no-op resend still passes, so unrelated
--     corrections are not broken by the lock
--     select public.sales_order_save_revision('<order>',
--       '{"proceed_date":"2026-09-01","customer_phone":"012-3456789"}');
--     -- expect a new revision recording the phone change
--
-- 7 · NEGATIVE CONTROL — 0385's promo guard still bites
--     -- supply p_lines repricing a line whose attrs carry 'pwp'
--     -- expect ERROR 22023 detail line_not_editable
-- ===========================================================================
