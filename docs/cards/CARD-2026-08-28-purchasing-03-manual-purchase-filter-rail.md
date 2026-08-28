# PURCHASING — CARD 03 · MANUAL PURCHASE LEFT FILTER RAIL

**Module:** Purchasing · **Sequence:** 03 · **Lane:** BUILD/DELIVERY (owner-authorised takeover,
2026-08-28) · **Status:** EXECUTING

**Owns:** the Manual Purchase Register page's left rail, its filter model, the purpose
vocabulary it filters by (shared types + doors + one new immutable migration), and the
Register/object naming of the approval owner.
**May not touch:** SO Batch Purchase behaviour, the PO issuance authority
(`purchasing_issue_pos_batch` keeps its 0380 contract — only its purpose whitelist widens),
the Manual Purchase create workspace's proven header/lines contract, Receiving, Claims.

---

## 1 · The approved rail (owner-approved scope, 2026-08-28 — verbatim law)

The Manual Purchase Register imports the shared 240px `FilterRail`
(`workspace-rail.tsx`, Card 02-C's readable shell): same group-heading typography and
spacing, same blue active `NavRow`, no checkboxes, labels wrap and never truncate, counts
visible and right-aligned, the rail scrolls vertically, the Register scrolls horizontally
when required. Counts are UNIQUE Manual Purchase requests. One active filter per section;
sections combine with AND; an `All…` row clears only its own section; a second click on a
selected row clears it (02-C's grammar).

Groups, in this exact order:

```text
TO ORDER
  All not ordered
  Need approval
  Ready to order

PURCHASE PURPOSE
  All purposes
  Ready Stock
  Showroom Display
  Service Case
  Internal Staff Purchase
  Subsidiary Purchase

PRODUCT
  All products
  Mattress
  Bedframe
  Sofa

SUPPLIER
  All suppliers
  [actual supplier names, dynamic and alphabetical]
```

**Filter meanings (RESOLVED FROM the approved scope):**

- The default no-filter Register is the permanent Manual Purchase listing, ordered history
  included.
- `All not ordered` = requests with live quantity not yet fully issued to a PO — derived as
  the union of `Need approval` and `Ready to order` below. Fully ordered requests leave it
  but stay searchable in the Register.
- `Need approval` = submitted requests still awaiting the configured approver's decision
  (`approval_required` and undecided, not refused) — the request's ONE shared status
  arithmetic (`manualPurchaseStatusOf`), never a second derivation.
- `Ready to order` = approved (or never-gated) requests with remaining quantity available
  for PO Duty to issue — the same `coalesce(approved_qty, qty) − issued_qty` arithmetic the
  `/issue` door uses, on at least one live line.
- Product = the authoritative Catalog category of the request's live lines
  (`product_skus → product_models.category`) — never SKU text. A multi-category request
  counts once under every matching category and appears once in the Register.
- Supplier = derived names only: the lines' Catalog-derived `supplier_id` plus issued PO
  lineage supplier. Dynamic, alphabetical; the selected supplier stays visible with `0`
  (02-C's rule). Supplier is never selected by Operation.
- A missing SKU/supplier is named inside the affected request and handled at its Catalog
  boundary; it never becomes a rail facet.

**Banned rail rows/groups (never rendered):** `Supplier not selected` · `No supplier` ·
`Not in catalog` · `Need price` · `Ordered` · `Part received` · `Received` · `Arrived` ·
`Cancelled` · `My drafts` · `Need correction` · `Queues` · `ORDER TIMING` · safety-days
rows. The former 200px `Queues` / `Need for` rail is DELETED by this card.

## 2 · The purpose vocabulary (owner-approved; engineering mapping decided here)

Visible purposes are exactly: `Ready Stock` · `Showroom Display` · `Service Case` ·
`Internal Staff Purchase` · `Subsidiary Purchase`. Management is included under
`Internal Staff Purchase`; there is no `Management Purchase`.

Token mapping — no false relabel:

| DB token | Visible word | Ruling |
|---|---|---|
| `ready_stock` | `Ready Stock` | unchanged |
| `display` | `Showroom Display` | TRUE relabel — the token has always meant purchased showroom display (MASTER §7.4) |
| `warranty` | `Service Case` | TRUE relabel — a warranty buy is a buy for a customer Service Case, the module that owns that work |
| `internal_staff` | `Internal Staff Purchase` | NEW token (0398) |
| `subsidiary` | `Subsidiary Purchase` | NEW token (0398) |
| `office` · `spare_parts` | `Office` · `Spare Parts` | LEGACY, read-only: old rows keep their truthful old label, are refused for NEW requests, match no purpose filter, and remain visible under `All purposes`. Never falsely mapped. All such rows are TEST data (Constitution §6); go-live starts clean. |

**Migration 0398** (tail check 2026-08-28: repo 0397 · tracker 0397 · every branch 0397):
widen the `purchase_requests` / `purchase_demands` / `purchase_orders` purpose CHECKs to
admit the two new tokens (legacy tokens stay valid for existing rows); seed
`purchasing_purpose_approval` rows for the new tokens (default: approval required);
recreate `purchasing_create_request` / `purchasing_create_demand` /
`purchasing_set_purpose_approval` to offer exactly the five current tokens (legacy refused
by name for new writes — a word not offered may not be accepted, 0322's rule in reverse);
re-emit `purchasing_issue_pos_batch` (0380 body, unchanged) with the widened purpose
whitelist so an approved `internal_staff` / `subsidiary` request issues end to end.

## 3 · The approval boundary (RESOLVED FROM AUTHORITY — no redesign)

Operation prepares and submits; the approver is the governed `ops_manager` duty
(Purchasing Settings' own gate, 0303/0360) — Jess today, changeable in HR/duties without
touching this rail. Jess may approve her own request. Price is not a rail state. The rail
says `Need approval`; the Register and object print the real action owner's name — the
resolved `ops_manager` duty holder(s), generic accounts excluded while a named person
holds the duty — as the governed line `{name} approves`. Approved requests continue into
the existing governed PO Duty issuance door; no new issuance authority; Manual Purchase
and SO Batch Purchase stay separate pages.

## 4 · Required proof (tests must show)

1. The rail is the shared 240px `FilterRail` shell.
2. Exact group and row order per §1.
3. Every banned row/group absent.
4. Default Register includes ordered history; `All not ordered` excludes fully ordered.
5. `Need approval` / `Ready to order` from derived request truth (the one arithmetic).
6. Product from Catalog categories, never SKU text.
7. Supplier rows: actual names only, alphabetical, dynamic.
8. No missing-SKU/supplier placeholder becomes a rail facet.
9. Counts are unique requests.
10. Cross-section filters AND.
11. Purposes work end to end (create → approve → issue) with no false mapping.
12. SO Batch Purchase behaviour and PO issuance authority unchanged.
13. Full release gate (typecheck · lint · test · ci:migrations · build) passes.
14. Production renders the approved rail and reports the merged main SHA.

Closure overwrites `docs/purchasing/MASTER.md` §9.2 and the COPY-STANDARD Manual Purchase
block (purposes row + the rail's words) in the same PR.
