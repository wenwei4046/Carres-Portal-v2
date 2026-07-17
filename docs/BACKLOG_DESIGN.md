# Backlog — design decisions pending

## NETS onboarding gap — must resolve before Jul 30

**Found during the 2026-07-17 NETS RLS audit.** All partner-facing RLS policies
(orders read, order_lines read, order_history read, POD bucket, and the new
partner write restrictions from migrations 0227+) scope access via
`orders.delivery_partner_id = app_partner_id()`. But **as of 2026-07-17, zero
orders have `delivery_partner_id` set** — day-to-day logistics assignment is
recorded in the free-text `ops_assigned_logistic` column (5 distinct values in
use), which RLS knows nothing about.

Consequence if unresolved: NETS logs in on go-live and sees **no orders at
all** — the security model is correct but the assignment data never reaches
the column it keys on.

Options (decision needed, NO assignment logic changed yet):
1. Make the Orders control "assign logistic" action also set
   `orders.delivery_partner_id` (map the `ops_assigned_logistic` text values →
   `delivery_partners` rows; NETS already exists as
   `delivery_partners` "NETS").
2. One-off backfill for NETS-assigned open orders + change the assignment UI
   going forward.
3. Re-key partner RLS on a join through `ops_assigned_logistic` (worst option:
   free text, no FK, fragile).

Owner: Jess. Blocking: NETS partner-portal go-live (~Jul 30).
