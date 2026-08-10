-- 0331 · THE LOCKED MONTH SAYS "July", NOT "July      "
--
-- 0272's two commission-lock refusals build their month with
-- `to_char(date, 'Month YYYY')`. Postgres BLANK-PADS `Month` to nine
-- characters, so the sentence an operator reads is:
--
--     July      2026 is approved - reopen the run before changing who gets
--     credit for it.
--
-- Measured, not guessed — this exact string came back from
-- `sales_order_apply_attribution` on SO-1314 during card 3.3's evidence run.
--
-- WHY IT IS FIXED NOW AND NOT LEFT AS 0272's PROBLEM. Until card 3.3 this
-- sentence had no path to a screen: the lock fired inside HR's own flows,
-- where the raw `sqlerrm` was what surfaced. 3.3 made 0272's DETAIL the text
-- an operator reads when APPLY refuses (0328 forwards the detail verbatim,
-- 0329 raises it as the refusal message) — the gate's own sentence, by
-- design, reused rather than re-spelled. Giving a sentence a screen makes its
-- spelling a UI defect, and it becomes the card's to fix.
--
-- `FM` is the Postgres fill-mode prefix: same word, no padding. Nothing else
-- about either function changes — the lock, the trigger and the wording all
-- stand. A committed migration is never edited (Constitution red line 6), so
-- both functions are re-declared here in full.

-- ① The rate-change guard (0272:190-197 — the function is
--    `_commission_guard_rate_write`; the body below is its live definition
--    read back from pg_proc, with only the FM added).
create or replace function public._commission_guard_rate_write()
returns trigger
language plpgsql
as $$
begin
  if public._commission_month_locked(
       extract(year from new.effective_from)::int,
       extract(month from new.effective_from)::int, 'staff') then
    raise exception 'commission_month_locked'
      using detail = to_char(new.effective_from, 'FMMonth YYYY')
                     || ' is approved - reopen the run before changing rates in it.';
  end if;
  return new;
end $$;

-- ② The attribution guard — the one card 3.3 surfaces (0272:665-674).
create or replace function public._commission_assert_order_month_open(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_placed timestamptz;
begin
  select placed_at into v_placed from public.orders where id = p_order_id;
  if v_placed is null then return; end if;
  if public._commission_month_locked(
       extract(year from v_placed)::int, extract(month from v_placed)::int, 'staff') then
    raise exception 'commission_month_locked'
      using detail = to_char(v_placed, 'FMMonth YYYY')
        || ' is approved - reopen the run before changing who gets credit for it.';
  end if;
end $$;
