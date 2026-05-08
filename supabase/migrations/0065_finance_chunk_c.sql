-- Phase 5 Chunk C — refunds: credit-note auto-numbering + apply tracking.
-- Spec: docs/superpowers/specs/2026-05-08-phase-5-finance-spec.md §4.7 + §5.3
--
-- Schema gap (key insight):
--   refund_status enum is { pending | approved | rejected | paid } — only 4
--   values, no 'issued' or 'applied' as the proto's UI suggests. The proto
--   wants distinct UI states for credit notes (issued / applied) vs refunds
--   (pending / approved / paid).
--
--   We resolve this WITHOUT touching the enum (avoiding the irreversible
--   recreate dance) by using an existing column as the discriminator + adding
--   one new column for the apply target:
--     - credit_note_no IS NOT NULL  -> it's a credit note (CN-XXXX)
--     - credit_note_no IS NULL      -> it's a refund (RF) — proto shows "RF-{N}"
--                                       but DB doesn't store the prefix; UI
--                                       derives `RF-${dl}` for refund rows.
--
--   For a credit note:
--     status='approved'  -> UI label "issued"  (newly created, balance owed back)
--     status='paid'      -> UI label "applied" (used on a future order; the
--                                                paid_at column doubles as
--                                                applied_at for credit notes)
--     applied_to_order_id -> the future order this CN was applied to
--
--   For a refund:
--     standard pending → approved → paid via existing refund_pay RPC.
--
-- This pattern keeps the schema tiny + reversible. Phase 6 may revisit if
-- a richer state model is needed.

-- =============================================================================
-- 1. Sequence + helper for credit-note numbering
-- =============================================================================
-- CN-0001, CN-0002, ... — globally unique, monotonic. Sequence survives
-- transaction rollback by design (good — we don't want gaps from approval
-- back-and-forth, but we also don't want collisions if two finance staff
-- simultaneously issue notes). Bigint range is fine forever.
create sequence if not exists refund_credit_note_seq;

create or replace function public.next_credit_note_no()
returns text
language sql
security definer
set search_path = public
as $$
  select 'CN-' || lpad(nextval('refund_credit_note_seq')::text, 4, '0');
$$;

revoke all on function public.next_credit_note_no() from public;
grant execute on function public.next_credit_note_no() to authenticated;

-- =============================================================================
-- 2. applied_to_order_id column
-- =============================================================================
-- Tracks which future order a credit note got applied against. NULL until
-- the apply step fires. Set null on order delete to avoid blocking the order
-- archival; the audit log still captures the linkage permanently.
alter table refunds
  add column if not exists applied_to_order_id uuid references orders(id) on delete set null;

create index if not exists refunds_applied_to_order_idx
  on refunds(applied_to_order_id)
  where applied_to_order_id is not null;

-- =============================================================================
-- 3. finance_apply_credit_note — atomically apply a CN against a future order
-- =============================================================================
-- Atomically:
--   1. Locks the refund row (FOR UPDATE), validates it's a credit note
--      (credit_note_no IS NOT NULL) AND status='approved'.
--   2. Locks the target order row (FOR UPDATE), validates it exists.
--   3. Updates refund: status='paid', paid_at=now(), applied_to_order_id.
--   4. Audit-logs.
--
-- Race protection: status check rejects double-apply (already paid). The
-- finance/principal app_role gate keeps non-finance out.
--
-- Returns the updated refund row.
create or replace function public.finance_apply_credit_note(
  p_refund_id        uuid,
  p_target_order_id  uuid
) returns refunds
language plpgsql
security definer
set search_path = public
as $$
declare
  v_refund refunds;
  v_target_dl int;
begin
  if public.app_role() not in ('finance','principal') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_refund from refunds where id = p_refund_id for update;
  if not found then
    raise exception 'refund not found' using errcode = 'P0002';
  end if;

  if v_refund.credit_note_no is null then
    raise exception 'not a credit note (use refund_pay for refunds)'
      using errcode = '22023';
  end if;

  if v_refund.status <> 'approved' then
    raise exception 'credit note must be in approved (issued) state, got %', v_refund.status
      using errcode = '22023';
  end if;

  select dl into v_target_dl from orders where id = p_target_order_id for update;
  if not found then
    raise exception 'target order not found' using errcode = 'P0002';
  end if;

  update refunds
     set status              = 'paid',
         paid_at             = now(),
         applied_to_order_id = p_target_order_id
   where id = p_refund_id
   returning * into v_refund;

  insert into audit_log (role, actor_text, action, dealer_id, ref)
  values (public.app_role(),
          (select name from app_users where id = auth.uid()),
          format('Credit note applied · %s · DL-%s · RM %s',
                 v_refund.credit_note_no, v_target_dl, v_refund.amount),
          v_refund.dealer_id,
          v_refund.credit_note_no);

  return v_refund;
end;
$$;

revoke all on function public.finance_apply_credit_note(uuid, uuid) from public;
grant execute on function public.finance_apply_credit_note(uuid, uuid) to authenticated;
