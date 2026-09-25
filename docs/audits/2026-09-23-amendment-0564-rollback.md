# Rollback plan for migration `0564` — written BEFORE it is applied

**Measured on production 2026-09-23, before any apply.** Recovery is prepared in
advance, not improvised afterwards.

## What `0564` changes, and what that means for going back

| Change | Reversible by | Destructive? |
|---|---|---|
| six `customer_agreement_*` columns on `sales_order_amendments` | nothing — leave them | no, all nullable |
| two check constraints on those columns | nothing — leave them | no, they only bind rows that name a kind |
| `sales_order_amendment_terms_hash` (new) | nothing calls it after rollback | no |
| `sales_order_record_amendment_agreement` (new) | nothing calls it after rollback | no |
| `sales_order_withdraw_amendment` (new) | nothing calls it after rollback | no |
| `sales_order_decide_amendment` (replaced) | re-apply from the file below | no |
| `sales_order_amendment_live` (replaced) | re-apply from the file below | no |
| `sales_order_save_revision` (replaced) | re-apply from the file below | no |
| `sales_order_save_revision_unchecked_0354` (replaced) | re-apply from the file below | no |

**Nothing is dropped to roll back.** A dropped column loses the agreements
already recorded, and dropping anything needs Jess's word in the conversation
that asks for it (Constitution red line 1). Left in place, the columns are read
by nobody once the four functions are back.

## The exact before-state, by md5(prosrc)

```
sales_order_decide_amendment              5d9ba24609e735216b47249c9fe92110
sales_order_amendment_live                c770bd0781d2ed7a16ae44038125ec76
sales_order_save_revision                 93c8c54ab5df268c78e386b1e9c70070
sales_order_save_revision_unchecked_0354  f4d012cd856ca760a489b10862c944b8
```

## How to put each one back — from the repository, never from a transcription

Re-apply ONLY the `create or replace function` block named, from the file named.
These are the files that last defined each body before `0564`; a second copy of
the same SQL pasted into this document would be a second truth that can drift.

| Function | Re-apply the block from |
|---|---|
| `sales_order_decide_amendment` | `supabase/migrations/0500_role_gates_refuse_a_caller_with_no_role.sql` |
| `sales_order_amendment_live` | `supabase/migrations/0500_role_gates_refuse_a_caller_with_no_role.sql` |
| `sales_order_save_revision` | `supabase/migrations/0420_the_amendment_lane_may_move_what_it_names.sql` |
| `sales_order_save_revision_unchecked_0354` | `supabase/migrations/0560_a_blank_answer_is_not_an_answer.sql` (line 6453 onward) |

**Verify the rollback the same way it was measured:** re-read the four md5s
above. They must match exactly. If one does not, the block re-applied was not
the block that was live — stop and compare before touching anything else.

## What a rollback does to work already done under `0564`

An amendment approved while `0564` was live stays approved: it minted a
complete revision through the ordinary writer, and revisions are history, not
state. What is lost is only the GATE — after rollback an amendment can again be
approved with nothing on record showing the customer agreed. That is the
condition production is in today, so a rollback restores today, it does not
create a new hazard.

## The one pending amendment

`dde58498-…` was submitted **2026-08-10** (44 days before this file), base
revision 11, order still at `place`, proposing only `lines`. It is test-era data
(Constitution §6) and nobody is waiting on it. Under `0564` it simply cannot be
approved until someone records how the customer agreed — the rule working, not
a regression. **It is not touched by this delivery**: it is not this chat's
request to withdraw, and no customer order is altered to make a deployment look
clean.

## Verification after applying (non-destructive, read-only)

1. The four md5s above have all CHANGED.
2. `select count(*) from information_schema.columns where table_name='sales_order_amendments' and column_name like 'customer_agreement%'` → 6.
3. Both constraints exist: `amendments_agreement_kind_is_governed`,
   `amendments_agreement_names_its_evidence`.
4. `sales_order_amendment_live` on any order with a live request returns
   `customer_agreement_covers_proposal: false` — read only, changes nothing.
5. No approval is performed to prove the gate. It is proved on the throwaway
   database by `apps/api/src/test/amendment-lane-0564.integration.test.ts`.
