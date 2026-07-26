-- =============================================================================
-- 0274_guarantee_and_service_package.sql (Loo 2026-07-26)
-- =============================================================================
-- Loo: "for 那个 cleaning service 呢，直接变成在 guarantee 的 category 里面再多一个
-- 项目… 你把名字改成 guarantee and service 吧… 会分为两种类型: One-time（一次性）…
-- Recurring / Retractable Package: 这种 service package 系统还会去检查它还剩几次，
-- 因为它是按年（一年一年）来售卖的."
--
-- He spotted a real unification, not a cosmetic one. A guarantee and a care plan
-- are the SAME object:
--
--     both attach to a purchased item · both have a clock · both get used up
--
-- The only thing that differs is HOW MANY TIMES. A guarantee is a care plan with
-- exactly one visit. So instead of a second parallel engine, `guarantee_terms`
-- learns a `kind` and the entitlement ledger learns to count:
--
--     one_time   → visits_total 1   → first use spends it        (today, exactly)
--     recurring  → visits_total N   → each use decrements        (N = years × per year)
--
-- WHY THE MINT TRIGGER IS NOT TOUCHED. `guarantee_mint_from_line` is the single
-- AFTER INSERT trigger that closes all five order-line doors (0262 §5) and it is
-- the most load-bearing function in this feature. Rewriting it to carry two more
-- columns would risk the whole mint path for a snapshot. Instead a small BEFORE
-- INSERT trigger on `guarantee_entitlements` fills `kind` / `visits_total` from
-- the terms row whenever they were not supplied explicitly — so the snapshot
-- happens at mint time for EVERY door, including doors that do not exist yet,
-- and the mint function stays byte-identical.
--
-- THE ID RETIREMENT RULE IS PRESERVED, AND EXTENDED CORRECTLY. Spec §2b: "a claim
-- retires the ID". For a recurring package, retiring it on the FIRST visit would
-- strand the remaining visits with no handle to quote. So the ID is retired when
-- the LAST visit is spent — which for a one_time package is the first visit, i.e.
-- byte-identical behaviour to today.
--
-- Naming: the DB keeps `guarantee` as the product category and `guarantee_terms`
-- as the table. Renaming a category enum value would ripple through the POS, the
-- catalog, the invoice and five RPCs for zero behavioural gain. The rename Loo
-- asked for is a LABEL — "Guarantee & Service Package" — and labels live in the
-- UI, which is where it is applied.
-- =============================================================================

BEGIN;

-- ── 1 · terms learn what kind of cover they are ──────────────────────────────
ALTER TABLE public.guarantee_terms
  ADD COLUMN IF NOT EXISTS kind            text NOT NULL DEFAULT 'one_time',
  -- NULL for one_time. For recurring this × coverage_years is the visit count.
  ADD COLUMN IF NOT EXISTS visits_per_year integer;

ALTER TABLE public.guarantee_terms
  DROP CONSTRAINT IF EXISTS guarantee_terms_kind_check;
ALTER TABLE public.guarantee_terms
  ADD CONSTRAINT guarantee_terms_kind_check CHECK (kind IN ('one_time', 'recurring'));

-- A recurring package that does not say how often is unsellable; a one-time one
-- that does is contradicting itself. Refuse both shapes at the table.
ALTER TABLE public.guarantee_terms
  DROP CONSTRAINT IF EXISTS guarantee_terms_visits_shape;
ALTER TABLE public.guarantee_terms
  ADD CONSTRAINT guarantee_terms_visits_shape CHECK (
    (kind = 'one_time'  AND visits_per_year IS NULL)
    OR (kind = 'recurring' AND visits_per_year IS NOT NULL AND visits_per_year BETWEEN 1 AND 12)
  );

COMMENT ON COLUMN public.guarantee_terms.kind IS
  'one_time = one claim (a guarantee). recurring = visits_per_year x coverage_years visits (a care plan). Loo 2026-07-26.';

-- `remedy` allowed only replace|repair — both are things you do to a BROKEN
-- item, which is all this table used to describe. A care plan's remedy is
-- neither: nothing is wrong, someone comes and cleans it. Caught by the CHECK
-- while dry-running this migration, which is exactly what that CHECK is for.
ALTER TABLE public.guarantee_terms
  DROP CONSTRAINT IF EXISTS guarantee_terms_remedy_check;
