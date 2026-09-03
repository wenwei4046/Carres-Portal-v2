# 【DELIVERY】 — CARD 07 · The partner's own delivery screen

**Module:** Delivery · **Sequence:** 07 · **Lane:** BUILD — the ruled NETS portal shape,
approved in review 2026-09-01 (one screen · two acts · phone-first).

**Authority:** `docs/delivery/MASTER.md` §5 (the ruled NETS screen: minimum facts, `Save
Delivery Arrangement`, `Cannot Deliver`) · §2 (NETS responsible without Accept; Cannot Deliver
needs a reason; Operations decides next) · §13 (partner sees only its assigned deliveries and
minimum customer/handling data — no money, no other partners, no reassignment).

## What ships

1. **Migration `0418`** — repairs 0412's latent door defect (the events table was keyed by
   `arrangement_id NOT NULL`; the 0412 door speaks `(order_id, leg)`): scope columns added and
   backfilled, arrangement link optional, `cannot_deliver` joins the event dictionary with its
   reason-required constraint. Probed on production in a rolled-back transaction (zero orphans
   after backfill · scope-keyed insert works · reason CHECK fires), then applied as the exact file.
2. **API `/api/partner/deliveries`** — partner-gated (role + `partner_id`), service-role reads
   narrowed to the authenticated partner in code (the Warehouse-Schedule pattern). Assignment
   truth = the arrangement's partner, else the order's own columns (the `currentPartners`
   fallback), so partner and workspace can never disagree. Another partner's scope answers 404.
   `PUT /:orderId/arrangement?leg=` accepts ONLY the four partner fields (no partner move, no
   proof path, no condo facts). `POST /:orderId/cannot-deliver?leg=` appends the governed event +
   history line and reassigns nothing.
3. **`Delivery dates` page** (`/delivery-partner/arrange`) — one phone-first column of cards:
   customer · area · building · goods · phone (tap to call) · `Customer asked: {date}` · DO No
   or the honest absence. Two acts exactly; `other` demands the note; a reported scope shows
   *Carres Operations is deciding* instead of the form. Operation event inserts now carry the
   scope columns too.

## Deliberately not in this slice

Partner-visible full address/DO print (rides the DO document), photo/POD work (the legacy
deliveries page still owns execution), retirement of the legacy Accept-based kanban (its own
decision), and the Operations-side Work row raised by a Cannot Deliver report (Work Engine card).

## Gate

11 partner-API + 5 page tests green · `pnpm -r typecheck` green · design-standard clean ·
0417 probed then applied (applied under the name 0413 before the number collision with main's 0413_the_guard_counts_what_was_approved was caught by CI; the tracker row was renamed to 0417 in the same repair) (tracker tail to verify at merge).
