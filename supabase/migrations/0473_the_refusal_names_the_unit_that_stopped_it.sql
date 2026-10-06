-- 0473_the_refusal_names_the_unit_that_stopped_it.sql
--
-- ⭐ ONE ACT, ONE TRANSACTION — AND A REFUSAL THE OPERATOR CAN ACT ON.
--
-- 0471 §4b made `Choose Ready Unit` atomic: every chosen Unit or none. That is
-- right, and it left one thing unsaid. An operator who chose five Units and is
-- told *"someone else took that Unit"* has to guess WHICH of the five — and
-- the only way to find out was to untick them one at a time and press again,
-- which is four more races.
--
-- The batch door is the only place that knows: it is standing on the pick when
-- the draw door refuses. So it now re-raises every refusal with the Unit's id
-- appended to DETAIL as `unit_id=<uuid>`, keeping the original SQLSTATE and the
-- original refusal word intact — the browser still prints the governed sentence
-- for THAT refusal, and can now name the Unit it is about.
--
-- WHAT DOES NOT CHANGE. Atomicity: catching a refusal only to re-raise it
-- aborts exactly as before, so there is still no partial success to explain.
-- The guards, the ledger rows and the audit lines stay `ops_stock_pool_draw`'s
-- — this door still validates nothing of its own (ERP Architecture Law C).
--
-- SAFE IN EITHER ORDER. A Worker on the pre-0473 bundle reads a DETAIL it does
-- not parse and prints the same sentence it printed yesterday; a Worker on the
-- post-0473 bundle reading a pre-0473 DETAIL finds no `unit_id=` and names no
-- Unit. Nothing depends on the other side, so no delegator and no deploy
-- window.

begin;

create or replace function public.so_batch_reserve_ready_units(
  p_ref    text,
  p_reason text,
  p_note   text,
  p_picks  jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_pick   jsonb;
  v_item   uuid;
  v_line   uuid;
  v_drawn  uuid;
  v_out    jsonb := '[]'::jsonb;
  v_count  int := 0;
  v_state  text;
  v_word   text;
  v_detail text;
begin
  if jsonb_typeof(p_picks) <> 'array' or jsonb_array_length(p_picks) = 0 then
    raise exception 'no_units_chosen' using errcode = '22023';
  end if;
  if jsonb_array_length(p_picks) > 50 then
    raise exception 'too_many_units' using errcode = '22023',
      detail = 'choose at most 50 Units in one act';
  end if;

  for v_pick in select * from jsonb_array_elements(p_picks) loop
    v_item := (v_pick ->> 'itemId')::uuid;
    v_line := (v_pick ->> 'orderLineId')::uuid;

    begin
      v_drawn := public.ops_stock_pool_draw(
        p_ref           => p_ref,
        p_reason        => p_reason,
        p_note          => p_note,
        p_item_id       => v_item,
        p_sku           => null,
        p_condition     => null,
        p_wh            => null,
        p_order_line_id => v_line
      );
    exception when others then
      -- The refusal is the draw door's, word for word and SQLSTATE for
      -- SQLSTATE. This adds the ONE fact only this loop knows.
      get stacked diagnostics
        v_state  = returned_sqlstate,
        v_word   = message_text,
        v_detail = pg_exception_detail;
      raise exception using
        errcode = v_state,
        message = v_word,
        detail  = coalesce(nullif(v_detail, '') || ' · ', '') || 'unit_id=' || v_item::text;
    end;

    -- A null answer is the draw door saying the unit is no longer free. In a
    -- one-act transaction that is a refusal, not a quiet shortfall.
    if v_drawn is null then
      raise exception 'unit_no_longer_free' using errcode = '40001',
        detail = 'someone else took that Unit · unit_id=' || v_item::text;
    end if;

    v_count := v_count + 1;
    v_out := v_out || jsonb_build_object('itemId', v_drawn, 'orderLineId', v_line);
  end loop;

  return jsonb_build_object('reserved', v_count, 'units', v_out, 'reference', p_ref);
end;
$function$;

revoke all on function public.so_batch_reserve_ready_units(text, text, text, jsonb) from public, anon;
grant execute on function public.so_batch_reserve_ready_units(text, text, text, jsonb) to authenticated;

comment on function public.so_batch_reserve_ready_units(text, text, text, jsonb) is
  '0471/0473 — SO Batch Purchase''s `Choose Ready Unit`: N exact Units, each named against the Sales Order ITEM LINE it answers, in ONE transaction. Delegates every guard and every ledger row to `ops_stock_pool_draw`; it adds atomicity, and names the Unit that stopped the act in DETAIL as `unit_id=<uuid>` so a refusal can say WHICH of the chosen Units it is about.';

commit;
