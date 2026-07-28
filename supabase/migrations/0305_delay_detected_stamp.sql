-- 0305_delay_detected_stamp.sql
--
-- C8b · The FIRST delay clock needs a day to count from
-- (Loo, 2026-07-28; the specification is `docs/ORDERS-WORKING-FLOW.md` §3).
--
-- §3 gives `Delay planning` **2 working days from the day the supplier's date
-- first overshoots the promised date**. That day was not stored anywhere:
-- `line_etas` is a plain `sku → date` map with no stamp, `stock_eta` carries
-- none either, and `updated_at` is the row's last TOUCH — a remark edit would
-- push the deadline forward, so the clock could quietly never turn late. A Due
-- that never fires is worse than no Due at all, so C8b asked and Loo ruled the
-- pair below (2026-07-28).
--
-- **A PAIR, and that is 0304's own discipline** (S4: an event names the thing
-- it was made ABOUT). `delay_detected_eta` is the supplier date the sighting is
-- about; if the factory slips AGAIN that is a NEW delay, the pair stops
-- matching, and the clock restarts on the new date instead of running from a
-- sighting that stopped being about anything. Without it, one stamp would date
-- every future delay on that order — `ops_order_control.balance`'s disease.
--
-- **A TRIGGER, not route code, because there are several doors.**
-- `line_etas` / `line_stock_status` are written by `PUT /:id/control`, by
-- `POST /import-stock-eta`, and by any internal PostgREST call — the table
-- carries a blanket operation/principal write policy (0159). A stamp written by
-- one route is a stamp two other doors walk around, which is R4's lesson
-- exactly: ask WHAT is being written, never who is writing it. The trigger also
-- makes the pair SERVER-OWNED — a client may send whatever it likes for these
-- two columns and the BEFORE trigger overwrites it, so nobody can move their
-- own deadline.
--
-- **The supplier date is computed the same way the ladder computes it**
-- (`stockEtaOf`, apps/web): the LATEST ETA among lines still WAITING, with
-- `line_stock_status` naming the ready ones. `stock_eta` is deliberately NOT
-- read here — the ladder does not read it either, and a stamp about a date the
-- engine never computes would be a stamp the engine can never match. Where the
-- two ever DO disagree the pair simply stops matching and the clock stays
-- silent: the safe direction for a deadline.
--
-- **No backfill, on purpose.** All 55 live control rows carry no supplier date
-- at all (`stock_eta` NULL ×55, `line_etas` empty ×55, measured 2026-07-28), so
-- there is nothing to stamp — and a backfilled `at` would be an invented day
-- presented as a measurement, which is exactly what S5 refused for `closed_at`.
-- The stamp is born the first time a supplier date overshoots.
--
-- `ops_order_control` already carries operation/principal-only write RLS
-- (0159); these columns inherit it. No policy change.

alter table public.ops_order_control
  add column if not exists delay_detected_at  timestamptz,
  add column if not exists delay_detected_eta date;

comment on column public.ops_order_control.delay_detected_at is
  'C8b · When the supplier date FIRST overshot the promised date — the day Delay planning''s 2-working-day clock starts. Server-owned (trigger trg_stamp_delay_detected); never written by a client.';
comment on column public.ops_order_control.delay_detected_eta is
  'C8b · The supplier ready date that sighting was about. A later slip is a NEW delay: the pair stops matching and the clock restarts.';

-- Half the record is worse than none: a stamp with no date to point at cannot
-- be checked against a later slip, so it would date every future delay.
alter table public.ops_order_control
  drop constraint if exists ops_order_control_delay_detected_check;
alter table public.ops_order_control
  add constraint ops_order_control_delay_detected_check
  check ((delay_detected_at is null) = (delay_detected_eta is null));

create or replace function public.trg_stamp_delay_detected()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_etas    jsonb;
  v_status  jsonb;
  v_keys    text[];
  v_eta     date;
  v_promise date;
  v_tbd     boolean;
begin
  begin
    v_etas := case when jsonb_typeof(new.line_etas) = 'object'
                   then new.line_etas else '{}'::jsonb end;
    v_status := case when jsonb_typeof(new.line_stock_status) = 'object'
                     then new.line_stock_status else '{}'::jsonb end;

    -- WAITING lines: prefer the per-line status; without it, every line that
    -- carries an ETA counts as waiting (an ETA is only entered while the goods
    -- are still awaited). This mirrors `stockEtaOf` line for line.
    if v_status <> '{}'::jsonb then
      select array_agg(k) into v_keys
        from jsonb_object_keys(v_status) as k
       where lower(coalesce(v_status ->> k, '')) <> 'ready';
    else
      select array_agg(k) into v_keys
        from jsonb_object_keys(v_etas) as k;
    end if;

    if v_keys is not null and array_length(v_keys, 1) > 0 then
      select max((v_etas ->> k)::date) into v_eta
        from unnest(v_keys) as k
       where (v_etas ->> k) is not null;
      -- The waiting lines carry no date of their own: fall back to every ETA
      -- present, exactly as the ladder does.
      if v_eta is null then
        select max(value::date) into v_eta from jsonb_each_text(v_etas);
      end if;
    end if;

    select o.delivery_date, coalesce(o.delivery_date_tbd, false)
      into v_promise, v_tbd
      from orders o
     where o.id = new.order_id;

    -- STRICT overshoot: landing ON the promised date is not a delay (the T3
    -- radar's own rule, and the ladder's).
    if v_eta is not null and v_promise is not null and not v_tbd
       and v_eta > v_promise then
      if tg_op = 'UPDATE' and old.delay_detected_eta is not distinct from v_eta then
        -- Same overshoot as before: the FIRST sighting stands, and a client
        -- cannot move it by sending its own values.
        new.delay_detected_eta := old.delay_detected_eta;
        new.delay_detected_at  := old.delay_detected_at;
      else
        new.delay_detected_eta := v_eta;
        new.delay_detected_at  := now();
      end if;
    else
      -- No overshoot any more (the factory pulled the date in, the promise was
      -- corrected, the goods are in): the clock does not exist, so neither does
      -- its start.
      new.delay_detected_eta := null;
      new.delay_detected_at  := null;
    end if;
  exception when others then
    -- The stamp may never cost an operator their edit (0211's rule). On any
    -- surprise the pair keeps exactly what it already was.
    if tg_op = 'UPDATE' then
      new.delay_detected_eta := old.delay_detected_eta;
      new.delay_detected_at  := old.delay_detected_at;
    else
      new.delay_detected_eta := null;
      new.delay_detected_at  := null;
    end if;
  end;
  return new;
end;
$$;

comment on function public.trg_stamp_delay_detected() is
  'C8b · Maintains ops_order_control.delay_detected_at/_eta — the day the supplier date FIRST overshot the promised date. Server-owned; mirrors the ladder''s stockEtaOf.';

drop trigger if exists trg_stamp_delay_detected on public.ops_order_control;
create trigger trg_stamp_delay_detected
before insert or update on public.ops_order_control
for each row execute function public.trg_stamp_delay_detected();
