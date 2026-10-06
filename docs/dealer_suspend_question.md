# Open question: what does Suspend do to a dealer?

Status: open, waiting for the operations owner.

## The question

On the principal Dealers page, what should Suspend stop a dealer from doing?

1. New orders only
2. Logging in and new orders
3. Nothing, it is just a label

## Why it needs an answer

Today Suspend only changes the label on the dealer. A suspended dealer can still log in and place orders. The confirm box says "They won't be able to place new orders", but nothing makes that true.

Nobody ever decided what Suspend means. It came in with the first build in May.

## When it is answered

Write the answer to `docs/dealer_suspend_answer.md` in its own pull request, titled `Dealer Suspend: answer`, with nothing else in it.

## Where the code is

* The confirm box: `apps/web/src/pages/principal/components/DealerDrawer.tsx`
* The status change: `dealer_set_status` in `supabase/migrations/0013_principal_admin.sql`
* Orders a dealer places: `apps/api/src/routes/partner/orders.ts`
* Orders staff place for a dealer: `apps/api/src/routes/operation/orders.ts`
