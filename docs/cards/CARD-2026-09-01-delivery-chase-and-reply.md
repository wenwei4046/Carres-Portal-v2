# 【DELIVERY】 — CARD 05 · The chase door and the real reply evidence

**Module:** Delivery · **Sequence:** 05 · **Lane:** BUILD — owner-approved flow in review
2026-09-01 (the four-step chase walk: system raises the ask → prepared WhatsApp → record the
partner's actual reply → the Work row closes on the recorded fact).

**Authority:** `docs/delivery/MASTER.md` §2 ("The portal prepares WhatsApp/email content;
Operations uploads the partner's actual reply before recording Confirmed or Rejected. Prepared,
copied, opened or sent never means confirmed.") · §5 (contact purposes, reply evidence) · §13
(preparation records target and content but never confirms a business fact).

## What shipped

1. **The chase door lives in Edit Delivery — Delivery's own workspace, never a jump to Sales
   Order** (owner clarification in review: the arrangement chase is Delivery work; Sales Order
   is only the door for a wrong Sales fact). Choosing a partner reveals
   `Ask {partner} for the delivery date`: the prepared plain-English message (SO, customer,
   address, building, goods, the customer's requested date), `Copy message`, and
   `Open WhatsApp group` straight to the partner's own group (`delivery_partners.
   whatsapp_group_url`; a partner without one gets the honest absence, not a dead door). The
   block states on screen: *sending is not confirmation*.
2. **The reply proof becomes a real UPLOAD** — the typed-path input is gone. A new governed
   door `POST /delivery-arrangements/:orderId/reply-proof/sign-upload?leg=` signs an upload
   into the private `proof-of-delivery` bucket under `arrangement/{order}/{leg}/…`, same photo
   family and 10 MB limit as the 0363 handover door; the path rides `Save Delivery` as before.
3. My Work reaches this door through the existing deep-link (a delivery action opens the exact
   arrangement), so the chase flow is: My Work row → Edit Delivery → prepared message → record
   reply + upload screenshot → Save Delivery → the Work row closes on the recorded fact.

## Deliberately not in this slice

- A **"message prepared" activity record** needs a new append door (order_history writes live
  in SQL doors only) — batched into the next Delivery migration (0412) together with Card 06's
  condominium-registration columns.
- Chase content for email, and per-partner templates — Settings-card scope.

## Gate

17 Edit Delivery + 24 arrangement-API tests green · `pnpm -r typecheck` green ·
`check-design-standard` no new violations · no migration in this card.