ALTER TABLE public.guarantee_terms
  ADD CONSTRAINT guarantee_terms_remedy_check
    CHECK (remedy IN ('replace', 'repair', 'service'));

-- A one-time cover cannot be a 'service' (that is a plan, not a guarantee) and a
-- recurring plan cannot promise a 'replace' (a swap is one-shot by nature).
ALTER TABLE public.guarantee_terms
  DROP CONSTRAINT IF EXISTS guarantee_terms_kind_remedy_agree;
ALTER TABLE public.guarantee_terms
  ADD CONSTRAINT guarantee_terms_kind_remedy_agree CHECK (
    (kind = 'one_time'  AND remedy IN ('replace', 'repair'))
    OR (kind = 'recurring' AND remedy = 'service')
  );

-- ── 2 · the ledger learns to count ───────────────────────────────────────────
-- All three are SNAPSHOTS: editing the terms must never change what an already
-- sold entitlement promised (the same doctrine as coverage_years / remedy).
ALTER TABLE public.guarantee_entitlements
  ADD COLUMN IF NOT EXISTS kind         text    NOT NULL DEFAULT 'one_time',
  ADD COLUMN IF NOT EXISTS visits_total integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS visits_used  integer NOT NULL DEFAULT 0;

ALTER TABLE public.guarantee_entitlements
  DROP CONSTRAINT IF EXISTS guarantee_entitlements_visits_shape;
ALTER TABLE public.guarantee_entitlements
  ADD CONSTRAINT guarantee_entitlements_visits_shape CHECK (
    kind IN ('one_time', 'recurring')
    AND visits_total >= 1
    AND visits_used >= 0
    AND visits_used <= visits_total
    -- a one-time cover is one visit, by definition
    AND (kind <> 'one_time' OR visits_total = 1)
  );

COMMENT ON COLUMN public.guarantee_entitlements.visits_used IS
  'Visits consumed. Reaching visits_total spends the entitlement and retires its guarantee_id.';

-- Backfill the one shape that is not covered by the defaults: an entitlement
-- already CLAIMED has, by definition, used its single visit. Without this its
-- counter would read 0 of 1 while its status says claimed.
UPDATE public.guarantee_entitlements
   SET visits_used = 1
 WHERE status = 'claimed' AND visits_used = 0;

-- ── 3 · the snapshot, without touching the five-door mint trigger ────────────
CREATE OR REPLACE FUNCTION public.guarantee_snapshot_kind()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_kind  text;
  v_per_y integer;
BEGIN
  -- Only fill what the caller left at its default. An explicit value (a repair
  -- script, a future door that knows better) always wins.
  IF NEW.kind <> 'one_time' OR NEW.visits_total <> 1 THEN
    RETURN NEW;
  END IF;

  SELECT kind, visits_per_year INTO v_kind, v_per_y
    FROM public.guarantee_terms
   WHERE guarantee_sku = NEW.guarantee_sku;

  -- No terms row: leave the safe default (one visit). The mint trigger already
  -- refuses to mint without terms, so this is belt-and-braces.
  IF v_kind IS NULL OR v_kind = 'one_time' THEN
    RETURN NEW;
  END IF;

  NEW.kind := 'recurring';
  -- years x per-year, never below 1 — mirrors the rental engine's
  -- greatest(1, floor(term x visits/yr / 12)) doctrine: a sold plan always
  -- carries at least one visit.
  NEW.visits_total := greatest(1, coalesce(NEW.coverage_years, 1) * v_per_y);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS guarantee_entitlements_snapshot_kind ON public.guarantee_entitlements;
CREATE TRIGGER guarantee_entitlements_snapshot_kind
  BEFORE INSERT ON public.guarantee_entitlements
  FOR EACH ROW EXECUTE FUNCTION public.guarantee_snapshot_kind();

