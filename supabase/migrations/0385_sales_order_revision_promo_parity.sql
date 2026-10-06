-- 0385_sales_order_revision_promo_parity.sql
--
-- OFFICE AMENDMENT PROMO PARITY (Phase 4).
--
-- 0354's office writer updates sku / qty / unit_price and deletes omitted
-- lines. That is valid for ordinary customer-order lines, but it is not valid
-- for a line whose attrs carry a free/promo entitlement. The dealer edit door
-- already refuses those markers (0256 + orders.ts): an office edit must not
-- reprice a line that still prints "Promo · FREE", nor delete the line while
-- leaving its spent voucher USED forever.
--
-- The existing 0354 body is deliberately retained byte-for-byte behind a
-- renamed implementation. This wrapper is the one public write door and runs
-- the guard before delegating, so every existing header/floor/revision behavior
-- remains unchanged. No voucher is released here: an attempted amendment is
-- rejected, and a committed voucher therefore remains USED as its ledger says.
--
-- Schema only; no rows are read, rewritten, backfilled, or deleted.

begin;

alter function public.sales_order_save_revision(uuid, jsonb, jsonb, jsonb)
  rename to sales_order_save_revision_unchecked_0354;

create function public.sales_order_save_revision(
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
  v_old       record;
  v_line      jsonb;
  v_attrs     jsonb;
  v_new_price numeric;
begin
  -- A header-only correction does not touch goods. When the complete line
  -- payload is supplied, every protected line must survive unchanged.
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
  '0385 Phase 4: office amendments cannot edit or delete free, promo, PWP, bundle, or combo lines. The 0354 implementation remains behind this guard.';

commit;
