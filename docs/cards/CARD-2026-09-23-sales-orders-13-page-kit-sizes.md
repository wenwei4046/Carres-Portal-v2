# SALES ORDERS — CARD 13 · SO page keeps the UI Kit sizes, one gap, one table grammar

Module: Sales Orders · Sequence: 13 · Lane: BUILD / DELIVERY
Status: IMPLEMENTED — release and production status recorded on the PR.
Owner: Jess, 2026-09-23 — "Card Clarification: KEEP Existing UI Kit Sizes" and the overnight
BUILD/DELIVERY mission §3 ("SO Page / Shared UI Kit — separate Card").
Authority: `docs/01-design-tokens.md` §1/§3 · Orders MASTER § "Order view" · UI MASTER §4.1 ·
COPY-STANDARD. No migration.

## Scope

The Sales Order object page (`/operation/orders/so/:id`) and the SO PDF's service Item Code only.
Excluded: Order Route (a separate PLAN lane), DO numbering (#1550, Purchasing lane), PO PDF.
`Block` is shared with Purchase Orders and Manual Purchase, so every new layout rule is opt-in
under `titleTone="sales-order"`; those pages do not move.

## Measured before → after (real shell, `so-workspace-shell-preview`, getComputedStyle)

| Fact | Before | After | Rule |
|---|---|---|---|
| Section titles | 15/600/22 | 15/600/22 | `text-strong` (unchanged) |
| In-card headings (`Emergency contact`, `Billing`) | **15/600/22** | 13/600/18 | two ranks only |
| Field labels | 11/500/14 | 11/500/14 | `text-label` |
| Field values | 13/400/18 | 13/400/18 | `text-body` |
| Item Code · Approval code | **12/400/16 JetBrains Mono** | 13/400/18 Inter | body font |
| Money amounts | **16/400/24 (browser default)** | 13/400/18 | `text-body` |
| Money labels | **12/400/16** | 13/400/18 | `text-body` |
| `Total payable` | 16/400/24 | 13/600/18 + rule | weight only |
| `Balance due` | **15/600/22** | 13/600/18 + rule | weight only |
| Payment cell padding | **8 16 8 0** | 8 8 8 8 | = Items |
| Payment rules | none under header · above each row | under header · beneath each row | = Items |
| Input height | **28** (page CSS) beside read-only **32** | 32 / 32 | kit `h-8` |
| Delivery group gap | **0** | 12 | one body gap |
| Customer group gaps | **16 · 8 · 28 · 8** | 12 · 12 · 12 · 12 | one body gap |
| Page sideways scroll, 1440 and 390 | 0 | 0 | |

## Built

1. `Block` body (SO tone): `flex flex-col gap-3 [&>*:empty]:hidden` — the one 12px group gap;
   per-group `mt-3`/`mt-4`/`mb-2` removed. An always-present empty button row in
   `SalesOrderAttribution` was removed so an empty lane takes no gap.
2. `SubHead` → 13/600 slate-11 (the MASTER's in-card label rank).
3. `components/so-document-table.ts` — one table recipe imported by Items and Payment.
4. Money totals: one 13px size, weight 600 on `Total payable` / `Balance due`, 1px rule over each,
   unbroken across both columns; full width on phones, `min-w-240` from `sm`.
5. `sales-order-detail-theme.css` no longer resizes kit controls to 28px.
6. Service Item Code upper case on page AND PDF from `lib/service-code.ts`; stored key unchanged.
   Found on the way: the SO document payload never sent a service code, so the issued PDF
   printed the `ADD-ON` placeholder (a defect by the 2026-08-09 owner review) — now sent.
7. `Delivery` → `Disposal` field on the same `order_addons` rows, no money; `Add disposal` in
   Edit calls the same `addServiceToDraft` as `Add service`. Walked: adding one raised the Items
   total once (RM 4,290.00 → RM 4,370.00), Items total = `Total payable`.
8. Stale guidance: `/ui` and five source headers pointed at the retired `docs/UI-KIT.md`; two
   doc links resolved outside `docs/`. Repointed to the successors.

## Tests

`SalesOrderWorkspace.ui-contract.test.ts` — three contracts rewritten from the old values, seven
added; control run against `main`'s sources: **10 red**. `orders.test.ts` — the SO document
carries the service code; control run: red.

## Challenge (Law 4)

- 🟡 `Disposal` / `Add disposal` are build wording (COPY-STANDARD, owner confirmation owed).
- 🟡 A disposal is recognised by key/name (`dispos`) because the `addons` catalogue has no service
  category. Falsifier: the catalogue gains a category — read it instead.
- 🟡 Whether a service's Item Code should be the catalogue `SVC-…` SKU rather than the stored key is
  not ruled; this card prints the stored key, identical on page and paper.
- 🟡 About 30 kit component comments still cite `UI-KIT §n` section numbers of the retired doc;
  only the pointers that send a reader to a missing FILE were repointed.
