-- =============================================================================
-- 0295 — a bounced card stops being invisible
--
-- Loo, 2026-07-27: "卡刷失败什么都不记 —— webhook 只接付款成功，跳票了系统里
-- 一片空白，finance 看不到."
--
-- 0281 built the collection ledger for money IN and said so out loud: it handles
-- `invoice.paid` and nothing else. So when Stripe tries the card on the 7th and
-- the bank says no, the system writes NOTHING. The instalment sits there reading
-- "Due", and later "Past due" — the same two words it would show if the customer
-- had simply not been billed yet. Finance cannot tell "we have not asked for the
-- money" from "we asked and the card was declined", and those need opposite
-- actions: one is a wait, the other is a phone call for a new card.
--
-- ── 1 · a decline does NOT touch rental_billings ─────────────────────────────
-- The tempting move is to flip the instalment to 'overdue'. Refused, twice over:
--   (a) 0281's whole point is that `rental_record_payment` is the ONLY writer of
--       `rental_billings`. A second writer is how two systems start disagreeing
--       again — the exact CF that migration closed.
--   (b) 'overdue' would be a SECOND source of truth for lateness. The collections
--       read already DERIVES late from the due date precisely so it can never be
--       a stale flag nobody cleared. And a card can decline on the due date
--       itself, which is a decline and not yet late — collapsing the two loses
--       the distinction that makes this worth building.
-- A decline is therefore an EVENT, and the screens derive from it, the same way
-- they already derive "late".
--
-- ── 2 · idempotency needs a key, because nothing changes state ───────────────
-- `rental_record_payment` is idempotent for free: the row flips to 'paid' and a
-- re-delivery sees it. A failure flips nothing, so a re-delivered webhook would
-- write a second identical row and finance would count two declines where the
-- bank said no once. Stripe's event id is the only thing that identifies THIS
-- delivery, so `rental_billing_events` learns a `stripe_event_id` and a unique
-- index does the work. Nullable: every row written before today has none, and
-- the manual door has no event id to give.
--
-- Note this is a real distinction, not caution: Stripe Smart Retries fire
-- `invoice.payment_failed` again on each new ATTEMPT, and those ARE separate
-- events with separate ids. Three genuine attempts write three rows; one event
-- delivered three times writes one. That is the behaviour we want.
--
-- ── 3 · the failure is recorded even when no instalment matches ──────────────
-- `stripe_invoice_id` is only stamped on a billing row when money ARRIVES, so a
-- failing invoice will almost always be unknown to us — resolution therefore
-- falls to the oldest still-owing instalment, which is what Stripe was trying to
-- collect. And if even that finds nothing (every row already paid, a drifted
-- schedule), the event is STILL written against the agreement with a null
-- billing: refusing to record a real decline for want of a row to hang it on
-- would rebuild the silence this migration exists to end.
--
-- ── 4 · interest is still not fired ──────────────────────────────────────────
-- 0281 landed `late_interest` + `rentalLateInterest()` and deliberately fired
-- neither, because deciding a payment is late is the dunning ladder's job and
-- that needs a comms channel we do not have (CF rental-dunning-has-no-send-channel).
-- Unchanged here. Recording a decline is not charging for it.
-- =============================================================================

BEGIN;

-- ── 1 · the ledger learns two words ──────────────────────────────────────────
ALTER TABLE public.rental_billing_events
  ADD COLUMN IF NOT EXISTS stripe_event_id text;

COMMENT ON COLUMN public.rental_billing_events.stripe_event_id IS
  'Stripe event id (evt_...). The idempotency key for events that change no state, so a re-delivered webhook cannot write a second row (0295). Null for rows written by hand or before 0295.';

CREATE UNIQUE INDEX IF NOT EXISTS rental_billing_events_stripe_event_idx
  ON public.rental_billing_events (stripe_event_id);

ALTER TABLE public.rental_billing_events
  DROP CONSTRAINT IF EXISTS rental_billing_events_kind_check;
