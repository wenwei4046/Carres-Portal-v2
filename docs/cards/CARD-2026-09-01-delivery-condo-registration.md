# 【DELIVERY】 — CARD 06 · Condominium registration + the remembered message

**Module:** Delivery · **Sequence:** 06 · **Lane:** BUILD.

**Authority:** `docs/delivery/MASTER.md` §8 Edit Delivery (owner ruling 2026-09-01:
condominium registration is a Delivery-owned arrangement fact) · §2/§13 (preparation records
target and content but never confirms) · Card 05's named deferral.

## What ships

1. **Migration `0412`** — `ops_delivery_arrangements.condo_registration` (free text, the
   building's own words, ≤2000 chars) · the `message_prepared` arrangement event · the one SQL
   door `delivery_arrangement_message_prepared` appending the event and the order_history line
   together (42501 for non-operation; P0002 for junk ids). No arrangement field moves through it.
2. **Edit Delivery** — a `Condominium registration` textarea inside the Condo-only block,
   riding `Save Delivery`; `Copy message` / `Open WhatsApp group` now quietly record the
   prepared-message activity (a failed record never blocks the operator).
3. **API** — the arrangement select/save carry `condo_registration`;
   `POST /:orderId/message-prepared?leg=` calls the one door.

## Gate

19 Edit Delivery + 27 arrangement-API tests green · `pnpm -r typecheck` green ·
`check-design-standard` clean · migration 0412 to be production-verified in a rolled-back
transaction, then applied as the exact file under owner approval before merge.