-- ── 4 · a claim becomes "spend one visit" ────────────────────────────────────
-- Identical signature (live-verified before writing). For a one_time cover every
-- branch below collapses to exactly today's behaviour.
CREATE OR REPLACE FUNCTION public.guarantee_claim(
  p_entitlement_id uuid,
  p_case_id uuid DEFAULT NULL::uuid,
  p_replacement_sku text DEFAULT NULL::text,
  p_notes text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  g            public.guarantee_entitlements%ROWTYPE;
  v_used       integer;
  v_spent      boolean;
  v_visit_word text;
BEGIN
  IF NOT (SELECT public.is_operation()) THEN
    RAISE EXCEPTION 'forbidden: operation or principal only'
      USING ERRCODE = '42501', DETAIL = 'guarantee_claim_internal_only';
  END IF;

  SELECT * INTO g FROM public.guarantee_entitlements WHERE id = p_entitlement_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'guarantee not found' USING ERRCODE = 'P0002';
  END IF;

  IF g.status = 'claimed' THEN
    RAISE EXCEPTION 'guarantee % was already used up on %',
      coalesce(g.claimed_guarantee_id, g.guarantee_id, '(no id)'), g.claimed_at::date
      USING ERRCODE = '22023', DETAIL = 'guarantee_already_claimed';
  END IF;
  IF g.status <> 'active' THEN
    RAISE EXCEPTION 'guarantee is % - only a delivered, live guarantee can be claimed', g.status
      USING ERRCODE = '22023', DETAIL = 'guarantee_not_active';
  END IF;
  IF g.expires_on IS NOT NULL AND g.expires_on < CURRENT_DATE THEN
    RAISE EXCEPTION 'guarantee expired on %', g.expires_on
      USING ERRCODE = '22023', DETAIL = 'guarantee_expired';
  END IF;
  -- Defence in depth: the CHECK makes this unreachable, but a spent counter with
  -- a live status must never silently hand out a free visit.
  IF g.visits_used >= g.visits_total THEN
    RAISE EXCEPTION 'guarantee % has no visits left', coalesce(g.guarantee_id, '(no id)')
      USING ERRCODE = '22023', DETAIL = 'guarantee_no_visits_left';
  END IF;

  v_used  := g.visits_used + 1;
  v_spent := v_used >= g.visits_total;

  -- The ID is retired only when the LAST visit is spent (spec §2b) — retiring it
  -- on visit 1 of 6 would strand the remaining five with no handle to quote.
  UPDATE public.guarantee_entitlements
     SET visits_used          = v_used,
         status               = CASE WHEN v_spent THEN 'claimed' ELSE status END,
         claimed_at           = CASE WHEN v_spent THEN now() ELSE claimed_at END,
         claimed_by           = CASE WHEN v_spent THEN auth.uid() ELSE claimed_by END,
         claim_case_id        = coalesce(p_case_id, claim_case_id),
         replacement_sku      = coalesce(nullif(p_replacement_sku, ''), replacement_sku),
         claim_notes          = coalesce(nullif(p_notes, ''), claim_notes),
         claimed_guarantee_id = CASE WHEN v_spent
                                     THEN coalesce(claimed_guarantee_id, guarantee_id)
                                     ELSE claimed_guarantee_id END,
         guarantee_id         = CASE WHEN v_spent THEN NULL ELSE guarantee_id END
   WHERE id = p_entitlement_id;

  -- The history line has to read correctly for BOTH kinds. A one-for-one swap
  -- and "visit 2 of 6" are different events and must not share one sentence.
  v_visit_word := CASE
    WHEN g.kind = 'recurring'
      THEN ' - service visit ' || v_used || ' of ' || g.visits_total
    ELSE ' claimed - one-for-one replacement of '
         || coalesce(g.covers_label, g.covers_sku, 'the covered item')
  END;

  INSERT INTO public.order_history (order_id, text, by_role, by_user_id)
  VALUES (
    g.order_id,
    'Guarantee ' || coalesce(g.guarantee_id, '(no id)')
      || v_visit_word
      || CASE WHEN g.kind = 'recurring' AND v_spent THEN ' (final visit)' ELSE '' END
      || coalesce(' -> ' || nullif(p_replacement_sku, ''), '')
      || coalesce(' · ' || nullif(p_notes, ''), ''),
    (SELECT public.app_role()),
    (SELECT id FROM public.app_users WHERE id = auth.uid())
  );

  RETURN jsonb_build_object(
    'ok', true,
    'entitlement_id', p_entitlement_id,
    'kind', g.kind,
    'status', CASE WHEN v_spent THEN 'claimed' ELSE 'active' END,
    'visitsUsed', v_used,
    'visitsTotal', g.visits_total,
    'visitsLeft', g.visits_total - v_used,
    -- null while visits remain: nothing was retired yet
    'retired_guarantee_id', CASE WHEN v_spent THEN g.guarantee_id ELSE NULL END
  );
END;
$function$;

COMMIT;
