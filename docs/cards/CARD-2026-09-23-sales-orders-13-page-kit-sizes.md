# SALES ORDERS — CARD 13 · SO page keeps the UI Kit sizes, one gap, one table grammar

Module: Sales Orders · Sequence: 13 · Lane: BUILD / DELIVERY
Status: **PRODUCTION-VERIFIED 2026-09-24** — PR #1559 squash `9364fc24`; all five surfaces converged on that SHA.
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
6. Service Item Code follows the governed identity (settled 2026-09-24, below): catalogue Service SKU
   when linked, saved key otherwise, on page AND PDF. Found on the way: the SO document payload never
   sent a service code, so the issued PDF printed the `ADD-ON` placeholder (a defect by the 2026-08-09
   owner review) — now sent.
7. `Delivery` → `Services` field on the same `order_addons` rows, no money; in Edit, `Add service`
   offering the disposal family calls the same `addServiceToDraft` as the Items door. Walked: adding
   one raised the Items total once (RM 4,290.00 → RM 4,370.00), Items total = `Total payable`.
8. Stale guidance: `/ui` and five source headers pointed at the retired `docs/UI-KIT.md`; two
   doc links resolved outside `docs/`. Repointed to the successors.

9. Follow-up (2026-09-24): the `Revisions` and `History` tabs drew their card at `p-5` (20px, off the
   spacing scale) under a 20px `text-title`; they now render through the same SO `Block` (15px blue
   title over a 1px rule, 12/16px padding). The acceptance record's stale "label 12px" line was
   overwritten.

## Tests

`SalesOrderWorkspace.ui-contract.test.ts` — three contracts rewritten from the old values, seven
added; control run against `main`'s sources: **10 red**. `orders.test.ts` — the SO document
carries the service code; control run: red.

## Challenge (Law 4)

- 🟡 Non-blocking technical debt: about 30 kit component comments still cite `UI-KIT §n` section numbers of the retired doc;
  only the pointers that send a reader to a missing FILE were repointed.

## Production evidence — 2026-09-24, signed-in read of SO-1365 (820px), no write

| Fact | Production |
|---|---|
| Section titles / labels / in-card headings | 15/600/22 · 11/500/14 · 13/600/18 |
| Items and Payment cells | 13/400/18, padding 8 8 8 8, 1px rule beneath each row — identical |
| Item Code · Approval code | 13/400/18 Inter |
| Money | every figure 13px; `Total payable` RM 1,529.00 and `Balance due` RM 764.00 at 600 |
| Items total = `Total payable` | RM 1,529.00 = Goods 1,399.00 + Services 130.00; Balance 1,529 − 765 paid = 764 |
| Service Item Code | page `DISPOSE-SOFA` · `DISPOSE-MATTRESS` |
| Delivery → `Disposal` | `Dispose old sofa (small size) · Dispose old mattress` |
| Controls · group gaps · sideways scroll | 32px / 32px · 12px everywhere · 0 |
| SO PDF (Print) | ITEM CODE prints `DISPOSE-SOFA` · `DISPOSE-MATTRESS` (was `ADD-ON`); totals tally with the page |

Not exercised on production: `Add disposal` (it writes a draft; walked in the shell harness instead).

## Follow-up 2 — service identity and wording, settled 2026-09-24 (owner instruction: use governed authority, no owner round)

**Verified.**
- Catalogue (production, read-only SQL): `addons.key` → `addons.service_sku` is linked for the four
  disposal services (`dispose-mattress` → `SVC-DISPOSE-MATTRESS`, `dispose-sofa` → `SVC-DISPOSE-SOFA`,
  `dispose-old-sofa-big-sofa` → `SVC-DISPOSE-OLD-SOFA-BIG-SOFA`, `dispose-bedframe` → `SVC-DISPOSE-BEDFRAME`);
  `DELIVERY`, `DELIVERY_ADD`, `DELIVERY_CROSS`, `STAIR_CARRY` are unlinked — bare by design (0393).
  Every saved `order_addons.addon_key` has a catalogue row (0 orphans).
- Saved identity: `order_addons.addon_key` = `addons.key` (0172 link column; Catalogue admin is the only
  surface that displayed `service_sku`). No SO page / PDF / Register display mapping existed.
- Wording: COPY approves `Services` (the services footer, owner 2026-09-22) and `Add item`; `Add service`
  is existing build wording (confirmation owed); `Disposal` / `Add disposal` were unapproved. The POS says
  `Add-ons` (dealer surface) — not a Sales Order word.

**Chosen.**
- Item Code = catalogue Service SKU when linked, else the saved key exactly as stored; nothing is
  upper-cased (the 2026-09-23 upper-casing is withdrawn). One rule in `lib/service-code.ts` and the
  document payload. Production shape: `SVC-DISPOSE-MATTRESS` · `DELIVERY` · `STAIR_CARRY`.
- Disposal is recognised by the catalogue code family `SVC-DISPOSE-…`, not a name match.
- Delivery field `Services` (every service on the order — a subset under that word would read as "no
  delivery fee"); its Edit door is the existing `Add service`, offering the disposal family.
  `Disposal` / `Add disposal` → PROPOSAL / NOT LAW in COPY.

**Tests.** Contracts rewritten for the rule; API test covers a linked and an unlinked service. Control
run against the upper-case build: 2 contracts + 1 API test red.

**Production (2026-09-24, PR #1562 squash `81b7a018`, all five surfaces converged; signed-in read of
SO-1365, no write).** Page Item Code `SVC-DISPOSE-SOFA` · `SVC-DISPOSE-MATTRESS`; Delivery reads
`Services — Dispose old sofa (small size) · Dispose old mattress`; Items total = `Total payable` =
RM 1,529.00. The SO document payload the PDF prints from (`/api/orders/:id/sales-order-data`, 200)
sends the same two codes, total 1,529, paid 765, balance 764 — page and paper tally.