ALTER TABLE public.rental_billing_events
  ADD CONSTRAINT rental_billing_events_kind_check CHECK (kind IN (
    -- written from day one by rental_record_payment
    'payment_recorded', 'interest_charged',
    -- 0295: the bank said no. Written by rental_record_payment_failure only.
    'payment_failed',
    -- segment 2b's dunning ladder lands HERE, not in a second table
    'reminder_sent', 'call_task_assigned', 'warning_sent',
    'bureau_escalated', 'bureau_response', 'resolved', 'written_off'
  ));

-- ── 2 · the one writer of a failure ──────────────────────────────────────────
-- Same gate as rental_record_payment: finance/principal at a desk, or the
-- webhook's service_role JWT. Deliberately NOT is_internal() — that admits bd,
-- and a BD sells these.
CREATE OR REPLACE FUNCTION public.rental_record_payment_failure(
  p_agreement_id      uuid        DEFAULT NULL,
  p_stripe_invoice_id text        DEFAULT NULL,
  p_stripe_event_id   text        DEFAULT NULL,
  p_amount            numeric     DEFAULT NULL,
  p_failed_at         timestamptz DEFAULT NULL,
  p_reason            text        DEFAULT NULL,
  p_reference         text        DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_is_service boolean := coalesce((SELECT auth.jwt()->>'role'), '') = 'service_role';
  v_bill       rental_billings;
  v_ra         rental_agreements;
  v_agreement  uuid;
  v_invoice    text := nullif(btrim(coalesce(p_stripe_invoice_id, '')), '');
  v_event      text := nullif(btrim(coalesce(p_stripe_event_id, '')), '');
  v_reason     text := nullif(btrim(coalesce(p_reason, '')), '');
  v_existing   rental_billing_events;
  v_row        rental_billing_events;
BEGIN
  IF NOT (public.rental_can_approve() OR v_is_service) THEN
    RAISE EXCEPTION 'Only finance or the principal may record a rental payment failure'
      USING errcode = '42501', detail = 'forbidden';
  END IF;

  -- Idempotent by the event id. Stripe delivers at-least-once and a decline
  -- changes no state, so this key is the only thing standing between one
  -- refusal by the bank and two refusals on the screen.
  IF v_event IS NOT NULL THEN
    SELECT * INTO v_existing FROM rental_billing_events
     WHERE stripe_event_id = v_event;
    IF FOUND THEN
      SELECT * INTO v_ra FROM rental_agreements WHERE id = v_existing.agreement_id;
      RETURN jsonb_build_object(
        'already',     true,
        'eventId',     v_existing.id,
        'billingId',   v_existing.billing_id,
        'seq',         v_existing.seq,
        'agreementNo', v_ra.agreement_no
      );
    END IF;
  END IF;

  -- Most specific first, exactly as rental_record_payment resolves. The invoice
  -- id will usually MISS here — a billing row only learns its invoice id when
  -- money lands — which is why the oldest-owing fallback is the normal path.
  IF v_invoice IS NOT NULL THEN
    SELECT * INTO v_bill FROM rental_billings WHERE stripe_invoice_id = v_invoice;
  END IF;

  v_agreement := coalesce(v_bill.agreement_id, p_agreement_id);
  IF v_agreement IS NULL THEN
    RAISE EXCEPTION 'Nothing to record against: give an agreement or a known invoice'
      USING errcode = 'P0001', detail = 'agreement_required';
  END IF;

  SELECT * INTO v_ra FROM rental_agreements WHERE id = v_agreement;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agreement not found'
      USING errcode = 'P0001', detail = 'agreement_not_found';
  END IF;

  IF v_bill.id IS NULL THEN
    SELECT * INTO v_bill FROM rental_billings
     WHERE agreement_id = v_agreement AND status <> 'paid'
     ORDER BY seq
     LIMIT 1;
  END IF;

  -- No open instalment is NOT a refusal. A decline against a fully-collected
  -- schedule is exactly the kind of thing a human must see, so it lands on the
  -- agreement with a null billing rather than being dropped.
  INSERT INTO rental_billing_events (
    agreement_id, billing_id, seq, kind, amount, method, reference,
    stripe_invoice_id, stripe_event_id, note, actor, actor_text, occurred_at
  ) VALUES (
    v_ra.id, v_bill.id, v_bill.seq, 'payment_failed',
    CASE WHEN p_amount IS NULL THEN v_bill.amount_due ELSE round(p_amount, 2) END,
    'stripe',
    nullif(btrim(coalesce(p_reference, '')), ''),
    v_invoice, v_event, v_reason,
    auth.uid(),
    CASE WHEN v_is_service THEN 'stripe-webhook' ELSE 'finance' END,
    coalesce(p_failed_at, now())
  )
  RETURNING * INTO v_row;

  INSERT INTO audit_log (role, actor_text, action, dealer_id, ref)
  VALUES (NULL,
          CASE WHEN v_is_service THEN 'stripe-webhook' ELSE 'rental-collection' END,
          'rental.payment_failed', v_ra.dealer_id, v_ra.agreement_no);

  RETURN jsonb_build_object(
    'already',     false,
    'eventId',     v_row.id,
    'billingId',   v_row.billing_id,
    'seq',         v_row.seq,
    'agreementNo', v_ra.agreement_no,
    'amount',      v_row.amount,
    'reason',      v_reason
  );
END;
$function$;

-- ── 3 · the list-level answer ────────────────────────────────────────────────
-- Recording a decline that only shows up inside one agreement's drawer is not
-- "finance can see it" — nobody opens a drawer they have no reason to suspect.
-- This is the one grouped question the agreements list asks: which agreements
-- have a card problem that is still open?
--
-- A decline counts as OPEN while the instalment it was against is still unpaid
-- (or could not be attached to one at all). Pay the month and the history stays
-- in the ledger but stops shouting — the same shape as a resolved alert.
--
-- security_invoker so the view carries the caller's RLS rather than the owner's:
-- both underlying tables are internal-read, and that must keep being the boundary.
DROP VIEW IF EXISTS public.rental_agreement_card_trouble;
CREATE VIEW public.rental_agreement_card_trouble
WITH (security_invoker = true) AS
SELECT e.agreement_id,
       count(*)::integer AS open_declines,
       max(e.occurred_at) AS last_decline_at
FROM public.rental_billing_events e
LEFT JOIN public.rental_billings b ON b.id = e.billing_id
WHERE e.kind = 'payment_failed'
  AND (e.billing_id IS NULL OR b.status <> 'paid')
GROUP BY e.agreement_id;

COMMENT ON VIEW public.rental_agreement_card_trouble IS
  'Agreements with an unresolved card decline (0295). security_invoker: reads through the caller''s RLS on rental_billing_events / rental_billings, which are internal-only.';

-- ── 4 · grants ───────────────────────────────────────────────────────────────
-- Functions: REVOKE FROM public alone does nothing and FROM anon alone does
-- nothing either — the pair plus an explicit grant back is the only working
-- form. Views: Supabase's default privileges DO grant new tables/views to anon,
-- so the revoke there is load-bearing, not ceremony. Both asserted below.
REVOKE ALL ON FUNCTION public.rental_record_payment_failure(uuid, text, text, numeric, timestamptz, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rental_record_payment_failure(uuid, text, text, numeric, timestamptz, text, text)
  TO authenticated, service_role;

REVOKE ALL ON public.rental_agreement_card_trouble FROM public, anon;
GRANT SELECT ON public.rental_agreement_card_trouble TO authenticated, service_role;

-- ── 5 · sanity ───────────────────────────────────────────────────────────────
-- Assertions never RAISE inside their own EXCEPTION handler (a handler that
-- catches its own raise proves nothing) — each sets a flag, checked outside.
DO $$
DECLARE
  v_n        integer;
  v_ok       boolean;
  v_refused  boolean;
BEGIN
  -- the new kind is accepted, the old ones survive, a nonsense one is refused
  SELECT count(*) INTO v_n
    FROM pg_constraint
   WHERE conrelid = 'public.rental_billing_events'::regclass
     AND conname  = 'rental_billing_events_kind_check'
     AND pg_get_constraintdef(oid) LIKE '%payment_failed%'
     AND pg_get_constraintdef(oid) LIKE '%payment_recorded%'
     AND pg_get_constraintdef(oid) LIKE '%bureau_escalated%';
  IF v_n <> 1 THEN
    RAISE EXCEPTION '0295: the kind CHECK did not come back whole (payment_failed + the 0281 set)';
  END IF;

  -- the idempotency key is actually unique
  SELECT count(*) INTO v_n
    FROM pg_indexes
   WHERE schemaname = 'public'
     AND indexname  = 'rental_billing_events_stripe_event_idx'
     AND indexdef LIKE 'CREATE UNIQUE INDEX%';
  IF v_n <> 1 THEN RAISE EXCEPTION '0295: stripe_event_id is not uniquely indexed'; END IF;

  -- rental_billings keeps exactly ONE writer: the new function must not write it
  IF pg_get_functiondef('public.rental_record_payment_failure(uuid, text, text, numeric, timestamptz, text, text)'::regprocedure)
     ~* '(update|insert into|delete from)\s+rental_billings' THEN
    RAISE EXCEPTION '0295: the failure RPC writes rental_billings — 0281 gave that table one writer';
  END IF;

  -- grants, both directions, function
  IF has_function_privilege('anon',
       'public.rental_record_payment_failure(uuid, text, text, numeric, timestamptz, text, text)',
       'EXECUTE') THEN
    RAISE EXCEPTION '0295: anon can execute rental_record_payment_failure';
  END IF;
  IF NOT has_function_privilege('authenticated',
       'public.rental_record_payment_failure(uuid, text, text, numeric, timestamptz, text, text)',
       'EXECUTE') THEN
    RAISE EXCEPTION '0295: authenticated CANNOT execute rental_record_payment_failure';
  END IF;
  IF NOT has_function_privilege('service_role',
       'public.rental_record_payment_failure(uuid, text, text, numeric, timestamptz, text, text)',
       'EXECUTE') THEN
    RAISE EXCEPTION '0295: service_role CANNOT execute rental_record_payment_failure';
  END IF;

  -- grants, both directions, view
  IF has_table_privilege('anon', 'public.rental_agreement_card_trouble', 'SELECT') THEN
    RAISE EXCEPTION '0295: anon can read rental_agreement_card_trouble';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.rental_agreement_card_trouble', 'SELECT') THEN
    RAISE EXCEPTION '0295: authenticated CANNOT read rental_agreement_card_trouble';
  END IF;

  -- the view must carry the CALLER's RLS, not the owner's
  SELECT count(*) INTO v_n
    FROM pg_class c
   WHERE c.oid = 'public.rental_agreement_card_trouble'::regclass
     AND c.reloptions @> ARRAY['security_invoker=true'];
  IF v_n <> 1 THEN
    RAISE EXCEPTION '0295: the card-trouble view is not security_invoker';
  END IF;

  -- the events table still has NO write policy: the definer RPCs are the door
  SELECT count(*) INTO v_n FROM pg_policies
   WHERE tablename = 'rental_billing_events' AND cmd <> 'SELECT';
  IF v_n <> 0 THEN
    RAISE EXCEPTION '0295: rental_billing_events grew a write policy (% found)', v_n;
  END IF;

  -- exactly one copy of the new function (no ghost overload)
  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'rental_record_payment_failure';
  IF v_n <> 1 THEN
    RAISE EXCEPTION '0295: expected 1 rental_record_payment_failure, found %', v_n;
  END IF;

  -- and the CHECK really refuses an unknown kind (flag, not a self-caught raise)
  v_refused := false;
  BEGIN
    INSERT INTO rental_billing_events (agreement_id, kind)
    SELECT id, 'card_went_bang' FROM rental_agreements LIMIT 1;
  EXCEPTION WHEN check_violation THEN
    v_refused := true;
  END;
  SELECT count(*) INTO v_n FROM rental_agreements;
  v_ok := v_refused OR v_n = 0;   -- nothing to insert against is not a failure
  IF NOT v_ok THEN
    RAISE EXCEPTION '0295: the kind CHECK accepted a nonsense value';
  END IF;
END $$;

COMMIT;
